export type SavedVideoProgress = {
  state: string; stage?: { stage: string } | null; submissionBlocker?: string | null; hasKnownRequest?: boolean;
  errorCode?: string | null; preview?: string | null;
  packageId?: string; current?: boolean;
};

export function videoExecutionLabel(run: SavedVideoProgress) {
  if (run.errorCode === "OUTPUT_HOST_APPROVAL_REQUIRED") return "Download needs administrator approval";
  if (run.errorCode === "HIGGSFIELD_RESULT_EXPIRED") return "Video result needs attention";
  if (run.submissionBlocker === "PAID_V3_EXECUTION_DISABLED") return "Video paused: paid submissions are disabled";
  if (run.submissionBlocker) return "Video request needs attention";
  if (run.state === "awaiting_review") return "Ready for Review";
  if (run.state === "approved") return "Approved video";
  if (run.state === "queued") return "Queued";
  if (run.state === "submitting") return "Submitting";
  if (run.state === "result_saved") return "Saving";
  if (run.state === "provider_processing") {
    if (run.stage?.stage === "V3_FINAL_VIDEO_SAVING" || run.stage?.stage === "V3_FINAL_VIDEO_SAVED") return "Saving";
    if (run.stage?.stage === "HIGGSFIELD_RESULT_RECEIVED") return "Downloading";
    return "Processing";
  }
  if (run.state === "reconciliation_required") return run.hasKnownRequest ? "Recovering accepted video request" : "Video outcome needs reconciliation";
  if (run.state === "deleting") return "Deleting video";
  return run.state === "deleted" ? "Video deleted" : "Video needs attention";
}

export function shouldPollV3Video(runs: SavedVideoProgress[]) {
  return runs.some(r => ["queued", "submitting", "provider_processing", "result_saved", "deleting"].includes(r.state) ||
    // A worker may restore a local receipt that is not yet in SQL. Status reads
    // remain read-only even when an unknown outcome cannot be resubmitted.
    r.state === "reconciliation_required" || r.state === "awaiting_review" && !r.preview);
}
