// Focused offline publication, changed-card, media renewal and identity checks.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { typescriptLoader } from "./lib/load-typescript.mjs";

let checks = 0;
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const equal = (a, b) => { assert.deepEqual(plain(a), plain(b)); checks++; };
const id = randomUUID(), other = randomUUID(), owner = randomUUID(), project = randomUUID();
const version = "a".repeat(64), secondVersion = "b".repeat(64);
const binding = { id, creator_user_id: owner, source_project_id: project, updated_at: "saved", preview_etag: null };
let published = true, approved = true, queued = 0, reads = 0, withdrawnDuringRead = false;
let posterReads = 0;
const posterKey = `marketplace-previews/${id}/${randomUUID()}.webp`;
const filters = [];
let job = { id: randomUUID(), owner_user_id: owner, project_id: project, version, state: "ready", lease_token: null, etag: "saved", size_bytes: 3 };
const database = {
  from(table) {
    equal(table, "marketplace_listings");
    return {
      select() { return this; }, in(column, ids) { equal(column, "id"); equal(ids, [id]); return this; },
      eq(...args) { filters.push(args); return this; }, is(...args) { filters.push(args); return this; }, not(...args) { filters.push(args); return this; },
      then(resolve) { return Promise.resolve({ data: published ? [binding] : [], error: null }).then(resolve); },
    };
  },
  async rpc(name, input) {
    if (name === "marketplace_template_preview") {
      equal(input, { p_listing_id: id, p_owner_user_id: null });
      return { data: published ? { key: posterKey, etag: "poster", size: 3 } : null, error: null };
    }
    equal(name, "project_video_preview_request"); equal(input, { p_owner: owner, p_project: project, p_version: version });
    queued++; return { data: job, error: null };
  },
};
const delivery = typescriptLoader({
  "@/lib/db/server": { createDatabaseClient: () => database },
  "@/lib/projects/approved-video": { resolveApprovedProjectVideo: async (user, source) => { equal([user, source], [owner, project]); return approved ? { version } : null; } },
  "@/lib/final-video-generation-v3/runtime-media": { readPrivate: async key => {
    equal(key, `users/${owner}/projects/${project}/project-previews/${version}.mp4`);
    reads++; if (withdrawnDuringRead) published = false; return new Uint8Array([1, 2, 3]);
  } },
  "@/lib/storage/r2": { readR2AnalysisMedia: async key => { equal(key, posterKey); posterReads++; return new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }); } },
}, { Response });
const { readMarketplaceVideoPreview, readMarketplacePoster } = delivery("lib/marketplace/video-preview-server.ts");
equal((await readMarketplaceVideoPreview(id)).bytes.length, 3);
equal(filters.some(args => JSON.stringify(args) === JSON.stringify(["status", "published"])), true);
equal(filters.some(args => JSON.stringify(args) === JSON.stringify(["deleted_at", null])), true);
equal(filters.some(args => JSON.stringify(args) === JSON.stringify(["rights_confirmed_at", "is", null])), true);
equal((await readMarketplaceVideoPreview(id, version)).bytes, undefined); equal(reads, 1);
published = false; equal(await readMarketplaceVideoPreview(id, version), { state: "unavailable" }); equal(queued, 2);
published = true; approved = false; equal(await readMarketplaceVideoPreview(id), { state: "unavailable" }); equal(queued, 2);
approved = true; job = { ...job, state: "queued" }; equal(await readMarketplaceVideoPreview(id), { state: "pending" }); equal(reads, 1);
job = { ...job, state: "ready", owner_user_id: randomUUID() };
await assert.rejects(() => readMarketplaceVideoPreview(id), /SCOPE/); checks++;
job = { ...job, owner_user_id: owner }; withdrawnDuringRead = true;
equal(await readMarketplaceVideoPreview(id), { state: "unavailable" });
withdrawnDuringRead = false; published = true;
const poster = await readMarketplacePoster(id); equal(poster.bytes.length, 3); equal(poster.mimeType, "image/webp");
equal((await readMarketplacePoster(id, poster.version)).bytes, undefined); equal(posterReads, 1);
published = false; equal(await readMarketplacePoster(id, poster.version), { state: "unavailable" }); published = true;

