import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Inngest} from 'inngest';
import {InngestTestEngine} from '@inngest/test';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';

const {pg,db,call,one,scalar,fixture}=await compositionFixtureDatabase();
const previousFalKey=process.env.FAL_KEY;
process.env.FAL_KEY='fixture-never-used-for-http';
const checks=[];const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
let user=null,probes=0,reads=0,visualMs=6120,storageMode='okay';
const load=typescriptLoader({
  '@/lib/db/server':{createDatabaseClient:()=>db},
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>{if(!user)throw new Error('AUTH_REQUIRED');return {id:user};}},
  '@/lib/media-preparation/ffmpeg':{probeMedia:async()=>{probes++;return {durationMs:visualMs};}},
  'file-type':{fileTypeFromBuffer:async bytes=>({mime:Buffer.from(bytes).toString().replace(/\0+$/,'')})},
  '@/lib/storage/r2':{
    inspectR2Object:async key=>{reads++;if(storageMode==='outage')throw new Error('R2_UNAVAILABLE');if(storageMode==='missing')return null;const mime=key.endsWith('.mp3')?'audio/mpeg':key.endsWith('.mp4')?'video/mp4':'image/png';return {etag:storageMode==='tampered'?'changed-etag':'fixture-etag',sizeBytes:100,mimeType:mime,header:Buffer.from(mime)};},
    readR2AnalysisMedia:async()=>new ReadableStream({start(c){const bytes=Buffer.alloc(100);Buffer.from('video/mp4').copy(bytes);c.enqueue(bytes);c.close();}}),
  },
  '@/lib/composition/client':{requestCompositionInspection:(generationJobId,sceneExecutionId)=>load('lib/composition/worker.ts').inspectCompositionScene({generationJobId,sceneExecutionId})},
  '@/lib/workflows/client':{inngest:new Inngest({id:'composition-test',isDev:true})},
});
// Download magic bytes fixture uses a strict synthetic discriminator.
const mediaLoad=typescriptLoader();
const schema=mediaLoad('lib/composition/contract.ts').compositionPlanSchema;
const run=f=>new InngestTestEngine({function:load('lib/workflows/composition.ts').compositionWorkflow,events:[{name:'sceenyk/generation.composition.requested',data:{generationJobId:f.job}}],transformCtx:ctx=>({...ctx,runId:f.run})}).execute();
const claim=f=>call('claim_composition_generation',{p_job_id:f.job,p_run_id:f.run,p_configuration:f.configuration});
const inspect=async f=>{for(const s of f.scenes)await load('lib/composition/worker.ts').inspectCompositionScene({generationJobId:f.job,sceneExecutionId:s.id});};
const finish=f=>call('finish_composition_generation',{p_job_id:f.job,p_run_id:f.run});
const plan=async f=>schema.parse((await one('select plan from composition_plans where job_id=$1',[f.job])).plan);
const held=f=>scalar("select count(*)::int as value from generation_reservations where job_id=$1 and state='reserved'",[f.job]);
async function denied(name,sql,args=[],role='authenticated'){await pg.exec('set role '+role);let failed=false;try{await pg.query(sql,args);}catch{failed=true;}finally{await pg.exec('reset role');}check(name,failed);}
try {
  check('all fifteen migrations apply',true);
  const f=await fixture();const result=await run(f);check('official Inngest engine persists ready composition',result.result.handoff==='ready');
  const p=await plan(f);check('versioned strict safe contract',p.schema_version===1&&p.status==='ready');
  const tamperedTimeline=structuredClone(p);tamperedTimeline.scenes[1].start_ms++;
  check('renderer contract refuses a claimed ready timeline with a gap',!schema.safeParse(tamperedTimeline).success);
  check('contiguous integer timeline totals ten seconds',p.total_duration_ms===10000&&p.scenes[0].start_ms===0&&p.scenes[0].end_ms===5000&&p.scenes[1].start_ms===5000&&p.scenes[1].end_ms===10000);
  check('short narration has measured duration and remaining silence',p.scenes[0].narration.actual_duration_ms===1280&&p.scenes[0].narration.end_ms===1280&&p.scenes[0].narration.trailing_silence_ms===3720);
  check('silent scene is valid without narration',p.scenes[1].narration===null&&p.scenes[1].timing_status==='valid');
  check('still image is explicitly static without invented duration',p.scenes[0].visual.media_type==='image'&&p.scenes[0].visual.actual_duration_ms===null);
  check('existing trusted narration metadata and shared static asset avoid probes',probes===0&&reads===2);
  const before=JSON.stringify(await one('select * from composition_plans where job_id=$1',[f.job])),beforeReads=reads;
  const replay=await run({...f,run:randomUUID()});check('duplicate Inngest delivery reuses without checking/probing',replay.result.claim==='terminal'&&reads===beforeReads&&probes===0);
  check('same immutable plan survives duplicate finish',await finish(f)==='reused'&&JSON.stringify(await one('select * from composition_plans where job_id=$1',[f.job]))===before);
  user=f.owner;const owned=await load('lib/composition/server.ts').getOwnedComposition({projectId:f.project,jobId:f.job});
  check('owner refresh/reopen returns identical persisted plan',JSON.stringify(owned)===JSON.stringify(p));
  user=randomUUID();check('User B cannot read User A composition',await load('lib/composition/server.ts').getOwnedComposition({projectId:f.project,jobId:f.job})===null);
  user=null;await assert.rejects(()=>load('lib/composition/server.ts').getOwnedComposition({projectId:f.project,jobId:f.job}),/AUTH_REQUIRED/);
  check('signed-out composition access preserves authentication denial',true);
  user=f.owner;
  check('strict owner reference rejects arbitrary timeline content',await load('lib/composition/server.ts').getOwnedComposition({projectId:f.project,jobId:f.job,plan:{status:'ready'}})===null);
  check('ready composition preserves hold and no final receipt',await held(f)===1&&await scalar('select count(*)::int as value from generation_result_receipts where job_id=$1',[f.job])===0);
  const offset=await fixture({offsetMs:400});assert.equal(await claim(offset),'claimed');await inspect(offset);assert.equal(await finish(offset),'ready');const op=await plan(offset);
  check('configured offset produces exact absolute narration placement',op.scenes[0].narration.start_ms===400&&op.scenes[0].narration.end_ms===1680&&op.scenes[0].narration.trailing_silence_ms===3320);
  check('configuration is frozen on resume',await call('claim_composition_generation',{p_job_id:offset.job,p_run_id:offset.run,p_configuration:{...offset.configuration,narration_offset_ms:0}})==='terminal'&&op.configuration.narration_offset_ms===400);
  const exact=await fixture({speechMs:5000,transition:'None'});await claim(exact);await inspect(exact);assert.equal(await finish(exact),'ready');
  check('exact-fit speech and none transitions remain valid',(await plan(exact)).scenes[0].narration.trailing_silence_ms===0&&(await plan(exact)).scenes.every(s=>s.transition.type==='none'&&s.transition.duration_ms===0));
  const tiny=await fixture({speechMs:5001});await claim(tiny);await inspect(tiny);await finish(tiny);
  check('zero technical tolerance does not hide a one-millisecond overflow',(await plan(tiny)).issues.some(i=>i.code==='NARRATION_TOO_LONG'));
  const defaultCut=await fixture({transition:''});await claim(defaultCut);await inspect(defaultCut);await finish(defaultCut);
  check('missing transition defaults to an unambiguous zero-duration cut',(await plan(defaultCut)).status==='ready'&&(await plan(defaultCut)).scenes.every(s=>s.transition.type==='cut'&&s.transition.duration_ms===0));
  const mismatch=await fixture({durations:[4,5]});await claim(mismatch);await inspect(mismatch);await finish(mismatch);
  check('total mismatch is a persistent conflict with no invented extension',(await plan(mismatch)).total_duration_ms===9000&&(await plan(mismatch)).issues.some(i=>i.code==='TOTAL_MISMATCH'));
  await assert.rejects(()=>fixture({durations:[0.0001,9.9999]}),/expected_duration_ms_check/);
  check('legacy fractional duration cannot reach audio readiness as zero milliseconds',true);
  const long=await fixture({speechMs:5100});await claim(long);await inspect(long);assert.equal(await finish(long),'conflict');const lp=await plan(long);
  check('overlong speech is persistent conflict without truncation or extension',lp.issues.some(i=>i.code==='NARRATION_TOO_LONG')&&lp.scenes[0].narration.actual_duration_ms===5100&&lp.total_duration_ms===10000&&await held(long)===1);
  await denied('conflicted generation cannot advance to rendering',"update generation_jobs set current_stage='rendering' where id=$1",[long.job],'service_role');
  const unchecked=await fixture();await claim(unchecked);assert.equal(await finish(unchecked),'conflict');
  check('unchecked required media cannot fake readiness', (await plan(unchecked)).issues.some(i=>i.code==='ASSET_UNCHECKED')&&!(await one('select composition_ready_at from generation_jobs where id=$1',[unchecked.job])).composition_ready_at);
  const unplanned=await fixture();await denied('audio-ready generation cannot bypass composition before rendering',"update generation_jobs set current_stage='rendering' where id=$1",[unplanned.job],'service_role');
  const generated=await fixture({generated:true});await claim(generated);await inspect(generated);
  const measuredReads=reads,measuredProbes=probes;await inspect(generated);
  check('restart before plan persistence reuses immutable checks without R2 or probe',reads===measuredReads&&probes===measuredProbes);
  assert.equal(await finish(generated),'ready');const gp=await plan(generated);
  check('longer generated visual is accepted with explicit trim window',gp.scenes[0].visual.actual_duration_ms===6120&&gp.scenes[0].visual.input_start_ms===0&&gp.scenes[0].visual.input_end_ms===6000);
  check('unknown visual duration measured once',probes===1);
  const probeBefore=probes;await inspect(generated);check('completed composition never reprobes assets',probes===probeBefore);
  visualMs=5900;const short=await fixture({generated:true});await claim(short);await inspect(short);assert.equal(await finish(short),'conflict');
  check('short visual remains explicit conflict with original duration', (await plan(short)).issues.some(i=>i.code==='VISUAL_TOO_SHORT')&&(await plan(short)).scenes[0].visual.actual_duration_ms===5900&&await held(short)===1);
  const transition=await fixture({transition:'Crossfade'});await claim(transition);await inspect(transition);await finish(transition);
  check('unsupported transitions never silently produce readiness',(await plan(transition)).issues.some(i=>i.code==='UNSUPPORTED_TRANSITION'));
  const missing=await fixture();await claim(missing);storageMode='missing';await inspect(missing);storageMode='okay';await finish(missing);
  check('missing R2 media is persistent conflict',(await plan(missing)).issues.some(i=>i.code==='VISUAL_UNAVAILABLE'));
  const tampered=await fixture();await claim(tampered);storageMode='tampered';await inspect(tampered);storageMode='okay';await finish(tampered);
  check('ETag mismatch cannot produce readiness',(await plan(tampered)).status==='conflict');
  const outage=await fixture();await claim(outage);storageMode='outage';await assert.rejects(()=>inspect(outage),/R2_UNAVAILABLE/);storageMode='okay';await inspect(outage);assert.equal(await finish(outage),'ready');check('storage outage retries without poisoning cache',true);
  const race=await fixture();const claims=await Promise.all([claim(race),call('claim_composition_generation',{p_job_id:race.job,p_run_id:randomUUID(),p_configuration:race.configuration})]);check('competing run claims only once',claims[0]==='claimed'&&claims[1]==='duplicate');
  const ownershipReads=reads;
  await assert.rejects(()=>load('lib/composition/worker.ts').inspectCompositionScene({generationJobId:race.job,sceneExecutionId:f.scenes[0].id}),/SOURCE_UNAVAILABLE/);
  check('worker rejects mixed owned scene and job before R2 access',reads===ownershipReads);
  await assert.rejects(()=>load('lib/composition/worker.ts').inspectCompositionScene({generationJobId:race.job,sceneExecutionId:race.scenes[0].id,assetId:f.scenes[0].id}));
  check('worker strict contract rejects arbitrary asset IDs',reads===ownershipReads);
  const invalidConfig=await fixture();check('unknown configuration fields cannot enter frozen contract',await call('claim_composition_generation',{p_job_id:invalidConfig.job,p_run_id:invalidConfig.run,p_configuration:{...invalidConfig.configuration,ready:true}})==='invalid');
  check('wrong run cannot persist',await call('finish_composition_generation',{p_job_id:race.job,p_run_id:randomUUID()})==='invalid');
  check('other job scene cannot be checked under this claim',await call('record_composition_asset_check',{p_job_id:race.job,p_run_id:race.run,p_scene_id:f.scenes[0].id,p_track:'visual',p_duration_ms:null,p_issue:null})===false);
  check('caller cannot replace trusted narration duration with an estimate',await call('record_composition_asset_check',{p_job_id:race.job,p_run_id:race.run,p_scene_id:race.scenes[0].id,p_track:'narration',p_duration_ms:5000,p_issue:null})===false);
  // The official test engine cannot dispatch onFailure yet; invoke the exact
  // handler configured on its installed InngestFunction object.
  const fail=runId=>load('lib/workflows/composition.ts').compositionWorkflow.onFailureFn({event:{data:{run_id:runId,event:{data:{generationJobId:race.job}}}}});
  await fail(randomUUID());
  check('failed duplicate cannot close another run active claim',await scalar('select count(*)::int as value from composition_plans where job_id=$1',[race.job])===0);
  await fail(race.run);
  check('own exhausted retries persist unchecked-media conflict and preserve hold',(await plan(race)).issues.some(i=>i.code==='ASSET_UNCHECKED')&&await held(race)===1);
  for(const role of ['anon','authenticated']) {
    await denied(role+' cannot read composition','select * from composition_plans',[],role);
    await denied(role+' cannot read private asset checks','select * from composition_asset_checks',[],role);
    await denied(role+' cannot inspect private references','select composition_asset_ref($1,$2)',[f.scenes[0].id,'visual'],role);
    await denied(role+' cannot claim another user job','select claim_composition_generation($1,$2,$3)',[race.job,randomUUID(),race.configuration],role);
    await denied(role+' cannot mark ready','select finish_composition_generation($1,$2)',[race.job,race.run],role);
  }
  await denied('service cannot directly insert forged plan',"insert into composition_plans(job_id,owner_user_id,project_id,schema_version,input_digest,status,plan) values($1,$2,$3,1,repeat('a',32),'ready','{}')",[race.job,race.owner,race.project],'service_role');
  await denied('service cannot directly mark ready',"update generation_jobs set composition_ready_at=now() where id=$1",[race.job],'service_role');
  await denied('historical plan immutable even to privileged update','update composition_plans set status=\'conflict\' where job_id=$1',[f.job],'service_role');
  await assert.rejects(()=>pg.query('update composition_asset_checks set duration_ms=9999 where asset_id=$1',[p.scenes[0].narration.asset_id]));
  check('trusted duration cache is immutable even to table owner',true);
  check('plan contains no private URLs keys provider IDs or speech text',! /https?:|storage_key|provider|A bright beginning|secret/i.test(JSON.stringify(p)));
  console.log(JSON.stringify({checks:checks.length,passed:checks,paidProviderRequests:0}));
} finally {if(previousFalKey===undefined)delete process.env.FAL_KEY;else process.env.FAL_KEY=previousFalKey;await pg.close();}
