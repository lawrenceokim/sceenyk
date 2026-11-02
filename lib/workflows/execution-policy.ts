import "server-only";

// TEMPORARY production usage pause (2026-11-02). Restore explicitly in code;
// environment variables, including SCEENYK_LOCAL_JOBS_ONLY=0, cannot resume it.
// Also restore the route, Vercel routing rule and Cloud scripts documented in
// context/inngest-pause.md before re-enabling hosted workflows.
export function inngestExecutionPaused() {
  return true;
}

// Development is local-only unless hosted execution is explicitly restored.
// This is a transport guard, not the future UGC job runner.
export function localJobsOnly() {
  return process.env.SCEENYK_LOCAL_JOBS_ONLY !== "0";
}
