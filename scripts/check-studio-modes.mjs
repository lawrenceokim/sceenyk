// Disposable PostgreSQL and real services/actions. No hosted writes or providers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {typescriptLoader} from './lib/load-typescript.mjs';

let checks=0,networkCalls=0,identity=null;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
const pg=new PGlite();
const eq=(a,b)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;};
const ok=value=>{assert.ok(value);checks++;};
const call=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
const catalog=async()=>(await pg.query("select oid,prosrc,proacl,proconfig from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
const db={rpc:async(name,args)=>{try{return{data:await call(name,Object.values(args)),error:null};}catch{return{data:null,error:{code:'FIXTURE_REJECTED'}};}}};
const load=typescriptLoader({
  '@/lib/auth/read-app-user':{readAppUser:async()=>{if(!identity)throw Error('AUTH_REQUIRED');return{id:identity,clerk_user_id:'clerk-'+identity};}},
  '@/lib/db/server':{createDatabaseClient:()=>db},
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>{if(!identity)throw Error('AUTH_REQUIRED');return{id:identity,clerk_user_id:'clerk-'+identity};}},
  'next/navigation':{unstable_rethrow:()=>{}},
  'next/cache':{revalidatePath:()=>{throw Error('MODE_MUST_NOT_REVALIDATE');}},
});
const service=load('lib/studio-mode/server.ts'),actions=load('app/actions/studio-mode.ts');
const target='20261105009400_studio_modes.sql';
const fields={title:'Saved Basic fixture',category:'cinematic',prompt:'Preserve saved direction',ugcType:'advertisement',settings:{duration:'10',aspectRatio:'9:16',visualStyle:'Original',tone:'Storytelling'}};
const createProject=async(owner)=>{const id=randomUUID();await call('ugc_v3_create_project',[owner,id,fields]);return id;};

try {
  await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')&&n<target).sort())await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const a=randomUUID(),b=randomUUID();
  for(const id of [a,b])await pg.query('insert into public.app_users(id,clerk_user_id) values($1,$2)',[id,id]);
  const old=await createProject(a);
  const beforeProject=(await pg.query('select to_jsonb(p) value from public.projects p where id=$1',[old])).rows[0].value;
  const existingFunctions=await catalog();
  const securityBefore=(await pg.query("select oid,relacl,relrowsecurity from pg_class where oid in ('public.projects'::regclass,'public.creation_preferences'::regclass)")).rows;
  const triggersBefore=(await pg.query("select oid,pg_get_triggerdef(oid) definition from pg_trigger where not tgisinternal order by oid")).rows;
  const sql=fs.readFileSync('supabase/migrations/'+target,'utf8');
  await pg.exec(sql);await pg.exec(sql);
  eq((await catalog()).filter(x=>existingFunctions.some(y=>y.oid===x.oid)),existingFunctions);
  eq((await pg.query("select oid,relacl,relrowsecurity from pg_class where oid in ('public.projects'::regclass,'public.creation_preferences'::regclass)")).rows,securityBefore);
  eq((await pg.query("select oid,pg_get_triggerdef(oid) definition from pg_trigger where not tgisinternal order by oid")).rows.filter(x=>triggersBefore.some(y=>y.oid===x.oid)),triggersBefore);
  eq((await pg.query("select to_jsonb(p)-'studio_mode' value from public.projects p where id=$1",[old])).rows[0].value,beforeProject);
  identity=a;
  eq(await service.readStudioMode(old),{preferredMode:'basic',projectMode:'basic',clerkUserId:'clerk-'+a});
  eq((await actions.saveStudioModeAction({projectId:null,mode:'pro'})).ok,true);
  eq((await service.readStudioMode(old)).projectMode,'basic');
  const first=await createProject(a),second=await createProject(a),foreign=await createProject(b);
  eq((await service.readStudioMode(first)).projectMode,'pro');
  eq((await service.readStudioMode(null)).preferredMode,'pro');
  // Existing Settings upserts must not reset the new mode; mode writes preserve Settings.
  await call('creation_preferences_save',[a,'1:1','social']);
  eq((await service.readStudioMode(null)).preferredMode,'pro');
  eq((await actions.saveStudioModeAction({projectId:first,mode:'basic'})).ok,true);
  eq((await service.readStudioMode(first)).projectMode,'basic');
  eq((await service.readStudioMode(second)).projectMode,'pro');
  eq(await call('creation_preferences_read',[a]),{aspectRatio:'1:1',category:'social'});
  const newBasic=await createProject(a);
  eq((await service.readStudioMode(newBasic)).projectMode,'basic');
  // The non-V3 insert path inherits the preference too, without brief changes.
  await service.saveStudioMode({projectId:null,mode:'pro'});
  const normal=(await pg.query("insert into public.projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Normal project','social','1:1','10','Original','Storytelling') returning id",[a])).rows[0].id;
  eq((await service.readStudioMode(normal)).projectMode,'pro');
  eq((await service.readStudioMode(first)).projectMode,'basic'); // opening does not change preference
  eq((await service.readStudioMode(null)).preferredMode,'pro');

  const preferenceBefore=await service.readStudioMode(null);
  for(const mode of ['pro','basic']){
    eq((await actions.saveStudioModeAction({projectId:foreign,mode})).ok,false);
    eq((await actions.readStudioModeAction(foreign)).ok,false);
  }
  eq(await service.readStudioMode(null),preferenceBefore);
  for(const input of [{projectId:first,mode:'advanced'},{projectId:first,mode:'pro',ownerId:b},{projectId:'invalid',mode:'pro'},{projectId:null,mode:null}])eq((await actions.saveStudioModeAction(input)).ok,false);
  identity=null;
  eq((await actions.readStudioModeAction(null)).ok,false);
  eq((await actions.saveStudioModeAction({projectId:first,mode:'pro'})).ok,false);
  identity=b;
  eq((await service.readStudioMode(null)).preferredMode,'basic');
  eq((await service.readStudioMode(foreign)).projectMode,'basic');
  for(const role of ['anon','authenticated','service_role'])for(const fn of ['studio_mode_read(uuid,uuid)','studio_mode_save(uuid,uuid,text)'])eq((await pg.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,'public.'+fn])).rows[0].allowed,role==='service_role');
  for(const role of ['anon','authenticated']){
    await pg.exec('set role '+role);
    await assert.rejects(()=>pg.query('select public.studio_mode_save($1,$2,\'pro\')',[a,old]));checks++;
    await assert.rejects(()=>pg.query("update public.projects set studio_mode='pro' where id=$1",[old]));checks++;
    await pg.exec('reset role');
  }
  // Existing accepted reference/Storyboard/package/authority/video rows remain
  // byte-for-byte identical and current after either mode selection.
  identity=a;
  const project=old,pkg=randomUUID(),quote=randomUUID(),run=randomUUID(),auth=randomUUID(),segment=randomUUID();
  const character=randomUUID(),location=randomUUID(),storyboard=randomUUID(),original=randomUUID(),hash='a'.repeat(64),assetHash='b'.repeat(64);
  await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id) values($1,$2,$3,$4,$5,'fixture.png','image/png',100,'image','uploaded','fixture','character',$1)",[original,a,project,randomUUID(),`users/${a}/projects/${project}/${original}/fixture.png`]);
  const context=await call('ugc_v3_generation_context',[project]);
  const briefHash=(await pg.query("select public.ugc_package_digest('sceenyk-v3-brief',jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type)) hash from public.projects p where id=$1",[project])).rows[0].hash;
  for(const [kind,id,refs] of [['character',character,[]],['location',location,[character]],['storyboard',storyboard,[character,location]]]){
    const task=randomUUID();
    await pg.query("insert into public.ugc_v3_tasks(id,project_id,kind,request_key,input,status) values($1,$2,$3,$3,'{}','done')",[task,project,kind]);
    await pg.query('insert into public.ugc_v3_artifacts(id,project_id,task_id,kind,version,document,approved_at) values($1,$2,$3,$4,1,$5,now())',[id,project,task,kind,{asset:{sha256:assetHash},original:{id:original},input:{generationContext:context,references:refs,briefHash}}]);
  }
  await pg.query('insert into public.ugc_v3_sources(project_id,revision,input,input_hash,private_bindings,project_input_hash,operator_id) values($1,1,$2,$3,\'{}\',public.ugc_v3_brief_hash($1),$4)',[project,{references:[character,location].map(id=>({id,version:1,sha256:assetHash})),storyboard:{id:storyboard,version:1}},hash,a]);
  await pg.query('insert into public.ugc_v3_packages(id,project_id,version,source_revision,document,package_hash) values($1,$2,1,1,$3,$4)',[pkg,project,{segments:[{id:'segment-1'}]},hash]);
  await pg.query('insert into public.ugc_v3_quotes(id,project_id,package_id,document) values($1,$2,$3,\'{}\')',[quote,project,pkg]);
  await pg.query('insert into public.ugc_v3_run_authorizations(id,project_id,package_id,quote_id,segment_uuid,document) values($1,$2,$3,$4,$5,\'{}\')',[auth,project,pkg,quote,segment]);
  await pg.query("insert into public.ugc_v3_runs(id,project_id,package_id,segment_uuid,segment_key,authorization_id,intent,state,result) values($1,$2,$3,$4,'segment-1',$5,$6,'approved',$7)",[run,project,pkg,segment,auth,{packageHash:hash},{sha256:assetHash}]);
  const tables=['project_assets','ugc_v3_projects','ugc_v3_sources','ugc_v3_packages','ugc_v3_quotes','ugc_v3_run_authorizations','ugc_v3_runs','ugc_v3_artifacts','ugc_v3_tasks','ugc_v3_runtime_events','generation_jobs','ugc_generation_jobs','ugc_generation_packages','generation_accounts','credit_ledger'];
  const protectedState=async()=>{const out={};for(const table of tables)out[table]=(await pg.query('select * from public.'+table)).rows;return out;};
  const before=await protectedState(),inputHash=await call('ugc_v3_brief_hash',[project]);
  eq(await call('ugc_v3_runtime_current',[pkg]),true);
  for(const mode of ['pro','basic','pro']){
    eq((await actions.saveStudioModeAction({projectId:project,mode})).ok,true);
    eq(await protectedState(),before);
    eq(await call('ugc_v3_brief_hash',[project]),inputHash);
    eq(await call('ugc_v3_generation_context',[project]),context);
    eq(await call('ugc_v3_runtime_current',[pkg]),true);
    eq((await pg.query("select to_jsonb(p)-'studio_mode'-'updated_at' value from public.projects p where id=$1",[project])).rows[0].value,(()=>{const v={...beforeProject};delete v.updated_at;return v;})());
  }
  await pg.query("update public.projects set status='deleted',deleted_at=now() where id=$1",[normal]);
  const preferred=await service.readStudioMode(null);
  eq((await actions.saveStudioModeAction({projectId:normal,mode:'basic'})).ok,false);
  eq(await service.readStudioMode(null),preferred);
  ok(networkCalls===0);
  console.log(JSON.stringify({passed:checks,migrations:94,networkCalls,evidence:'Real services/actions and rerunnable migration; owner isolation, preference/project inheritance, unchanged saved generation records/currentness. Disposable PostgreSQL only; no native multi-connection contention or hosted acceptance.'}));
} finally {await pg.close();globalThis.fetch=originalFetch;}
