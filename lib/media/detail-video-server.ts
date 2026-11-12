import "server-only";
import { z } from "zod";
import { readAppUser } from "@/lib/auth/read-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { ownedListingSchema } from "@/lib/marketplace/contract";
import { publishedVideoBindings } from "@/lib/marketplace/video-preview-server";
import { resolveApprovedProjectVideo } from "@/lib/projects/approved-video";

export const detailVideoKind = z.enum(["project", "template", "marketplace"]);
export type DetailVideoKind = z.infer<typeof detailVideoKind>;
export const detailVideoInput = z.strictObject({ kind: detailVideoKind, id: z.uuid(), version: z.string().regex(/^[a-f0-9]{64}$/) });

// Approval and lineage come from existing server owners, never browser media IDs.
// Full public playback requires the reviewed-preview publication boundary too.
export async function resolveDetailVideo(kind: DetailVideoKind, id: string) {
  detailVideoKind.parse(kind); z.uuid().parse(id);
  if (kind === "marketplace") {
    const binding = (await publishedVideoBindings([id]))[0];
    if (!binding?.preview_etag) return null;
    const video = await resolveApprovedProjectVideo(binding.creator_user_id, binding.source_project_id);
    if (!video) return null;
    return { video, stillAllowed: async () => {
      const current = (await publishedVideoBindings([id]))[0];
      return !!current && current.updated_at === binding.updated_at && current.preview_etag === binding.preview_etag &&
        current.creator_user_id === binding.creator_user_id && current.source_project_id === binding.source_project_id;
    } };
  }
  const user = await readAppUser();
  if (kind === "project") {
    const video = await resolveApprovedProjectVideo(user.id, id);
    return video ? { video, stillAllowed: async () => true } : null;
  }
  const owned = async () => {
    const result = await createDatabaseClient().rpc("marketplace_owned_listing", { p_owner_user_id: user.id, p_listing_id: id, p_project_id: null });
    if (result.error) throw new Error("DETAIL_VIDEO_UNAVAILABLE");
    return result.data ? ownedListingSchema.parse(result.data) : null;
  };
  const listing = await owned();
  if (!listing || listing.status === "draft") return null;
  const video = await resolveApprovedProjectVideo(user.id, listing.sourceProjectId);
  if (!video) return null;
  return { video, stillAllowed: async () => {
    const current = await owned();
    return !!current && current.status !== "draft" && current.sourceProjectId === listing.sourceProjectId;
  } };
}

// Normalize exactly one RFC byte range. Multiple/invalid ranges fail closed;
// native seeking can request a suffix or an open-ended range without buffering.
export function detailVideoRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !match[1] && !match[2]) throw new Error("INVALID_VIDEO_RANGE");
  const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const last = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 0 || first >= size || last < first ||
    !match[1] && (!Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 1)) throw new Error("INVALID_VIDEO_RANGE");
  return { first, last, length: last - first + 1, header: `bytes=${first}-${last}`, contentRange: `bytes ${first}-${last}/${size}` };
}
