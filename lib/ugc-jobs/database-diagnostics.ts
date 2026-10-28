import "server-only";

export type WorkerDatabasePhase = "regeneration_claim" | "job_claim" | "regeneration_read" | "regeneration_checkpoint" | "character_claim" | "location_claim" | "storyboard_claim" | "storyboard_checkpoint" | "package_claim" | "package_checkpoint" | "final_claim" | "final_checkpoint";
export type WorkerDatabaseDiagnostic = {
  phase: WorkerDatabasePhase;
  category: "connection_refused" | "timeout" | "dns_network" | "authentication_failure" | "pool_exhaustion" |
    "missing_relation" | "missing_rpc" | "permission_failure" | "schema_mismatch" | "database_unavailable" | "configuration_invalid";
  code?: string; retrying: boolean;
};

// Only fixed categories and validated SQL/PostgREST codes leave this boundary.
// Supabase messages/details/causes may contain URLs or credentials: never log them.
export function workerDatabaseDiagnostic(error: unknown, phase: WorkerDatabasePhase, status?: number): WorkerDatabaseDiagnostic {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const cause = value.cause && typeof value.cause === "object" ? value.cause as Record<string, unknown> : {};
  const code = typeof value.code === "string" ? value.code : typeof cause.code === "string" ? cause.code : "";
  const text = [value.message, value.details, value.hint, value.name, cause.code].filter(item => typeof item === "string").join(" ");
  let category: WorkerDatabaseDiagnostic["category"] = "database_unavailable";
  let retrying = true;
  if (["PUBLIC_PRIVILEGED_KEY", "MISSING_CONFIGURATION", "INVALID_URL", "INVALID_PRIVILEGED_KEY"].includes(code)) { category = "configuration_invalid"; retrying = false; }
  else if (code === "42P01" || code === "PGRST205") { category = "missing_relation"; retrying = false; }
  else if (code === "42883" || code === "PGRST202") { category = "missing_rpc"; retrying = false; }
  else if (code === "42501" || status === 403) { category = "permission_failure"; retrying = false; }
  else if (code.startsWith("28") || ["PGRST301", "PGRST302", "PGRST303"].includes(code) || status === 401) { category = "authentication_failure"; retrying = false; }
  else if (["PGRST204", "PGRST203", "P0001"].includes(code) || /^(22|23|42)/.test(code)) { category = "schema_mismatch"; retrying = false; }
  else if (code === "53300" || code === "PGRST003" || /pool.*(timeout|exhaust)|too many connections/i.test(text)) category = "pool_exhaustion";
  else if (/ECONNREFUSED|connection refused/i.test(`${code} ${text}`)) category = "connection_refused";
  else if (/ENOTFOUND|EAI_AGAIN|EACCES|ECONNRESET|DNS|network/i.test(`${code} ${text}`)) category = "dns_network";
  else if (code === "57014" || /ETIMEDOUT|UND_ERR_.*TIMEOUT|TimeoutError|AbortError|timed? ?out/i.test(`${code} ${text}`)) category = "timeout";
  return { phase, category, retrying, ...(/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? { code } : {}) };
}

export class UgcWorkerDatabaseError extends Error {
  readonly diagnostic: WorkerDatabaseDiagnostic;
  constructor(error: unknown, phase: WorkerDatabasePhase, status?: number) {
    super("UGC_WORKER_DATABASE_FAILURE"); this.diagnostic = workerDatabaseDiagnostic(error, phase, status);
  }
}

export function workerDatabaseBackoff(failures: number) {
  return Math.min(300_000, 5_000 * 2 ** Math.min(6, Math.max(0, failures - 1)));
}
