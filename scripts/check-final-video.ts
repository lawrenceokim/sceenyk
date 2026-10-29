// Entirely offline: synthetic SQL, mock HTTP and local FFmpeg fixtures only.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { input, canonicalInput, id, fixturePricingRaw } from "./final-video-fixture";
import { finalPricing } from "../lib/final-video-generation/adapters/pricing";
import { buildVideoGenerationPackage, packageDigest } from "../lib/video-generation-package/builder";
import type { PackageRow } from "../lib/video-generation-package/contract";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { finalProviders, adapterIdentities } from "../lib/final-video-generation/adapters/registry";
import { validateAlignment } from "../lib/final-video-generation/adapters/elevenlabs";
import { outputUrl, jsonRequest, submitFal } from "../lib/final-video-generation/adapters/http";
import type { FinalConfiguration, FinalExecution, FinalAsset, Operation } from "../lib/final-video-generation/contract";
import type { ProviderContext } from "../lib/final-video-generation/providers";
import { compositionProfile } from "../lib/final-video-generation/composition";
import { defaultDelivery } from "../lib/execution-v1/contract";

async function main() {
  let checks = 0;
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const ok = (a: unknown) => { assert.ok(a); checks++; };
  const throws = (work: () => unknown) => { assert.throws(work); checks++; };
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_M10_CHECKS"); };
  const doc = buildVideoGenerationPackage(input, 1);
  // Keep the original 069 SQL fixtures as history; current creative admission
  // uses schema 2. Migration 070 and its legacy-admission fence are tested in
  // check-execution-v1.ts.
  const creativeDoc = buildVideoGenerationPackage(canonicalInput, 1);
  const configuration: FinalConfiguration = { version: "ugc-final-v1", funding: "operator_funded", authorizationId: id(80), language: "en",
    pricing: finalPricing(fixturePricingRaw), maxRequests: 20, maxEstimatedCostMicrousd: 30000000,
    ceilings: { video: 6250000, voice: 100000, design: 200000, binding: 10000, lip_sync: 200000 },
    providers: adapterIdentities, composition: compositionProfile, output: { height: 720, fps: 25, format: "mp4", toleranceMs: 50, audioSampleRate: 48000 } };
  const hash = packageDigest("sceenyk-final-config", configuration);
  const providers = finalProviders(), plan = finalPreflight(creativeDoc, configuration, providers);
  equal(plan.issues, []); equal(plan.requests, 6); ok(plan.profile?.id); equal(plan.profile?.characterBinding, input.source.character.id);
  const unsupported = structuredClone(creativeDoc); unsupported.scenes[0].audio.music = { requirement: "required", description: "Upbeat music", assetId: null };
  ok(finalPreflight(unsupported, configuration, providers).issues.some(i => i.includes("AUDIO")));
  equal(providers.lip.validate(11000, 720, 1280), ["LIP_SYNC_DURATION_UNSUPPORTED"]);
  equal(providers.lip.validate(5000, 512, 512), ["LIP_SYNC_DIMENSIONS_UNSUPPORTED"]);
  equal(providers.lip.validate(5000, 720, 1280, 101 * 1024 * 1024), ["LIP_SYNC_FILE_LIMIT"]);
  equal(finalPreflight(creativeDoc, { ...configuration, maxRequests: 1 }, providers).issues, ["EXECUTION_BUDGET_INSUFFICIENT"]);
  const silent = structuredClone(canonicalInput); silent.storyboard.document.scenes[1].speech = [];
  const silentPlan = finalPreflight(buildVideoGenerationPackage(silent, 1), configuration, providers);
  equal(silentPlan.profile, null); equal(silentPlan.requests, 2);
  const unsupportedDelivery = structuredClone(creativeDoc); unsupportedDelivery.scenes[1].speech[0].delivery = "Whisper with a scream";
  ok(finalPreflight(unsupportedDelivery, configuration, providers).issues.includes("VOICE_DELIVERY_UNSUPPORTED"));
  ok(finalPreflight(creativeDoc, { ...configuration, language: "zz" }, providers).issues.includes("VOICE_LANGUAGE_UNSUPPORTED"));
  const narration = structuredClone(canonicalInput); narration.storyboard.document.scenes[1].speech[0].speaker = "narration";
  equal(finalPreflight(buildVideoGenerationPackage(narration, 1), configuration, providers).requests, 5);
  const alignment = { characters: ["H", "i"], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] };
  equal(validateAlignment(alignment, "Hi"), alignment); throws(() => validateAlignment(alignment, "Changed"));
  throws(() => validateAlignment({ ...alignment, character_start_times_seconds: [0.2, 0.1] }, "Hi"));
  throws(() => outputUrl("http://127.0.0.1/output")); throws(() => outputUrl("https://evil.test/output"));

  // Adapter contract probes use mock fetch only, with dummy credentials.
  process.env.FAL_KEY = "synthetic-offline-key"; process.env.ELEVENLABS_API_KEY = "synthetic-offline-key";
  const receipts: unknown[] = [], bodies: Buffer[] = []; let posts = 0;
  const context: ProviderContext = { signal: new AbortController().signal, received: async r => { receipts.push(r); }, preserveResponse: async b => { bodies.push(b); } };
  globalThis.fetch = async (url, init) => {
    equal(String(url), "https://queue.fal.run/bytedance/seedance-2.5/reference-to-video"); equal(init?.method, "POST"); posts++;
    const headers = new Headers(init?.headers); equal(headers.get("X-Fal-No-Retry"), "1"); equal(headers.get("x-app-fal-disable-fallback"), "true");
    const body = JSON.parse(String(init?.body)); equal(body.generate_audio, false); equal(body.image_urls.length, 3); equal(body.duration, "5");
    return Response.json({ request_id: "synthetic-request", status_url: "https://queue.fal.run/bytedance/seedance-2.5/requests/synthetic-request/status",
      response_url: "https://queue.fal.run/bytedance/seedance-2.5/requests/synthetic-request" });
  };
  const payload = providers.video.prepareScene(creativeDoc, creativeDoc.scenes[0], new Map(["character", "product", "location"].map(r => [r, `https://synthetic.invalid/${r}`])));
  ok(!payload.prompt.includes('"transition":')); ok(payload.prompt.includes("final composition owns these"));
  await providers.video.submitScene(payload, context); equal(posts, 1); equal(bodies.length, 1);
  globalThis.fetch = async () => { throw new Error("REPLAY_MUST_NOT_FETCH"); };
  await submitFal(providers.video.model, payload, { ...context, replayResponse: bodies[0] }); equal(posts, 1);
  let timeouts = 0; globalThis.fetch = async () => { timeouts++; throw new Error("lost acknowledgment"); };
  await assert.rejects(jsonRequest("https://queue.fal.run/synthetic", { method: "POST" }, context), /FINAL_UNCERTAIN_PROVIDER_OUTCOME/); checks++;
  equal(timeouts, 1);
  let designs = 0, bindings = 0, utterances = 0;
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url)), body = JSON.parse(String(init?.body));
    equal(target.hostname, "api.elevenlabs.io"); equal(init?.method, "POST");
    if (target.pathname.endsWith("/design")) {
      designs++; equal(body.model_id, "eleven_multilingual_ttv_v2"); equal(body.auto_generate_text, false); equal(body.text, plan.designPreviewText); equal(body.should_enhance, false);
      return Response.json({ previews: [{ generated_voice_id: "synthetic-preview", audio_base_64: Buffer.from("synthetic-audio").toString("base64"), media_type: "audio/mpeg" }] });
    }
    if (target.pathname === "/v1/text-to-voice") {
      bindings++; equal(body.generated_voice_id, "synthetic-preview"); return Response.json({ voice_id: "synthetic-binding" });
    }
    utterances++; equal(target.pathname, "/v1/text-to-speech/synthetic-binding/with-timestamps"); equal(body.text, "Hi");
    equal(body.model_id, "eleven_multilingual_v2"); equal(body.apply_text_normalization, "off"); equal(body.voice_settings.speed, 1);
    equal(body.previous_request_ids, ["prior-request"]);
    return Response.json({ audio_base64: Buffer.from("synthetic-audio").toString("base64"), alignment, normalized_alignment: alignment },
      { headers: { "request-id": `synthetic-tts-${utterances}`, "character-cost": "2" } });
  };
  const designed = await providers.voice.design(plan.profile!, context, plan.designPreviewText);
  const bound = await providers.voice.bind(plan.profile!, designed.receipt, context);
  await providers.voice.synthesize("Hi", defaultDelivery(), plan.profile!, bound.receipt, ["prior-request"], context);
  await providers.voice.synthesize("Hi", defaultDelivery(), plan.profile!, bound.receipt, ["prior-request"], context);
  equal([designs, bindings, utterances], [1, 1, 2]);
  throws(() => providers.voice.validateTiming({ result: { alignment } }, 10));
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_SQL_CHECKS"); };

  const pg = new PGlite();
  try {
    await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    const target = "20261027006900_ugc_final_video.sql";
    for (const name of fs.readdirSync("supabase/migrations").filter(n => n.endsWith(".sql") && n < target).sort())
      await pg.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
    const catalog = async () => (await pg.query<{ oid: number; proname: string; prosrc: string; proacl: unknown }>("select oid,proname,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
    const before = await catalog(); const sql = fs.readFileSync(`supabase/migrations/${target}`, "utf8");
    await pg.exec(sql); await pg.exec(sql); await pg.exec(sql.replace(/\r?\n/g, "\r\n"));
    equal((await catalog()).filter(r => before.some(old => old.oid === r.oid)), before);
    for (const name of ["executions", "scenes", "operations", "events"]) {
      const row = (await pg.query("select relrowsecurity enabled,has_table_privilege('service_role',oid,'SELECT') readable,has_table_privilege('service_role',oid,'UPDATE') writable,has_table_privilege('authenticated',oid,'SELECT') browser from pg_class where oid=$1::regclass", [`public.ugc_final_${name}`])).rows[0];
      equal(row, { enabled: true, readable: true, writable: false, browser: false });
    }
    for (const name of ["current", "action", "claim", "checkpoint", "asset_valid", "scene_valid", "result_valid", "guard", "event"]) {
      const row = (await pg.query("select has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') browser,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where pronamespace='public'::regnamespace and proname=$1", [`ugc_final_${name}`])).rows[0];
      equal(row, { anon: false, browser: false, service: ["current", "action", "claim", "checkpoint"].includes(name) });
    }
    await pg.exec("create temp table m10_input(value jsonb);");
    await pg.query("insert into m10_input values($1::jsonb)", [JSON.stringify(input)]);
    await pg.exec("create or replace function public.ugc_package_input(p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$ select value from pg_temp.m10_input where value->>'jobId'=p_job::text $$;");
    await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'synthetic-m10-owner')", [id(1)]);
    await pg.query("insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type) values($1,$2,'Demo','product-ad','Show the mug','9:16','10','Realistic','Professional','ugc','advertisement')", [id(2), id(1)]);
    await pg.query("insert into public.ugc_generation_jobs(id,owner_user_id,project_id,idempotency_key,input_snapshot) values($1,$2,$3,$4,'{}')", [id(3), id(1), id(2), id(90)]);
    const packageAction = async (kind: string, row?: PackageRow) => (await pg.query<{ value: PackageRow }>("select to_jsonb(public.ugc_package_action($1,$2,$3,$4,$5,$6::jsonb)) value",
      [id(1), id(2), id(3), row?.version ?? 0, kind, JSON.stringify({ packageId: row?.id, requestId: id(20), input, fingerprint: doc.inputFingerprint })])).rows[0].value;
    await packageAction("prepare");
    const packageClaim = (await pg.query<{ value: PackageRow }>("select to_jsonb(public.ugc_package_claim($1)) value", [id(30)])).rows[0].value;
    const packageReady = (await pg.query<{ value: PackageRow }>("select to_jsonb(public.ugc_package_checkpoint($1,$2,'ready',$3::jsonb)) value", [packageClaim.id, packageClaim.claim_token, JSON.stringify({ document: doc })])).rows[0].value;
    const approvedPackage = await packageAction("approve", packageReady); equal(approvedPackage.state, "approved");
    const authorization = { packageId: approvedPackage.id, requestId: id(40), acceptedCost: true, configuration, configurationHash: hash, profile: plan.profile };
    const action = async (kind: string, payload: unknown, owner = id(1)) => (await pg.query<{ value: FinalExecution | null }>("select to_jsonb(public.ugc_final_action($1,$2,$3,$4,$5::jsonb)) value", [owner, id(2), id(3), kind, JSON.stringify(payload)])).rows[0].value;
    const claim = async () => (await pg.query<{ value: FinalExecution | null }>("select to_jsonb(public.ugc_final_claim($1)) value", [id(30)])).rows[0].value;
    let row = (await action("generate", authorization))!; ok(row?.id); equal(row.state, "queued");
    equal((await action("generate", authorization))?.id, row.id); equal(await action("generate", authorization, id(99)), null);
    row = (await claim())!; ok(row.claim_token); equal(await claim(), null);
    const checkpoint = async (op: string, payload: unknown = {}, token = row.claim_token) => {
      const value = (await pg.query<{ value: { execution: FinalExecution; operation: Operation; created: boolean; blocked?: string } | null }>("select public.ugc_final_checkpoint($1,$2,$3,$4::jsonb) value", [row.id, token, op, JSON.stringify(payload)])).rows[0].value;
      if (value) row = value.execution; return value;
    };
    const asset = (n: number, audio = false, durationMs = 5000): FinalAsset => ({ key: `ugc/${id(1)}/${id(2)}/${id(3)}/final-video-v1/${row.id}/${id(n)}.mp4`,
      sha256: n.toString(16).padStart(64, "0"), etag: `etag-${n}`, sizeBytes: 100, mimeType: "video/mp4", durationMs, width: 720, height: 1280, hasAudio: audio, sampleRate: audio ? 48000 : 0, channels: audio ? 1 : 0 });
    equal(await checkpoint("review", { asset: asset(50, true, 10000), fingerprint: "a".repeat(64) }), null);
    const makeIntent = async (key: string, kind: Operation["kind"], data: Record<string, unknown>, sceneId?: string) => checkpoint("intent", { key, kind, input: data, sceneId,
      fingerprint: packageDigest("fixture-operation", { key, data }), provider: kind === "composition" ? "ffmpeg" : configuration.providers[kind].id,
      model: kind === "composition" ? "h264-aac-720p25-transitions-v2" : configuration.providers[kind].model });
    const firstVideo = (await makeIntent(`video:${doc.scenes[0].id}`, "video", { scene: doc.scenes[0] }, doc.scenes[0].id))!;
    equal(firstVideo.created, true); equal(row.paid_requests, 1);
    equal((await makeIntent(`video:${doc.scenes[0].id}`, "video", { scene: doc.scenes[0] }, doc.scenes[0].id))?.created, false); equal(row.paid_requests, 1);
    // Unknown paid outcomes survive recovery and lease fencing without new intent.
    await checkpoint("fail", { code: "FINAL_UNCERTAIN_PROVIDER_OUTCOME" }); equal(row.state, "reconciling");
    row = (await action("recover", { executionId: row.id, version: row.version }))!; row = (await claim())!;
    equal((await makeIntent(`video:${doc.scenes[0].id}`, "video", { scene: doc.scenes[0] }, doc.scenes[0].id))?.operation.id, firstVideo.operation.id); equal(row.paid_requests, 1);
    const oldToken = row.claim_token;
    await pg.query("update public.ugc_final_executions set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [row.id]);
    row = (await claim())!; ok(row.claim_token !== oldToken); equal(await checkpoint("heartbeat", {}, oldToken), null);
    await pg.query("update m10_input set value=jsonb_set(value,'{source,scene,projectTitle}','\"Stale\"'::jsonb)");
    equal((await makeIntent("blocked-stale", "voice", { text: "forbidden" }))?.blocked, "FINAL_PACKAGE_CHANGED"); equal(row.paid_requests, 1);
    await pg.query("update m10_input set value=$1::jsonb", [JSON.stringify(input)]);
    await pg.exec("begin; savepoint exhausted_budget");
    await pg.query("update public.ugc_final_executions set paid_requests=20 where id=$1", [row.id]);
    equal((await makeIntent("blocked-budget", "voice", { text: "forbidden" }))?.blocked, "FINAL_BUDGET_EXHAUSTED");
    await pg.exec("rollback to savepoint exhausted_budget; commit"); await checkpoint("heartbeat"); equal(row.paid_requests, 1);
    const sceneOutputs: FinalAsset[] = [];
    async function ready(operation: Operation, output: FinalAsset | null) { await checkpoint("output", { operationId: operation.id, asset: output }); }
    for (const [index, scene] of doc.scenes.entries()) {
      const video = (await makeIntent(`video:${scene.id}`, "video", { scene }, scene.id))!.operation;
      const videoAsset = asset(50 + index); await ready(video, videoAsset);
      const voices: string[] = [], hashes: string[] = []; let syncId: string | null = null;
      if (scene.speech.length) {
        const binding = (await makeIntent("voice:binding", "binding", { profileId: plan.profile!.id }))!.operation;
        const bindingReceipt = { result: { bindingRef: "synthetic-voice" } };
        await checkpoint("receipt", { operationId: binding.id, receipt: bindingReceipt }); await ready(binding, null);
        await checkpoint("profile", { binding: bindingReceipt }); ok(row.profile_binding);
        const line = scene.speech[0];
        const voice = (await makeIntent(`voice:${scene.id}:0`, "voice", { text: line.text, delivery: line.delivery, startMs: line.startMs, endMs: line.endMs, segmentIndex: 0, profileId: plan.profile!.id }, scene.id))!.operation;
        const voiceAsset = { ...asset(60, true, 1500), mimeType: "audio/mpeg" as const, width: 0, height: 0 };
        await ready(voice, voiceAsset); voices.push(voice.id); hashes.push(voiceAsset.sha256);
        const guide = (await makeIntent(`guide:${scene.id}`, "composition", { hashes, windows: [[line.startMs - scene.startMs, line.endMs - line.startMs]] }, scene.id))!.operation;
        const guideAsset = { ...asset(61, true), mimeType: "audio/mpeg" as const, width: 0, height: 0 }; await ready(guide, guideAsset);
        const sync = (await makeIntent(`sync:${scene.id}`, "lip_sync", { videoHash: videoAsset.sha256, audioGuideHash: guideAsset.sha256, profileId: plan.profile!.id }, scene.id))!.operation;
        await ready(sync, asset(62)); syncId = sync.id;
      }
      const completed = (await makeIntent(`scene:${scene.id}`, "composition", { videoHash: videoAsset.sha256, syncId, audioHashes: hashes, durationMs: scene.durationMs }, scene.id))!.operation;
      const completedAsset = asset(70 + index, !!voices.length); await ready(completed, completedAsset);
      const manifest = { videoOperation: video.id, voiceOperations: voices, syncOperation: syncId, profileId: plan.profile!.id };
      if (voices.length) { equal(await checkpoint("scene", { sceneId: scene.id, asset: completedAsset, manifest: { ...manifest, voiceOperations: [] } }), null);
        equal(await checkpoint("scene", { sceneId: scene.id, asset: completedAsset, manifest: { ...manifest, syncOperation: null } }), null); }
      ok(await checkpoint("scene", { sceneId: scene.id, asset: completedAsset, manifest })); sceneOutputs.push(completedAsset);
    }
    const fingerprint = () => packageDigest("sceenyk-final-composition", { packageHash: row.package_hash, packageVersion: row.package_version,
      sceneHashes: sceneOutputs.map(a => a.sha256), configurationHash: row.configuration_hash, revision: row.revision });
    async function finish() {
      const data = { fingerprint: fingerprint(), sceneHashes: sceneOutputs.map(a => a.sha256) };
      const finalOp = (await makeIntent(`final:${row.revision}`, "composition", data))!.operation;
      const final = asset(80 + row.revision, true, 10000); await ready(finalOp, final);
      equal(await checkpoint("review", { asset: { ...final, hasAudio: false }, fingerprint: fingerprint() }), null);
      equal(await checkpoint("review", { asset: final, fingerprint: "b".repeat(64) }), null);
      equal(await checkpoint("review", { asset: { ...final, durationMs: 9000 }, fingerprint: fingerprint() }), null);
      ok(await checkpoint("review", { asset: final, fingerprint: fingerprint() })); equal(row.state, "review");
    }
    await finish(); const requests = row.paid_requests;
    row = (await action("reject", { executionId: row.id, version: row.version }))!; equal(row.state, "deleting");
    row = (await claim())!; await checkpoint("deleted"); equal(row.state, "deleted"); equal(await claim(), null);
    row = (await action("generate", authorization))!; equal(row.revision, 2); equal(row.paid_requests, requests);
    row = (await claim())!; await finish(); equal(row.paid_requests, requests);
    equal(await action("approve", { executionId: row.id, version: row.version }, id(99)), null);
    // The upstream approval resolver is synthetic, just like package_input.
    // Keep its existing trigger active; a negative result must block completion.
    await assert.rejects(action("approve", { executionId: row.id, version: row.version }), /Current Character and Product approval/); checks++;
    await pg.exec("create or replace function public.ugc_location_references_approved(p_job_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from pg_temp.m10_input where value->>'jobId'=p_job_id::text) $$;");
    row = (await action("approve", { executionId: row.id, version: row.version }))!; equal(row.state, "approved");
    equal((await pg.query("select status,stage from public.ugc_generation_jobs where id=$1", [id(3)])).rows[0], { status: "completed", stage: "complete" });
    equal((await action("approve", { executionId: row.id, version: row.version }))?.version, row.version);
  } finally { await pg.close(); }
  console.info(`M10 offline checks passed: ${checks}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
