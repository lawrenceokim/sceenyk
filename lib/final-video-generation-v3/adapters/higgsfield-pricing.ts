import "server-only";
import { estimateEvidenceSchema, type CostEstimate, type EstimateEvidence, type VideoCommand } from "../contract";
import { commandFingerprint, v3Digest } from "../identity";

export const higgsfieldPricingSource = "https://docs.higgsfield.ai/docs/concepts/billing-and-retention";
export function usdToMicrousd(usd: string): number | null {
  if (!/^\d{1,16}(?:\.\d{1,12})?$/.test(usd)) return null;
  const [whole, fraction = ""] = usd.split(".");
  const rounded = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.slice(0, 6).padEnd(6, "0")) +
    BigInt(/[1-9]/.test(fraction.slice(6)) ? 1 : 0);
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}
// Capture wrapper for a future trusted server-side estimate response, not a
// browser quote or provider call. The API response itself supplies only `usd`.
export function bindEstimateResponse(command: VideoCommand, response: unknown, capture: {
  providerId: string; accountScope: string; observedAt: string; expiresAt: string;
}): EstimateEvidence {
  if (!response || typeof response !== "object" || !("usd" in response) || typeof response.usd !== "string" || usdToMicrousd(response.usd) === null)
    throw new Error("PROVIDER_ESTIMATE_INVALID");
  return estimateEvidenceSchema.parse({ source: "authenticated_provider_estimate", providerId: capture.providerId,
    profileId: command.profileId, commandFingerprint: commandFingerprint(command), accountScope: capture.accountScope,
    usd: response.usd, responseHash: v3Digest("estimate-response", response), observedAt: capture.observedAt, expiresAt: capture.expiresAt });
}
export function estimateHiggsfieldCost(command: VideoCommand, evidence: readonly EstimateEvidence[], accountScope: string, now: string): CostEstimate {
  const base = { sourceUrl: higgsfieldPricingSource, pricingVersion: "higgsfield-account-estimate-v3-2026-10-29",
    actualProviderCostMicrousd: null, providerReceipt: null } as const;
  const unavailable = (reason: string): CostEstimate => ({ ...base, source: "unavailable", status: "unavailable",
    estimatedCostMicrousd: null, evidenceHash: null, reason });
  const time = Date.parse(now);
  if (!Number.isFinite(time) || !accountScope) return unavailable("ESTIMATE_CONTEXT_INVALID");
  const matching = evidence.map(item => estimateEvidenceSchema.safeParse(item)).filter(result => result.success).map(result => result.data)
    .filter(item => item.providerId === "higgsfield" && item.profileId === command.profileId && item.accountScope === accountScope &&
      item.commandFingerprint === commandFingerprint(command) && Date.parse(item.observedAt) <= time && Date.parse(item.expiresAt) > time &&
      Date.parse(item.observedAt) < Date.parse(item.expiresAt));
  // Ambiguous observations are not silently resolved by selecting a cheaper quote.
  if (!matching.length) return unavailable("AUTHENTICATED_ESTIMATE_REQUIRED");
  if (new Set(matching.map(item => item.usd)).size > 1) return unavailable("ESTIMATE_RECONCILIATION_REQUIRED");
  const cost = usdToMicrousd(matching[0].usd);
  return cost === null ? unavailable("ESTIMATE_AMOUNT_INVALID") : { ...base, source: "account_estimate", status: "estimated",
    estimatedCostMicrousd: cost, reason: null, evidenceHash: v3Digest("estimate-evidence", matching[0]) };
}

// Independent published token rule. Explicit dimensions are required: never
// infer exact output geometry or discounts from a tier or headline $/second.
export function calculatePublishedVideoCost(input: { width: number; height: number; durationMs: number;
  referenceVideoDurationMs: number; resolution: string }): { tokens: string; costMicrousd: number } | null {
  const { width, height, durationMs, referenceVideoDurationMs, resolution } = input;
  if (![width, height, durationMs, referenceVideoDurationMs].every(n => Number.isSafeInteger(n) && n >= 0) || !width || !height ||
    durationMs < 4000 || durationMs > 30000 || durationMs % 1000 || !["480p", "720p", "1080p"].includes(resolution)) return null;
  const denominator = BigInt(1_024_000), numerator = BigInt(width) * BigInt(height) * (BigInt(durationMs) + BigInt(referenceVideoDurationMs)) * BigInt(24);
  const tokens = (numerator + denominator - BigInt(1)) / denominator;
  const rate = BigInt(resolution === "1080p" ? 23_400 : 21_400);
  const moneyNumerator = tokens * rate * BigInt(referenceVideoDurationMs > 0 ? 3 : 1);
  const moneyDenominator = BigInt(1000) * BigInt(referenceVideoDurationMs > 0 ? 5 : 1);
  const cost = Number((moneyNumerator + moneyDenominator - BigInt(1)) / moneyDenominator);
  return Number.isSafeInteger(cost) ? { tokens: tokens.toString(), costMicrousd: cost } : null;
}
