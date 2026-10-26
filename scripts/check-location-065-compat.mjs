// Isolated SQL/catalog checks only. No connected DB, workflow RPC or row fixtures.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const target = "20261026006500_ugc_location_recovery_delete.sql";
const source = fs.readFileSync(`supabase/migrations/${target}`, "utf8").replace(/\r\n?/g, "\n");
const migrations = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file < target).sort();
const eol = (text, kind) => text.replace(/\r\n?/g, "\n").replace(/\n/g, kind === "crlf" ? "\r\n" : "\n");
const correction = " old_fragment:=replace(replace(old_fragment,E'\\r\\n',E'\\n'),E'\\r',E'\\n');\n";
const normalized = value => JSON.parse(JSON.stringify(value).replace(/\\r\\n/g, "\\n"));
let checks = 0;
async function snapshot(pg) {
  const queries = {
    functions: "select p.oid::regprocedure::text signature,p.prosrc,p.proacl,p.proconfig,p.prosecdef,pg_get_userbyid(p.proowner) owner from pg_proc p where pronamespace='public'::regnamespace order by 1",
    columns: "select table_name,column_name,data_type,column_default,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
    constraints: "select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by 1,2",
    triggers: "select tgrelid::regclass::text relation,tgname,pg_get_triggerdef(oid) definition from pg_trigger where not tgisinternal and tgrelid in(select oid from pg_class where relnamespace='public'::regnamespace) order by 1,2",
  };
  const result = {};
  for (const [key, query] of Object.entries(queries)) result[key] = (await pg.query(query)).rows;
  return normalized(result);
}
async function setup(kind) {
  const pg = new PGlite();
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  for (const file of migrations) await pg.exec(eol(fs.readFileSync(`supabase/migrations/${file}`, "utf8"), kind));
  return pg;
}
try {
  const broken = source.replace(correction, "");
  const pg = await setup("lf");
  try {
    const before = await snapshot(pg);
    let failure;
    try { await pg.exec(eol(broken, "crlf")); } catch (error) { failure = error; }
    assert.equal(failure?.code, "P0001"); checks++;
    assert.equal(failure?.message, "Unexpected Location cleanup implementation."); checks++;
    await pg.exec("rollback");
    assert.deepEqual(await snapshot(pg), before); checks++;
    console.info(JSON.stringify({ case: "original_crlf", reproduced: true, fullCatalogRollback: true }));
  } finally { await pg.close(); }
  if (process.argv.includes("--reproduce")) {
    console.info(JSON.stringify({ checks, correctedMigrationTested: false, workflowRPCs: 0, jobFixtures: 0 }));
  } else {
    assert.ok(source.includes(correction), "Expected explicit cleanup-fragment line-ending normalization."); checks++;
    let canonical;
    for (const [baseEol, targetEol] of [["lf", "lf"], ["lf", "crlf"], ["crlf", "lf"], ["crlf", "crlf"]]) {
      const pg = await setup(baseEol);
      try {
        await pg.exec(eol(source, targetEol));
        const first = await snapshot(pg);
        await pg.exec(eol(source, targetEol === "lf" ? "crlf" : "lf"));
        assert.deepEqual(await snapshot(pg), first); checks++;
        if (canonical) { assert.deepEqual(first, canonical); checks++; } else canonical = first;
        const count = (await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_locations) locations,(select count(*)::int from ugc_location_candidates) candidates")).rows[0];
        assert.deepEqual(count, { jobs: 0, locations: 0, candidates: 0 }); checks++;
        console.info(JSON.stringify({ case: `${baseEol}_to_${targetEol}`, rerunWithOppositeEol: true, catalogIdentical: true, count }));
      } finally { await pg.close(); }
    }
    const guarded = await setup("lf");
    try {
      const body = (await guarded.query("select prosrc from pg_proc where oid='public.ugc_location_checkpoint_pre_auto(uuid,uuid,text,jsonb)'::regprocedure")).rows[0].prosrc;
      const changed = body.replace("values(l.id,c.plan,c.settings)", "values(l.id,c.plan,'{}'::jsonb)");
      assert.notEqual(changed, body); checks++;
      await guarded.exec("create or replace function public.ugc_location_checkpoint_pre_auto(p_location uuid,p_token uuid,p_operation text,p_payload jsonb default '{}') returns public.ugc_locations language plpgsql security definer set search_path='' as '" + changed.replaceAll("'", "''") + "'");
      const before = await snapshot(guarded);
      let failure;
      try { await guarded.exec(source); } catch (error) { failure = error; }
      assert.equal(failure?.message, "Unexpected Location cleanup implementation."); checks++;
      await guarded.exec("rollback");
      assert.deepEqual(await snapshot(guarded), before); checks++;
      console.info(JSON.stringify({ case: "unknown_cleanup_definition", rejected: true, fullCatalogRollback: true }));
    } finally { await guarded.close(); }
    console.info(JSON.stringify({ checks, correctedMigrationTested: true, workflowRPCs: 0, jobFixtures: 0 }));
  }
} catch (error) {
  console.error(JSON.stringify({ code: error.code, message: error.message })); process.exitCode = 1;
}
