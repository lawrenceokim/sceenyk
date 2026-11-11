// Focused in-memory ownership, request deduplication and changed-card checks.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { typescriptLoader } from "./lib/load-typescript.mjs";

let checks = 0, downloads = 0, created = 0;
const revoked = [], now = { value: Date.now() };
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
let deliver = async () => new Response(new Uint8Array([1, 2, 3]), { headers: {
  "Content-Type": "video/mp4", "X-Project-Media-Version": "version-1", "X-Project-Media-Expires": new Date(now.value + 300_000).toISOString(),
} });
const load = typescriptLoader({}, {
  AbortController,
  Date: class extends Date { static now() { return now.value; } },
  URL: { createObjectURL: () => `blob:fixture-${++created}`, revokeObjectURL: url => revoked.push(url) },
  fetch: async (...args) => { downloads++; return deliver(...args); },
});
const { ProjectsSessionCache } = load("lib/projects/session-cache.ts");
const cache = new ProjectsSessionCache(), scope = "user-a/session-a", id = randomUUID(), second = randomUUID();
const project = { id, title: "Saved project", updatedAt: "2026-11-11T12:00:00Z" };
const card = { revision: "first", mediaRevision: "first-media", status: "final_approved", preview: null };
const reply = { ok: true, clerkUserId: "user-a", data: { projects: [project], page: 1, pageSize: 8, total: 1 }, changed: { [id]: card } };
try {
  cache.setScope(scope);
  let requests = 0, resolve;
  const pending = new Promise(r => { resolve = r; });
  const loader = () => { requests++; return pending; };
  const a = cache.refresh(scope, "user-a", 1, loader), b = cache.refresh(scope, "user-a", 1, loader);
  await Promise.resolve(); equal(requests, 1); resolve(reply); await Promise.all([a, b]);
  const snapshot = cache.readPage(scope, 1);
  equal(snapshot.data.projects[0].title, "Saved project");
  equal(cache.readPage("user-b/session-b", 1), undefined);
  cache.scroll(scope, 1, 240); equal(cache.scroll(scope, 1), 240);
  await cache.refresh(scope, "user-a", 1, async known => {
    equal(known[id], "first"); return { ...reply, changed: {} };
  }, true);
  assert.equal(cache.readPage(scope, 1), snapshot); checks++;
  await cache.refresh(scope, "user-a", 1, async () => { requests++; return reply; });
  equal(requests, 1); // Fresh mount/focus events reuse the index result.
  await assert.rejects(() => cache.refresh(scope, "user-a", 1, async () => ({ ok: false }), true)); checks++;
  assert.equal(cache.readPage(scope, 1), snapshot); checks++;
  const key = `video:${id}`;
  await Promise.all([cache.loadMedia(scope, key, "/fixture", {}), cache.loadMedia(scope, key, "/fixture", {})]);
  equal(downloads, 1); equal(created, 1);
  const video = cache.readMedia(scope, key);
  await cache.loadMedia(scope, key, "/fixture", {}); equal(downloads, 1);
  cache.loaded(scope, key); equal(cache.readMedia(scope, key).loaded, true);
  const invalidation = cache.mediaInvalidation(scope, key);
  cache.expireMedia(key); equal(cache.mediaInvalidation(scope, key), invalidation + 1);
  now.value += 300_001;
  equal(cache.readMedia(scope, key), undefined); // Expired bytes cannot display.
  deliver = async (_url, init) => {
    equal(JSON.parse(init.body).version, "version-1");
    return Response.json({ state: "ready", version: "version-1", expiresAt: new Date(now.value + 300_000).toISOString() });
  };
  await cache.loadMedia(scope, key, "/fixture", {});
  equal(cache.readMedia(scope, key).url, video.url); equal(created, 1); // Reauthorize without downloading bytes again.
  cache.rename(scope, { id, title: "Renamed", updatedAt: "2026-11-11T12:01:00Z" });
  equal(cache.readPage(scope, 1).data.projects[0].title, "Renamed");
  equal(cache.readMedia(scope, key).url, video.url);
  cache.remove(scope, id);
  equal(cache.readPage(scope, 1).data.projects.length, 0); equal(cache.readMedia(scope, key), undefined);
  equal(revoked.includes(video.url), true);
  // A request that started before an account switch cannot repopulate memory.
  let finish;
  const late = new Promise(r => { finish = r; });
  const inFlight = cache.refresh(scope, "user-a", 1, () => late, true);
  await Promise.resolve(); cache.setScope("user-b/session-b"); finish(reply); await inFlight;
  equal(cache.readPage(scope, 1), undefined); equal(cache.readPage("user-b/session-b", 1), undefined);
  cache.setScope(scope);
  let mediaFinish;
  deliver = () => new Promise(r => { mediaFinish = r; });
  const mediaFlight = cache.loadMedia(scope, key, "/fixture", {});
  await Promise.resolve(); cache.setScope(null);
  mediaFinish(new Response(new Uint8Array([1]), { headers: { "Content-Type": "video/mp4", "X-Project-Media-Version": "old", "X-Project-Media-Expires": new Date(now.value + 300_000).toISOString() } }));
  await mediaFlight; equal(cache.readMedia(scope, key), undefined);

  // Actual server gallery projection: all privileged V3 filters use owned IDs,
  // and unchanged cards skip full asset/status enrichment.
  const tables = {
    project_assets: [{ id: randomUUID(), project_id: id, updated_at: "stamp" }],
    generation_jobs: [], ugc_final_executions: [], ugc_v3_runs: [], ugc_v3_artifacts: [], ugc_v3_tasks: [],
  };
  let enriched = [], assetReads = 0;
  const db = {
    from(table) {
      const query = { select(columns) { if (table === "project_assets" && columns === "*") { assetReads++; this.fullAssets = true; } return this; },
        eq() { return this; }, in(column, ids) { if (table.startsWith("ugc_v3")) equal(ids, [id]); return this; }, order() { return this; }, range() { return this; },
        then(resolve) { return Promise.resolve({ data: this.fullAssets ? [] : tables[table], error: null }).then(resolve); } };
      return query;
    },
    rpc: async () => ({ data: {}, error: null }),
  };
  const server = typescriptLoader({
    "next/navigation": { unstable_rethrow: () => {} },
    "@/lib/db/server": { createDatabaseClient: () => db },
    "./server": { readOwnedProjectsIndex: async () => ({ user: { id: "owner-uuid", clerk_user_id: "user-a" }, data: reply.data }) },
    "./card-status-server": { getProjectCardStatuses: async ids => { enriched.push(ids); return { [id]: "final_approved" }; } },
  });
  const { readOwnedProjectsGallery } = server("lib/projects/gallery-server.ts");
  const first = await readOwnedProjectsGallery({ page: 1, known: { [second]: "untrusted" } });
  equal(Object.keys(first.changed), [id]); equal(enriched, [[id]]); equal(assetReads, 1);
  const unchanged = await readOwnedProjectsGallery({ page: 1, known: { [id]: first.changed[id].revision } });
  equal(Object.keys(unchanged.changed), []); equal(enriched.length, 1); equal(assetReads, 1);
  tables.ugc_v3_runs.push({ id: randomUUID(), project_id: id, state: "approved" });
  const changed = await readOwnedProjectsGallery({ page: 1, known: { [id]: first.changed[id].revision } });
  equal(Object.keys(changed.changed), [id]); equal(enriched.length, 2);
  // Actual private delivery service must check approval/ownership even when
  // renewing an already downloaded version without reading its bytes again.
  const owner = randomUUID(), version = "a".repeat(64);
  let approved = true, reads = 0, authorizations = 0;
  const job = { id: randomUUID(), owner_user_id: owner, project_id: id, version,
    state: "ready", lease_token: null, etag: '"saved"', size_bytes: 3 };
  const delivery = typescriptLoader({
    "@/lib/auth/ensure-app-user": { ensureAppUser: async () => { authorizations++; return { id: owner }; } },
    "@/lib/db/server": { createDatabaseClient: () => ({ rpc: async () => ({ data: job, error: null }) }) },
    "@/lib/storage/r2": {},
    "./approved-video": { resolveApprovedProjectVideo: async (acting, projectId) => {
      equal(acting, owner); equal(projectId, id); return approved ? { version } : null;
    } },
    "@/lib/final-video-generation-v3/runtime-media": { readPrivate: async () => { reads++; return new Uint8Array([1, 2, 3]); } },
  });
  const { readOwnedProjectVideoPreviewMedia } = delivery("lib/projects/video-preview-server.ts");
  equal((await readOwnedProjectVideoPreviewMedia(id)).bytes.length, 3); equal(reads, 1);
  equal((await readOwnedProjectVideoPreviewMedia(id, version)).bytes, undefined); equal(reads, 1);
  approved = false;
  equal((await readOwnedProjectVideoPreviewMedia(id, version)).state, "unavailable"); equal(reads, 1);
  equal(authorizations, 3);
  let authChanged, unsubscribed = 0;
  cache.watchIdentity({}, changed => { authChanged = changed; return () => { unsubscribed++; }; });
  cache.setScope(scope);
  await cache.refresh(scope, "user-a", 1, async () => reply, true);
  authChanged(null); equal(cache.readPage(scope, 1), undefined);
  cache.watchIdentity({}, () => () => {}); equal(unsubscribed, 1);
  console.log(JSON.stringify({ checks, realNetworkCalls: 0, paidRequests: 0 }));
} finally { cache.setScope(null); }
