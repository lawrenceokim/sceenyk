// Real V3 action/Director task and React presentation; DB, storage and OpenAI are fixtures.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {createRequire} from 'node:module';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {V3StoryboardContent} from '../components/creation/v3-storyboard-content.tsx';
const nativeBuilder=createRequire(import.meta.url)('../lib/video-generation-package/builder.ts');

let checks=0, networkCalls=0, providerCalls=0, responseStoryboard, failPublication=false;
const normal=value=>JSON.parse(JSON.stringify(value));
const equal=(a,b)=>{assert.deepEqual(normal(a),normal(b));checks++;};
const ok=value=>{assert.ok(value);checks++;};
const reject=async(fn,code)=>{await assert.rejects(fn,new RegExp(code));checks++;};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const owner=randomUUID(), project=randomUUID(), originalCharacter=randomUUID(), originalProduct=randomUUID();
let brief={id:project,title:'The quiet reveal',prompt:'Narration only: a quiet reveal with room for a reaction.',duration:'10',aspect_ratio:'9:16',visual_style:'Realistic',tone:'Professional',category:'product-ad',ugc_type:'advertisement',creation_type:'ugc'};
let optionalProduct=false, workspace, context;
const spool=new Map(), objects=new Map(), readbacks=[], requests=[], checkpoints=[];
const db={from(table){
  assert.ok(['projects','project_assets'].includes(table));
  const query={select(){return this;},eq(){return this;},is(){return this;},in(){return this;},
    maybeSingle:async()=>({data:brief,error:null}),
    then(resolve,reject){return Promise.resolve({data:[{id:originalCharacter,studio_role:'character',reference_name:'Ari'},...(!optionalProduct?[{id:originalProduct,studio_role:'product',reference_name:'Ceramic cup'}]:[])],error:null}).then(resolve,reject);}};
  return query;
}};
const media={bytesHash:hash,
  readPrivate:async(key,etag,size,signal,digest)=>{const bytes=objects.get(key);equal(bytes.length,size);equal(hash(bytes),digest);readbacks.push(key);return bytes;},
  signPrivate:async asset=>({url:`https://fixture.invalid/${asset.id}`,expiresAt:'2099-01-01T00:00:00Z'}),
  readSpool:async(id,name)=>spool.get(`${id}:${name}`)??null,
  saveSpool:async(id,name,bytes)=>spool.set(`${id}:${name}`,bytes)};
