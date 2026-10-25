// Parse/expression/catalog checks only. No job fixtures or execution RPCs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite(); let checks = 0;
const check = (value, reason) => { assert(value, reason); checks++; };
try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  const migration = "20261025005600_ugc_character_v5_publication.sql";
  const files = fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < migration).sort();
  for (const file of files) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  const previous = (await pg.query("select prosrc from pg_proc where proname='ugc_character_v5_checkpoint'")).rows[0].prosrc;
  const expression = previous.match(/or (\(p_payload->'artifact'-array\['storageKey','etag'\]\)) is distinct from c.output_proof/)[1];
  const payload = { artifact: { id: "candidate", storageKey: "private", etag: "etag", sha256: "hash" } };
  let code;
  try { await pg.query(`select ${expression.replaceAll("p_payload", "$1::jsonb")}`, [JSON.stringify(payload)]); }
  catch (error) { code = error.code; }
  check(code === "22P02", "reproduce exact 055 ready expression failure");
  const preserved = async () => (await pg.query("select oid,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace and proname <> 'ugc_character_v5_checkpoint' order by oid")).rows;
  const before = await preserved();
  const sql = fs.readFileSync(`supabase/migrations/${migration}`, "utf8");
  await pg.exec(sql); await pg.exec(sql);
  assert.deepEqual(await preserved(), before); checks++;
  const fixed = (await pg.query("select prosrc from pg_proc where proname='ugc_character_v5_checkpoint'")).rows[0].prosrc;
  check(fixed === previous.replace(expression, "((p_payload->'artifact')-array['storageKey','etag'])"), "only expression grouping changes");
  const fixedExpression = fixed.match(/or (\(\(p_payload->'artifact'\)-array\['storageKey','etag'\]\)) is distinct from c.output_proof/)[1];
  const result = await pg.query(`select ${fixedExpression.replaceAll("p_payload", "$1::jsonb")} value`, [JSON.stringify(payload)]);
  assert.deepEqual(result.rows[0].value, { id: "candidate", sha256: "hash" }); checks++;
  const match = await pg.query(`select ${fixedExpression.replaceAll("p_payload", "$1::jsonb")} is not distinct from $2::jsonb value`,
    [JSON.stringify(payload), JSON.stringify({ id: "candidate", sha256: "hash" })]);
  check(match.rows[0].value, "matching proof admitted");
  const mismatch = await pg.query(`select ${fixedExpression.replaceAll("p_payload", "$1::jsonb")} is distinct from $2::jsonb value`,
    [JSON.stringify(payload), JSON.stringify({ id: "candidate", sha256: "other" })]);
  check(mismatch.rows[0].value, "different bytes remain rejected");
  const acl = (await pg.query("select has_function_privilege('service_role','public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)','EXECUTE') value")).rows[0].value;
  check(acl, "service-only grants retained");
  const counts = (await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_generation_job_events) events,(select count(*)::int from ugc_character_v5_candidates) candidates")).rows[0];
  assert.deepEqual(counts, { jobs: 0, events: 0, candidates: 0 }); checks++;
  console.info(JSON.stringify({ checks, migrations: files.length + 1, rerun056: true, originalCode: code, executionRPCs: 0, counts }));
} finally { await pg.close(); }
