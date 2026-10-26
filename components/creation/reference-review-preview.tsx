"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ReferenceReviewAsset, ReferenceReviewGroup, ReferenceReviewSnapshot, ReferenceType, ReferenceView } from "@/lib/reference-review/contract";
import type { UgcJobProgress } from "@/lib/ugc-jobs/contract";
import { CharacterV5Review } from "./character-v5-review";
import { LocationReferenceReview } from "./location-reference-review";

type Scope = { projectId: string; jobId: string };
async function reviewRequest(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/ugc/reference-review", { method: "POST", cache: "no-store", credentials: "same-origin", redirect: "error",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(typeof result.message === "string" ? result.message : "Reference review is unavailable.");
  return result;
}
function PrivateReferenceImage({ scope, group, asset, large = false }: { scope: Scope; group: ReferenceReviewGroup; asset: ReferenceReviewAsset & { rejectedId?: string; frontSource?: true }; large?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(large);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ url?: string; expiresAt?: string; error?: boolean }>({});
  const renewed = useRef(false);
  const { projectId, jobId } = scope;
  useEffect(() => {
    if (large || !element.current) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [large]);
  useEffect(() => {
    if (!visible && typeof IntersectionObserver !== "undefined") return;
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    void reviewRequest({ action: "preview", projectId, jobId, type: group.type, version: group.version, view: asset.view,
      ...(asset.rejectedId ? { rejectedId: asset.rejectedId } : {}), ...(asset.frontSource ? { frontSource: true } : {}) }, controller.signal)
      .then(result => { if (alive) setPreview({ url: result.preview.url, expiresAt: result.preview.expiresAt }); })
      .catch(() => { if (alive) setPreview({ error: true }); }).finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [visible, projectId, jobId, group.type, group.version, asset.view, asset.rejectedId, asset.frontSource, attempt]);
  return <div ref={element} className="flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden bg-muted/30">
    {preview.error ? <div className="space-y-2 p-2 text-center text-[11px] text-muted-foreground">
      <p>Preview unavailable</p>
      {large ? <Button type="button" size="xs" variant="outline" onClick={() => { setPreview({}); setAttempt(value => value + 1); }}>Retry preview</Button> : <p>Open to retry</p>}
    </div> : preview.url ?
      // Native image preserves session-bound no-store media; an optimizer must
      // never retain or fetch these expiring private capabilities on our behalf.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview.url} alt={`${group.type === "character" ? "Character" : "Product"} ${asset.label}`} className="h-full w-full object-contain"
        referrerPolicy="no-referrer" onError={() => {
          if (!renewed.current && preview.expiresAt && Date.parse(preview.expiresAt) <= Date.now()) {
            renewed.current = true; setPreview({}); setAttempt(value => value + 1);
          } else setPreview({ error: true });
        }} /> :
      <div className="flex items-center gap-1.5 p-2 text-[11px] text-muted-foreground"><ImageIcon className="size-3.5" aria-hidden="true" /><span>Loading preview…</span></div>}
  </div>;
}
const stateText = {
  pending_generation: "Reference generation incomplete", ready_for_review: "Reference ready for review", approved: "Reference approved",
  regeneration_requested: "Regeneration requested", regenerating: "Regenerating reference", failed: "Reference needs attention",
} as const;

export function ReferenceReviewPreview({ projectId, job, onSaved, checkStatus }: {
  projectId: string; job: UgcJobProgress; onSaved: (review: ReferenceReviewSnapshot) => void; checkStatus: () => void;
}) {
  const review = job.referenceReview!;
  const scope = { projectId, jobId: job.id };
  const displayGroups = [...review.groups.filter(group => group.type !== "character" || !review.characterV5),
    ...(review.characterV5 && review.historicalCharacter ? [review.historicalCharacter] : [])];
  const [selected, setSelected] = useState<{ type: ReferenceType; view: ReferenceView; rejectedId?: string; frontSource?: true } | null>(null);
  const [confirmation, setConfirmation] = useState<{ type: ReferenceType; view: ReferenceView; version: number; label: string; requestId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewRetries, setPreviewRetries] = useState<Record<string, number>>({});
  const running = useRef(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  async function act(action: "approve" | "regenerate", group: ReferenceReviewGroup, request?: NonNullable<typeof confirmation>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 20_000);
    try {
      const result = await reviewRequest({ action, ...scope, type: group.type, version: request?.version ?? group.version,
        ...(request ? { view: request.view, requestId: request.requestId } : {}) }, controller.current.signal);
      if (alive.current) { onSaved(result.review); setConfirmation(null); if (action === "approve") region.current?.focus(); }
    } catch (failure) {
      if (alive.current) { setError(failure instanceof Error ? failure.message : "Your review could not be saved. Please try again."); checkStatus(); }
    } finally { clearTimeout(timeout); running.current = false; if (alive.current) setBusy(false); }
  }
  const items: { group: ReferenceReviewGroup; asset: ReferenceReviewAsset & { rejectedId?: string; frontSource?: true }; reasons?: string[] }[] = displayGroups.flatMap(group => [
    ...group.assets.filter(asset => asset.available).map(asset => ({ group, asset })),
    ...(group.frontSourceAvailable ? [{ group, asset: { view: "front" as const, label: "Front source · full-body intermediate", frontSource: true as const, available: true, state: "ready" as const, stale: false } }] : []),
    ...(group.rejectedOutputs ?? []).map(item => ({ group, reasons: item.reasons, asset: { view: item.view, label: `${item.view} · Rejected output (${item.stage === "provider" ? "provider" : "crop"})`,
      available: true, state: "failed" as const, stale: false, rejectedId: item.id } })),
  ]);
  const currentIndex = items.findIndex(item => item.group.type === selected?.type && item.asset.view === selected.view && item.asset.rejectedId === selected.rejectedId && item.asset.frontSource === selected.frontSource);
  const current = items[currentIndex];
  function navigate(offset: number) {
    if (!items.length) return;
    const next = items[(currentIndex + offset + items.length) % items.length];
    setSelected({ type: next.group.type, view: next.asset.view, rejectedId: next.asset.rejectedId, frontSource: next.asset.frontSource });
  }
  const returnFocus = () => opener.current?.isConnected && !opener.current.disabled ? opener.current : region.current;
  return <div ref={region} tabIndex={-1} aria-label="Reference review" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/10 p-3 outline-none sm:p-4" data-lenis-prevent>
    <div className="mx-auto w-full max-w-3xl space-y-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1"><h2 className="text-sm font-medium">Reference review</h2>
          <p className="text-muted-foreground">{job.status === "cancelled" ? "Generation cancelled" : review.regenerating ? "Regeneration in progress" : job.status === "running" ? "Generation in progress" : "Saved reference assets"}</p></div>
        <Button type="button" variant="ghost" size="xs" onClick={checkStatus} disabled={busy}>Check status</Button>
      </div>
      {job.failure && <p role="status" className="break-words text-destructive">{job.failure.message}</p>}
      {error && !confirmation && <p role="alert" className="break-words text-destructive">{error}</p>}
      {!review.actionsAvailable && <p className="text-warning-foreground">Review actions are temporarily unavailable.</p>}
      <CharacterV5Review projectId={projectId} jobId={job.id} workflow={review.characterV5} enabled={review.actionsAvailable} onSaved={onSaved} checkStatus={checkStatus} />
      {displayGroups.map(group => {
        const title = group.type === "character" ? "Character Reference" : "Product / Prop Reference";
        const hasAssets = group.assets.some(asset => asset.view !== "original" && asset.available) || !!group.rejectedOutputs?.length;
        const content = <section key={group.type} aria-label={title} className="space-y-2.5 rounded-lg border border-border bg-card/60 p-2.5 sm:p-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1"><h3 className="text-xs font-medium">{title}</h3>
              {hasAssets && <p className="break-words text-[11px] text-muted-foreground">{group.name}</p>}
              <p className={`flex items-center gap-1 text-[11px] ${group.state === "approved" ? "text-success-foreground" : "text-muted-foreground"}`}>
                {group.state === "approved" && <Check className="size-3" aria-hidden="true" />}{hasAssets ? job.status === "cancelled" && group.sheetInvalidated ? "Regeneration cancelled" : stateText[group.state] : "Not generated yet"}
              </p></div>
            {hasAssets && (group.state === "approved" ? <span className="flex h-7 items-center gap-1 text-[11px] text-success-foreground"><Check className="size-3.5" aria-hidden="true" />Approved</span> :
              <Button type="button" size="xs" className="text-[11px]" disabled={busy || !group.canApprove || group.type === "character"} onClick={() => void act("approve", group)}>
                {busy ? "Saving…" : group.type === "character" ? "Approve Character Reference" : "Approve Product Reference"}
              </Button>)}
          </div>
          {hasAssets && <>
            {group.state === "failed" && <p className="text-[11px] text-destructive">Replacement failed. Your previous usable views and outdated sheet remain available. Check Progress for details.</p>}
            {group.validationFailure && group.execution?.state !== "running" && <p className="break-words text-[11px] text-destructive">{group.validationFailure.view}: output rejected ({group.validationFailure.reasons.slice(0, 2).join(", ")}{group.validationFailure.reasons.length > 2 ? `, +${group.validationFailure.reasons.length - 2} more` : ""}). Previous assets preserved. {group.providerDecisionRequired ? "Provider decision required." : "Request only the affected view again."}</p>}
            {!!group.needsFreshRequestViews?.length && <p className="text-[11px] text-warning-foreground">Historical requests are preserved. Start Character V5 above for new generation and manual review.</p>}
            {group.providerDecisionRequired && <p className="text-[11px] text-destructive">Character provider single-view contract remains unsatisfied. Review the rejected outputs before choosing a provider or contract change. Automatic spending stopped.</p>}
            {group.execution?.state === "waiting" && <p className="text-[11px] text-warning-foreground">Waiting for generation worker. Start the local UGC worker to continue.</p>}
            <p className="text-[11px] leading-relaxed text-muted-foreground">{group.type === "character" ?
              "Compare face, body, outfit and overall consistency with the original." : "Compare shape, colors, controls, materials and branding with the original."}</p>
            {group.frontSourceAvailable && <button type="button" className="cursor-pointer text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              onClick={event => { opener.current = event.currentTarget; setSelected({ type: "character", view: "front", frontSource: true }); }}>Inspect Front source</button>}
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
              {group.assets.filter(asset => asset.available || group.rejectedOutputs?.some(item => item.view === asset.view)).map(asset => <div key={asset.view} className={`min-w-0 overflow-hidden rounded-md border border-border bg-background/60 ${asset.view === "sheet" ? "col-span-2 sm:col-span-4" : ""}`}>
                <button type="button" className={`block w-full cursor-zoom-in overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${asset.view === "sheet" ? "aspect-[2.5/1]" : group.type === "character" && (asset.view === "front" || asset.view === "back") ? "aspect-[2/3]" : "aspect-square"}`}
                  disabled={!asset.available}
                  aria-label={`Open ${title}: ${asset.label}`} onClick={event => { opener.current = event.currentTarget; setSelected({ type: group.type, view: asset.view }); }}>
                  {asset.validationRequired ? <span className="block p-3 text-[11px] text-muted-foreground">No validated current image.{asset.available ? " Open historical fallback." : ""}</span> :
                    <PrivateReferenceImage key={`${group.type}:${group.version}:${asset.view}:${asset.publishedVersion ?? 1}:${previewRetries[`${group.type}:${asset.view}`] ?? 0}`} scope={scope} group={group} asset={asset} />}
                </button>
                <div className="flex min-w-0 items-center justify-between gap-1 px-2 py-1.5">
                  <div className="min-w-0"><p className="break-words text-[11px] font-medium">{asset.label}</p>
                    {asset.validationRequired && asset.available && <p className="break-words text-[10px] text-warning-foreground">Historical image — single-view validation required</p>}
                    {asset.stale && <p className="break-words text-[10px] text-warning-foreground">{asset.view === "sheet" ? "Outdated — needs rebuilding" : asset.state === "failed" ? "Previous view — replacement failed" : "Previous view — replacement pending"}</p>}</div>
                  <div className="flex shrink-0 items-center gap-0.5">
                  {asset.available && <button type="button" title="Refresh private preview" aria-label={`Refresh ${asset.label} preview`}
                    className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [@media(pointer:coarse)]:size-11"
                    onClick={() => setPreviewRetries(values => ({ ...values, [`${group.type}:${asset.view}`]: (values[`${group.type}:${asset.view}`] ?? 0) + 1 }))}>
                    <ImageIcon className="size-3" aria-hidden="true" />
                  </button>}
                  {asset.view === "sheet" && group.type === "character" && <button type="button" title="Rebuild Character Sheet locally" aria-label="Rebuild Character Sheet locally"
                    disabled
                    className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 [@media(pointer:coarse)]:size-11"
                    onClick={event => { opener.current = event.currentTarget; setError(""); setConfirmation({ type: "character", view: "sheet", version: group.version, label: "Character Sheet", requestId: crypto.randomUUID() }); }}><RefreshCw className="size-3" aria-hidden="true" /></button>}
                  {group.type === "product" && asset.view !== "original" && asset.view !== "sheet" && <button type="button" title="Regenerate this view" aria-label={`Regenerate ${asset.label} view`}
                    disabled={busy || !review.actionsAvailable || group.execution?.state === "running" || !!group.providerDecisionRequired || (group.type === "product" ? group.sheetInvalidated || asset.stale : (asset.state === "regenerating" || asset.state === "regeneration_requested") && group.execution?.state !== "failed" || group.sheetInvalidated && !asset.validationRequired && asset.state !== "failed")} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none [@media(pointer:coarse)]:size-11"
                    onClick={event => { opener.current = event.currentTarget; setError(""); setConfirmation({ type: group.type, view: asset.view, version: group.version, label: asset.label, requestId: crypto.randomUUID() }); }}>
                    <RefreshCw className="size-3" aria-hidden="true" />
                  </button>}
                  </div>
                </div>
                {group.rejectedOutputs?.find(item => item.view === asset.view) && <div className="px-2 pb-2">
                  <button type="button" className="cursor-pointer text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={event => { const candidate = group.rejectedOutputs!.find(item => item.view === asset.view)!; opener.current = event.currentTarget; setSelected({ type: group.type, view: asset.view, rejectedId: candidate.id }); }}>View rejected output</button>
                </div>}
              </div>)}
            </div>
            {group.sheetInvalidated && <p className="text-[11px] text-warning-foreground">The previous sheet is shown for comparison. A replacement view and rebuilt sheet must be reviewed before approval.</p>}
          </>}
        </section>;
        return group.type === "character" ? <details key="historical-character" className="space-y-2 rounded-lg border border-border p-2.5">
          <summary className="cursor-pointer text-[11px] text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Historical Character references (V1–V4)</summary>{content}
        </details> : content;
      })}
      <LocationReferenceReview projectId={projectId} jobId={job.id} location={job.location} eligible={review.locationEligible}
        enabled={review.actionsAvailable && !["cancelled", "completed"].includes(job.status)} checkStatus={checkStatus} />
    </div>
    <Dialog open={!!current} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent finalFocus={returnFocus} className="h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-xl p-3 sm:max-w-[calc(100%-2rem)] sm:p-4"
        onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); navigate(event.key === "ArrowLeft" ? -1 : 1); } }}>
        <div className="min-w-0 space-y-1 pr-9"><DialogTitle className="text-sm">{current?.group.type === "character" ? "Character" : "Product"} · {current?.asset.label}</DialogTitle>
          <DialogDescription className="text-xs">{current?.asset.rejectedId ? `Rejected output — ${current.reasons?.join(", ")}. Historical inspection only; never a canonical reference.` : current?.asset.validationRequired ? "Historical fallback only — single-view validation required; this image is not current validated output." : current?.asset.stale ? "Previous reference — replacement or sheet rebuild required." : "Inspect this private reference image."}</DialogDescription></div>
        {current && <div className="min-h-0 min-w-0 overflow-hidden rounded-md border border-border"><PrivateReferenceImage key={`${current.group.type}:${current.group.version}:${current.asset.view}:${current.asset.rejectedId ?? current.asset.publishedVersion ?? 1}`} scope={scope} group={current.group} asset={current.asset} large /></div>}
        <div className="flex items-center justify-between gap-2"><Button type="button" size="xs" variant="outline" disabled={items.length < 2} onClick={() => navigate(-1)}><ChevronLeft aria-hidden="true" />Previous</Button>
          <span className="text-[11px] text-muted-foreground">{currentIndex + 1} / {items.length}</span>
          <Button type="button" size="xs" variant="outline" disabled={items.length < 2} onClick={() => navigate(1)}>Next<ChevronRight aria-hidden="true" /></Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open && !running.current) setConfirmation(null); }}>
      <DialogContent finalFocus={returnFocus} showCloseButton={!busy} className="gap-3 rounded-xl p-4 sm:max-w-sm">
        <DialogTitle className="pr-6 text-sm">{confirmation?.view === "sheet" ? "Rebuild Character Sheet?" : `Regenerate ${confirmation?.label} view?`}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">{confirmation?.type === "character" ? confirmation.view === "sheet" ?
            "The local worker will rebuild the sheet from saved canonical Front, Back and Face. No provider generation. Approval will be required again." : confirmation.view === "face" ?
            "The local worker will prepare Face, then regenerate Back and Front, create the headless Front and rebuild the sheet. Previous assets remain as history. Approval will be required again." : confirmation.view === "back" ?
            "The local worker will preserve Face, regenerate Back and Front, create the headless Front and rebuild the sheet. Approval will be required again." :
            "The local worker will preserve Face and Back, regenerate the Front source, create the headless Front and rebuild the sheet. Approval will be required again." :
            "The local worker will regenerate only this view and rebuild the Product Sheet. Previous references stay available until the replacement is saved. You will need to approve this reference again."}</DialogDescription>
        {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><DialogClose render={<Button type="button" size="xs" variant="outline" disabled={busy} autoFocus />}>Cancel</DialogClose>
          <Button type="button" size="xs" disabled={busy} onClick={() => { const group = review.groups.find(item => item.type === confirmation?.type); if (group && confirmation) void act("regenerate", group, confirmation); }}>{busy ? "Saving…" : "Regenerate"}</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
