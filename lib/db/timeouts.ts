import "server-only";

// Measured owned-workspace reads can exceed the ordinary 10s fetch budget.
// This RPC is read-only; mutation deadlines and caller cancellation stay intact.
export function databaseRequestTimeout(input: RequestInfo | URL) {
  const value = typeof input === "string" ? input : "url" in input ? input.url : input.href;
  try { return new URL(value).pathname === "/rest/v1/rpc/ugc_v3_runtime_read" ? 30_000 : 10_000; }
  catch { return 10_000; }
}
