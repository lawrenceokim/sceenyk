import type { CacheDomain } from "./contract";

type Reply<T> = { clerkUserId: string; data: T };
type Entry = { data?: unknown; checkedAt: number; revision: number; domain: CacheDomain; loader: (signal: AbortSignal) => Promise<Reply<unknown>>; staleMs: number; error?: Error; failures: number; retryAt: number };
type Target = { invalidate(scope: string): void; refresh(scope: string, viewer: string): Promise<unknown>; reset(scope: string | null): void };

// Retain identical nested objects/rows so background reads do not reset forms,
// controls or unchanged components. Values are confirmed, serializable DTOs only.
export function shareConfirmed(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object") return next;
  if (Array.isArray(next)) {
    if (!Array.isArray(previous)) return next;
    const byId = new Map(previous.filter(row => row && typeof row === "object" && "id" in row).map(row => [row.id, row]));
    const rows = next.map((row, index) => shareConfirmed(row && typeof row === "object" && "id" in row ? byId.get(row.id) : previous[index], row));
    return rows.length === previous.length && rows.every((row, index) => row === previous[index]) ? previous : rows;
  }
  if (Array.isArray(previous)) return next;
  const old = previous as Record<string, unknown>, value = next as Record<string, unknown>;
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shareConfirmed(old[key], item)]));
  return Object.keys(old).length === Object.keys(result).length && Object.keys(result).every(key => old[key] === result[key]) ? previous : result;
}

