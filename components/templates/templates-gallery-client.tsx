"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { AppNotification } from "@/components/notifications/app-notification";
import { GallerySkeleton } from "@/components/marketplace/gallery-skeletons";
import { listingScrollRoot } from "@/components/marketplace/infinite-listings";
import { Button } from "@/components/ui/button";
import { templatesSessionCache } from "@/lib/templates/session-cache";
import { TemplateLibrary } from "./template-library";

const noSnapshot = () => undefined;
export function TemplatesGalleryClient({ cachedOnly = false }: { cachedOnly?: boolean }) {
  return useAuthAvailable() ? <AccountTemplatesGallery cachedOnly={cachedOnly} /> : <AppNotification>Sign in is temporarily unavailable.</AppNotification>;
}
function AccountTemplatesGallery({ cachedOnly }: { cachedOnly: boolean }) {
  const { isLoaded, userId, sessionId } = useAuth(), clerk = useClerk(), params = useSearchParams();
  const value = params.get("page"), page = value && /^\d{1,6}$/.test(value) ? Math.max(1, Math.min(100000, Number(value))) : 1;
  const scope = isLoaded && userId && sessionId ? `${userId}/${sessionId}` : null;
  const snapshot = useSyncExternalStore(templatesSessionCache.subscribeGallery, () => templatesSessionCache.readGallery(scope, page), noSnapshot);
  const [failed, setFailed] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const identity = `${scope}:${page}`, marker = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isLoaded) return;
    templatesSessionCache.setScope(scope);
    // This listener persists while Activity has hidden/evicted the gallery.
    templatesSessionCache.watchIdentity(clerk, change => clerk.addListener(({ user, session }) => {
      if (clerk.loaded) change(user?.id && session?.id ? `${user.id}/${session.id}` : null);
    }));
  }, [isLoaded, scope, clerk]);
  useEffect(() => {
    if (!scope || !userId || cachedOnly) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const reload = async () => {
      if (!active || document.visibilityState !== "visible" || !navigator.onLine) return;
      try { await templatesSessionCache.refreshGallery(scope, userId, page); if (active) setFailed(null); }
      catch { if (active) setFailed(identity); }
    };
    const poll = async () => { await reload(); if (active) timer = setTimeout(() => { void poll(); }, 60_000); };
    void poll();
    const activate = () => { void reload(); };
    window.addEventListener("focus", activate); window.addEventListener("pageshow", activate); window.addEventListener("online", activate);
    document.addEventListener("visibilitychange", activate);
    return () => {
      active = false; clearTimeout(timer);
      window.removeEventListener("focus", activate); window.removeEventListener("pageshow", activate); window.removeEventListener("online", activate);
      document.removeEventListener("visibilitychange", activate);
    };
  }, [scope, userId, page, cachedOnly, identity, retry]);
  const hasSnapshot = !!snapshot;
  useLayoutEffect(() => {
    if (!scope || !hasSnapshot || !marker.current || cachedOnly) return;
    const target = listingScrollRoot(marker.current) ?? document.scrollingElement;
    if (!target) return;
    const saved = templatesSessionCache.galleryScroll(scope, page);
    const frame = requestAnimationFrame(() => { if (saved !== undefined) target.scrollTop = saved; });
    const save = () => { templatesSessionCache.galleryScroll(scope, page, target.scrollTop); };
    const events = target === document.scrollingElement ? window : target;
    events.addEventListener("scroll", save, { passive: true });
    return () => { cancelAnimationFrame(frame); events.removeEventListener("scroll", save); };
  }, [scope, page, hasSnapshot, cachedOnly]);
  const previewSource = useMemo(() => ({ cache: templatesSessionCache, scope, namespace: "templates", endpoint: "/api/templates/preview" }), [scope]);
  const deleted = useCallback((id: string) => { if (scope) templatesSessionCache.removeTemplate(scope, id); }, [scope]);
  const retryRead = () => { if (scope) templatesSessionCache.retryGallery(scope, page); setRetry(value => value + 1); };
  if (isLoaded && !userId) return <AccountAction intent="sign-in">Sign in to manage listings</AccountAction>;
  if (!scope || !snapshot) return failed === identity && !cachedOnly
    ? <div className="space-y-3"><AppNotification role="alert">Your templates couldn’t be loaded.</AppNotification><Button variant="outline" onClick={retryRead}>Try again</Button></div>
    : <GallerySkeleton variant="library" />;
  return <>
    {failed === identity && <AppNotification role="status">Templates couldn’t be refreshed. Showing your saved cards.</AppNotification>}
    <TemplateLibrary result={snapshot} previews={Object.fromEntries(snapshot.items.map(item => [item.id, item]))} previewSource={previewSource} onDeleted={deleted} galleryRef={marker} />
  </>;
}
