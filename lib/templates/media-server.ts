import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { readAppUser } from "@/lib/auth/read-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { ownedListingSchema } from "@/lib/marketplace/contract";
import { readOwnedProjectVideoPreviewMedia } from "@/lib/projects/video-preview-server";
import { readOwnedProjectThumbnail } from "@/lib/projects/thumbnail-server";
import { readPrivate } from "@/lib/final-video-generation-v3/runtime-media";
import { createReadUrl } from "@/lib/storage/server";
import { projectMediaLifetimeMs, type ProjectMediaReply } from "@/lib/projects/cached-media-contract";

export const templateMediaInput = z.strictObject({ listingId: z.uuid(), kind: z.enum(["video", "poster"]), version: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export async function readTemplateMedia(input: unknown): Promise<ProjectMediaReply> {
  const { listingId, kind, version } = templateMediaInput.parse(input), user = await readAppUser();
  const db = createDatabaseClient();
  const owned = async () => {
    const result = await db.rpc("marketplace_owned_listing", { p_owner_user_id: user.id, p_listing_id: listingId, p_project_id: null });
    if (result.error) throw new Error("TEMPLATE_MEDIA_UNAVAILABLE");
    return result.data ? ownedListingSchema.parse(result.data) : null;
  };
  const listing = await owned();
  if (!listing) return { state: "unavailable" };
  let media: ProjectMediaReply;
  if (kind === "video") {
    if (listing.status === "draft") return { state: "unavailable" };
    media = await readOwnedProjectVideoPreviewMedia(listing.sourceProjectId, version);
  } else if (listing.previewUrl) {
    const result = await db.rpc("marketplace_template_preview", { p_listing_id: listingId, p_owner_user_id: user.id });
    if (result.error) throw new Error("TEMPLATE_MEDIA_UNAVAILABLE");
    if (!result.data) return { state: "unavailable" };
    const poster = z.object({ key: z.string().regex(new RegExp(`^marketplace-previews/${listingId}/[a-f0-9-]{36}\\.webp$`)), etag: z.string().min(1), size: z.number().int().min(1).max(524288) }).parse(result.data);
    const current = createHash("sha256").update(JSON.stringify(poster.etag)).digest("hex");
    const reply = { state: "ready" as const, version: current, expiresAt: new Date(Date.now() + projectMediaLifetimeMs).toISOString() };
    media = version === current ? reply : { ...reply, mimeType: "image/webp", bytes: await readPrivate(poster.key, poster.etag, poster.size, AbortSignal.timeout(15_000)) };
  } else {
    const result = await db.rpc("marketplace_template_source", { p_listing_id: listingId, p_owner_user_id: user.id });
    if (result.error) throw new Error("TEMPLATE_MEDIA_UNAVAILABLE");
    if (!result.data) return { state: "unavailable" };
    const source = z.object({ projectId: z.literal(listing.sourceProjectId), assetId: z.uuid(), kind: z.enum(["image", "video"]) }).parse(result.data);
    const asset = await db.from("project_assets").select("*").eq("id", source.assetId).eq("project_id", source.projectId).eq("owner_user_id", user.id).eq("upload_status", "uploaded").maybeSingle();
    if (asset.error || !asset.data?.verified_etag || asset.data.media_type !== source.kind) return { state: "unavailable" };
    if (!asset.data.removed_from_draft) media = await readOwnedProjectThumbnail({ projectId: source.projectId, assetId: source.assetId, version });
    else {
      // Keep the existing retained/pinned-source fallback; never broaden source
      // selection beyond marketplace_template_source's owner-only result.
      const project = await db.from("projects").select("id").eq("id", source.projectId).eq("owner_user_id", user.id).eq("status", "draft").is("deleted_at", null).maybeSingle();
      if (project.error || !project.data) return { state: "unavailable" };
      media = { state: "ready", version: createHash("sha256").update(JSON.stringify([source.assetId, asset.data.verified_etag])).digest("hex"),
        ...await createReadUrl(asset.data.storage_key, asset.data.verified_etag, asset.data.mime_type), expiresAt: new Date(Date.now() + projectMediaLifetimeMs).toISOString() };
    }
  }
  const current = await owned();
  if (!current || current.sourceProjectId !== listing.sourceProjectId || kind === "video" && current.status === "draft") return { state: "unavailable" };
  return media;
}
