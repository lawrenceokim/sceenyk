// Actual route/action/worker + disposable PostgreSQL/Sharp. Providers and private storage are fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {typescriptLoader} from './lib/load-typescript.mjs';
const require=createRequire(import.meta.url),builder=require('../lib/video-generation-package/builder.ts');
const normal=v=>JSON.parse(JSON.stringify(v)),hash=b=>createHash('sha256').update(b).digest('hex');
let checks=0,networkCalls=0,mode='pass',saveFailure=false,storageFailure=false,deleteFailure=false,deleteAttempts=0;
const equal=(a,b)=>{assert.deepEqual(normal(a),normal(b));checks++;},ok=v=>{assert.ok(v);checks++;};
const pg=new PGlite(),owner=randomUUID(),oldEnv={...process.env},spool=new Map(),objects=new Map(),calls=[],deleted=[],sources=new Map();
const master=await sharp({create:{width:1024,height:1024,channels:3,background:'#787878'}}).png().toBuffer();
const oddImage=await sharp({create:{width:320,height:192,channels:3,background:'#cc2424'}}).png().toBuffer();
const instruction={name:'Accessible vehicle studio',prompt:'A wide empty vehicle studio with a south entrance, north daylight and clear walkaround space for the saved BMW advertisement. Show the same architecture in all four views.'};
const call=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
const db={async rpc(name,args){try{return{data:await call(name,Object.values(args)),error:null};}catch(e){return{data:null,error:{code:e.code,message:e.message}};}},
 from(table){assert.ok(['projects','project_assets','ugc_v3_projects'].includes(table));let columns='*';const clauses=[],values=[];
 return{select(v){assert.match(v,/^[a-z_,]+$/);columns=v;return this;},eq(k,v){assert.match(k,/^[a-z_]+$/);values.push(v);clauses.push(`${k}=$${values.length}`);return this;},
 is(k,v){assert.equal(v,null);clauses.push(`${k} is null`);return this;},in(k,v){values.push(v);clauses.push(`${k}=any($${values.length}::text[])`);return this;},
 async execute(single=false){const rows=(await pg.query(`select ${columns} from public.${table} where ${clauses.join(' and ')}`,values)).rows;return{data:single?rows[0]??null:rows,error:null};},
 maybeSingle(){return this.execute(true);},then(resolve,reject){return this.execute().then(resolve,reject);}};}};
const media={bytesHash:hash,readSpool:async(id,name)=>spool.get(`${id}:${name}`)??null,
 saveSpool:async(id,name,bytes)=>{const key=`${id}:${name}`;if(spool.has(key)&&hash(spool.get(key))!==hash(bytes))throw new Error('V3_SPOOL_CONFLICT');spool.set(key,bytes);
  if(saveFailure&&name==='openai-response.json'){saveFailure=false;throw new Error('FIXTURE_LOST_SAVE_ACK');}},
 writeReferenceDiagnostics:async(id,value)=>spool.set(`${id}:reference-diagnostics.json`,Buffer.from(JSON.stringify(value))),
 purgeReferenceSpool:async id=>{for(const key of [...spool.keys()])if(key.startsWith(`${id}:`))spool.delete(key);},
 deleteReferencePrivate:async(user,project,asset)=>{deleteAttempts++;equal(asset.storageKey,`users/${user}/projects/${project}/v3/${asset.id}.png`);if(deleteFailure)throw new Error('FIXTURE_DELETE_FAILED');if(objects.has(asset.storageKey))equal(objects.get(asset.storageKey).asset.etag,asset.etag);objects.delete(asset.storageKey);deleted.push(asset.id);},
 readPrivate:async key=>objects.get(key)?.bytes??master,
 inspectImage:async bytes=>{const b=await sharp(bytes).rotate().png().toBuffer(),m=await sharp(b).metadata();return{bytes:b,metadata:{mimeType:'image/png',width:m.width,height:m.height,durationMs:0,hasAudio:false}};},
 publishPrivate:async(user,project,id,bytes,meta)=>{if(storageFailure)throw new Error('FIXTURE_STORAGE');const asset={id,storageKey:`users/${user}/projects/${project}/v3/${id}.png`,etag:'fixture',sha256:hash(bytes),sizeBytes:bytes.length,...meta};objects.set(asset.storageKey,{asset,bytes});return asset;},
 signPrivate:async a=>({url:`https://private.example.test/${a.id}`,expiresAt:'fixture'})};
