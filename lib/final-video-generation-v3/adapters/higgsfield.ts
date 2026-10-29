import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { type EstimateEvidence, type GenerationSegment, type VideoCapabilities, type VideoCommand, type VideoGenerationProvider } from "../contract";
import { commandFingerprint, normalizeCapabilities, v3Digest } from "../identity";
import { estimateHiggsfieldCost } from "./higgsfield-pricing";

export const HIGGSFIELD_V3_PROFILE = "final-video-v3-higgsfield";
export const higgsfieldModels = { text: "bytedance/seedance-2.5/text-to-video", image: "bytedance/seedance-2.5/image-to-video",
  reference: "bytedance/seedance-2.5/reference-to-video" } as const;
export const higgsfieldEvidence = {
  reference: "https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference",
  image: "https://open.higgsfield.ai/models/bytedance/seedance-2.5/image-to-video/api-reference",
  text: "https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference",
  lifecycle: "https://docs.higgsfield.ai/docs/concepts/requests", pricing: "https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground",
} as const;
const noVerifiedFileLimits = () => ({ maxCount: null, maxBytes: null, mimeTypes: null, maxDurationMs: null, maxCombinedDurationMs: null });
function publicHttps(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.hostname === "localhost" ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) throw new Error("MEDIA_URL_INVALID");
  return value;
}
export class HiggsfieldVideoGenerationProvider implements VideoGenerationProvider {
  capabilities(): VideoCapabilities {
    return { version: "video-capabilities-v3", providerId: "higgsfield", profileId: HIGGSFIELD_V3_PROFILE,
      adapterVersion: "seedance-25-higgsfield-foundation-v1", contractVersion: "higgsfield-seedance-25-2026-10-29", verifiedOn: "2026-10-29",
      sources: Object.values(higgsfieldEvidence), modes: ["text", "image", "reference"], maxContinuousDurationMs: 30000,
      supportedDurationsMs: Array.from({ length: 27 }, (_, i) => (i + 4) * 1000), supportedResolutions: ["480p", "720p", "1080p"],
      supportedAspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], supportedFormats: ["mp4", "mov"],
      features: { nativeAudio: "supported", nativeDialogue: "unverified", nativeLipSync: "unverified", nativeAmbience: "unverified", nativeSoundEffects: "unverified", nativeMusic: "unverified", multiShotPrompting: "unverified",
        imageReferences: "supported", audioReferences: "supported", videoReferences: "supported" },
      transitions: { none: "supported", cut: "unverified", fade_in: "unverified", fade_out: "unverified", crossfade: "unverified" },
      maxPromptCharacters: null, referenceLimits: { total: null, image: noVerifiedFileLimits(), audio: noVerifiedFileLimits(), video: noVerifiedFileLimits() } };
  }
  estimateCost(command: VideoCommand, evidence: readonly EstimateEvidence[], accountScope: string, now: string) {
    return estimateHiggsfieldCost(command, evidence, accountScope, now);
  }
  // Inert descriptor only. No SDK/client, env/credentials, fetch, submit or poll method.
  prepareRequest(segment: GenerationSegment, media: ReadonlyMap<string, string>) {
    const command = segment.command;
    if (command.profileId !== HIGGSFIELD_V3_PROFILE || segment.fingerprint !== commandFingerprint(command) || command.direction.durationMs !== segment.durationMs)
      throw new Error("SEGMENT_BINDING_INVALID");
    const cap = this.capabilities();
    if (command.capabilityHash !== v3Digest("capabilities", normalizeCapabilities(cap)) || segment.capabilityHash !== command.capabilityHash)
      throw new Error("PROVIDER_SNAPSHOT_CHANGED");
    if (!cap.supportedDurationsMs.includes(segment.durationMs) || !cap.supportedResolutions.includes(command.resolution) ||
      !cap.modes.includes(command.mode) || !cap.supportedFormats.includes(command.format) || !cap.supportedAspectRatios.includes(command.aspectRatio)) throw new Error("VIDEO_CONFIGURATION_UNSUPPORTED");
    const urlFor = (id: string) => { const url = media.get(id); if (!url) throw new Error("REFERENCE_DELIVERY_MISSING"); return publicHttps(url); };
    const input: Record<string, unknown> = { prompt: command.direction.prompt, duration: segment.durationMs / 1000,
      resolution: command.resolution, output_format: command.format, generate_audio: command.generateAudio };
    if (command.mode === "reference") {
      input.aspect_ratio = command.aspectRatio;
      const mapping: string[] = [];
      for (const [kind, field] of [["image", "image_urls"], ["audio", "audio_urls"], ["video", "video_urls"]]) {
        const refs = command.references.filter(ref => ref.kind === kind);
        if (refs.length) input[field] = refs.map(ref => urlFor(ref.id));
        refs.forEach((ref, index) => mapping.push(`${kind} reference ${index + 1} defines ${ref.role}: ${ref.name}.`));
      }
      input.prompt = `${mapping.join("\n")}\n${command.direction.prompt}`;
    } else if (command.mode === "image") {
      const start = command.references.find(ref => ref.role === "start_frame"), end = command.references.find(ref => ref.role === "end_frame");
      if (!start || command.references.some(ref => ref.kind !== "image") || command.references.length !== (end ? 2 : 1)) throw new Error("IMAGE_FRAME_BINDINGS_INVALID");
      input.image_url = urlFor(start.id); if (end) input.end_image_url = urlFor(end.id);
      // No aspect_ratio field exists on the image-to-video contract.
    } else { if (command.references.length) throw new Error("TEXT_MODE_REFERENCES_UNSUPPORTED"); input.aspect_ratio = command.aspectRatio; }
    const model = higgsfieldModels[command.mode];
    return { executable: false as const, providerId: "higgsfield", profileId: HIGGSFIELD_V3_PROFILE, method: "POST" as const, model, generationUrl: `https://api.higgsfield.ai/${model}`,
      estimateUrl: `https://api.higgsfield.ai/estimate/${model}`, commandFingerprint: segment.fingerprint, input };
  }
}

