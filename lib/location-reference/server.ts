import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { ownedReferenceReview, ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { locationActionSchema, locationScopeSchema, type LocationReview } from "./contract";
import { locationImageSettings } from "./provider";
import { loadLocation } from "./media";
import { runLocationStorageClaim } from "./recovery";
import { locationFailure } from "./errors";

export async function readLocationReview(job: { id: string; owner_user_id: string; project_id: string }): Promise<LocationReview | undefined> {
  const db = createDatabaseClient();
  const root = await db.from("ugc_locations").select("*").eq("job_id", job.id).eq("owner_user_id", job.owner_user_id)
    .eq("project_id", job.project_id).eq("location_index", 1).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (root.error) {
    if (["PGRST205", "42P01"].includes(root.error.code)) return undefined;
    throw new Error("LOCATION_READ_UNAVAILABLE");
  }
  if (!root.data) return undefined;
  const row = root.data;
  const dependencies = await db.rpc("ugc_location_dependencies", { p_job: job.id });
  if (dependencies.error) throw new Error("LOCATION_READ_UNAVAILABLE");
  const scene = await db.rpc("ugc_location_scene", { p_job: job.id });
  if (scene.error) throw new Error("LOCATION_READ_UNAVAILABLE");
  const matches = scene.data ? await db.rpc("ugc_location_scene_matches", { p_saved: row.scene, p_current: scene.data }) : { data: false, error: null };
  if (matches.error) throw new Error("LOCATION_READ_UNAVAILABLE");
  const current = !!matches.data && dependencies.data !== null && Object.entries(row.dependencies).every(([key, value]) => dependencies.data?.[key] === value);
  let available = false;
  let canRetrySaving = false; let pendingWithoutIntent = false; let canDelete = false; let providerCompleted = false;
  const activeLease = !!row.claim_token && !!row.lease_expires_at && Date.parse(row.lease_expires_at) > Date.now();
  if (["image_review", "approved", "failed", "running_image", "queued_image", "rejecting"].includes(row.state) && row.candidate_id) {
    const candidate = await db.from("ugc_location_candidates").select("*").eq("id", row.candidate_id).eq("location_id", row.id).maybeSingle();
    if (candidate.error) throw new Error("LOCATION_READ_UNAVAILABLE");
    available = ["image_review", "approved"].includes(row.state) && !!candidate.data?.artifact && ["review", "accepted"].includes(candidate.data.state);
    canRetrySaving = !activeLease && ["failed", "running_image", "queued_image"].includes(row.state) && candidate.data?.state === "submitted" && !!candidate.data.intent;
    pendingWithoutIntent = candidate.data?.state === "pending" && !candidate.data.intent;
    providerCompleted = !!candidate.data?.receipt;
    canDelete = !activeLease && ["failed", "image_review"].includes(row.state) && !!candidate.data && !["accepted", "deleted"].includes(candidate.data.state) && !row.accepted_candidate_id;
  }
  let legacyWaiting = false;
  if (!row.explicit_generation_at && ["queued_plan", "queued_image"].includes(row.state) && !activeLease) {
    const prior = await db.from("ugc_locations").select("id").eq("next_location_id", row.id).eq("job_id", job.id).limit(1);
    if (prior.error) throw new Error("LOCATION_READ_UNAVAILABLE");
    legacyWaiting = !!prior.data?.length && !canRetrySaving;
  }
  return { id: row.id, version: row.version, state: row.state, phase: row.phase,
    candidateId: available ? row.candidate_id : null, imageAvailable: available, approvedAt: row.approved_at, error: row.error_code,
    dependenciesCurrent: current, heartbeatAt: row.heartbeat_at, leaseExpiresAt: row.lease_expires_at, updatedAt: row.updated_at,
    canRetrySaving, canResume: row.state === "failed" && (pendingWithoutIntent || !row.plan_intent && !row.candidate_id),
    requested: !legacyWaiting && (!!row.requested_at || row.state !== "queued_plan" && row.state !== "idle"),
    canDelete, canRetryDelete: row.state === "rejecting" && !!row.error_code && !activeLease, providerCompleted, diagnostic: row.diagnostic ?? null,
    canGenerate: !!scene.data && !!dependencies.data && (["idle", "plan_review"].includes(row.state) || legacyWaiting || row.state === "queued_plan" && !row.requested_at || row.state === "approved" && !current) };
}
export async function locationAction(input: unknown) {
  const parsed = locationActionSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError(400);
  const context = await ownedReferenceReview({ projectId: parsed.data.projectId, jobId: parsed.data.jobId });
  const { action, version, locationId } = parsed.data;
  if (action === "retry_saving") {
    const claim = await context.db.rpc("ugc_location_recovery_claim", { p_owner: context.ownerId, p_project: context.job.project_id,
      p_job: context.job.id, p_location: locationId!, p_version: version });
    if (claim.error) throw locationFailure(claim.error, "recovery_claim", "LOCATION_DATABASE_FAILED");
    if (!claim.data) throw new ReferenceReviewAccessError(409);
    await runLocationStorageClaim(claim.data);
    return readLocationReview(context.job);
  }
  const scene = ["generate", "resume"].includes(action) ? await context.db.rpc("ugc_location_scene", { p_job: context.job.id }) : null;
  if (scene?.error) throw new ReferenceReviewAccessError(503);
  const settings = scene?.data?.settings as Record<string, unknown> | undefined;
  // Technical readback before approval; SQL still fences concurrent version,
  // dependency and rejection changes after this private read.
  if (action === "accept") {
    const root = await context.db.from("ugc_locations").select("*").eq("job_id", context.job.id)
      .eq("owner_user_id", context.ownerId).eq("project_id", context.job.project_id).eq("location_index", 1).order("revision", { ascending: false }).limit(1).maybeSingle();
    if (root.error || !root.data || root.data.version !== version || root.data.state !== "image_review" || !root.data.candidate_id) throw new ReferenceReviewAccessError(409);
    const candidate = await context.db.from("ugc_location_candidates").select("*").eq("id", root.data.candidate_id).eq("location_id", root.data.id).single();
    if (candidate.error || !candidate.data?.artifact || candidate.data.state !== "review" ||
      !await loadLocation(root.data, candidate.data, AbortSignal.timeout(30_000))) throw new ReferenceReviewAccessError(409);
  }
  const result = await context.db.rpc("ugc_location_action", { p_owner: context.ownerId, p_project: context.job.project_id,
    p_job: context.job.id, p_version: version, p_action: action,
    p_payload: { ...(locationId ? { locationId } : {}), ...(scene?.data ? { settings: locationImageSettings(settings?.aspectRatio) } : {}) } });
  if (result.error) throw locationFailure(result.error, "manual_action", "LOCATION_DATABASE_FAILED");
  if (!result.data) throw new ReferenceReviewAccessError(409);
  if (action === "reject" || action === "retry_delete") {
    const claim = await context.db.rpc("ugc_location_cleanup_claim", { p_owner: context.ownerId, p_project: context.job.project_id,
      p_job: context.job.id, p_location: result.data.id, p_version: result.data.version });
    if (claim.error) throw locationFailure(claim.error, "cleanup_claim", "LOCATION_DATABASE_FAILED");
    if (claim.data) await runLocationStorageClaim(claim.data);
  }
  return readLocationReview(context.job);
}
export async function locationPreview(input: unknown, signal: AbortSignal) {
  const parsed = locationScopeSchema.extend({ candidateId: locationScopeSchema.shape.jobId }).safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError(400);
  const context = await ownedReferenceReview({ projectId: parsed.data.projectId, jobId: parsed.data.jobId });
  const root = await context.db.from("ugc_locations").select("*").eq("job_id", context.job.id).eq("location_index", 1)
    .eq("owner_user_id", context.ownerId).eq("project_id", context.job.project_id).eq("candidate_id", parsed.data.candidateId).maybeSingle();
  if (root.error || !root.data || !["image_review", "approved"].includes(root.data.state) || root.data.candidate_id !== parsed.data.candidateId) {
    throw new ReferenceReviewAccessError();
  }
  const candidate = await context.db.from("ugc_location_candidates").select("*").eq("id", parsed.data.candidateId).eq("location_id", root.data.id).single();
  if (candidate.error || !candidate.data?.artifact || !["review", "accepted"].includes(candidate.data.state)) throw new ReferenceReviewAccessError();
  const stored = await loadLocation(root.data, candidate.data, signal);
  if (!stored) throw new ReferenceReviewAccessError();
  return stored.bytes;
}
