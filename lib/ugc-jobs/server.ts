import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { ugcStageMessages, type UgcJobProgress, type UgcJobRow } from "./contract";

const enqueueSchema = z.strictObject({ projectId: z.uuid(), idempotencyKey: z.uuid() });
const referenceSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid() });
export class UgcJobAccessError extends Error {
  constructor() { super("This generation job is unavailable."); }
}

export function toUgcJobProgress(row: UgcJobRow): UgcJobProgress {
  return {
    id: row.id, status: row.status, stage: row.stage,
    message: row.cancellation_requested_at && row.status === "running" ? "Cancellation requested. Waiting for a safe stopping point." : row.safe_error_message ?? ugcStageMessages[row.stage],
    createdAt: row.created_at, updatedAt: row.updated_at, startedAt: row.started_at,
    completedAt: row.completed_at, failedAt: row.failed_at, cancelledAt: row.cancelled_at,
    cancellationRequested: !!row.cancellation_requested_at,
    failure: row.error_code && row.safe_error_message ? { code: row.error_code, message: row.safe_error_message } : null,
  };
}

// Infrastructure only. No Studio wiring, complete UGC validation or paid admission.
export async function enqueueOwnedUgcJob(input: unknown): Promise<UgcJobProgress> {
  const user = await ensureAppUser();
  const parsed = enqueueSchema.safeParse(input);
  if (!parsed.success) throw new UgcJobAccessError();
  const { data, error } = await createDatabaseClient().rpc("ugc_enqueue_job", {
    p_owner_user_id: user.id, p_project_id: parsed.data.projectId, p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error || !data) throw new UgcJobAccessError();
  return toUgcJobProgress(data);
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
