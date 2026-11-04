import { loadEnvConfig } from "@next/env";
import { runV3BackgroundWorker } from "../lib/final-video-generation-v3/background-worker";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info() {}, error() {} });
void runV3BackgroundWorker(process.argv.slice(2)).catch(error => {
  console.error(error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_BACKGROUND_WORKER_STOPPED");
  process.exitCode = 1;
});
