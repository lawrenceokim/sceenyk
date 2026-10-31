import "server-only";
import { z } from "zod";
import { readSpool, inspectImage, writeReferenceDiagnostics } from "./runtime-media";
import type { Task } from "./runtime-contract";
import type { ReferenceDiagnostics } from "./reference-status";

const safeId = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/).nullable().catch(null);
export const safeReferenceRequestId = (value: unknown) => safeId.parse(value);
const metadataSchema = z.object({ stage: z.string().regex(/^[a-z_]{1,50}$/),
  httpStatus: z.number().int().min(100).max(599).nullable(), requestId: safeId,
  errorCode: z.string().regex(/^[A-Z0-9_]{1,100}$/).nullable(),
  providerCode: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).nullable().optional() });
export type ReferenceStageMetadata = z.infer<typeof metadataSchema>;
export class ReferenceTaskError extends Error {
  constructor(code: string, readonly metadata: ReferenceStageMetadata, readonly knownRejected = false) { super(code); }
}
export async function recordReferenceStage(taskId: string, value: ReferenceStageMetadata) {
  // Best effort diagnostics must never turn a preserved successful image into a failed publication.
  try { await writeReferenceDiagnostics(taskId, metadataSchema.parse(value)); } catch { /* The task checkpoint retains the code/HTTP/request ID too. */ }
}
export function referenceStageError(error: unknown, stage: string, httpStatus: number | null, requestId: string | null) {
  if (error instanceof ReferenceTaskError) return error;
  const candidate = error && typeof error === "object" ? error as { status?: unknown; requestID?: unknown; request_id?: unknown; code?: unknown } : {};
  if (stage === "provider") {
    if (typeof candidate.status === "number" && candidate.status >= 100 && candidate.status <= 599) httpStatus = candidate.status;
    requestId = safeId.parse(candidate.requestID ?? candidate.request_id ?? requestId);
  }
  const knownRejected = stage === "provider" && httpStatus !== null && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408;
  const errorType = error instanceof Error && ["APIConnectionTimeoutError", "APIConnectionError", "APIUserAbortError"].includes(error.constructor.name) ? error.constructor.name : null;
  const codes: Record<string, string> = { source: "V3_REFERENCE_SOURCE_READ_FAILED", provider: knownRejected ? "V3_OPENAI_REFERENCE_REQUEST_FAILED" : "V3_OPENAI_REFERENCE_OUTCOME_UNKNOWN",
    response_receive: "V3_OPENAI_REFERENCE_RESPONSE_INCOMPLETE", response_save: "V3_REFERENCE_RESPONSE_SAVE_FAILED", response_parse: "V3_REFERENCE_RESPONSE_PARSE_FAILED", image_validation: "V3_REFERENCE_IMAGE_VALIDATION_FAILED",
    image_save: "V3_REFERENCE_IMAGE_SAVE_FAILED", storage: "V3_REFERENCE_STORAGE_FAILED", publication: "V3_REFERENCE_PUBLICATION_FAILED" };
  const explicit = error instanceof Error && /^V3_[A-Z0-9_]{1,97}$/.test(error.message) ? error.message : null;
  return new ReferenceTaskError(explicit ?? codes[stage] ?? "V3_REFERENCE_LOCAL_PROCESSING_FAILED", {
    stage, httpStatus, requestId, errorCode: explicit ?? codes[stage] ?? "V3_REFERENCE_LOCAL_PROCESSING_FAILED",
    providerCode: typeof candidate.code === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(candidate.code) ? candidate.code : errorType,
  }, knownRejected);
}

