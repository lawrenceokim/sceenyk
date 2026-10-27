import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";

let startupPhase = "environment";
const safeStartupReasons = new Set([
  "UGC_LOCAL_EXECUTION_REQUIRED", "UGC_WORKER_ARGUMENT_INVALID", "UGC_RECOVERY_READ_UNAVAILABLE",
  "UGC_RESUME_UNAVAILABLE", "UGC_CHARACTER_OUTPUT_RESUME_UNAVAILABLE", "UGC_RETRY_UNAVAILABLE",
  "UGC_CHARACTER_ALREADY_READY", "UGC_CHARACTER_OUTPUT_RESUME_NOT_ELIGIBLE", "UGC_ATTEMPTS_EXHAUSTED",
  "REFERENCE_CONFIG_INVALID", "CHARACTER_CONFIG_INVALID", "HF_SECRET_CONTAINS_COMPLETE_CREDENTIAL",
  "CHARACTER_ENVIRONMENT_INVALID", "PUBLIC_PRIVILEGED_KEY", "MISSING_CONFIGURATION", "INVALID_URL", "INVALID_PRIVILEGED_KEY",
  "PRODUCT_CONFIG_INVALID", "UGC_PRODUCT_RESUME_UNAVAILABLE", "UGC_REGENERATION_RESUME_UNAVAILABLE",
  "UGC_WORKER_CONTRACT_INVALID", "UGC_DATABASE_UNRECOVERABLE",
  "UGC_INSPECTION_UNAVAILABLE",
  "CHARACTER_SHEET_RECOVERY_FAILED", "CHARACTER_SHEET_COMPOSITION_FAILED",
  "CHARACTER_SLOT_VALIDATION_REQUIRED",
  "UGC_PACKAGE_DISABLED",
]);
const safeDatabaseCodes = new Set(["PGRST202", "PGRST204", "PGRST205", "42501", "42883", "23514"]);
class WorkerStartupError extends Error {
  constructor(reason: string, readonly databaseCode?: string) { super(reason); }
}
function databaseFailure(reason: string, error: { code?: string } | null) {
  return new WorkerStartupError(reason, error?.code && safeDatabaseCodes.has(error.code) ? error.code : undefined);
}
function startupDiagnostic(error: unknown) {
  const fields = error && typeof error === "object" ? error as { code?: unknown; issue?: unknown; message?: unknown } : {};
  const reason = [fields.issue, fields.code, fields.message].find(value => typeof value === "string" && safeStartupReasons.has(value));
  const moduleCode = fields.code === "ERR_MODULE_NOT_FOUND" || fields.code === "MODULE_NOT_FOUND" ? "UGC_MODULE_UNAVAILABLE" : null;
  return {
    phase: startupPhase, reason: reason ?? moduleCode ?? "UGC_STARTUP_UNEXPECTED_ERROR",
    ...(error instanceof WorkerStartupError && error.databaseCode ? { databaseCode: error.databaseCode } : {}),
  };
}

