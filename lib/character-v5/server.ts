import "server-only";
import { z } from "zod";
import { ownedReferenceReview, ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { readReferenceReviewState } from "@/lib/reference-review/state";
import { deleteR2CharacterCandidate, headR2CharacterObject } from "@/lib/storage/r2";
import { v5ActionSchema, v5Slots, CharacterV5Error, type V5Workflow, type V5Candidate } from "./contract";
import { readV5Artifact, v5Prefix } from "./storage";
import { existingV5SoulId } from "./worker";
import { logV5Failure, v5DatabaseError } from "./database-diagnostics";
import { recoverCharacterV5Candidate } from "./recovery";
import { readbackV5Candidate } from "./persistence";
import { logV5Back } from "./back-diagnostics";

export async function characterV5Action(input: unknown) {
  const parsed = v5ActionSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError(400);
  const { projectId, jobId, version, action, slot, cropTop } = parsed.data;
  const context = await ownedReferenceReview({ projectId, jobId });
  if (action === "retry_saving") {
    const current = context.review.characterV5;
    if (!current?.candidateId || current.version !== version || !current.canRetrySaving) throw new ReferenceReviewAccessError(409);
    await recoverCharacterV5Candidate({ jobId, candidateId: current.candidateId, version, ownerId: context.ownerId }, AbortSignal.timeout(180_000));
    const fresh = await ownedReferenceReview({ projectId, jobId }); return fresh.review;
  }
  let workflow: V5Workflow;
  if (action === "start") {
    // A start is creation-only; never reset an existing workflow/version.
    const existing = await context.db.from("ugc_character_v5_workflows").select("id").eq("job_id", jobId)
      .eq("owner_user_id", context.ownerId).eq("project_id", projectId).maybeSingle();
    if (existing.error) throw v5DatabaseError(existing.error, { operation: "read_workflow", phase: "candidate_readback", slot: "face", version: 1 });
    if (version !== 0) throw new ReferenceReviewAccessError(409);
    if (existing.data) return (await ownedReferenceReview({ projectId, jobId })).review;
    const result = await context.db.rpc("ugc_character_v5_start", { p_owner: context.ownerId, p_project: projectId, p_job: jobId,
      p_soul_id: await existingV5SoulId(context.job) });
    if (result.error) throw v5DatabaseError(result.error, { operation: "start_workflow", phase: "candidate_insertion", slot: "face", version: 1 });
    if (!result.data) throw new ReferenceReviewAccessError(409);
    workflow = result.data;
  } else {
    if (["accept", "approve"].includes(action)) {
      // Server enforcement: metadata alone never authorizes accepting a missing
      // image. Read/hash the exact immutable bytes before the version-fenced RPC.
      const saved = await context.db.from("ugc_character_v5_workflows").select("*").eq("job_id", jobId)
        .eq("owner_user_id", context.ownerId).eq("project_id", projectId).single();
      if (saved.error) throw v5DatabaseError(saved.error, { operation: "read_workflow", phase: "candidate_readback" });
      if (!saved.data || saved.data.version !== version) throw new ReferenceReviewAccessError(409);
      if (action === "accept") {
        const candidate = await context.db.from("ugc_character_v5_candidates").select("*").eq("id", saved.data.candidate_id!).eq("workflow_id", saved.data.id).single();
        if (candidate.error) throw v5DatabaseError(candidate.error, { operation: "read_candidate", phase: "candidate_readback" });
        if (!candidate.data?.artifact || candidate.data.state !== "review") throw new ReferenceReviewAccessError(409);
        await readV5Artifact(saved.data, candidate.data.artifact, AbortSignal.timeout(30_000));
      } else {
        if (!saved.data.sheet) throw new ReferenceReviewAccessError(409);
        for (const asset of [...Object.values(saved.data.accepted), saved.data.sheet]) {
          await readV5Artifact(saved.data, asset, AbortSignal.timeout(30_000));
        }
      }
    }
    const result = await context.db.rpc("ugc_character_v5_action", { p_owner: context.ownerId, p_project: projectId, p_job: jobId,
      p_version: version, p_action: action, p_slot: slot, p_crop_top: cropTop });
    if (result.error) throw v5DatabaseError(result.error, { operation: "manual_decision", phase: "candidate_insertion", slot, version });
    if (!result.data) throw new ReferenceReviewAccessError(409);
    workflow = result.data;
  }
  if (action === "reject") {
    // SQL has fenced this candidate against Accept and subsequent work. A failed
    // delete retains the private pointer and allows only an explicit retry.
    const candidate = await context.db.from("ugc_character_v5_candidates").select("*")
      .eq("id", workflow.candidate_id!).eq("workflow_id", workflow.id).single();
    if (candidate.error) throw v5DatabaseError(candidate.error, { operation: "read_candidate", phase: "candidate_readback", slot: workflow.slot, version: workflow.version });
    if (candidate.data?.state !== "rejecting" || !candidate.data.artifact) throw new CharacterV5Error("candidate_delete");
    const artifact = candidate.data.artifact;
    if (artifact.storageKey !== `${v5Prefix(workflow)}${candidate.data.id}.png` ||
      Object.values(workflow.accepted).some(asset => asset.storageKey === artifact.storageKey) || workflow.sheet?.storageKey === artifact.storageKey) {
      throw new CharacterV5Error("candidate_delete");
    }
    const signal = AbortSignal.timeout(40_000);
    const object = await headR2CharacterObject(artifact.storageKey, signal);
    if (object) {
      if (object.etag !== artifact.etag || object.sizeBytes !== artifact.sizeBytes) throw new CharacterV5Error("candidate_delete");
      await deleteR2CharacterCandidate(artifact.storageKey, artifact.etag, signal);
    }
    const finished = await context.db.rpc("ugc_character_v5_finish_rejection", { p_owner: context.ownerId, p_project: projectId, p_job: jobId,
      p_version: workflow.version, p_candidate: candidate.data.id });
    if (finished.error || !finished.data) throw v5DatabaseError(finished.error, { operation: "finish_rejection", phase: "candidate_insertion", slot: workflow.slot, version: workflow.version });
  }
  // Re-read the job because approval can move its reference gate.
  const fresh = await ownedReferenceReview({ projectId, jobId });
  return readReferenceReviewState(fresh.job, fresh.sheets);
}
const previewSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid(), version: z.coerce.number().int().positive(),
  slot: z.enum(v5Slots), candidateId: z.uuid().optional() });
