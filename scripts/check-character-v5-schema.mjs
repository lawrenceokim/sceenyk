// Offline only: empty in-memory schema, ACLs and static contracts. No job
// fixtures, execution RPCs, images, app/worker imports, environment or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite(); let checks = 0;
const check = (value, message) => { assert.equal(value, true, message); checks++; };
const scalar = async (sql, values = []) => (await pg.query(sql, values)).rows[0].value;
const migration = "20261025005400_ugc_character_v5_manual_review.sql";
try {
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file <= migration).sort();
  for (const file of files.filter(file => file < migration)) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  const productNames = ["ugc_checkpoint_product_sheet", "ugc_finish_product_sheet", "ugc_product_document_valid"];
  const productDefinitions = async () => (await pg.query("select proname,pg_get_functiondef(oid) definition from pg_proc where proname=any($1::text[]) order by proname", [productNames])).rows;
  const before = await productDefinitions();
  const sql = fs.readFileSync(`supabase/migrations/${migration}`, "utf8");
  await pg.exec(sql); await pg.exec(sql);
  assert.deepEqual(await productDefinitions(), before); checks++;
  for (const table of ["ugc_character_v5_workflows", "ugc_character_v5_candidates", "ugc_character_asset_purges"]) {
    check(await scalar("select relrowsecurity value from pg_class where oid=$1::regclass", [`public.${table}`]), `${table}: RLS`);
    check(await scalar("select not has_table_privilege('authenticated',$1,'SELECT') and not has_table_privilege('service_role',$1,'UPDATE') value", [`public.${table}`]), `${table}: no direct writes or browser reads`);
  }
  for (const signature of ["ugc_character_v5_start(uuid,uuid,uuid,uuid,uuid)", "ugc_character_v5_action(uuid,uuid,uuid,integer,text,text,integer)",
    "ugc_character_v5_claim(uuid)", "ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)", "ugc_character_v5_finish_rejection(uuid,uuid,uuid,integer,uuid)",
    "ugc_character_cleanup_claim(uuid,uuid,uuid,jsonb,text,text,bigint)", "ugc_character_cleanup_finish(text,text)"]) {
    check(await scalar("select has_function_privilege('service_role',$1,'EXECUTE') and not has_function_privilege('authenticated',$1,'EXECUTE') and not has_function_privilege('anon',$1,'EXECUTE') value", [`public.${signature}`]), `${signature}: service only`);
  }
  for (const signature of ["ugc_character_v5_asset_valid(uuid,jsonb)", "ugc_character_v5_event(uuid,text)", "ugc_reference_group_approved_pre_v5(uuid,text)",
    "ugc_approve_reference_pre_v5(uuid,uuid,uuid,text,integer,uuid)", "ugc_request_reference_regeneration_pre_v5(uuid,uuid,uuid,text,text,integer,uuid,uuid)"]) {
    check(await scalar("select not has_function_privilege('service_role',$1,'EXECUTE') and not has_function_privilege('authenticated',$1,'EXECUTE') value", [`public.${signature}`]), `${signature}: private helper`);
  }
  const id = "00000000-0000-4000-8000-000000000001";
  const artifact = { id, storageKey: `ugc/${id}/${id}/${id}/character-v5/${id}/candidates/${id}.png`, etag: '"etag"', sha256: "a".repeat(64), mimeType: "image/png", sizeBytes: 10, width: 720, height: 540 };
  check(await scalar("select public.ugc_character_v5_asset_valid($1,$2::jsonb) value", [id, JSON.stringify(artifact)]), "technical artifact without semantic observations");
  check(!await scalar("select public.ugc_character_v5_asset_valid($1,$2::jsonb) value", [id, JSON.stringify({ ...artifact, sizeBytes: 0 })]), "empty output denied");
  const worker = fs.readFileSync("lib/character-v5/worker.ts", "utf8");
  check(!/validateCharacterContent|canonicalCharacterImage|createReferenceAnalysisClient|characterViewPrompt/.test(worker), "V5 has no semantic/OpenAI prompt path");
  check(worker.includes('checkpoint("intent"') && worker.indexOf('checkpoint("intent", { plannedKey', worker.indexOf("const provider =")) < worker.indexOf("provider.submitManualView"), "durable intent before paid submission");
  check(sql.includes("c.state<>'review'") && sql.includes("w.version<>p_version") && sql.includes("state='rejecting'"), "manual decisions fenced by candidate and version");
  check(sql.includes("reference_type='product' and p_product_enabled"), "legacy Character regeneration disabled; Product claim retained");
  check(fs.readFileSync("lib/ugc-jobs/stages.ts", "utf8").includes("character_reference: startCharacterV5"), "new jobs enter V5");
  check(sql.includes("artifact=null,planned_key=null,status_url=null,generation=null,input_asset=null") && sql.includes("c.state<>'rejecting'"), "reject clears image capability only after fenced deletion confirmation");
  check(sql.includes("w.accepted ?& array['face','back']") && sql.includes("w.accepted ?& array['face','back','front_source']"), "manual dependency boundaries retained");
  const prompts = fs.readFileSync("lib/character-v5/contract.ts", "utf8");
  check(prompts.includes('promptVersion: 5, contractVersion: 5, revision: "simple-manual-review-v1"') &&
    ["Show only this character from the shoulders up, facing forward.", "one full-body back view", "one full-body front view"].every(text => prompts.includes(text)), "three static V5 prompts and versions");
  const cleanup = fs.readFileSync("scripts/cleanup-rejected-character-assets.ts", "utf8");
  check(cleanup.includes('if (!execute) continue;') && cleanup.includes('db.rpc("ugc_character_cleanup_claim"') &&
    sql.includes("root_op->>'key'=p_proof->>'operationKey'") && sql.includes("public.project_assets where storage_key=key"), "cleanup explicit execution, current-candidate fence and original protection");
  const counts = (await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_generation_job_events) events,(select count(*)::int from ugc_character_v5_candidates) candidates")).rows[0];
  assert.deepEqual(counts, { jobs: 0, events: 0, candidates: 0 }); checks++;
  console.log(JSON.stringify({ checks, migrations: files.length, rerun054: true, counts, providerRequests: 0, scope: "empty in-memory schema and static checks; no execution RPCs" }));
} catch (error) { console.error("Character V5 schema check failed:", error.message, error.detail ?? ""); process.exitCode = 1; }
finally { await pg.close(); }
