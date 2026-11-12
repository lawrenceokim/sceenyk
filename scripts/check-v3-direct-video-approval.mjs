// Disposable PostgreSQL only. Existing saved-result fixtures, no worker or provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

let checks=0,networkCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
const pg=new PGlite();
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const call=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
const reject=async(fn,code)=>{await assert.rejects(fn,new RegExp(code));checks++;};
const catalog=async()=>(await pg.query("select oid,prosrc,proacl,proconfig from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
try {
  await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  const target='20261104009200_ugc_v3_direct_video_approval.sql';
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')&&n<target).sort())
    await pg.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  const before=await catalog(),sql=fs.readFileSync(`supabase/migrations/${target}`,'utf8');
  await pg.exec(sql);await pg.exec(sql);
  equal((await catalog()).filter(a=>before.some(b=>b.oid===a.oid)),before);
  for(const role of ['anon','authenticated','service_role'])equal((await pg.query("select has_function_privilege($1,'public.ugc_v3_approve_video(uuid,uuid,uuid)','execute') allowed",[role])).rows[0].allowed,role==='service_role');

  // Raw SQL fixtures represent already saved work. Admission/generation code is never called.
  async function savedProject() {
    const owner=randomUUID(),project=randomUUID(),storyboard=randomUUID(),task=randomUUID(),pkg=randomUUID(),quote=randomUUID(),run=randomUUID(),auth=randomUUID(),segment=randomUUID();
    const hash=pkg.replaceAll('-','').repeat(2),assetHash='d'.repeat(64);
    await pg.query('insert into public.app_users(id,clerk_user_id) values($1,$2)',[owner,owner]);
    await call('ugc_v3_create_project',[owner,project,{title:'Offline saved video',category:'product-ad',prompt:'Saved fixture',ugcType:'advertisement',settings:{duration:'10',aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'}}]);
    const character=randomUUID(),location=randomUUID(),original=randomUUID();
    await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id) values($1,$2,$3,$4,$5,'fixture.png','image/png',100,'image','uploaded','fixture','character',$1)",[original,owner,project,randomUUID(),`users/${owner}/projects/${project}/${original}/fixture.png`]);
    const context=await call('ugc_v3_generation_context',[project]);
    const briefHash=(await pg.query("select public.ugc_package_digest('sceenyk-v3-brief',jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type)) hash from public.projects p where id=$1",[project])).rows[0].hash;
    for(const [kind,id,refs] of [['character',character,[]],['location',location,[character]],['storyboard',storyboard,[character,location]]]){
      const taskId=kind==='storyboard'?task:randomUUID();
      await pg.query("insert into public.ugc_v3_tasks(id,project_id,kind,request_key,input,status) values($1,$2,$3,$3,'{}','done')",[taskId,project,kind]);
      await pg.query("insert into public.ugc_v3_artifacts(id,project_id,task_id,kind,version,document,approved_at) values($1,$2,$3,$4,1,$5,now())",[id,project,taskId,kind,{asset:{sha256:assetHash},original:{id:original},input:{generationContext:context,references:refs,briefHash}}]);
    }
    await pg.query('insert into public.ugc_v3_sources(project_id,revision,input,input_hash,private_bindings,project_input_hash,operator_id) values($1,1,$2,$3,\'{}\',public.ugc_v3_brief_hash($1),$4)',[project,{references:[character,location].map(id=>({id,version:1,sha256:assetHash})),storyboard:{id:storyboard,version:1}},hash,owner]);
    await pg.query('insert into public.ugc_v3_packages(id,project_id,version,source_revision,document,package_hash) values($1,$2,1,1,$3,$4)',[pkg,project,{segments:[{id:'segment-1'}]},hash]);
    await pg.query('insert into public.ugc_v3_quotes(id,project_id,package_id,document) values($1,$2,$3,\'{}\')',[quote,project,pkg]);
    await pg.query('insert into public.ugc_v3_run_authorizations(id,project_id,package_id,quote_id,segment_uuid,document) values($1,$2,$3,$4,$5,\'{}\')',[auth,project,pkg,quote,segment]);
    await pg.query("insert into public.ugc_v3_runs(id,project_id,package_id,segment_uuid,segment_key,authorization_id,intent,state,result) values($1,$2,$3,$4,'segment-1',$5,$6,'awaiting_review',$7)",[run,project,pkg,segment,auth,{packageHash:hash},{sha256:assetHash}]);
    equal(await call('ugc_v3_runtime_current',[pkg]),true);
    return{owner,project,pkg,run,hash,assetHash};
  }
  const a=await savedProject(),b=await savedProject();
  const approve=(p,id=p.run,owner=p.owner)=>call('ugc_v3_approve_video',[owner,p.project,id]);
  const snapshot=async()=>(await pg.query('select (select count(*) from public.ugc_v3_tasks) tasks,(select count(*) from public.ugc_v3_runs) runs,(select count(*) from public.ugc_v3_run_authorizations) authorizations,(select count(*) from public.ugc_v3_quotes) quotes')).rows[0];
  const existing=await snapshot();
  await reject(()=>approve(a,a.run,b.owner),'V3_PROJECT_NOT_OWNED');
  await reject(()=>approve(a,b.run),'JOINED_REVIEW_UNAVAILABLE');
  for(const state of ['queued','submitting','provider_processing','reconciliation_required','failed','deleting','deleted']){
    await pg.query('update public.ugc_v3_runs set state=$1 where id=$2',[state,a.run]);
    await reject(()=>approve(a),'VIDEO_REVIEW_UNAVAILABLE');
  }
  await pg.query("update public.ugc_v3_runs set state='awaiting_review',result=null where id=$1",[a.run]);
  await reject(()=>approve(a),'VIDEO_REVIEW_UNAVAILABLE');
  await pg.query('update public.ugc_v3_runs set result=$1,intent=$2 where id=$3',[{sha256:a.assetHash},{packageHash:'f'.repeat(64)},a.run]);
  await reject(()=>approve(a),'CURRENT_REVIEW_REQUIRED');
  await pg.query('update public.ugc_v3_runs set intent=$1 where id=$2',[{packageHash:a.hash},a.run]);
  await pg.query("update public.projects set prompt='Changed after saved package' where id=$1",[a.project]);
  await reject(()=>approve(a),'CURRENT_REVIEW_REQUIRED');
  await pg.query("update public.projects set prompt='Saved fixture' where id=$1",[a.project]);
  equal(await approve(a),true);equal(await approve(b),true);
  const saved=(await pg.query('select state,quality,completed_at from public.ugc_v3_runs where id=$1',[a.run])).rows[0];
  equal(saved.state,'approved');equal(saved.quality,null);assert.ok(saved.completed_at);checks++;
  const events=(await pg.query("select document from public.ugc_v3_runtime_events where entity_id=$1 and kind='approve'",[a.run])).rows;
  equal(events,[{document:{reviewMode:'direct',decision:'approve',reviewerId:a.owner,individualChecksRecorded:false}}]);
  equal(await approve(a),true);
  equal((await pg.query('select state,quality,completed_at from public.ugc_v3_runs where id=$1',[a.run])).rows[0],saved);
  equal((await pg.query("select count(*) count from public.ugc_v3_runtime_events where entity_id=$1 and kind='approve'",[a.run])).rows[0].count,1);

  const joined=randomUUID(),joinTask=randomUUID();
  await pg.query("insert into public.ugc_v3_tasks(id,project_id,kind,request_key,input,status) values($1,$2,'join','fixture-join','{}','done')",[joinTask,a.project]);
  const joinDoc={asset:{sha256:'e'.repeat(64)},packageId:a.pkg,packageHash:a.hash,segments:[{runId:a.run,assetHash:a.assetHash}]};
  await pg.query("insert into public.ugc_v3_artifacts(id,project_id,task_id,kind,version,document) values($1,$2,$3,'joined',1,$4)",[joined,a.project,joinTask,joinDoc]);
  await pg.query("update public.ugc_v3_runs set state='awaiting_review' where id=$1",[a.run]);
  await reject(()=>approve(a,joined),'JOINED_APPROVAL_INVALID');
  equal(await approve(a),true);
  await pg.query('update public.ugc_v3_artifacts set document=$1 where id=$2',[{...joinDoc,segments:[{runId:b.run,assetHash:b.assetHash}]},joined]);
  await reject(()=>approve(a,joined),'JOINED_APPROVAL_INVALID');
  await pg.query('update public.ugc_v3_artifacts set document=$1 where id=$2',[joinDoc,joined]);
  equal(await approve(a,joined),true);equal(await approve(a,joined),true);
  assert.ok((await pg.query('select approved_at from public.ugc_v3_artifacts where id=$1',[joined])).rows[0].approved_at);checks++;
  const post=await snapshot();equal({...post,tasks:existing.tasks},existing);equal(post.tasks,existing.tasks+1);
  // Deletion still requires explicit confirmation and queues the original cleanup action.
  await pg.query("update public.ugc_v3_runs set state='awaiting_review' where id=$1",[b.run]);
  await reject(()=>call('ugc_v3_runtime_action',[b.owner,b.project,'reject_delete',{id:b.run}]),'V3_VIDEO_DELETE_CONFIRMATION_REQUIRED');
  await call('ugc_v3_runtime_action',[b.owner,b.project,'reject_delete',{id:b.run,confirmedDeletion:true}]);
  equal((await pg.query('select state from public.ugc_v3_runs where id=$1',[b.run])).rows[0].state,'deleting');
  equal((await pg.query("select input from public.ugc_v3_tasks where project_id=$1 and kind='delete'",[b.project])).rows,[{input:{runId:b.run}}]);
  const deleted=await savedProject();
  await pg.query("update public.projects set deleted_at=now(),status='deleted' where id=$1",[deleted.project]);
  await reject(()=>approve(deleted),'V3_PROJECT_NOT_OWNED');
  equal(networkCalls,0);
  console.log(JSON.stringify({checks,realNetworkCalls:networkCalls,existingFunctionsPreserved:before.length,scope:'Direct owner review, saved results, currentness, idempotence, join and confirmed deletion'}));
}finally{await pg.close();globalThis.fetch=originalFetch;}