let deliveries = 0;
const routes = typescriptLoader({
  "next/navigation": { unstable_rethrow: () => {} },
  "@/lib/marketplace/video-preview-server": {
    readMarketplaceVideoPreview: async () => { deliveries++; return { state: "ready", version, expiresAt: new Date().toISOString(), mimeType: "video/mp4", bytes: new Uint8Array([1, 2, 3]) }; },
    readMarketplacePoster: async () => ({ state: "unavailable" }),
  },
}, { Response, Request });
const { POST } = routes("app/api/marketplace/video-preview/route.ts");
const request = (body, origin = "https://fixture.invalid") => new Request("https://fixture.invalid/api/marketplace/video-preview", {
  method: "POST", headers: { origin }, body: JSON.stringify(body),
});
equal((await POST(request({ listingId: id }, "https://elsewhere.invalid"))).status, 403); equal(deliveries, 0);
equal((await POST(request({ listingId: id, projectId: project, ownerId: owner }))).status, 404); equal(deliveries, 0);
const videoResponse = await POST(request({ listingId: id }));
equal(videoResponse.status, 200); equal(videoResponse.headers.get("cache-control"), "private, no-store");
equal(videoResponse.headers.get("vercel-cdn-cache-control"), "no-store"); equal(videoResponse.headers.get("content-type"), "video/mp4");
equal(videoResponse.headers.get("x-project-media-version"), version); equal((await videoResponse.arrayBuffer()).byteLength, 3);
equal(await (await POST(request({ listingId: id, kind: "poster" }))).json(), { state: "unavailable" });

const listing = cardId => ({ id: cardId, title: "Saved template", description: "A creative starting point", category: "cinematic", tags: [],
  creatorName: "Creator", creatorSlug: null, creatorAvatar: null,
  template: { version: 1, category: "cinematic", instructions: "Create a cinematic scene", settings: { aspectRatio: "9:16", duration: "5", visualStyle: "Original", tone: "Professional" } },
  adoptionType: "free", priceMinor: 0, currency: "USD", status: "published", createdAt: "saved", publishedAt: "saved", fallbackColor: null, previewUrl: null, estimate: null,
});
let enrichments = 0, publicItems = [listing(id)], stamp = [{ project_id: project, id: randomUUID(), state: "approved", completed_at: "saved" }];
const gallery = typescriptLoader({
  "./server": { browseMarketplace: async () => ({ items: publicItems, total: publicItems.length, page: 1, pageSize: 12 }) },
  "./video-preview-server": { publishedVideoBindings: async ids => ids.includes(id) ? [binding] : [] },
  "@/lib/projects/approved-video": { resolveApprovedProjectVideo: async () => { enrichments++; return approved ? { version } : null; } },
  "@/lib/db/server": { createDatabaseClient: () => ({ from() { return {
    select() { return this; }, in(_column, ids) { equal(ids, [project]); return this; }, order() { return this; }, range() { return this; },
    then(resolve) { return Promise.resolve({ data: stamp, error: null }).then(resolve); },
  }; } }) },
});
const { readMarketplaceGallery } = gallery("lib/marketplace/gallery-server.ts");
const initial = await readMarketplaceGallery({ page: 1 });
equal(initial.changed[id].videoVersion, version); equal(enrichments, 1);
const known = { [id]: initial.changed[id].revision };
equal((await readMarketplaceGallery({ page: 1, known })).changed, {}); equal(enrichments, 1);
approved = false; stamp = [{ project_id: project, id: randomUUID(), state: "deleted" }];
equal((await readMarketplaceGallery({ page: 1, known })).changed[id].videoVersion, null);
publicItems = []; equal((await readMarketplaceGallery({ page: 1, known })).ids, []);

