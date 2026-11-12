"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { AppNotification } from "@/components/notifications/app-notification";
import { listingScrollRoot } from "@/components/marketplace/infinite-listings";
import { purchasesSessionCache } from "@/lib/purchases/session-cache";
import { PurchasesLibrary } from "./purchases-library";
import { PurchasesFailure, PurchasesGridSkeleton } from "./purchases-states";

const noSnapshot = () => undefined;
export function PurchasesGalleryClient({ cachedOnly = false }: { cachedOnly?: boolean }) {
  return useAuthAvailable() ? <AccountPurchasesGallery cachedOnly={cachedOnly} /> : <AppNotification className="text-sm text-muted-foreground">Sign in is temporarily unavailable.</AppNotification>;
}
function AccountPurchasesGallery({ cachedOnly }: { cachedOnly: boolean }) {
  const { isLoaded, userId, sessionId } = useAuth(), clerk = useClerk(), params = useSearchParams();
  const value = params.get("page"), page = value && /^\d{1,6}$/.test(value) ? Math.max(1, Math.min(100000, Number(value))) : 1;
  const scope = isLoaded && userId && sessionId ? `${userId}/${sessionId}` : null;
  const snapshot = useSyncExternalStore(purchasesSessionCache.subscribeGallery, () => purchasesSessionCache.readGallery(scope, page), noSnapshot);
  const [failed, setFailed] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const identity = `${scope}:${page}`, marker = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isLoaded) return;
    purchasesSessionCache.setScope(scope);
    purchasesSessionCache.watchIdentity(clerk, change => clerk.addListener(({ user, session }) => {
      if (clerk.loaded) change(user?.id && session?.id ? `${user.id}/${session.id}` : null);
    }));
  }, [isLoaded, scope, clerk]);
  useEffect(() => {
    if (!scope || !userId || cachedOnly) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const reload = async () => {
      if (!active || document.visibilityState !== "visible" || !navigator.onLine) return;
      try { await purchasesSessionCache.refreshGallery(scope, userId, page); if (active) setFailed(null); }
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
    const saved = purchasesSessionCache.galleryScroll(scope, page);
    const frame = requestAnimationFrame(() => { if (saved !== undefined) target.scrollTop = saved; });
    const save = () => { purchasesSessionCache.galleryScroll(scope, page, target.scrollTop); };
    const events = target === document.scrollingElement ? window : target;
    events.addEventListener("scroll", save, { passive: true });
    return () => { cancelAnimationFrame(frame); events.removeEventListener("scroll", save); };
  }, [scope, page, hasSnapshot, cachedOnly]);
  const previewSource = useMemo(() => ({ cache: purchasesSessionCache, scope, namespace: "purchases", endpoint: "/api/purchases/preview" }), [scope]);
  const retryRead = () => { if (scope) purchasesSessionCache.retryGallery(scope, page); setRetry(value => value + 1); };
  if (isLoaded && !userId) return <AccountAction intent="sign-in">Sign in to view your purchases</AccountAction>;
  if (!scope || !snapshot) return failed === identity && !cachedOnly ? <PurchasesFailure onRetry={retryRead} /> : <PurchasesGridSkeleton />;
  return <>
    {failed === identity && <AppNotification role="status">Purchases couldn’t be refreshed. Showing your saved cards.</AppNotification>}
    <PurchasesLibrary result={snapshot} previews={Object.fromEntries(snapshot.items.map(item => [item.id, item]))} previewSource={previewSource} galleryRef={marker} />
  </>;
}
