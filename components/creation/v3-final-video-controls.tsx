"use client";

import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { uncheckedQuality } from "@/lib/final-video-generation-v3/runtime-contract";
import { videoRequestBlocker } from "@/lib/final-video-generation-v3/video-request-status";
import { useStudioPanels } from "./studio-workspace-panels";
import { AppNotification } from "@/components/notifications/app-notification";


type Action = (action: string, payload?: Record<string, unknown>) => Promise<boolean>;

export function FinalVideoGenerate({ generating, disabled, onGenerate }: {
  generating: boolean; disabled: boolean; onGenerate: (button: HTMLButtonElement) => void;
}) {
  return <div className="flex flex-wrap items-center gap-3">
    <Button disabled={disabled || generating} onClick={event => onGenerate(event.currentTarget)}>Generate Final Video</Button>
    {generating && <span role="status" aria-label="Generating final video" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="size-4 text-primary motion-safe:animate-spin" />
      <span>Generating...</span>
    </span>}
  </div>;
}

export function FinalVideoReview({ run, act, busy, segmentCount, generating = false, compact = false }: {
  run: RuntimeDto["runs"][number]; act: Action; busy: boolean; segmentCount: number; generating?: boolean; compact?: boolean;
}) {
  const panels = useStudioPanels();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ready = !generating && run.state === "awaiting_review" && !!run.preview;
  const needsRecovery = run.state === "reconciliation_required" || run.state === "deleting" ||
    run.state === "provider_processing" && !!run.errorCode;
  return <div className={compact ? "min-w-0 space-y-3" : "min-w-0 space-y-4"}>
    {ready && <>
      {!compact && <div role="status" className="inline-flex max-w-full items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
        <Check aria-hidden="true" className="size-3.5 shrink-0" />
        Ready for review
      </div>}
      <Button variant="outline" className={compact ? undefined : "w-full"} onClick={() => panels?.selectMedia(`v3-video:${run.id}`)}>View in Preview</Button>
      <div className="flex flex-wrap gap-2">
        <Button className={compact ? undefined : "min-w-0 flex-1 basis-40"} disabled={busy || !run.current} onClick={() => void act("approve", { id: run.id, reviewMode: "direct" })}>
          {segmentCount > 1 && run.segmentId !== "joined" ? "Approve Segment" : "Approve Final Video"}
        </Button>
        <Button variant="outline" className={compact ? undefined : "min-w-0 flex-1 basis-40"} disabled={busy} onClick={() => setConfirmDelete(true)}>Reject and Delete</Button>
      </div>
      {!compact && <p className="text-xs leading-relaxed text-muted-foreground">Use Preview to watch the video before approving.</p>}
      {!run.current && <AppNotification role="status" className="text-sm text-muted-foreground">This video’s package is out of date. Review the current Generation Package.</AppNotification>}
      <Dialog open={confirmDelete} onOpenChange={(open) => { if (!busy) setConfirmDelete(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this Final Video?</DialogTitle>
            <DialogDescription>This permanently deletes the saved video and local candidate copies. Generating another video requires a new approval and an explicit Generate action.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => void act("reject_delete", {
              id: run.id, quality: run.quality ?? uncheckedQuality, confirmedDeletion: true,
            }).then(ok => { if (ok) setConfirmDelete(false); })}>Reject and Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>}
    {!compact && ["awaiting_review", "approved"].includes(run.state) && <p className="text-xs text-muted-foreground">Requested: {run.resolution}{run.actualDimensions ? ` · Actual: ${run.actualDimensions.width} × ${run.actualDimensions.height}` : ""}</p>}
    {run.state === "deleted" && <p className="text-sm text-muted-foreground">Video deleted. Approve the Generation Package again to generate another video.</p>}
    {run.submissionBlocker && <AppNotification role="status" className="text-sm text-muted-foreground">{videoRequestBlocker(run.submissionBlocker) ?? "Video generation is paused. See Progress for details."}</AppNotification>}
    {run.errorCode && <AppNotification role="alert" className="text-sm text-muted-foreground">
      {run.errorCode === "OUTPUT_HOST_APPROVAL_REQUIRED" ? "The generated video needs administrator download-host approval before saving. See Progress."
        : run.errorCode === "V3_PROVIDER_OUTCOME_UNKNOWN" ? "The submission outcome is unknown. See Progress before taking another paid action."
        : "This saved video needs attention. See Progress or recover the saved work."}
    </AppNotification>}
    {run.state === "failed" && !run.errorCode && <AppNotification role="alert" className="text-sm text-muted-foreground">Video generation failed. See Progress for details.</AppNotification>}
    {run.state === "awaiting_review" && !run.preview && <AppNotification role="alert" className="text-sm text-muted-foreground">The saved video preview is unavailable. See Progress before reviewing.</AppNotification>}
    {run.state === "queued" && run.submissionBlocker === "V3_REFERENCE_DELIVERY_EXPIRED" &&
      <Button variant="outline" disabled={busy} onClick={() => void act("refresh_video_delivery", { id: run.id })}>Refresh saved request links</Button>}
    {needsRecovery && <Button variant="outline" disabled={busy} onClick={() => void act("recover", { id: run.id })}>
      {run.state === "deleting" ? "Retry deletion" : "Recover saved work"}
    </Button>}
  </div>;
}
