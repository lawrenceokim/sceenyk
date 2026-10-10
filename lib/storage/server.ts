import "server-only";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { normalizeMediaMime } from "@/lib/media/validation";
import { inspectR2Object, signR2Read, signR2Upload } from "./r2";
export { getStorageConfig, StorageConfigurationError } from "./config";

export function createStorageKey(
  ownerId: string,
  projectId: string,
  assetId: string,
) {
  if (![ownerId, projectId, assetId].every((id) => /^[a-f0-9-]{36}$/.test(id)))
    throw new Error("Invalid storage namespace.");
  // Original filenames are metadata only; never part of the object path.
  return `users/${ownerId}/projects/${projectId}/${assetId}/${randomUUID()}`;
}
export const createUploadUrl = signR2Upload;
export const createReadUrl = signR2Read;
export async function verifyStoredMedia(
  key: string,
  mimeType: string,
  sizeBytes: number,
) {
  const object = await inspectR2Object(key);
  if (!object) return { status: "missing" } as const;
  if (
    object.sizeBytes !== sizeBytes ||
    normalizeMediaMime(object.mimeType ?? "") !== mimeType ||
    !object.etag
  )
    return { status: "rejected" } as const;
  let detected;
  try {
    detected = await fileTypeFromBuffer(object.header);
  } catch {
    return { status: "rejected" } as const;
  }
  const detectedMime = detected ? normalizeMediaMime(detected.mime) : null;
  // Signature detection identifies the WebM container, not its track layout.
  const compatibleWebm =
    mimeType === "audio/webm" && detectedMime === "video/webm";
  if (!detectedMime || (detectedMime !== mimeType && !compatibleWebm))
    return { status: "rejected" } as const;
  return { status: "verified", etag: object.etag } as const;
}
