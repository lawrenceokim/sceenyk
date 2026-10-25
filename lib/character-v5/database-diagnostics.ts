import { CharacterV5Error, type V5Phase, type V5Slot } from "./contract";

export type V5DatabaseOperation = "start_workflow" | "read_job" | "read_project" | "read_workflow" | "read_candidate" | "candidate_readback" |
  "checkpoint_intent" | "checkpoint_submitted" | "checkpoint_output" | "persist_candidate" | "checkpoint_failure" |
  "heartbeat" | "manual_decision" | "finish_rejection" | "recovery_claim" | "preview_failure";
export type V5DatabaseDiagnostic = {
  operation: V5DatabaseOperation; category: "database_schema" | "database_constraint" | "database_permission" |
    "database_timeout" | "database_transport" | "database_fence" | "database_failure";
  dbCode?: string; table?: string; column?: string; constraint?: string; function?: string;
  safeReason: string; slot?: V5Slot; version?: number;
};
type Context = { operation: V5DatabaseOperation; phase: V5Phase; slot?: V5Slot; version?: number; function?: string; table?: string };
const tables = new Set(["ugc_generation_jobs", "ugc_character_v5_workflows", "ugc_character_v5_candidates", "ugc_generation_job_events"]);
const columns = new Set(["retryable", "retry_eligible", "id", "job_id", "project_id", "owner_user_id", "workflow_id", "slot", "state",
  "candidate_id", "request_id", "artifact", "planned_key", "output_proof", "generation", "input_asset", "model", "prompt_version",
  "contract_version", "revision", "status_url", "provider_terminal", "work_phase", "error_phase", "error_code"]);
const operations: Record<V5DatabaseOperation, string> = {
  start_workflow: "ugc_character_v5_start", read_job: "ugc_generation_jobs", read_project: "projects", read_workflow: "ugc_character_v5_workflows", read_candidate: "ugc_character_v5_candidates",
  candidate_readback: "ugc_character_v5_candidates", checkpoint_intent: "ugc_character_v5_checkpoint", checkpoint_submitted: "ugc_character_v5_checkpoint",
  checkpoint_output: "ugc_character_v5_checkpoint", persist_candidate: "ugc_character_v5_checkpoint", checkpoint_failure: "ugc_character_v5_checkpoint",
  heartbeat: "ugc_character_v5_checkpoint", manual_decision: "ugc_character_v5_action", finish_rejection: "ugc_character_v5_finish_rejection",
  recovery_claim: "ugc_character_v5_recovery_claim", preview_failure: "ugc_character_v5_preview_failure",
};

// Never return provider/DB message, details, hint, URL or cause text. Only fixed
// reasons and allowlisted identifiers are extracted, including constraint names.
export function v5DatabaseDiagnostic(error: unknown, context: Context): V5DatabaseDiagnostic {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const cause = value.cause && typeof value.cause === "object" ? value.cause as Record<string, unknown> : {};
  const rawCode = typeof value.code === "string" ? value.code : typeof cause.code === "string" ? cause.code : "";
  const code = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(rawCode) ? rawCode : undefined;
  const message = typeof value.message === "string" ? value.message : "";
  let category: V5DatabaseDiagnostic["category"] = "database_failure";
  let safeReason = "The database operation could not be completed.";
  if (error === null) { category = "database_fence"; safeReason = "Ownership, version, state or lease no longer admits this operation."; }
  else if (code?.startsWith("23")) { category = "database_constraint"; safeReason = "A database integrity constraint rejected the operation."; }
  else if (["22P02", "42703", "42P01", "42883", "PGRST202", "PGRST203", "PGRST204", "PGRST205"].includes(code ?? "")) {
    category = "database_schema"; safeReason = code === "42703" ? "A referenced database column does not exist." : "A required database object or signature is unavailable.";
    if (code === "22P02") safeReason = "A database expression could not convert its input to the required type.";
  } else if (code === "42501" || code?.startsWith("28") || ["PGRST301", "PGRST302"].includes(code ?? "")) {
    category = "database_permission"; safeReason = "The database role does not permit this operation.";
  } else if (code === "57014" || code === "PGRST003" || /timeout|timed out|AbortError|TimeoutError/i.test(message)) {
    category = "database_timeout"; safeReason = "The database request timed out; its outcome may be uncertain.";
  } else if (!code && /fetch failed|network|ECONN|ENOTFOUND|EACCES/i.test(`${message} ${rawCode}`)) {
    category = "database_transport"; safeReason = "The database response was unavailable; its outcome may be uncertain.";
  }
  const diagnostic: V5DatabaseDiagnostic = { operation: context.operation, category, safeReason,
    ...(code ? { dbCode: code } : {}), ...(context.slot ? { slot: context.slot } : {}),
    ...(Number.isSafeInteger(context.version) && context.version! > 0 ? { version: context.version } : {}) };
  const involved = operations[context.operation];
  if (tables.has(involved) || involved === "projects") diagnostic.table = involved; else diagnostic.function = involved;
  for (const name of tables) if (message.includes(name)) diagnostic.table = name;
  const constraint = /(?:constraint|index) "([a-z_][a-z0-9_]{0,62})"/.exec(message)?.[1];
  if (constraint && /^(?:ugc_character_v5_|ugc_jobs_)/.test(constraint)) diagnostic.constraint = constraint;
  for (const name of columns) if (new RegExp(`(?:\\.|"|\\s)${name}(?:"|\\s|$)`).test(message)) diagnostic.column = name;
  return diagnostic;
}
export function v5DatabaseError(error: unknown, context: Context) {
  const diagnostic = v5DatabaseDiagnostic(error, context);
  const code = diagnostic.category === "database_fence" ? "CHARACTER_DATABASE_FENCE_REJECTED" :
    context.phase === "candidate_readback" ? "CHARACTER_CANDIDATE_READBACK_FAILED" : "CHARACTER_CANDIDATE_PERSISTENCE_FAILED";
  return new CharacterV5Error(context.phase, code, diagnostic);
}
export function logV5Failure(error: CharacterV5Error) {
  // Serialize safe scalars to one string: next dev's log file can otherwise
  // reduce structured console arguments to {}, losing the useful diagnostics.
  console.error("UGC_CHARACTER_V5_TECHNICAL_FAILURE", JSON.stringify({ phase: error.phase, code: error.code, ...error.database, ...error.storage }));
}
