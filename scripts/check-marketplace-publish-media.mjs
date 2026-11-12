// Actual publishing resolver, private route, canvas helper and poster writer;
// explicit database/storage/DOM fixtures only. No browser or network.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { typescriptLoader } from './lib/load-typescript.mjs';

let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const owner=randomUUID(),other=randomUUID(),listing=randomUUID(),project=randomUUID(),asset=randomUUID();
const final={version:'a'.repeat(64),storageKey:`users/${owner}/projects/${project}/v3/${randomUUID()}.mp4`,etag:'"final"',sizeBytes:100,sha256:'b'.repeat(64)};
let actor=owner,exists=true,archived=false,projectExists=true,approved=true,jobState='ready',headExists=true,wrongScope=false,queueFailure=false;
let sourceExists=true,currentSource=asset,fetches=0,mediaReads=0,revoke=false,replace=false;
const job={id:randomUUID(),owner_user_id:owner,project_id:project,version:final.version,state:'ready',lease_token:null,etag:'"clip"',size_bytes:20};
const sourceAsset={storage_key:`users/${owner}/projects/${project}/${asset}/source.jpg`,verified_etag:'"source"',size_bytes:50,mime_type:'image/jpeg',media_type:'image'};
const db={async rpc(name,args){
  if(name==='marketplace_owned_listing')return{data:exists&&args.p_owner_user_id===owner&&args.p_listing_id===listing?{sourceProjectId:project,status:archived?'archived':'draft'}:null,error:null};
  if(name==='marketplace_template_source')return{data:sourceExists&&args.p_owner_user_id===owner?{projectId:project,assetId:currentSource,kind:'image'}:null,error:null};
  eq(name,'project_video_preview_request');eq(args.p_owner,owner);eq(args.p_version,final.version);
  return{data:{...job,state:jobState,owner_user_id:wrongScope?other:owner},error:queueFailure?{code:'fixture'}:null};
},from(table){const clauses={};return{select(){return this;},eq(k,v){clauses[k]=v;return this;},is(){return this;},async maybeSingle(){
  if(table==='projects')return{data:projectExists&&clauses.owner_user_id===owner?{id:project}:null,error:null};
  eq(table,'project_assets');return{data:sourceExists&&clauses.owner_user_id===owner?sourceAsset:null,error:null};
}};}};
const storage=new Map();let writes=0;
const readHead=async key=>storage.get(key)?{etag:'"poster"',mimeType:'image/webp',sizeBytes:storage.get(key).length}:headExists?{etag:job.etag,mimeType:'video/mp4',sizeBytes:job.size_bytes}:null;
const load=typescriptLoader({
  '@/lib/db/server':{createDatabaseClient:()=>db},
  '@/lib/auth/read-app-user':{readAppUser:async()=>({id:actor})},
  '@/lib/projects/approved-video':{resolveApprovedProjectVideo:async(id,p)=>{mediaReads++;return approved&&id===owner&&p===project?final:null;}},
  '@/lib/storage/r2':{headR2CharacterObject:readHead,
    putR2CreatorAvatar:async(key,bytes)=>{writes++;if(storage.has(key))throw new Error('ALREADY_EXISTS');storage.set(key,bytes);return '"poster"';},
    signR2Read:async(key,etag,mime)=>({url:`https://r2.invalid/signed-private?etag=${encodeURIComponent(etag)}&mime=${mime}&key=${encodeURIComponent(key)}`}),
  },
  'next/navigation':{unstable_rethrow(){}},
},{Error,File,FormData,Response,URLSearchParams,fetch:async(url,options)=>{
  fetches++;assert.ok(String(url).startsWith('https://r2.invalid/'));eq(options.redirect,'error');eq(options.cache,'no-store');
  if(revoke)exists=false;
  const range=options.headers.Range,match=range?.match(/bytes=(\d+)-(\d+)/),size=match?Number(match[2])-Number(match[1])+1:20;
  return new Response(new Uint8Array(size),{status:range?206:200,headers:{'content-type':'video/mp4',etag:replace?'"replaced"':'"clip"','content-length':String(size),...(match?{'content-range':`bytes ${match[1]}-${match[2]}/20`}:{})}});
}});
const service=load('lib/marketplace/publish-media.ts'),route=load('app/api/templates/publish-media/route.ts');
let selected=await service.templatePublishSource(owner,listing);
eq(selected.kind,'video');eq(selected.variant,'preview');assert.ok(selected.url.startsWith('/api/templates/publish-media?'));checks++;
assert.ok(!JSON.stringify(selected).includes('users/'));checks++;
const readyUrl=selected.url;
const request=(url=readyUrl,headers={})=>new Request(`https://sceenyk.invalid${url}`,{headers});
let response=await route.GET(request());eq(response.status,200);eq(response.headers.get('location'),null);eq(response.headers.get('cache-control'),'private, no-store');eq((await response.arrayBuffer()).byteLength,20);
response=await route.GET(request(readyUrl,{Range:'bytes=4-9'}));eq(response.status,206);eq(response.headers.get('content-range'),'bytes 4-9/20');
eq((await route.GET(request(readyUrl,{Range:'bytes=20-'}))).status,416);
const previousFetches=fetches;eq((await route.GET(request(readyUrl,{Origin:'https://foreign.invalid'}))).status,403);
eq((await route.GET(request(readyUrl,{'Sec-Fetch-Site':'cross-site'}))).status,403);eq(fetches,previousFetches);
eq((await route.GET(request(readyUrl.replace(selected.version,'c'.repeat(64))))).status,404);
const beforeForeign=mediaReads;actor=other;eq((await route.GET(request())).status,404);eq(mediaReads,beforeForeign);actor=owner;
replace=true;eq((await route.GET(request())).status,404);replace=false;
revoke=true;eq((await route.GET(request())).status,404);revoke=false;exists=true;
jobState='queued';selected=await service.templatePublishSource(owner,listing);eq(selected.variant,'final');
jobState='failed';eq((await service.templatePublishSource(owner,listing)).variant,'final');
jobState='ready';headExists=false;eq((await service.templatePublishSource(owner,listing)).variant,'final');headExists=true;
queueFailure=true;eq((await service.templatePublishSource(owner,listing)).variant,'final');queueFailure=false;
wrongScope=true;await assert.rejects(()=>service.templatePublishSource(owner,listing),/TEMPLATE_PUBLISH_MEDIA_SCOPE/);checks++;wrongScope=false;
approved=false;selected=await service.templatePublishSource(owner,listing);eq(selected.kind,'image');eq(selected.variant,'source');
archived=true;eq(await service.templatePublishSource(owner,listing),null);archived=false;
projectExists=false;eq(await service.templatePublishSource(owner,listing),null);projectExists=true;
const fallback=await service.resolveTemplatePublishMedia(owner,listing,'source');currentSource=randomUUID();eq(await fallback.stillAllowed(),false);currentSource=asset;

