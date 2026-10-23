import "server-only";

// Development is local-only unless hosted execution is explicitly restored.
// This is a transport guard, not the future UGC job runner.
export function localJobsOnly() {
  return process.env.SCEENYK_LOCAL_JOBS_ONLY !== "0";
}
