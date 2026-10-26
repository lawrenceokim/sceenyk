import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { ownedReferenceReview, ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { locationActionSchema, locationScopeSchema, type LocationReview } from "./contract";
import { locationImageSettings } from "./provider";
import { loadLocation } from "./media";

export async function readLocationReview(job: { id: string; owner_user_id: string; project_id: string }): Promise<LocationReview | undefined> {
  const db = createDatabaseClient();
  const root = await db.from("ugc_locations").select("*").eq("job_id", job.id).eq("owner_user_id", job.owner_user_id)
    .eq("project_id", job.project_id).eq("location_index", 1).maybeSingle();
  if (root.error) {
    if (["PGRST205", "42P01"].includes(root.error.code)) return undefined;
    throw new Error("LOCATION_READ_UNAVAILABLE");
  }
  if (!root.data) return undefined;
  const row = root.data;
  const dependencies = await db.rpc("ugc_location_dependencies", { p_job: job.id });
  if (dependencies.error) throw new Error("LOCATION_READ_UNAVAILABLE");
  const current = dependencies.data !== null && Object.entries(row.dependencies).every(([key, value]) => dependencies.data?.[key] === value);
  let available = false;
  let canRetrySaving = false; let pendingWithoutIntent = false;
  if (["image_review", "approved", "failed"].includes(row.state) && row.candidate_id) {
    const candidate = await db.from("ugc_location_candidates").select("*").eq("id", row.candidate_id).eq("location_id", row.id).maybeSingle();
    if (candidate.error) throw new Error("LOCATION_READ_UNAVAILABLE");
    available = !!candidate.data?.artifact && ["review", "accepted"].includes(candidate.data.state);
    canRetrySaving = row.state === "failed" && candidate.data?.state === "submitted" && !!candidate.data.intent;
    pendingWithoutIntent = candidate.data?.state === "pending" && !candidate.data.intent;
  }
  return { id: row.id, version: row.version, state: row.state, phase: row.phase, plan: row.plan,
    candidateId: row.candidate_id, imageAvailable: available, approvedAt: row.approved_at, error: row.error_code,
    dependenciesCurrent: current, heartbeatAt: row.heartbeat_at, leaseExpiresAt: row.lease_expires_at, updatedAt: row.updated_at,
    canRetrySaving, canResume: row.state === "failed" && (pendingWithoutIntent || !row.plan_intent && !row.candidate_id) };
}
export async function locationAction(input: unknown) {
  const parsed = locationActionSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError(400);
  const context = await ownedReferenceReview({ projectId: parsed.data.projectId, jobId: parsed.data.jobId });
  const { action, version, plan } = parsed.data;
  const scene = context.job.input_snapshot;
  const settings = scene.settings as Record<string, unknown> | undefined;
  // Technical readback before approval; SQL still fences concurrent version,
  // dependency and rejection changes after this private read.
  if (action === "accept") {
    const root = await context.db.from("ugc_locations").select("*").eq("job_id", context.job.id)
      .eq("owner_user_id", context.ownerId).eq("project_id", context.job.project_id).eq("location_index", 1).maybeSingle();
    if (root.error || !root.data || root.data.version !== version || root.data.state !== "image_review" || !root.data.candidate_id) throw new ReferenceReviewAccessError(409);
    const candidate = await context.db.from("ugc_location_candidates").select("*").eq("id", root.data.candidate_id).eq("location_id", root.data.id).single();
    if (candidate.error || !candidate.data?.artifact || candidate.data.state !== "review" ||
      !await loadLocation(root.data, candidate.data, AbortSignal.timeout(30_000))) throw new ReferenceReviewAccessError(409);
  }
  const result = await context.db.rpc("ugc_location_action", { p_owner: context.ownerId, p_project: context.job.project_id,
    p_job: context.job.id, p_version: version, p_action: action,
    p_payload: action === "generate" ? { plan, settings: locationImageSettings(settings?.aspectRatio) } : {} });
  if (result.error) throw new ReferenceReviewAccessError(503);
  if (!result.data) throw new ReferenceReviewAccessError(409);
  return readLocationReview(context.job);
}
export async function locationPreview(input: unknown, signal: AbortSignal) {
  const parsed = locationScopeSchema.extend({ candidateId: locationActionSchema.shape.jobId }).safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError(400);
  const context = await ownedReferenceReview({ projectId: parsed.data.projectId, jobId: parsed.data.jobId });
  const root = await context.db.from("ugc_locations").select("*").eq("job_id", context.job.id).eq("location_index", 1)
    .eq("owner_user_id", context.ownerId).eq("project_id", context.job.project_id).maybeSingle();
  if (root.error || !root.data || !["image_review", "approved"].includes(root.data.state) || root.data.candidate_id !== parsed.data.candidateId) {
    throw new ReferenceReviewAccessError();
  }
  const candidate = await context.db.from("ugc_location_candidates").select("*").eq("id", parsed.data.candidateId).eq("location_id", root.data.id).single();
  if (candidate.error || !candidate.data?.artifact || !["review", "accepted"].includes(candidate.data.state)) throw new ReferenceReviewAccessError();
  const stored = await loadLocation(root.data, candidate.data, signal);
  if (!stored) throw new ReferenceReviewAccessError();
  return stored.bytes;
}
