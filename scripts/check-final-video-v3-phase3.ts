import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { v3Input, v3Context, v3Id, sealV3 } from "./final-video-v3-fixture";
import { HiggsfieldVideoGenerationProvider, higgsfieldModels } from "../lib/final-video-generation-v3/adapters/higgsfield";
import { HiggsfieldV3Transport, exactBodyHash, HiggsfieldTransportError } from "../lib/final-video-generation-v3/adapters/higgsfield-transport";
import { higgsfieldRequestIssues } from "../lib/final-video-generation-v3/adapters/higgsfield-validity";
import { bindEstimateResponse } from "../lib/final-video-generation-v3/adapters/higgsfield-pricing";
import { buildFrozenPackage, restoreSegment } from "../lib/final-video-generation-v3/package";
import { initialExecution } from "../lib/final-video-generation-v3/recovery";
import { createPaidIntent, createRuntimeAuthorization, runtimePreflight } from "../lib/final-video-generation-v3/execution-package";
import { executeV3Segment, type SegmentExecutionDependencies } from "../lib/final-video-generation-v3/execution";
import { quoteSchema, runSchema, uncheckedQuality, type PrivateAsset, type ProviderObservation, type Run } from "../lib/final-video-generation-v3/runtime-contract";
import { runtimeWorkspaceSchema } from "../lib/final-video-generation-v3/runtime-store";
import { v3Digest } from "../lib/final-video-generation-v3/identity";
import { approvedJoinInputs } from "../lib/final-video-generation-v3/join";
import { inspectExecutionEnvelope } from "../lib/final-video-generation-v3/execution-inspector";

