// Offline schema checks only. No application/provider/storage/worker imports,
// environment credentials, persistent database or job/request fixtures.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();
let checks = 0;
const check = (value, label) => { assert.equal(value, true, label); checks++; };
const scalar = async (sql, params = []) => (await pg.query(sql, params)).rows[0].value;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = c => c.repeat(64);
const observations = {
  subjects: 1, poses: 1, faces: 0, headVisible: true, fullBody: true, frontFacing: false, backFacing: true,
  neckDownOnly: false, shoulderUpCloseUp: false, completeOutfitAndFootwear: true, collageOrPanels: false,
  extraInset: false, mirroredPose: false, fillsFrame: true, neutralBackground: true, annotations: false, uncertain: false,
};
const receipt = (view, sha256, facts, stage = "canonical") => ({
  version: 1, contractVersion: 4, view, sha256, model: "offline-schema-fixture", state: "passed", reasons: [], observations: facts, stage,
});
const original = { kind: "original", assetId: id(9), sha256: hash("e"), storageKey: "private/original", etag: "original-etag" };
const asset = (view, n, sha256, facts) => ({
  id: id(n), type: `character_${view}_reference`, storageKey: `private/${view}`, etag: `${view}-etag`, width: 1024, height: 1536,
  sha256, strategyRevision: "face-back-front-v1", characterValidation: receipt(view, sha256, facts),
});
const face = asset("face", 1, hash("a"), { ...observations, faces: 1, frontFacing: true, backFacing: false, fullBody: false, shoulderUpCloseUp: true, completeOutfitAndFootwear: false });
face.faceOrigin = "original"; face.characterValidation.stage = "original_face";
const back = asset("back", 2, hash("b"), observations);
const upstreamFace = { assetId: face.id, sha256: face.sha256 };
const generation = (slot, reference, upstream) => ({
  slot, reference, upstream, promptVersion: 4, contractVersion: 4, revision: "face-back-front-v1", builder: "characterViewPrompt",
  providerModel: "higgsfield-ai/soul/v2/image-to-image", promptSha256: hash("d"), batchSize: 1, enhancePrompt: true,
  soulId: id(7), seed: 17, resolution: "1080p", aspectRatio: slot === "face" ? "1:1" : "2:3",
  outputRole: slot === "front" ? "front_source" : `${slot}_reference`,
});
back.generation = generation("back", original, { face: upstreamFace });
const front = asset("front", 3, hash("c"), { ...observations, faces: 0, headVisible: false, fullBody: false, frontFacing: true, backFacing: false, neckDownOnly: true });
front.height = 1382;
front.generation = generation("front", { kind: "back_reference", assetId: back.id, sha256: back.sha256, storageKey: back.storageKey, etag: back.etag }, { face: upstreamFace, back: { assetId: back.id, sha256: back.sha256 } });
front.sourceValidation = { ...receipt("front", hash("f"), { ...observations, faces: 1, frontFacing: true, backFacing: false }, "front_source"), cropTop: 1000, cropSafe: true };
front.frontSource = { type: "character_front_source", kind: "front_source", assetId: id(8), sha256: hash("f"), storageKey: "private/front-source", etag: "source-etag" };
front.frontCrop = { version: 1, sourceSha256: hash("f"), canonicalSha256: front.sha256, sourceWidth: 1024, sourceHeight: 1536, top: 154, width: 1024, height: 1382 };
const assets = { face, back, front };
const clone = () => structuredClone(assets);

