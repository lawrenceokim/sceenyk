// Static schema/catalog checks in isolated in-memory Postgres only.
// No workflow RPC invocation, job fixture, provider, storage or worker execution.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
let checks = 0;
try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  const target = "20261026006300_ugc_locations.sql";
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file < target).sort();
  for (const file of files) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  const catalog = async () => (await pg.query("select oid,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
  const before = await catalog();
  const sql = fs.readFileSync(`supabase/migrations/${target}`, "utf8");
  await pg.exec(sql); await pg.exec(sql);
  const after = await catalog();
  assert.deepEqual(after.filter(row => before.some(old => old.oid === row.oid)), before); checks++;
  for (const table of ["ugc_locations", "ugc_location_candidates", "ugc_location_events"]) {
    const result = (await pg.query("select relrowsecurity enabled,has_table_privilege('service_role',oid,'SELECT') readable,has_table_privilege('service_role',oid,'UPDATE') writable,has_table_privilege('authenticated',oid,'SELECT') browser from pg_class where oid=$1::regclass", [`public.${table}`])).rows[0];
    assert.deepEqual(result, { enabled: true, readable: true, writable: false, browser: false }); checks++;
  }
  for (const signature of ["ugc_location_claim(uuid)", "ugc_location_action(uuid,uuid,uuid,integer,text,jsonb)", "ugc_location_checkpoint(uuid,uuid,text,jsonb)"]) {
    const acl = (await pg.query("select has_function_privilege('service_role',$1,'EXECUTE') allowed,has_function_privilege('anon',$1,'EXECUTE') anonymous,has_function_privilege('authenticated',$1,'EXECUTE') browser", [`public.${signature}`])).rows[0];
    assert.deepEqual(acl, { allowed: true, anonymous: false, browser: false }); checks++;
  }
  const counts = (await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_locations) locations,(select count(*)::int from ugc_location_candidates) candidates")).rows[0];
  assert.deepEqual(counts, { jobs: 0, locations: 0, candidates: 0 }); checks++;
  const worker = fs.readFileSync("lib/location-reference/worker.ts", "utf8");
  assert.ok(worker.indexOf('if (candidate.intent)') < worker.indexOf('await provider.image(')); checks++;
  assert.ok(worker.indexOf('await checkpoint("image_intent"') < worker.indexOf('await provider.image(')); checks++;
  assert.ok(!/inngest|render|credit_ledger|generation_reservations/.test(worker)); checks++;
  assert.ok(sql.includes("if l.accepted_candidate_id=c.id then return null; end if;")); checks++;
  assert.ok(sql.includes("l.version<>p_version")); checks++;
  assert.ok(sql.includes("public.ugc_location_dependencies(j.id) is distinct from l.dependencies")); checks++;
  assert.ok(!sql.includes("update public.ugc_generation_jobs") && !sql.includes("update public.ugc_reference_reviews") && !sql.includes("update public.ugc_character")); checks++;
  console.info(JSON.stringify({ checks, migrations: files.length + 1, rerun063: true, priorFunctionsPreserved: before.length, executionRPCs: 0, counts }));
} catch (error) {
  console.error(JSON.stringify({ code: error.code, message: error.message, where: error.where, position: error.position,
    internalPosition: error.internalPosition, internalQuery: error.internalQuery }));
  process.exitCode = 1;
} finally { await pg.close(); }
