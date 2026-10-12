import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {Inngest} from 'inngest';
import {InngestTestEngine} from '@inngest/test';
import fs from 'node:fs/promises';
import path from 'node:path';
process.env.FAL_KEY='fixture-never-used-for-http';
const {pg,db,call,one,scalar,fixture}=await compositionFixtureDatabase();
let count=0;const check=(name,value)=>{assert.ok(value,name);count++;console.log(JSON.stringify({passed:name}));};
const config=typescriptLoader()('lib/final-render/contract.ts');
async function ready(options={}){
  const f=await fixture(options);await call('claim_composition_generation',{p_job_id:f.job,p_run_id:f.run,p_configuration:f.configuration});
  for(const scene of f.scenes)for(const track of ['visual','narration']){
    const a=await call('composition_asset_ref',{p_scene_id:scene.id,p_track:track});if(!a)continue;
    await call('record_composition_asset_check',{p_job_id:f.job,p_run_id:f.run,p_scene_id:scene.id,p_track:track,p_duration_ms:a.is_static?null:a.duration_ms??6120,p_issue:null});
  }
  f.composition=await call('finish_composition_generation',{p_job_id:f.job,p_run_id:f.run});return f;
}
const reserve=async f=>(await one('select state from generation_reservations where job_id=$1',[f.job])).state;
const metadata={sizeBytes:100,etag:'fixture-etag',sha256:'a'.repeat(64),durationMs:10000,width:640,height:360,fps:24,videoCodec:'h264',audioCodec:'aac',renderDurationMs:100,observedRssBytes:100000};
try{
  const conflict=await ready({speechMs:6120});check('conflict composition cannot admit render',conflict.composition==='conflict'&&await call('ensure_render_job',{p_job_id:conflict.job})===null&&await reserve(conflict)==='reserved');
  const pending=await fixture();check('missing composition cannot admit render',await call('ensure_render_job',{p_job_id:pending.job})===null);
  const f=await ready(),renderId=await call('ensure_render_job',{p_job_id:f.job});assert.ok(renderId);
  check('ready composition admits one stable render job',await call('ensure_render_job',{p_job_id:f.job})===renderId&&(await scalar('select count(*) as value from render_jobs where generation_job_id=$1',[f.job]))===1);
  check('render admission advances existing stage and holds reservation',(await one('select current_stage from generation_jobs where id=$1',[f.job])).current_stage==='rendering'&&await reserve(f)==='reserved');
  const lease=randomUUID(),ref={p_render_id:renderId,p_lease_id:lease};
  check('one lease owns render',await call('claim_render_job',ref)==='claimed'&&await call('claim_render_job',{...ref,p_lease_id:randomUUID()})==='busy');
  check('foreign lease cannot advance or publish',await call('advance_render_job',{...ref,p_lease_id:randomUUID(),p_status:'verifying'})===false&&await call('complete_render_job',{...ref,p_lease_id:randomUUID(),p_metadata:metadata})===false);
  check('worker acknowledgement cannot finalize unverified job',await call('finalize_render_generation',{p_render_id:renderId})===false);
  const j=await one('select * from generation_jobs where id=$1',[f.job]);
  const receiptArgs={p_job_id:f.job,p_run_id:j.worker_run_id,p_storage_key:`users/${f.owner}/generations/${f.job}/result.mp4`,p_mime_type:'video/mp4',p_size_bytes:100,p_etag:'fixture-etag'};
  check('old MIME-only settlement adapter cannot bypass rendered receipt',await call('complete_generation_with_result',receiptArgs)===false&&await reserve(f)==='reserved');
  for(const status of ['rendering','uploading','verifying'])await call('advance_render_job',{...ref,p_status:status});
  await call('advance_render_job',{...ref,p_status:'rendering'});check('delayed heartbeat cannot rewind lifecycle',(await one('select status from render_jobs where id=$1',[renderId])).status==='verifying');
  for(const invalid of [{...metadata,durationMs:10100},{...metadata,width:1280},{...metadata,videoCodec:'vp9'},{...metadata,audioCodec:'mp3'},{...metadata,fps:30}])check('SQL refuses invalid output encoding shape or duration',await call('complete_render_job',{...ref,p_metadata:invalid})===false);
  check('valid independent verification creates one immutable owned asset',await call('complete_render_job',{...ref,p_metadata:metadata})===true);
  check('worker verification alone does not consume accounting',await reserve(f)==='reserved'&&(await one('select status from generation_jobs where id=$1',[f.job])).status==='processing');
  check('duplicate verification reuses canonical output',await call('complete_render_job',{...ref,p_metadata:metadata})===true&&(await scalar('select count(*) as value from final_video_assets where generation_job_id=$1',[f.job]))===1);
  check('verified output cannot be failed/refunded',await call('fail_render_job',{...ref,p_error:'RENDER_FAILED'})===false);
  check('Inngest finalization consumes exactly once',await call('finalize_render_generation',{p_render_id:renderId})===true&&await call('finalize_render_generation',{p_render_id:renderId})===true&&await reserve(f)==='consumed');
  const account=await one('select * from generation_accounts where owner_user_id=$1',[f.owner]);check('free consumption is exactly one',account.free_consumed===1&&account.free_reserved===0);
  check('completion persists one accounting receipt',(await scalar('select count(*) as value from generation_result_receipts where job_id=$1',[f.job]))===1);
  check('completed render lease is terminal',await call('claim_render_job',{...ref,p_lease_id:randomUUID()})==='completed');
  const failed=await ready(),failedId=await call('ensure_render_job',{p_job_id:failed.job}),failedRef={p_render_id:failedId,p_lease_id:randomUUID()};await call('claim_render_job',failedRef);
  check('definitive no-output render failure restores exactly once',await call('fail_render_job',{...failedRef,p_error:'RENDER_FAILED'})===true&&await call('fail_render_job',{...failedRef,p_error:'RENDER_FAILED'})===true&&await reserve(failed)==='released');
  check('failed render cannot complete or consume',await call('finalize_render_generation',{p_render_id:failedId})===false&&(await one('select free_consumed from generation_accounts where owner_user_id=$1',[failed.owner])).free_consumed===0);
  for(const success of [true,false]){
    const paid=await ready({paidCredits:10}),id=await call('ensure_render_job',{p_job_id:paid.job}),paidRef={p_render_id:id,p_lease_id:randomUUID()};await call('claim_render_job',paidRef);
    if(success){await call('advance_render_job',{...paidRef,p_status:'verifying'});await call('complete_render_job',{...paidRef,p_metadata:metadata});await call('finalize_render_generation',{p_render_id:id});await call('finalize_render_generation',{p_render_id:id});}
    else{await call('fail_render_job',{...paidRef,p_error:'RENDER_FAILED'});await call('fail_render_job',{...paidRef,p_error:'RENDER_FAILED'});}
    const balance=await one('select * from generation_accounts where owner_user_id=$1',[paid.owner]);
    check('paid '+(success?'verified completion consumes':'failure restores')+' exactly once',balance.credit_reserved===0&&balance.credit_available===(success?90:100)&&await reserve(paid)===(success?'consumed':'released'));
    check('paid settlement creates one immutable ledger outcome',(await scalar("select count(*) as value from credit_ledger where job_id=$1 and type=$2",[paid.job,success?'consumption':'release']))===1);
  }
  const recover=await ready(),recoverId=await call('ensure_render_job',{p_job_id:recover.job}),first={p_render_id:recoverId,p_lease_id:randomUUID()};await call('claim_render_job',first);
  await pg.query("update render_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[recoverId]);const second={...first,p_lease_id:randomUUID()};
  check('expired worker lease recovers without new job',await call('claim_render_job',second)==='claimed'&&(await scalar('select count(*) as value from render_jobs where generation_job_id=$1',[recover.job]))===1);
  check('old worker fenced after takeover',await call('advance_render_job',{...first,p_status:'verifying'})===false&&await call('fail_render_job',{...first,p_error:'RENDER_FAILED'})===false);
  check('temporary failure releases lease not entitlement',await call('release_render_lease',second)===true&&await reserve(recover)==='reserved');
  for(const role of ['anon','authenticated','service_role']){
    await pg.exec(`set role ${role}`);
    try{await assert.rejects(()=>pg.query('update render_jobs set status=$1 where id=$2',['completed',recoverId]));check(role+' cannot forge render state',true);
      await assert.rejects(()=>pg.query('insert into final_video_assets(id) values($1)',[randomUUID()]));check(role+' cannot forge final asset',true);
      if(role!=='service_role'){await assert.rejects(()=>pg.query('select ensure_render_job($1)',[recover.job]));check(role+' cannot render another user job',true);await assert.rejects(()=>pg.query('select * from final_video_assets'));check(role+' cannot read private finals',true);}
    }finally{await pg.exec('reset role');}
  }
  let user={id:randomUUID()},signed=0;
  const load=typescriptLoader({'@/lib/db/server':{createDatabaseClient:()=>({from(table){const clauses=[],values=[];return{select(){return this},eq(k,v){clauses.push(k+'=$'+(values.push(v)));return this},async maybeSingle(){return{data:(await pg.query(`select * from ${table} where ${clauses.join(' and ')}`,values)).rows[0]??null,error:null}}}}})},'@/lib/auth/ensure-app-user':{ensureAppUser:async()=>user},'@/lib/storage/r2':{inspectR2Object:async()=>({etag:'fixture-etag',sizeBytes:100,mimeType:'video/mp4'}),signR2Read:async()=>{signed++;return{url:'https://private.example/capability',expiresAt:'future'}}}});
  check('User B final video denied before signing',await load('lib/final-render/server.ts').getOwnedFinalVideo({projectId:f.project,jobId:f.job})===null&&signed===0);
  user={id:f.owner};const video=await load('lib/final-render/server.ts').getOwnedFinalVideo({projectId:f.project,jobId:f.job});check('owned completed final gets fresh playback and download capability',video?.id===renderId&&signed===2&&!JSON.stringify(video).includes('storage_key'));
  check('browser cannot inject asset identifiers',await load('lib/final-render/server.ts').getOwnedFinalVideo({projectId:f.project,jobId:f.job,assetId:randomUUID()})===null);
  check('renderer request accepts stable identifier only',config.renderRequestSchema.safeParse({renderJobId:renderId}).success&&!config.renderRequestSchema.safeParse({renderJobId:renderId,ready:true}).success);
  let dispatches=0;
  const engineLoad=typescriptLoader({
    '@/lib/db/server':{createDatabaseClient:()=>db},
    '@/lib/workflows/client':{inngest:new Inngest({id:'final-render-test',isDev:true})},
    '@/lib/final-render/client':{requestFinalRender:async id=>{
      dispatches++;const lease=randomUUID(),ref={p_render_id:id,p_lease_id:lease};
      assert.equal(await call('claim_render_job',ref),'claimed');
      await call('advance_render_job',{...ref,p_status:'verifying'});
      assert.equal(await call('complete_render_job',{...ref,p_metadata:metadata}),true);
    }},
  });
  const engineFixture=await ready();
  const engineRun=()=>new InngestTestEngine({function:engineLoad('lib/workflows/final-render.ts').finalRenderWorkflow,events:[{name:'sceenyk/generation.render.requested',data:{generationJobId:engineFixture.job}}],steps:[{id:'render-poll-wait-0',handler:()=>undefined}]}).execute();
  const engineResult=await engineRun();
  check('official Inngest engine dispatches polls verifies and finalizes',engineResult.result.handoff==='generation_completed'&&dispatches===1&&await reserve(engineFixture)==='consumed');
  const engineDuplicate=await engineRun();
  check('duplicate durable delivery reuses output without worker dispatch',engineDuplicate.result.handoff==='generation_completed'&&dispatches===1&&(await scalar('select count(*) as value from final_video_assets where generation_job_id=$1',[engineFixture.job]))===1);
  const beforeSql=JSON.stringify(await one('select * from generation_accounts where owner_user_id=$1',[f.owner]));
  await pg.query("select set_config('sceenyk.acceptance_job',$1,false)",[f.job]);
  const sqlResults=(await pg.exec((await import('node:fs')).readFileSync('supabase/acceptance/final-render-failure.sql','utf8'))).flatMap(r=>r.rows).filter(r=>r.scenario);
  check('exact rollback-only hosted failure SQL passes free and credit restoration',sqlResults.length===2&&sqlResults.every(r=>r.passed));
  check('failure SQL leaves real fixture accounting untouched',beforeSql===JSON.stringify(await one('select * from generation_accounts where owner_user_id=$1',[f.owner])));
  let workerMode='okay',nativeRenders=0,uploads=0,receiptLost=false;
  const objects=new Map(),scratch=[];
  const workerLoad=typescriptLoader({
    '@/lib/db/server':{createDatabaseClient:()=>({...db,rpc:async(name,args)=>{
      const result=await db.rpc(name,args);
      if(name==='complete_render_job'&&workerMode==='receipt-lost'&&!receiptLost){receiptLost=true;return{data:null,error:{code:'FIXTURE_LOST_RESPONSE'}};}
      return result;
    }})},
    '@/lib/storage/r2':{
      inspectR2Object:async key=>objects.get(key)??null,
      putR2FinalOutput:async key=>{uploads++;objects.set(key,{etag:'fixture-etag',sizeBytes:100,mimeType:'video/mp4'});if(workerMode==='upload-lost'){workerMode='okay';throw new Error('FIXTURE_UNKNOWN_UPLOAD_RESULT');}return true;},
    },
    './media':{
      downloadPrivateMedia:async(_asset,file)=>{if(workerMode==='missing-source')throw new(workerLoad('lib/final-render/contract.ts').RenderError)('SOURCE_UNAVAILABLE');await fs.writeFile(file,'fixture');},
      fileSha256:async()=>'a'.repeat(64),
      serveLocalMedia:async files=>({sources:Object.fromEntries([...files].map(([id])=>[id,'http://127.0.0.1/fixture/'+id])),close:async()=>{}}),
      runRenderer:async directory=>{nativeRenders++;scratch.push(directory);if(workerMode==='timeout')throw new(workerLoad('lib/final-render/contract.ts').RenderError)('RENDER_TIMEOUT');await fs.writeFile(path.join(directory,'output.mp4'),'fixture');await fs.writeFile(path.join(directory,'metrics.json'),JSON.stringify({observedRssBytes:100000}));},
      muxNarration:async()=>{},
      validateFinalFile:async()=>({sizeBytes:100,sha256:'a'.repeat(64),durationMs:10000,width:640,height:360,fps:24,videoCodec:'h264',audioCodec:'aac'}),
    },
  },{setInterval,clearInterval,AbortController});
  const worker=workerLoad('lib/final-render/worker.ts');
  const execute=async id=>{const ref={p_render_id:id,p_lease_id:randomUUID()};assert.equal(await call('claim_render_job',ref),'claimed');await worker.executeRender(id,ref.p_lease_id);};
  const fresh=await ready(),freshId=await call('ensure_render_job',{p_job_id:fresh.job});await execute(freshId);
  check('worker publishes independently checked persisted object but retains hold',(await one('select status from render_jobs where id=$1',[freshId])).status==='completed'&&await reserve(fresh)==='reserved'&&nativeRenders===1&&uploads===1);
  for(const mode of ['upload-lost','receipt-lost']){
    workerMode=mode;const recover=await ready(),id=await call('ensure_render_job',{p_job_id:recover.job}),before=nativeRenders;await execute(id);
    check(mode+' never prematurely restores usable output',await reserve(recover)==='reserved');
    const status=(await one('select status from render_jobs where id=$1',[id])).status;
    if(status!=='completed')await execute(id);
    check(mode+' recovers canonical output without rerender',(await one('select status from render_jobs where id=$1',[id])).status==='completed'&&nativeRenders===before+1);
  }
  workerMode='missing-source';const unavailable=await ready(),unavailableId=await call('ensure_render_job',{p_job_id:unavailable.job}),beforeMissing=nativeRenders;await execute(unavailableId);
  check('missing source fails before rendering and restores once',await reserve(unavailable)==='released'&&nativeRenders===beforeMissing);
  workerMode='timeout';const timeout=await ready(),timeoutId=await call('ensure_render_job',{p_job_id:timeout.job});
  await execute(timeoutId);check('render timeout retains reservation for bounded retry',await reserve(timeout)==='reserved');
  await execute(timeoutId);await execute(timeoutId);check('third definitive timeout restores reservation',await reserve(timeout)==='released');
  check('worker normal and failure exits remove owned scratch',(await Promise.all(scratch.map(d=>fs.stat(d).catch(()=>null)))).every(v=>v===null));
  console.log(JSON.stringify({checks:count,scope:'isolated actual migrations/RPCs; explicit storage and auth fixtures'}));
}finally{await pg.close();}
