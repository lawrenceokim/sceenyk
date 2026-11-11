import "server-only";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createDatabaseClient } from "@/lib/db/server";
import { getStorageConfig } from "@/lib/storage/config";
import { headR2CharacterObject } from "@/lib/storage/r2";
import { readPrivate } from "@/lib/final-video-generation-v3/runtime-media";
import { resolveApprovedProjectVideo } from "./approved-video";
import { previewJobSchema, projectPreviewKey } from "./video-preview-contract";
import { encodeProjectVideoPreview, previewMaximumBytes } from "./video-preview-media";

export async function processProjectVideoPreview() {
  const db = createDatabaseClient(), claim = await db.rpc("project_video_preview_claim", {});
  if (claim.error) throw new Error("PROJECT_PREVIEW_QUEUE_UNAVAILABLE");
  if (!claim.data) return;
  const job = previewJobSchema.parse(claim.data), signal = AbortSignal.timeout(5 * 60_000);
  let temporary: string | undefined;
  const finish = async (etag: string | null, size: number | null, obsolete = false) => {
    const result = await db.rpc("project_video_preview_finish", { p_id: job.id, p_token: job.lease_token!, p_etag: etag, p_size: size, p_obsolete: obsolete });
    if (result.error || !result.data) throw new Error("PROJECT_PREVIEW_LEASE_LOST");
  };
  try {
    const source = await resolveApprovedProjectVideo(job.owner_user_id, job.project_id);
    if (!source || source.version !== job.version) { await finish(null, null, true); return; }
    const key = projectPreviewKey(job);
    let saved = await headR2CharacterObject(key, signal);
    // A worker restart or lost upload acknowledgement reuses the immutable output.
    if (!saved) {
      temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sceenyk-project-preview-"));
      const input = path.join(temporary, "source.mp4"), output = path.join(temporary, "preview.mp4");
      await fs.writeFile(input, await readPrivate(source.storageKey, source.etag, source.sizeBytes, signal, source.sha256), { mode: 0o600 });
      await encodeProjectVideoPreview(input, output);
      const bytes = await fs.readFile(output), config = getStorageConfig();
      const sdk = new S3Client({ endpoint: config.endpoint, region: "auto", maxAttempts: 1,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, requestChecksumCalculation: "WHEN_REQUIRED" });
      try {
        await sdk.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentType: "video/mp4",
          CacheControl: "private, no-store", ContentLength: bytes.length, IfNoneMatch: "*" }), { abortSignal: signal });
      } catch { /* Recover this exact key after a lost acknowledgement; never overwrite. */ }
      finally { sdk.destroy(); }
      saved = await headR2CharacterObject(key, signal);
    }
    if (!saved || saved.mimeType !== "video/mp4" || saved.sizeBytes < 1 || saved.sizeBytes > previewMaximumBytes) throw new Error("PROJECT_PREVIEW_SAVE_FAILED");
    const current = await resolveApprovedProjectVideo(job.owner_user_id, job.project_id);
    if (!current || current.version !== job.version) { await finish(null, null, true); return; }
    await finish(saved.etag, saved.sizeBytes);
  } catch {
    await finish(null, null);
  } finally {
    // This exact mkdtemp directory contains only disposable derivative inputs.
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
}

// One bounded derivative at a time alongside the existing FFmpeg media worker.
export function startProjectVideoPreviews() {
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> = Promise.resolve();
  let reported = false;
  const tick = () => {
    active = processProjectVideoPreview().then(() => { reported = false; }).catch(() => {
      if (!reported) console.error("PROJECT_PREVIEW_QUEUE_UNAVAILABLE");
      reported = true;
    }).finally(() => { if (!stopped) timer = setTimeout(tick, 5000); });
  };
  tick();
  return async () => { stopped = true; clearTimeout(timer); await active; };
}
