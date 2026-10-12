// No admission, generation or provider submission. Reuses accepted real media.
// preflight/media are read-only. verify/duplicate require deployed migration 015.
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
const previous=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-render-cloud-acceptance-nonce-protected.json'),'utf8'));
const file=path.join(os.tmpdir(),'sceenyk-composition-acceptance.json'),origin='https://sceenyk.vercel.app';
let state;try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{state={checks:[],jobId:accepted.jobId};}
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
const check=(name,value)=>{assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const secrets=()=>['ELEVENLABS_API_KEY','WORKER_SHARED_SECRET','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','GEMINI_API_KEY','FAL_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY'].map(n=>process.env[n]).filter(Boolean);
const one=async(table,id,column='id')=>{const r=await db.from(table).select('*').eq(column,id).single().abortSignal(AbortSignal.timeout(20000));assert.ok(!r.error&&r.data,'OWNED_ROW_'+table);return r.data;};
async function rows(table,job=accepted.jobId){const r=await db.from(table).select('*').eq('job_id',job).order('id').abortSignal(AbortSignal.timeout(20000));assert.ok(!r.error,'OWNED_ROWS_'+table);return r.data;}
async function cloud(route){const r=await fetch('https://api.inngest.com'+route,{headers:{Authorization:'Bearer '+process.env.INNGEST_SIGNING_KEY},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'CLOUD_READ');return (await r.json()).data;}
async function preflight(){
  const schema=await db.from('composition_plans').select('job_id').limit(0).abortSignal(AbortSignal.timeout(20000));
  state.migrationApplied=!schema.error;
  console.log(JSON.stringify({migration015Available:state.migrationApplied,safeSchemaError:schema.error?.code??null,ddlConnectionConfigured:!!(process.env.DATABASE_URL||process.env.SUPABASE_DB_URL),managementTokenConfigured:!!process.env.SUPABASE_ACCESS_TOKEN}));
  const t=String(Math.floor(Date.now()/1000)),s=createHmac('sha256',process.env.INNGEST_SIGNING_KEY.replace(/^signkey-\w+-/,'')).update(t).digest('hex');
  const response=await fetch(origin+'/api/inngest',{headers:{'x-inngest-signature':`t=${t}&s=${s}`},signal:AbortSignal.timeout(30000)}),info=await response.json();
  check('existing Vercel Cloud endpoint authenticates safely',response.status===200&&info.authentication_succeeded);
  state.deployedFunctionCount=info.function_count;
  const apps=await cloud('/v2/apps');state.cloudFunctionCount=apps.find(a=>a.id==='sceenyk')?.functionCount;
  const j=await one('generation_jobs',accepted.jobId),p=await one('generation_plans',accepted.jobId,'job_id');
  check('real accepted generation has audio visuals and original held reservation',!!j.audio_ready_at&&!!j.visuals_ready_at&&(await one('generation_reservations',j.id,'job_id')).state==='reserved');
  state.legacyTransitions=p.plan.scenePlan.map(s=>s.transition);state.preflightAt=new Date().toISOString();save();
  console.log(JSON.stringify({migration015Available:state.migrationApplied,deployedFunctions:state.deployedFunctionCount,cloudFunctions:state.cloudFunctionCount,legacyTransitions:state.legacyTransitions}));
}
async function readProbe(asset,label,kind){
  const object=await storage.inspectR2Object(asset.storage_key);
  assert.ok(object?.etag===asset.verified_etag&&object.sizeBytes===asset.size_bytes&&object.mimeType===asset.mime_type,'REAL_R2_IDENTITY');
  const stream=await storage.readR2AnalysisMedia(asset.storage_key,asset.verified_etag,asset.size_bytes,AbortSignal.timeout(60000));
  const bytes=await load('lib/video-ai/storage.ts').boundedBytes(stream,104857600);assert.equal(bytes.length,asset.size_bytes);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-composition-proof-'));
  try{
    const media=path.join(directory,'media');fs.writeFileSync(media,bytes,{flag:'wx'});
    const binary=(await import('ffprobe-static')).default.path;
    const result=spawnSync(binary,['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',media],{encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:524288,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP}});
    assert.equal(result.status,0,'NATIVE_FFPROBE');const probe=JSON.parse(result.stdout),video=probe.streams.find(s=>s.codec_type==='video');
    const durationMs=Math.round(Number(kind==='video'?video.duration??probe.format.duration:probe.format.duration)*1000);
    check(label+' actual private media measured with native FFprobe',Number.isSafeInteger(durationMs)&&durationMs>0);
    return {assetId:asset.id,durationMs,sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }finally{
    const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('sceenyk-composition-proof-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}
async function unchanged(){
  check('accepted ElevenLabs outputs and submission counts remain unchanged',digest(await rows('narration_segments'))===accepted.snapshot.segments&&digest(await rows('narration_assets'))===accepted.snapshot.assets);
  check('accepted visual execution plan and accounting remain unchanged',digest(await rows('scene_executions'))===accepted.snapshot.scenes&&digest(await one('generation_plans',accepted.jobId,'job_id'))===accepted.snapshot.plan&&digest(await one('generation_reservations',accepted.jobId,'job_id'))===accepted.snapshot.reservation);
  check('previous fal and prepared outputs remain unchanged',digest((await rows('scene_executions',previous.jobId)).sort((a,b)=>a.scene_order-b.scene_order))===previous.snapshot.scenesDigest&&digest(await one('prepared_segments',previous.segmentId))===previous.snapshot.segmentDigest&&digest(await one('generation_plans',previous.jobId,'job_id'))===previous.snapshot.planDigest&&digest(await one('generation_reservations',previous.jobId,'job_id'))===previous.snapshot.reservationDigest);
}
async function media(){
  const scenes=(await rows('scene_executions')).sort((a,b)=>a.scene_order-b.scene_order),audio=(await rows('narration_assets'))[0];
  const prepared=await one('prepared_segments',scenes[0].prepared_asset_id);
  state.prepared=await readProbe(prepared,'accepted prepared visual','video');
  state.narration=await readProbe(audio,'accepted George narration','audio');
  check('real trusted measurements match persisted metadata',state.prepared.durationMs===prepared.duration_ms&&state.narration.durationMs===audio.duration_ms&&state.narration.durationMs===1280);
  const outputs=await rows('scene_assets',previous.jobId);assert.ok(outputs.length);
  state.fal=[];for(const a of outputs)state.fal.push(await readProbe(a,'accepted fal output','video'));
  await unchanged();state.mediaAt=new Date().toISOString();save();
  console.log(JSON.stringify({prepared:state.prepared,narration:state.narration,fal:state.fal,providerRequests:0,hostedCompositionPersisted:false}));
}
async function verify(){
  const result=await db.from('composition_plans').select('*').eq('job_id',accepted.jobId).maybeSingle();
  assert.ok(!result.error&&result.data,'DEPLOY_015_AND_WAIT_FOR_COMPOSITION');
  const p=load('lib/composition/contract.ts').compositionPlanSchema.parse(result.data.plan),j=await one('generation_jobs',accepted.jobId);
  check('hosted composition persists same-generation versioned timeline',p.generation_job_id===accepted.jobId&&p.schema_version===1&&p.total_duration_ms===10000&&p.scenes[1].start_ms===p.scenes[0].end_ms);
  check('real narration fits exact absolute timing',p.scenes[0].narration.actual_duration_ms===1280&&p.scenes[0].narration.start_ms===p.scenes[0].narration.start_offset_ms&&p.scenes[0].narration.end_ms===p.scenes[0].narration.start_ms+1280);
  check('real silent scene is valid without narration',p.scenes[1].narration===null&&p.scenes[1].timing_status==='valid');
  check('hosted readiness is honest and reservation remains held',p.status==='ready'&&!!j.composition_ready_at&&!j.completed_at&&(await one('generation_reservations',j.id,'job_id')).state==='reserved');
  const run=await cloud('/v2/runs/'+j.composition_run_id+'?includeOutput=true');check('real Inngest Cloud reaches composition readiness',run.status==='COMPLETED');
  const trace=JSON.stringify(await cloud('/v2/runs/'+j.composition_run_id+'/trace?includeOutput=true'));
  check('composition plan and Cloud trace contain no secrets private keys or capabilities',!secrets().some(s=>trace.includes(s)||JSON.stringify(p).includes(s))&&!/X-Amz-Signature|X-Amz-Credential|r2\.cloudflarestorage|storage_key/.test(trace+JSON.stringify(p)));
  state.compositionDigest=digest(result.data);state.compositionRunId=j.composition_run_id;save();
  const {deployedBrowser}=await import('./lib/deployed-browser.mjs');
  await deployedBrowser(origin,{A:accepted.ownerClerkId,B:accepted.secondClerkId},async({signIn,navigate,wait,evaluate,call,errors})=>{
    const route='/projects/'+accepted.projectId,api='/api/composition?'+new URLSearchParams({projectId:accepted.projectId,jobId:accepted.jobId});
    await signIn('A');await navigate(route);await wait("document.body.innerText.includes('Timeline ready')");
    const read=()=>evaluate(`fetch(${JSON.stringify(api)},{cache:'no-store'}).then(async r=>({status:r.status,data:await r.json()}))`);
    const a=await read();check('owner reads persisted safe composition',a.status===200&&digest(a.data.plan)===digest(p));
    await call('Page.reload',{ignoreCache:true});await wait("document.body.innerText.includes('Timeline ready')");check('refresh reopens identical hosted composition',digest((await read()).data.plan)===digest(p));
    await navigate('/dashboard');await navigate(route);await wait("document.body.innerText.includes('Timeline ready')");check('project reopen restores identical composition',digest((await read()).data.plan)===digest(p));
    await signIn('B');const b=await read();check('real User B cannot read User A composition',b.status===404&&!b.data.plan);
    const write=await evaluate(`fetch(${JSON.stringify(api)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:{status:'ready'}})}).then(r=>r.status)`);check('browser cannot create arbitrary trusted composition',write===405);
    check('composition browser has no exceptions',errors.length===0);
  });
  await unchanged();save();
}
async function replay(){
  assert.ok(state.mediaAt,'MEASURE_REAL_PRIVATE_MEDIA_FIRST');
  const j=await one('generation_jobs',accepted.jobId),p=await one('generation_plans',j.id,'job_id');
  const snapshots={app_users:[await one('app_users',j.owner_user_id)],projects:[await one('projects',j.project_id)],project_assets:[],generation_accounts:[await one('generation_accounts',j.owner_user_id,'owner_user_id')],generation_jobs:[j],generation_reservations:[await one('generation_reservations',j.id,'job_id')],generation_plans:[p],scene_executions:await rows('scene_executions'),prepared_segments:[],narration_segments:await rows('narration_segments'),narration_assets:await rows('narration_assets'),scene_assets:await rows('scene_assets')};
  for(const id of j.input_snapshot.assetIds)snapshots.project_assets.push(await one('project_assets',id));
  for(const id of new Set(snapshots.scene_executions.map(s=>s.prepared_asset_id).filter(Boolean)))snapshots.prepared_segments.push(await one('prepared_segments',id));
  const {compositionFixtureDatabase}=await import('./lib/composition-fixture.mjs');
  const runVariant=async(variant)=>{
    const {pg,call,one:localOne}=await compositionFixtureDatabase();
    try{
      // Isolated database only: import the existing immutable snapshot. These
      // counterfactual inputs never touch Supabase, source media or providers.
      await pg.exec('set session_replication_role=replica');
      for(const [table,records] of Object.entries(snapshots))for(const source of records){
        const record=structuredClone(source);
        if(table==='generation_jobs')for(const key of ['composition_run_id','composition_started_at','composition_pending_at','composition_ready_at','composition_configuration'])record[key]=null;
        if(variant==='narration-overflow'){
          if(table==='generation_plans'){record.plan.scenePlan[0].durationSeconds=1.2;record.plan.scenePlan[1].durationSeconds=8.8;}
          if(table==='scene_executions')record.duration_seconds=record.scene_order===1?1.2:8.8;
        }
        if(variant==='visual-shortfall'){
          if(table==='generation_plans'){record.plan.scenePlan[0].durationSeconds=6;record.plan.scenePlan[1].durationSeconds=4;}
          if(table==='scene_executions')record.duration_seconds=record.scene_order===1?6:4;
        }
        const columns=Object.keys(record);assert.ok(columns.every(c=>/^[a-z_]+$/.test(c)));
        await pg.query(`insert into ${table}(${columns.join(',')}) values(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(record));
      }
      await pg.exec('set session_replication_role=origin');
      const run=randomUUID(),config={schema_version:1,narration_offset_ms:400,technical_tolerance_ms:0};
      assert.equal(await call('claim_composition_generation',{p_job_id:j.id,p_run_id:run,p_configuration:config}),'claimed');
      for(const scene of snapshots.scene_executions)for(const track of ['visual','narration']){
        const a=await call('composition_asset_ref',{p_scene_id:scene.id,p_track:track});if(!a)continue;
        const duration=track==='narration'?state.narration.durationMs:state.prepared.durationMs;
        assert.equal(await call('record_composition_asset_check',{p_job_id:j.id,p_run_id:run,p_scene_id:scene.id,p_track:track,p_duration_ms:duration,p_issue:null}),true);
      }
      await call('finish_composition_generation',{p_job_id:j.id,p_run_id:run});
      const result=(await localOne('select plan from composition_plans where job_id=$1',[j.id])).plan;
      assert.equal((await localOne('select state from generation_reservations where job_id=$1',[j.id])).state,'reserved');
      if(variant==='actual'){
        check('real-media replay in isolated SQL produces ready contiguous timeline',result.status==='ready'&&result.total_duration_ms===10000&&result.scenes[1].start_ms===5000);
        check('real-media replay places 1280ms speech at 400ms with silence',result.scenes[0].narration.start_ms===400&&result.scenes[0].narration.end_ms===1680&&result.scenes[0].narration.trailing_silence_ms===3320&&result.scenes[1].narration===null);
        const before=JSON.stringify(await localOne('select * from composition_plans where job_id=$1',[j.id]));
        assert.equal(await call('finish_composition_generation',{p_job_id:j.id,p_run_id:run}),'reused');
        check('real-media replay reuses exact immutable SQL row',JSON.stringify(await localOne('select * from composition_plans where job_id=$1',[j.id]))===before);
      }else check('isolated real-media '+variant+' persists conflict and hold',result.status==='conflict'&&result.issues.some(i=>i.code===(variant==='narration-overflow'?'NARRATION_TOO_LONG':'VISUAL_TOO_SHORT')));
      return {status:result.status,issues:result.issues,totalDurationMs:result.total_duration_ms};
    }finally{await pg.close();}
  };
  state.localRealMediaReplay={actual:await runVariant('actual'),narrationOverflow:await runVariant('narration-overflow'),visualShortfall:await runVariant('visual-shortfall')};
  // Actual fal output is 42ms longer than its existing five-second scene.
  const falScenes=await rows('scene_executions',previous.jobId),fal=state.fal[0],falScene=falScenes.find(s=>s.output_asset_id===fal.assetId);
  assert.ok(falScene);const requiredMs=Math.round(falScene.duration_seconds*1000);
  check('measured existing fal output admits exact planned trim',fal.durationMs>requiredMs&&requiredMs===5000);
  state.realFalTrim={assetId:fal.assetId,actualDurationMs:fal.durationMs,inputStartMs:0,inputEndMs:requiredMs};
  await unchanged();save();console.log(JSON.stringify({localRealMediaReplay:state.localRealMediaReplay,realFalTrim:state.realFalTrim,scope:'real hosted media; isolated composition persistence/counterfactual conflicts; no hosted composition acceptance claimed',providerRequests:0}));
}
async function duplicate(){
  assert.ok(state.compositionDigest,'VERIFY_HOSTED_COMPOSITION_FIRST');
  const {Inngest}=await import('inngest'),client=new Inngest({id:'sceenyk',isDev:false,eventKey:process.env.INNGEST_EVENT_KEY});
  if(!state.duplicateEventId){const sent=await client.send({id:accepted.jobId+':composition-acceptance-duplicate-'+randomUUID(),name:'sceenyk/generation.composition.requested',data:{generationJobId:accepted.jobId}});state.duplicateEventId=sent.ids[0];save();}
  console.log(JSON.stringify({duplicateEventId:state.duplicateEventId,providerRequests:0,nextMode:'duplicate-proof'}));
}
async function duplicateProof(){
  assert.ok(state.duplicateEventId);const runs=await cloud('/v2/events/'+state.duplicateEventId+'/runs?includeOutput=true'),run=runs.find(r=>r.status==='COMPLETED');assert.ok(run,'DUPLICATE_CLOUD_RUN_NOT_COMPLETE');
  const detail=await cloud('/v2/runs/'+run.id+'?includeOutput=true'),output=typeof detail.output==='string'?JSON.parse(detail.output):detail.output;
  check('duplicate hosted Inngest exits before media work',output.claim==='terminal');
  const trace=await cloud('/v2/runs/'+run.id+'/trace?includeOutput=true');check('duplicate Cloud trace has no scene inspection',!JSON.stringify(trace).includes('inspect-scene-'));
  check('duplicate Cloud delivery reuses exact immutable row',digest(await one('composition_plans',accepted.jobId,'job_id'))===state.compositionDigest);
  await unchanged();save();
}
const modes={preflight,media,replay,verify,duplicate,'duplicate-proof':duplicateProof};
try{assert.ok(modes[process.argv[2]],'MODE_REQUIRED');await modes[process.argv[2]]();}
catch(error){console.error(JSON.stringify({code:error?.code??'COMPOSITION_ACCEPTANCE_FAILED',reason:error instanceof assert.AssertionError?error.message:'Safe acceptance operation failed.'}));process.exitCode=1;}
