import type { UgcJobProgress } from "@/lib/ugc-jobs/contract";
import { storyboardErrorMessage, storyboardStatusLabel, storyboardQueueMessage, type StoryboardReview } from "./contract";
import { storyboardRecoveryMessage } from "./recovery-contract";

export function withStoryboardProgress(progress: UgcJobProgress, storyboard: StoryboardReview | undefined, eligible: boolean): UgcJobProgress {
  const base = { ...progress, storyboard, storyboardEligible: eligible, storyboardEnabled: process.env.UGC_STORYBOARD_ENABLED === "1" };
  if (["cancelled", "completed"].includes(progress.status)) return base;
  // A stale storyboard remains reviewable without obscuring active upstream
  // reference replacement or Location work in the shared Progress view.
  const locationActive = progress.location?.requested && !progress.location.error && !progress.location.canRetryDelete &&
    ["queued_plan", "running_plan", "queued_image", "running_image", "rejecting"].includes(progress.location.state);
  if (progress.referenceReview?.regenerating || locationActive) return base;
  if (!storyboard || storyboard.state === "deleted") return eligible ? { ...base, message: "Generate Storyboard to plan your scenes and script." } : base;
  const active = ["queued", "running", "deleting"].includes(storyboard.state) && !storyboard.error && storyboard.execution !== "paused";
  const leased = !!storyboard.leaseExpiresAt;
  return { ...base, currentStage: "build_storyboard", stageLabel: "Storyboard", paused: !active,
    message: !storyboard.current && storyboard.state !== "deleting" ? storyboardErrorMessage("STORYBOARD_INPUT_CHANGED") :
      storyboard.error ? storyboard.recovery ? storyboardRecoveryMessage(storyboard.recovery) : storyboardErrorMessage(storyboard.error) : storyboardQueueMessage(storyboard) ?? storyboardStatusLabel(storyboard),
    steps: progress.steps.map(step => step.id === "build_storyboard" ? { ...step,
      state: storyboard.state === "approved" && storyboard.current ? "completed" : storyboard.state === "failed" ? "failed" : storyboard.state === "queued" && active ? "waiting" : active ? "active" : "paused" } : step),
    worker: { heartbeatAt: storyboard.heartbeatAt, leaseExpiresAt: storyboard.leaseExpiresAt,
      state: active && leased ? Date.parse(storyboard.leaseExpiresAt!) <= Date.parse(progress.serverNow) ||
        !storyboard.heartbeatAt || Date.parse(progress.serverNow) - Date.parse(storyboard.heartbeatAt) > 90_000 ? "stalled" : "healthy" : "inactive" },
  };
}