try {
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql")).sort();
  const migration = "20261025005300_ugc_character_v4_dependencies.sql";
  for (const file of files.filter(file => file < migration)) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  const productFunctions = async () => (await pg.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%product%' order by 1")).rows;
  const priorProduct = await productFunctions();
  await pg.exec(fs.readFileSync(`supabase/migrations/${migration}`, "utf8"));
  await pg.exec(fs.readFileSync(`supabase/migrations/${migration}`, "utf8"));
  assert.deepEqual(await productFunctions(), priorProduct); checks++;

  const validInputs = a => scalar("select public.ugc_character_v4_inputs_valid($1::jsonb) value", [JSON.stringify(a)]);
  check(await validInputs(assets), "valid V4 canonical inputs and local transform");
  check(await scalar("select public.ugc_character_generation_valid($1::jsonb,'face') value", [JSON.stringify(generation("face", original, {}))]), "Face uses original input");
  check(!await scalar("select public.ugc_character_v4_upstream_valid($1::jsonb,'{}'::jsonb) value", [JSON.stringify(back.generation)]), "Back blocked without persisted Face");
  check(!await scalar("select public.ugc_character_v4_upstream_valid($1::jsonb,$2::jsonb) value", [JSON.stringify(front.generation), JSON.stringify({ face })]), "Front blocked without Back");
  for (const [label, alter] of [
    ["non-gray reused Face", a => { a.face.characterValidation.observations.neutralBackground = false; }],
    ["invalid Back framing", a => { a.back.characterValidation.observations.backFacing = false; }],
    ["stale Face dependency", a => { a.face.sha256 = hash("0"); a.face.characterValidation.sha256 = hash("0"); }],
    ["stale Back dependency", a => { a.back.sha256 = hash("0"); a.back.characterValidation.sha256 = hash("0"); }],
    ["original portrait as Front anchor", a => { a.front.generation.reference = original; }],
    ["head visible in canonical Front", a => { a.front.characterValidation.observations.headVisible = true; }],
    ["unsafe source crop", a => { a.front.sourceValidation.cropSafe = false; }],
    ["feet removed by crop", a => { a.front.frontCrop.height -= 100; }],
    ["collage in Front source", a => { a.front.sourceValidation.observations.collageOrPanels = true; }],
  ]) { const a = clone(); alter(a); check(!await validInputs(a), label); }
  const preservedBack = clone(); delete preservedBack.back.generation;
  check(await validInputs(preservedBack), "explicit Front-only work preserves a validated historical Back");
  const historical = { ...face.characterValidation }; delete historical.contractVersion;
  historical.observations = { ...historical.observations, neutralBackground: false };
  check(await scalar("select public.ugc_character_validation_valid($1::jsonb,'face',$2) value", [JSON.stringify(historical), face.sha256]), "historical V3 original-Face receipt stays interpretable");

  for (const name of ["ugc_character_v4_inputs_valid(jsonb)", "ugc_character_effective_assets(uuid)", "ugc_character_v4_event(uuid,text,text,text,text)", "ugc_resume_character_output_pre_v4(uuid)"]) {
    check(await scalar("select not has_function_privilege('service_role',$1,'EXECUTE') and not has_function_privilege('authenticated',$1,'EXECUTE') value", [`public.${name}`]), `private helper ${name}`);
  }
  check(await scalar("select has_function_privilege('service_role','public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid)','EXECUTE') value"), "existing request RPC remains service-only");
  check(await scalar("select bool_and(relrowsecurity) value from pg_class where oid in ('public.ugc_character_sheets'::regclass,'public.ugc_reference_reviews'::regclass,'public.ugc_reference_regeneration_requests'::regclass)"), "private tables retain RLS");
  const counts = (await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_reference_regeneration_requests) requests,(select count(*)::int from ugc_generation_job_events) events")).rows[0];
  assert.deepEqual(counts, { jobs: 0, requests: 0, events: 0 }); checks++;
  console.log(JSON.stringify({ checks, migrations: files.filter(file => file <= migration).length, rerun053: true, counts, providerRequests: 0, scope: "isolated in-memory schema and pure JSON predicates; no execution RPCs" }));
} catch (error) {
  console.error("Character V4 schema check failed:", error.message, error.detail ?? "");
  process.exitCode = 1;
} finally { await pg.close(); }
