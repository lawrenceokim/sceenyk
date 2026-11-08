// Actual M6 hook, status endpoint and owner boundary with deterministic I/O.
// No browser, environment files, provider requests or production writes.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { typescriptLoader } from './lib/load-typescript.mjs';
const require = createRequire(import.meta.url);
let checks = 0, realNetworkCalls = 0;
const equal = (a,b) => { assert.deepEqual(a,b); checks++; }, ok = v => { assert.ok(v); checks++; };
const owner='00000000-0000-4000-8000-000000000001',project='00000000-0000-4000-8000-000000000002',pkg='00000000-0000-4000-8000-000000000003',id='00000000-0000-4000-8000-000000000004';
const hash='a'.repeat(64), manifest='b'.repeat(64);
let slots=[],cursor=0,pendingEffects=[],dirty=false;
const same=(a,b)=>a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]));
globalThis.__finalHooks={
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}];},
 useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
 useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,fn};return slots[i].fn;},
 useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const prior=slots[i];slots[i]={deps};pendingEffects.push(()=>{prior?.cleanup?.();slots[i].cleanup=fn();});}},
};
const bundle=await build({absWorkingDir:process.cwd(),stdin:{contents:'export {useV3FinalOperation} from "./components/creation/use-v3-final-operation"; export * from "./lib/final-video-generation-v3/final-operation";',resolveDir:process.cwd(),loader:'ts'},tsconfig:resolve('tsconfig.json'),bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'hooks',setup(builder){
 builder.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
 builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'const h=globalThis.__finalHooks;export const useState=h.useState,useRef=h.useRef,useEffect=h.useEffect,useCallback=h.useCallback;'}));
}}]});
const bundled={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,bundled,bundled.exports);
const {useV3FinalOperation:runFinalHook,restoredFinalIntent,finalOperationFinished,V3StatusReadError}=bundled.exports;
const originals={fetch:globalThis.fetch,localStorage:globalThis.localStorage,window:globalThis.window,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,Date:globalThis.Date};
let now=originals.Date.now(),timers=new Map(),sequence=0,listeners=new Map(),storage=new Map(),calls=[],workspace,hook,refreshCalls=0,refreshFails=false,refreshFailure=null,renderProject=project,enabled=true;
class ClockDate extends originals.Date{static now(){return now;}}
globalThis.Date=ClockDate;
globalThis.setTimeout=(fn,delay=0)=>{const key=++sequence;timers.set(key,{fn,at:now+delay});return key;};
globalThis.clearTimeout=key=>timers.delete(key);
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
globalThis.window={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
const emptyStatus={taskId:null,status:null,stage:null,errorCode:null,resultId:null,approved:false,rejected:false,deletionStatus:null};
let status=emptyStatus,postImpl=async()=>Response.json({ok:true,receipt:{accepted:true}}),getImpl=async()=>Response.json({ok:true,operation:status});
const ready=()=>({projectId:project,multiClip:{packageId:pkg,packageHash:hash,merge:{manifestHash:manifest,taskId:null,status:null,resultId:null,deleting:false}},runs:[],tasks:[]});
const saved=()=>({...ready(),multiClip:{...ready().multiClip,merge:{...ready().multiClip.merge,taskId:id,status:status.status,resultId:status.resultId}},runs:status.resultId?[{id,segmentId:'joined',state:status.approved?'approved':status.rejected?'deleted':'awaiting_review',current:true}]:[],complete:status.approved});
const refresh=async()=>{refreshCalls++;if(refreshFailure)throw refreshFailure;if(refreshFails)return null;workspace=saved();return workspace;};
function render(){let n=0;do{dirty=false;cursor=0;pendingEffects=[];hook=runFinalHook(renderProject,workspace,refresh,enabled);const pending=pendingEffects;pendingEffects=[];pending.forEach(effect=>effect());assert.ok(++n<25,'No effect loop');}while(dirty);return hook;}
function unmount(){for(const slot of slots)slot?.cleanup?.();slots=[];pendingEffects=[];timers.clear();}
async function advance(ms=0){now+=ms;for(let n=0;n<30;n++){const entry=[...timers].find(([,timer])=>timer.at<=now);if(!entry)break;timers.delete(entry[0]);await entry[1].fn();await Promise.resolve();render();assert.ok(n<29,'No timer loop');}}
function reset(){unmount();storage.clear();calls=[];renderProject=project;workspace=ready();status=emptyStatus;refreshCalls=0;refreshFails=false;refreshFailure=null;enabled=true;postImpl=async()=>Response.json({ok:true,receipt:{accepted:true}});getImpl=async()=>Response.json({ok:true,operation:status});render();}
globalThis.fetch=async(url,options={})=>{calls.push({url,options});return options.method==='POST'?postImpl():getImpl();};
try{
 reset();await advance();
 postImpl=async()=>Response.json({ok:false,code:'V3_DATABASE_TIMEOUT',retryable:true},{status:503});
 const first=hook.submit('merge',{packageId:pkg,packageHash:hash,manifestHash:manifest});equal(await hook.submit('merge',{}),false);await first;render();
 equal(calls.filter(c=>c.options.method==='POST').length,1);ok(hook.presentation.active);ok(hook.presentation.message.includes('Checking'));equal(hook.presentation.error,'');ok(storage.size===1);
 status={...emptyStatus,taskId:id,status:'running',stage:'merging'};await advance();equal(refreshCalls,0);ok(hook.presentation.active);equal(hook.presentation.message,'Merging videos...');
 // Refresh/reopen recovers an uncertain request without another POST.
 unmount();render();await advance();ok(hook.presentation.blocked);equal(calls.filter(c=>c.options.method==='POST').length,1);
 status={...status,status:'done',resultId:id};await advance(3000);equal(refreshCalls,1);equal(hook.presentation.active,false);equal(storage.size,0);equal(workspace.complete,false);
 // Approval can commit after a lost acknowledgement; reconcile, never repeat it.
 postImpl=async()=>{throw new TypeError('fetch failed');};await hook.submit('approve',{id,reviewMode:'direct'});render();ok(hook.presentation.message.includes('approval'));equal(hook.presentation.error,'');
 status={...status,approved:true};await advance();equal(workspace.complete,true);equal(hook.presentation.active,false);equal(storage.size,0);equal(calls.filter(c=>c.options.method==='POST').length,2);
 // A genuine SQL/permission failure is actionable, not silently retried.
 reset();await advance();postImpl=async()=>Response.json({ok:false,code:'V3_DATABASE_PERMISSION_DENIED',retryable:false},{status:503});await hook.submit('merge',{});render();equal(hook.presentation.active,false);ok(hook.presentation.error.includes('administrator'));equal(storage.size,0);
 // Temporary status failures retain progress; permanent failures pause, manual check resumes reads only.
 reset();await advance();await hook.submit('merge',{});render();getImpl=async()=>Response.json({ok:false,code:'V3_DATABASE_TIMEOUT',retryable:true},{status:503});await advance();ok(hook.presentation.active);equal(hook.presentation.error,'');ok(hook.presentation.detail.includes('Connection'));
 getImpl=async()=>Response.json({ok:false,code:'V3_DATABASE_PERMISSION_DENIED',retryable:false},{status:503});await advance(5000);equal(hook.presentation.active,false);ok(hook.presentation.blocked);ok(hook.presentation.error.includes('administrator'));
 getImpl=async()=>Response.json({ok:true,operation:{...emptyStatus,taskId:id,status:'running'}});hook.presentation.checkStatus();render();await advance();ok(hook.presentation.active);equal(calls.filter(c=>c.options.method==='POST').length,1);
 // A terminal operation is not lost just because refreshing the full workspace fails.
 status={...emptyStatus,taskId:id,status:'done',resultId:id};getImpl=async()=>Response.json({ok:true,operation:status});refreshFails=true;await advance(3000);ok(hook.presentation.active);equal(hook.presentation.message,'Refreshing final status...');ok(storage.size===1);refreshFails=false;await advance(10000);equal(hook.presentation.active,false);equal(storage.size,0);
 // Saved worker progress also polls without a browser intent.
 reset();workspace={...ready(),multiClip:{...ready().multiClip,merge:{...ready().multiClip.merge,status:'running',taskId:id}}};status={...emptyStatus,taskId:id,status:'running'};render();await advance();ok(hook.presentation.active);equal(calls.filter(c=>c.options.method==='POST').length,0);status={...status,status:'done',resultId:id};await advance(3000);equal(hook.presentation.active,false);
 // Idle renders and their effects do not create a zero-delay read/re-render loop.
 reset();for(let i=0;i<25;i++){render();await advance();}equal(calls.length,0);equal(timers.size,0);
 // Closing Workflow or hiding the page cancels timers; reopening observes saved work.
 await hook.submit('merge',{});render();status={...emptyStatus,taskId:id,status:'running'};await advance();const openReads=calls.length;enabled=false;render();await advance(60000);equal(calls.length,openReads);ok(storage.size===1);enabled=true;render();await advance();ok(calls.length>openReads);ok(hook.presentation.active);
 // Leaving during a pending read aborts it and discards its late terminal response.
 let finishRead;getImpl=()=>new Promise(resolveRead=>{finishRead=resolveRead;});const pendingRead=advance(3000);await Promise.resolve();const reading=calls.at(-1);enabled=false;render();equal(reading.options.signal.aborted,true);finishRead(Response.json({ok:true,operation:{...status,status:'done',resultId:id}}));await pendingRead;equal(refreshCalls,0);ok(storage.size===1);
 // Terminal merge failure stops polling, preserving source work and enabling explicit retry.
 reset();await advance();await hook.submit('merge',{});render();status={...emptyStatus,taskId:id,status:'failed',errorCode:'V3_MERGE_SOURCE_INVALID'};await advance();equal(hook.presentation.active,false);const failedReads=calls.length;await advance(60000);equal(calls.length,failedReads);
 // A permanent full-refresh error stops immediately, even while the compact reader works.
 reset();await advance();await hook.submit('merge',{});render();status={...emptyStatus,taskId:id,status:'done',resultId:id};refreshFailure=new V3StatusReadError('V3_DATABASE_PERMISSION_DENIED',false);await advance();equal(refreshCalls,1);equal(hook.presentation.active,false);ok(hook.presentation.error.includes('administrator'));const permanentReads=calls.length;await advance(60000);equal(calls.length,permanentReads);ok(storage.size===1);
 // Repeated temporary final refresh errors are bounded separately from successful metadata reads.
 reset();await advance();await hook.submit('merge',{});render();status={...emptyStatus,taskId:id,status:'done',resultId:id};refreshFailure=new V3StatusReadError('V3_DATABASE_TIMEOUT',true);for(let i=0;i<6;i++)await advance(30000);equal(refreshCalls,6);equal(hook.presentation.active,false);ok(hook.presentation.error.includes('could not be refreshed'));const exhaustedReads=calls.length;await advance(60000);equal(calls.length,exhaustedReads);
 ok(calls.every(c=>c.options.redirect==='error'));
 // Stale local intent never locks a changed package or grants authority.
 const intent={projectId:project,packageId:pkg,packageHash:hash,manifestHash:manifest,action:'merge',id:null,accepted:false,startedAt:now,baselineTaskId:id,baselineStatus:'failed'};
 equal(finalOperationFinished(intent,{...emptyStatus,taskId:id,status:'failed'}),false);equal(finalOperationFinished({...intent,accepted:true},{...emptyStatus,taskId:id,status:'failed'}),true);
 equal(finalOperationFinished({...intent,action:'approve',id},{...emptyStatus,taskId:owner,resultId:null,status:'running'}),true);
 // An unchanged previous failure is not confirmation of a retry whose POST was lost.
 reset();storage.set('sceenyk:v3:final-operation:'+project,JSON.stringify({...intent,startedAt:now-180001}));status={...emptyStatus,taskId:id,status:'failed'};unmount();render();await advance();ok(hook.presentation.error.includes('could not be confirmed'));const unconfirmedReads=calls.length;await advance(60000);equal(calls.length,unconfirmedReads);equal(storage.size,0);
 for(const raw of ['broken','null',JSON.stringify({...intent,projectId:owner}),JSON.stringify({...intent,startedAt:now-86400001}),JSON.stringify({...intent,packageHash:'bad'})])equal(restoredFinalIntent(raw,project,now),null);
 reset();storage.set('sceenyk:v3:final-operation:'+project,JSON.stringify({...intent,packageHash:'c'.repeat(64)}));unmount();render();await advance();equal(hook.presentation.blocked,false);equal(storage.size,0);
 // Only a read is retried; a long-unconfirmed request remains explicit user work.
 reset();storage.set('sceenyk:v3:final-operation:'+project,JSON.stringify({...intent,startedAt:now-180001}));unmount();render();await advance();ok(hook.presentation.error.includes('could not be confirmed'));equal(calls.filter(c=>c.options.method==='POST').length,0);
 // A late acknowledgement cannot attach an old project's intent to a new project.
 reset();await advance();let finishPost;postImpl=()=>new Promise(resolvePost=>{finishPost=resolvePost;});const late=hook.submit('merge',{});render();renderProject=owner;workspace={...ready(),projectId:owner};render();finishPost(Response.json({ok:true,receipt:{accepted:true}}));await late;render();await advance();equal(hook.presentation.blocked,false);ok(!storage.has('sceenyk:v3:final-operation:'+owner));ok(storage.has('sceenyk:v3:final-operation:'+project));
 for(const c of calls)if(c.options.method==='POST')ok(['merge','approve','reject_delete','recover'].includes(JSON.parse(c.options.body).action));
 unmount();

 // Actual server status reader: every privileged lookup is owned and metadata-only.
 const queries=[];let profileSyncs=0,userPresent=true,owned=true,enrolled=true,dbFailure=null;
 const db={from(table){const q={table,filters:[],columns:''};queries.push(q);return{select(columns){q.columns=columns;return this;},eq(k,v){q.filters.push([k,v]);return this;},is(k,v){q.filters.push([k,v]);return this;},order(){return this;},limit(){return this;},async maybeSingle(){
  if(dbFailure)return{data:null,error:dbFailure,status:503};
  const rows={app_users:userPresent?{id:owner}:null,projects:owned?{id:project}:null,ugc_v3_projects:enrolled?{project_id:project}:null,
   ugc_v3_tasks:q.filters.some(f=>f[0]==='kind'&&f[1]==='delete')?{status:'done',error_code:null}:{id,status:'done',output:{mergeStage:'saved'},error_code:null},
   ugc_v3_artifacts:{id,approved_at:'2026-11-08T00:00:00Z',rejected_at:null}};return{data:rows[table],error:null};}};}};
 const load=typescriptLoader({'@/lib/db/server':{createDatabaseClient:()=>db},'@/lib/auth/require-user':{requireClerkUser:async()=>({userId:'authenticated-session'})},'@/lib/auth/ensure-app-user':{ensureAppUser:async()=>{profileSyncs++;return{id:owner};}},'./runtime-config':{assertV3Access:value=>equal(value,owner)}},{Error,Response,Request,fetch:async()=>{realNetworkCalls++;throw Error('NETWORK_FORBIDDEN');}});
 const {readOwnedV3FinalStatus,finalActionUser}=load('lib/final-video-generation-v3/final-operation-server.ts');
 const query=new URLSearchParams({project,package:pkg,manifest});
 equal((await readOwnedV3FinalStatus(query)).approved,true);equal(profileSyncs,0);
 for(const table of ['projects','ugc_v3_projects']){const q=queries.find(q=>q.table===table);ok(q.filters.some(([k,v])=>k==='owner_user_id'&&v===owner));}
 for(const q of queries.filter(q=>['ugc_v3_tasks','ugc_v3_artifacts'].includes(q.table))){ok(q.filters.some(([k,v])=>k==='project_id'&&v===project));ok(!q.columns.includes('document'));}
 ok(queries.find(q=>q.table==='app_users').filters.some(([k,v])=>k==='clerk_user_id'&&v==='authenticated-session'));
 owned=false;await assert.rejects(()=>readOwnedV3FinalStatus(query),/FRESH_V3_PROJECT_REQUIRED/);checks++;owned=true;enrolled=false;await assert.rejects(()=>readOwnedV3FinalStatus(query),/FRESH_V3_PROJECT_REQUIRED/);checks++;enrolled=true;
 userPresent=false;await assert.rejects(()=>readOwnedV3FinalStatus(query),/V3_ACCOUNT_UNAVAILABLE/);checks++;equal(profileSyncs,0);await finalActionUser();equal(profileSyncs,1);userPresent=true;
 dbFailure={code:'57014'};await assert.rejects(()=>readOwnedV3FinalStatus(query),e=>e.code==='V3_DATABASE_TIMEOUT'&&e.diagnostic.retryable);checks++;
 dbFailure={code:'42501'};await assert.rejects(()=>readOwnedV3FinalStatus(query),e=>!e.diagnostic.retryable);checks++;
 // The API keeps a compact receipt separate from the full workspace contract.
 const route=typescriptLoader({'@/lib/final-video-generation-v3/runtime-server':{ownedV3Action:async(_raw,ack)=>{equal(ack,true);return{accepted:true,action:'merge',id};},readOwnedV3:async()=>{throw Error('FULL_READ_FORBIDDEN');}},'@/lib/final-video-generation-v3/final-operation-server':{readOwnedV3FinalStatus:async()=>({...emptyStatus,taskId:id,status:'running'})},'next/navigation':{unstable_rethrow(){}}},{Error,Response,Request,URL}).call(null,'app/api/ugc/v3/route.ts');
 const response=await route.POST(new Request('https://studio.test/api/ugc/v3',{method:'POST',headers:{origin:'https://studio.test'},body:JSON.stringify({action:'merge',projectId:project,response:'acknowledge'})}));equal(response.status,200);const receipt=await response.json();equal(receipt.receipt.id,id);ok(!('workspace' in receipt));
 const polling=await route.GET(new Request('https://studio.test/api/ugc/v3?scope=final'));equal((await polling.json()).operation.status,'running');equal(polling.headers.get('Cache-Control'),'private, no-store');
 equal(realNetworkCalls,0);console.info(JSON.stringify({finalOperationChecks:checks,realNetworkCalls,paidRequests:0}));
}finally{unmount();Object.assign(globalThis,originals);delete globalThis.__finalHooks;}
