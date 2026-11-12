// Focused offline regression: no environment loading or external requests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { typescriptLoader } from './lib/load-typescript.mjs';

let checks = 0, actor = 'user-a', authCalls = 0, profileCalls = 0, upserts = 0;
let mapped = { id: 'owner-a', clerk_user_id: actor }, lookupError = null;
const logs = [];
const redirect = new Error('fixture redirect');
const load = typescriptLoader({
  react: { cache: fn => fn }, // Actions/handlers have no render memoization.
  'next/server': { connection: async () => {} },
  'next/navigation': { unstable_rethrow: error => { if (error === redirect) throw error; } },
  './require-user': { requireClerkUser: async () => { authCalls++; if (!actor) throw redirect; return { userId: actor }; } },
  '@clerk/nextjs/server': { clerkClient: async () => ({ users: { getUser: async id => {
    profileCalls++; return { id, emailAddresses: [], primaryEmailAddressId: null, firstName: null, lastName: null, imageUrl: null };
  } } }) },
  '@/lib/db/server': { createDatabaseClient: () => ({ from(table) {
    assert.equal(table, 'app_users'); checks++;
    return {
      select(columns) { assert.equal(columns, 'id,clerk_user_id'); checks++; return this; },
      eq(column, value) { assert.equal(column, 'clerk_user_id'); assert.equal(value, actor); checks += 2; return this; },
      maybeSingle: async () => ({ data: mapped, error: lookupError, status: lookupError ? 503 : 200 }),
      upsert(values) {
        upserts++; assert.equal(values.clerk_user_id, actor); checks++;
        return { select: () => ({ single: async () => ({ data: { id: 'new-owner', clerk_user_id: actor }, error: null, status: 200 }) }) };
      },
    };
  } }) },
}, { console: { error: (...args) => logs.push(args) } });
const { readAppUser } = load('lib/auth/read-app-user.ts');
const { serviceDiagnostic } = load('lib/diagnostics/service-failure.ts');
assert.equal((await readAppUser()).id, 'owner-a');
assert.equal((await readAppUser()).id, 'owner-a');
assert.equal(authCalls, 2); assert.equal(profileCalls, 0); assert.equal(upserts, 0); checks += 5;
actor = 'user-b'; mapped = { id: 'owner-b', clerk_user_id: actor };
assert.equal((await readAppUser()).id, 'owner-b'); checks++;
mapped = { id: 'owner-a', clerk_user_id: 'user-a' };
await assert.rejects(readAppUser); checks++;
mapped = null; lookupError = { code: 'PGRST001' };
await assert.rejects(readAppUser, error => error.diagnostic.retryable === true); checks++;
assert.equal(profileCalls, 0); assert.equal(upserts, 0); checks += 2;
lookupError = null;
assert.equal((await readAppUser()).id, 'new-owner');
assert.equal(profileCalls, 1); assert.equal(upserts, 1); checks += 3;
actor = null;
await assert.rejects(readAppUser, error => error === redirect); checks++;
const wrapped = { errors: [{ code: 'unexpected_error', message: 'fetch failed', longMessage: 'private token must not be logged' }] };
const network = serviceDiagnostic(wrapped, 'clerk', 'clerk_profile');
assert.equal(network.category, 'network'); assert.equal(network.retryable, true); assert.equal(network.upstreamCode, 'unexpected_error'); checks += 3;
assert.ok(!JSON.stringify(network).includes('private token')); checks++;
assert.equal(serviceDiagnostic({ ...wrapped, status: 401 }, 'clerk', 'clerk_profile').retryable, false); checks++;
assert.equal(serviceDiagnostic({ errors: [{ code: 'unexpected_error', message: 'invalid response shape' }] }, 'clerk', 'clerk_profile').category, 'unknown'); checks++;
assert.equal(serviceDiagnostic({ status: 429 }, 'clerk', 'clerk_profile').category, 'rate_limit'); checks++;

// Exercise the installed SDK's real exception wrapper with fetch fully stubbed.
// The original transport cause is lost here, before application diagnostics run.
const previousFetch = globalThis.fetch, previousNodeEnv = process.env.NODE_ENV;
let sdkFetches = 0;
try {
  process.env.NODE_ENV = 'test';
  globalThis.fetch = async () => { sdkFetches++; throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }); };
  const { createClerkClient } = await import('@clerk/backend');
  await assert.rejects(() => createClerkClient({ secretKey: 'sk_test_offline_fixture' }).users.getUser('user_offline_fixture'), error => {
    const diagnostic = serviceDiagnostic(error, 'clerk', 'clerk_profile');
    assert.equal(error.errors[0].code, 'unexpected_error');
    assert.equal(diagnostic.category, 'network');
    assert.equal(diagnostic.transportCode, null); checks += 3;
    return true;
  }); checks++;
  assert.ok(sdkFetches > 0); checks++;
} finally {
  globalThis.fetch = previousFetch;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
}

