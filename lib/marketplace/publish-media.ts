import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { resolveApprovedProjectVideo } from "@/lib/projects/approved-video";
import { previewJobSchema, projectPreviewKey } from "@/lib/projects/video-preview-contract";
import { headR2CharacterObject } from "@/lib/storage/r2";

export const publishMediaVariant = z.enum(["preview", "final", "source"]);
export type PublishMediaVariant = z.infer<typeof publishMediaVariant>;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Listing ownership is resolved on every read. Never accept an owner, object
// key, signed URL or arbitrary project/asset ID from the publishing browser.
export async function resolveTemplatePublishMedia(owner: string, listingId: string, variant?: PublishMediaVariant) {
  z.uuid().parse(owner); z.uuid().parse(listingId);
  const db = createDatabaseClient();
  const readListing = async () => {
    const result = await db.rpc("marketplace_owned_listing", { p_owner_user_id: owner, p_listing_id: listingId, p_project_id: null });
    if (result.error) throw new Error("TEMPLATE_PUBLISH_MEDIA_UNAVAILABLE");
    return result.data ? z.object({ sourceProjectId: z.uuid(), status: z.string() }).parse(result.data) : null;
  };
  const listing = await readListing();
  if (!listing || listing.status === "archived") return null;
  const readProject = () => db.from("projects").select("id").eq("id", listing.sourceProjectId).eq("owner_user_id", owner).is("deleted_at", null).maybeSingle();
  const project = await readProject();
  if (project.error) throw new Error("TEMPLATE_PUBLISH_MEDIA_UNAVAILABLE");
  if (!project.data) return null;
  const video = variant === "source" ? null : await resolveApprovedProjectVideo(owner, listing.sourceProjectId);
  const stillOwned = async () => {
    const current = await readListing();
    if (!current || current.status === "archived" || current.sourceProjectId !== listing.sourceProjectId) return false;
    const project = await readProject();
    return !project.error && !!project.data;
  };
  if (video) {
    let clip: { storageKey: string; etag: string; sizeBytes: number } | null = null;
    if (variant !== "final") {
      // Reuse the existing deduplicated queue. The media worker alone encodes
      // missing 3s clips; final playback remains available while it is pending.
      const result = await db.rpc("project_video_preview_request", { p_owner: owner, p_project: listing.sourceProjectId, p_version: video.version });
      if (!result.error && result.data) {
        const job = previewJobSchema.parse(result.data);
        if (job.owner_user_id !== owner || job.project_id !== listing.sourceProjectId || job.version !== video.version) throw new Error("TEMPLATE_PUBLISH_MEDIA_SCOPE");
        if (job.state === "ready" && job.etag && job.size_bytes && job.size_bytes <= 2 * 1024 * 1024) {
          const storageKey = projectPreviewKey(job);
          const object = await headR2CharacterObject(storageKey, AbortSignal.timeout(15_000)).catch(() => null);
          if (object?.etag === job.etag && object.sizeBytes === job.size_bytes && object.mimeType === "video/mp4")
            clip = { storageKey, etag: job.etag, sizeBytes: job.size_bytes };
        }
      }
    }
    if (variant === "preview" && !clip) return null;
    const selected = clip ? "preview" as const : "final" as const;
    return { ...(clip ?? video), version: digest([video.version, selected]), kind: "video" as const, mimeType: "video/mp4", variant: selected,
      stillAllowed: async () => await stillOwned() && (await resolveApprovedProjectVideo(owner, listing.sourceProjectId))?.version === video.version };
  }
  if (variant && variant !== "source") return null;
  const result = await db.rpc("marketplace_template_source", { p_listing_id: listingId, p_owner_user_id: owner });
  if (result.error) throw new Error("TEMPLATE_PUBLISH_MEDIA_UNAVAILABLE");
  if (!result.data) return null;
  const source = z.object({ projectId: z.uuid(), assetId: z.uuid(), kind: z.enum(["image", "video"]) }).parse(result.data);
  if (source.projectId !== listing.sourceProjectId) throw new Error("TEMPLATE_PUBLISH_MEDIA_SCOPE");
  const asset = await db.from("project_assets").select("storage_key,verified_etag,size_bytes,mime_type,media_type").eq("id", source.assetId)
    .eq("project_id", source.projectId).eq("owner_user_id", owner).eq("upload_status", "uploaded").maybeSingle();
  if (asset.error) throw new Error("TEMPLATE_PUBLISH_MEDIA_UNAVAILABLE");
  const a = asset.data;
  if (!a?.verified_etag || !a.size_bytes || !a.storage_key.startsWith(`users/${owner}/projects/${source.projectId}/`) ||
    !["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"].includes(a.mime_type) || a.media_type !== source.kind) return null;
  const version = digest(["template-publish-source-v1", listingId, source.assetId, a.verified_etag]);
  return { version, storageKey: a.storage_key, etag: a.verified_etag, sizeBytes: a.size_bytes, mimeType: a.mime_type, kind: source.kind, variant: "source" as const,
    stillAllowed: async () => {
      if (!await stillOwned()) return false;
      const current = await db.rpc("marketplace_template_source", { p_listing_id: listingId, p_owner_user_id: owner });
      const selected = z.object({ assetId: z.uuid() }).safeParse(current.data);
      return !current.error && selected.success && selected.data.assetId === source.assetId;
    } };
}

export async function templatePublishSource(owner: string, listingId: string, fallback = false) {
  const media = await resolveTemplatePublishMedia(owner, listingId, fallback ? "source" : undefined);
  if (!media) return null;
  const query = new URLSearchParams({ listing: listingId, version: media.version, variant: media.variant });
  return { kind: media.kind, version: media.version, variant: media.variant, url: `/api/templates/publish-media?${query}` };
}
