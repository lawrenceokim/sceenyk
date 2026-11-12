"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { projectsGalleryAction } from "@/app/actions/projects-gallery";
import { ProjectsRefreshError, projectsSessionCache } from "@/lib/projects/session-cache";
import { ProjectsCacheScope } from "./projects-cache-context";
import { ProjectsGallerySkeleton, ProjectsSection } from "./projects-section";
import { ProjectJobStatusesProvider } from "./project-job-statuses";
import { Button } from "@/components/ui/button";
import { AppNotification } from "@/components/notifications/app-notification";


const noSnapshot = () => undefined;
export function ProjectsGalleryClient({ cachedOnly = false }: { cachedOnly?: boolean }) {
  const { isLoaded, userId, sessionId } = useAuth(), clerk = useClerk(), params = useSearchParams();
  const numeric = Number(params.get("page") ?? 1), page = Number.isInteger(numeric) && numeric > 0 && numeric <= 100_000 ? numeric : 1;
  const scope = isLoaded && userId && sessionId ? `${userId}/${sessionId}` : null;
  const snapshot = useSyncExternalStore(projectsSessionCache.subscribe, () => projectsSessionCache.readPage(scope, page), noSnapshot);
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const marker = useRef<HTMLDivElement>(null);
  const hasSnapshot = !!snapshot;
  useEffect(() => {
    if (!isLoaded) return;
    projectsSessionCache.setScope(scope);
    // This listener outlives Activity's effect cleanup so sign-out also purges
    // private caches when Projects is hidden or has been evicted from the DOM.
    projectsSessionCache.watchIdentity(clerk, change => clerk.addListener(({ user, session }) => {
      if (clerk.loaded) change(user?.id && session?.id ? `${user.id}/${session.id}` : null);
    }));
  }, [isLoaded, scope, clerk]);
  useEffect(() => {
    if (!scope || !userId || cachedOnly) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const reload = async (force = false) => {
      if (!active || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        await projectsSessionCache.refresh(scope, userId, page, known => projectsGalleryAction({ page, known }), force);
        if (active) setFailed(false);
      } catch (error) {
        if (active) setFailed(!(error instanceof ProjectsRefreshError && error.retryable && error.attempts < 3 && projectsSessionCache.readPage(scope, page)));
      }
    };
    const interval = () => {
      const cards = projectsSessionCache.readPage(scope, page)?.cards;
      const processing = Object.values(cards ?? {}).some(card => card.active || card.status === "queued" || card.status === "processing");
      return processing ? 15_000 : 60_000;
    };
    const poll = async () => {
      await reload();
      if (active) timer = setTimeout(() => { void poll(); }, interval());
    };
    // One compact revision check on return; current cards stay mounted.
    void reload().then(() => { if (active) timer = setTimeout(() => { void poll(); }, interval()); });
    const activate = () => { void reload(); };
    const changed = () => { void reload(); };
    window.addEventListener("focus", activate);
    window.addEventListener("pageshow", activate);
    window.addEventListener("online", activate);
    window.addEventListener("sceenyk:projects", changed);
    document.addEventListener("visibilitychange", activate);
    return () => {
      active = false; clearTimeout(timer);
      window.removeEventListener("focus", activate); window.removeEventListener("pageshow", activate);
      window.removeEventListener("online", activate);
      window.removeEventListener("sceenyk:projects", changed); document.removeEventListener("visibilitychange", activate);
    };
  }, [scope, userId, page, cachedOnly, retry]);
  useLayoutEffect(() => {
    if (!scope || !hasSnapshot || !marker.current || cachedOnly) return;
    let scroller: HTMLElement | null = marker.current.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const target = scroller ?? document.scrollingElement as HTMLElement | null;
    if (!target) return;
    const saved = projectsSessionCache.scroll(scope, page);
    const frame = requestAnimationFrame(() => { if (saved !== undefined) target.scrollTop = saved; });
    const save = () => { projectsSessionCache.scroll(scope, page, target.scrollTop); };
    const events = target === document.scrollingElement ? window : target;
    events.addEventListener("scroll", save, { passive: true });
    return () => { cancelAnimationFrame(frame); events.removeEventListener("scroll", save); };
    // Restore once at admission, not after every background card update.
  }, [scope, page, cachedOnly, hasSnapshot]);
  if (!scope) return <ProjectsGallerySkeleton />;
  if (!snapshot) return failed && !cachedOnly ? <div  className="space-y-3 text-muted-foreground">
    <AppNotification role="alert">Your projects couldn’t be loaded.</AppNotification><Button variant="outline" onClick={() => { projectsSessionCache.retryPage(scope, page); setRetry(n => n + 1); }}>Try again</Button>
  </div> : <ProjectsGallerySkeleton />;
  const statuses = Object.fromEntries(Object.entries(snapshot.cards).map(([id, card]) => [id, card.status]));
  return <ProjectsCacheScope.Provider value={scope}><div ref={marker}>
    {failed && <AppNotification role="status" className="mb-3 text-caption text-muted-foreground">Projects couldn’t be refreshed. Showing your saved cards.</AppNotification>}
    <ProjectJobStatusesProvider initial={statuses}>
      <ProjectsSection data={snapshot.data} jobStatuses={statuses}
        previews={Object.fromEntries(Object.entries(snapshot.cards).map(([id, card]) => [id, card.preview]))}
        templateIds={Object.fromEntries(Object.entries(snapshot.cards).flatMap(([id, card]) => card.listingId ? [[id, card.listingId]] : []))} />
    </ProjectJobStatusesProvider>
  </div></ProjectsCacheScope.Provider>;
}
