// Real GET of the original already-submitted Sandbox payout. Sale/time/role
// and database delivery are explicit disposable fixtures, never hosted writes.
// Does not modify or recreate the original durable provider acceptance fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const original=path.join(os.tmpdir(),'sceenyk-creator-payout-acceptance-v1');
const proof=JSON.parse(fs.readFileSync(original+'.acceptance-proof.json','utf8'));
const priorAudit=JSON.parse(fs.readFileSync(original+'.provider-evidence.json','utf8'));
assert.equal(proof.provider.status,'SUCCESS');assert.equal(priorAudit.postAttempts,1);
const config=typescriptLoader()('lib/payments/paypal/config.ts').getPayPalConfig();
assert.equal(config.baseUrl,'https://api-m.sandbox.paypal.com');
let gets=0,posts=0,checks=0;
const auditedFetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,config.baseUrl,'SANDBOX_ONLY');
  if(url.pathname==='/v1/payments/payouts'&&init?.method==='POST'){posts++;throw Error('PAYOUT_POST_FORBIDDEN');}
  // OAuth obtains a token; all payout operations must be GETs of the pinned batch.
  if(url.pathname.startsWith('/v1/payments/payouts')){assert.equal(init?.method,'GET');assert.equal(url.pathname,'/v1/payments/payouts/'+proof.provider.batchId);gets++;}
  else assert.equal(url.pathname,'/v1/oauth2/token');
  return fetch(input,init);
};
const provider=typescriptLoader({},{fetch:auditedFetch})('lib/marketplace/withdrawals/paypal.ts');
const real=await provider.readPayoutBatch(proof.provider.batchId);
const id=real.batch_header.sender_batch_header.sender_batch_id;
assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
assert.equal(real.items[0].transaction_status,'SUCCESS');assert.equal(real.items[0].payout_item.amount.value,'5.00');
const {pg,db,call,one,scalar}=await compositionFixtureDatabase();
const check=(name,value)=>{assert.ok(value,name);checks++;};
try{
  const creator=await scalar("insert into app_users(clerk_user_id) values('support_provider_fixture_creator') returning id value");
  const buyer=await scalar("insert into app_users(clerk_user_id) values('support_provider_fixture_buyer') returning id value");
  const actor=await one("insert into app_users(clerk_user_id) values('support_provider_fixture_admin') returning *");
  await pg.query("insert into internal_user_roles(user_id,role) values($1,'admin')",[actor.id]);
  const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Support provider fixture','gaming','1:1','10','Original','Energetic') returning id value",[creator]);
  const listing=randomUUID();await call('marketplace_create_priced',{p_owner_user_id:creator,p_listing_id:listing,p_project_id:project,p_title:'Support provider fixture',p_description:'Isolated synthetic sale.',p_category:'gaming',p_tags:[],p_instructions:'Create your story.',p_publish:true,p_rights_confirmed:true,p_adoption_type:'paid',p_price_minor:1000});
  const p=await call('marketplace_prepare_purchase',{p_buyer_user_id:buyer,p_listing_id:listing,p_fee_bps:1000,p_pricing_version:'marketplace-withdrawal-v1'});
  await call('marketplace_attach_order',{p_purchase_id:p.id,p_buyer_user_id:buyer,p_order_id:'SUPPORTORDER001'});
  await call('marketplace_fulfil_purchase',{p_purchase_id:p.id,p_order_id:'SUPPORTORDER001',p_capture_id:'SUPPORTCAPTURE01',p_amount_minor:1000,p_currency:'USD',p_can_available:true});
  await call('marketplace_apply_financial_observation',{p_purchase_id:p.id,p_order_id:'SUPPORTORDER001',p_capture_id:'SUPPORTCAPTURE01',p_amount_minor:1000,p_currency:'USD',p_capture_status:'COMPLETED',p_refunded_minor:0,p_can_settle:true,p_reason:'refund',p_reference_key:'explicit-isolated-sale'});
  await call('creator_payout_destination',{p_creator:creator,p_email:real.items[0].payout_item.receiver});
  await pg.exec(`create function support_provider_time_fixture() returns trigger language plpgsql as $$ begin new.id='${id}'::uuid;new.requested_at=now()-interval '168 hours';new.hold_until=new.requested_at+interval '168 hours';return new;end $$;create trigger support_provider_time_fixture before insert on creator_withdrawals for each row execute function support_provider_time_fixture();`);
  assert.equal(await call('creator_payout_request',{p_creator:creator,p_request:randomUUID(),p_amount:500}),id);
  await pg.exec('drop trigger support_provider_time_fixture on creator_withdrawals;drop function support_provider_time_fixture();');
  await call('creator_payout_claim',{p_id:id});
  await call('creator_payout_observe',{p_id:id,p_batch:proof.provider.batchId,p_item:proof.provider.itemId,p_status:'PENDING'});
  const load=typescriptLoader({'./paypal':provider,'@/lib/db/server':{createDatabaseClient:()=>db},'./ensure-app-user':{ensureAppUser:async()=>actor}});
  const support=load('lib/payout-support/server.ts'),worker=load('lib/marketplace/withdrawals/server.ts');
  const processing=await support.getPayoutSupportDetail({id});
  check('processing detail shows original frozen amount/ref and masks real recipient',processing.withdrawal.status==='processing'&&processing.withdrawal.submitted===500&&processing.batchId===proof.provider.batchId&&!JSON.stringify(processing).includes(real.items[0].payout_item.receiver));
  const results=await Promise.all([support.reconcileSupportPayout({withdrawalId:id}),worker.processWithdrawal(id),support.reconcileSupportPayout({withdrawalId:id})]);
  check('manual/worker/duplicate real GETs confirm Paid',results[0].outcome==='paid'&&results[2].outcome==='paid');
  const paid=await support.getPayoutSupportDetail({id});
  check('Paid detail shows verified refs/amount and persisted check timestamp',paid.withdrawal.status==='paid'&&paid.withdrawal.paidAt&&paid.withdrawal.lastCheckedAt&&paid.batchId===proof.provider.batchId&&paid.itemId===proof.provider.itemId);
  check('one Paid event and no second available debit',await scalar("select count(*)::int value from creator_money_events where withdrawal_id=$1 and kind='paid'",[id])===1&&paid.creatorBalance.available===400&&paid.creatorBalance.pending===0&&paid.creatorBalance.paid===500);
  const snapshot=async()=>createHash('sha256').update(JSON.stringify({w:await one('select * from creator_withdrawals where id=$1',[id]),lots:(await pg.query('select * from creator_money_lots order by purchase_id')).rows,events:(await pg.query('select * from creator_money_events order by id')).rows})).digest('hex');
  const before=await snapshot();await support.reconcileSupportPayout({withdrawalId:id});await worker.processWithdrawal(id);
  check('later support/worker replay leaves finance unchanged',await snapshot()===before);
  check('distinct audit attempts retain provider and local outcomes',await scalar("select count(*)::int value from payout_support_events where withdrawal_id=$1 and action='check_finished' and observed_status='SUCCESS' and resulting_status='paid'",[id])===4);
  check('no payout POST and original durable send counter unchanged',posts===0&&JSON.parse(fs.readFileSync(original+'.provider-evidence.json','utf8')).postAttempts===1);
  check('AI accounts and accounting equation preserved',await scalar('select bool_and(creator_money_consistent(id)) value from app_users')===true&&await scalar('select count(*)::int value from generation_accounts where free_total<>2 or free_reserved<>0 or free_consumed<>0 or credit_available<>0 or credit_reserved<>0')===0);
  const result={checkedAt:new Date().toISOString(),checks,passed:true,realProviderGets:gets,payoutPosts:posts,existingProviderStatus:'SUCCESS',amountMinor:500,syntheticSaleTimeRole:true,hostedWrites:false,concurrency:'single-connection disposable PostgreSQL, real PayPal GET responses',originalPayoutRecreated:false};
  fs.writeFileSync(path.join(os.tmpdir(),'sceenyk-payout-support-sandbox-acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await pg.close();}
