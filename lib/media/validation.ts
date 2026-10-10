import { z } from "zod";
import type { MediaKind } from "./types";

// Explicit raster/container formats only. SVG remains local-preview-only.
const mimeKinds: Record<string, MediaKind> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/avif": "image",
  "image/bmp": "image",
  "image/heic": "image",
  "image/heif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "video/ogg": "video",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/mp4": "audio",
  "audio/ogg": "audio",
  "audio/aac": "audio",
  "audio/flac": "audio",
  "audio/webm": "audio",
};
const aliases: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "video/x-m4v": "video/mp4",
  "audio/x-flac": "audio/flac",
};
export function normalizeMediaMime(value: string) {
  const mime = value.split(";", 1)[0].trim().toLowerCase();
  return Object.hasOwn(aliases, mime) ? aliases[mime] : mime;
}
export function mediaKindForMime(value: string): MediaKind | null {
  const mime = normalizeMediaMime(value);
  return Object.hasOwn(mimeKinds, mime) ? mimeKinds[mime] : null;
}
export const singlePutMaximumBytes = 5 * 1024 ** 3;
// Temporary single-PUT development safeguard, not a commercial product limit.
export const defaultUploadMaximumBytes = 100 * 1024 ** 2;
export const assetReferenceSchema = z.strictObject({
  projectId: z.uuid(),
  assetId: z.uuid(),
});
export const authorizeUploadSchema = z
  .strictObject({
    projectId: z.uuid(),
    requestId: z.uuid(),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
    mimeType: z
      .string()
      .max(100)
      .transform(normalizeMediaMime)
      .refine((value) => mediaKindForMime(value) !== null),
    sizeBytes: z.number().int().positive().max(singlePutMaximumBytes),
    kind: z.enum(["image", "video", "audio"]),
  })
  .refine((value) => mediaKindForMime(value.mimeType) === value.kind);
