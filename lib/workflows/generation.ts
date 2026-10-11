import "server-only";
import { NonRetriableError } from "inngest";
import { createDatabaseClient } from "@/lib/db/server";
import { advanceAnalysis, runAnalysisAttempt } from "@/lib/ai/server";
import { AnalysisError } from "@/lib/ai/types";
import { dispatchGeneration, dispatchLog } from "@/lib/generation/dispatch";
import {
  generationEventSchema,
  generationRequested,
} from "@/lib/generation/dispatch-contract";
import { inngest } from "./client";

export const generationWorkflow = inngest.createFunction(
  {
    id: "generation-requested",
    triggers: { event: generationRequested },
    retries: 4,
  },
  async ({ event, step, runId }) => {
    const parsed = generationEventSchema.safeParse(event.data);
    if (!parsed.success)
      throw new NonRetriableError("INVALID_GENERATION_EVENT");
    const { generationJobId } = parsed.data;
    const claim = await step.run("claim-authoritative-job", async () => {
      dispatchLog("worker_received", generationJobId);
      const { data, error } = await createDatabaseClient().rpc(
        "claim_generation_job",
        { p_job_id: generationJobId, p_run_id: runId },
      );
      if (error) throw new Error("CLAIM_DATABASE_UNAVAILABLE");
      if (data === "missing" || data === "invalid")
        throw new NonRetriableError("GENERATION_UNAVAILABLE_OR_INVALID");
      if (!["claimed", "resumed", "duplicate", "terminal"].includes(data))
        throw new NonRetriableError("INVALID_CLAIM_RESULT");
      dispatchLog(`worker_${data}`, generationJobId);
      return data;
    });
    if (claim !== "claimed" && claim !== "resumed") return { claim };

    await step.run("start-media-analysis", () => advanceAnalysis(generationJobId, runId, "analyzing"));
    const attempt = (number: number) => step.run(`gemini-plan-attempt-${number}`, async () => {
      try { return await runAnalysisAttempt(generationJobId, runId, number); }
      catch (error) {
        if (error instanceof AnalysisError) return { ready: false, failure: error.code };
        throw new Error("ANALYSIS_STEP_UNAVAILABLE");
      }
    });
    let result = await attempt(1);
    if (!result.ready && ["RATE_LIMIT", "PROVIDER_UNAVAILABLE", "INVALID_OUTPUT"].includes(result.failure ?? "")) {
      await step.sleep("analysis-retry-backoff", "10s");
      result = await attempt(2);
    }
    if (result.ready) return { claim, handoff: "production_plan_ready" };
    await step.run("close-failed-analysis", async () => {
      const { error } = await createDatabaseClient().rpc(
        "fail_generation_claim",
        {
          p_job_id: generationJobId,
          p_run_id: runId,
        },
      );
      if (error) throw new Error("HANDOFF_DATABASE_UNAVAILABLE");
      dispatchLog("analysis_failed", generationJobId);
    });
    return { claim, handoff: "analysis_failed", reason: result.failure };
  },
);

export const generationRecovery = inngest.createFunction(
  {
    id: "generation-reconciliation",
    triggers: { cron: "* * * * *" },
    retries: 4,
    concurrency: 1,
  },
  async ({ step }) => {
    await step.run("expire-stale-claims", async () => {
      const { data, error } = await createDatabaseClient().rpc(
        "expire_generation_claims",
      );
      if (error) throw new Error("RECOVERY_DATABASE_UNAVAILABLE");
      console.info("Generation stale-claim reconciliation.", { expired: data });
    });
    const candidates = await step.run("load-dispatch-candidates", async () => {
      const { data, error } = await createDatabaseClient().rpc(
        "generation_dispatch_candidates",
      );
      if (error) throw new Error("RECOVERY_DATABASE_UNAVAILABLE");
      return data;
    });
    // All rows get a step even when an earlier send fails. Successful steps are
    // memoized; failed ones use Inngest's supported bounded retry machinery.
    await Promise.all(
      candidates.map(({ job_id }) =>
        step.run(`dispatch-${job_id}`, () => dispatchGeneration(job_id)),
      ),
    );
    return { inspected: candidates.length };
  },
);
