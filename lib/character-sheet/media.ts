import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { inspectR2Object, putR2CharacterImage, readR2AnalysisMedia } from "@/lib/storage/r2";
import { characterAssetSchema, characterAssetTypes, type CharacterAsset, type CharacterSheetRow } from "./contract";
import { CharacterSheetError } from "./provider";
import { characterOutputError } from "./diagnostics";

const gray = "#b8b8b8";
export async function normalizeCharacterImage(bytes: Buffer) {
  try {
    if (!bytes.length) throw characterOutputError("CHARACTER_OUTPUT_EMPTY", "output_decode");
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 256) {
      throw characterOutputError("CHARACTER_OUTPUT_DIMENSIONS_INVALID", "output_decode");
    }
    if ((meta.pages ?? 1) > 1) throw characterOutputError("CHARACTER_OUTPUT_ANIMATED", "output_decode");
    return await image.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .flatten({ background: gray }).png().toBuffer();
  } catch (error) {
    if (error instanceof CharacterSheetError) throw error;
    throw characterOutputError("CHARACTER_OUTPUT_DECODE_FAILED", "output_decode");
  }
}
export function characterStorageKey(row: CharacterSheetRow, view: keyof typeof characterAssetTypes) {
  return `ugc/${row.owner_user_id}/${row.project_id}/${row.job_id}/character-v1/${row.id}/${characterAssetTypes[view]}.png`;
}
// Conditional PUT + deterministic path recovers a crash between R2 and SQL.
export async function loadStoredCharacterAsset(row: CharacterSheetRow, view: keyof typeof characterAssetTypes, signal: AbortSignal): Promise<{ asset: CharacterAsset; bytes: Buffer } | null> {
  const key = characterStorageKey(row, view);
  try {
    const object = await inspectR2Object(key);
    if (!object) return null;
    if (!object.etag || !object.sizeBytes || object.sizeBytes > 20 * 1024 * 1024 || object.mimeType !== "image/png") throw new Error();
    const stream = await readR2AnalysisMedia(key, object.etag, object.sizeBytes, AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
    const reader = stream.getReader(); const chunks: Buffer[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > object.sizeBytes) throw new Error(); chunks.push(Buffer.from(part.value)); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (size !== object.sizeBytes) throw new Error();
    const bytes = Buffer.concat(chunks, size);
    const metadata = await sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" }).metadata();
    // UUID is stable per sheet/view, recorded separately from its internal R2 path.
    const hash = createHash("sha256").update(`${row.id}:${view}`).digest("hex");
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return { bytes, asset: characterAssetSchema.parse({ id, type: characterAssetTypes[view], storageKey: key,
      etag: object.etag, sizeBytes: size, width: metadata.width, height: metadata.height,
      sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png" }) };
  } catch { throw characterStorageError(view); }
}
export async function saveCharacterAsset(row: CharacterSheetRow, view: keyof typeof characterAssetTypes, bytes: Buffer, signal: AbortSignal) {
  try { await putR2CharacterImage(characterStorageKey(row, view), bytes, signal); }
  catch { throw characterStorageError(view); }
  const stored = await loadStoredCharacterAsset(row, view, signal);
  if (!stored) throw characterStorageError(view);
  return stored;
}
export async function composeCharacterSheet(views: Buffer[]) {
  try {
    if (views.length !== 3) throw new Error();
    const panels = await Promise.all(views.map(bytes => sharp(bytes, { limitInputPixels: 20_000_000 })
      .resize(768, 1152, { fit: "contain", background: gray }).flatten({ background: gray }).png().toBuffer()));
    return await sharp({ create: { width: 2400, height: 1216, channels: 3, background: gray } })
      .composite(panels.map((input, i) => ({ input, left: 32 + i * 784, top: 32 }))).png().toBuffer();
  } catch { throw new CharacterSheetError("CHARACTER_COMPOSITION_FAILED", true, false, {
    operation: "sheet_composition", httpStatus: null, category: "invalid_media", reason: "CHARACTER_SHEET_COMPOSITION_FAILED", view: "sheet",
  }); }
}
function characterStorageError(view: keyof typeof characterAssetTypes) {
  return new CharacterSheetError("CHARACTER_STORAGE_FAILED", true, false, {
    operation: "output_storage", httpStatus: null, category: "invalid_media", reason: "CHARACTER_OUTPUT_STORAGE_FAILED", view,
  });
}
