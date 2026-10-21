import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createDatabaseClient } from "@/lib/db/server";
import { putR2CreatorAvatar } from "@/lib/storage/r2";

export async function prepareTemplatePreview(ownerId: string, listingId: string, form: FormData) {
  const { data, error } = await createDatabaseClient().rpc("marketplace_template_source", { p_listing_id: listingId, p_owner_user_id: ownerId });
  if (error || !data) throw new Error("Choose a template with an owned preview source.");
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
  const key = `marketplace-previews/${listingId}/${randomUUID()}.webp`;
  // Reuse the existing immutable WebP derivative writer and private bucket.
  const etag = await putR2CreatorAvatar(key, bytes);
  return { p_preview_key: key, p_preview_etag: etag, p_preview_size: bytes.length };
}
