import { loadEnvConfig } from "@next/env";
import { runV3Task } from "../lib/final-video-generation-v3/worker";
import { v3LocalEnabled } from "../lib/final-video-generation-v3/runtime-config";
import { z } from "zod";

async function main() {
  loadEnvConfig(process.cwd(), true);
  const args = process.argv.slice(2), project = args[args.indexOf("--project") + 1], owner = process.env.UGC_V3_OPERATOR_USER_ID;
  if (!args.includes("--project") || !z.uuid().safeParse(project).success || !z.uuid().safeParse(owner).success || !v3LocalEnabled()) throw new Error("V3_LOCAL_WORKER_SETUP_REQUIRED");
  do {
    await runV3Task(project, owner!);
    if (args.includes("--once")) break;
    await new Promise(resolve => setTimeout(resolve, 3000));
  } while (true);
}
void main().catch(e => { process.stderr.write(`${e instanceof Error && /^[A-Z0-9_]+$/.test(e.message) ? e.message : "V3_WORKER_STOPPED"}\n`); process.exitCode = 1; });
