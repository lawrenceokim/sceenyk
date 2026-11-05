"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { ImageIcon, Images, Layers2, LoaderCircle, Plus, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountAction } from "@/components/account-action";
import { LocalMediaThumbnail } from "./local-media-preview";
import { PersistentMediaPreview } from "./persistent-media-preview";
import { StudioPanelTarget, useStudioPanels } from "./studio-workspace-panels";
import { studioReferenceImages } from "./studio-inputs";
import { referenceNameLimit } from "@/lib/projects/reference-names";
import type { StudioReferenceSourcesProps } from "./studio-reference-sources";

const smallButton = "h-8 min-h-8 min-w-0 cursor-pointer gap-1 rounded-lg px-2 text-[11px] [@media(pointer:coarse)]:min-h-11";
const interactive = "input,textarea,select,a,summary,[contenteditable=true],[role=button],button:not([data-character-swipe-preview])";

export function ProCharacterSources({ references, onAdd, onRemoveLocal, onRemoveAsset, onNameChange, onUpload, onRecover,
  uploadStates, busy, signedIn, authReady, perCharacterSheets }: StudioReferenceSourcesProps) {
  const id = useId(), panels = useStudioPanels();
  // reference_id is persisted unchanged when a local upload receives its asset ID.
  // All generation/review portals still use the actual saved asset ID.
  const entries = studioReferenceImages(references);
  const [selection, setSelection] = useState<{ key: string | null; index: number }>({ key: null, index: 0 });
  const index = entries.findIndex(entry => entry.referenceId === selection.key);
  const activeIndex = index >= 0 ? index : Math.min(selection.index, Math.max(0, entries.length - 1));
  const active = entries[activeIndex];
  const activeKey = active?.referenceId;
  const entryOrder = entries.map(entry => entry.referenceId).join(",");
  const single = useRef<HTMLInputElement>(null), multiple = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null), removedFocus = useRef<string | null>(null);
  const strip = useRef<HTMLUListElement>(null), thumbnails = useRef(new Map<string, HTMLButtonElement>());
  const gesture = useRef<{ pointer: number; x: number; y: number; horizontal: boolean } | null>(null);
  const suppressClick = useRef(false), wheel = useRef({ time: 0, total: 0, moved: false });
  const rowDrag = useRef<{ pointer: number; x: number; y: number; left: number; moved: boolean } | null>(null);
  const suppressRowClick = useRef(false);
  const select = (next: number, preview = false) => {
    const entry = entries[next];
    if (!entry) return;
    setSelection({ key: entry.referenceId, index: next });
    if (preview) panels?.selectMedia(entry.local?.id ?? entry.asset!.id);
  };
  useEffect(() => {
    const viewport = strip.current, tile = activeKey && thumbnails.current.get(activeKey);
    if (viewport && tile) viewport.scrollTo({ left: Math.max(0, tile.offsetLeft - (viewport.clientWidth - tile.offsetWidth) / 2), behavior: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    if (removedFocus.current && !entryOrder.split(",").includes(removedFocus.current)) {
      (tile || addButton.current)?.focus(); removedFocus.current = null;
    }
  }, [activeKey, entryOrder]);
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest(interactive)) return;
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start || start.pointer !== event.pointerId) return;
    const x = Math.abs(event.clientX - start.x), y = Math.abs(event.clientY - start.y);
    if (!start.horizontal && y > 10 && y > x) { gesture.current = null; return; }
    if (x > 12 && x > y * 1.5) {
      start.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current; gesture.current = null;
    if (!start || start.pointer !== event.pointerId) return;
    const x = event.clientX - start.x, y = Math.abs(event.clientY - start.y);
    if (Math.abs(x) >= 48 && Math.abs(x) > y * 1.5) {
      suppressClick.current = true;
      select(activeIndex + (x < 0 ? 1 : -1));
    }
  };
  const finishRowDrag = (event: PointerEvent<HTMLUListElement>) => {
    suppressRowClick.current = !!rowDrag.current?.moved;
    rowDrag.current = null;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section className="min-w-0 max-w-full space-y-3 overflow-x-clip" aria-labelledby={`${id}-heading`}>
    <div className="flex min-w-0 items-center gap-2">
      <h3 id={`${id}-heading`} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Characters</h3>
      <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Pro</span>
      <span className="ml-auto text-[11px] text-muted-foreground">{entries.length} {entries.length === 1 ? "character" : "characters"}</span>
    </div>
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <input ref={single} type="file" accept="image/*" aria-label="Add Character" tabIndex={-1} className="sr-only" onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []); if (files.length) onAdd(files.slice(0, 1)); event.currentTarget.value = "";
      }} />
      <input ref={multiple} type="file" accept="image/*" multiple aria-label="Add Multiple" tabIndex={-1} className="sr-only" onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []); if (files.length) onAdd(files); event.currentTarget.value = "";
      }} />
      <Button ref={addButton} type="button" variant="outline" className={smallButton} title="Add Character" onClick={() => single.current?.click()}><Plus className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">Add Character</span></Button>
      <Button type="button" variant="outline" className={smallButton} title="Add Multiple" onClick={() => multiple.current?.click()}><Images className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">Add Multiple</span></Button>
    </div>
    {!!entries.length && <>
        <ul ref={strip} className="scrollbar-hidden relative flex w-full min-w-0 max-w-full snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain scroll-smooth px-1 py-2 select-none motion-reduce:scroll-auto data-[dragging=true]:cursor-grabbing data-[dragging=true]:snap-none data-[dragging=true]:scroll-auto" aria-label="Choose a character"
          onDragStart={event => event.preventDefault()}
          onPointerDown={event => {
            suppressRowClick.current = false;
            if (event.pointerType === "touch" || !event.isPrimary || event.button !== 0 || (event.target as Element).closest('[data-character-remove]')) return;
            rowDrag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, moved: false };
          }}
          onPointerMove={event => {
            const start = rowDrag.current;
            if (!start || start.pointer !== event.pointerId) return;
            const x = event.clientX - start.x, y = Math.abs(event.clientY - start.y);
            if (!start.moved && y > 8 && y > Math.abs(x)) { rowDrag.current = null; return; }
            if (Math.abs(x) > 6 && Math.abs(x) > y * 1.5) {
              start.moved = true;
              event.currentTarget.dataset.dragging = "true";
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }
            if (start.moved) event.currentTarget.scrollLeft = start.left - x;
          }}
          onPointerUp={finishRowDrag} onPointerCancel={finishRowDrag}
          onClickCapture={event => { if (suppressRowClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressRowClick.current = false; } }}
          onKeyDown={event => {
            if (!(event.target as Element).closest('[data-character-selector]')) return;
            const next = event.key === "ArrowRight" ? activeIndex + 1 : event.key === "ArrowLeft" ? activeIndex - 1 : event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : null;
            if (next === null || !entries[next]) return;
            event.preventDefault(); select(next); thumbnails.current.get(entries[next].referenceId)?.focus();
          }}>
          {entries.map(({ referenceId, asset, local }, i) => {
            const name = asset?.referenceName || `Character ${i + 1}`, filename = local?.file.name ?? asset?.filename ?? name;
            const uploading = !!local && signedIn && uploadStates[local.id]?.status !== "failed";
            return <li key={referenceId} className="relative w-24 shrink-0 snap-start">
              <button ref={element => { if (element) thumbnails.current.set(referenceId, element); else thumbnails.current.delete(referenceId); }} type="button"
                data-character-selector={referenceId} aria-label={`Select ${name}`} aria-pressed={i === activeIndex} aria-controls={`${id}-${referenceId}-details`}
                className={"relative block aspect-square w-full cursor-grab overflow-hidden rounded-lg border bg-field text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing " + (i === activeIndex ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50")}
                onClick={() => select(i, true)}>
                <span className="absolute inset-0 block overflow-hidden" aria-busy={uploading}>
                  {local ? <LocalMediaThumbnail media={local} className="size-full" alt={filename} /> : asset?.status === "uploaded" ? <PersistentMediaPreview asset={asset} thumbnail passiveThumbnail /> : <span className="flex size-full items-center justify-center"><ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" /></span>}
                  {uploading && <span className="absolute inset-0 flex items-center justify-center bg-background/40"><LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /></span>}
                </span>
                <span className="absolute inset-x-0 bottom-0 block truncate bg-linear-to-t from-black/90 via-black/65 to-transparent px-2 pb-1.5 pt-5 text-center text-[11px] font-medium text-white" title={name}>{name}</span>
              </button>
              <button type="button" data-character-remove disabled={busy} aria-label={`Remove ${filename}`} className="absolute top-1 right-1 flex size-5 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [@media(pointer:coarse)]:size-7"
                onClick={() => { removedFocus.current = referenceId; if (local) onRemoveLocal(local.id); else if (asset) onRemoveAsset(asset); }}><X className="size-3" aria-hidden="true" /></button>
            </li>;
          })}
        </ul>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="shrink-0 text-[11px] text-muted-foreground">Character {activeIndex + 1} of {entries.length}</p>
        <div className="scrollbar-hidden flex min-w-0 gap-0.5 overflow-x-auto" aria-label="Character pages">{entries.map(({ referenceId, asset }, i) => <button key={referenceId} type="button" aria-label={`Go to character ${i + 1}${asset?.referenceName ? `: ${asset.referenceName}` : ""}`} aria-pressed={activeIndex === i} onClick={() => select(i)} className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:size-11"><span className={"size-1.5 rounded-full " + (activeIndex === i ? "bg-primary" : "bg-muted-foreground/35")} /></button>)}</div>
      </div>
      <div className="min-w-0 rounded-xl border border-border bg-card/60 p-3 [touch-action:pan-y_pinch-zoom]" aria-label="Character details"
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; }}
        onClickCapture={event => { if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
        onWheel={event => {
          if ((event.target as Element).closest(interactive) || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.5) return;
          if (event.timeStamp - wheel.current.time > 180) wheel.current = { time: event.timeStamp, total: 0, moved: false };
          wheel.current.time = event.timeStamp; wheel.current.total += event.deltaX;
          if (!wheel.current.moved && Math.abs(wheel.current.total) >= 48) { select(activeIndex + (wheel.current.total > 0 ? 1 : -1)); wheel.current.moved = true; }
        }}>
        {entries.map(({ referenceId, asset, local }, i) => <div key={referenceId} id={`${id}-${referenceId}-details`} data-character-detail={referenceId} hidden={i !== activeIndex} className={i === activeIndex ? "min-w-0 space-y-3" : "hidden"}>
          <div className="space-y-2">
            <label htmlFor={`${id}-${referenceId}-name`} className="flex items-center gap-2 text-xs font-medium"><UserRound className="size-4 text-primary" aria-hidden="true" />Character name</label>
            <input id={`${id}-${referenceId}-name`} name="character-name" type="text" autoComplete="off" aria-required="true" disabled={!asset || asset.status !== "uploaded" || !!local}
              value={asset?.referenceName ?? ""} maxLength={referenceNameLimit} placeholder="Character name"
              onChange={event => { if (asset) onNameChange(asset, event.target.value); }} onBlur={event => { if (asset) onNameChange(asset, event.target.value.trim()); }}
              className="sceenyk-field h-8 min-h-8 w-full min-w-0 rounded-lg border border-input bg-field px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [@media(pointer:coarse)]:min-h-11" />
          </div>
          <div className="min-w-0 space-y-2 border-t border-border pt-3">
            <h4 className="flex items-center gap-2 text-xs font-medium"><Layers2 className="size-4 text-primary" aria-hidden="true" />Character Sheet</h4>
            {perCharacterSheets && !local && asset?.status === "uploaded" ? <StudioPanelTarget panel={`character:${asset.id}`} /> : <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-[11px] text-muted-foreground">No sheet generated yet</div>}
          </div>
          {local && <div className="space-y-1 text-[11px] text-muted-foreground">
            {uploadStates[local.id]?.status === "failed" ? <><p role="status" className="break-words text-destructive">{uploadStates[local.id].message}</p><Button type="button" variant="ghost" disabled={busy} className={smallButton} onClick={() => onUpload(local)}>Retry upload</Button></> : <p role="status">{uploadStates[local.id]?.status === "verifying" ? "Verifying…" : signedIn ? "Uploading…" : "Local preview"}</p>}
          </div>}
          {!local && asset && asset.status !== "uploaded" && <div className="text-[11px] text-muted-foreground">{asset.status === "pending" ? <Button type="button" variant="ghost" disabled={busy} className={smallButton} onClick={() => onRecover(asset)}>Check upload</Button> : <p role="status" className="text-destructive">Upload rejected. Remove and select again.</p>}</div>}
        </div>)}
      </div>
    </>}
    {!signedIn && entries.length > 0 && <AccountAction intent="sign-in" variant="outline" disabled={!authReady} className={smallButton}>Sign in to upload</AccountAction>}
  </section>;
}
