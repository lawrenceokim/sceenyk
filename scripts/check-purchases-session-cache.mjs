// Focused offline buyer authorization, changed cards, expiry and request races.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { typescriptLoader } from "./lib/load-typescript.mjs";

let checks = 0;
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const equal = (a, b) => { assert.deepEqual(plain(a), plain(b)); checks++; };
const id = randomUUID(), secondId = randomUUID(), listingId = randomUUID(), secondListing = randomUUID(), foreign = randomUUID();
const creator = randomUUID(), project = randomUUID(), version = "a".repeat(64), nextVersion = "b".repeat(64);
const purchase = { id, listingId, title: "Saved template", description: "A creative starting point", creatorName: "Creator", creatorSlug: null, creatorAvatar: null,
  template: { version: 1, category: "cinematic", instructions: "Create a cinematic scene", settings: { aspectRatio: "9:16", duration: "5", visualStyle: "Original", tone: "Professional" } },
  kind: "paid", amountMinor: 500, acquiredAt: "2026-11-12T10:00:00Z", financialStatus: "completed", listingAvailable: true, previewUrl: `/api/purchases/${id}/preview` };
const free = { ...purchase, id: secondId, listingId: secondListing, kind: "free", amountMinor: 0, financialStatus: "free", listingAvailable: false, previewUrl: `/api/purchases/${secondId}/preview` };
let actor = "buyer", shared = true, videoReads = 0, posterReads = 0, removeWhileReading = false;
const acquired = async input => input === id && actor === "buyer" ? { purchase, clerkUserId: actor } : null;
const poster = { listingId, key: `marketplace-previews/${listingId}/${id}.webp`, etag: "poster", size: 3 };
const mediaLoad = typescriptLoader({
  "@/lib/marketplace/purchases/server": { getAcquiredTemplate: acquired, getAcquiredTemplatePreview: async input => {
    equal(input, id); return actor === "buyer" ? poster : null;
  } },
  "@/lib/marketplace/video-preview-server": { readMarketplaceVideoPreview: async (input, known) => {
    equal(input, listingId); videoReads++;
    if (!shared) return { state: "unavailable" };
    if (removeWhileReading) actor = "other";
    return { state: "ready", version, expiresAt: new Date(Date.now() + 300000).toISOString(), ...(known === version ? {} : { mimeType: "video/mp4", bytes: new Uint8Array([1, 2, 3]) }) };
  } },
  "@/lib/storage/r2": { readR2AnalysisMedia: async (key, etag, bytes) => {
    equal([key, etag, bytes], [poster.key, "poster", 3]); posterReads++;
    return new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } });
  } },
}, { Response });
const { readPurchaseMedia } = mediaLoad("lib/purchases/media-server.ts");
equal(await readPurchaseMedia({ listingId: foreign, kind: "video" }), { state: "unavailable" }); equal(videoReads, 0);
equal(await readPurchaseMedia({ listingId, kind: "video" }), { state: "unavailable" }); equal(videoReads, 0); // A listing UUID is not an acquisition.
equal((await readPurchaseMedia({ listingId: id, kind: "video" })).bytes.length, 3);
equal((await readPurchaseMedia({ listingId: id, kind: "video", version })).bytes, undefined); equal(videoReads, 2);
shared = false; equal(await readPurchaseMedia({ listingId: id, kind: "video", version }), { state: "unavailable" });
const image = await readPurchaseMedia({ listingId: id, kind: "poster" }); equal(image.bytes.length, 3);
equal((await readPurchaseMedia({ listingId: id, kind: "poster", version: image.version })).bytes, undefined); equal(posterReads, 1);
actor = "other"; equal(await readPurchaseMedia({ listingId: id, kind: "poster" }), { state: "unavailable" }); equal(posterReads, 1);
actor = "buyer"; shared = true; removeWhileReading = true;
equal(await readPurchaseMedia({ listingId: id, kind: "video" }), { state: "unavailable" });
removeWhileReading = false; actor = "buyer";
await assert.rejects(() => readPurchaseMedia({ listingId: id, kind: "video", ownerId: creator, projectId: project })); checks++;

