// Actual deletion/spool helpers; S3 and HEAD are fixtures. Files are disposable local test files only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {typescriptLoader} from './lib/load-typescript.mjs';
let checks=0,sends=0,failDelete=false,leaveObject=false,headFailure=null;
const heads=new Map(),owner=randomUUID(),project=randomUUID(),id=randomUUID();
const asset={id,storageKey:`users/${owner}/projects/${project}/v3/${id}.png`,etag:'fixture-etag',mimeType:'image/png'};
const locationSourceTask=randomUUID(),locationChildren=new Map(['plan','sheet','check','repair','recheck'].map(key=>[key,randomUUID()]));
const load=typescriptLoader({
  './location-contract':{locationRequestId:(task,key)=>{assert.equal(task,locationSourceTask);return locationChildren.get(key);}},
  './generation-context':{latestArtifact:()=>null},
  '@/lib/storage/config':{getStorageConfig:()=>({bucket:'fixture-bucket',endpoint:'https://storage.invalid',accessKeyId:'fixture',secretAccessKey:'fixture'})},
  '@/lib/storage/r2':{headR2CharacterObject:async key=>{if(headFailure)throw headFailure;return heads.get(key)??null;}},
  '@/lib/final-video-generation/media':{measure:async()=>{throw new Error('VIDEO_FORBIDDEN');}},
  '@aws-sdk/client-s3':{
    DeleteObjectCommand:class{constructor(input){this.input=input;}},
    S3Client:class{async send(command){sends++;assert.equal(command.input.IfMatch,asset.etag);assert.equal(command.input.Key,asset.storageKey);if(failDelete)throw new Error('FIXTURE_DELETE_FAILED');if(!leaveObject)heads.delete(command.input.Key);}},
  },
},{Error,fetch:async()=>{throw new Error('NETWORK_FORBIDDEN');}});
const {deleteReferencePrivate,purgeReferenceSpool,saveSpool,readSpool,writeReferenceDiagnostics}=load('lib/final-video-generation-v3/runtime-media.ts');
const reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
for(const storageKey of [`users/${owner}/projects/${project}/uploads/${id}.png`,`users/${randomUUID()}/projects/${project}/v3/${id}.png`,asset.storageKey.replace('.png','.mp4')])
  await reject(()=>deleteReferencePrivate(owner,project,{...asset,storageKey},AbortSignal.timeout(1000)),/V3_REFERENCE_DELETE_SCOPE/);
