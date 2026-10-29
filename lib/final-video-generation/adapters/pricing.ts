import { z } from "zod";
import type { FinalConfiguration, StageKind } from "../contract";
import { dimensions } from "../planning";

// Public contracts checked 2026-10-28. Never derive rates from authorization.
export const pricingSources = {
  video: "https://fal.ai/models/bytedance/seedance-2.5/reference-to-video",
  lip_sync: "https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video",
  voice: "https://elevenlabs.io/pricing/api",
  design: "https://elevenlabs.io/docs/eleven-creative/voices/voice-design",
};
const overrides = z.strictObject({
  // Account-reviewed conversion, not an operator spending permission.
  elevenLabsMicrousdPerCredit: z.number().int().positive().max(1_000_000).optional(),
  elevenLabsIncludedCredits: z.strictObject({ allowanceId: z.uuid(), remainingCredits: z.number().int().min(0).max(1_000_000_000) }).optional(),
  voiceDesignPreviewText: z.string().refine(v => [...v].length >= 100 && [...v].length <= 1000).optional(),
}).refine(value => !value.elevenLabsIncludedCredits || value.elevenLabsMicrousdPerCredit === undefined);
export type FinalPricing = {
  version: "provider-pricing-2026-10-28-v2";
  elevenLabsMicrousdPerCredit?: number;
  elevenLabsIncludedCredits?: { allowanceId: string; remainingCredits: number };
  voiceDesignPreviewText?: string;
  valid: boolean;
};
export function finalPricing(raw?: string): FinalPricing {
  try {
    const parsed = overrides.safeParse(raw?.trim() ? JSON.parse(raw) : {});
    return parsed.success ? { version: "provider-pricing-2026-10-28-v2", valid: true, ...parsed.data }
      : { version: "provider-pricing-2026-10-28-v2", valid: false };
  } catch { return { version: "provider-pricing-2026-10-28-v2", valid: false }; }
}
export type CostInput = { durationMs?: number; aspectRatio?: string; text?: string };
// This audition is not scene dialogue. Repeat the approved words only to meet
// the provider's 100-character minimum, without generating unpriced text.
export function voiceDesignPreviewText(texts: readonly string[], pricing?: FinalPricing): string | undefined {
  if (pricing?.voiceDesignPreviewText) return pricing.voiceDesignPreviewText;
  const sample = texts.filter(text => text.trim()).join(" ");
  if (!sample) return undefined;
  let text = sample;
  while ([...text].length < 100) text += ` ${sample}`;
  return [...text].slice(0, 1000).join("");
}
export type CostEstimate = {
  pricingVersion: string; pricingUnit: string; pricingRule: string;
  billableQuantity: number | null; rateMicrousd: number | null;
  estimatedCostMicrousd: number | null;
  estimatedUsdCost: number | null;
  source: "verified_provider_pricing" | "configured_provider_pricing" | "configured_included_credits" | "unavailable";
  sourceUrl: string; unavailableReason?: string;
  billableInputs?: Record<string, number | string | boolean>;
  estimatedCredits?: number;
  includedCreditAllowanceId?: string;
  includedCreditLimit?: number;
};
export function estimateProviderCost(kind: Exclude<StageKind, "composition">, config: FinalConfiguration, input: CostInput): CostEstimate {
  const identity = config.providers[kind], pricing = config.pricing;
  const base = { pricingVersion: pricing?.version ?? "missing", sourceUrl: pricingSources[kind === "binding" ? "design" : kind] };
  const unavailable = (reason: string, pricingUnit = "unknown", pricingRule = "No verified pricing contract", billableQuantity: number | null = null): CostEstimate =>
    ({ ...base, pricingUnit, pricingRule, billableQuantity, rateMicrousd: null, estimatedCostMicrousd: null, estimatedUsdCost: null, source: "unavailable", unavailableReason: reason });
  const priced = (pricingUnit: string, pricingRule: string, billableQuantity: number, rateMicrousd: number,
    source: "verified_provider_pricing" | "configured_provider_pricing" | "configured_included_credits" = "verified_provider_pricing"): CostEstimate => {
    const cost = Math.ceil(billableQuantity * rateMicrousd);
    return Number.isSafeInteger(cost) && cost >= 0 ? { ...base, pricingUnit, pricingRule, billableQuantity, rateMicrousd, estimatedCostMicrousd: cost, estimatedUsdCost: cost / 1000000, source }
      : unavailable("COST_ARITHMETIC_INVALID", pricingUnit, pricingRule, billableQuantity);
  };
  const creditCost = (quantity: number, unit: string, rule: string): CostEstimate => {
    const allowance = pricing?.elevenLabsIncludedCredits;
    const evidence = { estimatedCredits: quantity, ...(allowance ? { includedCreditAllowanceId: allowance.allowanceId, includedCreditLimit: allowance.remainingCredits } : {}) };
    if (allowance) return { ...(quantity <= allowance.remainingCredits
      ? priced(unit, `${rule}; covered by configured included credits; $0 immediate USD; no paid overage`, quantity, 0, "configured_included_credits")
      : unavailable("ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED", unit, rule, quantity)), ...evidence };
    return { ...(pricing?.elevenLabsMicrousdPerCredit === undefined
      ? unavailable("ELEVENLABS_BILLING_CONFIGURATION_REQUIRED", unit, rule, quantity)
      : priced(unit, `${rule} × configured account USD/credit`, quantity, pricing.elevenLabsMicrousdPerCredit, "configured_provider_pricing")), ...evidence };
  };
  if (!pricing?.valid || pricing.version !== "provider-pricing-2026-10-28-v2") return unavailable("PRICING_CONFIGURATION_REQUIRED");
  if (kind === "video" && identity.id === "fal" && identity.model === "bytedance/seedance-2.5/reference-to-video") {
    const rule = "width × height × output seconds × 24 / 1024 tokens; $0.0214 / 1000 tokens at 720p; image references free; no video inputs";
    if (config.output.height !== 720 || !["16:9", "9:16", "1:1"].includes(input.aspectRatio ?? "") ||
      !Number.isInteger(input.durationMs) || input.durationMs! < 4000 || input.durationMs! > 30000 || input.durationMs! % 1000) return unavailable("VIDEO_BILLABLE_INPUT_UNSUPPORTED", "1000 video tokens", rule);
    const shape = dimensions(input.aspectRatio!);
    return { ...priced("1000 video tokens", rule, shape.width * shape.height * (input.durationMs! / 1000) * 24 / 1024 / 1000, 21400),
      billableInputs: { durationSeconds: input.durationMs! / 1000, width: shape.width, height: shape.height, resolution: "720p",
        billingFps: 24, referenceImages: 3, referenceVideoSeconds: 0, generateAudio: false } };
  }
  if (kind === "lip_sync" && identity.id === "fal" && identity.model === "fal-ai/kling-video/lipsync/audio-to-video") {
    const rule = "ceil(input video seconds / 5) × 5 seconds × $0.014; full scene video, not speech window";
    if (!Number.isInteger(input.durationMs) || input.durationMs! <= 0 || input.durationMs! > 10000) return unavailable("LIP_SYNC_BILLABLE_INPUT_UNSUPPORTED", "rounded input video seconds", rule);
    return { ...priced("rounded input video seconds", rule, Math.ceil(input.durationMs! / 5000) * 5, 14000),
      billableInputs: { inputVideoSeconds: input.durationMs! / 1000, roundingIncrementSeconds: 5 } };
  }
  if (identity.id !== "elevenlabs") return unavailable("PROVIDER_MODEL_PRICING_UNVERIFIED");
  if (kind === "binding" && identity.model === "text-to-voice")
    return { ...priced("identity saves", "No separate generation charge; consumes one custom voice slot; still one API request", 1, 0), estimatedCredits: 0 };
  if (kind === "voice" && identity.model === "eleven_multilingual_v2") {
    if (typeof input.text !== "string" || !input.text.trim()) return unavailable("SPEECH_TEXT_REQUIRED", "characters");
    return creditCost([...input.text].length, "characters", "Unicode dialogue characters × 1 credit/character (Multilingual v2)");
  }
  if (kind === "design" && identity.model === "eleven_multilingual_ttv_v2") {
    const text = input.text ?? pricing.voiceDesignPreviewText;
    const rule = "Preview characters × 1 credit/character × configured USD/credit; charged once for three previews";
    if (!text) return unavailable("AUTO_GENERATED_PREVIEW_QUANTITY_UNKNOWN", "preview characters", rule);
    const quantity = [...text].length;
    if (quantity < 100 || quantity > 1000) return unavailable("VOICE_DESIGN_PREVIEW_LENGTH_UNSUPPORTED", "preview characters", rule, quantity);
    const estimate = creditCost(quantity, "preview characters", rule);
    return { ...estimate, estimatedCredits: quantity, billableInputs: { previewCharacters: quantity, creditsPerCharacter: 1, previewCount: 3, billedTextCopies: 1 } };
  }
  return unavailable("PROVIDER_MODEL_PRICING_UNVERIFIED");
}