class FixtureStore {
  async read(){return normal(workspace);}
  async rpc(name,args){
    if(name==='ugc_v3_worker_claim'){
      const task=workspace.tasks.find(t=>t.status==='queued');if(!task)return null;
      task.status='running';task.lease_token=randomUUID();return normal(task);
    }
    if(name==='ugc_v3_location_input_current')return true;
    if(name==='ugc_v3_local_package_begin'){workspace.source={revision:1,input:args.p_input,private_bindings:args.p_bindings,current:true,created_at:new Date().toISOString()};return true;}
    throw new Error(`Unexpected fixture RPC ${name}`);
  }
  async action(user,p,action,payload){
    equal(user,owner);equal(p,project);
    if(action==='enqueue'){
      workspace.tasks.push({id:randomUUID(),project_id:project,kind:payload.kind,input:payload.input,status:'queued',lease_token:null,lease_until:null,provider_started:false,output:null,error_code:null,created_at:new Date().toISOString()});return;
    }
    if(action==='review_artifact'){
      const a=workspace.artifacts.find(a=>a.id===payload.id);assert.ok(a);
      if(payload.decision==='approve')a.approved_at=new Date().toISOString();else a.rejected_at=new Date().toISOString();return;
    }
    throw new Error(`Unexpected fixture action ${action}`);
  }
  async checkpoint(task,action,payload={}){
    checkpoints.push(action);
    const current=workspace.tasks.find(t=>t.id===task.id);
    if(action==='intent'){current.provider_started=true;return;}
    if(action==='artifact'){
      ok(spool.has(`${task.id}:openai-response.json`));
      if(failPublication){failPublication=false;throw new Error('FIXTURE_PUBLICATION_FAILURE');}
      workspace.artifacts.push({id:task.id,kind:task.kind,version:1,document:payload.document,approved_at:null,rejected_at:null});current.status='done';return;
    }
    current.status=action==='unknown'?'reconciliation_required':'failed';current.error_code=payload.code;
  }
}
class FixtureOpenAI {
  constructor(config){equal(config.maxRetries,0);}
  responses={create:async(body)=>{
    providerCalls++;requests.push(normal(body));equal(body.text.format.name,'director_storyboard_v3');
    equal(checkpoints.at(-1),'intent');
    return {_request_id:'req_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(responseStoryboard)}]}]};
  }};
  images={edit(){throw new Error('IMAGE_GENERATION_FORBIDDEN');}};
}
const load=typescriptLoader({
  '@/lib/video-generation-package/builder':{...nativeBuilder,packageDigest:(kind,value)=>nativeBuilder.packageDigest(kind,normal(value)),canonicalJson:value=>nativeBuilder.canonicalJson(normal(value))},
  '@/lib/db/server':{createDatabaseClient:()=>db},'./runtime-media':media,'./runtime-store':{V3Store:FixtureStore},
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>({id:owner})},
  './join':{joinV3Segments:async()=>{throw new Error('JOIN_FORBIDDEN');}},
  openai:{__esModule:true,default:FixtureOpenAI,toFile:async()=>{throw new Error('IMAGE_GENERATION_FORBIDDEN');}},
  './runtime-config':{assertV3Access(){},v3UserAllowed:()=>true,v3OpenAIConfig:()=>({apiKey:'fixture-only',directorModel:'fixture-director'}),v3TransportConfig:()=>({enabled:false})},
}, {Error,structuredClone:normal,fetch:async()=>{networkCalls++;throw new Error('NETWORK_FORBIDDEN');}});
const {generationContext}=load('lib/final-video-generation-v3/generation-context.ts');
const {creativeBriefHash}=load('lib/final-video-generation-v3/creative-inputs.ts');
const {locationInstructionHash}=load('lib/final-video-generation-v3/location-contract.ts');
const {ownedV3Action}=load('lib/final-video-generation-v3/runtime-server.ts');
const {runV3Task}=load('lib/final-video-generation-v3/worker.ts');
const {v3Input}=load('scripts/final-video-v3-fixture.ts');
const act=(action,payload={})=>ownedV3Action({action,projectId:project,...payload});
const tick=()=>runV3Task(project,owner,new FixtureStore());
function fixture(withoutProduct=false){
  optionalProduct=withoutProduct;objects.clear();spool.clear();context=generationContext(brief);
  workspace={project:{project_id:project,owner_user_id:owner,logical_job_id:randomUUID()},source:null,packages:[],tasks:[],artifacts:[],quotes:[],runtimeAuthorizations:[],runs:[],referenceCleanupPolicy:false,referenceDeletions:[],referenceDiagnostics:[]};
  for(const role of withoutProduct?['character','location']:['character','product','location']){
    const id=randomUUID(),bytes=Buffer.from(`distinct approved ${role} sheet bytes`),storageKey=`private-fixture/${id}`;
    objects.set(storageKey,bytes);
    const input={generationContext:context,briefHash:creativeBriefHash(brief),references:role==='location'?workspace.artifacts.map(a=>a.id):[],names:{character:'Ari',product:withoutProduct?'':'Ceramic cup'}};
    const document={input,original:{id:role==='character'?originalCharacter:originalProduct,sha256:hash(bytes)},asset:{id,storageKey,etag:'fixture-etag',sha256:hash(bytes),sizeBytes:bytes.length,mimeType:'image/png',width:1024,height:1024,durationMs:0,hasAudio:false}};
    if(role==='location'){
      input.locationDirector={version:'location-prompt-v2'};
      const instruction={name:'Quiet studio',prompt:'A broad working surface with the same north-facing window in every view.'};
      document.location={schema:'location-prompt-v2',phase:'complete',requests:[],instruction,instructionHash:locationInstructionHash(instruction),sheetId:id,recoveryOnly:false,errorCode:null};
    }
    workspace.artifacts.push({id,kind:role,version:1,document,approved_at:new Date().toISOString(),rejected_at:null});
  }
  responseStoryboard=normal(v3Input([5000,5000]).storyboardContent);responseStoryboard.tone='Professional';
}
for(const withoutProduct of [false,true]){
  fixture(withoutProduct);const before=normal(workspace.artifacts),start=providerCalls;
  await act('storyboard');equal(providerCalls,start);equal(workspace.tasks.length,1);
  equal(workspace.tasks[0].input.directorVersion,'approved-storyboard-v1');
  await tick();equal(providerCalls,start+1);equal(workspace.tasks[0].status,'done');
  const body=requests.at(-1),content=body.input[0].content,images=content.filter(c=>c.type==='input_image');
  equal(images.length,withoutProduct?2:3);
  for(const [i,ref] of before.entries())equal(images[i].image_url,`data:image/png;base64,${objects.get(ref.document.asset.storageKey).toString('base64')}`);
  for(const value of [brief.prompt,'"type":"advertisement"','"creationType":"ugc"','"durationMs":10000','"aspectRatio":"9:16"','"visualStyle":"Realistic"','north-facing window'])ok(content[0].text.includes(value));
  const storyboard=workspace.artifacts.find(a=>a.kind==='storyboard');equal(storyboard.approved_at,null);
  await reject(()=>act('build_package'),'APPROVE_STORYBOARD_FIRST');
  await reject(()=>act('storyboard'),'REVIEW_EXISTING_STORYBOARD_FIRST');
  equal(workspace.artifacts.filter(a=>a.kind!=='storyboard'),before);
  await act('review_artifact',{id:storyboard.id,decision:'approve'});equal(providerCalls,start+1);
  await act('build_package');equal(workspace.source.input.direction.includes('"promptCompiler":"approved-storyboard-v2"'),true);
  equal(workspace.source.input.storyboardContent,responseStoryboard);equal(workspace.source.input.references.length,images.length);
  equal(providerCalls,start+1);equal(workspace.runs,[]);equal(workspace.runtimeAuthorizations,[]);
}
// Publication recovery reuses the same saved response, never another Director call.
fixture();await act('storyboard');failPublication=true;const start=providerCalls;await tick();equal(providerCalls,start+1);
equal(workspace.tasks[0].status,'reconciliation_required');workspace.tasks[0].status='queued';await tick();equal(providerCalls,start+1);equal(workspace.tasks[0].status,'done');
// Currentness, malformed timing, explicit rejection and missing approval fences.
fixture();await act('storyboard');workspace.tasks[0].input.references.reverse();await tick();equal(workspace.tasks[0].error_code,'V3_CREATIVE_INPUT_STALE');
fixture();await act('storyboard');brief={...brief,creation_type:'freestyle'};await tick();equal(workspace.tasks[0].error_code,'APPROVE_CURRENT_REFERENCES_FIRST');brief={...brief,creation_type:'ugc'};
fixture();await act('storyboard');responseStoryboard.scenes[1].startMs+=1000;await tick();equal(workspace.tasks[0].error_code,'V3_DIRECTOR_TIMING_INVALID');ok(!workspace.artifacts.some(a=>a.kind==='storyboard'));
fixture();workspace.artifacts[0].approved_at=null;await reject(()=>act('storyboard'),'APPROVAL_REQUIRED');
fixture();await act('storyboard');await tick();const rejected=workspace.artifacts.find(a=>a.kind==='storyboard');const count=providerCalls;
await act('review_artifact',{id:rejected.id,decision:'reject'});equal(providerCalls,count);await reject(()=>act('build_package'),'APPROVE_STORYBOARD_FIRST');
await act('storyboard');equal(providerCalls,count);equal(workspace.tasks.length,2);