let now = Date.now(), calls = 0, blobCount = 0, respond;
const revoked = [];
const load = typescriptLoader({}, {
  AbortController,
  Date: class extends Date { static now() { return now; } },
  URL: { createObjectURL: () => `blob:fixture-${++blobCount}`, revokeObjectURL: url => revoked.push(url) },
  fetch: async (...args) => { calls++; return respond(...args); },
});
const { MarketplaceSessionCache } = load("lib/marketplace/session-cache.ts");
const cache = new MarketplaceSessionCache(), scope = "account/session", filter = { query: "", category: null, page: 1 };
const card = { ...listing(id), revision: version, videoVersion: version, posterVersion: null }, second = { ...listing(other), revision: secondVersion, videoVersion: null, posterVersion: null };
const reply = { ids: [id, other], changed: { [id]: card, [other]: second }, total: 2, page: 1, pages: 1 };
try {
  cache.setScope(scope);
  let finish;
  respond = () => new Promise(resolve => { finish = resolve; });
  const first = cache.refreshFeed(scope, filter), duplicate = cache.refreshFeed(scope, filter);
  await Promise.resolve(); equal(calls, 1); finish(Response.json(reply)); await Promise.all([first, duplicate]);
  const snapshot = cache.readFeed(scope, filter); equal(snapshot.items.length, 2);
  equal(cache.readFeed("another/session", filter), undefined);
  cache.feedScroll(scope, filter, 321); equal(cache.feedScroll(scope, filter), 321);
  await cache.refreshFeed(scope, filter); equal(calls, 1);
  now += 15_001;
  respond = async () => Response.json({ ...reply, changed: {} });
  await cache.refreshFeed(scope, filter); assert.equal(cache.readFeed(scope, filter), snapshot); checks++;
  now += 15_001;
  respond = async () => Response.json({ ...reply, changed: { [id]: { ...card, revision: "c".repeat(64), title: "Updated template" } } });
  await cache.refreshFeed(scope, filter);
  assert.equal(cache.readFeed(scope, filter).items[1], snapshot.items[1]); checks++;
  equal(cache.readFeed(scope, filter).items[0].title, "Updated template");
  const key = `video:marketplace:${id}`;
  respond = async () => new Response(new Uint8Array([1, 2, 3]), { headers: {
    "Content-Type": "video/mp4", "X-Project-Media-Version": version, "X-Project-Media-Expires": new Date(now + 300_000).toISOString(),
  } });
  await Promise.all([cache.loadMedia(scope, key, "/fixture", {}), cache.loadMedia(scope, key, "/fixture", {})]); equal(blobCount, 1);
  const media = cache.readMedia(scope, key); now += 300_001; equal(cache.readMedia(scope, key), undefined);
  respond = async (_url, init) => { equal(JSON.parse(init.body).version, version); return Response.json({ state: "ready", version, expiresAt: new Date(now + 300_000).toISOString() }); };
  await cache.loadMedia(scope, key, "/fixture", {}); equal(cache.readMedia(scope, key).url, media.url); equal(blobCount, 1);
  respond = async () => Response.json({ ...reply, ids: [other], changed: {} });
  await cache.refreshFeed(scope, filter); equal(cache.readMedia(scope, key), undefined); equal(cache.readFeed(scope, filter).items.length, 1);
  now += 15_001; respond = async () => { throw new Error("offline"); };
  await assert.rejects(() => cache.refreshFeed(scope, filter)); checks++;
  equal(cache.readFeed(scope, filter).items.length, 1);
  const before = calls; await assert.rejects(() => cache.refreshFeed(scope, filter), /RETRY_LATER/); checks++; equal(calls, before);
  cache.retryFeed(scope, filter); respond = () => new Promise(resolve => { finish = resolve; });
  const late = cache.refreshFeed(scope, filter); await Promise.resolve(); cache.setScope("new/session"); finish(Response.json(reply)); await late;
  equal(cache.readFeed("new/session", filter), undefined); equal(cache.readFeed(scope, filter), undefined);
  equal(cache.feedScroll(scope, filter), undefined); equal(revoked.includes(media.url), true);
} finally { cache.setScope(null); }
console.log(JSON.stringify({ checks, realNetworkCalls: 0, paidRequests: 0 }));
