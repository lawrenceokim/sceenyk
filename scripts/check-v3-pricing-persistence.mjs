// Actual package admission/task/SQL commit/readback with disposable PostgreSQL.
// Approved creative artifacts are fixtures; every provider/network call is forbidden.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {typescriptLoader} from './lib/load-typescript.mjs';

const require=createRequire(import.meta.url),builder=require('../lib/video-generation-package/builder.ts');
const normal=value=>JSON.parse(JSON.stringify(value)),hash=value=>createHash('sha256').update(value).digest('hex');
let checks=0,networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw new Error('NETWORK_FORBIDDEN');};
const equal=(a,b)=>{assert.deepEqual(normal(a),normal(b));checks++;};
const ok=value=>{assert.ok(value);checks++;};
const rejects=async(fn,code)=>{await assert.rejects(fn,new RegExp(code));checks++;};
const pg=new PGlite(),owner=randomUUID(),spool=new Map(),oldEnv={...process.env};
const call=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
const db={async rpc(name,args){try{return{data:await call(name,Object.values(args)),error:null};}catch(e){return{data:null,error:{code:e.code,message:e.message}};}},
 from(table){assert.ok(['projects','project_assets','ugc_v3_projects'].includes(table));let columns='*';const clauses=[],values=[];
  return{select(value){assert.match(value,/^[a-z_,]+$/);columns=value;return this;},eq(key,value){assert.match(key,/^[a-z_]+$/);values.push(value);clauses.push(`${key}=$${values.length}`);return this;},
   is(key,value){assert.equal(value,null);clauses.push(`${key} is null`);return this;},in(key,value){values.push(value);clauses.push(`${key}=any($${values.length}::text[])`);return this;},
   async execute(single=false){const rows=(await pg.query(`select ${columns} from public.${table} where ${clauses.join(' and ')}`,values)).rows;return{data:single?rows[0]??null:rows,error:null};},
   maybeSingle(){return this.execute(true);},then(resolve,reject){return this.execute().then(resolve,reject);}};}};
const media={bytesHash:hash,readSpool:async(id,name)=>spool.get(`${id}:${name}`)??null,
 saveSpool:async(id,name,bytes)=>{const key=`${id}:${name}`;if(spool.has(key))equal(hash(spool.get(key)),hash(bytes));spool.set(key,bytes);},
 readPrivate:async()=>Buffer.from('private fixture bytes'),signPrivate:async asset=>({url:`https://private.example.test/${asset.id}`,expiresAt:new Date(Date.now()+300000).toISOString()})};
const load=typescriptLoader({'@/lib/db/server':{createDatabaseClient:()=>db},'@/lib/auth/ensure-app-user':{ensureAppUser:async()=>({id:owner})},
 '@/lib/auth/require-user':{requireClerkUser:async()=>({userId:'fixture'})},'next/navigation':{unstable_rethrow:()=>{}},
 './runtime-media':media,'./join':{joinV3Segments:async()=>{throw new Error('JOIN_FORBIDDEN');}},
 '@/lib/video-generation-package/builder':{...builder,packageDigest:(domain,value)=>builder.packageDigest(domain,normal(value)),canonicalJson:value=>builder.canonicalJson(normal(value))}},
 {Error,structuredClone:normal,fetch:async()=>{networkCalls++;throw new Error('NETWORK_FORBIDDEN');}});
