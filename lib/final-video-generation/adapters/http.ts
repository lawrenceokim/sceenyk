import "server-only";
import { FinalVideoError, type ProviderReceipt } from "../contract";
import type { ProviderContext } from "../providers";

export function credential(name: "FAL_KEY" | "ELEVENLABS_API_KEY") {
  const value = process.env[name]?.trim();
  if (!value || process.env[`NEXT_PUBLIC_${name}`]) throw new FinalVideoError("FINAL_PROVIDER_CONFIGURATION", 503);
  return value;
}
export function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new FinalVideoError("FINAL_PROVIDER_RESPONSE");
  return value;
}
export async function boundedBytes(response: Response, maximum = 256 * 1024 * 1024) {
  if (!response.ok || !response.body) throw new FinalVideoError("FINAL_OUTPUT_UNAVAILABLE");
  const length = response.headers.get("content-length");
  if (length && Number(length) > maximum) { await response.body.cancel(); throw new FinalVideoError("FINAL_OUTPUT_TOO_LARGE"); }
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > maximum) throw new FinalVideoError("FINAL_OUTPUT_TOO_LARGE"); parts.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(parts, size);
}
export async function jsonRequest(url: string, init: RequestInit, context: ProviderContext): Promise<Record<string, unknown>> {
  if (init.method === "POST" && context.replayResponse) {
    await context.preserveResponse?.(context.replayResponse); return JSON.parse(context.replayResponse.toString("utf8"));
  }
  let response: Response;
  try { response = await fetch(url, { ...init, cache: "no-store", redirect: "error",
    signal: AbortSignal.any([context.signal, AbortSignal.timeout(180_000)]) }); }
  catch { throw new FinalVideoError("FINAL_UNCERTAIN_PROVIDER_OUTCOME"); }
  const requestId = response.headers.get("request-id");
  if (init.method === "POST" && new URL(url).hostname === "api.elevenlabs.io" && requestId && /^[a-zA-Z0-9_-]{1,200}$/.test(requestId)) {
    const cost = response.headers.get("character-cost");
    await context.received({ requestId, usage: { providerCharacterCost: cost && /^\d+(\.\d+)?$/.test(cost) ? cost : null } });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new FinalVideoError(response.status >= 500 ? "FINAL_UNCERTAIN_PROVIDER_OUTCOME" :
      response.status === 429 ? "FINAL_PROVIDER_RATE_LIMIT" : "FINAL_PROVIDER_REJECTED");
  }
  let value: unknown;
  try { const bytes = await boundedBytes(response, 48 * 1024 * 1024);
    if (init.method === "POST") await context.preserveResponse?.(bytes);
    value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new FinalVideoError("FINAL_UNCERTAIN_PROVIDER_OUTCOME"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FinalVideoError("FINAL_PROVIDER_RESPONSE");
  return value as Record<string, unknown>;
}
export function outputUrl(value: unknown) {
  if (typeof value !== "string") throw new FinalVideoError("FINAL_PROVIDER_RESPONSE");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !(url.hostname === "fal.media" || url.hostname.endsWith(".fal.media") || url.hostname === "storage.googleapis.com"))
    throw new FinalVideoError("FINAL_OUTPUT_HOST_BLOCKED");
  return url.href;
}
function queueUrl(value: unknown, requestId?: string) {
  if (typeof value !== "string") throw new FinalVideoError("FINAL_PROVIDER_RESPONSE");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "queue.fal.run" || url.username || url.password || url.port)
    throw new FinalVideoError("FINAL_PROVIDER_RESPONSE");
  if (requestId && !url.pathname.match(new RegExp(`/requests/${safeId(requestId)}(?:/status)?$`))) throw new FinalVideoError("FINAL_PROVIDER_RESPONSE");
  return url.href;
}
export async function submitFal(endpoint: string, payload: unknown, context: ProviderContext): Promise<ProviderReceipt> {
  const response = await jsonRequest(`https://queue.fal.run/${endpoint}`, { method: "POST",
    headers: { Authorization: `Key ${credential("FAL_KEY")}`, "Content-Type": "application/json",
      "X-Fal-No-Retry": "1", "x-app-fal-disable-fallback": "true", "X-Fal-Request-Start-Timeout": "300" }, body: JSON.stringify(payload) }, context);
  const receipt: ProviderReceipt = { requestId: safeId(response.request_id), result: {
    statusLocator: queueUrl(response.status_url, safeId(response.request_id)), resultLocator: queueUrl(response.response_url, safeId(response.request_id)) } };
  await context.received(receipt); return receipt;
}
export async function retrieveFal(receipt: ProviderReceipt, context: ProviderContext): Promise<Buffer | null> {
  const result = receipt.result as { statusLocator?: string; resultLocator?: string; downloadLocator?: string } | undefined;
  const headers = { Authorization: `Key ${credential("FAL_KEY")}` };
  let download = result?.downloadLocator;
  if (!download) {
    const state = await jsonRequest(queueUrl(result?.statusLocator, receipt.requestId), { method: "GET", headers }, context);
    if (state.status === "IN_QUEUE" || state.status === "IN_PROGRESS") return null;
    if (state.status !== "COMPLETED") throw new FinalVideoError("FINAL_PROVIDER_FAILED");
    const response = await jsonRequest(queueUrl(result?.resultLocator, receipt.requestId), { method: "GET", headers }, context);
    const file = response.video as { url?: string } | undefined;
    download = outputUrl(file?.url);
    await context.received({ ...receipt, result: { ...result, downloadLocator: download } });
  }
  // Never forward provider credentials to media hosts or follow redirects.
  const response = await fetch(outputUrl(download), { cache: "no-store", redirect: "error",
    signal: AbortSignal.any([context.signal, AbortSignal.timeout(120_000)]) });
  return boundedBytes(response);
}
