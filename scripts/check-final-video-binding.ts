// Synthetic in-memory PostgreSQL and pure planning only. No private env,
// provider calls, workers, remote migrations, real retry or media processing.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { canonicalInput, id } from "./final-video-fixture";
import { buildVideoGenerationPackage, packageDigest } from "../lib/video-generation-package/builder";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { finalProviders, adapterIdentities } from "../lib/final-video-generation/adapters/registry";
import { finalPricing } from "../lib/final-video-generation/adapters/pricing";
import { compositionProfile } from "../lib/final-video-generation/composition";
import { effectiveAuthorization, retryReview, type AuthorizationAmendment } from "../lib/final-video-generation/retry";
import type { FinalConfiguration, FinalExecution, Operation } from "../lib/final-video-generation/contract";
import { elevenLabsBindingRequest, validateElevenLabsLabels, ElevenLabsVoiceGenerationProvider } from "../lib/final-video-generation/adapters/elevenlabs";

async function main() {
  Error.stackTraceLimit = 40;
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_RETRY_CHECKS"); };
  let checks = 0;
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const ok = (value: unknown) => { assert.ok(value); checks++; };
  const pg = new PGlite();
  try {
    await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
    const target = "20261029007400_ugc_final_binding_retry.sql";
    for (const name of fs.readdirSync("supabase/migrations").filter(name => name.endsWith(".sql") && name < target).sort())
      await pg.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
    const source = structuredClone(canonicalInput);
    source.storyboard.document.scenes[0].speech = [{ ...source.storyboard.document.scenes[1].speech[0], startMs: 1200, endMs: 2400, text: "Nice." }];
    source.storyboard.document.scenes[1].speech[0].text = "Smooth and ready.";
    const doc = buildVideoGenerationPackage(source, 1);
    const configuration: FinalConfiguration = { version: "ugc-final-v1", funding: "operator_funded", authorizationId: id(80), language: "en", maxRequests: 8,
      maxEstimatedCostMicrousd: 7000000, ceilings: { video: 6250000, design: 200000, binding: 10000, voice: 100000, lip_sync: 200000 }, providers: adapterIdentities,
      pricing: finalPricing(JSON.stringify({ elevenLabsIncludedCredits: { allowanceId: id(90), remainingCredits: 9981 } })), composition: compositionProfile,
      output: { height: 720, fps: 25, format: "mp4", toleranceMs: 50, audioSampleRate: 48000 } };
    const plan = finalPreflight(doc, configuration, finalProviders()); equal(plan.requests, 8); equal(plan.issues, []);
    await pg.exec("create temp table fixture_input(value jsonb);");
    await pg.query("insert into fixture_input values($1::jsonb)", [JSON.stringify(source)]);
    await pg.exec("create or replace function public.ugc_package_input(p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$select value from pg_temp.fixture_input$$;");
    await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'retry-fixture-owner')", [id(1)]);
    await pg.query("insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type) values($1,$2,'Demo','product-ad','Show mug','9:16','10','Realistic','Professional','ugc','advertisement')", [id(2), id(1)]);
    await pg.query("insert into public.ugc_generation_jobs(id,owner_user_id,project_id,idempotency_key,input_snapshot) values($1,$2,$3,$4,'{}')", [id(3), id(1), id(2), id(91)]);
    await pg.query("insert into public.ugc_generation_packages(id,job_id,owner_user_id,project_id,revision,request_id,input,input_fingerprint,document,package_hash,validation_receipt,state,phase,was_approved,approved_at,approved_by) values($1,$2,$3,$4,1,$5,$6::jsonb,$7,$8::jsonb,$9,'{}','approved','approved',true,clock_timestamp(),$3)",
      [id(20), id(3), id(1), id(2), id(21), JSON.stringify(source), doc.inputFingerprint, JSON.stringify(doc), doc.packageHash]);
    const configHash = packageDigest("sceenyk-final-config", configuration);
    await pg.query("insert into public.ugc_final_executions(id,owner_user_id,project_id,job_id,package_id,package_hash,package_version,request_id,configuration,configuration_hash,profile,state,phase,error_code,paid_requests,estimated_cost_microusd) values($1,$2,$3,$4,$5,$6,1,$7,$8::jsonb,$9,$10::jsonb,'failed','scene_failed','FINAL_PROVIDER_REJECTED',2,2311200)",
      [id(40), id(1), id(2), id(3), id(20), doc.packageHash, id(41), JSON.stringify(configuration), configHash, JSON.stringify(plan.profile)]);
    for (const scene of doc.scenes) await pg.query("insert into public.ugc_final_scenes(execution_id,scene_id,scene_number,scene_hash) values($1,$2,$3,$4)",
      [id(40), scene.id, scene.number, packageDigest("sceenyk-final-scene", scene)]);
    const asset = { key: `ugc/${id(1)}/${id(2)}/${id(3)}/final-video-v1/${id(40)}/${id(50)}.mp4`, sha256: "a".repeat(64), etag: "fixture-etag", sizeBytes: 100,
      mimeType: "video/mp4", durationMs: 5000, width: 720, height: 1280, hasAudio: false, sampleRate: 0, channels: 0 };
    const videoInput = { scene: doc.scenes[0], referenceHashes: Object.values(doc.approvedReferences).map(ref => ref.sha256), costEstimate: plan.breakdown[0] };
    const designInput = { profile: plan.profile, previewText: plan.designPreviewText, costEstimate: plan.breakdown.find(item => item.kind === "design") };
    for (const [opId, key, kind, state, input, output, cost] of [[id(50), "video:scene-1", "video", "ready", videoInput, asset, 2311200],
      [id(51), "voice:design", "design", "failed", designInput, null, 0]] as const) {
      await pg.query("insert into public.ugc_final_operations(id,execution_id,owner_user_id,project_id,operation_key,fingerprint,kind,scene_id,provider,model,input,state,output,estimated_cost_microusd,error_code) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14,$15)",
        [opId, id(40), id(1), id(2), key, packageDigest("fixture-operation", key), kind, kind === "video" ? "scene-1" : null, configuration.providers[kind].id,
          configuration.providers[kind].model, JSON.stringify(input), state, JSON.stringify(output), cost, state === "failed" ? "FINAL_PROVIDER_REJECTED" : null]);
    }
    const migration = fs.readFileSync(`supabase/migrations/${target}`, "utf8");
    const historyBefore = (await pg.query("select to_jsonb(o) row from public.ugc_final_operations o order by id")).rows;
    await pg.exec(migration); await pg.exec(migration); await pg.exec(migration.replace(/\r?\n/g, "\r\n"));
    equal((await pg.query("select to_jsonb(o) row from public.ugc_final_operations o order by id")).rows, historyBefore);
    const readRun = async () => (await pg.query<{ value: FinalExecution }>("select to_jsonb(e) value from public.ugc_final_executions e where id=$1", [id(40)])).rows[0].value;
    const readOps = async () => (await pg.query<{ value: Operation }>("select to_jsonb(o) value from public.ugc_final_operations o where execution_id=$1 order by created_at,id", [id(40)])).rows.map(row => row.value);
    const readAmendments = async () => (await pg.query<AuthorizationAmendment>("select * from public.ugc_final_authorization_amendments where execution_id=$1 order by created_at", [id(40)])).rows;
    let run = await readRun();
    const checkpoint = async (command: string, data: Record<string, unknown> = {}) => {
      const value = (await pg.query<{ value: { execution: FinalExecution; operation: Operation; created: boolean; blocked?: string } }>(
        "select public.ugc_final_checkpoint($1,$2,$3,$4::jsonb) value", [run.id, run.claim_token, command, JSON.stringify(data)])).rows[0].value;
      if (value) run = value.execution; return value;
    };
    const claim = async () => { run = (await pg.query<{ value: FinalExecution }>("select to_jsonb(public.ugc_final_claim($1)) value", [id(70)])).rows[0].value; };
    const proof = (op: Operation) => ({ operationId: op.id, sha256: op.output!.sha256, etag: op.output!.etag, sizeBytes: op.output!.sizeBytes });
    const quoteNow = async () => retryReview(run, doc, await readOps(), await readAmendments(), plan,
      { current: true, operator: true, sharedReservedCredits: run.paid_requests < 6 ? (run.paid_requests - 1) * 119 : 476 })!;
    const approve = async (amendment: string, proposed?: NonNullable<Awaited<ReturnType<typeof quoteNow>>>) => {
      const quote = proposed ?? await quoteNow();
      const payload = { amendmentId: amendment, operationId: quote.review.operationId, version: run.version,
        quote: quote.databaseQuote, quoteHash: quote.review.quoteVersion, operatorApproved: true, configurationCorrected: true,
        reviewedHttpStatus: quote.review.reviewedHttpStatus, reason: quote.review.reason, additionalRequests: 1,
        verifiedOutputs: (await readOps()).filter(op => op.state === "ready" && op.output).map(proof) };
      run = (await pg.query<{ value: FinalExecution }>("select to_jsonb(public.ugc_final_retry_stage($1,$2,$3::jsonb)) value", [id(1), run.id, JSON.stringify(payload)])).rows[0].value;
      return payload;
    };
    const designPayload = { key: "voice:design", kind: "design", input: { profile: plan.profile, previewText: plan.designPreviewText }, sceneId: null,
      fingerprint: packageDigest("fixture-original-design", {}), provider: "elevenlabs", model: configuration.providers.design.model,
      costEstimate: plan.breakdown.find(item => item.kind === "design") };
    // Build the actual six-intent shape through the real RPCs, with entirely
    // synthetic receipts. No provider, worker or asset processing is invoked.
    let design: Operation | undefined;
    for (let attempt = 2; attempt <= 4; attempt++) {
      ok((await quoteNow()).review.available);
      await approve(id(60 + attempt)); await claim();
      const replacement = await checkpoint("intent", designPayload);
      equal(replacement.created, true); equal(replacement.operation.attempt, attempt);
      design = replacement.operation;
      if (attempt < 4) {
        await checkpoint("receipt", { operationId: design.id, receipt: { failure: { httpStatus: 403, method: "POST", bodyRetained: false,
          providerCode: "feature_unavailable", providerRequestId: null, message: "Synthetic plan restriction" } } });
        await checkpoint("operation_failed", { operationId: design.id, code: "FINAL_PROVIDER_REJECTED" });
        await checkpoint("fail", { code: "FINAL_PROVIDER_REJECTED" });
      }
    }
    const previewId = "saved-design-four-preview";
    await checkpoint("receipt", { operationId: design!.id, receipt: { result: { previewRef: previewId } } });
    const audioAsset = { ...asset, key: asset.key.replace(/\.mp4$/, ".mp3"), mimeType: "audio/mpeg", width: 0, height: 0, hasAudio: true, sampleRate: 44100, channels: 1 };
    await checkpoint("output", { operationId: design!.id, asset: audioAsset });
    const bindingPayload = { key: "voice:binding", kind: "binding", input: { profileId: plan.profile!.id, previewFingerprint: design!.fingerprint },
      fingerprint: packageDigest("binding-fixture", {}), provider: "elevenlabs", model: configuration.providers.binding.model,
      costEstimate: plan.breakdown.find(item => item.kind === "binding") };
    const binding = (await checkpoint("intent", bindingPayload)).operation;
    await checkpoint("receipt", { operationId: binding.id, receipt: {
      failure: { httpStatus: 400, providerCode: "invalid_labels", providerRequestId: null, message: "Each label value cannot exceed 50", method: "POST", bodyRetained: false },
      request: { method: "POST", endpoint: "https://synthetic.invalid/bind", payloadSha256: "b".repeat(64),
        payload: { generated_voice_id: previewId, labels: { application: "sceenyk", profile: plan.profile!.id } } } } });
    await checkpoint("operation_failed", { operationId: binding.id, code: "FINAL_PROVIDER_REJECTED" });
    await checkpoint("fail", { code: "FINAL_PROVIDER_REJECTED" });
    const priorRows = (await pg.query("select to_jsonb(o) row from public.ugc_final_operations o order by id")).rows;
    equal(effectiveAuthorization(run, await readAmendments()), { originalRequests: 8, amendedRequests: 3, effectiveRequests: 11,
      originalCostMicrousd: 7000000, amendedCostMicrousd: 0, effectiveCostMicrousd: 7000000, consumedRequests: 6, remainingRequests: 5 });
    const quote = await quoteNow(); ok(quote.review.available); equal(quote.review.stage, "voice_binding");
    equal(quote.review.requiredNewRequests, 6); equal(quote.review.effectiveRequestsAfter, 12);
    equal(quote.review.replacementCredits, 0); equal(quote.review.replacementCostMicrousd, 0);
    equal(quote.review.projectedIncludedCredits, 498); equal(quote.review.projectedTotalCostMicrousd, 4762400);
    equal(quote.review.additionalCostMicrousd, 0);
    const rows = await readOps();
    const priorAmendments = await readAmendments();
    const changed = (mutate: (op: Operation) => Operation) => retryReview(run, doc, rows.map(mutate), priorAmendments, plan,
      { current: true, operator: true, sharedReservedCredits: 476 });
    ok(changed(op => op.id === binding.id ? { ...op, input: { ...op.input, previewFingerprint: "wrong" } } : op)?.review.blockers.includes("FINAL_SAVED_VOICE_DESIGN_REQUIRED"));
    ok(changed(op => op.id === design!.id ? { ...op, receipt: null } : op)?.review.blockers.includes("FINAL_SAVED_VOICE_DESIGN_REQUIRED"));
    ok(changed(op => op.id === binding.id ? { ...op, receipt: { ...op.receipt, failure: { ...op.receipt!.failure!, providerCode: "another_error" } } } : op)?.review.blockers.includes("FINAL_FAILURE_CATEGORY_NOT_RETRYABLE"));
    const baseReview = { amendmentId: id(65), operationId: binding.id, version: run.version,
      quote: quote.databaseQuote, quoteHash: quote.review.quoteVersion, operatorApproved: true, configurationCorrected: true,
      reviewedHttpStatus: 400, reason: "provider_labels_corrected", additionalRequests: 1,
      verifiedOutputs: rows.filter(op => op.state === "ready" && op.output).map(proof) };
    const rejectedApproval = async (payload: Record<string, unknown>, code: RegExp) => {
      await assert.rejects(pg.query("select public.ugc_final_retry_stage($1,$2,$3::jsonb)", [id(1), run.id, JSON.stringify(payload)]), code); checks++;
    };
    await rejectedApproval({ ...baseReview, reviewedHttpStatus: 403 }, /FINAL_OPERATOR_REVIEW_REQUIRED/);
    await rejectedApproval({ ...baseReview, verifiedOutputs: [proof(rows.find(op => op.id === id(50))!)] }, /FINAL_UPSTREAM_INTEGRITY_REQUIRED/);
    for (const [patch, code] of [[{ additionalCostMicrousd: 1 }, /FINAL_INVALID_AUTHORIZATION_AMENDMENT/],
      [{ replacementEstimate: { ...quote.databaseQuote.replacementEstimate, estimatedCostMicrousd: 1 } }, /COST_ESTIMATE_UNAVAILABLE/],
      [{ replacementEstimate: { ...quote.databaseQuote.replacementEstimate, estimatedCredits: 119 } }, /COST_ESTIMATE_UNAVAILABLE/]] as const) {
      const badQuote = { ...quote.databaseQuote, ...patch };
      await rejectedApproval({ ...baseReview, quote: badQuote, quoteHash: packageDigest("sceenyk-final-retry-quote", badQuote) }, code);
    }
    const approved = await approve(id(65), quote);
    equal(run.paid_requests, 6); equal(effectiveAuthorization(run, await readAmendments()).remainingRequests, 6);
    equal((await pg.query<{ value: FinalExecution }>("select to_jsonb(public.ugc_final_retry_stage($1,$2,$3::jsonb)) value", [id(1), run.id, JSON.stringify(approved)])).rows[0].value.id, run.id);
    equal((await readAmendments()).length, 4);
    await claim();
    // Worker restart before admission reuses design 4 and the saved video.
    for (const [key, kind, input, expectedId] of [["voice:design", "design", designPayload.input, design!.id],
      ["video:scene-1", "video", { scene: doc.scenes[0], referenceHashes: videoInput.referenceHashes }, id(50)]] as const) {
      const reused = await checkpoint("intent", { ...designPayload, key, kind, input });
      equal(reused.created, false); equal(reused.operation.id, expectedId); equal(run.paid_requests, 6);
    }
    await pg.query("update public.ugc_final_executions set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [run.id]);
    await claim(); equal(run.paid_requests, 6);
    equal((await checkpoint("intent", { ...bindingPayload, input: { ...bindingPayload.input, previewFingerprint: "wrong-preview" } })).blocked, "FINAL_RETRY_INPUT_CHANGED");
    equal(run.paid_requests, 6);
    const replacement = await checkpoint("intent", bindingPayload);
    equal(replacement.created, true); equal(replacement.operation.attempt, 2); equal(replacement.operation.supersedes_operation_id, binding.id);
    equal(replacement.operation.operation_key, "voice:binding:attempt:2"); equal(replacement.operation.amendment_id, id(65));
    equal(run.paid_requests, 7); equal(effectiveAuthorization(run, await readAmendments()).remainingRequests, 5);
    // Lease expiry after admission cannot purchase a third attempt.
    const token = run.claim_token;
    await pg.query("update public.ugc_final_executions set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [run.id]);
    await claim(); ok(run.claim_token !== token);
    equal((await checkpoint("intent", bindingPayload)).operation.id, replacement.operation.id); equal(run.paid_requests, 7);
    equal((await checkpoint("intent", designPayload)).operation.id, design!.id); equal(run.paid_requests, 7);
    // An admitted request without a saved response/receipt is uncertain after a
    // crash. Recovery reconciles it and never creates a new paid attempt.
    await checkpoint("fail", { code: "FINAL_UNCERTAIN_PROVIDER_OUTCOME" });
    equal(await quoteNow(), null);
    await pg.query("select public.ugc_final_action($1,$2,$3,'recover',$4::jsonb)", [id(1), id(2), id(3), JSON.stringify({ executionId: run.id, version: run.version })]);
    await claim(); equal((await checkpoint("intent", bindingPayload)).created, false); equal(run.paid_requests, 7);
    const savedDesign = (await readOps()).find(op => op.id === design!.id)!;
    const payload = elevenLabsBindingRequest(plan.profile!, savedDesign.receipt!);
    equal(payload.generated_voice_id, previewId); equal(payload.labels, { application: "sceenyk", language: "en" });
    equal("profile" in payload.labels, false); ok(payload.voice_description.includes(plan.profile!.description));
    const rich = elevenLabsBindingRequest({ ...plan.profile!, description: "A".repeat(500) }, savedDesign.receipt!);
    equal(rich.labels, payload.labels); ok(rich.voice_description.startsWith("A".repeat(500)));
    validateElevenLabsLabels({ character: "a".repeat(50) }); checks++;
    assert.throws(() => validateElevenLabsLabels({ character: "a".repeat(51) }), /FINAL_VOICE_LABEL_VALUE_LIMIT:character/); checks++;
    const voice = new ElevenLabsVoiceGenerationProvider();
    // The actual adapter's transport is replay-only with synthetic JSON. Any
    // unexpected Design, retrieval or HTTP call fails this test immediately.
    voice.design = async () => { throw new Error("DUPLICATE_DESIGN_FORBIDDEN"); };
    const key = process.env.ELEVENLABS_API_KEY;
    try {
      process.env.ELEVENLABS_API_KEY = "synthetic-offline-fixture";
      const context = { signal: new AbortController().signal, received: async () => {}, replayResponse: Buffer.from('{"voice_id":"saved-binding-voice"}') };
      await assert.rejects(voice.bind({ ...plan.profile!, language: "a".repeat(51) }, savedDesign.receipt!, context), /FINAL_VOICE_LABEL_VALUE_LIMIT:language/); checks++;
      const result = await voice.bind(plan.profile!, savedDesign.receipt!, context);
      equal(result.receipt.result, { bindingRef: "saved-binding-voice" });
      await checkpoint("receipt", { operationId: replacement.operation.id, receipt: result.receipt });
    } finally { if (key === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = key; }
    await checkpoint("output", { operationId: replacement.operation.id, asset: null });
    await checkpoint("profile", { binding: { result: { bindingRef: "saved-binding-voice" } } });
    equal((await checkpoint("intent", bindingPayload)).created, false); equal(run.paid_requests, 7);
    const remaining = plan.breakdown.filter(item => !["design", "binding"].includes(item.kind) && item.operationKey !== "video:scene-1");
    const next = { key: remaining[0].operationKey, kind: remaining[0].kind, input: {}, fingerprint: packageDigest("next-fixture", {}),
      provider: remaining[0].provider, model: remaining[0].model, costEstimate: remaining[0] };
    equal((await checkpoint("intent", next)).blocked, "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST"); equal(run.paid_requests, 7);
    await checkpoint("fail", { code: "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST" });
    await pg.query("select public.ugc_final_action($1,$2,$3,'resume',$4::jsonb)", [id(1), id(2), id(3), JSON.stringify({ executionId: run.id, version: run.version, acceptedCost: true })]);
    await claim();
    for (const estimate of remaining) {
      const admitted = await checkpoint("intent", { key: estimate.operationKey, kind: estimate.kind, input: {},
        fingerprint: packageDigest("remaining-fixture", estimate.operationKey), provider: estimate.provider, model: estimate.model, costEstimate: estimate });
      equal(admitted.created, true);
    }
    equal(run.paid_requests, 12); equal(effectiveAuthorization(run, await readAmendments()).remainingRequests, 0);
    equal(run.configuration, configuration); equal(run.configuration_hash, configHash); equal(run.estimated_cost_microusd, 4762400);
    equal((await readOps()).filter(op => op.kind === "design").length, 4);
    equal((await pg.query("select to_jsonb(o) row from public.ugc_final_operations o where id=any($1::uuid[]) order by id", [rows.map(op => op.id)])).rows, priorRows);
    await assert.rejects(pg.query("update public.ugc_final_operations set state='intent' where id=$1", [binding.id]), /immutable/i); checks++;
    const beforeRerun = (await pg.query("select to_jsonb(a) row from public.ugc_final_authorization_amendments a order by id")).rows;
    await pg.exec(migration);
    equal((await pg.query("select to_jsonb(a) row from public.ugc_final_authorization_amendments a order by id")).rows, beforeRerun);
    equal((await pg.query<{ browser: boolean; serviceWrite: boolean; rpc: boolean }>("select has_table_privilege('authenticated','public.ugc_final_authorization_amendments','SELECT') browser,has_table_privilege('service_role','public.ugc_final_authorization_amendments','INSERT') \"serviceWrite\",has_function_privilege('authenticated','public.ugc_final_retry_stage(uuid,uuid,jsonb)','EXECUTE') rpc")).rows[0],
      { browser: false, serviceWrite: false, rpc: false });
    console.info(`Final-video binding checks passed: ${checks}; synthetic database 1..74, saved response replay only; real providers/worker/retry: none`);
  } finally { await pg.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
