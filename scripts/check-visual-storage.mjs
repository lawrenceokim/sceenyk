// Actual output adapter with explicit HTTP/R2 transport fixtures. No paid calls.
import assert from "node:assert/strict";
import { fileTypeFromBuffer } from "file-type";
import { typescriptLoader } from "./lib/load-typescript.mjs";

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const mp4 = Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex");
let stored = null, downloads = 0, puts = 0, body = mp4, httpStatus = 200;
const savedKey = process.env.FAL_KEY;
process.env.FAL_KEY = "fixture-no-real-requests";
const load = typescriptLoader({
  "file-type": { fileTypeFromBuffer },
  "@/lib/storage/r2": {
    inspectR2Object: async () => stored,
    async putR2SceneOutput(key, bytes) { puts++; stored = { etag: "immutable-etag", mimeType: "video/mp4", sizeBytes: bytes.length, header: bytes }; },
  },
}, { async fetch(url, init) {
  downloads++; assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
  assert.equal(url.hostname, "fixture.fal.media");
  return new Response(body, { status: httpStatus });
} });
try {
  const storage = load("lib/video-ai/storage.ts");
  const scene = { owner_user_id: "owner", project_id: "project", job_id: "job", id: "scene", provider: "fal" };
  check("output key binds owner/project/job/scene", storage.sceneOutputKey(scene) === "users/owner/projects/project/generations/job/scenes/scene.mp4");
  for (const url of ["http://fixture.fal.media/output", "https://127.0.0.1/output", "https://fixture.fal.media.evil.example/output", "https://user:pass@fixture.fal.media/output", "https://fixture.fal.media:8443/output"]) await assert.rejects(storage.persistSceneOutput(scene, url), /INVALID_OUTPUT_URL/);
  check("unsafe provider URLs rejected before download", downloads === 0 && puts === 0);
  let cancelled = false;
  const stream = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(4)); }, cancel() { cancelled = true; } });
  await assert.rejects(storage.boundedBytes(stream, 3), /MEDIA_TOO_LARGE/);
  check("oversized streams cancelled", cancelled);
  body = Buffer.from("not an MP4 file");
  await assert.rejects(storage.persistSceneOutput(scene, "https://fixture.fal.media/output"), /INVALID_OUTPUT/);
  check("invalid video content cannot reach R2", puts === 0);
  body = mp4; httpStatus = 503;
  await assert.rejects(storage.persistSceneOutput(scene, "https://fixture.fal.media/output"), /OUTPUT_DOWNLOAD_FAILED/);
  check("failed download cannot create output", puts === 0);
  httpStatus = 200;
  const result = await storage.persistSceneOutput(scene, "https://fixture.fal.media/output");
  check("verified MP4 persists and returns capability-free metadata", puts === 1 && result.sizeBytes === mp4.length && result.etag === "immutable-etag" && Object.keys(result).length === 2);
  const before = downloads;
  await storage.persistSceneOutput(scene, "https://expired-provider.example/output");
  check("lost completion response recovers existing R2 without provider URL", puts === 1 && downloads === before);
  stored = { ...stored, header: Buffer.from("corrupt immutable file") };
  await assert.rejects(storage.persistSceneOutput(scene, "https://fixture.fal.media/output"), /INVALID_STORED_OUTPUT/);
  check("corrupt existing output never becomes completed metadata", downloads === before && puts === 1);
  console.log(JSON.stringify({ passed: checks.length, checks, scope: "actual output adapter; explicit HTTP/R2 fixtures" }, null, 2));
} finally { if (savedKey === undefined) delete process.env.FAL_KEY; else process.env.FAL_KEY = savedKey; }
