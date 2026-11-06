"use client";

import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { uncheckedQuality } from "@/lib/final-video-generation-v3/runtime-contract";
import { videoExecutionLabel } from "@/lib/final-video-generation-v3/video-progress";
import { videoRequestBlocker } from "@/lib/final-video-generation-v3/video-request-status";
import { useStudioPanels } from "./studio-workspace-panels";

type Action = (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
type Clip = NonNullable<RuntimeDto["multiClip"]>["clips"][number];
const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;

export function V3ClipManager({ workspace, act, disabled }: { workspace: RuntimeDto; act: Action; disabled: boolean }) {
  const group = workspace.multiClip;
  const panels = useStudioPanels();
  const [confirmation, setConfirmation] = useState<{ clip: Clip; maximumMicrousd: number; cumulativeMaximumMicrousd: number } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [approvedCost, setApprovedCost] = useState(false);
  if (!group) return <p className="text-sm text-muted-foreground">Approve the connected Storyboard, then build and approve its Generation Package to generate clips.</p>;
  const request = async (clipId: string, action: string, payload: Record<string, unknown>) => {
    if (pending) return false;
    setPending(clipId);
    try { return await act(action, payload); } finally { setPending(null); }
  };
  const selected = confirmation && group.clips.find(c => c.id === confirmation.clip.id);
  const selectedRun = selected && workspace.runs.find(r => r.id === selected.runId);
  const replacementMaximum = confirmation?.maximumMicrousd ?? null;
  const snapshotChanged = !!confirmation && (confirmation.clip.runId !== selected?.runId || group.packageId !== workspace.preflight?.packageId);
  const cumulativeMaximum = confirmation?.cumulativeMaximumMicrousd ?? null;
  const spendingChanged = cumulativeMaximum !== null && replacementMaximum !== null && group.committedMicrousd + group.reservedMicrousd + replacementMaximum > cumulativeMaximum;
  const confirm = (clip: Clip) => {
    setApprovedCost(false);
    setConfirmation({ clip, maximumMicrousd: clip.suggestedMaximumMicrousd,
      cumulativeMaximumMicrousd: Math.max(workspace.preflight?.estimatedCostMicrousd ?? 0, group.committedMicrousd + group.reservedMicrousd + clip.suggestedMaximumMicrousd) });
  };
  return <div className="min-w-0 space-y-3">
    <p className="text-sm text-muted-foreground">Generate and review each planned clip. Approved clips stay saved. Merging follows after every clip is approved.</p>
    <p className="text-xs text-muted-foreground">Estimated attempts so far: {usd(group.committedMicrousd)} · Reserved limit: {usd(group.reservedMicrousd)}</p>
    <ol aria-label="Planned video clips" className="grid min-w-0 gap-3 sm:grid-cols-2">
      {group.clips.map(clip => {
        const run = workspace.runs.find(r => r.id === clip.runId);
        const active = !!run && ["queued", "submitting", "provider_processing", "result_saved"].includes(run.state) && !run.submissionBlocker && !run.errorCode;
        const reviewable = run?.state === "awaiting_review";
        const locked = disabled || !!pending || workspace.proDurationRetained;
        const status = !run || run.state === "deleted" ? clip.authorized ? "Waiting to generate" : run ? "New cost approval required" : "Waiting for package approval"
          : run.state === "approved" ? "Approved" : videoExecutionLabel(run);
        return <li key={clip.id} className="min-w-0 space-y-3 rounded-xl border border-primary/20 bg-card p-3 text-card-foreground">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-medium">Clip {clip.number} <span className="text-xs font-normal text-muted-foreground">· {clip.durationMs / 1000}s</span></h3>
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-primary">
              {(active || pending === clip.id) && <LoaderCircle aria-label={`Generating clip ${clip.number}`} className="size-3.5 motion-safe:animate-spin" />}
              {run?.state === "approved" && <Check aria-hidden="true" className="size-3.5" />}{status}
            </span>
          </div>
          <p className="break-words text-xs text-muted-foreground">{clip.purpose}</p>
          <p className="text-xs text-muted-foreground">{clip.startMs / 1000}–{clip.endMs / 1000}s · Estimate {clip.estimatedCostMicrousd === null ? "unavailable" : `~${usd(clip.estimatedCostMicrousd)}`}{clip.attempts > 0 ? ` · Attempt ${clip.attempts}` : ""}</p>
          {clip.needsContinuityReview && <p role="status" className="text-xs text-warning-foreground">An earlier clip was regenerated. Review this clip’s continuity again; its saved output and approval are preserved.</p>}
          <div className="flex flex-wrap gap-2">
            {(!run || run.state === "deleted") && <Button size="sm" disabled={locked || !clip.canGenerate} onClick={() => void request(clip.id, "generate_clip", {
              packageId: group.packageId, packageHash: group.packageHash, clipId: clip.id, segmentId: clip.segmentId,
            })}>Generate Clip</Button>}
            {run?.preview && ["awaiting_review", "approved"].includes(run.state) && <Button size="sm" variant="outline" onClick={() => panels?.selectMedia(`v3-video:${run.id}`)}>View in Preview</Button>}
            {reviewable && <>
              <Button size="sm" disabled={locked || !run.current} onClick={() => void request(clip.id, "approve", { id: run.id, reviewMode: "direct" })}>Approve Clip</Button>
              <Button size="sm" variant="outline" disabled={locked} onClick={() => confirm(clip)}>Reject and Delete</Button>
            </>}
            {(reviewable || clip.canRegenerate && !clip.authorized) && <Button size="sm" variant="outline" disabled={locked || !run?.current} onClick={() => confirm(clip)}>Regenerate</Button>}
            {clip.canRenewAuthorization && <Button size="sm" variant="outline" disabled={locked} onClick={() => confirm(clip)}>Approve Clip Cost</Button>}
            {run && (run.state === "reconciliation_required" || run.state === "deleting" || run.state === "provider_processing" && run.errorCode) && <Button size="sm" variant="outline" disabled={locked} onClick={() => void request(clip.id, "recover", { id: run.id })}>{run.state === "deleting" ? "Retry deletion" : "Recover saved work"}</Button>}
            {run?.state === "queued" && run.submissionBlocker === "V3_REFERENCE_DELIVERY_EXPIRED" && <Button size="sm" variant="outline" disabled={locked} onClick={() => void request(clip.id, "refresh_video_delivery", { id: run.id })}>Refresh saved request links</Button>}
          </div>
          {run?.errorCode && <p role="alert" className="break-words text-xs text-muted-foreground">{run.hasKnownRequest ? "This clip needs attention. Recover the saved request; it will not submit again." : "This clip needs attention. See Progress before another paid action."}</p>}
          {run?.submissionBlocker && <p role="status" className="text-xs text-muted-foreground">{videoRequestBlocker(run.submissionBlocker) ?? "This request is paused. See Progress."}</p>}
          {!run && !clip.canGenerate && <p className="text-xs text-muted-foreground">{clip.authorized ? "Generation is awaiting provider setup. See Progress." : "Approve the current Generation Package first."}</p>}
        </li>;
      })}
    </ol>
    {group.readyForMerging && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-medium text-primary">All clips approved — ready for merging. Their order and private media are saved. Merge Videos will be available in Milestone 6; the final video is not complete yet.</p>}
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open && !pending) setConfirmation(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{selectedRun?.state === "awaiting_review" ? `Delete Clip ${selected?.number}?` : `Approve Clip ${selected?.number} ${selectedRun ? "regeneration" : "generation"} cost`}</DialogTitle>
          <DialogDescription>{selectedRun?.state === "awaiting_review" ? "This permanently deletes only this unapproved clip and its local copies. Other clips stay saved. Regeneration requires a new cost approval after deletion finishes." : `Approve one new attempt estimated at ${selected?.estimatedCostMicrousd == null ? "unavailable" : usd(selected.estimatedCostMicrousd)}, with a maximum of ${replacementMaximum === null ? "unavailable" : usd(replacementMaximum)}. Earlier attempts remain counted. Subsequent clips may need continuity review. After approval, choose Generate Clip.`}</DialogDescription>
        </DialogHeader>
        {selectedRun?.state !== "awaiting_review" && cumulativeMaximum !== null && <p className="text-xs text-muted-foreground">Cumulative spending ceiling, including previous attempts and reserved grants: {usd(cumulativeMaximum)}.</p>}
        {spendingChanged && <p role="alert" className="text-sm text-warning-foreground">Spending reservations changed. Close this dialog and review the updated cost before approving.</p>}
        {selectedRun?.state !== "awaiting_review" && <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={approvedCost} onChange={e => setApprovedCost(e.target.checked)} className="mt-1 size-4 accent-primary" />I approve this new attempt and its spending limit.</label>}
        <DialogFooter>
          <Button variant="outline" disabled={!!pending} onClick={() => setConfirmation(null)}>Cancel</Button>
          <Button disabled={disabled || !!workspace.proDurationRetained || !!pending || snapshotChanged || !selected || selectedRun?.state !== "awaiting_review" && (spendingChanged || !approvedCost || replacementMaximum === null || !selected.canRegenerate && !selected.canRenewAuthorization)} onClick={() => {
            if (!selected) return;
            void request(selected.id, selectedRun?.state === "awaiting_review" ? "reject_delete" : "authorize_clip", selectedRun?.state === "awaiting_review" ? {
              id: selectedRun.id, quality: selectedRun.quality ?? uncheckedQuality, confirmedDeletion: true,
            } : { operatorApproved: true, packageId: group.packageId, packageHash: group.packageHash, quoteId: workspace.preflight?.quoteId,
              segmentId: selected.segmentId, previousRunId: selectedRun?.id ?? null, maximumMicrousd: replacementMaximum, cumulativeMaximumMicrousd: cumulativeMaximum,
            }).then(ok => { if (ok) setConfirmation(null); });
          }}>{selectedRun?.state === "awaiting_review" ? "Confirm deletion" : "Approve regeneration cost"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
