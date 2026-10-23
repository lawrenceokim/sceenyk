import "server-only";
import { ugcHeartbeatMilliseconds, type UgcJobErrorCode, type UgcJobRow, type UgcJobStage } from "./contract";
import { ugcWorkerService } from "./worker-service";
import { ugcStageHandlers } from "./stages";
import type { UgcGenerationSnapshot } from "./input-contract";

export type UgcStageResult = { kind: "advance" } | { kind: "references_analyzed" } | { kind: "validated"; snapshot: UgcGenerationSnapshot } | { kind: "fail"; code: UgcJobErrorCode; retryable?: boolean };
export type UgcStageHandler = (context: { job: Readonly<UgcJobRow>; signal: AbortSignal }) => Promise<UgcStageResult>;
export type UgcStageHandlers = Partial<Record<UgcJobStage, UgcStageHandler>>;

// Portable workflow coordinator. Neither this runner nor its default handlers
// import Inngest, Render, storage writers or financial services.
export class UgcJobRunner {
  constructor(private readonly handlers: UgcStageHandlers = ugcStageHandlers) {}

  async run(claimed: UgcJobRow, shutdown: AbortSignal): Promise<void> {
    let current = claimed;
    let leaseLost = false;
    const stageAbort = new AbortController();
    const interrupt = () => stageAbort.abort();
    shutdown.addEventListener("abort", interrupt, { once: true });
    if (shutdown.aborted) interrupt();

    // Serialize heartbeat and state updates; an old heartbeat response must not
    // overwrite a newly advanced stage in the process's current claim.
    let pending: Promise<unknown> = Promise.resolve();
    const apply = (operation: (job: UgcJobRow) => Promise<UgcJobRow | null>) => {
      const result = pending.then(async () => {
        if (leaseLost) throw new Error("UGC_LEASE_LOST");
        if (current.status !== "running") return current;
        const updated = await operation(current);
        if (!updated) { leaseLost = true; interrupt(); throw new Error("UGC_LEASE_LOST"); }
        current = updated;
        if (updated.cancellation_requested_at) interrupt();
        return updated;
      });
      pending = result.catch(() => {});
      return result;
    };
    const heartbeat = setInterval(() => {
      void apply(ugcWorkerService.heartbeat).catch(() => { leaseLost = true; interrupt(); });
    }, ugcHeartbeatMilliseconds);

    const stopAtBoundary = async () => {
      if (leaseLost) return true;
      if (current.cancellation_requested_at) { await apply(ugcWorkerService.cancel); return true; }
      if (shutdown.aborted) { await apply(ugcWorkerService.release); return true; }
      return current.status !== "running";
    };
    try {
      await apply(ugcWorkerService.heartbeat);
      while (!await stopAtBoundary()) {
        const handler = this.handlers[current.stage];
        if (!handler) {
          await apply(job => ugcWorkerService.fail(job, "STAGE_NOT_IMPLEMENTED"));
          return;
        }
        const outcome = await handler({ job: current, signal: stageAbort.signal });
        if (await stopAtBoundary()) return;
        if (outcome.kind === "validated") await apply(job => ugcWorkerService.finishValidation(job, outcome.snapshot));
        else if (outcome.kind === "references_analyzed") { await apply(ugcWorkerService.finishReferences); return; }
        else if (outcome.kind === "advance") await apply(ugcWorkerService.advance);
        else { await apply(job => ugcWorkerService.fail(job, outcome.code, outcome.retryable)); return; }
      }
    } catch {
      // Never log handler/provider errors. If lease ownership is uncertain, stop
      // all work and let database recovery decide; do not send a stale failure.
      if (!leaseLost) {
        try {
          if (!await stopAtBoundary()) await apply(job => ugcWorkerService.fail(job, "WORKER_ERROR"));
        } catch { /* A crashed/disconnected worker is recovered by lease expiry. */ }
      }
    } finally {
      clearInterval(heartbeat);
      interrupt();
      shutdown.removeEventListener("abort", interrupt);
      await pending;
    }
  }
}
