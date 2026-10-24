import { z } from "zod";
import { characterDiagnosticSchema, type CharacterDiagnostic, type CharacterProviderOperation, type CharacterOutputReason,
  characterOutputMetadataSchema, type CharacterOutputMetadata } from "./contract";
import { CharacterSheetError } from "./provider";

export function characterOutputError(reason: CharacterOutputReason, operation: CharacterProviderOperation,
  extra: Partial<Omit<CharacterDiagnostic, "reason" | "operation" | "category">> = {}) {
  return new CharacterSheetError("CHARACTER_OUTPUT_INVALID", false, false,
    characterDiagnosticSchema.parse({ operation, httpStatus: null, category: "invalid_media", ...extra, reason }));
}
export function characterOutputMetadata(body: unknown, httpStatus?: number): CharacterOutputMetadata {
  const record = asRecord(body);
  const known = characterOutputMetadataSchema.shape.fields.element;
  const keys = Object.keys(record);
  const fields = keys.flatMap(key => { const parsed = known.safeParse(key); return parsed.success ? [parsed.data] : []; });
  const image = Array.isArray(record.images) ? asRecord(record.images[0]) : {};
  let outputHost: string | undefined;
  try {
    if (typeof image.url === "string") {
      const candidate = new URL(image.url).hostname;
      if (characterOutputMetadataSchema.shape.outputHost.unwrap().safeParse(candidate).success) outputHost = candidate;
    }
  } catch { /* A malformed URL remains an absent host, never a raw logged value. */ }
  const expiresAt = characterOutputMetadataSchema.shape.expiresAt.unwrap().safeParse(record.expires_at);
  const providerStatus = characterOutputMetadataSchema.shape.providerStatus.unwrap().safeParse(record.status);
  const providerRequestId = z.uuid().safeParse(record.request_id ?? record.id);
  return characterOutputMetadataSchema.parse({ fields, ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(providerRequestId.success ? { providerRequestId: providerRequestId.data } : {}),
    otherFieldCount: Math.min(10_000, keys.length - fields.length),
    imagesArray: Array.isArray(record.images), imageCount: Array.isArray(record.images) ? Math.min(1000, record.images.length) : null,
    outputsArray: Array.isArray(record.outputs), outputCount: Array.isArray(record.outputs) ? Math.min(1000, record.outputs.length) : null,
    imageUrlPresent: typeof image.url === "string" && image.url.length > 0,
    ...(outputHost ? { outputHost } : {}), ...(expiresAt.success ? { expiresAt: expiresAt.data } : {}),
    ...(providerStatus.success ? { providerStatus: providerStatus.data } : {}) });
}

// This projection is the ONLY provider-error data that may be persisted/logged.
// No raw detail, arbitrary provider code, headers, credentials or URL survives.
export function characterProviderDiagnostic(operation: CharacterProviderOperation, httpStatus: number | null,
  body: unknown, headers?: Headers): CharacterDiagnostic {
  const record = asRecord(body);
  const nested = asRecord(record.error);
  const rawCode = typeof record.code === "string" ? record.code : typeof nested.code === "string" ? nested.code : "";
  const normalized = rawCode.toUpperCase().replaceAll("-", "_");
  const codeSchema = characterDiagnosticSchema.shape.providerCode.unwrap();
  const parsedCode = codeSchema.safeParse(normalized);
  const providerCode = parsedCode.success ? parsedCode.data : undefined;
  const detail = typeof record.detail === "string" ? record.detail : typeof nested.message === "string" ? nested.message :
    typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : "";
  // Text is only a diagnostic hint and safe user-message classification. HTTP
  // acceptance rules still fence replay; text never grants submission/charging
  // authority, establishes acceptance or enables automatic retries.
  const hint = detail.slice(0, 2048).toLowerCase();
  let category: CharacterDiagnostic["category"] = httpStatus === null ? "transport_error" : httpStatus === 401 ? "invalid_credentials" :
    httpStatus === 403 ? "access_denied" : httpStatus === 429 ? "rate_limited" :
    httpStatus === 423 || httpStatus === 404 ? "model_unavailable" : httpStatus >= 500 ? "provider_unavailable" : "request_rejected";
  if (providerCode === "INVALID_CREDENTIALS" || /invalid (credentials|api key|api secret)|missing (credentials|api key)/.test(hint)) category = "invalid_credentials";
  else if (providerCode === "INSUFFICIENT_BALANCE" || /insufficient (balance|funds|credits)|balance (is )?too low/.test(hint)) category = "balance_restricted";
  else if (["ACCOUNT_RESTRICTED", "VERIFICATION_REQUIRED"].includes(providerCode ?? "") || /account.{0,30}(restricted|suspended)|verification required/.test(hint)) category = "account_restricted";
  else if (["MODEL_UNAVAILABLE", "MODEL_NOT_FOUND"].includes(providerCode ?? "") || /model.{0,40}(unavailable|not available|not found|disabled|blocked|not ready)/.test(hint)) category = "model_unavailable";
  else if (["INPUT_IMAGE_UNREACHABLE", "IMAGE_DOWNLOAD_FAILED"].includes(providerCode ?? "") || /(?:image|input).{0,40}(unreachable|expired|not accessible)|(?:failed|unable) to (download|fetch).{0,30}(image|input)/.test(hint)) category = "input_image_unavailable";
  const providerRequestId = z.uuid().safeParse(record.request_id);
  const correlationId = z.uuid().safeParse(headers?.get("x-correlation-id"));
  return characterDiagnosticSchema.parse({ operation, httpStatus, category,
    ...(body && typeof body === "object" ? { responseMetadata: characterOutputMetadata(body, httpStatus ?? undefined) } : {}),
    ...(providerCode ? { providerCode } : {}), ...(providerRequestId.success ? { providerRequestId: providerRequestId.data } : {}),
    ...(correlationId.success ? { correlationId: correlationId.data } : {}) });
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
