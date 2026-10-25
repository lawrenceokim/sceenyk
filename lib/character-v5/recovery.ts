import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { CharacterV5Error, type V5Workflow } from "./contract";
import { logV5Failure, v5DatabaseError } from "./database-diagnostics";
import { recoverV5Artifact, saveV5Artifact, v5Prefix } from "./storage";
import { readbackV5Candidate } from "./persistence";
import { retrieveV5CompletedBytes } from "./output-retrieval";

// Deliberate recovery only: existing R2 bytes first, then GET the saved provider
// receipt. No generation submission, worker dispatch, new row/key or deletion.
export async function recoverCharacterV5Candidate(input: { jobId: string; candidateId: string; version?: number; ownerId?: string }, signal: AbortSignal) {
  const db = createDatabaseClient();
  const jobResult = await db.from("ugc_generation_jobs").select("*").eq("id", input.jobId).single();
  if (jobResult.error || !jobResult.data) throw v5DatabaseError(jobResult.error, { operation: "read_job", phase: "candidate_readback" });
  const job = jobResult.data;
  if (input.ownerId && input.ownerId !== job.owner_user_id || job.cancellation_requested_at || !["queued", "failed"].includes(job.status)) {
    throw new CharacterV5Error("candidate_readback", "CHARACTER_RECOVERY_NOT_ELIGIBLE");
  }
  const project = await db.from("projects").select("id").eq("id", job.project_id).eq("owner_user_id", job.owner_user_id).eq("status", "draft").maybeSingle();
  if (project.error) throw v5DatabaseError(project.error, { operation: "read_project", phase: "candidate_readback" });
  if (!project.data) throw new CharacterV5Error("candidate_readback", "CHARACTER_RECOVERY_NOT_ELIGIBLE");
  const saved = await db.from("ugc_character_v5_workflows").select("*").eq("job_id", job.id)
    .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
  if (saved.error) throw v5DatabaseError(saved.error, { operation: "read_workflow", phase: "candidate_readback" });
  if (!saved.data) throw new CharacterV5Error("candidate_readback", "CHARACTER_V5_WORKFLOW_NOT_FOUND");
  const workflow: V5Workflow = saved.data;
  if (workflow.candidate_id !== input.candidateId || input.version !== undefined && workflow.version !== input.version) {
    throw new CharacterV5Error("candidate_readback", "CHARACTER_RECOVERY_VERSION_CHANGED");
  }
  const result = await db.from("ugc_character_v5_candidates").select("*").eq("id", input.candidateId).eq("workflow_id", workflow.id).single();
  if (result.error || !result.data) throw v5DatabaseError(result.error, { operation: "read_candidate", phase: "candidate_readback", slot: workflow.slot, version: workflow.version });
  const candidate = result.data;
  if (["rejected", "rejecting"].includes(candidate.state) || candidate.slot !== workflow.slot ||
    candidate.planned_key !== `${v5Prefix(workflow)}${candidate.id}.png` || !candidate.output_proof) {
    throw new CharacterV5Error("candidate_readback", "CHARACTER_RECOVERY_PROOF_UNAVAILABLE");
  }
  let artifact = await recoverV5Artifact(workflow, candidate.id, signal, candidate.output_proof);
  if (artifact && candidate.artifact && (candidate.artifact.sha256 !== artifact.sha256 || candidate.artifact.etag !== artifact.etag)) {
    throw new CharacterV5Error("r2_verify", "CHARACTER_OUTPUT_PROOF_MISMATCH");
  }
  if (["review", "accepted"].includes(candidate.state)) {
    if (!artifact) throw new CharacterV5Error("r2_verify", "CHARACTER_COMMITTED_OBJECT_NOT_FOUND");
    await readbackV5Candidate(workflow, candidate.id);
    return { jobId: job.id, candidateId: candidate.id, state: workflow.state, alreadyPublished: true };
  }
  signal.throwIfAborted();
  const claim = await db.rpc("ugc_character_v5_recovery_claim", { p_owner: job.owner_user_id, p_project: job.project_id,
    p_job: job.id, p_version: workflow.version, p_candidate: candidate.id });
  if (claim.error || !claim.data) throw v5DatabaseError(claim.error, { operation: "recovery_claim", phase: "candidate_insertion", slot: workflow.slot, version: workflow.version });
  const claimToken = claim.data.claim_token!;
  const abort = new AbortController(); const recoverySignal = AbortSignal.any([signal, abort.signal]);
  let pending: Promise<unknown> = Promise.resolve(); let published = false;
  const checkpoint = (operation: "heartbeat" | "ready" | "fail", payload: Record<string, unknown> = {}) => {
    const task = pending.then(async () => {
      const result = await db.rpc("ugc_character_v5_checkpoint", { p_workflow: workflow.id, p_token: claimToken,
        p_candidate: candidate.id, p_operation: operation, p_payload: payload });
      if (result.error || !result.data) throw v5DatabaseError(result.error, { operation: operation === "ready" ? "persist_candidate" :
        operation === "fail" ? "checkpoint_failure" : "heartbeat", phase: "candidate_insertion", slot: workflow.slot, version: workflow.version });
    });
    pending = task.catch(() => {}); return task;
  };
  const timer = setInterval(() => { void checkpoint("heartbeat").catch(() => abort.abort()); }, 20_000);
  try {
    if (!artifact) {
      const bytes = await retrieveV5CompletedBytes(candidate, recoverySignal);
      recoverySignal.throwIfAborted();
      artifact = await saveV5Artifact(workflow, candidate.id, bytes, recoverySignal, true);
    }
    recoverySignal.throwIfAborted();
    await checkpoint("ready", { artifact }); published = true;
    await readbackV5Candidate(workflow, candidate.id);
    return { jobId: job.id, candidateId: candidate.id, state: workflow.slot === "sheet" ? "ready" : "review", alreadyPublished: false };
  } catch (error) {
    const safe = error instanceof CharacterV5Error ? error : new CharacterV5Error("r2_verify", "CHARACTER_EXISTING_OUTPUT_UNAVAILABLE");
    if (!published && !abort.signal.aborted) {
      try { await checkpoint("fail", { phase: safe.phase, code: safe.code,
        providerTerminal: candidate.provider_terminal || safe.code === "CHARACTER_OUTPUT_UNRECOVERABLE" }); }
      catch (failure) { if (failure instanceof CharacterV5Error) logV5Failure(failure); }
    }
    throw safe;
  } finally { clearInterval(timer); await pending; }
}
