// Actual error boundaries, route, identity/media actions and supervisors with injected I/O.
// No environment files, live requests, queue claims or provider execution.
import assert from 'node:assert/strict';
import {typescriptLoader} from './lib/load-typescript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let checks=0,networkCalls=0,rpcCalls=0,clerkFailure=null,upsertCalls=0,databaseFailure=null,databaseStatus;
const logs=[],waits=[],oldEnv={...process.env};
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=value=>{assert.ok(value);checks++;};
const secret='sb_secret_FIXTURE_NEVER_LOG',owner='00000000-0000-4000-8000-000000000001',project='00000000-0000-4000-8000-000000000002';
const timeout={message:'TypeError: fetch failed '+secret,details:'Caused by: Error: connect ETIMEDOUT https://private.invalid/?token='+secret};
let rpcImpl=async()=>({data:[],error:null}),readImpl=async()=>{throw Error('UNEXPECTED_ROUTE_READ');},mediaImpl=async()=>{throw Error('UNEXPECTED_MEDIA_READ');};
const db={rpc:async(...args)=>{rpcCalls++;return rpcImpl(...args);},from:()=>({upsert(){upsertCalls++;return this;},select(){return this;},async single(){return{data:null,error:databaseFailure,status:databaseStatus};}})};
class MediaAccessError extends Error{}
const stubs={
 '@/lib/db/server':{createDatabaseClient:()=>db}, './worker':{runV3Task:async()=>{throw Error('WORKER_EXECUTION_FORBIDDEN');}},
 '@clerk/nextjs/server':{clerkClient:async()=>({users:{getUser:async()=>{if(clerkFailure)throw clerkFailure;return{id:'fixture-user',emailAddresses:[]};}}})},
 './require-user':{requireClerkUser:async()=>({userId:'fixture-user'})},'next/server':{connection:async()=>{}},'next/navigation':{unstable_rethrow:e=>{if(e?.digest==='NEXT_REDIRECT')throw e;}},
 '@/lib/final-video-generation-v3/runtime-server':{readOwnedV3:(...args)=>readImpl(...args),ownedV3Action:(...args)=>readImpl(...args)},
 '@/lib/media/server':{MediaAccessError,listOwnedAssets:()=>mediaImpl()},
};
const load=typescriptLoader(stubs,{Error,Response,Request,AbortController,setInterval,clearInterval,fetch:async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');},console:{info:(...args)=>logs.push(args),error:(...args)=>logs.push(args)}});
const {serviceDiagnostic,ServiceOperationError}=load('lib/diagnostics/service-failure.ts');
const {V3DatabaseError}=load('lib/final-video-generation-v3/database-errors.ts');
const {V3Store}=load('lib/final-video-generation-v3/runtime-store.ts');
const {withV3ConnectionRecovery,waitForV3Retry}=load('lib/final-video-generation-v3/connection-recovery.ts');
try {
 const {databaseRequestTimeout}=load('lib/db/timeouts.ts');
 equal(databaseRequestTimeout('https://database.test/rest/v1/rpc/ugc_v3_runtime_read'),30000);
 equal(databaseRequestTimeout(new Request('https://database.test/rest/v1/rpc/ugc_v3_runtime_read',{method:'POST'})),30000);
 for(const name of ['ugc_v3_runtime_action','ugc_v3_worker_claim','ugc_v3_merge_begin','ugc_v3_task_checkpoint','ugc_v3_clip_authorize'])equal(databaseRequestTimeout('https://database.test/rest/v1/rpc/'+name),10000);
 equal(databaseRequestTimeout('https://database.test/rest/v1/projects'),10000);
 const budgets=[],fetchSignals=[];
 const databaseLoader=typescriptLoader({'./config':{getDatabaseConfig:()=>({url:'https://database.test',secretKey:'sb_secret_FIXTURE'})}},
  {fetch:async(_input,init)=>{fetchSignals.push(init.signal);return Response.json([]);},AbortSignal:{timeout:ms=>{budgets.push(ms);return new AbortController().signal;}}});
 const client=databaseLoader('lib/db/server.ts').createDatabaseClient();
 await client.rpc('ugc_v3_runtime_read',{});await client.rpc('ugc_v3_merge_begin',{});equal(budgets,[30000,10000]);
 const callerSignal=new AbortController().signal;await client.rpc('ugc_v3_runtime_read',{}).abortSignal(callerSignal);
 equal(fetchSignals.at(-1),callerSignal);equal(budgets,[30000,10000]);
 for(const [error,status,category,retryable] of [
  [timeout,undefined,'timeout',true], [{cause:{cause:{code:'ECONNRESET'}}},undefined,'network',true],
  [{message:'fetch failed',details:'AggregateError: connect EACCES '+secret},undefined,'network_permission',false],
  [{cause:{errors:[{code:'EACCES'},{code:'EACCES'}]}},undefined,'network_permission',false],
  [{code:'CERT_HAS_EXPIRED'},undefined,'tls',false], [{code:'42501',message:secret},undefined,'permission',false],
  [{code:'PGRST202'},undefined,'schema',false], [{code:'42P01'},undefined,'schema',false],
  [{code:'23505'},503,'constraint',false], [{code:'P0001'},503,'schema',false], [{code:'XX000'},500,'unknown',false],
  [{code:'57014'},undefined,'timeout',true], [{code:'53300'},undefined,'capacity',true],
  [{},401,'authentication',false],[{},403,'permission',false],[{},429,'rate_limit',true],[{},503,'unavailable',true],
  [{message:'unknown '+secret},undefined,'unknown',false], [{code:'INVALID_PRIVILEGED_KEY'},undefined,'configuration',false],
 ]) {
  const d=serviceDiagnostic(error,'database','fixture',status);equal(d.category,category);equal(d.retryable,retryable);ok(!JSON.stringify(d).includes(secret));ok(!JSON.stringify(d).includes('https://'));
 }
 const cyclic={message:'cyclic'};cyclic.cause=cyclic;equal(serviceDiagnostic(cyclic,'database','fixture').retryable,false);
 const signal=new AbortController().signal;
 let attempts=0;
 const result=await withV3ConnectionRecovery(async()=>{attempts++;if(attempts<4)throw new V3DatabaseError(timeout,'discovery');return 'ready';},{signal,once:false,random:()=>0,wait:async ms=>waits.push(ms),report:e=>logs.push(e)});
 equal(result,'ready');equal(attempts,4);equal(waits,[3000,6000,12000]);ok(logs.some(e=>e.state==='recovered'));
 const permanent=new V3DatabaseError({code:'42501',message:secret},'discovery');attempts=0;
 await assert.rejects(()=>withV3ConnectionRecovery(async()=>{attempts++;throw permanent;},{signal,once:false,wait:async()=>{throw Error('PERMANENT_RETRY_FORBIDDEN');},report:e=>logs.push(e)}),e=>e===permanent);checks++;equal(attempts,1);
 attempts=0;await assert.rejects(()=>withV3ConnectionRecovery(async()=>{attempts++;throw new V3DatabaseError(timeout,'discovery');},{signal,once:true,wait:async()=>{throw Error('ONCE_RETRY_FORBIDDEN');},report:e=>logs.push(e)}));checks++;equal(attempts,1);
 const abort=new AbortController();attempts=0;equal(await withV3ConnectionRecovery(async()=>{attempts++;throw new V3DatabaseError(timeout,'discovery');},{signal:abort.signal,once:false,wait:async()=>abort.abort(),report:e=>logs.push(e)}),undefined);equal(attempts,1);await waitForV3Retry(60000,abort.signal);checks++;
 // V3Store never retries an RPC itself, including a mutating operation.
 for(const [error,expected] of [[timeout,'V3_DATABASE_TIMEOUT'],[{code:'42501',message:secret},'V3_DATABASE_PERMISSION_DENIED'],[{code:'PGRST202',message:secret},'V3_MERGE_SETUP_REQUIRED']]) {
  rpcImpl=async()=>({data:null,error});const before=rpcCalls;
  await assert.rejects(()=>new V3Store(db).rpc('ugc_v3_merge_begin',{}),e=>e instanceof V3DatabaseError&&e.code===expected&&!JSON.stringify(e).includes(secret));checks++;equal(rpcCalls,before+1);
 }
 rpcImpl=async()=>{throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});};
 await assert.rejects(()=>new V3Store(db).rpc('ugc_v3_task_checkpoint',{}),e=>e instanceof V3DatabaseError&&e.diagnostic.retryable);checks++;
 rpcImpl=async()=>({data:null,error:{code:'P0001',message:'V3_MERGE_INPUTS_CHANGED'}});
 await assert.rejects(()=>new V3Store(db).rpc('ugc_v3_merge_begin',{}),e=>e.message==='V3_MERGE_INPUTS_CHANGED'&&!(e instanceof ServiceOperationError));checks++;
 rpcImpl=async()=>({data:null,error:{message:'Invalid API key '+secret},status:401});
 await assert.rejects(()=>new V3Store(db).rpc('ugc_v3_worker_projects',{}),e=>e.code==='V3_DATABASE_AUTHENTICATION_FAILED'&&!e.diagnostic.retryable);checks++;
 const {mergeStorageOperation}=load('lib/final-video-generation-v3/merge-storage.ts');
 await assert.rejects(()=>mergeStorageOperation('publish',async()=>{throw new Error('V3_PRIVATE_SAVE_FAILED',{cause:{code:'ECONNRESET',message:secret}});}),e=>e.diagnostic.service==='storage'&&e.diagnostic.retryable);checks++;
 const integrity=Error('V3_MEDIA_INTEGRITY_INVALID');await assert.rejects(()=>mergeStorageOperation('source',async()=>{throw integrity;}),e=>e===integrity);checks++;
 const {v3ActionErrorMessage}=load('lib/final-video-generation-v3/reference-errors.ts');
 ok(v3ActionErrorMessage('V3_DATABASE_TIMEOUT').includes('temporarily unavailable'));ok(v3ActionErrorMessage('V3_DATABASE_AUTHENTICATION_FAILED').includes('administrator'));
 ok(v3ActionErrorMessage('CLERK_CONNECTION_UNAVAILABLE').includes('account profile'));
 const route=load('app/api/ugc/v3/route.ts');
 for(const [error,status,retryable] of [[new V3DatabaseError(timeout,'read'),503,true],[permanent,503,false],[new V3DatabaseError({code:'23505'},'write'),409,false]]) {
  readImpl=async()=>{throw error;};const response=await route.GET(new Request('http://fixture.test/api/ugc/v3?project='+project));equal(response.status,status);equal((await response.json()).retryable,retryable);equal(response.headers.get('Cache-Control'),'private, no-store');equal(response.headers.has('Retry-After'),retryable);
 }
 readImpl=async()=>{throw Error('V3_MERGE_INPUTS_CHANGED');};equal((await route.GET(new Request('http://fixture.test/api/ugc/v3?project='+project))).status,409);
 equal((await route.POST(new Request('http://fixture.test/api/ugc/v3',{method:'POST',headers:{origin:'http://foreign.test'}}))).status,403);
 const {ensureAppUser,AppUserSyncError}=load('lib/auth/ensure-app-user.ts');
 clerkFailure=new TypeError('fetch failed '+secret,{cause:{code:'ECONNRESET'}});
 let accountError;try{await ensureAppUser();}catch(e){accountError=e;}
 ok(accountError instanceof AppUserSyncError);equal(accountError.diagnostic.service,'clerk');equal(accountError.diagnostic.operation,'clerk_profile');equal(upsertCalls,0);
 // Media preserves the upstream identity cause, rather than reporting an R2 outage.
 mediaImpl=async()=>{throw accountError;};const media=await load('app/actions/media.ts').listMediaAction(project);equal(media.ok,false);equal(media.code,'UNAVAILABLE');ok(media.message.includes('account profile'));ok(!media.message.includes('Media storage'));
 clerkFailure=null;databaseFailure={code:'42501',message:secret};
 await assert.rejects(ensureAppUser,e=>e instanceof AppUserSyncError&&e.diagnostic.service==='database'&&e.diagnostic.operation==='database_upsert'&&!e.diagnostic.retryable);checks++;equal(upsertCalls,1);
 databaseStatus=401;databaseFailure={message:'Invalid API key '+secret};
 await assert.rejects(ensureAppUser,e=>e.diagnostic.category==='authentication'&&!e.diagnostic.retryable);checks++;
 // Actual local runner: fail discovery twice, recover, then shut down without any task execution.
 Object.assign(process.env,{NODE_ENV:'development',UGC_V3_ENABLED:'1',UGC_V3_ACCESS_MODE:'owned',UGC_V3_HIGGSFIELD_ENABLED:'0'});delete process.env.RENDER;delete process.env.VERCEL;delete process.env.SCEENYK_LOCAL_JOBS_ONLY;
 stubs['./connection-recovery']={withV3ConnectionRecovery:(action,options)=>withV3ConnectionRecovery(action,{...options,random:()=>0,wait:async ms=>waits.push(ms),report:e=>logs.push(e)})};
 attempts=0;rpcImpl=async name=>{equal(name,'ugc_v3_worker_projects');attempts++;if(attempts<3)return{data:null,error:timeout};process.emit('SIGTERM');return{data:[],error:null};};
 await load('lib/final-video-generation-v3/local-worker.ts').runLocalV3Worker([]);equal(attempts,3);ok(logs.some(e=>Array.isArray(e)&&e[0]==='UGC_LOCAL_V3_WORKER_READY'));
 attempts=0;rpcImpl=async()=>{attempts++;return{data:null,error:timeout};};
 await assert.rejects(()=>load('lib/final-video-generation-v3/local-worker.ts').runLocalV3Worker(['--once']),e=>e instanceof V3DatabaseError);checks++;equal(attempts,1);
 const recoveryDir=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-v3-connection-test-'));
 try {
  Object.assign(process.env,{UGC_V3_WORKER_ENABLED:'1',UGC_V3_RECOVERY_DIR:recoveryDir});attempts=0;
  rpcImpl=async()=>{attempts++;if(attempts<3)return{data:null,error:timeout};process.emit('SIGTERM');return{data:[],error:null};};
  await load('lib/final-video-generation-v3/background-worker.ts').runV3BackgroundWorker([]);equal(attempts,3);ok(fs.existsSync(path.join(recoveryDir,'worker-heartbeat.json')));
 } finally { if(path.dirname(recoveryDir)!==path.resolve(os.tmpdir())||!path.basename(recoveryDir).startsWith('sceenyk-v3-connection-test-'))throw Error('FIXTURE_SCOPE');fs.rmSync(recoveryDir,{recursive:true,force:true}); }
 // The same iteration recovery is used by supervised discovery; --once never retries.
 const {processV3QueueBatch}=load('lib/final-video-generation-v3/background-worker.ts');
 rpcImpl=async()=>({data:[{project_id:project,owner_user_id:owner}],error:null});const pausedProjects=new Set();let work=0;
 const batchOptions={after:null,ownerId:null,concurrency:1,signal,pausedProjects};
 const processProject=async()=>{work++;throw permanent;};
 const first=await processV3QueueBatch(new V3Store(db),batchOptions,processProject);equal(first.failures[0].diagnostic.retryable,false);
 await processV3QueueBatch(new V3Store(db),batchOptions,processProject);equal(work,1);ok(pausedProjects.has(project));
 const serialized=JSON.stringify(logs);ok(!serialized.includes(secret));ok(!serialized.includes('private.invalid'));
 equal(networkCalls,0);console.info(JSON.stringify({connectionRecoveryChecks:checks,realNetworkCalls:networkCalls,paidRequests:0}));
} finally {for(const name of Object.keys(process.env))if(!(name in oldEnv))delete process.env[name];Object.assign(process.env,oldEnv);}