export async function characterV5Preview(input: unknown, onBackPreview?: (candidate: V5Candidate) => void) {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError(404);
  const { projectId, jobId, version, slot, candidateId } = parsed.data;
  const context = await ownedReferenceReview({ projectId, jobId });
  const result = await context.db.from("ugc_character_v5_workflows").select("*").eq("job_id", jobId)
    .eq("owner_user_id", context.ownerId).eq("project_id", projectId).single();
  const workflow = result.data;
  if (result.error) throw v5DatabaseError(result.error, { operation: "read_workflow", phase: "candidate_readback", version });
  if (!workflow || workflow.version !== version) throw new ReferenceReviewAccessError(404);
  let artifact = slot === "sheet" ? workflow.sheet : workflow.accepted[slot];
  let previewCandidate: V5Candidate | undefined;
  if (candidateId) {
    if (candidateId !== workflow.candidate_id || workflow.state !== "review" || workflow.slot !== slot) throw new ReferenceReviewAccessError(404);
    if (slot === "back") {
      // Never substitute accepted Back, Face or Original for a missing candidate.
      // Verify slot, candidate ID, exact candidate key and saved output hash.
      const candidate = await readbackV5Candidate(workflow, candidateId);
      if (candidate.state !== "review") throw new ReferenceReviewAccessError(404);
      previewCandidate = candidate;
      artifact = candidate.artifact;
    } else {
      const candidate = await context.db.from("ugc_character_v5_candidates").select("*").eq("id", candidateId).eq("workflow_id", workflow.id).single();
      if (candidate.error) throw v5DatabaseError(candidate.error, { operation: "read_candidate", phase: "candidate_readback", slot, version });
      if (candidate.data?.state !== "review") throw new ReferenceReviewAccessError(404);
      artifact = candidate.data.artifact;
    }
  }
  if (!artifact) throw new ReferenceReviewAccessError(404);
  try {
    const bytes = await readV5Artifact(workflow, artifact, AbortSignal.timeout(30_000));
    if (previewCandidate) logV5Back("preview", previewCandidate, { source: "back_candidate", served: true });
    if (previewCandidate && process.env.NODE_ENV !== "production") onBackPreview?.(previewCandidate);
    return bytes;
  }
  catch {
    if (previewCandidate) logV5Back("preview", previewCandidate, { source: "none", served: false });
    const noted = await context.db.rpc("ugc_character_v5_preview_failure", { p_owner: context.ownerId, p_job: jobId, p_version: version });
    if (noted.error) logV5Failure(v5DatabaseError(noted.error, { operation: "preview_failure", phase: "candidate_insertion", slot, version }));
    throw new CharacterV5Error("preview_read", "CHARACTER_PREVIEW_READ_FAILED");
  }
}