let checks = 0, realNetworkCalls = 0, fixtureHttpCalls = 0;
globalThis.fetch = async () => { realNetworkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (v: unknown) => { assert.ok(v); checks++; };
const rejects = async (fn: () => Promise<unknown>, code: string) => { await assert.rejects(fn, new RegExp(code)); checks++; };
const now = new Date().toISOString(), expiry = new Date(Date.now() + 240_000).toISOString(), provider = new HiggsfieldVideoGenerationProvider();
function fixture(input = v3Input(), packageId = v3Id(100), version = 1) {
  const context = v3Context(input, provider); context.now = now;
  const provisional = buildFrozenPackage(input, provider, context, { id: packageId, version, sourceRevision: 1 });
  const media = new Map(input.references.map(r => [r.id, `https://private.example.test/${r.id}?signature=fixture-secret`]));
  const requests = provisional.segments.map(s => provider.prepareRequest(restoreSegment(provisional, s.id), media));
  context.estimateEvidence = provisional.segments.map(s => bindEstimateResponse(restoreSegment(provisional, s.id).command, { usd: "1.25" }, {
    providerId: "higgsfield", accountScope: context.accountScope, observedAt: now, expiresAt: expiry }));
  const doc = buildFrozenPackage(input, provider, context, { id: packageId, version, sourceRevision: 1 });
  const quote = quoteSchema.parse({ id: randomUUID(), projectId: input.scope.projectId, packageId: doc.id, packageHash: doc.hash, currency: "USD", observedAt: now, expiresAt: expiry,
    segments: doc.segments.map((s, i) => ({ segmentUuid: v3Id(200 + i), segmentId: s.id, segmentVersion: 1, fingerprint: s.fingerprint, model: requests[i].model,
      body: requests[i].input, bodyHash: exactBodyHash(requests[i].input), estimatedCostMicrousd: 1_250_000, estimateResponseHash: "a".repeat(64) })), totalMicrousd: doc.segments.length * 1_250_000 });
  const auth = createRuntimeAuthorization(doc, quote, quote.segments[0].segmentUuid, { operatorId: input.scope.ownerId, approved: true, maximumMicrousd: 2_000_000, now });
  const intent = createPaidIntent(doc, quote, auth, now);
  return { input, doc, quote, auth, intent };
}
const f = fixture();
const limits = { model: higgsfieldModels.reference, verifiedAt: now, expiresAt: expiry, sources: ["https://docs.higgsfield.ai/fixture-only"],
  maxImageCount: 10, maxImageBytes: 20_000_000, imageMimeTypes: ["image/png"], maxPromptBytes: 100_000, maxBodyBytes: 200_000 };
// Every numeric limit above is a synthetic test value, never production evidence/defaults.
function runFor(value = f): Run {
  return runSchema.parse({ id: value.intent.executionId, project_id: value.input.scope.projectId, package_id: value.doc.id, segment_uuid: value.auth.segmentUuid,
    intent: value.intent, state: "queued", observation: null, result: null, quality: null, error_code: null, completed_at: null });
}
function observation(status: ProviderObservation["status"] = "completed"): ProviderObservation {
  return { requestId: v3Id(400), status, statusUrl: `https://api.higgsfield.ai/requests/${v3Id(400)}/status`, cancelUrl: null,
    expiresAt: expiry, resultUrl: status === "completed" ? "https://cdn.example.test/result.mp4" : null, correlationId: "fixture", receiptHash: "e".repeat(64), actualCostMicrousd: null };
}
const asset: PrivateAsset = { id: f.intent.executionId, storageKey: `users/${f.input.scope.ownerId}/projects/${f.input.scope.projectId}/v3/${f.intent.executionId}.mp4`,
  etag: "fixture-etag", sha256: "d".repeat(64), sizeBytes: 100, mimeType: "video/mp4", width: 480, height: 854, durationMs: 10000, hasAudio: true };
async function pureAndTransportChecks() {
  const { hash, ...intentContent } = f.intent; equal(hash, v3Digest("paid-intent", intentContent));
  const multiInput = v3Input([30000, 15000]), multiContext = v3Context(multiInput, provider); multiContext.now = now;
  const multiDoc = buildFrozenPackage(multiInput, provider, multiContext, { id: v3Id(103), version: 1, sourceRevision: 1 });
  const multiRuns = multiDoc.segments.map((s, i) => ({ ...runFor(), id: v3Id(500 + i), package_id: multiDoc.id, state: "approved" as const,
    intent: { ...f.intent, segmentId: s.id, segmentHash: s.fingerprint }, result: { ...asset, id: v3Id(500 + i), durationMs: s.durationMs } }));
  equal(approvedJoinInputs(multiDoc, multiRuns).map(s => s.segmentId), multiDoc.segments.map(s => s.id));
  assert.throws(() => approvedJoinInputs(multiDoc, [{ ...multiRuns[0], state: "awaiting_review" }, multiRuns[1]]), /APPROVED_SEGMENTS/); checks++;
  equal(f.doc.segments.length, 1); equal(f.doc.segments[0].durationMs, 10000);
  equal(higgsfieldRequestIssues(f.intent.body, f.input.references, null, now), ["HIGGSFIELD_REQUEST_LIMITS_UNVERIFIED"]);
  equal(higgsfieldRequestIssues(f.intent.body, f.input.references, limits, now), []);
  equal(higgsfieldRequestIssues(f.intent.body, f.input.references, { ...limits, maxImageCount: 1 }, now), ["REFERENCE_COUNT_EXCEEDED"]);
  const ready = runtimePreflight(f.doc, f.quote, f.auth, { current: true, transportEnabled: false, now, validityIssues: [] });
  const inspected = inspectExecutionEnvelope({ package: f.doc, currentInput: f.input, sourceRevision: 1, sourceCurrent: true,
    runtimeQuote: { ...f.quote, validityEvidence: limits }, runtimeAuthorization: f.auth }, now);
  equal(inspected.eligibleForPaidSubmission, true); equal(inspected.canSubmit, false); ok(!JSON.stringify(inspected).includes("fixture-secret"));
  equal(ready.eligibleForPaidSubmission, true); equal(ready.canSubmit, false); equal(ready.authorizedMaximumMicrousd, 2_000_000); equal(ready.estimatedCostMicrousd, 1_250_000);
  equal(runtimePreflight(f.doc, f.quote, f.auth, { current: false, transportEnabled: true, now, validityIssues: [] }).canSubmit, false);
  ok(runtimePreflight(f.doc, f.quote, f.auth, { current: true, transportEnabled: true, now: expiry, validityIssues: [] }).issues.includes("COST_ESTIMATE_UNAVAILABLE"));
  ok(runtimePreflight(f.doc, f.quote, f.auth, { current: true, transportEnabled: true, now, validityIssues: [], existingIntent: true }).issues.includes("EXISTING_INTENT_RECONCILE_OR_REUSE"));
  const other = fixture(v3Input(), v3Id(102));
  ok(runtimePreflight(other.doc, other.quote, f.auth, { current: true, transportEnabled: true, now, validityIssues: [] }).issues.includes("V3_AUTHORIZATION_BINDING_INVALID"));
  equal(exactBodyHash({ b: 2, a: 1 }), exactBodyHash({ a: 1, b: 2 }));
  const config = { enabled: false, projectId: f.input.scope.projectId, packageId: f.doc.id, credentials: "fixture:key", accountScope: "fixture", outputHosts: ["cdn.example.test"] };
  const http: typeof fetch = async (url, init) => {
    fixtureHttpCalls++; const href = String(url);
    if (href.includes("/estimate/")) return Response.json({ usd: "1.25" });
    if (href.endsWith("/reference-to-video")) {
      equal(JSON.parse(String(init?.body)), f.intent.body); equal(new Headers(init?.headers).get("Idempotency-Key"), f.intent.idempotencyKey);
      return Response.json({ request_id: v3Id(400), status: "queued", status_url: observation().statusUrl,
        cancel_url: `https://api.higgsfield.ai/requests/${v3Id(400)}/cancel`, expires_after: 604800 });
    }
    if (href.endsWith("/status")) return Response.json({ request_id: v3Id(400), status: "completed", video: { url: "https://cdn.example.test/result.mp4" }, expires_at: expiry });
    equal(new Headers(init?.headers).has("Authorization"), false); return new Response(new Uint8Array([1, 2, 3]));
  };
  const disabled = new HiggsfieldV3Transport(config, http);
  await rejects(() => disabled.submit(f.intent, new AbortController().signal), "PAID_V3_EXECUTION_DISABLED"); equal(fixtureHttpCalls, 0);
  const enabled = new HiggsfieldV3Transport({ ...config, enabled: true }, http);
  equal((await enabled.estimate(higgsfieldModels.reference, f.intent.body, new AbortController().signal)).usd, "1.25");
  const accepted = await enabled.submit(f.intent, new AbortController().signal); equal(accepted.requestId, v3Id(400));
  const done = await enabled.reconcile(accepted, new AbortController().signal); equal(done.status, "completed");
  equal((await enabled.fetchCompletedResult(done, new AbortController().signal)).length, 3);
  await rejects(() => enabled.fetchCompletedResult({ ...done, expiresAt: "2020-01-01T00:00:00Z" }, new AbortController().signal), "HIGGSFIELD_RESULT_EXPIRED");
  await rejects(() => enabled.fetchCompletedResult({ ...done, resultUrl: "https://unapproved.example.test/video.mp4" }, new AbortController().signal), "HIGGSFIELD_OUTPUT_HOST_UNAPPROVED");
  const rejecting = new HiggsfieldV3Transport({ ...config, enabled: true }, async () => Response.json({ detail: "private provider error" }, { status: 422 }));
  await assert.rejects(() => rejecting.submit(f.intent, new AbortController().signal), e => e instanceof HiggsfieldTransportError && e.outcome === "rejected"); checks++;
  const uncertain = new HiggsfieldV3Transport({ ...config, enabled: true }, async () => { throw new Error("lost"); });
  await assert.rejects(() => uncertain.submit(f.intent, new AbortController().signal), e => e instanceof HiggsfieldTransportError && e.outcome === "unknown"); checks++;
  const saved = new Map<string, Buffer>(), checkpoints: string[] = []; let submits = 0, polls = 0, downloads = 0, publishes = 0;
  const deps: SegmentExecutionDependencies = { beforeSubmit: () => {}, checkpoint: async action => { checkpoints.push(action); },
    provider: { submit: async () => { submits++; return observation("queued"); }, reconcile: async () => { polls++; return observation(); },
      fetchCompletedResult: async () => { downloads++; return Buffer.from("fixture bytes"); } },
    readSaved: async n => saved.get(n) ?? null, save: async (n, b) => { saved.set(n, b); }, validateAndPublish: async () => { publishes++; return asset; } };
  await executeV3Segment(runFor(), false, deps, new AbortController().signal);
  equal(submits, 1); equal(polls, 1); equal(downloads, 1); equal(checkpoints, ["intent", "observation", "result"]);
  await executeV3Segment({ ...runFor(), state: "reconciliation_required" }, true, deps, new AbortController().signal);
  equal(submits, 1); equal(downloads, 1); equal(publishes, 2);
  const before = checkpoints.length;
  await executeV3Segment({ ...runFor(), result: asset }, true, deps, new AbortController().signal);
  equal(checkpoints.slice(before), ["done"]); equal(submits, 1); equal(downloads, 1);
  const emptyDeps = { ...deps, readSaved: async () => null };
  await rejects(() => executeV3Segment({ ...runFor(), state: "submitting" }, true, emptyDeps, new AbortController().signal), "V3_PROVIDER_OUTCOME_UNKNOWN");
  equal(submits, 1);
  const storageFailure = new Map<string, Buffer>(); let first = true;
  const failureDeps = { ...deps, readSaved: async (n: string) => storageFailure.get(n) ?? null,
    save: async (n: string, b: Buffer) => { storageFailure.set(n, b); }, validateAndPublish: async () => { if (first) { first = false; throw new Error("SAVE_FAILED"); } return asset; } };
  await rejects(() => executeV3Segment(runFor(), false, failureDeps, new AbortController().signal), "SAVE_FAILED");
  const submittedBeforeRecovery = submits;
  await executeV3Segment({ ...runFor(), observation: observation(), state: "reconciliation_required" }, true, failureDeps, new AbortController().signal);
  equal(submits, submittedBeforeRecovery);
}

async function sqlChecks() {
  const pg = new PGlite();
  try {
    await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    const target = "20261029007700_ugc_v3_runtime.sql", previous = fs.readdirSync("supabase/migrations").filter(n => n.endsWith(".sql") && n < target).sort();
    for (const name of previous) await pg.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
    const catalog = async () => (await pg.query<{ oid: number; prosrc: string; proacl: unknown }>("select oid,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
    const before = await catalog(), sql = fs.readFileSync(`supabase/migrations/${target}`, "utf8"); await pg.exec(sql); await pg.exec(sql);
    await pg.exec(fs.readFileSync("scripts/verify-v3-setup.sql", "utf8")); checks++;
    equal((await catalog()).filter(a => before.some(b => b.oid === a.oid)), before);
    const call = async (name: string, args: unknown[]) => (await pg.query<{ value: unknown }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) value`, args)).rows[0].value;
    const owner = f.input.scope.ownerId, project = f.input.scope.projectId;
    await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'phase3-owner'),($2,'phase3-foreign')", [owner, v3Id(999)]);
    const fields = { title: "Fresh V3", category: "product-ad", prompt: "Fresh studio cup", ugcType: "advertisement", settings: { duration: "10", aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional" } };
    const registry = await call("ugc_v3_create_project", [owner, project, fields]) as { logical_job_id: string };
    equal(await call("ugc_v3_runtime_read", [v3Id(999), project]), null);
    await pg.query("insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone) values($1,$2,'Historical','product-ad','','9:16','10','Realistic','Professional')", [v3Id(998), owner]);
    await rejects(() => call("ugc_v3_create_project", [owner, v3Id(998), fields]), "FRESH_V3_PROJECT_REQUIRED");
    const action = (kind: string, payload: unknown, actingOwner = owner) => call("ugc_v3_runtime_action", [actingOwner, project, kind, payload]);
    const claim = () => call("ugc_v3_task_claim", [project]) as Promise<{ id: string; lease_token: string; input: { runId?: string } }>;
    const checkpoint = (t: { id: string; lease_token: string }, kind: string, payload: unknown) => call("ugc_v3_task_checkpoint", [t.id, t.lease_token, kind, payload]);
    const input = v3Input(); input.scope.jobId = registry.logical_job_id; sealV3(input);
    await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'fresh.png','image/png',1000,'image','uploaded','etag')", [input.provenance.originalImageId,owner,project,v3Id(970),`users/${owner}/projects/${project}/${input.provenance.originalImageId}/fresh.png`]);
    const bindings: Record<string, unknown> = {};
    for (const ref of input.references) {
      await action("enqueue", { kind: ref.role, requestKey: `fixture:${ref.role}`, input: {} });
      const task = await claim();
      const image = { ...asset, id: ref.id, storageKey: `users/${owner}/projects/${project}/v3/${ref.id}.png`, mimeType: "image/png", sha256: ref.sha256, sizeBytes: ref.sizeBytes, durationMs: 0, hasAudio: false };
      bindings[ref.id] = image;
      equal(await checkpoint(task, "artifact", { id: ref.id, document: { asset: image } }), true);
      await action("review_artifact", { id: ref.id, decision: "approve" });
    }
    await action("enqueue", { kind: "storyboard", requestKey: "fixture:storyboard", input: {} });
    const storyboardTask = await claim(); await checkpoint(storyboardTask, "artifact", { id: input.storyboard.id, document: { storyboard: input.storyboardContent, input: { references: input.references.map(r => r.id) } } });
    await action("review_artifact", { id: input.storyboard.id, decision: "approve" });
    await action("source", { input, privateBindings: bindings });
    const fresh = fixture(input, v3Id(110));
    await call("ugc_v3_write", [owner,project,"package",{ document: fresh.doc, state: initialExecution(fresh.doc), eventId: v3Id(111) }]);
    equal(await call("ugc_v3_runtime_current", [fresh.doc.id]), true);
    await action("quote", { document: fresh.quote }); await action("authorize", { document: fresh.auth });
    const first = await action("generate", { intent: fresh.intent }) as Run;
    const duplicate = await action("generate", { intent: createPaidIntent(fresh.doc, fresh.quote, fresh.auth, now) }) as Run;
    equal(first.id, duplicate.id); equal((await pg.query<{ n: number }>("select count(*)::int n from public.ugc_v3_runs")).rows[0].n, 1);
    await rejects(() => action("generate", { intent: fresh.intent }, v3Id(999)), "FRESH_V3_PROJECT_REQUIRED");
    const videoTask = await claim(); equal(await checkpoint(videoTask, "intent", {}), true);
    await rejects(() => checkpoint(videoTask, "intent", {}), "PROVIDER_INTENT_ALREADY_EXISTS");
    equal(await checkpoint(videoTask, "observation", observation()), true);
    const privateVideo = { ...asset, id: fresh.intent.executionId, storageKey: `users/${owner}/projects/${project}/v3/${fresh.intent.executionId}.mp4` };
    equal(await checkpoint(videoTask, "result", privateVideo), true);
    equal(await checkpoint(videoTask, "result", privateVideo), false);
    const next = fixture(input, v3Id(120), 2);
    await call("ugc_v3_write", [owner,project,"package",{ document: next.doc, state: initialExecution(next.doc), eventId: v3Id(121) }]);
    await action("quote", { document: next.quote }); await action("authorize", { document: next.auth });
    await rejects(() => action("generate", { intent: next.intent }), "V3_PRIOR_OUTCOME_REQUIRES_RECONCILIATION");
    await action("reject_delete", { id: fresh.intent.executionId, quality: uncheckedQuality });
    const deletion = await claim(); equal(await checkpoint(deletion, "deleted", {}), true);
    const countBefore = (await pg.query<{ n: number }>("select count(*)::int n from public.ugc_v3_runs")).rows[0].n;
    await action("generate", { intent: fresh.intent });
    equal((await pg.query<{ n: number }>("select count(*)::int n from public.ugc_v3_runs")).rows[0].n, countBefore);
    equal((await pg.query<{ state: string }>("select state from public.ugc_v3_runs where id=$1", [fresh.intent.executionId])).rows[0].state, "deleted");
    await action("generate", { intent: next.intent }); const nextTask = await claim();
    await checkpoint(nextTask, "intent", {}); await checkpoint(nextTask, "observation", observation());
    await checkpoint(nextTask, "result", { ...privateVideo, id: next.intent.executionId, storageKey: `users/${owner}/projects/${project}/v3/${next.intent.executionId}.mp4` });
    await rejects(() => action("approve", { id: next.intent.executionId, quality: {} }), "CURRENT_REVIEW_REQUIRED");
    await action("approve", { id: next.intent.executionId, quality: { characterContinuity: "pass", productContinuity: "pass", locationContinuity: "pass",
      dialoguePresence: "not_applicable", speechTiming: "not_applicable", lipAudioSync: "not_applicable", visualQuality: "pass", notes: "fixture" } });
    equal((await pg.query<{ state: string; completed: boolean }>("select state,completed_at is not null completed from public.ugc_v3_runs where id=$1", [next.intent.executionId])).rows[0], { state: "approved", completed: true });
    equal(runtimeWorkspaceSchema.parse(await call("ugc_v3_runtime_read", [owner, project])).runs.length, 2);
    await pg.query("update public.projects set prompt='changed' where id=$1", [project]); equal(await call("ugc_v3_runtime_current", [fresh.doc.id]), false);
    for (const table of ["tasks", "artifacts", "quotes", "run_authorizations", "runs", "runtime_events"]) {
      equal((await pg.query<{ browser: boolean; directWrite: boolean }>("select has_table_privilege('authenticated',$1,'SELECT') browser,has_table_privilege('service_role',$1,'INSERT') \"directWrite\"", [`public.ugc_v3_${table}`])).rows[0], { browser: false, directWrite: false });
    }
    equal((await pg.query<{ n: number }>("select count(*)::int n from public.ugc_final_executions")).rows[0].n, 0);
    equal(realNetworkCalls, 0);
    console.info(JSON.stringify({ phase3Checks: checks, migrations: previous.length + 1, previousFunctionsPreserved: before.length, fixtureHttpCalls, realNetworkCalls, paidTransportEnabled: false }));
  } finally { await pg.close(); }
}
void (async () => { await pureAndTransportChecks(); await sqlChecks(); })().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "PHASE3_CHECK_FAILED"}\n`); process.exitCode = 1;
});
