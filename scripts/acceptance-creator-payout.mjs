// Opt-in real PayPal Sandbox payout using a persistent, isolated PostgreSQL
// fixture. Sale/capture and expired time are fixtures, never hosted earnings.
// No production time bypass, hosted schema writes, or webhook edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {PGlite} from '@electric-sql/pglite';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const execute=process.argv.includes('--execute-sandbox-payout');
const offline=process.argv.includes('--offline-fixture-check');
assert.ok(!(offline&&execute),'OFFLINE_CHECK_CANNOT_SEND_PAYOUT');
const reference=process.argv.find(a=>a.startsWith('--provider-batch='))?.split('=')[1];
assert.ok(!(offline&&reference),'OFFLINE_CHECK_CANNOT_READ_PROVIDER');
const load=typescriptLoader();
const provider=load('lib/marketplace/withdrawals/paypal.ts');
const contract=load('lib/marketplace/withdrawals/contract.ts');
if(!offline)load('lib/payments/paypal/config.ts').getPayPalConfig(); // Reject Live.
if(execute){assert.equal(process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED,'sandbox-confirmed','MANUAL_SETUP_REQUIRED');await provider.assertPayoutWebhooksReady();}
const email=contract.payoutEmail.parse(offline?'recipient@example.test':process.env.SCEENYK_PAYOUT_ACCEPTANCE_EMAIL);
// Stable private fixture storage survives process/browser closure. Never erase
// or recreate this directory to retry an uncertain provider instruction.
const dataDir=offline?fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-payout-harness-check-')):path.join(os.tmpdir(),'sceenyk-creator-payout-acceptance-v1');
const auditFile=dataDir+'.provider-evidence.json';
let audit;try{audit=JSON.parse(fs.readFileSync(auditFile,'utf8'));}catch{audit={postAttempts:0,statusLookups:0,responses:[]};}
const saveAudit=()=>fs.writeFileSync(auditFile,JSON.stringify(audit,null,2));
// Capture safe provider codes/counts, never credentials, recipient or raw bodies.
const auditedFetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://api-m.sandbox.paypal.com','SANDBOX_HTTP_ONLY');
  const submitting=init?.method==='POST'&&url.pathname==='/v1/payments/payouts';
  if(submitting){assert.equal(audit.postAttempts,0,'NEVER_RESUBMIT_PAYOUT_INSTRUCTION');audit.postAttempts++;saveAudit();}
  if(init?.method==='GET'&&url.pathname.startsWith('/v1/payments/payouts/')){audit.statusLookups++;saveAudit();}
  const response=await fetch(input,init);
  if(submitting){
    let value;try{value=await response.clone().json();}catch{value={};}
    const safeCode=v=>typeof v==='string'&&/^[A-Z0-9_]{1,100}$/.test(v)?v:null;
    audit.responses.push({httpStatus:response.status,name:safeCode(value.name),issues:(value.details??[]).map(d=>safeCode(d.issue)).filter(Boolean),debugId:typeof value.debug_id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value.debug_id)?value.debug_id:null});saveAudit();
  }
  return response;
};
const pg=new PGlite(dataDir);
const one=async(sql,args=[]) => (await pg.query(sql,args)).rows[0];
const scalar=async(sql,args=[]) => (await one(sql,args))?.value;
let queue=Promise.resolve();
const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
const db={
  rpc(name,args={}){return serial(async()=>{await pg.exec('set role service_role');try{return{data:await scalar(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args)),error:null};}catch(e){return{data:null,error:{code:e.code}};}finally{await pg.exec('reset role');}});},
  from(table){const args=[],where=[];let fields='*';return{select(v){fields=v;return this;},eq(k,v){args.push(v);where.push(`${k}=$${args.length}`);return this;},then(resolve,reject){return this.execute(false).then(resolve,reject);},maybeSingle(){return this.execute(true);},execute(single){return serial(async()=>{const rows=(await pg.query(`select ${fields} from ${table} where ${where.join(' and ')}`,args)).rows;return{data:single?rows[0]??null:rows,error:null};});}};},
};
const call=async(name,args)=>{const r=await db.rpc(name,args);assert.equal(r.error,null,'FIXTURE_RPC_'+name);return r.data;};
try{
  if(!await scalar("select to_regclass('public.creator_withdrawals')::text value")){
    await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    await pg.exec('create table acceptance_fixture_state(withdrawal_id uuid primary key);');
  }
  let id=await scalar('select withdrawal_id value from acceptance_fixture_state');
  if(!id){
    await pg.exec('begin');
    const creator=await scalar("insert into app_users(clerk_user_id) values('isolated_payout_creator') returning id value");
    const buyer=await scalar("insert into app_users(clerk_user_id) values('isolated_payout_buyer') returning id value");
    const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Isolated payout fixture','gaming','1:1','10','Original','Energetic') returning id value",[creator]);
    const listing=randomUUID();
    await call('marketplace_create_priced',{p_owner_user_id:creator,p_listing_id:listing,p_project_id:project,p_title:'Isolated payout fixture',p_description:'Synthetic acceptance only.',p_category:'gaming',p_tags:[],p_instructions:'Use your own story.',p_publish:true,p_rights_confirmed:true,p_adoption_type:'paid',p_price_minor:1000});
    const p=await call('marketplace_prepare_purchase',{p_buyer_user_id:buyer,p_listing_id:listing,p_fee_bps:1000,p_pricing_version:'marketplace-withdrawal-v1'});
    await call('marketplace_attach_order',{p_purchase_id:p.id,p_buyer_user_id:buyer,p_order_id:'ORDERFIXTURE0001'});
    await call('marketplace_fulfil_purchase',{p_purchase_id:p.id,p_order_id:'ORDERFIXTURE0001',p_capture_id:'CAPTUREFIXTURE01',p_amount_minor:1000,p_currency:'USD',p_can_available:true});
    await call('creator_payout_destination',{p_creator:creator,p_email:email});
    await pg.exec("create function expired_acceptance_fixture() returns trigger language plpgsql as $$ begin new.requested_at=now()-interval '168 hours';new.hold_until=new.requested_at+interval '168 hours';return new;end $$;create trigger expired_acceptance_fixture before insert on creator_withdrawals for each row execute function expired_acceptance_fixture();");
    id=await call('creator_payout_request',{p_creator:creator,p_request:randomUUID(),p_amount:500});
    await pg.exec('drop trigger expired_acceptance_fixture on creator_withdrawals;drop function expired_acceptance_fixture();');
    await pg.query('insert into acceptance_fixture_state values($1)',[id]);await pg.exec('commit');
  }
  let w=await one('select * from creator_withdrawals where id=$1',[id]);
  assert.equal(w.destination_snapshot,email,'PINNED_SANDBOX_RECIPIENT_CANNOT_CHANGE');
  if(reference){
    const batch=await provider.readPayoutBatch(reference);const item=provider.verifyPayout(w,batch,true);
    await call('creator_payout_observe',{p_id:id,p_batch:batch.batch_header.payout_batch_id,p_item:item.payout_item_id,p_status:item.transaction_status});
  }
  const service=typescriptLoader({'@/lib/db/server':{createDatabaseClient:()=>db},'../earnings/server':{reconcileMarketplaceFinancials:async purchase=>{
    const p=await one('select * from marketplace_purchases where id=$1',[purchase]);
    // Explicit synthetic earning eligibility only; payout provider is real.
    await call('marketplace_apply_financial_observation',{p_purchase_id:p.id,p_order_id:p.paypal_order_id,p_capture_id:p.paypal_capture_id,p_amount_minor:p.amount_minor,p_currency:'USD',p_capture_status:'COMPLETED',p_refunded_minor:0,p_can_settle:true,p_reason:'refund',p_reference_key:'isolated-sale-fixture'});
  }}},{fetch:auditedFetch})('lib/marketplace/withdrawals/server.ts');
  if(execute||w.status==='processing')await service.processWithdrawal(id);
  w=await one('select * from creator_withdrawals where id=$1',[id]);
  console.log(JSON.stringify({evidence:offline?'offline isolated sale/time fixture; no provider call':'real Sandbox payout provider; isolated synthetic sale and expired-time fixture',fixtureDirectory:dataDir,withdrawalId:id,status:w.status,providerStatus:w.provider_status,failureCode:w.failure_code,paid:w.status==='paid',amountMinor:500,hostedWrites:false,providerAudit:audit}));
}finally{await pg.close();}
