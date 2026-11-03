"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { ProjectAsset } from "@/lib/media/types";
import type { LocalMedia } from "./creation-options";
import { LocalMediaPreview } from "./local-media-preview";
import { PersistentMediaPreview } from "./persistent-media-preview";

export type StudioPanel = "character" | "product" | "location" | "workflow";
export type StudioPreviewMedia = { id: string; label: string } & (
  | { kind: "image" | "video"; src: string }
  | { kind: "local"; media: LocalMedia }
  | { kind: "asset"; asset: ProjectAsset }
  | { kind: "private-image"; content: ReactNode }
);

export const StudioPanelsContext = createContext<{
  targets: Partial<Record<StudioPanel, HTMLDivElement>>;
  register: (panel: StudioPanel, element: HTMLDivElement | null) => void;
  selectMedia: (id: string) => void;
  setWorkflowMedia: (media: StudioPreviewMedia[], collection: string) => void;
  setWorkflowAttention: (attention: boolean) => void;
  openWorkflow: () => void;
} | null>(null);

export function useStudioPanels() { return useContext(StudioPanelsContext); }

export function StudioPanelTarget({ panel }: { panel: StudioPanel }) {
  const register = useStudioPanels()?.register;
  const ref = useCallback((element: HTMLDivElement | null) => register?.(panel, element), [register, panel]);
  return <div ref={ref} className="min-w-0 space-y-3 empty:hidden" />;
}

// Portals relocate presentation while the existing workflow owner stays mounted.
export function StudioPanelPortal({ panel, children }: { panel: StudioPanel; children: ReactNode }) {
  const context = useStudioPanels();
  if (!context) return children;
  const target = context.targets[panel];
  return target ? createPortal(children, target) : null;
}

export function StudioWorkflowMedia({ media, collection = "workflow" }: { media: StudioPreviewMedia[]; collection?: string }) {
  const setMedia = useStudioPanels()?.setWorkflowMedia;
  useEffect(() => { setMedia?.(media, collection); }, [setMedia, media, collection]);
  useEffect(() => () => setMedia?.([], collection), [setMedia, collection]);
  return null;
}

export function StudioMediaView({ media }: { media: StudioPreviewMedia }) {
  return <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden [&>div]:h-full [&>div]:min-h-0 [&>div]:flex-1 [&_img]:object-contain [&_video]:max-h-full">
    {media.kind === "local" ? <LocalMediaPreview media={media.media} /> : media.kind === "asset" ? <PersistentMediaPreview asset={media.asset} />
      : media.kind === "private-image" ? media.content : media.kind === "video" ? <video key={media.id} controls playsInline preload="metadata" src={media.src} aria-label={media.label} className="h-full min-h-0 w-full object-contain" />
        : <div className="relative min-h-0 flex-1"><Image fill unoptimized src={media.src} alt={media.label} sizes="100vw" className="object-contain" /></div>}
  </div>;
}
