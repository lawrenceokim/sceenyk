// Public capabilities only. Identity, allowance and admission remain server/SQL owned.
export const freeVideoDurationSeconds = 5;
export const freeVideoResolution = "480p" as const;
export const freePreparationLimit = 2; // Lifetime attempts per preparation kind; failures do not reset it.
export const freePreparationKinds = ["character", "product", "location", "storyboard"] as const;
export type FreeGenerationAccess = { total: number; remaining: number; reserved: number; consumed: number;
  preparationRemaining: Record<typeof freePreparationKinds[number], number> };
export const generationPolicyMessages: Record<string, string> = {
  GENERATION_LIMIT_5S_480P: "New generations are limited to 5 seconds at 480p. Saved work stays unchanged.",
  FREE_ALLOWANCE_EXHAUSTED: "No free generations are available. Buy credits for future paid generation; credit-funded generation is not connected yet.",
  FREE_PREPARATION_LIMIT: "This free preparation budget is used. Reuse an approved reference or saved Storyboard. Paid preparation is not connected yet.",
  FREE_RESERVATION_REQUIRED: "Generation needs a valid reserved free allowance. Refresh the project before trying again.",
  GENERATION_POLICY_SETUP_REQUIRED: "Free-generation protection needs database migration 102. New provider requests are blocked.",
  GENERATION_POLICY_CONFIGURATION_INVALID: "Generation policy configuration needs attention. New provider requests are blocked.",
  GENERATION_PIPELINE_NOT_SUPPORTED: "Free generation supports the UGC V3 workflow only. Existing results remain available.",
};
export function assertFreeVideoSettings(duration: number | string, resolution: string) {
  if (Number(duration) !== freeVideoDurationSeconds || resolution !== freeVideoResolution) throw new Error("GENERATION_LIMIT_5S_480P");
}
