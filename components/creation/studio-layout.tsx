"use client";

import { newlyAvailableVideo } from "./studio-video-selection";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StudioPropertiesTarget } from "./studio-property-controls";
import { StudioToolbarTarget } from "./studio-toolbar-actions";
import { StudioModeBadge } from "@/components/workspace/studio-mode-selector";
import { FolderOpen, Workflow, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogPortalContainer,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  StudioMediaView,
  StudioPanelsContext,
  StudioPanelTarget,
  type StudioPanel,
  type StudioPreviewMedia,
} from "./studio-workspace-panels";

// One mounted Sources tree: opening the native modal does not move or remount
// uploads, file inputs, or previews. Native dialog owns modal focus trapping.
export function StudioLayout({
  sources,
  toolbar,
  stage,
  properties,
  workflow,
  media = [],
}: {
  sources: ReactNode;
  toolbar: ReactNode;
  stage: ReactNode;
  properties: ReactNode;
  workflow?: ReactNode;
  media?: StudioPreviewMedia[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const sourcesDialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mode = useRef("modal");
  const lockedScroll = useRef<{
    x: number;
    y: number;
    overflow: string;
  } | null>(null);
  const returnFocus = useRef(true);
  const [propertiesTarget, setPropertiesTarget] =
    useState<HTMLDivElement | null>(null);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [targets, setTargets] = useState<
    Partial<Record<StudioPanel, HTMLDivElement>>
  >({});
  const register = useCallback(
    (panel: StudioPanel, element: HTMLDivElement | null) => {
      setTargets((current) => {
        const next = { ...current };
        if (element) next[panel] = element;
        else delete next[panel];
        return next;
      });
    },
    [],
  );
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowAttention, setWorkflowAttention] = useState(false);
  const [workflowCollections, setWorkflowCollections] = useState<
    Record<string, StudioPreviewMedia[]>
  >({});
  const [selectedId, setSelectedId] = useState<string | null | undefined>(
    undefined,
  );
  const seenWorkflowVideos = useRef(new Set<string>());
  const setWorkflowMedia = useCallback(
    (media: StudioPreviewMedia[], collection: string, autoSelectVideo = false) => {
      if (autoSelectVideo) {
        const added = newlyAvailableVideo(media, seenWorkflowVideos.current);
        if (added) setSelectedId(added);
      }
      setWorkflowCollections((current) => ({
        ...current,
        [collection]: media,
      }));
    },
    [],
  );
  const workflowMedia = Object.values(workflowCollections).flat();

  const [mobileImageId, setMobileImageId] = useState<string | null>(null);
  const [modalContainer, setModalContainer] = useState<HTMLElement | null>(
    null,
  );
  const allMedia = [...media, ...workflowMedia];
  const selected =
    selectedId === undefined
      ? workflowMedia.filter((item) => item.kind === "video").at(-1)
      : allMedia.find((item) => item.id === selectedId);
  const mobileImage = allMedia.find((item) => item.id === mobileImageId);
  function selectMedia(id: string) {
    const item = allMedia.find((item) => item.id === id);
    if (!item) return;
    if (matchMedia("(max-width: 767px)").matches && item.kind !== "video")
      setMobileImageId(id);
    else {
      setSelectedId(id);
      setWorkflowOpen(false);
      if (mode.current !== "inline") closeSources();
    }
  }
  const restoreScroll = useCallback(() => {
    const previous = lockedScroll.current;
    if (!previous) return;
    lockedScroll.current = null;
    document.body.style.overflow = previous.overflow;
    window.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
  }, []);
  const closeSources = useCallback(() => {
    sourcesDialog.current?.close();
    setModalContainer(null);
    restoreScroll();
  }, [restoreScroll, setModalContainer]);
  const openWorkflow = useCallback(() => {
    setMobileImageId(null);
    if (mode.current !== "inline") {
      returnFocus.current = false;
      closeSources();
    }
    setWorkflowOpen(true);
  }, [closeSources, setMobileImageId, setWorkflowOpen]);
  function openSources() {
    if (!sourcesDialog.current || sourcesDialog.current.open) return;
    returnFocus.current = true;
    if (mode.current === "modal") {
      lockedScroll.current = {
        x: scrollX,
        y: scrollY,
        overflow: document.body.style.overflow,
      };
      document.body.style.overflow = "hidden";
      sourcesDialog.current.showModal();
      setModalContainer(sourcesDialog.current);
    } else sourcesDialog.current.show();
  }
  useEffect(() => {
    const element = root.current,
      dialog = sourcesDialog.current;
    const layout = element?.querySelector<HTMLElement>(".studio-layout");
    if (!element || !dialog || !layout) return;
    const syncSources = () => {
      // CSS owns the viewport/container breakpoints. Read the resulting mode
      // so the same Sources tree follows layout without duplicating thresholds.
      const next = getComputedStyle(layout)
        .getPropertyValue("--studio-sources-mode")
        .trim();
      dialog.dataset.sourcesMode = next;
      if (next === mode.current) return;
      const wasFloating = dialog.open && mode.current !== "inline";
      returnFocus.current = false;
      if (dialog.open) dialog.close();
      setModalContainer(null);
      restoreScroll();
      mode.current = next;
      // The permanent rail is ordinary page content: setting open directly
      // avoids native dialog.show() stealing focus into the project title.
      if (next === "inline") dialog.open = true;
      else if (wasFloating) {
        if (next === "modal") {
          lockedScroll.current = {
            x: scrollX,
            y: scrollY,
            overflow: document.body.style.overflow,
          };
          document.body.style.overflow = "hidden";
          dialog.showModal();
          setModalContainer(dialog);
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
  }, [restoreScroll]);
  return (
    <StudioPanelsContext.Provider
      value={{ targets, register, selectMedia, setWorkflowMedia, setWorkflowAttention, openWorkflow }}
    >
      <DialogPortalContainer.Provider value={modalContainer}>
        <StudioPropertiesTarget.Provider value={propertiesTarget}>
          <StudioToolbarTarget.Provider value={toolbarTarget}>
            <div
              className={`
      studio-container [&&]:[container-type:inline-size] [&&]:h-[var(--studio-panel-height)] [&&]:min-h-0
      [&&]:[--studio-panel-height:calc(100dvh_-_var(--workspace-mobile-header-height)_-_var(--workspace-inset)_*_2)]
      min-[1024px]:[&&]:[--studio-panel-height:calc(100dvh_-_var(--workspace-inset)_*_2)]
    `}
              ref={root}
            >
              <div
                className={`
      studio-layout [&&]:[--studio-sources-mode:modal] [&&]:grid [&&]:gap-[16px] [&&]:min-w-[0] [&&]:h-full [&&]:min-h-0
      max-767:[&&]:[grid-template-rows:minmax(0,0.95fr)_minmax(0,1fr)]
      min-[768px]:[&&]:[--studio-sources-mode:panel] min-[768px]:[&&]:[--studio-short-stage:clamp(208px,42dvh,320px)]
      min-[768px]:[&&]:gap-[32px] min-[1024px]:@min-[930px]:[&&]:[--studio-sources-mode:inline]
      min-[1024px]:@min-[930px]:[&&]:[grid-template-columns:var(--workspace-rail)_minmax(0,1fr)_var(--workspace-inspector)]
      min-[1024px]:@min-[930px]:[&&]:gap-[var(--workspace-gap)]
    `}
              >
                <dialog
                  id="studio-sources"
                  ref={sourcesDialog}
                  data-lenis-prevent
                  className={`
      motion-native-panel studio-sources studio-panel [&&]:hidden [&&]:mt-[0] [&&]:mr-[0] [&&]:mb-[0] [&&]:ml-[0] [&&]:pt-[0] [&&]:pr-[0]
      [&&]:pb-[0] [&&]:pl-[0] [&&]:max-w-[none] [&&]:max-h-[none] [&&[open]]:fixed [&&[open]]:top-[8px]
      [&&[open]]:right-[8px] [&&[open]]:bottom-[8px] [&&[open]]:left-[8px] [&&[open]]:w-[calc(100vw_-_16px)]
      [&&[open]]:h-[calc(100dvh_-_16px)] [&&[open]]:flex [&&[open]]:flex-col [&&[open]]:z-[60]
      [&&::backdrop]:[background:var(--overlay)] min-[768px]:[&&[open]]:left-[auto]
      min-[768px]:[&&[open]]:w-[var(--workspace-rail)] min-[1024px]:@min-[930px]:[&&[open]]:static
      min-[1024px]:@min-[930px]:[&&[open]]:z-auto
      min-[1024px]:@min-[930px]:[&&[open]]:w-[auto] min-[1024px]:@min-[930px]:[&&[open]]:h-[var(--studio-panel-height)]
      [&&]:min-w-[0] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[var(--ui-radius-frame)]
      [&&]:[background:var(--card)] [&&]:text-[color:var(--card-foreground)]
    `}
                  aria-labelledby="studio-sources-title"
                  onCancel={(event) => {
                    // File inputs also emit a bubbling cancel event. Only a cancel of
                    // this dialog itself should close Sources or release its scroll lock.
                    if (event.target !== event.currentTarget) return;
                    event.preventDefault();
                    closeSources();
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Escape" &&
                      mode.current === "panel" &&
                      !event.defaultPrevented
                    ) {
                      event.preventDefault();
                      closeSources();
                    }
                  }}
                  onClickCapture={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "[data-account-auth]",
                      ) &&
                      mode.current !== "inline"
                    ) {
                      // Release our lock before Clerk opens and takes ownership of focus/scroll.
                      returnFocus.current = false;
                      closeSources();
                    }
                  }}
                  onClose={() => {
                    // A resize can close and immediately reopen this same dialog in its
                    // new mode. Ignore the queued close event for the old mode.
                    if (sourcesDialog.current?.open) {
                      returnFocus.current = true;
                      return;
                    }
                    restoreScroll();
                    if (mode.current !== "inline" && returnFocus.current)
                      trigger.current?.focus({ preventScroll: true });
                    returnFocus.current = true;
                  }}
                >
                  <header
                    className={`
      studio-panel-header [&&]:h-[var(--workspace-panel-header-height)] [&&]:shrink-0 [&&]:flex [&&]:items-center
      [&&]:justify-between [&&]:gap-[var(--ui-space-2)] [&&]:pt-[0] [&&]:pr-[var(--workspace-panel-padding)] [&&]:pb-[0]
      [&&]:pl-[var(--workspace-panel-padding)] [&&]:[border-bottom:1px_solid_var(--border)]
      [&&]:text-[length:var(--ui-text-panel)] [&&]:font-[600]
    `}
                  >
                    <h2 id="studio-sources-title">Sources</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Close Sources"
                      className={
                        "studio-sources-close [&&]:w-[28px] [&&]:min-h-[28px] [&&]:h-[28px] [&&]:pt-[0] [&&]:pr-[0] [&&]:pb-[0] [&&]:pl-[0] min-[1024px]:@min-[930px]:[&&]:hidden"
                      }
                      onClick={closeSources}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  </header>
                  <div
                    className={`
      studio-panel-body [&&]:relative [&&]:pt-[0] [&&]:pr-[var(--workspace-panel-padding)]
      [&&]:pb-[var(--workspace-panel-padding)] [&&]:pl-[var(--workspace-panel-padding)] [.studio-sources_&&]:pt-[12px]
      [.studio-sources_&&]:[flex:1] [.studio-sources_&&]:min-h-[0] [.studio-sources_&&]:overflow-y-auto
      [.studio-sources_&&]:overscroll-contain [.studio-sources_&&]:pb-[max(24px,_env(safe-area-inset-bottom))]
      [.studio-sources_&&_>_*_+_*]:mt-[16px] [.studio-sources_&&_>_*_+_*]:pt-[16px]
      [.studio-sources_&&_>_*_+_*]:[border-top:1px_solid_var(--border)] [.studio-properties_&&]:overflow-y-auto
      [.studio-properties_&&]:min-h-[0] [.studio-properties_&&]:[flex:1]
      [.studio-properties_&&]:overscroll-contain [&&:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&:focus-visible]:[outline-offset:-2px] [&&:focus-visible]:rounded-[8px]
      [.studio-properties_>_&&]:pt-[var(--workspace-panel-padding)]
    `}
                    tabIndex={0}
                    role="region"
                    aria-label="Sources controls"
                  >
                    {sources}
                  </div>
                </dialog>
                <section
                  className={`
      studio-stage studio-panel [&&]:min-h-0 [&&]:overflow-hidden [&&]:flex [&&]:flex-col min-[768px]:[&&]:h-[var(--studio-short-stage)]
      min-[1024px]:@min-[930px]:[&&]:h-[var(--studio-panel-height)] [&&]:min-w-[0] [&&]:[border:1px_solid_var(--border)]
      [&&]:rounded-[var(--ui-radius-frame)] [&&]:[background:var(--card)] [&&]:text-[color:var(--card-foreground)]
    `}
                  aria-label="Preview Stage"
                >
                  <div
                    className={`
      studio-toolbar [&&]:relative [&&]:h-[var(--workspace-toolbar-height)] [&&]:shrink-0 [&&]:pt-[0]
      [&&]:pr-[var(--ui-space-2)] [&&]:pb-[0] [&&]:pl-[var(--ui-space-2)] [&&]:flex [&&]:items-center
      [&&]:gap-[var(--ui-space-2)] [&&_button]:min-h-[var(--workspace-control-height)]
      [&&_button]:h-[var(--workspace-control-height)] [&&_button]:pt-[4px] [&&_button]:pr-[10px] [&&_button]:pb-[4px]
      [&&_button]:pl-[10px] [&&_button]:rounded-[var(--ui-radius-control)] [&&_button]:text-[length:var(--ui-text-control)]
      [&&_svg]:w-[16px] [&&_svg]:h-[16px] [&&_button:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&_button:focus-visible]:[outline-offset:2px] [&&_[data-slot='button']]:[background:var(--field)]
      [&&_[data-slot='button']]:text-[color:var(--foreground)] [&&_[data-slot='button']]:[border-color:var(--border)]
      [&&_[data-slot='button']]:[box-shadow:none] container-max-359:[&&]:gap-[4px]
    `}
                    role="group"
                    aria-label="Studio toolbar"
                  >
                    <Button
                      ref={trigger}
                      type="button"
                      variant="outline"
                      aria-label="Open Sources"
                      aria-controls="studio-sources"
                      aria-haspopup="dialog"
                      className={`
      studio-sources-trigger max-599:[&&_span]:hidden max-599:[.studio-toolbar_&&]:w-[32px]
      max-599:[.studio-toolbar_&&]:pt-[0] max-599:[.studio-toolbar_&&]:pr-[0] max-599:[.studio-toolbar_&&]:pb-[0]
      max-599:[.studio-toolbar_&&]:pl-[0] min-[1024px]:@min-[930px]:[&&]:hidden
    `}
                      onClick={openSources}
                    >
                      <FolderOpen className="size-4" aria-hidden="true" />
                      <span>Sources</span>
                    </Button>
                    <StudioModeBadge />
                    {toolbar}
                    <div
                      ref={setToolbarTarget}
                      className={
                        "studio-toolbar-actions [&&]:flex [&&]:items-center [&&]:gap-[4px] [&&]:shrink-0 [&&:empty]:hidden"
                      }
                    />
                  </div>
                  <div
                    className={`
      studio-stage-body [&&]:min-h-0 [&&]:flex-1 max-767:[&&]:overflow-hidden max-767:[&&]:gap-2 max-767:[&&_>_*_+_*]:mt-0 [&&]:pt-[var(--workspace-inset)] [&&]:pr-[var(--workspace-inset)] [&&]:pb-[var(--workspace-inset)]
      [&&]:pl-[var(--workspace-inset)] [&&]:min-w-[0] [&&]:flex [&&]:flex-col [&&_>_[aria-label='Creation_preview']]:[flex:1]
      [&&_>_[aria-label='Creation_preview']]:min-h-[0] [&&_>_[aria-label='Creation_preview']]:flex
      [&&_>_[aria-label='Creation_preview']]:flex-col [&&_>_*_+_*]:mt-[12px] [&&_>_[role='status']:empty]:hidden
      min-[768px]:[&&]:overflow-y-auto min-[768px]:[&&]:min-h-[0] min-[768px]:[&&]:[flex:1]
      min-[768px]:[&&]:overscroll-contain [&&:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&:focus-visible]:[outline-offset:-2px] [&&:focus-visible]:rounded-[8px]
    `}
                    tabIndex={0}
                    role="region"
                    aria-label="Preview content"
                  >
                    {selected ? (
                      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Clear Preview"
                          className="absolute top-2 right-2 z-10 size-8 rounded-full border border-border/60 bg-background/75 p-2 text-foreground shadow-sm backdrop-blur-sm hover:bg-background/90 [@media(pointer:coarse)]:size-11"
                          onClick={() => setSelectedId(null)}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                        <StudioMediaView media={selected} />
                      </div>
                    ) : (
                      stage
                    )}
                  </div>
                </section>
                <aside
                  className={`
      studio-properties studio-panel [&&]:min-h-0 [&&]:overflow-hidden [&&]:flex [&&]:flex-col
      min-[768px]:[&&]:h-[calc(var(--studio-panel-height)_-_var(--studio-short-stage)_-_32px)] min-[768px]:[&&]:min-h-[160px]
      min-[1024px]:@min-[930px]:[&&]:h-[var(--studio-panel-height)] [&&]:min-w-[0] [&&]:[border:1px_solid_var(--border)]
      [&&]:rounded-[var(--ui-radius-frame)] [&&]:[background:var(--card)] [&&]:text-[color:var(--card-foreground)]
    `}
                  aria-labelledby="studio-properties-title"
                >
                  <header
                    className={`
      studio-panel-header [&&]:h-[var(--workspace-panel-header-height)] [&&]:shrink-0 [&&]:flex [&&]:items-center
      [&&]:justify-between [&&]:gap-[var(--ui-space-2)] [&&]:pt-[0] [&&]:pr-[var(--workspace-panel-padding)] [&&]:pb-[0]
      [&&]:pl-[var(--workspace-panel-padding)] [&&]:[border-bottom:1px_solid_var(--border)]
      [&&]:text-[length:var(--ui-text-panel)] [&&]:font-[600]
    `}
                  >
                    <h2 id="studio-properties-title">Properties</h2>
                    {workflow && (
                      <Sheet open={workflowOpen} onOpenChange={setWorkflowOpen}>
                        <SheetTrigger
                          render={
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Open Workflow"
                              title={workflowAttention ? "Workflow has unfinished steps" : "Workflow"}
                              data-workflow-attention={workflowAttention}
                              className={`relative size-8 [@media(pointer:coarse)]:size-11 ${workflowAttention ? "bg-primary/10 text-primary ring-2 ring-primary/50 shadow-[0_0_14px_var(--primary)]" : ""}`}
                            />
                          }
                        >
                          {workflowAttention && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg bg-primary/20 motion-safe:animate-[pulse_2.5s_ease-in-out_infinite]" />}
                          <Workflow className="relative size-4" aria-hidden="true" />
                          {workflowAttention && <span className="sr-only">Workflow has unfinished steps</span>}
                        </SheetTrigger>
                        <SheetContent
                          keepMounted
                          className="[&&]:w-screen [&&]:max-w-none md:[&&]:w-[45vw] md:[&&]:min-w-[360px] [&&]:gap-0 [&&]:overflow-hidden [&&]:pb-[env(safe-area-inset-bottom)] [&_[data-slot='sheet-close']]:top-[max(12px,env(safe-area-inset-top))] [@media(pointer:coarse)]:[&_[data-slot='sheet-close']]:size-11"
                        >
                          <SheetHeader className="shrink-0 border-b border-border pt-[max(16px,env(safe-area-inset-top))] pr-16">
                            <SheetTitle>Workflow</SheetTitle>
                          </SheetHeader>
                          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
                            <StudioPanelTarget panel="workflow" />
                          </div>
                        </SheetContent>
                        {workflow}
                      </Sheet>
                    )}
                  </header>
                  <div
                    className={`
      studio-panel-body [&&]:relative [&&]:pt-[0] [&&]:pr-[var(--workspace-panel-padding)]
      [&&]:pb-[var(--workspace-panel-padding)] [&&]:pl-[var(--workspace-panel-padding)] [.studio-sources_&&]:pt-[12px]
      [.studio-sources_&&]:[flex:1] [.studio-sources_&&]:min-h-[0] [.studio-sources_&&]:overflow-y-auto
      [.studio-sources_&&]:overscroll-contain [.studio-sources_&&]:pb-[max(24px,_env(safe-area-inset-bottom))]
      [.studio-sources_&&_>_*_+_*]:mt-[16px] [.studio-sources_&&_>_*_+_*]:pt-[16px]
      [.studio-sources_&&_>_*_+_*]:[border-top:1px_solid_var(--border)] [.studio-properties_&&]:overflow-y-auto
      [.studio-properties_&&]:min-h-[0] [.studio-properties_&&]:[flex:1]
      [.studio-properties_&&]:overscroll-contain [&&:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&:focus-visible]:[outline-offset:-2px] [&&:focus-visible]:rounded-[8px]
      [.studio-properties_>_&&]:pt-[var(--workspace-panel-padding)]
    `}
                    tabIndex={0}
                    role="region"
                    aria-label="Properties controls"
                  >
                    {properties}
                    <div
                      ref={setPropertiesTarget}
                      className={`
      studio-caption-properties [&&:empty]:hidden [&&:not(:empty)]:pt-[16px] [&&:not(:empty)]:pb-[16px]
      [&&:not(:empty)]:[border-top:1px_solid_var(--border)] [&&_select]:min-h-[32px] [&&_select]:text-[length:12px]
      [&&_[data-slot='button']]:min-h-[var(--workspace-control-height)] [&&_[data-slot='button']]:h-[auto]
      [&&_[data-slot='button']]:pt-[6px] [&&_[data-slot='button']]:pr-[8px] [&&_[data-slot='button']]:pb-[6px]
      [&&_[data-slot='button']]:pl-[8px] [&&_[data-slot='button']]:text-[length:var(--ui-text-control)]
    `}
                    />
                  </div>
                </aside>
              </div>
            </div>
            <Dialog
              open={!!mobileImage}
              onOpenChange={(open) => {
                if (!open) setMobileImageId(null);
              }}
            >
              <DialogContent
                showCloseButton={false}
                className="[&&]:inset-0 [&&]:flex [&&]:h-dvh [&&]:w-screen [&&]:max-h-none [&&]:max-w-none [&&]:translate-x-0 [&&]:translate-y-0 [&&]:flex-col [&&]:gap-0 [&&]:rounded-none [&&]:p-3 [&&]:pt-[max(12px,env(safe-area-inset-top))] [&&]:pb-[max(12px,env(safe-area-inset-bottom))]"
              >
                <DialogTitle className="sr-only">
                  {mobileImage?.label ?? "Image preview"}
                </DialogTitle>
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                  <DialogClose
                    render={
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Close image preview"
                        className="absolute top-2 right-2 z-10 size-11 rounded-full border border-border/60 bg-background/75 p-2 text-foreground shadow-sm backdrop-blur-sm hover:bg-background/90"
                      />
                    }
                  >
                    <X className="size-5" aria-hidden="true" />
                  </DialogClose>
                  {mobileImage && <StudioMediaView media={mobileImage} />}
                </div>
              </DialogContent>
            </Dialog>
          </StudioToolbarTarget.Provider>
        </StudioPropertiesTarget.Provider>
      </DialogPortalContainer.Provider>
    </StudioPanelsContext.Provider>
  );
}
