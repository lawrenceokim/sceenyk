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
  const { createReferenceAnalysisClient } = await import("../lib/openai/server");
  // Configuration only: constructing the SDK never sends a provider request.
  createReferenceAnalysisClient();
  const { getCharacterSheetConfig, CharacterSheetConfigurationError, characterSheetEnvironmentPresence } = await import("../lib/character-sheet/config");
  try { getCharacterSheetConfig(); }
  catch (error) {
    console.error("UGC_CHARACTER_CONFIGURATION_INVALID", {
      issue: error instanceof CharacterSheetConfigurationError ? error.issue : "CHARACTER_ENVIRONMENT_INVALID",
      environment: characterSheetEnvironmentPresence(),
    });
    throw error;
  }
  const args = process.argv.slice(2);
  if (args.length) {
    const { z } = await import("zod");
    if (args.length !== 2 || !["--resume-analysis", "--resume-character", "--resume-character-output", "--retry"].includes(args[0]) || !z.uuid().safeParse(args[1]).success) throw new Error("UGC_WORKER_ARGUMENT_INVALID");
    const { createDatabaseClient } = await import("../lib/db/server");
    const db = createDatabaseClient();
    if (args[0] === "--resume-analysis") {
      const result = await db.rpc("ugc_resume_reference_analysis", { p_job_id: args[1] });
      if (result.error || !result.data) throw new Error("UGC_RESUME_UNAVAILABLE");
    } else if (args[0] === "--resume-character") {
      const result = await db.rpc("ugc_resume_character_sheet", { p_job_id: args[1] });
      if (result.error || !result.data) throw new Error("UGC_RESUME_UNAVAILABLE");
    } else if (args[0] === "--resume-character-output") {
      const result = await db.rpc("ugc_resume_character_output", { p_job_id: args[1] });
      if (result.error || !result.data) throw new Error("UGC_CHARACTER_OUTPUT_RESUME_UNAVAILABLE");
    } else {
      const job = await db.from("ugc_generation_jobs").select("*").eq("id", args[1]).maybeSingle();
      if (job.error || !job.data) throw new Error("UGC_RETRY_UNAVAILABLE");
      const result = await db.rpc("ugc_retry_owned_job", { p_owner_user_id: job.data.owner_user_id, p_project_id: job.data.project_id, p_job_id: job.data.id });
      if (result.error || !result.data) throw new Error("UGC_RETRY_UNAVAILABLE");
    }
  }
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
