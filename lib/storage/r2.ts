import "server-only";
import { createReadStream } from "node:fs";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageConfig } from "./config";

const uploadLifetimeSeconds = 5 * 60;
const readLifetimeSeconds = 15 * 60;
// Shared immutable private PNG writer; Product callers map storage failures to
// their own safe diagnostics. Character behavior and existing exports stay intact.
export { putR2CharacterImage as putR2ReferenceImage };
// Private UGC images only. Never replace a previously committed generated object.
export async function putR2CharacterImage(key: string, bytes: Uint8Array, signal: AbortSignal) {
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("CHARACTER_STORAGE_FAILED");
  const { bucket, sdk } = client();
  try {
    await sdk.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength,
      ContentType: "image/png", IfNoneMatch: "*" }), { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
  } catch (error) {
    if (!error || typeof error !== "object" || !("$metadata" in error) || !error.$metadata || typeof error.$metadata !== "object" ||
      !("httpStatusCode" in error.$metadata) || error.$metadata.httpStatusCode !== 412) throw new Error("CHARACTER_STORAGE_FAILED");
  }
}
// Provider-only capability, never persisted or returned in any client DTO.
export async function signR2CharacterSource(key: string, etag: string) {
  if (!etag) throw new Error("CHARACTER_STORAGE_FAILED");
  const { bucket, sdk } = client();
  // Provider accepts a URL only, not required signed If-Match headers. The
  // loader checks ETag conditionally first; every application PUT is immutable.
  return getSignedUrl(sdk, new GetObjectCommand({ Bucket: bucket, Key: key,
    ResponseCacheControl: "private, no-store" }), { expiresIn: 5 * 60 });
}
// Explicitly public derivative only; bucket remains private. Keys never leave the server.
export async function putR2CreatorAvatar(key: string, bytes: Uint8Array) {
  const { bucket, sdk } = client();
  const result = await sdk.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: "image/webp", IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(15000) });
  if (!result.ETag) throw new Error("AVATAR_STORAGE_UNAVAILABLE");
  return result.ETag;
}
// Final worker only: bounded file is streamed, with canonical immutable identity.
export async function putR2FinalOutput(key: string, file: string, sizeBytes: number) {
  const { bucket, sdk } = client();
  try {
    await sdk.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(file), ContentLength: sizeBytes, ContentType: "video/mp4", IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(120_000) });
    return true;
  } catch (error) {
    if (!error || typeof error !== "object" || !("$metadata" in error) || !error.$metadata || typeof error.$metadata !== "object" || !("httpStatusCode" in error.$metadata) || error.$metadata.httpStatusCode !== 412) throw new Error("FINAL_STORAGE_UNAVAILABLE");
    return false;
  }
}
export async function putR2NarrationOutput(key: string, bytes: Uint8Array) {
  const { bucket, sdk } = client();
  try {
    await sdk.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: "audio/mpeg", IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(60_000) });
  } catch (error) {
    if (!error || typeof error !== "object" || !("$metadata" in error) || !error.$metadata || typeof error.$metadata !== "object" || !("httpStatusCode" in error.$metadata) || error.$metadata.httpStatusCode !== 412) throw new Error("NARRATION_STORAGE_UNAVAILABLE");
  }
}
// Trusted intermediate output only. Conditional PUT also covers lost DB replies.
export async function putR2SceneOutput(key: string, bytes: Uint8Array) {
  const { bucket, sdk } = client();
  try {
    await sdk.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: "video/mp4", IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(60_000) });
  } catch (error) {
    if (!error || typeof error !== "object" || !("$metadata" in error) || !error.$metadata || typeof error.$metadata !== "object" || !("httpStatusCode" in error.$metadata) || error.$metadata.httpStatusCode !== 412) throw new Error("SCENE_STORAGE_UNAVAILABLE");
  }
}
// Trusted AI input transfer. No signed R2 URL leaves this process.
export async function readR2AnalysisMedia(key: string, etag: string, sizeBytes: number, signal: AbortSignal) {
  const { bucket, sdk } = client();
  const result = await sdk.send(new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag }), { abortSignal: signal });
  if (!result.Body || result.ContentLength !== sizeBytes || result.ETag !== etag) {
    if (result.Body && "destroy" in result.Body) result.Body.destroy();
    throw new Error("MEDIA_UNAVAILABLE");
  }
  return result.Body.transformToWebStream();
}
function client() {
  const config = getStorageConfig();
  return {
    bucket: config.bucket,
    sdk: new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      maxAttempts: 2,
    }),
  };
}
export async function signR2Upload(
  key: string,
  mimeType: string,
  sizeBytes: number,
) {
  const { bucket, sdk } = client();
  const headers = { "Content-Type": mimeType, "If-None-Match": "*" };
  const url = await getSignedUrl(
    sdk,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
      // A signed write cannot replace an already-verified object, even on replay.
      IfNoneMatch: "*",
    }),
    {
      expiresIn: uploadLifetimeSeconds,
      signableHeaders: new Set([
        "content-type",
        "content-length",
        "if-none-match",
      ]),
    },
  );
  return {
    url,
    headers,
    expiresAt: new Date(
      Date.now() + uploadLifetimeSeconds * 1000,
    ).toISOString(),
  };
}
export async function inspectR2Object(key: string) {
  const { bucket, sdk } = client();
  try {
    const head = await sdk.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    const result = await sdk.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: "bytes=0-8191",
        IfMatch: head.ETag,
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    if (
      !result.Body ||
      !result.ContentLength ||
      result.ContentLength > 8192 ||
      !result.ContentRange
    ) {
      if (result.Body && "destroy" in result.Body) result.Body.destroy();
      throw new Error("Storage did not return a bounded header.");
    }
    return {
      sizeBytes: head.ContentLength,
      mimeType: head.ContentType,
      etag: head.ETag,
      header: await result.Body.transformToByteArray(),
    };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "$metadata" in error) {
      const metadata = error.$metadata;
      if (
        metadata &&
        typeof metadata === "object" &&
        "httpStatusCode" in metadata &&
        metadata.httpStatusCode === 404
      )
        return null;
    }
    throw error;
  }
}
export async function signR2Read(key: string, etag: string, mimeType: string, download = false) {
  if (!etag) throw new Error("Unverified object.");
  const { bucket, sdk } = client();
  const url = await getSignedUrl(
    sdk,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: mimeType,
      ResponseCacheControl: "private, no-store",
      ...(download ? { ResponseContentDisposition: 'attachment; filename="sceenyk-video.mp4"' } : {}),
      // IfNoneMatch on every authorized PUT makes this key immutable.
    }),
    { expiresIn: readLifetimeSeconds },
  );
  return {
    url,
    expiresAt: new Date(Date.now() + readLifetimeSeconds * 1000).toISOString(),
  };
}
