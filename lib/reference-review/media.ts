import "server-only";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { inspectR2Object, putR2ReferenceImage, readR2AnalysisMedia } from "@/lib/storage/r2";
import { characterAssetTypes } from "@/lib/character-sheet/contract";
import { productAssetTypes } from "@/lib/product-sheet/contract";
import { referenceReplacementAssetSchema, type ReferenceReviewRow, type ReferenceView } from "./contract";
import type { GeneratedReviewAsset } from "./state";
import { ReferenceRegenerationError } from "./diagnostics";

export function replacementKey(review: ReferenceReviewRow, version: number, view: ReferenceView) {
  const types: Readonly<Record<string, string>> = review.reference_type === "character" ? characterAssetTypes : productAssetTypes;
  if (!types[view]) throw new ReferenceRegenerationError("REFERENCE_ASSET_INVALID");
  return { type: types[view], key: `ugc/${review.owner_user_id}/${review.project_id}/${review.job_id}/reference-review-v1/${review.id}/v${version}/${types[view]}.png` };
}
async function readBytes(key: string, etag: string, sizeBytes: number, signal: AbortSignal) {
  if (sizeBytes < 1 || sizeBytes > 20 * 1024 * 1024) throw new ReferenceRegenerationError("REFERENCE_ASSET_SIZE_INVALID");
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { void reader?.cancel().catch(() => {}); };
  bounded.addEventListener("abort", cancel, { once: true });
  const chunks: Buffer[] = []; let size = 0;
  try {
    reader = (await readR2AnalysisMedia(key, etag, sizeBytes, bounded)).getReader();
    if (bounded.aborted) cancel();
    while (true) { bounded.throwIfAborted(); const part = await reader.read(); bounded.throwIfAborted(); if (part.done) break;
      size += part.value.length; if (size > sizeBytes) throw new ReferenceRegenerationError("REFERENCE_ASSET_SIZE_INVALID"); chunks.push(Buffer.from(part.value)); }
  } catch (error) {
    if (signal.aborted) throw error;
    if (bounded.aborted) throw new ReferenceRegenerationError("REFERENCE_STORAGE_READ_TIMEOUT");
    throw storageReadError(error);
  } finally { bounded.removeEventListener("abort", cancel); if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
  if (size !== sizeBytes) throw new ReferenceRegenerationError("REFERENCE_ASSET_SIZE_INVALID");
  return Buffer.concat(chunks, size);
}
export async function readReviewAsset(asset: GeneratedReviewAsset, signal: AbortSignal) {
  const bytes = await readBytes(asset.storageKey, asset.etag, asset.sizeBytes, signal);
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new ReferenceRegenerationError("REFERENCE_ASSET_INTEGRITY_FAILED");
  return bytes;
}
export async function loadReplacement(review: ReferenceReviewRow, version: number, view: ReferenceView, signal: AbortSignal) {
  const { type, key } = replacementKey(review, version, view);
  const hash = createHash("sha256").update(key).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  return loadPng(key, type, id, signal);
}
async function loadPng(key: string, type: string, id: string, signal: AbortSignal) {
  let object;
  try { object = await inspectR2Object(key); } catch (error) { throw storageReadError(error); }
  if (!object) return null;
  if (!object.etag || object.mimeType !== "image/png" || !object.sizeBytes) throw new ReferenceRegenerationError("REFERENCE_ASSET_INVALID");
  const bytes = await readBytes(key, object.etag, object.sizeBytes, signal);
  let meta;
  try { meta = await sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" }).metadata(); }
  catch { throw new ReferenceRegenerationError("REFERENCE_ASSET_DECODE_FAILED"); }
  if (meta.format !== "png" || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || Math.min(meta.width, meta.height) < 256) throw new ReferenceRegenerationError("REFERENCE_ASSET_INVALID");
  const asset = referenceReplacementAssetSchema.safeParse({ id, type, storageKey: key, etag: object.etag,
    sizeBytes: bytes.length, width: meta.width, height: meta.height, mimeType: "image/png", sha256: createHash("sha256").update(bytes).digest("hex") });
  if (!asset.success) throw new ReferenceRegenerationError("REFERENCE_ASSET_INVALID");
  return { bytes, asset: asset.data };
}
export async function saveRecoveredCharacterSheet(review: ReferenceReviewRow, bytes: Buffer, signal: AbortSignal) {
  if (review.reference_type !== "character") throw new ReferenceRegenerationError("REFERENCE_ASSET_INVALID");
  const id = randomUUID();
  const key = `ugc/${review.owner_user_id}/${review.project_id}/${review.job_id}/reference-review-v1/${review.id}/v${review.version}/character_sheet_recovered/${id}.png`;
  signal.throwIfAborted();
  try { await putR2ReferenceImage(key, bytes, signal); }
  catch (error) { if (signal.aborted) throw error; throw new ReferenceRegenerationError("REFERENCE_STORAGE_WRITE_FAILED"); }
  const stored = await loadPng(key, "character_sheet", id, signal);
  if (!stored || stored.asset.sha256 !== createHash("sha256").update(bytes).digest("hex")) throw new ReferenceRegenerationError("REFERENCE_ASSET_INTEGRITY_FAILED");
  return stored;
}
export async function saveReplacement(review: ReferenceReviewRow, version: number, view: ReferenceView, bytes: Buffer, signal: AbortSignal) {
  signal.throwIfAborted();
  try { await putR2ReferenceImage(replacementKey(review, version, view).key, bytes, signal); }
  catch (error) {
    if (signal.aborted) throw error;
    const cause = error instanceof Error && error.cause ? error.cause : error;
    const safe = storageReadError(cause);
    throw new ReferenceRegenerationError(safe.code === "REFERENCE_STORAGE_READ_TIMEOUT" ? "REFERENCE_STORAGE_WRITE_TIMEOUT" :
      safe.code === "REFERENCE_STORAGE_PERMISSION_FAILED" ? safe.code : "REFERENCE_STORAGE_WRITE_FAILED");
  }
  const stored = await loadReplacement(review, version, view, signal);
  if (!stored || stored.asset.sha256 !== createHash("sha256").update(bytes).digest("hex")) throw new ReferenceRegenerationError("REFERENCE_ASSET_INTEGRITY_FAILED");
  return stored;
}

function storageReadError(error: unknown) {
  if (error instanceof ReferenceRegenerationError) return error;
  const fields = error && typeof error === "object" ? error as { name?: string; $metadata?: { httpStatusCode?: number } } : {};
  const code = fields.$metadata?.httpStatusCode === 403 ? "REFERENCE_STORAGE_PERMISSION_FAILED" :
    fields.$metadata?.httpStatusCode === 404 ? "REFERENCE_STORAGE_NOT_FOUND" : fields.$metadata?.httpStatusCode === 412 ? "REFERENCE_ASSET_INTEGRITY_FAILED" :
    fields.name === "TimeoutError" || fields.name === "AbortError" ? "REFERENCE_STORAGE_READ_TIMEOUT" : "REFERENCE_STORAGE_READ_FAILED";
  return new ReferenceRegenerationError(code);
}
