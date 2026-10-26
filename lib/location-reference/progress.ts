import type { UgcJobProgress, UgcProgressStep } from "@/lib/ugc-jobs/contract";
import { locationMessages, type LocationReview } from "./contract";

export function withLocationProgress(progress: UgcJobProgress, location: LocationReview | undefined): UgcJobProgress {
  if (!location) return progress.locationEnabled && progress.referenceReview?.locationEligible ?
    { ...progress, message: "Preparing location. Waiting for the local UGC worker." } : progress;
  const terminal = ["cancelled", "completed"].includes(progress.status);
  const current = progress.referenceReview?.locationEligible && location.dependenciesCurrent && !terminal;
  if (!current) return { ...progress, location };
  const active = ["queued_plan", "running_plan", "queued_image", "running_image", "rejecting"].includes(location.state);
  const running = ["running_plan", "running_image", "rejecting"].includes(location.state) && !!location.leaseExpiresAt;
  const stalled = running && (!location.heartbeatAt || Date.parse(location.leaseExpiresAt!) <= Date.parse(progress.serverNow));
  const locationSteps: UgcProgressStep[] = [
    { id: "preparing", label: "Preparing location", state: location.plan ? "completed" : location.state === "failed" ? "failed" : "active" },
    { id: "generating", label: "Generating location", state: location.imageAvailable ? "completed" : location.phase === "generating" ? "active" : "waiting" },
    { id: "saving", label: "Saving location", state: location.imageAvailable ? "completed" : location.phase === "saving" ? "active" : "waiting" },
    { id: "review", label: "Waiting for review", state: location.state === "approved" ? "completed" : ["plan_review", "image_review"].includes(location.state) ? "paused" : "waiting" },
    { id: "approved", label: "Location approved", state: location.state === "approved" ? "completed" : "waiting" },
  ];
  return { ...progress, location, locationSteps, currentStage: "location_reference", stageLabel: "Location reference",
    paused: !active, message: location.state === "approved" ? "Location approved. Generation paused before storyboard." :
      location.error === "LOCATION_RECONCILIATION_REQUIRED" ? "Location request needs reconciliation. No new paid request will be sent. Saved references remain available." :
        location.state === "plan_review" ? "Waiting for review. Edit the location plan in References before generating an image." :
          location.state === "image_review" ? "Waiting for review. Accept Location or Reject and Regenerate in References." : locationMessages[location.phase],
    steps: progress.steps.map(step => step.id === "location_reference" ? { ...step, state: location.state === "approved" ? "completed" :
      location.state === "failed" ? "failed" : active ? "active" : "paused" } : step),
    worker: { heartbeatAt: location.heartbeatAt, leaseExpiresAt: location.leaseExpiresAt, state: stalled ? "stalled" : running ? "healthy" : "inactive" },
  };
}