// Actual React markup exposes creative details without technical object fields.
const board=normal(v3Input([5000,5000]).storyboardContent);board.scenes[0].speech=[{startMs:1000,endMs:3000,speaker:'narration',text:'A quiet moment.',delivery:{pace:'slow',energy:'calm',tone:'warm',emphasis:'none',style:'natural'},deliveryNote:'Leave a breath.'}];
board.scenes[0].audio.effects={requirement:'required',description:'One ceramic tap',assetId:randomUUID()};
const markup=renderToStaticMarkup(createElement(V3StoryboardContent,{storyboard:board}));
for(const value of ['10s','2 shots','Shot 1','5s','Present the cup','Camera','Actions &amp; performance','Narration','A quiet moment.','Leave a breath.','One ceramic tap','Transition &amp; continuity','focus-visible:ring-ring','bg-primary/10'])ok(markup.includes(value));
for(const value of ['assetId','startMs','endMs',board.scenes[0].id,board.scenes[0].audio.effects.assetId])ok(!markup.includes(value));
equal((markup.match(/<details/g)??[]).length,board.scenes.length+1);ok(!markup.includes('<button'));equal(networkCalls,0);
console.log(`${checks} V3 Storyboard action/worker/recovery/presentation fixture checks passed; ${providerCalls} mocked Director calls, zero real network calls.`);
