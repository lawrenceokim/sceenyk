import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { HiggsfieldV3Transport } from "@/lib/final-video-generation-v3/adapters/higgsfield-transport";
import { v3TransportConfig } from "@/lib/final-video-generation-v3/runtime-config";
import type { PaidIntent } from "@/lib/final-video-generation-v3/runtime-contract";
import { generationCreditsFromMicrousd } from "@/lib/payments/credit-pricing";
import { generationAccess } from "./generation-policy-server";

export function providerUsdMicrousd(usd: string) {
  if (!/^\d{1,9}(?:\.\d{1,12})?$/.test(usd)) throw new Error("PAID_PROVIDER_PRICE_REQUIRED");
  const [whole, fraction = ""] = usd.split(".");
  const amount = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0").slice(0, 6)) +
    (/[1-9]/.test(fraction.slice(6)) ? BigInt(1) : BigInt(0));
  if (amount <= 0 || amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("PAID_PROVIDER_PRICE_REQUIRED");
  return Number(amount);
}

// A non-generating authenticated estimate, both before wallet admission and
// before dispatch. It uses the exact immutable/signed request, never a UI cost
// or the historical approximate package rate. Changed pricing needs new review.
export async function verifyPaidVideoPrice(owner: string, intent: PaidIntent, signal: AbortSignal) {
  const access = await generationAccess(owner, intent.projectId);
  if (access.funding !== "credits") return;
  if (intent.model !== "bytedance/seedance-2.5/reference-to-video" || intent.body.duration !== 5 || intent.body.resolution !== "480p")
    throw new Error("GENERATION_LIMIT_5S_480P");
  const estimate = await new HiggsfieldV3Transport(v3TransportConfig()).estimate(intent.model, intent.body, signal);
  const cost = providerUsdMicrousd(estimate.usd);
  if (generationCreditsFromMicrousd(cost) !== access.requiredCredits || cost > 1_030_000 || cost > intent.authorization.maxEstimatedCostMicrousd)
    throw new Error("PAID_PROVIDER_PRICE_CHANGED");
  const { data, error } = await createDatabaseClient().rpc("generation_paid_quote", { p_owner: owner, p_project: intent.projectId,
    p_run: intent.executionId, p_model: intent.model, p_body_hash: intent.bodyHash, p_response_hash: estimate.responseHash, p_cost: cost });
  if (error || data !== true) throw new Error("PAID_PROVIDER_PRICE_REQUIRED");
}
