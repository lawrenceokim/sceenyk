import assert from 'node:assert/strict';
import {typescriptLoader} from './lib/load-typescript.mjs';

const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const project='33333333-3333-4333-8333-333333333333', job='44444444-4444-4444-8444-444444444444';
const sceneId='55555555-5555-4555-8555-555555555555', secondId='66666666-6666-4666-8666-666666666666';
const assetId='77777777-7777-4777-8777-777777777777';
const visual={asset_kind:'prepared_segment',asset_id:assetId,media_type:'video',actual_duration_ms:6000,input_start_ms:1000,input_end_ms:6000};
const first={scene_execution_id:sceneId,scene_order:1,start_ms:0,end_ms:5000,duration_ms:5000,visual,
  narration:{asset_id:'88888888-8888-4888-8888-888888888888',start_offset_ms:0,actual_duration_ms:1280,start_ms:0,end_ms:1280,trailing_silence_ms:3720},
  transition:{type:'cut',duration_ms:0},timing_status:'valid'};
const second={...first,scene_execution_id:secondId,scene_order:2,start_ms:5000,end_ms:10000,visual:{...visual,input_start_ms:0,input_end_ms:5000,actual_duration_ms:5000},narration:null};
const plan={schema_version:1,generation_job_id:job,aspect_ratio:'16:9',total_duration_ms:10000,
  configuration:{schema_version:1,narration_offset_ms:0,technical_tolerance_ms:0},status:'ready',issues:[],scenes:[first,second]};
const cue={id:'s1-c1',generation_job_id:job,scene_id:sceneId,scene_order:1,narration_id:first.narration.asset_id,
  start_ms:0,end_ms:1280,text:'A measured caption',cue_order:1};
const track={cues:[cue]};
const timing=typescriptLoader()('lib/captions/preview-timing.ts');
const {captionStyle}=typescriptLoader()('lib/captions/contract.ts');
assert.equal(timing.compositionTimeForScene(first,1000),0);
assert.equal(timing.compositionTimeForScene(first,2280),1280);
assert.equal(timing.activeCaptionCue(track,first,1000)?.id,cue.id);
assert.equal(timing.activeCaptionCue(track,first,2279)?.id,cue.id);
assert.equal(timing.activeCaptionCue(track,first,2280),null);
assert.equal(timing.activeCaptionCue(track,first,5000),null);
assert.equal(timing.activeCaptionCue(track,second,0),null);
assert.equal(timing.compositionTimeForScene(second,1000),6000);
const portrait={...plan,aspect_ratio:'9:16'};
assert.equal(timing.activeCaptionCue({...track,aspect_ratio:portrait.aspect_ratio},first,1000)?.id,cue.id);
assert.deepEqual({...captionStyle.safe_area_percent['9:16']},{horizontal:10,bottom:18});
assert.deepEqual({...captionStyle.safe_area_percent['16:9']},{horizontal:8,bottom:8});

let identity=owner, signed=0, resolved={kind:'prepared_segment',id:assetId,storage_key:`users/${owner}/projects/${project}/scene.mp4`,
  verified_etag:'etag',mime_type:'video/mp4',size_bytes:1000,duration_ms:6000,is_static:false};
const rows={projects:[{id:project,owner_user_id:owner}],generation_jobs:[{id:job,project_id:project,owner_user_id:owner,composition_ready_at:'ready'}],
  composition_plans:[{job_id:job,project_id:project,owner_user_id:owner,status:'ready',plan}],
  composition_asset_checks:[{asset_kind:'prepared_segment',asset_id:assetId,owner_user_id:owner,project_id:project,verified_etag:'etag',issue:null}]};
const db={from(table){const filters={};return {select(){return this;},eq(key,value){filters[key]=value;return this;},
  async maybeSingle(){return {error:null,data:rows[table]?.find(row=>Object.entries(filters).every(([key,value])=>row[key]===value))??null};}};},
  async rpc(name,args){assert.equal(name,'composition_asset_ref');assert.equal(args.p_track,'visual');return {error:null,data:args.p_scene_id===sceneId?resolved:null};}};
const read=typescriptLoader({
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>({id:identity})},
  '@/lib/db/server':{createDatabaseClient:()=>db},
  '@/lib/storage/r2':{signR2Read:async()=>{signed++;return {url:'https://private.example/signed',expiresAt:'future'};}},
})('lib/composition/preview.ts').readOwnedScenePreview;
const input={projectId:project,jobId:job,sceneId};
assert.equal((await read(input)).url,'https://private.example/signed');
assert.equal(signed,1);
identity=other;assert.equal(await read(input),null);assert.equal(signed,1);
identity=owner;assert.equal(await read({...input,sceneId:other}),null);assert.equal(signed,1);
resolved={...resolved,id:other};assert.equal(await read(input),null);assert.equal(signed,1);
resolved={...resolved,id:assetId,storage_key:`users/${other}/projects/${project}/scene.mp4`};assert.equal(await read(input),null);assert.equal(signed,1);
console.log(JSON.stringify({passed:18,signedCapabilities:signed,ownershipDenied:true,portraitSafeAreaFixture:true}));
