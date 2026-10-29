import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { v3Input, v3Context, v3Id, sealV3 } from "./final-video-v3-fixture";
import { buildFrozenPackage, readFrozenPackage, packageCurrentness, packageCost, restoreSegment } from "../lib/final-video-generation-v3/package";
import { planGenerationSegments } from "../lib/final-video-generation-v3/planner";
import { HiggsfieldVideoGenerationProvider, higgsfieldModels, inspectHiggsfieldPayload, mapHiggsfieldStatus,
  parseHiggsfieldAcceptance } from "../lib/final-video-generation-v3/adapters/higgsfield";
import { bindEstimateResponse } from "../lib/final-video-generation-v3/adapters/higgsfield-pricing";
import { bindAuthorization, authorizationIssues } from "../lib/final-video-generation-v3/authorization";
import { assertPaidV3Execution, v3Digest } from "../lib/final-video-generation-v3/identity";
import { initialExecution, reduceExecution, recoveryAction, canJoin, uncheckedValidation, type Execution, type Validation } from "../lib/final-video-generation-v3/recovery";
import { inspectV3Package } from "../lib/final-video-generation-v3/preflight";

let checks = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (v: unknown) => { assert.ok(v); checks++; };
const throws = (fn: () => unknown, code?: string) => { if (code) assert.throws(fn, new RegExp(code)); else assert.throws(fn); checks++; };
const provider = new HiggsfieldVideoGenerationProvider(), now = new Date().toISOString();
const future = new Date(Date.now() + 3_600_000).toISOString();
function fixture(durations = [5000, 5000], version = 1) {
  const input = v3Input(durations), context = v3Context(input, provider); context.now = now;
  const planned = planGenerationSegments(input, provider, context); assert.ok(planned.ok);
  context.estimateEvidence = planned.plan.segments.map(s => bindEstimateResponse(s.command, { usd: String(s.durationMs / 10000) }, {
    providerId: "higgsfield", accountScope: context.accountScope, observedAt: now, expiresAt: future }));
  return { input, context, doc: buildFrozenPackage(input, provider, context, { id: v3Id(100 + version), version, sourceRevision: 1 }) };
}
const { input, context, doc } = fixture();
equal(doc.segments.length, 1); equal(doc.segments[0].durationMs, 10000); equal(doc.pricing.totalMicrousd, 1_000_000);
equal(readFrozenPackage(JSON.parse(JSON.stringify(doc))), doc); ok(Object.isFrozen(doc.segments));
equal(packageCurrentness(doc, input, 1), true); equal(packageCurrentness(doc, input, 2), false);
const changed = structuredClone(input); changed.resolution = "720p";
equal(packageCurrentness(doc, changed, 1), false);
changed.storyboardContent.visualStyle = "Cinematic"; sealV3(changed); equal(packageCurrentness(doc, changed, 1), false);
const revised = fixture([5000, 5000], 2).doc; ok(revised.hash !== doc.hash); equal(doc.version, 1);
const tampered = JSON.parse(JSON.stringify(doc)); tampered.segments[0].compiledPrompt += "altered";
throws(() => readFrozenPackage(tampered), "PACKAGE_INTEGRITY_INVALID");
const alteredHash = { ...tampered }; delete alteredHash.hash; tampered.hash = v3Digest("frozen-package", alteredHash);
throws(() => readFrozenPackage(tampered), "SEGMENT_INTEGRITY_INVALID");
equal(packageCost(doc, provider, now).totalMicrousd, 1_000_000);
equal(packageCost(doc, provider, future).code, "COST_ESTIMATE_UNAVAILABLE");
const noCost = buildFrozenPackage(input, provider, { ...context, estimateEvidence: [] }, { id: v3Id(160), version: 1, sourceRevision: 1 });
equal(noCost.pricing.status, "unavailable"); equal(noCost.pricing.totalMicrousd, null);
const multi = fixture([30000, 15000]).doc;
equal(multi.segments.map(s => s.durationMs), [30000, 15000]); equal(multi.pricing.totalMicrousd, 4_500_000);
equal(multi.composition, "review_segments_then_join"); equal(packageCost(multi, provider, now).totalMicrousd, 4_500_000);
const approval = { id: v3Id(200), model: higgsfieldModels.reference, maxRequests: 1, maxEstimatedCostMicrousd: 2_000_000,
  operatorId: input.scope.ownerId, approvedAt: now, expiresAt: future };
