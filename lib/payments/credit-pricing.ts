// Shared integer-only display math. The server independently resolves all rates
// and recalculates the purchase; browser calculations never authorize a grant.
export const creditsPerUsd = 100;
export const maximumCreditPaymentMinor = 100_000; // Existing purchase-table bound.

export type CreditPurchaseRates = {
  paypalBasisPoints: number;
  paypalFixedMinor: number;
  commissionBasisPoints: number;
};

export type CreditPurchasePricing = CreditPurchaseRates & { version: string };
export type CreditPurchaseQuote = CreditPurchasePricing & {
  amountMinor: number;
  paypalFeeMinor: number;
  commissionMinor: number;
  generationMinor: number;
  credits: number;
};

export class CreditPricingError extends Error {}

export function parseCreditPaymentAmount(value: string): number {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,3})(\.\d{1,2})?$/.test(value)) {
    throw new CreditPricingError("Enter a USD amount with no more than two decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (amount < 1 || amount > maximumCreditPaymentMinor) {
    throw new CreditPricingError("Enter an amount between $0.01 and $1,000.00 USD.");
  }
  return amount;
}

export function calculateCreditPurchase(amountMinor: number, pricing: CreditPurchasePricing): CreditPurchaseQuote {
  const rates = [pricing.paypalBasisPoints, pricing.commissionBasisPoints];
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > maximumCreditPaymentMinor ||
    rates.some(rate => !Number.isSafeInteger(rate) || rate < 0 || rate > 10_000) ||
    rates[0] + rates[1] >= 10_000 || !Number.isSafeInteger(pricing.paypalFixedMinor) ||
    pricing.paypalFixedMinor < 0 || pricing.paypalFixedMinor > maximumCreditPaymentMinor) {
    throw new Error("CREDIT_PRICING_CONFIGURATION_INVALID");
  }
  // Positive fees round half-up to cents, independently on the gross payment.
  const paypalFeeMinor = Math.floor((amountMinor * pricing.paypalBasisPoints + 5_000) / 10_000) + pricing.paypalFixedMinor;
  const commissionMinor = Math.floor((amountMinor * pricing.commissionBasisPoints + 5_000) / 10_000);
  const generationMinor = amountMinor - paypalFeeMinor - commissionMinor;
  const credits = Math.floor(generationMinor * creditsPerUsd / 100);
  if (credits < 1) throw new CreditPricingError("This amount does not buy one credit after fees. Enter a larger amount.");
  return { ...pricing, amountMinor, paypalFeeMinor, commissionMinor, generationMinor, credits };
}

export function usdMinor(amount: number) { return `$${(amount / 100).toFixed(2)}`; }

// Generation estimates round upward to whole credits so fractional cents are
// covered. This does not reserve/deduct credits or change provider authority.
export function generationCreditsFromMicrousd(microusd: number): number {
  if (!Number.isSafeInteger(microusd) || microusd < 0) throw new Error("INVALID_GENERATION_COST");
  return Number((BigInt(microusd) * BigInt(creditsPerUsd) + BigInt(999_999)) / BigInt(1_000_000));
}
