// Existing hosted records only. No payout send/claim, role write, funding,
// refund, amount/reference edit, or time bypass. Fresh Clerk sessions cleaned.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {createClerkClient} from '@clerk/backend';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const origin='https://sceenyk.vercel.app',hostedOnly=process.argv.includes('--hosted-only');
const evidence={checkedAt:new Date().toISOString(),origin,hostedOnly,checks:[],payoutCreationRequested:false};
const artifact=path.join(os.tmpdir(),'sceenyk-payout-support-'+(hostedOnly?'hosted':'deployed')+'-acceptance.json');
const check=(name,value)=>{assert.ok(value,name);evidence.checks.push(name);fs.writeFileSync(artifact,JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:name}));};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
async function snapshot(){
  const names=['creator_withdrawals','creator_money_lots','creator_withdrawal_allocations','creator_money_events','marketplace_payment_adjustments','creator_earnings_ledger','marketplace_purchases','marketplace_adoptions','generation_accounts','credit_ledger','credit_purchases','projects','internal_user_roles'];
  const rows=await Promise.all(names.map(async name=>{const r=await db.from(name).select('*').limit(5000);assert.equal(r.error,null,'SNAPSHOT_READ');assert.ok(r.data.length<5000);return {name,rows:r.data.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};}));return hash(rows);
}
const roles=await db.from('internal_user_roles').select('user_id,role');assert.equal(roles.error,null);
const users=await db.from('app_users').select('id,clerk_user_id,email').limit(100);assert.equal(users.error,null);
const admin=users.data.find(u=>roles.data.some(r=>r.user_id===u.id&&r.role==='admin'));
const ordinary=users.data.find(u=>u.email?.includes('+clerk_test@')&&!roles.data.some(r=>r.user_id===u.id));
assert.ok(admin&&ordinary,'EXISTING_ADMIN_AND_RESERVED_MISSING_ROLE_USER_REQUIRED');
const existing=await db.from('creator_withdrawals').select('*').limit(100);assert.equal(existing.error,null);
// Only terminal withdrawals that never reached provider submission are eligible
// for deployed POST tests. No existing in-progress/paid record is disturbed.
const safe=existing.data.find(w=>w.status==='failed'&&w.paypal_batch_id===null&&w.submitted_minor===null);
assert.ok(safe,'SAFE_EXISTING_UNSUBMITTED_TERMINAL_RECORD_REQUIRED');
const before=await snapshot(),sessions=[];
try{
  const audit=await db.from('payout_support_events').select('id').limit(0);
  check('hosted026 audit table present with service SELECT',!audit.error);
  const queue=await db.rpc('payout_support_queue',{p_actor:admin.id,p_query:'',p_status:'all',p_page:1});
  check('hosted role-checked bounded queue',!queue.error&&queue.data.pageSize===12&&queue.data.items.length<=12);
  const denied=await db.rpc('payout_support_queue',{p_actor:ordinary.id,p_query:'',p_status:'all',p_page:1});
  check('SQL independently denies ordinary role',denied.error?.code==='42501');
  const detail=await db.rpc('payout_support_detail',{p_actor:admin.id,p_id:safe.id,p_history_page:1,p_audit_page:1,p_allocation_page:1});
  check('hosted detail masks recipient and bounds all histories',!detail.error&&detail.data.found&&detail.data.destination.includes('***@')&&!JSON.stringify(detail.data).includes(safe.destination_snapshot)&&['history','audit','allocations'].every(k=>detail.data[k].items.length<=25));
  const publicKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  assert.ok(publicKey);const browser=createClient(process.env.SUPABASE_URL,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  check('browser cannot read audit',(await browser.from('payout_support_events').select('id').limit(0)).error?.code==='42501');
  check('browser cannot invoke internal queue RPC',(await browser.rpc('payout_support_queue',{p_actor:admin.id,p_query:'',p_status:'all',p_page:1})).error?.code==='42501');
  check('service cannot execute private raw projection',(await db.rpc('payout_support_summary',{p_id:safe.id})).error?.code==='42501');
  const absent=randomUUID();assert.equal((await db.from('creator_withdrawals').select('id').eq('id',absent).maybeSingle()).data,null);
  for(const [name,client] of [['browser',browser],['service',db]]){
    for(const [op,work] of [['insert',()=>client.from('payout_support_events').insert({attempt_id:randomUUID(),withdrawal_id:absent,source:'worker',action:'check_started',outcome:'started',reason:'check_started'})],['update',()=>client.from('payout_support_events').update({reason:'viewed'}).eq('id',absent)],['delete',()=>client.from('payout_support_events').delete().eq('id',absent)]])check(name+' cannot '+op+' internal audit',(await work()).error?.code==='42501');
  }
  if(!hostedOnly){
    const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,telemetry:{disabled:true}});assert.equal((await clerk.instance.get()).environmentType,'development');
    for(const user of [admin,ordinary]){const session=await clerk.sessions.createSession({userId:user.clerk_user_id});sessions.push(session.id);}
    const request=async(index,route,{method='GET',body,headers={}}={})=>{
      const token=index===null?null:(await clerk.sessions.getToken(sessions[index],undefined,60)).jwt;
      const r=await fetch(origin+route,{method,redirect:'manual',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
      return {status:r.status,body:await r.text(),cache:r.headers.get('cache-control')};
    };
    const hasPrivate=v=>v.includes(safe.id)||v.includes(safe.creator_user_id)||v.includes(safe.destination_snapshot)||v.includes('Accounting and reversal history')||v.includes('Check PayPal Status');
    for(const route of ['/admin/payouts','/admin/payouts/'+safe.id]){
      const ordinaryPage=await request(1,route+'?role=admin&creatorId='+admin.id);
      check('real ordinary page denial without private data '+(route.endsWith(safe.id)?'detail':'queue'),[200,403,404].includes(ordinaryPage.status)&&!hasPrivate(ordinaryPage.body)&&/NEXT_HTTP_ERROR_FALLBACK;404|This page could not be found|404/.test(ordinaryPage.body));
      const anon=await request(null,route);check('anonymous page denied without private data',[200,302,307,401,403,404].includes(anon.status)&&!hasPrivate(anon.body));
      const page=await request(0,route);check('real admin server-rendered private '+(route.endsWith(safe.id)?'detail':'queue'),page.status===200&&page.body.includes(route.endsWith(safe.id)?'Accounting and reversal history':'Payout support')&&page.body.includes(safe.id)&&!page.body.includes(safe.destination_snapshot));
      check('private page is not shared-cacheable',page.cache?.includes('private')&&page.cache.includes('no-store'));
    }
    const forbidden=await request(1,'/api/admin/payouts/reconcile',{method:'POST',body:{withdrawalId:safe.id,role:'admin'}});
    check('real normal user direct POST denied',forbidden.status===403&&!hasPrivate(forbidden.body));
    const forged=await request(0,'/api/admin/payouts/reconcile',{method:'POST',body:{withdrawalId:safe.id,amount:500,role:'admin'}});
    check('admin cannot post override fields',forged.status===400);
    const cross=await request(0,'/api/admin/payouts/reconcile',{method:'POST',body:{withdrawalId:safe.id},headers:{Origin:'https://attacker.invalid'}});
    check('cross-origin authenticated POST denied',cross.status===403);
    check('no GET financial action',(await request(0,'/api/admin/payouts/reconcile')).status===405);
    const post=()=>request(0,'/api/admin/payouts/reconcile',{method:'POST',body:{withdrawalId:safe.id}});
    const duplicates=await Promise.all([post(),post(),post()]);
    check('duplicate deployed support checks are safe unsubmitted no-ops',duplicates.every(r=>r.status===200&&JSON.parse(r.body).outcome==='not_submitted'&&r.cache?.includes('private')&&r.cache.includes('no-store')));
    const finished=await db.from('payout_support_events').select('attempt_id,actor_user_id,prior_status,resulting_status,outcome,reason').eq('withdrawal_id',safe.id).eq('action','check_finished');assert.equal(finished.error,null);
    check('deployed human check outcomes audited with actual actor',finished.data.filter(e=>e.actor_user_id===admin.id&&e.outcome==='not_submitted'&&e.prior_status==='failed'&&e.resulting_status==='failed').length>=3);
    // Browserless worker uses the same hosted SQL via real application module;
    // a terminal record needs no provider/network call. This proves deployed
    // no-op contention only; financial transition races use disposable SQL.
    const worker=typescriptLoader()('lib/marketplace/withdrawals/server.ts');
    const raced=await Promise.all([post(),post(),worker.processWithdrawal(safe.id)]);
    check('hosted terminal manual/worker overlap preserves no-op',raced[0].status===200&&raced[1].status===200&&raced[2]==='terminal');
    const urls=[...new Set([...((await request(0,'/admin/payouts/'+safe.id)).body.matchAll(/\/_next\/static\/[^"\s<>\\]+\.js/g))].map(m=>m[0]))];
    assert.ok(urls.length);const secrets=Object.entries(process.env).filter(([k,v])=>/SECRET|TOKEN|API_KEY|SIGNING_KEY|ACCESS_KEY|FAL_KEY/.test(k)&&v?.length>8).map(([,v])=>v);
    for(const url of urls){const r=await fetch(origin+url);assert.equal(r.status,200);const text=await r.text();assert.ok(!secrets.some(v=>text.includes(v))&&!/internal_user_roles|requireAdminOrSupport|payout_support_events|payout_support_check|failureCode|REFUND_BELOW_MINIMUM|api-m\.sandbox\.paypal\.com/.test(text),'DEPLOYED_CLIENT_PRIVACY');}
    check('deployed support client chunks contain no role/internal diagnostic/secret markers',true);evidence.clientFiles=urls.length;
  }
  check('all protected finance/Marketplace/AI/project/role records unchanged',await snapshot()===before);
  evidence.passed=true;evidence.limitations='Existing hosted unsubmitted terminal records only; real SUCCESS provider/financial transitions use isolated sale/time/role fixtures. Independent hosted financial-transition contention and matched hosted payout webhook delivery are not claimed.';
  fs.writeFileSync(artifact,JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.checks.length,hostedOnly,financeUnchanged:true,payoutPosts:0,artifact}));
}finally{
  const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,telemetry:{disabled:true}});
  for(const id of sessions)await clerk.sessions.revokeSession(id);
}
