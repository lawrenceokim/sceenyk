import "server-only";
import { z } from "zod";
import { getCharacterSheetConfig } from "./config";
import { characterViewPrompt, characterPromptGeneration } from "./prompts";
import { CharacterSheetError, type CharacterSheetProvider, type ProviderStatus } from "./provider";
import type { CharacterProviderOperation, CharacterView } from "./contract";
import { characterProviderDiagnostic, characterOutputError, characterOutputMetadata } from "./diagnostics";
import { validateCharacterOutputUrl } from "./output-validation";
import { currentGenerationSchema } from "./generation-contract";
import { v5Generation, v5ProviderPayload } from "@/lib/character-v5/contract";
import { logV5BackPayload } from "@/lib/character-v5/back-diagnostics";
import type { V5Candidate } from "@/lib/character-v5/contract";

const apiOrigin = "https://api.higgsfield.ai";
const receiptSchema = z.object({ request_id: z.uuid(), status_url: z.url() });
const identitySchema = z.object({ id: z.uuid(), status: z.enum(["not_ready", "queued", "in_progress", "completed", "failed"]), error: z.unknown().optional() });
const statusSchema = z.object({ request_id: z.uuid(), status: z.enum(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]),
  images: z.array(z.object({ url: z.url() })).optional(), error: z.unknown().optional() });

export class HiggsfieldSoul2CharacterSheetProvider implements CharacterSheetProvider {
  private readonly config = getCharacterSheetConfig();
  readonly model = this.config.model;

