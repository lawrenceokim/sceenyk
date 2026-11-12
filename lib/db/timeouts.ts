import "server-only";

// Read-only workspace/discovery queries get a bounded connection recovery window.
// Mutation deadlines and caller cancellation stay intact.
export function databaseRequestTimeout(input: RequestInfo | URL) {
  const value = typeof input === "string" ? input : "url" in input ? input.url : input.href;
  try { return ["/rest/v1/rpc/ugc_v3_runtime_read", "/rest/v1/rpc/ugc_v3_worker_projects"].includes(new URL(value).pathname) ? 30_000 : 10_000; }
  catch { return 10_000; }
}
