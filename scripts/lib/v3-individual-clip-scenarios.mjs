import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { connectedFixtureStory } from './v3-connected-story-scenarios.mjs';

export async function individualClipScenarios(h) {
 const {pg,owner,call,post,read,tick,fixture,generate,load,equal,ok,cp,videoBodies}=h;
 const {V3Store}=load('lib/final-video-generation-v3/runtime-store.ts');
 const store=new V3Store(h.db);
 const {readFrozenPackage}=load('lib/final-video-generation-v3/package.ts');
 const {uncheckedQuality}=load('lib/final-video-generation-v3/runtime-contract.ts');
 // The clip compiler preserves both approved identities, speaker assignments and
 // exact local timing, without including another clip's dialogue.
 const {v3Input,v3Id}=load('scripts/final-video-v3-fixture.ts'),castInput=v3Input([10000,20000,10000,20000,10000]);
 const castBoundaries=load('lib/final-video-generation-v3/connected-story.ts').planStoryClips(70000);
 castInput.storyboardContent=connectedFixtureStory(castInput.storyboardContent,castBoundaries);
 const first=castInput.references.find(r=>r.role==='character');first.name='Ari';first.characterId=v3Id(50);
 const second={...first,id:v3Id(51),characterId:v3Id(52),name:'Bea'};castInput.references.push(second);
 castInput.storyboardContent.cast=[first,second].map(r=>({characterId:r.characterId,referenceId:r.id,name:r.name}));
 castInput.storyboardContent.scenes.forEach((s,i)=>{s.characterIds=[first.characterId,second.characterId];s.speech=[{
  speaker:'character',characterId:i%2?second.characterId:first.characterId,text:`Unique speech ${i+1}.`,startMs:s.startMs+1000,endMs:s.startMs+3000,
  delivery:load('lib/execution-v1/contract.ts').defaultDelivery(),deliveryNote:'Preserve each voice.',
 }];});
 castInput.direction=JSON.stringify({promptCompiler:'connected-clip-compiler-v1',instructions:'A continuous quiet demonstration.'});
 const compile=load('lib/final-video-generation-v3/compiler.ts').compileDirectorInstructions;
 for(const boundary of castBoundaries) {
  const from=castInput.storyboardContent.scenes.findIndex(s=>s.startMs===boundary.startMs),to=castInput.storyboardContent.scenes.findIndex(s=>s.endMs===boundary.endMs)+1;
  const compiled=compile(castInput,from,to);equal(compiled.durationMs,boundary.durationMs);ok(compiled.prompt.includes('"Ari"'));ok(compiled.prompt.includes('"Bea"'));
  equal(compiled.dialogue[0].localStartMs,compiled.dialogue[0].startMs-boundary.startMs);
  for(const [i,s] of castInput.storyboardContent.scenes.entries())equal(compiled.prompt.includes(`Unique speech ${i+1}.`),s.startMs>=boundary.startMs&&s.endMs<=boundary.endMs);
 }
 const migration=fs.readFileSync('supabase/migrations/20261106009800_ugc_v3_individual_clips.sql','utf8');
 const security=async()=>(await pg.query("select oid,relacl::text,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by oid")).rows;
 const baseline=await security();await pg.exec(migration);await pg.exec(migration);equal(await security(),baseline);
 for(const signature of ['ugc_v3_clip_authorize(uuid,uuid,jsonb,uuid)','ugc_v3_clip_manifest(uuid,uuid,uuid)','ugc_v3_clip_setup()','ugc_v3_clip_retryable(uuid,uuid,uuid)']) {
  equal((await pg.query("select has_function_privilege('authenticated',$1,'EXECUTE') browser,has_function_privilege('service_role',$1,'EXECUTE') server",['public.'+signature])).rows[0],{browser:false,server:true});
 }
 Object.assign(process.env,{UGC_V3_HIGGSFIELD_ENABLED:'1',UGC_V3_HIGGSFIELD_CREDENTIALS:'fixture:key',UGC_V3_HIGGSFIELD_ACCOUNT_SCOPE:'fixture',UGC_V3_HIGGSFIELD_OUTPUT_HOSTS:'cdn.example.test'});
 delete process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;
 const makeCurrent=async project=>{await pg.query("update public.ugc_v3_tasks set available_at=now() where project_id=$1 and status='queued'",[project]);};
 const runWorker=async project=>{await makeCurrent(project);await tick(project);};
 for(const duration of [10,30,40,70,90,120]) {
  await call('studio_mode_save',[owner,null,duration>30?'pro':'basic']);
  const f=await fixture(false,String(duration)),project=f.project;
  await generate(project);let dto=await read(project),location=dto.artifacts.find(a=>a.kind==='location');
  equal((await post(project,{action:'review_artifact',id:location.id,decision:'approve'})).status,200);
  const referenceSnapshot=await cp(project),boundaries=load('lib/final-video-generation-v3/connected-story.ts').planStoryClips(duration*1000);
  h.setDurations(boundaries.flatMap(b=>[4000,b.durationMs-4000]));
  equal((await post(project,{action:'storyboard'})).status,200);await tick(project);dto=await read(project);
  const story=dto.artifacts.find(a=>a.kind==='storyboard');ok(story);
  equal((await post(project,{action:'review_artifact',id:story.id,decision:'approve'})).status,200);
  {const result=await post(project,{action:'build_package'});assert.equal(result.status,200,JSON.stringify({duration,result}));}await tick(project);dto=await read(project);
  assert.ok(dto.preflight,JSON.stringify(dto.tasks.filter(t=>t.kind==='package')));
  const p=dto.preflight, snapshot={packageId:p.packageId,packageHash:p.packageHash,quoteId:p.quoteId};
  equal(p.segmentCount,boundaries.length);equal(p.estimatedCostMicrousd,duration*205667);
  const saved=await store.read(owner,project),doc=readFrozenPackage(saved.packages.at(-1).document);
  const creative=JSON.stringify(doc);equal(doc.segments.map(s=>s.durationMs),boundaries.map(c=>c.durationMs));
  for(const [i,segment] of doc.segments.entries()) {
   ok(segment.compiledPrompt.includes(`${segment.durationMs/1000}s`));
   if(duration>30){ok(segment.compiledPrompt.includes(boundaries[i].id));ok(segment.compiledPrompt.includes(story.storyboard.clips[i].continuityIn));ok(segment.compiledPrompt.includes(story.storyboard.clips[i].audioContinuity));}
  }
  equal((await post(project,{action:'authorize',...snapshot,operatorApproved:true,maximumMicrousd:p.estimatedCostMicrousd-1})).status,409);
  equal((await post(project,{action:'authorize',...snapshot,operatorApproved:true,maximumMicrousd:p.suggestedMaximumMicrousd})).status,200);
  equal((await post(project,{action:'authorize',...snapshot,operatorApproved:true,maximumMicrousd:p.suggestedMaximumMicrousd})).status,200);
  const countBefore=h.getVideoPosts();h.setVideo(true);
  for(const [index,boundary] of boundaries.entries()) {
   dto=await read(project);const clip=dto.multiClip?.clips[index];
   const request=duration>30?{action:'generate_clip',packageId:p.packageId,packageHash:p.packageHash,clipId:clip.id,segmentId:clip.segmentId}:{action:'generate',packageId:p.packageId,packageHash:p.packageHash};
   if(duration>30) {
    equal((await post(project,{...request,clipId:'clip-99'})).status,409);
    equal((await post(project,{action:'generate',packageId:p.packageId,packageHash:p.packageHash})).body.code,'V3_CLIP_SELECTION_REQUIRED');
   }
   if(duration===40 && index===1) {
    const current=await store.read(owner,project),grant=current.runtimeAuthorizations.find(a=>a.document.segmentId===clip.segmentId);
    const body={...grant.document,approvedAt:new Date(Date.now()-25*3600000).toISOString(),expiresAt:new Date(Date.now()-1000).toISOString()};delete body.hash;
    const expired={...body,hash:load('lib/final-video-generation-v3/identity.ts').v3Digest('runtime-authorization',body)};
    await pg.query('update public.ugc_v3_run_authorizations set document=$1 where id=$2',[expired,grant.document.id]);
    equal((await post(project,request)).status,409);
    const renew={action:'authorize_clip',...snapshot,segmentId:clip.segmentId,previousRunId:null,operatorApproved:true,maximumMicrousd:clip.suggestedMaximumMicrousd,cumulativeMaximumMicrousd:Math.max(p.estimatedCostMicrousd,load('lib/final-video-generation-v3/clip-runtime.ts').clipSpending(await store.read(owner,project),doc).committedMicrousd+clip.suggestedMaximumMicrousd)};
    equal((await post(project,{...renew,operatorApproved:false})).status,409);
    equal((await post(project,renew)).status,200);equal((await read(project)).multiClip.clips[index].canGenerate,true);
   }
   const results=await Promise.all([post(project,request),post(project,request),post(project,request)]);results.forEach(r=>equal(r.status,200));
   equal((await store.read(owner,project)).runs.filter(r=>r.intent.segmentId===doc.segments[index].id).length,1);
   // Persist acceptance, restart with transport OFF and recover only that receipt.
   if(duration===70&&index===0) {
    h.setVideo(false);await runWorker(project);let w=await store.read(owner,project),r=w.runs.find(r=>r.intent.segmentId===clip.segmentId);
    equal(r.state,'provider_processing');ok(r.observation.requestId);const accepted=r.observation.requestId,posts=h.getVideoPosts();
    await pg.query("update public.ugc_v3_runs set state='reconciliation_required' where id=$1",[r.id]);
    await pg.query("update public.ugc_v3_tasks set status='reconciliation_required' where input->>'runId'=$1",[r.id]);
    equal(await call('ugc_v3_clip_retryable',[owner,project,r.id]),false);
    process.env.UGC_V3_HIGGSFIELD_ENABLED='0';h.setVideo(true);await runWorker(project);
    r=(await store.read(owner,project)).runs.find(candidate=>candidate.id===r.id);equal(h.getVideoPosts(),posts);equal(r.observation.requestId,accepted);equal(r.state,'awaiting_review');
    process.env.UGC_V3_HIGGSFIELD_ENABLED='1';
   } else { h.setVideoFailure(duration===90&&index===0);h.setSubmissionRejected(duration===120&&index===0);await runWorker(project);h.setVideoFailure(false);h.setSubmissionRejected(false); }
   dto=await read(project);const run=dto.runs.find(r=>r.segmentId===doc.segments[index].id);
   if((duration===90||duration===120)&&index===0) {equal(run.state,'failed');ok(!run.preview);continue;}
   assert.equal(run.state,'awaiting_review',JSON.stringify(dto.tasks.filter(t=>t.kind==='video')));ok(run.preview);equal(run.actualDurationMs,boundary.durationMs);
   equal(run.shotTimings.length,doc.segments[index].includedSceneNumbers.length);
   // Keep the middle 70s clip unapproved to exercise selective replacement below.
   if(!(duration===70&&index===1))equal((await post(project,{action:'approve',id:run.id,reviewMode:'direct'})).status,200);
   equal((await read(project)).complete,duration<=30);
  }
  equal(h.getVideoPosts()-countBefore,boundaries.length);
  const payloads=videoBodies.slice(-boundaries.length);equal(payloads.map(b=>b.duration),boundaries.map(b=>b.durationMs/1000));ok(payloads.every(b=>b.resolution==='480p'));
  if(duration===70) {
   dto=await read(project);const clip=dto.multiClip.clips[1],run=dto.runs.find(r=>r.id===clip.runId),approved=(await store.read(owner,project)).runs.filter(r=>r.state==='approved');
   const frozenApproved=JSON.stringify(approved),regeneration={action:'authorize_clip',...snapshot,segmentId:clip.segmentId,previousRunId:run.id,operatorApproved:true,maximumMicrousd:clip.suggestedMaximumMicrousd,cumulativeMaximumMicrousd:Math.max(p.estimatedCostMicrousd,dto.multiClip.committedMicrousd+dto.multiClip.reservedMicrousd+clip.suggestedMaximumMicrousd)};
   equal((await post(project,regeneration)).body.code,'V3_CLIP_DELETE_OR_RECOVER_FIRST');
   equal((await post(project,{action:'reject_delete',id:run.id,quality:uncheckedQuality})).body.code,'V3_VIDEO_DELETE_CONFIRMATION_REQUIRED');
   equal((await post(project,{action:'reject_delete',id:approved[0].id,quality:uncheckedQuality,confirmedDeletion:true})).status,409);
   equal((await post(project,{action:'reject_delete',id:run.id,quality:uncheckedQuality,confirmedDeletion:true})).status,200);
   h.setDeleteFailure(true);await runWorker(project);equal((await read(project)).runs.find(r=>r.id===run.id).state,'deleting');
   h.setDeleteFailure(false);equal((await post(project,{action:'recover',id:run.id})).status,200);await runWorker(project);
   equal((await read(project)).runs.find(r=>r.id===run.id).state,'deleted');
   equal((await post(project,{action:'generate_clip',packageId:p.packageId,packageHash:p.packageHash,clipId:clip.id,segmentId:clip.segmentId})).status,409);
   equal((await post(project,{...regeneration,maximumMicrousd:1})).status,409);
   equal((await post(project,{...regeneration,cumulativeMaximumMicrousd:p.estimatedCostMicrousd})).body.code,'V3_REVIEW_SNAPSHOT_CHANGED');
   const beforeGrant=await store.read(owner,project),quote=beforeGrant.quotes.find(q=>q.document.packageId===doc.id).document;
   const {createRuntimeAuthorization}=load('lib/final-video-generation-v3/execution-package.ts');
   const {clipAttemptBinding}=load('lib/final-video-generation-v3/clip-runtime.ts');
   const underfunded=createRuntimeAuthorization(doc,quote,quote.segments[1].segmentUuid,{operatorId:owner,approved:true,maximumMicrousd:clip.suggestedMaximumMicrousd,
    packageMaximumMicrousd:quote.totalMicrousd,now:new Date().toISOString(),clipAttempt:clipAttemptBinding(doc,clip.segmentId,run.id)});
   await assert.rejects(()=>call('ugc_v3_clip_authorize',[owner,project,[underfunded],run.id]),/V3_PACKAGE_AUTHORIZATION_INSUFFICIENT/);ok(true);
   await assert.rejects(()=>call('ugc_v3_clip_authorize',[randomUUID(),project,[underfunded],run.id]),/V3_PROJECT_NOT_OWNED/);ok(true);
   equal((await post(project,{...regeneration,previousRunId:randomUUID()})).body.code,'V3_CLIP_ATTEMPT_CHANGED');
   const grantsBefore=(await store.read(owner,project)).runtimeAuthorizations.length;
   const responses=await Promise.all([post(project,regeneration),post(project,regeneration)]);responses.forEach(r=>equal(r.status,200));
   equal((await post(project,regeneration)).status,200);
   equal((await store.read(owner,project)).runtimeAuthorizations.length,grantsBefore+1);
   equal((await post(project,{action:'generate_clip',packageId:p.packageId,packageHash:p.packageHash,clipId:clip.id,segmentId:clip.segmentId})).status,200);await runWorker(project);
   const restored=await store.read(owner,project),replacement=restored.runs.filter(r=>r.intent.segmentId===clip.segmentId).at(-1);
   equal(replacement.state,'awaiting_review');ok(replacement.id!==run.id);equal(replacement.intent.authorization.clipAttempt.previousRunId,run.id);
   equal(JSON.stringify(restored.runs.filter(r=>r.state==='approved')),frozenApproved);
   equal((await read(project)).multiClip.clips[2].needsContinuityReview,true);
   equal((await post(project,{action:'approve',id:replacement.id,reviewMode:'direct'})).status,200);
   equal((await post(project,regeneration)).body.code,'V3_CLIP_ATTEMPT_CHANGED');
   equal((await read(project)).multiClip.committedMicrousd,(duration+30)*205667);
  }
  if(duration===90||duration===120) {
   dto=await read(project);equal(dto.multiClip.readyForMerging,false);
   const clip=dto.multiClip.clips[0],others=(await store.read(owner,project)).runs.filter(r=>r.state==='approved');
   const snapshotOthers=JSON.stringify(others);ok(clip.canRegenerate);
   equal((await post(project,{action:'authorize_clip',...snapshot,segmentId:clip.segmentId,previousRunId:clip.runId,operatorApproved:true,maximumMicrousd:clip.suggestedMaximumMicrousd,cumulativeMaximumMicrousd:dto.multiClip.committedMicrousd+dto.multiClip.reservedMicrousd+clip.suggestedMaximumMicrousd})).status,200);
   equal((await post(project,{action:'generate_clip',packageId:p.packageId,packageHash:p.packageHash,clipId:clip.id,segmentId:clip.segmentId})).status,200);await runWorker(project);
   const current=await store.read(owner,project),replacement=current.runs.filter(r=>r.intent.segmentId===clip.segmentId).at(-1);
   equal(replacement.state,'awaiting_review');equal(JSON.stringify(current.runs.filter(r=>r.state==='approved')),snapshotOthers);
   equal((await post(project,{action:'approve',id:replacement.id,reviewMode:'direct'})).status,200);
  }
  dto=await read(project);equal(await cp(project),referenceSnapshot);equal(JSON.stringify(readFrozenPackage((await store.read(owner,project)).packages.at(-1).document)),creative);
  if(duration>30) {
   equal(dto.multiClip.readyForMerging,true);equal(dto.complete,false);ok(!dto.tasks.some(t=>t.kind==='join'));
   const progress=load('components/creation/v3-progress-state.ts').workflowProgress(dto,true);
   equal(progress.complete,false);ok(progress.stages.find(s=>s.id==='final').description.includes('ready for merging'));
   const manifests=(await pg.query("select document from public.ugc_v3_runtime_events where project_id=$1 and kind='clips_ready_for_merging'",[project])).rows;
   equal(manifests.length,1);
   const approvals=(await pg.query("select document from public.ugc_v3_runtime_events where project_id=$1 and kind='clip_spending_approval'",[project])).rows;
   for(const approval of approvals) for(const auth of approval.document.authorizations) ok((await store.read(owner,project)).runtimeAuthorizations.some(a=>a.document.id===auth.id));
   // Stale settings still permit read-only access to saved clips and their Preview.
   await pg.query("update public.projects set prompt=prompt||' changed' where id=$1",[project]);
   const stale=await read(project);ok(stale.multiClip.clips.every(c=>!c.canGenerate));ok(stale.runs.every(r=>!r.current));equal(stale.complete,false);
   await pg.query("update public.projects set prompt=replace(prompt,' changed','') where id=$1",[project]);equal(manifests[0].document.clips.map(c=>c.clipId),boundaries.map(c=>c.id));ok(manifests[0].document.clips.every(c=>c.asset.storageKey&&c.asset.sha256));
   equal(await call('ugc_v3_clip_manifest',[owner,project,p.packageId]),true);
   await assert.rejects(()=>call('ugc_v3_runtime_action',[owner,project,'enqueue',{kind:'join',requestKey:randomUUID(),input:{packageId:p.packageId,packageHash:p.packageHash}}]),/V3_CLIP_MERGE_NOT_IMPLEMENTED/);ok(true);
   await assert.rejects(()=>call('ugc_v3_clip_manifest',[randomUUID(),project,p.packageId]),/V3_PROJECT_NOT_OWNED/);ok(true);
  } else equal(dto.multiClip,null);
 }
}
