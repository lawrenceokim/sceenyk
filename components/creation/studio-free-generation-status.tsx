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
    <p className="font-medium">{!policy ? "Checking free AI project allowance…" : policy.historyReview ? "Free AI projects remaining: under review" : policy.ready ? `Free AI projects remaining: ${policy.remaining} / 2${policy.reserved ? ` · ${policy.reserved} reserved` : ""}` : "Free allowance unavailable — new provider work is blocked."}</p>
    <p className="text-muted-foreground">{policy?.demoMode ? "Hackathon demo" : "Free AI projects"}: videos are 5 seconds, 480p. Purchased credits and Pro do not bypass these limits.</p>
    {policy?.ready && <p className="text-muted-foreground">Higgsfield video budget remaining: ${(Math.max(0, policy.budgetMicrousd - policy.budgetUsedMicrousd) / 1_000_000).toFixed(2)} / ${(policy.budgetMicrousd / 1_000_000).toFixed(2)}. One free video attempt per project. OpenAI features are platform-funded and attempt-limited.</p>}
    {policy?.ready && <p className="text-muted-foreground">Account Higgsfield allocation remaining: ${(policy.accountBudgetRemainingMicrousd / 1_000_000).toFixed(2)} / $2.06.</p>}
    {policy?.historyReview && <p>{generationPolicyMessages.FREE_PROJECT_HISTORY_REVIEW_REQUIRED}</p>}
    {policy && !policy.ready && <p>{generationPolicyMessages[policy.reason ?? "GENERATION_POLICY_SETUP_REQUIRED"] ?? "Check generation policy setup."}</p>}
    {policy?.ready && !policy.settingsSupported && <p>Saved settings exceed the current limits. Saved videos and references stay available. Use a new compatible project if creative inputs are locked.</p>}
    {policy?.ready && (!policy.projectAllowed || !policy.videoAllowed) && <>
      <p>{cost === null ? "Paid credit estimate unavailable." : `${estimatedCostMicrousd === null ? "Approximate 5-second reference video" : "Estimated video requirement"}: ${generationCreditsFromMicrousd(cost)} credits.`} New billable video attempts are blocked. Recover an existing request if available. Credit-funded generation is not connected yet.</p>
      <CreditTopUp label="Buy credits" />
    </>}
    {policy?.ready && <p className="text-muted-foreground">Free preparation starts left: Character {policy.preparationRemaining.character} · Product {policy.preparationRemaining.product} · Location {policy.preparationRemaining.location} · Storyboard {policy.preparationRemaining.storyboard}. Reuse approved work; failed starts do not reset these limits.</p>}
  </section>;
}
