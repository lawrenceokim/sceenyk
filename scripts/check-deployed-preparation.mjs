import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const load=typescriptLoader(), db=load('lib/db/server.ts').createDatabaseClient();
const origin='https://sceenyk.vercel.app',worker=new URL(process.argv.find(a=>a.startsWith('--worker-url='))?.slice(13)??process.env.MEDIA_WORKER_URL).origin;
assert.equal(new URL(worker).protocol,'https:','DEPLOYED_WORKER_HTTPS_REQUIRED');
const runName=process.argv.find(a=>a.startsWith('--run='))?.slice(6);
assert.ok(runName===undefined||/^[a-z0-9-]{1,60}$/.test(runName),'SAFE_ACCEPTANCE_RUN_NAME_REQUIRED');
const artifact=path.join(os.tmpdir(),'sceenyk-render-cloud-acceptance'+(runName?'-'+runName:'')+'.json');
let state;try{state=JSON.parse(fs.readFileSync(artifact,'utf8'));}catch{state={checks:[],findings:[],createdAt:new Date().toISOString()};}
const save=()=>fs.writeFileSync(artifact,JSON.stringify(state,null,2));
const check=(name,value)=>{assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));};
const sign=(body,timestamp,nonce)=>createHmac('sha256',process.env.WORKER_SHARED_SECRET).update(`POST\n/prepare\n${timestamp}\n${nonce}\n`).update(body).digest('hex');
async function request(body,options={}){const timestamp=options.timestamp??String(Date.now()),nonce=options.nonce??randomUUID();const r=await fetch(worker+'/prepare',{method:'POST',redirect:'error',signal:AbortSignal.timeout(240000),headers:{'Content-Type':'application/json',...(options.unsigned?{}:{'x-worker-timestamp':timestamp,'x-worker-nonce':nonce,'x-worker-signature':options.signature??sign(body,timestamp,nonce)}),...options.headers},body});return {status:r.status,body:await r.json()};}
async function cloud(route){for(let n=0;n<3;n++){try{const r=await fetch('https://api.inngest.com'+route,{headers:{Authorization:'Bearer '+process.env.INNGEST_SIGNING_KEY},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'CLOUD_READ_SUCCEEDS');return (await r.json()).data;}catch(error){if(n===2)throw error;console.log(JSON.stringify({cloudReadRetry:n+1}));await new Promise(r=>setTimeout(r,1000));}}}
async function preflight(){
 let healthy=false;const started=Date.now();
 for(let n=0;n<8;n++){try{const h=await fetch(worker+'/health',{signal:AbortSignal.timeout(30000)});healthy=h.status===200&&JSON.stringify(await h.json())==='{"ok":true}';}catch{}if(healthy)break;console.log(JSON.stringify({workerWarmupAttempt:n+1,elapsedSeconds:Math.round((Date.now()-started)/1000)}));await new Promise(r=>setTimeout(r,2000));}
 check('Render health responds with liveness only',healthy);state.warmupSeconds=Math.round((Date.now()-started)/1000);save();
 const t=String(Math.floor(Date.now()/1000)),s=createHmac('sha256',process.env.INNGEST_SIGNING_KEY.replace(/^signkey-\w+-/,'')).update(t).digest('hex');
 const r=await fetch(origin+'/api/inngest',{headers:{'x-inngest-signature':`t=${t}&s=${s}`},signal:AbortSignal.timeout(30000)});const info=await r.json();check('Vercel authenticates Inngest in Cloud mode with three workflows and the failure handler',r.status===200&&info.authentication_succeeded&&info.mode==='cloud'&&info.function_count===4&&info.event_key_hash===createHash('sha256').update(process.env.INNGEST_EVENT_KEY).digest('hex'));
 const old=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-preparation-acceptance.json'),'utf8'));
 const body=JSON.stringify({generationJobId:old.jobId,sceneExecutionId:old.segmentSceneId});
 check('deployed Render rejects unsigned processing',(await request(body,{unsigned:true})).status===401);
 check('deployed Render rejects invalid signature',(await request(body,{signature:'0'.repeat(64)})).status===401);
 check('deployed Render rejects expired signed request',(await request(body,{timestamp:String(Date.now()-360000)})).status===401);
 const timestamp=String(Date.now()),nonce=randomUUID(),signature=sign(body,timestamp,nonce);
 check('deployed Render rejects modified exact body',(await request(body+' ',{timestamp,nonce,signature})).status===401);
 check('deployed Render rejects modified nonce',(await request(body,{timestamp,nonce:randomUUID(),signature})).status===401);
 check('deployed Render rejects browser-origin signed request',(await request(body,{headers:{Origin:origin}})).status===401);
 const accepted=await request(body,{timestamp,nonce,signature});state.existingSignedRequest={jobId:old.jobId,sceneId:old.segmentSceneId,status:accepted.status,body:accepted.body};check('valid HMAC reaches owned persisted preparation on Render',accepted.status===200&&accepted.body.ready===true);
 const replay=await request(body,{timestamp,nonce,signature});state.freshReplay={status:replay.status,code:replay.body.code,verifiedAt:new Date().toISOString()};save();
 check('deployed Render rejects immediate exact replay',replay.status===409&&replay.body.code==='REPLAY_DETECTED');
 await new Promise(r=>setTimeout(r,1000));
 const later=await request(body,{timestamp,nonce,signature});check('deployed Render rejects later exact replay',later.status===409&&later.body.code==='REPLAY_DETECTED');
 const concurrent={timestamp:String(Date.now()),nonce:randomUUID()};concurrent.signature=sign(body,concurrent.timestamp,concurrent.nonce);
 const duplicates=await Promise.all([request(body,concurrent),request(body,concurrent)]);
 check('deployed concurrent exact requests have only one acceptance',duplicates.filter(r=>r.status===200&&r.body.ready===true).length===1&&duplicates.filter(r=>r.status===409&&r.body.code==='REPLAY_DETECTED').length===1);
 check('newly signed retry reuses persisted preparation',(await request(body)).status===200);
 state.replayProtectionVerifiedAt=new Date().toISOString();save();
 state.workerOrigin=worker;state.preflightAt=new Date().toISOString();save();
}


async function launch(){
 assert.ok(process.argv.includes('--real'),'REAL_ACCEPTANCE_OPT_IN_REQUIRED');
 assert.ok(state.checks.includes('Render health responds with liveness only'),'WORKER_PREFLIGHT_REQUIRED');
 assert.equal(state.workerOrigin,worker,'PREFLIGHT_ORIGIN_MUST_MATCH');
 if(state.jobId){console.log(JSON.stringify({existingJob:state.jobId}));return;}
 const old=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-preparation-acceptance.json'),'utf8'));
 const other=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-hosted-identity-fixture-2.json'),'utf8'));
 if(!state.ownerClerkId&&process.argv.includes('--fresh-owner')){
  assert.ok(runName,'SEPARATE_ARTIFACT_REQUIRED_FOR_FRESH_OWNER');
  const {createClerkClient}=await import('@clerk/backend');
  const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,publishableKey:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});
  assert.equal((await clerk.instance.get()).environmentType,'development');
  const user=await clerk.users.createUser({username:'sceenykcloud'+randomUUID().replaceAll('-','').slice(0,16),emailAddress:[`sceenyk-cloud-${randomUUID()}+clerk_test@example.com`],password:randomUUID()+'Aa1!',firstName:'Cloud',lastName:'Acceptance'});
  state.ownerClerkId=user.id;save();
 }
 state.ownerClerkId??=old.clerkUserId;state.secondClerkId=other.clerkUserId;state.projectId??=randomUUID();state.requestId??=randomUUID();state.uploadRequestId??=randomUUID();state.observations??=[];save();
 const {deployedBrowser}=await import('./lib/deployed-browser.mjs');
 const prompt='Exactly TWO shots totaling 10 seconds, both using the supplied 12-second video. Shot 1: source transformed, durationSeconds 5, startTime 2, endTime 7, supplied video assetId. Apply a polished 2D cartoon style while preserving movement, camera and framing. Source contains important HUD/UI text; retain source overlay provenance for later composition. Shot 2: source original, durationSeconds 5, startTime 2, endTime 7, SAME supplied video assetId, reuse this exact segment unchanged. No generated shots, no narration, no other assets. Keep descriptions and transformation instructions below 800 characters.';
 const settings={duration:'10',aspectRatio:'16:9',visualStyle:'Original',tone:'Storytelling'};
 await deployedBrowser(origin,{A:state.ownerClerkId,B:state.secondClerkId},async({signIn,navigate,wait,discover,invoke,close,errors})=>{
  await signIn('A');await navigate('/studio');await wait("!!document.querySelector('textarea')");await discover();
  if(!state.projectSaved){const saved=await invoke('saveProjectAction',{id:state.projectId,mode:'create',title:'Render Cloud source preparation acceptance',category:'cinematic',prompt,settings});check('actual Vercel saves the owned acceptance project',saved.ok);state.projectSaved=true;save();}
  if(!state.assetId){
   const original=await db.from('project_assets').select('*').eq('id',old.asset.id).single();assert.ok(!original.error&&original.data);
   const stream=await load('lib/storage/r2.ts').readR2AnalysisMedia(original.data.storage_key,original.data.verified_etag,original.data.size_bytes,AbortSignal.timeout(30000));
   const bytes=Buffer.from(await new Response(stream).arrayBuffer());assert.equal(bytes.length,original.data.size_bytes);
   const authorized=await invoke('authorizeMediaAction',{projectId:state.projectId,requestId:state.uploadRequestId,filename:'synthetic-cloud-12-second-source.mp4',mimeType:'video/mp4',sizeBytes:bytes.length,kind:'video'});
   check('Vercel authorizes a new private owned source',authorized.ok);
   if(authorized.value.upload){const sent=await fetch(authorized.value.upload.url,{method:'PUT',headers:authorized.value.upload.headers,body:bytes,signal:AbortSignal.timeout(60000)});assert.ok([200,412].includes(sent.status),'PRIVATE_R2_SOURCE_PUT');await sent.body?.cancel();}
   const finalized=await invoke('finalizeMediaAction',{projectId:state.projectId,assetId:authorized.value.asset.id});check('Vercel verifies the new private source bytes',finalized.ok&&finalized.value.status==='uploaded');state.assetId=finalized.value.id;state.sourceDigest=createHash('sha256').update(bytes).digest('hex');save();
  }
  const quoted=await invoke('quoteGenerationAction',{projectId:state.projectId,requestId:state.requestId,inputs:{prompt,category:'cinematic',settings,assetIds:[state.assetId]}});
  check('Vercel issues the real server-authoritative free quote',quoted.ok&&quoted.value.eligibleFreeGeneration&&quoted.value.status==='ready');state.quoteId=quoted.value.id;save();
  const confirmed=await invoke('createGenerationAction',{quoteId:state.quoteId});check('Vercel confirms and dispatches one accounted generation',confirmed.ok&&!!confirmed.value.id);state.jobId=confirmed.value.id;state.admittedAt=new Date().toISOString();save();
  check('admission browser has no uncaught exceptions',errors.length===0);
  await close();state.browserClosedAt=new Date().toISOString();save();console.log(JSON.stringify({browserClosedAt:state.browserClosedAt,jobId:state.jobId}));
 });
}
async function one(table,id,column='id'){const r=await db.from(table).select('*').eq(column,id).single();assert.ok(!r.error&&r.data,'AUTHORITATIVE_ROW_'+table);return r.data;}
async function monitor(){
 const{setTimeout:delay}=await import('node:timers/promises');assert.ok(state.jobId,'ACCEPTANCE_JOB_REQUIRED');
 for(let n=0;n<450;n++){
  const j=await one('generation_jobs',state.jobId),phase=j.status+'/'+j.current_stage+(j.visuals_ready_at?'/visuals_ready':j.visuals_pending_at?'/pending':'');
  if(!state.observations.some(o=>o.phase===phase)){state.observations.push({phase,at:new Date().toISOString()});save();console.log(JSON.stringify({phase,jobId:j.id}));}
  const observed=await db.from('scene_executions').select('id,status,provider_task_id,submission_attempts,error_code').eq('job_id',state.jobId).eq('provider','fal');assert.ok(!observed.error,'SCENE_OBSERVATION_SUCCEEDS');
  state.providerObservations??=[];
  for(const scene of observed.data){const signature=JSON.stringify(scene);if(!state.providerObservations.some(o=>o.signature===signature)){state.providerObservations.push({at:new Date().toISOString(),signature,...scene});save();console.log(JSON.stringify({providerObservation:scene}));}}
  if(j.visuals_ready_at){state.visualsReadyAt=j.visuals_ready_at;state.analysisRunId=j.worker_run_id;state.visualRunId=j.visual_run_id;save();check('real Cloud reaches visual readiness after browser closure',Date.parse(j.visuals_ready_at)>Date.parse(state.browserClosedAt));return;}
  if(j.status==='failed'||j.visuals_pending_at){state.incompleteJob={status:j.status,stage:j.current_stage,errorCode:j.error_code,analysisRunId:j.worker_run_id,visualRunId:j.visual_run_id};save();console.log(JSON.stringify({incomplete:state.incompleteJob}));throw new Error('CLOUD_ACCEPTANCE_NOT_READY');}
  await delay(2000);
 }
 throw new Error('CLOUD_ACCEPTANCE_MONITOR_TIMEOUT');
}
async function proof(){
 const j=await one('generation_jobs',state.jobId),p=await one('generation_plans',state.jobId,'job_id'),reservation=await one('generation_reservations',state.jobId,'job_id');
 const ready=!!j.visuals_ready_at;assert.ok(ready||process.argv.includes('--allow-pending')&&j.visuals_pending_at,'VISUALS_READY_REQUIRED');
 const scenes=await db.from('scene_executions').select('*').eq('job_id',state.jobId).order('scene_order');assert.ok(!scenes.error&&scenes.data.length===2);
 const transformed=scenes.data.find(s=>s.operation==='video_to_video'),reuse=scenes.data.find(s=>s.operation==='reuse');assert.ok(transformed&&reuse,'EXPECTED_TRANSFORM_AND_REUSE');
 const segment=await one('prepared_segments',transformed.prepared_asset_id);
 check('one completed Render preparation shared by transformation and reuse',segment.status==='completed'&&segment.attempts===1&&reuse.prepared_asset_id===segment.id);
 check('Render measured twelve-second source and extracted exact five-second range',segment.source_duration_ms===12000&&segment.start_ms===2000&&segment.end_ms===7000&&segment.requested_duration_ms===5000&&Math.abs(segment.duration_ms-5000)<=43);
 check('prepared normalization persists expected geometry and fps',segment.width===640&&segment.height===360&&Number(segment.fps)===24&&segment.source_rotation===0);
 check('actual Render preparation and Cloud stage continue after browser closure',Date.parse(segment.completed_at)>Date.parse(state.browserClosedAt)&&Date.parse(j.visuals_ready_at??j.visuals_pending_at)>Date.parse(state.browserClosedAt));
 if(ready)check('real fal completes exactly one paid transformation with private output',transformed.provider==='fal'&&transformed.status==='completed'&&transformed.submission_attempts===1&&!!transformed.provider_task_id&&!!transformed.output_asset_id&&reuse.status==='completed'&&!reuse.provider_task_id);
 else{check('actual fal submission rejection is safely persisted without an invented task or output',transformed.status==='failed'&&transformed.error_code==='PROVIDER_REJECTED'&&transformed.submission_attempts===1&&!transformed.provider_task_id&&!transformed.output_asset_id&&reuse.status==='completed');if(!state.findings.includes('FAL_SUBMISSION_REJECTED'))state.findings.push('FAL_SUBMISSION_REJECTED');save();}
 check('Cloud readiness keeps the original hold and never final-completes',j.status==='processing'&&j.current_stage==='generating'&&!j.completed_at&&reservation.state==='reserved');
 if(ready){
  const account=await one('generation_accounts',j.owner_user_id,'owner_user_id');
  const receipts=await db.from('generation_result_receipts').select('job_id').eq('job_id',j.id);assert.ok(!receipts.error);
  const assets=await db.from('scene_assets').select('id,scene_execution_id,job_id,owner_user_id,project_id').eq('job_id',j.id);assert.ok(!assets.error);
  check('visual readiness has one private intermediate and no final-result receipt',assets.data.length===1&&assets.data[0].id===transformed.output_asset_id&&assets.data[0].scene_execution_id===transformed.id&&assets.data[0].owner_user_id===j.owner_user_id&&assets.data[0].project_id===j.project_id&&receipts.data.length===0);
  check('fresh acceptance account holds one free reservation without consumption',account.free_total===2&&account.free_reserved===1&&account.free_consumed===0&&account.credit_reserved===0&&reservation.kind==='free'&&reservation.amount===1&&!reservation.settled_at);
  const observed=(state.providerObservations??[]).filter(s=>s.provider_task_id);
  check('live observations retain one persisted fal task and one submission attempt',observed.length>=2&&observed.every(s=>s.provider_task_id===transformed.provider_task_id&&s.submission_attempts===1)&&observed.some(s=>['submitted','processing'].includes(s.status))&&observed.some(s=>s.status==='completed'));
 }
 const expected=p.plan.scenePlan;check('actual immutable Gemini plan selected the owned 2-7 second range',expected.length===2&&expected.every(s=>s.assetId===state.assetId&&s.startTime===2&&s.endTime===7&&s.durationSeconds===5));
 for(const [kind,runId,eventName]of[['analysis',j.worker_run_id,'sceenyk/generation.requested'],['visual',j.visual_run_id,'sceenyk/generation.visuals.requested']]){
  let run;for(let n=0;n<30;n++){run=await cloud('/v2/runs/'+runId+'?includeOutput=true');if(run.status==='COMPLETED')break;await new Promise(r=>setTimeout(r,1000));}const output=typeof run.output==='string'?JSON.parse(run.output):run.output;
  check('actual '+kind+' Cloud run maps to the persisted claim',run.id===runId&&run.status==='COMPLETED'&&output.claim==='claimed');
  const eventId=run.trigger.eventIds[0],event=await cloud('/v1/events/'+eventId);
  check('actual '+kind+' Cloud event carries only the stable job identity',event.name===eventName&&event.data.generationJobId===j.id&&Object.keys(event.data).length===1);
  const trace=await cloud('/v2/runs/'+runId+'/trace?includeOutput=true'),spans=[];const visit=s=>{if(!s)return;spans.push({name:s.name,status:s.status,startedAt:s.startedAt,endedAt:s.endedAt});for(const c of s.children??[])visit(c);};visit(trace.rootSpan);
  const privileged=['WORKER_SHARED_SECRET','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','GEMINI_API_KEY','FAL_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY'].map(n=>process.env[n]).filter(Boolean),savedCloud=JSON.stringify({trace,output});
  check('checked '+kind+' Cloud trace and step output expose no configured secrets or signed capabilities',!privileged.some(value=>savedCloud.includes(value))&&!/X-Amz-Signature|X-Amz-Credential|r2\.cloudflarestorage/.test(savedCloud));
  if(kind==='visual')check('real durable Cloud steps prepare source before fal submission',spans.some(s=>s.name==='prepare-source-1'&&s.status==='COMPLETED')&&spans.some(s=>s.name==='submit-scene-1'&&s.status==='COMPLETED'));
  // Cloud can expose overlapping trace entries for one named durable step.
  // Persisted task/attempt observations, not trace-entry count, establish reuse.
  if(kind==='visual'&&ready)check('Inngest resumes the same persisted provider task across durable polling',spans.filter(s=>/^scene-1-poll-\d+$/.test(s.name)&&s.status==='COMPLETED').length>=2&&(state.providerObservations??[]).filter(s=>s.provider_task_id).every(s=>s.provider_task_id===transformed.provider_task_id&&s.submission_attempts===1));
  state[kind+'Proof']={runId,eventId,output,spans};save();
 }
 state.segmentId=segment.id;state.segmentSceneId=transformed.id;state.retrySceneId=ready?transformed.id:reuse.id;state.providerRequestId=transformed.provider_task_id;
 state.snapshot={scenesDigest:createHash('sha256').update(JSON.stringify(scenes.data)).digest('hex'),segmentDigest:createHash('sha256').update(JSON.stringify(segment)).digest('hex'),planDigest:createHash('sha256').update(JSON.stringify(p)).digest('hex'),reservationDigest:createHash('sha256').update(JSON.stringify(reservation)).digest('hex')};save();
 const storage=load('lib/storage/r2.ts'),source=await one('project_assets',state.assetId),output=ready?await one('scene_assets',transformed.output_asset_id):null;
 for(const[kind,asset]of[['source',source],['prepared',segment],...(output?[['fal output',output]]:[])]){
  const signed=await storage.signR2Read(asset.storage_key,asset.verified_etag,asset.mime_type),r=await fetch(signed.url,{signal:AbortSignal.timeout(30000)});check('private R2 '+kind+' is retrievable by signed access',r.status===200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,asset.size_bytes);
  if(kind==='source')check('original source bytes remain unchanged',createHash('sha256').update(bytes).digest('hex')===state.sourceDigest);
  const u=new URL(signed.url);u.search='';const denied=await fetch(u,{signal:AbortSignal.timeout(20000)});check('private R2 '+kind+' refuses unsigned access',[400,401,403].includes(denied.status));await denied.body?.cancel();
 }
 const requestBody=JSON.stringify({generationJobId:j.id,sceneExecutionId:state.retrySceneId});
 check('freshly signed worker retry succeeds from persisted readiness',(await request(requestBody)).status===200);
 check('worker retry leaves one unchanged prepared segment',createHash('sha256').update(JSON.stringify(await one('prepared_segments',segment.id))).digest('hex')===state.snapshot.segmentDigest);
 const health=await fetch(worker+'/health',{signal:AbortSignal.timeout(30000)});check('Render remains healthy after real preparation and signed retry',health.status===200&&JSON.stringify(await health.json())==='{"ok":true}');
 const bFixture=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-fal-image-acceptance.json'),'utf8')),b=await one('generation_jobs',bFixture.jobId);assert.notEqual(b.owner_user_id,j.owner_user_id);
 check('valid server signature cannot combine User B job and User A scene',(await request(JSON.stringify({generationJobId:b.id,sceneExecutionId:transformed.id}))).status===403);
 console.log(JSON.stringify({jobId:j.id,analysisRun:j.worker_run_id,visualRun:j.visual_run_id,segmentId:segment.id,providerRequest:transformed.provider_task_id,checks:state.checks.length}));
}

