import { loadEnvConfig } from "@next/env";
import { runV3BackgroundWorker } from "../lib/final-video-generation-v3/background-worker";
import { v3WorkerFailure } from "../lib/final-video-generation-v3/connection-recovery";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info() {}, error() {} });
void runV3BackgroundWorker(process.argv.slice(2)).catch(error => {
  console.error("V3_BACKGROUND_WORKER_STOPPED", JSON.stringify(v3WorkerFailure(error)));
  process.exitCode = 1;
});