const statusSchema = z.object({ request_id: z.uuid(), status: z.string(), status_url: z.string().nullish(), expires_at: z.string().nullish(),
  video: z.object({ url: z.string() }).nullish() });
export function mapHiggsfieldStatus(value: unknown, expectedRequestId: string) {
  const parsed = statusSchema.safeParse(value);
  if (!parsed.success || parsed.data.request_id !== expectedRequestId) return { state: "reconciliation_required", requestId: expectedRequestId, videoUrl: null } as const;
  const raw = parsed.data;
  const states: Record<string, string> = { queued: "pending", in_progress: "running", completed: "completed", failed: "failed", nsfw: "rejected", canceled: "canceled" };
  const state = Object.hasOwn(states, raw.status) ? states[raw.status] : "reconciliation_required";
  let videoUrl: string | null = null;
  if (state === "completed") {
    try { if (!raw.video?.url) throw new Error(); videoUrl = publicHttps(raw.video.url); }
    catch { return { state: "invalid_result", requestId: expectedRequestId, videoUrl: null } as const; }
  }
  return { state, requestId: raw.request_id, videoUrl, expiresAt: raw.expires_at ?? null };
}
export function prepareStatusObservation(requestId: string, statusUrl: string) {
  z.uuid().parse(requestId);
  const url = new URL(statusUrl);
  if (url.origin !== "https://api.higgsfield.ai" || url.pathname !== `/requests/${requestId}/status` || url.search || url.hash || url.username || url.password)
    throw new Error("STATUS_LOCATOR_INVALID");
  return { executable: false as const, method: "GET" as const, url: statusUrl, requestId };
}

export function prepareCancelObservation(requestId: string, cancelUrl: string) {
  z.uuid().parse(requestId);
  const url = new URL(cancelUrl);
  if (url.origin !== "https://api.higgsfield.ai" || url.pathname !== `/requests/${requestId}/cancel` || url.search || url.hash || url.username || url.password)
    throw new Error("CANCEL_LOCATOR_INVALID");
  return { executable: false as const, method: "POST" as const, url: cancelUrl, requestId };
}

export function parseHiggsfieldAcceptance(value: unknown) {
  const parsed = z.object({ request_id: z.uuid(), status: z.literal("queued"), status_url: z.string(), cancel_url: z.string(),
    expires_after: z.number().int().min(3600).max(604800) }).parse(value);
  prepareStatusObservation(parsed.request_id, parsed.status_url);
  prepareCancelObservation(parsed.request_id, parsed.cancel_url);
  // An idempotency replay may still say queued; observe status_url for actual current state.
  return { requestId: parsed.request_id, statusUrl: parsed.status_url, cancelUrl: parsed.cancel_url, expiresAfterSeconds: parsed.expires_after };
}

export function inspectHiggsfieldPayload(segment: GenerationSegment, media: ReadonlyMap<string, string>) {
  const request = new HiggsfieldVideoGenerationProvider().prepareRequest(segment, media);
  const input = request.input;
  const sanitized: Record<string, unknown> = { prompt: `[redacted director prompt; ${String(input.prompt).length} characters]`,
    duration: input.duration, resolution: input.resolution, output_format: input.output_format, generate_audio: input.generate_audio };
  if (input.aspect_ratio) sanitized.aspect_ratio = input.aspect_ratio;
  for (const field of ["image_urls", "audio_urls", "video_urls"] as const) if (Array.isArray(input[field]))
    sanitized[field] = input[field].map(() => "[redacted approved media URL]");
  for (const field of ["image_url", "end_image_url"] as const) if (input[field]) sanitized[field] = "[redacted approved media URL]";
  return { executable: false, method: request.method, model: request.model, generationUrl: request.generationUrl,
    estimateUrl: request.estimateUrl, commandFingerprint: request.commandFingerprint,
    exactBodySha256: createHash("sha256").update(JSON.stringify(request.input)).digest("hex"),
    // Never spread raw request fields/headers/URLs or creative text into logs.
    input: sanitized };
}
