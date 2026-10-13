import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Inngest} from 'inngest';
import {InngestTestEngine} from '@inngest/test';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';

const {pg,db,call,one,scalar,fixture}=await compositionFixtureDatabase();
const previousFalKey=process.env.FAL_KEY;
process.env.FAL_KEY='fixture-never-used-for-http';
let user=null;const checks=[];
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
const load=typescriptLoader({
  '@/lib/db/server':{createDatabaseClient:()=>db},
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>{if(!user)throw new Error('AUTH_REQUIRED');return{id:user};}},
  '@/lib/workflows/client':{inngest:new Inngest({id:'caption-test',isDev:true})},
});
const {buildCaptionTrack}=load('lib/captions/build.ts');
const {captionTrackSchema,captionStyle,validateCaptionSource}=load('lib/captions/contract.ts');
const {exportCaptions,captionTimestamp}=load('lib/captions/export.ts');
const service=load('lib/captions/server.ts');
async function ready(options={}) {
  const f=await fixture(options);
  await call('claim_composition_generation',{p_job_id:f.job,p_run_id:f.run,p_configuration:f.configuration});
  for(const scene of f.scenes) for(const track of ['visual','narration']) {
    const ref=await call('composition_asset_ref',{p_scene_id:scene.id,p_track:track});
    if(ref) await call('record_composition_asset_check',{p_job_id:f.job,p_run_id:f.run,p_scene_id:scene.id,p_track:track,p_duration_ms:ref.duration_ms,p_issue:null});
  }
  assert.equal(await call('finish_composition_generation',{p_job_id:f.job,p_run_id:f.run}),'ready');
  return f;
}
const source=f=>call('caption_source',{p_job_id:f.job});
const stored=f=>one('select * from caption_tracks where job_id=$1',[f.job]);
const execute=f=>new InngestTestEngine({function:load('lib/workflows/captions.ts').captionsWorkflow,
  events:[{name:'sceenyk/generation.captions.requested',data:{generationJobId:f.job}}]}).execute();
