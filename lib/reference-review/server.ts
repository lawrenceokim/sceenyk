import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createDatabaseClient } from "@/lib/db/server";
import { ugcGenerationSnapshotSchema } from "@/lib/ugc-jobs/input-contract";
import { reviewScopeSchema, reviewActionSchema, regenerationActionSchema, referenceViews } from "./contract";
import { parseReviewSheet, readReferenceReviewState, type ReviewSheets } from "./state";
import type { UgcJobRow } from "@/lib/ugc-jobs/contract";

export class ReferenceReviewAccessError extends Error {
  constructor(readonly status = 404) { super("Reference review is unavailable."); }
}
export async function ownedReferenceReview(input: unknown) {
  const scope = reviewScopeSchema.safeParse(input);
  if (!scope.success) throw new ReferenceReviewAccessError();
  const { userId } = await auth();
  if (!userId) throw new ReferenceReviewAccessError(401);
  const db = createDatabaseClient();
  const owner = await db.from("app_users").select("id").eq("clerk_user_id", userId).maybeSingle();
  if (owner.error || !owner.data) throw new ReferenceReviewAccessError();
  const project = await db.from("projects").select("id").eq("id", scope.data.projectId).eq("owner_user_id", owner.data.id).eq("status", "draft").maybeSingle();
  if (project.error || !project.data) throw new ReferenceReviewAccessError();
  const result = await db.from("ugc_generation_jobs").select("*").eq("id", scope.data.jobId)
    .eq("project_id", scope.data.projectId).eq("owner_user_id", owner.data.id).maybeSingle();
  if (result.error || !result.data) throw new ReferenceReviewAccessError();
  const job: UgcJobRow = result.data;
  const [character, product] = await Promise.all([
    db.from("ugc_character_sheets").select("*").eq("job_id", job.id).eq("owner_user_id", owner.data.id).eq("project_id", job.project_id).maybeSingle(),
    db.from("ugc_product_sheets").select("*").eq("job_id", job.id).eq("owner_user_id", owner.data.id).eq("project_id", job.project_id).maybeSingle(),
  ]);
  if (character.error || product.error && !["PGRST205", "42P01"].includes(product.error.code)) throw new ReferenceReviewAccessError(503);
  const sheets: ReviewSheets = { character: character.data, product: product.data };
  return { db, job, sheets, ownerId: owner.data.id, review: await readReferenceReviewState(job, sheets) };
}
export async function approveReference(input: unknown) {
  const parsed = reviewActionSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError();
  const { type, version, projectId, jobId } = parsed.data;
  const context = await ownedReferenceReview({ projectId, jobId });
  const sheet = parseReviewSheet(context.job, type, context.sheets[type]);
  if (!sheet || !context.review.actionsAvailable) throw new ReferenceReviewAccessError(409);
  const result = await context.db.rpc("ugc_approve_reference", { p_owner_user_id: context.ownerId, p_project_id: projectId,
    p_job_id: jobId, p_reference_type: type, p_expected_version: version, p_sheet_id: sheet.row.id });
  if (result.error) throw new ReferenceReviewAccessError(503);
  if (!result.data) throw new ReferenceReviewAccessError(409);
  return readReferenceReviewState(context.job, context.sheets);
}
export async function requestReferenceRegeneration(input: unknown) {
  const parsed = regenerationActionSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError();
  const { type, view, version, requestId, projectId, jobId } = parsed.data;
  if (!(referenceViews[type] as readonly string[]).includes(view)) throw new ReferenceReviewAccessError();
  const context = await ownedReferenceReview({ projectId, jobId });
  const sheet = parseReviewSheet(context.job, type, context.sheets[type]);
  if (!sheet?.assets[view] || !context.review.actionsAvailable) throw new ReferenceReviewAccessError(409);
  const result = await context.db.rpc("ugc_request_reference_regeneration", { p_owner_user_id: context.ownerId, p_project_id: projectId,
    p_job_id: jobId, p_reference_type: type, p_view: view, p_expected_version: version, p_sheet_id: sheet.row.id, p_request_id: requestId });
  if (result.error) throw new ReferenceReviewAccessError(503);
  if (!result.data) throw new ReferenceReviewAccessError(409);
  return readReferenceReviewState(context.job, context.sheets);
}
export function reviewSnapshot(job: UgcJobRow) {
  const snapshot = ugcGenerationSnapshotSchema.safeParse(job.input_snapshot);
  if (!snapshot.success) throw new ReferenceReviewAccessError();
  return snapshot.data;
}
