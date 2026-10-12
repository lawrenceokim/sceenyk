import "server-only";
import { fileTypeFromBuffer } from "file-type";
import { inspectR2Object, putR2SceneOutput } from "@/lib/storage/r2";
import type { SceneExecution } from "./contract";
import { VisualError } from "./contract";
import { getVisualConfiguration } from "./config";

export function sceneOutputKey(scene: SceneExecution) {
  return `users/${scene.owner_user_id}/projects/${scene.project_id}/generations/${scene.job_id}/scenes/${scene.id}.mp4`;
}
export async function boundedBytes(stream: ReadableStream<Uint8Array>, maximum: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new VisualError("MEDIA_TOO_LARGE");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks, size);
}
async function existingOutput(key: string) {
  const stored = await inspectR2Object(key);
  if (!stored) return null;
  if (!stored.etag || !stored.sizeBytes || stored.sizeBytes > getVisualConfiguration().maximumOutputBytes || stored.mimeType !== "video/mp4" || (await fileTypeFromBuffer(stored.header))?.mime !== "video/mp4") throw new VisualError("INVALID_STORED_OUTPUT");
  return { sizeBytes: stored.sizeBytes, etag: stored.etag };
}
export async function persistSceneOutput(scene: SceneExecution, outputUrl: string) {
  const key = sceneOutputKey(scene);
  const existing = await existingOutput(key);
  if (existing) return existing;
  const url = new URL(outputUrl);
  // Only provider-returned CDN URLs, never browser URLs. No redirects or
  // arbitrary/internal hosts; no URL is returned to a durable step or saved.
  const trustedHost = scene.provider === "fal" ? /^(?:[a-z0-9-]+\.)?fal\.media$/.test(url.hostname) : scene.provider === "runway" && /^[a-z0-9-]+\.cloudfront\.net$/.test(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !trustedHost) throw new VisualError("INVALID_OUTPUT_URL");
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new VisualError("OUTPUT_DOWNLOAD_FAILED", true); }
  const bytes = await boundedBytes(response.body, getVisualConfiguration().maximumOutputBytes);
  if ((await fileTypeFromBuffer(bytes))?.mime !== "video/mp4") throw new VisualError("INVALID_OUTPUT");
  await putR2SceneOutput(key, bytes);
  const verified = await existingOutput(key);
  if (!verified) throw new VisualError("OUTPUT_STORAGE_FAILED", true);
  return verified;
}
