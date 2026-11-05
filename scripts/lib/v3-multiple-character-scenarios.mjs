// Focused scenarios use the existing actual route/worker/disposable DB harness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function multipleCharacterScenarios(h) {
 const {pg,owner,call,post,read,tick,media,master,oddImage,objects,calls,deleted,load,equal,ok,hash}=h;
 h.setMode('cast');
 const project=randomUUID(),basic=randomUUID(),otherOwner=randomUUID(),foreign=randomUUID();
 const fields={title:'Two distinct characters',category:'product-ad',prompt:'Ari and Bea exchange a greeting.',ugcType:'advertisement',settings:{duration:'10',aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'}};
 await pg.query('insert into public.app_users(id,clerk_user_id) values($1,$2)',[otherOwner,'cast-'+otherOwner]);
 await call('ugc_v3_create_project',[owner,basic,fields]);
 await call('studio_mode_save',[owner,null,'pro']);
 await call('ugc_v3_create_project',[owner,project,fields]);
 await call('ugc_v3_create_project',[otherOwner,foreign,fields]);
 let sourceOrder=0;
 const insert=async(p,user,name,bytes=master)=>{
  const id=randomUUID(),key=`users/${user}/projects/${p}/${id}/fixture.png`;
  await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id,reference_name) values($1,$2,$3,$4,$5,'fixture.png','image/png',$6,'image','uploaded','source-etag','character',$1,$7)",[id,user,p,randomUUID(),key,bytes.length,name]);
  // PostgreSQL has sub-millisecond timestamps; this fixture clock does not.
  // Give sequential uploads distinct creation instants to exercise saved order.
  await pg.query('update public.project_assets set created_at=$1 where id=$2',[new Date(Date.now()+sourceOrder++*1000).toISOString(),id]);
  objects.set(key,{bytes,asset:{id,etag:'source-etag'}});return id;
 };
 await insert(basic,owner,'Basic only');
 await assert.rejects(()=>insert(basic,owner,'Basic extra'),/UGC V1 supports one character/);ok(true);
 const a=await insert(project,owner,'Ari'),b=await insert(project,owner,'Bea',oddImage),foreignSource=await insert(foreign,otherOwner,'Foreign');
 const originals=await load('lib/final-video-generation-v3/creative-inputs.ts').referenceOriginals(owner,project);
 equal(originals.characters.map(c=>c.name),['Ari','Bea']);
 const c=await insert(project,owner,'Cam');
 const start=calls.length;
 await pg.query('update public.project_assets set reference_name=$1 where id=$2',['',c]);
 equal((await post(project,{action:'reference',kind:'character',assetId:c})).body.code,'V3_CHARACTER_NAME_REQUIRED');equal(calls.length,start);
 await pg.query('update public.project_assets set reference_name=$1 where id=$2',['Cam',c]);
 equal((await post(project,{action:'reference',kind:'character',assetId:foreignSource})).body.code,'CURRENT_STUDIO_REFERENCE_REQUIRED');
 equal((await post(project,{action:'reference',kind:'character',assetId:a})).status,200);
 equal((await post(project,{action:'reference',kind:'character',assetId:b})).status,200);
 equal((await post(project,{action:'reference',kind:'character',assetId:a})).status,200);
 equal((await post(project,{action:'reference',kind:'character',assetId:c})).status,200);
 equal((await pg.query("select count(*)::int n from public.ugc_v3_tasks where project_id=$1 and kind='character'",[project])).rows[0].n,3);
 await tick(project);
 let dto=await read(project),sheetA=dto.artifacts.find(x=>x.characterId===a);
 ok(sheetA?.current);equal(sheetA.approved,false);
 await tick(project);dto=await read(project);
 let sheetB=dto.artifacts.find(x=>x.characterId===b);
 ok(sheetB?.current);equal(dto.artifacts.find(x=>x.id===sheetA.id).approved,false);
 equal(dto.artifacts.filter(x=>x.kind==='character'&&x.activeSlot).length,2);
 equal(await call('ugc_v3_queue_reference_cleanup',[owner,project,false]),0);
 equal(load('lib/final-video-generation-v3/reference-retention.ts').discardableReferences(await new h.V3Store(h.db).read(owner,project)).length,0);
 equal((await post(project,{action:'review_artifact',id:sheetA.id,decision:'approve'})).status,200); // Cam is still queued.
 await tick(project);ok((await read(project)).artifacts.find(x=>x.characterId===c)?.current);
 const edits=calls.slice(start).filter(c=>c.kind==='character');equal(edits.length,3);
 equal(edits.map(c=>c.subject.name),['Ari','Bea','Cam']);equal(edits.map(c=>c.subject.originalId),[a,b,c]);
 equal(edits[0].inputHash,hash((await media.inspectImage(master)).bytes));equal(edits[1].inputHash,hash((await media.inspectImage(oddImage)).bytes));
 equal((await post(project,{action:'reference',kind:'location'})).body.code,'APPROVE_CURRENT_REFERENCES_FIRST');
 equal((await post(project,{action:'review_artifact',id:sheetB.id,decision:'approve'})).status,200);
 // Explicitly remove a third uploaded entry: its saved unapproved sheet is
 // retained, cannot supersede A/B and is not silently attached to their package.
 await pg.query('update public.project_assets set removed_from_draft=true where id=$1',[c]);
 const bBefore=(await pg.query('select * from public.ugc_v3_artifacts where id=$1',[sheetB.id])).rows[0],deletedBefore=deleted.length;
 equal((await post(project,{action:'reference',kind:'character',assetId:a})).body.code,'V3_REFERENCE_CONFIRMATION_REQUIRED');
 equal((await post(project,{action:'reference',kind:'character',assetId:a,confirmedDeletion:true,expectedId:sheetB.id,expectedVersion:sheetB.version})).body.code,'V3_REFERENCE_SOURCE_STALE');
 equal((await post(project,{action:'reference',kind:'character',assetId:a,confirmedDeletion:true,expectedId:sheetA.id,expectedVersion:sheetA.version})).status,200);
 equal(deleted.slice(deletedBefore),[sheetA.id]);
 equal((await pg.query('select * from public.ugc_v3_artifacts where id=$1',[sheetB.id])).rows[0],bBefore);
 equal((await read(project)).artifacts.find(x=>x.id===sheetB.id).current,true);
 await tick(project);dto=await read(project);sheetA=dto.artifacts.find(x=>x.characterId===a&&x.activeSlot);ok(sheetA.current);
 equal((await post(project,{action:'review_artifact',id:sheetA.id,decision:'approve'})).status,200);
 // Reject/delete only the newly generated B candidate; A's older approved version survives its higher receipt floor.
 equal((await post(project,{action:'reference',kind:'character',assetId:b,confirmedDeletion:true,expectedId:sheetB.id,expectedVersion:sheetB.version})).status,200);
 await tick(project);sheetB=(await read(project)).artifacts.find(x=>x.characterId===b&&x.activeSlot);
 const countBeforeReject=calls.length;
 equal((await post(project,{action:'review_artifact',id:sheetB.id,kind:'character',expectedVersion:sheetB.version,decision:'reject'})).status,200);
 equal(calls.length,countBeforeReject);equal((await read(project)).artifacts.find(x=>x.id===sheetA.id).current,true);
 equal((await post(project,{action:'reference',kind:'character',assetId:b})).status,200);await tick(project);
 sheetB=(await read(project)).artifacts.find(x=>x.characterId===b&&x.activeSlot);
 equal((await post(project,{action:'review_artifact',id:sheetB.id,decision:'approve'})).status,200);
 const cast=await call('ugc_v3_character_cast',[project]);equal(cast.map(c=>c.characterId),[a,b]);
 equal((await read(project)).characterIds,[a,b]);
 const beforeSwitch=await h.cp(project),callCount=calls.length;
 await call('studio_mode_save',[owner,project,'basic']);
 equal(await h.cp(project),beforeSwitch);equal((await read(project)).artifacts.filter(x=>x.kind==='character'&&x.current&&x.approved).length,2);
 equal((await post(project,{action:'reference',kind:'character',assetId:a})).body.code,'V3_PRO_CHARACTERS_RETAINED');equal(calls.length,callCount);
 await assert.rejects(()=>insert(project,owner,'Blocked in Basic'),/UGC V1 supports one character/);ok(true);
 await call('studio_mode_save',[owner,project,'pro']);equal(await h.cp(project),beforeSwitch);
 equal((await post(project,{action:'reference',kind:'location'})).status,200);await tick(project);await tick(project);
 dto=await read(project);const location=dto.artifacts.find(x=>x.kind==='location');ok(location?.current);
 const locTask=(await pg.query("select input from public.ugc_v3_tasks where project_id=$1 and kind='location'",[project])).rows[0].input;
 equal(locTask.references,[sheetA.id,sheetB.id]);equal(locTask.cast,cast);
 ok(calls.filter(c=>c.kind==='plan').at(-1).body.input[0].content[0].text.includes('Ari'));ok(calls.filter(c=>c.kind==='plan').at(-1).body.input[0].content[0].text.includes('Bea'));
 equal((await post(project,{action:'review_artifact',id:location.id,decision:'approve'})).status,200);
 equal((await post(project,{action:'storyboard'})).status,200);await tick(project);
 dto=await read(project);const board=dto.artifacts.find(x=>x.kind==='storyboard');ok(board?.current);
 equal(board.storyboard.cast,cast);equal(board.storyboard.scenes.flatMap(s=>s.speech.map(l=>l.characterId)),[a,b]);
 const storyRequest=calls.filter(c=>c.kind==='storyboard').at(-1).body;equal(storyRequest.text.format.name,'director_storyboard_cast_v1');equal(storyRequest.input[0].content.filter(c=>c.type==='input_image').length,3);
 equal((await post(project,{action:'review_artifact',id:board.id,decision:'approve'})).status,200);
 const firstBuild=await post(project,{action:'build_package'});assert.equal(firstBuild.status,200,JSON.stringify(firstBuild.body));ok(true);await tick(project);
 let task=(await pg.query("select * from public.ugc_v3_tasks where project_id=$1 and kind='package' order by created_at desc limit 1",[project])).rows[0];
 equal(task.status,'failed');equal(task.error_code,'V3_PRO_REFERENCE_LIMITS_UNVERIFIED');
 const file=path.join(os.tmpdir(),'sceenyk-cast-limits-'+randomUUID()+'.json'),oldFile=process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;
 const evidence={model:'bytedance/seedance-2.5/reference-to-video',verifiedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),sources:['https://docs.higgsfield.ai/fixture-only'],maxImageCount:2,maxImageBytes:10_000_000,imageMimeTypes:['image/png'],maxPromptBytes:500_000,maxBodyBytes:600_000};
 try{
  fs.writeFileSync(file,JSON.stringify(evidence));process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE=file;
  equal((await post(project,{action:'build_package',retryTaskId:task.id})).status,200);await tick(project);
  task=(await pg.query('select * from public.ugc_v3_tasks where id=$1',[task.id])).rows[0];equal(task.error_code,'REFERENCE_COUNT_EXCEEDED');
  evidence.maxImageCount=3;fs.writeFileSync(file,JSON.stringify(evidence));
  equal((await post(project,{action:'build_package',retryTaskId:task.id})).status,200);await tick(project);
  task=(await pg.query('select * from public.ugc_v3_tasks where id=$1',[task.id])).rows[0];equal(task.status,'done');
  const w=await new h.V3Store(h.db).read(owner,project),doc=w.packages.at(-1).document;
  equal(doc.source.references.filter(r=>r.role==='character').map(r=>({id:r.id,characterId:r.characterId,name:r.name})),cast.map(c=>({id:c.referenceId,characterId:c.characterId,name:c.name})));
  equal(doc.source.storyboardContent.cast,cast);equal(doc.segments.length,1);
  const body=w.quotes.at(-1).document.segments[0].body;
  equal(body.image_urls.length,3);ok(body.prompt.includes('Ari'));ok(body.prompt.includes('Bea'));ok(body.prompt.includes(a));ok(body.prompt.includes(b));
  const validate=load('lib/final-video-generation-v3/character-cast.ts').validateCharacterCast;
  validate(doc.source.storyboardContent,doc.source.references);ok(true);
  const mixed=structuredClone(doc.source.storyboardContent);mixed.scenes[0].speech[0].characterId=foreignSource;
  assert.throws(()=>validate(mixed,doc.source.references),/V3_CHARACTER_SPEAKER_INVALID/);ok(true);
  equal(await call('ugc_v3_runtime_current',[doc.id]),true);
  const savedDoc=JSON.stringify(doc),savedCalls=calls.length,approvedA=(await pg.query('select * from public.ugc_v3_artifacts where id=$1',[sheetA.id])).rows[0];
  await pg.query('update public.project_assets set reference_name=$1 where id=$2',['Beatrice',b]);
  equal((await pg.query('select * from public.ugc_v3_artifacts where id=$1',[sheetA.id])).rows[0],approvedA);
  equal(await call('ugc_v3_artifact_current',[sheetA.id]),true);equal(await call('ugc_v3_artifact_current',[sheetB.id]),true);
  equal(await call('ugc_v3_artifact_current',[location.id]),false);equal(await call('ugc_v3_runtime_current',[doc.id]),false);
  equal(JSON.stringify((await pg.query('select document from public.ugc_v3_packages where id=$1',[doc.id])).rows[0].document),savedDoc);equal(calls.length,savedCalls);
  // Membership changes never drop another character from an existing package.
  await pg.query('update public.project_assets set removed_from_draft=true where id=$1',[b]);
  equal(await call('ugc_v3_artifact_current',[sheetA.id]),true);equal(await call('ugc_v3_artifact_current',[sheetB.id]),false);equal(calls.length,savedCalls);
 }finally{fs.rmSync(file,{force:true});if(oldFile===undefined)delete process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;else process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE=oldFile;}
 // Functions remain service-only and independent owners cannot enter another roster.
 for(const fn of ['ugc_v3_character_cast(uuid)','ugc_v3_reference_ids(uuid,boolean)','ugc_v3_source_cast_current(uuid,jsonb)'])for(const role of ['anon','authenticated','service_role'])equal((await pg.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,'public.'+fn])).rows[0].allowed,role==='service_role');
 await assert.rejects(()=>call('ugc_v3_regenerate_reference',[otherOwner,project,{kind:'character',input:{originalId:a},requestKey:'foreign'}]),/FRESH_V3_PROJECT_REQUIRED/);ok(true);
 h.setMode('pass');
}
