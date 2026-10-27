import "server-only";
import OpenAI from "openai";
import { storyboardDiagnosticSchema, type StoryboardDiagnostic, type StoryboardProviderMeta } from "./recovery-contract";

export function storyboardProviderDiagnostic(error: unknown, phase: StoryboardDiagnostic["phase"], meta?: StoryboardProviderMeta): StoryboardDiagnostic {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof value.status === "number" && value.status >= 100 && value.status <= 599 ? value.status : meta?.httpStatus ?? null;
  const request = value.requestID ?? meta?.requestId;
  const category: StoryboardDiagnostic["category"] = error instanceof OpenAI.APIConnectionTimeoutError || value.name === "TimeoutError" ? "timeout" :
    error instanceof OpenAI.APIUserAbortError || value.name === "AbortError" ? "aborted" :
      error instanceof OpenAI.APIConnectionError ? "connection" : status === 401 || status === 403 ? "authentication" : status === 429 ? "rate_limit" :
        status !== null && status >= 400 && status < 500 ? "invalid_request" : phase === "response_capture" ? "storage" :
          phase === "validation" ? "validation" : phase === "database" ? "database" : phase === "stream" ? "stream_interrupted" : "provider_error";
  const parsed = storyboardDiagnosticSchema.shape.providerCode.safeParse(value.code);
  return storyboardDiagnosticSchema.parse({ phase, category, httpStatus: status,
    providerCode: value.code == null ? null : parsed.success ? parsed.data : "unknown",
    requestId: typeof request === "string" && /^req_[A-Za-z0-9_-]{1,180}$/.test(request) ? request : null,
    responseId: meta?.responseId ?? null, clientRequestId: meta?.clientRequestId ?? null, providerStatus: meta?.providerStatus ?? null });
}

export class StoryboardProviderFailure extends Error {
  constructor(readonly diagnostic: StoryboardDiagnostic) { super("STORYBOARD_PROVIDER_FAILED"); }
}
