// Recovery for an operator who commits revocation after the original waiting
// window. Uses real deployed requests; never writes roles or financial state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import nextEnv from '@next/env';
import {createClerkClient} from '@clerk/backend';
import {typescriptLoader} from './lib/load-typescript.mjs';

nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const origin='https://sceenyk.vercel.app';
const artifact=path.join(os.tmpdir(),'sceenyk-deployed-role-revocation.json');
const evidence=JSON.parse(fs.readFileSync(artifact,'utf8'));
assert.ok(evidence.status===403&&evidence.safeDenial&&evidence.privateNoStore&&evidence.storedRole==='user','VERIFIED_DEPLOYED_REVOCATION_REQUIRED');
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const user=await db.from('app_users').select('id,clerk_user_id').eq('id',evidence.adminUserId).single();
assert.equal(user.error,null);assert.equal(user.data.id,evidence.adminUserId);
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,telemetry:{disabled:true}});
assert.equal((await clerk.instance.get()).environmentType,'development');
const session=await clerk.sessions.createSession({userId:user.data.clerk_user_id});
const probe=async()=>{
  const token=(await clerk.sessions.getToken(session.id,undefined,60)).jwt;
  const response=await fetch(origin+'/api/internal/authorization',{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(30000)});
  return {status:response.status,body:await response.text(),cache:response.headers.get('cache-control')};
};
const storedRole=async()=>{const r=await db.from('internal_user_roles').select('role').eq('user_id',user.data.id).single();assert.equal(r.error,null);return r.data.role;};
try {
  let role=await storedRole();assert.ok(['user','admin'].includes(role),'EXPECTED_REVOKED_OR_RESTORED_ROLE');
  if(role==='user'){
    const denied=await probe();assert.equal(denied.status,403);assert.equal(denied.body,'{"code":"ACCESS_DENIED"}');
    evidence.repeatedDenialAt=new Date().toISOString();
    console.log(JSON.stringify({revokedAccountDenied:true,status:403,waitingForTrustedRestoration:true,waitMinutes:15}));
    for(let attempt=0;attempt<300&&role!=='admin';attempt++){await delay(3000);role=await storedRole();}
  }
  assert.equal(role,'admin','WAITING_FOR_TRUSTED_ADMIN_RESTORATION');
  const restored=await probe();assert.equal(restored.status,200);assert.equal(restored.body,'{"authorized":true}');
  assert.ok(restored.cache?.includes('private')&&restored.cache.includes('no-store'));
  Object.assign(evidence,{origin,restoration:'verified deployed admin access after trusted SQL',restoredAt:new Date().toISOString(),restoredStatus:200,restoredSafeResponse:true,restoredPrivateNoStore:true,restorationContext:evidence.repeatedDenialAt?'denial and restoration checked using the same fresh Clerk session':'restoration checked using a fresh Clerk session after previously verified denial'});
  fs.writeFileSync(artifact,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({revocationVerified:true,restorationVerified:true,deployedStatus:200,context:evidence.restorationContext,financialCalls:0,roleWrites:0}));
} finally {await clerk.sessions.revokeSession(session.id);}
