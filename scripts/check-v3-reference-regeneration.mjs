// Actual API/action/worker + disposable PostgreSQL; auth, image provider and storage are explicit fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import sharp from 'sharp';
import { typescriptLoader } from './lib/load-typescript.mjs';
const require = createRequire(import.meta.url), nativeBuilder = require('../lib/video-generation-package/builder.ts');
const normalize = value => JSON.parse(JSON.stringify(value));

let checks = 0, providerCalls = 0, realNetworkCalls = 0, claims = 0, duringEdit = null, duringDelete = null, failStorage = false, failFinalize = false;
const deleted = new Set();
const equal = (a,b) => { assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b))); checks++; };
const ok = value => { assert.ok(value); checks++; };
const oldEnv = {...process.env}, pg = new PGlite(), owner = randomUUID(), project = randomUUID();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = await sharp({create:{width:32,height:32,channels:3,background:'#d3d3d3'}}).png().toBuffer();
const sourceIds = {character:randomUUID(),product:randomUUID()}, spool = new Map(), requests = [], names = {character:'Ari',product:'Ceramic cup'};
const fields = {title:'Fresh reference fixture',category:'product-ad',prompt:'Six panels on a beach',ugcType:'advertisement',settings:{duration:'10',aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'}};
const call = async (name,args) => (await pg.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
const db = {
  async rpc(name,args) {
    assert.match(name,/^ugc_v3_[a-z_]+$/);
    try {
      if(name==='ugc_v3_task_claim') claims++;
      if(name==='ugc_v3_reference_delete_finish' && args.p_error===null && failFinalize) { failFinalize=false; throw new Error('FIXTURE_DATABASE_UNAVAILABLE'); }
      return {data:await call(name,Object.values(args)),error:null};
    } catch(error) { return {data:null,error:{message:error.message,code:error.code}}; }
  },
  from(table) {
    assert.ok(['projects','project_assets','ugc_v3_projects'].includes(table));
    let columns='*'; const clauses=[],values=[];
    const query = {
      select(value) { assert.match(value,/^[a-z_,]+$/); columns=value; return this; },
      eq(column,value) { assert.match(column,/^[a-z_]+$/); values.push(value); clauses.push(`${column}=$${values.length}`); return this; },
      is(column,value) { assert.equal(value,null); assert.match(column,/^[a-z_]+$/); clauses.push(`${column} is null`); return this; },
      in(column,value) { assert.match(column,/^[a-z_]+$/); values.push(value); clauses.push(`${column}=any($${values.length}::text[])`); return this; },
      async execute(single=false) { const rows=(await pg.query(`select ${columns} from public.${table} where ${clauses.join(' and ')}`,values)).rows; return {data:single?rows[0]??null:rows,error:null}; },
      maybeSingle() { return this.execute(true); },
      then(resolve,reject) { return this.execute().then(resolve,reject); },
    };
    return query;
  },
};
const media = {
  bytesHash:hash, readSpool:async(id,name)=>spool.get(`${id}:${name}`)??null,
  saveSpool:async(id,name,value)=>{spool.set(`${id}:${name}`,value);},
  writeReferenceDiagnostics:async(id,value)=>{spool.set(`${id}:reference-diagnostics.json`,Buffer.from(JSON.stringify(value)));},
  readPrivate:async()=>bytes,
  inspectImage:async input=>({bytes:input,metadata:{mimeType:'image/png',width:32,height:32,durationMs:0,hasAudio:false}}),
  publishPrivate:async(user,p,id,value,metadata)=>({id,storageKey:`users/${user}/projects/${p}/v3/${id}.png`,etag:'fixture-etag',sha256:hash(value),sizeBytes:value.length,...metadata}),
  signPrivate:async asset=>({url:`https://private.example.test/${asset.id}`,expiresAt:new Date(Date.now()+60000).toISOString()}),
  deleteReferencePrivate:async(user,p,asset)=>{
    equal(asset.storageKey,`users/${user}/projects/${p}/v3/${asset.id}.png`);
    if(failStorage) throw new Error('FIXTURE_STORAGE_FAILED');
    if(duringDelete) await duringDelete();
    deleted.add(asset.storageKey);
  },
  purgeReferenceSpool:async id=>{for(const key of spool.keys()) if(key.startsWith(`${id}:`)) spool.delete(key);},
};
class FixtureOpenAI {
  images = {edit:body=>({asResponse:async()=>{providerCalls++; requests.push(body); if(duringEdit) await duringEdit();
    return Response.json({data:[{b64_json:bytes.toString('base64')}]},{status:200,headers:{'x-request-id':'fixture-request'}});}})};
}
const load = typescriptLoader({
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>({id:owner})},
  '@/lib/auth/require-user':{requireClerkUser:async()=>({userId:'fixture-clerk'})},
  '@/lib/db/server':{createDatabaseClient:()=>db},
  './runtime-media':media,
  // The VM loader gives each module its own Object prototype. Normalize at the strict canonical-JSON boundary.
  '@/lib/video-generation-package/builder':{...nativeBuilder,packageDigest:(domain,value)=>nativeBuilder.packageDigest(domain,normalize(value)),canonicalJson:value=>nativeBuilder.canonicalJson(normalize(value))},
  './join':{joinV3Segments:async()=>{throw new Error('JOIN_FORBIDDEN');}},
  'next/navigation':{unstable_rethrow:()=>{}},
  openai:{__esModule:true,default:FixtureOpenAI,toFile:async value=>new File([value],'reference.png',{type:'image/png'})},
}, {Error,Response,Request,File,AbortController,fetch:async()=>{realNetworkCalls++;throw new Error('NETWORK_FORBIDDEN');},console:{...console,info(){}}});
const route = load('app/api/ugc/v3/route.ts'), worker = load('lib/final-video-generation-v3/local-worker.ts');
const {generationContext} = load('lib/final-video-generation-v3/generation-context.ts');
const {v3ProgressLabel} = load('lib/final-video-generation-v3/progress.ts');
const {v3ActionErrorMessage} = load('lib/final-video-generation-v3/reference-errors.ts');
const context=generationContext({prompt:fields.prompt,visual_style:'Realistic',creation_type:'ugc',ugc_type:fields.ugcType,tone:'Professional',category:fields.category});
const post = async payload => {
  const response=await route.POST(new Request('https://studio.example.test/api/ugc/v3',{method:'POST',headers:{origin:'https://studio.example.test','content-type':'application/json'},body:JSON.stringify({projectId:project,...payload})}));
  return {status:response.status,body:await response.json()};
};
const countTasks = async kind => (await pg.query('select count(*)::int n from public.ugc_v3_tasks where project_id=$1 and kind=$2',[project,kind])).rows[0].n;
try {
  Object.assign(process.env,{NODE_ENV:'development',UGC_V3_ENABLED:'1',UGC_V3_OPENAI_ENABLED:'1',OPENAI_API_KEY:'fixture-only',OPENAI_V3_IMAGE_MODEL:'fixture-image',UGC_V3_OPERATOR_USER_ID:owner,UGC_V3_HIGGSFIELD_ENABLED:'0',SCEENYK_LOCAL_JOBS_ONLY:'1',RENDER:'false',VERCEL:'0'});
  await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  const migration='20261030008100_ugc_v3_reference_permanent_delete.sql';
  const previous=fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')&&n<migration).sort();
  for(const name of previous) await pg.exec(fs.readFileSync(`supabase/migrations/${name}`,'utf8'));
  const catalog = async()=> (await pg.query("select oid,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
  const before=await catalog(), sql=fs.readFileSync(`supabase/migrations/${migration}`,'utf8');
  await pg.exec(sql); await pg.exec(sql);
  const changed=(await pg.query("select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('ugc_v3_regenerate_reference','ugc_v3_runtime_read','ugc_v3_artifact_current')")).rows.map(r=>r.oid);
  equal((await catalog()).filter(a=>before.some(b=>b.oid===a.oid)&&!changed.includes(a.oid)),before.filter(a=>!changed.includes(a.oid)));
  equal((await pg.query("select has_function_privilege('authenticated','public.ugc_v3_regenerate_reference(uuid,uuid,jsonb)','EXECUTE') browser,has_function_privilege('service_role','public.ugc_v3_regenerate_reference(uuid,uuid,jsonb)','EXECUTE') server")).rows[0],{browser:false,server:true});
  await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'fixture-clerk')",[owner]);
  await call('ugc_v3_create_project',[owner,project,fields]);
  for(const kind of ['character','product']) {
    const originalId=sourceIds[kind];
    await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id,reference_name) values($1,$2,$3,$4,$5,'fixture.png','image/png',$6,'image','uploaded','source-etag',$7,$1,$8)",[originalId,owner,project,randomUUID(),`users/${owner}/projects/${project}/${originalId}/fixture.png`,bytes.length,kind,names[kind]]);
  }
  const sourcesBefore=(await pg.query('select to_jsonb(a) row from public.project_assets a order by id')).rows;
  const {V3Store}=load('lib/final-video-generation-v3/runtime-store.ts');
  const read=async(projectId=project)=>load('lib/final-video-generation-v3/runtime-server.ts').runtimeDto(await new V3Store(db).read(owner,projectId));
  const pending=async kind=>(await pg.query("select count(*)::int n from public.ugc_v3_tasks where project_id=$1 and kind=$2 and status='queued' and available_at<=now()",[project,kind])).rows[0].n;
  for(const kind of ['character','product']) {
    const callsAtStart=providerCalls;
    await call('ugc_v3_runtime_action',[owner,project,'enqueue',{kind,requestKey:`initial:${kind}`,input:{}}]);
    const initialTask=await call('ugc_v3_task_claim',[project]), id=randomUUID();
    const asset=await media.publishPrivate(owner,project,id,bytes,{mimeType:'image/png',width:32,height:32,durationMs:0,hasAudio:false});
    await call('ugc_v3_task_checkpoint',[initialTask.id,initialTask.lease_token,'artifact',{id,document:{original:{id:sourceIds[kind]},input:{generationContext:context},asset}}]);
    spool.set(`${initialTask.id}:openai-response.json`,Buffer.from('old fixture output'));
    spool.set(`${initialTask.id}:image.png`,bytes);
    const beforeArtifact=(await pg.query('select * from public.ugc_v3_artifacts where id=$1',[id])).rows[0];
    const request={action:'reference',kind,assetId:sourceIds[kind],confirmedDeletion:true,expectedId:id,expectedVersion:1};
    equal((await post({action:'reference',kind,assetId:sourceIds[kind]})).body.code,'V3_REFERENCE_CONFIRMATION_REQUIRED');
    equal((await post({...request,expectedVersion:2})).body.code,'V3_REFERENCE_CHANGED_RECONFIRM');
    equal((await pg.query('select * from public.ugc_v3_artifacts where id=$1',[id])).rows[0],beforeArtifact);
    equal(await countTasks(kind),1); equal(deleted.has(asset.storageKey),false);
    // A failed reservation never touches the old image/review state.
    await pg.exec("create function public.fixture_enqueue_failure() returns trigger language plpgsql as $$ begin raise exception 'FIXTURE_ENQUEUE_FAILED'; end $$; create trigger fixture_enqueue_failure before insert on public.ugc_v3_tasks for each row execute function public.fixture_enqueue_failure();");
    equal((await post(request)).body.code,'V3_REFERENCE_REQUEST_RESERVATION_FAILED');
    equal(deleted.has(asset.storageKey),false); equal(await countTasks(kind),1);
    equal((await pg.query('select * from public.ugc_v3_artifacts where id=$1',[id])).rows[0],beforeArtifact);
    await pg.exec('drop trigger fixture_enqueue_failure on public.ugc_v3_tasks;drop function public.fixture_enqueue_failure();');
    // Storage failure is explicit; the durable replacement is held and cannot be claimed by --once.
    failStorage=true;
    const failure=await post(request); equal(failure.status,409); equal(failure.body.code,'V3_REFERENCE_STORAGE_DELETE_FAILED');
    equal(await pending(kind),0); equal(deleted.has(asset.storageKey),false);
    equal((await pg.query('select * from public.ugc_v3_artifacts where id=$1',[id])).rows[0],beforeArtifact);
    await worker.runLocalV3Worker(['--project',project,'--once']); equal(providerCalls,callsAtStart);
    equal((await read()).tasks.find(t=>t.kind===kind&&t.status==='cleanup_pending').providerStarted,false);
    const held=(await pg.query("select id from public.ugc_v3_tasks where project_id=$1 and kind=$2 and input->>'referenceCleanupHold'='true'",[project,kind])).rows[0];
    await assert.rejects(()=>pg.query('update public.ugc_v3_tasks set provider_started=true where id=$1',[held.id]),/V3_REFERENCE_CLEANUP_PENDING/);checks++;
    await assert.rejects(()=>call('ugc_v3_runtime_action',[owner,project,'enqueue',{kind:'location',requestKey:`forbidden:${id}`,input:{references:[id]}}]),/V3_REFERENCE_CLEANUP_PENDING/);checks++;
    await assert.rejects(()=>call('ugc_v3_reference_delete_prepare',[randomUUID(),project,kind,id,1,'reject',null]),/FRESH_V3_PROJECT_REQUIRED/);checks++;
    failStorage=false;
    duringDelete=async()=>{
      const duplicate=await post(request); equal(duplicate.status,409); equal(duplicate.body.code,'V3_REFERENCE_CLEANUP_IN_PROGRESS');
      equal(await pending(kind),0);
    };
    const response=await post(request); duringDelete=null;
    assert.equal(response.status,200,JSON.stringify(response.body)); checks++;
    const workspace=response.body.workspace, queued=workspace.tasks.filter(t=>t.kind===kind&&t.status==='queued');
    equal(queued.length,1); equal(await pending(kind),1);
    equal(v3ProgressLabel(workspace,true),`${kind==='character'?'Character':'Product'} Sheet queued`);
    equal(workspace.artifacts.some(a=>a.id===id),false); equal(deleted.has(asset.storageKey),true);
    equal((await pg.query('select count(*)::int n from public.ugc_v3_tasks where id=$1',[initialTask.id])).rows[0].n,0);
    equal(spool.has(`${initialTask.id}:image.png`),false); equal(spool.has(`${initialTask.id}:openai-response.json`),false);
    const op=(await pg.query('select * from public.ugc_v3_reference_deletions where id=$1',[id])).rows[0];
    equal(op.state,'completed'); equal(op.asset,null); equal(op.source_task_id,null);
    const queuedTask=(await pg.query('select * from public.ugc_v3_tasks where id=$1',[queued[0].id])).rows[0];
    equal(queuedTask.input.provider,'openai'); equal(queuedTask.input.generationContext.visualStyle,'Realistic');
    equal(queuedTask.input.referencePrompt.version,2); equal(queuedTask.input.referenceSubject.name,names[kind]);
    equal(queuedTask.input.referenceSource.etag,'source-etag'); equal(queuedTask.input.originalId,sourceIds[kind]);
    const count=await countTasks(kind);
    equal((await post(request)).status,200); equal(await countTasks(kind),count);
    duringEdit=async()=>{equal((await post(request)).status,200);equal(await countTasks(kind),count);};
    await worker.runLocalV3Worker(['--project',project,'--once']); duringEdit=null;
    equal(providerCalls,callsAtStart+1);
    const ready=await read(), version2=ready.artifacts.find(a=>a.kind===kind&&a.version===2);
    ok(version2); equal(version2.current,true); equal(version2.activeSlot,true);
    equal(v3ProgressLabel(ready,true),`${kind==='character'?'Character':'Product'} Sheet ready for review`);
    const imageRequest=requests.at(-1); equal(imageRequest.size,'1024x1024'); equal(imageRequest.model,'fixture-image');
    equal(Buffer.from(await imageRequest.image[0].arrayBuffer()).equals(bytes),true); equal(imageRequest.prompt,queuedTask.input.referencePrompt.prompt);
    // A delayed confirmation for deleted version 1 cannot delete the new version 2.
    equal((await post(request)).status,200); equal(await countTasks(kind),count);
    equal((await read()).artifacts.some(a=>a.id===version2.id),true);
    const callsBefore=providerCalls;
    const rejection=await post({action:'review_artifact',id:version2.id,kind,expectedVersion:2,decision:'reject'});
    equal(rejection.status,200); equal(await pending(kind),0); equal(providerCalls,callsBefore);
    equal(rejection.body.workspace.artifacts.some(a=>a.id===version2.id),false);
    equal(rejection.body.workspace.artifacts.some(a=>a.kind===kind&&a.activeSlot),false);
    equal((await post({action:'review_artifact',id:version2.id,kind,expectedVersion:2,decision:'reject'})).status,200);
    await worker.runLocalV3Worker(['--project',project,'--once']);equal(providerCalls,callsBefore);
    equal(deleted.has(`users/${owner}/projects/${project}/v3/${version2.id}.png`),true);
    const afterReject=await post({action:'reference',kind,assetId:sourceIds[kind]});
    equal(afterReject.status,200); equal(await pending(kind),1);
    await worker.runLocalV3Worker(['--project',project,'--once']); equal(providerCalls,callsBefore+1);
    if(kind==='character') {
      const newest=(await read()).artifacts.find(a=>a.kind===kind&&a.activeSlot);
      equal(newest.version,3); equal((await post({action:'review_artifact',id:newest.id,decision:'approve'})).status,200);
    }
  }
  // A lost final DB write leaves a held request and durable retry state after confirmed storage deletion.
  const current=(await read()).artifacts.find(a=>a.kind==='product'&&a.activeSlot);
  const request={action:'reference',kind:'product',assetId:sourceIds.product,confirmedDeletion:true,expectedId:current.id,expectedVersion:current.version};
  failFinalize=true;
  const lost=await post(request); equal(lost.status,409); equal(lost.body.code,'V3_REFERENCE_DELETE_FINALIZE_FAILED');
  equal(await pending('product'),0);
  const callsBeforeRecovery=providerCalls;
  await worker.runLocalV3Worker(['--project',project,'--once']); equal(providerCalls,callsBeforeRecovery);
  equal((await post(request)).status,200); equal(await pending('product'),1);
  await worker.runLocalV3Worker(['--project',project,'--once']); equal(providerCalls,callsBeforeRecovery+1);
  equal((await pg.query('select to_jsonb(a) row from public.project_assets a order by id')).rows,sourcesBefore);
  // Deleting the latest candidate must not reactivate an older approved history version.
  const historyProject=randomUUID(),historySource=randomUUID();
  await call('ugc_v3_create_project',[owner,historyProject,fields]);
  await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id,reference_name) values($1,$2,$3,$4,$5,'fixture.png','image/png',$6,'image','uploaded','source-etag','character',$1,'Saved history name')",[historySource,owner,historyProject,randomUUID(),`users/${owner}/projects/${historyProject}/${historySource}/fixture.png`,bytes.length]);
  const history=[];
  for(const version of [1,2]) {
    await call('ugc_v3_runtime_action',[owner,historyProject,'enqueue',{kind:'character',requestKey:`history:${version}`,input:{}}]);
    const task=await call('ugc_v3_task_claim',[historyProject]),id=randomUUID();
    const asset=await media.publishPrivate(owner,historyProject,id,bytes,{mimeType:'image/png',width:32,height:32,durationMs:0,hasAudio:false});
    await call('ugc_v3_task_checkpoint',[task.id,task.lease_token,'artifact',{id,document:{asset,original:{id:historySource},input:{generationContext:version===1?context:{...context,visualStyle:'Original'}}}}]);
    history.push({id,asset});
    if(version===1)await call('ugc_v3_runtime_action',[owner,historyProject,'review_artifact',{id,decision:'approve'}]);
  }
  equal((await post({projectId:historyProject,action:'review_artifact',kind:'character',id:history[1].id,expectedVersion:2,decision:'reject'})).status,200);
  const afterHistoryDelete=await read(historyProject);
  equal(afterHistoryDelete.artifacts.length,1);equal(afterHistoryDelete.artifacts[0].id,history[0].id);
  equal(afterHistoryDelete.artifacts[0].activeSlot,false);equal(afterHistoryDelete.artifacts[0].current,false);
  equal(await call('ugc_v3_artifact_current',[history[0].id]),false);equal(deleted.has(history[0].asset.storageKey),false);
  equal((await post({projectId:historyProject,action:'reference',kind:'character',assetId:historySource})).status,200);
  const newHistoryTask=(await pg.query("select * from public.ugc_v3_tasks where project_id=$1 and status='queued'",[historyProject])).rows[0];
  equal(newHistoryTask.input.generationContext.visualStyle,'Realistic');equal(newHistoryTask.input.referencePrompt.version,2);
  equal(newHistoryTask.input.referenceSubject.name,'Saved history name');equal(newHistoryTask.input.referenceSource.id,historySource);
  await worker.runLocalV3Worker(['--project',historyProject,'--once']);
  equal((await read(historyProject)).artifacts.find(a=>a.activeSlot&&a.kind==='character').version,3);
  equal((await pg.query("select asset,source_task_id from public.ugc_v3_reference_deletions where state='completed'")).rows.every(r=>r.asset===null&&r.source_task_id===null),true);
  const privacy=(await pg.query("select relrowsecurity,has_table_privilege('authenticated','public.ugc_v3_reference_deletions','SELECT') browser,has_table_privilege('service_role','public.ugc_v3_reference_deletions','INSERT') direct_insert from pg_class where oid='public.ugc_v3_reference_deletions'::regclass")).rows[0];
  equal(privacy,{relrowsecurity:true,browser:false,direct_insert:false});
  equal((await pg.query("select has_function_privilege('authenticated','public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb)','EXECUTE') browser,has_function_privilege('service_role','public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb)','EXECUTE') server")).rows[0],{browser:false,server:true});
  const operationsBefore=(await pg.query('select * from public.ugc_v3_reference_deletions order by id')).rows;
  await pg.exec(sql);
  equal((await pg.query('select * from public.ugc_v3_reference_deletions order by id')).rows,operationsBefore);
  const callsBefore=providerCalls,claimsBefore=claims;
  await worker.runLocalV3Worker(['--project',project,'--once']); equal(providerCalls,callsBefore); equal(claims,claimsBefore+1);
  for(const code of ['V3_REFERENCE_DELETE_SETUP_REQUIRED','V3_REFERENCE_STORAGE_DELETE_FAILED','V3_REFERENCE_DELETE_FINALIZE_FAILED','V3_REFERENCE_CONFIRMATION_REQUIRED'])
    ok(!v3ActionErrorMessage(code).includes('This request couldn’t finish'));
  await assert.rejects(()=>new V3Store({rpc:async()=>({data:null,error:{code:'PGRST202'}})}).rpc('ugc_v3_reference_delete_prepare',{}),/V3_REFERENCE_DELETE_SETUP_REQUIRED/);checks++;
  equal(realNetworkCalls,0);
  console.info(JSON.stringify({permanentRegenerationChecks:checks,migrations:previous.length+1,fixtureImageCalls:providerCalls,realNetworkCalls,paidTransportEnabled:false}));
} finally {
  await pg.close();
  for(const key of Object.keys(process.env)) if(!(key in oldEnv)) delete process.env[key];
  Object.assign(process.env,oldEnv);
}
