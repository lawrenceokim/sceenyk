// Focused offline M9 checks only. No env loading, network, worker execution,
// live data, private storage, provider configuration or paid calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { buildVideoGenerationPackage, canonicalJson, packageDigest, packageInputFingerprint, validateVideoGenerationPackage, validatePackageInput } from "../lib/video-generation-package/builder";
import type { PackageInput, PackageRow, PackageReview } from "../lib/video-generation-package/contract";
import { parseWorkerClaim } from "../lib/ugc-jobs/claim-contract";
import { shouldPollUgcProgress, type UgcJobProgress } from "../lib/ugc-jobs/contract";
import { withPackageProgress } from "../lib/video-generation-package/progress";
import { LocalQueuePolicy } from "../lib/ugc-jobs/queue-policy";
import { packageSummary } from "../lib/video-generation-package/projection";

async function main() {
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_M9_CHECKS"); };
  let checks = 0;
  const ok = (value: unknown) => { assert.ok(value); checks++; };
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const rejects = (fn: () => unknown) => { assert.throws(fn); checks++; };
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const at = "2026-10-27T12:00:00+00:00";
  const asset = (n: number) => ({ id: id(n), storageKey: `ugc/${id(1)}/${id(2)}/${id(3)}/synthetic/${n}.png`, etag: `etag-${n}`,
    sha256: String(n).repeat(64), sizeBytes: 100, width: 512, height: 512, mimeType: "image/png" as const });
  const text = "Preserve approved references.";
  const input: PackageInput = { ownerId: id(1), projectId: id(2), jobId: id(3),
    approvals: { character: { id: id(8), version: 3, approvedAt: at }, product: { id: id(9), version: 2, approvedAt: at },
      location: { id: id(10), version: 5, revision: 1, candidateId: id(11), approvedAt: at } },
    source: { scene: { projectTitle: "Demo", creationType: "ugc", sceneDescription: "Show the mug", ugcType: "advertisement", narration: { mode: "prompt" },
      character: { name: "Maya" }, product: { name: "Mug" }, settings: { duration: "10", aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional" } },
      dependencies: { character: 3, product: 2, locationId: id(10), locationVersion: 5, locationCandidateId: id(11) },
      character: asset(4), product: asset(5), location: asset(6), locationPlan: { name: "Kitchen" }, wardrobe: null },
    storyboard: { id: id(7), version: 4, revision: 1, approvedAt: at,
      document: { schemaVersion: 1, title: "Morning mug", concept: "Maya presents the mug", durationMs: 10_000, aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional",
        voice: { characterAssetId: id(4), description: "Warm conversational voice", pace: "natural" },
        continuity: { identity: text, appearance: text, outfit: text, product: text, location: text },
        scenes: [0, 1].map(index => ({ number: index + 1, startMs: index * 5000, endMs: (index + 1) * 5000,
          purpose: "Show the mug", description: text, characterAssetId: id(4), productAssetId: id(5), locationAssetId: id(6),
          actions: [{ startMs: index * 5000, endMs: index * 5000 + 1000, movement: "Lift mug", gesture: "Hold handle", expression: "Relaxed smile" }],
          productInteraction: "Hold handle", productPosition: "Chest height", camera: { angle: "Eye level", shot: "Medium", framing: "Portrait", movement: "Static", zoom: "None", focus: "Mug" },
          lighting: { direction: "Left", intensity: "Soft", colors: "Neutral", atmosphere: "Calm" },
          speech: index ? [{ startMs: 7000, endMs: 9500, speaker: "character" as const, characterAssetId: id(4), text: "My morning mug.", delivery: "Natural" }] : [],
          audio: { background: "Quiet kitchen", effects: "None", music: "None" }, transition: "Cut", generationNotes: "",
          generationPrompt: `Approved asset:${id(4)} asset:${id(5)} asset:${id(6)}` })) } } };
  const saved = structuredClone(input);
  const doc = buildVideoGenerationPackage(input, 1);
  const safeSummary = packageSummary({ document: doc, input, revision: 1, state: "review" } as PackageRow);
  assert.ok(safeSummary); checks++; equal(safeSummary.referenceVersions, { character: 3, product: 2, location: 5 });
  for (const privateField of ["storageKey", "etag", "sha256", "ownerId", "projectId", "jobId", "inputFingerprint", "packageHash"]) ok(!JSON.stringify(safeSummary).includes(privateField));
  equal(packageSummary({ document: doc, input, revision: 1, state: "deleted" } as PackageRow), null);
  equal(input, saved); equal(validateVideoGenerationPackage(doc, input, 1), doc);
  equal(doc.scenes.length, 2); equal(doc.scenes.map(s => s.durationMs), [5000, 5000]);
  equal(doc.requirements.dialogue, true); equal(doc.requirements.narration, false); equal(doc.output.resolution, null);
  ok(!JSON.stringify(doc).includes("storageKey")); ok(!JSON.stringify(doc).includes("etag"));
  ok(!doc.scenes[0].generationPrompt.includes(id(4)));
  ok(doc.scenes[1].generationPrompt.includes("My morning mug."));
  equal(buildVideoGenerationPackage(input, 2).packageHash, doc.packageHash);
  equal(canonicalJson({ z: [2, 1], a: "café\n" }), '{"a":"café\\n","z":[2,1]}');
  rejects(() => canonicalJson({ missing: undefined })); rejects(() => canonicalJson(NaN)); rejects(() => canonicalJson(0.5));
  // Reordering is tested with a recursive object-key reorder, preserving arrays.
  const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ?
    Object.fromEntries(Object.entries(v).reverse().map(([k, item]) => [k, reorder(item)])) : v;
  equal(packageInputFingerprint(reorder(input)), doc.inputFingerprint);
  for (const mutate of [
    (v: PackageInput) => { v.source.scene.settings.tone = "Funny"; },
    (v: PackageInput) => { v.storyboard.version++; },
    (v: PackageInput) => { v.approvals.character.approvedAt = "2026-10-27T12:01:00+00:00"; },
    (v: PackageInput) => { v.source.character.sha256 = "a".repeat(64); },
    (v: PackageInput) => { v.source.scene.product.name = "Cup"; },
  ]) {
    const changed = structuredClone(input); mutate(changed);
    // Inconsistent selected tone must fail validation, never become reusable.
    try { ok(packageInputFingerprint(changed) !== doc.inputFingerprint); } catch (error) { if (changed.source.scene.settings.tone !== "Funny") throw error; checks++; }
    rejects(() => validateVideoGenerationPackage(doc, changed, 1));
  }
  for (const mutate of [
    (v: PackageInput) => { v.source.product.storageKey = `ugc/${id(99)}/foreign.png`; },
    (v: PackageInput) => { v.approvals.product.version++; },
    (v: PackageInput) => { v.storyboard.document.scenes[1].startMs++; },
    (v: PackageInput) => { v.storyboard.document.scenes[1].endMs--; },
    (v: PackageInput) => { v.storyboard.document.scenes[0].characterAssetId = id(99); },
    (v: PackageInput) => { v.storyboard.document.scenes[0].camera.focus = ""; },
    (v: PackageInput) => { v.storyboard.document.scenes[0].actions = []; },
    (v: PackageInput) => { v.storyboard.document.scenes[1].speech[0].text = "many ".repeat(100); },
  ]) { const changed = structuredClone(input); mutate(changed); rejects(() => validatePackageInput(changed)); }
  for (const mutate of [
    (v: typeof doc) => { v.scenes[0].generationPrompt += " Changed"; },
    (v: typeof doc) => { v.scenes[0].bindings.product = "foreign" as never; },
    (v: typeof doc) => { v.packageHash = "0".repeat(64); },
    (v: typeof doc) => { v.scenes[0].durationMs--; },
  ]) { const changed = structuredClone(doc); mutate(changed); rejects(() => validateVideoGenerationPackage(changed, input, 1)); }
  const claim = { id: id(12), job_id: id(3), project_id: id(2), owner_user_id: id(1), version: 1, revision: 1,
    claim_token: id(13), heartbeat_at: at, lease_expires_at: "2026-10-27T12:01:00+00:00", state: "running", phase: "checking",
    input, input_fingerprint: doc.inputFingerprint, attempts: 1, document: null, approved_at: null, stale_at: null } as PackageRow;
  equal(parseWorkerClaim("package", null), null); equal(parseWorkerClaim("package", { id: null, claim_token: null }), null);
  equal(parseWorkerClaim("package", claim, Date.parse(at)), claim);
  rejects(() => parseWorkerClaim("package", { ...claim, state: "approved" }, Date.parse(at)));
  rejects(() => parseWorkerClaim("package", claim, Date.parse(at) + 90_000));
  const policy = new LocalQueuePolicy(); policy.worked("storyboard"); equal(policy.order(Date.parse(at))[0], "package");
  policy.worked("package"); equal(policy.order(Date.parse(at))[0], "regeneration");
  const review: PackageReview = { id: id(12), version: 6, revision: 1, state: "approved", phase: "approved", current: true, summary: null,
    error: null, approvedAt: at, canApprove: false, canDelete: true, canRetry: false, attempts: 1,
    heartbeatAt: at, leaseExpiresAt: null, updatedAt: at };
  const progress = { status: "queued", currentStage: "build_storyboard", paused: true, serverNow: at,
    steps: ["build_generation_package", "video_generation", "finalizing", "complete"].map(id => ({ id, label: id, state: "waiting" })),
    worker: { heartbeatAt: null, leaseExpiresAt: null, state: "inactive" } } as unknown as UgcJobProgress;
  const projected = withPackageProgress(progress, review, true, true);
  equal(projected.message, "Generation package approved"); equal(projected.paused, true);
  equal(projected.steps.map(s => s.state), ["completed", "waiting", "waiting", "waiting"]);
  equal(shouldPollUgcProgress(projected), false);
  equal(shouldPollUgcProgress({ ...projected, packageEnabled: true, generationPackage: { ...review, state: "queued" } }), true);
  equal(shouldPollUgcProgress({ ...projected, packageEnabled: true, generationPackage: { ...review, state: "running", current: false } }), false);

  const pg = new PGlite();
  try {
    await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    const target = "20261027006800_ugc_video_generation_packages.sql";
    const migrations = fs.readdirSync("supabase/migrations").filter(name => name.endsWith(".sql") && name < target).sort();
    for (const file of migrations) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
    const catalog = async () => (await pg.query<{ oid: number; proname: string; prosrc: string; proacl: unknown }>("select oid,proname,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
    const before = await catalog();
    const sql = fs.readFileSync(`supabase/migrations/${target}`, "utf8");
    await pg.exec(sql); await pg.exec(sql); await pg.exec(sql.replace(/\r?\n/g, "\r\n"));
    const schemaCatalog = await catalog();
    equal((await catalog()).filter(row => before.some(old => old.oid === row.oid)), before);
    for (const table of ["ugc_generation_packages", "ugc_generation_package_events"]) {
      const rows = (await pg.query("select relrowsecurity enabled,has_table_privilege('service_role',oid,'SELECT') readable,has_table_privilege('service_role',oid,'UPDATE') writable,has_table_privilege('authenticated',oid,'SELECT') browser from pg_class where oid=$1::regclass", [`public.${table}`])).rows;
      equal(rows[0], { enabled: true, readable: true, writable: false, browser: false });
    }
    for (const name of ["input", "action", "claim", "checkpoint", "canonical", "digest", "valid", "guard", "audit", "project_changed"]) {
      const row = (await pg.query<{ definer: boolean; config: string[]; anon: boolean; browser: boolean; service: boolean }>("select prosecdef definer,proconfig config,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') browser,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where pronamespace='public'::regnamespace and proname=$1", [`ugc_package_${name}`])).rows[0];
      equal(row.anon, false); equal(row.browser, false); equal(row.service, ["input", "action", "claim", "checkpoint"].includes(name));
      ok(Array.isArray(row.config) && row.config.includes('search_path=""'));
      if (row.service) equal(row.definer, true);
    }
    const digest = async (domain: string, value: unknown) => (await pg.query<{ value: string }>("select public.ugc_package_digest($1,$2::jsonb) value", [domain, JSON.stringify(value)])).rows[0].value;
    equal(await digest("sceenyk-package-input", { compilerVersion: 1, input }), doc.inputFingerprint);
    equal(await digest("unicode", { "😀": "😀\t\n", "é": "é", a: [1, false, null] }), packageDigest("unicode", { "😀": "😀\t\n", "é": "é", a: [1, false, null] }));
    const sqlValid = async (value: unknown) => (await pg.query<{ valid: boolean }>("select public.ugc_package_valid($1::jsonb,$2::jsonb,1,$3) valid", [JSON.stringify(value), JSON.stringify(input), doc.inputFingerprint])).rows[0].valid;
    equal(await sqlValid(doc), true);
    const tampered = structuredClone(doc); tampered.scenes[0].camera.focus = "Changed";
    equal(await sqlValid(tampered), false);
    const wrongTime = structuredClone(doc); wrongTime.scenes[0].durationMs--;
    equal(await sqlValid(wrongTime), false);
    const invalidSource = structuredClone(input); invalidSource.storyboard.document.scenes[1].startMs++;
    equal((await pg.query<{ valid: boolean }>("select public.ugc_package_valid($1::jsonb,$2::jsonb,1,$3) valid", [JSON.stringify(doc), JSON.stringify(invalidSource), doc.inputFingerprint])).rows[0].valid, false);
    // Isolated transaction model: the current-input resolver is stubbed with a
    // synthetic approved snapshot. No stage executor or real workflow runs.
    // This exercises actual M9 SQL commands/leases/constraints, not upstream AI.
    await pg.exec("begin; create temp table m9_input(value jsonb);");
    await pg.query("insert into m9_input values($1::jsonb)", [JSON.stringify(input)]);
    await pg.exec("create or replace function public.ugc_package_input(p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$ select value from pg_temp.m9_input where value->>'jobId'=p_job::text $$;");
    await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'synthetic-m9-owner')", [id(1)]);
    await pg.query("insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type) values($1,$2,'Demo','product-ad','Show the mug','9:16','10','Realistic','Professional','ugc','advertisement')", [id(2), id(1)]);
    await pg.query("insert into public.ugc_generation_jobs(id,owner_user_id,project_id,idempotency_key,input_snapshot) values($1,$2,$3,$4,'{}')", [id(3), id(1), id(2), id(90)]);
    const parentBefore = (await pg.query("select to_jsonb(j) value from public.ugc_generation_jobs j where id=$1", [id(3)])).rows;
    const action = async (kind: string, row: PackageRow | null, requestId = id(20), owner = id(1)) =>
      (await pg.query<{ value: PackageRow | null }>("select to_jsonb(public.ugc_package_action($1,$2,$3,$4,$5,$6::jsonb)) value", [owner, id(2), id(3), row?.version ?? 0, kind,
        JSON.stringify({ ...(row ? { packageId: row.id } : {}), requestId, input, fingerprint: doc.inputFingerprint })])).rows[0].value;
    const claimed = async () => (await pg.query<{ value: PackageRow | null }>("select to_jsonb(public.ugc_package_claim($1)) value", [id(30)])).rows[0].value;
    const checkpoint = async (row: PackageRow, op: string, payload: unknown = {}) =>
      (await pg.query<{ value: PackageRow | null }>("select to_jsonb(public.ugc_package_checkpoint($1,$2,$3,$4::jsonb)) value", [row.id, row.claim_token, op, JSON.stringify(payload)])).rows[0].value;
    const first = (await action("prepare", null))!;
    ok(first?.id); equal(first.revision, 1); equal(first.state, "queued");
    equal((await action("prepare", null))?.id, first.id);
    equal((await action("prepare", null, id(21)))?.id, first.id);
    equal(await action("prepare", null, id(22), id(99)), null);
    const count = async () => (await pg.query<{ count: number }>("select count(*)::int count from public.ugc_generation_packages")).rows[0].count;
    equal(await count(), 1);
    const lease = (await claimed())!; ok(lease.claim_token); equal(lease.attempts, 1);
    equal(await claimed(), null);
    await pg.query("update public.ugc_generation_packages set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [first.id]);
    const recovered = (await claimed())!; equal(recovered.id, first.id); equal(recovered.attempts, 2); ok(recovered.claim_token !== lease.claim_token);
    equal(await checkpoint(lease, "ready", { document: doc }), null);
    await pg.exec("savepoint interrupted_save;");
    equal((await checkpoint(recovered, "ready", { document: doc }))?.state, "review");
    await pg.exec("rollback to savepoint interrupted_save;");
    const ready = (await checkpoint(recovered, "ready", { document: doc }))!; equal(ready.state, "review");
    equal(ready.validation_receipt?.packageHash, doc.packageHash);
    equal(ready.validation_receipt?.assetSha256.character, input.source.character.sha256);
    equal(await count(), 1); equal(await claimed(), null);
    const approved = (await action("approve", ready))!; equal(approved.state, "approved"); equal(approved.approved_by, id(1));
    equal((await action("approve", ready))?.version, approved.version);
    await pg.exec("savepoint immutable_history;");
    await assert.rejects(pg.query("update public.ugc_generation_packages set document='{}' where id=$1", [first.id])); checks++;
    await pg.exec("rollback to savepoint immutable_history;");
    await pg.exec("savepoint append_only;");
    await assert.rejects(pg.query("delete from public.ugc_generation_package_events where package_id=$1", [first.id])); checks++;
    await pg.exec("rollback to savepoint append_only;");
    equal(await action("approve", approved, id(40), id(99)), null);
    const deleted = (await action("reject", approved))!; equal(deleted.state, "deleted");
    equal((await action("reject", approved))?.version, deleted.version); equal(await count(), 1);
    equal((await action("prepare", null))?.state, "deleted"); equal(await count(), 1);
    const second = (await action("prepare", deleted, id(23)))!; equal(second.revision, 2); equal(await count(), 2);
    equal(await action("approve", second), null);
    const secondClaim = (await claimed())!;
    const secondDoc = buildVideoGenerationPackage(input, 2);
    const secondReady = (await checkpoint(secondClaim, "ready", { document: secondDoc }))!;
    equal(secondReady.package_hash, approved.package_hash);
    await pg.query("update public.projects set title='Changed' where id=$1", [id(2)]);
    await pg.query("update public.projects set title='Demo' where id=$1", [id(2)]);
    const stale = (await pg.query<PackageRow>("select * from public.ugc_generation_packages where id=$1", [second.id])).rows[0];
    ok(stale.stale_at); equal(await action("approve", stale), null);
    const third = (await action("prepare", stale, id(24)))!; equal(third.revision, 3);
    equal((await pg.query<{ document: unknown }>("select document from public.ugc_generation_packages where id=$1", [approved.id])).rows[0].document, doc);
    let failing = (await claimed())!;
    for (let attempt = 1; attempt <= 3; attempt++) {
      equal(failing.attempts, attempt);
      const failed = (await checkpoint(failing, "fail", { code: "PACKAGE_ASSET_UNAVAILABLE" }))!;
      equal(failed.state, "failed");
      const retry = await action("retry", failed);
      if (attempt < 3) { equal(retry?.id, third.id); failing = (await claimed())!; }
      else equal(retry, null);
    }
    equal(await claimed(), null);
    equal((await pg.query("select to_jsonb(j) value from public.ugc_generation_jobs j where id=$1", [id(3)])).rows, parentBefore);
    await pg.exec("rollback;");
    // The full transaction rolls back the synthetic fixtures and resolver stub.
    equal(await catalog(), schemaCatalog);
    for (const file of fs.readdirSync("lib/video-generation-package").filter(name => name.endsWith(".ts"))) {
      const source = fs.readFileSync(`lib/video-generation-package/${file}`, "utf8");
      ok(!/@fal-ai|falEndpoints|video-ai\/|from ["']openai|dispatchGeneration|\.send\(|\.submit\(/.test(source));
    }
    const ui = fs.readFileSync("components/creation/generation-package-review.tsx", "utf8");
    ok(ui.includes("Prepare Generation Package") && ui.includes("Approve Package") && ui.includes("Reject and Delete"));
    ok(ui.includes("<details") && !ui.includes("<pre"));
    console.info(JSON.stringify({ checks, migrations: migrations.length + 1, upstreamFunctionsPreserved: before.length,
      rerunnable: true, scope: "pure package checks and isolated schema/SQL transition fixtures with stubbed inputs; no worker/provider/live I/O" }));
  } finally { await pg.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
