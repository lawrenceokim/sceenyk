import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { signR2Read } from "@/lib/storage/r2";

export async function readOwnedPreparedSegment(input: unknown) {
  const { projectId, sceneId } = z.strictObject({ projectId: z.uuid(), sceneId: z.uuid() }).parse(input);
  const user = await ensureAppUser();
  if (!user) throw new Error("PREPARED_MEDIA_UNAVAILABLE");
  const db = createDatabaseClient();
  const project = await db.from("projects").select("id").eq("id", projectId).eq("owner_user_id", user.id).maybeSingle();
  const scene = await db.from("scene_executions").select("prepared_asset_id").eq("id", sceneId).eq("project_id", projectId).eq("owner_user_id", user.id).maybeSingle();
  if (project.error || scene.error || !project.data || !scene.data?.prepared_asset_id) throw new Error("PREPARED_MEDIA_UNAVAILABLE");
  const result = await db.from("prepared_segments").select("*").eq("id", scene.data.prepared_asset_id).eq("owner_user_id", user.id).eq("project_id", projectId).eq("status", "completed").maybeSingle();
  const asset = result.data;
  if (result.error || !asset?.verified_etag) throw new Error("PREPARED_MEDIA_UNAVAILABLE");
  return { id: asset.id, sourceAssetId: asset.source_asset_id, startMs: asset.start_ms, endMs: asset.end_ms, durationMs: asset.duration_ms, width: asset.width, height: asset.height, ...await signR2Read(asset.storage_key, asset.verified_etag, asset.mime_type) };
}
