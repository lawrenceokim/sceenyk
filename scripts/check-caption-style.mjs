import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';

const {pg,db,call,one,scalar,fixture}=await compositionFixtureDatabase();
const previousFalKey=process.env.FAL_KEY;
process.env.FAL_KEY='fixture-never-used-for-http';
const checks=[];const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
let user=null;
const load=typescriptLoader({
  '@/lib/db/server':{createDatabaseClient:()=>db},
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>{if(!user)throw new Error('AUTH_REQUIRED');return{id:user};}},
});
const styleModule=load('lib/captions/style.ts');
const captions=load('lib/captions/server.ts');
const handoff=load('lib/captions/renderer-payload.ts');
const renderer=load('lib/captions/renderer-server.ts');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
async function ready() {
  const f=await fixture();
  await call('claim_composition_generation',{p_job_id:f.job,p_run_id:f.run,p_configuration:f.configuration});
  for(const scene of f.scenes)for(const track of ['visual','narration']){
    const ref=await call('composition_asset_ref',{p_scene_id:scene.id,p_track:track});
    if(ref)await call('record_composition_asset_check',{p_job_id:f.job,p_run_id:f.run,p_scene_id:scene.id,p_track:track,p_duration_ms:ref.duration_ms,p_issue:null});
  }
  assert.equal(await call('finish_composition_generation',{p_job_id:f.job,p_run_id:f.run}),'ready');
  const source=await call('caption_source',{p_job_id:f.job});
  const track=load('lib/captions/build.ts').buildCaptionTrack(source);
  assert.ok(await call('persist_caption_track',{p_job_id:f.job,p_track:track}));
  return {f,track,source};
}
async function denied(name,sql,args=[],role='authenticated') {
  await pg.exec('set role '+role);let refused=false;
  try{await pg.query(sql,args);}catch{refused=true;}finally{await pg.exec('reset role');}
  check(name,refused);
}
try {
  const {f,track,source}=await ready(),ref={projectId:f.project,jobId:f.job};user=f.owner;
  const originalJob=JSON.stringify(await one('select * from generation_jobs where id=$1',[f.job]));
  const originalTrack=JSON.stringify(await one('select * from caption_tracks where job_id=$1',[f.job]));
  const initial=await captions.getOwnedCaptions(ref);
  check('default style resolves without a preference row',same(initial.style,styleModule.defaultCaptionStyleSelection)&&initial.enabled);
  for(const preset of ['default','clean','bold']){
    const selection=styleModule.selectionForCaptionPreset(preset),resolved=styleModule.resolveCaptionStyle(selection,'16:9');
    check(`${preset} preset resolves deterministically`,same(resolved,styleModule.resolveCaptionStyle(selection,'16:9'))&&resolved.preset===preset);
    check(`${preset} preset has renderer-safe values`,styleModule.resolvedCaptionStyleSchema.safeParse(resolved).success&&resolved.safe_area_percent.horizontal===8);
  }
  check('Clean uses shadow without backing',styleModule.resolveCaptionStyle(styleModule.selectionForCaptionPreset('clean'),'16:9').background_opacity===0);
  check('Bold uses larger stronger text',styleModule.resolveCaptionStyle(styleModule.selectionForCaptionPreset('bold'),'16:9').font_weight===700&&styleModule.resolveCaptionStyle(styleModule.selectionForCaptionPreset('bold'),'16:9').font_size_height_percent===5.4);
  check('high contrast retains stronger preview text',styleModule.resolveCaptionStyle({...styleModule.defaultCaptionStyleSelection,contrast:'high'},'16:9').font_weight===700);
  const portrait=styleModule.resolveCaptionStyle(styleModule.selectionForCaptionPreset('default'),'9:16');
  check('portrait bottom remains inside safe margins',portrait.safe_area_percent.horizontal===10&&portrait.safe_area_percent.vertical===18);
  const top=styleModule.resolveCaptionStyle({...styleModule.defaultCaptionStyleSelection,position:'top'},'9:16');
  check('portrait top remains inside safe margins',top.safe_area_percent.horizontal===10&&top.safe_area_percent.vertical===10);
  for(const [name,change] of [['unknown preset',{preset:'provider'}],['unknown size',{size:'giant'}],
    ['raw CSS',{color:'red'}],['invalid version',{schema_version:2}],['bad opacity',{background_opacity:2}]]){
    check(`rejects ${name}`,!styleModule.captionStyleSelectionSchema.safeParse({...styleModule.defaultCaptionStyleSelection,...change}).success);
  }
  let selection=styleModule.selectionForCaptionPreset('clean');
  check('owner saves Clean',await captions.setOwnedCaptionStyle({...ref,style:selection}));
  check('Clean survives independent read',same((await captions.getOwnedCaptions(ref)).style,selection));
  check('same save reuses one preference row',await captions.setOwnedCaptionStyle({...ref,style:selection})&&
    await scalar('select count(*)::int as value from caption_preferences where job_id=$1',[f.job])===1);
  check('style update keeps enabled choice',await captions.setOwnedCaptionPreference({...ref,enabled:false})&&
    same((await captions.getOwnedCaptions(ref)).style,selection)&&!(await captions.getOwnedCaptions(ref)).enabled);
  selection={...styleModule.selectionForCaptionPreset('bold'),position:'top',alignment:'left'};
  check('owner updates same row with Bold, top and left',await captions.setOwnedCaptionStyle({...ref,style:selection})&&
    same((await captions.getOwnedCaptions(ref)).style,selection)&&
    await scalar('select count(*)::int as value from caption_preferences where job_id=$1',[f.job])===1);
  check('caption workflow retry preserves style and the one track',await captions.buildOrReuseCaptions(f.job)===JSON.parse(originalTrack).id&&
    same((await captions.getOwnedCaptions(ref)).style,selection)&&
    await scalar('select count(*)::int as value from caption_tracks where job_id=$1',[f.job])===1);
  const saved=await renderer.readRendererCaptionPayload(f.job),expected=handoff.serializeRendererCaptions({track,plan:source.plan,style:selection,enabled:false});
  check('renderer reads exact persisted appearance and enabled choice',same(saved,expected)&&saved.style.position==='top'&&saved.style.alignment==='left'&&!saved.enabled);
  check('renderer carries canonical cue timing unchanged',saved.cues[0].start_ms===track.cues[0].start_ms&&saved.cues[0].end_ms===track.cues[0].end_ms);
  check('renderer payload has no private URL or provider ID',!/(https?:|storage_key|provider|narration_id|secret|token=)/i.test(JSON.stringify(saved)));
  check('renderer handoff schema accepts only exact safe shape',handoff.rendererCaptionPayloadSchema.safeParse(saved).success&&
    !handoff.rendererCaptionPayloadSchema.safeParse({...saved,renderReady:true}).success);
  const invalid={...selection,position:'outside'};
  check('server rejects invalid style',await captions.setOwnedCaptionStyle({...ref,style:invalid})===false);
  check('database rejects invalid style',!(await db.rpc('set_caption_style',{p_owner_user_id:f.owner,p_job_id:f.job,p_project_id:f.project,p_style:invalid})).data);
  const other=await ready();user=other.f.owner;
  check('User B cannot read A style',await captions.getOwnedCaptions(ref)===null);
  check('User B cannot edit A style',await captions.setOwnedCaptionStyle({...ref,style:styleModule.defaultCaptionStyleSelection})===false);
  check('database refuses cross-owner style upsert',await call('set_caption_style',{p_owner_user_id:other.f.owner,p_job_id:f.job,p_project_id:f.project,p_style:styleModule.defaultCaptionStyleSelection})===false);
  check('style requires a ready persisted caption track',await call('set_caption_style',{p_owner_user_id:other.f.owner,p_job_id:randomUUID(),p_project_id:other.f.project,p_style:styleModule.defaultCaptionStyleSelection})===false);
  user=null;await assert.rejects(()=>captions.getOwnedCaptions(ref),/AUTH_REQUIRED/);check('signed-out style read denied',true);
  for(const role of ['anon','authenticated']){
    await denied(`${role} cannot read style row`,'select style from caption_preferences',[],role);
    await denied(`${role} cannot update style row`,'update caption_preferences set style=$1',[selection],role);
    await denied(`${role} cannot execute style RPC`,'select set_caption_style($1,$2,$3,$4)',[f.owner,f.job,f.project,selection],role);
  }
  check('style saves do not modify generation or caption track',JSON.stringify(await one('select * from generation_jobs where id=$1',[f.job]))===originalJob&&
    JSON.stringify(await one('select * from caption_tracks where job_id=$1',[f.job]))===originalTrack);
  check('style saves create no render job',await scalar('select count(*)::int as value from render_jobs where generation_job_id=$1',[f.job])===0);
  await pg.exec(fs.readFileSync('supabase/migrations/20261013001900_caption_style.sql','utf8'));
  check('migration 019 reruns transactionally without resetting saved style',same((await one('select style from caption_preferences where job_id=$1',[f.job])).style,selection));
  console.log(JSON.stringify({passed:checks.length,checks,realProviderCalls:0,realRenderCalls:0}));
}finally{if(previousFalKey===undefined)delete process.env.FAL_KEY;else process.env.FAL_KEY=previousFalKey;await pg.close();}
