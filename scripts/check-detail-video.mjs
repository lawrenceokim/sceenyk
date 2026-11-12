// Essential offline access, immutable-media and native seek checks only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { typescriptLoader } from "./lib/load-typescript.mjs";

let checks = 0;
const equal = (a, b) => { assert.equal(a, b); checks++; };
const owner = randomUUID(), foreign = randomUUID(), project = randomUUID(), id = randomUUID();
const version = "a".repeat(64), etag = '"stored-final"';
const video = { version, storageKey: `users/${owner}/projects/${project}/v3/${randomUUID()}.mp4`, etag, sha256: "b".repeat(64), sizeBytes: 100 };
const listing = { id, title: "Saved template", description: "Creative starting point", category: "cinematic", tags: [], creatorName: "Creator",
  template: { version: 1, category: "cinematic", instructions: "Create a cinematic scene", settings: { aspectRatio: "9:16", duration: "5", visualStyle: "Original", tone: "Professional" } },
  adoptionType: "free", priceMinor: 0, currency: "USD", status: "published", createdAt: "saved", publishedAt: "saved", sourceProjectId: project,
  rightsConfirmed: true, adoptionCount: 0, paidSalesCount: 0, creatorEarningsMinor: 0 };
const binding = { id, creator_user_id: owner, source_project_id: project, updated_at: "saved", preview_etag: "reviewed" };
let actor = owner, currentListing = listing, currentBinding = binding, approved = true, approvalReads = 0;
const loader = typescriptLoader({
  "@/lib/auth/read-app-user": { readAppUser: async () => ({ id: actor }) },
  "@/lib/db/server": { createDatabaseClient: () => ({ rpc: async (name, input) => {
    equal(name, "marketplace_owned_listing"); equal(input.p_owner_user_id, actor);
    return { data: actor === owner && input.p_listing_id === id ? currentListing : null, error: null };
  } }) },
  "@/lib/marketplace/video-preview-server": { publishedVideoBindings: async ids => ids[0] === id && currentBinding ? [currentBinding] : [] },
  "@/lib/projects/approved-video": { resolveApprovedProjectVideo: async (user, target) => {
    approvalReads++; return approved && user === owner && target === project ? video : null;
  } },
});
const service = loader("lib/media/detail-video-server.ts");
equal((await service.resolveDetailVideo("project", project)).video, video);
actor = foreign;
equal(await service.resolveDetailVideo("project", project), null);
equal(await service.resolveDetailVideo("template", id), null);
actor = owner;
currentListing = { ...listing, status: "draft" }; const beforeDraft = approvalReads;
equal(await service.resolveDetailVideo("template", id), null); equal(approvalReads, beforeDraft);
currentListing = listing;
equal((await service.resolveDetailVideo("template", id)).video, video);
const owned = await service.resolveDetailVideo("template", id);
currentListing = null; equal(await owned.stillAllowed(), false); currentListing = listing;
equal((await service.resolveDetailVideo("marketplace", id)).video, video);
currentBinding = { ...binding, preview_etag: null };
equal(await service.resolveDetailVideo("marketplace", id), null);
currentBinding = null; equal(await service.resolveDetailVideo("marketplace", id), null);
currentBinding = binding;
const shared = await service.resolveDetailVideo("marketplace", id);
currentBinding = { ...binding, updated_at: "changed" }; equal(await shared.stillAllowed(), false);
currentBinding = binding; approved = false;
for (const kind of ["project", "template", "marketplace"]) equal(await service.resolveDetailVideo(kind, kind === "project" ? project : id), null);
approved = true;
equal(service.detailVideoRange("bytes=10-19", 100).length, 10);
equal(service.detailVideoRange("bytes=90-", 100).header, "bytes=90-99");
equal(service.detailVideoRange("bytes=-10", 100).first, 90);
equal(service.detailVideoRange("bytes=-200", 100).length, 100);
equal(service.detailVideoRange("bytes=0-200", 100).last, 99);
for (const range of ["bytes=100-", "bytes=-0", "bytes=4-3", "bytes=0-3,8-9", "bytes=-", "invalid", "bytes=9007199254740992-"]) {
  assert.throws(() => service.detailVideoRange(range, 100)); checks++;
}
let fetches = 0, allowed = true, rejectMetadata = false;
const routeLoader = typescriptLoader({
  "next/navigation": { unstable_rethrow() {} },
  "@/lib/media/detail-video-server": { ...service, resolveDetailVideo: async () => ({ video, stillAllowed: async () => allowed }) },
  "@/lib/storage/r2": { signR2Read: async (key, storedEtag, mime) => {
    equal(key, video.storageKey); equal(storedEtag, etag); equal(mime, "video/mp4"); return { url: "https://storage.invalid/private-capability" };
  } },
}, { Response, fetch: async (url, options) => {
  fetches++; equal(url, "https://storage.invalid/private-capability"); equal(options.cache, "no-store"); equal(options.redirect, "error"); equal(options.headers["If-Match"], etag);
  const range = service.detailVideoRange(options.headers.Range ?? null, 100);
  return new Response(new Uint8Array(range?.length ?? 100).fill(7), { status: range ? 206 : 200, headers: { "Content-Length": String(range?.length ?? 100),
    "Content-Type": "video/mp4", ETag: rejectMetadata ? '"replaced"' : etag, ...(range ? { "Content-Range": range.contentRange } : {}) } });
} });
const { GET } = routeLoader("app/api/detail-video/route.ts");
const request = (headers = {}, query = { kind: "marketplace", id, version }) => new Request(`https://sceenyk.invalid/api/detail-video?${new URLSearchParams(query)}`, { headers });
let response = await GET(request());
equal(response.status, 200); equal(response.headers.get("location"), null); equal(response.headers.get("cache-control"), "private, no-store");
equal(response.headers.get("accept-ranges"), "bytes"); equal((await response.arrayBuffer()).byteLength, 100);
response = await GET(request({ Range: "bytes=20-29" }));
equal(response.status, 206); equal(response.headers.get("content-range"), "bytes 20-29/100"); equal((await response.arrayBuffer()).byteLength, 10);
const beforeDenied = fetches;
equal((await GET(request({ Range: "bytes=100-" }))).status, 416);
equal((await GET(request({ Origin: "https://other.invalid" }))).status, 403);
equal((await GET(request({ "Sec-Fetch-Site": "cross-site" }))).status, 403);
equal((await GET(request({}, { kind: "marketplace", id, version: "b".repeat(64) }))).status, 404);
equal((await GET(request({}, { kind: "marketplace", id, version, owner }))).status, 404);
equal(fetches, beforeDenied);
allowed = false; response = await GET(request()); equal(response.status, 404); equal(await response.text(), "Video unavailable");
allowed = true; rejectMetadata = true; equal((await GET(request())).status, 404);
console.log(JSON.stringify({ checks, realNetworkCalls: 0, workerOrProviderCalls: 0 }));
