import { z } from "zod";
export const packageBuildDetailsSchema = z.object({ stage: z.enum(["validation", "planning", "delivery", "payload", "estimate", "persistence", "ready"]),
  code: z.string().regex(/^[A-Z0-9_]{1,100}$/).nullable(), httpStatus: z.number().int().min(100).max(599).nullable(), packageId: z.uuid(),
  segmentId: z.string().regex(/^segment-\d+-[a-f0-9]{16}$/).nullable(), estimateStatus: z.enum(["not_requested", "requested", "available", "unavailable"]), recoverable: z.boolean() });
export type PackageBuildDetails = z.infer<typeof packageBuildDetailsSchema>;
export function packageBuildLabel(d: PackageBuildDetails, status: string) {
  if (status === "queued") return "Waiting to build Generation Package";
  if (["failed", "reconciliation_required", "done"].includes(status) && /STALE|CHANGED/.test(d.code ?? "")) return "References changed — rebuild required";
  if (d.recoverable && ["failed", "reconciliation_required"].includes(status)) return "Generation Package: Recovery required";
  if (["failed", "reconciliation_required"].includes(status)) {
    if (/ESTIMATE|HIGGSFIELD_(HTTP|NETWORK|RESPONSE)/.test(d.code ?? "")) return "Cost estimate unavailable";
    if (/APPROV/.test(d.code ?? "")) return "Approve required references first";
    return "Package build failed";
  }
  if (status === "done") return d.estimateStatus === "available" ? "Generation Package ready" : "Cost estimate unavailable";
  return { validation: "Validating project", planning: "Preparing generation plan", delivery: "Preparing approved references",
    payload: "Preparing generation request", estimate: "Checking generation cost", persistence: "Saving Generation Package", ready: "Generation Package ready" }[d.stage];
}
export function packageBuildError(code: string) {
  if (/STORYBOARD.*STALE|CREATIVE_INPUT_STALE/.test(code)) return "A project input changed after Storyboard approval. Rebuild the Storyboard first.";
  if (/STALE|CHANGED/.test(code)) return "References changed — rebuild required. Approve the current references and Storyboard first.";
  if (/PRODUCT.*APPROV/.test(code)) return "Generation Package could not be created because the Product Sheet is not approved.";
  if (/CHARACTER.*APPROV/.test(code)) return "Approve the current Character Sheet before building the Generation Package.";
  if (/LOCATION.*APPROV/.test(code)) return "Approve the current Location before building the Generation Package.";
  if (/APPROV/.test(code)) return "Approve the required current references and Storyboard before building the Generation Package.";
  if (/ESTIMATE|HIGGSFIELD_HTTP|HIGGSFIELD_NETWORK|HIGGSFIELD_RESPONSE/.test(code)) return "The Higgsfield cost estimate could not be retrieved. The package cannot be authorized or generated until a valid estimate is available.";
  if (code === "DURATION_UNREPRESENTABLE" || code === "SCENE_REPLANNING_REQUIRED") return "The approved Storyboard timings do not fit the supported generation segments. Review the Storyboard before rebuilding.";
  if (code === "V3_PACKAGE_SETUP_REQUIRED") return "Generation Package building needs database migration 085.";
  if (code === "V3_PACKAGE_BUILD_IN_PROGRESS") return "The existing package build is still processing.";
  if (code === "V3_PACKAGE_BINDING_INVALID") return "An approved reference has invalid saved storage metadata. No cost estimate or generation was requested.";
  if (code === "V3_PACKAGE_LEGACY_BINDING_PARSER_FAILED") return "The previous package build stopped while reading approved reference metadata. Build again to use the corrected parser.";
  return "Generation Package could not be created. Review the saved inputs and the local technical details, then retry the build.";
}
