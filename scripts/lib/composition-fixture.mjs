// Real migrations/RPCs; synthetic media and provider-free completed fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {typescriptLoader} from './load-typescript.mjs';

export async function compositionFixtureDatabase() {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) await pg.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
  const one = async (sql,args=[]) => (await pg.query(sql,args)).rows[0];
  const scalar = async (sql,args=[]) => (await one(sql,args))?.value;
  let queue = Promise.resolve();
  const serialize = fn => { const next=queue.then(fn); queue=next.catch(()=>{}); return next; };
  const db = {
    rpc(name,args={}) { return serialize(async()=>{ await pg.exec('set role service_role'); try {
      const value=await scalar(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) as value`,Object.values(args));
      return {data:value,error:null};
    } catch(e) { return {data:null,error:{code:e.code,message:e.message}}; } finally { await pg.exec('reset role'); } }); },
    from(table) { const filters=[],args=[];let fields='*',sort=''; return {
      select(v){fields=v;return this;},eq(k,v){args.push(v);filters.push(`${k}=$${args.length}`);return this;},order(k){sort=` order by ${k}`;return this;},
      then(resolve,reject){return this.execute(false).then(resolve,reject);},maybeSingle(){return this.execute(true);},single(){return this.execute(true);},
      execute(single){return serialize(async()=>{try {const rows=(await pg.query(`select ${fields} from ${table}${filters.length?' where '+filters.join(' and '):''}${sort}`,args)).rows;return {data:single?rows[0]??null:rows,error:null};}catch(e){return {data:null,error:{code:e.code,message:e.message}};}});},
    }; },
  };
  const call = async(name,args) => { const r=await db.rpc(name,args); assert.equal(r.error,null,r.error?.message);return r.data; };
  const load=typescriptLoader();
  async function fixture({generated=false,speechMs=1280,offsetMs=0,transition='Cut',durations=[5,5],paidCredits=null}={}) {
    if(generated)durations=[6,4];
    const owner=await scalar('insert into app_users(clerk_user_id) values($1) returning id as value',[randomUUID()]);
    if(paidCredits!==null)await pg.query('update generation_accounts set free_consumed=2,credit_available=100 where owner_user_id=$1',[owner]);
    const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Composition fixture','cinematic','16:9','10','Original','Storytelling') returning id as value",[owner]);
    const asset=randomUUID();
    await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'fixture.png','image/png',100,'image','uploaded','fixture-etag')",[asset,owner,project,randomUUID(),`users/${owner}/projects/${project}/${asset}/${randomUUID()}`]);
    const input={version:1,prompt:'Composition acceptance',category:'cinematic',settings:{duration:'10',aspectRatio:'16:9',visualStyle:'Original',tone:'Storytelling'},assetIds:[asset]};
    const quote=await call('issue_generation_quote',{p_owner_user_id:owner,p_project_id:project,p_request_id:randomUUID(),p_snapshot:input,p_credit_cost:paidCredits,p_pricing_version:'fixture',p_pricing_mode:paidCredits===null?'unconfigured':'test'});
    const admitted=await call('confirm_generation_quote',{p_owner_user_id:owner,p_quote_id:quote.quote.id,p_current_pricing_version:'fixture'});assert.equal(admitted.code,'ACCEPTED');
    const job=admitted.job_id,run=randomUUID();
    await call('claim_generation_job',{p_job_id:job,p_run_id:run});
    await call('advance_generation_analysis',{p_job_id:job,p_run_id:run,p_stage:'planning'});
    const attempt=await call('begin_generation_analysis',{p_job_id:job,p_run_id:run,p_attempt:1,p_model:'fixture'});
    const plan={schemaVersion:1,summary:'Timing fixture',contentIntent:'Test',sourceMediaSummary:[{assetId:asset,summary:'Synthetic',durationSeconds:null}],targetDuration:10,aspectRatio:'16:9',tone:'Storytelling',visualStyle:'Original',narrationRequired:true,scenePlan:durations.map((durationSeconds,i)=>({order:i+1,durationSeconds,purpose:'Test',source:generated&&i===0?'generated':'original',assetId:generated&&i===0?null:asset,startTime:null,endTime:null,description:'A scene',transformationInstruction:null,narration:i===0?'A bright beginning.':null,caption:null,transition})),audioNotes:[],editingNotes:[]};
    assert.equal(await call('finish_generation_analysis',{p_job_id:job,p_run_id:run,p_attempt_id:attempt.attempt_id,p_plan:plan,p_usage:{},p_model:'fixture',p_response_id:null,p_failure:null}),true);
    const visualRun=randomUUID();await call('claim_visual_generation',{p_job_id:job,p_run_id:visualRun});
    assert.equal(await call('prepare_visual_scenes',{p_job_id:job,p_run_id:visualRun,p_scenes:load('lib/video-ai/mapping.ts').mapVisualScenes(plan,[{id:asset,mimeType:'image/png',sizeBytes:100}])}),true);
    const scenes=(await pg.query('select * from scene_executions where job_id=$1 order by scene_order',[job])).rows;
    if(generated) for(const s of scenes.filter(s=>s.operation!=='reuse')) {
      assert.equal(await call('begin_visual_submission',{p_scene_id:s.id,p_run_id:visualRun}),true);
      assert.equal(await call('record_visual_task',{p_scene_id:s.id,p_run_id:visualRun,p_task_id:randomUUID(),p_estimated_credits:null}),true);
      assert.equal(await call('complete_visual_scene',{p_scene_id:s.id,p_run_id:visualRun,p_size_bytes:100,p_etag:'fixture-etag'}),true);
    }
    assert.equal(await call('finish_visual_generation',{p_job_id:job,p_run_id:visualRun}),'visuals_ready');
    const voiceRun=randomUUID();assert.equal(await call('claim_narration_generation',{p_job_id:job,p_run_id:voiceRun,p_configuration:load('lib/voice-ai/config.ts').getVoiceConfiguration('Storytelling')}),'claimed');
    const segment=await one("select * from narration_segments where job_id=$1 and status<>'skipped'",[job]);
    assert.equal(await call('begin_narration_submission',{p_segment_id:segment.id,p_run_id:voiceRun}),true);
    assert.equal(await call('complete_narration_segment',{p_segment_id:segment.id,p_run_id:voiceRun,p_metadata:{etag:'fixture-etag',sizeBytes:100,durationMs:speechMs,sampleRate:44100,channels:1}}),true);
    assert.equal(await call('finish_narration_generation',{p_job_id:job,p_run_id:voiceRun}),'audio_ready');
    return {job,owner,project,scenes,run:randomUUID(),configuration:{schema_version:1,narration_offset_ms:offsetMs,technical_tolerance_ms:0}};
  }
  return {pg,db,call,one,scalar,fixture};
}
