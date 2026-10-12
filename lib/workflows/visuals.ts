import "server-only";
import { NonRetriableError } from "inngest";
import { createDatabaseClient } from "@/lib/db/server";
import { generationEventSchema } from "@/lib/generation/dispatch-contract";
import { prepareVisuals, submitVisualScene, pollVisualScene, pauseVisualScene } from "@/lib/video-ai/server";
import { getVisualConfiguration } from "@/lib/video-ai/config";
import { prepareVisualSource } from "@/lib/media-preparation/client";
import { inngest } from "./client";

export const visualsRequested = "sceenyk/generation.visuals.requested";
export const visualWorkflow = inngest.createFunction({
  id: "generation-visuals", triggers: { event: visualsRequested }, retries: 4,
  // Exhausted transport retries preserve task state and the customer hold.
  onFailure: async ({ event }) => {
    const parsed = generationEventSchema.safeParse(event.data.event.data);
    if (!parsed.success) return;
    const db = createDatabaseClient();
    const job = await db.from("generation_jobs").select("visual_run_id").eq("id", parsed.data.generationJobId).maybeSingle();
    if (job.error) throw new Error("VISUAL_DATABASE_UNAVAILABLE");
    if (job.data?.visual_run_id) {
      const result = await db.rpc("finish_visual_generation", { p_job_id: parsed.data.generationJobId, p_run_id: job.data.visual_run_id });
      if (result.error) throw new Error("VISUAL_PERSISTENCE_UNAVAILABLE");
    }
  },
}, async ({ event, step, runId }) => {
  const parsed = generationEventSchema.safeParse(event.data);
  if (!parsed.success) throw new NonRetriableError("INVALID_VISUAL_EVENT");
  const jobId = parsed.data.generationJobId;
  const claim = await step.run("claim-visual-generation", async () => {
    // Missing deployment credentials must not claim or strand a ready plan.
    getVisualConfiguration();
    const result = await createDatabaseClient().rpc("claim_visual_generation", { p_job_id: jobId, p_run_id: runId });
    if (result.error) throw new Error("VISUAL_DATABASE_UNAVAILABLE");
    return result.data;
  });
  if (!["claimed", "resumed"].includes(claim)) return { claim };
  const scenes = await step.run("prepare-owned-visual-scenes", () => prepareVisuals(jobId, runId));
  for (const scene of scenes) {
    const prepared = await step.run(`prepare-source-${scene.scene_order}`, () => prepareVisualSource(scene.id, jobId, runId));
    if (!prepared.ready) continue;
    const submitted = await step.run(`submit-scene-${scene.scene_order}`, () => submitVisualScene(scene.id, jobId, runId));
    if (!submitted.poll) continue;
    let done = false;
    for (let poll = 0; poll < getVisualConfiguration().pollLimit; poll++) {
      await step.sleep(`scene-${scene.scene_order}-wait-${poll}`, "10s");
      const result = await step.run(`scene-${scene.scene_order}-poll-${poll}`, () => pollVisualScene(scene.id, jobId, runId));
      if (result.done) { done = true; break; }
    }
    if (!done) await step.run(`pause-scene-${scene.scene_order}`, () => pauseVisualScene(scene.id, runId));
  }
  const handoff = await step.run("finish-visual-stage", async () => {
    const result = await createDatabaseClient().rpc("finish_visual_generation", { p_job_id: jobId, p_run_id: runId });
    if (result.error) throw new Error("VISUAL_PERSISTENCE_UNAVAILABLE");
    return result.data;
  });
  return { claim, handoff };
});
