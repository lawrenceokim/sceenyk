import type { ProviderReceipt, StageKind } from "./contract";
import type { FinalPricing } from "./adapters/pricing";

// Actuals require observed usage and explicit account billing/coverage. Neither
// the preflight estimate nor an authorization limit is billing evidence.
export function recordProviderUsage(receipt: ProviderReceipt, kind: StageKind, pricing?: FinalPricing, reservedCredits?: number): ProviderReceipt {
  const usage = { ...receipt.usage };
  const credits = usage.providerCharacterCost;
  if ((kind === "voice" || kind === "design") && typeof credits === "string" && /^\d+(\.\d+)?$/.test(credits) && Number.isFinite(Number(credits))) {
    usage.actualCredits = Number(credits);
    if (pricing?.valid && pricing.elevenLabsIncludedCredits) {
      const covered = reservedCredits !== undefined && Number(credits) <= reservedCredits;
      return { ...receipt, usage: { ...usage, actualCostMicrousd: covered ? 0 : null,
        actualCostSource: covered ? "observed_provider_credits_within_reserved_included_allowance" : null,
        includedCreditReservationExceeded: !covered, actualCostPricingVersion: pricing.version } };
    }
  }
  if ((kind === "voice" || kind === "design") && pricing?.valid && pricing.elevenLabsMicrousdPerCredit !== undefined &&
    typeof credits === "string" && /^\d+(\.\d+)?$/.test(credits)) {
    const amount = Math.ceil(Number(credits) * pricing.elevenLabsMicrousdPerCredit);
    if (Number.isSafeInteger(amount) && amount >= 0) return { ...receipt, usage: { ...usage, actualCostMicrousd: amount,
      actualCostSource: "observed_provider_credits_at_configured_account_rate", actualCostPricingVersion: pricing.version } };
  }
  return { ...receipt, usage: { ...usage, actualCostMicrousd: usage.actualCostMicrousd ?? null,
    actualCostSource: usage.actualCostSource ?? null } };
}
