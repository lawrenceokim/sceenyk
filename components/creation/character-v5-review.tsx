"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { V5BackReviewDiagnostic, V5FrontReviewDiagnostic, V5Review, V5Slot } from "@/lib/character-v5/contract";
import { v5BackReviewWarnings, v5FrontReviewHelp } from "@/lib/character-v5/contract";
import type { ReferenceReviewSnapshot } from "@/lib/reference-review/contract";

const titles: Record<V5Slot, string> = { face: "Face", back: "Back", front_source: "Front source", front: "Front", sheet: "Character Sheet" };
export function FrontReviewDiagnostics({ diagnostics }: { diagnostics: V5FrontReviewDiagnostic }) {
  const generation = diagnostics.generation;
  return <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer">Front development diagnostics</summary>
    <div className="space-y-2 pt-2">
      <p>Reference: {diagnostics.inputSource?.kind === "accepted_face" ? "Accepted Face" : "Historical / unknown source"} · Asset: {diagnostics.inputSource?.id ?? "Unknown"}</p>
      <p>Aspect ratio: {generation && "aspectRatio" in generation ? generation.aspectRatio : "Unknown"} · Enhancement: {generation && "enhancePrompt" in generation ? generation.enhancePrompt ? "Enabled" : "Disabled" : "Unknown"} · Batch size: {generation && "batchSize" in generation ? generation.batchSize : "Unknown"}</p>
      <p>Candidate dimensions: {diagnostics.candidateDimensions ? `${diagnostics.candidateDimensions.width} × ${diagnostics.candidateDimensions.height}` : "Not saved yet"}. Shoulders and shoes expected in-frame by contract: {diagnostics.framingContract ? "Yes" : "Not recorded"}. Visual framing requires manual review.</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(diagnostics, null, 2)}</pre>
    </div>
  </details>;
}
export function BackReviewDiagnostics({ diagnostics, previewAvailable }: { diagnostics: V5BackReviewDiagnostic; previewAvailable: boolean }) {
  const [checks, setChecks] = useState<Partial<Record<typeof v5BackReviewWarnings[number], "clear" | "warning">>>({});
  const warnings = v5BackReviewWarnings.filter(warning => checks[warning] === "warning");
  const pending = v5BackReviewWarnings.filter(warning => !checks[warning]).length;
  const source = diagnostics.inputSource?.kind;
  const sourceLabel = source === "accepted_face" ? "Accepted Face" : source === "original_upload" || source === "original" ? "Original Upload" : "Unknown";
  const generation = diagnostics.generation;
  return <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer">Back development diagnostics</summary>
    <div className="space-y-2 pt-2">
      <p>Actual source: {sourceLabel}</p>
      <p>Prompt revision: {generation && "promptRevision" in generation ? generation.promptRevision ?? "Unknown" : "Unknown"} · Enhancement: {generation && "enhancePrompt" in generation ? generation.enhancePrompt ? "Enabled" : "Disabled" : "Unknown"} · Batch size: {generation && "batchSize" in generation ? generation.batchSize : "Unknown"}</p>
      <fieldset className="space-y-1"><legend>Reviewer checks</legend>
        <p>Mark what you see. These flags do not accept, reject or delete the image.</p>
        {v5BackReviewWarnings.map(warning => <label key={warning} className="flex flex-wrap items-center justify-between gap-2">{warning}
          <select aria-label={`Review ${warning}`} value={checks[warning] ?? "not_checked"} className="rounded border border-input bg-background p-1 text-foreground"
            onChange={event => {
              const next = { ...checks, [warning]: event.target.value === "not_checked" ? undefined : event.target.value as "clear" | "warning" };
              setChecks(next);
              if (process.env.NODE_ENV !== "production") console.info("UGC_CHARACTER_V5_BACK_REVIEW_FLAGS", { candidateId: diagnostics.candidateId,
                objectKey: diagnostics.objectKey, hash: diagnostics.hash, reviewerChecks: next,
                warnings: v5BackReviewWarnings.filter(item => next[item] === "warning"), detection: "reviewer", automaticAction: false });
            }}><option value="not_checked">Not checked</option><option value="clear">No issue seen</option><option value="warning">Issue visible</option></select>
        </label>)}
      </fieldset>
      <p role="status">Warnings marked: {warnings.length ? warnings.join(", ") : "None"}. {pending} checks pending.</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({ ...diagnostics,
        selectedSourceType: source === "original" ? "original_upload" : source ?? null,
        previewSourceKey: previewAvailable ? diagnostics.objectKey : null, reviewerChecks: checks, warnings,
        detection: "reviewer", fallbackUsed: false }, null, 2)}</pre>
    </div>
  </details>;
}
export function PrivateV5Image({ src, alt, large, backCandidate, frontCandidate = false, diagnostics, frontDiagnostics }: {
  src: string; alt: string; large: boolean; backCandidate: boolean; frontCandidate?: boolean; diagnostics?: V5BackReviewDiagnostic;
  frontDiagnostics?: V5FrontReviewDiagnostic;
}) {
  const [failed, setFailed] = useState(false);
  const backPreview = (rendered: boolean) => {
    if (backCandidate && process.env.NODE_ENV !== "production") console.info("UGC_CHARACTER_V5_BACK_PREVIEW", {
      renderedPreviewSource: rendered ? src : "none", requestedPreviewSource: src, rendered, fallbackUsed: false,
      surface: large ? "lightbox" : "card", candidateId: diagnostics?.candidateId ?? null,
      previewSourceKey: rendered ? diagnostics?.objectKey ?? null : null, hash: diagnostics?.hash ?? null,
      providerRequestId: diagnostics?.providerRequestId ?? null,
    });
  };
  const frontPreview = (rendered: boolean, dimensions?: { width: number; height: number }) => {
    if (frontCandidate && process.env.NODE_ENV !== "production") console.info("UGC_CHARACTER_V5_FRONT_PREVIEW", {
      ...frontDiagnostics, requestedPreviewSource: src, rendered, fallbackUsed: false,
      surface: large ? "lightbox" : "card", renderedDimensions: dimensions ?? null,
      fit: "contain", visualFramingVerified: false, framingReview: "manual_accept_reject",
    });
  };
  return failed ? <span className="block p-3 text-[11px] text-muted-foreground">{backCandidate ? "Back candidate preview unavailable. Close and reopen to retry." : "Preview unavailable. Close and reopen to retry."}</span> :
    // Session-authenticated, owner/version-bound private no-store media.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} referrerPolicy="no-referrer" onLoad={event => { backPreview(true); frontPreview(true, { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }} onError={() => { backPreview(false); frontPreview(false); setFailed(true); }}
      data-preview-source-key={process.env.NODE_ENV !== "production" ? diagnostics?.objectKey : undefined}
      data-preview-sha256={process.env.NODE_ENV !== "production" ? diagnostics?.hash : undefined}
      className={large ? "max-h-[75dvh] w-full object-contain" : "h-full w-full object-contain"} />;
}
export function CharacterV5Review({ projectId, jobId, workflow, enabled, onSaved, checkStatus }: {
  projectId: string; jobId: string; workflow?: V5Review; enabled: boolean;
  onSaved: (review: ReferenceReviewSnapshot) => void; checkStatus: () => void;
}) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ slot: V5Slot; candidate: boolean } | null>(null);
  const [confirm, setConfirm] = useState<V5Slot | null>(null);
  const locked = busy || !enabled || workflow?.state === "running" || workflow?.state === "queued";
  const reviewing = workflow?.state === "review" && workflow.persistenceState === "ready" && !!workflow.candidateId &&
    (workflow.slot !== "back" || workflow.backCandidateAvailable !== false);
  const savedBackCandidate = workflow?.slot === "back" && workflow.state === "review" && !!workflow.candidateId && workflow.backCandidateAvailable;
  const preview = (slot: V5Slot, candidate = false) => `/api/ugc/character-v5?${new URLSearchParams({ projectId, jobId,
    version: String(workflow!.version), slot, ...(candidate ? { candidateId: workflow!.candidateId! } : {}) })}`;
  async function act(action: "start" | "accept" | "reject" | "regenerate" | "approve" | "retry_saving", slot?: V5Slot) {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/ugc/character-v5", { method: "POST", cache: "no-store", credentials: "same-origin", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, jobId, version: workflow?.version ?? 0,
          action, ...(slot ? { slot } : {}) }), signal: AbortSignal.timeout(210_000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Your decision could not be saved.");
      onSaved(result.review); setConfirm(null); setSelected(null); checkStatus();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your decision could not be saved."); checkStatus(); }
    finally { setBusy(false); }
  }
  const image = (slot: V5Slot, candidate = false, large = false) =>
    candidate && !workflow?.candidateId ? <span className="block p-3 text-[11px] text-muted-foreground">{slot === "back" ? "No back candidate available" : "No candidate available"}</span> :
    <PrivateV5Image key={`${workflow?.version}-${slot}-${candidate ? workflow?.candidateId : "accepted"}`} src={preview(slot, candidate)}
      alt={`${titles[slot]}${candidate ? " candidate" : " accepted reference"}`} large={large} backCandidate={slot === "back" && candidate}
      frontCandidate={slot === "front_source" && candidate}
      frontDiagnostics={slot === "front_source" && candidate && workflow?.frontDiagnostics?.candidateId === workflow?.candidateId ? workflow?.frontDiagnostics : undefined}
      diagnostics={slot === "back" && candidate && workflow?.backDiagnostics?.candidateId === workflow?.candidateId ? workflow?.backDiagnostics : undefined} />;
  return <section aria-label="Character V5 review" className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-medium">Character Reference</h3>
      {workflow?.state === "approved" && workflow.persistenceState === "ready" && <span className="flex items-center gap-1 text-success-foreground"><Check className="size-3.5" />Approved</span>}</div>
    {!workflow ? <><p className="text-muted-foreground">Review and accept each image before the next view is generated.</p>
      <Button type="button" size="xs" disabled={locked} onClick={() => void act("start")}>{busy ? "Saving…" : "Start Character V5"}</Button></> : <>
      {workflow.state === "queued" && <p role="status" className="text-muted-foreground">{titles[workflow.slot]} is waiting for the local worker.</p>}
      {workflow.state === "running" && <p role="status" className="text-muted-foreground">{workflow.slot === "front" ? "Preparing Front…" : workflow.slot === "sheet" ? "Building Character Sheet…" : `${workflow.workPhase === "generating" ? "Generating" : "Preparing"} ${titles[workflow.slot]}…`}</p>}
      {workflow.slot === "back" && !reviewing && !workflow.backCandidateAvailable && <p className="text-muted-foreground">No back candidate available</p>}
      {process.env.NODE_ENV !== "production" && workflow.slot === "back" && workflow.backDiagnostics &&
        <BackReviewDiagnostics key={workflow.backDiagnostics.candidateId} diagnostics={workflow.backDiagnostics} previewAvailable={!!workflow.backCandidateAvailable} />}
      {process.env.NODE_ENV !== "production" && workflow.slot === "front_source" && workflow.frontDiagnostics &&
        <FrontReviewDiagnostics key={workflow.frontDiagnostics.candidateId} diagnostics={workflow.frontDiagnostics} />}
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
      {(reviewing || savedBackCandidate) && <div className="space-y-2"><p className="font-medium">Review {titles[workflow.slot]}</p>
        <button type="button" className={`mx-auto block ${["front_source", "front"].includes(workflow.slot) ? "aspect-[2/3]" : "aspect-[4/3]"} w-full max-w-sm cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring`}
          onClick={() => setSelected({ slot: workflow.slot, candidate: true })}>{image(workflow.slot, true)}</button>
        <p className="text-muted-foreground">{workflow.slot === "back" ? "Reject if the character is turned sideways or if any part of the face is visible." :
          ["front_source", "front"].includes(workflow.slot) ? v5FrontReviewHelp : "Check the character, clothing, pose and framing before accepting."}</p>
        {workflow.legacyFront && <p className="text-muted-foreground">This older Front candidate uses the retired preparation flow. Reject it and generate a new Front source from the accepted Face.</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" size="xs" disabled={locked || !reviewing || workflow.legacyFront} onClick={() => void act("accept")}>Accept {titles[workflow.slot]}</Button>
          <Button type="button" size="xs" variant="outline" disabled={locked} onClick={() => void act("reject")}>Reject and delete image</Button></div>
      </div>}
      {workflow.accepted.includes("face") && !workflow.accepted.includes("front") && workflow.slot !== "front_source" && workflow.state === "failed" && !workflow.reconciliationRequired && !workflow.canRetrySaving && workflow.errorPhase !== "candidate_delete" &&
        <Button type="button" size="xs" variant="outline" disabled={locked} onClick={() => setConfirm("front_source")}>Generate Front source from Face</Button>}
      {workflow.accepted.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{workflow.accepted.filter(slot => !(workflow.frontReady && slot === "front_source" && workflow.accepted.includes("front"))).map(slot => <div key={slot} className="space-y-1">
        <button type="button" className="aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => setSelected({ slot, candidate: false })}>{image(slot)}</button>
        <p className="flex items-center gap-1 text-[11px] text-success-foreground"><Check className="size-3" />{titles[slot]} accepted</p>
        {slot !== "front_source" && <Button type="button" size="xs" variant="ghost" disabled={locked || reviewing || savedBackCandidate} onClick={() => setConfirm(slot === "front" ? "front_source" : slot)}>Regenerate</Button>}
      </div>)}</div>}
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
