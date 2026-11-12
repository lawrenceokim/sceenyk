import { ProjectsSessionCache } from "@/lib/projects/session-cache";
import { galleryReplySchema, type MarketplaceCard } from "./gallery-contract";
import type { CategoryId } from "@/lib/projects/options";

export type MarketplaceFilter = { query: string; category: CategoryId | null; page: number };
export type MarketplaceSnapshot = { items: MarketplaceCard[]; total: number; pages: number; hasMore: boolean };
type Entry = { snapshot: MarketplaceSnapshot; checkedAt: number; scrollTop?: number };
export const marketplaceFilterKey = (filter: MarketplaceFilter) => JSON.stringify(filter);

// Reuse Projects' bounded Blob cache, expiry/renewal protocol, stale-response
// fences and Clerk listener, with an independent Marketplace instance.
export class MarketplaceSessionCache extends ProjectsSessionCache {
  private galleryScope: string | null = null;
  private generation = 0;
  private mutationVersion = 0;
  private feeds = new Map<string, Entry>();
  private galleryPending = new Map<string, Promise<void>>();
  private galleryRequests = new Set<AbortController>();
  private failures = new Map<string, { attempts: number; retryAt: number }>();
  private galleryListeners = new Set<() => void>();
  readonly subscribeGallery = (listener: () => void) => { this.galleryListeners.add(listener); return () => { this.galleryListeners.delete(listener); }; };
  private notifyGallery() { this.galleryListeners.forEach(listener => listener()); }
  override setScope(scope: string | null) {
    if (scope === this.galleryScope) return;
    this.galleryScope = scope; this.generation++;
    this.galleryRequests.forEach(request => request.abort()); this.galleryRequests.clear();
    this.galleryPending.clear(); this.feeds.clear(); this.failures.clear();
    super.setScope(scope); this.notifyGallery();
  }
  readFeed(scope: string | null, filter: MarketplaceFilter) {
    return scope && scope === this.galleryScope ? this.feeds.get(marketplaceFilterKey(filter))?.snapshot : undefined;
  }
  feedScroll(scope: string, filter: MarketplaceFilter, top?: number) {
    if (scope !== this.galleryScope) return;
    const entry = this.feeds.get(marketplaceFilterKey(filter));
    if (entry && top !== undefined) entry.scrollTop = top;
    return entry?.scrollTop;
  }
  retryFeed(scope: string, filter: MarketplaceFilter) { if (scope === this.galleryScope) this.failures.delete(marketplaceFilterKey(filter)); }
  removeListing(scope: string, id: string) {
    if (scope !== this.galleryScope) return;
    this.mutationVersion++;
    for (const entry of this.feeds.values()) {
      const present = entry.snapshot.items.some(item => item.id === id);
      if (present) entry.snapshot = { ...entry.snapshot, items: entry.snapshot.items.filter(item => item.id !== id), total: Math.max(0, entry.snapshot.total - 1) };
      entry.checkedAt = 0;
    }
    this.expireMedia(`video:marketplace:${id}`); this.expireMedia(`thumbnail:marketplace:${id}`); this.notifyGallery();
  }
  override invalidateAll(scope: string) {
    if (scope !== this.galleryScope) return;
    this.mutationVersion++;
    for (const entry of this.feeds.values()) entry.checkedAt = 0;
  }
  override async refreshCached(scope: string) {
    if (scope !== this.galleryScope) return;
    await Promise.allSettled([...this.feeds.keys()].map(async key => {
      await this.galleryPending.get(key)?.catch(() => {});
      if (scope === this.galleryScope) await this.refreshFeed(scope, JSON.parse(key) as MarketplaceFilter);
    }));
  }
  async refreshFeed(scope: string, filter: MarketplaceFilter, more = false) {
    if (scope !== this.galleryScope) return;
    const key = marketplaceFilterKey(filter);
    if (this.galleryPending.has(key)) return this.galleryPending.get(key);
    const previous = this.feeds.get(key), failure = this.failures.get(key);
    if (failure && Date.now() < failure.retryAt) throw new Error("MARKETPLACE_RETRY_LATER");
    if (more && !previous?.snapshot.hasMore) return;
    if (!more && previous && Date.now() - previous.checkedAt < 15_000) return;
    const generation = this.generation, mutation = this.mutationVersion, controller = new AbortController();
    this.galleryRequests.add(controller);
    const request = Promise.resolve().then(async () => {
      const oldCards = new Map(previous?.snapshot.items.map(item => [item.id, item]) ?? []);
      const items: MarketplaceCard[] = more ? [...previous!.snapshot.items] : [];
      const count = more ? 1 : previous?.snapshot.pages ?? 1;
      const start = more ? filter.page + previous!.snapshot.pages : filter.page;
      let total = previous?.snapshot.total ?? 0;
      // One request for the usual loaded window; larger histories are bounded
      // into batches without imposing a new limit on infinite scrolling.
      for (let offset = 0; offset < count; offset += 20) {
        const pages = Math.min(20, count - offset);
        const knownItems = more ? [] : previous?.snapshot.items.slice(offset * 12, (offset + pages) * 12) ?? [];
        const response = await fetch("/api/marketplace/gallery", {
          method: "POST", credentials: "same-origin", cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...filter, page: start + offset, pages, known: Object.fromEntries(knownItems.map(item => [item.id, item.revision])) }),
        });
        if (!response.ok) throw new Error("MARKETPLACE_UNAVAILABLE");
        const reply = galleryReplySchema.parse(await response.json());
        if (generation !== this.generation || mutation !== this.mutationVersion) return;
        if (reply.page !== start + offset || reply.pages !== pages) throw new Error("MARKETPLACE_INVALID_PAGE");
        total = reply.total;
        for (const id of reply.ids) {
          const old = oldCards.get(id), next = reply.changed[id] ?? old;
          if (!next || next.id !== id) throw new Error("MARKETPLACE_INCOMPLETE");
          if (old && old.videoVersion !== next.videoVersion) this.expireMedia(`video:marketplace:${id}`);
          if (old && old.posterVersion !== next.posterVersion) this.expireMedia(`thumbnail:marketplace:${id}`);
          items.push(old?.revision === next.revision ? old : next);
        }
      }
      if (generation !== this.generation || mutation !== this.mutationVersion) return;
      const unique = [...new Map(items.map(item => [item.id, item])).values()];
      if (!more) for (const old of oldCards.values()) if (!unique.some(item => item.id === old.id)) {
        this.expireMedia(`video:marketplace:${old.id}`); this.expireMedia(`thumbnail:marketplace:${old.id}`);
      }
      const pages = more ? previous!.snapshot.pages + 1 : count;
      const snapshot = { items: unique, total, pages, hasMore: unique.length > 0 && (filter.page + pages - 1) * 12 < total };
      const unchanged = previous && previous.snapshot.total === total && previous.snapshot.pages === pages &&
        previous.snapshot.hasMore === snapshot.hasMore && unique.length === previous.snapshot.items.length && unique.every((item, index) => item === previous.snapshot.items[index]);
      this.feeds.delete(key);
      this.feeds.set(key, { snapshot: unchanged ? previous.snapshot : snapshot, checkedAt: Date.now(), scrollTop: previous?.scrollTop });
      while (this.feeds.size > 8) this.feeds.delete(this.feeds.keys().next().value!);
      this.failures.delete(key);
      if (!unchanged) this.notifyGallery();
    }).catch(error => {
      if (generation !== this.generation || mutation !== this.mutationVersion) return;
      const attempts = (failure?.attempts ?? 0) + 1;
      this.failures.set(key, { attempts, retryAt: Date.now() + Math.min(120_000, 15_000 * 2 ** Math.min(attempts - 1, 3)) });
      while (this.failures.size > 8) this.failures.delete(this.failures.keys().next().value!);
      throw error;
    }).finally(() => {
      this.galleryRequests.delete(controller);
      if (this.galleryPending.get(key) === request) this.galleryPending.delete(key);
    });
    this.galleryPending.set(key, request);
    return request;
  }
}
export const marketplaceSessionCache = new MarketplaceSessionCache();
