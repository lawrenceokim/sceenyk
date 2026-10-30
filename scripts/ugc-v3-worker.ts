import { loadEnvConfig } from "@next/env";
import { runLocalV3Worker } from "../lib/final-video-generation-v3/local-worker";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
void runLocalV3Worker(process.argv.slice(2)).catch(error => {
  const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_WORKER_STOPPED";
  console.error(code); process.exitCode = 1;
});
