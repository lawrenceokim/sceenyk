"use client";
import { marketplaceGridClassName } from "@/components/marketplace/gallery-skeletons";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { GalleryCardSkeleton } from "./gallery-skeletons";
import { marketplaceSessionCache, type MarketplaceFilter, type MarketplaceSnapshot } from "@/lib/marketplace/session-cache";
import { ListingCard } from "./listing-card";
import { listingScrollRoot } from "./infinite-listings";
import { AppNotification } from "@/components/notifications/app-notification";

const CachedListingCard = memo(ListingCard);

export function MarketplaceInfiniteGallery({ snapshot, scope, filter }: { snapshot: MarketplaceSnapshot; scope: string | null; filter: MarketplaceFilter }) {
  const { items, hasMore } = snapshot;
  const { query, category, page } = filter;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!scope || inFlight.current || !hasMore || error || document.visibilityState !== "visible") return;
    inFlight.current = true;
    setLoading(true);
    try {
      await marketplaceSessionCache.refreshFeed(scope, { query, category, page }, true);
    } catch {
      if (active.current) setError(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [scope, category, query, page, hasMore, error]);

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore || error || loading || typeof IntersectionObserver === "undefined") return;
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      const root = listingScrollRoot(target);
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadMore();
      }, { root, rootMargin: "0px 0px 320px 0px" });
      observer.observe(target);
    };
    observe();
    window.addEventListener("resize", observe);
    return () => { observer.disconnect(); window.removeEventListener("resize", observe); };
  }, [hasMore, error, loading, loadMore]);

  return <>
    <div className={marketplaceGridClassName} aria-busy={loading}>{items.map(listing => <CachedListingCard key={listing.id} listing={listing} videoVersion={listing.videoVersion} />)}{loading && [0, 1, 2].map(index => <GalleryCardSkeleton key={"loading-" + index} />)}</div>
    <div ref={sentinel} className={`
      marketplace-load-status [&&]:flex [&&]:min-h-[44px] [&&]:items-center [&&]:justify-center [&&]:gap-[8px] [&&]:mt-[12px]
      [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:12px]
    `} role="status" aria-live="polite">
      {loading && <>Loading more looks…</>}
      {error && <AppNotification role="alert">More looks couldn’t be loaded. <button type="button" onClick={() => { if (scope) marketplaceSessionCache.retryFeed(scope, filter); setError(false); }} className="underline underline-offset-4">Try loading more</button></AppNotification>}
    </div>
  </>;
}
