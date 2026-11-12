import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createDatabaseClient } from "@/lib/db/server";
import { putR2CreatorAvatar, headR2CharacterObject } from "@/lib/storage/r2";
import { resolveTemplatePublishMedia, publishMediaVariant } from "./publish-media";

export async function prepareTemplatePreview(ownerId: string, listingId: string, form: FormData) {
  const { data, error } = await createDatabaseClient().rpc("marketplace_template_source", { p_listing_id: listingId, p_owner_user_id: ownerId });
  if (error || !data) throw new Error("Choose a template with an owned preview source.");
  const version = form.get("sourceVersion"), variant = form.get("sourceVariant");
  if (version !== null || variant !== null) {
    const media = await resolveTemplatePublishMedia(ownerId, listingId, publishMediaVariant.parse(variant));
    if (!media || version !== media.version || !await media.stillAllowed()) throw new Error("The preview changed. Review the template and try again.");
  }
  const file = form.get("preview");
  if (!(file instanceof File) || file.type !== "image/webp" || !file.size || file.size > 524288)
    throw new Error("The preview must be a WebP image smaller than 512 KB.");
  // Decode and re-encode a bounded poster. No source bytes, metadata, audio,
  // storage capability or filename is ever served through the public route.
  const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000, animated: false });
  if ((await image.metadata()).format !== "webp") throw new Error("Choose a valid WebP preview.");
  const bytes = await image
    .rotate().resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  if (!bytes.length || bytes.length > 524288) throw new Error("This preview is too large.");
  const hash = createHash("sha256").update(listingId).update(bytes).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const key = `marketplace-previews/${listingId}/${id}.webp`;
  // Reuse the existing immutable WebP derivative writer and private bucket.
  let etag: string;
  try { etag = await putR2CreatorAvatar(key, bytes); }
  catch (error) {
    // Concurrent saves/lost acknowledgements reuse the same bounded derivative.
    const existing = await headR2CharacterObject(key, AbortSignal.timeout(15_000));
    if (!existing?.etag || existing.mimeType !== "image/webp" || existing.sizeBytes !== bytes.length) throw error;
    etag = existing.etag;
  }
  return { p_preview_key: key, p_preview_etag: etag, p_preview_size: bytes.length };
}