const authority = bindAuthorization(doc, provider, approval);
equal(authorizationIssues(doc, authority, now, higgsfieldModels.reference), []);
equal(authorizationIssues(revised, authority, now, higgsfieldModels.reference), ["AUTHORIZATION_PACKAGE_MISMATCH"]);
equal(authorizationIssues(doc, authority, future, higgsfieldModels.reference), ["AUTHORIZATION_EXPIRED"]);
throws(() => bindAuthorization(noCost, provider, approval), "COST_ESTIMATE_UNAVAILABLE");
throws(() => bindAuthorization(doc, provider, { ...approval, maxRequests: 2 }), "AUTHORIZATION_LIMIT_INVALID");
throws(() => bindAuthorization(doc, provider, { ...approval, maxEstimatedCostMicrousd: 1 }), "AUTHORIZATION_LIMIT_INVALID");
const higherCeiling = bindAuthorization(doc, provider, { ...approval, id: v3Id(201), maxEstimatedCostMicrousd: 9_000_000 });
equal(higherCeiling.maxEstimatedCostMicrousd, 9_000_000); equal(doc.pricing.totalMicrousd, 1_000_000);
const segment = restoreSegment(doc, doc.segments[0].id);
const secret = "never-print-this-signed-secret";
const payload = inspectHiggsfieldPayload(segment, new Map(input.references.map(r => [r.id, `https://media.example.test/private/${secret}?X-Amz-Signature=${secret}`])));
ok(!JSON.stringify(payload).includes(secret)); equal(payload.input.duration, 10); equal(payload.input.generate_audio, true);
equal(payload.input.resolution, "480p"); equal(payload.model, higgsfieldModels.reference);
equal(Object.keys(payload.input).sort(), ["aspect_ratio", "duration", "generate_audio", "image_urls", "output_format", "prompt", "resolution"]);
equal(payload.executable, false); throws(assertPaidV3Execution, "PAID_V3_EXECUTION_DISABLED");
equal(mapHiggsfieldStatus({ request_id: v3Id(910), status: "queued", video: null, expires_at: null }, v3Id(910)).state, "pending");
equal(parseHiggsfieldAcceptance({ request_id: v3Id(910), status: "queued", status_url: `https://api.higgsfield.ai/requests/${v3Id(910)}/status`,
  cancel_url: `https://api.higgsfield.ai/requests/${v3Id(910)}/cancel`, expires_after: 604800 }).requestId, v3Id(910));
throws(() => parseHiggsfieldAcceptance({ request_id: v3Id(910), status: "queued", status_url: `https://evil.invalid/requests/${v3Id(910)}/status`,
  cancel_url: `https://api.higgsfield.ai/requests/${v3Id(910)}/cancel`, expires_after: 604800 }), "STATUS_LOCATOR_INVALID");
const inspection = inspectV3Package(doc, { currentInput: input, sourceRevision: 1, now, authorization: authority });
equal(inspection.eligibleForPaidSubmission, false); equal(inspection.authorizationState, "bound_operator_approval");
ok(inspection.issues.includes("PAID_V3_EXECUTION_DISABLED")); ok(inspection.issues.includes("REFERENCE_LIMIT_UNVERIFIED"));
equal(inspectV3Package(doc, { currentInput: changed, sourceRevision: 1, now }).currentness, "stale");
const inspectionWithDelivery = inspectV3Package(doc, { currentInput: input, sourceRevision: 1, now,
  deliveryMedia: Object.fromEntries(input.references.map(r => [r.id, `https://media.example.test/${secret}?token=${secret}`])) });
