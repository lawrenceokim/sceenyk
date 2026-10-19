import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { inspectR2Object, signR2Read } from "@/lib/storage/r2";

export async function readOwnedNarration(input: unknown) {
  const { projectId, sceneId } = z.strictObject({ projectId: z.uuid(), sceneId: z.uuid() }).parse(input);
  const user = await ensureAppUser();
  if (!user) throw new Error("NARRATION_UNAVAILABLE");
  const db = createDatabaseClient();
  const project = await db.from("projects").select("id").eq("id", projectId).eq("owner_user_id", user.id).eq("status", "draft").maybeSingle();
  const narration = await db.from("narration_segments").select("id,job_id,scene_order,output_asset_id,expected_duration_ms,timing_mismatch").eq("scene_execution_id", sceneId).eq("project_id", projectId).eq("owner_user_id", user.id).eq("status", "completed").maybeSingle();
  if (project.error || narration.error || !project.data || !narration.data?.output_asset_id) throw new Error("NARRATION_UNAVAILABLE");
  const result = await db.from("narration_assets").select("*").eq("id", narration.data.output_asset_id).eq("narration_segment_id", narration.data.id).eq("job_id", narration.data.job_id).eq("owner_user_id", user.id).eq("project_id", projectId).maybeSingle();
  const asset = result.data;
  if (result.error || !asset || asset.storage_key !== `users/${user.id}/projects/${projectId}/generations/${asset.job_id}/narration/${asset.narration_segment_id}.mp3`) throw new Error("NARRATION_UNAVAILABLE");
  const stored = await inspectR2Object(asset.storage_key);
  if (!stored || stored.etag !== asset.verified_etag || stored.sizeBytes !== asset.size_bytes || stored.mimeType !== asset.mime_type) throw new Error("NARRATION_UNAVAILABLE");
  return { id: narration.data.id, sceneId, sceneIndex: narration.data.scene_order, expectedDurationMs: narration.data.expected_duration_ms, actualDurationMs: asset.duration_ms, timingMismatch: narration.data.timing_mismatch, mimeType: asset.mime_type, ...await signR2Read(asset.storage_key, asset.verified_etag, asset.mime_type) };
}
