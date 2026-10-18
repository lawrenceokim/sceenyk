"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { StudioPropertiesTarget } from "./studio-property-controls";
import { FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./studio.css";

// One mounted Sources tree: opening the native modal does not move or remount
// uploads, file inputs, or previews. Native dialog owns modal focus trapping.
export function StudioLayout({ sources, toolbar, stage, properties }: {
  sources: ReactNode; toolbar: ReactNode; stage: ReactNode; properties: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const sourcesDialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const desktop = useRef(false);
  const lockedScroll = useRef<{ x: number; y: number; overflow: string } | null>(null);
  const returnFocus = useRef(true);
  const [propertiesTarget, setPropertiesTarget] = useState<HTMLDivElement | null>(null);
  function restoreScroll() {
    const previous = lockedScroll.current;
    if (!previous) return;
    lockedScroll.current = null;
    document.body.style.overflow = previous.overflow;
    window.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
  }
  function closeSources() {
    sourcesDialog.current?.close();
    restoreScroll();
  }
  function openSources() {
    if (!sourcesDialog.current || sourcesDialog.current.open) return;
    returnFocus.current = true;
    lockedScroll.current = { x: scrollX, y: scrollY, overflow: document.body.style.overflow };
    document.body.style.overflow = "hidden";
    sourcesDialog.current.showModal();
  }
  useEffect(() => {
    const element = root.current, dialog = sourcesDialog.current;
    if (!element || !dialog) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width >= 1050;
      if (next === desktop.current) return;
      const wasModal = dialog.matches(":modal");
      if (dialog.open) dialog.close();
      if (wasModal) restoreScroll();
      desktop.current = next;
      if (next) dialog.show();
      else if (wasModal) trigger.current?.focus({ preventScroll: true });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (lockedScroll.current) {
        document.body.style.overflow = lockedScroll.current.overflow;
        lockedScroll.current = null;
      }
    };
  }, []);
  return <StudioPropertiesTarget.Provider value={propertiesTarget}><div className="studio-container" ref={root}>
    <div className="studio-layout">
      <dialog ref={sourcesDialog} className="studio-sources studio-panel" aria-labelledby="studio-sources-title"
        onClickCapture={event => {
          if ((event.target as HTMLElement).closest("[data-account-auth]") && sourcesDialog.current?.matches(":modal")) {
            // Release our lock before Clerk opens and takes ownership of focus/scroll.
            returnFocus.current = false;
            closeSources();
          }
        }}
        onClose={() => {
          restoreScroll();
          if (!desktop.current && returnFocus.current) trigger.current?.focus({ preventScroll: true });
        }}>
        <header className="studio-panel-header">
          <h2 id="studio-sources-title">Sources</h2>
          <Button type="button" variant="ghost" className="studio-sources-close" onClick={closeSources}>
            <X className="size-4" aria-hidden="true" />Close Sources
          </Button>
        </header>
        <div className="studio-panel-body">{sources}</div>
      </dialog>
      <section className="studio-stage studio-panel" aria-label="Preview Stage">
        <div className="studio-toolbar" role="group" aria-label="Studio toolbar">
          <Button ref={trigger} type="button" variant="outline" aria-haspopup="dialog" className="studio-sources-trigger" onClick={openSources}>
            <FolderOpen className="size-4" aria-hidden="true" />Sources
          </Button>
          {toolbar}
        </div>
        <div className="studio-stage-body">{stage}</div>
      </section>
      <aside className="studio-properties studio-panel" aria-labelledby="studio-properties-title">
        <header className="studio-panel-header"><h2 id="studio-properties-title">Properties</h2></header>
        <div className="studio-panel-body">{properties}<div ref={setPropertiesTarget} className="studio-caption-properties" /></div>
      </aside>
    </div>
  </div></StudioPropertiesTarget.Provider>;
}
