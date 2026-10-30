import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getStorageConfig } from "@/lib/storage/config";
import { headR2CharacterObject, readR2AnalysisMedia, signR2Read } from "@/lib/storage/r2";
import { measure } from "@/lib/final-video-generation/media";
import { privateAssetSchema, type PrivateAsset } from "./runtime-contract";

export const bytesHash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
export function v3Prefix(owner: string, project: string) {
  if (![owner, project].every(v => /^[a-f0-9-]{36}$/.test(v))) throw new Error("V3_STORAGE_SCOPE");
  return `users/${owner}/projects/${project}/v3/`;
}
export async function spoolFile(id: string, name: string) {
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-z-]+\.(json|bytes|mp4|png)$/.test(name)) throw new Error("V3_SPOOL_SCOPE");
  const root = path.resolve(process.env.UGC_V3_RECOVERY_DIR || ".ugc-v3-recovery"), dir = path.join(root, id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(root)).isSymbolicLink() || (await fs.lstat(dir)).isSymbolicLink()) throw new Error("V3_SPOOL_SCOPE");
  return path.join(dir, name);
}
export async function saveSpool(id: string, name: string, bytes: Buffer) {
  const file = await spoolFile(id, name), temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  // Immutable publication: an existing response/result is never replaced.
  try { await fs.link(temporary, file); } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST" || bytesHash(await fs.readFile(file)) !== bytesHash(bytes)) throw new Error("V3_SPOOL_CONFLICT");
  } finally { await fs.unlink(temporary).catch(() => {}); }
  return file;
}
export async function readSpool(id: string, name: string) {
  const file = await spoolFile(id, name);
  try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024) throw new Error("V3_SPOOL_SCOPE");
    return await fs.readFile(file); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export async function readPrivate(key: string, etag: string, size: number, signal: AbortSignal, hash?: string) {
  if (!size || size > 256 * 1024 * 1024) throw new Error("V3_MEDIA_SIZE_INVALID");
  const reader = (await readR2AnalysisMedia(key, etag, size, signal)).getReader(), chunks: Uint8Array[] = []; let count = 0;
  try { for (;;) { signal.throwIfAborted(); const part = await reader.read(); if (part.done) break; count += part.value.length;
    if (count > size) throw new Error("V3_MEDIA_SIZE_INVALID"); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = Buffer.concat(chunks, count);
  if (count !== size || hash && bytesHash(bytes) !== hash) throw new Error("V3_MEDIA_INTEGRITY_INVALID"); return bytes;
}
function client() {
  const c = getStorageConfig(); return { bucket: c.bucket, sdk: new S3Client({ endpoint: c.endpoint, region: "auto", maxAttempts: 1,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey }, requestChecksumCalculation: "WHEN_REQUIRED" }) };
}
export async function publishPrivate(owner: string, project: string, id: string, bytes: Buffer,
  metadata: Omit<PrivateAsset, "id" | "storageKey" | "etag" | "sha256" | "sizeBytes">, signal: AbortSignal): Promise<PrivateAsset> {
  const extension = metadata.mimeType === "image/png" ? "png" : "mp4", key = `${v3Prefix(owner, project)}${id}.${extension}`;
  const { bucket, sdk } = client();
  let head = await headR2CharacterObject(key, signal);
  if (!head) {
    try { await sdk.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: metadata.mimeType, ContentLength: bytes.length, IfNoneMatch: "*" }), { abortSignal: signal }); }
    catch { /* Inspect this exact immutable key after a lost acknowledgement. */ }
    head = await headR2CharacterObject(key, signal);
  }
  if (!head || head.sizeBytes !== bytes.length || head.mimeType !== metadata.mimeType) throw new Error("V3_PRIVATE_SAVE_FAILED");
  const asset = privateAssetSchema.parse({ ...metadata, id, storageKey: key, etag: head.etag, sha256: bytesHash(bytes), sizeBytes: bytes.length });
  await readPrivate(key, asset.etag, asset.sizeBytes, signal, asset.sha256); return asset;
}
export async function inspectImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("V3_IMAGE_SIZE_INVALID");
  const png = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().png().toBuffer(), meta = await sharp(png).metadata();
  if (!meta.width || !meta.height || (meta.pages ?? 1) !== 1) throw new Error("V3_IMAGE_INVALID");
  return { bytes: png, metadata: { mimeType: "image/png" as const, width: meta.width, height: meta.height, durationMs: 0, hasAudio: false } };
}
export async function inspectVideo(id: string, bytes: Buffer, expected: { durationMs: number; aspectRatio: string; generateAudio: boolean }) {
  const file = await saveSpool(id, "video.mp4", bytes), meta = await measure(file, "video/mp4"), [w, h] = expected.aspectRatio.split(":").map(Number);
  // Technical 250ms test tolerance is explicit local policy, not a provider guarantee.
  if (Math.abs(meta.durationMs - expected.durationMs) > 250 || Math.abs(meta.width / meta.height - w / h) > 0.01 ||
    Math.min(meta.width, meta.height) !== 480 || expected.generateAudio && !meta.hasAudio) throw new Error("V3_VIDEO_TECHNICAL_VALIDATION_FAILED");
  return { mimeType: "video/mp4" as const, width: meta.width, height: meta.height, durationMs: meta.durationMs, hasAudio: meta.hasAudio };
}
export async function deletePrivate(owner: string, project: string, asset: PrivateAsset, signal: AbortSignal) {
  if (!asset.storageKey.startsWith(v3Prefix(owner, project)) || !asset.storageKey.endsWith(`${asset.id}.mp4`)) throw new Error("V3_DELETE_SCOPE");
  const head = await headR2CharacterObject(asset.storageKey, signal); if (!head) return;
  if (head.etag !== asset.etag) throw new Error("V3_DELETE_ASSET_CHANGED");
  const { bucket, sdk } = client(); await sdk.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.storageKey, IfMatch: asset.etag }), { abortSignal: signal });
  if (await headR2CharacterObject(asset.storageKey, signal)) throw new Error("V3_DELETE_UNCONFIRMED");
}
export const signPrivate = (asset: PrivateAsset) => signR2Read(asset.storageKey, asset.etag, asset.mimeType);
