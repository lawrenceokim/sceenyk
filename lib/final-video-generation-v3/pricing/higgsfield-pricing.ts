import { manualPricingSchema, type ManualPricing } from "./contract";
import type { CostEstimate, VideoCommand } from "../contract";
import { v3Digest } from "../identity";

// Owner-supplied approximate midpoint rates, not a provider quote or guaranteed charge.
export const pricingConfiguration = Object.freeze({ version: "seedance-2026-10-31", date: "2026-10-31",
  source: "manual_provider_estimate" as const, authorizationBufferBasisPoints: 2000, authorizationLifetimeMs: 24 * 60 * 60 * 1000,
  rates: Object.freeze([
    Object.freeze({ provider: "higgsfield", model: "bytedance/seedance-2.5/text-to-video", mode: "text-to-video", rate: 470100 }),
    Object.freeze({ provider: "higgsfield", model: "bytedance/seedance-2.5/image-to-video", mode: "image-to-video", rate: 470100 }),
    Object.freeze({ provider: "higgsfield", model: "bytedance/seedance-2.5/reference-to-video", mode: "reference-to-video", rate: 564100 }),
  ]) });
export const pricingSourceUrl = "https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground";
export function getEstimatedRate(provider: string, model: string, mode: string) {
  return pricingConfiguration.rates.find(r => r.provider === provider && r.model === model && r.mode === mode) ?? null;
}
export const decimalUsd = (microusd: number) => `${Math.floor(microusd / 1_000_000)}.${String(microusd % 1_000_000).padStart(6, "0")}`;
export function calculateManualEstimate(provider: string, model: string, mode: string, durationMs: number): ManualPricing {
  const rate = getEstimatedRate(provider, model, mode);
  if (!rate) throw new Error("V3_APPROXIMATE_PRICING_NOT_CONFIGURED");
  if (!Number.isSafeInteger(durationMs) || durationMs < 4000 || durationMs > 30000 || durationMs % 1000) throw new Error("V3_PRICING_DURATION_INVALID");
  const cost = durationMs / 1000 * rate.rate;
  return manualPricingSchema.parse({ provider, model, mode, durationMs, rateMicrousdPerSecond: rate.rate,
    estimatedUsdPerSecond: decimalUsd(rate.rate).slice(0, -2), estimatedUsd: decimalUsd(cost), estimatedCostMicrousd: cost,
    pricingSource: pricingConfiguration.source, pricingVersion: pricingConfiguration.version, configurationDate: pricingConfiguration.date });
}
export function validateManualSnapshot(value: unknown) {
  const s = manualPricingSchema.parse(value);
  if (s.durationMs < 4000 || s.durationMs > 30000 || s.durationMs % 1000 || s.estimatedCostMicrousd !== s.durationMs / 1000 * s.rateMicrousdPerSecond ||
    s.estimatedUsdPerSecond !== decimalUsd(s.rateMicrousdPerSecond).slice(0, -2) || s.estimatedUsd !== decimalUsd(s.estimatedCostMicrousd)) throw new Error("V3_PRICING_SNAPSHOT_INVALID");
  return s; // Historical snapshots reproduce their frozen rate, independently of today's configuration.
}
export function localCostEstimate(command: VideoCommand, model: string, mode: string): CostEstimate {
  const pricing = calculateManualEstimate("higgsfield", model, mode, command.direction.durationMs);
  return { status: "estimated", source: "manual_provider_estimate", sourceUrl: pricingSourceUrl, pricingVersion: pricing.pricingVersion,
    estimatedCostMicrousd: pricing.estimatedCostMicrousd, evidenceHash: v3Digest("manual-pricing", pricing), pricing,
    reason: null, actualProviderCostMicrousd: null, providerReceipt: null };
}
export function suggestedAuthorizationMicrousd(estimate: number) {
  if (!Number.isSafeInteger(estimate) || estimate < 0) throw new Error("V3_PRICING_AMOUNT_INVALID");
  const buffered = BigInt(estimate) * BigInt(10000 + pricingConfiguration.authorizationBufferBasisPoints);
  // Round upward to cents; the user still reviews/edits and explicitly approves this ceiling.
  const cents = (buffered + BigInt(99_999_999)) / BigInt(100_000_000);
  const result = Number(cents * BigInt(10_000));
  if (!Number.isSafeInteger(result)) throw new Error("V3_PRICING_AMOUNT_INVALID"); return result;
}