equal(inspectionWithDelivery.segments[0].payloadUsesInspectionPlaceholders, false);
ok(!JSON.stringify(inspectionWithDelivery).includes(secret));
ok(inspectionWithDelivery.segments[0].payload?.exactBodySha256 !== payload.exactBodySha256);
equal(inspectionWithDelivery.segments[0].payload?.commandFingerprint, payload.commandFingerprint);
const envelopePath = path.join(os.tmpdir(), `sceenyk-v3-inspection-${Date.now()}.json`);
try {
  fs.writeFileSync(envelopePath, JSON.stringify({ package: doc, currentInput: input, sourceRevision: 1, authorization: authority }));
  const cli = spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "scripts/inspect-final-video-v3.ts", envelopePath], { encoding: "utf8", timeout: 60000 });
  equal(cli.status, 0); equal(JSON.parse(cli.stdout).eligibleForPaidSubmission, false); equal(cli.stderr, "");
} finally { fs.rmSync(envelopePath, { force: true }); }
const pass: Validation = Object.fromEntries(Object.keys(uncheckedValidation).map(k => [k, "pass"])) as Validation;
function result(document = doc, index = 0) {
  return { id: v3Id(300 + index), sha256: "e".repeat(64), storageKey: `users/${input.scope.ownerId}/projects/${input.scope.projectId}/v3/results/${index}.mp4`,
    sizeBytes: 10000, mimeType: "video/mp4" as const, durationMs: document.segments[index].durationMs, width: 480, height: 854, hasAudio: true,
    verifiedAt: now, verifiedReadback: true as const, providerRequestId: v3Id(400 + index), actualCostMicrousd: null, receiptHash: null };
}
function runToResult(document: typeof doc, original: Execution, index: number) {
  const segmentId = document.segments[index].id;
  let state = reduceExecution(document, original, { type: "generate", segmentId, attemptId: v3Id(500 + index), idempotencyKey: v3Id(600 + index) });
  throws(() => reduceExecution(document, state, { type: "generate", segmentId, attemptId: v3Id(700), idempotencyKey: v3Id(701) }), "RECONCILE_OR_REUSE");
  state = reduceExecution(document, state, { type: "submitting", segmentId, requestBodyHash: "a".repeat(64) });
  state = reduceExecution(document, state, { type: "accepted", segmentId, providerRequestId: v3Id(400 + index) });
  return reduceExecution(document, state, { type: "save_result", segmentId, result: result(document, index) });
}
let state = reduceExecution(doc, initialExecution(doc), { type: "authorize" });
state = runToResult(doc, state, 0); equal(state.finalCandidate, result()); equal(recoveryAction(state, segment.id), "reuse_saved_result");
throws(() => reduceExecution(doc, state, { type: "review_segment", segmentId: segment.id, decision: "approved", validation: pass }), "SEGMENT_REVIEW_UNAVAILABLE");
throws(() => reduceExecution(doc, state, { type: "review_final", decision: "approved", validation: uncheckedValidation }), "VALIDATION_REQUIRED");
const rejected = reduceExecution(doc, state, { type: "review_final", decision: "rejected", validation: pass });
equal(rejected.segments[0].attempts.length, 1); equal(rejected.finalCandidate, state.finalCandidate);
equal(reduceExecution(doc, state, { type: "review_final", decision: "approved", validation: pass }).state, "approved");
const speaking = v3Input();
speaking.storyboardContent.scenes[0].speech = [{ startMs: 1200, endMs: 2600, speaker: "character", text: "Look at this.",
  delivery: { pace: "natural", energy: "balanced", tone: "warm", emphasis: "none", style: "conversational" }, deliveryNote: "Relaxed" }];
sealV3(speaking);
const spokenDoc = buildFrozenPackage(speaking, provider, { ...v3Context(speaking, provider), now }, { id: v3Id(202), version: 1, sourceRevision: 1 });
for (const phrase of ['exact words: "Look at this."', "1.2–2.6s, character", "Relaxed", "speaking mouths", "off-screen narration", "not guaranteed"])
  ok(spokenDoc.segments[0].compiledPrompt.includes(phrase));
const spokenResult = runToResult(spokenDoc, reduceExecution(spokenDoc, initialExecution(spokenDoc), { type: "authorize" }), 0);
throws(() => reduceExecution(spokenDoc, spokenResult, { type: "review_final", decision: "approved",
  validation: { ...pass, dialogueProduced: "not_applicable", lipAudioSync: "not_applicable" } }), "VALIDATION_REQUIRED");
let unknown = reduceExecution(doc, initialExecution(doc), { type: "authorize" });
unknown = reduceExecution(doc, unknown, { type: "generate", segmentId: segment.id, attemptId: v3Id(800), idempotencyKey: v3Id(801) });
unknown = reduceExecution(doc, unknown, { type: "submitting", segmentId: segment.id, requestBodyHash: "a".repeat(64) });
unknown = reduceExecution(doc, unknown, { type: "unknown_outcome", segmentId: segment.id });
equal(recoveryAction(JSON.parse(JSON.stringify(unknown)), segment.id), "reconcile_original_request");
throws(() => reduceExecution(doc, unknown, { type: "generate", segmentId: segment.id, attemptId: v3Id(802), idempotencyKey: v3Id(803) }), "RECONCILE_OR_REUSE");
throws(() => reduceExecution(doc, unknown, { type: "definitive_failure", segmentId: segment.id, code: "FAILED", reconciled: false }), "RECONCILIATION_REQUIRED");
const failed = reduceExecution(doc, unknown, { type: "definitive_failure", segmentId: segment.id, code: "FAILED", reconciled: true });
equal(recoveryAction(failed, segment.id), "explicit_authorized_retry_only");
const retried = reduceExecution(doc, failed, { type: "generate", segmentId: segment.id, attemptId: v3Id(802), idempotencyKey: v3Id(803) });
equal(retried.segments[0].attempts.length, 2); equal(failed.segments[0].attempts.length, 1);
let multiple = reduceExecution(multi, initialExecution(multi), { type: "authorize" });
multiple = runToResult(multi, multiple, 0); equal(canJoin(multiple), false);
multiple = reduceExecution(multi, multiple, { type: "review_segment", segmentId: multi.segments[0].id, decision: "approved", validation: pass });
const savedFirst = structuredClone(multiple.segments[0]);
multiple = runToResult(multi, multiple, 1); equal(multiple.segments[0], savedFirst); equal(canJoin(multiple), false);
multiple = reduceExecution(multi, multiple, { type: "review_segment", segmentId: multi.segments[1].id, decision: "approved", validation: pass });
equal(canJoin(multiple), true);
multiple = reduceExecution(multi, multiple, { type: "joined_candidate", result: { ...result(multi), durationMs: 45000, providerRequestId: null } });
equal(multiple.finalReview, "pending"); equal(multiple.state, "awaiting_review");

