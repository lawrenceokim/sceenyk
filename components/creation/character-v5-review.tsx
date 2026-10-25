"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { V5Review, V5Slot } from "@/lib/character-v5/contract";
import type { ReferenceReviewSnapshot } from "@/lib/reference-review/contract";

const titles: Record<V5Slot, string> = { face: "Face", back: "Back", front_source: "Front source", front: "Headless Front", sheet: "Character Sheet" };
function PrivateV5Image({ src, alt, large }: { src: string; alt: string; large: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="block p-3 text-[11px] text-muted-foreground">Preview unavailable. Close and reopen to retry.</span> :
    // Session-authenticated, owner/version-bound private no-store media.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailed(true)}
      className={large ? "max-h-[75dvh] w-full object-contain" : "h-full w-full object-contain"} />;
}
export function CharacterV5Review({ projectId, jobId, workflow, enabled, onSaved, checkStatus }: {
  projectId: string; jobId: string; workflow?: V5Review; enabled: boolean;
  onSaved: (review: ReferenceReviewSnapshot) => void; checkStatus: () => void;
}) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [cropTop, setCropTop] = useState(workflow?.cropTop ?? 2000);
  const [selected, setSelected] = useState<{ slot: V5Slot; candidate: boolean } | null>(null);
  const [confirm, setConfirm] = useState<V5Slot | null>(null);
  const locked = busy || !enabled || workflow?.state === "running" || workflow?.state === "queued";
  const reviewing = workflow?.state === "review" && workflow.persistenceState === "ready";
  const preview = (slot: V5Slot, candidate = false) => `/api/ugc/character-v5?${new URLSearchParams({ projectId, jobId,
    version: String(workflow!.version), slot, ...(candidate ? { candidateId: workflow!.candidateId! } : {}) })}`;
  async function act(action: "start" | "accept" | "reject" | "regenerate" | "crop" | "approve" | "retry_saving", slot?: V5Slot) {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/ugc/character-v5", { method: "POST", cache: "no-store", credentials: "same-origin", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, jobId, version: workflow?.version ?? 0,
          action, ...(slot ? { slot } : {}), ...(["accept", "crop"].includes(action) ? { cropTop } : {}) }), signal: AbortSignal.timeout(210_000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Your decision could not be saved.");
      onSaved(result.review); setConfirm(null); setSelected(null); checkStatus();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your decision could not be saved."); checkStatus(); }
    finally { setBusy(false); }
  }
  const image = (slot: V5Slot, candidate = false, large = false) =>
    <PrivateV5Image key={`${workflow?.version}-${slot}-${candidate}`} src={preview(slot, candidate)}
      alt={`${titles[slot]}${candidate ? " candidate" : " accepted reference"}`} large={large} />;
  return <section aria-label="Character V5 review" className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-medium">Character Reference</h3>
      {workflow?.state === "approved" && workflow.persistenceState === "ready" && <span className="flex items-center gap-1 text-success-foreground"><Check className="size-3.5" />Approved</span>}</div>
    {!workflow ? <><p className="text-muted-foreground">Review and accept each image before the next view is generated.</p>
      <Button type="button" size="xs" disabled={locked} onClick={() => void act("start")}>{busy ? "Saving…" : "Start Character V5"}</Button></> : <>
      {workflow.state === "queued" && <p role="status" className="text-muted-foreground">{titles[workflow.slot]} is waiting for the local worker.</p>}
      {workflow.state === "running" && <p role="status" className="text-muted-foreground">{workflow.slot === "front" ? "Creating headless Front…" : workflow.slot === "sheet" ? "Building Character Sheet…" : `${workflow.workPhase === "generating" ? "Generating" : "Preparing"} ${titles[workflow.slot]}…`}</p>}
      {workflow.savingIncomplete && workflow.recoveryState !== "unrecoverable" && <p className="text-muted-foreground">{workflow.recoveryState === "stored" ?
        "The image is stored. Its review record still needs to be saved." : workflow.recoveryState === "provider_result" ?
        "The generated image is not stored yet. Retry saving will retrieve the existing result and save it." :
        "Saving is incomplete. Retry saving will check the existing image without generating another."}</p>}
      {workflow.recoveryState === "unrecoverable" && <p role="alert" className="text-destructive">Generated image could not be recovered. Regeneration is required.</p>}
      {workflow.recoveryState === "storage_missing" && <p role="alert" className="text-destructive">The saved image is missing or does not match its record. It cannot be reviewed or approved. Check storage before regenerating.</p>}
      {workflow.recoveryState === "unknown" && !workflow.savingIncomplete && <p role="alert" className="text-muted-foreground">Image storage could not be checked. Check status before reviewing or approving.</p>}
      {workflow.canRetrySaving && <Button type="button" size="xs" disabled={busy || !enabled} onClick={() => void act("retry_saving")}>Retry saving</Button>}
      {workflow.state === "failed" && <div className="space-y-2"><p className="text-muted-foreground">{workflow.errorCode === "CHARACTER_CANDIDATE_REJECTED" ? "Candidate rejected. Choose another image when ready." : workflow.canRetrySaving ? "Retry saving only recovers the existing image. It never requests a new generation." : "This step needs attention. Check Progress for details."}</p>
        {workflow.errorPhase === "candidate_delete" ? <Button type="button" size="xs" variant="outline" disabled={locked} onClick={() => void act("reject")}>Retry deletion</Button> :
          !workflow.reconciliationRequired && !workflow.canRetrySaving && <Button type="button" size="xs" variant="outline" disabled={locked} onClick={() => setConfirm(workflow.slot)}>Try {titles[workflow.slot]} again</Button>}</div>}
      {reviewing && <div className="space-y-2"><p className="font-medium">Review {titles[workflow.slot]}</p>
        <button type="button" className="mx-auto block aspect-[4/3] w-full max-w-sm cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => setSelected({ slot: workflow.slot, candidate: true })}>{image(workflow.slot, true)}</button>
        <p className="text-muted-foreground">Check the character, clothing, pose and framing before accepting.</p>
        {workflow.slot === "front_source" && <label className="flex flex-wrap items-center gap-2 text-muted-foreground">Crop from top: {cropTop / 100}%
          <input aria-label="Front crop from top" type="range" min={500} max={6000} step={100} value={cropTop} onChange={event => setCropTop(Number(event.target.value))} className="w-40 accent-primary" />
          <span>Choose a point below the head. You will review the cropped image next.</span></label>}
        <div className="flex flex-wrap gap-2"><Button type="button" size="xs" disabled={locked} onClick={() => void act("accept")}>Accept {titles[workflow.slot]}</Button>
          <Button type="button" size="xs" variant="outline" disabled={locked} onClick={() => void act("reject")}>Reject and delete image</Button></div>
      </div>}
      {workflow.accepted.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{workflow.accepted.map(slot => <div key={slot} className="space-y-1">
        <button type="button" className="aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => setSelected({ slot, candidate: false })}>{image(slot)}</button>
        <p className="flex items-center gap-1 text-[11px] text-success-foreground"><Check className="size-3" />{titles[slot]} accepted</p>
        {slot !== "front_source" && <Button type="button" size="xs" variant="ghost" disabled={locked || reviewing} onClick={() => setConfirm(slot === "front" ? "front_source" : slot)}>Regenerate</Button>}
      </div>)}</div>}
      {workflow.state === "failed" && workflow.slot === "front" && workflow.accepted.includes("front_source") && !workflow.reconciliationRequired &&
        <div className="flex flex-wrap items-center gap-2"><label className="text-muted-foreground">Crop from top: {cropTop / 100}% <input aria-label="Adjust Front crop" type="range" min={500} max={6000} step={100} value={cropTop} onChange={event => setCropTop(Number(event.target.value))} className="w-32 accent-primary" /></label>
          <Button type="button" size="xs" variant="outline" disabled={locked} onClick={() => void act("crop")}>Create adjusted crop</Button>
          <Button type="button" size="xs" variant="outline" disabled={locked} onClick={() => setConfirm("front_source")}>Regenerate Front source</Button></div>}
      {["ready", "approved"].includes(workflow.state) && workflow.persistenceState === "ready" && <div className="space-y-2"><button type="button" className="block w-full cursor-zoom-in overflow-hidden rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setSelected({ slot: "sheet", candidate: false })}>{image("sheet")}</button>
        {workflow.state === "ready" && <Button type="button" size="xs" disabled={locked} onClick={() => void act("approve")}>Approve Character Reference</Button>}</div>}
    </>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="sm:max-w-4xl"><DialogTitle>{selected ? titles[selected.slot] : "Character image"}</DialogTitle>
      <DialogDescription>Inspect the generated image before saving your decision.</DialogDescription>{selected && image(selected.slot, selected.candidate, true)}</DialogContent></Dialog>
    <Dialog open={!!confirm} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}><DialogContent><DialogTitle>Regenerate {confirm ? titles[confirm] : "view"}?</DialogTitle>
      <DialogDescription>{confirm === "front" || confirm === "sheet" ? "This uses saved images locally." : "This requests a new paid image unless a completed request can be recovered. You will review it before continuing. Accepting a replacement requires fresh downstream views and approval."}</DialogDescription>
      <div className="flex gap-2"><Button type="button" size="sm" disabled={busy} onClick={() => confirm && void act("regenerate", confirm)}>Continue</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button></div></DialogContent></Dialog>
  </section>;
}
