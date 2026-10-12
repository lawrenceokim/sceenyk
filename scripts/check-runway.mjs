// Official SDK transport contract with fixture HTTP, never a real paid call.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { typescriptLoader } from "./lib/load-typescript.mjs";
const before = process.env.RUNWAYML_API_SECRET;
process.env.RUNWAYML_API_SECRET = "runway-fixture-only";
const checks = [], requests = [];
let mode = "success";
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const taskId = randomUUID();
const load = typescriptLoader({}, { fetch: async (input, init) => {
  const url = new URL(String(input));
  requests.push({ url, init });
  if (mode === "network") throw new Error("fixture-network");
  if (mode === "rate" || mode === "rejected") return Response.json({ error: "Fixture provider error" }, { status: mode === "rate" ? 429 : 400 });
  if (url.pathname === "/v1/uploads") return Response.json({ runwayUri: "runway://fixture", uploadUrl: "https://fixture-upload.example/file", fields: { key: "fixture" } });
  if (url.hostname === "fixture-upload.example") return new Response(null, { status: 204 });
  if (url.pathname.startsWith("/v1/tasks/")) return Response.json({ id: taskId, status: mode === "failed" ? "FAILED" : "SUCCEEDED", createdAt: new Date().toISOString(), ...(mode === "no-cost" ? {} : { cost: { credits: mode === "failed" ? 0 : 24 } }), output: ["https://fixture.cloudfront.net/video.mp4"] });
  return Response.json({ id: taskId, estimatedCost: { credits: 24 } });
} });
try {
  const provider = load("lib/video-ai/providers/runway.ts");
  const scene = { operation: "text_to_video", model: "gen4.5", prompt: "A synthetic cyan cube moving on a purple surface", duration_seconds: 2, resolution: "1280:720" };
  check("text generation submits without waiting for completion", (await provider.generateScene(scene)).taskId === taskId && requests.length === 1);
  check("official SDK uses text-to-video endpoint and centralized model", requests[0].url.pathname === "/v1/text_to_video" && JSON.parse(requests[0].init.body).model === "gen4.5");
  check("server credential stays in API authorization header", new Headers(requests[0].init.headers).get("authorization") === "Bearer runway-fixture-only" && !requests[0].init.body.includes("runway-fixture-only"));
  check("all API responses are uncached", requests[0].init.cache === "no-store");
  await provider.generateScene({ ...scene, operation: "image_to_video", model: "gen4_turbo", duration_seconds: 5 }, "runway://fixture");
  check("image operation uses image-to-video with ephemeral input URI", requests.at(-1).url.pathname === "/v1/image_to_video" && JSON.parse(requests.at(-1).init.body).promptImage === "runway://fixture");
  await provider.transformScene({ ...scene, operation: "video_to_video", model: "aleph2" }, "runway://fixture");
  const body = JSON.parse(requests.at(-1).init.body);
  check("video operation uses current Aleph without deprecated ratio", requests.at(-1).url.pathname === "/v1/video_to_video" && body.model === "aleph2" && body.outputFormat === "mp4" && !Object.hasOwn(body, "ratio"));
  const uri = await provider.uploadSceneInput(new Uint8Array([1, 2, 3]), "video/webm");
  check("private bytes use supported ephemeral upload", uri === "runway://fixture" && requests.at(-1).init.body instanceof FormData);
  check("provider upload does not receive R2 keys or authorization", !new Headers(requests.at(-1).init.headers).get("authorization"));
  const success = await provider.getTaskStatus(taskId);
  check("terminal task captures reported charge", success.status === "SUCCEEDED" && success.credits === 24);
  mode = "failed"; check("failed task preserves actual zero charge", (await provider.getTaskStatus(taskId)).credits === 0);
  mode = "no-cost"; check("missing provider charge is never invented", (await provider.getTaskStatus(taskId)).credits === null);
  for (const [failure, expected] of [["rate", "RATE_LIMIT"], ["rejected", "PROVIDER_REJECTED"], ["network", "UNCERTAIN_SUBMISSION"]]) {
    mode = failure; const count = requests.length;
    await assert.rejects(provider.generateScene(scene), error => error.code === expected && !error.message.includes("Fixture provider error"));
    check("safe " + failure + " classification without automatic SDK replay", requests.length === count + 1);
  }
  mode = "network"; await assert.rejects(provider.getTaskStatus(taskId), error => error.code === "PROVIDER_UNAVAILABLE" && error.temporary);
  check("poll transport failures remain retryable", true);
  console.log(JSON.stringify({ passed: checks.length, checks, transport: "official SDK with fixture HTTP" }, null, 2));
} finally { if (before === undefined) delete process.env.RUNWAYML_API_SECRET; else process.env.RUNWAYML_API_SECRET = before; }