assert.equal(sends,0);checks++;
headFailure=new Error('CHARACTER_STORAGE_METADATA_FAILED',{cause:Object.assign(new Error('secret must never appear'),{name:'AccessDenied',$metadata:{httpStatusCode:403}})});
await reject(()=>deleteReferencePrivate(owner,project,asset,AbortSignal.timeout(1000)),/^Error: V3_STORAGE_DELETE_HEAD_HTTP_403_ACCESSDENIED$/);
assert.equal(sends,0);checks++;headFailure=null;
heads.set(asset.storageKey,{etag:'another-etag'});
await reject(()=>deleteReferencePrivate(owner,project,asset,AbortSignal.timeout(1000)),/V3_DELETE_ASSET_CHANGED/);
heads.set(asset.storageKey,{etag:asset.etag});failDelete=true;
await reject(()=>deleteReferencePrivate(owner,project,asset,AbortSignal.timeout(1000)),/V3_STORAGE_DELETE_DELETE_ERROR/);
assert.ok(heads.has(asset.storageKey));checks++;
failDelete=false;leaveObject=true;
await reject(()=>deleteReferencePrivate(owner,project,asset,AbortSignal.timeout(1000)),/V3_DELETE_UNCONFIRMED/);
leaveObject=false;
await deleteReferencePrivate(owner,project,asset,AbortSignal.timeout(1000));assert.equal(heads.has(asset.storageKey),false);checks++;
const sendsBefore=sends;await deleteReferencePrivate(owner,project,asset,AbortSignal.timeout(1000));assert.equal(sends,sendsBefore);checks++;
const root=await fs.mkdtemp(path.join(os.tmpdir(),'sceenyk-reference-spool-')),originalDir=process.env.UGC_V3_RECOVERY_DIR;
process.env.UGC_V3_RECOVERY_DIR=root;
const task=randomUUID(),source=path.join(root,'uploaded-source.png');
try {
  await fs.writeFile(source,'original source');
  assert.equal(await readSpool(task,'image.png'),null);checks++;
  await reject(()=>fs.stat(path.join(root,task)),/ENOENT/);
  await saveSpool(task,'image.png',Buffer.from('generated image'));
  await saveSpool(task,'openai-response.json',Buffer.from('private generated response'));
  await writeReferenceDiagnostics(task,{stage:'storage',httpStatus:200});
  await writeReferenceDiagnostics(task,{stage:'complete',httpStatus:200});
  assert.equal(JSON.parse((await readSpool(task,'reference-diagnostics.json')).toString()).stage,'complete');checks++;
  await fs.writeFile(path.join(root,task,'unrelated.txt'),'unrelated');
  await reject(()=>purgeReferenceSpool(task),/V3_REFERENCE_DELETE_SCOPE/);
  assert.equal(await fs.readFile(path.join(root,task,'image.png'),'utf8'),'generated image');checks++;
  await fs.unlink(path.join(root,task,'unrelated.txt'));
  await purgeReferenceSpool(task);
  await reject(()=>fs.stat(path.join(root,task)),/ENOENT/);
  assert.equal(await fs.readFile(source,'utf8'),'original source');checks++;
  await purgeReferenceSpool(task);checks++; // Missing output is an idempotent cleanup retry.
  // The actual retention actor deletes every Location PNG/base64 response, including legacy repair copies.
  const fullAsset={...asset,sha256:'a'.repeat(64),sizeBytes:100,width:1024,height:1024,durationMs:0,hasAudio:false};
  const approvedTask=randomUUID();await saveSpool(approvedTask,'image.png',Buffer.from('approved reference stays'));
  for(const child of [locationSourceTask,...locationChildren.values()]){
    await saveSpool(child,'image.png',Buffer.from('unapproved image'));
    await saveSpool(child,'openai-response.json',Buffer.from('{"b64_json":"aW1hZ2U="}'));
  }
  heads.set(asset.storageKey,{etag:asset.etag});const finished=[];
  const store={rpc:async(name,args)=>{
    if(name==='ugc_v3_discard_reference_prepare')return{id,kind:'location',state:'prepared',lease_token:randomUUID(),source_task_id:locationSourceTask,asset:fullAsset};
    assert.equal(name,'ugc_v3_discard_reference_finish');finished.push(args.p_error);return args.p_error===null;
  }};
  const {discardReference}=load('lib/final-video-generation-v3/reference-retention.ts');
  const problem=path.join(root,locationChildren.get('sheet'),'unrelated.txt');await fs.writeFile(problem,'preserve unknown file');
  await reject(()=>discardReference(store,owner,project,{id,version:1},AbortSignal.timeout(1000),true),/V3_REFERENCE_DISCARD_LOCAL_FAILED/);
  assert.equal(finished.at(-1),'V3_REFERENCE_DISCARD_LOCAL_FAILED');checks++;
  await fs.unlink(problem);
  await discardReference(store,owner,project,{id,version:1},AbortSignal.timeout(1000),true);
  assert.equal(finished.at(-1),null);checks++;
  for(const child of [locationSourceTask,...locationChildren.values()]){assert.equal(await readSpool(child,'image.png'),null);assert.equal(await readSpool(child,'openai-response.json'),null);checks+=2;}
  assert.equal(await fs.readFile(source,'utf8'),'original source');checks++;
  assert.equal((await readSpool(approvedTask,'image.png')).toString(),'approved reference stays');checks++;
  await purgeReferenceSpool(approvedTask);
} finally {
  await fs.unlink(source);await fs.rmdir(root);
  if(originalDir===undefined)delete process.env.UGC_V3_RECOVERY_DIR;else process.env.UGC_V3_RECOVERY_DIR=originalDir;
}
console.info(`${checks} real reference storage/spool helper checks passed; zero network calls.`);
