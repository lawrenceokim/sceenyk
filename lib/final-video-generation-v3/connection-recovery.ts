import "server-only";
import { DatabaseConfigurationError } from "@/lib/db/config";
import { ServiceOperationError } from "@/lib/diagnostics/service-failure";
import { V3DatabaseError } from "./database-errors";

export function v3WorkerFailure(error: unknown) {
  const failure = error instanceof DatabaseConfigurationError ? new V3DatabaseError(error, "configuration") : error;
  if (failure instanceof ServiceOperationError) return { code: failure.code, diagnostic: failure.diagnostic };
  return { code: failure instanceof Error && /^[A-Z0-9_]{1,100}$/.test(failure.message) ? failure.message : "V3_WORKER_STARTUP_FAILED" };
}

export function waitForV3Retry(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms); signal.addEventListener("abort", done, { once: true });
  });
}

// Retry a supervisor iteration, never an RPC, provider call or mutation in isolation.
// Existing task leases/receipts remain the sole authority after lost acknowledgements.
export async function withV3ConnectionRecovery<T>(operation: () => Promise<T>, options: {
  signal: AbortSignal; once: boolean;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  report?: (event: Record<string, unknown>) => void;
  random?: () => number;
}): Promise<T | undefined> {
  let failures = 0;
  const report = options.report ?? (event => console.error("V3_WORKER_CONNECTION", JSON.stringify(event)));
  while (!options.signal.aborted) {
    try {
      const value = await operation();
      if (failures) report({ state: "recovered", failures });
      return value;
    } catch (caught) {
      if (options.signal.aborted) return;
      const error = caught instanceof DatabaseConfigurationError ? new V3DatabaseError(caught, "configuration") : caught;
      if (!(error instanceof ServiceOperationError)) throw error;
      failures++;
      const retrying = error.diagnostic.retryable && !options.once;
      const delayMs = Math.min(60_000, Math.round(3000 * 2 ** Math.min(failures - 1, 5) * (1 + (options.random ?? Math.random)() * .2)));
      report({ state: retrying ? "retrying" : "stopped", code: error.code, ...error.diagnostic, failures, retrying, ...(retrying ? { delayMs } : {}) });
      if (!retrying) throw error;
      await (options.wait ?? waitForV3Retry)(delayMs, options.signal);
    }
  }
}