async function denied(name,sql,args=[],role='authenticated') {
  await pg.exec('set role '+role);let refused=false;
  try {await pg.query(sql,args);} catch {refused=true;} finally {await pg.exec('reset role');}
  check(name,refused);
}
const clone=x=>JSON.parse(JSON.stringify(x));
try {
  const f=await ready({offsetMs:400});const original=JSON.stringify(await one('select * from generation_jobs where id=$1',[f.job]));
  const originalSource=JSON.stringify(await source(f));
  const result=await execute(f),row=await stored(f),track=captionTrackSchema.parse(row.track);
  check('all eighteen migrations and official workflow persist captions',result.result.trackId===row.id&&track.status==='ready');
  check('short real-length narration makes a natural phrase',track.cues.length===1&&track.cues[0].text==='A bright beginning.');
  check('silent scene receives no cue',track.cues.every(c=>c.scene_order===1));
  check('measured 1280ms narration at 400ms offset is preserved',track.cues[0].start_ms===400&&track.cues[0].end_ms===1680);
  check('alignment is explicitly estimated',track.alignment==='estimated_phrase');
  await execute(f);await service.buildOrReuseCaptions(f.job);
  check('duplicate workflow and process retry reuse identical track and cues',JSON.stringify(await stored(f))===JSON.stringify(row));
  check('concurrent persistence creates one immutable row',(await Promise.all([call('persist_caption_track',{p_job_id:f.job,p_track:track}),call('persist_caption_track',{p_job_id:f.job,p_track:track})])).every(id=>id===row.id)&&await scalar('select count(*)::int as value from caption_tracks where job_id=$1',[f.job])===1);
  user=f.owner;const ref={projectId:f.project,jobId:f.job};
  check('owner read and refresh retain canonical data',JSON.stringify((await service.getOwnedCaptions(ref)).track)===JSON.stringify(track)&&JSON.stringify((await service.getOwnedCaptions(ref)).track)===JSON.stringify(track));
  check('default choice is On',(await service.getOwnedCaptions(ref)).enabled);
  check('Off persists across independent reads',await service.setOwnedCaptionPreference({...ref,enabled:false})&&(await service.getOwnedCaptions(ref)).enabled===false);
  check('On restores without rebuilding',await service.setOwnedCaptionPreference({...ref,enabled:true})&&(await stored(f)).id===row.id);
  const b=await ready();user=b.owner;
  check('User B cannot read A captions',await service.getOwnedCaptions(ref)===null);
  check('User B cannot edit A choice',await service.setOwnedCaptionPreference({...ref,enabled:false})===false);
  check('DB checks cross-owner preference',await call('set_caption_preference',{p_owner_user_id:b.owner,p_job_id:f.job,p_project_id:f.project,p_enabled:false})===false);
  check('mixed project/job denied',await service.getOwnedCaptions({jobId:f.job,projectId:b.project})===null);
  user=f.owner;
  check('browser cannot submit narration or readiness',await service.setOwnedCaptionPreference({...ref,enabled:false,narration_id:randomUUID(),status:'ready'})===false);
  user=null;await assert.rejects(()=>service.getOwnedCaptions(ref),/AUTH_REQUIRED/);check('unauthenticated access denied',true);
  const srt=exportCaptions(track,'srt'),vtt=exportCaptions(track,'vtt');
  check('SRT uses sequential indices comma milliseconds and measured endpoints',srt==='1\n00:00:00,400 --> 00:00:01,680\nA bright beginning.\n');
  check('VTT header dot milliseconds and measured endpoints',vtt==='WEBVTT\n\n1\n00:00:00.400 --> 00:00:01.680\nA bright beginning.\n');
  check('timestamp supports minute/hour carry',captionTimestamp(3_661_001,',')==='01:01:01,001');
  check('safe-area defaults work for landscape and portrait',['16:9','9:16'].every(a=>captionStyle.safe_area_percent[a].bottom>0&&captionStyle.safe_area_percent[a].horizontal>0&&2*captionStyle.safe_area_percent[a].horizontal<100)&&captionStyle.safe_area_percent['9:16'].bottom>captionStyle.safe_area_percent['16:9'].bottom);
  check('no job stage or accounting changes',JSON.stringify(await one('select * from generation_jobs where id=$1',[f.job]))===original&&await scalar("select count(*)::int as value from generation_reservations where job_id=$1 and state='reserved'",[f.job])===1);
  check('narration and composition unchanged',JSON.stringify(await source(f))===originalSource);
  check('no object URL or provider metadata in track/exports',!/(https?:|storage_key|provider_request|elevenlabs|token=)/i.test(JSON.stringify(track)+srt+vtt));

  const richer=clone(await source(f));richer.narration[0].text='The morning opens softly, a new story begins. We follow the light into another beautiful day.';
  richer.plan.scenes[0].narration.actual_duration_ms=4500;richer.narration[0].actual_duration_ms=4500;
  richer.plan.scenes[0].narration.end_ms=4900;richer.plan.scenes[0].narration.trailing_silence_ms=100;
  const phrases=buildCaptionTrack(richer);
  check('longer narration splits into multiple mobile phrases',phrases.status==='ready'&&phrases.cues.length>2&&phrases.cues.every(c=>c.text.split(' ').length>1));
  check('phrase text and stable order preserve original speech',phrases.cues.map(c=>c.text).join(' ')===richer.narration[0].text&&phrases.cues.every((c,i)=>c.cue_order===i+1));
  check('estimated timing stays in measured window',phrases.cues[0].start_ms===400&&phrases.cues.at(-1).end_ms===4900&&phrases.cues.every((c,i)=>c.end_ms>c.start_ms&&(!i||c.start_ms===phrases.cues[i-1].end_ms)));
  check('algorithm deterministic across reload/retry',JSON.stringify(buildCaptionTrack(richer))===JSON.stringify(phrases));
  const silent=clone(richer);silent.narration=[];silent.plan.scenes[0].narration=null;
  check('all-silent track is ready and empty',buildCaptionTrack(silent).status==='ready'&&buildCaptionTrack(silent).cues.length===0);
  const mismatch=clone(richer);mismatch.narration[0].output_asset_id=randomUUID();
  check('wrong narration asset fails closed',buildCaptionTrack(mismatch).status==='timing_issue');
  const impossible=clone(richer);impossible.narration[0].text='x'.repeat(80);
  const issue=buildCaptionTrack(impossible);
  check('unreadable token fails closed',issue.status==='timing_issue'&&issue.issue==='READABILITY_LIMIT'&&issue.cues.length===0);
  await assert.rejects(async()=>exportCaptions(issue,'vtt'));check('unready exports refused',true);
  const unsafe=clone(richer);unsafe.narration[0].text='https://private.invalid/file?token=secret';
  check('URLs cannot enter caption data',buildCaptionTrack(unsafe).status==='timing_issue');
  const foreign=clone(phrases);foreign.cues[0].scene_id=randomUUID();
  assert.throws(()=>validateCaptionSource(foreign,richer));check('client claimed scene fails contextual validation',true);
  for(const [name,mutate] of [
    ['negative start',t=>t.cues[0].start_ms=-1],['empty text',t=>t.cues[0].text=''],
    ['unordered cues',t=>t.cues[1].start_ms=0],['zero duration',t=>t.cues[0].end_ms=t.cues[0].start_ms],
    ['composition overflow',t=>t.cues.at(-1).end_ms=10001],['wrong generation',t=>t.cues[0].generation_job_id=randomUUID()],
  ]) {const t=clone(phrases);mutate(t);check('schema rejects '+name,!captionTrackSchema.safeParse(t).success);}

  // Mutations against an empty job prove DB validation independently of TS.
  const dbSource=await source(b),valid=buildCaptionTrack(dbSource);
  for(const [name,mutate] of [
    ['foreign narration',t=>t.cues[0].narration_id=track.cues[0].narration_id],
    ['foreign scene',t=>t.cues[0].scene_id=track.cues[0].scene_id],
    ['text mismatch',t=>t.cues[0].text='Fabricated words.'],
    ['audio overflow',t=>t.cues[0].end_ms=4000],
    ['missing speech',t=>t.cues=[]],['extra fields',t=>t.cues[0].provider_id='private'],
    ['URL text',t=>t.cues[0].text='https://private.invalid'],
  ]) {const bad=clone(valid);mutate(bad);await denied('SQL rejects '+name,'select persist_caption_track($1,$2)',[b.job,bad],'service_role');}
  check('invalid attempts never mark ready',!await stored(b));
  for(const role of ['anon','authenticated']) {
    await denied(role+' cannot read tracks','select * from caption_tracks',[],role);
    await denied(role+' cannot edit preferences','update caption_preferences set enabled=false',[],role);
    await denied(role+' cannot mark ready','select persist_caption_track($1,$2)',[b.job,valid],role);
    await denied(role+' cannot load source','select caption_source($1)',[b.job],role);
  }
  await denied('service direct insert is prohibited','insert into caption_tracks(job_id,owner_user_id,project_id,input_digest,track) values($1,$2,$3,$4,$5)',[b.job,b.owner,b.project,'0'.repeat(32),valid],'service_role');
  await denied('track immutable','update caption_tracks set track=$1 where job_id=$2',[track,f.job],'postgres');
  check('reconciliation excludes persisted tracks',(await pg.query('select * from caption_dispatch_candidates()')).rows.every(c=>c.job_id!==f.job));
  console.log(JSON.stringify({passed:checks.length,checks}));
} finally {if(previousFalKey===undefined)delete process.env.FAL_KEY;else process.env.FAL_KEY=previousFalKey;await pg.close();}
