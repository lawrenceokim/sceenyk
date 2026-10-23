import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";

async function main() {
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const { localJobsOnly } = await import("../lib/workflows/execution-policy");
  if (!localJobsOnly() || process.env.RENDER === "true" || process.env.VERCEL === "1") {
    throw new Error("UGC_LOCAL_EXECUTION_REQUIRED");
  }
  const { getDatabaseConfig } = await import("../lib/db/config");
  getDatabaseConfig();
  const { LocalJobRunner } = await import("../lib/ugc-jobs/local-runner");
  const shutdown = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => shutdown.abort());
  }
  console.info("UGC_LOCAL_WORKER_READY");
  await new LocalJobRunner(randomUUID()).run(shutdown.signal);
  console.info("UGC_LOCAL_WORKER_STOPPED");
}

main().catch(() => { console.error("UGC_LOCAL_WORKER_STARTUP_FAILED"); process.exitCode = 1; });
