// Scoped, real deployed acceptance. No provider mocks or direct plan/job writes.
// Reuse the same artifact on every invocation; launch never repeats admission.
// Run modes sequentially: each updates the same acceptance artifact.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, createHmac, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import nextEnv from '@next/env';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(), false, {info(){},error(){}});
const load=typescriptLoader(), db=load('lib/db/server.ts').createDatabaseClient();
const origin='https://sceenyk.vercel.app', worker='https://sceenyk-media-worker.onrender.com';
const artifact=path.join(os.tmpdir(),'sceenyk-deployed-narration-acceptance.json');
let state;try{state=JSON.parse(fs.readFileSync(artifact,'utf8'));}catch{state={checks:[],createdAt:new Date().toISOString()};}
const save=()=>fs.writeFileSync(artifact,JSON.stringify(state,null,2));
const check=(name,value)=>{assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const secrets=()=>['ELEVENLABS_API_KEY','WORKER_SHARED_SECRET','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','GEMINI_API_KEY','FAL_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY','INNGEST_SIGNING_KEY_FALLBACK'].map(n=>process.env[n]).filter(Boolean);
async function one(table,id,column='id'){const r=await db.from(table).select('*').eq(column,id).single().abortSignal(AbortSignal.timeout(20000));assert.ok(!r.error&&r.data,'AUTHORITATIVE_ROW_'+table);return r.data;}
async function rows(table){const r=await db.from(table).select('*').eq('job_id',state.jobId).order('id').abortSignal(AbortSignal.timeout(20000));assert.ok(!r.error,'AUTHORITATIVE_ROWS_'+table);return r.data;}
async function cloud(route){const r=await fetch('https://api.inngest.com'+route,{headers:{Authorization:'Bearer '+process.env.INNGEST_SIGNING_KEY},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'CLOUD_READ_SUCCEEDS');return (await r.json()).data;}
async function request(sceneId,options={}){
 const body=JSON.stringify({generationJobId:options.jobId??state.jobId,sceneExecutionId:sceneId}),timestamp=options.timestamp??String(Date.now()),nonce=options.nonce??randomUUID();
 const signature=createHmac('sha256',process.env.WORKER_SHARED_SECRET).update(`POST\n/narrate\n${timestamp}\n${nonce}\n`).update(body).digest('hex');
 const r=await fetch(worker+'/narrate',{method:'POST',body,headers:{'Content-Type':'application/json',...(options.unsigned?{}:{'x-worker-timestamp':timestamp,'x-worker-nonce':nonce,'x-worker-signature':signature}),...options.headers},redirect:'error',signal:AbortSignal.timeout(240000)});
 return {status:r.status,body:await r.json()};
}
async function preflight(){
 for(const [table,columns] of [['narration_segments','id'],['narration_assets','id'],['generation_jobs','narration_execution_version,audio_ready_at']]){
  const r=await db.from(table).select(columns).limit(0).abortSignal(AbortSignal.timeout(20000));check('hosted migration 014 exposes '+table,!r.error);
 }
 let healthy=false;for(let n=0;n<8;n++){try{const r=await fetch(worker+'/health',{signal:AbortSignal.timeout(25000)});healthy=r.status===200&&JSON.stringify(await r.json())==='{"ok":true}';}catch{}if(healthy)break;console.log(JSON.stringify({workerWarmupAttempt:n+1}));await delay(1500);}
 check('Render health responds with liveness only',healthy);
 const t=String(Math.floor(Date.now()/1000)),s=createHmac('sha256',process.env.INNGEST_SIGNING_KEY.replace(/^signkey-\w+-/,'')).update(t).digest('hex');
 const r=await fetch(origin+'/api/inngest',{headers:{'x-inngest-signature':`t=${t}&s=${s}`},signal:AbortSignal.timeout(30000)}),info=await r.json();
 check('Vercel authenticates the extended Inngest Cloud workflow registration',r.status===200&&info.authentication_succeeded&&info.mode==='cloud'&&info.function_count>=5&&info.event_key_hash===createHash('sha256').update(process.env.INNGEST_EVENT_KEY).digest('hex'));
 state.functionCount=info.function_count;
 const apps=await cloud('/v2/apps'),app=apps.find(a=>a.id==='sceenyk');state.syncedFunctionCount=app?.functionCount??0;
 const pending=await db.from('narration_segments').select('id,job_id,status,submission_attempts,error_code').limit(20).abortSignal(AbortSignal.timeout(20000));assert.ok(!pending.error);
 console.log(JSON.stringify({existingNarration:pending.data,paidCallsByPreflight:0,voiceMetadataRequired:false,functionCount:info.function_count,cloudFunctionCount:state.syncedFunctionCount,syncRequired:state.syncedFunctionCount!==state.functionCount}));state.preflightAt=new Date().toISOString();save();
}
async function launch(){
 assert.ok(process.argv.includes('--real'),'REAL_ACCEPTANCE_OPT_IN_REQUIRED');assert.ok(state.preflightAt,'PREFLIGHT_REQUIRED');
 if(state.jobId){console.log(JSON.stringify({existingJob:state.jobId}));return;}
 assert.equal(state.syncedFunctionCount,state.functionCount,'SYNC_EXISTING_CLOUD_APP_BEFORE_ADMISSION');
 // A synthetic, previously verified private source avoids new fal work.
 const sourceFixture=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-preparation-acceptance.json'),'utf8'));
 const other=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-hosted-identity-fixture-2.json'),'utf8'));
 const {createClerkClient}=await import('@clerk/backend');
 const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,publishableKey:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});
 assert.equal((await clerk.instance.get()).environmentType,'development');
 if(!state.ownerClerkId){const user=await clerk.users.createUser({username:'sceenykvoice'+randomUUID().replaceAll('-','').slice(0,16),emailAddress:[`sceenyk-voice-${randomUUID()}+clerk_test@example.com`],password:randomUUID()+'Aa1!',firstName:'Voice',lastName:'Acceptance'});state.ownerClerkId=user.id;save();}
 state.secondClerkId=other.clerkUserId;state.projectId??=randomUUID();state.requestId??=randomUUID();state.uploadRequestId??=randomUUID();save();
 const prompt='Make exactly TWO scenes totaling 10 seconds. Use ONLY the supplied original video unchanged, no transformations or generated visuals. Scene 1: source original, durationSeconds 5, startTime 2, endTime 7, supplied assetId, narration exactly "A bright beginning." Scene 2: source original, durationSeconds 5, startTime 2, endTime 7, same assetId, narration null (entirely silent). narrationRequired true. Exactly ONE spoken line in the entire production plan. No other speech, voice-over, music or effects. Retain any source overlays. This is a short scene narration and silent-scene acceptance.';
 const settings={duration:'10',aspectRatio:'16:9',visualStyle:'Original',tone:'Storytelling'};
 const {deployedBrowser}=await import('./lib/deployed-browser.mjs');
 await deployedBrowser(origin,{A:state.ownerClerkId,B:state.secondClerkId},async({signIn,navigate,wait,discover,invoke,close,errors})=>{
  await signIn('A');await navigate('/create');await wait("!!document.querySelector('textarea')");await discover();
  if(!state.projectSaved){const r=await invoke('saveProjectAction',{id:state.projectId,mode:'create',title:'Short George narration acceptance',category:'cinematic',prompt,settings});check('Vercel saves the owned narration acceptance project',r.ok);state.projectSaved=true;save();}
  if(!state.assetId){
   const original=await one('project_assets',sourceFixture.asset.id),storage=load('lib/storage/r2.ts');
   const stream=await storage.readR2AnalysisMedia(original.storage_key,original.verified_etag,original.size_bytes,AbortSignal.timeout(30000)),bytes=Buffer.from(await new Response(stream).arrayBuffer());
   assert.equal(bytes.length,original.size_bytes);
   const r=await invoke('authorizeMediaAction',{projectId:state.projectId,requestId:state.uploadRequestId,filename:'synthetic-voice-source.mp4',mimeType:'video/mp4',sizeBytes:bytes.length,kind:'video'});check('Vercel authorizes the private narration source',r.ok);
   if(r.value.upload){const put=await fetch(r.value.upload.url,{method:'PUT',headers:r.value.upload.headers,body:bytes,signal:AbortSignal.timeout(60000)});assert.ok([200,412].includes(put.status));await put.body?.cancel();}
   const finalized=await invoke('finalizeMediaAction',{projectId:state.projectId,assetId:r.value.asset.id});check('Vercel verifies the private source',finalized.ok&&finalized.value.status==='uploaded');state.assetId=finalized.value.id;state.sourceDigest=createHash('sha256').update(bytes).digest('hex');save();
  }
  const quoted=await invoke('quoteGenerationAction',{projectId:state.projectId,requestId:state.requestId,inputs:{prompt,category:'cinematic',settings,assetIds:[state.assetId]}});check('Vercel issues one real server-authoritative free quote',quoted.ok&&quoted.value.status==='ready'&&quoted.value.eligibleFreeGeneration);state.quoteId=quoted.value.id;save();
  const confirmed=await invoke('createGenerationAction',{quoteId:state.quoteId});check('Vercel admits and dispatches one accounted narration job',confirmed.ok&&!!confirmed.value.id);state.jobId=confirmed.value.id;state.admittedAt=new Date().toISOString();save();
  check('admission has no browser exceptions',errors.length===0);await close();state.browserClosedAt=new Date().toISOString();save();console.log(JSON.stringify({jobId:state.jobId,browserClosedAt:state.browserClosedAt,plannedSpeech:'A bright beginning.',plannedCharacters:Array.from('A bright beginning.').length}));
 });
}
async function monitor(){
 assert.ok(state.jobId,'ADMISSION_REQUIRED');const j=await one('generation_jobs',state.jobId),segments=await rows('narration_segments');
 console.log(JSON.stringify({jobId:j.id,status:j.status,stage:j.current_stage,errorCode:j.error_code,planReady:!!j.production_plan_ready_at,visualsReady:!!j.visuals_ready_at,audioReady:!!j.audio_ready_at,narrationPending:!!j.narration_pending_at,segments:segments.map(s=>({id:s.id,scene:s.scene_order,status:s.status,characters:s.character_count,attempts:s.submission_attempts,errorCode:s.error_code,durationMs:s.actual_duration_ms,usage:s.provider_usage}))}));
 state.lastObservedAt=new Date().toISOString();save();
 if(j.visuals_ready_at){const plan=await one('generation_plans',j.id,'job_id');check('actual Gemini plan contains only the requested short line and a silent scene',plan.plan.scenePlan.length===2&&plan.plan.scenePlan.filter(s=>s.narration==='A bright beginning.').length===1&&plan.plan.scenePlan.filter(s=>s.narration===null).length===1);state.acceptedPlanDigest??=digest(plan);save();}
 if(j.status==='failed'){
  const attempts=await db.from('generation_analysis_attempts').select('attempt,state,failure_code').eq('job_id',j.id).order('attempt');assert.ok(!attempts.error);
  const reservation=await one('generation_reservations',j.id,'job_id');console.log(JSON.stringify({analysisAttempts:attempts.data,reservationState:reservation.state,speechSubmissions:segments.reduce((n,s)=>n+s.submission_attempts,0)}));
 }
 if(segments.some(s=>['AUTH_REJECTED','QUOTA_EXHAUSTED','INVALID_VOICE_OR_MODEL'].includes(s.error_code))){state.providerRejected=true;save();throw new Error('TTS_REJECTED_STOP_NO_FURTHER_SPEECH_REQUEST');}
}
async function inspectCloud(){
 for(const route of ['/v2/apps']){
  const data=await cloud(route);console.log(JSON.stringify({route,keys:Object.keys(data??{}),records:Array.isArray(data)?data.map(v=>({id:v.id,name:v.name,slug:v.slug,url:v.url,functionCount:v.functionCount,configKeys:Object.keys(v)})):null}));
 }
}
async function syncCloud(){
 // Official SDK out-of-band registration on the already deployed endpoint.
 // Same app ID and URL; no code/hosting/environment changes.
 assert.ok(state.preflightAt,'PREFLIGHT_REQUIRED');
 const t=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',process.env.INNGEST_SIGNING_KEY.replace(/^signkey-\w+-/,'')).update(t).digest('hex');
 const r=await fetch(origin+'/api/inngest',{method:'PUT',headers:{'x-inngest-signature':`t=${t}&s=${signature}`},signal:AbortSignal.timeout(60000)}),body=await r.json();
 check('existing deployed SDK successfully synchronizes Cloud function registration',r.status===200);state.cloudSync={status:r.status,modified:body.modified===true,at:new Date().toISOString()};save();
 const apps=await cloud('/v2/apps'),app=apps.find(a=>a.id==='sceenyk');check('Cloud now registers the same six functions served by Vercel',app?.functionCount===state.functionCount);state.syncedFunctionCount=app.functionCount;save();
}
async function retryPlanning(){
 assert.ok(process.argv.includes('--real'),'REAL_ACCEPTANCE_OPT_IN_REQUIRED');
 const job=await one('generation_jobs',state.jobId),segments=await rows('narration_segments'),reservation=await one('generation_reservations',state.jobId,'job_id');
 assert.ok(job.status==='failed'&&job.current_stage==='planning'&&segments.length===0&&reservation.state==='released','ONLY_TERMINAL_PRE_SPEECH_PLANNING_FAILURE_CAN_RETRY');
 assert.ok(!state.failedPlanningJobs?.length,'ONE_FRESH_PLANNING_RETRY_ONLY');
 state.failedPlanningJobs=[{jobId:state.jobId,requestId:state.requestId,quoteId:state.quoteId,errorCode:job.error_code,reservationState:reservation.state,speechSubmissions:0}];
 delete state.jobId;delete state.quoteId;state.requestId=randomUUID();save();await launch();
}
async function proof(){
 assert.ok(!state.providerRejected,'TTS_REJECTION_STOP');const j=await one('generation_jobs',state.jobId),plan=await one('generation_plans',state.jobId,'job_id'),reservation=await one('generation_reservations',state.jobId,'job_id');
 const segments=await rows('narration_segments'),assets=await rows('narration_assets'),scenes=await rows('scene_executions');
 check('one exact persisted spoken scene and one silent scene',segments.length===2&&segments.filter(s=>s.text==='A bright beginning.').length===1&&segments.filter(s=>s.text===null).length===1);
 const spoken=segments.find(s=>s.text),silent=segments.find(s=>!s.text),asset=assets[0];state.spokenSceneId=spoken.scene_execution_id;state.silentSceneId=silent.scene_execution_id;state.segmentId=spoken.id;save();
 check('real stock George multilingual-v2 speech completed exactly once',spoken.status==='completed'&&spoken.submission_attempts===1&&spoken.voice_id==='JBFqnCBsd6RMkjVDRZzb'&&spoken.model_id==='eleven_multilingual_v2'&&!!spoken.provider_request_id&&assets.length===1);
 check('silent scene has no provider submission or audio asset',silent.status==='skipped'&&silent.submission_attempts===0&&!silent.submission_started_at&&!silent.provider_request_id&&!silent.output_asset_id);
 check('audio metadata preserves scene project generation and owner linkage',asset.id===spoken.output_asset_id&&asset.narration_segment_id===spoken.id&&asset.job_id===j.id&&asset.project_id===j.project_id&&asset.owner_user_id===j.owner_user_id&&segments.every(s=>s.owner_user_id===j.owner_user_id&&s.project_id===j.project_id&&scenes.some(c=>c.id===s.scene_execution_id&&c.scene_order===s.scene_order))&&spoken.text===plan.plan.scenePlan[spoken.scene_order-1].narration&&(!state.acceptedPlanDigest||digest(plan)===state.acceptedPlanDigest));
 check('audio readiness retains the original reservation without final completion',!!j.audio_ready_at&&j.status==='processing'&&j.current_stage==='voice'&&!j.completed_at&&reservation.state==='reserved'&&reservation.kind==='free'&&reservation.amount===1&&!reservation.settled_at);
 const account=await one('generation_accounts',j.owner_user_id,'owner_user_id'),receipts=await db.from('generation_result_receipts').select('job_id').eq('job_id',state.jobId);assert.ok(!receipts.error);
 check('one free hold remains unconsumed and no final result exists',account.free_reserved===1&&account.free_consumed===0&&account.credit_reserved===0&&receipts.data.length===0);
 check('both original visual scenes complete without a new fal submission',scenes.length===2&&scenes.every(s=>s.status==='completed'&&s.operation==='reuse'&&s.submission_attempts===0&&!s.provider_task_id));
 const previous=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-render-cloud-acceptance-nonce-protected.json'),'utf8'));
 const oldScenes=await db.from('scene_executions').select('*').eq('job_id',previous.jobId).order('scene_order');assert.ok(!oldScenes.error);
 check('previous deployed fal outputs preparation plan and reservation remain unchanged',digest(oldScenes.data)===previous.snapshot.scenesDigest&&digest(await one('prepared_segments',previous.segmentId))===previous.snapshot.segmentDigest&&digest(await one('generation_plans',previous.jobId,'job_id'))===previous.snapshot.planDigest&&digest(await one('generation_reservations',previous.jobId,'job_id'))===previous.snapshot.reservationDigest);
 const storage=load('lib/storage/r2.ts'),signed=await storage.signR2Read(asset.storage_key,asset.verified_etag,asset.mime_type),r=await fetch(signed.url,{signal:AbortSignal.timeout(30000)}),bytes=Buffer.from(await r.arrayBuffer());
 check('real private R2 audio exists with validated persisted bytes',r.status===200&&bytes.length===asset.size_bytes&&asset.mime_type==='audio/mpeg'&&asset.storage_key===`users/${j.owner_user_id}/projects/${j.project_id}/generations/${j.id}/narration/${spoken.id}.mp3`);
 const unsigned=new URL(signed.url);unsigned.search='';const denied=await fetch(unsigned,{signal:AbortSignal.timeout(20000)});check('private R2 audio rejects unsigned access',[400,401,403].includes(denied.status));await denied.body?.cancel();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-voice-proof-'));
 try{const file=path.join(directory,'audio.mp3');fs.writeFileSync(file,bytes,{flag:'wx'});const probePath=(await import('ffprobe-static')).default.path,probe=spawnSync(probePath,['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(probe.status,0,'NATIVE_FFPROBE_SUCCEEDS');const technical=JSON.parse(probe.stdout),duration=Math.round(Number(technical.format.duration)*1000);
  check('independent FFprobe confirms Render measured actual integer duration',duration===asset.duration_ms&&duration===spoken.actual_duration_ms&&technical.streams[0].codec_name==='mp3'&&Number(technical.streams[0].sample_rate)===asset.sample_rate&&technical.streams[0].channels===asset.channels);
  state.audioProof={durationMs:duration,expectedMs:spoken.expected_duration_ms,timingMismatch:spoken.timing_mismatch,sizeBytes:bytes.length,sampleRate:asset.sample_rate,channels:asset.channels,sha256:createHash('sha256').update(bytes).digest('hex')};
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
 check('provider request and character usage are recorded without invented USD pricing',spoken.character_count===Array.from('A bright beginning.').length&&spoken.provider_usage.characterCount===spoken.character_count&&spoken.provider_usage.model===spoken.model_id&&spoken.provider_usage.voice===spoken.voice_id&&spoken.provider_usage.provider==='elevenlabs'&&spoken.estimated_provider_cost===null);
 state.usage=spoken.provider_usage;
 const run=await cloud('/v2/runs/'+j.narration_run_id+'?includeOutput=true'),output=typeof run.output==='string'?JSON.parse(run.output):run.output;
 check('real Inngest Cloud narration run reaches the persisted audio handoff',run.status==='COMPLETED'&&run.id===j.narration_run_id&&output.handoff==='audio_ready');
 const trace=await cloud('/v2/runs/'+run.id+'/trace?includeOutput=true'),encoded=JSON.stringify(trace);
 check('Cloud executes only the spoken scene worker step',encoded.includes('narration-scene-'+spoken.scene_order)&&!encoded.includes('narration-scene-'+silent.scene_order));
 check('Cloud trace and outputs expose no configured secrets or private capabilities',!secrets().some(s=>encoded.includes(s))&&!/X-Amz-Signature|X-Amz-Credential|r2\.cloudflarestorage/.test(encoded));
 state.narrationRunId=run.id;state.narrationOutput=output;state.snapshot={segments:digest(segments),assets:digest(assets),scenes:digest(scenes),plan:digest(plan),reservation:digest(reservation)};save();console.log(JSON.stringify({jobId:j.id,runId:run.id,audio:state.audioProof,usage:state.usage,checks:state.checks.length}));
}
async function unchanged(label){
 check(label+' preserves narration submission count and immutable outputs',digest(await rows('narration_segments'))===state.snapshot.segments&&digest(await rows('narration_assets'))===state.snapshot.assets);
 check(label+' preserves visual scenes plan and held reservation',digest(await rows('scene_executions'))===state.snapshot.scenes&&digest(await one('generation_plans',state.jobId,'job_id'))===state.snapshot.plan&&digest(await one('generation_reservations',state.jobId,'job_id'))===state.snapshot.reservation);
}
async function duplicate(){
 assert.ok(state.snapshot,'PROOF_REQUIRED');assert.ok(!state.providerRejected,'TTS_REJECTION_STOP');
 const {Inngest}=await import('inngest');const client=new Inngest({id:'sceenyk',isDev:false,eventKey:process.env.INNGEST_EVENT_KEY});
 if(!state.duplicateEventId){const sent=await client.send({id:state.jobId+':narration-acceptance-duplicate-'+randomUUID(),name:'sceenyk/generation.narration.requested',data:{generationJobId:state.jobId}});state.duplicateEventId=sent.ids[0];save();}
 let completed;for(let n=0;n<40;n++){const runs=await cloud('/v2/events/'+state.duplicateEventId+'/runs?includeOutput=true');for(const candidate of runs??[]){if(candidate.status!=='COMPLETED')continue;const run=await cloud('/v2/runs/'+candidate.id+'?includeOutput=true'),output=typeof run.output==='string'?JSON.parse(run.output):run.output;if(['duplicate','terminal'].includes(output.claim)){completed=run;break;}}if(completed)break;await delay(1000);}
 check('real duplicate Inngest delivery exits before any speech step',!!completed);
 const trace=await cloud('/v2/runs/'+completed.id+'/trace?includeOutput=true');check('duplicate Cloud trace contains no narration worker request',!JSON.stringify(trace).includes('narration-scene-'));state.duplicateRunId=completed.id;save();await unchanged('duplicate Inngest delivery');
 const authenticated={timestamp:String(Date.now()),nonce:randomUUID()},recovered=await request(state.spokenSceneId,authenticated);check('fresh authenticated Render retry recovers existing private speech',recovered.status===200&&recovered.body.ready===true);
 const replay=await request(state.spokenSceneId,authenticated);check('real narration exact replay is rejected by durable nonce protection',replay.status===409&&replay.body.code==='REPLAY_DETECTED');
 check('deployed narration rejects unsigned requests',(await request(state.spokenSceneId,{unsigned:true})).status===401);
 check('deployed narration rejects browser-origin signed requests',(await request(state.spokenSceneId,{headers:{Origin:origin}})).status===401);
 const silent=await request(state.silentSceneId);check('authenticated silent-scene Render request exits without speech generation',silent.status===200&&silent.body.ready===true);
 await unchanged('Render recovery and silent retry');
}
async function verify(){
 assert.ok(state.snapshot,'PROOF_REQUIRED');const {deployedBrowser}=await import('./lib/deployed-browser.mjs');
 const route='/projects/'+state.projectId,readRoute='/api/media/narration?'+new URLSearchParams({projectId:state.projectId,sceneId:state.spokenSceneId});
 await deployedBrowser(origin,{A:state.ownerClerkId,B:state.secondClerkId},async({call,evaluate,wait,navigate,signIn,discover,invoke,errors})=>{
  await signIn('A');await navigate(route);await wait("document.body.innerText.includes('Narration ready')");await discover();check('owner reopens persisted narration-ready job',await evaluate('document.body.innerText.includes('+JSON.stringify(state.jobId)+')'));
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Check generation status'&&!b.disabled).click()");await wait("!document.body.innerText.includes('Checking status…')");check('explicit status refresh preserves narration readiness',await evaluate("document.body.innerText.includes('Narration ready')"));
  await call('Page.reload',{ignoreCache:true});await wait("document.body.innerText.includes('Narration ready')");check('page reload restores persisted narration readiness',true);await discover();
  const dto=await invoke('latestGenerationAction',state.projectId);check('owner DTO reports audio readiness without provider or storage details',dto.ok&&dto.value.id===state.jobId&&!!dto.value.audioReadyAt&&!/storage_key|provider_request_id|X-Amz-|ELEVENLABS|WORKER_SHARED_SECRET/.test(JSON.stringify(dto)));
  const audio=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(readRoute)});if(!r.ok)return {status:r.status};const v=await r.json(),audio=document.createElement('audio');const loaded=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),20000);audio.onloadedmetadata=()=>{clearTimeout(timer);resolve(true);};audio.onerror=()=>{clearTimeout(timer);resolve(false);};audio.src=v.url;audio.load();});const duration=audio.duration;audio.removeAttribute('src');audio.load();return {status:r.status,loaded,duration,id:v.id,sceneId:v.sceneId,sceneIndex:v.sceneIndex,actual:v.actualDurationMs,cache:r.headers.get('cache-control'),expiresIn:Number(new URL(v.url).searchParams.get('X-Amz-Expires'))};})()`);
  check('owner browser loads private audio with measured timing and short capability',audio.status===200&&audio.loaded&&audio.id===state.segmentId&&audio.sceneId===state.spokenSceneId&&audio.actual===state.audioProof.durationMs&&Math.abs(audio.duration*1000-audio.actual)<50&&audio.cache==='private, no-store'&&audio.expiresIn===900);
  for(const page of ['/dashboard',route]){await navigate(page);await wait(page===route?"document.body.innerText.includes('Narration ready')":"document.body.innerText.includes('Your projects')");const html=await evaluate('document.documentElement.outerHTML');check('authenticated '+(page===route?'project':'dashboard')+' HTML has no configured secrets',!secrets().some(s=>html.includes(s)));const urls=await evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.startsWith(location.origin+'/_next/static/')&&n.endsWith('.js'))");state.privateClientScripts=[...new Set([...(state.privateClientScripts??[]),...urls.map(u=>new URL(u).pathname)])];save();}
  check('dashboard return and reopen preserve narration readiness',true);
  await signIn('B');await navigate('/create');await wait("!!document.querySelector('textarea')");await discover();const denied=await invoke('latestGenerationAction',state.projectId);check('real User B cannot read User A generation',denied.ok&&denied.value===null);
  const blocked=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(readRoute)});return {status:r.status,body:await r.json()};})()`);check('real User B cannot obtain User A narration capability',blocked.status===404&&!blocked.body.url);
  const admission=await invoke('quoteGenerationAction',{projectId:state.projectId,requestId:randomUUID(),inputs:{prompt:'Unauthorized narration',category:'cinematic',settings:{duration:'10',aspectRatio:'16:9',visualStyle:'Original',tone:'Storytelling'},assetIds:[state.assetId]}});check('User B cannot admit narration for User A project',!admission.ok&&admission.code==='NOT_FOUND');
  const direct=await evaluate(`(async()=>{try{const r=await fetch(${JSON.stringify(worker+'/narrate')},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({generationJobId:${JSON.stringify(state.jobId)},sceneExecutionId:${JSON.stringify(state.spokenSceneId)}})});return {status:r.status};}catch{return {blocked:true};}})()`);check('User B browser cannot directly regenerate narration',direct.blocked===true||direct.status===401);
  await navigate(route);await wait("document.body.innerText.includes('Project unavailable')");check('foreign project page exposes no narration or job',await evaluate("!document.body.innerText.includes('Narration ready')&&!document.body.innerText.includes("+JSON.stringify(state.jobId)+')'));
  check('reopen and ownership browser has no uncaught exceptions',errors.length===0);state.browserVerifiedAt=new Date().toISOString();save();
 });await unchanged('browser reads and foreign requests');
}
async function scan(){
 const scripts=new Set(state.privateClientScripts??[]);let leaks=0,markers=0;
 for(const route of ['/','/create']){const r=await fetch(origin+route,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const html=await r.text();if(secrets().some(s=>html.includes(s)))leaks++;for(const m of html.matchAll(/\/_next\/static\/[^\s"'\\<>]+\.js/g))scripts.add(m[0]);}
 for(const script of scripts){const r=await fetch(origin+script,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const body=await r.text();if(secrets().some(s=>body.includes(s)))leaks++;if(/ELEVENLABS_API_KEY|api\.elevenlabs\.io|WORKER_SHARED_SECRET|MEDIA_WORKER_URL|SUPABASE_SECRET_KEY|R2_SECRET_ACCESS_KEY|INNGEST_SIGNING_KEY|GEMINI_API_KEY|FAL_KEY|queue\.fal\.run|r2\.cloudflarestorage|X-Amz-Signature/.test(body))markers++;}
 check('deployed public and authenticated client bundles expose no configured secrets',scripts.size>0&&leaks===0&&markers===0);state.secretScan={htmlPages:2,clientFiles:scripts.size,configuredSecrets:secrets().length,leaks,markers};save();console.log(JSON.stringify(state.secretScan));
}
try{const mode=process.argv[2]??'preflight';if(mode==='preflight')await preflight();else if(mode==='launch')await launch();else if(mode==='retry-planning')await retryPlanning();else if(mode==='monitor')await monitor();else if(mode==='cloud')await inspectCloud();else if(mode==='sync')await syncCloud();else if(mode==='proof')await proof();else if(mode==='duplicate')await duplicate();else if(mode==='verify')await verify();else if(mode==='secrets')await scan();else throw new Error('UNKNOWN_MODE');}
catch(error){console.error(JSON.stringify({failed:error.code??error.message??'ACCEPTANCE_FAILED'}));process.exitCode=1;}
