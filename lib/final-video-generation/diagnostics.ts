import { z } from "zod";
import type { Operation, StageKind } from "./contract";

export const providerFailureSchema = z.object({
  httpStatus: z.number().int().min(100).max(599),
  providerRequestId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/).nullable(),
  providerCode: z.string().max(160).nullable(), message: z.string().max(1200),
  method: z.enum(["GET", "POST"]), bodyRetained: z.literal(false),
});
export type ProviderFailure = z.infer<typeof providerFailureSchema>;
export type StageFailure = { sceneNumber: number | null; stage: StageKind; provider: string; model: string;
  httpStatus: number | null; providerRequestId: string | null; providerCode: string | null; message: string };

export function redactProviderText(value: string, secrets: readonly string[] = []) {
  let safe = value;
  for (const secret of secrets) if (secret.length >= 4) safe = safe.replaceAll(secret, "[REDACTED]");
  return safe.replace(/https?(?::|%3a)(?:\/\/|%2f%2f)[^\s"<>]+/gi, "[REDACTED_URL]")
    .replace(/(?:Bearer|Basic|Key)\s+[a-zA-Z0-9_.+/=-]+/gi, "[REDACTED_CREDENTIAL]")
    .replace(/(?:xi-api-key|api[_-]?key|access[_-]?token|authorization|x-amz-[a-z-]+)["'\s:=]+[^\s,;"<>]+/gi, "[REDACTED_CREDENTIAL]")
    .replace(/\b(?:sk_|sk-|sb_secret_)[a-zA-Z0-9_-]+/g, "[REDACTED_CREDENTIAL]")
    .replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function providerFailure(status: number, method: "GET" | "POST", requestId: string | null, body: unknown, secrets: readonly string[] = []): ProviderFailure {
  const root = record(body), detail = record(root.detail), error = record(root.error);
  const code = detail.status ?? detail.code ?? error.code ?? root.code;
  const messages = [detail.message, error.message, root.message, typeof root.detail === "string" ? root.detail : null];
  if (Array.isArray(root.detail)) for (const issue of root.detail.slice(0, 8)) {
    const item = record(issue);
    const field = Array.isArray(item.loc) ? item.loc.filter(v => typeof v === "string" || typeof v === "number").join(".") : "";
    if (typeof item.msg === "string") messages.push(`${field ? `${field}: ` : ""}${item.msg}`);
  }
  return { httpStatus: status, method,
    providerRequestId: requestId && /^[a-zA-Z0-9_-]{1,200}$/.test(requestId) ? requestId : null,
    providerCode: typeof code === "string" ? redactProviderText(code, secrets).slice(0, 160) : null,
    message: redactProviderText(messages.filter((v): v is string => typeof v === "string").join("; "), secrets).slice(0, 1200)
      || "Provider returned an HTTP error without a usable structured reason.", bodyRetained: false };
}
export function safeRequestValue(value: unknown, secrets: readonly string[] = [], depth = 0): unknown {
  if (depth > 12) return "[OMITTED]";
  if (typeof value === "string") return redactProviderText(value, secrets).slice(0, 16000);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 64).map(item => safeRequestValue(item, secrets, depth + 1));
  return Object.fromEntries(Object.entries(record(value)).slice(0, 64).map(([key, item]) => [key,
    /(?:secret|token|authorization|api[_-]?key|audio_base|reference_audio_base)/i.test(key) ? "[REDACTED]" : safeRequestValue(item, secrets, depth + 1)]));
}
export function summarizeOperationFailure(operation: Operation): StageFailure {
  const parsed = providerFailureSchema.safeParse(operation.receipt?.failure);
  const failure = parsed.success ? parsed.data : null;
  const match = operation.scene_id?.match(/^scene-(\d+)$/);
  return { sceneNumber: match ? Number(match[1]) : null, stage: operation.kind,
    provider: operation.provider === "fal" ? "fal.ai" : redactProviderText(operation.provider).slice(0, 60),
    model: redactProviderText(operation.model).slice(0, 160), httpStatus: failure?.httpStatus ?? null,
    providerRequestId: failure?.providerRequestId ?? operation.request_id, providerCode: failure?.providerCode ? redactProviderText(failure.providerCode).slice(0, 160) : null,
    message: failure ? redactProviderText(failure.message).slice(0, 1200) : "The original provider HTTP status and error response were not retained. The rejection reason is unavailable." };
}
export function providerRejectionBlocksRecovery(code: string | null) {
  return code === "FINAL_PROVIDER_REJECTED" || code === "FINAL_PROVIDER_RATE_LIMIT";
}
export function voiceLabelValidationMessage(code: string | null) {
  const label = /^FINAL_VOICE_LABEL_VALUE_LIMIT:([a-zA-Z0-9_-]{1,50})$/.exec(code ?? "");
  return label ? `Voice binding blocked locally: label "${label[1]}" exceeds 50 characters.` : null;
}
