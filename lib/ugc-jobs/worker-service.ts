import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import type { UgcGenerationSnapshot } from "./input-contract";
import {
  isUgcTransitionAllowed, ugcLeaseSeconds, ugcNextStage,
  type UgcJobErrorCode, type UgcJobRow,
} from "./contract";

// Trusted worker RPCs only; no Server Action or caller-supplied owner identity.
export async function claimUgcJob(workerId: string): Promise<UgcJobRow | null> {
  const { data, error } = await createDatabaseClient().rpc("ugc_claim_job", { p_worker_id: workerId });
  if (error) throw new Error("UGC_CLAIM_UNAVAILABLE");
  return data;
}

export type UgcWorkerOperation = "heartbeat" | "advance" | "fail" | "release" | "cancel";
export async function updateUgcClaim(job: UgcJobRow, operation: UgcWorkerOperation, errorCode?: UgcJobErrorCode, retryable = false): Promise<UgcJobRow | null> {
  if (!job.claim_token || job.status !== "running") throw new Error("UGC_CLAIM_REQUIRED");
  if (operation === "advance") {
    const stage = ugcNextStage[job.stage];
    const status = stage === "awaiting_confirmation" ? "awaiting_confirmation" : stage === "complete" ? "completed" : "running";
    if (!stage || !isUgcTransitionAllowed(job, { stage, status })) throw new Error("UGC_TRANSITION_INVALID");
  }
  const { data, error } = await createDatabaseClient().rpc("ugc_update_claim", {
    p_job_id: job.id, p_claim_token: job.claim_token, p_expected_stage: job.stage,
    p_operation: operation, p_error_code: errorCode ?? null, p_retryable: retryable,
  });
  if (error) throw new Error("UGC_WORKER_UPDATE_UNAVAILABLE");
  return data;
}

export const ugcWorkerService = {
  finishValidation: async (job: UgcJobRow, snapshot: UgcGenerationSnapshot) => {
    if (!job.claim_token || job.stage !== "validate_inputs" || job.status !== "running") throw new Error("UGC_CLAIM_REQUIRED");
    const { data, error } = await createDatabaseClient().rpc("ugc_finish_input_validation", {
      p_job_id: job.id, p_claim_token: job.claim_token, p_input_snapshot: snapshot,
    });
    if (error) throw new Error("UGC_WORKER_UPDATE_UNAVAILABLE");
    return data;
  },
  claim: claimUgcJob,
  heartbeat: (job: UgcJobRow) => updateUgcClaim(job, "heartbeat"),
  advance: (job: UgcJobRow) => updateUgcClaim(job, "advance"),
  fail: (job: UgcJobRow, code: UgcJobErrorCode, retryable = false) => updateUgcClaim(job, "fail", code, retryable),
  release: (job: UgcJobRow) => updateUgcClaim(job, "release"),
  cancel: (job: UgcJobRow) => updateUgcClaim(job, "cancel"),
};

// Lease duration is fixed by both the SQL RPCs and this shared configuration.
export { ugcLeaseSeconds };
