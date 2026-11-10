import { generationPolicyMessages, type FreeGenerationAccess, type freePreparationKinds } from "./generation-policy";

type Access = FreeGenerationAccess & { ready: boolean; reason: string | null; settingsSupported: boolean };
type Preparation = typeof freePreparationKinds[number];
const labels: Record<Preparation, string> = { character: "Character Sheet", product: "Product Sheet", location: "Location", storyboard: "Storyboard" };

// Presentation of server decisions only; SQL/action/worker checks remain the
// authority. Separate free-allowance review from project and video permission.
export function generationUnavailability(policy: Access | undefined, kind: Preparation | "video" | "package"): string[] {
  if (!policy) return ["Checking generation access…"];
  if (!policy.ready) return [generationPolicyMessages[policy.reason ?? "GENERATION_POLICY_SETUP_REQUIRED"] ?? "Generation access is unavailable. Check setup and refresh."];
  const reasons: string[] = [];
  if (!policy.settingsSupported) reasons.push(generationPolicyMessages.GENERATION_LIMIT_5S_480P);
  if (!policy.projectAllowed || kind !== "video" && kind !== "package" && !policy.preparationAllowed)
    reasons.push(generationPolicyMessages[policy.projectBlocker ?? "FREE_PROJECT_HISTORY_REVIEW_REQUIRED"]);
  if (kind === "video" && !policy.videoAllowed && policy.projectAllowed)
    reasons.push(generationPolicyMessages[policy.paidBlocker ?? "FREE_PROJECT_VIDEO_USED"] ?? "New video generation is unavailable.");
  if (kind !== "video" && kind !== "package" && policy.preparationRemaining[kind] < 1)
    reasons.push(`${labels[kind]} has used both lifetime platform-funded starts. Failed or deleted requests still count; purchased credits do not reset this limit.`);
  return [...new Set(reasons)];
}
