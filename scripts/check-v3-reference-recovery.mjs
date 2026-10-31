// Actual route/action/worker, real disposable PostgreSQL + Sharp, fixture provider/storage. No external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {typescriptLoader} from './lib/load-typescript.mjs';
const require=createRequire(import.meta.url),builder=require('../lib/video-generation-package/builder.ts');
const normalize=value=>JSON.parse(JSON.stringify(value));
let checks=0,sdkCalls=0,networkCalls=0,failPublish=false,failResponseSave=false,providerMode='forbidden';
const equal=(a,b)=>{assert.deepEqual(normalize(a),normalize(b));checks++;};
const ok=value=>{assert.ok(value);checks++;};
const pg=new PGlite(),owner=randomUUID(),oldEnv={...process.env},spool=new Map();
const png=await sharp({create:{width:32,height:32,channels:3,background:'#d3d3d3'}}).png().toBuffer();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const call=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
const db={
 async rpc(name,args){try{return{data:await call(name,Object.values(args)),error:null};}catch(e){return{data:null,error:{code:e.code,message:e.message}};}},
 from(table){assert.ok(['projects','project_assets','ugc_v3_projects'].includes(table));let columns='*';const clauses=[],values=[];
  return{select(value){assert.match(value,/^[a-z_,]+$/);columns=value;return this;},
   eq(key,value){assert.match(key,/^[a-z_]+$/);values.push(value);clauses.push(`${key}=$${values.length}`);return this;},
   is(key,value){assert.equal(value,null);assert.match(key,/^[a-z_]+$/);clauses.push(`${key} is null`);return this;},
   in(key,value){assert.match(key,/^[a-z_]+$/);values.push(value);clauses.push(`${key}=any($${values.length}::text[])`);return this;},
   async execute(single=false){const rows=(await pg.query(`select ${columns} from public.${table} where ${clauses.join(' and ')}`,values)).rows;return{data:single?rows[0]??null:rows,error:null};},
   maybeSingle(){return this.execute(true);},then(resolve,reject){return this.execute().then(resolve,reject);}};
 },
};
const media={bytesHash:hash,readSpool:async(id,name)=>spool.get(`${id}:${name}`)??null,
 saveSpool:async(id,name,value)=>{if(failResponseSave&&name==='openai-response.json')throw new Error('FIXTURE_DISK_FULL');spool.set(`${id}:${name}`,value);},
 writeReferenceDiagnostics:async(id,value)=>{spool.set(`${id}:reference-diagnostics.json`,Buffer.from(JSON.stringify(value)));},
 readPrivate:async()=>png,
 inspectImage:async bytes=>{const output=await sharp(bytes,{limitInputPixels:20000000}).rotate().png().toBuffer(),m=await sharp(output).metadata();return{bytes:output,metadata:{mimeType:'image/png',width:m.width,height:m.height,durationMs:0,hasAudio:false}};},
 publishPrivate:async(user,project,id,bytes,metadata)=>{if(failPublish)throw new Error('FIXTURE_STORAGE_FAILED');return{id,storageKey:`users/${user}/projects/${project}/v3/${id}.png`,etag:'fixture-etag',sha256:hash(bytes),sizeBytes:bytes.length,...metadata};},
 signPrivate:async asset=>({url:`https://private.example.test/${asset.id}`,expiresAt:'fixture'}),
};
class FixtureOpenAI{
 constructor(config){equal(config.maxRetries,0);}
 images={edit:()=>{sdkCalls++;if(providerMode==='forbidden')throw new Error('NEW_PROVIDER_REQUEST_FORBIDDEN');return{asResponse:async()=>{
  if(providerMode==='http_error'){const e=new Error('sk-proj-FAKE_SECRET https://private.invalid/secret');Object.assign(e,{status:429,requestID:'req_fixture_error',code:'insufficient_quota'});throw e;}
  if(providerMode==='timeout'){class APIConnectionTimeoutError extends Error {}throw new APIConnectionTimeoutError('sk-proj-FAKE_SECRET');}
  return new Response(providerMode==='bad_json'?'not json':JSON.stringify({data:[{b64_json:png.toString('base64')}]}),{status:200,headers:{'x-request-id':'req_fixture_success'}});
 }};}};
}
const load=typescriptLoader({
 '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>({id:owner})},'@/lib/auth/require-user':{requireClerkUser:async()=>({userId:'fixture'})},
 '@/lib/db/server':{createDatabaseClient:()=>db},'./runtime-media':media,'./join':{joinV3Segments:async()=>{throw new Error('JOIN_FORBIDDEN');}},
 '@/lib/video-generation-package/builder':{...builder,packageDigest:(domain,value)=>builder.packageDigest(domain,normalize(value)),canonicalJson:value=>builder.canonicalJson(normalize(value))},
 'next/navigation':{unstable_rethrow:()=>{}},openai:{__esModule:true,default:FixtureOpenAI,toFile:async bytes=>new File([bytes],'source.png',{type:'image/png'})},
},{Error,Response,Request,File,AbortController,fetch:async()=>{networkCalls++;throw new Error('NETWORK_FORBIDDEN');},console:{...console,info(){}}});
const route=load('app/api/ugc/v3/route.ts'),worker=load('lib/final-video-generation-v3/local-worker.ts');
const {V3Store}=load('lib/final-video-generation-v3/runtime-store.ts'),{runtimeDto}=load('lib/final-video-generation-v3/runtime-server.ts');
const {referenceFailureLabel}=load('lib/final-video-generation-v3/reference-status.ts');
const {referenceBusy}=load('lib/final-video-generation-v3/progress.ts');
const read=async project=>runtimeDto(await new V3Store(db).read(owner,project));
const post=async(project,payload)=>{const r=await route.POST(new Request('https://studio.example.test/api/ugc/v3',{method:'POST',headers:{origin:'https://studio.example.test','content-type':'application/json'},body:JSON.stringify({projectId:project,...payload})}));return{status:r.status,body:await r.json()};};
const fields={title:'Recovery fixture',category:'product-ad',prompt:'Saved creative context',ugcType:'advertisement',settings:{duration:'10',aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'}};
const context=load('lib/final-video-generation-v3/generation-context.ts').generationContext({prompt:fields.prompt,visual_style:'Realistic',creation_type:'ugc',ugc_type:fields.ugcType,tone:'Professional',category:fields.category});
async function fixture(mode){
 const project=randomUUID(),source=randomUUID(),characterSource=randomUUID();
 await call('ugc_v3_create_project',[owner,project,fields]);
 for(const [id,role]of [[source,'product'],[characterSource,'character']])await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id,reference_name) values($1,$2,$3,$4,$5,'fixture.png','image/png',$6,'image','uploaded','source-etag',$7,$1,$8)",[id,owner,project,randomUUID(),`users/${owner}/projects/${project}/${id}/fixture.png`,png.length,role,role==='product'?'bmw fixture':'Approved character']);
 for(const version of [1,2]){
  await call('ugc_v3_runtime_action',[owner,project,'enqueue',{kind:'character',requestKey:`character:${version}`,input:{}}]);
  const t=await call('ugc_v3_task_claim',[project]),id=randomUUID();
  const asset=await media.publishPrivate(owner,project,id,png,{mimeType:'image/png',width:32,height:32,durationMs:0,hasAudio:false});
  await call('ugc_v3_task_checkpoint',[t.id,t.lease_token,'artifact',{id,document:{asset,original:{id:characterSource},input:{generationContext:context}}}]);
  if(version===2)await call('ugc_v3_runtime_action',[owner,project,'review_artifact',{id,decision:'approve'}]);
 }
 const brief=await load('lib/final-video-generation-v3/creative-inputs.ts').projectBrief(owner,project),subject={role:'product',originalId:source,name:'bmw fixture'};
 const input={model:'fixture-image',provider:'openai',generationContext:context,briefHash:load('lib/final-video-generation-v3/creative-inputs.ts').creativeBriefHash(brief),originalId:source,
  referenceSubject:subject,referenceSource:{id:source,etag:'source-etag',sizeBytes:png.length,mimeType:'image/png'},referencePrompt:load('lib/final-video-generation-v3/reference-sheet-prompt.ts').referenceSheetPromptSnapshot('product',context,subject),references:[],previous:null};
 await call('ugc_v3_runtime_action',[owner,project,'enqueue',{kind:'product',requestKey:`product:${mode}`,input}]);
 if(mode==='fresh')return{project,source,input};
 const t=await call('ugc_v3_task_claim',[project]);await call('ugc_v3_task_checkpoint',[t.id,t.lease_token,'intent',{}]);
 await call('ugc_v3_task_checkpoint',[t.id,t.lease_token,'unknown',{code:'V3_TASK_FAILED'}]);
 if(mode==='valid'||mode==='storage')spool.set(`${t.id}:openai-response.json`,Buffer.from(JSON.stringify({response:{data:[{b64_json:png.toString('base64')}]},requestId:'req_original',httpStatus:200})));
 if(mode==='image')spool.set(`${t.id}:image.png`,png);
 if(mode==='malformed')spool.set(`${t.id}:openai-response.json`,Buffer.from('broken json'));
 if(mode==='invalid_image')spool.set(`${t.id}:openai-response.json`,Buffer.from(JSON.stringify({response:{data:[{b64_json:Buffer.from('invalid image bytes').toString('base64')}]}})));
 return{project,source,input,task:t};
}
try{
 Object.assign(process.env,{NODE_ENV:'development',UGC_V3_ENABLED:'1',UGC_V3_OPENAI_ENABLED:'1',OPENAI_API_KEY:'fixture-only',OPENAI_V3_IMAGE_MODEL:'fixture-image',UGC_V3_OPERATOR_USER_ID:owner,UGC_V3_HIGGSFIELD_ENABLED:'0',SCEENYK_LOCAL_JOBS_ONLY:'1',RENDER:'false',VERCEL:'0'});
 await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 const migrations=fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
 for(const file of migrations)await pg.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
 const sql=fs.readFileSync('supabase/migrations/20261031008200_ugc_v3_reference_recovery.sql','utf8');await pg.exec(sql);
 await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'fixture')",[owner]);
 for(const mode of ['valid','storage','image','missing','malformed','invalid_image']){
  const f=await fixture(mode),taskBefore=(await pg.query('select * from public.ugc_v3_tasks where id=$1',[f.task.id])).rows[0];
  const characterBefore=(await pg.query("select to_jsonb(a) row from public.ugc_v3_artifacts a where project_id=$1 and kind='character' order by version",[f.project])).rows;
  const dto=await read(f.project),current=dto.tasks.find(t=>t.id===f.task.id);
  equal(dto.processing,false);equal(current.diagnostics.model,'fixture-image');
  equal(current.recoveryAvailable,['valid','storage','image'].includes(mode));equal(current.canStartNew,['missing','malformed','invalid_image'].includes(mode));
  if(mode==='missing'){
   equal(current.diagnostics.responseSaved,false);equal(current.diagnostics.imageSaved,false);equal(current.diagnostics.httpStatus,null);equal(current.diagnostics.requestId,null);
   equal(referenceFailureLabel('product',current.diagnostics),'OpenAI Product Sheet outcome unknown — no saved response');
   equal(referenceBusy(dto.tasks,'product'),false);
  }
  const result=await post(f.project,{action:'recover_task',id:f.task.id});
  if(current.recoveryAvailable){
   equal(result.status,200);equal((await post(f.project,{action:'recover_task',id:f.task.id})).status,200);
   equal(result.body.workspace.tasks.find(t=>t.id===f.task.id).status,'queued');
   process.env.UGC_V3_OPENAI_ENABLED='0';process.env.OPENAI_API_KEY='';
   if(mode==='storage')failPublish=true;
   await worker.runLocalV3Worker(['--project',f.project,'--once']);
   if(mode==='storage'){
    const failed=(await read(f.project)).tasks.find(t=>t.id===f.task.id);
    equal(failed.diagnostics.httpStatus,200);equal(failed.diagnostics.requestId,'req_original');equal(failed.recoveryAvailable,true);
    equal(referenceFailureLabel('product',failed.diagnostics),'Product Sheet storage failed');
    failPublish=false;equal((await post(f.project,{action:'recover_task',id:f.task.id})).status,200);
    await worker.runLocalV3Worker(['--project',f.project,'--once']);
   }
   equal(sdkCalls,0);
   const ready=await read(f.project),product=ready.artifacts.find(a=>a.kind==='product');
   ok(product);equal(product.id,f.task.id);equal(product.approved,false);equal(product.current,true);
   equal((await post(f.project,{action:'recover_task',id:f.task.id})).status,200);equal(sdkCalls,0);
   const after=(await pg.query('select * from public.ugc_v3_tasks where id=$1',[f.task.id])).rows[0];
   equal(after.provider_started,taskBefore.provider_started);equal(after.request_key,taskBefore.request_key);
   const restored={...after.input};delete restored.recoveryOnly;equal(restored,taskBefore.input);
   equal((await pg.query("select count(*)::int n from public.ugc_v3_runtime_events where entity_id=$1 and kind='intent'",[f.task.id])).rows[0].n,1);
   process.env.UGC_V3_OPENAI_ENABLED='1';process.env.OPENAI_API_KEY='fixture-only';
  }else{
   equal(result.status,409);equal(result.body.code,'V3_REFERENCE_SAVED_RESPONSE_UNUSABLE');
   equal((await pg.query('select * from public.ugc_v3_tasks where id=$1',[f.task.id])).rows[0],taskBefore);
   const request={action:'reference',kind:'product',assetId:f.source};
   equal((await post(f.project,request)).body.code,'V3_REFERENCE_NEW_REQUEST_CONFIRMATION_REQUIRED');
   equal((await post(f.project,{...request,confirmNewRequest:true,failedTaskId:f.task.id})).status,200);
   equal((await post(f.project,{...request,confirmNewRequest:true,failedTaskId:f.task.id})).status,200);
   const rows=(await pg.query("select * from public.ugc_v3_tasks where project_id=$1 and kind='product' order by created_at",[f.project])).rows;
   equal(rows.length,2);equal(rows[0].provider_started,true);equal(rows[0].error_code,'V3_TASK_FAILED');equal(rows[0].input,taskBefore.input);
   equal(rows[1].status,'queued');equal(rows[1].provider_started,false);equal(rows[1].input.previousTask,f.task.id);
   equal(sdkCalls,0); // Merely allowing/queueing a new request did not execute its provider.
  }
  equal((await pg.query("select to_jsonb(a) row from public.ugc_v3_artifacts a where project_id=$1 and kind='character' order by version",[f.project])).rows,characterBefore);
 }
 const vanished=await fixture('fresh');
 await pg.query("update public.ugc_v3_tasks set input=input||'{\"recoveryOnly\":true}'::jsonb where project_id=$1 and kind='product'",[vanished.project]);
 await worker.runLocalV3Worker(['--project',vanished.project,'--once']);
 equal(sdkCalls,0);
 const vanishedTask=(await read(vanished.project)).tasks.find(t=>t.kind==='product');
 equal(vanishedTask.errorCode,'V3_REFERENCE_SAVED_RESPONSE_UNUSABLE');equal(vanishedTask.providerStarted,false);
 // Future errors retain only sanitized stage/HTTP/request evidence, even if local diagnostics cannot be read.
 for(const mode of ['http_error','bad_json','save_failure','timeout']){
  const f=await fixture('fresh');providerMode=mode;failResponseSave=mode==='save_failure';
  await worker.runLocalV3Worker(['--project',f.project,'--once']);failResponseSave=false;
  const raw=(await pg.query("select * from public.ugc_v3_tasks where project_id=$1 and kind='product'",[f.project])).rows[0];
  spool.delete(`${raw.id}:reference-diagnostics.json`);
  const task=(await read(f.project)).tasks.find(t=>t.id===raw.id);
  equal(task.diagnostics.httpStatus,mode==='timeout'?null:mode==='http_error'?429:200);
  equal(task.diagnostics.requestId,mode==='timeout'?null:mode==='http_error'?'req_fixture_error':'req_fixture_success');
  equal(task.recoveryAvailable,false);equal(task.canStartNew,true);
  equal(JSON.stringify(task).includes('sk-proj-FAKE_SECRET'),false);equal(JSON.stringify(task).includes('private.invalid'),false);
  if(mode==='http_error'){equal(task.status,'failed');equal(task.diagnostics.providerCode,'insufficient_quota');}
  if(mode==='bad_json'){equal(task.diagnostics.responseSaved,true);equal(task.diagnostics.errorCode,'V3_REFERENCE_RESPONSE_PARSE_FAILED');}
  if(mode==='save_failure'){equal(task.diagnostics.responseSaved,false);equal(referenceFailureLabel('product',task.diagnostics),'Product Sheet response could not be saved');}
  if(mode==='timeout'){equal(task.diagnostics.providerCode,'APIConnectionTimeoutError');equal(task.status,'reconciliation_required');}
 }
 equal(sdkCalls,4);equal(networkCalls,0);
 equal((await pg.query("select has_function_privilege('authenticated','public.ugc_v3_recover_reference_task(uuid,uuid,uuid)','EXECUTE') browser,has_function_privilege('service_role','public.ugc_v3_recover_reference_task(uuid,uuid,uuid)','EXECUTE') server")).rows[0],{browser:false,server:true});
 console.info(JSON.stringify({referenceRecoveryChecks:checks,migrations:migrations.length,recoveryProviderCalls:0,fixtureFailureCalls:sdkCalls,realNetworkCalls:networkCalls}));
}finally{await pg.close();for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);}
