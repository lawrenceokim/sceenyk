// Read-only by default; --sync registers the already deployed functions with Inngest.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import nextEnv from '@next/env';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const origin='https://sceenyk.vercel.app',key=process.env.INNGEST_SIGNING_KEY;
assert.ok(key,'CLOUD_SIGNING_KEY_CONFIGURED');
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
for(const name of ['render_dispatch_candidates','caption_dispatch_candidates']){
  const result=await db.rpc(name);assert.ok(!result.error,`${name}_READ`);
  assert.equal(result.data.length,0,`${name}_EMPTY_BEFORE_SYNC`);
}
const signature=()=>{const t=String(Math.floor(Date.now()/1000)),secret=key.replace(/^signkey-\w+-/,'');
  return `t=${t}&s=${createHmac('sha256',secret).update(t).digest('hex')}`;};
async function endpoint(method){const response=await fetch(origin+'/api/inngest',{method,headers:{'x-inngest-signature':signature()},signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,`DEPLOYED_${method}`);return response;}
const deployed=await (await endpoint('GET')).json();
assert.equal(deployed.authentication_succeeded,true);
assert.ok(deployed.function_count>=8,'DEPLOYED_CAPTION_FUNCTIONS');
async function cloud(){const response=await fetch('https://api.inngest.com/v2/apps',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'CLOUD_READ');const apps=(await response.json()).data;
  return apps.find(app=>app.id==='sceenyk')?.functionCount??null;}
const before=await cloud();
if(process.argv.includes('--sync')&&before!==deployed.function_count){await (await endpoint('PUT')).body?.cancel();}
const after=await cloud();
console.log(JSON.stringify({deployedFunctions:deployed.function_count,cloudFunctionsBefore:before,cloudFunctionsAfter:after,
  synced:process.argv.includes('--sync')&&before!==deployed.function_count,renderCandidates:0,captionCandidates:0}));
assert.equal(after,deployed.function_count,'CLOUD_CAPTION_FUNCTIONS');
