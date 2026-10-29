import type { UgcJobProgress } from "@/lib/ugc-jobs/contract";
import type { FinalAvailability } from "./contract";

export function withFinalVideoProgress(progress: UgcJobProgress, finalVideo: FinalAvailability): UgcJobProgress {
  const base = { ...progress, finalVideo }; const review = finalVideo.review;
  if (!review || review.state === "deleted" || progress.status === "cancelled") return base;
  const active = finalVideo.enabled && ["queued", "running", "deleting"].includes(review.state);
  const leased = Date.parse(review.leaseExpiresAt ?? "") > Date.parse(progress.serverNow);
  const complete = review.state === "approved" && review.current && progress.status === "completed" && !!progress.completedAt;
  const composing = ["combining", "finalizing", "review", "approved"].includes(review.phase);
  return { ...base,
    ...(progress.status === "completed" && !complete ? { status: "awaiting_confirmation" as const, stage: "awaiting_confirmation" as const, completedAt: null } : {}),
    currentStage: complete ? "complete" : composing ? "finalizing" : "video_generation",
    stageLabel: "Final video", message: complete ? "Complete" : review.state === "approved" ? "Final approval needs review" : review.label, paused: !active && !complete,
    worker: { heartbeatAt: review.heartbeatAt, leaseExpiresAt: review.leaseExpiresAt,
      state: active && review.state === "running" ? leased ? "healthy" : "stalled" : "inactive" },
    steps: progress.steps.map(step => step.id === "video_generation" ? { ...step, state: composing ? "completed" : review.error ? "failed" : active ? "active" : "paused" } :
      step.id === "finalizing" ? { ...step, state: complete || review.state === "review" ? "completed" : composing ? "active" : "waiting" } :
      step.id === "complete" ? { ...step, state: complete ? "completed" : "waiting" } : step) };
}
