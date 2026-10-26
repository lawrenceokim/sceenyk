import "server-only";
import { ugcPollMilliseconds } from "./contract";
import { UgcJobRunner } from "./runner";
import { claimUgcJob } from "./worker-service";
import { runReferenceRegeneration } from "@/lib/reference-review/regeneration";
import { claimReferenceRegeneration } from "@/lib/reference-review/claim";
import { UgcWorkerDatabaseError, workerDatabaseBackoff, type WorkerDatabasePhase } from "./database-diagnostics";
import { createDatabaseClient } from "@/lib/db/server";
import { runCharacterV5 } from "@/lib/character-v5/worker";
import { runLocation } from "@/lib/location-reference/worker";

function waitForPoll(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

// Execution adapter only. Stage implementation belongs in shared services.
export class LocalJobRunner {
  constructor(private readonly workerId: string, private readonly runner = new UgcJobRunner()) {}

  async run(signal: AbortSignal) {
    let failures = 0;
    let lastLog = 0;
    let lastSignature = "";
    while (!signal.aborted) {
      let delay = ugcPollMilliseconds;
      let phase: WorkerDatabasePhase = "regeneration_claim";
      try {
        const manual = await createDatabaseClient().rpc("ugc_character_v5_claim", { p_worker: this.workerId });
        if (manual.error) throw new UgcWorkerDatabaseError(manual.error, "regeneration_claim");
        if (manual.data) {
          await runCharacterV5(manual.data, signal);
          failures = 0; lastSignature = "";
          await waitForPoll(delay, signal);
          continue;
        }
        if (process.env.UGC_LOCATION_ENABLED === "1") {
          const location = await createDatabaseClient().rpc("ugc_location_claim", { p_worker: this.workerId });
          if (location.error) throw new UgcWorkerDatabaseError(location.error, "regeneration_claim");
          if (location.data) {
            await runLocation(location.data, signal);
            failures = 0; lastSignature = "";
            await waitForPoll(delay, signal);
            continue;
          }
        }
        const claim = await claimReferenceRegeneration(this.workerId, process.env.UGC_PRODUCT_SHEET_ENABLED === "1");
        if (!claim) phase = "job_claim";
        const job = claim ? null : await claimUgcJob(this.workerId);
        if (failures) console.info("UGC_LOCAL_WORKER_DATABASE_RECOVERED", { phase });
        failures = 0; lastSignature = "";
        if (claim) await runReferenceRegeneration(claim, signal);
        else if (job) await this.runner.run(job, signal);
      } catch (error) {
        if (signal.aborted) break;
        if (!(error instanceof UgcWorkerDatabaseError)) {
          console.error("UGC_LOCAL_WORKER_CONTRACT_INVALID", { phase, category: "worker_contract_invalid", retrying: false });
          throw new Error("UGC_WORKER_CONTRACT_INVALID");
        }
        failures += 1;
        delay = workerDatabaseBackoff(failures);
        const diagnostic = error.diagnostic;
        const signature = `${diagnostic.phase}:${diagnostic.category}:${diagnostic.code ?? ""}`;
        if (signature !== lastSignature || Date.now() - lastLog >= 600_000 || !diagnostic.retrying) {
          console.error("UGC_LOCAL_WORKER_DATABASE_UNAVAILABLE", { ...diagnostic,
            ...(diagnostic.retrying ? { retryInMs: delay } : {}) });
          lastSignature = signature; lastLog = Date.now();
        }
        if (!diagnostic.retrying) throw new Error("UGC_DATABASE_UNRECOVERABLE");
      }
      await waitForPoll(delay, signal);
    }
  }
}
