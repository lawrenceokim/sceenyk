// Reuses the accepted immutable 10s job. Never admits a job or buys provider work.
// Prints safe metadata only; private keys/capabilities never enter the artifact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import nextEnv from '@next/env';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const load=typescriptLoader(),db=load('lib/db/server.ts').createDatabaseClient(),storage=load('lib/storage/r2.ts');
const accepted=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-deployed-narration-acceptance.json'),'utf8'));
const artifact=path.join(os.tmpdir(),'sceenyk-final-render-acceptance.json'),origin='https://sceenyk.vercel.app';
let state;try{state=JSON.parse(fs.readFileSync(artifact,'utf8'));}catch{state={jobId:accepted.jobId,checks:[]};}
assert.equal(state.jobId,accepted.jobId,'EXISTING_ACCEPTED_JOB_ONLY');
const save=()=>fs.writeFileSync(artifact,JSON.stringify(state,null,2));
const check=(name,value)=>{assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const secrets=()=>['WORKER_SHARED_SECRET','ELEVENLABS_API_KEY','FAL_KEY','GEMINI_API_KEY','CLERK_SECRET_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_SECRET_ACCESS_KEY','R2_ACCESS_KEY_ID','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY'].map(n=>process.env[n]).filter(Boolean);
const one=async(table,id,column='id')=>{const r=await db.from(table).select('*').eq(column,id).single().abortSignal(AbortSignal.timeout(20000));assert.ok(!r.error&&r.data,'ROW_'+table);return r.data;};
async function rows(table,column='job_id'){
  const r=await db.from(table).select('*').eq(column,state.jobId).order(table==='generation_result_receipts'?'job_id':'id').abortSignal(AbortSignal.timeout(20000));assert.ok(!r.error,'ROWS_'+table);return r.data;
}
async function invariant(){
  return {composition:digest(await one('composition_plans',state.jobId,'job_id')),plan:digest(await one('generation_plans',state.jobId,'job_id')),scenes:digest(await rows('scene_executions')),narration:digest(await rows('narration_segments')),audio:digest(await rows('narration_assets')),visuals:digest(await rows('scene_assets'))};
}
async function unchanged(){check('composition provider outputs scenes and submission counts unchanged',digest(await invariant())===digest(state.baseline));}
async function cloud(route){const r=await fetch('https://api.inngest.com'+route,{headers:{Authorization:'Bearer '+process.env.INNGEST_SIGNING_KEY},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'CLOUD_READ');return(await r.json()).data;}
function cloudHeaders(){const t=String(Math.floor(Date.now()/1000)),s=createHmac('sha256',process.env.INNGEST_SIGNING_KEY.replace(/^signkey-\w+-/,'')).update(t).digest('hex');return{'x-inngest-signature':`t=${t}&s=${s}`};}
async function preflight(){
  const schema=await db.from('render_jobs').select('id').limit(0).abortSignal(AbortSignal.timeout(20000));state.migrationApplied=!schema.error;
  const r=await fetch(origin+'/api/inngest',{headers:cloudHeaders(),signal:AbortSignal.timeout(30000)}),info=await r.json();
  check('existing deployed Inngest endpoint authenticates',r.status===200&&info.authentication_succeeded);
  state.deployedFunctionCount=info.function_count;state.cloudFunctionCount=(await cloud('/v2/apps')).find(a=>a.id==='sceenyk')?.functionCount;
  const job=await one('generation_jobs',state.jobId),composition=await one('composition_plans',state.jobId,'job_id'),hold=await one('generation_reservations',state.jobId,'job_id');
  check('existing hosted ten-second composition is ready',composition.status==='ready'&&composition.plan.total_duration_ms===10000&&composition.plan.issues.length===0);
  if(!state.baseline){
    check('initial render acceptance retains original reservation',hold.state==='reserved'&&job.status==='processing');
    state.baseline=await invariant();state.originalHold={jobId:hold.job_id,ownerUserId:hold.owner_user_id,kind:hold.kind,amount:hold.amount,createdAt:hold.created_at};
    const account=await one('generation_accounts',job.owner_user_id,'owner_user_id');
    state.originalAccount={freeConsumed:account.free_consumed,freeReserved:account.free_reserved,creditAvailable:account.credit_available,creditReserved:account.credit_reserved};
  }
  await unchanged();state.preflightAt=new Date().toISOString();save();
  console.log(JSON.stringify({migration016Available:state.migrationApplied,safeSchemaError:schema.error?.code??null,deployedFunctions:state.deployedFunctionCount,cloudFunctions:state.cloudFunctionCount,ddlConfigured:!!(process.env.DATABASE_URL||process.env.SUPABASE_DB_URL||process.env.SUPABASE_ACCESS_TOKEN),generationStatus:job.status,stage:job.current_stage,reservation:hold.state}));
}
async function sync(){
  assert.ok(state.migrationApplied&&state.deployedFunctionCount===9,'APPLY_016_DEPLOY_BOTH_FIRST');
  const r=await fetch(origin+'/api/inngest',{method:'PUT',headers:cloudHeaders(),signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,'EXISTING_APP_SYNC');await r.body?.cancel();
  state.cloudFunctionCount=(await cloud('/v2/apps')).find(a=>a.id==='sceenyk')?.functionCount;
  check('existing Cloud app registers all nine functions',state.cloudFunctionCount===9);
}
async function launch(){
  assert.ok(state.migrationApplied&&state.deployedFunctionCount===9&&state.cloudFunctionCount===9,'DEPLOYED_RENDERER_REQUIRED');
  const p=await one('composition_plans',state.jobId,'job_id');
  assert.ok(p.status==='ready'&&p.plan.total_duration_ms===10000,'EXISTING_READY_TEN_SECOND_PLAN_ONLY');
  await unchanged();
  if(!state.initialEventId){
    const {Inngest}=await import('inngest'),client=new Inngest({id:'sceenyk',isDev:false,eventKey:process.env.INNGEST_EVENT_KEY});
    const sent=await client.send({id:state.jobId+':final-acceptance-'+randomUUID(),name:'sceenyk/generation.render.requested',data:{generationJobId:state.jobId}});
    state.initialEventId=sent.ids[0];state.launchedAt=new Date().toISOString();save();
  }
  console.log(JSON.stringify({renderEventId:state.initialEventId,existingGenerationId:state.jobId,newGenerationAdmissions:0,providerRequests:0}));
}
async function cloudProof(){
  assert.ok(state.initialEventId,'TRACEABLE_INITIAL_EVENT_REQUIRED');
  const runs=await cloud('/v2/events/'+state.initialEventId+'/runs?includeOutput=true');
  for(const run of runs){
    const detail=await cloud('/v2/runs/'+run.id+'?includeOutput=true');
    const output=typeof detail.output==='string'?(detail.output?JSON.parse(detail.output):null):detail.output;
    const trace=JSON.stringify(await cloud('/v2/runs/'+run.id+'/trace?includeOutput=true'));
    check('initial renderer Cloud trace exposes no secrets keys or capabilities',!secrets().some(s=>trace.includes(s))&&!/storage_key|X-Amz-Signature|X-Amz-Credential|r2\.cloudflarestorage/.test(trace));
    console.log(JSON.stringify({initialRunId:run.id,status:run.status,handoff:output?.handoff??null,createdRender:trace.includes('create-or-reuse-render-job'),polledRender:trace.includes('dispatch-inspect-render-'),finalizedVerifiedOutput:trace.includes('finalize-verified-output')}));
    state.initialRunId=run.id;state.initialRunStatus=run.status;save();
    if(run.status==='COMPLETED'&&output?.handoff==='render_failed')check('failed Cloud render never finalizes unverified output',!trace.includes('finalize-verified-output'));
    else if(run.status==='COMPLETED')check('actual Inngest renderer reaches verified finalization',output?.handoff==='generation_completed'&&trace.includes('finalize-verified-output'));
  }
}
async function monitor(){
  const job=await one('generation_jobs',state.jobId),hold=await one('generation_reservations',state.jobId,'job_id');
  const render=await db.from('render_jobs').select('*').eq('generation_job_id',state.jobId).maybeSingle();assert.ok(!render.error,'RENDER_SCHEMA_REQUIRED');
  const elapsedMs=render.data?.started_at?Date.now()-Date.parse(render.data.started_at):null,workerLeaseLive=!!render.data?.lease_expires_at&&Date.parse(render.data.lease_expires_at)>Date.now();
  const progressAgeMs=render.data?.updated_at?Date.now()-Date.parse(render.data.updated_at):null;
  console.log(JSON.stringify({generationStatus:job.status,stage:job.current_stage,renderStatus:render.data?.status??null,workerAttempts:render.data?.worker_attempts??0,safeError:render.data?.error_code??null,startedAt:render.data?.started_at,completedAt:render.data?.completed_at,elapsedMs,workerLeaseLive,progressAgeMs,reservation:hold.state}));
  const assets=await rows('final_video_assets','generation_job_id'),receipts=await rows('generation_result_receipts');
  state.observations??=[];state.observations.push({at:new Date().toISOString(),generationStatus:job.status,renderStatus:render.data?.status??null,attempts:render.data?.worker_attempts??0,elapsedMs,workerLeaseLive,reservation:hold.state,finalAssets:assets.length,receipts:receipts.length});save();
  if(render.data&&['dispatched','rendering','uploading','verifying'].includes(render.data.status)&&assets.length===0)check('observed active hosted render holds reservation before verified output',job.status==='processing'&&hold.state==='reserved'&&receipts.length===0);
  if(render.data?.status==='failed'){state.hostedFailure={code:render.data.error_code,at:new Date().toISOString()};save();}
}
async function outputHead(){
  const job=await one('generation_jobs',state.jobId),key=`users/${job.owner_user_id}/generations/${job.id}/result.mp4`;
  const stored=await storage.inspectR2Object(key);
  console.log(JSON.stringify({canonicalOutputExists:!!stored,sizeBytes:stored?.sizeBytes??null,mimeType:stored?.mimeType??null,generationStatus:job.status}));
}
async function failureProof(){
  const job=await one('generation_jobs',state.jobId),render=await one('render_jobs',state.jobId,'generation_job_id'),hold=await one('generation_reservations',state.jobId,'job_id'),account=await one('generation_accounts',job.owner_user_id,'owner_user_id');
  check('hosted failed render has no completed generation asset or receipt',job.status==='failed'&&render.status==='failed'&&!job.completed_at&&(await rows('final_video_assets','generation_job_id')).length===0&&(await rows('generation_result_receipts')).length===0);
  check('hosted failure releases the original reservation',hold.state==='released'&&hold.kind===state.originalHold.kind&&hold.amount===state.originalHold.amount&&hold.created_at===state.originalHold.createdAt);
  check('hosted failure restores account without consuming entitlement',account.free_consumed===state.originalAccount.freeConsumed&&account.free_reserved===state.originalAccount.freeReserved-(hold.kind==='free'?hold.amount:0)&&account.credit_reserved===state.originalAccount.creditReserved-(hold.kind==='credits'?hold.amount:0)&&account.credit_available===state.originalAccount.creditAvailable+(hold.kind==='credits'?hold.amount:0));
  if(state.failedAccountingDigest)check('repeated failure observation preserves released accounting',state.failedAccountingDigest===digest({hold,account}));
  state.failedAccountingDigest=digest({hold,account});state.hostedFailure={code:render.error_code,at:render.failed_at,platformReason:'User confirmed Render exceeded 512 MB RAM',attempts:render.worker_attempts};save();
  await unchanged();await outputHead();
}
async function verify(){
  assert.ok(state.baseline,'PREFLIGHT_BASELINE_REQUIRED');
  const job=await one('generation_jobs',state.jobId),render=await one('render_jobs',state.jobId,'generation_job_id'),asset=await one('final_video_assets',state.jobId,'generation_job_id'),hold=await one('generation_reservations',state.jobId,'job_id'),receipt=await one('generation_result_receipts',state.jobId,'job_id');
  check('one owned canonical render and verified asset complete generation',job.status==='completed'&&render.status==='completed'&&render.output_asset_id===asset.id&&asset.render_job_id===render.id&&asset.owner_user_id===job.owner_user_id&&asset.project_id===job.project_id);
  check('receipt precedes completion and reservation settlement',Date.parse(asset.verified_at)<=Date.parse(job.completed_at)&&Date.parse(asset.verified_at)<=Date.parse(hold.settled_at)&&receipt.storage_key===asset.storage_key&&receipt.verified_etag===asset.verified_etag);
  check('original reservation consumed without replacement',hold.state==='consumed'&&hold.kind===state.originalHold.kind&&hold.amount===state.originalHold.amount&&hold.created_at===state.originalHold.createdAt);
  const account=await one('generation_accounts',job.owner_user_id,'owner_user_id'),before=state.originalAccount;
  check('original entitlement consumed exactly once',hold.kind==='free'?account.free_consumed===before.freeConsumed+1&&account.free_reserved===before.freeReserved-1:account.credit_available===before.creditAvailable&&account.credit_reserved===before.creditReserved-hold.amount);
  check('output and receipt cardinality each one',(await rows('render_jobs','generation_job_id')).length===1&&(await rows('final_video_assets','generation_job_id')).length===1);
  check('completed render contains no temporary reference',!render.lease_id&&!render.lease_expires_at&&asset.storage_key===`users/${job.owner_user_id}/generations/${job.id}/result.mp4`&&!/tmp|localhost|127\.0\.0\.1|X-Amz/.test(JSON.stringify(render)+JSON.stringify(asset)));
  const head=await storage.inspectR2Object(asset.storage_key);check('real private output identity matches receipt',head?.etag===asset.verified_etag&&head.sizeBytes===asset.size_bytes&&head.mimeType==='video/mp4');
  const stream=await storage.readR2AnalysisMedia(asset.storage_key,asset.verified_etag,asset.size_bytes,AbortSignal.timeout(120000));
  const bytes=await load('lib/video-ai/storage.ts').boundedBytes(stream,52428800);
  check('persisted output SHA256 and byte count match',bytes.length===asset.size_bytes&&createHash('sha256').update(bytes).digest('hex')===asset.sha256);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-final-proof-'));
  try{
    const file=path.join(directory,'result.mp4');fs.writeFileSync(file,bytes,{flag:'wx'});
    const executable=(await import('ffprobe-static')).default.path;
    const p=spawnSync(executable,['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:524288,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP}});
    assert.equal(p.status,0,'INDEPENDENT_NATIVE_PROBE');const probe=JSON.parse(p.stdout),v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
    check('real hosted output independently probes H264 AAC 24fps correct shape',probe.streams.length===2&&v.codec_name==='h264'&&v.pix_fmt==='yuv420p'&&a.codec_name==='aac'&&v.width===640&&v.height===360&&v.avg_frame_rate==='24/1');
    check('actual full video and audio duration fit 10000ms within85ms',[probe.format.duration,v.duration,a.duration].every(n=>Number.isFinite(Number(n))&&Math.abs(Number(n)*1000-10000)<=85));
    const ffmpeg=(await import('ffmpeg-static')).default;
    const rms=time=>{const r=spawnSync(ffmpeg,['-v','error','-ss',String(time),'-i',file,'-t','0.2','-vn','-ac','1','-ar','48000','-f','s16le','pipe:1'],{windowsHide:true,timeout:90000,maxBuffer:1000000,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot}});assert.equal(r.status,0,'HOSTED_OUTPUT_AUDIO_DECODE');let sum=0;for(let i=0;i<r.stdout.length;i+=2)sum+=r.stdout.readInt16LE(i)**2;return Math.sqrt(sum/(r.stdout.length/2));};
    check('actual narration audible in first scene',rms(0.4)>5);
    check('short narration trailing space and second scene stay silent',rms(3)<5&&rms(7)<5);
    state.media={durationMs:Math.round(Number(probe.format.duration)*1000),sizeBytes:bytes.length,sha256:asset.sha256,width:v.width,height:v.height,fps:24,renderDurationMs:asset.render_duration_ms,observedNodeRssBytes:asset.observed_rss_bytes,sceneCount:2};
  }finally{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('sceenyk-final-proof-'));fs.rmSync(directory,{recursive:true,force:true});}
  const signed=await storage.signR2Read(asset.storage_key,asset.verified_etag,asset.mime_type),unsigned=new URL(signed.url);unsigned.search='';
  const denied=await fetch(unsigned,{signal:AbortSignal.timeout(30000)});check('unsigned final R2 object stays private',denied.status===403||denied.status===401);await denied.body?.cancel();
  const {deployedBrowser}=await import('./lib/deployed-browser.mjs');
  await deployedBrowser(origin,{A:accepted.ownerClerkId,B:accepted.secondClerkId},async({signIn,navigate,wait,evaluate,call,errors})=>{
    const route='/projects/'+accepted.projectId,api='/api/media/final?'+new URLSearchParams({projectId:accepted.projectId,jobId:state.jobId});
    const read=()=>evaluate(`fetch(${JSON.stringify(api)},{cache:'no-store'}).then(async r=>({status:r.status,cache:r.headers.get('cache-control'),data:await r.json()}))`);
    await signIn('A');await navigate(route);await wait("!!document.querySelector('video[aria-label=\"Final generated video\"]')");
    await wait("document.querySelector('video[aria-label=\"Final generated video\"]').readyState>=1");
    const owned=await read();check('real owner receives private no-store playback',owned.status===200&&owned.data.video.id===asset.id&&owned.cache.includes('no-store'));
    const metadata=await evaluate("(()=>{const v=document.querySelector('video[aria-label=\"Final generated video\"]');return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};})()");
    check('real Chrome loads final MP4 metadata',Math.abs(metadata.duration*1000-10000)<=85&&metadata.width===640&&metadata.height===360);
    const played=await evaluate("(async()=>{const v=document.querySelector('video[aria-label=\"Final generated video\"]');v.muted=true;await v.play();return !v.paused;})()");check('actual browser video playback succeeds',played);
    await call('Page.reload',{ignoreCache:true});await wait("document.body.innerText.includes('Video ready')");check('refresh retains same final video',(await read()).data.video.id===asset.id);
    await navigate('/dashboard');await navigate(route);await wait("document.body.innerText.includes('Video ready')");check('project reopen retains same final video',(await read()).data.video.id===asset.id);
    const download=await fetch(owned.data.video.downloadUrl,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(30000)});
    check('real private download returns MP4 with fixed attachment name',[200,206].includes(download.status)&&download.headers.get('content-type')==='video/mp4'&&download.headers.get('content-disposition')==='attachment; filename="sceenyk-video.mp4"');await download.body?.cancel();
    await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Refresh video').click()");
    await wait("document.querySelector('video[aria-label=\"Final generated video\"]')?.readyState>=1");
    check('explicit video refresh renews owned playback for same output',(await read()).data.video.id===asset.id);
    const injected=await evaluate(`fetch(${JSON.stringify(api+'&assetId='+asset.id)}).then(r=>r.status)`);check('owner browser cannot supply arbitrary output asset ID',injected===404);
    const html=await evaluate('document.documentElement.outerHTML');check('authenticated final HTML exposes no configured secrets',!secrets().some(s=>html.includes(s)));
    state.privateClientScripts=await evaluate("Array.from(new Set(performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.startsWith(location.origin+'/_next/static/')&&n.endsWith('.js')).map(n=>new URL(n).pathname)))");
    await signIn('B');const foreign=await read();check('real User B cannot access User A final',foreign.status===404&&!foreign.data.video);
    const write=await evaluate(`fetch(${JSON.stringify(api)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:true,assetId:${JSON.stringify(asset.id)}})}).then(r=>r.status)`);check('browser cannot forge output receipt or completion',write===405);
    check('final video browser reports no exceptions',errors.length===0);
  });
  await unchanged();state.renderDigest=digest(render);state.assetDigest=digest(asset);state.holdDigest=digest(hold);state.receiptDigest=digest(receipt);state.accountDigest=digest(account);state.renderId=render.id;state.verifiedAt=new Date().toISOString();save();
  console.log(JSON.stringify({...state.media,hostedVerified:true,containerPeakMemoryMeasured:false}));
}
async function duplicate(){
  assert.ok(state.verifiedAt,'VERIFY_REAL_FINAL_FIRST');
  if(!state.duplicateEventId){const {Inngest}=await import('inngest'),client=new Inngest({id:'sceenyk',isDev:false,eventKey:process.env.INNGEST_EVENT_KEY});const sent=await client.send({id:state.jobId+':final-duplicate-'+randomUUID(),name:'sceenyk/generation.render.requested',data:{generationJobId:state.jobId}});state.duplicateEventId=sent.ids[0];save();}
  console.log(JSON.stringify({duplicateEventId:state.duplicateEventId,providerRequests:0,nextMode:'duplicate-proof'}));
}
async function duplicateProof(){
  assert.ok(state.duplicateEventId,'SEND_DUPLICATE_FIRST');const runs=await cloud('/v2/events/'+state.duplicateEventId+'/runs?includeOutput=true'),run=runs.find(r=>r.status==='COMPLETED');assert.ok(run,'DUPLICATE_RUN_NOT_COMPLETE');
  const detail=await cloud('/v2/runs/'+run.id+'?includeOutput=true'),output=typeof detail.output==='string'?JSON.parse(detail.output):detail.output;
  check('duplicate real Cloud delivery reuses completed output',output.handoff==='generation_completed');
  await stable();await unchanged();state.duplicateRunId=run.id;save();
  const trace=JSON.stringify(await cloud('/v2/runs/'+run.id+'/trace?includeOutput=true'));
  check('real finalization Cloud trace leaks no secrets keys or private capabilities',!secrets().some(s=>trace.includes(s))&&!/storage_key|X-Amz-Signature|X-Amz-Credential|r2\.cloudflarestorage/.test(trace));
}
async function stable(){
  const job=await one('generation_jobs',state.jobId);
  check('duplicate delivery preserves exact render asset receipt accounting',digest(await one('render_jobs',state.renderId))===state.renderDigest&&digest(await one('final_video_assets',state.renderId))===state.assetDigest&&digest(await one('generation_reservations',state.jobId,'job_id'))===state.holdDigest&&digest(await one('generation_result_receipts',state.jobId,'job_id'))===state.receiptDigest&&digest(await one('generation_accounts',job.owner_user_id,'owner_user_id'))===state.accountDigest);
}
async function worker(){
  assert.ok(state.verifiedAt,'VERIFY_REAL_FINAL_FIRST');
  const request=async(options={})=>{const body=JSON.stringify({renderJobId:state.renderId,...options.extra}),timestamp=options.timestamp??String(Date.now()),nonce=options.nonce??randomUUID(),signature=createHmac('sha256',process.env.WORKER_SHARED_SECRET).update(['POST','/render',timestamp,nonce,body].join('\n')).digest('hex');const r=await fetch(process.env.MEDIA_WORKER_URL+'/render',{method:'POST',headers:{'Content-Type':'application/json',...(options.unsigned?{}:{'x-worker-timestamp':timestamp,'x-worker-nonce':nonce,'x-worker-signature':signature}),...options.headers},body,redirect:'error',signal:AbortSignal.timeout(120000)});return{status:r.status,data:await r.json()};};
  const auth={timestamp:String(Date.now()),nonce:randomUUID()},r=await request(auth);check('real signed worker reuses completed render without processing',r.status===200&&r.data.ready===true);
  const replay=await request(auth);check('real render replay refused',replay.status===409&&replay.data.code==='REPLAY_DETECTED');
  check('real unsigned renderer refused',(await request({unsigned:true})).status===401);
  check('real browser-origin renderer refused',(await request({headers:{Origin:origin}})).status===401);
  check('real renderer rejects arbitrary composition receipt and storage claims',(await request({extra:{plan:{status:'ready'},storageKey:'foreign',completed:true}})).status===400);
  await stable();await unchanged();
}
async function scan(){
  const scripts=new Set(state.privateClientScripts??[]);let leaks=0,markers=0;
  for(const route of ['/','/studio']){const r=await fetch(origin+route,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const html=await r.text();if(secrets().some(s=>html.includes(s)))leaks++;for(const m of html.matchAll(/\/_next\/static\/[^\s"'\\<>]+\.js/g))scripts.add(m[0]);}
  for(const file of scripts){const r=await fetch(origin+file,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const body=await r.text();if(secrets().some(s=>body.includes(s)))leaks++;if(/ensure_render_job|complete_render_job|finalize_render_generation|@remotion\/renderer|WORKER_SHARED_SECRET|SUPABASE_SECRET_KEY|R2_SECRET_ACCESS_KEY|INNGEST_SIGNING_KEY|ELEVENLABS_API_KEY|GEMINI_API_KEY|FAL_KEY|X-Amz-Signature|r2\.cloudflarestorage/.test(body))markers++;}
  check('deployed public and authenticated client secret scan passes',scripts.size>0&&leaks===0&&markers===0);state.secretScan={files:scripts.size,configuredSecrets:secrets().length,leaks,markers};save();
}
const modes={preflight,sync,launch,monitor,'output-head':outputHead,'failure-proof':failureProof,'cloud-proof':cloudProof,verify,duplicate,'duplicate-proof':duplicateProof,worker,secrets:scan};
try{assert.ok(modes[process.argv[2]],'MODE_REQUIRED');await modes[process.argv[2]]();}
catch(error){console.error(JSON.stringify({code:'FINAL_ACCEPTANCE_FAILED',reason:error instanceof assert.AssertionError?error.message:'Safe acceptance operation failed.'}));process.exitCode=1;}
