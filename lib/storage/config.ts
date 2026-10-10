import "server-only";
import {
  defaultUploadMaximumBytes,
  singlePutMaximumBytes,
} from "@/lib/media/validation";

export class StorageConfigurationError extends Error {
  constructor(readonly missing: string[] = []) {
    super(
      missing.length
        ? `Media storage needs server configuration: ${missing.join(", ")}.`
        : "Media storage configuration is invalid.",
    );
    this.name = "StorageConfigurationError";
  }
}
export function getStorageConfig() {
  const names = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
  ] as const;
  if (names.some((name) => process.env[`NEXT_PUBLIC_${name}`]))
    throw new StorageConfigurationError();
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new StorageConfigurationError(missing);
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const bucket = process.env.R2_BUCKET_NAME?.trim() ?? "";
  const configuredMaximum = process.env.MEDIA_MAX_UPLOAD_BYTES?.trim();
  const maxUploadBytes = configuredMaximum
    ? Number(configuredMaximum)
    : defaultUploadMaximumBytes;
  if (
    !/^[a-f0-9]{32}$/.test(accountId) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !Number.isSafeInteger(maxUploadBytes) ||
    maxUploadBytes <= 0 ||
    maxUploadBytes > singlePutMaximumBytes
  )
    throw new StorageConfigurationError();
  // Values above were checked as present; credentials never leave this module's server boundary.
  return {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket,
    maxUploadBytes,
    accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "",
  };
}
