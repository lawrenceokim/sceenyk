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
  const paid = policy?.funding === "credits";
  return <section className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-xs text-foreground" aria-label="Generation allowance" aria-live="polite">
    <p className="font-medium">{!policy ? "Checking free AI project allowance…" : policy.historyReview ? "Free AI projects remaining: under review" : policy.ready ? `Free AI projects remaining: ${policy.remaining} / 2${policy.reserved ? ` · ${policy.reserved} reserved` : ""}` : "Free allowance unavailable — new provider work is blocked."}</p>
    <p className="text-muted-foreground">{policy?.demoMode ? "Hackathon demo" : "Free AI projects"}: videos are 5 seconds, 480p. Purchased credits and Pro do not bypass these limits.</p>
    {policy?.ready && !paid && <p className="text-muted-foreground">Higgsfield video budget remaining: ${(Math.max(0, policy.budgetMicrousd - policy.budgetUsedMicrousd) / 1_000_000).toFixed(2)} / ${(policy.budgetMicrousd / 1_000_000).toFixed(2)}. One free video attempt per project.</p>}
    {policy?.ready && !paid && <p className="text-muted-foreground">Account free Higgsfield allocation remaining: ${(policy.accountBudgetRemainingMicrousd / 1_000_000).toFixed(2)} / $2.06.</p>}
    {policy?.ready && <p>Available: <strong>{policy.availableCredits.toLocaleString()} credits</strong>{policy.reservedCredits > 0 ? ` · ${policy.reservedCredits.toLocaleString()} reserved` : ""}.</p>}
    {policy?.ready && paid && <>
      <p>Required before generation: <strong>{policy.requiredCredits} credits ($1.03)</strong>. The exact provider price is verified before submission.</p>
      {policy.shortageCredits > 0 && <p className="text-warning-foreground">You need {policy.shortageCredits} more credits.</p>}
      {policy.videoAllowed && <p className="text-muted-foreground">Your balance covers this video. Credits are held during processing and charged once on provider completion.</p>}
      {policy.reservedCredits > 0 && <p className="text-muted-foreground">Eligible failures restore held credits. Uncertain requests keep their hold while their existing status is recovered.</p>}
      {policy.paidBlocker && <p>{generationPolicyMessages[policy.paidBlocker] ?? "Paid generation is currently unavailable."}</p>}
      {policy.shortageCredits > 0 && <CreditTopUp label="Buy Credits" />}
    </>}
    {policy?.historyReview && <p>Historical free-allowance usage is under review. This does not reset usage or grant another free video.</p>}
    {policy?.projectReviewRequired && <p>{generationPolicyMessages.FREE_PROJECT_HISTORY_REVIEW_REQUIRED}</p>}
    {policy?.ready && policy.historyReview && !policy.projectReviewRequired && <p>Paid video access is checked separately on this project. OpenAI features remain platform-funded within their existing limits.</p>}
    {policy && !policy.ready && <p>{generationPolicyMessages[policy.reason ?? "GENERATION_POLICY_SETUP_REQUIRED"] ?? "Check generation policy setup."}</p>}
    {policy?.ready && !policy.settingsSupported && <p>Saved settings exceed the current limits. Saved videos and references stay available. Use a new compatible project if creative inputs are locked.</p>}
    {policy?.ready && !paid && (!policy.projectAllowed || !policy.videoAllowed) && <>
      <p>{cost === null ? "Credit equivalent unavailable." : `Video credit equivalent: ${generationCreditsFromMicrousd(cost)} credits.`} This free project’s video funding is unavailable. Recover an existing request if available.</p>
    </>}
    {policy?.ready && <p className="text-muted-foreground">Platform-funded OpenAI starts left: Character {policy.preparationRemaining.character} · Product {policy.preparationRemaining.product} · Location {policy.preparationRemaining.location} · Storyboard {policy.preparationRemaining.storyboard}. Purchased credits do not reset these limits.</p>}
  </section>;
}
