import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { inspectR2Object, putR2ReferenceImage, readR2AnalysisMedia } from "@/lib/storage/r2";
import { productAssetSchema, productAssetTypes, type ProductAsset, type ProductSheetRow } from "./contract";
import { ProductSheetError } from "./provider";

const gray = "#b8b8b8";
export async function normalizeProductImage(bytes: Buffer) {
  try {
    if (!bytes.length) throw new ProductSheetError("PRODUCT_OUTPUT_EMPTY");
    if (bytes.length > 20 * 1024 * 1024) throw new ProductSheetError("PRODUCT_OUTPUT_TOO_LARGE");
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const meta = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1) throw new ProductSheetError("PRODUCT_OUTPUT_FORMAT_UNSUPPORTED");
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 256 || Math.max(meta.width, meta.height) > 8192) {
      throw new ProductSheetError("PRODUCT_OUTPUT_DIMENSIONS_INVALID");
    }
    return await image.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .flatten({ background: gray }).png().toBuffer();
  } catch (error) {
    const code = error instanceof ProductSheetError ? error.code : "PRODUCT_OUTPUT_DECODE_FAILED";
    throw new ProductSheetError(code, false, false, { code, sizeBytes: bytes.length, decode: "failed" });
  }
}
export function productStorageKey(row: ProductSheetRow, view: keyof typeof productAssetTypes) {
  return `ugc/${row.owner_user_id}/${row.project_id}/${row.job_id}/product-v1/${row.id}/${productAssetTypes[view]}.png`;
}
export async function loadStoredProductAsset(row: ProductSheetRow, view: keyof typeof productAssetTypes, signal: AbortSignal): Promise<{ asset: ProductAsset; bytes: Buffer } | null> {
  try {
    const key = productStorageKey(row, view);
    const object = await inspectR2Object(key);
    if (!object) return null;
    if (!object.etag || !object.sizeBytes || object.sizeBytes > 20 * 1024 * 1024 || object.mimeType !== "image/png") throw new Error();
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
    const reader = (await readR2AnalysisMedia(key, object.etag, object.sizeBytes, boundedSignal)).getReader();
    const chunks: Buffer[] = []; let size = 0;
    try {
      while (true) { boundedSignal.throwIfAborted(); const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > object.sizeBytes) throw new Error(); chunks.push(Buffer.from(part.value)); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (size !== object.sizeBytes) throw new Error();
    const bytes = Buffer.concat(chunks, size);
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== "png" || (metadata.pages ?? 1) !== 1) throw new Error();
    // Force pixel decode; a metadata-only PNG header is not a valid stored view.
    await image.stats();
    const hash = createHash("sha256").update(`${row.id}:${view}`).digest("hex");
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return { bytes, asset: productAssetSchema.parse({ id, type: productAssetTypes[view], storageKey: key,
      etag: object.etag, sizeBytes: size, width: metadata.width, height: metadata.height,
      sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png" }) };
  } catch { throw new ProductSheetError("PRODUCT_OUTPUT_STORAGE_FAILED", true); }
}
export async function saveProductAsset(row: ProductSheetRow, view: keyof typeof productAssetTypes, bytes: Buffer, signal: AbortSignal) {
  try { await putR2ReferenceImage(productStorageKey(row, view), bytes, signal); }
  catch { throw new ProductSheetError("PRODUCT_OUTPUT_STORAGE_FAILED", true); }
  const stored = await loadStoredProductAsset(row, view, signal);
  if (!stored) throw new ProductSheetError("PRODUCT_OUTPUT_STORAGE_FAILED", true);
  if (stored.asset.sha256 !== createHash("sha256").update(bytes).digest("hex")) throw new ProductSheetError("PRODUCT_OUTPUT_INTEGRITY_FAILED");
  return stored;
}
export async function composeProductSheet(views: Buffer[]) {
  try {
    if (views.length !== 3) throw new Error();
    const panels = await Promise.all(views.map(bytes => sharp(bytes, { limitInputPixels: 20_000_000 })
      .resize(768, 768, { fit: "contain", background: gray }).flatten({ background: gray }).png().toBuffer()));
    return await sharp({ create: { width: 2400, height: 832, channels: 3, background: gray } })
      .composite(panels.map((input, index) => ({ input, left: 32 + index * 784, top: 32 }))).png().toBuffer();
  } catch { throw new ProductSheetError("PRODUCT_SHEET_COMPOSITION_FAILED", true); }
}
