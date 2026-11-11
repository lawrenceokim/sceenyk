import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { readOwnedAsset } from "@/lib/media/server";
import { readPrivate } from "@/lib/final-video-generation-v3/runtime-media";
import { projectMediaLifetimeMs, type ProjectMediaReply } from "./cached-media-contract";

export async function readOwnedProjectThumbnail(input: unknown): Promise<ProjectMediaReply> {
  const { projectId, assetId, version } = z.object({ projectId: z.uuid(), assetId: z.uuid(), version: z.string().max(100).optional() }).parse(input);
  const user = await ensureAppUser(), db = createDatabaseClient();
  const project = await db.from("projects").select("id").eq("id", projectId).eq("owner_user_id", user.id).is("deleted_at", null).maybeSingle();
  if (project.error || !project.data) return { state: "unavailable" };
  const result = await db.from("project_assets").select("*").eq("id", assetId).eq("project_id", projectId).eq("owner_user_id", user.id)
    .eq("upload_status", "uploaded").eq("removed_from_draft", false).maybeSingle();
  const asset = result.data;
  if (result.error || !asset?.verified_etag || !["image", "video"].includes(asset.media_type)) return { state: "unavailable" };
  const current = createHash("sha256").update(JSON.stringify(["projects-thumbnail-v1", asset.id, asset.verified_etag])).digest("hex");
  const reply = { state: "ready" as const, version: current, expiresAt: new Date(Date.now() + projectMediaLifetimeMs).toISOString() };
  // Preserve the existing static first-frame behavior for source-video thumbnails.
  const original = async () => ({ ...await readOwnedAsset({ projectId, assetId }), ...reply });
  if (asset.media_type === "video" || asset.size_bytes > 20 * 1024 * 1024) return original();
  if (version === current) return reply;
  const bytes = await readPrivate(asset.storage_key, asset.verified_etag, asset.size_bytes, AbortSignal.timeout(30_000));
  let thumbnail: Buffer;
  try { thumbnail = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(); }
  catch { return original(); }
  if (thumbnail.length > 2 * 1024 * 1024) throw new Error("PROJECT_THUMBNAIL_SIZE");
  return { ...reply, bytes: thumbnail, mimeType: "image/webp" };
}
