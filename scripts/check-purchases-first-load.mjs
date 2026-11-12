// Focused first-load/authentication and mode-request tests. No env or live I/O.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { typescriptLoader } from './lib/load-typescript.mjs';

let checks = 0, actor = 'buyer-a', lookupError = null, profileOffline = true;
let profiles = 0, upserts = 0;
const owner = randomUUID(), other = randomUUID(), id = randomUUID(), listingId = randomUUID();
const mappings = new Map([['buyer-a', owner], ['buyer-b', other]]), rpcCalls = [];
const redirect = new Error('AUTH_REQUIRED');
const purchase = Object.freeze({ id, listingId, title: 'Acquired template', description: 'Reviewed description', creatorName: 'Creator', creatorSlug: null, creatorAvatar: null,
  template: { version: 1, category: 'cinematic', instructions: 'Shared instructions', settings: { aspectRatio: '16:9', duration: '10', visualStyle: 'Original', tone: 'Storytelling' } },
  kind: 'paid', amountMinor: 500, acquiredAt: '2026-11-10T10:00:00Z', financialStatus: 'completed', listingAvailable: false, previewUrl: `/api/purchases/${id}/preview` });
const before = JSON.stringify(purchase);
const db = {
  from(table) {
    assert.equal(table, 'app_users'); checks++;
    return {
      select() { return this; },
      eq(column, value) { assert.equal(column, 'clerk_user_id'); assert.equal(value, actor); checks += 2; return this; },
      maybeSingle: async () => ({ data: mappings.has(actor) ? { id: mappings.get(actor), clerk_user_id: actor } : null, error: lookupError, status: lookupError ? 503 : 200 }),
      upsert(values) {
        upserts++; mappings.set(values.clerk_user_id, owner);
        return { select: () => ({ single: async () => ({ data: { id: owner, clerk_user_id: actor }, error: null, status: 200 }) }) };
      },
    };
  },
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    const authorized = args.p_owner === owner;
    if (name === 'marketplace_acquisition_library') return { data: { items: authorized ? [purchase] : [], total: authorized ? 1 : 0, page: args.p_page, pageSize: 12 }, error: null };
    if (name === 'marketplace_acquisition_detail') return { data: authorized && args.p_id === id ? purchase : null, error: null };
    if (name === 'marketplace_acquisition_preview') return { data: authorized && args.p_id === id ? { listingId, key: `marketplace-previews/${listingId}/${id}.webp`, etag: 'reviewed', size: 100 } : null, error: null };
    if (name === 'creator_profile_listing_identities') return { data: [{ id: listingId, creatorName: 'Creator', creatorSlug: null, creatorAvatar: null }], error: null };
    if (name === 'studio_mode_read') return { data: { preferredMode: authorized ? 'pro' : 'basic', projectMode: null }, error: null };
    throw new Error('UNEXPECTED_MUTATION_OR_RPC');
  },
};
const load = typescriptLoader({
  react: { cache: fn => fn },
  'next/server': { connection: async () => {} },
  'next/navigation': { unstable_rethrow: error => { if (error === redirect) throw error; } },
  './require-user': { requireClerkUser: async () => { if (!actor) throw redirect; return { userId: actor }; } },
  '@clerk/nextjs/server': { clerkClient: async () => ({ users: { getUser: async userId => {
    profiles++;
    if (profileOffline) throw { errors: [{ code: 'unexpected_error', message: 'fetch failed' }] };
    return { id: userId, emailAddresses: [], primaryEmailAddressId: null };
  } } }) },
  '@/lib/db/server': { createDatabaseClient: () => db },
  '../server': { MarketplaceAccessError: class extends Error {} },
}, { console: { error() {} } });
const purchases = load('lib/marketplace/purchases/server.ts');
const modes = load('lib/studio-mode/server.ts');
const actions = load('app/actions/studio-mode.ts');
// Existing account: concurrent initial reads succeed with profile service offline.
const [page, mode] = await Promise.all([purchases.getAcquiredTemplates(), modes.readStudioMode(null)]);
assert.equal(page.items[0].id, id); assert.equal(page.items[0].amountMinor, 500); assert.equal(mode.preferredMode, 'pro');
assert.equal(page.clerkUserId, actor); assert.equal(profiles, 0); assert.equal(upserts, 0); checks += 6;
assert.equal((await purchases.getAcquiredTemplate(id)).purchase.id, id); checks++;
assert.equal((await purchases.getAcquiredTemplatePreview(id)).listingId, listingId); checks++;
assert.equal(await purchases.getAcquiredTemplate({ id, owner: other }), null); checks++;
actor = 'buyer-b';
assert.equal((await purchases.getAcquiredTemplates()).items.length, 0); checks++;
assert.equal(await purchases.getAcquiredTemplate(id), null); assert.equal(await purchases.getAcquiredTemplatePreview(id), null); checks += 2;
assert.equal((await modes.readStudioMode(null)).clerkUserId, actor); checks++;
actor = null;
const calls = rpcCalls.length;
await assert.rejects(() => purchases.getAcquiredTemplates(), error => error === redirect); checks++;
await assert.rejects(() => actions.readStudioModeAction(null), error => error === redirect); checks++;
assert.equal(rpcCalls.length, calls); checks++;
actor = 'buyer-a'; lookupError = { code: 'PGRST001' };
await assert.rejects(() => purchases.getAcquiredTemplates(), error => error.diagnostic.retryable); checks++;
assert.equal((await actions.readStudioModeAction(null)).ok, false); checks++;
assert.equal(profiles, 0); assert.equal(upserts, 0); checks += 2;
lookupError = null; mappings.delete(actor);
await assert.rejects(() => purchases.getAcquiredTemplates(), error => error.code === 'CLERK_CONNECTION_UNAVAILABLE'); checks++;
assert.equal(upserts, 0); checks++;
profileOffline = false;
assert.equal((await purchases.getAcquiredTemplates()).total, 1); assert.equal(upserts, 1); checks += 2;
assert.equal(JSON.stringify(purchase), before); checks++;

