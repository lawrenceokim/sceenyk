import type { GalleryReply, GallerySnapshot } from "./gallery-contract";
import type { ProjectMediaReply } from "./cached-media-contract";
import type { SavedProject } from "./types";

export type CachedProjectMedia = { url: string; version: string; expiresAt: number; bytes: number; objectUrl: boolean; loaded: boolean; retryAt?: number };
type PageEntry = { snapshot: GallerySnapshot; checkedAt: number; scrollTop?: number };
type MediaEntry = { value: CachedProjectMedia; timer?: ReturnType<typeof setTimeout> };
export class ProjectsRefreshError extends Error {
  constructor(readonly retryable: boolean, readonly attempts = 1) { super("PROJECTS_UNAVAILABLE"); }
}

// Browser memory only. No localStorage, Cache API, service worker or server cache.
export class ProjectsSessionCache {
  private scope: string | null = null;
  private epoch = 0;
  private mutation = 0;
  private mediaVersions = new Map<string, number>();
  private invalidations = new Map<string, number>();
  private pages = new Map<number, PageEntry>();
  private loaders = new Map<number, { owner: string; load: (known: Record<string, string>) => Promise<GalleryReply> }>();
  private refreshFailures = new Map<number, { error: ProjectsRefreshError; retryAt: number }>();
  private media = new Map<string, MediaEntry>();
  private pending = new Map<string, Promise<unknown>>();
  private requests = new Set<AbortController>();
  private listeners = new Set<() => void>();
  private identityListener?: () => void;
  private identitySource?: unknown;
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  setScope(scope: string | null) {
    if (scope === this.scope) return;
    this.scope = scope; this.epoch++;
    this.requests.forEach(c => c.abort()); this.requests.clear(); this.pending.clear(); this.pages.clear();
    this.refreshFailures.clear(); this.loaders.clear();
    for (const key of this.media.keys()) this.dropMedia(key);
    this.mediaVersions.clear();
    this.invalidations.clear();
    this.emit();
  }
  watchIdentity(source: unknown, subscribe: (change: (scope: string | null) => void) => () => void) {
    if (this.identitySource !== source) {
      this.identityListener?.(); this.identitySource = source;
      this.identityListener = subscribe(scope => this.setScope(scope));
    }
  }
  readPage(scope: string | null, page: number) { return scope === this.scope ? this.pages.get(page)?.snapshot : undefined; }
  scroll(scope: string, page: number, top?: number) {
    if (scope !== this.scope) return;
    const entry = this.pages.get(page);
    if (entry && top !== undefined) entry.scrollTop = top;
    return entry?.scrollTop;
  }
  async refresh(scope: string, owner: string, page: number, load: (known: Record<string, string>) => Promise<GalleryReply>, force = false) {
    if (scope !== this.scope) return;
    this.loaders.set(page, { owner, load });
    while (this.loaders.size > 8) this.loaders.delete(this.loaders.keys().next().value!);
    const key = `page:${page}`, previous = this.pages.get(page);
    if (this.pending.has(key)) return this.pending.get(key);
    const failure = this.refreshFailures.get(page);
    if (failure && Date.now() < failure.retryAt) throw failure.error;
    if (!force && previous && Date.now() - previous.checkedAt < 15_000) return;
    const epoch = this.epoch, mutation = this.mutation;
    const request = Promise.resolve().then(async () => {
      const reply = await load(Object.fromEntries(Object.entries(previous?.snapshot.cards ?? {}).map(([id, card]) => [id, card.revision])));
      if (epoch !== this.epoch || scope !== this.scope) return;
      // A mutation already updated local cards. Reconcile on the next scheduled
      // check rather than recursively issuing requests while mutations continue.
      if (mutation !== this.mutation) return;
      if (!reply.ok) throw new ProjectsRefreshError(reply.retryable === true);
      if (reply.clerkUserId !== owner) { this.setScope(null); throw new ProjectsRefreshError(false); }
      const cards = Object.fromEntries(reply.data.projects.map(project => {
        const old = previous?.snapshot.cards[project.id], next = reply.changed[project.id] ?? old;
        if (!next) throw new Error("PROJECTS_INCOMPLETE");
        if (old && old.mediaRevision !== next.mediaRevision) this.expireMedia(`video:${project.id}`);
        if (old?.preview && old.preview.id !== next.preview?.id) this.dropMedia(`thumbnail:${project.id}:${old.preview.id}`);
        return [project.id, next];
      }));
      const projects = reply.data.projects.map(project => {
        const old = previous?.snapshot.data.projects.find(p => p.id === project.id);
        return old && JSON.stringify(old) === JSON.stringify(project) ? old : project;
      });
      const snapshot = { data: { ...reply.data, projects }, cards };
      const unchanged = previous && JSON.stringify(previous.snapshot) === JSON.stringify(snapshot);
      this.pages.delete(page);
      this.pages.set(page, { snapshot: unchanged ? previous.snapshot : snapshot, checkedAt: Date.now(), scrollTop: previous?.scrollTop });
      this.refreshFailures.delete(page);
      while (this.pages.size > 8) this.pages.delete(this.pages.keys().next().value!);
      if (!unchanged) this.emit();
    }).catch(error => {
      if (epoch !== this.epoch || scope !== this.scope) {
        if (error instanceof ProjectsRefreshError) throw error;
        return;
      }
      const network = error instanceof TypeError && /fetch failed|failed to fetch|load failed|networkerror/i.test(error.message);
      if (mutation !== this.mutation) return;
      const attempts = (failure?.error.attempts ?? 0) + 1;
      const safe = new ProjectsRefreshError(error instanceof ProjectsRefreshError ? error.retryable : network, attempts);
      this.refreshFailures.set(page, { error: safe, retryAt: Date.now() + Math.min(120_000, 15_000 * 2 ** Math.min(attempts - 1, 3)) });
      while (this.refreshFailures.size > 8) this.refreshFailures.delete(this.refreshFailures.keys().next().value!);
      throw safe;
    });
    this.pending.set(key, request);
    try { await request; } finally { if (this.pending.get(key) === request) this.pending.delete(key); }
  }
  retryPage(scope: string, page: number) { if (scope === this.scope) this.refreshFailures.delete(page); }
  invalidateAll(scope: string) {
    if (scope !== this.scope) return;
    this.mutation++;
    for (const entry of this.pages.values()) entry.checkedAt = 0;
  }
  async refreshCached(scope: string, owner: string) {
    if (scope !== this.scope) return;
    await Promise.allSettled([...this.pages.keys()].map(async page => {
      await this.pending.get(`page:${page}`)?.catch(() => {});
      const loader = this.loaders.get(page);
      if (loader && loader.owner === owner && scope === this.scope) await this.refresh(scope, owner, page, loader.load, true);
    }));
  }
  rename(scope: string, project: { id: string; title: string; updatedAt: string }) {
    if (scope !== this.scope) return;
    if (![...this.pages.values()].some(entry => entry.snapshot.data.projects.some(p => p.id === project.id && (p.title !== project.title || p.updatedAt !== project.updatedAt)))) return;
    this.mutation++;
    for (const entry of this.pages.values()) {
      entry.checkedAt = 0;
      entry.snapshot = { ...entry.snapshot, data: { ...entry.snapshot.data,
        projects: entry.snapshot.data.projects.map(p => p.id === project.id ? { ...p, ...project } : p) } };
    }
    this.emit();
  }
  remove(scope: string, id: string) {
    if (scope !== this.scope) return;
    const present = [...this.pages.values()].some(entry => entry.snapshot.data.projects.some(p => p.id === id));
    if (!present) {
      for (const key of this.media.keys()) if (key === `video:${id}` || key.startsWith(`thumbnail:${id}:`)) this.dropMedia(key);
      this.emit(); return;
    }
    this.mutation++;
    for (const entry of this.pages.values()) {
      const cards = { ...entry.snapshot.cards }; delete cards[id];
      entry.snapshot = { data: { ...entry.snapshot.data, total: Math.max(0, entry.snapshot.data.total - (present ? 1 : 0)),
        projects: entry.snapshot.data.projects.filter(p => p.id !== id) }, cards };
      entry.checkedAt = 0;
    }
    for (const key of this.media.keys()) if (key === `video:${id}` || key.startsWith(`thumbnail:${id}:`)) this.dropMedia(key);
    this.emit();
  }
  saveSummary(scope: string, project: SavedProject) {
    if (scope !== this.scope) return;
    const { id, title, category, settings, creationType, ugcType, status, createdAt, updatedAt, workflow } = project;
    const summary = { id, title, category, settings, creationType, ugcType, status, createdAt, updatedAt, ...(workflow ? { workflow } : {}) };
    if (![...this.pages.values()].some(entry => entry.snapshot.data.projects.some(item => item.id === id))) return;
    this.mutation++;
    for (const entry of this.pages.values()) {
      entry.checkedAt = 0;
      entry.snapshot = { ...entry.snapshot, data: { ...entry.snapshot.data, projects: entry.snapshot.data.projects.map(item => item.id === id ? summary : item) } };
    }
    this.emit();
  }
  readMedia(scope: string | null, key: string) {
    if (!scope || scope !== this.scope) return undefined;
    const value = this.media.get(key)?.value;
    return value && value.expiresAt > Date.now() ? value : undefined;
  }
  mediaInvalidation(scope: string | null, key: string) { return scope === this.scope ? this.invalidations.get(key) ?? 0 : 0; }
  loaded(scope: string, key: string) {
    if (scope !== this.scope) return;
    const entry = this.media.get(key);
    if (entry && !entry.value.loaded) { entry.value = { ...entry.value, loaded: true }; this.emit(); }
  }
  expireMedia(key: string) {
    this.invalidations.set(key, (this.invalidations.get(key) ?? 0) + 1);
    this.mediaVersions.set(key, (this.mediaVersions.get(key) ?? 0) + 1);
    this.pending.delete(`media:${key}`);
    const entry = this.media.get(key);
    if (entry) { clearTimeout(entry.timer); entry.value = { ...entry.value, expiresAt: 0 }; }
    this.emit();
  }
  private dropMedia(key: string) {
    this.mediaVersions.set(key, (this.mediaVersions.get(key) ?? 0) + 1);
    this.pending.delete(`media:${key}`);
    const entry = this.media.get(key);
    if (entry?.value.objectUrl) URL.revokeObjectURL(entry.value.url);
    clearTimeout(entry?.timer); this.media.delete(key);
  }
  async loadMedia(scope: string, key: string, endpoint: string, input: Record<string, string>, reauthorize = false): Promise<{ pending: true } | undefined> {
    if (scope !== this.scope || !reauthorize && this.readMedia(scope, key)) return;
    const pendingKey = `media:${key}`;
    if (this.pending.has(pendingKey)) return this.pending.get(pendingKey) as Promise<{ pending: true } | undefined>;
    const epoch = this.epoch, version = this.mediaVersions.get(key) ?? 0;
    const current = () => epoch === this.epoch && version === (this.mediaVersions.get(key) ?? 0);
    const controller = new AbortController(), previous = this.media.get(key)?.value;
    this.requests.add(controller);
    const request = Promise.resolve().then(async () => {
      try {
        const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
          headers: { "Content-Type": "application/json", Accept: "application/octet-stream" },
          body: JSON.stringify({ ...input, ...(previous?.objectUrl ? { version: previous.version } : {}) }),
        });
        if (!current()) return;
        if (!response.ok) throw new Error("PROJECT_MEDIA_UNAVAILABLE");
        let value: CachedProjectMedia;
        if (response.headers.get("content-type")?.startsWith("application/json")) {
          const result: ProjectMediaReply = await response.json();
          if (!current()) return;
          if (result.state === "pending") {
            const entry = this.media.get(key);
            if (entry) { clearTimeout(entry.timer); entry.value = { ...entry.value, expiresAt: 0 }; this.emit(); }
            return { pending: true as const };
          }
          if (result.state !== "ready") { this.dropMedia(key); this.emit(); return; }
          const url = result.url ?? (previous?.version === result.version ? previous.url : undefined);
          if (!url) throw new Error("PROJECT_MEDIA_UNAVAILABLE");
          value = { url, version: result.version, expiresAt: Date.parse(result.expiresAt), bytes: previous?.bytes ?? 0,
            objectUrl: !result.url && !!previous?.objectUrl, loaded: url === previous?.url && !!previous?.loaded };
        } else {
          const blob = await response.blob();
          if (!current()) return;
          const version = response.headers.get("X-Project-Media-Version"), expiresAt = Date.parse(response.headers.get("X-Project-Media-Expires") ?? "");
          if (!version || !Number.isFinite(expiresAt) || blob.size > 2 * 1024 * 1024 || blob.size === 0) throw new Error("PROJECT_MEDIA_INVALID");
          value = { url: URL.createObjectURL(blob), version, expiresAt, bytes: blob.size, objectUrl: true, loaded: false };
        }
        if (!current()) { if (value.objectUrl && value.url !== previous?.url) URL.revokeObjectURL(value.url); return; }
        if (previous?.url !== value.url) this.dropMedia(key);
        else clearTimeout(this.media.get(key)?.timer);
        // A short authorization deadline also gates locally retained Blob bytes.
        value.expiresAt = Math.min(value.expiresAt, Date.now() + 5 * 60_000);
        const entry: MediaEntry = { value };
        entry.timer = setTimeout(() => { this.emit(); }, Math.max(0, value.expiresAt - Date.now()) + 5);
        this.media.delete(key); this.media.set(key, entry);
        let bytes = [...this.media.values()].reduce((n, e) => n + e.value.bytes, 0);
        while (this.media.size > 48 || bytes > 48 * 1024 * 1024) {
          const oldest = this.media.keys().next().value!; bytes -= this.media.get(oldest)!.value.bytes; this.dropMedia(oldest);
        }
        this.emit();
      } finally { this.requests.delete(controller); }
    });
    this.pending.set(pendingKey, request);
    try { return await request; } finally { if (this.pending.get(pendingKey) === request) this.pending.delete(pendingKey); }
  }
}

export const projectsSessionCache = new ProjectsSessionCache();
