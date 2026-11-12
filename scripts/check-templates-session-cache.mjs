// Essential offline owner/media, unchanged-card, race and cache checks only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { typescriptLoader } from "./lib/load-typescript.mjs";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let checks = 0;
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const equal = (a, b) => { assert.deepEqual(plain(a), plain(b)); checks++; };
const id = randomUUID(), secondId = randomUUID(), foreignId = randomUUID(), owner = randomUUID(), project = randomUUID(), assetId = randomUUID();
const version = "a".repeat(64), nextVersion = "b".repeat(64);
const listing = { id, title: "Saved template", description: "A creative starting point", category: "cinematic", tags: [],
  creatorName: "Creator", creatorSlug: null, creatorAvatar: null,
  template: { version: 1, category: "cinematic", instructions: "Create a cinematic scene", settings: { aspectRatio: "9:16", duration: "5", visualStyle: "Original", tone: "Professional" } },
  adoptionType: "free", priceMinor: 0, currency: "USD", status: "published", createdAt: "2026-11-12", publishedAt: "2026-11-12", fallbackColor: null, previewUrl: null,
  sourceProjectId: project, rightsConfirmed: true, adoptionCount: 0, paidSalesCount: 0, creatorEarningsMinor: 0 };
const binding = { id, source_project_id: project, updated_at: "saved", preview_etag: null };
let currentListing = listing, available = true, videoReads = 0, privateReads = 0, removeWhileReading = false, thumbnailReads = 0;
const source = { projectId: project, assetId, kind: "image" };
const rpc = async (name, input) => {
  if (name === "marketplace_owned_listing") {
    equal(input.p_owner_user_id, owner); equal(input.p_project_id, null);
    return { data: available && input.p_listing_id === id ? currentListing : null, error: null };
  }
  if (name === "marketplace_template_source") { equal(input, { p_listing_id: id, p_owner_user_id: owner }); return { data: source, error: null }; }
  if (name === "marketplace_template_preview") {
    equal(input, { p_listing_id: id, p_owner_user_id: owner });
    return { data: { key: `marketplace-previews/${id}/${assetId}.webp`, etag: "poster", size: 3 }, error: null };
  }
  throw new Error(`Unexpected RPC ${name}`);
};
const tables = { project_assets: [{ id: assetId, project_id: project, owner_user_id: owner, media_type: "image", verified_etag: "source", upload_status: "uploaded", removed_from_draft: false }] };
const db = { rpc, from(table) {
  const filters = [];
  return { select() { return this; }, eq(...args) { filters.push(args); return this; },
    async maybeSingle() {
      equal(filters.some(pair => pair[0] === "owner_user_id" && pair[1] === owner), true);
      return { data: tables[table]?.[0] ?? null, error: null };
    },
  };
} };
const mediaLoad = typescriptLoader({
  "@/lib/auth/read-app-user": { readAppUser: async () => ({ id: owner, clerk_user_id: "account" }) },
  "@/lib/db/server": { createDatabaseClient: () => db },
  "@/lib/projects/video-preview-server": { readOwnedProjectVideoPreviewMedia: async (sourceProject, known) => {
    equal(sourceProject, project); videoReads++; if (removeWhileReading) available = false;
    return { state: "ready", version, expiresAt: new Date(Date.now() + 300000).toISOString(), ...(known === version ? {} : { mimeType: "video/mp4", bytes: new Uint8Array([1, 2, 3]) }) };
  } },
  "@/lib/projects/thumbnail-server": { readOwnedProjectThumbnail: async input => { equal(input.projectId, project); equal(input.assetId, assetId); thumbnailReads++; return { state: "unavailable" }; } },
  "@/lib/final-video-generation-v3/runtime-media": { readPrivate: async key => { equal(key, `marketplace-previews/${id}/${assetId}.webp`); privateReads++; return new Uint8Array([1, 2, 3]); } },
  "@/lib/storage/server": { createReadUrl: async () => { throw new Error("Unexpected signing"); } },
});
const { readTemplateMedia } = mediaLoad("lib/templates/media-server.ts");
equal(await readTemplateMedia({ listingId: foreignId, kind: "video" }), { state: "unavailable" }); equal(videoReads, 0);
currentListing = { ...listing, status: "draft" };
equal(await readTemplateMedia({ listingId: id, kind: "video" }), { state: "unavailable" }); equal(videoReads, 0);
currentListing = listing;
equal((await readTemplateMedia({ listingId: id, kind: "video" })).bytes.length, 3);
equal((await readTemplateMedia({ listingId: id, kind: "video", version })).bytes, undefined); equal(videoReads, 2);
removeWhileReading = true; equal(await readTemplateMedia({ listingId: id, kind: "video" }), { state: "unavailable" });
removeWhileReading = false; available = true;
equal(await readTemplateMedia({ listingId: id, kind: "poster" }), { state: "unavailable" }); equal(thumbnailReads, 1);
currentListing = { ...listing, previewUrl: `/api/marketplace/listings/${id}/preview` };
const poster = await readTemplateMedia({ listingId: id, kind: "poster" }); equal(poster.bytes.length, 3);
equal((await readTemplateMedia({ listingId: id, kind: "poster", version: poster.version })).bytes, undefined); equal(privateReads, 1);
await assert.rejects(() => readTemplateMedia({ listingId: id, kind: "video", ownerId: owner })); checks++;

