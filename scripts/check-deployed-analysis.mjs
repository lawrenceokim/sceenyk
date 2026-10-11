// Explicit real deployed acceptance. Reserved Clerk development identities and
// synthetic media only. Never print keys, tickets, raw errors or private URLs.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createClerkClient } from "@clerk/backend";
import { Inngest } from "inngest";
import { typescriptLoader } from "./lib/load-typescript.mjs";
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const origin="https://sceenyk.vercel.app";
const file=path.join(os.tmpdir(),"sceenyk-gemini-deployed.json");
let state;try{state=JSON.parse(fs.readFileSync(file,"utf8"));}catch{state={checks:[],createdAt:new Date().toISOString()};}
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
const check=(name,value)=>{assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));};
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(15000)})}});
const identity=which=>JSON.parse(fs.readFileSync(path.join(os.tmpdir(),which==="A"?"sceenyk-hosted-identity-fixture.json":"sceenyk-hosted-identity-fixture-2.json"),"utf8"));
async function clerkRead(action){for(let n=1;n<=3;n++){try{return await action();}catch(error){console.log(JSON.stringify({clerkRetry:n,status:error.status??null,code:error.errors?.[0]?.code??null}));if(n===3)throw new Error("CLERK_UNAVAILABLE");await delay(1000);}}}
async function cloud(route){for(let n=1;n<=3;n++){try{const r=await fetch("https://api.inngest.com"+route,{headers:{Authorization:"Bearer "+process.env.INNGEST_SIGNING_KEY},signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,"Cloud API read succeeds");return (await r.json()).data;}catch{if(n===3)throw new Error("CLOUD_READ_UNAVAILABLE");await delay(500);}}}
async function row(table,id){const r=await db.from(table).select("*").eq(table==="generation_jobs"?"id":"job_id",id).maybeSingle();assert.ok(!r.error,table+" read succeeds");return r.data;}
function signature(){const t=String(Math.floor(Date.now()/1000));const s=createHmac("sha256",process.env.INNGEST_SIGNING_KEY.replace(/^signkey-\w+-/,"")).update(t).digest("hex");return `t=${t}&s=${s}`;}
async function preflight(){
  const unsigned=await fetch(origin+"/api/inngest",{signal:AbortSignal.timeout(20000)});check("deployed workflow introspection rejects unsigned access",unsigned.status===401);await unsigned.body?.cancel();
  const signed=await fetch(origin+"/api/inngest",{headers:{"x-inngest-signature":signature()},signal:AbortSignal.timeout(20000)});const info=await signed.json();
  check("deployed endpoint authenticates in Cloud mode",signed.status===200&&info.authentication_succeeded&&info.mode==="cloud");
  check("deployed endpoint retains two registered functions and matching event key",info.function_count===2&&info.event_key_hash===createHash("sha256").update(process.env.INNGEST_EVENT_KEY).digest("hex"));
  const account=await db.from("generation_accounts").select("free_total,free_reserved,free_consumed,credit_available,credit_reserved").eq("owner_user_id",identity("A").rowId).single();assert.ok(!account.error);
  state.baselineAccount??=account.data;save();console.log(JSON.stringify({account:account.data,checks:state.checks.length}));
}
async function browser(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sceenyk-gemini-cloud-browser-"));state.artifacts=dir;save();
  const chrome=spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=9343","--user-data-dir="+path.join(dir,"profile"),"about:blank"],{windowsHide:true,stdio:"ignore"});
  let ws;const errors=[];
  try{
    const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,publishableKey:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});assert.equal((await clerkRead(()=>clerk.instance.get())).environmentType,"development");
    let tabs;for(let n=0;n<60;n++){try{tabs=await(await fetch("http://127.0.0.1:9343/json")).json();break;}catch{await delay(100);}}
    ws=new WebSocket(tabs.find(t=>t.type==="page").webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let sequence=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(new Error("CDP_FAILED"));else p.resolve(m.result);}else if(m.method==="Runtime.exceptionThrown")errors.push("BROWSER_EXCEPTION");};
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error("BROWSER_EVALUATION_FAILED");return r.result.value;};
    const wait=async expression=>{for(let n=0;n<450;n++){try{if(await evaluate(expression))return;}catch{}await delay(100);}throw new Error("BROWSER_CONDITION_TIMEOUT");};
    const navigate=async route=>{await call("Page.navigate",{url:origin+route});await wait("document.readyState!=='loading'&&location.pathname==="+JSON.stringify(route));};
    await call("Page.enable");await call("Runtime.enable");
    const signIn=async which=>{await navigate("/");await wait("!!window.Clerk?.loaded");if(await evaluate("!!window.Clerk.user")){await evaluate("window.Clerk.signOut()");await navigate("/");await wait("!!window.Clerk?.loaded");}const who=identity(which);assert.ok((await clerkRead(()=>clerk.users.getUser(who.clerkUserId))).emailAddresses.some(e=>e.emailAddress.includes("+clerk_test@")));const ticket=await clerkRead(()=>clerk.signInTokens.createSignInToken({userId:who.clerkUserId,expiresInSeconds:60}));await evaluate(`(async()=>{const r=await window.Clerk.client.signIn.create({strategy:'ticket',ticket:${JSON.stringify(ticket.token)}});await window.Clerk.setActive({session:r.createdSessionId});})()`);await wait("window.Clerk.user?.id==="+JSON.stringify(who.clerkUserId));await delay(1500);};
    const discover=async()=>{const urls=await evaluate("Array.from(document.scripts).map(s=>s.src).filter(s=>s.startsWith(location.origin+'/_next/'))");const actions={};for(const url of urls){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const body=await r.text();for(const match of body.matchAll(/"([a-f0-9]{40,42})"[^;]{0,220}?"([a-zA-Z]+Action)"/g))actions[match[2]]=match[1];}state.actions={...state.actions,...actions};save();};
    const invoke=async(name,input)=>{assert.ok(state.actions?.[name],"deployed reference exists: "+name);return evaluate(`(async()=>{const r=await fetch(location.pathname,{method:'POST',headers:{'Next-Action':${JSON.stringify(state.actions[name])},Accept:'text/x-component','Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify([${JSON.stringify(input)}])});const body=await r.text();for(const line of body.split(String.fromCharCode(10))){try{const v=JSON.parse(line.slice(line.indexOf(':')+1));if(v?.ok!==undefined)return v;}catch{}}return {ok:false,status:r.status};})()`);};
    const click=async text=>{await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`);await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled).click()`);};
    await signIn("A");await navigate("/create");await wait("!!document.querySelector('textarea')");await discover();
    // Mode-specific work is added below; credentials never enter artifacts.
    return await browserWork({call,evaluate,wait,navigate,signIn,invoke,click,discover,dir,errors});
  }finally{if(ws?.readyState===1){ws.send(JSON.stringify({id:999999,method:"Browser.close"}));ws.close();}chrome.kill();}
}
async function account(){const r=await db.from("generation_accounts").select("free_total,free_reserved,free_consumed,credit_available,credit_reserved").eq("owner_user_id",identity("A").rowId).single();assert.ok(!r.error);return r.data;}
async function proof(kind){
  const s=state[kind];assert.ok(s?.jobId);
  const job=await row("generation_jobs",s.jobId);assert.ok(job.worker_run_id);
  let run;for(let n=0;n<30;n++){run=await cloud("/v2/runs/"+job.worker_run_id+"?includeOutput=true");if(run.status==="COMPLETED")break;await delay(1000);}
  const output=typeof run.output==="string"?JSON.parse(run.output):run.output;
  check("actual "+kind+" Cloud run maps to authoritative worker",run.id===job.worker_run_id&&run.status==="COMPLETED"&&output.claim==="claimed");
  const eventId=run.trigger.eventIds[0],event=await cloud("/v1/events/"+eventId);
  check("Cloud "+kind+" event carries only authoritative job identity",event.name==="sceenyk/generation.requested"&&event.data.generationJobId===s.jobId&&Object.keys(event.data).length===1);
  const trace=await cloud("/v2/runs/"+run.id+"/trace?includeOutput=true");
  const spans=[];function visit(span){if(!span)return;spans.push({name:span.name,status:span.status,startedAt:span.startedAt,endedAt:span.endedAt,stepOp:span.stepOp});for(const child of span.children??[])visit(child);}visit(trace.rootSpan);
  check("Cloud "+kind+" trace executes authoritative claim and analysis stage",spans.some(x=>x.name==="claim-authoritative-job"&&x.status==="COMPLETED")&&spans.some(x=>x.name==="start-media-analysis"&&x.status==="COMPLETED"));
  check("Cloud "+kind+" outputs contain no secrets/private media URLs",!(/X-Amz-|r2\.cloudflarestorage|generativelanguage|GEMINI_API_KEY|fileUri|storage_key|inputTokens|schemaVersion/.test(JSON.stringify({output,trace,eventData:event.data}))));
  const reservation=await row("generation_reservations",s.jobId);
  if(kind==="failure"){
    check("real Cloud unsupported input fails safely at analyzing",job.status==="failed"&&job.current_stage==="analyzing"&&job.error_code==="PROCESSING_FAILED"&&output.handoff==="analysis_failed"&&output.reason==="UNSUPPORTED_MEDIA"&&!job.completed_at);
    check("Cloud terminal failure releases exactly the original reservation",reservation.state==="released"&&JSON.stringify(await account())===JSON.stringify(state.baselineAccount));
    const again=await db.rpc("fail_generation_claim",{p_job_id:s.jobId,p_run_id:job.worker_run_id});check("repeated terminal settlement cannot restore twice",!again.error&&again.data===false&&JSON.stringify(await account())===JSON.stringify(state.baselineAccount));
    check("unsupported media creates no paid provider attempt",(await db.from("generation_analysis_attempts").select("id",{count:"exact"}).eq("job_id",s.jobId)).count===0);
  }else{
    const plan=await row("generation_plans",s.jobId);const attempts=await db.from("generation_analysis_attempts").select("*").eq("job_id",s.jobId).order("attempt");assert.ok(!attempts.error);
    const successful=attempts.data.find(a=>a.state==="succeeded");assert.ok(successful?.usage);
    const validate=typescriptLoader()("lib/ai/plan.ts").validateProductionPlan;
    check("deployed Gemini plan validates against actual admitted media/settings",!!validate(plan.plan,job.input_snapshot,successful.usage.media.map(m=>({id:m.assetId,mimeType:m.mimeType,sizeBytes:m.sizeBytes,durationSeconds:m.durationSeconds}))));
    check("real Cloud Gemini reaches persisted plan-ready state",output.handoff==="production_plan_ready"&&job.status==="processing"&&job.current_stage==="planning"&&!!job.production_plan_ready_at&&plan.provider==="gemini"&&plan.schema_version===1&&!!plan.created_at&&!job.completed_at);
    check("deployed Gemini has actual response/model and server-only usage",!!successful.response_id&&plan.model===successful.model&&successful.usage.totalTokens>0&&successful.usage.media.length===2&&successful.usage.estimatedCost===null);
    check("successful planning retains reservation without consumption",reservation.state==="reserved"&&(await account()).free_consumed===state.baselineAccount.free_consumed&&(await account()).free_reserved===state.baselineAccount.free_reserved+1);
    check("observed deployed analysis and planning transitions",s.observations.some(x=>x.phase==="processing/analyzing")&&s.observations.some(x=>x.phase==="processing/planning")&&s.observations.some(x=>x.phase==="processing/planning/ready"));
    check("plan becomes ready after actual browser closure",Date.parse(job.production_plan_ready_at)>Date.parse(s.browserClosedAt));
    s.usage=successful.usage;s.model=plan.model;s.attemptIds=attempts.data.map(a=>a.id);s.planCreatedAt=plan.created_at;s.planDigest=createHash("sha256").update(JSON.stringify(plan.plan)).digest("hex");
    // Prove the actual verified object is readable only through authorized access.
    const assets=await db.from("project_assets").select("id,storage_key,verified_etag,mime_type,size_bytes").in("id",job.input_snapshot.assetIds).eq("owner_user_id",job.owner_user_id).eq("project_id",job.project_id);assert.ok(!assets.error);
    const storage=typescriptLoader()("lib/storage/r2.ts");
    for(const asset of assets.data){const signed=await storage.signR2Read(asset.storage_key,asset.verified_etag,asset.mime_type);const authorized=await fetch(signed.url,{signal:AbortSignal.timeout(15000)});assert.equal(authorized.status,200);await authorized.body?.cancel();const plain=new URL(signed.url);plain.search="";const unsigned=await fetch(plain,{signal:AbortSignal.timeout(15000)});check("real "+asset.mime_type+" object denies unsigned access",[400,401,403].includes(unsigned.status));await unsigned.body?.cancel();}
  }
  s.runId=run.id;s.eventId=eventId;s.output=output;s.spans=spans;s.verifiedAt=new Date().toISOString();save();console.log(JSON.stringify({kind,job:s.jobId,run:s.runId,event:s.eventId,output,model:s.model,usage:s.usage}));
}
async function duplicate(){
  const s=state.success;assert.ok(s?.verifiedAt);
  const client=new Inngest({id:"sceenyk",isDev:false,eventKey:process.env.INNGEST_EVENT_KEY});
  if(!s.duplicateEvent){const sent=await client.send({id:s.jobId+":acceptance-duplicate-"+randomUUID(),name:"sceenyk/generation.requested",data:{generationJobId:s.jobId}});s.duplicateEvent=sent.ids[0];save();}
  let done;for(let n=0;n<40;n++){const runs=await cloud("/v2/events/"+s.duplicateEvent+"/runs?includeOutput=true");for(const candidate of (runs??[]).filter(r=>r.status==="COMPLETED")){const details=await cloud("/v2/runs/"+candidate.id+"?includeOutput=true");const output=typeof details.output==="string"?JSON.parse(details.output):details.output;if(output?.claim==="duplicate"){done=details;break;}}if(done)break;await delay(1000);}
  check("real duplicate Cloud delivery exits without provider work",!!done);
  const attempts=await db.from("generation_analysis_attempts").select("id").eq("job_id",s.jobId);assert.ok(!attempts.error);
  const plan=await row("generation_plans",s.jobId),job=await row("generation_jobs",s.jobId);
  check("duplicate/retry leaves original immutable plan and provider attempts unchanged",attempts.data.length===s.attemptIds.length&&attempts.data.every(a=>s.attemptIds.includes(a.id))&&createHash("sha256").update(JSON.stringify(plan.plan)).digest("hex")===s.planDigest&&job.worker_run_id===s.runId&&plan.created_at===s.planCreatedAt);
  const trace=await cloud("/v2/runs/"+done.id+"/trace?includeOutput=true");check("duplicate trace contains no Gemini attempt",!JSON.stringify(trace).includes("gemini-plan-attempt"));
  s.duplicateRun=done.id;save();console.log(JSON.stringify({duplicateRun:done.id,providerAttempts:attempts.data.length}));
}
async function failureDuplicate(){
  const s=state.failure;assert.ok(s?.verifiedAt);const before=await account();
  const client=new Inngest({id:"sceenyk",isDev:false,eventKey:process.env.INNGEST_EVENT_KEY});
  if(!s.duplicateEvent){const sent=await client.send({id:s.jobId+":terminal-acceptance-"+randomUUID(),name:"sceenyk/generation.requested",data:{generationJobId:s.jobId}});s.duplicateEvent=sent.ids[0];save();}
  let done;for(let n=0;n<40;n++){const runs=await cloud("/v2/events/"+s.duplicateEvent+"/runs?includeOutput=true");for(const candidate of (runs??[]).filter(r=>r.status==="COMPLETED")){const run=await cloud("/v2/runs/"+candidate.id+"?includeOutput=true");const output=typeof run.output==="string"?JSON.parse(run.output):run.output;if(output?.claim==="terminal"){done=run;break;}}if(done)break;await delay(1000);}
  check("real terminal duplicate Cloud delivery exits without another settlement",!!done&&JSON.stringify(await account())===JSON.stringify(before));
  const reservation=await row("generation_reservations",s.jobId);check("terminal duplicate preserves original released reservation",reservation.state==="released");
  s.duplicateRun=done.id;save();console.log(JSON.stringify({terminalDuplicateRun:done.id}));
}
async function secrets(){
  const secretValues=["GEMINI_API_KEY","CLERK_SECRET_KEY","SUPABASE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","INNGEST_EVENT_KEY","INNGEST_SIGNING_KEY","INNGEST_SIGNING_KEY_FALLBACK"].map(n=>process.env[n]).filter(Boolean);
  const scripts=new Set(state.privateClientScripts??[]);let leaks=0,markers=0;
  for(const route of ["/","/create"]){const r=await fetch(origin+route,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const body=await r.text();if(secretValues.some(s=>body.includes(s)))leaks++;for(const m of body.matchAll(/\/_next\/static\/[^\s"'\\<>]+\.js/g))scripts.add(m[0]);}
  for(const script of scripts){const r=await fetch(origin+script,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const body=await r.text();if(secretValues.some(s=>body.includes(s)))leaks++;if(/GEMINI_API_KEY|generativelanguage\.googleapis|begin_generation_analysis|finish_generation_analysis|INNGEST_SIGNING_KEY|SUPABASE_SECRET_KEY|X-Amz-Signature|r2\.cloudflarestorage/.test(body))markers++;}
  state.secretScan={htmlPages:2,clientFiles:scripts.size,configuredSecrets:secretValues.length,leaks,serverOrPrivateUrlMarkers:markers};save();check("deployed public HTML/client assets expose no configured secrets/provider/storage URLs",scripts.size>0&&leaks===0&&markers===0);console.log(JSON.stringify(state.secretScan));
}
async function inspect(){
  const s=state.success;const job=await row("generation_jobs",s.jobId);const attempts=await db.from("generation_analysis_attempts").select("attempt,state,failure_code,model,requested_model,usage,started_at,finished_at").eq("job_id",s.jobId).order("attempt");assert.ok(!attempts.error);
  const run=await cloud("/v2/runs/"+job.worker_run_id+"?includeOutput=true");
  console.log(JSON.stringify({job:job.id,status:job.status,stage:job.current_stage,ready:!!job.production_plan_ready_at,attempts:attempts.data,runStatus:run.status,output:run.output,account:await account()}));
}
async function retrySuccess(){
  const previous=state.success;assert.ok(previous?.jobId);
  const job=await row("generation_jobs",previous.jobId);assert.equal(job.status,"failed");
  const attempts=await db.from("generation_analysis_attempts").select("attempt,state,failure_code,started_at,finished_at").eq("job_id",previous.jobId);assert.ok(!attempts.error&&attempts.data.length);
  assert.ok(attempts.data.every(a=>["RATE_LIMIT","PROVIDER_UNAVAILABLE","INVALID_OUTPUT"].includes(a.failure_code)),"Only known recoverable provider outcomes permit fresh acceptance");
  assert.ok(Date.now()-Date.parse(attempts.data.at(-1).finished_at)>60000,"Wait for provider cooldown before another admission");
  assert.ok((state.failedSupportedRuns??[]).length<1,"Fresh acceptance retry is bounded");
  const reservation=await row("generation_reservations",previous.jobId);assert.equal(reservation.state,"released");
  check("real provider-limited job restores its reservation before fresh acceptance",JSON.stringify(await account())===JSON.stringify(state.baselineAccount));
  const run=await cloud("/v2/runs/"+job.worker_run_id+"?includeOutput=true");
  state.failedSupportedRuns=[{...previous,runId:job.worker_run_id,output:run.output,attempts:attempts.data}];
  state.success={projectId:previous.projectId,assets:previous.assets,requestId:randomUUID(),observations:[]};save();
  await browser();
}
async function browserWork({call,evaluate,wait,navigate,signIn,invoke,click,discover,dir,errors}){
  const mode=process.argv[2];
  if(mode==="private-assets"){
    const values=["GEMINI_API_KEY","CLERK_SECRET_KEY","SUPABASE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","INNGEST_EVENT_KEY","INNGEST_SIGNING_KEY"].map(n=>process.env[n]).filter(Boolean);
    let leaks=0;const resources=new Set();
    for(const route of ["/projects/"+state.success.projectId,"/dashboard"]){await navigate(route);await wait(route.startsWith("/projects")?"document.body.innerText.includes('Production plan ready')":"document.body.innerText.includes('Your projects')");const html=await evaluate("document.documentElement.outerHTML");if(values.some(v=>html.includes(v))||/X-Amz-Signature|generativelanguage\.googleapis|r2\.cloudflarestorage|GEMINI_API_KEY/.test(html))leaks++;const urls=await evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.startsWith(location.origin+'/_next/static/')&&n.endsWith('.js'))");for(const url of urls)resources.add(new URL(url).pathname);}
    check("deployed authenticated project/dashboard HTML exposes no configured secrets/private URLs",leaks===0);
    state.privateClientScripts=[...resources];check("authenticated route client resources retained for deployed secret scan",state.privateClientScripts.length>0);save();return;
  }
  if(mode==="failure"||mode==="success"){
    const kind=mode;let saved=state[kind];
    if(saved?.jobId){const existing=await row("generation_jobs",saved.jobId);check(kind==="success"?"supported Cloud acceptance actually ends plan-ready":"controlled Cloud failure is terminal",kind==="success"?!!existing.production_plan_ready_at:existing.status==="failed");console.log(JSON.stringify({existingJob:saved.jobId,kind}));return;}
    const project=saved?.projectId??randomUUID();
    const prompt="Understand the visible synthetic cyan square and its motion. Plan a ten-second story, clearly distinguishing actual source observations from imagined scenes.";
    const settings={duration:"10",aspectRatio:"16:9",visualStyle:"Original",tone:"Storytelling"};
    if(!saved){
      const draft=await invoke("saveProjectAction",{id:project,mode:"create",title:"Gemini Cloud "+kind+" acceptance",category:"storytelling",prompt,settings});check("deployed "+kind+" project saves with verified ownership",draft.ok);
      saved=state[kind]={projectId:project,assets:[],requestId:randomUUID(),observations:[]};save();
    }
    const source=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),"sceenyk-analysis-media-fixture.json"),"utf8"));
    const inputs=kind==="failure"?[{name:"synthetic-unsupported.gif",mime:"image/gif",bytes:Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==","base64")}]:[{name:"synthetic-square.png",mime:"image/png",bytes:fs.readFileSync(path.join(source.artifacts,"synthetic-square.png"))},{name:"synthetic-square.webm",mime:"video/webm",bytes:fs.readFileSync(path.join(source.artifacts,"synthetic-square.webm"))}];
    for(const input of inputs){
      if(saved.assets.some(a=>a.name===input.name))continue;
      const upload=await invoke("authorizeMediaAction",{projectId:project,requestId:randomUUID(),filename:input.name,mimeType:input.mime,sizeBytes:input.bytes.length,kind:input.mime.split("/")[0]});check("deployed owned upload authorization "+kind+" "+input.mime,upload.ok&&!!upload.value.upload);
      const transferred=await fetch(upload.value.upload.url,{method:"PUT",headers:upload.value.upload.headers,body:input.bytes,signal:AbortSignal.timeout(30000)});assert.equal(transferred.status,200,"Synthetic R2 upload succeeds");await transferred.body?.cancel();
      const finalized=await invoke("finalizeMediaAction",{projectId:project,assetId:upload.value.asset.id});check("deployed server verifies private "+kind+" "+input.mime,finalized.ok&&finalized.value.status==="uploaded");
      saved.assets.push({id:finalized.value.id,name:input.name,mime:input.mime});save();
    }
    const request={projectId:project,requestId:saved.requestId,inputs:{prompt,category:"storytelling",settings,assetIds:saved.assets.map(a=>a.id)}};
    const quoted=await invoke("quoteGenerationAction",request);check("deployed "+kind+" quote is free and server issued",quoted.ok&&quoted.value.eligibleFreeGeneration&&quoted.value.status==="ready");saved.quoteId=quoted.value.id;save();
    let finished=false;
    const monitor=(async()=>{for(let n=0;n<750&&!finished;n++){
      const r=await db.from("generation_jobs").select("id,status,current_stage,production_plan_ready_at,worker_run_id").eq("project_id",project).eq("request_id",saved.requestId).maybeSingle();
      if(r.data){const phase=r.data.status+"/"+r.data.current_stage+(r.data.production_plan_ready_at?"/ready":"");if(!saved.observations.some(x=>x.phase===phase)){saved.observations.push({phase,at:new Date().toISOString()});save();console.log(JSON.stringify({kind,phase}));}if(r.data.status==="failed"||r.data.production_plan_ready_at){saved.jobId=r.data.id;finished=true;save();break;}}
      await delay(400);
    }})();
    const confirmed=await invoke("createGenerationAction",{quoteId:saved.quoteId});check("deployed "+kind+" quote confirmation creates accounted request",confirmed.ok&&!!confirmed.value.id);saved.jobId=confirmed.value.id;save();
    await call("Browser.close");saved.browserClosedAt=new Date().toISOString();save();await monitor;
    check("Cloud "+kind+" finishes while browser is closed",finished);
    if(kind==="success")check("supported Cloud acceptance actually ends plan-ready",!!(await row("generation_jobs",saved.jobId)).production_plan_ready_at);
    return;
  }
  if(mode==="verify"){
    const s=state.success;assert.ok(s?.jobId);
    await navigate("/projects/"+s.projectId);await wait("document.body.innerText.includes('Production plan ready')");
    check("deployed owner reopens actual persisted plan-ready state",await evaluate("document.body.innerText.includes("+JSON.stringify(s.jobId)+")"));
    await click("Check generation status");await wait("!document.body.innerText.includes('Checking status…')");check("deployed explicit status refresh retains readiness",await evaluate("document.body.innerText.includes('Production plan ready')"));
    await call("Page.reload",{ignoreCache:true});await wait("document.body.innerText.includes('Production plan ready')");check("deployed full reload restores saved plan",true);
    await navigate("/dashboard");await wait("document.body.innerText.includes('Your projects')");await navigate("/projects/"+s.projectId);await wait("document.body.innerText.includes('Production plan ready')");check("deployed leave and reopen restores readiness",true);
    const retried=await invoke("createGenerationAction",{quoteId:s.quoteId});check("deployed confirmation retry returns original job",retried.ok&&retried.value.id===s.jobId);
    const dto=await invoke("latestGenerationAction",s.projectId);check("owned readiness DTO excludes usage/provider/plan/storage secrets",dto.ok&&dto.value.id===s.jobId&&!!dto.value.productionPlanReadyAt&&!/estimatedCost|inputTokens|responseId|storage_key|fileUri|schemaVersion|googleapis|X-Amz-/i.test(JSON.stringify(dto)));
    for(const width of [1440,390,320]){await call("Emulation.setDeviceMetricsOverride",{width,height:960,deviceScaleFactor:1,mobile:width<768});for(const dark of [false,true]){await evaluate("document.documentElement.classList.toggle('dark',"+dark+")");await delay(150);check("deployed ready state fits "+width+" "+(dark?"dark":"light"),await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));if(width===320){await evaluate("document.querySelector('section[aria-label=\"Project generation\"]').scrollIntoView({block:'start',behavior:'instant'})");await delay(150);const shot=await call("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(dir,"ready-320-"+(dark?"dark":"light")+".png"),Buffer.from(shot.data,"base64"));}}}
    await signIn("B");await navigate("/create");await wait("!!document.querySelector('textarea')");await discover();
    const denied=await invoke("latestGenerationAction",s.projectId);check("deployed second account cannot read owned generation",denied.ok&&denied.value===null);
    const media=await invoke("listMediaAction",s.projectId);check("deployed second account cannot list owned private media",!media.ok&&media.code==="NOT_FOUND");
    await navigate("/projects/"+s.projectId);await wait("document.body.innerText.includes('Project unavailable')");check("deployed foreign project exposes no ready plan or job",await evaluate("!document.body.innerText.includes('Production plan ready')&&!document.body.innerText.includes("+JSON.stringify(s.jobId)+")"));
    check("deployed browser has no uncaught exceptions",errors.length===0);state.browserVerifiedAt=new Date().toISOString();save();return;
  }
  throw new Error("UNKNOWN_BROWSER_MODE");
}
try{
  const mode=process.argv[2]??"preflight";
  if(mode==="preflight")await preflight();else if(["failure","success","verify","private-assets"].includes(mode))await browser();else if(mode==="failure-proof")await proof("failure");else if(mode==="success-proof")await proof("success");else if(mode==="duplicate")await duplicate();else if(mode==="failure-duplicate")await failureDuplicate();else if(mode==="secrets")await secrets();else if(mode==="inspect")await inspect();else if(mode==="retry-success"){process.argv[2]="success";await retrySuccess();}else throw new Error("UNKNOWN_MODE");
}catch(error){console.log(JSON.stringify({failed:true,name:error.name,code:error.code??error.message?.replace(/[^A-Z_]/g,"").slice(0,80)??"ACCEPTANCE_FAILED",missingProperty:error.message?.match(/Cannot read properties of (?:undefined|null) \(reading '([a-zA-Z]+)'\)/)?.[1],harnessFrames:error.stack?.split("\n").filter(s=>s.includes("check-deployed-analysis.mjs:")).map(s=>s.match(/check-deployed-analysis\.mjs:\d+:\d+/)?.[0])}));process.exitCode=1;}
