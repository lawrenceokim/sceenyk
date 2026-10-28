// Offline schema/profile/history checks only. Ephemeral PostgreSQL, no live I/O.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { input, canonicalInput, id } from "./final-video-fixture";
import { proposeExecutionRepair } from "../lib/storyboard/execution-repair";
import { prepareStoryboard, storyboardBinding } from "../lib/storyboard/contract";
import { validateExecutableStoryboard } from "../lib/storyboard/validation";
import { buildVideoGenerationPackage, packageInputFingerprint } from "../lib/video-generation-package/builder";
import { executionIssues, defaultDelivery } from "../lib/execution-v1/contract";
import { executableStoryboardSchema } from "../lib/storyboard/schema";
import { checkComposition, compositionRequirements } from "../lib/final-video-generation/composition";
import { elevenLabsDelivery } from "../lib/final-video-generation/adapters/elevenlabs";
import type { PackageRow } from "../lib/video-generation-package/contract";
import type { StoryboardRow } from "../lib/storyboard/contract";
import { finalConfiguration } from "../lib/final-video-generation/config";
import { finalProviders } from "../lib/final-video-generation/adapters/registry";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { assertPackageExecutable } from "../lib/video-generation-package/execution";

async function main() {
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_EXECUTION_CONTRACT_CHECKS"); };
  let checks = 0;
  const equal = (a: unknown,b: unknown) => { assert.deepEqual(a,b); checks++; };
  const ok = (v: unknown) => { assert.ok(v); checks++; };
  const fails = (work: () => unknown) => { assert.throws(work); checks++; };
  const legacy = structuredClone(input), source = structuredClone(input.storyboard.document);
  source.scenes[0].transition = "Dissolve into the next shot."; source.scenes[1].transition = "Fade out cleanly.";
  source.scenes[0].audio.music = "Soft synth pad"; source.scenes[1].speech[0].delivery = "Natural, confident, with a brief pause.";
  const before = structuredClone(source), proposal = proposeExecutionRepair(source);
  equal(source,before); equal(proposal.document.schemaVersion,2); ok(proposal.changes.some(c=>c.field==='transition'&&c.reason.includes('Review')));
  const repaired = prepareStoryboard(proposal.document, input.source); validateExecutableStoryboard(repaired,storyboardBinding(input.source)); checks++;
  equal(repaired.durationMs,10000); equal(repaired.scenes[0].transition,{type:'cut',durationMs:0}); equal(repaired.scenes[1].transition,{type:'fade_out',durationMs:400});
  equal(repaired.scenes[0].transitionNote,source.scenes[0].transition); equal(repaired.scenes[1].speech[0].text,source.scenes[1].speech[0].text);
  equal(repaired.scenes[1].speech[0].deliveryNote,source.scenes[1].speech[0].delivery);
  fails(()=>validateExecutableStoryboard(legacy.storyboard.document,storyboardBinding(legacy.source)));
  const unknown=structuredClone(source);unknown.scenes[0].transition='Whip-pan around the subject';
  fails(()=>prepareStoryboard(proposeExecutionRepair(unknown).document,input.source));
  const canonical=executableStoryboardSchema.parse(canonicalInput.storyboard.document);
  for(const durationMs of [5000,10000,30000]){
    const d=structuredClone(canonical);d.durationMs=durationMs;
    const count=durationMs===5000?1:durationMs===10000?2:5; const length=durationMs/count;
    d.scenes=Array.from({length:count},(_,i)=>({...structuredClone(canonical.scenes[0]),number:i+1,startMs:i*length,endMs:(i+1)*length,
      actions:[{...canonical.scenes[0].actions[0],startMs:i*length,endMs:i*length+1000}],speech:[],transition:{type:'cut' as const,durationMs:0}}));
    const binding={...storyboardBinding(canonicalInput.source),durationMs};
    validateExecutableStoryboard(d,binding);checks++;equal(executionIssues(d),[]);
  }
  const overlap=structuredClone(canonical);overlap.scenes[0].endMs=6000;overlap.scenes[0].transition={type:'crossfade',durationMs:1000};
  validateExecutableStoryboard(overlap,storyboardBinding(canonicalInput.source));checks++;equal(executionIssues(overlap),[]);
  const wrong=structuredClone(canonical);wrong.scenes[0].transition={type:'crossfade',durationMs:400};
  fails(()=>validateExecutableStoryboard(wrong,storyboardBinding(canonicalInput.source)));
  const required=structuredClone(canonical);required.scenes[0].audio.music={requirement:'required',description:'Music',assetId:null};
  fails(()=>validateExecutableStoryboard(required,storyboardBinding(canonicalInput.source)));
  required.scenes[0].audio.music.assetId=id(50);fails(()=>validateExecutableStoryboard(required,storyboardBinding(canonicalInput.source)));
  const optional=structuredClone(canonical);optional.scenes[0].audio.music={requirement:'optional',description:'Future optional music idea',assetId:null};
  validateExecutableStoryboard(optional,storyboardBinding(canonicalInput.source));checks++;
  const badDelivery=structuredClone(canonical);(badDelivery.scenes[1].speech[0].delivery as {style:string}).style='whisper+scream';
  fails(()=>validateExecutableStoryboard(badDelivery,storyboardBinding(canonicalInput.source)));
  equal(elevenLabsDelivery(defaultDelivery()).speed,1);equal(elevenLabsDelivery({...defaultDelivery(),pace:'slow'}).speed,0.9);
  const packageInput=structuredClone(canonicalInput);packageInput.storyboard.document=repaired;
  const doc=buildVideoGenerationPackage(packageInput,2);equal(doc.schemaVersion,2);equal(doc.compilerVersion,2);equal(doc.executionVersion,'ugc-execution-v1');
  equal(checkComposition(compositionRequirements(doc)).issues,[]);
  equal(buildVideoGenerationPackage(legacy,1).schemaVersion,1);equal(legacy,input);
  // These are fixture ceilings, matching the currently inspected configuration;
  // they are admission bounds, not invented provider tariffs or actual usage.
  process.env.UGC_FINAL_VIDEO_ENABLED='1';process.env.UGC_FINAL_OPERATOR_FUNDED='1';process.env.SCEENYK_LOCAL_JOBS_ONLY='1';
  process.env.UGC_FINAL_AUTHORIZATION=JSON.stringify({authorizationId:id(80),language:'en',maxRequests:8,maxEstimatedCostMicrousd:7000000,
    ceilings:{video:6250000,design:200000,binding:10000,voice:100000,lip_sync:200000}});
  const costsInput=structuredClone(packageInput);
  costsInput.storyboard.document.scenes[0].speech=[{...structuredClone(costsInput.storyboard.document.scenes[1].speech[0]),startMs:1200,endMs:2400,text:'My mug.'}];
  const costs=finalPreflight(assertPackageExecutable(costsInput,2),finalConfiguration().value,finalProviders());
  equal(costs.requests,8);equal(costs.estimatedCostMicrousd,13310000);equal(costs.diagnostics.map(i=>i.layer),['funding']);
  equal(costs.breakdown.map(i=>i.estimatedCostMicrousd),[6250000,6250000,200000,10000,100000,100000,200000,200000]);
  equal(costs.breakdown.reduce((sum,i)=>sum+i.authorizationCeilingMicrousd,0),costs.estimatedCostMicrousd);
  const unresolved=structuredClone(costsInput);unresolved.storyboard.document.scenes[0].endMs=3500;
  fails(()=>assertPackageExecutable(unresolved,2));

  const pg=new PGlite();
  try {
    await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
    const target='20261028007000_ugc_execution_contract_v1.sql';
    for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')&&n<target).sort())await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    await pg.exec('create temp table current_source(value jsonb);create temp table current_package(value jsonb);');
    await pg.query('insert into current_source values($1::jsonb)',[JSON.stringify(input.source)]);
    await pg.query('insert into current_package values($1::jsonb)',[JSON.stringify(input)]);
    await pg.exec("create or replace function public.ugc_storyboard_input(p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$ select value from pg_temp.current_source $$;");
    await pg.exec("create or replace function public.ugc_package_input(p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$ select value from pg_temp.current_package $$;");
    await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'synthetic-execution-owner')",[id(1)]);
    await pg.query("insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type) values($1,$2,'Demo','product-ad','Show the mug','9:16','10','Realistic','Professional','ugc','advertisement')",[id(2),id(1)]);
    await pg.query("insert into public.ugc_generation_jobs(id,owner_user_id,project_id,idempotency_key,input_snapshot) values($1,$2,$3,$4,'{}')",[id(3),id(1),id(2),id(90)]);
    await pg.query("insert into public.ugc_storyboards(id,job_id,owner_user_id,project_id,revision,version,input,document,state,phase,approved_at) values($1,$2,$3,$4,1,4,$5::jsonb,$6::jsonb,'approved','approved',clock_timestamp())",[id(7),id(3),id(1),id(2),JSON.stringify(input.source),JSON.stringify(input.storyboard.document)]);
    // Create the original immutable approved package using its original RPCs.
    const oldDoc=buildVideoGenerationPackage(input,1);
    await pg.query("select public.ugc_package_action($1,$2,$3,0,'prepare',$4::jsonb)",[id(1),id(2),id(3),JSON.stringify({requestId:id(84),input,fingerprint:packageInputFingerprint(input)})]);
    const oldClaim=(await pg.query<{value:PackageRow}>('select to_jsonb(public.ugc_package_claim($1)) value',[id(91)])).rows[0].value;
    const oldReady=(await pg.query<{value:PackageRow}>("select to_jsonb(public.ugc_package_checkpoint($1,$2,'ready',$3::jsonb)) value",[oldClaim.id,oldClaim.claim_token,JSON.stringify({document:oldDoc})])).rows[0].value;
    const oldApproved=(await pg.query<{value:PackageRow}>("select to_jsonb(public.ugc_package_action($1,$2,$3,$4,'approve',$5::jsonb)) value",[id(1),id(2),id(3),oldReady.version,JSON.stringify({packageId:oldReady.id})])).rows[0].value;
    equal(oldApproved.state,'approved');
    const catalog=async()=>(await pg.query<{oid:number;proname:string;prosrc:string;proacl:unknown}>("select oid,proname,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
    const originalFunctions=await catalog();
    const oldRow=(await pg.query("select to_jsonb(b)-array['repair_source_id','repair_request_id'] row from public.ugc_storyboards b where id=$1",[id(7)])).rows;
    const migration=fs.readFileSync('supabase/migrations/'+target,'utf8');await pg.exec(migration);await pg.exec(migration);await pg.exec(migration.replace(/\r?\n/g,'\r\n'));
    const changedFunctions=new Set(['ugc_storyboard_valid','ugc_package_valid','ugc_final_current','ugc_package_action','ugc_storyboard_checkpoint']);
    const installedFunctions=await catalog();
    equal(installedFunctions.filter(f=>originalFunctions.some(o=>o.oid===f.oid)).map(f=>({oid:f.oid,proacl:f.proacl})),originalFunctions.map(f=>({oid:f.oid,proacl:f.proacl})));
    equal(installedFunctions.filter(f=>originalFunctions.some(o=>o.oid===f.oid)&&!changedFunctions.has(f.proname)),originalFunctions.filter(f=>!changedFunctions.has(f.proname)));
    equal((await pg.query<{value:PackageRow}>('select to_jsonb(p) value from public.ugc_generation_packages p where id=$1',[oldApproved.id])).rows[0].value,oldApproved);
    equal((await pg.query("select to_jsonb(b)-array['repair_source_id','repair_request_id'] row from public.ugc_storyboards b where id=$1",[id(7)])).rows.map((r:unknown)=>r),oldRow.map((r:unknown)=>r));
    const sqlValid=async(value:unknown)=>(await pg.query<{valid:boolean}>('select public.ugc_storyboard_valid($1::jsonb,$2::jsonb) valid',[JSON.stringify(value),JSON.stringify(input.source)])).rows[0].valid;
    equal(await sqlValid(input.storyboard.document),true);equal(await sqlValid(repaired),true);equal(await sqlValid(wrong),false);equal(await sqlValid(required),false);equal(await sqlValid(overlap),true);
    for(const mutate of [(d:typeof canonical)=>{d.scenes[0].transition.type=null as never;},(d:typeof canonical)=>{d.scenes[0].audio.music.requirement=null as never;},(d:typeof canonical)=>{d.scenes[1].speech[0].delivery.energy=null as never;},
      (d:typeof canonical)=>{d.scenes[1].speech[0].startMs=null as never;},(d:typeof canonical)=>{d.scenes[1].speech[0].endMs=null as never;},
      (d:typeof canonical)=>{d.scenes[1].speech[0].speaker=null as never;},(d:typeof canonical)=>{d.scenes[0].actions[0].startMs=null as never;}]){
      const invalid=structuredClone(canonical);mutate(invalid);equal(await sqlValid(invalid),false);fails(()=>validateExecutableStoryboard(invalid,storyboardBinding(input.source)));
    }
    await assert.rejects(pg.query("update public.ugc_storyboards set state='review' where id=$1",[id(7)]),/Fork approved/);checks++;
    await assert.rejects(pg.query("update public.ugc_storyboards set document=$2::jsonb where id=$1",[id(7),JSON.stringify(repaired)]),/Immutable approved/);checks++;
    const repair=async(owner=id(1),request=id(81),value:unknown=repaired)=>(await pg.query<{value:StoryboardRow|null}>('select to_jsonb(public.ugc_storyboard_repair_execution($1,$2,$3,$4,$5,$6,$7::jsonb)) value',[owner,id(2),id(3),id(7),4,request,JSON.stringify(value)])).rows[0].value;
    equal(await repair(id(99)),null);equal(await repair(id(1),id(82),wrong),null);
    const fork=(await repair())!;ok(fork.id);equal(fork.revision,2);equal(fork.state,'review');equal(fork.requests,[]);equal(fork.attempts,0);
    equal((await repair())?.id,fork.id);equal((await repair(id(1),id(83)))?.id,fork.id);
    equal((await pg.query("select to_jsonb(b)-array['repair_source_id','repair_request_id'] row from public.ugc_storyboards b where id=$1",[id(7)])).rows,oldRow);
    const accepted=(await pg.query<{value:StoryboardRow}>("select to_jsonb(public.ugc_storyboard_action($1,$2,$3,$4,'accept',$5::jsonb)) value",[id(1),id(2),id(3),fork.version,JSON.stringify({storyboardId:fork.id})])).rows[0].value;
    equal(accepted.state,'approved');equal(accepted.document,repaired);
    ok((await pg.query<{n:number}>('select count(*)::integer n from public.ugc_storyboard_versions')).rows[0].n>=3);
    const nextInput=structuredClone(packageInput);nextInput.storyboard.id=accepted.id;nextInput.storyboard.revision=accepted.revision;nextInput.storyboard.version=accepted.version;nextInput.storyboard.approvedAt=accepted.approved_at!;
    await pg.query('update current_package set value=$1::jsonb',[JSON.stringify(nextInput)]);
    const nextDoc=buildVideoGenerationPackage(nextInput,2);
    equal((await pg.query<{valid:boolean}>('select public.ugc_package_valid($1::jsonb,$2::jsonb,2,$3) valid',[JSON.stringify(nextDoc),JSON.stringify(nextInput),packageInputFingerprint(nextInput)])).rows[0].valid,true);
    const prepared=(await pg.query<{value:PackageRow}>("select to_jsonb(public.ugc_package_action($1,$2,$3,$4,'prepare',$5::jsonb)) value",[id(1),id(2),id(3),oldApproved.version,JSON.stringify({packageId:oldApproved.id,requestId:id(85),input:nextInput,fingerprint:packageInputFingerprint(nextInput)})])).rows[0].value;
    ok(prepared.id);equal(prepared.input_fingerprint,packageInputFingerprint(nextInput));
    const claim=(await pg.query<{value:PackageRow}>('select to_jsonb(public.ugc_package_claim($1)) value',[id(91)])).rows[0].value;
    const ready=(await pg.query<{value:PackageRow}>("select to_jsonb(public.ugc_package_checkpoint($1,$2,'ready',$3::jsonb)) value",[claim.id,claim.claim_token,JSON.stringify({document:nextDoc})])).rows[0].value;
    equal(ready.state,'review');
    const approved=(await pg.query<{value:PackageRow}>("select to_jsonb(public.ugc_package_action($1,$2,$3,$4,'approve',$5::jsonb)) value",[id(1),id(2),id(3),ready.version,JSON.stringify({packageId:ready.id})])).rows[0].value;
    equal(approved.state,'approved');equal(approved.document,nextDoc);
    equal(approved.revision,2);ok(approved.id!==oldApproved.id);
    equal((await pg.query<{value:PackageRow}>('select to_jsonb(p) value from public.ugc_generation_packages p where id=$1',[oldApproved.id])).rows[0].value,oldApproved);
    equal((await pg.query("select to_jsonb(b)-array['repair_source_id','repair_request_id'] row from public.ugc_storyboards b where id=$1",[id(7)])).rows,oldRow);
    await assert.rejects(pg.exec("update public.ugc_storyboard_versions set state='review'"),/immutable|append.only/i);checks++;
    const privileges=(await pg.query("select has_table_privilege('authenticated','public.ugc_storyboard_versions','SELECT') browser,has_table_privilege('service_role','public.ugc_storyboard_versions','UPDATE') writable,has_function_privilege('authenticated','public.ugc_storyboard_repair_execution(uuid,uuid,uuid,uuid,integer,uuid,jsonb)','EXECUTE') rpc")).rows[0];
    equal(privileges,{browser:false,writable:false,rpc:false});
  } finally {await pg.close();}
  console.info(`Canonical V1 checks passed: ${checks}; migrations 1..70/reruns/local history fixtures; live/provider calls: none`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