  private async request(operation: CharacterProviderOperation, path: string, signal: AbortSignal, body?: unknown, key?: string): Promise<{ body: unknown; httpStatus: number }> {
    let response: Response;
    try {
      response = await fetch(`${apiOrigin}${path}`, {
        method: body === undefined ? "GET" : "POST", redirect: "error", cache: "no-store",
        headers: { Authorization: `Key ${this.config.keyId}:${this.config.secret}`, "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
    } catch { throw new CharacterSheetError("CHARACTER_PROVIDER_FAILED", body === undefined, false,
      characterProviderDiagnostic(operation, null, null)); }
    if (!response.ok) {
      let errorBody: unknown;
      try { errorBody = JSON.parse((await readBounded(response, 16 * 1024)).toString("utf8")); }
      catch { /* Missing/oversized/unstructured error text is never logged. */ }
      const diagnostic = characterProviderDiagnostic(operation, response.status, errorBody, response.headers);
      const rejected = [400, 401, 403, 422, 429].includes(response.status);
      if (diagnostic.category === "input_image_unavailable") throw new CharacterSheetError("CHARACTER_STORAGE_FAILED",
        body === undefined || rejected, rejected, diagnostic);
      if ([401, 403].includes(response.status)) throw new CharacterSheetError("CHARACTER_AUTH_FAILED", true, true, diagnostic);
      if (response.status === 429) throw new CharacterSheetError("CHARACTER_RATE_LIMITED", true, true, diagnostic);
      if (response.status === 404 && body === undefined) throw new CharacterSheetError("CHARACTER_OUTPUT_INVALID", false, false,
        { ...diagnostic, reason: "CHARACTER_PROVIDER_STATUS_NOT_FOUND" });
      // Only definite pre-acceptance rejection is safe to resubmit. Never log bodies.
      throw new CharacterSheetError("CHARACTER_PROVIDER_FAILED", body === undefined && response.status >= 500, rejected, diagnostic);
    }
    try {
      const bytes = await readBounded(response, 256 * 1024);
      return { body: JSON.parse(bytes.toString("utf8")), httpStatus: response.status };
    } catch { throw characterOutputError("CHARACTER_PROVIDER_SCHEMA_INVALID", operation, { httpStatus: response.status }); }
  }

  async createIdentity(name: string, sourceUrl: string, signal: AbortSignal) {
    const response = await this.request("identity_create", "/v1/custom-references", signal,
      { name, model_version: "v2", input_images: [{ type: "image_url", image_url: sourceUrl }] });
    const result = parseProviderPayload(identitySchema, response, "identity_create");
    return { id: result.id, responseMetadata: characterOutputMetadata(response.body, response.httpStatus) };
  }
  async identityStatus(id: string, signal: AbortSignal): Promise<ProviderStatus> {
    const response = await this.request("identity_status", `/v1/custom-references/${z.uuid().parse(id)}`, signal);
    const result = parseProviderPayload(identitySchema, response, "identity_status");
    const metadata = characterOutputMetadata(response.body, response.httpStatus);
    if (result.id !== id) throw characterOutputError("CHARACTER_PROVIDER_RESPONSE_ID_MISMATCH", "identity_status", {
      httpStatus: response.httpStatus, responseMetadata: metadata });
    return { state: result.status === "completed" ? "completed" : result.status === "failed" ? "failed" : "pending",
      outputMetadata: metadata,
      ...(result.status === "failed" ? { diagnostic: characterProviderDiagnostic("identity_status", response.httpStatus, response.body) } : {}) };
  }
  async submitView(input: Parameters<CharacterSheetProvider["submitView"]>[0], signal: AbortSignal) {
    const recorded = currentGenerationSchema.safeParse(input.generation);
    if (!recorded.success) throw characterOutputError("CHARACTER_PROMPT_CONTRACT_MISMATCH", "view_submit", { view: input.view });
    const generation = characterPromptGeneration(input.view, input.name, input.wardrobe, input.analysis, recorded.data.reference, input.identityId, input.seed, recorded.data.upstream);
    if (!recorded.success || JSON.stringify(generation) !== JSON.stringify(recorded.data)) throw characterOutputError("CHARACTER_PROMPT_CONTRACT_MISMATCH", "view_submit", { view: input.view });
    console.info("UGC_CHARACTER_VIEW_DISPATCH", { slot: input.view, promptVersion: generation.promptVersion,
      contractVersion: generation.contractVersion, revision: generation.revision, batchSize: generation.batchSize });
    const response = await this.request("view_submit", `/${this.model}`, signal, {
      prompt: characterViewPrompt(input.view, input.name, input.wardrobe, input.analysis),
      image_url: z.url().parse(input.imageUrl),
      custom_reference_id: z.uuid().parse(input.identityId), custom_reference_strength: 1,
      batch_size: generation.batchSize, resolution: generation.resolution, aspect_ratio: generation.aspectRatio,
      enhance_prompt: generation.enhancePrompt, seed: input.seed,
    }, input.key);
    const result = parseProviderPayload(receiptSchema, response, "view_submit");
    validateStatusUrl(result.status_url, result.request_id);
    return { id: result.request_id, statusUrl: result.status_url,
      responseMetadata: characterOutputMetadata(response.body, response.httpStatus) };
  }
  async submitManualView(input: { slot: "face" | "back" | "front_source"; imageUrl: string; soulId: string | null; key: string;
    source?: V5Candidate["input_asset"] }, signal: AbortSignal) {
    const generation = v5Generation(input.slot, input.soulId);
    if (generation.soulId) z.uuid().parse(generation.soulId);
    const payload = v5ProviderPayload(generation, z.url().parse(input.imageUrl));
    if (input.slot === "back") logV5BackPayload(this.model, input.key, payload, input.source);
    const response = await this.request("view_submit", `/${this.model}`, signal, payload, input.key);
    const result = parseProviderPayload(receiptSchema, response, "view_submit");
    validateStatusUrl(result.status_url, result.request_id);
    return { id: result.request_id, statusUrl: result.status_url, generation };
  }
  async viewStatus(id: string, statusUrl: string, signal: AbortSignal, view: CharacterView): Promise<ProviderStatus> {
    const path = validateStatusUrl(statusUrl, id);
    const response = await this.request("view_status", path, signal);
    const result = parseProviderPayload(statusSchema, response, "view_status");
    const metadata = characterOutputMetadata(response.body, response.httpStatus);
    if (result.request_id !== id) throw characterOutputError("CHARACTER_PROVIDER_RESPONSE_ID_MISMATCH", "view_status", {
      httpStatus: response.httpStatus, responseMetadata: metadata, view });
    if (result.status === "completed") {
      const missing = { front: "CHARACTER_FRONT_OUTPUT_MISSING", back: "CHARACTER_BACK_OUTPUT_MISSING", face: "CHARACTER_FACE_OUTPUT_MISSING" } as const;
      if (result.images?.length !== 1) throw characterOutputError(missing[view], "view_status", {
        httpStatus: response.httpStatus, responseMetadata: metadata, providerRequestId: id, view });
      return { state: "completed", imageUrl: result.images[0].url, outputMetadata: metadata };
    }
    const failed = ["failed", "nsfw", "canceled"].includes(result.status);
    return { state: failed ? "failed" : "pending", outputMetadata: metadata,
      ...(failed ? { diagnostic: characterProviderDiagnostic("view_status", response.httpStatus, response.body) } : {}) };
  }
  async downloadImage(url: string, signal: AbortSignal) {
    const target = validateCharacterOutputUrl(url, this.config.outputHosts);
    // Output media never receives API credentials. Exact operator-reviewed CDN hosts;
    // no redirects, arbitrary URLs, private IPs or browser-supplied targets.
    let response: Response;
    try { response = await fetch(target, { redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) }); }
    catch { throw characterOutputError("CHARACTER_OUTPUT_DOWNLOAD_FAILED", "output_download", { outputHost: target.hostname }); }
    const rawMime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const contentType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(rawMime) && rawMime.length <= 80 ? rawMime : null;
    const media = { httpStatus: response.status, contentType, sizeBytes: 0, decode: "not_attempted" as const };
    if (!response.ok) {
      await response.body?.cancel(); throw characterOutputError("CHARACTER_OUTPUT_DOWNLOAD_FAILED", "output_download", {
        httpStatus: response.status, outputHost: target.hostname, media });
    }
    if (!contentType || !/^image\/(png|jpeg|webp)$/.test(contentType)) {
      await response.body?.cancel(); throw characterOutputError("CHARACTER_OUTPUT_MIME_INVALID", "output_download", {
        httpStatus: response.status, outputHost: target.hostname, media });
    }
    const bytes = await readBounded(response, 20 * 1024 * 1024, "output_download", target.hostname, contentType);
    return { bytes, media: { ...media, sizeBytes: bytes.length } };
  }
}
function validateStatusUrl(value: string, id: string) {
  z.uuid().parse(id);
  const url = new URL(value);
  if (url.origin !== apiOrigin || url.pathname !== `/requests/${id}/status` || url.search || url.hash || url.username || url.password) {
    throw characterOutputError("CHARACTER_OUTPUT_URL_INVALID", "view_status");
  }
  return url.pathname;
}
function parseProviderPayload<T>(schema: z.ZodType<T>, response: { body: unknown; httpStatus: number }, operation: CharacterProviderOperation): T {
  const parsed = schema.safeParse(response.body);
  if (!parsed.success) throw characterOutputError("CHARACTER_PROVIDER_SCHEMA_INVALID", operation, {
    httpStatus: response.httpStatus, responseMetadata: characterOutputMetadata(response.body, response.httpStatus) });
  return parsed.data;
}
async function readBounded(response: Response, limit: number, operation: CharacterProviderOperation = "view_status", outputHost?: string, contentType: string | null = null): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw characterOutputError("CHARACTER_OUTPUT_EMPTY", operation, { httpStatus: response.status, ...(outputHost ? { outputHost } : {}),
    media: { httpStatus: response.status, contentType, sizeBytes: 0, decode: "not_attempted" } });
  const chunks: Buffer[] = []; let length = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.length;
      if (length > limit) throw characterOutputError("CHARACTER_OUTPUT_TOO_LARGE", operation, { httpStatus: response.status,
        ...(outputHost ? { outputHost } : {}), media: { httpStatus: response.status, contentType, sizeBytes: length, decode: "not_attempted" } });
      chunks.push(Buffer.from(part.value));
    }
    if (!length) throw characterOutputError("CHARACTER_OUTPUT_EMPTY", operation, { httpStatus: response.status, ...(outputHost ? { outputHost } : {}),
      media: { httpStatus: response.status, contentType, sizeBytes: 0, decode: "not_attempted" } });
    return Buffer.concat(chunks, length);
  } catch (error) {
    if (error instanceof CharacterSheetError) throw error;
    throw characterOutputError("CHARACTER_OUTPUT_DOWNLOAD_FAILED", operation, { httpStatus: response.status,
      ...(outputHost ? { outputHost } : {}), media: { httpStatus: response.status, contentType, sizeBytes: length, decode: "not_attempted" } });
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