export async function savedReferenceResult(taskId: string) {
  const [raw, imageBytes] = await Promise.all([readSpool(taskId, "openai-response.json"), readSpool(taskId, "image.png")]);
  let requestId: string | null = null, httpStatus: number | null = null, responseError: string | null = null;
  let encoded: string | null = null;
  if (raw) {
    try {
      const saved: unknown = JSON.parse(raw.toString("utf8"));
      const wrapper = z.object({ requestId: safeId.optional(), httpStatus: z.number().int().min(100).max(599).nullable().optional(),
        response: z.unknown().optional(), responseText: z.string().optional() }).safeParse(saved);
      if (wrapper.success) {
        requestId = wrapper.data.requestId ?? null; httpStatus = wrapper.data.httpStatus ?? null;
        const response = wrapper.data.responseText === undefined ? wrapper.data.response : JSON.parse(wrapper.data.responseText);
        const parsed = z.object({ data: z.array(z.object({ b64_json: z.string() })).length(1) }).safeParse(response);
        if (parsed.success) encoded = parsed.data.data[0].b64_json; else responseError = "V3_REFERENCE_SAVED_RESPONSE_UNUSABLE";
      } else responseError = "V3_REFERENCE_SAVED_RESPONSE_UNUSABLE";
    } catch { responseError = "V3_REFERENCE_RESPONSE_PARSE_FAILED"; }
  }
  // A previously validated image can complete storage/publication even if the raw response later became unusable.
  if (imageBytes) {
    try {
      if (!imageBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("V3_REFERENCE_IMAGE_VALIDATION_FAILED");
      const image = { ...(await inspectImage(imageBytes)), bytes: imageBytes };
      return { raw, imageBytes, image, requestId, httpStatus, responseError, recoveredFrom: "saved_image" as const };
    }
    catch { responseError ??= "V3_REFERENCE_IMAGE_VALIDATION_FAILED"; }
  }
  if (encoded && encoded.length <= 30 * 1024 * 1024 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    try { const image = await inspectImage(Buffer.from(encoded, "base64")); return { raw, imageBytes, image, requestId, httpStatus, responseError, recoveredFrom: "saved_response" as const }; }
    catch { responseError = "V3_REFERENCE_IMAGE_VALIDATION_FAILED"; }
  } else if (encoded !== null) responseError = "V3_REFERENCE_SAVED_RESPONSE_UNUSABLE";
  return { raw, imageBytes, image: null, requestId, httpStatus, responseError, recoveredFrom: null };
}

export async function referenceDiagnostics(task: Pick<Task, "id" | "kind" | "input" | "status" | "provider_started" | "error_code">, current: boolean, durableMetadata?: unknown): Promise<ReferenceDiagnostics> {
  const result = await savedReferenceResult(task.id);
  let metadata: ReferenceStageMetadata | null = null;
  const file = await readSpool(task.id, "reference-diagnostics.json");
  if (file) { try { const parsed = metadataSchema.safeParse(JSON.parse(file.toString("utf8"))); if (parsed.success) metadata = parsed.data; } catch { /* Malformed diagnostics never authorize recovery. */ } }
  const durable = metadataSchema.safeParse(durableMetadata);
  if (durable.success) metadata = durable.data;
  const terminal = ["failed", "reconciliation_required"].includes(task.status);
  const errorCode = task.error_code ?? metadata?.errorCode ?? result.responseError;
  const httpStatus = metadata?.httpStatus ?? result.httpStatus;
  const recoveryAvailable = terminal && current && !!result.image;
  const category: ReferenceDiagnostics["category"] = task.status === "done" ? "ready" : !terminal ? "pending" :
    errorCode === "V3_REFERENCE_RESPONSE_SAVE_FAILED" ? "response_save" : metadata?.stage === "source" && !result.image ? "source" :
    result.image && !current ? "stale" : errorCode?.includes("STORAGE") || errorCode?.includes("PUBLICATION") || errorCode === "V3_PRIVATE_SAVE_FAILED" ? "storage" :
    result.responseError?.includes("VALIDATION") || errorCode?.includes("VALIDATION") ? "validation" :
    result.image ? "saved" : httpStatus && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 ? "provider_failed" :
    result.raw || result.imageBytes ? "unusable" : task.provider_started ? "unknown" : "unusable";
  return { provider: "openai", model: typeof task.input.model === "string" && /^[a-zA-Z0-9._:-]{1,200}$/.test(task.input.model) && !/^sk-/i.test(task.input.model) ? task.input.model : null,
    taskId: task.id, stage: metadata?.stage ?? (task.provider_started ? "after_provider_intent" : "not_started"), httpStatus,
    requestId: metadata?.requestId ?? result.requestId, providerCode: metadata?.providerCode ?? null, errorCode, responseSaved: !!result.raw, imageSaved: !!result.imageBytes,
    imageOutputAvailable: !!result.image, recoveryAvailable, canStartNew: terminal && (!result.image || !current) && !task.input.referenceCleanupHold, category };
}