async function fixtureResponse(kind,body,options){
 const id=options.headers['X-Client-Request-Id'];
 ok((await pg.query("select id from public.ugc_v3_tasks where output->'requests' @> $1::jsonb",[JSON.stringify([{id,status:'intent'}])])).rows[0]);
 calls.push({kind,id,body:normal(body)});
 if(mode==='unknown')throw new Error('fixture transport disconnect sk-proj-FAKE_SECRET');
 if(mode==='rejected'){const e=new Error('sk-proj-FAKE_SECRET');Object.assign(e,{status:429,requestID:'req_rejected',code:'insufficient_quota'});throw e;}
 if(kind==='plan'){
  equal(body.model,'fixture-director');equal(body.text.format.name,'location_prompt_v2');
  equal(body.input[0].content.filter(c=>c.type==='input_image').length,mode==='optional'?1:2);
  assert.match(body.input[0].content[0].text,/"visualStyle":"Realistic"/);assert.match(body.instructions,/user will judge the generated image/);checks+=2;
  return new Response(JSON.stringify({id:'resp_prompt',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(instruction)}]}],usage:{input_tokens:10,output_tokens:20,total_tokens:30}}),{status:200,headers:{'x-request-id':'req_prompt'}});
 }
 equal(kind,'sheet');equal(body.model,'fixture-image');equal(body.n,1);equal(body.size,'1024x1024');
 for(const phrase of ['Top-left: aerial/top','Top-right: horizontal eye-level','Bottom-left: elevated wide-angle','Bottom-right: POV','EMPTY location','no Character, product',instruction.prompt]){ok(body.prompt.includes(phrase));}
 if(mode==='stale_image')await pg.query("update public.projects set duration='30' where id=(select project_id from public.ugc_v3_tasks where output->'requests' @> $1::jsonb)",[JSON.stringify([{id,status:'intent'}])]);
 return new Response(JSON.stringify({data:[{b64_json:(mode==='anything'?oddImage:master).toString('base64')}],usage:{total_tokens:10}}),{status:200,headers:{'x-request-id':'req_image'}});
}
class FixtureOpenAI{constructor(config){equal(config.maxRetries,0);}
 responses={create:(body,options)=>{
  if(body.text.format.name==='director_storyboard_v3')return(async()=>{
   calls.push({kind:'storyboard',body:normal(body)});const storyboard=normal(load('scripts/final-video-v3-fixture.ts').v3Input().storyboardContent);storyboard.tone='Professional';
   assert.match(body.input[0].content[0].text,/Approved Location prompt and sheet binding/);assert.match(body.input[0].content[0].text,/Accessible vehicle studio/);checks+=2;
   return{_request_id:'req_storyboard',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(storyboard)}]}]};
  })();
  return{asResponse:()=>fixtureResponse('plan',body,options)};
 }};
 images={generate:(body,options)=>({asResponse:()=>fixtureResponse('sheet',body,options)}),edit:()=>{throw new Error('LOCATION_AUTOMATIC_REPAIR_FORBIDDEN');}};}
const load=typescriptLoader({'@/lib/auth/ensure-app-user':{ensureAppUser:async()=>({id:owner})},'@/lib/auth/require-user':{requireClerkUser:async()=>({userId:'fixture'})},
 '@/lib/db/server':{createDatabaseClient:()=>db},'./runtime-media':media,
 '@/lib/video-generation-package/builder':{...builder,packageDigest:(d,v)=>builder.packageDigest(d,normal(v)),canonicalJson:v=>builder.canonicalJson(normal(v))},
 './join':{joinV3Segments:async()=>{throw new Error('JOIN_FORBIDDEN');}},'next/navigation':{unstable_rethrow:()=>{}},
 openai:{__esModule:true,default:FixtureOpenAI,toFile:async bytes=>new File([bytes],'source.png',{type:'image/png'})}},
 {Error,Response,Request,File,AbortController,fetch:async()=>{networkCalls++;throw new Error('NETWORK_FORBIDDEN');},console:{...console,info(){}}});
