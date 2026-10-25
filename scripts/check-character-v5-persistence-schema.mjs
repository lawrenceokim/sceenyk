// Offline schema and parse-only regression checks. No credentials/network,
// images, job/candidate fixtures, execution RPCs, providers or recovery command.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite(); let checks = 0;
const check = (value, message) => { assert.equal(value, true, message); checks++; };
const scalar = async (sql, values = []) => (await pg.query(sql, values)).rows[0].value;
const migration = "20261025005500_ugc_character_v5_persistence.sql";
try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file <= migration).sort();
  for (const file of files.filter(file => file < migration)) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  // PREPARE resolves the target column without executing UPDATE or creating a job.
  let originalCode;
  try { await pg.exec("PREPARE bad_start_column AS UPDATE public.ugc_generation_jobs SET retryable=false WHERE false"); }
  catch (error) { originalCode = error.code; }
  assert.equal(originalCode, "42703"); checks++;
  const preserved = async () => (await pg.query("select proname,pg_get_functiondef(oid) definition from pg_proc where proname like '%product%' or proname like 'ugc_character_cleanup_%' order by oid")).rows;
  const before = await preserved();
  const sql = fs.readFileSync(`supabase/migrations/${migration}`, "utf8");
  await pg.exec(sql); await pg.exec(sql);
  assert.deepEqual(await preserved(), before); checks++;
  const rows = (await pg.query("select proname,prosrc from pg_proc where proname=any($1::text[])", [["ugc_character_v5_start", "ugc_character_v5_action", "ugc_character_v5_checkpoint", "ugc_character_v5_finish_rejection", "ugc_character_v5_preview_failure", "ugc_character_v5_recovery_claim"]])).rows;
  for (const row of rows) {
    check(!/\bretryable\s*=/.test(row.prosrc), `${row.proname}: no undefined retryable assignment`);
    for (const match of row.prosrc.matchAll(/update\s+public\.([a-z_]+)(?:\s+[a-z_]+)?\s+set\s+([\s\S]*?)\s+where\b/gi)) {
      const table = match[1]; const assignments = [...match[2].matchAll(/(?:^|,)\s*([a-z_]+)\s*=/gi)].map(item => item[1]);
      const columns = (await pg.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [table])).rows.map(item => item.column_name);
      check(assignments.length > 0 && assignments.every(name => columns.includes(name)), `${row.proname}: ${table} UPDATE target columns exist`);
    }
    for (const match of row.prosrc.matchAll(/insert\s+into\s+public\.([a-z_]+)\s*\(([^)]+)\)/gi)) {
      const columns = (await pg.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [match[1]])).rows.map(item => item.column_name);
      check(match[2].split(",").map(value => value.trim()).every(name => columns.includes(name)), `${row.proname}: INSERT columns exist`);
    }
  }
  await pg.exec("PREPARE fixed_start_columns AS UPDATE public.ugc_generation_jobs SET retry_eligible=false,error_code=null,safe_error_message=null,failed_at=null WHERE false"); checks++;
  for (const name of ["ugc_character_v5_start(uuid,uuid,uuid,uuid,uuid)", "ugc_character_v5_action(uuid,uuid,uuid,integer,text,text,integer)",
    "ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)", "ugc_character_v5_recovery_claim(uuid,uuid,uuid,integer,uuid)"]) {
    check(await scalar("select has_function_privilege('service_role',$1,'EXECUTE') and not has_function_privilege('anon',$1,'EXECUTE') and not has_function_privilege('authenticated',$1,'EXECUTE') value", [`public.${name}`]), `${name}: service only`);
  }
  check(await scalar("select bool_and(relrowsecurity) value from pg_class where oid in ('public.ugc_character_v5_workflows'::regclass,'public.ugc_character_v5_candidates'::regclass)"), "RLS retained");
  check(await scalar("select count(*)=1 value from pg_indexes where schemaname='public' and indexname='ugc_character_v5_provider_request_once'"), "provider request idempotency index");
  const worker = fs.readFileSync("lib/character-v5/worker.ts", "utf8");
  check(worker.indexOf('checkpoint("output"') < worker.indexOf("const artifact = await saveV5Artifact"), "output fingerprint before R2 PUT");
  check(sql.includes("is distinct from c.output_proof"), "publication binds persisted exact output fingerprint");
  const recovery = fs.readFileSync("lib/character-v5/recovery.ts", "utf8");
  check(!/from ["'][^"']*(?:higgsfield|openai|worker|provider|regeneration)[^"']*["']/.test(recovery), "recovery imports no provider/worker path");
  check(!/putR2|deleteR2|submitManualView/.test(recovery), "recovery does not generate, delete or bypass verified V5 storage");
  check(sql.includes("c.state not in ('intent','submitted','failed')") && sql.includes("w.candidate_id is distinct from p_candidate") && sql.includes("w.version<>p_version"), "recovery cannot replace canonical/rejected/foreign/stale candidates");
  check(sql.includes("artifact=null,output_proof=null,planned_key=null"), "Reject clears output fingerprint with private artifact pointer");
  const counts = (await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_generation_job_events) events,(select count(*)::int from ugc_character_v5_candidates) candidates")).rows[0];
  assert.deepEqual(counts, { jobs: 0, events: 0, candidates: 0 }); checks++;
  console.log(JSON.stringify({ checks, migrations: files.length, rerun055: true, originalError: originalCode, counts, executionRPCs: 0 }));
} catch (error) { console.error("Character V5 persistence schema check failed:", error.message, error.detail ?? ""); process.exitCode = 1; }
finally { await pg.close(); }