const {ownedV3Action,runtimeDto}=load('lib/final-video-generation-v3/runtime-server.ts');
const {packageTask}=load('lib/final-video-generation-v3/package-task.ts');
const {V3Store}=load('lib/final-video-generation-v3/runtime-store.ts');
const {readFrozenPackage}=load('lib/final-video-generation-v3/package.ts');
const {v3Digest}=load('lib/final-video-generation-v3/identity.ts');
const store=new V3Store(db),act=(project,action,payload={})=>ownedV3Action({projectId:project,action,...payload});
const taskRow=async project=>(await pg.query("select * from public.ugc_v3_tasks where project_id=$1 and kind='package' order by created_at desc,id desc limit 1",[project])).rows[0];
const counts=async project=>(await pg.query("select (select count(*)::int from public.ugc_v3_packages where project_id=$1) packages,(select count(*)::int from public.ugc_v3_quotes where project_id=$1) quotes,(select count(*)::int from public.ugc_v3_run_authorizations where project_id=$1) authorizations,(select count(*)::int from public.ugc_v3_runs where project_id=$1) runs",[project])).rows[0];
const creative=async project=>(await pg.query('select jsonb_agg(to_jsonb(a) order by id) value from public.ugc_v3_artifacts a where project_id=$1',[project])).rows[0].value;
async function tick(project){const task=await call('ugc_v3_task_claim',[project]);ok(task&&task.kind==='package');await packageTask(store,task,await store.read(owner,project),AbortSignal.timeout(10000));return task;}
async function fixture(duration){
 const project=randomUUID(),fields={title:'Pricing precision fixture',category:'product-ad',prompt:'A quiet presentation of the approved cup.',ugcType:'advertisement',settings:{duration,aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'}};
 const registry=await call('ugc_v3_create_project',[owner,project,fields]);
 const original=randomUUID();
 await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id,reference_name) values($1,$2,$3,$4,$5,'fixture.png','image/png',1000,'image','uploaded','etag','character',$1,'Ari')",[original,owner,project,randomUUID(),`users/${owner}/projects/${project}/${original}/fixture.png`]);
 const brief={id:project,title:fields.title,prompt:fields.prompt,aspect_ratio:'9:16',duration,visual_style:'Realistic',tone:'Professional',category:fields.category,ugc_type:fields.ugcType};
 const context=load('lib/final-video-generation-v3/generation-context.ts').generationContext({...brief,creation_type:'ugc'});
 const saved=normal(load('scripts/final-video-v3-fixture.ts').v3Input([Number(duration)*1000]).storyboardContent);saved.tone='Professional';
 const refs=[];
 for(const kind of ['character','location','storyboard']){
  await call('ugc_v3_runtime_action',[owner,project,'enqueue',{kind,requestKey:`fixture:${kind}`,input:{}}]);
  const t=await call('ugc_v3_task_claim',[project]);equal(t.kind,kind);
  const input={generationContext:context,references:[...refs],briefHash:v3Digest('brief',brief),...(kind==='storyboard'?{directorVersion:'approved-storyboard-v1'}:{})};
  const asset={id:t.id,storageKey:`users/${owner}/projects/${project}/v3/${t.id}.png`,etag:'fixture',sha256:hash(Buffer.from(kind)),sizeBytes:1000,mimeType:'image/png',width:1024,height:1024,durationMs:0,hasAudio:false};
  const document=kind==='storyboard'?{storyboard:saved,input}:{asset,input,original:kind==='character'?{id:original,sha256:'b'.repeat(64)}:null};
  await call('ugc_v3_task_checkpoint',[t.id,t.lease_token,'artifact',{id:t.id,document}]);
  await call('ugc_v3_runtime_action',[owner,project,'review_artifact',{id:t.id,decision:'approve'}]);
  if(kind!=='storyboard')refs.push(t.id);
 }
 equal((await store.read(owner,project)).project.logical_job_id,registry.logical_job_id);
 return{project,creative:await creative(project)};
}
try{
 Object.assign(process.env,{NODE_ENV:'development',UGC_V3_ENABLED:'1',UGC_V3_OPERATOR_USER_ID:owner,UGC_V3_HIGGSFIELD_ENABLED:'0',UGC_V3_HIGGSFIELD_CREDENTIALS:'',UGC_V3_HIGGSFIELD_ACCOUNT_SCOPE:''});
 await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 const migration='20261103008900_ugc_v3_local_pricing_precision.sql';
 const migrations=fs.readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')&&name<migration).sort();
 for(const name of migrations)await pg.exec(fs.readFileSync(`supabase/migrations/${name}`,'utf8'));
 await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'pricing-precision-fixture')",[owner]);
 const fixtures=[];
 for(const duration of ['10','30']){
  const f=await fixture(duration);fixtures.push(f);
  await act(f.project,'build_package');const admitted=await taskRow(f.project);
  await act(f.project,'build_package');equal((await taskRow(f.project)).id,admitted.id);
  await tick(f.project);let failed=await taskRow(f.project);
  equal(failed.status,'failed');equal(failed.error_code,'V3_LOCAL_PRICING_SNAPSHOT_INVALID');
  equal(failed.output.packageBuild.stage,'persistence');equal(failed.output.packageBuild.estimateStatus,'available');equal(failed.output.packageBuild.recoverable,true);
  equal(await counts(f.project),{packages:0,quotes:0,authorizations:0,runs:0});
  const key=`${failed.id}:package-local-pricing.json`;let saved=JSON.parse(spool.get(key).toString('utf8'));
  equal(saved.document.estimateEvidence,[]);equal(saved.document.segments[0].estimate.pricing.estimatedUsdPerSecond,'0.2056666667');
  if(duration==='10'){
   // Replay the exact historical representation retained by the reported attempt.
   const price=saved.document.segments[0].estimate.pricing;price.estimatedUsdPerSecond='0.2056';
   saved.document.segments[0].estimate.evidenceHash=v3Digest('manual-pricing',price);
   const {hash:oldHash,...body}=saved.document;void oldHash;saved.document.hash=v3Digest('frozen-package',body);
   saved.quote.packageHash=saved.document.hash;saved.quote.segments[0].estimateResponseHash=saved.document.segments[0].estimate.evidenceHash;
   readFrozenPackage(saved.document);spool.set(key,Buffer.from(JSON.stringify(saved)));
   await act(f.project,'build_package',{retryTaskId:failed.id});await tick(f.project);failed=await taskRow(f.project);
   equal(failed.error_code,'V3_LOCAL_PRICING_SNAPSHOT_INVALID');equal(failed.output.packageBuild.recoverable,true);
  }
  f.taskId=failed.id;f.envelope=spool.get(key).toString('utf8');
 }
 const oldRule=(await pg.query("select to_char(205667::numeric/1000000,'FM999999999990.0000') expected")).rows[0].expected;
 equal(oldRule,'0.2057');equal(JSON.parse(fixtures[0].envelope).document.segments[0].estimate.pricing.estimatedUsdPerSecond,'0.2056');
 const catalog=async()=>(await pg.query("select oid,proname,prosrc,proacl::text grants,proconfig from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
 const before=await catalog(),sql=fs.readFileSync(`supabase/migrations/${migration}`,'utf8');await pg.exec(sql);await pg.exec(sql);
 const after=await catalog();equal(after.filter(f=>f.proname!=='ugc_v3_local_quote_guard'),before.filter(f=>f.proname!=='ugc_v3_local_quote_guard'));
 equal(after.find(f=>f.proname==='ugc_v3_local_quote_guard').grants,before.find(f=>f.proname==='ugc_v3_local_quote_guard').grants);
 // Only the offending rate predicate changes; all other quote guards are exact.
 const prefix='   or s->>\'estimatedUsdPerSecond\' is distinct from to_char(rate::numeric/1000000,\'FM999999999990.0000\')';
 const updated=after.find(f=>f.proname==='ugc_v3_local_quote_guard').prosrc;
 const start=updated.indexOf('   -- Match TypeScript'),end=updated.indexOf("   or s->>'estimatedUsd'",start);
 equal(updated.slice(0,start)+prefix+'\n'+updated.slice(end),before.find(f=>f.proname==='ugc_v3_local_quote_guard').prosrc);
 for(const f of fixtures){
  await act(f.project,'build_package',{retryTaskId:f.taskId});equal((await taskRow(f.project)).id,f.taskId);await tick(f.project);
  const task=await taskRow(f.project);equal(task.status,'done');equal(task.output.packageBuild.stage,'ready');equal(task.output.packageBuild.estimateStatus,'available');
  equal(spool.get(`${f.taskId}:package-local-pricing.json`).toString('utf8'),f.envelope);
  equal(await counts(f.project),{packages:1,quotes:1,authorizations:0,runs:0});equal(await creative(f.project),f.creative);
  const ui=await runtimeDto(await store.read(owner,f.project));ok(ui.preflight);equal(ui.preflight.currentness,'current');equal(ui.preflight.segmentCount,1);
  equal(ui.preflight.estimatedCostMicrousd,JSON.parse(f.envelope).document.pricing.totalMicrousd);
  if(JSON.parse(f.envelope).document.source.storyboardContent.durationMs===30000)equal((ui.preflight.estimatedCostMicrousd/1000000).toFixed(2),'6.17');
  await act(f.project,'build_package',{retryTaskId:f.taskId});equal((await taskRow(f.project)).id,f.taskId);equal((await counts(f.project)).packages,1);
  const saved=JSON.parse(f.envelope);
  for(const mutate of [q=>{q.totalMicrousd++;},q=>{q.packageHash='0'.repeat(64);},q=>{q.segments[0].estimatedCostMicrousd++;},q=>{q.segments[0].model='wrong-model';},q=>{q.segments[0].fingerprint='0'.repeat(64);},q=>{q.segments[0].estimateResponseHash='0'.repeat(64);},q=>{q.segments[0].bodyHash='0'.repeat(64);}]){
   const q=normal(saved.quote);q.id=randomUUID();mutate(q);
   await rejects(()=>pg.query('insert into public.ugc_v3_quotes(id,project_id,package_id,document) values($1,$2,$3,$4)',[q.id,f.project,saved.document.id,q]),'V3_LOCAL_PRICING_SNAPSHOT_INVALID');
  }
 }
 equal(networkCalls,0);
 console.log(JSON.stringify({pricingPersistenceChecks:checks,migrations:migrations.length+1,originalFailureReproduced:true,legacySavedEnvelopeRecovered:true,newPrecisionEnvelopePersisted:true,duplicates:0,creativeRegenerations:0,realNetworkCalls:networkCalls}));
}finally{process.env=oldEnv;await pg.close();}