const time = { now: 1000000 };
const cacheLoad = typescriptLoader({}, { Date: class extends Date { static now() { return time.now; } } });
const { ProjectsSessionCache, ProjectsRefreshError } = cacheLoad('lib/projects/session-cache.ts');
const cache = new ProjectsSessionCache(), scope = 'user-a/session-a';
const reply = { ok: true, clerkUserId: 'user-a', data: { projects: [], page: 1, total: 0, pageSize: 8 }, changed: {} };
cache.setScope(scope);
let requests = 0;
await cache.refresh(scope, 'user-a', 1, async () => { requests++; return reply; });
const snapshot = cache.readPage(scope, 1);
await cache.refresh(scope, 'user-a', 1, async () => { requests++; return reply; });
assert.equal(requests, 1); checks++;
const unavailable = async () => { requests++; return { ok: false, retryable: true }; };
for (const [attempt, delay] of [[1,15000],[2,30000],[3,60000],[4,120000]]) {
  await assert.rejects(() => cache.refresh(scope, 'user-a', 1, unavailable, true), error => error instanceof ProjectsRefreshError && error.retryable && error.attempts === attempt); checks++;
  const before = requests;
  await Promise.allSettled(Array.from({ length: 8 }, () => cache.refresh(scope, 'user-a', 1, unavailable, true)));
  assert.equal(requests, before); assert.equal(cache.readPage(scope, 1), snapshot); checks += 2;
  time.now += delay;
}
await cache.refresh(scope, 'user-a', 1, async () => reply, true);
await assert.rejects(() => cache.refresh(scope, 'user-a', 1, async () => ({ ok: false, retryable: false }), true), error => !error.retryable); checks++;
cache.retryPage(scope, 1);
// Mutations racing with a reply never cause a recursive request loop.
let finish;
const inFlight = cache.refresh(scope, 'user-a', 1, () => { requests++; return new Promise(resolve => { finish = resolve; }); }, true);
await Promise.resolve();
cache.rename(scope, { id: 'fixture', title: 'renamed', updatedAt: 'later' });
const before = requests; finish(reply); await inFlight;
assert.equal(requests, before); checks++;
cache.retryPage(scope, 1);
await assert.rejects(() => cache.refresh(scope, 'user-a', 1, async () => ({ ...reply, clerkUserId: 'user-b' }), true), error => !error.retryable); checks++;
assert.equal(cache.readPage(scope, 1), undefined); checks++;
cache.setScope(null);
assert.equal(cache.readPage(scope, 1), undefined); checks++;
assert.ok(logs.length > 0); checks++;

// Public action sends only safe retry metadata, and never swallows auth redirects.
let galleryFailure;
const actionLoader = typescriptLoader({
  'next/navigation': { unstable_rethrow: error => { if (error === redirect) throw error; } },
  '@/lib/projects/gallery-server': { readOwnedProjectsGallery: async () => { throw galleryFailure; } },
});
const { ServiceOperationError } = actionLoader('lib/diagnostics/service-failure.ts');
const { projectsGalleryAction } = actionLoader('app/actions/projects-gallery.ts');
for (const [status, retryable] of [[503,true],[401,false],[403,false]]) {
  galleryFailure = new ServiceOperationError({ status }, 'database', 'projects_index');
  const result = await projectsGalleryAction({});
  assert.equal(result.ok, false); assert.equal(result.retryable, retryable); checks += 2;
}
galleryFailure = redirect; await assert.rejects(() => projectsGalleryAction({}), error => error === redirect); checks++;

// Thumbnail fallbacks must retain the project's and source asset's owner fences.
const projectId = randomUUID(), assetId = randomUUID(), owner = randomUUID();
let liveProject = true, sourceOwner = owner, signs = 0;
const thumbnailLoader = typescriptLoader({
  '@/lib/auth/read-app-user': { readAppUser: async () => ({ id: owner }) },
  '@/lib/db/server': { createDatabaseClient: () => ({ from(table) {
    const filters = {};
    return { select() { return this; }, eq(key,value) { filters[key] = value; return this; }, is(key,value) { filters[key] = value; return this; },
      async maybeSingle() {
        assert.equal(filters.owner_user_id, owner); checks++;
        if (table === 'projects') {
          assert.equal(filters.id, projectId); assert.equal(filters.status, 'draft'); assert.equal(filters.deleted_at, null); checks += 3;
          return { data: liveProject ? { id: projectId } : null, error: null };
        }
        assert.equal(filters.id, assetId); assert.equal(filters.project_id, projectId); assert.equal(filters.upload_status, 'uploaded'); assert.equal(filters.removed_from_draft, false); checks += 4;
        return { data: sourceOwner === owner ? { id: assetId, verified_etag: 'fixture', media_type: 'video', storage_key: 'private-fixture', mime_type: 'video/mp4', size_bytes: 100 } : null, error: null };
      } };
  } }) },
  '@/lib/storage/server': { createReadUrl: async () => { signs++; return { url: 'https://example.test/private' }; } },
  '@/lib/final-video-generation-v3/runtime-media': {},
});
const { readOwnedProjectThumbnail } = thumbnailLoader('lib/projects/thumbnail-server.ts');
assert.equal((await readOwnedProjectThumbnail({ projectId, assetId })).state, 'ready'); checks++;
sourceOwner = 'foreign';
assert.equal((await readOwnedProjectThumbnail({ projectId, assetId })).state, 'unavailable'); checks++;
liveProject = false;
assert.equal((await readOwnedProjectThumbnail({ projectId, assetId })).state, 'unavailable'); checks++;
assert.equal(signs, 1); checks++;
console.log(JSON.stringify({ checks, realNetworkCalls: 0, profileCallsForExistingAccounts: 0 }));