const route=load('app/api/ugc/v3/route.ts'),{runV3Task}=load('lib/final-video-generation-v3/worker.ts'),{V3Store}=load('lib/final-video-generation-v3/runtime-store.ts');
const contract=load('lib/final-video-generation-v3/location-contract.ts'),{runtimeDto}=load('lib/final-video-generation-v3/runtime-server.ts');
const read=async p=>runtimeDto(await new V3Store(db).read(owner,p));
const post=async(project,payload)=>{const r=await route.POST(new Request('https://studio.example.test/api/ugc/v3',{method:'POST',headers:{origin:'https://studio.example.test','content-type':'application/json'},body:JSON.stringify({projectId:project,...payload})}));return{status:r.status,body:await r.json()};};
const row=async p=>(await pg.query("select * from public.ugc_v3_tasks where project_id=$1 and kind='location' order by created_at desc,id desc limit 1",[p])).rows[0];
const tick=p=>runV3Task(p,owner,new V3Store(db));
const cp=async p=>(await pg.query("select jsonb_build_object('tasks',(select jsonb_agg(to_jsonb(t) order by id) from public.ugc_v3_tasks t where project_id=$1 and kind in ('character','product')),'artifacts',(select jsonb_agg(to_jsonb(a) order by id) from public.ugc_v3_artifacts a where project_id=$1 and kind in ('character','product'))) data",[p])).rows[0].data;
async function seedSheet(project,role,context,approved=true){
 await call('ugc_v3_runtime_action',[owner,project,'enqueue',{kind:role,requestKey:`${role}:${randomUUID()}`,input:{}}]);
 const t=await call('ugc_v3_task_claim',[project]);equal(t.kind,role);
 const asset=await media.publishPrivate(owner,project,t.id,master,{mimeType:'image/png',width:1024,height:1024,durationMs:0,hasAudio:false});
 await media.saveSpool(t.id,'image.png',master);await media.saveSpool(t.id,'openai-response.json',Buffer.from(JSON.stringify({image:master.toString('base64')})));
 await call('ugc_v3_task_checkpoint',[t.id,t.lease_token,'artifact',{id:t.id,document:{asset,original:{id:sources.get(`${project}:${role}`),sha256:hash(master)},input:{generationContext:context}}}]);
 if(approved)await call('ugc_v3_runtime_action',[owner,project,'review_artifact',{id:t.id,decision:'approve'}]);
 return t;
}
async function fixture(optional=false){
 const project=randomUUID(),fields={title:'Simple Location fixture',category:'product-ad',prompt:'Present the BMW in an appropriate environment',ugcType:optional?'unboxing':'advertisement',settings:{duration:'10',aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'}};
 await call('ugc_v3_create_project',[owner,project,fields]);
 const context=load('lib/final-video-generation-v3/generation-context.ts').generationContext({prompt:fields.prompt,visual_style:'Realistic',creation_type:'ugc',ugc_type:fields.ugcType,tone:'Professional',category:fields.category});
 for(const role of optional?['character']:['character','product']){
  const source=randomUUID();sources.set(`${project}:${role}`,source);
  await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id,reference_name) values($1,$2,$3,$4,$5,'fixture.png','image/png',$6,'image','uploaded','source-etag',$7,$1,$8)",[source,owner,project,randomUUID(),`users/${owner}/projects/${project}/${source}/fixture.png`,master.length,role,role==='product'?'bmw x6m competition':'Approved Character']);
  await seedSheet(project,role,context,true);if(role==='character')await seedSheet(project,role,context,true);
 }
 return{project,context};
}
async function generate(project){equal((await post(project,{action:'reference',kind:'location'})).status,200);await tick(project);await tick(project);const t=await row(project);assert.equal(t.status,'done',JSON.stringify({code:t.error_code,phase:t.output?.phase}));checks++;return t;}
try{
 Object.assign(process.env,{NODE_ENV:'development',UGC_V3_ENABLED:'1',UGC_V3_OPENAI_ENABLED:'1',OPENAI_API_KEY:'fixture-only',OPENAI_V3_IMAGE_MODEL:'fixture-image',OPENAI_V3_DIRECTOR_MODEL:'fixture-director',UGC_V3_OPERATOR_USER_ID:owner,UGC_V3_HIGGSFIELD_ENABLED:'0',SCEENYK_LOCAL_JOBS_ONLY:'1',RENDER:'false',VERCEL:'0'});
 await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 const migrations=fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
 for(const file of migrations)await pg.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
 await pg.exec(fs.readFileSync('supabase/migrations/20261031008400_ugc_v3_simple_location_retention.sql','utf8'));
 await pg.exec(fs.readFileSync('scripts/verify-v3-setup.sql','utf8'));checks++;
 await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'fixture')",[owner]);
 const f=await fixture(),before=await cp(f.project),start=calls.length;
 equal((await post(f.project,{action:'reference',kind:'location'})).status,200);const task=await row(f.project);
 equal(task.input.locationDirector,{version:'location-prompt-v2',maxRequests:2,maxImageRequests:1});
 equal((await post(f.project,{action:'reference',kind:'location'})).status,200);equal((await row(f.project)).id,task.id);
 await tick(f.project);equal((await row(f.project)).output.phase,'sheet');await tick(f.project);
 const ready=await row(f.project);equal(ready.status,'done');equal(calls.length-start,2);equal(calls.slice(start).map(c=>c.kind),['plan','sheet']);
 let dto=await read(f.project),candidate=dto.artifacts.find(a=>a.kind==='location');ok(candidate.preview);equal(candidate.approved,false);equal(candidate.location.instruction,instruction);
 equal(ready.output.document.location.quality,null);equal(ready.output.document.location.blueprint,null);equal(await cp(f.project),before);
 equal(await call('ugc_v3_queue_reference_cleanup',[owner,f.project,false]),0);ok(objects.has(ready.output.document.asset.storageKey));
 equal((await post(f.project,{action:'review_artifact',id:candidate.id,decision:'approve'})).status,200);
 equal((await post(f.project,{action:'storyboard'})).status,200);await tick(f.project);const sb=(await read(f.project)).artifacts.find(a=>a.kind==='storyboard');ok(sb);
 equal((await post(f.project,{action:'review_artifact',id:sb.id,decision:'approve'})).status,200);equal((await post(f.project,{action:'build_package'})).status,200);
 const source=(await pg.query('select input from public.ugc_v3_sources where project_id=$1',[f.project])).rows[0].input;equal(JSON.parse(source.direction).approvedLocation.instruction,instruction);
 // An outdated generic worker is fenced before it can skip the ChatGPT prompt or call a provider.
 const outdated=await fixture();await post(outdated.project,{action:'reference',kind:'location'});const outdatedClaim=await call('ugc_v3_task_claim',[outdated.project]),outdatedCalls=calls.length;
 await assert.rejects(call('ugc_v3_task_checkpoint',[outdatedClaim.id,outdatedClaim.lease_token,'intent',{}]),/V3_LOCATION_WORKER_RESTART_REQUIRED/);checks++;
 equal((await row(outdated.project)).provider_started,false);equal(calls.length,outdatedCalls);
 await call('ugc_v3_task_checkpoint',[outdatedClaim.id,outdatedClaim.lease_token,'failed',{code:'V3_LOCATION_WORKER_RESTART_REQUIRED'}]);
 // A readable image of ANY returned layout/content reaches user review: no AI gate, correction or third call.
 mode='anything';const any=await fixture(),anyCount=calls.length,anyTask=await generate(any.project);equal(calls.length-anyCount,2);equal(anyTask.output.document.asset.width,320);equal(anyTask.output.document.asset.height,192);ok((await read(any.project)).artifacts.find(a=>a.kind==='location').preview);
 mode='stale_image';const stale=await fixture(),staleTask=await generate(stale.project),staleDTO=await read(stale.project);ok(staleDTO.artifacts.find(a=>a.id===staleTask.id).preview);equal(staleDTO.artifacts.find(a=>a.id===staleTask.id).current,false);equal((await post(stale.project,{action:'review_artifact',id:staleTask.id,decision:'approve'})).body.code,'REFERENCE_STALE_REGENERATE');
 // Lost-response-ack recovery and storage recovery reuse saved work, with OpenAI disabled.
 mode='pass';const interrupted=await fixture();await post(interrupted.project,{action:'reference',kind:'location'});saveFailure=true;await tick(interrupted.project);const interruptedTask=await row(interrupted.project),interruptCalls=calls.length;
 equal(interruptedTask.status,'reconciliation_required');process.env.UGC_V3_OPENAI_ENABLED='0';process.env.OPENAI_API_KEY='';equal((await post(interrupted.project,{action:'recover_task',id:interruptedTask.id})).status,200);await tick(interrupted.project);await tick(interrupted.project);equal(calls.length,interruptCalls);equal((await row(interrupted.project)).error_code,'V3_LOCATION_CONTINUE_REQUIRED');
 process.env.UGC_V3_OPENAI_ENABLED='1';process.env.OPENAI_API_KEY='fixture-only';equal((await post(interrupted.project,{action:'location_continue',id:interruptedTask.id})).status,200);await tick(interrupted.project);equal((await row(interrupted.project)).status,'done');equal(calls.length,interruptCalls+1);
 const storing=await fixture();await post(storing.project,{action:'reference',kind:'location'});await tick(storing.project);storageFailure=true;await tick(storing.project);const storeTask=await row(storing.project),storeCount=calls.length;equal(storeTask.error_code,'V3_LOCATION_STORAGE_FAILED');
 process.env.UGC_V3_OPENAI_ENABLED='0';process.env.OPENAI_API_KEY='';storageFailure=false;await post(storing.project,{action:'recover_task',id:storeTask.id});await tick(storing.project);equal((await row(storing.project)).status,'done');equal(calls.length,storeCount);
 // A legacy AI-rejected image is exposed for review with no new prompt, image or check call.
 process.env.UGC_V3_OPENAI_ENABLED='1';process.env.OPENAI_API_KEY='fixture-only';const legacy=await fixture();await post(legacy.project,{action:'reference',kind:'location'});const old=await row(legacy.project),repairId=contract.locationRequestId(old.id,'repair');
 const oldState={schema:'ai-location-director-v1',phase:'recheck',requests:['plan','sheet','check','repair','recheck'].map(key=>({key,id:contract.locationRequestId(old.id,key),status:'saved',httpStatus:200,requestId:'req_old',responseId:null,responseHash:'old'})),blueprint:{name:'Saved old Location',feasible:false},blueprintHash:'old',quality:{sameEnvironment:false},sheetId:repairId,recoveryOnly:false,errorCode:'V3_LOCATION_QUALITY_FAILED'};
 await pg.query("update public.ugc_v3_tasks set input=jsonb_set(input,'{locationDirector,version}','\"ai-location-director-v1\"'),output=$2,provider_started=true,status='failed',error_code='V3_LOCATION_QUALITY_FAILED' where id=$1",[old.id,oldState]);
 spool.set(`${repairId}:image.png`,oddImage);spool.set(`${contract.locationRequestId(old.id,'sheet')}:image.png`,master);
 const legacyCount=calls.length;process.env.UGC_V3_OPENAI_ENABLED='0';process.env.OPENAI_API_KEY='';equal((await read(legacy.project)).tasks.find(t=>t.id===old.id).recoveryAvailable,true);await post(legacy.project,{action:'recover_task',id:old.id});await tick(legacy.project);equal(calls.length,legacyCount);equal((await row(legacy.project)).status,'done');ok((await read(legacy.project)).artifacts.find(a=>a.id===old.id).preview);
 // Reject permanently removes R2, every image-bearing spool copy and the reference row; audit stays small.
 const legacyAsset=(await row(legacy.project)).output.document.asset;equal((await post(legacy.project,{action:'review_artifact',kind:'location',id:old.id,expectedVersion:1,decision:'reject'})).status,200);equal(objects.has(legacyAsset.storageKey),false);equal([...spool.keys()].some(k=>k.startsWith(`${repairId}:`)),false);equal([...spool.keys()].some(k=>k.startsWith(`${contract.locationRequestId(old.id,'sheet')}:`)),false);equal((await read(legacy.project)).artifacts.some(a=>a.id===old.id),false);
 const audit=(await pg.query("select document from public.ugc_v3_runtime_events where entity_id=$1 and kind='reference_discarded'",[old.id])).rows[0].document;equal(audit.requests.length,5);ok(!JSON.stringify(audit).includes('b64_json'));ok(!JSON.stringify(audit).includes('storageKey'));
 equal((await post(legacy.project,{action:'review_artifact',kind:'location',id:old.id,expectedVersion:1,decision:'reject'})).status,200);equal(calls.length,legacyCount);
 process.env.UGC_V3_OPENAI_ENABLED='1';process.env.OPENAI_API_KEY='fixture-only';
 const oldQueued=await fixture();await post(oldQueued.project,{action:'reference',kind:'location'});const oldQueuedTask=await row(oldQueued.project),oldQueuedCalls=calls.length;
 await pg.query("update public.ugc_v3_tasks set input=jsonb_set(input,'{locationDirector,version}','\"ai-location-director-v1\"') where id=$1",[oldQueuedTask.id]);
 await tick(oldQueued.project);await tick(oldQueued.project);equal((await row(oldQueued.project)).status,'done');equal((await row(oldQueued.project)).output.document.instruction,instruction);equal(calls.length-oldQueuedCalls,2);
 // Failed storage deletion remains fenced and retryable, with no provider call.
 const deleting=await fixture(),deletingCP=await cp(deleting.project),deletingTask=await generate(deleting.project),deleteCalls=calls.length;deleteFailure=true;
 equal((await post(deleting.project,{action:'review_artifact',kind:'location',id:deletingTask.id,expectedVersion:1,decision:'reject'})).body.code,'V3_REFERENCE_DISCARD_STORAGE_FAILED');ok(objects.has(deletingTask.output.document.asset.storageKey));equal((await read(deleting.project)).artifacts.find(a=>a.id===deletingTask.id).cleanupPending,true);
 equal((await post(deleting.project,{action:'review_artifact',id:deletingTask.id,decision:'approve'})).body.code,'REFERENCE_STALE_REGENERATE');deleteFailure=false;equal((await post(deleting.project,{action:'discard_reference',id:deletingTask.id,expectedVersion:1})).status,200);equal(objects.has(deletingTask.output.document.asset.storageKey),false);equal(calls.length,deleteCalls);equal(await cp(deleting.project),deletingCP);
 // Approved history is retained; a deleted unapproved latest version never resurrects an old approval.
 const history=await fixture(),v1=await generate(history.project);equal((await post(history.project,{action:'review_artifact',id:v1.id,decision:'approve'})).status,200);const approvedAsset=v1.output.document.asset;
 const v2=await generate(history.project);equal(v2.output.document.location.requests.length,2);equal((await read(history.project)).artifacts.find(a=>a.id===v2.id).version,2);
 await post(history.project,{action:'review_artifact',kind:'location',id:v2.id,expectedVersion:2,decision:'reject'});const afterReject=await read(history.project);equal(afterReject.artifacts.find(a=>a.id===v1.id).activeSlot,false);ok(objects.has(approvedAsset.storageKey));
 const v3=await generate(history.project);equal((await read(history.project)).artifacts.find(a=>a.id===v3.id).version,3);equal((await post(history.project,{action:'discard_reference',id:v1.id,expectedVersion:1})).body.code,'V3_APPROVED_REFERENCE_PRESERVED');ok(objects.has(approvedAsset.storageKey));
 // Explicit Regenerate deletes only the bound current unapproved sheet before queueing one replacement.
 equal((await post(history.project,{action:'reference',kind:'location',expectedId:v3.id,expectedVersion:3})).status,200);const replacement=await row(history.project);ok(replacement.id!==v3.id);equal(objects.has(v3.output.document.asset.storageKey),false);equal((await post(history.project,{action:'reference',kind:'location',expectedId:v3.id,expectedVersion:3})).status,200);equal((await row(history.project)).id,replacement.id);
 // Background policy removes old unapproved Character/Product history, never the current candidate or approvals.
 const retention=await fixture(),unwanted=await seedSheet(retention.project,'character',retention.context,false);const current=await seedSheet(retention.project,'character',retention.context,true);const oldApproved=(await pg.query("select id from public.ugc_v3_artifacts where project_id=$1 and kind='character' and approved_at is not null order by version",[retention.project])).rows.map(a=>a.id);
 const retentionCalls=calls.length;equal((await read(retention.project)).processing,false);equal((await read(retention.project)).referenceCleanup.processing,true);deleteFailure=true;await tick(retention.project);const failedDeleteAttempts=deleteAttempts;
 equal((await read(retention.project)).referenceCleanup.pendingCount,1);await tick(retention.project);equal(deleteAttempts,failedDeleteAttempts);
 deleteFailure=false;equal((await post(retention.project,{action:'cleanup_references'})).status,200);await tick(retention.project);
 equal(calls.length,retentionCalls);equal((await pg.query('select id from public.ugc_v3_artifacts where id=$1',[unwanted.id])).rows.length,0);equal(spool.has(`${unwanted.id}:openai-response.json`),false);
 for(const id of oldApproved)ok((await pg.query('select id from public.ugc_v3_artifacts where id=$1 and approved_at is not null',[id])).rows[0]);ok((await read(retention.project)).artifacts.find(a=>a.id===current.id).approved);
 const review=await fixture(),reviewTask=await generate(review.project);await assert.rejects(call('ugc_v3_discard_reference_prepare',[owner,review.project,reviewTask.id,1,false]),/V3_CURRENT_REVIEW_REFERENCE_PRESERVED/);checks++;
 await assert.rejects(call('ugc_v3_discard_reference_prepare',[randomUUID(),review.project,reviewTask.id,1,true]),/FRESH_V3_PROJECT_REQUIRED/);checks++;
 await assert.rejects(call('ugc_v3_discard_reference_prepare',[owner,review.project,reviewTask.id,99,true]),/V3_REFERENCE_CHANGED_RECONFIRM/);checks++;
 const foreign=await fixture();const foreignTask=await call('ugc_v3_runtime_action',[owner,foreign.project,'enqueue',{kind:'location',requestKey:'unused-foreign-fixture',input:{}}]);
 const foreignId=(await pg.query("select id from public.ugc_v3_tasks where project_id=$1 and request_key='unused-foreign-fixture'",[foreign.project])).rows[0].id;
 void foreignTask;spool.set(`${foreignId}:openai-response.json`,Buffer.from('foreign project response'));
 await pg.query('update public.ugc_v3_artifacts set task_id=$2 where id=$1',[reviewTask.id,foreignId]);
 const scopeDeletes=deleted.length;equal((await post(review.project,{action:'discard_reference',id:reviewTask.id,expectedVersion:1})).body.code,'V3_REFERENCE_DELETE_SCOPE');equal(deleted.length,scopeDeletes);equal(spool.get(`${foreignId}:openai-response.json`).toString(),'foreign project response');
 await pg.query('update public.ugc_v3_artifacts set task_id=$2 where id=$1',[reviewTask.id,reviewTask.id]);
 equal((await pg.query("select has_function_privilege('authenticated','public.ugc_v3_discard_reference_prepare(uuid,uuid,uuid,integer,boolean)','EXECUTE') browser,has_function_privilege('service_role','public.ugc_v3_discard_reference_prepare(uuid,uuid,uuid,integer,boolean)','EXECUTE') server")).rows[0],{browser:false,server:true});
 mode='unknown';const unknown=await fixture();await post(unknown.project,{action:'reference',kind:'location'});await tick(unknown.project);const missing=await read(unknown.project);equal(missing.tasks.at(-1).recoveryAvailable,false);equal(missing.tasks.at(-1).canStartNew,false);ok(!JSON.stringify(missing).includes('FAKE_SECRET'));
 mode='optional';const optional=await fixture(true);const optionalCount=calls.length;await generate(optional.project);equal(calls.length-optionalCount,2);
 equal(networkCalls,0);console.info(JSON.stringify({simpleLocationAndRetentionChecks:checks,migrations:migrations.length,fixtureProviderCalls:calls.length,realNetworkCalls:networkCalls,automaticImageChecks:0}));
}finally{await pg.close();for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
