import type { SaveProjectResult } from "./types";

// Never send database messages/details, SQL, storage keys or account data to a
// browser. Only known diagnostic codes select these fixed, actionable messages.
export function projectSaveFailure(error: unknown, fallback = "Your draft couldn’t be saved. Check your connection and try again."): SaveProjectResult {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  let detail = fallback;
  if (code === "42501") detail = "Project saving is blocked by database permissions (42501). Ask an administrator to verify the server’s project update grants, including migration 096. Your edits and uploaded images are preserved.";
  else if (["42703", "PGRST204"].includes(code)) detail = "The database is missing a required project field. Ask an administrator to check migrations 093–096. Your edits and uploaded images are preserved.";
  else if (["42883", "PGRST202"].includes(code)) detail = "A required project-saving database function is unavailable. Ask an administrator to check the installed migrations and API schema cache. Your edits are preserved.";
  else if (code === "23514") detail = "The database rejected a project setting. Check your selected settings; if they are valid, ask an administrator to check the installed project constraints (23514). Your edits are preserved.";
  else if (code === "23503") detail = "A saved project reference is no longer available. Check the project and its references, then save again. Your edits are preserved.";
  else if (message === "V3_ENROLLMENT_UNAVAILABLE") detail = "The project’s generation status couldn’t be verified. Retry saving; if it persists, ask an administrator to check the V3 database functions and permissions. Your edits are preserved.";
  return { ok: false, code: "UNAVAILABLE", message: detail };
}
