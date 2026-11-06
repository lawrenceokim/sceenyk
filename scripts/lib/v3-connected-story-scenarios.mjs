import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

export function connectedFixtureStory(storyboard,boundaries) {
 return {...storyboard,version:'director-storyboard-connected-v1',
  clips:boundaries.map((b,i)=>({...b,purpose:`Advance story beat ${i+1} toward the one final reveal.`,
   continuityIn:i===0?'Ari left, Bea right, cup on table, warm north light; camera faces north.':`Handoff ${i}: Ari left holds cup in left hand; Bea right watches, camera north, warm light and room tone continue.`,
   continuityOut:`Handoff ${i+1}: Ari left holds cup in left hand; Bea right watches, camera north, warm light and room tone continue.`,
   audioContinuity:'Same quiet room tone and separate steady voices; no music or audio restart.'})),
  scenes:storyboard.scenes.map(s=>{const clip=boundaries.find(c=>s.startMs>=c.startMs&&s.endMs<=c.endMs);assert.ok(clip);return{...s,clipId:clip.id,localStartMs:s.startMs-clip.startMs,localEndMs:s.endMs-clip.startMs};})};
}

export async function connectedStoryScenarios(h) {
 const {pg,owner,call,post,read,tick,fixture,generate,load,equal,ok,calls,cp,spool}=h;
 const planning=load('lib/final-video-generation-v3/connected-story.ts');
 const {validateDirectedStoryboard}=load('lib/final-video-generation-v3/storyboard-director.ts');
 const {directorStoryboardSchema}=load('lib/final-video-generation-v3/contract.ts');
 const {saveOwnedProject,getOwnedProject}=load('lib/projects/server.ts');
 const original=await fixture();await generate(original.project);
 const project=original.project;
 let dto=await read(project),location=dto.artifacts.find(a=>a.kind==='location');
 equal((await post(project,{action:'review_artifact',id:location.id,decision:'approve'})).status,200);
 await call('studio_mode_save',[owner,project,'pro']);
 const sheets=await cp(project),locationDoc=(await pg.query('select document from public.ugc_v3_artifacts where id=$1',[location.id])).rows[0].document;
 const migration=fs.readFileSync('supabase/migrations/20261105009700_ugc_v3_connected_story_planning.sql','utf8');
 const security=async()=>(await pg.query("select oid,relacl::text,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by oid")).rows;
 const secured=await security();await pg.exec(migration);await pg.exec(migration);equal(await security(),secured);
 for(const duration of [10,20,30,40,70,90,120]) {
  const saved=await getOwnedProject(project);
  const input={id:project,mode:'update',title:saved.title,prompt:saved.prompt,category:saved.category,creationType:'ugc',ugcType:saved.ugcType,settings:{...saved.settings,duration:String(duration)}};
  const result=await saveOwnedProject(input);equal(result.ok,true);equal((await getOwnedProject(project)).settings.duration,String(duration));
  const boundaries=planning.planStoryClips(duration*1000);
  equal(boundaries.map(b=>b.durationMs),duration===10?[10000]:duration===20?[20000]:duration===30?[30000]:duration===40?[30000,10000]:duration===70?[30000,30000,10000]:duration===90?[30000,30000,30000]:[30000,30000,30000,30000]);
  equal(await call('ugc_v3_story_clip_boundaries',[duration*1000]),boundaries);
  equal(boundaries.reduce((a,b)=>a+b.durationMs,0),duration*1000);equal(planning.planStoryClips(duration*1000),boundaries);
  dto=await read(project);ok(dto.artifacts.find(a=>a.id===location.id).current);equal(await cp(project),sheets);
  if(duration!==10){ok(dto.artifacts.filter(a=>a.kind==='storyboard').every(a=>!a.current));ok(!dto.preflight?.canSubmit);}
  // Two variable shots in every clip; the Director remains free to pick pacing.
  h.setDurations(boundaries.flatMap(b=>[4000,b.durationMs-4000]));
  const before=calls.length;equal((await post(project,{action:'storyboard'})).status,200);await tick(project);
  dto=await read(project);const story=dto.artifacts.filter(a=>a.kind==='storyboard').at(-1);ok(story?.current);equal(story.approved,false);
  equal(calls.slice(before).filter(c=>c.kind==='storyboard').length,1);
  const request=calls.at(-1).body;equal(request.input[0].content.filter(c=>c.type==='input_image').length,3);
  ok(request.input[0].content[0].text.includes('480p'));ok(request.input[0].content[0].text.includes(String(duration*1000)));
  const document=story.storyboard;equal(validateDirectedStoryboard(document,document),document);
  equal(directorStoryboardSchema.parse(JSON.parse(JSON.stringify(document))),document);
  const hash=load('lib/final-video-generation-v3/identity.ts').storyboardContentHash(document);
  equal((await post(project,{action:'review_artifact',id:story.id,decision:'approve'})).status,200);
  const restored=(await read(project)).artifacts.find(a=>a.id===story.id);equal(restored.approved,true);equal(restored.storyboard,document);
  equal(load('lib/final-video-generation-v3/identity.ts').storyboardContentHash(restored.storyboard),hash);
  if(duration>30) {
   equal(document.version,'director-storyboard-connected-v1');equal(dto.multiClipPlanningOnly,true);
   equal(await call('ugc_v3_validate_connected_story',[document,duration*1000]),true);
   await assert.rejects(()=>pg.query("update public.ugc_v3_artifacts set document=jsonb_set(document,'{storyboard,clips,0,purpose}',to_jsonb('Changed after approval'::text)) where id=$1",[story.id]),/V3_CONNECTED_STORY_IMMUTABLE/);ok(true);
   ok(request.instructions.includes('ONE complete professional story'));ok(!request.instructions.includes('ONE continuous audiovisual generation'));
   const task=(await pg.query('select input from public.ugc_v3_tasks where id=$1',[story.id])).rows[0].input;
   equal(task.clipBoundaries,boundaries);
   for(const action of ['build_package','authorize','generate'])equal((await post(project,{action})).body.code,'V3_MULTI_CLIP_PLANNING_ONLY');
   const variants=[
    d=>{d.clips[0].endMs-=1000;},d=>{d.clips[1].id='clip-1';},d=>{d.clips[1].continuityIn='Reset the story';},
    d=>{d.scenes[2].localStartMs=1000;},d=>{d.scenes[1].endMs+=1000;},d=>{d.scenes[0].clipId='clip-4';},
    d=>{d.scenes[0].actions[0].endMs=40001;},d=>{d.scenes[1].id=d.scenes[0].id;}
   ];
   for(const mutate of variants){const invalid=structuredClone(document);mutate(invalid);assert.throws(()=>validateDirectedStoryboard(invalid,document));ok(true);equal(await call('ugc_v3_validate_connected_story',[invalid,duration*1000]),false);}
   await assert.rejects(()=>call('ugc_v3_runtime_action',[owner,project,'enqueue',{kind:'video',requestKey:randomUUID(),input:{}}]),/V3_MULTI_CLIP_PLANNING_ONLY|INVALID_TASK/);ok(true);
   // A downgrade preserves the exact approved story and all reference bytes.
   await call('studio_mode_save',[owner,project,'basic']);
   equal((await saveOwnedProject(input)).ok,true);equal((await read(project)).proDurationRetained,true);
   equal((await post(project,{action:'storyboard'})).body.code,'V3_PRO_DURATION_REQUIRED');
   const altered={...input,settings:{...input.settings,duration:duration===120?'110':'120'}};
   equal((await saveOwnedProject(altered)).ok,false);
   equal((await read(project)).artifacts.find(a=>a.id===story.id).storyboard,document);
   await call('studio_mode_save',[owner,project,'pro']);
  } else {
   equal(document.version,'director-storyboard-v3');ok(dto.multiClipPlanningOnly===undefined);
   equal(request.text.format.name,'director_storyboard_v3');
   equal((await post(project,{action:'build_package'})).status,200);await tick(project);
   const short=(await read(project)).preflight;ok(short);equal(short.segmentCount,1);
  }
  // Approved records keep the existing one-time review semantics.
  const callCount=calls.length;equal((await post(project,{action:'review_artifact',id:story.id,decision:'reject'})).body.code,'ARTIFACT_REVIEW_UNAVAILABLE');equal(calls.length,callCount);
 }
 // A known malformed publication cannot enter the saved artifact owner.
 const last=(await pg.query("select * from public.ugc_v3_artifacts where project_id=$1 and kind='storyboard' order by version desc limit 1",[project])).rows[0];
 const invalidDoc=structuredClone(last.document);invalidDoc.storyboard.clips[0].durationMs=29000;
 await assert.rejects(()=>pg.query("insert into public.ugc_v3_artifacts(id,project_id,task_id,kind,version,document) values($1,$2,$3,'storyboard',$4,$5)",[randomUUID(),project,last.task_id,last.version+1,invalidDoc]),/V3_CLIP_PLAN_INVALID/);ok(true);
 await pg.query("update public.projects set duration='110' where id=$1",[project]);
 h.setDurations([10000,20000,10000,20000,10000,20000,10000,10000]);
 equal((await post(project,{action:'storyboard'})).status,200);await tick(project);
 const rejected=(await read(project)).artifacts.filter(a=>a.kind==='storyboard').at(-1),beforeReject=calls.length;
 equal((await post(project,{action:'review_artifact',id:rejected.id,decision:'reject'})).status,200);equal(calls.length,beforeReject);
 equal((await read(project)).artifacts.find(a=>a.id===rejected.id).rejected,true);
 equal((await pg.query('select document from public.ugc_v3_artifacts where id=$1',[location.id])).rows[0].document,locationDoc);equal(await cp(project),sheets);
 // Basic's existing save/Director/single-segment path remains usable.
 await call('studio_mode_save',[owner,null,'basic']);const basic=await fixture();
 await assert.rejects(()=>pg.query("update public.projects set duration='40' where id=$1",[basic.project]),/V3_PRO_DURATION_REQUIRED/);ok(true);
 const foreign=randomUUID();equal((await post(foreign,{action:'storyboard'})).status,409);
 for(const duration of [20,50,60,80,100,110])equal(await call('ugc_v3_story_clip_boundaries',[duration*1000]),planning.planStoryClips(duration*1000));
 for(const duration of [0,5,15,35,130])assert.throws(()=>planning.planStoryClips(duration*1000));
 for(const signature of ['ugc_v3_story_clip_boundaries(integer)','ugc_v3_validate_connected_story(jsonb,integer)','ugc_v3_location_brief_current(uuid,jsonb,jsonb)'])equal((await pg.query("select has_function_privilege('authenticated',$1,'EXECUTE') browser,has_function_privilege('service_role',$1,'EXECUTE') server",['public.'+signature])).rows[0],{browser:false,server:true});
 equal(h.getVideoPosts(),0);ok(spool.size>0);
}