let enrichments = 0, galleryItems = [listing], stamp = [{ project_id: project, id: randomUUID(), state: "approved", completed_at: "saved" }];
const galleryLoad = typescriptLoader({
  "@/lib/auth/read-app-user": { readAppUser: async () => ({ id: owner, clerk_user_id: "account" }) },
  "@/lib/marketplace/server": { withEstimate: item => ({ ...item, estimate: null }) },
  "@/lib/projects/approved-video": { resolveApprovedProjectVideo: async (acting, ownedProject) => { equal([acting, ownedProject], [owner, project]); enrichments++; return { version }; } },
  "@/lib/db/server": { createDatabaseClient: () => ({
    rpc: async (name, input) => {
      if (name === "marketplace_owned") { equal(input, { p_owner_user_id: owner, p_page: 1 }); return { data: { items: galleryItems, total: galleryItems.length, page: 1, pageSize: 12 }, error: null }; }
      return rpc(name, input);
    },
    from(table) { const filters = []; return {
      select() { return this; }, eq(...args) { filters.push(args); return this; }, is() { return this; }, order() { return this; }, range() { return this; },
      in(column, ids) { equal(ids, table === "marketplace_listings" ? [id] : [project]); return this; },
      then(resolve) {
        if (["marketplace_listings", "projects", "project_assets", "ugc_final_executions"].includes(table))
          equal(filters.some(pair => pair[0] === (table === "marketplace_listings" ? "creator_user_id" : "owner_user_id") && pair[1] === owner), true);
        return Promise.resolve({ data: table === "marketplace_listings" ? [binding] : stamp, error: null }).then(resolve);
      },
    }; },
  }) },
});
const { readTemplatesGallery } = galleryLoad("lib/templates/gallery-server.ts");
const initial = await readTemplatesGallery({ page: 1, known: { [foreignId]: nextVersion } });
equal(initial.clerkUserId, "account"); equal(initial.changed[id].videoVersion, version); equal(enrichments, 1);
const known = { [id]: initial.changed[id].revision };
equal((await readTemplatesGallery({ page: 1, known })).changed, {}); equal(enrichments, 1);
galleryItems = [{ ...listing, status: "draft" }];
equal((await readTemplatesGallery({ page: 1, known })).changed[id].videoVersion, null); equal(enrichments, 1);
galleryItems = []; equal((await readTemplatesGallery({ page: 1, known })).ids, []);

