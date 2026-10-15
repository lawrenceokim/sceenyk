import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { putR2CreatorAvatar, readR2AnalysisMedia } from "@/lib/storage/r2";
import { avatarMaximumBytes, avatarMimeTypes, creatorProfile, creatorSlug } from "./contract";
import { CreatorProfileError } from "./server";

export async function makePublicAvatar(bytes: Uint8Array, mime: string) {
  if (!bytes.byteLength || bytes.byteLength > avatarMaximumBytes || !(avatarMimeTypes as readonly string[]).includes(mime)) throw new CreatorProfileError("INVALID_IMAGE", "Choose a JPEG, PNG or WebP image up to 2 MiB.");
  const detected = await fileTypeFromBuffer(bytes).catch(() => undefined);
  if (detected?.mime !== mime) throw new CreatorProfileError("INVALID_IMAGE", "The image does not match its file type.");
  try {
    // Decode, orient, resize and re-encode. Original metadata/animation is never published.
    const output = await sharp(bytes, { limitInputPixels: 16_000_000, animated: false, failOn: "warning" }).rotate().resize(512, 512, { fit: "cover", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (!output.byteLength || output.byteLength > 524288) throw new Error("AVATAR_SIZE");
    return output;
  } catch { throw new CreatorProfileError("INVALID_IMAGE", "This image couldn’t be processed. Choose a smaller JPEG, PNG or WebP."); }
}
export async function uploadCreatorAvatar(request: Request) {
  const user = await ensureAppUser();
  const db = createDatabaseClient();
  const current = await db.rpc("creator_profile_owned", { p_owner: user.id });
  if (current.error || !current.data) throw new CreatorProfileError("PROFILE_REQUIRED", "Save your public profile before uploading an avatar.");
  const mime = request.headers.get("content-type") ?? "";
  if (!(avatarMimeTypes as readonly string[]).includes(mime) || Number(request.headers.get("content-length") ?? 0) > avatarMaximumBytes) throw new CreatorProfileError("INVALID_IMAGE", "Choose a JPEG, PNG or WebP image up to 2 MiB.");
  const reader = request.body?.getReader();
  if (!reader) throw new CreatorProfileError("INVALID_IMAGE", "Choose an image.");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > avatarMaximumBytes) { await reader.cancel(); throw new CreatorProfileError("INVALID_IMAGE", "Choose an image up to 2 MiB."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = await makePublicAvatar(Buffer.concat(chunks), mime);
  const key = `marketplace/avatars/${user.id}/${randomUUID()}.webp`;
  const etag = await putR2CreatorAvatar(key, bytes);
  const result = await db.rpc("creator_profile_avatar_save", { p_owner: user.id, p_key: key, p_etag: etag, p_size: bytes.byteLength });
  if (result.error || !result.data) throw new CreatorProfileError();
  return creatorProfile.parse(result.data);
}
export async function readPublicCreatorAvatar(slug: unknown) {
  const parsed = creatorSlug.safeParse(slug); if (!parsed.success) return null;
  const result = await createDatabaseClient().rpc("creator_profile_avatar", { p_slug: parsed.data });
  if (result.error) throw new CreatorProfileError();
  if (!result.data) return null;
  const asset = z.strictObject({ key: z.string().regex(/^marketplace\/avatars\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/), etag: z.string().min(1).max(100), size: z.number().int().min(1).max(524288) }).parse(result.data);
  return { stream: await readR2AnalysisMedia(asset.key, asset.etag, asset.size, AbortSignal.timeout(10000)), size: asset.size };
}
