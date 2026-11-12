"use client";
import { managementGridClassName } from "@/components/marketplace/gallery-skeletons";

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GalleryCardSkeleton } from "./gallery-skeletons";
import { Tooltip } from "@base-ui/react/tooltip";
import { accountSessionCache } from "@/lib/cache/account-cache";
import { useCacheIdentity } from "@/components/cache/cache-provider";
import { fetchAccountResource } from "@/components/cache/use-account-query";
import type { AccountData } from "@/lib/cache/contract";
import type { ListingPage, OwnedListing } from "@/lib/marketplace/contract";
import { appendUniqueListings, listingScrollRoot } from "./infinite-listings";
import { ManageTemplateCard } from "./manage-template-card";
import { AppNotification } from "@/components/notifications/app-notification";


export function OwnedInfiniteGallery({ initial, clerkUserId, cachedOnly = false }: { initial: ListingPage<OwnedListing>; clerkUserId: string; cachedOnly?: boolean }) {
  const { scope } = useCacheIdentity();
  useSyncExternalStore(accountSessionCache.subscribe, accountSessionCache.version, () => 0);
  const [through, setThrough] = useState(() => {
    let page = initial.page;
    while (accountSessionCache.read(scope, `listings:${page + 1}`)) page++;
    return page;
  });
  const items = appendUniqueListings([], Array.from({ length: through - initial.page + 1 }, (_, offset) =>
    accountSessionCache.read<AccountData["listings"]>(scope, `listings:${initial.page + offset}`)?.items ?? (offset === 0 ? initial.items : [])).flat());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const hasMore = through * initial.pageSize < initial.total;
  const nextPage = useRef(through + 1);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!scope || !active.current || controller.current || !hasMore || error || document.visibilityState !== "visible") return;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const page = nextPage.current;
      const result = await accountSessionCache.load(scope, clerkUserId, `listings:${page}`, "listings", signal => fetchAccountResource("listings", page, signal));
      // A Server Action cannot cancel its server read; ignore inactive results.
      if (!active.current || request.signal.aborted) return;
      if (!result || result.clerkUserId !== clerkUserId || result.page !== page) throw new Error("LISTINGS_UNAVAILABLE");
      setThrough(page);
      nextPage.current = page + 1;
    } catch {
      if (!request.signal.aborted) setError(true);
    } finally {
      if (controller.current === request) { controller.current = null; setLoading(false); }
    }
  }, [scope, clerkUserId, error, hasMore, setError, setLoading, setThrough]);

  useEffect(() => {
    if (cachedOnly) return;
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); };
  }, [cachedOnly]);
  useEffect(() => {
    if (!scope || cachedOnly || through === initial.page) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (active && document.visibilityState === "visible" && navigator.onLine) await Promise.allSettled(
        Array.from({ length: through - initial.page }, (_, index) => initial.page + index + 1).map(page =>
          accountSessionCache.load(scope, clerkUserId, `listings:${page}`, "listings", signal => fetchAccountResource("listings", page, signal))),
      );
      if (active) timer = setTimeout(() => { void poll(); }, 60000);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [scope, clerkUserId, through, initial.page, cachedOnly]);
  useEffect(() => {
    const target = sentinel.current;
    if (cachedOnly || !target || !hasMore || loading || error || typeof IntersectionObserver === "undefined") return;
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadMore();
      }, { root: listingScrollRoot(target), rootMargin: "0px 0px 320px 0px" });
      observer.observe(target);
    };
    observe();
    window.addEventListener("resize", observe);
    return () => { observer.disconnect(); window.removeEventListener("resize", observe); };
  }, [hasMore, loading, error, loadMore, cachedOnly]);

  return <Tooltip.Provider>
    <div className={managementGridClassName} aria-busy={loading}>{items.map(listing => <CachedManageTemplateCard key={listing.id} listing={listing} />)}{loading && [0, 1, 2].map(index => <GalleryCardSkeleton key={"loading-" + index} management />)}</div>
    <div ref={sentinel} className={`
      marketplace-load-status [&&]:flex [&&]:min-h-[44px] [&&]:items-center [&&]:justify-center [&&]:gap-[8px] [&&]:mt-[12px]
      [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:12px]
    `} role="status" aria-live="polite">
      {loading && <>Loading more templates…</>}
      {error && <AppNotification role="alert">More templates couldn’t be loaded. <button type="button" onClick={() => { if (scope) accountSessionCache.retry(scope, `listings:${nextPage.current}`); setError(false); }} className="underline underline-offset-4">Try loading more</button></AppNotification>}
    </div>
  </Tooltip.Provider>;
}
const CachedManageTemplateCard = memo(ManageTemplateCard);
