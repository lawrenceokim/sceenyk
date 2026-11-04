// Exercise the actual server action up to its post-write refresh, with isolated ports.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {typescriptLoader} from './lib/load-typescript.mjs';
const require=createRequire(import.meta.url),builder=require('../lib/video-generation-package/builder.ts');
let checks=0,networkCalls=0,reads=0,privateReads=0,privateFailure=false,foreign=false;
const writes=[],rpcCalls=[],oldEnv={...process.env};
const normal=v=>JSON.parse(JSON.stringify(v));
const equal=(a,b)=>{assert.deepEqual(normal(a),normal(b));checks++;};
let workspace;
const load=typescriptLoader({
  '@/lib/video-generation-package/builder':{...builder,packageDigest:(domain,value)=>builder.packageDigest(domain,normal(value)),canonicalJson:value=>builder.canonicalJson(normal(value))},
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>({id:workspace.project.owner_user_id})},
  '@/lib/auth/require-user':{requireClerkUser:async()=>{throw Error('UNEXPECTED_AUTH');}},
  '@/lib/db/server':{createDatabaseClient:()=>{throw Error('LIVE_DATABASE_FORBIDDEN');}},
  './creative-inputs':{projectBrief:async()=>({creation_type:'ugc',visual_style:'Realistic',prompt:'Offline saved video',ugc_type:'advertisement',tone:'Professional',category:'product-ad'}),referenceOriginals:async()=>[]},
  './runtime-store':{V3Store:class{
    async read(owner,project){equal(owner,workspace.project.owner_user_id);equal(project,workspace.project.project_id);if(foreign)throw Error('FRESH_V3_PROJECT_REQUIRED');if(reads++)throw Error('POST_WRITE_REFRESH');return workspace;}
    async rpc(name,args){rpcCalls.push([name,args]);return true;}
    async action(...args){writes.push(args);return true;}
  }},
  './runtime-media':{readPrivate:async(...args)=>{privateReads++;equal(args.slice(0,3),['private/saved.mp4','etag',100]);if(privateFailure)throw Error('PRIVATE_READBACK_FAILED');},signPrivate:async()=>{throw Error('UNEXPECTED_SIGN');}},
  'next/navigation':{unstable_rethrow:()=>{}},
},{Error,AbortController,structuredClone:normal,fetch:async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');}});
try{
  const {v3Input,v3Context,v3Provider}=load('scripts/final-video-v3-fixture.ts');
  const input=v3Input(),provider=v3Provider();
  const doc=load('lib/final-video-generation-v3/package.ts').buildFrozenPackage(input,provider,v3Context(input,provider),{id:input.package.id,version:1,sourceRevision:1});
  const result={storageKey:'private/saved.mp4',etag:'etag',sizeBytes:100,sha256:'d'.repeat(64)};
  workspace={project:{project_id:input.scope.projectId,owner_user_id:input.scope.ownerId},runs:[{id:input.scope.jobId,package_id:doc.id,result}],artifacts:[],packages:[{id:doc.id,document:doc}]};
  Object.assign(process.env,{UGC_V3_ENABLED:'1',UGC_V3_ACCESS_MODE:'operator',UGC_V3_OPERATOR_USER_ID:input.scope.ownerId,NODE_ENV:'development'});
  const {ownedV3Action}=load('lib/final-video-generation-v3/runtime-server.ts');
  const act=(payload={})=>ownedV3Action({action:'approve',reviewMode:'direct',projectId:input.scope.projectId,id:input.scope.jobId,...payload});
  await assert.rejects(()=>act(),/POST_WRITE_REFRESH/);checks++;
  equal(privateReads,1);equal(writes,[]);equal(rpcCalls,[['ugc_v3_approve_video',{p_owner:input.scope.ownerId,p_project:input.scope.projectId,p_id:input.scope.jobId}]]);
  // No private readback => no approval. No form fields => no fabricated passes.
  reads=0;privateFailure=true;rpcCalls.length=0;
  await assert.rejects(()=>act(),/PRIVATE_READBACK_FAILED/);checks++;equal(rpcCalls,[]);
  reads=0;privateFailure=false;foreign=true;
  await assert.rejects(()=>act(),/FRESH_V3_PROJECT_REQUIRED/);checks++;equal(rpcCalls,[]);
  reads=0;foreign=false;
  await assert.rejects(()=>act({action:'reject_delete',confirmedDeletion:false}),/V3_VIDEO_DELETE_CONFIRMATION_REQUIRED/);checks++;equal(writes,[]);
  reads=0;
  const quality=load('lib/final-video-generation-v3/runtime-contract.ts').uncheckedQuality;
  await assert.rejects(()=>act({action:'reject_delete',confirmedDeletion:true,quality}),/POST_WRITE_REFRESH/);checks++;
  equal(writes[0],[input.scope.ownerId,input.scope.projectId,'reject_delete',{id:input.scope.jobId,quality,confirmedDeletion:true}]);
  equal(networkCalls,0);console.log(JSON.stringify({checks,realNetworkCalls:networkCalls,scope:'Actual owner action, direct approval, private readback and confirmed rejection'}));
}finally{for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);}
