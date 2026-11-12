import { generationPolicyMessages, type FreeGenerationAccess, type freePreparationKinds } from "./generation-policy";

type Access = FreeGenerationAccess & { ready: boolean; reason: string | null; settingsSupported: boolean };
type Preparation = typeof freePreparationKinds[number];

// Presentation of server decisions only; SQL/action/worker checks remain the
// authority. Separate free-allowance review from project and video permission.
export function generationUnavailability(policy: Access | undefined, kind: Preparation | "video" | "package"): string[] {
  if (!policy) return ["Checking generation access…"];
  if (!policy.ready) return [generationPolicyMessages[policy.reason ?? "GENERATION_POLICY_SETUP_REQUIRED"] ?? "Generation access is unavailable. Check setup and refresh."];
  const reasons: string[] = [];
  if (!policy.settingsSupported) reasons.push(generationPolicyMessages.GENERATION_LIMIT_5S_480P);
  // Local package validation/estimation does not admit funded generation.
  if (kind === "video" && !policy.projectAllowed)
    reasons.push(generationPolicyMessages[policy.projectBlocker ?? "FREE_PROJECT_HISTORY_REVIEW_REQUIRED"]);
  if (kind === "video" && !policy.videoAllowed && policy.projectAllowed)
    reasons.push(generationPolicyMessages[policy.paidBlocker ?? "FREE_PROJECT_VIDEO_USED"] ?? "New video generation is unavailable.");
  if (kind !== "video" && kind !== "package" && policy.preparationFunding === "credits" && policy.availableCredits < (kind === "location" ? 2 : 1))
    reasons.push(`Requires ${kind === "location" ? 2 : 1} credit${kind === "location" ? "s" : ""}. Insufficient balance.`);
  return [...new Set(reasons)];
}
