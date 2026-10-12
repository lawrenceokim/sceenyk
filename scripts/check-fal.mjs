// Official fal SDK transport fixtures. This script cannot purchase generation.
import assert from "node:assert/strict";
import { typescriptLoader } from "./lib/load-typescript.mjs";
const before = process.env.FAL_KEY;
process.env.FAL_KEY = "fal-fixture-only";
const requests = [], checks = [];
let mode = "success";
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const id = "fal_request-fixture_01";
const load = typescriptLoader({}, { fetch: async (input, init) => {
  const url = new URL(String(input)); requests.push({ url, init });
  if (mode === "network") throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
  if (["rate", "reject", "server"].includes(mode)) return Response.json({ detail: "private fixture detail" }, { status: mode === "rate" ? 429 : mode === "server" ? 503 : 422 });
  if (mode === "lost-body") return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } })); } }), { headers: { "Content-Type": "application/json" } });
  if (url.pathname.endsWith("/status")) return Response.json({ status: mode === "running" ? "IN_PROGRESS" : mode === "invalid-status" ? "UNKNOWN" : "COMPLETED", request_id: id });
  if (url.pathname.includes("/requests/")) {
    if (mode === "failed") return Response.json({ detail: "private fixture detail" }, { status: 422 });
    return Response.json({ video: mode === "invalid" ? {} : { url: "https://fixture.fal.media/video.mp4", duration: 6, width: 1280, height: 720, fps: 25, num_frames: 150 } });
  }
  return Response.json({ request_id: id, status: "IN_QUEUE", response_url: "https://queue.fal.run/result", status_url: "https://queue.fal.run/status", cancel_url: "https://queue.fal.run/cancel" });
} });
try {
  const { falEndpoints } = load("lib/video-ai/config.ts"), provider = load("lib/video-ai/providers/fal.ts");
  const scene = { provider: "fal", model: falEndpoints.text, operation: "text_to_video", prompt: "Synthetic cyan cube", duration_seconds: 6, resolution: "720p", pricing_snapshot: { aspectRatio: "16:9", numFrames: 97 }, provider_task_id: id };
  check("text submits asynchronously with persisted-compatible ID", (await provider.generateScene(scene)).taskId === id && requests.length === 1);
  const first = requests[0], body = JSON.parse(first.init.body);
  check("central text endpoint and actual model schema", first.url.pathname.endsWith(falEndpoints.text) && body.duration === 6 && body.resolution === "720p" && body.generate_audio === false && body.fps === 25);
  check("credential only in authorization header", new Headers(first.init.headers).get("authorization") === "Key fal-fixture-only" && !first.init.body.includes("fal-fixture-only"));
  check("uncached submission has bounded queue start", first.init.cache === "no-store" && new Headers(first.init.headers).get("x-fal-request-timeout") === "180");
  await provider.generateScene({ ...scene, model: falEndpoints.image, operation: "image_to_video" }, "https://owned.example/temporary");
  check("image operation passes short-lived input", JSON.parse(requests.at(-1).init.body).image_url === "https://owned.example/temporary");
  await provider.transformScene({ ...scene, model: falEndpoints.video, operation: "video_to_video" }, "https://owned.example/video");
  const transform = JSON.parse(requests.at(-1).init.body);
  check("transform preserves intent with reviewed schema", transform.num_frames === 97 && transform.frames_per_second === 24 && transform.generate_audio === false && transform.prompt.includes("Preserve source movement"));
  mode = "running"; check("queued work never requests result early", (await provider.getTaskStatus(scene)).status === "RUNNING" && requests.at(-1).url.pathname.endsWith("/status"));
  mode = "success"; const result = await provider.getTaskStatus(scene);
  check("completed queue fetches result and measured metadata", result.status === "SUCCEEDED" && result.usage.outputDuration === 6 && result.usage.numFrames === 150 && !JSON.stringify(result.usage).includes("https"));
  check("actual charge remains unknown", result.credits === null);
  mode = "failed"; check("completed queue with rejected result is failure", (await provider.getTaskStatus(scene)).status === "FAILED");
  for (const failure of ["invalid", "invalid-status"]) { mode = failure; await assert.rejects(provider.getTaskStatus(scene), e => e.code === "INVALID_OUTPUT"); check("safe " + failure, true); }
  for (const [failure, code] of [["rate", "RATE_LIMIT"], ["reject", "PROVIDER_REJECTED"], ["network", "UNCERTAIN_SUBMISSION"], ["server", "UNCERTAIN_SUBMISSION"], ["lost-body", "UNCERTAIN_SUBMISSION"]]) {
    mode = failure; const count = requests.length;
    await assert.rejects(provider.generateScene(scene), e => e.code === code && !e.message.includes("private"));
    check("one HTTP request for " + failure, requests.length === count + 1);
  }
  mode = "success"; await assert.rejects(provider.generateScene({ ...scene, provider: "runway" }), e => e.code === "PROVIDER_INACTIVE"); check("legacy provider cannot enter active boundary", true);
  console.log(JSON.stringify({ passed: checks.length, checks, transport: "official fal SDK with fixture HTTP" }, null, 2));
} finally { if (before === undefined) delete process.env.FAL_KEY; else process.env.FAL_KEY = before; }
