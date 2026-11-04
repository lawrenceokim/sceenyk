import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { videoRequestBlocker } from "@/lib/final-video-generation-v3/video-request-status";

// Presentation only. Server canSubmit and existing action guards stay authoritative.
export function finalVideoPresentation(workspace: RuntimeDto | null, options: { dirty: boolean; busy: boolean; requestPending: boolean }) {
  const p = workspace?.preflight;
  const runs = workspace?.runs.filter(run => !p || run.packageId === p.packageId) ?? [];
  const blockedRun = runs.find(run => run.state === "queued" && run.submissionBlocker);
  const activeRuns = runs.filter(run => !run.preview && !run.errorCode && !run.submissionBlocker && ["queued", "submitting", "provider_processing", "result_saved"].includes(run.state));
  const joining = workspace?.tasks.some(task => task.kind === "join" && ["queued", "running"].includes(task.status)) ?? false;
  const ready = runs.some(run => !!run.preview && ["awaiting_review", "approved"].includes(run.state) && (p?.segmentCount === 1 || run.segmentId === "joined"));
  const hasExistingRun = runs.some(run => run.state !== "deleted");
  const loading = !ready && (options.requestPending || activeRuns.length > 0 || joining);
  let reason: string | null = null;
  const issues = p?.issues ?? [];
  if (options.dirty) reason = "Save your changes before generating a video.";
  else if (options.requestPending) reason = "Preparing your video-generation request…";
  else if (blockedRun) reason = videoRequestBlocker(blockedRun.submissionBlocker) ?? `Video request paused: ${blockedRun.submissionBlocker}.`;
  else if (activeRuns.length || joining) reason = "A video-generation request is already processing.";
  else if (hasExistingRun) reason = runs.some(run => run.state === "awaiting_review")
    ? "Review your generated video below before starting another generation."
    : runs.some(run => ["reconciliation_required", "failed", "deleting"].includes(run.state))
      ? "The existing video request needs attention. Use its review or recovery controls below."
      : "This package already has a video. Review it below.";
  else if (options.busy || workspace?.processing) reason = "Another workflow operation is still processing.";
  else if (!p) reason = "Approve your Generation Package first.";
  else if (p.currentness !== "current" || workspace?.packageStale) reason = "Your package is out of date. Rebuild and approve it first.";
  else if (issues.includes("V3_AUTHORIZATION_EXPIRED")) reason = "Package authorization has expired. Review and approve it again.";
  else if (issues.includes("V3_AUTHORIZATION_BINDING_INVALID")) reason = "Review and approve the current Generation Package again.";
  else if (p.authorizationState !== "bound" || issues.some(issue => ["V3_AUTHORIZATION_REQUIRED", "V3_SEGMENT_AUTHORIZATION_REQUIRED"].includes(issue)))
    reason = p.authorizationState === "bound" ? "Review and approve your Generation Package again." : "Approve your Generation Package first.";
  else if (issues.some(issue => ["V3_PRIOR_OUTCOME_REQUIRES_RECONCILIATION", "EXISTING_INTENT_RECONCILE_OR_REUSE"].includes(issue))) reason = "An earlier video request must be resolved before generating again.";
  else if (issues.includes("HIGGSFIELD_CREDENTIALS_REQUIRED")) reason = "Video generation credentials and account scope need configuration.";
  else if (issues.length) reason = `Video generation is blocked: ${issues.join(", ")}.`;
  else if (!p.transportEnabled) reason = "Paid video generation is disabled by the server.";
  else if (!p.canSubmit) reason = "Video generation prerequisites need attention. See Progress for details.";
  return { runs, activeRuns, hasExistingRun, loading, reason };
}