async function unchanged(label){
 const scenes=await db.from('scene_executions').select('*').eq('job_id',state.jobId).order('scene_order');assert.ok(!scenes.error);
 const segments=await db.from('prepared_segments').select('*').eq('created_job_id',state.jobId);assert.ok(!segments.error);
 const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 check(label+' preserves exactly one preparation and all provider attempts',segments.data.length===1&&segments.data[0].id===state.segmentId&&digest(segments.data[0])===state.snapshot.segmentDigest&&digest(scenes.data)===state.snapshot.scenesDigest);
 check(label+' preserves immutable plan and reservation',digest(await one('generation_plans',state.jobId,'job_id'))===state.snapshot.planDigest&&digest(await one('generation_reservations',state.jobId,'job_id'))===state.snapshot.reservationDigest);
}
async function duplicate(){
 assert.ok(state.snapshot,'PROOF_REQUIRED');
 const {Inngest}=await import('inngest');const client=new Inngest({id:'sceenyk',isDev:false,eventKey:process.env.INNGEST_EVENT_KEY});
 if(!state.duplicateEventId){const sent=await client.send({id:state.jobId+':render-acceptance-duplicate-'+randomUUID(),name:'sceenyk/generation.visuals.requested',data:{generationJobId:state.jobId}});state.duplicateEventId=sent.ids[0];save();}
 let completed;for(let n=0;n<60;n++){
  const runs=await cloud('/v2/events/'+state.duplicateEventId+'/runs?includeOutput=true');
  for(const candidate of runs??[]){if(candidate.status!=='COMPLETED')continue;const run=await cloud('/v2/runs/'+candidate.id+'?includeOutput=true');const output=typeof run.output==='string'?JSON.parse(run.output):run.output;if(output.claim===(state.visualProof.output.handoff==='visuals_ready'?'terminal':'duplicate')){completed=run;break;}}
  if(completed)break;await new Promise(r=>setTimeout(r,1000));
 }
 check('real duplicate Inngest Cloud delivery exits at the persisted visual claim',!!completed);
 const trace=await cloud('/v2/runs/'+completed.id+'/trace?includeOutput=true');check('duplicate Cloud trace performs no preparation or provider submission',!JSON.stringify(trace).includes('prepare-source-')&&!JSON.stringify(trace).includes('submit-scene-'));
 state.duplicateRunId=completed.id;save();await unchanged('duplicate Cloud delivery');console.log(JSON.stringify({duplicateRunId:completed.id}));
}
async function browserVerify(){
 assert.ok(state.segmentSceneId,'PROOF_REQUIRED');const {deployedBrowser}=await import('./lib/deployed-browser.mjs');
 const ready=state.visualProof.output.handoff==='visuals_ready';assert.ok(ready||process.argv.includes('--allow-pending'),'VISUALS_READY_REQUIRED');const heading=ready?'Visuals ready':'Visual scenes need attention';
 const secrets=['WORKER_SHARED_SECRET','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','GEMINI_API_KEY','FAL_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY'].map(n=>process.env[n]).filter(Boolean);
 await deployedBrowser(origin,{A:state.ownerClerkId,B:state.secondClerkId},async({call,evaluate,wait,navigate,signIn,discover,invoke,errors})=>{
  await signIn('A');const route='/projects/'+state.projectId;await navigate(route);await wait('document.body.innerText.includes('+JSON.stringify(heading)+')');await discover();
  check('owner reopens the real persisted '+heading+' job',await evaluate('document.body.innerText.includes('+JSON.stringify(state.jobId)+')'));
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Check generation status'&&!b.disabled).click()");await wait("!document.body.innerText.includes('Checking status…')");check('explicit status refresh retains '+heading,await evaluate('document.body.innerText.includes('+JSON.stringify(heading)+')'));
  await call('Page.reload',{ignoreCache:true});await wait('document.body.innerText.includes('+JSON.stringify(heading)+')');check('full page refresh restores '+heading,true);
  const dto=await invoke('latestGenerationAction',state.projectId);check('owned status DTO shows actual persisted status without worker/provider secrets',dto.ok&&dto.value.id===state.jobId&&!!dto.value[ready?'visualsReadyAt':'visualsPendingAt']&&!/storage_key|provider_task_id|X-Amz-|WORKER_SHARED_SECRET|SUPABASE_SECRET_KEY/.test(JSON.stringify(dto)));
  const readRoute='/api/media/prepared?'+new URLSearchParams({projectId:state.projectId,sceneId:state.segmentSceneId});
  const owned=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(readRoute)});let v;try{v=await r.json();}catch{return {status:r.status,json:false};}if(!r.ok)return {status:r.status};const video=document.createElement('video');video.preload='metadata';const loaded=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),20000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve(true);};video.onerror=()=>{clearTimeout(timer);resolve(false);};video.src=v.url;});const duration=video.duration;video.removeAttribute('src');video.load();return {status:r.status,mediaLoaded:loaded,mediaDuration:duration,cache:r.headers.get('cache-control'),id:v.id,start:v.startMs,end:v.endMs,duration:v.durationMs,expiresIn:Number(new URL(v.url).searchParams.get('X-Amz-Expires'))};})()`);
  check('owner alone obtains and plays a short-lived private prepared segment',owned.status===200&&owned.mediaLoaded&&Math.abs(owned.mediaDuration-5)<=.043&&owned.cache==='private, no-store'&&owned.id===state.segmentId&&owned.start===2000&&owned.end===7000&&Math.abs(owned.duration-5000)<=43&&owned.expiresIn===900);
  for(const page of ['/dashboard',route]){await navigate(page);await wait(page===route?'document.body.innerText.includes('+JSON.stringify(heading)+')':"document.body.innerText.includes('Your projects')");const html=await evaluate('document.documentElement.outerHTML');check('authenticated '+(page===route?'project':'dashboard')+' HTML contains no configured server secrets',!secrets.some(s=>html.includes(s)));const urls=await evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.startsWith(location.origin+'/_next/static/')&&n.endsWith('.js'))");state.privateClientScripts=[...new Set([...(state.privateClientScripts??[]),...urls.map(u=>new URL(u).pathname)])];save();}
  check('leaving and reopening preserves actual saved visual status',true);
  await signIn('B');await navigate('/studio');await wait("!!document.querySelector('textarea')");await discover();
  const denied=await invoke('latestGenerationAction',state.projectId);check('User B cannot read User A generation',denied.ok&&denied.value===null);
  const media=await invoke('listMediaAction',state.projectId);check('User B cannot list User A source',!media.ok&&media.code==='NOT_FOUND');
  const quote=await invoke('quoteGenerationAction',{projectId:state.projectId,requestId:randomUUID(),inputs:{prompt:'Foreign source must be denied',category:'cinematic',settings:{duration:'10',aspectRatio:'16:9',visualStyle:'Original',tone:'Storytelling'},assetIds:[state.assetId]}});check('User B cannot admit processing of User A media',!quote.ok&&quote.code==='NOT_FOUND');
  const blocked=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(readRoute)});return {status:r.status,body:await r.json()};})()`);check('User B cannot obtain User A prepared capability',blocked.status===404&&!blocked.body.url);
  const direct=await evaluate(`(async()=>{try{const r=await fetch(${JSON.stringify(worker+'/prepare')},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({generationJobId:${JSON.stringify(state.jobId)},sceneExecutionId:${JSON.stringify(state.segmentSceneId)}})});return {status:r.status};}catch{return {blocked:true};}})()`);check('browser cannot directly use Render processing',direct.blocked===true||direct.status===401);
  await navigate(route);await wait("document.body.innerText.includes('Project unavailable')");check('foreign project exposes neither owned job nor visual readiness',await evaluate("!document.body.innerText.includes('Visuals ready')&&!document.body.innerText.includes("+JSON.stringify(state.jobId)+')'));
  check('reopen and ownership browser has no uncaught exceptions',errors.length===0);state.browserVerifiedAt=new Date().toISOString();save();
 });await unchanged('browser reads and foreign requests');
}
async function secrets(){
 const values=['WORKER_SHARED_SECRET','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','GEMINI_API_KEY','FAL_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY','INNGEST_SIGNING_KEY_FALLBACK'].map(n=>process.env[n]).filter(Boolean);
 const scripts=new Set(state.privateClientScripts??[]);let leaks=0,markers=0;
 for(const route of ['/','/studio']){const r=await fetch(origin+route,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const body=await r.text();if(values.some(v=>body.includes(v)))leaks++;for(const m of body.matchAll(/\/_next\/static\/[^\s"'\\<>]+\.js/g))scripts.add(m[0]);}
 for(const script of scripts){const r=await fetch(origin+script,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const body=await r.text();if(values.some(v=>body.includes(v)))leaks++;if(/WORKER_SHARED_SECRET|MEDIA_WORKER_URL|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|R2_SECRET_ACCESS_KEY|INNGEST_SIGNING_KEY|GEMINI_API_KEY|FAL_KEY|queue\.fal\.run|r2\.cloudflarestorage|X-Amz-Signature/.test(body))markers++;}
 state.secretScan={htmlPages:2,clientFiles:scripts.size,authenticatedClientFiles:state.privateClientScripts?.length??0,configuredSecrets:values.length,leaks,markers};save();check('checked deployed HTML and client bundles contain no server secrets',scripts.size>0&&leaks===0&&markers===0);console.log(JSON.stringify(state.secretScan));
}
async function browserPreflight(){
 const old=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-preparation-acceptance.json'),'utf8'));
 const {deployedBrowser}=await import('./lib/deployed-browser.mjs');
 await deployedBrowser(origin,{A:old.clerkUserId},async({signIn,navigate,wait,discover,errors})=>{
  await signIn('A');await navigate('/studio');await wait("!!document.querySelector('textarea')");await discover();check('actual isolated browser authenticates reserved acceptance identity on Vercel',errors.length===0);
 });
}
async function inspect(){
 const j=await one('generation_jobs',state.jobId);
 const scenes=await db.from('scene_executions').select('id,scene_order,operation,status,error_code,provider,model,provider_task_id,submission_attempts,preparation_required,prepared_asset_id,source_start_ms,source_end_ms,requested_duration_ms').eq('job_id',j.id).order('scene_order');assert.ok(!scenes.error);
 const segments=await db.from('prepared_segments').select('id,status,attempts,error_code,created_at,completed_at,source_duration_ms,duration_ms,width,height,fps,size_bytes,processing_mode,lease_expires_at').eq('created_job_id',j.id);assert.ok(!segments.error);
 const plan=await db.from('generation_plans').select('plan,provider,model').eq('job_id',j.id).maybeSingle();assert.ok(!plan.error);
 console.log(JSON.stringify({job:{id:j.id,status:j.status,stage:j.current_stage,ready:j.visuals_ready_at,pending:j.visuals_pending_at},scenes:scenes.data,segments:segments.data}));
 const runs=[];for(const runId of[j.worker_run_id,j.visual_run_id].filter(Boolean)){
  const run=await cloud('/v2/runs/'+runId+'?includeOutput=true');let output;try{output=typeof run.output==='string'?JSON.parse(run.output):run.output;}catch{}
  const trace=await cloud('/v2/runs/'+runId+'/trace?includeOutput=true'),spans=[];
  const visit=s=>{if(!s)return;spans.push({name:s.name,status:s.status,startedAt:s.startedAt,endedAt:s.endedAt,attempts:s.attempts,stepOp:s.stepOp,stepInfoKeys:Object.keys(s.stepInfo??{}),outputId:s.outputId,children:s.children?.length});for(const c of s.children??[])visit(c);};visit(trace.rootSpan);
  runs.push({id:runId,status:run.status,output:output?{claim:output.claim,handoff:output.handoff,reason:output.reason}:null,spans});
 }
 const details={job:{id:j.id,status:j.status,stage:j.current_stage,ready:j.visuals_ready_at,pending:j.visuals_pending_at},scenes:scenes.data,segments:segments.data,plan:plan.data?{provider:plan.data.provider,model:plan.data.model,scenes:plan.data.plan.scenePlan.map(s=>({order:s.order,source:s.source,duration:s.durationSeconds,start:s.startTime,end:s.endTime,assetId:s.assetId}))}:null,runs};
 state.inspection=details;save();console.log(JSON.stringify(details));
}
try{
 const mode=process.argv[2]??'preflight';
 if(mode==='preflight')await preflight();else if(mode==='browser-preflight')await browserPreflight();else if(mode==='launch')await launch();else if(mode==='monitor')await monitor();else if(mode==='proof')await proof();else if(mode==='duplicate')await duplicate();else if(mode==='verify')await browserVerify();else if(mode==='secrets')await secrets();else if(mode==='inspect')await inspect();else throw new Error('UNKNOWN_MODE');
}catch(error){console.error(JSON.stringify({failed:true,name:error.name,message:error.name==='AssertionError'?error.message.split('\n')[0]:/^[A-Z_]+$/.test(error.message)?error.message:'ACCEPTANCE_NETWORK_OR_HARNESS_ERROR',code:error.cause?.code??null,frames:error.stack?.split('\n').filter(s=>s.includes('check-deployed-preparation.mjs:')||s.includes('deployed-browser.mjs:')).map(s=>s.match(/(?:check-deployed-preparation|deployed-browser)\.mjs:\d+:\d+/)?.[0])}));process.exitCode=1;}
