"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { StudioPropertiesTarget } from "./studio-property-controls";
import { StudioToolbarTarget } from "./studio-toolbar-actions";
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
  const mode = useRef("modal");
  const lockedScroll = useRef<{ x: number; y: number; overflow: string } | null>(null);
  const returnFocus = useRef(true);
  const [propertiesTarget, setPropertiesTarget] = useState<HTMLDivElement | null>(null);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
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
    if (mode.current === "modal") {
      lockedScroll.current = { x: scrollX, y: scrollY, overflow: document.body.style.overflow };
      document.body.style.overflow = "hidden";
      sourcesDialog.current.showModal();
    } else sourcesDialog.current.show();
  }
  useEffect(() => {
    const element = root.current, dialog = sourcesDialog.current;
    const layout = element?.querySelector<HTMLElement>(".studio-layout");
    if (!element || !dialog || !layout) return;
    const syncSources = () => {
      // CSS owns the viewport/container breakpoints. Read the resulting mode
      // so the same Sources tree follows layout without duplicating thresholds.
      const next = getComputedStyle(layout).getPropertyValue("--studio-sources-mode").trim();
      if (next === mode.current) return;
      const wasFloating = dialog.open && mode.current !== "inline";
      returnFocus.current = false;
      if (dialog.open) dialog.close();
      restoreScroll();
      mode.current = next;
      // The permanent rail is ordinary page content: setting open directly
      // avoids native dialog.show() stealing focus into the project title.
      if (next === "inline") dialog.open = true;
      else if (wasFloating) {
        if (next === "modal") {
          lockedScroll.current = { x: scrollX, y: scrollY, overflow: document.body.style.overflow };
          document.body.style.overflow = "hidden";
          dialog.showModal();
        } else dialog.show();
      }
    };
    const observer = new ResizeObserver(syncSources);
    const desktopViewport = matchMedia("(min-width: 768px)");
    desktopViewport.addEventListener("change", syncSources);
    observer.observe(element);
    return () => {
      observer.disconnect();
      desktopViewport.removeEventListener("change", syncSources);
      // Activity can hide a cached editor without removing its DOM. Release
      // native top-layer/inert state and resync the rail when it reactivates.
      returnFocus.current = false;
      if (dialog.open) dialog.close();
      mode.current = "";
      if (lockedScroll.current) {
        document.body.style.overflow = lockedScroll.current.overflow;
        lockedScroll.current = null;
      }
    };
  }, []);
  return <StudioPropertiesTarget.Provider value={propertiesTarget}><StudioToolbarTarget.Provider value={toolbarTarget}><div className="studio-container" ref={root}>
    <div className="studio-layout">
      <dialog id="studio-sources" ref={sourcesDialog} className="studio-sources studio-panel" aria-labelledby="studio-sources-title"
        onKeyDown={event => {
          if (event.key === "Escape" && mode.current === "panel") { event.preventDefault(); closeSources(); }
        }}
        onClickCapture={event => {
          if ((event.target as HTMLElement).closest("[data-account-auth]") && mode.current !== "inline") {
            // Release our lock before Clerk opens and takes ownership of focus/scroll.
            returnFocus.current = false;
            closeSources();
          }
        }}
        onClose={() => {
          // A resize can close and immediately reopen this same dialog in its
          // new mode. Ignore the queued close event for the old mode.
          if (sourcesDialog.current?.open) { returnFocus.current = true; return; }
          restoreScroll();
          if (mode.current !== "inline" && returnFocus.current) trigger.current?.focus({ preventScroll: true });
          returnFocus.current = true;
        }}>
        <header className="studio-panel-header">
          <h2 id="studio-sources-title">Sources</h2>
          <Button type="button" variant="ghost" aria-label="Close Sources" className="studio-sources-close" onClick={closeSources}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </header>
        <div className="studio-panel-body" tabIndex={0} role="region" aria-label="Sources controls">{sources}</div>
      </dialog>
      <section className="studio-stage studio-panel" aria-label="Preview Stage">
        <div className="studio-toolbar" role="group" aria-label="Studio toolbar">
          <Button ref={trigger} type="button" variant="outline" aria-label="Open Sources" aria-controls="studio-sources" aria-haspopup="dialog" className="studio-sources-trigger" onClick={openSources}>
            <FolderOpen className="size-4" aria-hidden="true" /><span>Sources</span>
          </Button>
          {toolbar}
          <div ref={setToolbarTarget} className="studio-toolbar-actions" />
        </div>
        <div className="studio-stage-body" tabIndex={0} role="region" aria-label="Preview content">{stage}</div>
      </section>
      <aside className="studio-properties studio-panel" aria-labelledby="studio-properties-title">
        <header className="studio-panel-header"><h2 id="studio-properties-title">Properties</h2></header>
        <div className="studio-panel-body" tabIndex={0} role="region" aria-label="Properties controls">{properties}<div ref={setPropertiesTarget} className="studio-caption-properties" /></div>
      </aside>
    </div>
  </div></StudioToolbarTarget.Provider></StudioPropertiesTarget.Provider>;
}
