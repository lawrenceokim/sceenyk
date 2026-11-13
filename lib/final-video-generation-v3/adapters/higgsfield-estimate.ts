import "server-only";
import { v3BodyHash } from "../identity";

// Verified from the model's public pricing_description on 2026-11-13.
// This is an admission price bound, separate from historical display estimates,
// 103-credit retail pricing and actual provider billing. Never evaluate prose.
const source = "https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground";
const version = "higgsfield-seedance-25-per-second-2026-11-13";
const description = "Standard self-serve rates in USD per second of generated video. " +
  "- Without video input: 480p: $0.1177; 720p: $0.2647; 1080p: $0.6518. " +
  "- With video input: 480p: $0.1387; 720p: $0.3264; 1080p: $0.7858. " +
  "Total price = selected rate × output duration in seconds. Input video duration is not added to the billed duration. " +
  "Image or audio references alone use the rate without video input.";
const allowedFields = new Set(["prompt", "duration", "resolution", "aspect_ratio", "output_format", "generate_audio", "image_urls", "audio_urls", "video_urls"]);
const urls = (value: unknown) => value === undefined || Array.isArray(value) && value.every(url => typeof url === "string" && url.length > 0);

export function normalizeHiggsfieldEstimate(model: string, body: Record<string, unknown>, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("HIGGSFIELD_ESTIMATE_RESPONSE_INVALID");
  const response = value as Record<string, unknown>;
  if (Object.hasOwn(response, "usd")) {
    // A malformed explicit amount cannot fall back to a more permissive rule.
    if (typeof response.usd !== "string" || !/^\d{1,9}(?:\.\d{1,12})?$/.test(response.usd)) throw new Error("HIGGSFIELD_ESTIMATE_RESPONSE_INVALID");
    return { usd: response.usd, responseHash: v3BodyHash(value), pricingSource: "provider_usd" as const };
  }
  if (typeof response.type !== "string" || !response.type.trim() || typeof response.pricing_description !== "string" ||
    response.pricing_description.replace(/\s+/g, " ").trim() !== description)
    throw new Error("HIGGSFIELD_ESTIMATE_PRICING_UNVERIFIED");
  // Only the currently eligible, image-referenced 5s/480p contract is verified.
  // No geometry/discount guess, reference-video timing, higher tier or new
  // surcharge parameter can silently inherit this published rate.
  if (model !== "bytedance/seedance-2.5/reference-to-video" || body.duration !== 5 || body.resolution !== "480p" ||
    body.generate_audio !== true || typeof body.prompt !== "string" || !body.prompt.trim() ||
    !["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"].includes(String(body.aspect_ratio)) ||
    body.output_format !== undefined && !["mp4", "mov"].includes(String(body.output_format)) ||
    !Array.isArray(body.image_urls) || !body.image_urls.length || ![body.image_urls, body.audio_urls, body.video_urls].every(urls) ||
    Array.isArray(body.video_urls) && body.video_urls.length > 0 || Object.keys(body).some(key => !allowedFields.has(key)))
    throw new Error("HIGGSFIELD_ESTIMATE_PRICING_UNVERIFIED");
  const microusd = BigInt(117_700) * BigInt(body.duration);
  const usd = `${microusd / BigInt(1_000_000)}.${String(microusd % BigInt(1_000_000)).padStart(6, "0")}`;
  const evidence = { version, source, providerResponse: value, model, bodyHash: v3BodyHash(body), usd };
  return { usd, responseHash: v3BodyHash(evidence), pricingSource: "provider_formula" as const };
}
