// Isolated schema/guard checks only. No job fixtures or execution RPCs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite(); let checks = 0;
try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  const migration = "20261026005700_ugc_character_v5_back_prompt.sql";
  const files = fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < migration).sort();
  for (const file of files) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  const checkpoint = async () => (await pg.query("select prosrc from pg_proc where proname='ugc_character_v5_checkpoint'")).rows[0].prosrc;
  const previous = await checkpoint();
  const preserved = async () => (await pg.query("select oid,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace and proname <> 'ugc_character_v5_checkpoint' order by oid")).rows;
  const before = await preserved();
  const sql = fs.readFileSync(`supabase/migrations/${migration}`, "utf8");
  await pg.exec(sql); await pg.exec(sql);
  assert.deepEqual(await preserved(), before); checks++;
  const fixed = await checkpoint();
  const oldGuard = "or p_payload->'generation'->>'enhancePrompt' is distinct from 'true'";
  const newGuard = "or p_payload->'generation'->>'enhancePrompt' is distinct from\n    case when w.slot='back' and p_payload->'generation'->>'promptRevision'='2' then 'false' else 'true' end";
  assert.equal(fixed, previous.replace(oldGuard, newGuard)); checks++;
  // Exercise the actual SQL guard for fresh Back and legacy intent settings.
  const guard = fixed.slice(fixed.indexOf("p_payload->'generation'->>'enhancePrompt'"), fixed.indexOf(" then return null; end if;", fixed.indexOf("p_payload->'generation'->>'enhancePrompt'"))).replace(/\)$/, "");
  for (const [slot, revision, enhance, rejected] of [
    ["back", 2, false, false], ["back", 2, true, true], ["back", 1, true, false], ["back", null, true, false],
    ["face", 2, true, false], ["front_source", 1, true, false], ["face", 2, false, true], ["front_source", 1, false, true],
  ]) {
    const payload = { generation: { enhancePrompt: enhance, ...(revision === null ? {} : { promptRevision: revision }) } };
    const result = await pg.query(`select ${guard.replaceAll("p_payload", "$1::jsonb").replaceAll("w.slot", "$2::text")} rejected`, [JSON.stringify(payload), slot]);
    assert.equal(result.rows[0].rejected, rejected, `${slot}/${revision}/${enhance}`); checks++;
  }
  const acl = (await pg.query("select has_function_privilege('service_role','public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)','EXECUTE') value")).rows[0].value;
  assert.equal(acl, true); checks++;
  const counts = (await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_generation_job_events) events,(select count(*)::int from ugc_character_v5_candidates) candidates")).rows[0];
  assert.deepEqual(counts, { jobs: 0, events: 0, candidates: 0 }); checks++;
  console.info(JSON.stringify({ checks, migrations: files.length + 1, rerun057: true, executionRPCs: 0, counts }));
} finally { await pg.close(); }