async function databaseChecks() {
  const pg = new PGlite();
  try {
    await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    const migration = "20261029007600_ugc_final_v3_preflight.sql";
    const migrations = fs.readdirSync("supabase/migrations").filter(n => n.endsWith(".sql") && n < migration).sort();
    for (const name of migrations) await pg.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
    const functions = async () => (await pg.query<{ oid: number; proname: string; prosrc: string; proacl: unknown }>("select oid,proname,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
    const before = await functions();
    const sql = fs.readFileSync(`supabase/migrations/${migration}`, "utf8"); await pg.exec(sql); await pg.exec(sql);
    equal((await functions()).filter(f => before.some(b => b.oid === f.oid)), before);
    for (const table of ["projects", "sources", "packages", "authorizations", "events"]) {
      const grants = (await pg.query("select relrowsecurity rls,has_table_privilege('authenticated',oid,'SELECT') browser,has_table_privilege('service_role',oid,'INSERT') writer from pg_class where oid=$1::regclass", [`public.ugc_v3_${table}`])).rows[0];
      equal(grants, { rls: true, browser: false, writer: false });
    }
    await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'v3-synthetic-owner'),($2,'v3-other-owner')", [input.scope.ownerId, v3Id(999)]);
    const fields = { title: "Fresh V3", category: "product-ad", prompt: "Fresh", ugcType: "advertisement",
      settings: { aspectRatio: "9:16", duration: "10", visualStyle: "Realistic", tone: "Professional" } };
    const call = async (name: string, args: unknown[]) => (await pg.query<{ result: unknown }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`, args)).rows[0].result;
    const registry = await call("ugc_v3_create_project", [input.scope.ownerId, input.scope.projectId, fields]) as { logical_job_id: string };
    equal(await call("ugc_v3_create_project", [input.scope.ownerId, input.scope.projectId, fields]), registry);
    equal(await call("ugc_v3_read", [v3Id(999), input.scope.projectId]), null);
    await pg.query("insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone) values($1,$2,'Historical','product-ad','','9:16','10','Realistic','Professional')", [v3Id(998), input.scope.ownerId]);
    await assert.rejects(() => call("ugc_v3_create_project", [input.scope.ownerId, v3Id(998), fields]), /FRESH_V3_PROJECT_REQUIRED/); checks++;
    const freshInput = structuredClone(input); freshInput.scope.jobId = registry.logical_job_id; sealV3(freshInput);
    const bindings = Object.fromEntries(freshInput.references.map(r => [r.id, { storageKey: `users/${input.scope.ownerId}/projects/${input.scope.projectId}/v3/references/${r.id}.png`, sha256: r.sha256, verifiedReadback: true }]));
    const write = (action: string, payload: unknown, owner = input.scope.ownerId) => call("ugc_v3_write", [owner, input.scope.projectId, action, payload]);
    const sourcePayload = { input: freshInput, privateBindings: bindings, operatorId: input.scope.ownerId, operatorApproved: true, expectedRevision: 0 };
    await assert.rejects(() => write("source", sourcePayload), /FRESH_PRIVATE_ORIGINAL_REQUIRED/); checks++;
    await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'fresh.png','image/png',1000,'image','uploaded','etag')", [freshInput.provenance.originalImageId,input.scope.ownerId,input.scope.projectId,v3Id(970),`users/${input.scope.ownerId}/projects/${input.scope.projectId}/${freshInput.provenance.originalImageId}/original.png`]);
    await write("source", sourcePayload);
    await assert.rejects(() => write("source", sourcePayload), /SOURCE_VERSION_CONFLICT/); checks++;
    const freshContext = v3Context(freshInput, provider); freshContext.now = now;
    const packageDoc = buildFrozenPackage(freshInput, provider, freshContext, { id: v3Id(960), version: 1, sourceRevision: 1 });
    const packagePayload = { document: packageDoc, state: initialExecution(packageDoc), eventId: v3Id(961) };
    await write("package", packagePayload); await write("package", packagePayload);
    const stored = await call("ugc_v3_read", [input.scope.ownerId,input.scope.projectId]) as { packages: unknown[]; events: unknown[] };
    equal(stored.packages.length, 1); equal(stored.events.length, 1);
    await assert.rejects(() => write("package", { ...packagePayload, document: { ...packageDoc, version: 2 } }), /PACKAGE_IMMUTABLE/); checks++;
    await assert.rejects(() => pg.query("update public.ugc_v3_packages set document='{}' where id=$1", [packageDoc.id]), /append-only/); checks++;
    const pending = reduceExecution(packageDoc, initialExecution(packageDoc), { type: "await_authorization" });
    const event = { packageId: packageDoc.id, expectedRevision: 0, eventId: v3Id(962), event: { type: "await_authorization" }, state: pending };
    await write("event", event); await write("event", event);
    await assert.rejects(() => write("event", { ...event, eventId: v3Id(963) }), /EXECUTION_VERSION_CONFLICT/); checks++;
    await assert.rejects(() => write("event", { ...event, expectedRevision: 1, eventId: v3Id(964), event: { type: "generate" } }), /PAID_V3_EXECUTION_DISABLED/); checks++;
    await assert.rejects(() => write("event", event, v3Id(999)), /FRESH_V3_PROJECT_REQUIRED/); checks++;
    const quotedPlan = planGenerationSegments(freshInput, provider, freshContext); assert.ok(quotedPlan.ok);
    freshContext.estimateEvidence = quotedPlan.plan.segments.map(s => bindEstimateResponse(s.command, { usd: "1.00" }, {
      providerId: "higgsfield", accountScope: freshContext.accountScope, observedAt: now, expiresAt: future }));
    const quotedPackage = buildFrozenPackage(freshInput, provider, freshContext, { id: v3Id(965), version: 2, sourceRevision: 1 });
    await write("package", { document: quotedPackage, state: initialExecution(quotedPackage), eventId: v3Id(966) });
    const freshAuthority = bindAuthorization(quotedPackage, provider, { ...approval, id: v3Id(967) });
    const authorizationPayload = { document: freshAuthority, expectedRevision: 0, eventId: v3Id(968),
      state: reduceExecution(quotedPackage, initialExecution(quotedPackage), { type: "authorize" }) };
    await assert.rejects(() => write("authorization", { ...authorizationPayload, state: { ...authorizationPayload.state, segments: [] } }), /STATE_TRANSITION_INVALID/); checks++;
    equal((await pg.query<{ n: number }>("select count(*)::int n from public.ugc_v3_authorizations")).rows[0].n, 0);
    await write("authorization", authorizationPayload); await write("authorization", authorizationPayload);
    const authorized = await call("ugc_v3_read", [input.scope.ownerId,input.scope.projectId]) as { authorizations: unknown[]; source: { current: boolean } };
    equal(authorized.authorizations.length, 1); equal(authorized.source.current, true);
    await pg.query("update public.projects set prompt='changed creative input' where id=$1", [input.scope.projectId]);
    const staleBrief = await call("ugc_v3_read", [input.scope.ownerId,input.scope.projectId]) as { source: { current: boolean } };
    equal(staleBrief.source.current, false);
    await assert.rejects(() => write("event", { packageId: quotedPackage.id, expectedRevision: 1, eventId: v3Id(969), event: { type: "await_authorization" } }), /PACKAGE_STALE/); checks++;
    await write("source", { ...sourcePayload, expectedRevision: 1 });
    await assert.rejects(() => write("event", { ...event, expectedRevision: 1 }), /PACKAGE_STALE/); checks++;
    equal((await pg.query<{ n: number }>("select count(*)::int n from public.ugc_final_executions")).rows[0].n, 0);
    equal((await pg.query<{ n: number }>("select count(*)::int n from public.projects where id=$1", [v3Id(998)])).rows[0].n, 1);
    equal(networkCalls, 0);
    console.info(JSON.stringify({ checks, migrations: migrations.length + 1, upstreamFunctionsPreserved: before.length, networkCalls,
      paidTransportEnabled: false, migrationAppliedRemotely: false }));
  } finally { await pg.close(); }
}
void databaseChecks().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "V3_PHASE2_CHECK_FAILED"); process.exitCode = 1;
});
