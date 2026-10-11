// Actual SQL/services/workflow, isolated PostgreSQL. Gemini/R2/auth are fixtures.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { Inngest } from "inngest";
import { InngestTestEngine } from "@inngest/test";
import { typescriptLoader } from "./lib/load-typescript.mjs";

const pg = new PGlite(), checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const one = async (sql, args=[]) => (await pg.query(sql,args)).rows[0];
const scalar = async (sql, args=[]) => (await one(sql,args))?.value;
let queue = Promise.resolve(), calls = 0, mode = "success", loseSave = false;
function serialize(fn) { const result=queue.then(fn); queue=result.catch(()=>{}); return result; }
const db = {
  rpc(name,args={}) { return serialize(async()=>{
    await pg.exec("set role service_role");
    try {
      const keys=Object.keys(args);
      const data=await scalar(`select ${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(",")}) as value`,Object.values(args));
      if(loseSave && name==="finish_generation_analysis") { loseSave=false; return {data:null,error:{code:"LOST"}}; }
      return {data,error:null};
    } catch(error) { return {data:null,error:{code:error.code}}; }
    finally { await pg.exec("reset role"); }
  }); },
  from(table) {
    const filters=[],args=[]; let fields="*";
    return {select(value){fields=value;return this;},eq(k,v){args.push(v);filters.push(`${k}=$${args.length}`);return this;},in(k,v){args.push(v);filters.push(`${k}=any($${args.length})`);return this;},
      then(resolve,reject){return this.execute(false).then(resolve,reject);},maybeSingle(){return this.execute(true);},
      execute(single){return serialize(async()=>{const rows=(await pg.query(`select ${fields} from ${table} where ${filters.join(" and ")}`,args)).rows;return {data:single?rows[0]??null:rows,error:null};});}};
  },
};
const snapshot={version:1,prompt:"Create a ten-second cinematic sunrise story",category:"cinematic",settings:{duration:"10",aspectRatio:"16:9",visualStyle:"Original",tone:"Storytelling"},assetIds:[]};
function planFor(input) {return {schemaVersion:1,summary:"Sunrise",contentIntent:"Tell a short story",sourceMediaSummary:input.assetIds.map(assetId=>({assetId,summary:"Test media",durationSeconds:2})),targetDuration:10,aspectRatio:input.settings.aspectRatio,tone:input.settings.tone,visualStyle:input.settings.visualStyle,narrationRequired:false,scenePlan:[{order:1,durationSeconds:10,purpose:"Opening",source:"generated",assetId:null,startTime:null,endTime:null,description:"A sunrise",transformationInstruction:null,narration:null,caption:null,transition:"Cut"}],audioNotes:[],editingNotes:["Match requested aspect ratio"]};}
const usage={inputTokens:100,outputTokens:80,totalTokens:180,thinkingTokens:null,cachedTokens:null,inputDetails:[],outputDetails:[],media:[],estimatedCost:null};
const load=typescriptLoader({
  "@/lib/db/server":{createDatabaseClient:()=>db},
  "@/lib/storage/r2":{readR2AnalysisMedia:async()=>{throw new Error("R2 fixture not read by mocked provider");}},
  "./config":{getAnalysisConfiguration:()=>({model:"gemini-fixture",maximumMediaCount:8,maximumMediaBytes:104857600})},
  "./providers/gemini":{supportsAnalysisMedia:m=>m!=="image/bmp",async understandAndPlan({input,onMediaReady}){calls++;await onMediaReady?.();if(mode==="outage")throw new (load("lib/ai/types.ts").AnalysisError)("PROVIDER_UNAVAILABLE");return {plan:mode==="malformed"?null:planFor(input),usage,model:"gemini-fixture",responseId:"safe-fixture-id",failure:mode==="malformed"?"INVALID_OUTPUT":null};}},
  "@/lib/workflows/client":{inngest:new Inngest({id:"analysis-test",isDev:true})},
});
async function fixture(input=snapshot){
  const owner=await scalar("insert into app_users(clerk_user_id) values($1) returning id as value",[randomUUID()]);
  const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Analysis fixture','cinematic','16:9','10','Original','Storytelling') returning id as value",[owner]);
  const q=await scalar("select issue_generation_quote($1,$2,$3,$4,null,'fixture','unconfigured') as value",[owner,project,randomUUID(),input]);
  const j=await scalar("select confirm_generation_quote($1,$2,'fixture') as value",[owner,q.quote.id]);
  assert.equal(j.code,"ACCEPTED");return {owner,project,job:j.job_id};
}
async function deny(name,sql,args=[],role="service_role") {await pg.exec("set role "+role);let failed=false;try{await pg.query(sql,args);}catch{failed=true;}finally{await pg.exec("reset role");}check(name,failed);}
const job=id=>one("select * from generation_jobs where id=$1",[id]);
const account=owner=>one("select * from generation_accounts where owner_user_id=$1",[owner]);
try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  for(const file of fs.readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort())await pg.exec(fs.readFileSync("supabase/migrations/"+file,"utf8"));
  check("all eight migrations apply",true);
  const {validateProductionPlan}=load("lib/ai/plan.ts"), valid=planFor(snapshot);
  check("valid text plan accepted",validateProductionPlan(valid,snapshot,[]).schemaVersion===1);
  for(const change of [{targetDuration:15},{aspectRatio:"1:1"},{narrationRequired:true},{schemaVersion:2},{extra:"injected"},{scenePlan:[]},{sourceMediaSummary:[{assetId:randomUUID(),summary:"Unknown",durationSeconds:2}]}]){
    let failed=false;try{validateProductionPlan({...valid,...change},snapshot,[]);}catch{failed=true;}check("invalid plan rejected: "+Object.keys(change)[0],failed);
  }
  const assetId=randomUUID(), withMedia={...snapshot,assetIds:[assetId]}, video=planFor(withMedia);
  video.scenePlan[0]={...video.scenePlan[0],source:"transformed",assetId,startTime:0,endTime:2,transformationInstruction:"Cartoon"};
  check("video transformations and bounded source ranges validate",validateProductionPlan(video,withMedia,[{id:assetId,mimeType:"video/mp4",sizeBytes:10,durationSeconds:2}]).scenePlan[0].source==="transformed");
  for(const change of [{assetId:randomUUID()},{endTime:3},{transformationInstruction:null},{source:"generated"},{order:2},{durationSeconds:5}]){
    let failed=false;try{validateProductionPlan({...video,scenePlan:[{...video.scenePlan[0],...change}]},withMedia,[{id:assetId,mimeType:"video/mp4",sizeBytes:10,durationSeconds:2}]);}catch{failed=true;}check("invalid scene rejected: "+Object.keys(change)[0],failed);
  }
  const service=load("lib/ai/server.ts");
  const a=await fixture();await db.rpc("claim_generation_job",{p_job_id:a.job,p_run_id:"a"});await service.advanceAnalysis(a.job,"a","analyzing");
  check("wrong worker cannot advance",!(await db.rpc("advance_generation_analysis",{p_job_id:a.job,p_run_id:"wrong",p_stage:"planning"})).data);
  const result=await service.runAnalysisAttempt(a.job,"a",1);
  check("real service persists validated plan and readiness",result.ready&&!!(await job(a.job)).production_plan_ready_at);
  check("plan ready remains processing/planning",(await job(a.job)).status==="processing"&&(await job(a.job)).current_stage==="planning");
  check("plan holds original reservation without consuming or charging twice",(await account(a.owner)).free_reserved===1&&(await account(a.owner)).free_consumed===0);
  check("usage persisted server-side",(await one("select usage from generation_analysis_attempts where job_id=$1",[a.job])).usage.totalTokens===180);
  const before=calls;check("duplicate execution reuses persisted plan",(await service.runAnalysisAttempt(a.job,"a",1)).ready&&calls===before);
  check("another worker cannot claim",(await db.rpc("claim_generation_job",{p_job_id:a.job,p_run_id:"other"})).data==="duplicate");
  check("ready plan is not failed by stage closure",!(await db.rpc("fail_generation_claim",{p_job_id:a.job,p_run_id:"a"})).data);
  await pg.exec("alter table generation_jobs disable trigger generation_jobs_dispatch_guard");await pg.query("update generation_jobs set worker_started_at=now()-interval '20 minutes' where id=$1",[a.job]);await pg.exec("alter table generation_jobs enable trigger generation_jobs_dispatch_guard");
  check("ready plans survive stale claim recovery",(await db.rpc("expire_generation_claims")).data===0);
  check("reopen reads original immutable persisted plan",(await one("select plan from generation_plans where job_id=$1",[a.job])).plan.summary===valid.summary);
  await deny("service cannot overwrite plans","update generation_plans set model='fake' where job_id=$1",[a.job]);
  await deny("even privileged plan history is immutable","delete from generation_plans where job_id=$1",[a.job],"postgres");
  await deny("browser cannot read private plan","select * from generation_plans",[],"authenticated");
  await deny("browser cannot submit fake plan","select finish_generation_analysis($1,'a',$2,null,null,null,null,null)",[a.job,randomUUID()],"anon");
  await deny("service cannot directly set plan ready","update generation_jobs set production_plan_ready_at=now() where id=$1",[a.job]);
  await deny("browser cannot access provider usage","select * from generation_analysis_attempts",[],"authenticated");
  await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'owned.mp4','video/mp4',10,'video','uploaded','fixture-etag')",[assetId,a.owner,a.project,randomUUID(),`users/${a.owner}/projects/${a.project}/${assetId}/${randomUUID()}`]);
  const b=await fixture(), invalidAssets={...snapshot,assetIds:[assetId]};
  check("B cannot quote A's actual verified media",(await scalar("select issue_generation_quote($1,$2,$3,$4,null,'fixture','unconfigured') as value",[b.owner,b.project,randomUUID(),invalidAssets])).code==="INVALID_ASSETS");
  const {generationWorkflow}=load("lib/workflows/generation.ts");
  const engine=(f,run)=>new InngestTestEngine({function:generationWorkflow,events:[{name:"sceenyk/generation.requested",data:{generationJobId:f.job}}],steps:[{id:"analysis-retry-backoff",handler:()=>null}],transformCtx:ctx=>({...ctx,runId:run})});
  const success=await engine(b,"success").execute();
  check("official workflow test engine reaches plan ready",success.result?.handoff==="production_plan_ready");
  mode="malformed";const bad=await fixture(), beforeBad=calls;
  const failed=await engine(bad,"bad").execute();
  check("malformed output retries exactly once then fails safely",failed.result?.handoff==="analysis_failed"&&calls-beforeBad===2&&(await job(bad.job)).status==="failed");
  check("malformed output never persists a plan",!await one("select * from generation_plans where job_id=$1",[bad.job]));
  check("terminal analysis failure restores allowance once",(await account(bad.owner)).free_reserved===0&&(await account(bad.owner)).free_consumed===0&&!(await db.rpc("fail_generation_claim",{p_job_id:bad.job,p_run_id:"bad"})).data);
  check("invalid-response usage retained for both paid attempts",await scalar("select count(*)::int as value from generation_analysis_attempts where job_id=$1 and usage is not null",[bad.job])===2);
  mode="outage";const outage=await fixture();await engine(outage,"outage").execute();check("provider outage reaches terminal restored state",(await job(outage.job)).status==="failed"&&(await account(outage.owner)).free_reserved===0);
  mode="success";const lost=await fixture();await db.rpc("claim_generation_job",{p_job_id:lost.job,p_run_id:"lost"});await service.advanceAnalysis(lost.job,"lost","analyzing");loseSave=true;
  await assert.rejects(service.runAnalysisAttempt(lost.job,"lost",1));const savedCalls=calls;
  check("lost persistence response recovers without another provider call",(await service.runAnalysisAttempt(lost.job,"lost",1)).ready&&calls===savedCalls);
  const uncertain=await fixture();await db.rpc("claim_generation_job",{p_job_id:uncertain.job,p_run_id:"uncertain"});await service.advanceAnalysis(uncertain.job,"uncertain","analyzing");await db.rpc("begin_generation_analysis",{p_job_id:uncertain.job,p_run_id:"uncertain",p_attempt:1,p_model:"fixture"});const uncertainCalls=calls;
  await assert.rejects(service.runAnalysisAttempt(uncertain.job,"uncertain",1),/ANALYSIS_ATTEMPT_PENDING/);
  check("concurrent in-flight attempt waits without paid replay",calls===uncertainCalls);
  await pg.exec("alter table generation_analysis_attempts disable trigger generation_analysis_attempt_guard");await pg.query("update generation_analysis_attempts set started_at=now()-interval '6 minutes' where job_id=$1",[uncertain.job]);await pg.exec("alter table generation_analysis_attempts enable trigger generation_analysis_attempt_guard");
  check("uncertain provider attempt never repeats a paid request",(await service.runAnalysisAttempt(uncertain.job,"uncertain",1)).failure==="UNCERTAIN_ATTEMPT"&&calls===uncertainCalls);
  check("attempt slots bounded",(await db.rpc("begin_generation_analysis",{p_job_id:uncertain.job,p_run_id:"uncertain",p_attempt:3,p_model:"fixture"})).data.code==="INVALID");
  const waiting=await fixture();await db.rpc("claim_generation_job",{p_job_id:waiting.job,p_run_id:"waiting"});await service.advanceAnalysis(waiting.job,"waiting","analyzing");
  await pg.exec("alter table generation_jobs disable trigger generation_jobs_dispatch_guard");await pg.query("update generation_jobs set worker_started_at=now()-interval '20 minutes' where id=$1",[waiting.job]);await pg.exec("alter table generation_jobs enable trigger generation_jobs_dispatch_guard");
  check("stale unfinished AI claims fail and restore held allowance",(await db.rpc("expire_generation_claims")).data===1&&(await job(waiting.job)).status==="failed"&&(await account(waiting.owner)).free_reserved===0);
  check("stale expiry never releases twice",(await db.rpc("expire_generation_claims")).data===0);
  console.log(JSON.stringify({passed:checks.length,checks,externalServices:"fixtures; no real provider calls"},null,2));
} finally {await pg.close();}
