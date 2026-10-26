import type { UgcJobProgress, UgcProgressStep } from "@/lib/ugc-jobs/contract";
import { locationErrorMessage, locationMessages, type LocationReview } from "./contract";

export function withLocationProgress(progress: UgcJobProgress, location: LocationReview | undefined): UgcJobProgress {
  if (!location) return progress.referenceReview?.locationEligible ?
    { ...progress, message: "Generate Location in References to create your filming environment." } : progress;
  const terminal = ["cancelled", "completed"].includes(progress.status);
  const current = progress.referenceReview?.locationEligible && !terminal;
  if (!current) return { ...progress, location };
  const active = ["queued_plan", "running_plan", "queued_image", "running_image", "rejecting"].includes(location.state) && location.requested && !location.canRetryDelete;
  const running = ["running_plan", "running_image", "rejecting"].includes(location.state) && !!location.leaseExpiresAt;
  const stalled = running && (!location.heartbeatAt || Date.parse(location.leaseExpiresAt!) <= Date.parse(progress.serverNow));
  const locationSteps: UgcProgressStep[] = [
    { id: "preparing", label: "Preparing location", state: ["queued_image", "running_image", "image_review", "plan_review", "approved", "idle"].includes(location.state) || location.providerCompleted ? "completed" : location.state === "failed" ? "failed" : active ? "active" : "waiting" },
    { id: "generating", label: "Generating location", state: location.imageAvailable ? "completed" : location.phase === "generating" ? "active" : "waiting" },
    { id: "saving", label: location.phase === "recovering" ? "Recovering saved location" : "Saving location", state: location.imageAvailable ? "completed" : ["saving", "recovering"].includes(location.phase) ? "active" : "waiting" },
    { id: "review", label: "Waiting for review", state: location.state === "approved" ? "completed" : location.state === "image_review" ? "paused" : "waiting" },
    { id: "approved", label: "Location approved", state: location.state === "approved" ? "completed" : "waiting" },
  ];
  return { ...progress, location, locationSteps, currentStage: "location_reference", stageLabel: "Location reference",
    paused: !active, message: location.state === "approved" ? "Location approved. Generation paused before storyboard." :
      location.error ? locationErrorMessage(location.error, location.providerCompleted) :
        location.canGenerate ? "Generate Location in References to create your filming environment." :
          location.state === "image_review" ? "Waiting for review. Accept Location or Reject and Delete in References." : locationMessages[location.phase],
    steps: progress.steps.map(step => step.id === "location_reference" ? { ...step, state: location.state === "approved" ? "completed" :
      location.state === "failed" || location.canRetryDelete ? "failed" : active ? "active" : "paused" } : step),
    worker: { heartbeatAt: location.heartbeatAt, leaseExpiresAt: location.leaseExpiresAt, state: stalled ? "stalled" : running ? "healthy" : "inactive" },
  };
}
