// Synthetic records in disposable PostgreSQL; no provider, live records or media generation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),builder=require('../lib/video-generation-package/builder.ts');
const normal=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
let checks=0,networkCalls=0,actingOwner=randomUUID();
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
const pg=new PGlite();
const eq=(a,b)=>{assert.deepEqual(normal(a),normal(b));checks++;};
const ok=v=>{assert.ok(v);checks++;};
const rejects=async(fn,code)=>{await assert.rejects(fn,new RegExp(code));checks++;};
const fails=(fn,code)=>{assert.throws(fn,code?new RegExp(code):undefined);checks++;};
const call=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
const db={async rpc(name,args){try{return{data:await call(name,Object.values(args)),error:null};}catch(e){return{data:null,error:{code:e.code,message:e.message}};}},
 from(table){assert.ok(['projects','project_assets','ugc_v3_projects'].includes(table));let columns='*',fields=null;const clauses=[],values=[];
  return{select(v){assert.match(v,/^[a-z_,]+$/);columns=v;return this;},update(v){fields=v;return this;},
   eq(k,v){assert.match(k,/^[a-z_]+$/);values.push(v);clauses.push(`${k}=$${values.length}`);return this;},
   is(k,v){assert.equal(v,null);clauses.push(`${k} is null`);return this;},
   in(k,v){values.push(v);clauses.push(`${k}=any($${values.length}::text[])`);return this;},
   async execute(single=false){let query=`select ${columns} from public.${table} where ${clauses.join(' and ')}`;
    if(fields){const assignments=Object.entries(fields).map(([k,v])=>{assert.match(k,/^[a-z_]+$/);values.push(v);return`${k}=$${values.length}`;});query=`update public.${table} set ${assignments.join(',')} where ${clauses.join(' and ')} returning ${columns}`;}
    const rows=(await pg.query(query,values)).rows;return{data:single?rows[0]??null:rows,error:null};},
   maybeSingle(){return this.execute(true);},then(resolve,reject){return this.execute().then(resolve,reject);}};
 }};
const stubs={'@/lib/auth/ensure-app-user':{ensureAppUser:async()=>({id:actingOwner})},'@/lib/db/server':{createDatabaseClient:()=>db},
 './runtime-media':{signPrivate:async asset=>({url:`https://fixture.invalid/${asset.id}`,expiresAt:new Date(Date.now()+300000).toISOString()}),readSpool:async()=>null},
 '@/lib/projects/ugc-v1-server':{readOwnedUgcV1References:async()=>({characters:[],products:[]})},
 './ugc-v1-server':{readOwnedUgcV1References:async()=>({characters:[],products:[]})},
 '@/lib/final-video-generation-v3/enrollment':{eligibleForV3:()=>true,enrolledV3:async(owner,project)=>!!(await pg.query('select 1 from public.ugc_v3_projects where project_id=$1 and owner_user_id=$2',[project,owner])).rows.length},
 '@/lib/video-generation-package/builder':{...builder,packageDigest:(d,v)=>builder.packageDigest(d,normal(v)),canonicalJson:v=>builder.canonicalJson(normal(v))}};
