// Offline PostgreSQL fixtures only. No providers, workers or live database.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { canonicalInput as input, id, fixturePricingRaw } from "./final-video-fixture";
import { buildVideoGenerationPackage, packageDigest } from "../lib/video-generation-package/builder";
import { finalPricing } from "../lib/final-video-generation/adapters/pricing";
import { adapterIdentities, finalProviders } from "../lib/final-video-generation/adapters/registry";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { compositionProfile } from "../lib/final-video-generation/composition";
import { withFinalVideoProgress } from "../lib/final-video-generation/progress";
import { buildUgcProgress } from "../lib/ugc-jobs/progress";
import type { FinalConfiguration, FinalExecution, FinalAsset, Operation, FinalReview } from "../lib/final-video-generation/contract";
import type { UgcJobRow } from "../lib/ugc-jobs/contract";

async function main() {
  globalThis.fetch = async () => { throw Error("NETWORK_FORBIDDEN_IN_APPROVAL_TESTS"); };
  let checks = 0;
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a,b); checks++; };
  const ok = (v: unknown) => { assert.ok(v); checks++; };
  const pg = new PGlite();
  const migration = fs.readFileSync("supabase/migrations/20261029007500_ugc_final_approval_currentness.sql", "utf8");
  try {
    await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    for (const name of fs.readdirSync("supabase/migrations").filter(n => n.endsWith(".sql") && n <= "20261028007000_ugc_execution_contract_v1.sql").sort())
      await pg.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
    await pg.exec("create temp table fixture_input(value jsonb, fail_after_complete boolean default false);");
    await pg.query("insert into fixture_input(value) values($1::jsonb)", [JSON.stringify(input)]);
    await pg.exec(`create or replace function public.ugc_package_input(p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$
      select value from pg_temp.fixture_input where not (fail_after_complete and exists(select 1 from public.ugc_generation_jobs where id=p_job and status='completed')) $$;
      create or replace function public.ugc_location_references_approved(p_job_id uuid) returns boolean language sql stable security definer set search_path='' as $$select true$$;`);
    await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'approval-fixture')", [id(1)]);
    await pg.query("insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type) values($1,$2,'Demo','product-ad','Show the mug','9:16','10','Realistic','Professional','ugc','advertisement')", [id(2),id(1)]);
    await pg.query("insert into public.ugc_generation_jobs(id,owner_user_id,project_id,idempotency_key,input_snapshot) values($1,$2,$3,$4,'{}')", [id(3),id(1),id(2),id(90)]);
    const doc = buildVideoGenerationPackage(input, 1);
    await pg.query("insert into public.ugc_generation_packages(id,job_id,owner_user_id,project_id,revision,request_id,input,input_fingerprint,document,package_hash,validation_receipt,state,phase,was_approved,approved_at,approved_by) values($1,$2,$3,$4,1,$5,$6::jsonb,$7,$8::jsonb,$9,'{}','approved','approved',true,clock_timestamp(),$3)",
      [id(20),id(3),id(1),id(2),id(21),JSON.stringify(input),doc.inputFingerprint,JSON.stringify(doc),doc.packageHash]);
    const configuration: FinalConfiguration = { version: "ugc-final-v1", funding: "operator_funded", authorizationId: id(80), language: "en",
      pricing: finalPricing(fixturePricingRaw), maxRequests: 20, maxEstimatedCostMicrousd: 30000000,
      ceilings: { video:6250000,voice:100000,design:200000,binding:10000,lip_sync:200000 }, providers:adapterIdentities,composition:compositionProfile,
      output:{height:720,fps:25,format:"mp4",toleranceMs:50,audioSampleRate:48000} };
    const plan = finalPreflight(doc,configuration,finalProviders());
    const action = async (kind: string,payload: unknown, owner=id(1)) => (await pg.query<{value:FinalExecution|null}>("select to_jsonb(public.ugc_final_action($1,$2,$3,$4,$5::jsonb)) value",[owner,id(2),id(3),kind,JSON.stringify(payload)])).rows[0].value;
    let row = (await action("generate",{packageId:id(20),requestId:id(40),acceptedCost:true,configuration,configurationHash:packageDigest("sceenyk-final-config",configuration),profile:plan.profile}))!;
    row = (await pg.query<{value:FinalExecution}>("select to_jsonb(public.ugc_final_claim($1)) value",[id(30)])).rows[0].value;
    const checkpoint = async (op:string,payload:unknown={}) => {
      const v = (await pg.query<{value:{execution:FinalExecution;operation:Operation}|null}>("select public.ugc_final_checkpoint($1,$2,$3,$4::jsonb) value",[row.id,row.claim_token,op,JSON.stringify(payload)])).rows[0].value;
      ok(v); row=v!.execution; return v!;
    };
    const asset = (n:number,audio=false,durationMs=5000):FinalAsset => ({key:`ugc/${id(1)}/${id(2)}/${id(3)}/final-video-v1/${row.id}/${id(n)}.mp4`,sha256:n.toString(16).padStart(64,"0"),etag:`etag-${n}`,sizeBytes:100,mimeType:"video/mp4",durationMs,width:720,height:1280,hasAudio:audio,sampleRate:audio?48000:0,channels:audio?1:0});
    const ready = async (key:string,kind:Operation["kind"],data:Record<string,unknown>,output:FinalAsset|null,sceneId?:string) => {
      const op=(await checkpoint("intent",{key,kind,input:data,sceneId,fingerprint:packageDigest("fixture",{key,data}),provider:kind==="composition"?"ffmpeg":configuration.providers[kind].id,model:kind==="composition"?"h264-aac-720p25-transitions-v2":configuration.providers[kind].model})).operation;
      await checkpoint("output",{operationId:op.id,asset:output});return op;
    };
    const sceneAssets:FinalAsset[]=[];
    for(const [i,scene] of doc.scenes.entries()) {
      const videoAsset=asset(50+i),video=await ready(`video:${scene.id}`,"video",{scene},videoAsset,scene.id);
      const voices:string[]=[],hashes:string[]=[];let syncId:string|null=null;
      if(scene.speech.length) {
        const binding=(await checkpoint("intent",{key:"voice:binding",kind:"binding",input:{profileId:plan.profile!.id},fingerprint:packageDigest("binding",{}),provider:configuration.providers.binding.id,model:configuration.providers.binding.model})).operation;
        const receipt={result:{bindingRef:"fixture-voice"}};
        await checkpoint("receipt",{operationId:binding.id,receipt});await checkpoint("output",{operationId:binding.id,asset:null});await checkpoint("profile",{binding:receipt});
        const line=scene.speech[0],a={...asset(60,true,1500),mimeType:"audio/mpeg" as const,width:0,height:0};
        const voice=await ready(`voice:${scene.id}:0`,"voice",{text:line.text,delivery:line.delivery,startMs:line.startMs,endMs:line.endMs,segmentIndex:0,profileId:plan.profile!.id},a,scene.id);
        voices.push(voice.id);hashes.push(a.sha256);
        const guide=await ready(`guide:${scene.id}`,"composition",{hashes,windows:[[line.startMs-scene.startMs,line.endMs-line.startMs]]},{...asset(61,true),mimeType:"audio/mpeg",width:0,height:0},scene.id);
        const sync=await ready(`sync:${scene.id}`,"lip_sync",{videoHash:videoAsset.sha256,audioGuideHash:guide.output?.sha256??asset(61).sha256,profileId:plan.profile!.id},asset(62),scene.id);syncId=sync.id;
      }
      const output=asset(70+i,!!voices.length);
      await ready(`scene:${scene.id}`,"composition",{videoHash:videoAsset.sha256,syncId,audioHashes:hashes,durationMs:scene.durationMs},output,scene.id);
      await checkpoint("scene",{sceneId:scene.id,asset:output,manifest:{videoOperation:video.id,voiceOperations:voices,syncOperation:syncId,profileId:plan.profile!.id}});sceneAssets.push(output);
    }
    const fingerprint=packageDigest("sceenyk-final-composition",{packageHash:row.package_hash,packageVersion:row.package_version,sceneHashes:sceneAssets.map(a=>a.sha256),configurationHash:row.configuration_hash,revision:row.revision});
    const final=asset(80,true,10000);
    await ready("final:1","composition",{fingerprint,sceneHashes:sceneAssets.map(a=>a.sha256)},final);
    await checkpoint("review",{asset:final,fingerprint});
    for(const name of fs.readdirSync("supabase/migrations").filter(n=>n.endsWith(".sql")&&n>"20261028007000_ugc_execution_contract_v1.sql").sort()) await pg.exec(fs.readFileSync(`supabase/migrations/${name}`,"utf8"));
    await pg.exec(migration); // rerunnable
    // Preserve the synthetic upstream resolver while exercising the full approval transaction.
    await pg.exec(`create or replace function public.ugc_package_input(p_job uuid) returns jsonb language sql stable security definer set search_path='' as $$
      select value from pg_temp.fixture_input where not (fail_after_complete and exists(select 1 from public.ugc_generation_jobs where id=p_job and status='completed')) $$;`);
    const read = async () => (await pg.query<{value:FinalExecution}>("select to_jsonb(e) value from public.ugc_final_executions e where id=$1",[row.id])).rows[0].value;
    const job = async () => (await pg.query<UgcJobRow>("select * from public.ugc_generation_jobs where id=$1",[id(3)])).rows[0];
    const proof=()=>({executionId:row.id,version:row.version,verifiedAsset:row.final_asset,verifiedFingerprint:row.final_fingerprint});
    const original=await read(), media=JSON.stringify(original.final_asset), paid=original.paid_requests;
    const unchanged=async()=>{equal(await read(),original);equal((await job()).completed_at,null);equal((await job()).status,"queued");};
    equal(await action("approve",proof(),id(99)),null);await unchanged();
    equal(await action("approve",{...proof(),version:row.version-1}),null);await unchanged();
    equal(await action("approve",{...proof(),verifiedAsset:{...final,sha256:"f".repeat(64)}}),null);await unchanged();
    const scene=(await pg.query<{manifest:Record<string,unknown>}>("select manifest from public.ugc_final_scenes where execution_id=$1 and scene_id='scene-2'",[row.id])).rows[0];
    await pg.query("update public.ugc_final_scenes set manifest=manifest||'{\"voiceOperations\":[]}' where execution_id=$1 and scene_id='scene-2'",[row.id]);
    equal(await action("approve",proof()),null);await unchanged();
    equal((await pg.query<{error_code:string}>("select error_code from public.ugc_final_approval_attempts order by id desc limit 1")).rows[0].error_code,"FINAL_VIDEO_VALIDATION_FAILED");
    await pg.query("update public.ugc_final_scenes set manifest=$2::jsonb where execution_id=$1 and scene_id='scene-2'",[row.id,JSON.stringify(scene.manifest)]);
    await pg.exec("update fixture_input set value=jsonb_set(value,'{source,scene,projectTitle}','\"Changed\"')");
    equal(await action("approve",proof()),null);await unchanged();
    await pg.query("update fixture_input set value=$1::jsonb,fail_after_complete=true",[JSON.stringify(input)]);
    // Reproduce the original post-completion currentness failure: both writes roll back.
    equal(await action("approve",proof()),null);await unchanged();
    equal((await pg.query<{error_code:string}>("select error_code from public.ugc_final_approval_attempts order by id desc limit 1")).rows[0].error_code,"FINAL_APPROVAL_VALIDATION_FAILED");
    await pg.exec("update fixture_input set fail_after_complete=false");
    row=(await action("approve",proof()))!;equal(row.state,"approved");ok(row.approved_at);equal((await job()).status,"completed");ok((await job()).completed_at);
    equal(JSON.stringify(row.final_asset),media);equal(row.paid_requests,paid);equal((await action("approve",proof()))?.version,row.version);
    const progress=buildUgcProgress(await job());
    const review={id:row.id,state:row.state,phase:row.phase,current:true,label:"Complete",heartbeatAt:null,leaseExpiresAt:null} as FinalReview;
    const value={available:true,enabled:true,eligible:true,authorization:null,review};
    equal(withFinalVideoProgress(progress,value).message,"Complete");
    const stale=withFinalVideoProgress(progress,{...value,review:{...review,current:false}});
    equal(stale.status,"awaiting_confirmation");equal(stale.completedAt,null);equal(stale.steps.find(s=>s.id==="complete")?.state,"waiting");
    equal((await pg.query("select has_table_privilege('service_role','public.ugc_final_approval_attempts','UPDATE') writable,has_function_privilege('authenticated','public.ugc_final_record_approval_failure(uuid,uuid,integer,text)','EXECUTE') browser")).rows[0],{writable:false,browser:false});
    // Exercise the exact privileged repair transaction with synthetic identities.
    const completed=(await pg.query<{value:UgcJobRow}>("select to_jsonb(j) value from public.ugc_generation_jobs j where id=$1",[id(3)])).rows[0].value;
    const repair=fs.readFileSync("scripts/repair-m10-final-review.sql","utf8")
      .replaceAll("62e93717-9e00-486e-b968-a85f272b831d",row.id)
      .replaceAll("1fe9e8ab-88a6-4700-ac70-e1175d36ba17",row.package_id)
      .replaceAll("d58ec93b8c77f8fce63c5f40d20c53975b4dfc1f7b30c70c7e31e7697ededde7",row.package_hash)
      .replaceAll("c70bee36f62802f49a33f8b237cd6cbe35579a6d87419c1c922495f3e65d382e",row.final_asset!.sha256)
      .replace("e.package_version<>2",`e.package_version<>${row.package_version}`)
      .replace("e.paid_requests<>12",`e.paid_requests<>${paid}`)
      .replace("e.version<>727",`e.version<>${row.version}`)
      .replace("2026-10-29T05:01:20.094078+00:00",row.approved_at!)
      .replace("2026-10-29T05:01:20.097943+00:00",String(completed.completed_at));
    await pg.exec(repair);
    const reopened=await read();equal(reopened.state,"review");equal(reopened.approved_at,null);equal((await job()).completed_at,null);
    equal((await job()).status,"awaiting_confirmation");equal(reopened.final_asset,row.final_asset);equal(reopened.final_fingerprint,row.final_fingerprint);
    equal(reopened.package_hash,row.package_hash);equal(reopened.paid_requests,paid);
    await pg.exec(repair);equal(await read(),reopened);
    equal((await pg.query<{n:number}>("select count(*)::int n from public.ugc_final_approval_attempts where outcome='reopened'")).rows[0].n,1);
    equal((await pg.query<{n:number}>("select count(*)::int n from pg_trigger where tgname in ('ugc_final_guard','ugc_jobs_identity') and tgenabled='O'")).rows[0].n,2);
    await assert.rejects(pg.exec("update public.ugc_final_approval_attempts set diagnostic='{}'"),/immutable|append|cannot/i);checks++;
  } finally {await pg.close();}
  console.info(`Final approval offline checks passed: ${checks}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