const { StudioModeStore } = load('lib/studio-mode/client-state.ts');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const reply = (user, preferredMode = 'pro', projectMode = null) => ({ ok: true, data: { clerkUserId: user, preferredMode, projectMode } });
let reads = 0, pending = deferred();
const store = new StudioModeStore({ read: () => { reads++; return pending.promise; }, save: async () => reply('buyer-a'), readGuest: () => 'basic', saveGuest() {} });
const scope = { userId: 'buyer-a', projectId: null };
const first = store.open(scope), second = store.open({ ...scope });
assert.equal(first, second); checks++;
await Promise.resolve(); assert.equal(reads, 1); checks++;
pending.resolve(reply('buyer-a')); await first;
assert.equal(store.getSnapshot().ready, true); assert.equal(store.getSnapshot().mode, 'pro'); checks += 2;
pending = deferred();
const failing = store.open(scope); await Promise.resolve(); pending.resolve({ ok: false, message: 'unavailable' }); await failing;
assert.ok(store.getSnapshot().error); assert.equal(store.getSnapshot().ready, false); checks += 2;
const failedReads = reads; await Promise.resolve(); assert.equal(reads, failedReads); checks++;
pending = deferred(); const retry = store.open(scope); await Promise.resolve(); pending.resolve(reply('buyer-a')); await retry;
assert.equal(store.getSnapshot().ready, true); assert.equal(reads, failedReads + 1); checks += 2;
pending = deferred(); const old = store.open(scope); await Promise.resolve();
await store.open({ userId: null, projectId: null }); pending.resolve(reply('buyer-a')); await old;
assert.equal(store.getSnapshot().key, 'guest:new'); assert.equal(store.getSnapshot().mode, 'basic'); checks += 2;

// Project navigation still waits for a submitted mode write, and duplicate
// selections cannot submit another write while that save is pending.
const saving = deferred(); let saved = false, writes = 0, readAfterSave = false;
const ordered = new StudioModeStore({
  read: async project => { if (project === 'project-b') readAfterSave = saved; return reply('buyer-a', saved ? 'pro' : 'basic', 'basic'); },
  save: async () => { writes++; await saving.promise; saved = true; return reply('buyer-a', 'pro', 'pro'); },
  readGuest: () => 'basic', saveGuest() {},
});
await ordered.open({ userId: 'buyer-a', projectId: 'project-a' });
const write = ordered.select('pro'); void ordered.select('pro');
assert.equal(writes, 1); checks++;
const navigate = ordered.open({ userId: 'buyer-a', projectId: 'project-b' });
saving.resolve(); await write; await navigate;
assert.equal(readAfterSave, true); assert.equal(ordered.getSnapshot().key, 'buyer-a:project-b'); assert.equal(ordered.getSnapshot().mode, 'basic'); checks += 3;
// A completed read for an old project cannot replace the new project's state.
const stale = deferred();
const racing = new StudioModeStore({ read: project => project === 'a' ? stale.promise : Promise.resolve(reply('buyer-a', 'basic', 'pro')),
  save: async () => reply('buyer-a'), readGuest: () => 'basic', saveGuest() {} });
const oldProject = racing.open({ userId: 'buyer-a', projectId: 'a' }); await Promise.resolve();
await racing.open({ userId: 'buyer-a', projectId: 'b' }); stale.resolve(reply('buyer-a', 'basic', 'basic')); await oldProject;
assert.equal(racing.getSnapshot().mode, 'pro'); assert.equal(racing.getSnapshot().key, 'buyer-a:b'); checks += 2;
console.log(JSON.stringify({ checks, realNetworkCalls: 0, profileRequestsForExistingUsers: 0, paymentMutations: 0 }));