const load=typescriptLoader(stubs,{Error,structuredClone:normal,AbortController,Response,Request,File});
const {saveOwnedProject,getOwnedProject}=load('lib/projects/server.ts');
const {projectBrief,creativeBriefHash}=load('lib/final-video-generation-v3/creative-inputs.ts');
const {projectVideoResolution,videoResolutionSchema}=load('lib/projects/video-resolution.ts');
const {saveProjectSchema}=load('lib/projects/validation.ts');
const {v3Input,v3Context,sealV3}=load('scripts/final-video-v3-fixture.ts');
const {HiggsfieldVideoGenerationProvider,higgsfieldModels}=load('lib/final-video-generation-v3/adapters/higgsfield.ts');
const {HiggsfieldV3Transport}=load('lib/final-video-generation-v3/adapters/higgsfield-transport.ts');
const {buildFrozenPackage,restoreSegment,readFrozenPackage,packageCost}=load('lib/final-video-generation-v3/package.ts');
const {createRuntimeAuthorization,createPaidIntent,runtimePreflight}=load('lib/final-video-generation-v3/execution-package.ts');
const {quoteSchema}=load('lib/final-video-generation-v3/runtime-contract.ts');
const {getEstimatedRate,calculateManualEstimate}=load('lib/final-video-generation-v3/pricing/higgsfield-pricing.ts');
const {currentDisplayPricing}=load('lib/final-video-generation-v3/pricing/display-pricing.ts');
const {v3Digest,v3BodyHash}=load('lib/final-video-generation-v3/identity.ts');
const {assertV3VideoMetadata}=load('lib/final-video-generation-v3/video-metadata.ts');
const {storyboardDirectorInput}=load('lib/final-video-generation-v3/storyboard-director.ts');
const {executeV3Segment}=load('lib/final-video-generation-v3/execution.ts');
const {runtimeDto}=load('lib/final-video-generation-v3/runtime-server.ts');
const {V3Store}=load('lib/final-video-generation-v3/runtime-store.ts');
const {higgsfieldRequestIssues}=load('lib/final-video-generation-v3/adapters/higgsfield-validity.ts');
const {packageTask}=load('lib/final-video-generation-v3/package-task.ts');
const original=globalThis.sessionStorage,session=new Map();
const guest=typescriptLoader({}, {sessionStorage:{getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)}})('components/creation/guest-draft.ts');
const catalog=async()=>(await pg.query("select oid,proname,prosrc,proacl,proconfig from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
const draft=resolution=>({id:randomUUID(),mode:'create',title:'Offline resolution fixture',category:'product-ad',prompt:'Show the approved subject.',creationType:'ugc',ugcType:'advertisement',settings:{duration:'10',aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional',...(resolution?{resolution}:{})}});
try{
 await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 const target='20261104009300_ugc_v3_video_resolution.sql';
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<target).sort())await pg.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await pg.query('insert into public.app_users(id,clerk_user_id) values($1,$2)',[actingOwner,actingOwner]);
 const legacy=draft();await call('ugc_v3_create_project',[actingOwner,legacy.id,legacy]);
 const oldHash=await call('ugc_v3_brief_hash',[legacy.id]),before=await catalog();
 const sql=fs.readFileSync('supabase/migrations/'+target,'utf8');await pg.exec(sql);const after=await catalog();await pg.exec(sql);eq(await catalog(),after);
 const expected=['ugc_v3_brief_hash','ugc_v3_create_project','ugc_v3_runtime_action','ugc_v3_write','ugc_v3_local_quote_guard'];
 eq(after.filter(a=>!expected.includes(a.proname)),before.filter(a=>!expected.includes(a.proname)));
 eq(after.map(({oid,proacl,proconfig})=>({oid,proacl,proconfig})),before.map(({oid,proacl,proconfig})=>({oid,proacl,proconfig})));
 eq(await call('ugc_v3_brief_hash',[legacy.id]),oldHash);eq((await getOwnedProject(legacy.id)).settings.resolution,undefined);
 eq(projectVideoResolution(undefined),'480p');fails(()=>videoResolutionSchema.parse('4k'));
 const now=new Date().toISOString(),expiry=new Date(Date.now()+240000).toISOString(),provider=new HiggsfieldVideoGenerationProvider();
 for(const resolution of ['480p','720p','1080p']){
  const inputDraft=draft(resolution),saved=await saveOwnedProject(inputDraft);ok(saved.ok);eq(projectVideoResolution(saved.project.settings.resolution),resolution);
  eq(projectVideoResolution((await getOwnedProject(inputDraft.id)).settings.resolution),resolution);
  eq(saveProjectSchema.parse(inputDraft).settings.resolution,resolution);
  const {id:_id,mode:_mode,...guestBrief}=inputDraft;void _id;void _mode;guest.rememberGuestDraft(guestBrief,[]);eq(guest.readGuestDraft()?.brief.settings.resolution,resolution);guest.clearGuestDraft();
  const brief=await projectBrief(actingOwner,inputDraft.id),creativeHash=creativeBriefHash(brief);
  const director=storyboardDirectorInput(brief,['character','product','location'],null);ok(director.includes(`"resolution":"${resolution}"`));
  const input=v3Input([10000]);input.resolution=resolution;input.scope.ownerId=actingOwner;input.scope.projectId=inputDraft.id;
  input.scope.jobId=(await pg.query('select logical_job_id from public.ugc_v3_projects where project_id=$1',[inputDraft.id])).rows[0].logical_job_id;
  const context=await call('ugc_v3_generation_context',[inputDraft.id]),originals={};
  for(const kind of ['character','product']){const id=randomUUID();originals[kind]=id;await pg.query("insert into public.project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id) values($1,$2,$3,$4,$5,'fixture.png','image/png',100,'image','uploaded','fixture',$6,$1)",[id,actingOwner,inputDraft.id,randomUUID(),`users/${actingOwner}/projects/${inputDraft.id}/${id}/fixture.png`,kind]);}
  input.provenance.originalImageId=originals.character;
  for(const r of input.references){r.id=randomUUID();r.approvalId=r.id;r.projectId=inputDraft.id;}
  input.storyboard.id=randomUUID();
  const refs=input.references.map(r=>r.id);
  for(const kind of ['character','product','location','storyboard']){
   const id=kind==='storyboard'?input.storyboard.id:input.references.find(r=>r.role===kind).id,taskId=randomUUID();
   const references=kind==='storyboard'?refs:kind==='location'?refs.slice(0,2):[];
   await pg.query("insert into public.ugc_v3_tasks(id,project_id,kind,request_key,input,status) values($1,$2,$3,$3,'{}','done')",[taskId,inputDraft.id,kind]);
   const asset={id,storageKey:`users/${actingOwner}/projects/${inputDraft.id}/v3/${id}.png`,etag:'fixture',sha256:input.references.find(r=>r.role===kind)?.sha256??'a'.repeat(64),sizeBytes:1000,mimeType:'image/png',width:1024,height:1024,durationMs:0,hasAudio:false};
   await pg.query("insert into public.ugc_v3_artifacts(id,project_id,task_id,kind,version,document,approved_at) values($1,$2,$3,$4,1,$5,now())",[id,inputDraft.id,taskId,kind,{...(kind==='storyboard'?{storyboard:input.storyboardContent}:{asset}),original:{id:originals[kind]},input:{generationContext:context,briefHash:creativeHash,references}}]);
  }
  sealV3(input);const planning=v3Context(input,provider);planning.now=now;
  const unpriced=buildFrozenPackage(input,provider,planning,{id:randomUUID(),version:1,sourceRevision:1});
  const request=provider.prepareRequest(restoreSegment(unpriced,unpriced.segments[0].id),new Map(refs.map(id=>[id,`https://fixture.invalid/${id}`])));
  eq(request.input.resolution,resolution);eq(request.model,higgsfieldModels.reference);eq(request.input.generate_audio,true);eq(request.input.image_urls.length,3);
  eq(higgsfieldRequestIssues(request.input,input.references,null,now),[]);
  if(resolution==='480p')eq(unpriced.pricing.totalMicrousd,2056670);
  else{eq(unpriced.pricing.totalMicrousd,null);eq(getEstimatedRate('higgsfield',higgsfieldModels.reference,'reference-to-video',resolution),null);fails(()=>calculateManualEstimate('higgsfield',higgsfieldModels.reference,'reference-to-video',10000,resolution),'V3_RESOLUTION_PRICING_NOT_CONFIGURED');
   fails(()=>createRuntimeAuthorization(unpriced,{},randomUUID(),{operatorId:actingOwner,approved:true,maximumMicrousd:100000000,now}),'COST_ESTIMATE_UNAVAILABLE');}
  // A synthetic price ONLY exercises the downstream higher-resolution contracts.
  // It is never installed in application configuration or presented as provider evidence.
  const pricedProvider=new HiggsfieldVideoGenerationProvider();
  if(resolution!=='480p')pricedProvider.estimateCost=(command)=>{const pricing={provider:'higgsfield',model:higgsfieldModels.reference,mode:'reference-to-video',resolution,durationMs:command.direction.durationMs,
   estimatedUsdPerSecond:'1.0000',rateMicrousdPerSecond:1000000,estimatedUsd:'10.000000',estimatedCostMicrousd:10000000,pricingSource:'manual_provider_estimate',pricingVersion:'synthetic-offline-only',configurationDate:'2026-11-04'};
   return{status:'estimated',source:'manual_provider_estimate',sourceUrl:'https://fixture.invalid/price',pricingVersion:pricing.pricingVersion,estimatedCostMicrousd:pricing.estimatedCostMicrousd,evidenceHash:v3Digest('manual-pricing',pricing),pricing,reason:null,actualProviderCostMicrousd:null,providerReceipt:null};};
  const doc=buildFrozenPackage(input,pricedProvider,planning,{id:randomUUID(),version:1,sourceRevision:1});eq(readFrozenPackage(doc).source.resolution,resolution);
  if(resolution!=='480p'){
   const historical=normal(doc);for(const s of historical.segments){delete s.estimate.pricing.resolution;s.estimate.evidenceHash=v3Digest('manual-pricing',s.estimate.pricing);}
   const {hash:_priorHash,...priorBody}=historical;void _priorHash;historical.hash=v3Digest('frozen-package',priorBody);
   eq(readFrozenPackage(historical).hash,historical.hash);eq(packageCost(historical,provider,now).code,'V3_RESOLUTION_PRICING_NOT_CONFIGURED');
  }
  const segment=doc.segments[0],body=provider.prepareRequest(restoreSegment(doc,segment.id),new Map(refs.map(id=>[id,`https://fixture.invalid/${id}`]))).input;
  const quote=quoteSchema.parse({id:randomUUID(),packageId:doc.id,packageHash:doc.hash,projectId:inputDraft.id,currency:'USD',observedAt:now,expiresAt:null,deliveryExpiresAt:expiry,pricingSource:'manual_provider_estimate',totalMicrousd:doc.pricing.totalMicrousd,
   segments:[{segmentUuid:randomUUID(),segmentId:segment.id,segmentVersion:1,fingerprint:segment.fingerprint,model:higgsfieldModels.reference,body,bodyHash:v3BodyHash(body),estimatedCostMicrousd:segment.estimate.estimatedCostMicrousd,estimateResponseHash:segment.estimate.evidenceHash}]});
  const auth=createRuntimeAuthorization(doc,quote,quote.segments[0].segmentUuid,{operatorId:actingOwner,approved:true,maximumMicrousd:20000000,now});eq(auth.resolution,resolution);
  const changedAuth={...normal(auth),resolution:resolution==='480p'?'1080p':'480p'};const {hash:_authHash,...authBody}=changedAuth;void _authHash;changedAuth.hash=v3Digest('runtime-authorization',authBody);
  ok(runtimePreflight(doc,quote,changedAuth,{current:true,transportEnabled:true,now,validityIssues:[]}).issues.includes('V3_AUTHORIZATION_BINDING_INVALID'));
  const report=runtimePreflight(doc,quote,auth,{current:true,transportEnabled:true,now,validityIssues:[]});eq(report.canSubmit,true);
  const wrongQuote=normal(quote);wrongQuote.segments[0].body.resolution=resolution==='480p'?'1080p':'480p';wrongQuote.segments[0].bodyHash=v3BodyHash(wrongQuote.segments[0].body);
  ok(runtimePreflight(doc,wrongQuote,auth,{current:true,transportEnabled:true,now,validityIssues:[]}).issues.includes('V3_QUOTE_BINDING_INVALID'));
  const intent=createPaidIntent(doc,quote,auth,now);eq(intent.body.resolution,resolution);eq(intent.authorization.resolution,resolution);
  const mockRequestId=randomUUID();let mockPosts=0;
  const transport=new HiggsfieldV3Transport({enabled:true,credentials:'fixture:key',accountScope:'fixture',outputHosts:['fixture.invalid']},async(url,options)=>{
   mockPosts++;eq(url,'https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video');eq(JSON.parse(options.body).resolution,resolution);
   return Response.json({request_id:mockRequestId,status:'queued',status_url:`https://api.higgsfield.ai/requests/${mockRequestId}/status`,cancel_url:`https://api.higgsfield.ai/requests/${mockRequestId}/cancel`});
  });
  eq((await transport.submit(intent,new AbortController().signal)).requestId,mockRequestId);eq(mockPosts,1);
  const wrongIntent=normal(intent);wrongIntent.body.resolution=resolution==='480p'?'1080p':'480p';wrongIntent.bodyHash=v3BodyHash(wrongIntent.body);
  const {hash:_intentHash,...intentBody}=wrongIntent;void _intentHash;wrongIntent.hash=v3Digest('paid-intent',intentBody);
  await rejects(()=>transport.submit(wrongIntent,new AbortController().signal),'V3_PAID_INTENT_BINDING_INVALID');eq(mockPosts,1);
  await call('ugc_v3_runtime_action',[actingOwner,inputDraft.id,'source',{input,privateBindings:{}}]);
  if(resolution!=='480p'){
   const taskId=randomUUID(),token=randomUUID();
   await pg.query("insert into public.ugc_v3_tasks(id,project_id,kind,request_key,input,status,lease_token,lease_until) values($1::uuid,$2,'package',$1::uuid::text,$3,'running',$4,now()+interval '5 minutes')",[taskId,inputDraft.id,{packageId:randomUUID(),packageVersion:1,sourceRevision:1},token]);
   const store=new V3Store(),w=await store.read(actingOwner,inputDraft.id);
   await packageTask(store,w.tasks.find(t=>t.id===taskId),w,new AbortController().signal);
   const savedFailure=(await pg.query('select status,output from public.ugc_v3_tasks where id=$1',[taskId])).rows[0];
   eq(savedFailure.status,'failed');eq(savedFailure.output.packageBuild.code,'V3_RESOLUTION_PRICING_NOT_CONFIGURED');
   eq((await pg.query('select count(*) n from public.ugc_v3_quotes where project_id=$1',[inputDraft.id])).rows[0].n,0);
  }
  await pg.query('insert into public.ugc_v3_packages(id,project_id,version,source_revision,document,package_hash) values($1,$2,1,1,$3,$4)',[doc.id,inputDraft.id,doc,doc.hash]);
  eq(await call('ugc_v3_runtime_current',[doc.id]),true);
  await rejects(()=>call('ugc_v3_runtime_action',[actingOwner,inputDraft.id,'quote',{document:{...wrongQuote,id:randomUUID()}}]),'V3_LOCAL_PRICING_SNAPSHOT_INVALID');
  await call('ugc_v3_runtime_action',[actingOwner,inputDraft.id,'quote',{document:quote}]);
  await rejects(()=>call('ugc_v3_runtime_action',[actingOwner,inputDraft.id,'authorize',{document:changedAuth}]),'V3_AUTHORIZATION_INVALID');
  await call('ugc_v3_runtime_action',[actingOwner,inputDraft.id,'authorize',{document:auth}]);
  const queued=await call('ugc_v3_runtime_action',[actingOwner,inputDraft.id,'generate',{intent}]);eq(queued.intent.body.resolution,resolution);
  eq((await call('ugc_v3_runtime_action',[actingOwner,inputDraft.id,'generate',{intent}])).id,queued.id);
  eq((await pg.query('select count(*) n from public.ugc_v3_runs where project_id=$1',[inputDraft.id])).rows[0].n,1);
  const edge=Number.parseInt(resolution,10),meta={width:edge,height:Math.round(edge*16/9),durationMs:10000,hasAudio:true};assertV3VideoMetadata(meta,{resolution,durationMs:10000,aspectRatio:'9:16',generateAudio:true});checks++;
  fails(()=>assertV3VideoMetadata({...meta,width:edge+1},{resolution,durationMs:10000,aspectRatio:'9:16',generateAudio:true}),'V3_VIDEO_TECHNICAL_VALIDATION_FAILED');
  let posts=0,polls=0;const receipt={requestId:randomUUID(),status:'completed',statusUrl:'https://fixture.invalid/status',cancelUrl:null,expiresAt:expiry,resultUrl:'https://fixture.invalid/result',correlationId:null,receiptHash:'e'.repeat(64),actualCostMicrousd:null};
  const asset={id:queued.id,storageKey:'synthetic',etag:'fixture',sha256:'f'.repeat(64),sizeBytes:1,mimeType:'video/mp4',...meta};
  const deps={provider:{submit:async()=>{posts++;return receipt;},reconcile:async()=>{polls++;return receipt;},fetchCompletedResult:async()=>Buffer.from('synthetic-not-media')},beforeSubmit:()=>{},checkpoint:async()=>{},readSaved:async()=>null,save:async()=>{},validateAndPublish:async()=>asset};
  await executeV3Segment(queued,false,deps,new AbortController().signal);eq(posts,1);
  await executeV3Segment({...queued,state:'reconciliation_required',observation:{...receipt,status:'in_progress'}},true,deps,new AbortController().signal);eq(posts,1);eq(polls,1);
  await rejects(()=>executeV3Segment({...queued,state:'reconciliation_required'},true,deps,new AbortController().signal),'V3_PROVIDER_OUTCOME_UNKNOWN');eq(posts,1);
  const resultAsset={...asset,storageKey:`users/${actingOwner}/projects/${inputDraft.id}/v3/${queued.id}.mp4`};
  await pg.query("update public.ugc_v3_runs set state='awaiting_review',result=$1 where id=$2",[resultAsset,queued.id]);
  eq(await call('ugc_v3_approve_video',[actingOwner,inputDraft.id,queued.id]),true);
  const dto=await runtimeDto(await new V3Store().read(actingOwner,inputDraft.id));eq(dto.complete,true);eq(dto.runs[0].resolution,resolution);eq(dto.runs[0].actualDimensions,{width:meta.width,height:meta.height});
  const frozenBefore=JSON.stringify(doc),display=currentDisplayPricing(doc);eq(display.totalMicrousd,doc.pricing.totalMicrousd);
  const changed=resolution==='1080p'?'480p':'1080p',updated=await saveOwnedProject({...inputDraft,mode:'update',settings:{...inputDraft.settings,resolution:changed}});ok(updated.ok);
  eq(projectVideoResolution((await getOwnedProject(inputDraft.id)).settings.resolution),changed);eq(creativeBriefHash(await projectBrief(actingOwner,inputDraft.id)),creativeHash);
  eq(await call('ugc_v3_runtime_current',[doc.id]),false);
  const staleDto=await runtimeDto(await new V3Store().read(actingOwner,inputDraft.id));eq(staleDto.complete,false);eq(staleDto.runs[0].resolution,resolution);eq(staleDto.runs[0].actualDimensions,dto.runs[0].actualDimensions);
  for(const id of [...refs,input.storyboard.id])eq(await call('ugc_v3_artifact_current',[id]),true);
  eq((await pg.query('select document from public.ugc_v3_packages where id=$1',[doc.id])).rows[0].document,doc);
  eq((await pg.query('select intent from public.ugc_v3_runs where id=$1',[queued.id])).rows[0].intent,intent);eq(JSON.stringify(doc),frozenBefore);
  await rejects(()=>call('ugc_v3_runtime_action',[actingOwner,inputDraft.id,'source',{input,privateBindings:{}}]),'V3_RESOLUTION_BINDING_INVALID');
  const nextInput=normal(input);nextInput.resolution=changed;nextInput.package.id=randomUUID();nextInput.package.version=2;sealV3(nextInput);
  const nextTask=await call('ugc_v3_local_package_begin',[actingOwner,inputDraft.id,nextInput,{},null]);
  eq(await call('ugc_v3_local_package_begin',[actingOwner,inputDraft.id,nextInput,{},null]),nextTask);
  eq((await pg.query('select input from public.ugc_v3_sources where project_id=$1 order by revision desc limit 1',[inputDraft.id])).rows[0].input.resolution,changed);
  eq((await pg.query("select count(*) n from public.ugc_v3_tasks where project_id=$1 and kind in ('character','product','location','storyboard')",[inputDraft.id])).rows[0].n,4);
  eq((await pg.query('select count(*) n from public.ugc_v3_runs where project_id=$1',[inputDraft.id])).rows[0].n,1);
  const denied=await saveOwnedProject({...inputDraft,mode:'update',settings:{...inputDraft.settings,resolution:'4k'}});eq(denied.ok,false);
  const savedOwner=actingOwner;actingOwner=randomUUID();eq(await getOwnedProject(inputDraft.id),null);actingOwner=savedOwner;
 }
 eq(networkCalls,0);console.log(JSON.stringify({checks,realNetworkCalls:networkCalls,migrations:fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).length,scope:'Saved resolution, package/payload/authority, scoped pricing, metadata, recovery, stale output and immutable history'}));
}finally{await pg.close();globalThis.fetch=originalFetch;globalThis.sessionStorage=original;}
