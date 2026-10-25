// Pure, bounded allowlist. Never log SDK messages, request/response objects,
// headers, endpoints, keys, credentials, provider URLs or raw causes.
const reasons = {
  AccessDenied: ["authorization", "R2 denied the storage operation."],
  InvalidAccessKeyId: ["authentication", "R2 did not recognize the configured access key."],
  SignatureDoesNotMatch: ["authentication", "R2 rejected the request signature."],
  NoSuchBucket: ["bucket", "The configured R2 bucket was not found."],
  PermanentRedirect: ["endpoint", "The storage endpoint does not match the bucket."],
  AuthorizationHeaderMalformed: ["endpoint", "R2 rejected the endpoint or signing configuration."],
  InvalidArgument: ["request", "R2 rejected a request argument."],
  InvalidRequest: ["request", "R2 rejected the storage request."],
  InvalidDigest: ["body", "R2 rejected the request body checksum."],
  BadDigest: ["body", "R2 reported a request body checksum mismatch."],
  IncompleteBody: ["body", "The received body did not match the declared content length."],
  RequestTimeout: ["timeout", "R2 timed out receiving the request; commit is uncertain."],
  TimeoutError: ["timeout", "The storage request timed out; commit is uncertain."],
  AbortError: ["aborted", "The storage request was aborted; commit is uncertain."],
  ETIMEDOUT: ["timeout", "The storage connection timed out; commit is uncertain."],
  ECONNRESET: ["network", "The storage connection was reset; commit is uncertain."],
  ECONNREFUSED: ["network", "The storage connection was refused."],
  ENOTFOUND: ["network", "The storage endpoint could not be resolved."],
  EAI_AGAIN: ["network", "Storage endpoint resolution temporarily failed."],
  EACCES: ["network", "The local environment denied the storage connection."],
  EPIPE: ["network", "The storage connection closed during transfer; commit is uncertain."],
  NotImplemented: ["unsupported", "R2 does not support a requested storage operation."],
  SlowDown: ["throttled", "R2 throttled the storage request."],
  InternalError: ["service", "R2 reported an internal service error."],
  ServiceUnavailable: ["service", "The storage service is temporarily unavailable."],
  StorageConfigurationError: ["configuration", "Required private storage configuration is missing or invalid."],
} as const;
export type V5StorageDiagnostic = { category: string; safeReason: string; storageCode?: string; httpStatus?: number;
  slot?: string; objectKeyPresent: boolean; providerOutputRecoverable: boolean };
export function v5StorageDiagnostic(error: unknown, context: Pick<V5StorageDiagnostic, "slot" | "objectKeyPresent" | "providerOutputRecoverable">): V5StorageDiagnostic {
  let current = error; let selected: keyof typeof reasons | undefined; let httpStatus: number | undefined;
  let bodyReason: string | undefined;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    const value = current as Record<string, unknown>;
    for (const code of [value.name, value.Code, value.code]) if (typeof code === "string" && Object.hasOwn(reasons, code)) selected = code as keyof typeof reasons;
    const status = (value.$metadata as { httpStatusCode?: unknown } | undefined)?.httpStatusCode;
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) httpStatus = status;
    // Match locally, but emit fixed text only.
    if (typeof value.message === "string") {
      if (/body.*(?:already (?:used|consumed)|unusable)|stream.*already.*consumed/i.test(value.message)) bodyReason = "The request body stream was already consumed.";
      if (/unsupported.*body|body.*(?:must be|expected).*(?:Buffer|Uint8Array|stream)/i.test(value.message)) bodyReason = "The storage SDK rejected the request body type.";
      if (/content.?length.*mismatch|body.*length.*mismatch/i.test(value.message)) bodyReason = "The request body did not match its declared length.";
    }
    current = value.cause;
  }
  const [category, safeReason] = selected ? reasons[selected] : bodyReason ? ["body", bodyReason] :
    ["unclassified", "The storage operation failed without a recognized safe diagnostic; commit is uncertain."];
  return { category, safeReason, ...(selected ? { storageCode: selected } : {}), ...(httpStatus ? { httpStatus } : {}), ...context };
}
