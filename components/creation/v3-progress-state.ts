import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { packageBuildError, packageBuildLabel } from "@/lib/final-video-generation-v3/package-status";
import { referenceFailureLabel } from "@/lib/final-video-generation-v3/reference-status";
import { videoExecutionLabel } from "@/lib/final-video-generation-v3/video-progress";
import { videoRequestBlocker } from "@/lib/final-video-generation-v3/video-request-status";

export type ProgressStatus = "not_started" | "in_progress" | "waiting_approval" | "completed" | "needs_attention" | "failed";
export type ProgressStage = {
  id: "references" | "storyboard" | "package" | "final";
  title: string;
  status: ProgressStatus;
  description: string;
  guidance: string;
};
export const progressStatusLabels: Record<ProgressStatus, string> = {
  not_started: "Not started", in_progress: "In progress", waiting_approval: "Waiting for approval",
  completed: "Completed", needs_attention: "Needs attention", failed: "Failed",
};
export function storyboardProgressError(code: string | null | undefined) {
  if (code === "V3_OPENAI_OUTCOME_UNKNOWN") return "The Storyboard request outcome is unconfirmed.";
  if (code === "V3_CREATIVE_INPUT_STALE") return "Your saved inputs changed while the Storyboard was being prepared.";
  if (code?.startsWith("V3_DIRECTOR_") && code.includes("TIMING")) return "Your Storyboard has invalid scene or speech timing.";
  if (code === "V3_DIRECTOR_STYLE_INVALID") return "Your Storyboard does not match the saved Visual Style or Tone.";
  if (code?.startsWith("V3_DIRECTOR_")) return "Your saved Storyboard did not pass its structure checks.";
  return "Your Storyboard could not be prepared.";
}

