"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { listingSchema, type ListingPage } from "@/lib/marketplace/contract";
import type { CategoryId } from "@/lib/projects/options";
import { ListingCard } from "./listing-card";
import { z } from "zod";

const pageSchema = z.object({ items: z.array(listingSchema.extend({ estimate: z.object({ credits: z.number(), test: z.boolean() }).nullable() })), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.literal(12) });

export function MarketplaceInfiniteGallery({ initial, query, category }: { initial: ListingPage; query: string; category: CategoryId | null }) {
  const [items, setItems] = useState(initial.items);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(initial.page * initial.pageSize < initial.total);
  const nextPage = useRef(initial.page + 1);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (inFlight.current || !hasMore || error) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const page = nextPage.current;
      const params = new URLSearchParams({ q: query, page: String(page), ...(category ? { category } : {}) });
      const response = await fetch(`/api/marketplace/listings?${params}`, { signal: request.signal, cache: "no-store" });
      if (!response.ok) throw new Error("LISTINGS_UNAVAILABLE");
      const result = pageSchema.parse(await response.json());
      if (request.signal.aborted) return;
      if (result.page !== page) throw new Error("INVALID_PAGE");
      setItems(previous => {
        const seen = new Set(previous.map(item => item.id));
        return [...previous, ...result.items.filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        })];
      });
      nextPage.current = page + 1;
      setHasMore(result.items.length > 0 && page * result.pageSize < result.total);
    } catch {
      if (!request.signal.aborted) setError(true);
    } finally {
      if (controller.current === request) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, [category, query, hasMore, error]);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore || error || loading) return;
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      const workspace = target.closest(".workspace-content");
      const root = workspace && /auto|scroll/.test(getComputedStyle(workspace).overflowY) ? workspace : null;
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
    <div className="workspace-gallery marketplace-gallery" aria-busy={loading}>{items.map(listing => <ListingCard key={listing.id} listing={listing} />)}</div>
    <div ref={sentinel} className="marketplace-load-status" role="status" aria-live="polite">
      {loading && <><LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />Loading more looks…</>}
      {error && <span>More looks couldn’t be loaded. <button type="button" onClick={() => setError(false)} className="underline underline-offset-4">Try loading more</button></span>}
    </div>
  </>;
}
