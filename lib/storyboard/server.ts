import "server-only";
import { isDeepStrictEqual } from "node:util";
import { createDatabaseClient } from "@/lib/db/server";
import { ownedReferenceReview, ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { storyboardActionSchema, storyboardBinding, validateStoryboard, prepareStoryboard, storyboardExecution, type StoryboardRow, type StoryboardReview } from "./contract";
import { compositeRecord } from "@/lib/ugc-jobs/claim-contract";
import { storyboardRecoveryInfo } from "./recovery";
import { StoryboardValidationError } from "./validation-diagnostics";
import { manualStoryboardCandidates, prepareManualStoryboard, StoryboardManualRecoveryError } from "./manual-recovery";

export class StoryboardRecoveryUnavailableError extends ReferenceReviewAccessError {
  constructor() { super(409); }
}

export async function readStoryboard(job: { id: string; project_id: string; owner_user_id: string }) {
  const db = createDatabaseClient();
  const result = await db.from("ugc_storyboards").select("*").eq("job_id", job.id).eq("project_id", job.project_id)
    .eq("owner_user_id", job.owner_user_id).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (result.error) {
    if (["PGRST205", "42P01"].includes(result.error.code)) return { review: undefined, eligible: false };
    throw new Error("STORYBOARD_READ_FAILED");
  }
  const context = await db.rpc("ugc_storyboard_input", { p_job: job.id });
  if (context.error) throw new Error("STORYBOARD_READ_FAILED");
  const row = result.data as StoryboardRow | null;
  if (!row) return { review: undefined, eligible: !!context.data };
  const current = !!context.data && isDeepStrictEqual(context.data, row.input);
  const recovery = await storyboardRecoveryInfo(row);
  const leased = !!row.claim_token && Date.parse(row.lease_expires_at ?? "") > Date.now();
  const review: StoryboardReview = { id: row.id, version: row.version, state: row.state, phase: row.phase,
    document: ["review", "approved"].includes(row.state) && row.document ? validateStoryboard(row.document, storyboardBinding(row.input)) : null,
    current, error: row.error_code, heartbeatAt: row.heartbeat_at, leaseExpiresAt: row.lease_expires_at,
    canRetry: row.state === "deleting" && !!row.error_code || row.state === "failed" && row.attempts < 3 && current &&
      row.requests.length > 0 && !!recovery.validations?.some(report => report.valid),
    canDelete: !leased && !["deleted", "deleting"].includes(row.state), approvedAt: row.approved_at,
    createdAt: row.created_at, updatedAt: row.updated_at, attempts: row.attempts, requestCount: row.requests.length, recovery,
    manualRecoveries: current && !leased ? manualStoryboardCandidates(row) : [] };
  review.execution = storyboardExecution(review, Date.now(), process.env.UGC_STORYBOARD_ENABLED === "1");
  return { review, eligible: !!context.data };
}

export async function storyboardAction(input: unknown) {
  const parsed = storyboardActionSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError(400);
  const data = parsed.data;
  const context = await ownedReferenceReview({ projectId: data.projectId, jobId: data.jobId });
  if (data.action === "recover") {
    const read = await context.db.from("ugc_storyboards").select("*").eq("id", data.storyboardId!).eq("job_id", data.jobId)
      .eq("project_id", data.projectId).eq("owner_user_id", context.ownerId).maybeSingle();
    if (read.error || !read.data || read.data.version !== data.version) throw new ReferenceReviewAccessError(409);
    const document = prepareManualStoryboard(read.data, data.requestIndex, data.document);
    const recovered = await context.db.rpc("ugc_storyboard_recover_dialogue", { p_owner: context.ownerId, p_project: data.projectId,
      p_job: data.jobId, p_storyboard: data.storyboardId!, p_version: data.version, p_request_index: data.requestIndex!, p_document: document });
    if (recovered.error) {
      if (["PGRST202", "42883"].includes(recovered.error.code)) throw new StoryboardManualRecoveryError("STORYBOARD_MANUAL_RECOVERY_SETUP");
      throw new ReferenceReviewAccessError(503);
    }
    if (!compositeRecord(recovered.data)?.id) throw new ReferenceReviewAccessError(409);
    return (await readStoryboard(context.job)).review;
  }
  if (data.action === "retry") {
    const row = await context.db.from("ugc_storyboards").select("*").eq("id", data.storyboardId!).eq("job_id", data.jobId)
      .eq("owner_user_id", context.ownerId).eq("project_id", data.projectId).maybeSingle();
    if (row.error || !row.data || row.data.version !== data.version) throw new ReferenceReviewAccessError(409);
    if (row.data.state !== "deleting" && (!row.data.requests.length || !(await storyboardRecoveryInfo(row.data)).validations?.some(report => report.valid)))
      throw new StoryboardRecoveryUnavailableError();
  }
  let document;
  if (["save", "accept"].includes(data.action)) {
    const read = await context.db.from("ugc_storyboards").select("*").eq("id", data.storyboardId!)
      .eq("job_id", context.job.id).eq("project_id", data.projectId).eq("owner_user_id", context.ownerId).maybeSingle();
    if (read.error || !read.data || read.data.version !== data.version) throw new ReferenceReviewAccessError(409);
    try { document = data.action === "save" ? prepareStoryboard(data.document, read.data.input) : validateStoryboard(read.data.document, storyboardBinding(read.data.input)); }
    catch (error) { if (error instanceof StoryboardValidationError) throw error; throw new ReferenceReviewAccessError(422); }
  }
  const result = await context.db.rpc("ugc_storyboard_action", { p_owner: context.ownerId, p_project: data.projectId,
    p_job: data.jobId, p_version: data.version, p_action: data.action,
    p_payload: { ...(data.storyboardId ? { storyboardId: data.storyboardId } : {}), ...(document ? { document } : {}) } });
  if (result.error) throw new ReferenceReviewAccessError(503);
  if (!compositeRecord(result.data)?.id) throw new ReferenceReviewAccessError(409);
  return (await readStoryboard(context.job)).review;
}
