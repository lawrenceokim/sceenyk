// Offline reconstruction from the read-only snapshot. No network or live writes.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { validateVideoGenerationPackage, packageInputFingerprint } from "../lib/video-generation-package/builder";
import type { PackageRow } from "../lib/video-generation-package/contract";

async function main() {
  globalThis.fetch = async () => { throw Error("NETWORK_FORBIDDEN"); };
  const snapshot = JSON.parse(await fs.readFile(".ugc-final-recovery/review-investigation.json", "utf8"));
  const run = snapshot.execution;
  const saved = (snapshot.ugc_generation_packages as PackageRow[]).find(p=>p.id===run.package_id)!;
  const pg = new PGlite();
  try {
    // Resolver-only fixtures use a subset of the real columns, with actual saved values.
    await pg.exec(`set timezone='UTC';create table public.ugc_generation_jobs(id uuid,owner_user_id uuid,project_id uuid,status text,stage text,cancellation_requested_at timestamptz,
      heartbeat_at timestamptz,completed_at timestamptz,attempt_count integer,processing_elapsed_ms bigint);
      create table public.ugc_storyboards(id uuid,job_id uuid,owner_user_id uuid,project_id uuid,revision int,version int,state text,approved_at timestamptz,input jsonb,document jsonb);
      create table public.ugc_locations(id uuid,job_id uuid,owner_user_id uuid,project_id uuid,location_index int,revision int,version int,state text,approved_at timestamptz,accepted_candidate_id uuid,dependencies jsonb,scene jsonb,plan jsonb);
      create table public.ugc_location_candidates(id uuid,location_id uuid,state text,artifact jsonb);
      create table public.ugc_character_v5_workflows(id uuid,job_id uuid,approved_at timestamptz,state text,sheet jsonb);
      create table public.ugc_reference_reviews(id uuid,job_id uuid,reference_type text,version int,approved_at timestamptz,composed_version int,composed_asset jsonb,product_sheet_id uuid,character_sheet_id uuid);
      create table public.ugc_product_sheets(id uuid,document jsonb);create table public.ugc_character_sheets(id uuid,document jsonb);
      create table snapshot(value jsonb);
      create function public.ugc_location_scene(p_job uuid) returns jsonb language sql stable as $$select value->'ugc_location_scene'->'data' from public.snapshot$$;
      create function public.ugc_location_dependencies(p_job uuid) returns jsonb language sql stable as $$select value->'ugc_location_dependencies'->'data' from public.snapshot$$;
      create function public.ugc_location_scene_matches(a jsonb,b jsonb) returns boolean language sql immutable as $$select a=b$$;
      create function public.ugc_storyboard_valid(a jsonb,b jsonb) returns boolean language sql immutable as $$select true$$;
      create role anon;create role authenticated;create role service_role;`);
    await pg.query("insert into snapshot values($1::jsonb)",[JSON.stringify(snapshot)]);
    for(const table of ["ugc_generation_jobs","ugc_storyboards","ugc_locations","ugc_location_candidates","ugc_character_v5_workflows","ugc_reference_reviews","ugc_product_sheets"]) {
      assert.ok(Array.isArray(snapshot[table]),`${table} missing`);
      for(const row of snapshot[table]) await pg.query(`insert into public.${table} select * from jsonb_populate_record(null::public.${table},$1::jsonb)`,[JSON.stringify(row)]);
    }
    const original = await fs.readFile("supabase/migrations/20261026006600_ugc_storyboards.sql","utf8");
    const migration = await fs.readFile("supabase/migrations/20261029007500_ugc_final_approval_currentness.sql","utf8");
    const extract = (source:string,name:string) => {
      const start=source.indexOf(`create or replace function public.${name}(`),end=source.indexOf("end; $$;",start)+"end; $$;".length;
      assert.ok(start>=0&&end>start);return source.slice(start,end);
    };
    await pg.exec(extract(original,"ugc_storyboard_input"));
    await pg.exec(extract(migration,"ugc_storyboard_creative_input_075"));
    await pg.exec(extract(migration,"ugc_package_input"));
    const resolve = async () => (await pg.query<{value:unknown}>("select public.ugc_package_input($1) value",[run.job_id])).rows[0].value;
    const legacy=(await pg.query<{value:unknown}>("select public.ugc_storyboard_input($1) value",[run.job_id])).rows[0].value;
    assert.equal(legacy,null);
    const reconstructed=await resolve();
    assert.deepEqual(reconstructed,saved.input);
    const doc=validateVideoGenerationPackage(saved.document,reconstructed,saved.revision);
    assert.equal(doc.packageHash,run.package_hash);assert.equal(packageInputFingerprint(saved.input),saved.input_fingerprint);
    // The real resolver must ignore lifecycle state while keeping source/approval versions exact.
    for(const [status,stage] of [["queued","location_reference"],["running","finalizing"],["awaiting_confirmation","awaiting_confirmation"],["completed","complete"]]) {
      await pg.query("update public.ugc_generation_jobs set status=$1,stage=$2",[status,stage]);assert.deepEqual(await resolve(),saved.input);
    }
    await pg.exec("update public.ugc_generation_jobs set heartbeat_at=now(),completed_at=now(),attempt_count=1,processing_elapsed_ms=12345");
    assert.deepEqual(await resolve(),saved.input);
    await pg.exec("update public.ugc_generation_jobs set status='cancelled'");assert.equal(await resolve(),null);
    await pg.exec("update public.ugc_generation_jobs set status='completed'");
    await pg.exec("update public.ugc_storyboards set document=jsonb_set(document,'{title}','\"Changed\"')");assert.notDeepEqual(await resolve(),saved.input);
    await pg.exec("update public.ugc_storyboards set version=version+1");assert.notDeepEqual(await resolve(),saved.input);
    const report={offline:true,creativeInputExactlyUnchanged:true,legacyInputNull:true,packageId:saved.id,revision:saved.revision,recordVersion:saved.version,
      packageHash:doc.packageHash,inputFingerprint:saved.input_fingerprint,executionPackageId:run.package_id,executionPackageVersion:run.package_version,
      executionPackageHash:run.package_hash,runtimeStateExcluded:true,cancellationBlocked:true,creativeAndVersionChangesDetected:true};
    await fs.writeFile(".ugc-final-recovery/media-investigation/currentness.json",JSON.stringify(report,null,2));console.info(JSON.stringify(report,null,2));
  } finally {await pg.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
