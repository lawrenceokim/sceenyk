// Static schema/catalog checks in isolated in-memory Postgres only.
// No workflow RPC invocation, job fixture, provider, storage or worker execution.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
let checks = 0;
try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  const target = "20261026006500_ugc_location_recovery_delete.sql";
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file < target).sort();
  for (const file of files) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  const catalog = async () => (await pg.query("select oid,proname,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
  const before = await catalog();
  const sql = fs.readFileSync(`supabase/migrations/${target}`, "utf8");
  await pg.exec(sql); await pg.exec(sql);
  const after = await catalog();
  const preserved = before.filter(row => !["ugc_location_claim", "ugc_location_action", "ugc_location_checkpoint", "ugc_location_checkpoint_pre_auto", "ugc_location_audit"].includes(row.proname));
  assert.deepEqual(after.filter(row => preserved.some(old => old.oid === row.oid)), preserved); checks++;
  for (const table of ["ugc_locations", "ugc_location_candidates", "ugc_location_events"]) {
    const result = (await pg.query("select relrowsecurity enabled,has_table_privilege('service_role',oid,'SELECT') readable,has_table_privilege('service_role',oid,'UPDATE') writable,has_table_privilege('authenticated',oid,'SELECT') browser from pg_class where oid=$1::regclass", [`public.${table}`])).rows[0];
    assert.deepEqual(result, { enabled: true, readable: true, writable: false, browser: false }); checks++;
  }
  for (const signature of ["ugc_location_claim(uuid)", "ugc_location_action(uuid,uuid,uuid,integer,text,jsonb)", "ugc_location_checkpoint(uuid,uuid,text,jsonb)",
    "ugc_location_recovery_claim(uuid,uuid,uuid,uuid,integer)", "ugc_location_cleanup_claim(uuid,uuid,uuid,uuid,integer)"]) {
    const acl = (await pg.query("select has_function_privilege('service_role',$1,'EXECUTE') allowed,has_function_privilege('anon',$1,'EXECUTE') anonymous,has_function_privilege('authenticated',$1,'EXECUTE') browser", [`public.${signature}`])).rows[0];
    assert.deepEqual(acl, { allowed: true, anonymous: false, browser: false }); checks++;
  }
  for (const signature of ["ugc_location_action_pre_auto(uuid,uuid,uuid,integer,text,jsonb)", "ugc_location_checkpoint_pre_auto(uuid,uuid,text,jsonb)",
    "ugc_location_action_pre_delete(uuid,uuid,uuid,integer,text,jsonb)", "ugc_location_checkpoint_pre_recovery(uuid,uuid,text,jsonb)"]) {
    const allowed = (await pg.query("select has_function_privilege('service_role',$1,'EXECUTE') allowed", [`public.${signature}`])).rows[0].allowed;
    assert.equal(allowed, false); checks++;
  }
  const counts = (await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_locations) locations,(select count(*)::int from ugc_location_candidates) candidates")).rows[0];
  assert.deepEqual(counts, { jobs: 0, locations: 0, candidates: 0 }); checks++;
  const worker = fs.readFileSync("lib/location-reference/worker.ts", "utf8");
  assert.ok(worker.indexOf('if (candidate.intent)') < worker.indexOf('await provider.image(')); checks++;
  assert.ok(worker.indexOf('await checkpoint("image_intent"') < worker.indexOf('await provider.image(')); checks++;
  assert.ok(!/inngest|render|credit_ledger|generation_reservations/.test(worker)); checks++;
  const foundation = fs.readFileSync("supabase/migrations/20261026006300_ugc_locations.sql", "utf8");
  assert.ok(foundation.includes("if l.accepted_candidate_id=c.id then return null; end if;")); checks++;
  assert.ok(sql.includes("l.version is distinct from p_version")); checks++;
  const baseCheckpoint = after.find(row => row.proname === "ugc_location_checkpoint_pre_auto").prosrc;
  assert.ok(baseCheckpoint.includes("public.ugc_location_dependencies(j.id) is distinct from l.dependencies")); checks++;
  assert.ok(!sql.includes("update public.ugc_generation_jobs") && !sql.includes("update public.ugc_reference_reviews") && !sql.includes("update public.ugc_character")); checks++;
  const claim = after.find(row => row.proname === "ugc_location_claim").prosrc;
  assert.ok(!claim.includes("insert into public.ugc_locations")); checks++;
  assert.ok(claim.includes("q.requested_at is not null") && claim.includes("prior.next_location_id=q.id")); checks++;
  const checkpoint = after.find(row => row.proname === "ugc_location_checkpoint").prosrc;
  const autoCheckpoint = after.find(row => row.proname === "ugc_location_checkpoint_pre_recovery").prosrc;
  assert.ok(autoCheckpoint.includes("p_operation='plan_ready'") && autoCheckpoint.includes("insert into public.ugc_location_candidates")); checks++;
  const action = after.find(row => row.proname === "ugc_location_action").prosrc;
  assert.ok(action.includes("l.id::text is distinct from p_payload->>'locationId'")); checks++;
  assert.ok(action.includes("if same_context") && action.includes("l.revision+1")); checks++;
  const view = fs.readFileSync("components/creation/location-reference-review.tsx", "utf8");
  assert.ok(!view.includes("<textarea") && !view.includes("location.plan") && !view.includes("imagePrompt")); checks++;
  const server = fs.readFileSync("lib/location-reference/server.ts", "utf8");
  assert.ok(!server.includes("plan: row.plan") && !server.includes("plan: location")); checks++;
  const scene = after.find(row => row.proname === "ugc_location_scene").prosrc;
  assert.ok(scene.includes("reference_name") && scene.includes("ugc_reference_analyses") && scene.includes("p.prompt")); checks++;
  const deletion = action.slice(action.indexOf("if p_action in ('reject'"), action.indexOf("if p_action='retry_saving'"));
  assert.ok(deletion.length > 100 && !/insert into|queued_image|queued_plan|action_pre_delete/.test(deletion)); checks++;
  const finishedDeletion = baseCheckpoint.slice(baseCheckpoint.indexOf("elsif p_operation='deleted'"), baseCheckpoint.indexOf("elsif p_operation='fail'"));
  assert.ok(!/insert into|queued_image|queued_plan/.test(finishedDeletion)); checks++;
  assert.ok(checkpoint.includes("state='idle'") && checkpoint.includes("candidate_id=null")); checks++;
  assert.ok(claim.includes("q.state<>'rejecting' or q.error_code is null")); checks++;
  assert.ok(!view.includes("Reject and Regenerate") && view.includes("Reject and Delete") && view.includes("Retry deletion")); checks++;
  assert.ok(server.includes("candidateId: available ? row.candidate_id : null")); checks++;
  const recovery = fs.readFileSync("lib/location-reference/recovery.ts", "utf8");
  const cleanup = fs.readFileSync("lib/location-reference/cleanup.ts", "utf8");
  assert.ok(!/from ["']\.\/provider|createLocationProvider|\.images\./.test(recovery + cleanup)); checks++;
  assert.ok(recovery.includes("readLocationBytes") && recovery.includes("LOCATION_OUTPUT_UNAVAILABLE")); checks++;
  assert.ok(worker.indexOf("await stageLocationBytes") < worker.indexOf('await checkpoint("saving"')); checks++;
  assert.ok(server.includes("ugc_location_recovery_claim") && server.includes("runLocationStorageClaim")); checks++;
  assert.ok(checkpoint.includes("output_proof") && checkpoint.includes("l.recovery_only and p_operation")); checks++;
  assert.ok(cleanup.includes("row.accepted_candidate_id === candidate.id") && cleanup.includes("deleteR2LocationCandidate")); checks++;
  const audit = after.find(row => row.proname === "ugc_location_audit").prosrc;
  assert.ok(audit.includes("new.error_code,new.diagnostic") && audit.includes("new.revision")); checks++;
  const polling = fs.readFileSync("lib/ugc-jobs/contract.ts", "utf8").split("export function shouldPollUgcProgress")[1];
  assert.ok(polling.indexOf("job.referenceReview?.regenerating") < polling.indexOf("job.location?.canRetryDelete")); checks++;
  console.info(JSON.stringify({ checks, migrations: files.length + 1, rerun065: true, priorFunctionsPreserved: preserved.length, executionRPCs: 0, counts }));
} catch (error) {
  console.error(JSON.stringify({ code: error.code, message: error.message, where: error.where, position: error.position,
    internalPosition: error.internalPosition, internalQuery: error.internalQuery }));
  process.exitCode = 1;
} finally { await pg.close(); }
