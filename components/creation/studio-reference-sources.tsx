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
import { studioReferenceImages, type StudioReference } from "./studio-inputs";
import { ugcV1LimitMessages } from "@/lib/projects/ugc-v1";
import { referenceNameLimit } from "@/lib/projects/reference-names";

export function StudioReferenceSources({ label, addLabel, role, references, onAdd, onRemoveLocal, onRemoveAsset,
  onUpload, onRecover, onNameChange, uploadStates, busy, signedIn, authReady }: {
  label: string;
  addLabel: string;
  role: "character" | "product";
  references: StudioReference[];
  onAdd: (files: File[]) => void;
  onRemoveLocal: (id: string) => void;
  onRemoveAsset: (asset: ProjectAsset) => void;
  onUpload: (media: LocalMedia) => void;
  onRecover: (asset: ProjectAsset) => void;
  onNameChange: (asset: ProjectAsset, value: string) => void;
  uploadStates: Record<string, UploadState>;
  busy: boolean;
  signedIn: boolean;
  authReady: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const images = studioReferenceImages(references);
  const atLimit = images.length >= 1;
  const buttonClass = "h-8 min-h-8 cursor-pointer gap-1.5 rounded-lg px-2 text-xs [&&:disabled]:pointer-events-auto disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50 disabled:hover:bg-muted [@media(pointer:coarse)]:min-h-11";
  return <section className="min-w-0" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`} className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</h3>
    <input ref={input} type="file" accept="image/*" disabled={atLimit} className="sr-only" tabIndex={-1}
      aria-label={addLabel} onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []);
        if (!files.length) return;
        onAdd(files);
        event.currentTarget.value = "";
      }} />
    <Button ref={add} type="button" variant="outline" disabled={atLimit} className={buttonClass} onClick={() => { if (!atLimit) input.current?.click(); }}>
      <Plus className="size-3.5" aria-hidden="true" />{addLabel}
    </Button>
    {references.length > 0 && <ul className="mt-3 flex min-w-0 flex-wrap gap-2" aria-label={label}>
      {images.map(({ local, asset }) => {
        const filename = local?.file.name ?? asset?.filename ?? label;
        return <li key={local?.id ?? asset?.id} className="min-w-0 max-w-full basis-full">
          <div className="relative size-16 shrink-0 rounded-lg border border-border bg-field" title={filename}>
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
          </div>
          {!local && asset?.status === "uploaded" && <div className="mt-2 min-w-0 space-y-1">
            <label htmlFor={`${id}-${asset.id}-name`} className="block text-[11px] font-medium text-foreground">
              {role === "character" ? "Character name" : "Product / Prop name"}
            </label>
            <input id={`${id}-${asset.id}-name`} name={`${role}-name`} type="text" autoComplete="off" aria-required="true"
              value={asset.referenceName ?? ""} maxLength={referenceNameLimit}
              placeholder={role === "character" ? "e.g. Maya" : "e.g. Nova Watch"}
              onChange={event => onNameChange(asset, event.target.value)}
              onBlur={event => onNameChange(asset, event.target.value.trim())}
              className="sceenyk-field h-8 min-h-8 w-full min-w-0 max-w-full rounded-lg border border-input bg-field px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11" />
          </div>}
        </li>;
      })}
    </ul>}
    {images.length > 1 && <p role="alert" className="mt-2 text-xs text-destructive">{ugcV1LimitMessages[role]}</p>}
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
