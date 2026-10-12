import "server-only";
import { NonRetriableError } from "inngest";
import { createDatabaseClient } from "@/lib/db/server";
import { generationEventSchema } from "@/lib/generation/dispatch-contract";
import { getVoiceConfiguration } from "@/lib/voice-ai/config";
import { requestNarration } from "@/lib/voice-ai/client";
import { inngest } from "./client";

export const narrationRequested = "sceenyk/generation.narration.requested";
async function finish(jobId: string, runId: string) {
  const result = await createDatabaseClient().rpc("finish_narration_generation", { p_job_id: jobId, p_run_id: runId });
  if (result.error) throw new Error("NARRATION_DATABASE_UNAVAILABLE");
  return result.data;
}
export const narrationWorkflow = inngest.createFunction({
  id: "generation-narration", triggers: { event: narrationRequested }, retries: 4,
  onFailure: async ({ event }) => {
    const parsed = generationEventSchema.safeParse(event.data.event.data);
    if (!parsed.success) return;
    const job = await createDatabaseClient().from("generation_jobs").select("narration_run_id").eq("id", parsed.data.generationJobId).maybeSingle();
    if (job.error) throw new Error("NARRATION_DATABASE_UNAVAILABLE");
    if (job.data?.narration_run_id) await finish(parsed.data.generationJobId, job.data.narration_run_id);
  },
}, async ({ event, step, runId }) => {
  const parsed = generationEventSchema.safeParse(event.data);
  if (!parsed.success) throw new NonRetriableError("INVALID_NARRATION_EVENT");
  const jobId = parsed.data.generationJobId;
  const claim = await step.run("prepare-narration", async () => {
    const db = createDatabaseClient();
    const job = await db.from("generation_jobs").select("input_snapshot").eq("id", jobId).maybeSingle();
    if (job.error) throw new Error("NARRATION_DATABASE_UNAVAILABLE");
    if (!job.data) return "invalid";
    const result = await db.rpc("claim_narration_generation", { p_job_id: jobId, p_run_id: runId, p_configuration: getVoiceConfiguration(job.data.input_snapshot.settings.tone) });
    if (result.error) throw new Error("NARRATION_DATABASE_UNAVAILABLE");
    return result.data;
  });
  if (!["claimed", "resumed"].includes(claim)) return { claim };
  const scenes = await step.run("load-narration-segments", async () => {
    const result = await createDatabaseClient().from("narration_segments").select("scene_execution_id,scene_order,status").eq("job_id", jobId).order("scene_order");
    if (result.error) throw new Error("NARRATION_DATABASE_UNAVAILABLE");
    return result.data;
  });
  for (const scene of scenes) {
    if (scene.status === "skipped") continue;
    await step.run(`narration-scene-${scene.scene_order}`, () => requestNarration(jobId, scene.scene_execution_id));
  }
  const handoff = await step.run("finish-narration-stage", () => finish(jobId, runId));
  return { claim, handoff };
});
