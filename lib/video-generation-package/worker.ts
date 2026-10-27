import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { compositeRecord, parseWorkerClaim, type LocalExecutionResult } from "@/lib/ugc-jobs/claim-contract";
import { workerDatabaseDiagnostic } from "@/lib/ugc-jobs/database-diagnostics";
import { buildVideoGenerationPackage, validateVideoGenerationPackage, packageInputFingerprint, PackageValidationError } from "./builder";
import { verifyPackageMedia } from "./media";
import type { PackageRow } from "./contract";

// Only the existing local UGC consumer calls this executor. It has no provider
// dependency and cannot advance the parent or make a financial transition.
export async function runGenerationPackage(claim: PackageRow, shutdown: AbortSignal): Promise<LocalExecutionResult> {
  if (!parseWorkerClaim("package", claim)) return { ok: true };
  const db = createDatabaseClient(); let lost = false; let row = claim;
  const abort = new AbortController();
  const signal = AbortSignal.any([shutdown, abort.signal, AbortSignal.timeout(180_000)]);
  let pending: Promise<unknown> = Promise.resolve();
  async function checkpoint(operation: string, payload: Record<string, unknown> = {}) {
    const task = pending.then(async () => {
      if (lost) throw new Error("PACKAGE_LEASE_LOST");
      let result;
      try { result = await db.rpc("ugc_package_checkpoint", { p_package: row.id, p_token: claim.claim_token!, p_operation: operation, p_payload: payload }); }
      catch (error) { lost = true; abort.abort(); throw error; }
      if (result.error) { lost = true; abort.abort(); throw result.error; }
      const committed = compositeRecord(result.data);
      if (committed?.id !== row.id || committed.job_id !== row.job_id || committed.project_id !== row.project_id || committed.owner_user_id !== row.owner_user_id) {
        lost = true; abort.abort(); throw new Error("PACKAGE_LEASE_LOST");
      }
      row = committed as unknown as PackageRow;
      return row;
    });
    pending = task.catch(() => {}); return task;
  }
  const heartbeat = setInterval(() => { void checkpoint("heartbeat").catch(() => {}); }, 20_000);
  try {
    if (packageInputFingerprint(row.input) !== row.input_fingerprint) throw new PackageValidationError();
    await verifyPackageMedia(row.input, signal);
    await checkpoint("phase", { phase: "building" });
    const document = buildVideoGenerationPackage(row.input, row.revision);
    await checkpoint("phase", { phase: "validating" });
    validateVideoGenerationPackage(document, row.input, row.revision);
    signal.throwIfAborted();
    await checkpoint("phase", { phase: "saving" });
    signal.throwIfAborted();
    await checkpoint("ready", { document });
    return { ok: true };
  } catch (error) {
    const code = error instanceof PackageValidationError ? error.code : "PACKAGE_FAILED";
    let failureSaved = false;
    if (!lost) { try { await checkpoint("fail", { code }); failureSaved = true; } catch {} }
    console.error("UGC_PACKAGE_FAILURE", { code, projectId: row.project_id, jobId: row.job_id, packageId: row.id,
      phase: row.phase, attempt: row.attempts, failureSaved, ...(lost ? { database: workerDatabaseDiagnostic(error, "package_checkpoint") } : {}) });
    return { ok: false, category: lost ? "lease_lost" : "failed", failureSaved };
  } finally { clearInterval(heartbeat); await pending; }
}
