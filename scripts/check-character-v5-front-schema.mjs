// Isolated schema/guard/preservation checks only; no execution RPCs or job fixtures.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite(); let checks = 0;
try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  const migration = "20261026006000_ugc_character_v5_front_mask.sql";
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file < migration).sort();
  for (const file of files) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  const checkpoint = async () => (await pg.query("select prosrc from pg_proc where proname='ugc_character_v5_checkpoint'")).rows[0].prosrc;
  const preserved = async () => (await pg.query("select oid,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace and proname <> 'ugc_character_v5_checkpoint' order by oid")).rows;
  const previous = await checkpoint(); const before = await preserved();
  const sql = fs.readFileSync(`supabase/migrations/${migration}`, "utf8");
  await pg.exec(sql); await pg.exec(sql);
  assert.deepEqual(await preserved(), before); checks++;
  const oldGuard = "case when w.slot='back' and p_payload->'generation'->>'promptRevision' in ('2','3','4') then 'false' else 'true' end";
  const newGuard = "case when w.slot='back' and p_payload->'generation'->>'promptRevision' in ('2','3','4')\n      or w.slot='front_source' and p_payload->'generation'->>'promptRevision'='2' then 'false' else 'true' end";
  const current = await checkpoint();
  assert.equal(current, previous.replace(oldGuard, newGuard)); checks++;
  const guard = current.slice(current.indexOf("p_payload->'generation'->>'enhancePrompt'"), current.indexOf(" then return null; end if;", current.indexOf("p_payload->'generation'->>'enhancePrompt'"))).replace(/\)$/, "");
  for (const [slot, revision, enhance, rejected] of [ ["front_source", 2, false, false], ["front_source", 2, true, true],
    ["front_source", 1, true, false], ["front_source", 1, false, true], ["back", 4, false, false], ["back", 4, true, true], ["face", 2, true, false] ]) {
    const result = await pg.query(`select ${guard.replaceAll("p_payload", "$1::jsonb").replaceAll("w.slot", "$2::text")} rejected`,
      [JSON.stringify({ generation: { promptRevision: revision, enhancePrompt: enhance } }), slot]);
    assert.equal(result.rows[0].rejected, rejected); checks++;
  }
  const acl = (await pg.query("select has_function_privilege('service_role','public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)','EXECUTE') value")).rows[0].value;
  assert.equal(acl, true); checks++;
  const counts = (await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_generation_job_events) events,(select count(*)::int from ugc_character_v5_candidates) candidates")).rows[0];
  assert.deepEqual(counts, { jobs: 0, events: 0, candidates: 0 }); checks++;
  console.info(JSON.stringify({ checks, migrations: files.length + 1, rerun060: true, executionRPCs: 0, counts }));
} finally { await pg.close(); }
