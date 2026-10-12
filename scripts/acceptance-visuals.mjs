// Explicit real integration acceptance. --prepare creates a reserved Clerk DEV
// identity and copies local synthetic test fixtures through owned media services.
// --execute spends real fal credits, only within the central guards.
// Re-running resumes persisted IDs; it never invents a replacement paid task.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";
import { createClerkClient } from "@clerk/backend";
import { InngestTestEngine } from "@inngest/test";
import { typescriptLoader } from "./lib/load-typescript.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const image = process.argv.includes("--image");
const failure = process.argv.includes("--failure");
if (failure) process.env.FAL_MAX_SCENE_SECONDS = "10";
const artifact = path.join(os.tmpdir(), failure ? "sceenyk-fal-failure-acceptance.json" : image ? "sceenyk-fal-image-acceptance.json" : "sceenyk-fal-acceptance.json");
let state; try { state = JSON.parse(fs.readFileSync(artifact, "utf8")); } catch { state = { createdAt: new Date().toISOString(), checks: [] }; }
if (!state.clerkUserId && !failure) {
  const previous = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "sceenyk-visual-acceptance.json"), "utf8"));
  for (const key of ["clerkUserId", "ownerId", "projectId", "assets", "uploadRequests"]) state[key] = previous[key];
}
const save = () => fs.writeFileSync(artifact, JSON.stringify(state, null, 2));
const check = (name, value) => { assert.ok(value, name); if (!state.checks.includes(name)) state.checks.push(name); save(); console.log(JSON.stringify({ passed: name })); };
// A deliberate invalid duration is injected only by the failure harness to
// exercise a real fal rejection. The saved plan and production adapter stay intact.
const transport = async (input, init) => {
  if (failure && new URL(String(input)).hostname === "queue.fal.run" && init?.method === "POST") {
    const body = JSON.parse(init.body); body.duration = 7;
    return fetch(input, { ...init, body: JSON.stringify(body) });
  }
  return fetch(input, init);
};
const baseLoad = typescriptLoader({}, { fetch: transport }), db = baseLoad("lib/db/server.ts").createDatabaseClient();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, telemetry: { disabled: true } });
const row = async (table, id, key = "id") => { const result = await db.from(table).select("*").eq(key, id).single(); assert.ok(!result.error, table + " persists"); return result.data; };
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function identity() {
  assert.equal((await clerk.instance.get()).environmentType, "development");
  if (!state.clerkUserId) {
    const user = await clerk.users.createUser({ username: "sceenykvisual" + randomUUID().replaceAll("-", "").slice(0, 16), emailAddress: [`sceenyk-visual-${randomUUID()}+clerk_test@example.com`], password: randomUUID() + "Aa1!", firstName: "Visual", lastName: "Acceptance" });
    state.clerkUserId = user.id; save();
  }
  const user = await clerk.users.getUser(state.clerkUserId);
  assert.ok(user.emailAddresses.some(e => e.emailAddress.includes("+clerk_test@")), "reserved synthetic test identity only");
  const result = await db.from("app_users").upsert({ clerk_user_id: user.id, email: user.emailAddresses[0].emailAddress, first_name: user.firstName, last_name: user.lastName, image_url: user.imageUrl }, { onConflict: "clerk_user_id" }).select("*").single();
  assert.ok(!result.error); state.ownerId = result.data.id; save(); return result.data;
}
if (process.argv.includes("--prepare")) {
  check("hosted scene schema applied", !(await db.from("scene_executions").select("id,job_id,status,provider_task_id").limit(0)).error);
  const owner = await identity();
  const load = typescriptLoader({ "@/lib/auth/ensure-app-user": { ensureAppUser: async () => owner }, "./dispatch": { attemptGenerationDispatch: async () => {} } });
  state.projectId ??= randomUUID(); save();
  const prompt = image ? "Plan exactly two visual shots totaling ten seconds. Shot 1 transforms the supplied still IMAGE into a gently animated polished illustrated shot, exactly 6 seconds, source transformed, assetId of the image, no startTime or endTime. Shot 2 reuses the same still IMAGE unchanged, exactly 4 seconds, source original. Do not use the video. No narration. Keep shot instructions under 800 characters. Synthetic cyan square on purple background only." : "Plan exactly two visual shots totaling ten seconds. Shot 1 is a new text-generated shot of a bright cyan cube sliding on a purple surface, exactly 6 seconds, source generated, no assetId. Shot 2 transforms the ENTIRE supplied short VIDEO to polished 2D cartoon, exactly 4 seconds, source transformed, video assetId, startTime 0 endTime 4. Preserve timing, cyan-square movement, camera and background layout; preserve text/HUD. Do not use the still image. No narration. Keep shot instructions under 800 characters. Synthetic shapes only.";
  const requestedPrompt = failure ? "Plan exactly ONE new text-generated visual shot lasting exactly TEN seconds. No source assets, no reuse, no transform, no narration. Synthetic cyan cube moves gently across purple background. source generated, assetId null, startTime and endTime null. Keep shot description under 800 characters." : prompt;
  const settings = { duration: "10", aspectRatio: "16:9", visualStyle: "Original", tone: "Storytelling" };
  const saved = await load("lib/projects/server.ts").saveOwnedProject({ id: state.projectId, mode: state.assets ? "update" : "create", title: "Visual scene synthetic acceptance", category: "cinematic", prompt: requestedPrompt, settings });
  assert.ok(saved.ok, "owned synthetic project saved");
  if (!state.assets || state.assets.length < 2) {
    const source = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "sceenyk-analysis-media-fixture.json"), "utf8"));
    state.assets ??= []; state.uploadRequests ??= {}; save();
    const media = load("lib/media/server.ts");
    for (const [kind, mimeType, filename] of [["image", "image/png", "synthetic-square.png"], ["video", "video/webm", "synthetic-square.webm"]]) {
      if (state.assets.some(a => a.kind === kind)) continue;
      const bytes = fs.readFileSync(path.join(source.artifacts, filename));
      state.uploadRequests[kind] ??= randomUUID(); save();
      const authorization = await media.authorizeOwnedUpload({ projectId: state.projectId, requestId: state.uploadRequests[kind], filename, kind, mimeType, sizeBytes: bytes.length });
      if (authorization.upload) {
        const put = await fetch(authorization.upload.url, { method: "PUT", headers: authorization.upload.headers, body: bytes, signal: AbortSignal.timeout(30_000) });
        assert.ok([200, 412].includes(put.status)); await put.body?.cancel();
      }
      const asset = await media.finalizeOwnedUpload({ projectId: state.projectId, assetId: authorization.asset.id });
      assert.equal(asset.status, "uploaded"); state.assets.push(asset); save();
    }
  }
  check("real owned synthetic inputs verified in private R2", state.assets.length === 2);
  if (!state.jobId) {
    const inputs = { prompt: requestedPrompt, category: "cinematic", settings, assetIds: state.assets.map(a => a.id).sort() };
    const quote = await load("lib/pricing/server.ts").quoteGeneration({ projectId: state.projectId, requestId: randomUUID(), inputs });
    assert.ok(quote.ok && quote.value.eligibleFreeGeneration);
    const accepted = await load("lib/generation/server.ts").createGenerationJob({ quoteId: quote.value.id });
    assert.ok(accepted.ok); state.jobId = accepted.value.id; state.analysisRunId = "visual-analysis-acceptance-" + randomUUID(); state.visualRunId = "visual-acceptance-" + randomUUID(); save();
  }
  assert.notEqual((await row("generation_jobs", state.jobId)).status, "failed", "This fixture is terminal. Preserve it; admit a separate fresh request after provider recovery.");
  const analysis = await new InngestTestEngine({ function: baseLoad("lib/workflows/generation.ts").generationWorkflow, events: [{ name: "sceenyk/generation.requested", data: { generationJobId: state.jobId } }], steps: [{ id: "analysis-retry-backoff", handler: () => delay(10_000) }], transformCtx: ctx => ({ ...ctx, runId: state.analysisRunId }) }).execute();
  check("actual Gemini production plan persisted before visuals", analysis.result?.handoff === "production_plan_ready");
  const plan = await row("generation_plans", state.jobId, "job_id");
  state.planDigest = digest(plan); save();
  check("new job is eligible without purchasing historical plans", (await row("generation_jobs", state.jobId)).visual_execution_version === 1);
  check("pre-visual reservation is held", (await row("generation_reservations", state.jobId, "job_id")).state === "reserved");
}
if (process.argv.includes("--execute")) {
  assert.ok(state.jobId && state.planDigest, "prepare real plan first");
  check("hosted bounded-retry schema applied", !(await db.from("scene_executions").select("submission_attempts").limit(0)).error);
  check("hosted fal schema applied", !(await db.from("scene_executions").select("estimated_cost_usd,pricing_snapshot,provider_usage").limit(0)).error);
  const config = baseLoad("lib/video-ai/config.ts").getVisualConfiguration();
  const job = await row("generation_jobs", state.jobId);
  const plan = await row("generation_plans", state.jobId, "job_id");
  const attempt = await db.from("generation_analysis_attempts").select("usage").eq("job_id", state.jobId).eq("state", "succeeded").single();
  const media = state.assets.map(a => ({ id: a.id, mimeType: a.mimeType, sizeBytes: a.sizeBytes, durationSeconds: attempt.data?.usage?.media.find(m => m.assetId === a.id)?.durationSeconds }));
  const mapped = baseLoad("lib/video-ai/mapping.ts").mapVisualScenes(plan.plan, media);
  const required = mapped.reduce((sum, s) => sum + (s.estimated_cost_usd ?? 0), 0);
  assert.ok(required <= config.maximumJobUsd && mapped.every(s => !s.error_code), "real plan must fit reviewed models and central cost guard before any paid call");
  console.log(JSON.stringify({ estimatedUsd: required, mapped: mapped.map(s => ({ operation: s.operation, duration: s.duration_seconds, unsupported: s.error_code })) }));
  if (!state.resumeVerified && !failure) {
    const claim = await db.rpc("claim_visual_generation", { p_job_id: job.id, p_run_id: state.visualRunId });
    assert.ok(!claim.error && ["claimed", "resumed"].includes(claim.data), "acceptance owns the trusted visual run");
    const service = baseLoad("lib/video-ai/server.ts");
    const prepared = await service.prepareVisuals(job.id, state.visualRunId);
    await service.submitVisualScene(prepared[0].id, job.id, state.visualRunId);
    const submitted = await row("scene_executions", prepared[0].id);
    assert.ok(submitted.provider_task_id, "real fal request ID persisted immediately");
    await service.submitVisualScene(prepared[0].id, job.id, state.visualRunId);
    const resumed = await row("scene_executions", prepared[0].id);
    check("worker resume reuses actual fal ID without second submission", resumed.provider_task_id === submitted.provider_task_id && resumed.submission_attempts === 1);
    state.resumeVerified = true; save();
  }
  const workflow = baseLoad("lib/workflows/visuals.ts").visualWorkflow;
  const execute = runId => new InngestTestEngine({ function: workflow, events: [{ name: "sceenyk/generation.visuals.requested", data: { generationJobId: job.id } }], transformCtx: ctx => ({ ...ctx, runId, step: { ...ctx.step, sleep: () => delay(10_000) } }) }).execute();
  const result = await execute(state.visualRunId);
  if (failure) {
    const failedScenes = (await db.from("scene_executions").select("*").eq("job_id", job.id)).data;
    check("real fal invalid-schema failure is safely persisted", failedScenes.every(s => s.status === "failed" && ["PROVIDER_FAILED", "PROVIDER_REJECTED"].includes(s.error_code)));
    check("real total failure releases original accounting reservation", (await row("generation_jobs", job.id)).status === "failed" && (await row("generation_reservations", job.id, "job_id")).state === "released");
    const before = digest(failedScenes);
    await execute(state.visualRunId);
    check("failure duplicate neither resubmits nor restores twice", digest((await db.from("scene_executions").select("*").eq("job_id", job.id)).data) === before && (await row("generation_reservations", job.id, "job_id")).state === "released");
    check("failure preserves immutable actual Gemini plan", digest(await row("generation_plans", job.id, "job_id")) === state.planDigest);
    console.log(JSON.stringify({ passed: state.checks.length, scope: "real fal queue rejection; deliberately invalid duration injected at acceptance transport only; actual charge unverified" }));
    process.exit(0);
  }
  check("real visual workflow reaches visuals_ready", result.result?.handoff === "visuals_ready" || result.result?.claim === "terminal" && !!(await row("generation_jobs", job.id)).visuals_ready_at);
  const scenes = (await db.from("scene_executions").select("*").eq("job_id", job.id).order("scene_order")).data;
  check("required actual fal operations succeed", (image ? ["image_to_video", "reuse"] : ["text_to_video", "video_to_video"]).every(operation => scenes.some(s => s.operation === operation && s.status === "completed")));
  if (image) check("reuse completes without a provider task", scenes.some(s => s.operation === "reuse" && s.status === "completed" && !s.provider_task_id));
  const paid = scenes.filter(s => s.provider_task_id);
  check("fal IDs and usage estimates persisted without invented charges", paid.every(s => s.provider === "fal" && s.provider_task_id && s.provider_credits === null && s.provider_cost_usd === null && s.cost_measured_at && s.estimated_cost_usd !== null));
  const storage = baseLoad("lib/storage/r2.ts");
  for (const scene of paid) {
    const asset = await row("scene_assets", scene.output_asset_id);
    check("output metadata owned and bound to scene " + scene.scene_order, asset.owner_user_id === state.ownerId && asset.project_id === state.projectId && asset.job_id === state.jobId && asset.scene_execution_id === scene.id);
    const signed = await storage.signR2Read(asset.storage_key, asset.verified_etag, asset.mime_type);
    const own = await fetch(signed.url, { signal: AbortSignal.timeout(30_000) }); assert.equal(own.status, 200); await own.body?.cancel();
    const unsigned = new URL(signed.url); unsigned.search = "";
    const refused = await fetch(unsigned, { signal: AbortSignal.timeout(15_000) }); await refused.body?.cancel();
    check("generated R2 object remains private " + scene.scene_order, [400, 401, 403].includes(refused.status));
  }
  const before = digest(scenes);
  check("same-run duplicate uses durable outputs", (await execute(state.visualRunId)).result?.claim === "terminal");
  check("different-run duplicate cannot claim", (await execute("duplicate-" + randomUUID())).result?.claim === "terminal");
  const after = (await db.from("scene_executions").select("*").eq("job_id", job.id).order("scene_order")).data;
  check("duplicates create no second task, output or charge", digest(after) === before);
  check("existing Gemini plan is unchanged and traceable", digest(await row("generation_plans", job.id, "job_id")) === state.planDigest);
  const current = await row("generation_jobs", job.id);
  check("visual readiness never completes overall generation", current.status === "processing" && !!current.visuals_ready_at && !current.completed_at);
  check("customer reservation remains held without consumption", (await row("generation_reservations", job.id, "job_id")).state === "reserved");
  state.costs = paid.map(s => ({ operation: s.operation, model: s.model, duration: s.duration_seconds, resolution: s.resolution, usage: s.provider_usage, estimatedUsd: s.estimated_cost_usd, actualChargeUsd: s.provider_cost_usd, timestamp: s.cost_measured_at })); save();
}
if (process.argv.includes("--inspect")) {
  assert.ok(state.jobId && state.assets?.length, "prepare the real synthetic fixture first");
  assert.equal((await clerk.instance.get()).environmentType, "development");
  const other = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "sceenyk-hosted-identity-fixture-2.json"), "utf8"));
  for (const clerkId of [state.clerkUserId, other.clerkUserId]) assert.ok((await clerk.users.getUser(clerkId)).emailAddresses.some(e => e.emailAddress.includes("+clerk_test@")));
  const owner = await row("app_users", state.ownerId);
  const b = await row("app_users", other.clerkUserId, "clerk_user_id");
  assert.notEqual(owner.id, b.id);
  const own = typescriptLoader({ "@/lib/auth/ensure-app-user": { ensureAppUser: async () => owner } })("lib/media/server.ts");
  const foreign = typescriptLoader({ "@/lib/auth/ensure-app-user": { ensureAppUser: async () => b } })("lib/media/server.ts");
  check("owner can reopen actual private input metadata", (await own.listOwnedAssets(state.projectId)).length === state.assets.length);
  await assert.rejects(foreign.listOwnedAssets(state.projectId));
  check("B cannot list A acceptance media", true);
  const bProject = await db.from("projects").select("id").eq("owner_user_id", b.id).limit(1).single();
  assert.ok(!bProject.error && bProject.data);
  const rejected = await typescriptLoader({ "@/lib/auth/ensure-app-user": { ensureAppUser: async () => b } })("lib/pricing/server.ts").quoteGeneration({ projectId: bProject.data.id, requestId: randomUUID(), inputs: { prompt: "Synthetic cross-owner media denial", category: "cinematic", settings: { duration: "10", aspectRatio: "16:9", visualStyle: "Original", tone: "Storytelling" }, assetIds: state.assets.map(a => a.id).sort() } });
  check("B cannot admit generation using A private media", !rejected.ok && rejected.code === "INVALID_ASSETS");
  for (const asset of state.assets) {
    const reference = { projectId: state.projectId, assetId: asset.id };
    await assert.rejects(foreign.readOwnedAsset(reference));
    check("B cannot obtain A private input capability " + asset.kind, true);
    const signed = await own.readOwnedAsset(reference);
    const allowed = await fetch(signed.url, { signal: AbortSignal.timeout(15_000) }); assert.equal(allowed.status, 200); await allowed.body?.cancel();
    const unsigned = new URL(signed.url); unsigned.search = "";
    const denied = await fetch(unsigned, { signal: AbortSignal.timeout(15_000) }); await denied.body?.cancel();
    check("actual input remains private " + asset.kind, [400, 401, 403].includes(denied.status));
  }
  const job = await row("generation_jobs", state.jobId);
  const reservation = await row("generation_reservations", state.jobId, "job_id");
  const attempts = await db.from("generation_analysis_attempts").select("attempt,state,failure_code").eq("job_id", state.jobId).order("attempt");
  assert.ok(!attempts.error);
  console.log(JSON.stringify({ jobStatus: job.status, reservationState: reservation.state, analysisAttempts: attempts.data, boundedRetrySchemaAvailable: !(await db.from("scene_executions").select("submission_attempts").limit(0)).error }));
}
console.log(JSON.stringify({ passed: state.checks.length, costs: state.costs ?? null, artifact, scope: "real hosted services and official engine; deployed Cloud/browser acceptance separate" }));
