import type { UgcJobProgress } from "@/lib/ugc-jobs/contract";
import { packageMessages, packageErrorMessage, type PackageReview } from "./contract";

export function withPackageProgress(progress: UgcJobProgress, review: PackageReview | undefined, eligible: boolean, available: boolean): UgcJobProgress {
  const base = { ...progress, generationPackage: review, packageEligible: eligible,
    packageEnabled: available && process.env.UGC_PACKAGE_ENABLED === "1", packageAvailable: available };
  if (["cancelled", "completed"].includes(progress.status) || progress.referenceReview?.regenerating ||
    progress.location?.requested && !progress.location.error && ["queued_plan", "running_plan", "queued_image", "running_image", "rejecting"].includes(progress.location.state) ||
    progress.storyboard && ["queued", "running", "deleting"].includes(progress.storyboard.state)) return base;
  if (!review || review.state === "deleted") return eligible ? { ...base, message: "Storyboard approved. Prepare Generation Package to continue." } : base;
  const active = review.current && ["queued", "running"].includes(review.state) && !review.error && base.packageEnabled;
  const leased = !!review.leaseExpiresAt && Date.parse(review.leaseExpiresAt) > Date.parse(progress.serverNow);
  return { ...base, currentStage: "build_generation_package", stageLabel: "Generation package", paused: !active,
    message: !review.current ? packageErrorMessage("PACKAGE_INPUT_CHANGED") : review.error ? packageErrorMessage(review.error) :
      !base.packageEnabled && ["queued", "running"].includes(review.state) ? "Package preparation is paused. Check local worker setup." :
      review.state === "queued" ? "Package queued. Waiting for the local worker; no provider request is involved." :
      review.state === "running" && !leased ? "Package worker stopped responding. Restart the local worker to recover this same build." : packageMessages[review.phase],
    steps: progress.steps.map(step => step.id === "build_generation_package" ? { ...step,
      state: review.current && review.state === "approved" ? "completed" : review.state === "failed" ? "failed" : active ? review.state === "queued" ? "waiting" : "active" : "paused" } :
      ["video_generation", "finalizing", "complete"].includes(step.id) ? { ...step, state: "waiting" } : step),
    worker: { heartbeatAt: review.heartbeatAt, leaseExpiresAt: review.leaseExpiresAt,
      state: active && review.state === "running" ? leased ? "healthy" : "stalled" : "inactive" } };
}
