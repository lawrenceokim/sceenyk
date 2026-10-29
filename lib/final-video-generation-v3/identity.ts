import "server-only";
import { packageDigest } from "@/lib/video-generation-package/builder";
import { capabilitiesSchema } from "./contract";
import type { VideoCommand, SegmentPlan, PlanningInput, DirectorStoryboard } from "./contract";

export const v3Digest = (kind: string, value: unknown) => packageDigest(`sceenyk-v3-${kind}`, value);
export function normalizeCapabilities(value: unknown) {
  const cap = capabilitiesSchema.parse(value);
  cap.supportedDurationsMs = [...new Set(cap.supportedDurationsMs)].sort((a, b) => a - b);
  cap.modes = [...new Set(cap.modes)].sort();
  for (const key of ["supportedAspectRatios", "supportedFormats", "supportedResolutions", "sources"] as const) cap[key] = [...new Set(cap[key])].sort();
  for (const kind of ["image", "audio", "video"] as const) {
    const types = cap.referenceLimits[kind].mimeTypes;
    if (types !== null) cap.referenceLimits[kind].mimeTypes = [...new Set(types)].sort();
  }
  return cap;
}
export const commandFingerprint = (command: VideoCommand) => v3Digest("video-command", command);
export const storyboardContentHash = (content: DirectorStoryboard) => v3Digest("storyboard", content);
export const packageContentHash = (input: Pick<PlanningInput, "workflow" | "scope" | "provenance" | "storyboard" | "direction" | "references">) =>
  v3Digest("creative-package", { workflow: input.workflow, scope: input.scope, provenance: input.provenance,
    storyboard: input.storyboard, direction: input.direction, references: input.references });
export function freezeDocument<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freezeDocument(child); Object.freeze(value); }
  return value;
}
export const planFingerprint = (plan: Omit<SegmentPlan, "fingerprint" | "readinessIssues">) => v3Digest("segment-plan", plan);
// This phase deliberately has no transport and cannot be enabled with an env flag.
export function assertPaidV3Execution(): never { throw new Error("PAID_V3_EXECUTION_DISABLED"); }
