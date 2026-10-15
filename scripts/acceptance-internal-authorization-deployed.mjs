// Explicit Vercel/Clerk/hosted Supabase acceptance. No deploy, role setter,
// payout submission, financial mutation, or stored session token. Fresh Clerk
// development sessions are revoked in finally; operator role changes are manual.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import nextEnv from '@next/env';
import {createClerkClient} from '@clerk/backend';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {deployedBrowser} from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
// Reuse the hosted role-source/read/write-denial acceptance as part of this
// gate; deployed HTTP checks do not replace database privilege verification.
await import('./acceptance-internal-authorization.mjs');
const origin = 'https://sceenyk.vercel.app';
const artifact = path.join(os.tmpdir(),'sceenyk-deployed-authorization-acceptance.json');
const db = typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const clerk = createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,telemetry:{disabled:true}});
assert.equal((await clerk.instance.get()).environmentType,'development');
const roles = await db.from('internal_user_roles').select('user_id,role');
const users = await db.from('app_users').select('id,clerk_user_id,email').limit(100);
assert.equal(roles.error,null);assert.equal(users.error,null);
const admin = users.data.find(user=>roles.data.some(row=>row.user_id===user.id&&row.role==='admin'));
assert.ok(admin,'EXISTING_ADMIN_REQUIRED');
const failed = await db.from('creator_withdrawals').select('creator_user_id').eq('status','failed').limit(100);
assert.equal(failed.error,null);
const ordinary = users.data.find(user=>user.email?.includes('+clerk_test@')&&!roles.data.some(row=>row.user_id===user.id)&&failed.data.some(row=>row.creator_user_id===user.id));
assert.ok(ordinary,'RESERVED_MISSING_ROLE_CREATOR_WITH_HISTORY_REQUIRED');
const result = {checkedAt:new Date().toISOString(),origin,checks:[],adminUserId:admin.id,ordinaryUserId:ordinary.id,revocation:'pending trusted operator test'};
const save = ()=>fs.writeFileSync(artifact,JSON.stringify(result,null,2));
const record = (name,passed,extra={})=>{result.checks.push({name,passed,...extra});save();console.log(JSON.stringify({check:name,passed,...extra}));};
const canonical = value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
async function snapshot(){
  const tables=[['generation_accounts','owner_user_id'],['credit_ledger','owner_user_id'],['credit_purchases','owner_user_id'],['creator_earnings_ledger','creator_user_id'],['creator_money_lots','creator_user_id'],['creator_money_events','creator_user_id'],['creator_withdrawals','creator_user_id'],['marketplace_purchases','buyer_user_id'],['marketplace_adoptions','adopter_user_id'],['projects','owner_user_id']];
  const rows=await Promise.all([admin,ordinary].flatMap(user=>tables.map(async([table,column])=>{
    const r=await db.from(table).select('*').eq(column,user.id).limit(5000);assert.equal(r.error,null,'PROTECTED_SNAPSHOT_'+table);assert.ok(r.data.length<5000,'SNAPSHOT_LIMIT');
    return {key:user.id+table,rows:r.data.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
  })));
  return createHash('sha256').update(JSON.stringify(rows.sort((a,b)=>a.key.localeCompare(b.key)))).digest('hex');
}
const before = await snapshot(), sessions=[];
const probe = async(token,query='')=>{
  const r=await fetch(origin+'/api/internal/authorization'+query,{redirect:'manual',headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(30000)});
  return {status:r.status,body:await r.text(),cache:r.headers.get('cache-control')};
};
try {
  const anonymous=await probe();
  record('deployed status boundary exists',anonymous.status!==404,{status:anonymous.status});
  if(anonymous.status!==404){
    record('anonymous denied',[302,307,401,403].includes(anonymous.status)&&!anonymous.body.includes('"authorized":true'));
    let adminToken;
    for(const user of [admin,ordinary]){
      const s=await clerk.sessions.createSession({userId:user.clerk_user_id});sessions.push(s.id);
      const token=(await clerk.sessions.getToken(s.id,undefined,60)).jwt;
      const r=await probe(token,user===ordinary?'?role=admin&userId='+admin.id:'');
      if(user===admin){adminToken=token;record('real admin authorized server-side',r.status===200&&r.body==='{"authorized":true}');}
      else {
        record('real missing-role Clerk user denied despite forged claims',r.status===403&&r.body==='{"code":"ACCESS_DENIED"}');
        const post=await fetch(origin+'/api/internal/authorization',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({role:'admin'}),signal:AbortSignal.timeout(30000)});
        record('deployed status boundary cannot assign roles by POST',post.status===405);await post.body?.cancel();
      }
      record('authorization response private/no-store '+(user===admin?'admin':'ordinary'),r.cache?.includes('private')&&r.cache.includes('no-store'));
    }
    const malformed=await probe('invalid-token');
    record('malformed session denied',[302,307,401,403,404].includes(malformed.status)&&!malformed.body.includes('"authorized":true'));
    if(process.argv.includes('--wait-for-revocation')){
      assert.ok(result.checks.every(check=>check.passed),'INITIAL_DEPLOYED_AUTHORIZATION_CHECKS_REQUIRED');
      record('revocation operator phase ready',true);
      console.log(JSON.stringify({operator:'In trusted SQL Editor, set the existing admin role to user; keep this process running. After denial is confirmed, restore admin.'}));
      let revoked=false;
      for(let attempt=0;attempt<120;attempt++){
        const row=await db.from('internal_user_roles').select('role').eq('user_id',admin.id).maybeSingle();assert.equal(row.error,null);
        if(row.data?.role==='user'||!row.data){revoked=true;break;}await delay(2000);
      }
      assert.ok(revoked,'WAITING_FOR_TRUSTED_ROLE_REVOCATION');
      // Mint a fresh token for the SAME session if the original short-lived
      // token expired while waiting; no role is encoded/trusted in this token.
      adminToken=(await clerk.sessions.getToken(sessions[0],undefined,60)).jwt;
      const denied=await probe(adminToken);
      record('committed revocation denies next deployed request',denied.status===403&&denied.body==='{"code":"ACCESS_DENIED"}');
      let restored=false;
      for(let attempt=0;attempt<120;attempt++){
        const row=await db.from('internal_user_roles').select('role').eq('user_id',admin.id).maybeSingle();assert.equal(row.error,null);
        if(row.data?.role==='admin'){restored=true;break;}await delay(2000);
      }
      assert.ok(restored,'WAITING_FOR_TRUSTED_ADMIN_RESTORATION');
      const restoredToken=(await clerk.sessions.getToken(sessions[0],undefined,60)).jwt;
      record('trusted admin restoration permits next deployed request',(await probe(restoredToken)).status===200);
      result.revocation='verified on deployed requests with trusted operator role changes';save();
    }
  }
  await deployedBrowser(origin,{Ordinary:ordinary.clerk_user_id},async browser=>{
    await browser.signIn('Ordinary');
    const browserSession=await browser.evaluate('window.Clerk.session?.id');
    assert.equal(typeof browserSession,'string','FRESH_BROWSER_SESSION_REQUIRED');sessions.push(browserSession);
    await browser.navigate('/dashboard/marketplace/earnings');
    await browser.wait("!!document.querySelector('#payout-email')");await browser.discover();
    const account=await browser.invoke('withdrawalAccountAction',1);
    assert.ok(account.ok&&account.data.account.history.length,'DEPLOYED_POPULATED_CREATOR_HISTORY_REQUIRED');
    record('deployed creator DTO excludes internal failureCode',!JSON.stringify(account).includes('failureCode'));
    record('deployed creator DTO contains safe failure messages',account.data.account.history.filter(row=>row.status==='failed').every(row=>typeof row.failureMessage==='string'));
    record('owned deployed creator history works',account.data.clerkUserId===ordinary.clerk_user_id);
    const earnings=await browser.invoke('creatorEarningsAction',1);
    record('owned deployed creator earnings works',earnings.ok&&earnings.data.clerkUserId===ordinary.clerk_user_id);
    const scripts=new Set();
    for(const route of ['/dashboard/marketplace/earnings','/dashboard/credits','/marketplace','/create']){
      await browser.navigate(route);await browser.wait("document.readyState==='complete'");
      for(const url of await browser.evaluate("Array.from(document.scripts).map(s=>s.src).filter(src=>src.startsWith(location.origin+'/_next/'))"))scripts.add(url);
      record('deployed page loads '+route,await browser.evaluate("!document.body.innerText.includes('Application error')"));
    }
    const secrets=['CLERK_SECRET_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','PAYPAL_CLIENT_SECRET','INNGEST_SIGNING_KEY','R2_SECRET_ACCESS_KEY','FAL_KEY','GEMINI_API_KEY'].map(name=>process.env[name]).filter(Boolean);
    let leaks=0,roleMarkers=0,diagnosticMarkers=0;
    for(const url of scripts){const r=await fetch(url);assert.ok(r.ok,'DEPLOYED_CLIENT_CHUNK');const body=await r.text();if(secrets.some(secret=>body.includes(secret)))leaks++;if(/internal_user_roles|requireAdminOrSupport|SupportAuthorizationError/.test(body))roleMarkers++;if(/failureCode|REFUND_BELOW_MINIMUM/.test(body))diagnosticMarkers++;}
    record('deployed client bundles exclude internal role code',roleMarkers===0,{scanned:scripts.size});
    record('deployed client bundles exclude configured secrets',leaks===0);
    record('deployed client bundles exclude payout diagnostics',diagnosticMarkers===0);
    record('deployed browser has no exceptions',browser.errors.length===0);
  });
  record('existing financial/Marketplace/project records unchanged',await snapshot()===before);
  const finalRoles=await db.from('internal_user_roles').select('user_id,role');assert.equal(finalRoles.error,null);
  const normalizedRoles=rows=>JSON.stringify(rows.map(canonical).sort((a,b)=>a.user_id.localeCompare(b.user_id)));
  record('no self-promotion or lasting role change',normalizedRoles(finalRoles.data)===normalizedRoles(roles.data));
} finally {
  let cleanupFailed=false;
  for(const id of sessions){try{await clerk.sessions.revokeSession(id);}catch{cleanupFailed=true;}}
  assert.ok(!cleanupFailed,'TEMPORARY_SESSION_REVOCATION_FAILED');save();
}
const passed=result.checks.every(check=>check.passed)&&result.revocation.startsWith('verified');
console.log(JSON.stringify({deployedAuthorizationPassed:passed,checks:result.checks.length,revocation:result.revocation,artifact}));
if(!passed)process.exitCode=1;
