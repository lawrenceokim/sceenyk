import "server-only";
import { createHash } from "node:crypto";
import { calculateCreditPurchase, maximumCreditPaymentMinor, type CreditPurchasePricing } from "./credit-pricing";

function integerSetting(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^(0|[1-9]\d{0,5})$/.test(raw)) throw new Error("CREDIT_PRICING_CONFIGURATION_INVALID");
  return Number(raw);
}

export function getCreditPurchasePricing(): CreditPurchasePricing {
  const rates = {
    paypalBasisPoints: integerSetting("SCEENYK_CREDIT_PAYPAL_FEE_BPS", 349),
    paypalFixedMinor: integerSetting("SCEENYK_CREDIT_PAYPAL_FIXED_FEE_CENTS", 49),
    commissionBasisPoints: integerSetting("SCEENYK_CREDIT_COMMISSION_BPS", 100),
  };
  const version = `credit-usd-v1:${createHash("sha256").update(JSON.stringify(rates)).digest("hex")}`;
  const pricing = { ...rates, version };
  calculateCreditPurchase(maximumCreditPaymentMinor, pricing); // Invalid/unusable configuration fails closed.
  return pricing;
}