async function main() {
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  startupPhase = "execution_policy";
  const { localJobsOnly } = await import("../lib/workflows/execution-policy");
  if (!localJobsOnly() || process.env.RENDER === "true" || process.env.VERCEL === "1") {
    throw new Error("UGC_LOCAL_EXECUTION_REQUIRED");
  }
  const args = process.argv.slice(2);
  const packagesOnly = args.length === 1 && args[0] === "--packages-only";
  startupPhase = "arguments";
  if (args.length && !packagesOnly) {
    const { z } = await import("zod");
    if (args.length !== 2 || !["--recover-character-sheet", "--inspect-regeneration", "--resume-analysis", "--resume-character", "--resume-character-output", "--resume-product", "--resume-regeneration", "--retry"].includes(args[0]) || !z.uuid().safeParse(args[1]).success) throw new Error("UGC_WORKER_ARGUMENT_INVALID");
  }
  startupPhase = "database_configuration";
  const { getDatabaseConfig } = await import("../lib/db/config");
  getDatabaseConfig();
  // The M9-only consumer cannot claim upstream paid preparation. It needs no
  // OpenAI/Character provider configuration and uses this same local runner.
  if (packagesOnly) {
    if (process.env.UGC_PACKAGE_ENABLED !== "1") throw new Error("UGC_PACKAGE_DISABLED");
    startupPhase = "runner_import";
    const { LocalJobRunner } = await import("../lib/ugc-jobs/local-runner");
    const shutdown = new AbortController();
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => shutdown.abort());
    console.info("UGC_LOCAL_PACKAGE_WORKER_READY");
    startupPhase = "running";
    await new LocalJobRunner(randomUUID(), undefined, true).run(shutdown.signal);
    console.info("UGC_LOCAL_WORKER_STOPPED");
    return;
  }
  if (args[0] === "--recover-character-sheet") {
    startupPhase = "character_sheet_recovery";
    const { recoverStoredCharacterSheet } = await import("../lib/reference-review/recover-character-sheet");
    const shutdown = new AbortController();
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => shutdown.abort());
    console.info("UGC_CHARACTER_SHEET_RECOVERY", JSON.stringify(await recoverStoredCharacterSheet(args[1], shutdown.signal)));
    return;
  }
  if (args[0] === "--inspect-regeneration") {
    startupPhase = "inspection";
    const { inspectReferenceRegeneration } = await import("../lib/reference-review/inspection");
    const { UgcWorkerDatabaseError } = await import("../lib/ugc-jobs/database-diagnostics");
    try { console.info("UGC_REGENERATION_INSPECTION", JSON.stringify(await inspectReferenceRegeneration(args[1]))); }
    catch (error) {
      console.error("UGC_REGENERATION_INSPECTION_UNAVAILABLE", error instanceof UgcWorkerDatabaseError ? error.diagnostic : { category: "inspection_invalid" });
      throw new Error("UGC_INSPECTION_UNAVAILABLE");
    }
    return;
  }
  startupPhase = "analysis_configuration";
  const { createReferenceAnalysisClient } = await import("../lib/openai/server");
  // Configuration only: constructing the SDK never sends a provider request.
  createReferenceAnalysisClient();
  startupPhase = "character_configuration";
  const { getCharacterSheetConfig, CharacterSheetConfigurationError, characterSheetEnvironmentPresence } = await import("../lib/character-sheet/config");
  try { getCharacterSheetConfig(); }
  catch (error) {
    console.error("UGC_CHARACTER_CONFIGURATION_INVALID", {
      issue: error instanceof CharacterSheetConfigurationError ? error.issue : "CHARACTER_ENVIRONMENT_INVALID",
      environment: characterSheetEnvironmentPresence(),
    });
    throw error;
  }
  // Product is separately opt-in; Character-only work keeps its current setup.
  if (process.env.UGC_PRODUCT_SHEET_ENABLED === "1" || args[0] === "--resume-product") {
    startupPhase = "product_configuration";
    const { getProductSheetConfig } = await import("../lib/product-sheet/config");
    getProductSheetConfig();
  }
  // Resolve the complete worker module graph before any recovery RPC can write.
  startupPhase = "runner_import";
  const { LocalJobRunner } = await import("../lib/ugc-jobs/local-runner");
  const { characterV5 } = await import("../lib/character-v5/contract");
  console.info("UGC_CHARACTER_CONTRACT", characterV5);
  if (args.length) {
    startupPhase = "recovery_read";
    const { createDatabaseClient } = await import("../lib/db/server");
    const db = createDatabaseClient();
    const job = await db.from("ugc_generation_jobs")
      .select("id,owner_user_id,project_id,status,stage,resume_stage,error_code,attempt_count,max_attempts,pause_reason")
      .eq("id", args[1]).maybeSingle();
    if (job.error || !job.data) throw databaseFailure("UGC_RECOVERY_READ_UNAVAILABLE", job.error);
    startupPhase = "recovery_validation";
    if (args[0] === "--resume-character-output") {
      if (job.data.pause_reason === "PRODUCT_REFERENCE_NOT_IMPLEMENTED") throw new WorkerStartupError("UGC_CHARACTER_ALREADY_READY");
      if (job.data.attempt_count >= job.data.max_attempts) throw new WorkerStartupError("UGC_ATTEMPTS_EXHAUSTED");
      if (job.data.status !== "failed" || job.data.resume_stage !== "character_reference" || job.data.error_code !== "CHARACTER_OUTPUT_INVALID") {
        throw new WorkerStartupError("UGC_CHARACTER_OUTPUT_RESUME_NOT_ELIGIBLE");
      }
    }
    startupPhase = args[0].slice(2).replaceAll("-", "_");
    if (args[0] === "--resume-analysis") {
      const result = await db.rpc("ugc_resume_reference_analysis", { p_job_id: args[1] });
      if (result.error || !result.data) throw databaseFailure("UGC_RESUME_UNAVAILABLE", result.error);
    } else if (args[0] === "--resume-character") {
      const result = await db.rpc("ugc_resume_character_sheet", { p_job_id: args[1] });
      if (result.error || !result.data) throw databaseFailure("UGC_RESUME_UNAVAILABLE", result.error);
    } else if (args[0] === "--resume-regeneration") {
      const result = await db.rpc("ugc_resume_reference_regeneration", { p_job_id: args[1] });
      if (result.error || !result.data) throw databaseFailure("UGC_REGENERATION_RESUME_UNAVAILABLE", result.error);
    } else if (args[0] === "--resume-product") {
      const result = await db.rpc("ugc_resume_product_sheet", { p_job_id: args[1] });
      if (result.error || !result.data) throw databaseFailure("UGC_PRODUCT_RESUME_UNAVAILABLE", result.error);
    } else if (args[0] === "--resume-character-output") {
      const result = await db.rpc("ugc_resume_character_output", { p_job_id: args[1] });
      if (result.error || !result.data) throw databaseFailure("UGC_CHARACTER_OUTPUT_RESUME_UNAVAILABLE", result.error);
    } else {
      const result = await db.rpc("ugc_retry_owned_job", { p_owner_user_id: job.data.owner_user_id, p_project_id: job.data.project_id, p_job_id: job.data.id });
      if (result.error || !result.data) throw databaseFailure("UGC_RETRY_UNAVAILABLE", result.error);
    }
  }
  const shutdown = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => shutdown.abort());
  }
  console.info("UGC_LOCAL_WORKER_READY");
  startupPhase = "running";
  await new LocalJobRunner(randomUUID()).run(shutdown.signal);
  console.info("UGC_LOCAL_WORKER_STOPPED");
}

main().catch(error => { console.error("UGC_LOCAL_WORKER_STARTUP_FAILED", startupDiagnostic(error)); process.exitCode = 1; });
