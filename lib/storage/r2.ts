import "server-only";
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
export async function signR2Read(key: string, etag: string, mimeType: string) {
  if (!etag) throw new Error("Unverified object.");
  const { bucket, sdk } = client();
  const url = await getSignedUrl(
    sdk,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: mimeType,
      ResponseCacheControl: "private, no-store",
      // IfNoneMatch on every authorized PUT makes this key immutable.
    }),
    { expiresIn: readLifetimeSeconds },
  );
  return {
    url,
    expiresAt: new Date(Date.now() + readLifetimeSeconds * 1000).toISOString(),
  };
}
