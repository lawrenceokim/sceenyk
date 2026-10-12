import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { productionPlanSchema } from "@/lib/ai/plan";
import { voiceCredential, estimateNarrationCost } from "./config";
import { VoiceError } from "./contract";
import { generateNarration } from "./provider";
import { persistNarration, recoverNarration } from "./storage";

export const narrationWorkerRequest = z.strictObject({ generationJobId: z.uuid(), sceneExecutionId: z.uuid() });
async function loadNarration(input: unknown) {
  const { generationJobId, sceneExecutionId } = narrationWorkerRequest.parse(input), db = createDatabaseClient();
  const jobResult = await db.from("generation_jobs").select("*").eq("id", generationJobId).maybeSingle();
  const job = jobResult.data;
  if (jobResult.error) throw new VoiceError("DATABASE_UNAVAILABLE", true);
  if (!job || job.status !== "processing" || job.current_stage !== "voice" || !job.narration_run_id || !job.visuals_ready_at) throw new VoiceError("JOB_UNAVAILABLE");
  const [project, reservation, savedPlan, scene, narration] = await Promise.all([
    db.from("projects").select("id").eq("id", job.project_id).eq("owner_user_id", job.owner_user_id).maybeSingle(),
    db.from("generation_reservations").select("state").eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).eq("state", "reserved").maybeSingle(),
    db.from("generation_plans").select("plan").eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).maybeSingle(),
    db.from("scene_executions").select("id,status").eq("id", sceneExecutionId).eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle(),
    db.from("narration_segments").select("*").eq("scene_execution_id", sceneExecutionId).eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle(),
  ]);
  if ([project, reservation, savedPlan, scene, narration].some(r => r.error)) throw new VoiceError("DATABASE_UNAVAILABLE", true);
  if (!project.data || !reservation.data || !savedPlan.data || !scene.data || !narration.data || !["completed", "skipped"].includes(scene.data.status)) throw new VoiceError("NARRATION_UNAVAILABLE");
  const plan = productionPlanSchema.parse(savedPlan.data.plan), segment = narration.data;
  const planned = plan.scenePlan[segment.scene_order - 1];
  if (!planned || planned.order !== segment.scene_order || planned.narration !== segment.text || Math.round(planned.durationSeconds * 1000) !== segment.expected_duration_ms || segment.voice_id !== segment.configuration.voiceId || segment.model_id !== segment.configuration.modelId) throw new VoiceError("PLAN_MISMATCH");
  return { db, job, segment };
}
export async function executeNarration(input: unknown): Promise<{ ready: boolean }> {
  const { db, job, segment } = await loadNarration(input), runId = job.narration_run_id!;
  if (segment.status === "skipped") return { ready: true };
  if (segment.status === "failed") return { ready: false };
  const errorState = async (code: string, permanent = false, rejected = false) => {
    const result = await db.rpc("record_narration_error", { p_segment_id: segment.id, p_run_id: runId, p_error: code, p_permanent: permanent, p_rejected: rejected });
    if (result.error) throw new VoiceError("DATABASE_UNAVAILABLE", true);
  };
  try {
    const recovered = await recoverNarration(segment);
    if (recovered) {
      const done = await db.rpc("complete_narration_segment", { p_segment_id: segment.id, p_run_id: runId, p_metadata: recovered });
      if (done.error || !done.data) throw new VoiceError("DATABASE_UNAVAILABLE", true);
      return { ready: true };
    }
    if (segment.status === "completed") throw new VoiceError("STORED_AUDIO_MISSING");
    if (segment.submission_started_at) { await errorState("UNCERTAIN_SUBMISSION"); return { ready: false }; }
    if (segment.error_code && !["RATE_LIMIT", "MISSING_CREDENTIAL", "DATABASE_UNAVAILABLE", "OUTPUT_RECOVERY_REQUIRED", "DURATION_PROBE_FAILED"].includes(segment.error_code)) return { ready: false };
    voiceCredential(); // Before claiming a paid slot. Skipped/recovered audio needs no key.
    const begun = await db.rpc("begin_narration_submission", { p_segment_id: segment.id, p_run_id: runId });
    if (begun.error) throw new VoiceError("DATABASE_UNAVAILABLE", true);
    if (!begun.data) return { ready: false };
    const estimate = estimateNarrationCost(segment.text!, segment.configuration);
    const bytes = await generateNarration(segment.text!, segment.configuration, async metadata => {
      const result = await db.rpc("record_narration_response", { p_segment_id: segment.id, p_run_id: runId, p_request_id: metadata.requestId, p_usage: { ...estimate, ...metadata.usage, model: segment.model_id, voice: segment.voice_id, provider: segment.voice_provider } });
      if (result.error || !result.data) throw new VoiceError("DATABASE_UNAVAILABLE", true);
    });
    const output = await persistNarration(segment, bytes);
    const completed = await db.rpc("complete_narration_segment", { p_segment_id: segment.id, p_run_id: runId, p_metadata: output });
    if (completed.error || !completed.data) throw new VoiceError("DATABASE_UNAVAILABLE", true);
    return { ready: true };
  } catch (error) {
    const failure = error instanceof VoiceError ? error : new VoiceError("OUTPUT_RECOVERY_REQUIRED", true);
    const permanent = ["AUTH_REJECTED", "QUOTA_EXHAUSTED", "INVALID_VOICE_OR_MODEL", "INVALID_AUDIO", "INVALID_STORED_AUDIO", "STORED_AUDIO_MISSING"].includes(failure.code);
    await errorState(failure.code, permanent, failure.code === "RATE_LIMIT");
    if (failure.retryable || failure.code === "MISSING_CREDENTIAL") throw new VoiceError(failure.code, true);
    return { ready: false };
  }
}
