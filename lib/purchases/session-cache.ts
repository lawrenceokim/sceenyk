import { ProjectsSessionCache } from "@/lib/projects/session-cache";
import { purchaseGalleryReply, type PurchaseGalleryCard } from "./gallery-contract";

export type PurchasesSnapshot = { items: PurchaseGalleryCard[]; total: number; page: number; pageSize: 12 };
type Entry = { snapshot: PurchasesSnapshot; checkedAt: number; scrollTop?: number };
export class PurchasesSessionCache extends ProjectsSessionCache {
  private accountScope: string | null = null;
  private generation = 0;
  private mutationVersion = 0;
  private galleries = new Map<number, Entry>();
  private galleryRequests = new Map<number, { controller: AbortController; promise: Promise<void> }>();
  private failures = new Map<number, { attempts: number; retryAt: number }>();
  private galleryListeners = new Set<() => void>();
  readonly subscribeGallery = (listener: () => void) => { this.galleryListeners.add(listener); return () => { this.galleryListeners.delete(listener); }; };
  private notifyGallery() { this.galleryListeners.forEach(listener => listener()); }
  override setScope(scope: string | null) {
    if (scope === this.accountScope) return;
    this.accountScope = scope; this.generation++;
    this.galleryRequests.forEach(request => request.controller.abort()); this.galleryRequests.clear();
    this.galleries.clear(); this.failures.clear();
    super.setScope(scope); this.notifyGallery();
  }
  readGallery(scope: string | null, page: number) { return scope && scope === this.accountScope ? this.galleries.get(page)?.snapshot : undefined; }
  galleryScroll(scope: string, page: number, top?: number) {
    if (scope !== this.accountScope) return;
    const entry = this.galleries.get(page);
    if (entry && top !== undefined) entry.scrollTop = top;
    return entry?.scrollTop;
  }
  retryGallery(scope: string, page: number) { if (scope === this.accountScope) this.failures.delete(page); }
  override invalidateAll(scope: string) {
    if (scope !== this.accountScope) return;
    this.mutationVersion++;
    for (const entry of this.galleries.values()) entry.checkedAt = 0;
  }
  override async refreshCached(scope: string, viewer: string) {
    if (scope !== this.accountScope) return;
    await Promise.allSettled([...this.galleries.keys()].map(async page => {
      await this.galleryRequests.get(page)?.promise.catch(() => {});
      if (scope === this.accountScope) await this.refreshGallery(scope, viewer, page);
    }));
  }
  async refreshGallery(scope: string, viewer: string, page: number) {
    if (scope !== this.accountScope) return;
    if (this.galleryRequests.has(page)) return this.galleryRequests.get(page)!.promise;
    const previous = this.galleries.get(page), failure = this.failures.get(page);
    if (failure && Date.now() < failure.retryAt) throw new Error("PURCHASES_RETRY_LATER");
    if (previous && Date.now() - previous.checkedAt < 15_000) return;
    const generation = this.generation, mutation = this.mutationVersion, controller = new AbortController();
    const promise = Promise.resolve().then(async () => {
      const response = await fetch("/api/purchases/gallery", {
        method: "POST", cache: "no-store", credentials: "same-origin",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, known: Object.fromEntries(previous?.snapshot.items.map(item => [item.id, item.revision]) ?? []) }),
      });
      if (!response.ok) throw new Error("PURCHASES_UNAVAILABLE");
      const reply = purchaseGalleryReply.parse(await response.json());
      if (generation !== this.generation || mutation !== this.mutationVersion) return;
      if (reply.clerkUserId !== viewer) { this.setScope(null); throw new Error("PURCHASES_ACCOUNT_CHANGED"); }
      if (reply.page !== page) throw new Error("PURCHASES_INVALID_PAGE");
      const previousCards = new Map(previous?.snapshot.items.map(item => [item.id, item]) ?? []);
      const items = reply.ids.map(id => {
        const old = previousCards.get(id), next = reply.changed[id] ?? old;
        if (!next || next.id !== id) throw new Error("PURCHASES_INCOMPLETE");
        if (old && old.videoVersion !== next.videoVersion) this.expireMedia(`video:purchases:${id}`);
        if (old && old.posterVersion !== next.posterVersion) this.expireMedia(`thumbnail:purchases:${id}`);
        return old?.revision === next.revision ? old : next;
      });
      for (const id of previousCards.keys()) if (!reply.ids.includes(id)) {
        this.expireMedia(`video:purchases:${id}`); this.expireMedia(`thumbnail:purchases:${id}`);
      }
      const unchanged = previous && previous.snapshot.total === reply.total && items.length === previous.snapshot.items.length && items.every((item, index) => item === previous.snapshot.items[index]);
      this.galleries.delete(page);
      this.galleries.set(page, { snapshot: unchanged ? previous.snapshot : { items, total: reply.total, page, pageSize: 12 }, checkedAt: Date.now(), scrollTop: previous?.scrollTop });
      while (this.galleries.size > 8) this.galleries.delete(this.galleries.keys().next().value!);
      this.failures.delete(page);
      if (!unchanged) this.notifyGallery();
    }).catch(error => {
      if (error instanceof Error && error.message === "PURCHASES_ACCOUNT_CHANGED") throw error;
      if (generation !== this.generation || mutation !== this.mutationVersion) return;
      const attempts = (failure?.attempts ?? 0) + 1;
      this.failures.set(page, { attempts, retryAt: Date.now() + Math.min(120_000, 15_000 * 2 ** Math.min(attempts - 1, 3)) });
      while (this.failures.size > 8) this.failures.delete(this.failures.keys().next().value!);
      throw error;
    }).finally(() => { if (this.galleryRequests.get(page)?.promise === promise) this.galleryRequests.delete(page); });
    this.galleryRequests.set(page, { controller, promise });
    return promise;
  }
}
export const purchasesSessionCache = new PurchasesSessionCache();
