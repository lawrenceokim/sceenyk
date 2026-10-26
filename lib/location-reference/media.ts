import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { headR2CharacterObject, putR2ReferenceImage, readR2AnalysisMedia } from "@/lib/storage/r2";
import { locationArtifactSchema, type LocationRow, type LocationCandidate } from "./contract";

export function locationKey(row: LocationRow, candidate: Pick<LocationCandidate, "id">) {
  return `ugc/${row.owner_user_id}/${row.project_id}/${row.job_id}/location-v1/${row.id}/candidates/${candidate.id}.png`;
}
export async function normalizeLocation(bytes: Buffer) {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("LOCATION_IMAGE_INVALID");
  const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
  const meta = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height ||
    Math.min(meta.width, meta.height) < 256 || Math.max(meta.width, meta.height) > 4096) throw new Error("LOCATION_IMAGE_INVALID");
  // Decode and re-encode only. No semantic scoring, cropping or visual rejection.
  return image.rotate().flatten({ background: "#ffffff" }).png().toBuffer();
}
export async function loadLocation(row: LocationRow, candidate: Pick<LocationCandidate, "id" | "artifact" | "settings">, signal: AbortSignal) {
  const key = locationKey(row, candidate);
  const object = await headR2CharacterObject(key, signal);
  if (!object) return null;
  if (!object.etag || object.mimeType !== "image/png" || !object.sizeBytes || object.sizeBytes > 20 * 1024 * 1024) throw new Error("LOCATION_STORAGE_INVALID");
  const stream = await readR2AnalysisMedia(key, object.etag, object.sizeBytes, signal);
  const reader = stream.getReader(); const chunks: Buffer[] = []; let size = 0;
  try {
    while (true) { signal.throwIfAborted(); const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > object.sizeBytes) throw new Error("LOCATION_STORAGE_INVALID"); chunks.push(Buffer.from(part.value)); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (size !== object.sizeBytes) throw new Error("LOCATION_STORAGE_INVALID");
  const bytes = Buffer.concat(chunks, size);
  const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
  const meta = await image.metadata(); await image.stats();
  const [expectedWidth, expectedHeight] = String(candidate.settings.size).split("x").map(Number);
  if (meta.width !== expectedWidth || meta.height !== expectedHeight || (meta.pages ?? 1) !== 1) throw new Error("LOCATION_DIMENSIONS_INVALID");
  const artifact = locationArtifactSchema.parse({ id: candidate.id, storageKey: key, etag: object.etag, sizeBytes: size,
    width: meta.width, height: meta.height, mimeType: meta.format === "png" ? "image/png" : "invalid",
    sha256: createHash("sha256").update(bytes).digest("hex") });
  if (candidate.artifact && (candidate.artifact.storageKey !== key || candidate.artifact.etag !== artifact.etag ||
    candidate.artifact.sha256 !== artifact.sha256 || candidate.artifact.sizeBytes !== size)) throw new Error("LOCATION_STORAGE_CHANGED");
  return { bytes, artifact };
}
export async function saveLocation(row: LocationRow, candidate: LocationCandidate, bytes: Buffer, signal: AbortSignal) {
  await putR2ReferenceImage(locationKey(row, candidate), bytes, signal);
  const stored = await loadLocation(row, candidate, signal);
  if (!stored || stored.artifact.sha256 !== createHash("sha256").update(bytes).digest("hex")) throw new Error("LOCATION_STORAGE_CHANGED");
  return stored.artifact;
}
