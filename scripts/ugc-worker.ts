import { loadEnvConfig } from "@next/env";
import { workerLane } from "../lib/final-video-generation-v3/worker-command";
import { v3WorkerFailure } from "../lib/final-video-generation-v3/connection-recovery";

async function main() {
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const args = process.argv.slice(2);
  if (workerLane(args, process.env.UGC_V3_ENABLED === "1") === "legacy") {
    console.info("V3_REFERENCE_CONTRACT", { active: false, provider: "openai", reason: "historical_worker_selected" });
    process.argv = process.argv.filter(a => a !== "--legacy");
    await import("./ugc-legacy-worker");
  } else {
    const { runLocalV3Worker } = await import("../lib/final-video-generation-v3/local-worker");
    await runLocalV3Worker(args);
  }
}
void main().catch(error => {
  console.error("UGC_WORKER_STOPPED", JSON.stringify(v3WorkerFailure(error))); process.exitCode = 1;
});