const binding = { id: listingId, creator_user_id: creator, source_project_id: project, updated_at: "saved", preview_etag: "poster" };
let items = [purchase, free], enriched = 0;
const metadata = [{ id: listingId, updated_at: "saved", preview_etag: "poster" }, { id: secondListing, updated_at: "saved", preview_etag: "historical" }];
const stamps = [{ id: randomUUID(), project_id: project, state: "approved", completed_at: "saved" }];
const galleryLoad = typescriptLoader({
  "@/lib/marketplace/purchases/server": { getAcquiredTemplates: async page => ({ items, page, pageSize: 12, total: items.length, clerkUserId: actor }) },
  "@/lib/marketplace/video-preview-server": { publishedVideoBindings: async ids => { equal(ids, items.map(item => item.listingId)); return shared && items.length ? [binding] : []; } },
  "@/lib/projects/approved-video": { resolveApprovedProjectVideo: async (owner, source) => { equal([owner, source], [creator, project]); enriched++; return { version }; } },
  "@/lib/db/server": { createDatabaseClient: () => ({ from(table) { return {
    select() { return this; }, order() { return this; }, range() { return this; },
    in(_column, ids) { equal(ids, table === "marketplace_listings" ? items.map(item => item.listingId) : [project]); return this; },
    then(resolve) { return Promise.resolve({ data: table === "marketplace_listings" ? metadata : stamps, error: null }).then(resolve); },
  }; } }) },
});
const { readPurchasesGallery } = galleryLoad("lib/purchases/gallery-server.ts");
const initial = await readPurchasesGallery({ page: 1, known: { [foreign]: nextVersion } });
equal(initial.ids, [id, secondId]); equal(initial.changed[id].videoVersion, version); equal(initial.changed[secondId].videoVersion, null);
equal(initial.changed[id].amountMinor, 500); equal(initial.changed[secondId].kind, "free"); equal(enriched, 1);
const known = Object.fromEntries(Object.entries(initial.changed).map(([key, card]) => [key, card.revision]));
equal((await readPurchasesGallery({ page: 1, known })).changed, {}); equal(enriched, 1);
items = [{ ...purchase, financialStatus: "refunded" }, free];
const changed = await readPurchasesGallery({ page: 1, known }); equal(Object.keys(changed.changed), [id]); equal(changed.changed[id].financialStatus, "refunded");
equal(changed.changed[id].amountMinor, 500); // Historical paid amount is retained.
shared = false; const unavailable = await readPurchasesGallery({ page: 1, known });
equal(unavailable.ids, [id, secondId]); equal(unavailable.changed[id].videoVersion, null); equal(unavailable.changed[id].previewUrl, purchase.previewUrl);
equal(JSON.stringify(unavailable).includes(project), false); equal(JSON.stringify(unavailable).includes(creator), false);
items = []; equal((await readPurchasesGallery({ page: 1, known })).ids, []);
await assert.rejects(() => readPurchasesGallery({ page: 1, ownerId: creator })); checks++;

