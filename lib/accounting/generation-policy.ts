// Public capabilities only. Identity, allowance and admission remain server/SQL owned.
export const freeVideoDurationSeconds = 5;
export const freeVideoResolution = "480p" as const;
export const freePreparationLimit = 2; // Lifetime attempts per preparation kind; failures do not reset it.
export const freePreparationKinds = ["character", "product", "location", "storyboard"] as const;
export type FreeGenerationAccess = { total: number; remaining: number; reserved: number; consumed: number;
  projectAllowed: boolean; videoAllowed: boolean; historyReview: boolean; budgetMicrousd: number; budgetUsedMicrousd: number; accountBudgetRemainingMicrousd: number;
  funding: "free" | "credits"; requiredCredits: number; availableCredits: number; reservedCredits: number; shortageCredits: number;
  preparationAllowed: boolean; projectReviewRequired: boolean; projectBlocker: string | null;
  paidBlocker: string | null; paidUserRemainingMicrousd: number; paidGlobalRemainingMicrousd: number;
  preparationRemaining: Record<typeof freePreparationKinds[number], number> };
export const generationPolicyMessages: Record<string, string> = {
  GENERATION_LIMIT_5S_480P: "New generations are limited to 5 seconds at 480p. Saved work stays unchanged.",
  FREE_ALLOWANCE_EXHAUSTED: "No free AI projects remain. New paid videos require purchased credits and available spending capacity.",
  FREE_PROJECT_HISTORY_REVIEW_REQUIRED: "This project's historical AI usage needs review before new requests. Purchased credits do not clear its review hold; saved work and recovery remain available.",
  FREE_PROJECT_PRICING_REQUIRED: "The free Higgsfield video needs its $1.03 cost configuration. Requests above that limit are blocked.",
  FREE_PROJECT_BUDGET_EXHAUSTED: "This video exceeds the remaining $1.03 Higgsfield budget. Saved work and permitted platform-funded OpenAI features stay available.",
  FREE_PROJECT_VIDEO_USED: "A new free video is unavailable under this project's budget, account limit or existing attempt. Recover the existing request instead of starting another paid attempt.",
  FREE_PREPARATION_LIMIT: "This platform-funded preparation limit is used. Reuse an approved reference or saved Storyboard; credits do not reset this limit.",
  FREE_RESERVATION_REQUIRED: "AI generation needs a valid free project reservation. Refresh the project before trying again.",
  GENERATION_POLICY_SETUP_REQUIRED: "Generation access needs database migration 107 after 106 and matching app/worker code. New provider requests are blocked.",
  INSUFFICIENT_CREDITS: "This video requires 103 credits. Buy credits to cover the shortage, then continue.",
  HIGGSFIELD_GLOBAL_SPENDING_LIMIT: "The platform video spending limit has been reached. New paid generation is paused.",
  HIGGSFIELD_USER_SPENDING_LIMIT: "Your video spending limit has been reached. Saved work and recovery remain available.",
  PAID_PROVIDER_PRICE_REQUIRED: "The exact provider price could not be verified. No new video request was submitted.",
  PAID_PROVIDER_PRICE_CHANGED: "The verified provider price has changed. New generation is blocked until pricing is reviewed.",
  PAID_RESERVATION_REQUIRED: "This request has no usable credit reservation. Refresh its saved status before continuing.",
  GENERATION_POLICY_CONFIGURATION_INVALID: "Generation policy configuration needs attention. New provider requests are blocked.",
  GENERATION_PIPELINE_NOT_SUPPORTED: "Free generation supports the UGC V3 workflow only. Existing results remain available.",
};
export function assertFreeVideoSettings(duration: number | string, resolution: string) {
  if (Number(duration) !== freeVideoDurationSeconds || resolution !== freeVideoResolution) throw new Error("GENERATION_LIMIT_5S_480P");
}
