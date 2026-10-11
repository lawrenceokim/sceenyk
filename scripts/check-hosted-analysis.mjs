// Explicit real-provider acceptance: reserved Clerk test account, existing
// synthetic media, hosted SQL/services and official Inngest execution engine.
// Cloud delivery is intentionally separate from this local-source verification.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";
import { createClerkClient } from "@clerk/backend";
import { InngestTestEngine } from "@inngest/test";
import { typescriptLoader } from "./lib/load-typescript.mjs";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const fixture=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),"sceenyk-analysis-media-fixture.json"),"utf8"));
const identity=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),"sceenyk-hosted-identity-fixture.json"),"utf8"));
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,publishableKey:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});
assert.equal((await clerk.instance.get()).environmentType,"development");
assert.ok((await clerk.users.getUser(identity.clerkUserId)).emailAddresses.some(e=>e.emailAddress.includes("+clerk_test@")));
let providerCalls=0;
const load=typescriptLoader({}, {fetch:(url,init)=>{if(String(url).includes(":generateContent"))providerCalls++;return fetch(url,init);}});
const {createDatabaseClient}=load("lib/db/server.ts"),db=createDatabaseClient();
async function rpc(name,args){const r=await db.rpc(name,args);assert.ok(!r.error, name+" succeeds");return r.data;}
const owner=(await db.from("app_users").select("id").eq("clerk_user_id",identity.clerkUserId).single()).data;
assert.ok(owner);
assert.ok((await db.from("projects").select("id").eq("id",fixture.projectId).eq("owner_user_id",owner.id).single()).data);
const artifact=path.join(os.tmpdir(),"sceenyk-hosted-analysis.json");
let saved;try{saved=JSON.parse(fs.readFileSync(artifact,"utf8"));}catch{}
let job=saved?.projectId===fixture.projectId?saved.jobId:null;
const runId=saved?.runId??"analysis-acceptance-"+randomUUID();
const checks=[];const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
if(!job){
  const input={version:1,prompt:"Describe the actually visible synthetic cyan square and its motion. Plan a ten-second story combining the uploaded image and video, clearly separating observed footage from imagined scenes.",category:"storytelling",settings:{duration:"10",aspectRatio:"16:9",visualStyle:"Original",tone:"Storytelling"},assetIds:fixture.assets.map(a=>a.id).sort()};
  const cost=load("lib/pricing/config.ts").quoteGenerationCost(input);
  const quote=await rpc("issue_generation_quote",{p_owner_user_id:owner.id,p_project_id:fixture.projectId,p_request_id:randomUUID(),p_snapshot:input,p_credit_cost:cost.requiredCredits,p_pricing_version:cost.pricingVersion,p_pricing_mode:cost.pricingMode});
  assert.equal(quote.code,"QUOTED");assert.equal(quote.quote.eligible_free,true);
  const accepted=await rpc("confirm_generation_quote",{p_owner_user_id:owner.id,p_quote_id:quote.quote.id,p_current_pricing_version:cost.pricingVersion});
  assert.equal(accepted.code,"ACCEPTED");job=accepted.job_id;
  // Claim before the deployed preparation-only cron can dispatch this fixture.
  assert.equal(await rpc("claim_generation_job",{p_job_id:job,p_run_id:runId}),"claimed");
  fs.writeFileSync(artifact,JSON.stringify({projectId:fixture.projectId,jobId:job,runId},null,2));
}
const {generationWorkflow}=load("lib/workflows/generation.ts");
const execute=()=>new InngestTestEngine({function:generationWorkflow,events:[{name:"sceenyk/generation.requested",data:{generationJobId:job}}],steps:[{id:"analysis-retry-backoff",handler:()=>delay(10000)}],transformCtx:ctx=>({...ctx,runId})}).execute();
const result=await execute();
check("real workflow reaches production plan ready",result.result?.handoff==="production_plan_ready");
const stored=(await createDatabaseClient().from("generation_plans").select("*").eq("job_id",job).single()).data;
const generation=(await createDatabaseClient().from("generation_jobs").select("*").eq("id",job).single()).data;
const attempts=(await db.from("generation_analysis_attempts").select("state,usage,model").eq("job_id",job)).data;
const reservation=(await db.from("generation_reservations").select("state").eq("job_id",job).single()).data;
const {validateProductionPlan}=load("lib/ai/plan.ts");
const usage=attempts.find(a=>a.state==="succeeded")?.usage;
check("new database client reads immutable validated plan",!!validateProductionPlan(stored.plan,generation.input_snapshot,usage.media.map(m=>({id:m.assetId,mimeType:m.mimeType,sizeBytes:m.sizeBytes,durationSeconds:m.durationSeconds}))));
check("real image and video source summaries retained",stored.plan.sourceMediaSummary.length===2);
check("job remains processing/planning with ready timestamp",generation.status==="processing"&&generation.current_stage==="planning"&&!!generation.production_plan_ready_at);
check("existing reservation remains held",reservation.state==="reserved");
check("provider metadata persisted server-side",stored.provider==="gemini"&&stored.schema_version===1&&stored.model&&usage.totalTokens>0&&usage.estimatedCost===null);
const before=providerCalls;
check("same-run duplicate reuses plan",(await execute()).result?.handoff==="production_plan_ready"&&providerCalls===before);
check("another run cannot claim",await rpc("claim_generation_job",{p_job_id:job,p_run_id:randomUUID()})==="duplicate");
check("ready job cannot be failed/restored",await rpc("fail_generation_claim",{p_job_id:job,p_run_id:runId})===false);
const report={passed:checks.length,checks,projectId:fixture.projectId,jobId:job,runId,model:stored.model,providerCalls,usage,scope:"real hosted SQL/private R2/Gemini; official engine instead of Cloud transport"};
fs.writeFileSync(artifact,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