// Run the real canvas preparation with a minimal DOM fixture. Its only media
// URL must be our authenticated same-origin stream, never signed R2 storage.
const poster=await sharp({create:{width:64,height:32,channels:3,background:'#784499'}}).webp().toBuffer();
let failVideo=false,drawnUrl,metadataReads=0;
class FakeImage{naturalWidth=64;naturalHeight=32;set src(value){this.url=value;if(value)Promise.resolve().then(()=>this.onload?.());}get src(){return this.url;}}
class FakeVideo{videoWidth=480;videoHeight=854;set src(value){this.url=value;if(value)Promise.resolve().then(()=>failVideo?this.onerror?.():this.onloadeddata?.());}get src(){return this.url;}load(){}}
const actions={
  readTemplatePublishSourceAction:async(_id,fallback)=>{metadataReads++;return{url:fallback?'/api/templates/publish-media?source':'/api/templates/publish-media?video',kind:fallback?'image':'video',variant:fallback?'source':'preview',version:'a'.repeat(64)};},
};
const sourceFile=ts.createSourceFile('capture.tsx',fs.readFileSync('components/marketplace/template-media-preview.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions=sourceFile.statements.filter(n=>ts.isFunctionDeclaration(n)&&['templatePreviewPoster','captureTemplatePoster'].includes(n.name?.text)).map(n=>n.getText(sourceFile)).join('\n');
const code=ts.transpileModule(functions,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const captured={};vm.runInNewContext(code,{exports:captured,...actions,Error,window:{Image:FakeImage,setTimeout,clearTimeout},HTMLVideoElement:FakeVideo,FormData,Blob,
  document:{createElement:kind=>kind==='video'?new FakeVideo():{getContext:()=>({drawImage:element=>{drawnUrl=element.src;}}),toBlob:callback=>callback(new Blob([poster],{type:'image/webp'}))}}});
const capture=captured.templatePreviewPoster;
let form=await capture(listing);eq(drawnUrl,'/api/templates/publish-media?video');eq(form.get('sourceVariant'),'preview');
failVideo=true;form=await capture(listing);eq(drawnUrl,'/api/templates/publish-media?source');eq(metadataReads,3);eq(form.get('sourceVariant'),'source');
// Actual bounded WebP writer preserves source checks, strips metadata and
// reuses the immutable output when a save/acknowledgement is repeated.
approved=false;
const source=await service.templatePublishSource(owner,listing);
form.set('sourceVariant','source');form.set('sourceVersion',source.version);
const prepare=load('lib/marketplace/preview-server.ts').prepareTemplatePreview;
const first=await prepare(owner,listing,form),again=await prepare(owner,listing,form);eq(first.p_preview_key,again.p_preview_key);eq(first.p_preview_etag,again.p_preview_etag);
eq(storage.size,1);eq(writes,2);assert.ok(first.p_preview_size<=524288);checks++;
const parsed=await sharp(storage.get(first.p_preview_key)).metadata();eq(parsed.format,'webp');eq(parsed.exif,undefined);
form.set('sourceVersion','f'.repeat(64));await assert.rejects(()=>prepare(owner,listing,form),/preview changed/);checks++;
console.log(JSON.stringify({checks,realNetworkCalls:0,providerCalls:0,scope:'Marketplace publishing media, fallback, immutable poster, ownership and stream validation'}));
