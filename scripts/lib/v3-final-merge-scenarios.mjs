import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Actual owner route, SQL, queue dispatcher and merge worker. Media commands/storage are fixtures here;
// check-v3-merge-media.ts independently exercises native FFmpeg with 2/4/7/9 files.
export async function finalMergeScenarios(h,project,initial,doc) {
 const {pg,owner,call,post,read,tick,load,equal,ok,objects,V3Store}=h;
 const store=new V3Store(),posts=h.getVideoPosts(),before=await store.read(owner,project);
 const approved=JSON.stringify(before.runs),grants=JSON.stringify(before.runtimeAuthorizations),quote=JSON.stringify(before.quotes);
 const manifest=load('lib/final-video-generation-v3/merge-runtime.ts').mergeManifest(doc,before.runs);
 const payload={action:'merge',packageId:doc.id,packageHash:doc.hash,manifestHash:manifest.hash};
 equal(initial.multiClip.merge.manifestHash,manifest.hash);equal(initial.multiClip.merge.canMerge,true);
 equal(await call('ugc_v3_merge_setup',[]),true);
 equal(await call('ugc_v3_merge_manifest',[owner,project,doc.id]),manifest);
 const last=before.runs.find(r=>r.id===manifest.clips.at(-1).runId);
 await pg.query("update public.ugc_v3_runs set state='awaiting_review' where id=$1",[last.id]);
 equal((await read(project)).multiClip.readyForMerging,false);
 equal((await post(project,payload)).body.code,'V3_MERGE_REQUIRES_APPROVED_CLIPS');
 await pg.query("update public.ugc_v3_runs set state='approved' where id=$1",[last.id]);
 await pg.query("update public.ugc_v3_runs set result=jsonb_set(result,'{width}','1'::jsonb) where id=$1",[last.id]);
 equal((await read(project)).multiClip.readyForMerging,false);
 equal((await post(project,payload)).body.code,'V3_MERGE_SOURCE_INVALID');
 await pg.query('update public.ugc_v3_runs set result=$2 where id=$1',[last.id,last.result]);
 await assert.rejects(()=>call('ugc_v3_merge_manifest',[randomUUID(),project,doc.id]),/V3_PROJECT_NOT_OWNED/);ok(true);
 equal((await post(project,{...payload,manifestHash:'0'.repeat(64)})).body.code,'V3_MERGE_INPUTS_CHANGED');
 h.setOwner(randomUUID());ok((await post(project,payload)).status!==200);h.setOwner(owner);
 const denied=(await pg.query("select has_function_privilege('authenticated','public.ugc_v3_merge_begin(uuid,uuid,uuid,text,text)','execute') as allowed")).rows[0];equal(denied.allowed,false);
 for(const response of await Promise.all([post(project,payload),post(project,payload),post(project,payload)]))equal(response.status,200);
 let dto=await read(project),id=dto.multiClip.merge.taskId;ok(id);equal(dto.multiClip.merge.status,'queued');equal(dto.complete,false);
 equal(dto.tasks.filter(t=>t.kind==='join').length,1);
 await assert.rejects(()=>call('ugc_v3_runtime_action',[owner,project,'enqueue',{kind:'join',requestKey:randomUUID(),input:{packageId:doc.id,packageHash:doc.hash,manifestHash:manifest.hash,manifest}}]),/V3_MERGE_ALREADY_EXISTS/);ok(true);
 // Simulate worker death after acquiring the lease; another process reclaims exactly this job.
 const claim=await call('ugc_v3_worker_claim',[project,false]);equal(claim.id,id);
 await pg.query("update public.ugc_v3_tasks set lease_until=now()-interval '1 second' where id=$1",[id]);
 h.setMergeFailure(true);process.env.UGC_V3_HIGGSFIELD_ENABLED='0';await tick(project);h.setMergeFailure(false);
 dto=await read(project);equal(dto.multiClip.merge.status,'failed');equal(dto.multiClip.merge.errorCode,'V3_MERGE_SOURCE_INVALID');equal(h.getVideoPosts(),posts);
 equal(await call('ugc_v3_task_checkpoint',[id,claim.lease_token,'done',{}]),false);
 equal((await post(project,payload)).status,200);equal((await read(project)).multiClip.merge.taskId,id);
 h.setMergeSaveFailure('processing');await tick(project);equal((await read(project)).multiClip.merge.status,'failed');
 const localProcessing=JSON.parse(h.spool.get(id+':merge-processing.json').toString('utf8'));localProcessing.mode='normalized-video';h.spool.set(id+':merge-processing.json',Buffer.from(JSON.stringify(localProcessing)));
 equal((await post(project,payload)).status,200);
 h.setMergeSaveFailure(true);await tick(project);dto=await read(project);equal(dto.multiClip.merge.status,'done');equal(dto.complete,false);
 let result=dto.runs.find(r=>r.id===id);equal(result.state,'awaiting_review');ok(result.preview);equal(result.current,true);
 const artifact=(await store.read(owner,project)).artifacts.find(a=>a.id===id);
 equal(artifact.document.segments,manifest.clips.map(c=>({runId:c.runId,assetHash:c.asset.sha256,segmentId:c.segmentId})));
 equal(artifact.document.manifestHash,manifest.hash);
 // New status reads and duplicate clicks never create more work or reapprove source clips.
 const mergedCalls=h.getMergeCalls();equal((await post(project,payload)).status,200);await tick(project);equal(h.getMergeCalls(),mergedCalls);
 equal((await new V3Store().read(owner,project)).artifacts.find(a=>a.id===id).document,artifact.document);
 const abandoned=path.join(path.dirname(await h.media.spoolFile(id,'video.mp4')),'merge-AbCd12');fs.mkdirSync(abandoned);fs.writeFileSync(path.join(abandoned,'merged.mp4'),'interrupted-output');fs.writeFileSync(path.join(abandoned,'clip-1.mp4'),'private-input-copy');
 equal((await post(project,{action:'reject_delete',id})).body.code,'V3_VIDEO_DELETE_CONFIRMATION_REQUIRED');
 equal((await post(project,{action:'reject_delete',id,quality:load('lib/final-video-generation-v3/runtime-contract.ts').uncheckedQuality,confirmedDeletion:true})).status,200);
 equal((await read(project)).complete,false);
 equal((await post(project,payload)).body.code,'V3_MERGE_DELETE_PENDING');
 h.setDeleteFailure(true);await tick(project);h.setDeleteFailure(false);
 dto=await read(project);equal(dto.runs.find(r=>r.id===id).state,'deleting');ok(dto.runs.find(r=>r.id===id).errorCode);
 equal((await post(project,{action:'recover',id})).status,200);await tick(project);
 equal((await read(project)).runs.find(r=>r.id===id).state,'deleted');equal(objects.has(artifact.document.asset.storageKey),false);
 equal(fs.existsSync(abandoned),false);
 equal(JSON.stringify((await store.read(owner,project)).runs),approved);
 equal((await post(project,payload)).status,200);const next=(await read(project)).multiClip.merge.taskId;ok(next!==id);
 // Lost acknowledgement after private publication/local receipt: retry restores the same artifact without FFmpeg again.
 const worker=load('lib/final-video-generation-v3/worker.ts').runV3Task;
 const {V3DatabaseError}=load('lib/final-video-generation-v3/database-errors.ts');
 const disconnected=new V3Store();const savedCheckpoint=disconnected.checkpoint.bind(disconnected);
 disconnected.checkpoint=async(task,action,data)=>{if(action==='artifact')throw new V3DatabaseError({message:'fetch failed',details:'ECONNRESET'},'ugc_v3_task_checkpoint');return savedCheckpoint(task,action,data);};
 const beforeConnectionLoss=h.getVideoPosts();
 await assert.rejects(()=>worker(project,owner,disconnected),e=>e instanceof V3DatabaseError&&e.diagnostic.retryable);ok(true);
 equal((await read(project)).multiClip.merge.status,'running');
 equal(h.getVideoPosts(),beforeConnectionLoss);equal(JSON.stringify((await store.read(owner,project)).runs),approved);
 await pg.query("update public.ugc_v3_tasks set lease_until=now()-interval '1 second' where id=$1",[next]);
 let loseArtifactAck=true;
 const interrupted=new V3Store();const checkpoint=interrupted.checkpoint.bind(interrupted);
 interrupted.checkpoint=async(task,action,data)=>{if(action==='artifact'&&loseArtifactAck){loseArtifactAck=false;throw Error('FIXTURE_MERGE_CHECKPOINT_INTERRUPTED');}return checkpoint(task,action,data);};
 await worker(project,owner,interrupted);equal((await read(project)).multiClip.merge.status,'failed');
 const savedCalls=h.getMergeCalls();equal((await post(project,payload)).status,200);await tick(project);equal(h.getMergeCalls(),savedCalls);
 dto=await read(project);equal(dto.multiClip.merge.taskId,next);result=dto.runs.find(r=>r.id===next);equal(result.state,'awaiting_review');ok(result.preview);
 equal((await post(project,{action:'approve',id:next,reviewMode:'direct'})).status,200);
 equal((await post(project,{action:'approve',id:next,reviewMode:'direct'})).status,200);
 dto=await read(project);equal(dto.complete,true);equal(dto.runs.find(r=>r.id===next).state,'approved');ok(dto.runs.find(r=>r.id===next).preview);
 equal(JSON.stringify((await store.read(owner,project)).runs),approved);
 equal(JSON.stringify((await store.read(owner,project)).runtimeAuthorizations),grants);equal(JSON.stringify((await store.read(owner,project)).quotes),quote);
 // If a source identity changes, the old final cannot be current or approved again.
 const source=before.runs.find(r=>r.id===manifest.clips[0].runId);
 await pg.query("update public.ugc_v3_runs set result=jsonb_set(result,'{sha256}',to_jsonb($2::text)) where id=$1",[source.id,'f'.repeat(64)]);
 dto=await read(project);equal(dto.complete,false);equal(dto.runs.find(r=>r.id===next).current,false);equal(dto.multiClip.merge.outdated,true);
 await assert.rejects(()=>call('ugc_v3_approve_video',[owner,project,next]),/V3_MERGE_INPUTS_CHANGED|JOINED_APPROVAL_INVALID/);ok(true);
 await pg.query('update public.ugc_v3_runs set result=$2 where id=$1',[source.id,source.result]);
 equal((await read(project)).complete,true);
 // Settings edits invalidate the final without destroying access or changing historical approvals.
 await pg.query("update public.projects set prompt=prompt||' merge changed' where id=$1",[project]);
 dto=await read(project);equal(dto.complete,false);ok(dto.runs.find(r=>r.id===next).preview);equal(dto.runs.find(r=>r.id===next).current,false);
 equal((await post(project,payload)).status,409);
 await pg.query("update public.projects set prompt=replace(prompt,' merge changed','') where id=$1",[project]);
 equal(JSON.stringify((await store.read(owner,project)).runs),approved);equal(h.getVideoPosts(),posts);
 process.env.UGC_V3_HIGGSFIELD_ENABLED='1';
}
