"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { marketplaceSessionCache, type MarketplaceFilter } from "@/lib/marketplace/session-cache";
import { listingScrollRoot } from "./infinite-listings";
import type { ProjectsSessionCache } from "@/lib/projects/session-cache";

export const MarketplaceCacheScope = createContext<string | null>(null);
const noSnapshot = () => undefined;
function AuthenticatedMarketplaceIdentity({ children }: { children: ReactNode }) {
  const { isLoaded, userId, sessionId } = useAuth(), clerk = useClerk();
  const scope = isLoaded ? userId && sessionId ? `${userId}/${sessionId}` : "public" : null;
  useLayoutEffect(() => { if (isLoaded) marketplaceSessionCache.setScope(scope); }, [isLoaded, scope]);
  useEffect(() => {
    if (!isLoaded) return;
    marketplaceSessionCache.watchIdentity(clerk, change => clerk.addListener(({ user, session }) => {
      if (clerk.loaded) change(user?.id && session?.id ? `${user.id}/${session.id}` : "public");
    }));
  }, [isLoaded, clerk]);
  return <MarketplaceCacheScope.Provider value={scope}>{children}</MarketplaceCacheScope.Provider>;
}
function PublicMarketplaceIdentity({ children }: { children: ReactNode }) {
  useLayoutEffect(() => { marketplaceSessionCache.setScope("public"); }, []);
  return <MarketplaceCacheScope.Provider value="public">{children}</MarketplaceCacheScope.Provider>;
}
export function MarketplaceIdentity({ children }: { children: ReactNode }) {
  const configured = useAuthAvailable();
  return configured ? <AuthenticatedMarketplaceIdentity>{children}</AuthenticatedMarketplaceIdentity> : <PublicMarketplaceIdentity>{children}</PublicMarketplaceIdentity>;
}
export function useMarketplaceGallery(filter: MarketplaceFilter) {
  const scope = useContext(MarketplaceCacheScope);
  const snapshot = useSyncExternalStore(marketplaceSessionCache.subscribeGallery, () => marketplaceSessionCache.readFeed(scope, filter), noSnapshot);
  const [failure, setFailure] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const identity = `${scope}:${JSON.stringify(filter)}`;
  const marker = useRef<HTMLDivElement>(null);
  const { query, category, page } = filter;
  useEffect(() => {
    if (!scope) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const reload = async () => {
      if (!active || document.visibilityState !== "visible" || !navigator.onLine) return;
      try { await marketplaceSessionCache.refreshFeed(scope, { query, category, page }); if (active) setFailure(null); }
      catch { if (active) setFailure(identity); }
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
  }, [scope, query, category, page, retry, identity]);
  const hasSnapshot = !!snapshot;
  useLayoutEffect(() => {
    if (!scope || !hasSnapshot || !marker.current) return;
    const filter = { query, category, page };
    const target = listingScrollRoot(marker.current) ?? document.scrollingElement;
    if (!target) return;
    const saved = marketplaceSessionCache.feedScroll(scope, filter);
    const frame = requestAnimationFrame(() => { if (saved !== undefined) target.scrollTop = saved; });
    const save = () => { marketplaceSessionCache.feedScroll(scope, filter, target.scrollTop); };
    const events = target === document.scrollingElement ? window : target;
    events.addEventListener("scroll", save, { passive: true });
    return () => { cancelAnimationFrame(frame); events.removeEventListener("scroll", save); };
  }, [scope, query, category, page, hasSnapshot]);
  return { snapshot, scope, marker, failed: failure === identity, retry: () => {
    if (scope) marketplaceSessionCache.retryFeed(scope, filter);
    setRetry(value => value + 1);
  } };
}

export type PreviewMediaSource = { cache: ProjectsSessionCache; scope: string | null; namespace: string; endpoint: string };
export function useMarketplacePreview(listingId: string, kind: "video" | "poster" = "video", enabled = true, source?: PreviewMediaSource) {
  const contextScope = useContext(MarketplaceCacheScope);
  const scope = source ? source.scope : contextScope, cache = source?.cache ?? marketplaceSessionCache;
  const endpoint = source?.endpoint ?? "/api/marketplace/video-preview";
  const key = `${kind === "video" ? "video" : "thumbnail"}:${source?.namespace ?? "marketplace"}:${listingId}`;
  const media = useSyncExternalStore(cache.subscribe, () => cache.readMedia(scope, key), noSnapshot);
  const invalidation = useSyncExternalStore(cache.subscribe, () => cache.mediaInvalidation(scope, key), () => 0);
  useEffect(() => {
    if (!scope || !enabled) return;
    let active = true, attempt = 0, timer: ReturnType<typeof setTimeout>;
    const load = async (renew = false) => {
      try {
        const result = await cache.loadMedia(scope, key, endpoint, { listingId, kind }, renew);
        if (active && result?.pending) timer = setTimeout(() => { void load(); }, Math.min(30_000, 2500 * 2 ** Math.min(++attempt, 4)));
      } catch { /* Static poster remains available; retry on activation. */ }
    };
    if (media) timer = setTimeout(() => { void load(true); }, Math.max(1000, media.expiresAt - Date.now() - 30_000));
    else void load();
    return () => { active = false; clearTimeout(timer); };
  }, [scope, key, listingId, kind, enabled, media, invalidation, cache, endpoint]);
  return media;
}
