import "server-only";
import { ugcPollMilliseconds } from "./contract";
import { UgcJobRunner } from "./runner";
import { claimUgcJob } from "./worker-service";
import { runReferenceRegeneration } from "@/lib/reference-review/regeneration";
import { claimReferenceRegeneration } from "@/lib/reference-review/claim";
import { UgcWorkerDatabaseError, type WorkerDatabasePhase } from "./database-diagnostics";
import { createDatabaseClient } from "@/lib/db/server";
import { runCharacterV5 } from "@/lib/character-v5/worker";
import { runLocation } from "@/lib/location-reference/worker";
import { runStoryboard } from "@/lib/storyboard/worker";
import { parseWorkerClaim, UgcClaimContractError, type LocalExecutionResult } from "./claim-contract";
import { LocalQueuePolicy, type LocalQueue } from "./queue-policy";

function waitForPoll(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}
const phases: Record<LocalQueue, WorkerDatabasePhase> = { character: "character_claim", location: "location_claim",
  storyboard: "storyboard_claim", regeneration: "regeneration_claim", generation: "job_claim" };

// Fair independent lanes. Empty/invalid Location results cannot skip Storyboard.
export class LocalJobRunner {
  constructor(private readonly workerId: string, private readonly runner = new UgcJobRunner()) {}

  async run(signal: AbortSignal) {
    const policy = new LocalQueuePolicy();
    while (!signal.aborted) {
      for (const queue of policy.order(Date.now())) {
        if (signal.aborted) break;
        if (queue === "location" && process.env.UGC_LOCATION_ENABLED !== "1" ||
          queue === "storyboard" && process.env.UGC_STORYBOARD_ENABLED !== "1") continue;
        let scope: { projectId: string; jobId: string; recordId: string } | undefined;
        try {
          let worked = false; let execution: LocalExecutionResult | undefined;
          if (queue === "character") {
            const result = await createDatabaseClient().rpc("ugc_character_v5_claim", { p_worker: this.workerId });
            if (result.error) throw new UgcWorkerDatabaseError(result.error, phases[queue], result.status);
            const claim = parseWorkerClaim("character", result.data);
            if (claim) { scope = { projectId: claim.project_id, jobId: claim.job_id, recordId: claim.id };
              worked = true; await runCharacterV5(claim, signal); }
          } else if (queue === "location") {
            const result = await createDatabaseClient().rpc("ugc_location_claim", { p_worker: this.workerId });
            if (result.error) throw new UgcWorkerDatabaseError(result.error, phases[queue], result.status);
            const claim = parseWorkerClaim("location", result.data);
            if (claim) { scope = { projectId: claim.project_id, jobId: claim.job_id, recordId: claim.id };
              worked = true; execution = await runLocation(claim, signal); }
          } else if (queue === "storyboard") {
            const result = await createDatabaseClient().rpc("ugc_storyboard_claim", { p_worker: this.workerId });
            if (result.error) throw new UgcWorkerDatabaseError(result.error, phases[queue], result.status);
            const claim = parseWorkerClaim("storyboard", result.data);
            if (claim) { scope = { projectId: claim.project_id, jobId: claim.job_id, recordId: claim.id };
              worked = true; execution = await runStoryboard(claim, signal); }
          } else if (queue === "regeneration") {
            const claim = await claimReferenceRegeneration(this.workerId, process.env.UGC_PRODUCT_SHEET_ENABLED === "1");
            if (claim) { scope = { projectId: claim.project_id, jobId: claim.job_id, recordId: claim.id };
              worked = true; await runReferenceRegeneration(claim, signal); }
          } else {
            const job = await claimUgcJob(this.workerId);
            if (job) { scope = { projectId: job.project_id, jobId: job.id, recordId: job.id };
              worked = true; await this.runner.run(job, signal); }
          }
          if (execution && !execution.ok && execution.failureSaved) {
            // SQL has fenced this failed record. Keep the lane open for unrelated
            // records; their eligibility must not depend on another job's error.
            policy.worked(queue);
            continue;
          }
          if (execution && !execution.ok) {
            const retry = policy.failed(queue, Date.now(), true);
            console.error("UGC_LOCAL_WORKER_QUEUE_FAILURE", { queue, phase: "execution", category: "execution_failed", ...scope,
              retryState: retry.paused ? "lane_paused_until_restart" : "lane_backoff", failures: retry.failures,
              retryAt: retry.retryAt === null ? null : new Date(retry.retryAt).toISOString() });
            continue;
          }
          if (worked) { policy.worked(queue); break; }
        } catch (error) {
          if (signal.aborted) break;
          const database = error instanceof UgcWorkerDatabaseError ? error : error instanceof UgcClaimContractError ? null : new UgcWorkerDatabaseError(error, phases[queue]);
          const diagnostic = database?.diagnostic;
          const retry = policy.failed(queue, Date.now(), diagnostic?.retrying ?? false);
          console.error("UGC_LOCAL_WORKER_QUEUE_FAILURE", { queue, ...scope,
            ...(diagnostic ?? { phase: phases[queue], category: "claim_contract_invalid", reason: (error as UgcClaimContractError).reason }),
            retrying: !retry.paused, retryState: retry.paused ? "lane_paused_until_restart" : "lane_backoff",
            failures: retry.failures, retryAt: retry.retryAt === null ? null : new Date(retry.retryAt).toISOString() });
        }
      }
      await waitForPoll(ugcPollMilliseconds, signal);
    }
  }
}
