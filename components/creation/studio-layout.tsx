"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { StudioPropertiesTarget } from "./studio-property-controls";
import { StudioToolbarTarget } from "./studio-toolbar-actions";
import { FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  return <StudioPropertiesTarget.Provider value={propertiesTarget}><StudioToolbarTarget.Provider value={toolbarTarget}><div className={`
      studio-container [&&]:[container-type:inline-size]
      [&&]:[--studio-panel-height:calc(100dvh_-_var(--workspace-mobile-header-height)_-_var(--workspace-inset)_*_2)]
      min-[1024px]:[&&]:[--studio-panel-height:calc(100dvh_-_var(--workspace-inset)_*_2)]
    `} ref={root}>
    <div className={`
      studio-layout [&&]:[--studio-sources-mode:modal] [&&]:grid [&&]:gap-[18px] [&&]:min-w-[0]
      min-[768px]:[&&]:[--studio-sources-mode:panel] min-[768px]:[&&]:[--studio-short-stage:clamp(208px,42dvh,320px)]
      min-[768px]:[&&]:gap-[32px] min-[1024px]:@min-[930px]:[&&]:[--studio-sources-mode:inline]
      min-[1024px]:@min-[930px]:[&&]:[grid-template-columns:var(--workspace-rail)_minmax(0,1fr)_var(--workspace-inspector)]
      min-[1024px]:@min-[930px]:[&&]:gap-[var(--workspace-gap)]
    `}>
      <dialog id="studio-sources" ref={sourcesDialog} className={`
      studio-sources studio-panel [&&]:hidden [&&]:mt-[0] [&&]:mr-[0] [&&]:mb-[0] [&&]:ml-[0] [&&]:pt-[0] [&&]:pr-[0]
      [&&]:pb-[0] [&&]:pl-[0] [&&]:max-w-[none] [&&]:max-h-[none] [&&[open]]:fixed [&&[open]]:top-[8px]
      [&&[open]]:right-[8px] [&&[open]]:bottom-[8px] [&&[open]]:left-[8px] [&&[open]]:w-[calc(100vw_-_16px)]
      [&&[open]]:h-[calc(100dvh_-_16px)] [&&[open]]:flex [&&[open]]:flex-col [&&[open]]:z-[60]
      [&&::backdrop]:[background:var(--overlay)] min-[768px]:[&&[open]]:left-[auto]
      min-[768px]:[&&[open]]:w-[var(--workspace-rail)] min-[1024px]:@min-[930px]:[&&[open]]:static
      min-[1024px]:@min-[930px]:[&&[open]]:w-[auto] min-[1024px]:@min-[930px]:[&&[open]]:h-[var(--studio-panel-height)]
      [&&]:min-w-[0] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[var(--ui-radius-frame)]
      [&&]:[background:var(--card)] [&&]:text-[color:var(--card-foreground)]
    `} aria-labelledby="studio-sources-title"
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
        <header className={`
      studio-panel-header [&&]:h-[var(--workspace-panel-header-height)] [&&]:shrink-0 [&&]:flex [&&]:items-center
      [&&]:justify-between [&&]:gap-[var(--ui-space-2)] [&&]:pt-[0] [&&]:pr-[var(--workspace-panel-padding)] [&&]:pb-[0]
      [&&]:pl-[var(--workspace-panel-padding)] [&&]:[border-bottom:1px_solid_var(--border)]
      [&&]:text-[length:var(--ui-text-panel)] [&&]:font-[600]
    `}>
          <h2 id="studio-sources-title">Sources</h2>
          <Button type="button" variant="ghost" aria-label="Close Sources" className={"studio-sources-close [&&]:w-[28px] [&&]:min-h-[28px] [&&]:h-[28px] [&&]:pt-[0] [&&]:pr-[0] [&&]:pb-[0] [&&]:pl-[0] min-[1024px]:@min-[930px]:[&&]:hidden"} onClick={closeSources}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </header>
        <div className={`
      studio-panel-body [&&]:relative [&&]:pt-[0] [&&]:pr-[var(--workspace-panel-padding)]
      [&&]:pb-[var(--workspace-panel-padding)] [&&]:pl-[var(--workspace-panel-padding)] [.studio-sources_&&]:pt-[12px]
      [.studio-sources_&&]:[flex:1] [.studio-sources_&&]:min-h-[0] [.studio-sources_&&]:overflow-y-auto
      [.studio-sources_&&]:overscroll-contain [.studio-sources_&&]:pb-[max(24px,_env(safe-area-inset-bottom))]
      [.studio-sources_&&_>_*_+_*]:mt-[16px] [.studio-sources_&&_>_*_+_*]:pt-[16px]
      [.studio-sources_&&_>_*_+_*]:[border-top:1px_solid_var(--border)] min-[768px]:[.studio-properties_&&]:overflow-y-auto
      min-[768px]:[.studio-properties_&&]:min-h-[0] min-[768px]:[.studio-properties_&&]:[flex:1]
      min-[768px]:[.studio-properties_&&]:overscroll-contain [&&:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&:focus-visible]:[outline-offset:-2px] [&&:focus-visible]:rounded-[8px]
      [.studio-properties_>_&&]:pt-[var(--workspace-panel-padding)]
    `} tabIndex={0} role="region" aria-label="Sources controls">{sources}</div>
      </dialog>
      <section className={`
      studio-stage studio-panel [&&]:flex [&&]:flex-col min-[768px]:[&&]:h-[var(--studio-short-stage)]
      min-[1024px]:@min-[930px]:[&&]:h-[var(--studio-panel-height)] [&&]:min-w-[0] [&&]:[border:1px_solid_var(--border)]
      [&&]:rounded-[var(--ui-radius-frame)] [&&]:[background:var(--card)] [&&]:text-[color:var(--card-foreground)]
    `} aria-label="Preview Stage">
        <div className={`
      studio-toolbar [&&]:relative [&&]:h-[var(--workspace-toolbar-height)] [&&]:shrink-0 [&&]:pt-[0]
      [&&]:pr-[var(--ui-space-2)] [&&]:pb-[0] [&&]:pl-[var(--ui-space-2)] [&&]:flex [&&]:items-center
      [&&]:gap-[var(--ui-space-2)] [&&_button]:min-h-[var(--workspace-control-height)]
      [&&_button]:h-[var(--workspace-control-height)] [&&_button]:pt-[4px] [&&_button]:pr-[10px] [&&_button]:pb-[4px]
      [&&_button]:pl-[10px] [&&_button]:rounded-[var(--ui-radius-control)] [&&_button]:text-[length:var(--ui-text-control)]
      [&&_svg]:w-[16px] [&&_svg]:h-[16px] [&&_button:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&_button:focus-visible]:[outline-offset:2px] [&&_[data-slot='button']]:[background:var(--field)]
      [&&_[data-slot='button']]:text-[color:var(--foreground)] [&&_[data-slot='button']]:[border-color:var(--border)]
      [&&_[data-slot='button']]:[box-shadow:none] container-max-359:[&&]:gap-[4px]
    `} role="group" aria-label="Studio toolbar">
          <Button ref={trigger} type="button" variant="outline" aria-label="Open Sources" aria-controls="studio-sources" aria-haspopup="dialog" className={`
      studio-sources-trigger max-599:[&&_span]:hidden max-599:[.studio-toolbar_&&]:w-[32px]
      max-599:[.studio-toolbar_&&]:pt-[0] max-599:[.studio-toolbar_&&]:pr-[0] max-599:[.studio-toolbar_&&]:pb-[0]
      max-599:[.studio-toolbar_&&]:pl-[0] min-[1024px]:@min-[930px]:[&&]:hidden
    `} onClick={openSources}>
            <FolderOpen className="size-4" aria-hidden="true" /><span>Sources</span>
          </Button>
          {toolbar}
          <div ref={setToolbarTarget} className={"studio-toolbar-actions [&&]:flex [&&]:items-center [&&]:gap-[4px] [&&]:shrink-0 [&&:empty]:hidden"} />
        </div>
        <div className={`
      studio-stage-body [&&]:pt-[var(--workspace-inset)] [&&]:pr-[var(--workspace-inset)] [&&]:pb-[var(--workspace-inset)]
      [&&]:pl-[var(--workspace-inset)] [&&]:min-w-[0] [&&]:flex [&&]:flex-col [&&_>_[aria-label='Creation_preview']]:[flex:1]
      [&&_>_[aria-label='Creation_preview']]:min-h-[0] [&&_>_[aria-label='Creation_preview']]:flex
      [&&_>_[aria-label='Creation_preview']]:flex-col [&&_>_*_+_*]:mt-[12px] [&&_>_[role='status']:empty]:hidden
      min-[768px]:[&&]:overflow-y-auto min-[768px]:[&&]:min-h-[0] min-[768px]:[&&]:[flex:1]
      min-[768px]:[&&]:overscroll-contain [&&:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&:focus-visible]:[outline-offset:-2px] [&&:focus-visible]:rounded-[8px]
    `} tabIndex={0} role="region" aria-label="Preview content">{stage}</div>
      </section>
      <aside className={`
      studio-properties studio-panel [&&]:flex [&&]:flex-col
      min-[768px]:[&&]:h-[calc(var(--studio-panel-height)_-_var(--studio-short-stage)_-_32px)] min-[768px]:[&&]:min-h-[160px]
      min-[1024px]:@min-[930px]:[&&]:h-[var(--studio-panel-height)] [&&]:min-w-[0] [&&]:[border:1px_solid_var(--border)]
      [&&]:rounded-[var(--ui-radius-frame)] [&&]:[background:var(--card)] [&&]:text-[color:var(--card-foreground)]
    `} aria-labelledby="studio-properties-title">
        <header className={`
      studio-panel-header [&&]:h-[var(--workspace-panel-header-height)] [&&]:shrink-0 [&&]:flex [&&]:items-center
      [&&]:justify-between [&&]:gap-[var(--ui-space-2)] [&&]:pt-[0] [&&]:pr-[var(--workspace-panel-padding)] [&&]:pb-[0]
      [&&]:pl-[var(--workspace-panel-padding)] [&&]:[border-bottom:1px_solid_var(--border)]
      [&&]:text-[length:var(--ui-text-panel)] [&&]:font-[600]
    `}><h2 id="studio-properties-title">Properties</h2></header>
        <div className={`
      studio-panel-body [&&]:relative [&&]:pt-[0] [&&]:pr-[var(--workspace-panel-padding)]
      [&&]:pb-[var(--workspace-panel-padding)] [&&]:pl-[var(--workspace-panel-padding)] [.studio-sources_&&]:pt-[12px]
      [.studio-sources_&&]:[flex:1] [.studio-sources_&&]:min-h-[0] [.studio-sources_&&]:overflow-y-auto
      [.studio-sources_&&]:overscroll-contain [.studio-sources_&&]:pb-[max(24px,_env(safe-area-inset-bottom))]
      [.studio-sources_&&_>_*_+_*]:mt-[16px] [.studio-sources_&&_>_*_+_*]:pt-[16px]
      [.studio-sources_&&_>_*_+_*]:[border-top:1px_solid_var(--border)] min-[768px]:[.studio-properties_&&]:overflow-y-auto
      min-[768px]:[.studio-properties_&&]:min-h-[0] min-[768px]:[.studio-properties_&&]:[flex:1]
      min-[768px]:[.studio-properties_&&]:overscroll-contain [&&:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&:focus-visible]:[outline-offset:-2px] [&&:focus-visible]:rounded-[8px]
      [.studio-properties_>_&&]:pt-[var(--workspace-panel-padding)]
    `} tabIndex={0} role="region" aria-label="Properties controls">{properties}<div ref={setPropertiesTarget} className={`
      studio-caption-properties [&&:empty]:hidden [&&:not(:empty)]:pt-[16px] [&&:not(:empty)]:pb-[16px]
      [&&:not(:empty)]:[border-top:1px_solid_var(--border)] [&&_select]:min-h-[32px] [&&_select]:text-[length:12px]
      [&&_[data-slot='button']]:min-h-[var(--workspace-control-height)] [&&_[data-slot='button']]:h-[auto]
      [&&_[data-slot='button']]:pt-[6px] [&&_[data-slot='button']]:pr-[8px] [&&_[data-slot='button']]:pb-[6px]
      [&&_[data-slot='button']]:pl-[8px] [&&_[data-slot='button']]:text-[length:var(--ui-text-control)]
    `} /></div>
      </aside>
    </div>
  </div></StudioToolbarTarget.Provider></StudioPropertiesTarget.Provider>;
}
