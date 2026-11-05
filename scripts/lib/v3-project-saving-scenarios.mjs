import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {typescriptLoader} from './load-typescript.mjs';

export async function projectSavingScenarios(h) {
 const {pg,owner,call,post,read,tick,master,oddImage,objects,calls,deleted,equal,ok}=h;
 const invalidations=[],logs=[];let actingOwner=owner, injected=null, authFailure=false;
 const query=async(sql,args=[])=>{
  await pg.exec('set role service_role');
  try{return await pg.query(sql,args);}finally{await pg.exec('reset role');}
 };
 const db={
  async rpc(name,args){
   try {const result=await query(`select public.${name}(${Object.values(args).map((_,i)=>'$'+(i+1)).join(',')}) value`,Object.values(args));return{data:result.rows[0].value,error:null};}
   catch(error){return{data:null,error:{code:error.code,message:error.message}};}
  },
  from(table){assert.ok(['projects','project_assets'].includes(table));let columns='*',fields=null;const clauses=[],values=[];
   return{select(value){assert.match(value,/^[a-z_,*]+$/);columns=value;return this;},update(value){fields=value;return this;},
    eq(k,v){assert.match(k,/^[a-z_]+$/);values.push(v);clauses.push(`${k}=$${values.length}`);return this;},
    in(k,v){assert.match(k,/^[a-z_]+$/);values.push(v);clauses.push(`${k}=any($${values.length}::text[])`);return this;},
    is(k,v){assert.equal(v,null);assert.match(k,/^[a-z_]+$/);clauses.push(`${k} is null`);return this;},
    async execute(single=false){
     if(fields&&injected)return{data:null,error:injected};
     try {
      let sql=`select ${columns} from public.${table} where ${clauses.join(' and ')}`;
      if(fields){const assignments=Object.entries(fields).map(([k,v])=>{assert.match(k,/^[a-z_]+$/);values.push(v);return`${k}=$${values.length}`;});sql=`update public.${table} set ${assignments.join(',')} where ${clauses.join(' and ')} returning ${columns}`;}
      const {rows}=await query(sql,values);return{data:single?rows[0]??null:rows,error:null};
     }catch(error){return{data:null,error:{code:error.code,message:error.message}};}
    },maybeSingle(){return this.execute(true);},then(resolve,reject){return this.execute().then(resolve,reject);}
   };
  }
 };
 class AppUserSyncError extends Error {}
 const load=typescriptLoader({
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>{if(authFailure)throw new AppUserSyncError();return{id:actingOwner};},AppUserSyncError},
  '@/lib/db/server':{createDatabaseClient:()=>db},'next/cache':{revalidatePath:path=>invalidations.push(path)},'next/navigation':{unstable_rethrow:()=>{}}
 },{Error,console:{...console,error:(...args)=>logs.push(args)}});
 const {saveProjectAction}=load('app/actions/projects.ts'),{getOwnedProject}=load('lib/projects/server.ts');
 const {referenceOriginals}=load('lib/final-video-generation-v3/creative-inputs.ts');
 const draft={id:randomUUID(),mode:'create',title:'Pro Save fixture',category:'product-ad',prompt:'Ari and Bea greet one another.',creationType:'ugc',ugcType:'advertisement',settings:{duration:'10',aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'}};
 await call('studio_mode_save',[owner,null,'pro']);
 // Reproduce before the repair using the actual action and actual SQL role.
 equal((await pg.query("select has_column_privilege('service_role','public.projects','video_resolution','update') allowed")).rows[0].allowed,false);
 const failed=await saveProjectAction(draft);equal(failed.ok,false);ok(failed.message.includes('42501'));ok(failed.message.includes('096'));equal(invalidations,[]);
 equal(logs.at(-1),['Project database operation failed.',{operation:'update',code:'42501'}]);
 equal((await pg.query('select count(*)::int n from public.projects where id=$1',[draft.id])).rows[0].n,1);
 // Capture function/security/row state: 096 changes exactly one column ACL.
 const functions=async()=>(await pg.query("select oid,prosrc,proacl::text acl,proconfig from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
 const security=async()=>(await pg.query("select c.oid,c.relacl::text acl,c.relrowsecurity,c.relforcerowsecurity,(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.oid) from pg_trigger t where t.tgrelid=c.oid) triggers from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.oid")).rows;
 const beforeFunctions=await functions(),beforeSecurity=await security(),beforeRows=(await pg.query('select * from public.projects where id=$1',[draft.id])).rows;
 const migration=fs.readFileSync('supabase/migrations/20261105009600_project_save_resolution_permission.sql','utf8');await pg.exec(migration);await pg.exec(migration);
 equal(await functions(),beforeFunctions);equal(await security(),beforeSecurity);equal((await pg.query('select * from public.projects where id=$1',[draft.id])).rows,beforeRows);
 for(const role of ['anon','authenticated','service_role'])equal((await pg.query("select has_column_privilege($1,'public.projects','video_resolution','update') allowed",[role])).rows[0].allowed,role==='service_role');
 for(const column of ['owner_user_id','status','studio_mode','deleted_at'])equal((await pg.query("select has_column_privilege('service_role','public.projects',$1,'update') allowed",[column])).rows[0].allowed,false);
 equal((await pg.query("select has_table_privilege('service_role','public.projects','update') allowed")).rows[0].allowed,false);
 const saved=await saveProjectAction(draft);equal(saved.ok,true);equal(saved.project.id,draft.id);equal(saved.project.workflow,'final-video-v3');
 equal((await pg.query('select studio_mode from public.projects where id=$1',[draft.id])).rows[0].studio_mode,'pro');
 const project=draft.id;let sequence=0;
 const source=async(p,name,bytes=master)=>{
  const id=randomUUID(),key=`users/${owner}/projects/${p}/${id}/fixture.png`;
  const result=await query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id,reference_name,created_at) values($1,$2,$3,$4,$5,'fixture.png','image/png',$6,'image','uploaded','source-etag','character',$1,$7,$8) returning id",[id,owner,p,randomUUID(),key,bytes.length,name,new Date(Date.now()+sequence++*1000).toISOString()]);
  equal(result.rows[0].id,id);objects.set(key,{bytes,asset:{id,etag:'source-etag'}});return id;
 };
 const a=await source(project,'',master),b=await source(project,'',oddImage);
 const named={...draft,mode:'update',referenceNames:[{assetId:a,name:'Ari'},{assetId:b,name:'Bea'}]};
 equal((await saveProjectAction(named)).ok,true);equal((await referenceOriginals(owner,project)).characters,[{id:a,name:'Ari'},{id:b,name:'Bea'}]);
 // Existing actual UI's disabled state is saved-state driven, not a mode gate.
 h.setMode('cast');
 for(const assetId of [a,b])equal((await post(project,{action:'reference',kind:'character',assetId})).status,200);
 await tick(project);await tick(project);
 let dto=await read(project),sheetA=dto.artifacts.find(x=>x.characterId===a),sheetB=dto.artifacts.find(x=>x.characterId===b);
 equal(calls.filter(c=>c.kind==='character').map(c=>c.subject.originalId),[a,b]);
 equal((await post(project,{action:'review_artifact',id:sheetA.id,decision:'approve'})).status,200);
 const approvedA=(await pg.query('select * from public.ugc_v3_artifacts where id=$1',[sheetA.id])).rows[0];
 equal((await post(project,{action:'reference',kind:'character',assetId:b,confirmedDeletion:true,expectedId:sheetB.id,expectedVersion:sheetB.version})).status,200);
 equal(deleted,[sheetB.id]);equal((await pg.query('select * from public.ugc_v3_artifacts where id=$1',[sheetA.id])).rows[0],approvedA);
 await tick(project);sheetB=(await read(project)).artifacts.find(x=>x.characterId===b&&x.activeSlot);
 equal((await post(project,{action:'review_artifact',id:sheetB.id,decision:'approve'})).status,200);
 // Reopen/read through real owner services after independent saved review.
 equal((await getOwnedProject(project)).id,project);equal((await read(project)).artifacts.filter(x=>x.kind==='character'&&x.current&&x.approved).length,2);
 equal((await saveProjectAction({...named,referenceNames:[{assetId:a,name:'Aria'}]})).ok,true);
 equal((await referenceOriginals(owner,project)).characters,[{id:a,name:'Aria'},{id:b,name:'Bea'}]);equal((await pg.query('select * from public.ugc_v3_artifacts where id=$1',[sheetB.id])).rows[0].approved_at!==null,true);
 const snapshot=await h.cp(project),callCount=calls.length;
 await call('studio_mode_save',[owner,project,'basic']);equal((await saveProjectAction({...named,referenceNames:[]})).ok,true);equal(await h.cp(project),snapshot);
 equal((await post(project,{action:'reference',kind:'character',assetId:a})).body.code,'V3_PRO_CHARACTERS_RETAINED');equal(calls.length,callCount);
 await call('studio_mode_save',[owner,project,'pro']);equal(await h.cp(project),snapshot);
 const c=await source(project,'Cam');equal((await saveProjectAction({...named,referenceNames:[]})).ok,true);
 const removed=await query('update public.project_assets set removed_from_draft=true where id=$1 and owner_user_id=$2 returning id',[c,owner]);equal(removed.rows[0].id,c);
 equal((await saveProjectAction({...named,referenceNames:[]})).ok,true);equal((await referenceOriginals(owner,project)).characters.map(x=>x.id),[a,b]);equal(await h.cp(project),snapshot);
 // Existing Basic V3 and historical Basic projects save with the same rules.
 await call('studio_mode_save',[owner,null,'basic']);const basic={...draft,id:randomUUID()};equal((await saveProjectAction(basic)).ok,true);await source(basic.id,'Basic');
 equal((await saveProjectAction({...basic,mode:'update',title:'Existing Basic saved'})).ok,true);
 await assert.rejects(()=>source(basic.id,'Extra'),/UGC V1 supports one character/);ok(true);
 const historical=randomUUID();
 await query("insert into public.projects(id,owner_user_id,title,category,prompt,creation_type,ugc_type,aspect_ratio,duration,visual_style,tone) values($1,$2,'Historical Basic','product-ad','Existing Basic input','ugc','advertisement','9:16','10','Realistic','Professional')",[historical,owner]);
 const historicalSource=await source(historical,'Legacy');
 const historicalSave=await saveProjectAction({...basic,id:historical,mode:'update',referenceNames:[{assetId:historicalSource,name:'Legacy saved'}]});
 equal(historicalSave.ok,true);equal(typeof historicalSave.project.workflow,'undefined');
 equal((await query('select reference_name from public.project_assets where id=$1',[historicalSource])).rows[0].reference_name,'Legacy saved');
 // Failed/foreign name batches never mutate another character or project.
 const rejected=await saveProjectAction({...named,referenceNames:[{assetId:randomUUID(),name:'Wrong source'}]});equal(rejected.ok,false);ok(rejected.message.includes('changed or been removed'));
 equal((await referenceOriginals(owner,project)).characters,[{id:a,name:'Aria'},{id:b,name:'Bea'}]);
 actingOwner=randomUUID();await pg.query('insert into public.app_users(id,clerk_user_id) values($1,$2)',[actingOwner,'foreign-save']);
 equal((await saveProjectAction({...named,referenceNames:[]})).code,'NOT_FOUND');actingOwner=owner;
 for(const code of ['42501','42703','PGRST204','PGRST202','23514','23503']){
  injected={code,message:'PRIVATE fixture detail must not escape'};
  const result=await saveProjectAction({...named,referenceNames:[]});equal(result.ok,false);ok(!result.message.includes('PRIVATE'));ok(result.message!=="Your draft couldn’t be saved. Please try again.");
 }
 injected=null;authFailure=true;ok((await saveProjectAction(named)).message.includes('account'));authFailure=false;
 const retained=await h.cp(project);equal(retained,snapshot);equal(calls.length,callCount);
 h.setMode('pass');
}
