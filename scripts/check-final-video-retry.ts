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
import { isFinalOperator, assertFinalOperator } from "../lib/final-video-generation/operator";

async function main() {
  Error.stackTraceLimit = 40;
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_RETRY_CHECKS"); };
  let checks = 0;
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const ok = (value: unknown) => { assert.ok(value); checks++; };
  const pg = new PGlite();
  try {
    await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
    const target = "20261028007300_ugc_final_authorization_amendments.sql";
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
    const originalRows = (await pg.query("select to_jsonb(o) value from public.ugc_final_operations o order by id")).rows;
    const originalFunctions = (await pg.query<{ oid: number; proname: string; prosrc: string; acl: string | null }>(
      "select oid,proname,prosrc,proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname not in ('ugc_final_action','ugc_final_checkpoint') order by oid")).rows;
    const migration = fs.readFileSync(`supabase/migrations/${target}`, "utf8");
    await pg.exec(migration); await pg.exec(migration); await pg.exec(migration.replace(/\r?\n/g, "\r\n"));
    equal((await pg.query("select to_jsonb(o)-array['logical_key','supersedes_operation_id','amendment_id'] value from public.ugc_final_operations o order by id")).rows, originalRows);
    const oldIds = originalFunctions.map(fn => fn.oid);
    equal((await pg.query("select oid,proname,prosrc,proacl::text acl from pg_proc where oid=any($1::oid[]) order by oid", [oldIds])).rows, originalFunctions);
    const readRun = async () => (await pg.query<{ value: FinalExecution }>("select to_jsonb(e) value from public.ugc_final_executions e where id=$1", [id(40)])).rows[0].value;
    const readOps = async () => (await pg.query<{ value: Operation }>("select to_jsonb(o) value from public.ugc_final_operations o where execution_id=$1 order by created_at,id", [id(40)])).rows.map(row => row.value);
    let run = await readRun(); const operations = await readOps();
    equal((await pg.query<{ value: boolean }>("select public.ugc_final_current($1) value", [run.id])).rows[0].value, true);
    const quote = retryReview(run, doc, operations, [], plan, { current: true, operator: true, sharedReservedCredits: 119 })!;
    ok(quote.review.available); equal(quote.review.requiredNewRequests, 7); equal(quote.review.effectiveRequestsAfter, 9);
    equal(quote.review.projectedTotalCostMicrousd, 4762400); equal(quote.review.projectedIncludedCredits, 260);
    const operatorSetting = process.env.UGC_FINAL_OPERATOR_USER_ID;
    try {
      delete process.env.UGC_FINAL_OPERATOR_USER_ID; equal(isFinalOperator(id(1)), false);
      process.env.UGC_FINAL_OPERATOR_USER_ID = id(1); equal(isFinalOperator(id(1)), true); equal(isFinalOperator(id(99)), false);
      assert.throws(() => assertFinalOperator(id(99)), /FINAL_OPERATOR_SETUP_REQUIRED/); checks++;
    } finally { if (operatorSetting === undefined) delete process.env.UGC_FINAL_OPERATOR_USER_ID; else process.env.UGC_FINAL_OPERATOR_USER_ID = operatorSetting; }
    const quoteWith = (opts: { current?: boolean; operator?: boolean; sharedReservedCredits?: number } = {}, rows = operations) =>
      retryReview(run, doc, rows, [], plan, { current: true, operator: true, sharedReservedCredits: 119, ...opts });
    ok(quoteWith({ operator: false })?.review.blockers.includes("FINAL_OPERATOR_SETUP_REQUIRED"));
    ok(quoteWith({ current: false })?.review.blockers.includes("FINAL_PACKAGE_CHANGED"));
    ok(quoteWith({ sharedReservedCredits: 9900 })?.review.blockers.includes("ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED"));
    const costProposal = retryReview({ ...run, configuration: { ...configuration, maxEstimatedCostMicrousd: 4000000 } }, doc, operations, [], plan,
      { current: true, operator: true, sharedReservedCredits: 119 })!;
    equal(costProposal.review.additionalCostMicrousd, 762400); equal(costProposal.review.effectiveCostAfterMicrousd, 4762400);
    equal(costProposal.review.authorization.originalCostMicrousd, 4000000);
    equal(quoteWith({}, operations.map(op => op.id === id(51) ? { ...op, state: "intent" as const, error_code: null } : op)), null);
    ok(quoteWith({}, operations.map(op => op.id === id(51) ? { ...op, receipt: { failure: { httpStatus: 422, providerRequestId: null, providerCode: null,
      message: "Not a permission denial", method: "POST" as const, bodyRetained: false as const } } } : op))?.review.blockers.includes("FINAL_FAILURE_CATEGORY_NOT_RETRYABLE"));
    const payload = { amendmentId: id(60), operationId: id(51), version: run.version, quote: quote.databaseQuote, quoteHash: quote.review.quoteVersion,
      operatorApproved: true, configurationCorrected: true, reviewedHttpStatus: 403, reason: "provider_permission_corrected", additionalRequests: 1,
      verifiedOutputs: [{ operationId: id(50), sha256: asset.sha256, etag: asset.etag, sizeBytes: asset.sizeBytes }] };
    const retry = async (value = payload, owner = id(1)) => (await pg.query<{ value: FinalExecution | null }>("select to_jsonb(public.ugc_final_retry_stage($1,$2,$3::jsonb)) value", [owner, run.id, JSON.stringify(value)])).rows[0].value;
    equal(await retry(payload, id(99)), null);
    await assert.rejects(retry({ ...payload, operatorApproved: false }), /FINAL_OPERATOR_REVIEW_REQUIRED/); checks++;
    await assert.rejects(retry({ ...payload, configurationCorrected: false }), /FINAL_OPERATOR_REVIEW_REQUIRED/); checks++;
    await assert.rejects(retry({ ...payload, version: run.version + 1 }), /FINAL_RETRY_SCOPE_CHANGED/); checks++;
    await assert.rejects(retry({ ...payload, verifiedOutputs: [] }), /FINAL_UPSTREAM_INTEGRITY_REQUIRED/); checks++;
    await assert.rejects(retry({ ...payload, quoteHash: "f".repeat(64) }), /FINAL_RETRY_QUOTE_CHANGED/); checks++;
    await pg.query("update fixture_input set value=jsonb_set(value,'{source,scene,projectTitle}','\"Stale\"'::jsonb)");
    await assert.rejects(retry(), /FINAL_RETRY_SCOPE_CHANGED/); checks++;
    await pg.query("update fixture_input set value=$1::jsonb", [JSON.stringify(source)]);
    const badQuote = { ...quote.databaseQuote, projectedTotalCostMicrousd: 8000000 };
    await assert.rejects(retry({ ...payload, quote: badQuote, quoteHash: packageDigest("sceenyk-final-retry-quote", badQuote) }), /FINAL_BUDGET_INSUFFICIENT/); checks++;
    run = (await retry())!; equal(run.state, "queued"); equal(run.paid_requests, 2); equal(run.configuration_hash, configHash); equal(run.configuration, configuration);
    await assert.rejects(retry({ ...payload, amendmentId: id(62) }), /FINAL_RETRY_SCOPE_CHANGED/); checks++;
    equal((await retry())?.id, run.id); equal((await pg.query<{ n: number }>("select count(*)::integer n from public.ugc_final_authorization_amendments")).rows[0].n, 1);
    const amendments = (await pg.query<AuthorizationAmendment>("select * from public.ugc_final_authorization_amendments")).rows;
    equal(effectiveAuthorization(run, amendments).effectiveRequests, 9); equal(effectiveAuthorization(run, amendments).remainingRequests, 7);
    equal(effectiveAuthorization(run, amendments).effectiveCostMicrousd, 7000000);
    equal(effectiveAuthorization(run, [{ ...amendments[0], original_configuration_hash: "f".repeat(64) }]).effectiveRequests, 8);
    await assert.rejects(pg.exec("update public.ugc_final_authorization_amendments set additional_requests=2"), /immutable|append.only/i); checks++;
    await assert.rejects(pg.query("update public.ugc_final_operations set state='intent' where id=$1", [id(51)]), /immutable/i); checks++;
    await assert.rejects(pg.query("delete from public.ugc_final_operations where id=$1", [id(51)]), /immutable/i); checks++;
    await assert.rejects(pg.query("update public.ugc_final_operations set output='{}' where id=$1", [id(50)]), /immutable/i); checks++;
    await assert.rejects(pg.query("update public.ugc_final_executions set configuration=jsonb_set(configuration,'{maxRequests}','9') where id=$1", [id(40)]), /immutable/i); checks++;
    const permissions = (await pg.query<{ browser: boolean; serviceWrite: boolean; rpc: boolean }>("select has_table_privilege('authenticated','public.ugc_final_authorization_amendments','SELECT') browser,has_table_privilege('service_role','public.ugc_final_authorization_amendments','INSERT') \"serviceWrite\",has_function_privilege('authenticated','public.ugc_final_retry_stage(uuid,uuid,jsonb)','EXECUTE') rpc")).rows[0];
    equal(permissions, { browser: false, serviceWrite: false, rpc: false });
    run = (await pg.query<{ value: FinalExecution }>("select to_jsonb(public.ugc_final_claim($1)) value", [id(70)])).rows[0].value;
    const checkpoint = async (command: string, data: Record<string, unknown> = {}) => {
      const result = (await pg.query<{ value: { execution: FinalExecution; operation: Operation; created: boolean; blocked?: string } }>("select public.ugc_final_checkpoint($1,$2,$3,$4::jsonb) value", [run.id, run.claim_token, command, JSON.stringify(data)])).rows[0].value;
      if (result) run = result.execution; return result;
    };
    const designPayload = { key: "voice:design", kind: "design", input: { profile: plan.profile, previewText: plan.designPreviewText }, sceneId: null,
      fingerprint: packageDigest("fixture-original-design", {}), provider: configuration.providers.design.id, model: configuration.providers.design.model,
      costEstimate: plan.breakdown.find(item => item.kind === "design") };
    const videoReuse = await checkpoint("intent", { key: "video:scene-1", kind: "video", input: { scene: doc.scenes[0], referenceHashes: videoInput.referenceHashes },
      fingerprint: operations[0].fingerprint, sceneId: "scene-1", provider: "fal", model: configuration.providers.video.model, costEstimate: plan.breakdown[0] });
    equal(videoReuse.created, false); equal(videoReuse.operation.id, id(50)); equal(run.paid_requests, 2);
    await checkpoint("fail", { code: "FINAL_LOCAL_RECOVERY_REQUIRED" });
    await pg.query("select public.ugc_final_action($1,$2,$3,'recover',$4::jsonb)", [id(1), id(2), id(3), JSON.stringify({ executionId: run.id, version: run.version })]);
    run = (await pg.query<{ value: FinalExecution }>("select to_jsonb(public.ugc_final_claim($1)) value", [id(70)])).rows[0].value;
    equal((await checkpoint("intent", designPayload)).blocked, "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST"); equal(run.paid_requests, 2);
    await checkpoint("fail", { code: "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST" });
    await pg.query("select public.ugc_final_action($1,$2,$3,'resume',$4::jsonb)", [id(1), id(2), id(3), JSON.stringify({ executionId: run.id, version: run.version, acceptedCost: true })]);
    run = (await pg.query<{ value: FinalExecution }>("select to_jsonb(public.ugc_final_claim($1)) value", [id(70)])).rows[0].value;
    const replacement = await checkpoint("intent", designPayload);
    equal(replacement.created, true); equal(replacement.operation.attempt, 2); equal(replacement.operation.supersedes_operation_id, id(51));
    equal(replacement.operation.amendment_id, id(60)); equal(run.paid_requests, 3);
    equal(replacement.operation.operation_key, "voice:design:attempt:2"); ok(replacement.operation.fingerprint !== operations[1].fingerprint);
    equal((await checkpoint("intent", designPayload)).created, false); equal(run.paid_requests, 3);
    const previousToken = run.claim_token;
    await pg.query("update public.ugc_final_executions set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [run.id]);
    run = (await pg.query<{ value: FinalExecution }>("select to_jsonb(public.ugc_final_claim($1)) value", [id(71)])).rows[0].value;
    ok(run.claim_token !== previousToken);
    equal((await pg.query<{ value: unknown }>("select public.ugc_final_checkpoint($1,$2,'heartbeat','{}') value", [run.id, previousToken])).rows[0].value, null);
    equal((await checkpoint("intent", designPayload)).operation.id, replacement.operation.id); equal(run.paid_requests, 3);
    equal(effectiveAuthorization(run, amendments).remainingRequests, 6);
    equal((await readOps()).find(op => op.id === id(50))?.output, asset);
    equal((await readOps()).find(op => op.id === id(51))?.state, "failed");
    equal((await pg.query("select to_jsonb(o)-array['logical_key','supersedes_operation_id','amendment_id'] value from public.ugc_final_operations o where id in ($1,$2) order by id", [id(50), id(51)])).rows, originalRows);
    await pg.exec("begin;savepoint observed_cost;");
    await checkpoint("receipt", { operationId: replacement.operation.id, receipt: { usage: { actualCostMicrousd: 8000000 } } });
    const overActual = await checkpoint("intent", { key: "voice:binding", kind: "binding", input: {}, fingerprint: packageDigest("overspent-fixture", {}),
      provider: "elevenlabs", model: configuration.providers.binding.model, costEstimate: plan.breakdown.find(item => item.kind === "binding") });
    equal(overActual.blocked, "FINAL_BUDGET_EXHAUSTED"); equal(run.paid_requests, 3);
    await pg.exec("rollback to savepoint observed_cost;commit;"); run = await readRun();
    // An uncertain replacement is reconciliation-only; no new amendment or
    // implicit third attempt is admitted, including after a worker restart.
    await checkpoint("fail", { code: "FINAL_UNCERTAIN_PROVIDER_OUTCOME" });
    const uncertainRun = await readRun(); equal(uncertainRun.state, "reconciling");
    equal(retryReview(uncertainRun, doc, await readOps(), amendments, plan, { current: true, operator: true, sharedReservedCredits: 238 }), null);
    await assert.rejects(retry({ ...payload, amendmentId: id(61), operationId: replacement.operation.id, version: uncertainRun.version }), /FINAL_RETRY_SCOPE_CHANGED/); checks++;
    await pg.query("select public.ugc_final_action($1,$2,$3,'recover',$4::jsonb)", [id(1), id(2), id(3), JSON.stringify({ executionId: run.id, version: run.version })]);
    run = (await pg.query<{ value: FinalExecution }>("select to_jsonb(public.ugc_final_claim($1)) value", [id(70)])).rows[0].value;
    equal((await checkpoint("intent", designPayload)).operation.id, replacement.operation.id); equal(run.paid_requests, 3);
    // Saved response replay/output recovery is local. Model a successful saved
    // preview without executing any adapter or generating audio bytes.
    await checkpoint("receipt", { operationId: replacement.operation.id, receipt: { requestId: "fixture-design-request", result: { previewRef: "fixture-preview" } } });
    const audioAsset = { ...asset, key: asset.key.replace(/\.mp4$/, ".mp3"), mimeType: "audio/mpeg", width: 0, height: 0, hasAudio: true, sampleRate: 44100, channels: 1 };
    await checkpoint("output", { operationId: replacement.operation.id, asset: audioAsset });
    const bindingEstimate = plan.breakdown.find(item => item.kind === "binding")!;
    const bindingPayload = { key: "voice:binding", kind: "binding", input: { profileId: plan.profile!.id, previewFingerprint: replacement.operation.fingerprint },
      fingerprint: packageDigest("binding-fixture", {}), provider: "elevenlabs", model: configuration.providers.binding.model, costEstimate: bindingEstimate };
    equal((await checkpoint("intent", bindingPayload)).blocked, "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST"); equal(run.paid_requests, 3);
    await checkpoint("fail", { code: "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST" });
    await pg.query("select public.ugc_final_action($1,$2,$3,'resume',$4::jsonb)", [id(1), id(2), id(3), JSON.stringify({ executionId: run.id, version: run.version, acceptedCost: true })]);
    run = (await pg.query<{ value: FinalExecution }>("select to_jsonb(public.ugc_final_claim($1)) value", [id(70)])).rows[0].value;
    const binding = await checkpoint("intent", bindingPayload); equal(binding.created, true);
    await checkpoint("receipt", { operationId: binding.operation.id, receipt: { result: { bindingRef: "fixture-voice" } } });
    await checkpoint("output", { operationId: binding.operation.id, asset: null });
    await checkpoint("profile", { binding: { result: { bindingRef: "fixture-voice" } } });
    for (const estimate of plan.breakdown.filter(item => !["design", "binding"].includes(item.kind) && item.operationKey !== "video:scene-1")) {
      await pg.exec("begin;savepoint budget_limit;");
      await pg.query("update public.ugc_final_executions set paid_requests=9 where id=$1", [run.id]);
      const exhausted = await checkpoint("intent", { key: estimate.operationKey, kind: estimate.kind, input: {}, fingerprint: packageDigest("remaining-fixture", estimate.operationKey),
        provider: estimate.provider, model: estimate.model, sceneId: estimate.sceneNumber ? `scene-${estimate.sceneNumber}` : null, costEstimate: estimate });
      equal(exhausted.blocked, "FINAL_BUDGET_EXHAUSTED");
      await pg.exec("rollback to savepoint budget_limit;commit;"); run = await readRun();
      const result = await checkpoint("intent", { key: estimate.operationKey, kind: estimate.kind, input: {}, fingerprint: packageDigest("remaining-fixture", estimate.operationKey),
        provider: estimate.provider, model: estimate.model, sceneId: estimate.sceneNumber ? `scene-${estimate.sceneNumber}` : null, costEstimate: estimate });
      equal(result.created, true);
    }
    equal(run.paid_requests, 9); equal(run.estimated_cost_microusd, 4762400); equal(run.configuration_hash, configHash);
    equal(effectiveAuthorization(run, amendments).remainingRequests, 0);
    equal((await checkpoint("intent", designPayload)).operation.id, replacement.operation.id); equal(run.paid_requests, 9);
    // Completed requests remain immutable and all failed history survives rerun.
    const beforeRerun = (await pg.query("select to_jsonb(a) row from public.ugc_final_authorization_amendments a")).rows;
    await pg.exec(migration); equal((await pg.query("select to_jsonb(a) row from public.ugc_final_authorization_amendments a")).rows, beforeRerun);
    equal((await readOps()).find(op => op.id === id(50))?.output, asset);
    equal((await readOps()).find(op => op.id === id(51))?.state, "failed");
    console.info(`Final-video retry checks passed: ${checks}; in-memory migrations 1..73/reruns; live/provider/worker execution: none`);
  } finally { await pg.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
