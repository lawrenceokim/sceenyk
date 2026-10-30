import "server-only";
import { canonicalJson } from "@/lib/video-generation-package/builder";
import { z } from "zod";
import { paidIntentSchema, type PaidIntent, type ProviderObservation } from "../runtime-contract";
import { assertV3Transport, type v3TransportConfig } from "../runtime-config";
import { higgsfieldModels, parseHiggsfieldAcceptance, prepareStatusObservation } from "./higgsfield";
import { v3Digest, v3BodyHash } from "../identity";

const models = new Set<string>(Object.values(higgsfieldModels));
export const exactBodyHash = v3BodyHash;
export class HiggsfieldTransportError extends Error {
  constructor(readonly code: string, readonly outcome: "rejected" | "unknown" | "observation_failed", readonly httpStatus: number | null = null,
    readonly correlationId: string | null = null) { super(code); }
}
export function normalizeHiggsfieldError(status: number, correlation: string | null, submission: boolean) {
  const safe = correlation && /^[a-zA-Z0-9_-]{1,200}$/.test(correlation) ? correlation : null;
  const rejected = [400, 401, 403, 404, 413, 415, 422, 423, 429].includes(status);
  return new HiggsfieldTransportError(`HIGGSFIELD_HTTP_${status}`, submission ? rejected ? "rejected" : "unknown" : "observation_failed", status, safe);
}
async function boundedJson(response: Response) {
  const reader = response.body?.getReader(); if (!reader) throw new Error("HIGGSFIELD_EMPTY_RESPONSE");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > 1024 * 1024) throw new Error("HIGGSFIELD_RESPONSE_TOO_LARGE"); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export class HiggsfieldV3Transport {
  constructor(private readonly config: ReturnType<typeof v3TransportConfig>, private readonly request: typeof fetch = fetch) {}
  private async json(url: string, method: "POST" | "GET", body: unknown, signal: AbortSignal, idempotency?: string) {
    let response: Response;
    try { response = await this.request(url, { method, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      headers: { Authorization: `Key ${this.config.credentials}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        ...(idempotency ? { "Idempotency-Key": idempotency } : {}) }, ...(method === "POST" ? { body: canonicalJson(body) } : {}) }); }
    catch { throw new HiggsfieldTransportError("HIGGSFIELD_NETWORK_OUTCOME_UNKNOWN", idempotency ? "unknown" : "observation_failed"); }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw normalizeHiggsfieldError(response.status, response.headers.get("x-correlation-id"), !!idempotency); }
    try { return { value: await boundedJson(response), correlationId: response.headers.get("x-correlation-id")?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 200) ?? null }; }
    catch { throw new HiggsfieldTransportError("HIGGSFIELD_RESPONSE_INVALID", idempotency ? "unknown" : "observation_failed"); }
  }
  async estimate(model: string, body: Record<string, unknown>, signal: AbortSignal) {
    if (!models.has(model) || !this.config.credentials || !this.config.accountScope) throw new Error("V3_ESTIMATE_CONFIG_REQUIRED");
    const response = await this.json(`https://api.higgsfield.ai/estimate/${model}`, "POST", body, signal);
    return { ...z.object({ usd: z.string().regex(/^\d+(?:\.\d+)?$/) }).parse(response.value), responseHash: exactBodyHash(response.value),
      correlationId: response.correlationId };
  }
  async submit(value: PaidIntent, signal: AbortSignal): Promise<ProviderObservation> {
    const intent = paidIntentSchema.parse(value); assertV3Transport(this.config, intent);
    const { hash, ...content } = intent;
    if (hash !== v3Digest("paid-intent", content) || intent.authorization.projectId !== intent.projectId || intent.authorization.packageId !== intent.packageId ||
      intent.authorization.packageHash !== intent.packageHash || intent.authorization.segmentUuid !== intent.segmentUuid || intent.authorization.model !== intent.model)
      throw new Error("V3_PAID_INTENT_BINDING_INVALID");
    if (!models.has(intent.model) || exactBodyHash(intent.body) !== intent.bodyHash || Date.parse(intent.deliveryExpiresAt) <= Date.now()) throw new Error("V3_INTENT_INVALID_OR_EXPIRED");
    const response = await this.json(`https://api.higgsfield.ai/${intent.model}`, "POST", intent.body, signal, intent.idempotencyKey);
    let acceptance;
    try { acceptance = parseHiggsfieldAcceptance(response.value); }
    catch { throw new HiggsfieldTransportError("HIGGSFIELD_ACCEPTANCE_INVALID", "unknown"); }
    return { requestId: acceptance.requestId, statusUrl: acceptance.statusUrl, status: "queued", cancelUrl: acceptance.cancelUrl, expiresAt: null, resultUrl: null,
      correlationId: response.correlationId, receiptHash: exactBodyHash(response.value), actualCostMicrousd: null };
  }
  async poll(known: ProviderObservation, signal: AbortSignal): Promise<ProviderObservation> {
    prepareStatusObservation(known.requestId, known.statusUrl);
    const response = await this.json(known.statusUrl, "GET", undefined, signal);
    const parsed = z.object({ request_id: z.uuid(), status: z.enum(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]),
      expires_at: z.iso.datetime({ offset: true }).nullish(), video: z.object({ url: z.url() }).nullish() }).parse(response.value);
    if (parsed.request_id !== known.requestId) throw new HiggsfieldTransportError("HIGGSFIELD_REQUEST_ID_MISMATCH", "observation_failed");
    return { ...known, status: parsed.status, resultUrl: parsed.video?.url ?? null, expiresAt: parsed.expires_at ?? null,
      correlationId: response.correlationId, receiptHash: exactBodyHash(response.value) };
  }
  reconcile(known: ProviderObservation, signal: AbortSignal) { return this.poll(known, signal); }
  async fetchCompletedResult(known: ProviderObservation, signal: AbortSignal) {
    if (known.status !== "completed" || !known.resultUrl) throw new Error("HIGGSFIELD_RESULT_UNAVAILABLE");
    if (known.expiresAt && Date.parse(known.expiresAt) <= Date.now()) throw new Error("HIGGSFIELD_RESULT_EXPIRED");
    const url = new URL(known.resultUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port ||
      !this.config.outputHosts.includes(url.hostname) || !/^[a-z0-9.-]+$/.test(url.hostname) || url.hostname === "localhost" || /^\d+\./.test(url.hostname))
      throw new Error("HIGGSFIELD_OUTPUT_HOST_UNAPPROVED");
    // No Authorization header is ever forwarded to output/CDN hosts; redirects are refused.
    const response = await this.request(url, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) });
    if (!response.ok || !response.body) throw new Error("HIGGSFIELD_DOWNLOAD_FAILED");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > 256 * 1024 * 1024) throw new Error("V3_RESULT_TOO_LARGE"); chunks.push(part.value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (!size) throw new Error("V3_RESULT_EMPTY"); return Buffer.concat(chunks, size);
  }
}