let now = Date.now(), calls = 0, blobCount = 0, respond;
const revoked = [];
const cacheLoad = typescriptLoader({}, {
  AbortController,
  Date: class extends Date { static now() { return now; } },
  URL: { createObjectURL: () => `blob:fixture-${++blobCount}`, revokeObjectURL: url => revoked.push(url) },
  fetch: async (...args) => { calls++; return respond(...args); },
});
const { TemplatesSessionCache } = cacheLoad("lib/templates/session-cache.ts");
const cache = new TemplatesSessionCache(), scope = "account/session";
const card = { ...listing, estimate: null, revision: version, videoVersion: version, posterVersion: version, posterKind: "image" };
const second = { ...card, id: secondId, revision: nextVersion, videoVersion: null };
const reply = { clerkUserId: "account", page: 1, pageSize: 12, total: 2, ids: [id, secondId], changed: { [id]: card, [secondId]: second } };
try {
  cache.setScope(scope);
  let finish;
  respond = () => new Promise(resolve => { finish = resolve; });
  const first = cache.refreshGallery(scope, "account", 1), duplicate = cache.refreshGallery(scope, "account", 1);
  await Promise.resolve(); equal(calls, 1); finish(Response.json(reply)); await Promise.all([first, duplicate]);
  const snapshot = cache.readGallery(scope, 1); equal(snapshot.items.length, 2);
  equal(cache.readGallery("another/session", 1), undefined);
  cache.galleryScroll(scope, 1, 321); equal(cache.galleryScroll(scope, 1), 321);
  await cache.refreshGallery(scope, "account", 1); equal(calls, 1);
  now += 15001; respond = async () => Response.json({ ...reply, changed: {} });
  await cache.refreshGallery(scope, "account", 1); assert.equal(cache.readGallery(scope, 1), snapshot); checks++;
  now += 15001; respond = async () => Response.json({ ...reply, changed: { [id]: { ...card, title: "Updated template", revision: "c".repeat(64) } } });
  await cache.refreshGallery(scope, "account", 1);
  assert.equal(cache.readGallery(scope, 1).items[1], snapshot.items[1]); checks++;
  equal(cache.readGallery(scope, 1).items[0].title, "Updated template");
  const key = `video:templates:${id}`;
  respond = async () => new Response(new Uint8Array([1, 2, 3]), { headers: {
    "Content-Type": "video/mp4", "X-Project-Media-Version": version, "X-Project-Media-Expires": new Date(now + 300000).toISOString(),
  } });
  await Promise.all([cache.loadMedia(scope, key, "/fixture", {}), cache.loadMedia(scope, key, "/fixture", {})]); equal(blobCount, 1);
  const media = cache.readMedia(scope, key); now += 300001; equal(cache.readMedia(scope, key), undefined);
  respond = async (_url, input) => { equal(JSON.parse(input.body).version, version); return Response.json({ state: "ready", version, expiresAt: new Date(now + 300000).toISOString() }); };
  await cache.loadMedia(scope, key, "/fixture", {}); equal(cache.readMedia(scope, key).url, media.url); equal(blobCount, 1);
  respond = () => new Promise(resolve => { finish = resolve; });
  const stale = cache.refreshGallery(scope, "account", 1); await Promise.resolve();
  cache.removeTemplate(scope, id); finish(Response.json(reply)); await stale;
  equal(cache.readGallery(scope, 1).items.length, 1); equal(cache.readMedia(scope, key), undefined);
  respond = async () => { throw new Error("offline"); };
  await assert.rejects(() => cache.refreshGallery(scope, "account", 1)); checks++;
  const before = calls; await assert.rejects(() => cache.refreshGallery(scope, "account", 1), /RETRY_LATER/); checks++; equal(calls, before);
  equal(cache.readGallery(scope, 1).items.length, 1);
  cache.retryGallery(scope, 1); respond = () => new Promise(resolve => { finish = resolve; });
  const late = cache.refreshGallery(scope, "account", 1); await Promise.resolve(); cache.setScope("new/session"); finish(Response.json(reply)); await late;
  equal(cache.readGallery("new/session", 1), undefined); equal(cache.readGallery(scope, 1), undefined); equal(revoked.includes(media.url), true);
  cache.setScope(scope); respond = async () => Response.json({ ...reply, clerkUserId: "another" });
  await assert.rejects(() => cache.refreshGallery(scope, "account", 1), /ACCOUNT_CHANGED/); checks++;
  equal(cache.readGallery(scope, 1), undefined);
} finally { cache.setScope(null); }

// The shared player hook retains Marketplace defaults and uses the Templates
// descriptor only when explicitly provided. No React renderer or browser needed.
const mediaCalls = [], effects = [];
const fakeCache = { subscribe() {}, readMedia() {}, mediaInvalidation: () => 0, loadMedia: async (...args) => { mediaCalls.push(args); } };
const hookFile = fs.readFileSync("components/marketplace/gallery-cache.tsx", "utf8");
const hookCode = ts.transpileModule(hookFile.slice(hookFile.indexOf("export function useMarketplacePreview")), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const hookExports = {};
vm.runInNewContext(hookCode, { exports: hookExports, MarketplaceCacheScope: {}, marketplaceSessionCache: fakeCache,
  noSnapshot: () => undefined, useContext: () => "market/session", useSyncExternalStore: (_subscribe, read) => read(),
  useEffect: effect => { effects.push(effect()); }, setTimeout, clearTimeout });
const { useMarketplacePreview: inspectPreviewHook } = hookExports;
inspectPreviewHook(id); await Promise.resolve();
equal(mediaCalls[0].slice(0, 4), ["market/session", `video:marketplace:${id}`, "/api/marketplace/video-preview", { listingId: id, kind: "video" }]);
inspectPreviewHook(id, "poster", true, { cache: fakeCache, scope, namespace: "templates", endpoint: "/api/templates/preview" }); await Promise.resolve();
equal(mediaCalls[1].slice(0, 4), [scope, `thumbnail:templates:${id}`, "/api/templates/preview", { listingId: id, kind: "poster" }]);
effects.forEach(cleanup => cleanup?.());
console.log(JSON.stringify({ checks, realNetworkCalls: 0, paidRequests: 0 }));
