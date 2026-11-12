// Actual supervisor/cycle, stable save route and client with injected I/O only.
// No env files, network, Docker services, claims, accounting or provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { typescriptLoader } from './lib/load-typescript.mjs';
let checks = 0;
const equal = (a,b) => { assert.deepEqual(a,b); checks++; };
const ok = a => { assert.ok(a); checks++; };
const source = fs.readFileSync('workers/laptop/supervisor.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
async function supervise(codes, lane = 'ugc') {
  const process = new EventEmitter(); process.argv=['node','supervisor',lane];
  process.env={SCEENYK_DOCKER_WORKERS_ENABLED:'1',PAYPAL_ENVIRONMENT:'sandbox',SCEENYK_PAYPAL_PAYOUTS_ENABLED:'sandbox-confirmed'};
  process.kill=()=>{}; const delays=[],health=[],logs=[]; let spawns=0;
  await vm.runInNewContext(`(async()=>{${source}})()`, {
    process, console:{info:(...a)=>logs.push(a),error:(...a)=>logs.push(a)}, Date,
    Math:Object.assign(Object.create(Math),{random:()=>0}),
    fs:{readFileSync:file=>file==='/control/mode'?'docker':'0',writeFileSync:(_file,data)=>health.push(JSON.parse(data)),
      openSync:()=>1,writeFile(){},fsyncSync(){},closeSync(){},renameSync(){}},
    spawn:()=>{const child=new EventEmitter();child.pid=100;spawns++;queueMicrotask(()=>child.emit('exit',codes.shift()??1,null));return child;},
    setInterval:()=>1,clearInterval(){},
    clearTimeout(){},
    // Capture the actual requested delay, then finish each wait without sleeping.
    ...{setTimeout:(callback,ms)=>{delays.push(ms);queueMicrotask(()=>{if(ms===5000)process.emit('SIGTERM');callback();});return 1;}},
  });
  return {spawns,delays,health,logs,exitCode:process.exitCode};
}
let run=await supervise([75,75,0]);
equal(run.spawns,3);equal(run.delays,[3000,6000,5000]);equal(run.exitCode,undefined);
ok(run.health.some(h=>h.connectionAvailable===false));equal(run.health.at(-1).connectionAvailable,true);
ok(JSON.stringify(run.logs).includes('DOCKER_WORKER_CONNECTION_RECOVERED'));
ok(!JSON.stringify(run.logs).includes('DOCKER_WORKER_STOPPED'));
run=await supervise([...Array(8).fill(75),0],'media');
equal(run.delays.slice(0,8),[3000,6000,12000,24000,48000,60000,60000,60000]);
for(const [lane,code] of [['ugc',1],['media',137],['payout',75]]) {
  run=await supervise([code,0],lane);equal(run.spawns,1);equal(run.exitCode,1);equal(run.delays,[]);
}
const healthSource=fs.readFileSync('workers/laptop/healthcheck.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
for(const [state,expected] of [[{at:Date.now(),connectionAvailable:false},1],[{at:Date.now(),connectionAvailable:true},undefined],[{at:Date.now()-60000},1]]) {
  const process={};vm.runInNewContext(healthSource,{process,Date,fs:{readFileSync:()=>JSON.stringify(state)}});equal(process.exitCode,expected);
}
let networkCalls=0,providerCalls=0,queueFailure,projectFailures=[];
const processFixture={argv:['node','cycle','ugc'],env:{SCEENYK_DOCKER_WORKERS_ENABLED:'1',PAYPAL_ENVIRONMENT:'sandbox'}};
const logs=[];
const cycleLoader=typescriptLoader({
 'node:fs':{promises:{readFile:async()=>{throw Object.assign(new Error(),{code:'ENOENT'});},writeFile:async()=>{}}},
 '../lib/db/server':{createDatabaseClient:()=>{throw Error('UNEXPECTED_DATABASE');}},
 '../lib/payments/paypal/config':{getPayPalConfig(){}},
 '../lib/final-video-generation-v3/runtime-store':{V3Store:class{}},
 '../lib/final-video-generation-v3/background-worker':{processV3QueueBatch:async()=>{if(queueFailure)throw queueFailure;return{after:null,failures:projectFailures};}},
 '../lib/final-video-generation-v3/worker':{runV3Task:async()=>{providerCalls++;throw Error('PROVIDER_FORBIDDEN');}},
 '../lib/final-video-generation-v3/runtime-config':{v3OwnedAccessEnabled:()=>true},
},{process:processFixture,console:{info:(...a)=>logs.push(a),error:(...a)=>logs.push(a)},fetch:async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');}});
const {V3DatabaseError}=cycleLoader('lib/final-video-generation-v3/database-errors.ts');
queueFailure=new V3DatabaseError({cause:{code:'ECONNRESET'},message:'sb_secret_FIXTURE_NEVER_LOG'},'ugc_v3_worker_projects');
cycleLoader('scripts/docker-worker-cycle.ts');await new Promise(setImmediate);
equal(processFixture.exitCode,75);equal(providerCalls,0);equal(networkCalls,0);
const logged=JSON.stringify(logs);ok(logged.includes('ECONNRESET'));ok(logged.includes('ugc_v3_worker_projects'));ok(!logged.includes('sb_secret_FIXTURE_NEVER_LOG'));
// Repeat with a new module loader so main executes once per fixture, as in Docker.
async function cycleResult(failures) {
  const p={argv:['node','cycle','ugc'],env:processFixture.env};
  const load=typescriptLoader({
    'node:fs':{promises:{readFile:async()=>{throw Object.assign(new Error(),{code:'ENOENT'});},writeFile:async()=>{}}},
    '../lib/db/server':{createDatabaseClient:()=>{}},'../lib/payments/paypal/config':{getPayPalConfig(){}},
    '../lib/final-video-generation-v3/runtime-store':{V3Store:class{}},
    '../lib/final-video-generation-v3/background-worker':{processV3QueueBatch:async()=>({after:null,failures})},
    '../lib/final-video-generation-v3/worker':{runV3Task:async()=>{providerCalls++;}},
    '../lib/final-video-generation-v3/runtime-config':{v3OwnedAccessEnabled:()=>true},
  },{process:p,console:{info(){},error(){}}});
  load('scripts/docker-worker-cycle.ts');await new Promise(setImmediate);return p.exitCode;
}
equal(await cycleResult([{code:'V3_DATABASE_TIMEOUT',diagnostic:{service:'database',retryable:true}}]),75);
equal(await cycleResult([{code:'V3_DATABASE_PERMISSION_DENIED',diagnostic:{service:'database',retryable:false}}]),1);
equal(await cycleResult([{code:'UNKNOWN_PROVIDER_OUTCOME'}]),1);

const project='00000000-0000-4000-8000-000000000001';let saves=0,actionFailure;
const saved={ok:true,project:{id:project}};
const route=typescriptLoader({'@/app/actions/projects':{saveProjectAction:async input=>{saves++;if(actionFailure)throw actionFailure;equal(input.id,project);return saved;}}}, {Response})('app/api/projects/save/route.ts');
const request=(body,origin='https://app.test',contentType='application/json')=>new Request('https://app.test/api/projects/save',{method:'POST',headers:{...(origin?{Origin:origin}:{}),'Content-Type':contentType},body});
for(const [req,status] of [[request('{}','https://evil.test'),403],[request('{}',''),403],[request('{}','https://app.test','text/plain'),415],[request('{'),400],[request(' '.repeat(256*1024+1)),413]]) {
  const response=await route.POST(req);equal(response.status,status);equal(saves,0);equal(response.headers.get('Cache-Control'),'private, no-store');
}
equal(await(await route.POST(request(JSON.stringify({id:project})))).json(),saved);equal(saves,1);
actionFailure=new Error('AUTH_REDIRECT');await assert.rejects(()=>route.POST(request(JSON.stringify({id:project}))),/AUTH_REDIRECT/);checks++;
let posts=0,requestFailure,responseBody=saved;
const client=typescriptLoader({}, {fetch:async(url,init)=>{posts++;equal(url,'/api/projects/save');equal(init.redirect,'error');equal(JSON.parse(init.body).id,project);if(requestFailure)throw requestFailure;return Response.json(responseBody);}})('lib/projects/save-request.ts');
equal(await client.saveProjectRequest({id:project}),saved);equal(posts,1);
requestFailure=new TypeError('Lost acknowledgement');await assert.rejects(()=>client.saveProjectRequest({id:project}),/Lost acknowledgement/);checks++;equal(posts,2);
requestFailure=null;responseBody={ok:false,code:'NOT_FOUND',message:'Owned project unavailable'};
equal(await client.saveProjectRequest({id:project}),responseBody);equal(posts,3);
responseBody={ok:true};await assert.rejects(()=>client.saveProjectRequest({id:project}),/PROJECT_SAVE_UNAVAILABLE/);checks++;
console.info(JSON.stringify({generationIncidentChecks:checks,realNetworkCalls:networkCalls,providerRequests:providerCalls}));
