import { ProjectsSessionCache } from "@/lib/projects/session-cache";
import { templateGalleryReply, type TemplateGalleryCard } from "./gallery-contract";

export type TemplatesSnapshot = { items: TemplateGalleryCard[]; total: number; page: number; pageSize: 12 };
type Entry = { snapshot: TemplatesSnapshot; checkedAt: number; scrollTop?: number };
export class TemplatesSessionCache extends ProjectsSessionCache {
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
  removeTemplate(scope: string, id: string) {
    if (scope !== this.accountScope) return;
    this.mutationVersion++;
    const present = [...this.galleries.values()].some(entry => entry.snapshot.items.some(item => item.id === id));
    for (const entry of this.galleries.values()) {
      entry.checkedAt = 0;
      entry.snapshot = { ...entry.snapshot, total: Math.max(0, entry.snapshot.total - (present ? 1 : 0)), items: entry.snapshot.items.filter(item => item.id !== id) };
    }
    this.expireMedia(`video:templates:${id}`); this.expireMedia(`thumbnail:templates:${id}`); this.notifyGallery();
  }
  async refreshGallery(scope: string, viewer: string, page: number) {
    if (scope !== this.accountScope) return;
    if (this.galleryRequests.has(page)) return this.galleryRequests.get(page)!.promise;
    const previous = this.galleries.get(page), failure = this.failures.get(page);
    if (failure && Date.now() < failure.retryAt) throw new Error("TEMPLATES_RETRY_LATER");
    if (previous && Date.now() - previous.checkedAt < 15_000) return;
    const generation = this.generation, mutation = this.mutationVersion, controller = new AbortController();
    const promise = Promise.resolve().then(async () => {
      const response = await fetch("/api/templates/gallery", {
        method: "POST", cache: "no-store", credentials: "same-origin",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, known: Object.fromEntries(previous?.snapshot.items.map(item => [item.id, item.revision]) ?? []) }),
      });
      if (!response.ok) throw new Error("TEMPLATES_UNAVAILABLE");
      const reply = templateGalleryReply.parse(await response.json());
      if (generation !== this.generation || mutation !== this.mutationVersion) return;
      if (reply.clerkUserId !== viewer) { this.setScope(null); throw new Error("TEMPLATES_ACCOUNT_CHANGED"); }
      if (reply.page !== page) throw new Error("TEMPLATES_INVALID_PAGE");
      const previousCards = new Map(previous?.snapshot.items.map(item => [item.id, item]) ?? []);
      const items = reply.ids.map(id => {
        const old = previousCards.get(id), next = reply.changed[id] ?? old;
        if (!next || next.id !== id) throw new Error("TEMPLATES_INCOMPLETE");
        if (old && old.videoVersion !== next.videoVersion) this.expireMedia(`video:templates:${id}`);
        if (old && old.posterVersion !== next.posterVersion) this.expireMedia(`thumbnail:templates:${id}`);
        return old?.revision === next.revision ? old : next;
      });
      for (const id of previousCards.keys()) if (!reply.ids.includes(id)) {
        this.expireMedia(`video:templates:${id}`); this.expireMedia(`thumbnail:templates:${id}`);
      }
      const unchanged = previous && previous.snapshot.total === reply.total && items.length === previous.snapshot.items.length && items.every((item, index) => item === previous.snapshot.items[index]);
      this.galleries.delete(page);
      this.galleries.set(page, { snapshot: unchanged ? previous.snapshot : { items, total: reply.total, page, pageSize: 12 }, checkedAt: Date.now(), scrollTop: previous?.scrollTop });
      while (this.galleries.size > 8) this.galleries.delete(this.galleries.keys().next().value!);
      this.failures.delete(page);
      if (!unchanged) this.notifyGallery();
    }).catch(error => {
      if (error instanceof Error && error.message === "TEMPLATES_ACCOUNT_CHANGED") throw error;
      if (generation !== this.generation) return;
      const attempts = (failure?.attempts ?? 0) + 1;
      this.failures.set(page, { attempts, retryAt: Date.now() + Math.min(120_000, 15_000 * 2 ** Math.min(attempts - 1, 3)) });
      while (this.failures.size > 8) this.failures.delete(this.failures.keys().next().value!);
      throw error;
    }).finally(() => { if (this.galleryRequests.get(page)?.promise === promise) this.galleryRequests.delete(page); });
    this.galleryRequests.set(page, { controller, promise });
    return promise;
  }
}
export const templatesSessionCache = new TemplatesSessionCache();
