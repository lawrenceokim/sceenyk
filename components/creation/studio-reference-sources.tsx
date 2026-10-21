"use client";

import { useId, useRef } from "react";
import { ImageIcon, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountAction } from "@/components/account-action";
import { LocalMediaThumbnail } from "./local-media-preview";
import { PersistentMediaPreview } from "./persistent-media-preview";
import type { LocalMedia } from "./creation-options";
import type { ProjectAsset } from "@/lib/media/types";
import type { UploadState } from "@/lib/media/upload-client";
import type { StudioReference } from "./studio-inputs";

export function StudioReferenceSources({ label, addLabel, references, onAdd, onRemoveLocal, onRemoveAsset,
  onUpload, onRecover, uploadStates, busy, signedIn, authReady }: {
  label: string;
  addLabel: string;
  references: StudioReference[];
  onAdd: (files: File[]) => void;
  onRemoveLocal: (id: string) => void;
  onRemoveAsset: (asset: ProjectAsset) => void;
  onUpload: (media: LocalMedia) => void;
  onRecover: (asset: ProjectAsset) => void;
  uploadStates: Record<string, UploadState>;
  busy: boolean;
  signedIn: boolean;
  authReady: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const buttonClass = "h-8 min-h-8 cursor-pointer gap-1.5 rounded-lg px-2 text-xs [@media(pointer:coarse)]:min-h-11";
  return <section className="min-w-0" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`} className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</h3>
    <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1}
      aria-label={addLabel} onChange={event => { onAdd(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <Button ref={add} type="button" variant="outline" className={buttonClass} onClick={() => input.current?.click()}>
      <Plus className="size-3.5" aria-hidden="true" />{addLabel}
    </Button>
    {references.length > 0 && <ul className="mt-3 flex min-w-0 flex-wrap gap-2" aria-label={label}>
      {references.map(reference => {
        // One image per reference in this unit; the model already permits more.
        const { local, asset } = reference.images[0];
        const filename = local?.file.name ?? asset?.filename ?? label;
        return <li key={reference.id} className="relative size-16 shrink-0 rounded-lg border border-border bg-field" title={filename}>
          <div className="relative size-full overflow-hidden rounded-lg">
            {local ? <LocalMediaThumbnail media={local} className="size-full" alt={filename} />
              : asset?.status === "uploaded" ? <PersistentMediaPreview asset={asset} thumbnail />
                : <span className="flex size-full items-center justify-center"><ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" /></span>}
          </div>
          <button type="button" disabled={busy} aria-label={`Remove ${filename}`}
            className="absolute -top-1 -right-1 flex size-5 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm outline-none transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none [@media(pointer:coarse)]:size-7"
            onClick={() => { if (local) onRemoveLocal(local.id); else if (asset) onRemoveAsset(asset); add.current?.focus(); }}>
            <X className="size-3" aria-hidden="true" />
          </button>
        </li>;
      })}
      <li><button type="button" onClick={() => input.current?.click()} aria-label={addLabel}
        className="flex size-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-input text-muted-foreground outline-none transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
        <Plus className="size-4" aria-hidden="true" />
      </button></li>
    </ul>}
    <div className="mt-2 space-y-2">
      {references.flatMap(reference => reference.images).map(({ local, asset }) => {
        const state = local ? uploadStates[local.id] : undefined;
        if (local) return <div key={local.id} className="min-w-0 text-[11px] text-muted-foreground">
          <p className="truncate">{local.file.name}</p>
          {state?.status === "failed" ? <><p role="status" className="break-words text-destructive">{state.message}</p>
            <Button type="button" variant="ghost" disabled={busy} className={buttonClass} onClick={() => onUpload(local)}>Retry upload</Button></>
            : <p role="status">{state?.status === "uploading" ? `Uploading${state.progress === undefined ? "…" : ` · ${state.progress}%`}`
              : state?.status === "verifying" ? "Verifying…" : signedIn ? "Preparing upload…" : "Local preview"}</p>}
        </div>;
        if (asset && asset.status !== "uploaded") return <div key={asset.id} className="min-w-0 text-[11px] text-muted-foreground">
          <p className="truncate">{asset.filename}</p>
          {asset.status === "pending" ? <Button type="button" variant="ghost" disabled={busy} className={buttonClass} onClick={() => onRecover(asset)}>Check upload</Button>
            : <p role="status" className="text-destructive">Upload rejected. Remove and select again.</p>}
        </div>;
        return null;
      })}
      {!signedIn && references.length > 0 && <AccountAction intent="sign-in" variant="outline" disabled={!authReady} className={buttonClass}>Sign in to upload</AccountAction>}
    </div>
  </section>;
}
