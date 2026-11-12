import { loadEnvConfig } from "@next/env";
import { runLocalV3Worker } from "../lib/final-video-generation-v3/local-worker";
import { v3WorkerFailure } from "../lib/final-video-generation-v3/connection-recovery";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
void runLocalV3Worker(process.argv.slice(2)).catch(error => {
  console.error("V3_WORKER_STOPPED", JSON.stringify(v3WorkerFailure(error))); process.exitCode = 1;
});
