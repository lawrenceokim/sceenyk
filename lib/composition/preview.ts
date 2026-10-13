import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { compositionPlanSchema } from "./contract";
import { signR2Read } from "@/lib/storage/r2";

const inputSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid(), sceneId: z.uuid() });
const assetSchema = z.strictObject({
  kind: z.enum(["scene_asset", "prepared_segment", "project_asset"]), id: z.uuid(),
  storage_key: z.string().min(1), verified_etag: z.string().min(1),
  mime_type: z.string().regex(/^(video\/(mp4|webm|quicktime)|image\/(png|jpeg|webp))$/),
  size_bytes: z.number().int().positive(), duration_ms: z.number().int().positive().nullable(),
  is_static: z.boolean(),
});

export async function readOwnedScenePreview(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return null;
  const { projectId, jobId, sceneId } = parsed.data;
  const user = await ensureAppUser(), db = createDatabaseClient();
  const [project, job, result] = await Promise.all([
    db.from("projects").select("id").eq("id", projectId).eq("owner_user_id", user.id).maybeSingle(),
    db.from("generation_jobs").select("id,composition_ready_at").eq("id", jobId).eq("project_id", projectId).eq("owner_user_id", user.id).maybeSingle(),
    db.from("composition_plans").select("plan").eq("job_id", jobId).eq("project_id", projectId).eq("owner_user_id", user.id).eq("status", "ready").maybeSingle(),
  ]);
  if (project.error || job.error || result.error) throw new Error("SCENE_PREVIEW_UNAVAILABLE");
  if (!project.data || !job.data?.composition_ready_at || !result.data) return null;
  const plan = compositionPlanSchema.parse(result.data.plan);
  if (plan.status !== "ready" || plan.generation_job_id !== jobId) return null;
  const scene = plan.scenes.find(item => item.scene_execution_id === sceneId);
  if (!scene?.visual) return null;
  // The plan is immutable; the RPC resolves the current persisted execution's
  // exact visual without accepting an asset ID or storage key from the browser.
  const resolved = await db.rpc("composition_asset_ref", { p_scene_id: sceneId, p_track: "visual" });
  if (resolved.error) throw new Error("SCENE_PREVIEW_UNAVAILABLE");
  const asset = assetSchema.safeParse(resolved.data);
  if (!asset.success || asset.data.id !== scene.visual.asset_id || asset.data.kind !== scene.visual.asset_kind ||
    asset.data.is_static !== (scene.visual.media_type === "image") ||
    !asset.data.storage_key.startsWith(`users/${user.id}/projects/${projectId}/`)) return null;
  const check = await db.from("composition_asset_checks").select("verified_etag,issue")
    .eq("asset_kind", asset.data.kind).eq("asset_id", asset.data.id)
    .eq("owner_user_id", user.id).eq("project_id", projectId).maybeSingle();
  if (check.error) throw new Error("SCENE_PREVIEW_UNAVAILABLE");
  if (!check.data || check.data.issue || check.data.verified_etag !== asset.data.verified_etag) return null;
  const signed = await signR2Read(asset.data.storage_key, asset.data.verified_etag, asset.data.mime_type);
  return { sceneId, mediaType: scene.visual.media_type, url: signed.url, expiresAt: signed.expiresAt };
}
