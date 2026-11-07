import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function referenceLimitScenarios(h) {
 const {pg,owner,call,post,read,tick,fixture,generate,load,equal,ok,calls,media,master,sources,seedSheet}=h;
 const {seedanceReferenceLimits:publicLimits}=load('lib/final-video-generation-v3/adapters/higgsfield-reference-limits.ts');
 const {higgsfieldRequestIssues:issues,higgsfieldRequestValidation:validate}=load('lib/final-video-generation-v3/adapters/higgsfield-validity.ts');
 const {validityEvidence}=load('lib/final-video-generation-v3/creative-inputs.ts');
 const {packageBuildError,packageBuildLabel}=load('lib/final-video-generation-v3/package-status.ts');
 const {v3ActionErrorMessage}=load('lib/final-video-generation-v3/reference-errors.ts');
 const file=path.join(os.tmpdir(),'sceenyk-reference-limits-'+randomUUID()+'.json'),oldFile=process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;
 const now=new Date().toISOString();
 const legacy={model:publicLimits.model,verifiedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),
  sources:['https://docs.higgsfield.ai/fixture-only'],maxImageCount:4,maxImageBytes:10_000_000,imageMimeTypes:['image/png'],maxPromptBytes:500_000,maxBodyBytes:600_000};
 const refs=n=>Array.from({length:n+2},(_,i)=>({sizeBytes:1200,mimeType:'image/png',role:i<n?'character':i===n?'product':'location'}));
 const body=n=>({prompt:'Preserve every approved identity.',duration:30,resolution:'480p',output_format:'mp4',generate_audio:true,aspect_ratio:'9:16',
  image_urls:refs(n).map((_,i)=>`https://private.example.test/${i}.png?signature=fixture`)});
 const snapshot=async project=>(await pg.query("select id,kind,version,document,approved_at,rejected_at from public.ugc_v3_artifacts where project_id=$1 order by id",[project])).rows;
 try {
  delete process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;
  equal(await validityEvidence(),publicLimits);
  equal(publicLimits.maxImageCount,30);equal(publicLimits.maxImageBytes,null);equal(publicLimits.maxPromptBytes,null);equal(publicLimits.maxBodyBytes,null);
  for(const n of [1,3,6,28]) {
   equal(issues(body(n),refs(n),await validityEvidence(),now),[]);
   const report=validate(body(n),refs(n),publicLimits,now);
   equal(report.referenceLimits.imageCount,n+2);equal(report.referenceLimits.characterSheets,n);
   equal(report.referenceLimits.productSheets,1);equal(report.referenceLimits.locationSheets,1);equal(report.referenceLimits.maximum,30);
  }
  equal(issues(body(29),refs(29),publicLimits,now),['REFERENCE_COUNT_EXCEEDED']);
  equal(issues(body(3),refs(3),legacy,now),['REFERENCE_COUNT_EXCEEDED']);
  equal(issues(body(29),refs(29),{...legacy,maxImageCount:100},now),['REFERENCE_COUNT_EXCEEDED']);
  equal(issues(body(3),refs(3),{...legacy,maxImageCount:5},now),[]);
  equal(issues(body(3),refs(3),null,now),['V3_PRO_REFERENCE_LIMITS_UNVERIFIED']);
  equal(issues(body(1),refs(1),null,now),[]); // Historical Basic quote compatibility.
  equal(issues(body(3),refs(3),{...legacy,expiresAt:new Date(Date.now()-1000).toISOString()},now),['V3_HIGGSFIELD_REFERENCE_LIMITS_EXPIRED']);
  equal(issues(body(3),refs(3),{...legacy,model:'another/model'},now),['V3_PRO_REFERENCE_LIMITS_UNVERIFIED']);
  equal(issues(body(3),refs(3),publicLimits,now,'another/model'),['V3_PRO_REFERENCE_LIMITS_UNVERIFIED']);
  equal(issues(body(3),refs(3).slice(0,-1),publicLimits,now),['REFERENCE_COUNT_MISMATCH']);
  equal(issues({...body(3),image_urls:body(3).image_urls.map((u,i)=>i===0?'http://example.test/a.png':u)},refs(3),publicLimits,now),['REFERENCE_DELIVERY_INVALID']);
  equal(issues(body(3),refs(3).map((r,i)=>i===0?{...r,mimeType:'image/gif'}:r),publicLimits,now),['REFERENCE_FORMAT_OR_SIZE_INVALID']);
  equal(issues(body(3),refs(3),{...legacy,maxImageCount:5,maxImageBytes:100},now),['REFERENCE_FORMAT_OR_SIZE_INVALID']);
  equal(issues(body(3),refs(3),{...legacy,maxImageCount:5,maxPromptBytes:2},now),['REQUEST_SIZE_EXCEEDED']);
  process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE=file;
  equal(issues(body(3),refs(3),await validityEvidence(),now),['V3_HIGGSFIELD_REFERENCE_LIMITS_UNAVAILABLE']);
  fs.writeFileSync(file,'invalid json');equal(issues(body(3),refs(3),await validityEvidence(),now),['V3_HIGGSFIELD_REFERENCE_LIMITS_INVALID']);
  fs.writeFileSync(file,'null');equal(issues(body(1),refs(1),await validityEvidence(),now),['V3_HIGGSFIELD_REFERENCE_LIMITS_INVALID']);
  fs.writeFileSync(file,JSON.stringify({...legacy,maxImageCount:5}));equal(issues(body(3),refs(3),await validityEvidence(),now),[]);
  fs.writeFileSync(file,' '.repeat(32769));equal(issues(body(3),refs(3),await validityEvidence(),now),['V3_HIGGSFIELD_REFERENCE_LIMITS_INVALID']);
  delete process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;
  for(const code of ['V3_PRO_REFERENCE_LIMITS_UNVERIFIED','V3_HIGGSFIELD_REFERENCE_LIMITS_EXPIRED','V3_HIGGSFIELD_REFERENCE_LIMITS_INVALID','V3_HIGGSFIELD_REFERENCE_LIMITS_UNAVAILABLE']) {
   equal(packageBuildLabel({code,recoverable:false},'failed'),'Reference limits need confirmation');
   equal(v3ActionErrorMessage(code),packageBuildError(code));ok(!packageBuildError(code).includes('couldn’t finish'));
  }
  equal(packageBuildLabel({code:'REFERENCE_COUNT_EXCEEDED',recoverable:false},'failed'),'Too many reference images');
  for(const text of ['30','per clip','Product','Location','account override'])ok(packageBuildError('REFERENCE_COUNT_EXCEEDED').includes(text));

  for(const [n,duration,studioMode] of [[1,10,'basic'],[1,40,'pro'],[3,40,'pro'],[6,40,'pro'],[28,40,'pro'],[29,40,'pro']]) {
   await call('studio_mode_save',[owner,null,studioMode]);
   const f=await fixture(false,String(duration)),project=f.project;
   // Already-approved sheets are fixtures; this task never regenerates them.
   for(let i=1;i<n;i++) {
    const id=randomUUID();sources.set(`${project}:character`,id);
    await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id,reference_name) values($1,$2,$3,$4,$5,'fixture.png','image/png',$6,'image','uploaded','source-etag','character',$1,$7)",
     [id,owner,project,randomUUID(),`users/${owner}/projects/${project}/${id}/fixture.png`,master.length,`Character ${i+1}`]);
    await pg.query('update public.project_assets set created_at=$1 where id=$2',[new Date(Date.now()+i*1000).toISOString(),id]);
    await seedSheet(project,'character',f.context,true);
   }
   await generate(project);let dto=await read(project),location=dto.artifacts.find(a=>a.kind==='location');
   equal((await post(project,{action:'review_artifact',id:location.id,decision:'approve'})).status,200);
   h.setDurations(duration===40?[10000,20000,10000]:[5000,5000]);
   equal((await post(project,{action:'storyboard'})).status,200);await tick(project);dto=await read(project);
   const story=dto.artifacts.find(a=>a.kind==='storyboard');ok(story?.current);
   equal((await post(project,{action:'review_artifact',id:story.id,decision:'approve'})).status,200);
   const before=await snapshot(project),creativeRequests=calls.length;
   // Reproduce a persisted blocked package, then retry the same task after the
   // override is reviewed. No sheet, Director or paid request is repeated.
   if(n===3) {
    fs.writeFileSync(file,JSON.stringify({...legacy,expiresAt:new Date(Date.now()-1000).toISOString()}));process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE=file;
   }
   let response=await post(project,{action:'build_package'});assert.equal(response.status,200,JSON.stringify(response.body));ok(true);await tick(project);
   let w=await new h.V3Store(h.db).read(owner,project),task=w.tasks.filter(t=>t.kind==='package').at(-1);
   if(n===3) {
    equal(task.error_code,'V3_HIGGSFIELD_REFERENCE_LIMITS_EXPIRED');equal(task.status,'failed');equal(await snapshot(project),before);
    delete process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;
    response=await post(project,{action:'build_package',retryTaskId:task.id});equal(response.status,200);await tick(project);
    w=await new h.V3Store(h.db).read(owner,project);equal(w.tasks.filter(t=>t.kind==='package').length,1);equal(w.tasks.find(t=>t.id===task.id).status,'done');
    task=w.tasks.find(t=>t.id===task.id);
   }
   equal(await snapshot(project),before);equal(calls.length,creativeRequests);equal(w.runs.length,0);equal(w.runtimeAuthorizations.length,0);
   if(n===29) {
    equal(task.status,'failed');equal(task.error_code,'REFERENCE_COUNT_EXCEEDED');equal(w.packages.length,0);equal(w.quotes.length,0);
    const status=(await read(project)).tasks.find(t=>t.id===task.id);equal(packageBuildLabel(status.packageBuild,status.status),'Too many reference images');
    continue;
   }
   assert.equal(task.status,'done',task.error_code);ok(true);
   dto=await read(project);equal(dto.preflight.estimatedCostMicrousd,duration*205667);equal(dto.preflight.segmentCount,duration===40?2:1);
   const doc=w.packages.at(-1).document,quote=w.quotes.at(-1).document;
   equal(doc.source.storyboard.id,story.id);equal(doc.source.storyboardContent,story.storyboard);equal(doc.source.references.length,n+2);
   equal(quote.validityEvidence,publicLimits);equal(quote.totalMicrousd,duration*205667);
   equal(doc.segments.map(s=>s.durationMs),duration===40?[30000,10000]:[10000]);
   for(const segment of quote.segments) {
    equal(segment.body.image_urls.length,n+2);equal(segment.body.duration,duration===40?(segment.segmentId===quote.segments[0].segmentId?30:10):10);
    equal(segment.body.resolution,'480p');equal(segment.estimatedCostMicrousd,segment.body.duration*205667);
    equal(issues(segment.body,doc.source.references,quote.validityEvidence,new Date().toISOString(),segment.model),[]);
    doc.source.references.forEach((ref,index)=>{
     const artifact=w.artifacts.find(a=>a.id===ref.id);ok(segment.body.image_urls[index].includes(artifact.document.asset.id));
     if(ref.role==='character') {ok(segment.body.prompt.includes(ref.characterId??ref.name));ok(segment.body.prompt.includes(`image reference ${index+1} defines character: ${ref.name}`));}
    });
   }
   if(n>1)equal(doc.source.references.filter(r=>r.role==='character').map(r=>r.characterId),story.storyboard.cast.map(c=>c.characterId));
   equal(dto.complete,false);
  }
  equal(h.getVideoPosts(),0);equal(h.getEstimateCalls(),0);ok(media);
 } finally {
  fs.rmSync(file,{force:true});if(oldFile===undefined)delete process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;else process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE=oldFile;
 }
}
