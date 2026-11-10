"use client";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { generationPolicyMessages } from "@/lib/accounting/generation-policy";
import { generationCreditsFromMicrousd } from "@/lib/payments/credit-pricing";
import { CreditTopUp } from "@/components/payments/credit-top-up";

export function StudioFreeGenerationStatus({ policy, estimatedCostMicrousd }: {
  policy: RuntimeDto["generationPolicy"] | undefined;
  estimatedCostMicrousd: number | null;
}) {
  const cost = estimatedCostMicrousd ?? policy?.approximateVideoCostMicrousd ?? null;
  return <section className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-xs text-foreground" aria-label="Generation allowance" aria-live="polite">
    <p className="font-medium">{!policy ? "Checking free generation allowance…" : policy.ready ? `${policy.remaining} of 2 free generations available${policy.reserved ? ` · ${policy.reserved} reserved` : ""}` : "Free allowance unavailable — new provider work is blocked."}</p>
    <p className="text-muted-foreground">{policy?.demoMode ? "Hackathon demo" : "Free generation"}: 5 seconds, 480p. Purchased credits and Pro do not bypass these limits.</p>
    {policy && !policy.ready && <p>{generationPolicyMessages[policy.reason ?? "GENERATION_POLICY_SETUP_REQUIRED"] ?? "Check generation policy setup."}</p>}
    {policy?.ready && !policy.settingsSupported && <p>Saved settings exceed the current limits. Saved videos and references stay available. Use a new compatible project if creative inputs are locked.</p>}
    {policy?.ready && policy.remaining === 0 && <>
      <p>{cost === null ? "Paid credit estimate unavailable." : `${estimatedCostMicrousd === null ? "Approximate 5-second reference video" : "Estimated video requirement"}: ${generationCreditsFromMicrousd(cost)} credits.`} Credit-funded generation is not connected yet; new requests are blocked.</p>
      <CreditTopUp label="Buy credits" />
    </>}
    {policy?.ready && <p className="text-muted-foreground">Free preparation starts left: Character {policy.preparationRemaining.character} · Product {policy.preparationRemaining.product} · Location {policy.preparationRemaining.location} · Storyboard {policy.preparationRemaining.storyboard}. Reuse approved work; failed starts do not reset these limits.</p>}
  </section>;
}
