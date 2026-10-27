import { z } from "zod";
import { validationReportSchema, type StoryboardValidationReport } from "./validation-diagnostics";

export const safeResponseId = z.string().regex(/^resp_[A-Za-z0-9_-]{1,180}$/);
export const safeRequestId = z.string().regex(/^req_[A-Za-z0-9_-]{1,180}$/);
export const storyboardDiagnosticSchema = z.strictObject({
  phase: z.enum(["claim_validation", "configuration", "asset_read", "headers", "provider", "stream", "response_capture", "validation", "database", "local_recovery", "deleting", "recovery", "retrieval"]),
  category: z.enum(["timeout", "connection", "aborted", "authentication", "rate_limit", "invalid_request", "provider_error", "stream_interrupted", "incomplete", "refused", "storage", "validation", "database", "unknown"]),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  providerCode: z.enum(["invalid_api_key", "insufficient_quota", "rate_limit_exceeded", "model_not_found", "invalid_request_error", "context_length_exceeded", "server_error", "invalid_prompt", "unknown"]).nullable(),
  requestId: safeRequestId.nullable(), responseId: safeResponseId.nullable(), clientRequestId: z.uuid().nullable(),
  providerStatus: z.enum(["queued", "in_progress", "completed", "failed", "incomplete", "cancelled", "unknown"]).nullable(),
  validation: validationReportSchema.optional(),
});
export type StoryboardDiagnostic = z.infer<typeof storyboardDiagnosticSchema>;
export const providerMetaSchema = z.strictObject({
  clientRequestId: z.uuid(), model: z.string().regex(/^[a-zA-Z0-9._:-]{1,200}$/), stored: z.boolean(),
  requestId: safeRequestId.nullable(), responseId: safeResponseId.nullable(),
  providerStatus: z.enum(["queued", "in_progress", "completed", "failed", "incomplete", "cancelled", "unknown"]),
  httpStatus: z.number().int().min(100).max(599).nullable(),
});
export type StoryboardProviderMeta = z.infer<typeof providerMetaSchema>;
export type StoryboardRecoveryInfo = {
  availability: "saved_response" | "provider_retrievable" | "unavailable" | "checking_failed";
  diagnostic: StoryboardDiagnostic | null; metadata: StoryboardProviderMeta | null;
  receipt?: { requestId: string | null; responseId: string | null; status: string | null };
  validations?: StoryboardValidationReport[];
};
export function recoveryOnly(attempts: number) { return attempts > 1; }
export function canCreateStoryboardRequest(attempts: number, recovery: boolean, alreadySubmitted: boolean) {
  return attempts === 1 && !recovery && !alreadySubmitted;
}
export function canValidateStoryboardResponse(receipt: Record<string, unknown> | undefined) {
  return receipt?.status === "completed" && receipt.refused !== true;
}
export function storyboardRecoveryMessage(info: StoryboardRecoveryInfo) {
  if (info.validations?.some(report => report.valid)) return "A saved response passes local validation. Retry saves that existing work without contacting OpenAI.";
  if (info.validations?.length && info.validations.every(report => !report.valid)) return "The saved responses are intact, but still fail validation after safe format normalization. Review the exact errors below. Recovery will not invent or shorten content, change timing, or contact OpenAI. Keep this record unless you explicitly choose to reject it.";
  if (info.availability === "saved_response") return "Saved response bytes are available, but no completed candidate passed local inspection. Retry remains unavailable. Check provider status and private recovery file access; the originals are preserved.";
  if (info.availability === "provider_retrievable") return "A stored response ID is available, but no local output was found. Saved-work Retry cannot contact OpenAI. Keep this record for explicit retrieval investigation.";
  if (info.availability === "checking_failed") return "Local recovery files could not be checked. Check private directory access before recovery; retry never generates new output.";
  return "No saved output or retrievable response ID is available. The previous request's completion and billing cannot be confirmed from this record. Automatic resubmission is blocked. Keep the record for investigation, or explicitly Reject and Delete before a new generation.";
}
