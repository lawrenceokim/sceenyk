import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { validateProductionPlan } from "@/lib/ai/plan";
import { inspectR2Object, signR2Read } from "@/lib/storage/r2";
import { mapVisualScenes } from "./mapping";
import { VisualError } from "./contract";
import { generateScene, transformScene, getTaskStatus } from "./provider";
import { persistSceneOutput } from "./storage";

async function load(jobId: string, runId: string) {
  const db = createDatabaseClient();
  const job = await db.from("generation_jobs").select("*").eq("id", jobId).eq("visual_run_id", runId).maybeSingle();
  if (job.error) throw new Error("VISUAL_DATABASE_UNAVAILABLE");
  if (!job.data || job.data.status !== "processing" || job.data.current_stage !== "generating") throw new VisualError("JOB_UNAVAILABLE");
  const j = job.data;
  const [project, reservation, plan, assets, analysis] = await Promise.all([
    db.from("projects").select("id").eq("id", j.project_id).eq("owner_user_id", j.owner_user_id).maybeSingle(),
    db.from("generation_reservations").select("state").eq("job_id", j.id).eq("owner_user_id", j.owner_user_id).eq("state", "reserved").maybeSingle(),
    db.from("generation_plans").select("plan").eq("job_id", j.id).eq("owner_user_id", j.owner_user_id).maybeSingle(),
    db.from("project_assets").select("*").eq("project_id", j.project_id).eq("owner_user_id", j.owner_user_id).eq("upload_status", "uploaded"),
    db.from("generation_analysis_attempts").select("usage").eq("job_id", j.id).eq("owner_user_id", j.owner_user_id).eq("state", "succeeded").maybeSingle(),
  ]);
  if ([project, reservation, plan, assets, analysis].some(r => r.error)) throw new Error("VISUAL_DATABASE_UNAVAILABLE");
  const inputs = (assets.data ?? []).filter(a => j.input_snapshot.assetIds.includes(a.id));
  if (!project.data || !reservation.data || !plan.data || inputs.length !== j.input_snapshot.assetIds.length) throw new VisualError("MEDIA_UNAVAILABLE");
  for (const asset of inputs) {
    const prefix = `users/${j.owner_user_id}/projects/${j.project_id}/${asset.id}/`;
    if (!asset.verified_etag || !asset.storage_key.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(asset.storage_key.slice(prefix.length))) throw new VisualError("MEDIA_UNAVAILABLE");
  }
  const savedPlan = plan.data.plan;
  // Actual Files API observations, not Gemini's creative summary, bound paid
  // whole-video work. Missing measured duration makes transformations pending.
  const media = inputs.map(a => ({ id: a.id, mimeType: a.mime_type, sizeBytes: a.size_bytes, durationSeconds: analysis.data?.usage?.media?.find(m => m.assetId === a.id)?.durationSeconds ?? null }));
  return { job: j, inputs, media, plan: validateProductionPlan(savedPlan, j.input_snapshot, media) };
}
export async function prepareVisuals(jobId: string, runId: string) {
  const loaded = await load(jobId, runId);
  const db = createDatabaseClient();
  const saved = await db.rpc("prepare_visual_scenes", { p_job_id: jobId, p_run_id: runId, p_scenes: mapVisualScenes(loaded.plan, loaded.media) });
  if (saved.error || !saved.data) throw new Error("VISUAL_PERSISTENCE_UNAVAILABLE");
  const scenes = await db.from("scene_executions").select("id,scene_order").eq("job_id", jobId).eq("owner_user_id", loaded.job.owner_user_id).order("scene_order");
  if (scenes.error) throw new Error("VISUAL_DATABASE_UNAVAILABLE");
  return scenes.data;
}
async function sceneContext(sceneId: string, jobId: string, runId: string) {
  const loaded = await load(jobId, runId);
  const result = await createDatabaseClient().from("scene_executions").select("*").eq("id", sceneId).eq("job_id", jobId).eq("owner_user_id", loaded.job.owner_user_id).eq("project_id", loaded.job.project_id).maybeSingle();
  if (result.error) throw new Error("VISUAL_DATABASE_UNAVAILABLE");
  if (!result.data) throw new VisualError("SCENE_UNAVAILABLE");
  return { ...loaded, scene: result.data };
}
async function status(sceneId: string, runId: string, state: string, credits: number | null, error: string | null) {
  const result = await createDatabaseClient().rpc("record_visual_status", { p_scene_id: sceneId, p_run_id: runId, p_status: state, p_credits: credits, p_error: error });
  if (result.error || !result.data) throw new Error("VISUAL_PERSISTENCE_UNAVAILABLE");
}
export async function submitVisualScene(sceneId: string, jobId: string, runId: string) {
  const { scene, inputs, plan, media } = await sceneContext(sceneId, jobId, runId);
  if (!["completed", "failed", "skipped"].includes(scene.status) && scene.provider === "runway") {
    await status(scene.id, runId, "pending", null, "PROVIDER_INACTIVE"); return { poll: false };
  }
  if (scene.status === "completed" || scene.status === "failed" || scene.status === "skipped" || scene.provider_task_id) return { poll: !!scene.provider_task_id && scene.status !== "completed" && scene.status !== "failed" };
  if (scene.error_code && scene.error_code !== "RATE_LIMIT") return { poll: false };
  if (scene.submission_attempts >= 3 && !scene.provider_task_id) return { poll: false };
  // Recheck current guards immediately before spending; never silently change
  // the persisted operation/model to satisfy a configuration change.
  const current = mapVisualScenes(plan, media).find(s => s.scene_order === scene.scene_order);
  if (!current || current.error_code || current.model !== scene.model || Object.entries(current.pricing_snapshot).some(([key, value]) => value !== scene.pricing_snapshot[key])) {
    await status(scene.id, runId, "pending", null, current?.error_code ?? "CONFIGURATION_CHANGED"); return { poll: false };
  }
  if (scene.submission_started_at) {
    await status(scene.id, runId, "pending", null, "UNCERTAIN_SUBMISSION"); return { poll: false };
  }
  let inputUri: string | undefined;
  if (scene.input_asset_id) {
    const asset = inputs.find(a => a.id === scene.input_asset_id);
    if (!asset?.verified_etag) throw new VisualError("MEDIA_UNAVAILABLE");
    const stored = await inspectR2Object(asset.storage_key);
    if (!stored || stored.etag !== asset.verified_etag || stored.sizeBytes !== asset.size_bytes || stored.mimeType !== asset.mime_type) {
      await status(scene.id, runId, "failed", null, "MEDIA_UNAVAILABLE"); return { poll: false };
    }
    // Existing signed read lifetime is 15 minutes. Queue start is bounded at
    // three minutes; no temporary URL is persisted or returned by a step.
    inputUri = (await signR2Read(asset.storage_key, asset.verified_etag, asset.mime_type)).url;
  }
  const db = createDatabaseClient();
  const begun = await db.rpc("begin_visual_submission", { p_scene_id: scene.id, p_run_id: runId });
  if (begun.error) throw new Error("VISUAL_DATABASE_UNAVAILABLE");
  if (!begun.data) return { poll: false };
  try {
    if (scene.operation === "video_to_video" && !inputUri) throw new VisualError("MEDIA_UNAVAILABLE");
    const task = scene.operation === "video_to_video" && inputUri ? await transformScene(scene, inputUri) : await generateScene(scene, inputUri);
    const saved = await db.rpc("record_visual_task", { p_scene_id: scene.id, p_run_id: runId, p_task_id: task.taskId, p_estimated_credits: task.estimatedCredits });
    if (saved.error || !saved.data) throw new Error("VISUAL_PERSISTENCE_UNAVAILABLE");
    return { poll: true };
  } catch (error) {
    if (!(error instanceof VisualError)) throw error;
    if (error.code === "RATE_LIMIT") {
      const reset = await db.rpc("retry_rejected_visual_submission", { p_scene_id: scene.id, p_run_id: runId });
      if (reset.error || !reset.data) throw new Error("VISUAL_PERSISTENCE_UNAVAILABLE");
      // The durable submission step retries with a fresh short-lived upload;
      // the persistent attempt counter bounds explicit rejected requests.
      throw new Error("VISUAL_RATE_LIMIT");
    }
    await status(scene.id, runId, error.code === "PROVIDER_REJECTED" ? "failed" : "pending", null, error.code);
    return { poll: false };
  }
}
export async function pollVisualScene(sceneId: string, jobId: string, runId: string): Promise<{ done: boolean }> {
  const { scene } = await sceneContext(sceneId, jobId, runId);
  if (["completed", "failed", "skipped"].includes(scene.status)) return { done: true };
  if (!scene.provider_task_id) return { done: true };
  let task;
  try { task = await getTaskStatus(scene); }
  catch {
    await status(scene.id, runId, "processing", null, "PROVIDER_UNAVAILABLE");
    throw new Error("VISUAL_POLL_UNAVAILABLE");
  }
  if (task.status === "FAILED" || task.status === "CANCELLED") {
    await status(scene.id, runId, "failed", task.credits, "PROVIDER_FAILED"); return { done: true };
  }
  if (task.usage) {
    const u = task.usage;
    const rate = Number(scene.pricing_snapshot.unitPrice);
    const measured = scene.operation === "video_to_video" ? !!(u.width && u.height && u.numFrames) : !!u.outputDuration;
    const estimate = measured ? (scene.operation === "video_to_video" ? Math.ceil(u.width! * u.height! * u.numFrames! / 1e6) : u.outputDuration!) * rate : scene.estimated_cost_usd;
    const saved = await createDatabaseClient().rpc("record_visual_usage", { p_scene_id: scene.id, p_run_id: runId, p_usage: { ...u, costBasis: measured ? "output_estimate" : "request_estimate" }, p_estimated_usd: estimate });
    if (saved.error || !saved.data) throw new Error("VISUAL_USAGE_UNAVAILABLE");
  }
  await status(scene.id, runId, "processing", task.credits, null);
  if (task.status !== "SUCCEEDED") return { done: false };
  // Download and storage remain inside this step. Its result is capability-free.
  let output;
  try {
    if (!task.outputUrl) throw new VisualError("INVALID_OUTPUT");
    output = await persistSceneOutput(scene, task.outputUrl);
  }
  catch (error) {
    await status(scene.id, runId, "processing", task.credits, error instanceof VisualError ? error.code : "OUTPUT_PERSISTENCE_FAILED");
    throw new Error("VISUAL_OUTPUT_UNAVAILABLE");
  }
  const result = await createDatabaseClient().rpc("complete_visual_scene", { p_scene_id: scene.id, p_run_id: runId, p_size_bytes: output.sizeBytes, p_etag: output.etag });
  if (result.error || !result.data) throw new Error("VISUAL_PERSISTENCE_UNAVAILABLE");
  return { done: true };
}
export async function pauseVisualScene(sceneId: string, runId: string) {
  await status(sceneId, runId, "pending", null, "PROVIDER_TIMEOUT");
}
