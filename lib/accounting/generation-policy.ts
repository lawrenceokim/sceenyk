// Public capabilities only. Identity, allowance and admission remain server/SQL owned.
export const freeVideoDurationSeconds = 5;
export const freeVideoResolution = "480p" as const;
export const freePreparationKinds = ["character", "product", "location", "storyboard"] as const;
export type FreeGenerationAccess = { total: number; remaining: number; reserved: number; consumed: number;
  projectAllowed: boolean; videoAllowed: boolean; historyReview: boolean; budgetMicrousd: number; budgetUsedMicrousd: number; accountBudgetRemainingMicrousd: number;
  funding: "free" | "credits"; requiredCredits: number; availableCredits: number; reservedCredits: number; shortageCredits: number;
  preparationAllowed: boolean; preparationFunding: "free" | "credits"; preparationCredits: number; projectReviewRequired: boolean; projectBlocker: string | null;
  paidBlocker: string | null; paidUserRemainingMicrousd: number; paidGlobalRemainingMicrousd: number;
};
export const generationPolicyMessages: Record<string, string> = {
  "GENERATION_LIMIT_5S_480P": "Videos are limited to 5 seconds at 480p.",
  "FREE_ALLOWANCE_EXHAUSTED": "No free videos remain. Buy Credits to continue.",
  "FREE_PROJECT_HISTORY_REVIEW_REQUIRED": "This project's usage needs review. Saved work is available.",
  "FREE_PROJECT_PRICING_REQUIRED": "Video generation is temporarily unavailable.",
  "FREE_PROJECT_BUDGET_EXHAUSTED": "This project's included video is unavailable.",
  "FREE_PROJECT_VIDEO_USED": "This project's included video has been used. Check its saved status.",
  "FREE_RESERVATION_REQUIRED": "Refresh the project before continuing.",
  "GENERATION_POLICY_SETUP_REQUIRED": "Generation is temporarily unavailable. Please try again later.",
  "INSUFFICIENT_CREDITS": "Insufficient balance. Buy Credits to continue.",
  "HIGGSFIELD_GLOBAL_SPENDING_LIMIT": "Video generation is temporarily paused.",
  "HIGGSFIELD_USER_SPENDING_LIMIT": "Video generation is temporarily paused for this account.",
  "PAID_PROVIDER_PRICE_REQUIRED": "Video generation is temporarily unavailable.",
  "PAID_PROVIDER_PRICE_CHANGED": "Video generation is temporarily unavailable.",
  "PAID_RESERVATION_REQUIRED": "Check the saved request status before continuing.",
  "GENERATION_POLICY_CONFIGURATION_INVALID": "Generation is temporarily unavailable.",
  "GENERATION_PIPELINE_NOT_SUPPORTED": "Use the current Studio workflow to generate."
};
export function assertFreeVideoSettings(duration: number | string, resolution: string) {
  if (Number(duration) !== freeVideoDurationSeconds || resolution !== freeVideoResolution) throw new Error("GENERATION_LIMIT_5S_480P");
}
