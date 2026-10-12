// Actual processor + filesystem, with explicit database/R2/FFmpeg fixtures.
// Verifies failure classification, no downstream work and temporary cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { typescriptLoader } from './lib/load-typescript.mjs';

const checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
const sourceProbe={durationMs:12000,width:640,height:360,rotation:0,fps:24,hasAudio:false};
const preparedProbe={...sourceProbe,durationMs:5000};
let mode, context, reservedState, existing, calls, failures, statuses, metadata;
const db={
  async rpc(name,args){
    calls.push(name);
    if(name==='reserve_source_segment')return {data:{state:reservedState,segment_id:'segment'},error:null};
    if(name==='fail_source_segment')failures.push(args);
    if(name==='record_visual_status')statuses.push(args);
    if(name==='complete_source_segment')metadata=args.p_metadata;
    return {data:true,error:null};
  },
  from(){return {select(){return this;},eq(){return this;},async single(){return {data:{id:'segment',storage_key:'prepared'},error:null};}};}
};
const load=typescriptLoader({
  'file-type':{fileTypeFromBuffer},
  './context':{loadPreparation:async()=>context},
  '@/lib/storage/r2':{
    async readR2AnalysisMedia(key){calls.push('read:'+key);if(mode==='download')throw Error('fixture outage');return new ReadableStream({start(c){c.enqueue(mp4);c.close();}});},
    async inspectR2Object(){return existing?{etag:'etag',sizeBytes:mp4.length,mimeType:'video/mp4'}:null;},
    async putR2SceneOutput(){calls.push('put');if(mode==='upload')throw Error('fixture outage');existing=true;}
  },
  './ffmpeg':{
    preparationShape(){return {width:640,height:360,copy:false};},
    async extractSegment(input,output){calls.push('extract');assert.equal(path.basename(input),'source');assert.equal(path.basename(output),'prepared.mp4');
      if(mode==='codec')throw new PreparationError('UNSUPPORTED_CODEC');
      if(mode==='duration')throw new PreparationError('SOURCE_DURATION_UNAVAILABLE');
      if(mode==='ffmpeg')throw new PreparationError('MEDIA_PROCESSING_FAILED');
      await fs.writeFile(output,mp4);return {source:sourceProbe,prepared:preparedProbe,mode:'transcode'};
    },
    async probeMedia(file){calls.push('probe');return path.basename(file)==='source'?sourceProbe:preparedProbe;}
  }
});
const {PreparationError}=load('lib/media-preparation/contract.ts');
const {executePreparation}=load('lib/media-preparation/processor.ts');
function reset(next='success'){
  mode=next;reservedState='claimed';existing=false;calls=[];failures=[];statuses=[];metadata=null;
  context={db,runId:'trusted-run',scene:{id:'scene',scene_order:1,preparation_required:true,status:'pending',owner_user_id:'owner',project_id:'project',source_start_ms:2000,source_end_ms:7000,requested_duration_ms:5000},source:{id:'source',storage_key:'original',size_bytes:mp4.length,verified_etag:'source-etag',media_type:'video'},plan:{aspectRatio:'16:9',scenePlan:[{description:'Source HUD',transformationInstruction:'Stylize'}],editingNotes:[]}};
}
const scratch=async()=>(await fs.readdir(os.tmpdir())).filter(f=>f.startsWith('sceenyk-segment-')).sort();
const before=await scratch();
reset();context.scene.source_end_ms=8000;
check('invalid timing is permanent before reservation or source download',!(await executePreparation({})).ready&&statuses[0].p_error==='INVALID_SOURCE_TIMING'&&!calls.includes('read:original')&&!calls.includes('reserve_source_segment'));
reset();context.scene.provider_task_id='already-paid';
check('persisted paid identity skips all preparation work',(await executePreparation({})).ready&&calls.length===0);
reset();reservedState='completed';
check('completed cache does not download or encode',(await executePreparation({})).ready&&calls.length===1);
for(const failure of ['download','upload']){
  reset(failure);await assert.rejects(executePreparation({}),/PREPARATION_STORAGE_UNAVAILABLE/);
  check(failure+' outage stays retryable and cleans temporary files',failures.length===1&&!failures[0].p_permanent&&JSON.stringify(await scratch())===JSON.stringify(before));
}
for(const failure of ['codec','duration','ffmpeg']){
  reset(failure);
  check(failure+' failure is permanent and never persists prepared output',!(await executePreparation({})).ready&&failures[0].p_permanent&&!calls.includes('put')&&!calls.includes('complete_source_segment')&&JSON.stringify(await scratch())===JSON.stringify(before));
}
reset();existing=true;
check('interrupted completion recovers existing R2 object without reencoding',(await executePreparation({})).ready&&calls.filter(c=>c==='probe').length===2&&!calls.includes('extract')&&!calls.includes('put')&&metadata.durationMs===5000);
check('all success and failure scratch directories are removed',JSON.stringify(await scratch())===JSON.stringify(before));
console.log(JSON.stringify({passed:checks.length,checks,scope:'real processor/filesystem; explicit DB/R2/FFmpeg fixtures; no provider calls'},null,2));
