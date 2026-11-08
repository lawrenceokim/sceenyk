"use client";

import { useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { uncheckedQuality } from "@/lib/final-video-generation-v3/runtime-contract";
import { useStudioPanels } from "./studio-workspace-panels";

export function V3MergeReview({ workspace, act, disabled }: { workspace: RuntimeDto;
  act: (action: string, payload?: Record<string, unknown>) => Promise<boolean>; disabled: boolean }) {
  const panels = useStudioPanels(), [pending, setPending] = useState(false), [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const lock = useRef(false), group = workspace.multiClip, merge = group?.merge;
  if (!group) return null;
  const result = workspace.runs.find(r => r.id === merge?.resultId) ?? workspace.runs.filter(r => r.segmentId === "joined" && r.packageId === group.packageId && r.state !== "deleted").at(-1);
  const outdated = !!result && !result.current;
  const processing = !!merge && ["queued", "running"].includes(merge.status ?? "");
  const deleting = result?.state === "deleting", approved = result?.state === "approved" && !outdated;
  const reviewable = result?.state === "awaiting_review";
  const failed = merge?.status === "failed" || merge?.status === "reconciliation_required";
  const request = async (action: string, payload: Record<string, unknown>) => {
    if (lock.current) return false;
    lock.current = true; setPending(true);
    try { return await act(action, payload); } finally { lock.current = false; setPending(false); }
  };
  const canStart = !!merge?.canMerge && !processing && !deleting && (!result || outdated || result.state === "deleted");
  return <div className="min-w-0 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-medium">
      {processing || deleting ? <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 motion-safe:animate-spin" /> : approved ? <Check aria-hidden="true" className="size-4 text-primary" /> : null}
      {processing ? "Merging videos..." : deleting ? "Deleting merged video..." : outdated ? "Previous merged video is outdated" : approved ? "Final video approved" : reviewable ? "Final video ready for review" : failed ? "Merging failed" : group.readyForMerging ? "Ready to merge" : "Approve every required clip to merge"}
    </p>
    {outdated && <p className="text-xs text-muted-foreground">The approved clips or project settings changed. Merge the current approved clips again.</p>}
    {failed && <p role="alert" className="text-sm text-muted-foreground">The clips could not be merged. Your approved clips are saved. Retry merging, or open Progress for details.</p>}
    <div className="flex min-w-0 flex-wrap gap-2 [&>button]:max-w-full [&>button]:whitespace-normal">
      {(!result || outdated || result.state === "deleted") && <Button size="sm" disabled={disabled || pending || !canStart} onClick={() => void request("merge", {
        packageId: group.packageId, packageHash: group.packageHash, manifestHash: merge?.manifestHash,
      })}>{failed ? "Retry merging" : "Merge Videos"}</Button>}
      {result?.preview && !deleting && <Button size="sm" variant="outline" onClick={() => panels?.selectMedia(`v3-video:${result.id}`)}>View in Preview</Button>}
      {reviewable && <>
        <Button size="sm" disabled={disabled || pending || outdated || !result.preview} onClick={() => void request("approve", { id: result.id, reviewMode: "direct" })}>Approve Final Video</Button>
        <Button size="sm" variant="outline" disabled={disabled || pending} onClick={() => setConfirmDelete(result.id)}>Reject and Delete</Button>
      </>}
      {deleting && result?.errorCode && <Button size="sm" variant="outline" disabled={disabled || pending} onClick={() => void request("recover", { id: result.id })}>Retry deletion</Button>}
    </div>
    <Dialog open={!!confirmDelete} onOpenChange={open => { if (!open && !pending) setConfirmDelete(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete this merged video?</DialogTitle><DialogDescription>Your approved individual clips stay saved. You can merge them again without generating new clips.</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button disabled={disabled || pending || !confirmDelete} onClick={() => {
            if (confirmDelete) void request("reject_delete", { id: confirmDelete, confirmedDeletion: true, quality: uncheckedQuality }).then(done => { if (done) setConfirmDelete(null); });
          }}>Reject and Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
