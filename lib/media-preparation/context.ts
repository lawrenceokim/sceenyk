import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { PreparationError } from "./contract";

export const preparationRequest = z.strictObject({ sceneId: z.uuid(), jobId: z.uuid(), runId: z.string().min(1).max(200) });
export async function loadPreparation(input: unknown) {
  const { sceneId, jobId, runId } = preparationRequest.parse(input), db = createDatabaseClient();
  const job = await db.from("generation_jobs").select("*").eq("id", jobId).eq("visual_run_id", runId).maybeSingle();
  if (job.error) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
  if (!job.data || job.data.status !== "processing" || job.data.current_stage !== "generating") throw new PreparationError("SOURCE_UNAVAILABLE");
  const j = job.data;
  const [project, reservation, scene, plan] = await Promise.all([
    db.from("projects").select("id").eq("id", j.project_id).eq("owner_user_id", j.owner_user_id).maybeSingle(),
    db.from("generation_reservations").select("state").eq("job_id", jobId).eq("owner_user_id", j.owner_user_id).eq("state", "reserved").maybeSingle(),
    db.from("scene_executions").select("*").eq("id", sceneId).eq("job_id", jobId).eq("owner_user_id", j.owner_user_id).eq("project_id", j.project_id).maybeSingle(),
    db.from("generation_plans").select("plan").eq("job_id", jobId).eq("owner_user_id", j.owner_user_id).maybeSingle(),
  ]);
  if ([project, reservation, scene, plan].some(r => r.error)) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
  if (!project.data || !reservation.data || !scene.data || !plan.data) throw new PreparationError("SOURCE_UNAVAILABLE");
  let s = scene.data;
  const source = s.input_asset_id ? await db.from("project_assets").select("*").eq("id", s.input_asset_id).eq("owner_user_id", j.owner_user_id).eq("project_id", j.project_id).eq("upload_status", "uploaded").maybeSingle() : null;
  if (source?.error) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
  const a = source?.data;
  const prefix = a ? `users/${j.owner_user_id}/projects/${j.project_id}/${a.id}/` : "";
  if (s.preparation_required && !s.provider_task_id && !["completed", "failed", "skipped"].includes(s.status) && (!a?.verified_etag || !j.input_snapshot.assetIds.includes(a.id) || !a.storage_key.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(a.storage_key.slice(prefix.length)))) {
    const failed = await db.rpc("record_visual_status", { p_scene_id: s.id, p_run_id: runId, p_status: "failed", p_credits: null, p_error: "SOURCE_UNAVAILABLE" });
    if (failed.error || !failed.data) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
    s = { ...s, status: "failed", error_code: "SOURCE_UNAVAILABLE" };
  }
  return { db, job: j, scene: s, source: a ?? null, plan: plan.data.plan, runId };
}
