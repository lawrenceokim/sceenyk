import "server-only";
import { ugcPollMilliseconds } from "./contract";
import { UgcJobRunner } from "./runner";
import { claimUgcJob } from "./worker-service";

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
    while (!signal.aborted) {
      let delay = ugcPollMilliseconds;
      try {
        const job = await claimUgcJob(this.workerId);
        if (job) await this.runner.run(job, signal);
      } catch {
        console.error("UGC_LOCAL_WORKER_DATABASE_UNAVAILABLE");
        delay = 15_000;
      }
      await waitForPoll(delay, signal);
    }
  }
}
