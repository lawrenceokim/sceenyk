"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";
import { loadOwnedListingsAction } from "@/app/actions/owned-listings";
import type { ListingPage, OwnedListing } from "@/lib/marketplace/contract";
import { appendUniqueListings, listingScrollRoot } from "./infinite-listings";
import { ManageTemplateCard } from "./manage-template-card";

export function OwnedInfiniteGallery({ initial, clerkUserId }: { initial: ListingPage<OwnedListing>; clerkUserId: string }) {
  const [items, setItems] = useState(initial.items);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(initial.page * initial.pageSize < initial.total);
  const nextPage = useRef(initial.page + 1);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!active.current || controller.current || !hasMore || error) return;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const page = nextPage.current;
      const result = await loadOwnedListingsAction(page);
      // A Server Action cannot cancel its server read; ignore inactive results.
      if (!active.current || request.signal.aborted) return;
      if (!result.ok || result.clerkUserId !== clerkUserId || result.page.page !== page) throw new Error("LISTINGS_UNAVAILABLE");
      setItems(previous => appendUniqueListings(previous, result.page.items));
      nextPage.current = page + 1;
      setHasMore(result.page.items.length > 0 && page * result.page.pageSize < result.page.total);
    } catch {
      if (!request.signal.aborted) setError(true);
    } finally {
      if (controller.current === request) { controller.current = null; setLoading(false); }
    }
  }, [clerkUserId, error, hasMore]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore || loading || error) return;
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
  }, [hasMore, loading, error, loadMore]);

  return <Tooltip.Provider>
    <div className={`
      manage-template-gallery [&&]:grid [&&]:[grid-template-columns:repeat(auto-fill,_minmax(min(100%,_200px),_1fr))]
      [&&]:items-stretch [&&]:gap-[16px] max-599:[&&]:[grid-template-columns:minmax(0,_1fr)]
    `} aria-busy={loading}>{items.map(listing => <ManageTemplateCard key={listing.id} listing={listing} />)}</div>
    <div ref={sentinel} className={`
      marketplace-load-status [&&]:flex [&&]:min-h-[44px] [&&]:items-center [&&]:justify-center [&&]:gap-[8px] [&&]:mt-[12px]
      [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:12px]
    `} role="status" aria-live="polite">
      {loading && <><LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />Loading more templates…</>}
      {error && <span>More templates couldn’t be loaded. <button type="button" onClick={() => setError(false)} className="underline underline-offset-4">Try loading more</button></span>}
    </div>
  </Tooltip.Provider>;
}
