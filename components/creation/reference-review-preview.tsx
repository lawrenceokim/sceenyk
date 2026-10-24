"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ReferenceReviewAsset, ReferenceReviewGroup, ReferenceReviewSnapshot, ReferenceType, ReferenceView } from "@/lib/reference-review/contract";
import type { UgcJobProgress } from "@/lib/ugc-jobs/contract";

type Scope = { projectId: string; jobId: string };
async function reviewRequest(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/ugc/reference-review", { method: "POST", cache: "no-store", credentials: "same-origin", redirect: "error",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(typeof result.message === "string" ? result.message : "Reference review is unavailable.");
  return result;
}
function PrivateReferenceImage({ scope, group, asset, large = false }: { scope: Scope; group: ReferenceReviewGroup; asset: ReferenceReviewAsset; large?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(large);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ url?: string; error?: boolean }>({});
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
    void reviewRequest({ action: "preview", projectId, jobId, type: group.type, version: group.version, view: asset.view }, controller.signal)
      .then(result => { if (alive) setPreview({ url: result.preview.url }); })
      .catch(() => { if (alive) setPreview({ error: true }); }).finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [visible, projectId, jobId, group.type, group.version, asset.view, attempt]);
  return <div ref={element} className="flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden bg-muted/30">
    {preview.error ? <div className="space-y-2 p-2 text-center text-[11px] text-muted-foreground">
      <p>Preview unavailable</p>
      {large ? <Button type="button" size="xs" variant="outline" onClick={() => { setPreview({}); setAttempt(value => value + 1); }}>Retry preview</Button> : <p>Open to retry</p>}
    </div> : preview.url ?
      // Native image preserves session-bound no-store media; an optimizer must
      // never retain or fetch these expiring private capabilities on our behalf.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview.url} alt={`${group.type === "character" ? "Character" : "Product"} ${asset.label}`} className="h-full w-full object-contain"
        referrerPolicy="no-referrer" onError={() => setPreview({ error: true })} /> :
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
  const [selected, setSelected] = useState<{ type: ReferenceType; view: ReferenceView } | null>(null);
  const [confirmation, setConfirmation] = useState<{ type: ReferenceType; view: ReferenceView; version: number; label: string; requestId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  const items = review.groups.flatMap(group => group.assets.filter(asset => asset.available).map(asset => ({ group, asset })));
  const currentIndex = items.findIndex(item => item.group.type === selected?.type && item.asset.view === selected.view);
  const current = items[currentIndex];
  function navigate(offset: number) {
    if (!items.length) return;
    const next = items[(currentIndex + offset + items.length) % items.length];
    setSelected({ type: next.group.type, view: next.asset.view });
  }
  const returnFocus = () => opener.current?.isConnected && !opener.current.disabled ? opener.current : region.current;
  return <div ref={region} tabIndex={-1} aria-label="Reference review" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/10 p-3 outline-none sm:p-4" data-lenis-prevent>
    <div className="mx-auto w-full max-w-3xl space-y-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1"><h2 className="text-sm font-medium">Reference review</h2>
          <p className="text-muted-foreground">Generation paused</p></div>
        <Button type="button" variant="ghost" size="xs" onClick={checkStatus} disabled={busy}>Check status</Button>
      </div>
      {job.failure && <p role="status" className="break-words text-destructive">{job.failure.message}</p>}
      {error && !confirmation && <p role="alert" className="break-words text-destructive">{error}</p>}
      {!review.actionsAvailable && <p className="text-warning-foreground">Review actions are temporarily unavailable.</p>}
      {review.groups.map(group => {
        const title = group.type === "character" ? "Character Reference" : "Product / Prop Reference";
        const hasAssets = group.assets.some(asset => asset.view !== "original" && asset.available);
        return <section key={group.type} aria-label={title} className="space-y-2.5 rounded-lg border border-border bg-card/60 p-2.5 sm:p-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1"><h3 className="text-xs font-medium">{title}</h3>
              {hasAssets && <p className="break-words text-[11px] text-muted-foreground">{group.name}</p>}
              <p className={`flex items-center gap-1 text-[11px] ${group.state === "approved" ? "text-success-foreground" : "text-muted-foreground"}`}>
                {group.state === "approved" && <Check className="size-3" aria-hidden="true" />}{hasAssets ? stateText[group.state] : "Not generated yet"}
              </p></div>
            {hasAssets && (group.state === "approved" ? <span className="flex h-7 items-center gap-1 text-[11px] text-success-foreground"><Check className="size-3.5" aria-hidden="true" />Approved</span> :
              <Button type="button" size="xs" className="text-[11px]" disabled={busy || !group.canApprove} onClick={() => void act("approve", group)}>
                {busy ? "Saving…" : group.type === "character" ? "Approve Character Reference" : "Approve Product Reference"}
              </Button>)}
          </div>
          {hasAssets && <>
            {group.state === "failed" && !job.failure && <p className="text-[11px] text-destructive">A reference view could not be completed. Your other saved views are still available.</p>}
            <p className="text-[11px] leading-relaxed text-muted-foreground">{group.type === "character" ?
              "Compare face, body, outfit and overall consistency with the original." : "Compare shape, colors, controls, materials and branding with the original."}</p>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
              {group.assets.filter(asset => asset.available).map(asset => <div key={asset.view} className={`min-w-0 overflow-hidden rounded-md border border-border bg-background/60 ${asset.view === "sheet" ? "col-span-2 sm:col-span-4" : ""}`}>
                <button type="button" className={`block w-full cursor-zoom-in overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${asset.view === "sheet" ? "aspect-[2.5/1]" : "aspect-square"}`}
                  aria-label={`Open ${title}: ${asset.label}`} onClick={event => { opener.current = event.currentTarget; setSelected({ type: group.type, view: asset.view }); }}>
                  <PrivateReferenceImage key={`${group.type}:${group.version}:${asset.view}`} scope={scope} group={group} asset={asset} />
                </button>
                <div className="flex min-w-0 items-center justify-between gap-1 px-2 py-1.5">
                  <div className="min-w-0"><p className="break-words text-[11px] font-medium">{asset.label}</p>
                    {asset.stale && <p className="break-words text-[10px] text-warning-foreground">{asset.view === "sheet" ? "Needs rebuilding" : asset.state === "failed" ? "Replacement failed" : "Regeneration requested"}</p>}</div>
                  {asset.view !== "original" && asset.view !== "sheet" && <button type="button" title="Regenerate this view" aria-label={`Regenerate ${asset.label} view`}
                    disabled={busy || !review.actionsAvailable || asset.stale} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none [@media(pointer:coarse)]:size-11"
                    onClick={event => { opener.current = event.currentTarget; setError(""); setConfirmation({ type: group.type, view: asset.view, version: group.version, label: asset.label, requestId: crypto.randomUUID() }); }}>
                    <RefreshCw className="size-3" aria-hidden="true" />
                  </button>}
                </div>
              </div>)}
            </div>
            {group.sheetInvalidated && <p className="text-[11px] text-warning-foreground">The previous sheet is shown for comparison. A replacement view and rebuilt sheet must be reviewed before approval.</p>}
          </>}
        </section>;
      })}
      <p className="text-[11px] leading-relaxed text-muted-foreground">{review.locationEligible ?
        "Character and product references approved. Location generation has not started yet." : "Approval saves your review. Generation remains paused."}</p>
    </div>
    <Dialog open={!!current} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent finalFocus={returnFocus} className="h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-xl p-3 sm:max-w-[calc(100%-2rem)] sm:p-4"
        onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); navigate(event.key === "ArrowLeft" ? -1 : 1); } }}>
        <div className="min-w-0 space-y-1 pr-9"><DialogTitle className="text-sm">{current?.group.type === "character" ? "Character" : "Product"} · {current?.asset.label}</DialogTitle>
          <DialogDescription className="text-xs">{current?.asset.stale ? "Previous reference — replacement or sheet rebuild required." : "Inspect this private reference image."}</DialogDescription></div>
        {current && <div className="min-h-0 min-w-0 overflow-hidden rounded-md border border-border"><PrivateReferenceImage key={`${current.group.type}:${current.group.version}:${current.asset.view}`} scope={scope} group={current.group} asset={current.asset} large /></div>}
        <div className="flex items-center justify-between gap-2"><Button type="button" size="xs" variant="outline" disabled={items.length < 2} onClick={() => navigate(-1)}><ChevronLeft aria-hidden="true" />Previous</Button>
          <span className="text-[11px] text-muted-foreground">{currentIndex + 1} / {items.length}</span>
          <Button type="button" size="xs" variant="outline" disabled={items.length < 2} onClick={() => navigate(1)}>Next<ChevronRight aria-hidden="true" /></Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open && !running.current) setConfirmation(null); }}>
      <DialogContent finalFocus={returnFocus} showCloseButton={!busy} className="gap-3 rounded-xl p-4 sm:max-w-sm">
        <DialogTitle className="pr-6 text-sm">Regenerate {confirmation?.label} view?</DialogTitle>
        <DialogDescription className="text-xs leading-relaxed">The current view will be replaced and the {confirmation?.type === "character" ? "Character" : "Product"} Sheet will need to be rebuilt. Your request will be saved; generation remains paused.</DialogDescription>
        {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><DialogClose render={<Button type="button" size="xs" variant="outline" disabled={busy} autoFocus />}>Cancel</DialogClose>
          <Button type="button" size="xs" disabled={busy} onClick={() => { const group = review.groups.find(item => item.type === confirmation?.type); if (group && confirmation) void act("regenerate", group, confirmation); }}>{busy ? "Saving…" : "Regenerate"}</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