export class AccountSessionCache {
  private scope: string | null = null;
  private epoch = 0;
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<unknown>>();
  private controllers = new Map<string, AbortController>();
  private listeners = new Set<() => void>();
  private targets = new Map<CacheDomain, Target>();
  private changes = new Set<CacheDomain>();
  private activations = new Map<string, number>();
  private positions = new Map<string, number>();
  private receipts = new Map<string, string>();
  private storeRevision = 0;
  private flushing?: Promise<void>;
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.storeRevision++; this.listeners.forEach(listener => listener()); }
  readonly version = () => this.storeRevision;
  ticket() { return { scope: this.scope, epoch: this.epoch }; }
  current(ticket: { scope: string | null; epoch: number }) { return !!ticket.scope && ticket.scope === this.scope && ticket.epoch === this.epoch; }
  register(domain: CacheDomain, target: Target) { this.targets.set(domain, target); }
  setScope(scope: string | null) {
    if (scope === this.scope) return;
    this.controllers.forEach(controller => controller.abort()); this.controllers.clear();
    this.scope = scope; this.epoch++; this.entries.clear(); this.pending.clear(); this.changes.clear(); this.activations.clear(); this.positions.clear(); this.receipts.clear(); this.flushing = undefined;
    this.targets.forEach(target => target.reset(scope)); this.emit();
  }
  read<T>(scope: string | null, key: string): T | undefined { return scope && scope === this.scope ? this.entries.get(key)?.data as T | undefined : undefined; }
  permit(scope: string | null, key: string, interval = 15000) {
    if (!scope || scope !== this.scope || Date.now() - (this.activations.get(key) ?? 0) < interval) return false;
    this.activations.delete(key); this.activations.set(key, Date.now());
    while (this.activations.size > 48) this.activations.delete(this.activations.keys().next().value!);
    return true;
  }
  receipt(key: string, data: unknown, ticket = this.ticket()) {
    if (!this.current(ticket)) return false;
    const value = JSON.stringify(data);
    if (this.receipts.get(key) === value) return false;
    this.receipts.delete(key); this.receipts.set(key, value);
    while (this.receipts.size > 48) this.receipts.delete(this.receipts.keys().next().value!);
    return true;
  }
  error(scope: string | null, key: string) { return scope && scope === this.scope ? this.entries.get(key)?.error : undefined; }
  fresh(scope: string | null, key: string) {
    const entry = scope && scope === this.scope ? this.entries.get(key) : undefined;
    return !!entry?.data && Date.now() - entry.checkedAt < entry.staleMs;
  }
  patch<T>(scope: string, key: string, data: T) {
    if (scope !== this.scope) return;
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.revision++; entry.data = shareConfirmed(entry.data, data); entry.checkedAt = Date.now(); entry.error = undefined; entry.failures = 0; entry.retryAt = 0;
    this.emit();
  }
  removeRow(scope: string, domain: CacheDomain, id: string) {
    if (scope !== this.scope) return;
    const selected = [...this.entries.values()].filter(entry => entry.domain === domain && entry.data && typeof entry.data === "object" && "items" in entry.data && Array.isArray(entry.data.items));
    if (!selected.some(entry => (entry.data as { items: { id: string }[] }).items.some(item => item.id === id))) return;
    for (const entry of selected) {
      const data = entry.data as { items: { id: string }[]; total: number };
      entry.revision++; entry.checkedAt = 0;
      entry.data = { ...data, items: data.items.filter(item => item.id !== id), total: Math.max(0, data.total - 1) };
    }
    this.emit();
  }
  scroll(scope: string, key: string, top?: number) {
    if (scope !== this.scope) return;
    if (top !== undefined) {
      this.positions.delete(key); this.positions.set(key, top);
      while (this.positions.size > 48) this.positions.delete(this.positions.keys().next().value!);
    }
    return this.positions.get(key);
  }
  retry(scope: string, key: string) { const entry = scope === this.scope ? this.entries.get(key) : undefined; if (entry) { entry.retryAt = 0; entry.checkedAt = 0; } }
  async load<T>(scope: string, viewer: string, key: string, domain: CacheDomain, loader: (signal: AbortSignal) => Promise<Reply<T>>, force = false, staleMs = 15000): Promise<T | undefined> {
    if (scope !== this.scope) return;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { checkedAt: 0, revision: 0, domain, loader, staleMs, failures: 0, retryAt: 0 };
      this.entries.set(key, entry);
      while (this.entries.size > 48) this.entries.delete(this.entries.keys().next().value!);
    }
    entry.loader = loader; entry.staleMs = staleMs;
    if (this.pending.has(key)) return this.pending.get(key) as Promise<T | undefined>;
    if (Date.now() < entry.retryAt) throw entry.error ?? new Error("CACHE_RETRY_LATER");
    if (!force && this.fresh(scope, key)) return entry.data as T;
    const ticket = this.ticket(), revision = entry.revision, selected = entry, controller = new AbortController();
    this.controllers.set(key, controller);
    const request: Promise<T | undefined> = Promise.resolve().then(async () => {
      const reply = await loader(controller.signal);
      if (!this.current(ticket) || selected !== this.entries.get(key) || revision !== selected.revision) return undefined;
      if (reply.clerkUserId !== viewer) { this.setScope(null); throw new Error("CACHE_ACCOUNT_CHANGED"); }
      const data = shareConfirmed(selected.data, reply.data);
      const changed = data !== selected.data || !!selected.error;
      selected.data = data; selected.checkedAt = Date.now(); selected.error = undefined; selected.failures = 0; selected.retryAt = 0;
      if (changed) this.emit();
      return data as T;
    }).catch(error => {
      if (error instanceof Error && error.message === "CACHE_ACCOUNT_CHANGED") throw error;
      if (!this.current(ticket) || selected !== this.entries.get(key) || revision !== selected.revision) return undefined;
      selected.error = new Error("ACCOUNT_REFRESH_UNAVAILABLE"); selected.failures++;
      selected.retryAt = Date.now() + Math.min(120000, 15000 * 2 ** Math.min(selected.failures - 1, 3));
      this.emit(); throw selected.error;
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
      if (this.controllers.get(key) === controller) this.controllers.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }
  async confirmed(domains: CacheDomain[], ticket = this.ticket()) {
    if (!this.current(ticket)) return;
    for (const domain of domains) {
      this.changes.add(domain); this.targets.get(domain)?.invalidate(ticket.scope!);
      for (const entry of this.entries.values()) if (entry.domain === domain) { entry.revision++; entry.checkedAt = 0; }
    }
    if (this.flushing) return this.flushing;
    const flush = Promise.resolve().then(async () => {
      // At most one follow-up batch. Continuous mutations leave entries stale
      // for the next activation rather than creating a recursive refresh loop.
      for (let pass = 0; pass < 2 && this.current(ticket); pass++) {
        const changed = new Set(this.changes); this.changes.clear();
        if (!changed.size) break;
        const viewer = ticket.scope!.split("/")[0];
        await Promise.allSettled([
          ...[...changed].map(domain => this.targets.get(domain)?.refresh(ticket.scope!, viewer)),
          ...[...this.entries.entries()].filter(([, entry]) => entry.data !== undefined && changed.has(entry.domain)).map(async ([key, entry]) => {
            await this.pending.get(key)?.catch(() => {});
            if (this.current(ticket)) await this.load(ticket.scope!, viewer, key, entry.domain, entry.loader, true, entry.staleMs);
          }),
        ]);
      }
    }).finally(() => { if (this.flushing === flush) this.flushing = undefined; });
    this.flushing = flush;
    return flush;
  }
}
export const accountSessionCache = new AccountSessionCache();

export async function confirmedAction<T extends { ok: boolean }>(domains: CacheDomain[], operation: () => Promise<T>, apply?: (result: T, scope: string) => void, waitMs = 1500): Promise<T> {
  const ticket = accountSessionCache.ticket(), result = await operation();
  if (result.ok && accountSessionCache.current(ticket)) {
    // The action's unchanged result remains the sole source of success. A read
    // failure never converts a committed action into a failed/duplicate action.
    try { apply?.(result, ticket.scope!); } catch { /* Reconcile from the server if an optional display patch fails. */ }
    const refresh = accountSessionCache.confirmed(domains, ticket).catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([refresh, new Promise<void>(resolve => { timer = setTimeout(resolve, waitMs); })]); }
    finally { clearTimeout(timer); }
  }
  return result;
}
