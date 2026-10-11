import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { generationInputsSchema } from "@/lib/generation/validation";
import { readR2AnalysisMedia } from "@/lib/storage/r2";
import { getAnalysisConfiguration } from "./config";
import { supportsAnalysisMedia, understandAndPlan } from "./providers/gemini";
import { validateProductionPlan } from "./plan";
import { AnalysisError, type AnalysisFailure, type AnalysisMedia } from "./types";

export async function advanceAnalysis(jobId: string, runId: string, stage: "analyzing" | "planning") {
  const { data, error } = await createDatabaseClient().rpc("advance_generation_analysis", { p_job_id: jobId, p_run_id: runId, p_stage: stage });
  if (error || !data) throw new Error("ANALYSIS_STAGE_UNAVAILABLE");
}
async function loadAnalysis(jobId: string, runId: string) {
  const db = createDatabaseClient();
  const { data: job, error } = await db.from("generation_jobs").select("*").eq("id", jobId).eq("worker_run_id", runId).maybeSingle();
  if (error) throw new Error("ANALYSIS_DATABASE_UNAVAILABLE");
  if (!job || job.status !== "processing" || !["analyzing", "planning"].includes(job.current_stage ?? "")) throw new AnalysisError("MEDIA_UNAVAILABLE");
  const input = { ...generationInputsSchema.parse(({ prompt: job.input_snapshot.prompt, category: job.input_snapshot.category, settings: job.input_snapshot.settings, assetIds: job.input_snapshot.assetIds })), version: 1 as const };
  const [project, reservation, user, saved] = await Promise.all([
    db.from("projects").select("id").eq("id", job.project_id).eq("owner_user_id", job.owner_user_id).maybeSingle(),
    db.from("generation_reservations").select("state").eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).eq("state", "reserved").maybeSingle(),
    db.from("app_users").select("id").eq("id", job.owner_user_id).maybeSingle(),
    db.from("generation_plans").select("plan").eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).maybeSingle(),
  ]);
  if ([project, reservation, user, saved].some(r => r.error)) throw new Error("ANALYSIS_DATABASE_UNAVAILABLE");
  if (!project.data || !reservation.data || !user.data) throw new AnalysisError("MEDIA_UNAVAILABLE");
  let media: AnalysisMedia[] = [];
  if (input.assetIds.length) {
    const assets = await db.from("project_assets").select("*").eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).eq("upload_status", "uploaded").in("id", input.assetIds);
    if (assets.error) throw new Error("ANALYSIS_DATABASE_UNAVAILABLE");
    if (!assets.data || assets.data.length !== input.assetIds.length) throw new AnalysisError("MEDIA_UNAVAILABLE");
    media = assets.data.map(asset => {
      const prefix = `users/${job.owner_user_id}/projects/${job.project_id}/${asset.id}/`;
      if (!asset.verified_etag || !asset.storage_key.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(asset.storage_key.slice(prefix.length))) throw new AnalysisError("MEDIA_UNAVAILABLE");
      const etag = asset.verified_etag;
      return { id: asset.id, mimeType: asset.mime_type, sizeBytes: asset.size_bytes, read: (signal: AbortSignal) => readR2AnalysisMedia(asset.storage_key, etag, asset.size_bytes, signal) };
    }).sort((a, b) => a.id.localeCompare(b.id));
  }
  if (saved.data) {
    validateProductionPlan(saved.data.plan, input, media);
    return { ready: true as const, input, media };
  }
  const config = getAnalysisConfiguration();
  if (media.length > config.maximumMediaCount || media.reduce((sum, m) => sum + m.sizeBytes, 0) > config.maximumMediaBytes || media.some(m => !supportsAnalysisMedia(m.mimeType))) throw new AnalysisError("UNSUPPORTED_MEDIA");
  return { ready: false as const, input, media };
}

// One durable provider attempt per numbered slot. A crash after beginning a
// request is uncertain: never automatically buy the same analysis again.
export async function runAnalysisAttempt(jobId: string, runId: string, attempt: number): Promise<{ ready: boolean; failure: AnalysisFailure | null }> {
  const loaded = await loadAnalysis(jobId, runId);
  if (loaded.ready) return { ready: true, failure: null };
  const config = getAnalysisConfiguration();
  const db = createDatabaseClient();
  const begun = await db.rpc("begin_generation_analysis", { p_job_id: jobId, p_run_id: runId, p_attempt: attempt, p_model: config.model });
  if (begun.error || !begun.data) throw new Error("ANALYSIS_DATABASE_UNAVAILABLE");
  if (begun.data.code === "READY") return { ready: true, failure: null };
  if (begun.data.code !== "STARTED" || !begun.data.attempt_id) {
    // An already returned invalid/failed attempt can be memoized by Inngest;
    // a lost step response is recovered from persisted safe attempt metadata.
    const previous = await db.from("generation_analysis_attempts").select("failure_code,state,started_at").eq("job_id", jobId).eq("attempt", attempt).eq("worker_run_id", runId).maybeSingle();
    if (previous.error) throw new Error("ANALYSIS_DATABASE_UNAVAILABLE");
    // A concurrent copy must not fail a still-running original request. After
    // the provider's four-minute deadline + cleanup margin it is uncertain.
    if (previous.data?.state === "started" && Date.parse(previous.data.started_at) > Date.now() - 300_000) throw new Error("ANALYSIS_ATTEMPT_PENDING");
    const failure = previous.data?.state === "started" || !previous.data?.failure_code ? "UNCERTAIN_ATTEMPT" : previous.data.failure_code as AnalysisFailure;
    return { ready: false, failure };
  }
  const attemptId = begun.data.attempt_id;
  let result;
  try {
    result = await understandAndPlan({ input: loaded.input, media: loaded.media, retry: attempt > 1, model: config.model, onMediaReady: () => advanceAnalysis(jobId, runId, "planning") });
  } catch (error) {
    const failure = error instanceof AnalysisError ? error.code : "PROVIDER_UNAVAILABLE";
    const recorded = await db.rpc("finish_generation_analysis", { p_job_id: jobId, p_run_id: runId, p_attempt_id: attemptId, p_plan: null, p_usage: null, p_model: config.model, p_response_id: null, p_failure: failure });
    if (recorded.error || !recorded.data) throw new Error("ANALYSIS_DATABASE_UNAVAILABLE");
    return { ready: false, failure };
  }
  const saved = await db.rpc("finish_generation_analysis", { p_job_id: jobId, p_run_id: runId, p_attempt_id: attemptId, p_plan: result.plan, p_usage: result.usage, p_model: result.model, p_response_id: result.responseId, p_failure: result.failure });
  if (saved.error || !saved.data) throw new Error("ANALYSIS_PERSISTENCE_UNAVAILABLE");
  return { ready: result.plan !== null, failure: result.failure };
}
