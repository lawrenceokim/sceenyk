// Uses existing hosted data only. Never calls providers, worker or render.
// Default: read-only preflight/derivation. --persist: caption RPC only, after018.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import nextEnv from '@next/env';
import {InngestTestEngine} from '@inngest/test';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const load=typescriptLoader(),db=load('lib/db/server.ts').createDatabaseClient();
const {captionSourceSchema,captionTrackSchema,validateCaptionSource,captionStyle}=load('lib/captions/contract.ts');
const {buildCaptionTrack}=load('lib/captions/build.ts');
const {exportCaptions}=load('lib/captions/export.ts');
const service=load('lib/captions/server.ts');
const requested=process.argv.find(arg=>/^[a-f0-9-]{36}$/.test(arg));
let query=db.from('composition_plans').select('*').eq('status','ready').order('created_at',{ascending:true}).limit(1);
if(requested)query=query.eq('job_id',requested);
const read=await query.single();
if(read.error)console.log(JSON.stringify({hostedReadErrorCode:read.error.code||'NETWORK_UNAVAILABLE'}));
assert.ok(!read.error&&read.data,'EXISTING_HOSTED_READY_COMPOSITION');
const c=read.data,jobId=c.job_id;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function existingState() {
  const result={};
  for(const table of ['generation_plans','composition_plans','scene_executions','scene_assets','narration_segments','narration_assets','generation_reservations','render_jobs']) {
    const r=await db.from(table).select('*').eq(table==='render_jobs'?'generation_job_id':'job_id',jobId);
    assert.ok(!r.error,'EXISTING_'+table);result[table]=r.data.sort((a,b)=>String(a.id??a.job_id).localeCompare(String(b.id??b.job_id)));
  }
  const job=await db.from('generation_jobs').select('*').eq('id',jobId).single();assert.ok(!job.error,'EXISTING_JOB');result.job=job.data;
  return hash(result);
}
const before=await existingState();
const narration=await db.from('narration_segments').select('id,scene_execution_id,scene_order,output_asset_id,actual_duration_ms,text')
  .eq('job_id',jobId).eq('owner_user_id',c.owner_user_id).eq('project_id',c.project_id).eq('status','completed').order('scene_order');
assert.ok(!narration.error,'HOSTED_COMPLETED_SPEECH');
for(const n of narration.data) {
  const a=await db.from('narration_assets').select('id,duration_ms').eq('id',n.output_asset_id).eq('narration_segment_id',n.id)
    .eq('job_id',jobId).eq('owner_user_id',c.owner_user_id).eq('project_id',c.project_id).single();
  assert.ok(!a.error&&a.data?.duration_ms===n.actual_duration_ms,'HOSTED_MEASURED_AUDIO');
}
const source=captionSourceSchema.parse({plan:c.plan,narration:narration.data});
const track=buildCaptionTrack(source);assert.equal(track.status,'ready','REAL_HOSTED_TEXT_FITS');validateCaptionSource(track,source);
assert.ok(track.cues.length,'REAL_NARRATED_CUES');
for(const scene of source.plan.scenes) {
  const cues=track.cues.filter(c=>c.scene_id===scene.scene_execution_id);
  if(!scene.narration)assert.equal(cues.length,0,'REAL_SILENT_SCENE');
  else {assert.equal(cues[0].start_ms,scene.narration.start_ms);assert.equal(cues.at(-1).end_ms,scene.narration.end_ms);}
}
assert.equal(hash(buildCaptionTrack(source)),hash(track),'REAL_DETERMINISTIC_RETRY');
const outputs={srt:exportCaptions(track,'srt'),vtt:exportCaptions(track,'vtt')};
for(const format of ['srt','vtt']) {
  const stamps=outputs[format].match(/\d{2}:\d{2}:\d{2}[.,]\d{3} --> \d{2}:\d{2}:\d{2}[.,]\d{3}/g);
  assert.equal(stamps?.length,track.cues.length,'REAL_EXPORT_'+format);
  assert.ok(!/https?:|storage_key|provider_request/i.test(outputs[format]),'SAFE_EXPORT_'+format);
}
const preflight=await db.from('caption_tracks').select('id').limit(0);
const report={jobId,migration018Available:!preflight.error,schemaError:preflight.error?.code??null,
  ddlConnectionConfigured:!!(process.env.DATABASE_URL||process.env.SUPABASE_DB_URL),managementCredentialConfigured:!!process.env.SUPABASE_ACCESS_TOKEN,
  mode:process.argv.includes('--persist')?'hosted-persistence':'read-only-hosted-derivation',alignment:track.alignment,
  cues:track.cues.length,silentScenes:source.plan.scenes.filter(s=>!s.narration).length,
  windows:source.plan.scenes.filter(s=>s.narration).map(s=>({scene:s.scene_order,startMs:s.narration.start_ms,endMs:s.narration.end_ms,durationMs:s.narration.actual_duration_ms})),
  safeAreas:captionStyle.safe_area_percent,sourceDigest:before,captionDigest:hash(track),exportsValid:true};
if(process.argv.includes('--persist')) {
  assert.ok(report.migration018Available,'APPLY_MIGRATION018_FIRST');
  const first=await service.buildOrReuseCaptions(jobId);
  const ids=await Promise.all([service.buildOrReuseCaptions(jobId),service.buildOrReuseCaptions(jobId)]);
  assert.ok(first&&ids.every(id=>id===first),'HOSTED_DUPLICATE_REUSE');
  const rows=await db.from('caption_tracks').select('id,track').eq('job_id',jobId);
  assert.equal(rows.data?.length,1);assert.equal(hash(captionTrackSchema.parse(rows.data[0].track)),hash(track));
  const execute=()=>new InngestTestEngine({function:load('lib/workflows/captions.ts').captionsWorkflow,
    events:[{name:'sceenyk/generation.captions.requested',data:{generationJobId:jobId}}]}).execute();
  const workflows=await Promise.all([execute(),execute()]);
  assert.ok(workflows.every(run=>run.result.trackId===first),'HOSTED_DB_DUPLICATE_WORKFLOW_REUSE');
  const after=await db.from('caption_tracks').select('id,track,created_at').eq('job_id',jobId);
  assert.equal(after.data?.length,1);assert.equal(hash(captionTrackSchema.parse(after.data[0].track)),hash(track));
  report.hostedDatabaseWorkflowReplay=true;report.cloudDeploymentVerified=false;
  report.persistedTrackId=first;report.duplicateReuse=true;
}
assert.equal(await existingState(),before,'EXISTING_PIPELINE_UNCHANGED');report.existingPipelineUnchanged=true;
fs.writeFileSync(path.join(os.tmpdir(),'sceenyk-caption-acceptance.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