// A read-only projection of the owned DTO. No workflow flags or transitions are saved here.
export function workflowProgress(workspace: RuntimeDto, productRequired: boolean) {
  const p = workspace.preflight;
  const latest = (kind: string) => workspace.artifacts.find(a => a.kind === kind && a.activeSlot && !a.rejected && !a.cleanupPending);
  const task = (kind: string) => workspace.tasks.filter(t => t.kind === kind && !t.referenceCleanup && t.errorCode !== "V3_REFERENCE_REQUEST_SUPERSEDED").at(-1);
  const active = (t: ReturnType<typeof task>) => !!t && ["queued", "running"].includes(t.status) && (t.current || t.providerStarted);
  const failed = (t: ReturnType<typeof task>) => !!t && ["failed", "reconciliation_required", "cleanup_pending"].includes(t.status);
  const required = ["character", ...(productRequired ? ["product"] : []), "location"];
  const names: Record<string, string> = { character: "Character Sheet", product: "Product Sheet", location: "Location" };
  const references: ProgressStage = { id: "references", title: "References", status: "not_started",
    description: "Your references are ready to prepare.", guidance: "Open Sources to generate and approve your required references." };
  const referenceProblem = required.find(kind => !active(task(kind)) && (!latest(kind)?.approved || !latest(kind)?.current) && failed(task(kind)));
  const referenceStale = required.find(kind => latest(kind) && !latest(kind)?.current);
  const referenceWorking = required.find(kind => active(task(kind)));
  const referenceReview = required.find(kind => latest(kind)?.current && !latest(kind)?.approved);
  if (referenceProblem) {
    const t = task(referenceProblem)!;
    references.status = t.status === "failed" ? "failed" : "needs_attention";
    references.description = t.location?.failureLabel ?? referenceFailureLabel(referenceProblem, t.diagnostics);
    references.guidance = t.recoveryAvailable ? "Open Sources and recover the saved response before continuing."
      : `Open Sources to review the ${names[referenceProblem]} problem and its available recovery or generation action.`;
  } else if (referenceWorking) {
    references.status = "in_progress";
    references.description = task(referenceWorking)?.location?.label ?? `Your ${names[referenceWorking]} is ${task(referenceWorking)?.status === "queued" ? "queued" : "being generated"}.`;
    references.guidance = "Your references are being prepared. Review each one in Sources when it is ready.";
  } else if (referenceStale) {
    references.status = "needs_attention";
    references.description = `Your ${names[referenceStale]} is out of date.`;
    references.guidance = "Open Sources to regenerate and approve references for your saved inputs.";
  } else if (referenceReview) {
    references.status = "waiting_approval";
    references.description = `Your ${names[referenceReview]} is ready for review.`;
    references.guidance = "Review and approve your required references in Sources to continue.";
  } else if (required.every(kind => latest(kind)?.current && latest(kind)?.approved)) {
    references.status = "completed";
    references.description = "All required references are approved.";
  } else if (required.some(kind => latest(kind) || task(kind))) {
    references.status = "in_progress";
    const missing = required.find(kind => !latest(kind)?.approved);
    references.description = `Your ${names[missing!]} still needs to be prepared.`;
  }

  const storyboard: ProgressStage = { id: "storyboard", title: "Storyboard", status: "not_started",
    description: "Your Storyboard is ready to generate.", guidance: "Open Storyboard to generate your scenes, then review and approve them." };
  const s = latest("storyboard"), st = task("storyboard");
  if (references.status !== "completed") {
    storyboard.status = s || st ? "needs_attention" : "not_started";
    storyboard.description = "Your Storyboard needs current approved references.";
    storyboard.guidance = "Finish your references in Sources, then generate and approve the current Storyboard.";
  } else if (active(st)) {
    storyboard.status = "in_progress";
    storyboard.description = st?.status === "queued" ? "Your Storyboard is queued." : "Your Storyboard is being generated.";
    storyboard.guidance = "Your scenes are being prepared. Review your Storyboard when it is ready.";
  } else if (s?.current) {
    storyboard.status = s.approved ? "completed" : "waiting_approval";
    storyboard.description = s.approved ? "Your Storyboard is approved." : "Your Storyboard is ready for review.";
    storyboard.guidance = "Review and approve your Storyboard to continue.";
  } else if (s) {
    storyboard.status = "needs_attention";
    storyboard.description = "Your Storyboard is out of date.";
    storyboard.guidance = "Open Storyboard to regenerate and approve it for your saved inputs.";
  } else if (failed(st)) {
    storyboard.status = st?.status === "failed" ? "failed" : "needs_attention";
    storyboard.description = st?.status === "reconciliation_required" ? "Your Storyboard response needs recovery." : storyboardProgressError(st?.errorCode);
    storyboard.guidance = st?.recoveryAvailable || st?.status === "reconciliation_required"
      ? "Use Recover saved response below to recover this Storyboard without a new generation request."
      : "Review your saved inputs and the Storyboard error below before trying again.";
  }

  const matchingRuns = workspace.runs.filter(r => r.state !== "deleted" && r.current && r.packageId === p?.packageId);
  // An explicit later attempt supersedes an earlier failure for that segment's display.
  const runs = matchingRuns.filter((r, index) => !matchingRuns.slice(index + 1).some(n => n.segmentId === r.segmentId));
  const packageStage: ProgressStage = { id: "package", title: "Package", status: "not_started",
    description: "Your Generation Package is ready to build.", guidance: "Open Package to build your Generation Package and estimated video cost." };
  const pt = task("package");
  const packageCurrent = !!p && p.currentness === "current" && !workspace.packageStale;
  if (storyboard.status !== "completed" || workspace.packageStale || p && !packageCurrent) {
    packageStage.status = p || pt || workspace.packageStale ? "needs_attention" : "not_started";
    packageStage.description = storyboard.status !== "completed" ? "Your Generation Package needs a current approved Storyboard." : "Your Generation Package is out of date.";
    packageStage.guidance = "Approve your current references and Storyboard, then rebuild and approve the package.";
  } else if (pt && ["queued", "running"].includes(pt.status)) {
    packageStage.status = "in_progress";
    packageStage.description = pt.packageBuild ? packageBuildLabel(pt.packageBuild, pt.status) : "Your Generation Package is being prepared.";
    packageStage.guidance = "Your package and estimated cost are being prepared. Review them when ready.";
  } else if (packageCurrent && runs.length > 0) {
    // A saved execution proves this exact package was approved. Checks for a
    // future request (including an expired quote) do not undo that saved approval.
    packageStage.status = "completed";
    packageStage.description = "Your Generation Package is approved.";
  } else if (workspace.resolutionPricingAvailable === false) {
    packageStage.status = "needs_attention";
    packageStage.description = `Pricing for ${workspace.selectedResolution} is not configured.`;
    packageStage.guidance = "Choose 480p or ask the administrator to configure a verified rate before approving paid generation.";
  } else if (failed(pt) || pt?.packageBuild?.code || p && (p.estimatedCostMicrousd === null || !p.quoteId)) {
    packageStage.status = failed(pt) ? "failed" : "needs_attention";
    packageStage.description = packageBuildError(pt?.packageBuild?.code ?? pt?.errorCode ?? "COST_ESTIMATE_UNAVAILABLE");
    packageStage.guidance = pt?.packageBuild?.recoverable ? "Use Recover saved response below to recover your saved package."
      : "Open Package to review the saved build problem and rebuild when it is resolved.";
  } else if (packageCurrent) {
    // Consumed/expired submission authority does not undo the package approval used by an existing run.
    const approved = p.authorizationState === "bound" && (runs.length > 0 || !p.issues.some(code => code.startsWith("V3_AUTHORIZATION_") || code === "V3_SEGMENT_AUTHORIZATION_REQUIRED"));
    packageStage.status = approved ? "completed" : "waiting_approval";
    packageStage.description = approved ? "Your Generation Package is approved." : p.issues.includes("V3_AUTHORIZATION_EXPIRED")
      ? "Your package approval has expired." : "Your Generation Package is awaiting approval.";
    packageStage.guidance = "Review your estimated video cost and approve the package.";
  }

  const final: ProgressStage = { id: "final", title: "Final Video", status: "not_started",
    description: "Your video is ready to generate.", guidance: "Open Final Video and choose Generate to start your approved video." };
  const finalRuns = runs.filter(r => p?.segmentCount === 1 || r.segmentId === "joined");
  const completed = workspace.complete && references.status === "completed" && storyboard.status === "completed" && packageCurrent &&
    finalRuns.some(r => r.state === "approved" && r.completedAt);
  const review = finalRuns.find(r => r.state === "awaiting_review");
  const working = runs.find(r => ["queued", "submitting", "provider_processing", "result_saved", "deleting"].includes(r.state));
  const problem = runs.find(r => r.errorCode || r.submissionBlocker || ["failed", "reconciliation_required"].includes(r.state));
  const join = task("join");
  if (references.status !== "completed" || storyboard.status !== "completed" || !packageCurrent) {
    final.status = workspace.runs.some(r => r.state !== "deleted") ? "needs_attention" : "not_started";
    final.description = "Your video needs a current approved Generation Package.";
    final.guidance = "Finish the earlier stages and approve the current package. Previous videos remain in Final Video details below.";
  } else if (completed) {
    final.status = "completed";
    final.description = "Your project is complete.";
    final.guidance = "Your video has been approved and your project is complete.";
  } else if (review && !working) {
    final.status = review.preview ? "waiting_approval" : "needs_attention";
    final.description = review.preview ? "Your video is ready for review." : "Your video is saved, but its preview is unavailable.";
    final.guidance = review.preview ? "Your video is ready. Open Final Video to review and approve it."
      : "Sceenyk is refreshing access to the saved preview. Review the video in Final Video once it becomes available.";
  } else if (problem) {
    final.status = problem.state === "failed" ? "failed" : problem.state === "reconciliation_required" && problem.hasKnownRequest &&
      !["OUTPUT_HOST_APPROVAL_REQUIRED", "HIGGSFIELD_RESULT_EXPIRED"].includes(problem.errorCode ?? "") ? "in_progress" : "needs_attention";
    final.description = videoRequestBlocker(problem.submissionBlocker) ?? videoRequestBlocker(problem.errorCode) ??
      (problem.errorCode === "V3_PROVIDER_OUTCOME_UNKNOWN" ? "The video submission outcome is unconfirmed."
        : problem.state === "failed" ? "Your video generation failed." : videoExecutionLabel(problem));
    final.guidance = final.status === "in_progress" ? "Sceenyk is recovering your accepted request. You can return later; no new generation is submitted."
      : "Open Final Video to review this request and use its available recovery action. Your saved work is preserved.";
  } else if (working || join && ["queued", "running"].includes(join.status)) {
    final.status = "in_progress";
    final.description = working ? `Your video: ${videoExecutionLabel(working).toLowerCase()}.` : "Your final video is being joined and saved.";
    final.guidance = "Sceenyk is generating your video. You can return later.";
  } else if (join?.status === "failed" && p.segmentCount > 1 && runs.length) {
    final.status = "failed";
    final.description = "Your final video could not be joined.";
    final.guidance = "Use Recover local join below to finish with your saved approved segments.";
  } else if (runs.some(r => r.state === "awaiting_review")) {
    final.status = "waiting_approval";
    final.description = "Your generated segments are ready for review.";
    final.guidance = "Open Final Video to review and approve the segments before the final video is joined.";
  } else if (runs.some(r => r.state === "approved")) {
    const segmentsApproved = p.segmentCount > 1 && !finalRuns.length && runs.filter(r => r.state === "approved").length === p.segmentCount;
    final.status = segmentsApproved ? "in_progress" : "needs_attention";
    final.description = final.status === "in_progress" ? "Your approved segments are being prepared for joining." : "Your final approval needs review.";
    final.guidance = "Open Final Video to review the saved final-video state. Completion requires a current approved final video.";
  } else if (packageStage.status !== "completed") {
    final.description = "Your video is waiting for package approval.";
    final.guidance = "Review your estimated video cost and approve the package to continue.";
  } else if (!p.canSubmit) {
    final.status = "needs_attention";
    final.description = !p.transportEnabled ? "Video generation is currently paused by the administrator."
      : p.issues.includes("V3_PRIOR_OUTCOME_REQUIRES_RECONCILIATION") || p.issues.includes("EXISTING_INTENT_RECONCILE_OR_REUSE")
        ? "An earlier video request needs to be resolved."
        : "Video generation prerequisites need attention.";
    final.guidance = "Review Final Video Prerequisites below and the available actions in Final Video. Ask the administrator to resolve service setup problems.";
  }
  const stages = [references, storyboard, packageStage, final];
  const current = completed ? final : stages.find(stage => stage.status !== "completed") ?? final;
  return { stages, current, complete: completed, runs, generated: finalRuns.some(r => ["awaiting_review", "approved"].includes(r.state)) };
}
