import "server-only";
import { NonRetriableError } from "inngest";
import { createDatabaseClient } from "@/lib/db/server";
import { generationEventSchema } from "@/lib/generation/dispatch-contract";
import { compositionConfiguration } from "@/lib/composition/contract";
import { requestCompositionInspection } from "@/lib/composition/client";
import { inngest } from "./client";

export const compositionRequested = "sceenyk/generation.composition.requested";
async function finish(jobId: string, runId: string) {
  const result = await createDatabaseClient().rpc("finish_composition_generation", { p_job_id: jobId, p_run_id: runId });
  if (result.error) throw new Error("COMPOSITION_DATABASE_UNAVAILABLE");
  return result.data;
}
export const compositionWorkflow = inngest.createFunction({
  id: "generation-composition", triggers: { event: compositionRequested }, retries: 4,
  onFailure: async ({ event }) => {
    const parsed = generationEventSchema.safeParse(event.data.event.data);
    if (!parsed.success) return;
    // Exhausted technical retries become explicit unchecked-media conflicts,
    // preserving every output and the hold rather than terminally failing.
    // The failed run must own the claim. A failing duplicate must not close
    // another run that is still checking media.
    await finish(parsed.data.generationJobId, event.data.run_id);
  },
}, async ({ event, step, runId }) => {
  const parsed = generationEventSchema.safeParse(event.data);
  if (!parsed.success) throw new NonRetriableError("INVALID_COMPOSITION_EVENT");
  const jobId = parsed.data.generationJobId;
  const claim = await step.run("claim-composition", async () => {
    const result = await createDatabaseClient().rpc("claim_composition_generation", { p_job_id: jobId, p_run_id: runId, p_configuration: compositionConfiguration });
    if (result.error) throw new Error("COMPOSITION_DATABASE_UNAVAILABLE");
    return result.data;
  });
  if (!["claimed", "resumed"].includes(claim)) return { claim };
  const scenes = await step.run("load-composition-scenes", async () => {
    const result = await createDatabaseClient().from("scene_executions").select("id,scene_order").eq("job_id", jobId).order("scene_order");
    if (result.error) throw new Error("COMPOSITION_DATABASE_UNAVAILABLE");
    return result.data;
  });
  for (const scene of scenes) await step.run(`inspect-scene-${scene.scene_order}`, () => requestCompositionInspection(jobId, scene.id));
  const handoff = await step.run("persist-composition", () => finish(jobId, runId));
  return { claim, handoff };
});
