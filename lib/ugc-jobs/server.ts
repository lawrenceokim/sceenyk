import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { ugcStageMessages, type UgcJobProgress, type UgcJobRow } from "./contract";
import { validateUgcGenerationInput } from "./validation";
import { ugcInputIssue, type UgcInputIssue, type UgcReadiness } from "./input-contract";

const enqueueSchema = z.strictObject({ projectId: z.uuid(), idempotencyKey: z.uuid() });
const referenceSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid() });
export class UgcJobAccessError extends Error {
  constructor() { super("This generation job is unavailable."); }
}

export function toUgcJobProgress(row: UgcJobRow): UgcJobProgress {
  return {
    id: row.id, status: row.status, stage: row.stage,
    message: row.pause_reason === "PRODUCT_REFERENCE_NOT_IMPLEMENTED" ? "Character ready. Product Reference Sheet generation is not available yet." : row.pause_reason === "CHARACTER_REFERENCE_NOT_IMPLEMENTED" ? "References analyzed. Character generation is paused for local enablement." : row.pause_reason ? "Inputs validated. Reference analysis is not available yet." : row.cancellation_requested_at && row.status === "running" ? "Cancellation requested. Waiting for a safe stopping point." : row.safe_error_message ?? ugcStageMessages[row.stage],
    createdAt: row.created_at, updatedAt: row.updated_at, startedAt: row.started_at,
    completedAt: row.completed_at, failedAt: row.failed_at, cancelledAt: row.cancelled_at,
    cancellationRequested: !!row.cancellation_requested_at,
    paused: !!row.pause_reason,
    failure: row.error_code && row.safe_error_message ? { code: row.error_code, message: row.safe_error_message } : null,
  };
}

export type UgcEnqueueResult = { ok: true; job: UgcJobProgress } | { ok: false; issues: UgcInputIssue[] };

export async function getOwnedUgcReadiness(input: unknown): Promise<UgcReadiness> {
  const user = await ensureAppUser();
  const parsed = z.uuid().safeParse(input);
  if (!parsed.success) return { ready: false, issues: [ugcInputIssue("PROJECT_UNAVAILABLE")] };
  const result = await validateUgcGenerationInput(parsed.data, user.id);
  return result.ready ? { ready: true, issues: [] } : result;
}

// Validation only, not paid generation admission. Never accepts browser snapshots.
export async function enqueueOwnedUgcJob(input: unknown): Promise<UgcEnqueueResult> {
  const user = await ensureAppUser();
  const parsed = enqueueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: [ugcInputIssue("PROJECT_UNAVAILABLE")] };
  const db = createDatabaseClient();
  // Recover the same request after a lost response without substituting later
  // draft edits or requiring media that the original job may have consumed.
  const existing = await db.from("ugc_generation_jobs").select("*").eq("owner_user_id", user.id)
    .eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
  if (existing.error) return { ok: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] };
  if (existing.data) return existing.data.project_id === parsed.data.projectId
    ? { ok: true, job: toUgcJobProgress(existing.data) } : { ok: false, issues: [ugcInputIssue("INPUT_CHANGED")] };
  const validation = await validateUgcGenerationInput(parsed.data.projectId, user.id);
  if (!validation.ready) return { ok: false, issues: validation.issues };
  const { data, error } = await db.rpc("ugc_enqueue_validated_job", {
    p_owner_user_id: user.id, p_project_id: parsed.data.projectId, p_idempotency_key: parsed.data.idempotencyKey,
    p_input_snapshot: validation.data,
  });
  if (error || !data) return { ok: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] };
  if (data.code !== "ACCEPTED") return { ok: false, issues: [ugcInputIssue(data.code)] };
  return { ok: true, job: toUgcJobProgress(data.job) };
}

export async function getOwnedUgcJobProgress(input: unknown): Promise<UgcJobProgress> {
  const user = await ensureAppUser();
  const parsed = referenceSchema.safeParse(input);
  if (!parsed.success) throw new UgcJobAccessError();
  const db = createDatabaseClient();
  const project = await db.from("projects").select("id").eq("id", parsed.data.projectId).eq("owner_user_id", user.id).eq("status", "draft").maybeSingle();
  if (project.error || !project.data) throw new UgcJobAccessError();
  const { data, error } = await db.from("ugc_generation_jobs").select("*")
    .eq("id", parsed.data.jobId).eq("project_id", parsed.data.projectId).eq("owner_user_id", user.id).maybeSingle();
  if (error || !data) throw new UgcJobAccessError();
  return toUgcJobProgress(data);
}

export async function requestOwnedUgcJobCancellation(input: unknown): Promise<UgcJobProgress> {
  const user = await ensureAppUser();
  const parsed = referenceSchema.safeParse(input);
  if (!parsed.success) throw new UgcJobAccessError();
  const { data, error } = await createDatabaseClient().rpc("ugc_cancel_owned_job", {
    p_owner_user_id: user.id, p_project_id: parsed.data.projectId, p_job_id: parsed.data.jobId,
  });
  if (error || !data) throw new UgcJobAccessError();
  return toUgcJobProgress(data);
}

// Explicit, bounded retry of known safe failures; never a provider restart button.
export async function retryOwnedUgcJob(input: unknown): Promise<UgcJobProgress> {
  const user = await ensureAppUser();
  const parsed = referenceSchema.safeParse(input);
  if (!parsed.success) throw new UgcJobAccessError();
  const { data, error } = await createDatabaseClient().rpc("ugc_retry_owned_job", {
    p_owner_user_id: user.id, p_project_id: parsed.data.projectId, p_job_id: parsed.data.jobId,
  });
  if (error || !data) throw new UgcJobAccessError();
  return toUgcJobProgress(data);
}