let now = Date.now(), calls = 0, blobCount = 0, respond;
const revoked = [];
const cacheLoad = typescriptLoader({}, {
  AbortController, Date: class extends Date { static now() { return now; } },
  URL: { createObjectURL: () => `blob:fixture-${++blobCount}`, revokeObjectURL: url => revoked.push(url) },
  fetch: async (...args) => { calls++; return respond(...args); },
});
const { PurchasesSessionCache } = cacheLoad("lib/purchases/session-cache.ts");
const cache = new PurchasesSessionCache(), scope = "buyer/session";
const card = { ...purchase, revision: version, videoVersion: version, posterVersion: version };
const second = { ...free, revision: nextVersion, videoVersion: null, posterVersion: nextVersion };
const reply = { clerkUserId: "buyer", page: 1, pageSize: 12, total: 2, ids: [id, secondId], changed: { [id]: card, [secondId]: second } };
try {
  cache.setScope(scope);
  let finish;
  respond = () => new Promise(resolve => { finish = resolve; });
  const first = cache.refreshGallery(scope, "buyer", 1), duplicate = cache.refreshGallery(scope, "buyer", 1);
  await Promise.resolve(); equal(calls, 1); finish(Response.json(reply)); await Promise.all([first, duplicate]);
  const snapshot = cache.readGallery(scope, 1); equal(snapshot.items.length, 2); equal(cache.readGallery("another/session", 1), undefined);
  cache.galleryScroll(scope, 1, 321); equal(cache.galleryScroll(scope, 1), 321);
  await cache.refreshGallery(scope, "buyer", 1); equal(calls, 1);
  now += 15001; respond = async () => Response.json({ ...reply, changed: {} });
  await cache.refreshGallery(scope, "buyer", 1); assert.equal(cache.readGallery(scope, 1), snapshot); checks++;
  now += 15001; respond = async () => Response.json({ ...reply, changed: { [id]: { ...card, financialStatus: "refunded", revision: "c".repeat(64) } } });
  await cache.refreshGallery(scope, "buyer", 1); assert.equal(cache.readGallery(scope, 1).items[1], snapshot.items[1]); checks++;
  equal(cache.readGallery(scope, 1).items[0].financialStatus, "refunded");
  const key = `video:purchases:${id}`;
  respond = async () => new Response(new Uint8Array([1, 2, 3]), { headers: {
    "Content-Type": "video/mp4", "X-Project-Media-Version": version, "X-Project-Media-Expires": new Date(now + 300000).toISOString(),
  } });
  await Promise.all([cache.loadMedia(scope, key, "/fixture", {}), cache.loadMedia(scope, key, "/fixture", {})]); equal(blobCount, 1);
  const media = cache.readMedia(scope, key); now += 300001; equal(cache.readMedia(scope, key), undefined);
  respond = async (_url, input) => { equal(JSON.parse(input.body).version, version); return Response.json({ state: "ready", version, expiresAt: new Date(now + 300000).toISOString() }); };
  await cache.loadMedia(scope, key, "/fixture", {}); equal(cache.readMedia(scope, key).url, media.url); equal(blobCount, 1);
  respond = async () => Response.json({ ...reply, changed: { [id]: { ...card, revision: "d".repeat(64), videoVersion: null } } });
  await cache.refreshGallery(scope, "buyer", 1); equal(cache.readMedia(scope, key), undefined);
  now += 15001; respond = async () => { throw new Error("offline"); };
  await assert.rejects(() => cache.refreshGallery(scope, "buyer", 1)); checks++;
  const before = calls; await assert.rejects(() => cache.refreshGallery(scope, "buyer", 1), /RETRY_LATER/); checks++; equal(calls, before);
  equal(cache.readGallery(scope, 1).items.length, 2);
  cache.retryGallery(scope, 1); respond = () => new Promise(resolve => { finish = resolve; });
  const late = cache.refreshGallery(scope, "buyer", 1); await Promise.resolve(); cache.setScope("other/session"); finish(Response.json(reply)); await late;
  equal(cache.readGallery("other/session", 1), undefined); equal(cache.readGallery(scope, 1), undefined); equal(revoked.includes(media.url), true);
  cache.setScope(scope); respond = async () => Response.json({ ...reply, clerkUserId: "other" });
  await assert.rejects(() => cache.refreshGallery(scope, "buyer", 1), /ACCOUNT_CHANGED/); checks++; equal(cache.readGallery(scope, 1), undefined);
} finally { cache.setScope(null); }

const routeLoad = typescriptLoader({
  "next/navigation": { unstable_rethrow: () => {} },
  "@/lib/purchases/media-server": { readPurchaseMedia: async () => ({ state: "ready", version, expiresAt: new Date().toISOString(), mimeType: "video/mp4", bytes: new Uint8Array([1, 2, 3]) }) },
}, { Response, Request });
const { POST } = routeLoad("app/api/purchases/preview/route.ts");
const request = origin => new Request("https://fixture.invalid/api/purchases/preview", { method: "POST", headers: { origin }, body: JSON.stringify({ listingId: id, kind: "video" }) });
equal((await POST(request("https://other.invalid"))).status, 403);
const response = await POST(request("https://fixture.invalid")); equal(response.status, 200);
equal(response.headers.get("cache-control"), "private, no-store"); equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
equal(response.headers.get("content-type"), "video/mp4"); equal((await response.arrayBuffer()).byteLength, 3);
console.log(JSON.stringify({ checks, realNetworkCalls: 0, paidRequests: 0 }));
