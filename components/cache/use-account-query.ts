"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { accountSessionCache } from "@/lib/cache/account-cache";
import { resourceDomain, type AccountData, type AccountResource } from "@/lib/cache/contract";
import { useCacheIdentity } from "./cache-provider";
import { listingScrollRoot } from "@/components/marketplace/infinite-listings";

const noSnapshot = () => undefined;
export async function fetchAccountResource<R extends AccountResource>(resource: R, page: number, signal?: AbortSignal): Promise<{ clerkUserId: string; data: AccountData[R] }> {
  const response = await fetch("/api/account-cache", { method: "POST", cache: "no-store", credentials: "same-origin", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, page }) });
  if (!response.ok) throw new Error("ACCOUNT_UNAVAILABLE");
  return response.json();
}
export function useAccountQuery<R extends AccountResource>(resource: R, page = 1, options: { automatic?: boolean; cachedOnly?: boolean; staleMs?: number; enabled?: boolean } = {}) {
  const { scope, viewer } = useCacheIdentity(), key = `${resource}:${page}`;
  const enabled = options.enabled ?? true;
  const data = useSyncExternalStore(accountSessionCache.subscribe, () => enabled ? accountSessionCache.read<AccountData[R]>(scope, key) : undefined, noSnapshot);
  const error = useSyncExternalStore(accountSessionCache.subscribe, () => accountSessionCache.error(scope, key), noSnapshot);
  const automatic = options.automatic ?? true, cachedOnly = options.cachedOnly ?? false, staleMs = options.staleMs ?? 15000;
  const refresh = useCallback(async (force = false) => {
    if (!scope || !viewer || !enabled) return;
    return accountSessionCache.load(scope, viewer, key, resourceDomain[resource], signal => fetchAccountResource(resource, page, signal), force, staleMs);
  }, [scope, viewer, key, resource, page, staleMs, enabled]);
  useEffect(() => {
    if (!scope || cachedOnly || !enabled) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const reload = async () => {
      if (!active || document.visibilityState !== "visible" || !navigator.onLine) return;
      try { await refresh(); } catch { /* Retain confirmed data; error is observable. */ }
    };
    const poll = async () => { await reload(); if (active) timer = setTimeout(() => { void poll(); }, Math.max(60000, staleMs)); };
    if (automatic) void poll();
    else timer = setTimeout(() => { void poll(); }, 60000);
    const activate = () => { void reload(); };
    window.addEventListener("focus", activate); window.addEventListener("pageshow", activate); window.addEventListener("online", activate);
    document.addEventListener("visibilitychange", activate);
    return () => { active = false; clearTimeout(timer); window.removeEventListener("focus", activate); window.removeEventListener("pageshow", activate); window.removeEventListener("online", activate); document.removeEventListener("visibilitychange", activate); };
  }, [scope, refresh, automatic, cachedOnly, staleMs, enabled]);
  const retry = () => { if (scope) accountSessionCache.retry(scope, key); return refresh(true); };
  return { data, error, refresh, retry, scope, viewer, key, fresh: () => accountSessionCache.fresh(scope, key) };
}

export function useAccountScroll(key: string, ready: boolean, cachedOnly = false) {
  const { scope } = useCacheIdentity(), marker = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!scope || !ready || cachedOnly) return;
    const visible = [...document.querySelectorAll<HTMLElement>(".workspace-settings-content, [data-workspace-page]")].filter(element => element.getClientRects().length > 0);
    const element = marker.current ?? visible.find(element => element.classList.contains("workspace-settings-content")) ?? visible[0];
    const target = element && /auto|scroll/.test(getComputedStyle(element).overflowY) ? element : element ? listingScrollRoot(element) ?? document.scrollingElement : document.scrollingElement;
    if (!target) return;
    const top = accountSessionCache.scroll(scope, key);
    const frame = requestAnimationFrame(() => { if (top !== undefined) target.scrollTop = top; });
    const save = () => { accountSessionCache.scroll(scope, key, target.scrollTop); };
    const events = target === document.scrollingElement ? window : target;
    events.addEventListener("scroll", save, { passive: true });
    return () => { cancelAnimationFrame(frame); events.removeEventListener("scroll", save); };
  }, [scope, key, ready, cachedOnly]);
  return marker;
}
