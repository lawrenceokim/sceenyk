import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDatabaseClient } from "@/lib/db/server";
import { resolveApprovedProjectVideo } from "@/lib/projects/approved-video";
import { previewJobSchema, projectPreviewKey } from "@/lib/projects/video-preview-contract";
import { projectMediaLifetimeMs, type ProjectMediaReply } from "@/lib/projects/cached-media-contract";
import { readPrivate } from "@/lib/final-video-generation-v3/runtime-media";
import { readR2AnalysisMedia } from "@/lib/storage/r2";

const bindingSchema = z.object({ id: z.uuid(), creator_user_id: z.uuid(), source_project_id: z.uuid(), updated_at: z.string(), preview_etag: z.string().nullable() });

export async function readMarketplacePoster(listingId: string, knownVersion?: string): Promise<ProjectMediaReply> {
  z.uuid().parse(listingId);
  const result = await createDatabaseClient().rpc("marketplace_template_preview", { p_listing_id: listingId, p_owner_user_id: null });
  if (result.error) throw new Error("MARKETPLACE_PREVIEW_UNAVAILABLE");
  if (!result.data) return { state: "unavailable" };
  const poster = z.object({ key: z.string().regex(new RegExp(`^marketplace-previews/${listingId}/[a-f0-9-]{36}\\.webp$`)), etag: z.string().min(1), size: z.number().int().min(1).max(524288) }).parse(result.data);
  const version = createHash("sha256").update(JSON.stringify(poster.etag)).digest("hex");
  const reply = { state: "ready" as const, version, expiresAt: new Date(Date.now() + projectMediaLifetimeMs).toISOString() };
  if (version === knownVersion) return reply;
  const stream = await readR2AnalysisMedia(poster.key, poster.etag, poster.size, AbortSignal.timeout(15_000));
  return { ...reply, mimeType: "image/webp", bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

// Browser input is a public listing ID only. Resolve private lineage on the
// server, with no owner override and no access to drafts, archives or tombstones.
export async function publishedVideoBindings(ids: string[]) {
  if (!ids.length) return [];
  const db = createDatabaseClient() as unknown as SupabaseClient;
  const result = await db.from("marketplace_listings")
    .select("id,creator_user_id,source_project_id,updated_at,preview_etag")
    .in("id", ids).eq("status", "published").is("deleted_at", null).not("rights_confirmed_at", "is", null);
  if (result.error) throw new Error("MARKETPLACE_PREVIEW_UNAVAILABLE");
  return z.array(bindingSchema).parse(result.data);
}

export async function readMarketplaceVideoPreview(listingId: string, knownVersion?: string): Promise<ProjectMediaReply> {
  z.uuid().parse(listingId);
  const binding = (await publishedVideoBindings([listingId]))[0];
  if (!binding) return { state: "unavailable" };
  const video = await resolveApprovedProjectVideo(binding.creator_user_id, binding.source_project_id);
  if (!video) return { state: "unavailable" };
  // This is the same deduplicated derivative queue and the same FFmpeg worker
  // used by Projects. Originals and signed storage capabilities never leave here.
  const result = await createDatabaseClient().rpc("project_video_preview_request", {
    p_owner: binding.creator_user_id, p_project: binding.source_project_id, p_version: video.version,
  });
  if (result.error) throw new Error("MARKETPLACE_PREVIEW_UNAVAILABLE");
  const job = previewJobSchema.parse(result.data);
  if (job.owner_user_id !== binding.creator_user_id || job.project_id !== binding.source_project_id || job.version !== video.version)
    throw new Error("MARKETPLACE_PREVIEW_SCOPE");
  if (job.state === "failed") return { state: "unavailable" };
  if (job.state !== "ready" || !job.etag || !job.size_bytes) return { state: "pending" };
  const reply = { state: "ready" as const, version: job.version, expiresAt: new Date(Date.now() + projectMediaLifetimeMs).toISOString() };
  if (knownVersion === job.version) return reply;
  if (job.size_bytes > 2 * 1024 * 1024) throw new Error("MARKETPLACE_PREVIEW_SIZE");
  const bytes = await readPrivate(projectPreviewKey(job), job.etag, job.size_bytes, AbortSignal.timeout(30_000));
  const current = (await publishedVideoBindings([listingId]))[0];
  if (!current || current.updated_at !== binding.updated_at || current.source_project_id !== binding.source_project_id || current.creator_user_id !== binding.creator_user_id)
    return { state: "unavailable" };
  return { ...reply, mimeType: "video/mp4", bytes };
}
