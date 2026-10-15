// Replays a real Sandbox provider event against an isolated processing fixture
// bearing the original instruction UUID. Provider GETs are real. This verifies
// the trusted handler, not delivery/signatures of a matched hosted webhook.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const root=path.join(os.tmpdir(),'sceenyk-creator-payout-acceptance-v1');
const proof=JSON.parse(fs.readFileSync(root+'.acceptance-proof.json','utf8'));
const hosted=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-withdrawals-hosted-acceptance.json'),'utf8'));
const provider=typescriptLoader()('lib/marketplace/withdrawals/paypal.ts');
assert.equal(proof.provider.status,'SUCCESS');
const actual=await provider.readPayoutBatch(proof.provider.batchId),id=actual.batch_header.sender_batch_header.sender_batch_id;
assert.match(id,/^[a-f0-9-]{36}$/);assert.equal(actual.items[0].payout_item.receiver,hosted.recipient);
const load=typescriptLoader(),config=load('lib/payments/paypal/config.ts').getPayPalConfig();assert.equal(config.baseUrl,'https://api-m.sandbox.paypal.com');
const token=await load('lib/payments/paypal/client.ts').paypalAccessToken();
const response=await fetch(config.baseUrl+'/v1/notifications/webhooks-events/'+encodeURIComponent(proof.webhookEventId),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});assert.ok(response.ok);
const event=await response.json();assert.equal(event.id,proof.webhookEventId);assert.equal(event.event_type,'PAYMENT.PAYOUTS-ITEM.SUCCEEDED');
const {pg,db,call,one,scalar}=await compositionFixtureDatabase();let checks=0,posts=0;
const check=(name,v)=>{assert.ok(v,name);checks++;console.log(JSON.stringify({passed:name}));};
try{
  const creator=await scalar("insert into app_users(clerk_user_id) values('trusted_handler_creator') returning id value"),buyer=await scalar("insert into app_users(clerk_user_id) values('trusted_handler_buyer') returning id value");
  const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Trusted handler fixture','gaming','1:1','10','Original','Energetic') returning id value",[creator]);
  const listing=randomUUID();await call('marketplace_create_priced',{p_owner_user_id:creator,p_listing_id:listing,p_project_id:project,p_title:'Trusted handler fixture',p_description:'Synthetic isolated fixture.',p_category:'gaming',p_tags:[],p_instructions:'Use your own story.',p_publish:true,p_rights_confirmed:true,p_adoption_type:'paid',p_price_minor:1000});
  const purchase=await call('marketplace_prepare_purchase',{p_buyer_user_id:buyer,p_listing_id:listing,p_fee_bps:1000,p_pricing_version:'marketplace-withdrawal-v1'});
  await call('marketplace_attach_order',{p_purchase_id:purchase.id,p_buyer_user_id:buyer,p_order_id:'HANDLERORDER001'});
  await call('marketplace_fulfil_purchase',{p_purchase_id:purchase.id,p_order_id:'HANDLERORDER001',p_capture_id:'HANDLERCAPTURE01',p_amount_minor:1000,p_currency:'USD',p_can_available:true});
  await call('creator_payout_destination',{p_creator:creator,p_email:hosted.recipient});
  await pg.exec(`create function handler_time_fixture() returns trigger language plpgsql as $$ begin new.id='${id}'::uuid;new.requested_at=now()-interval '168 hours';new.hold_until=new.requested_at+interval '168 hours';return new;end $$;create trigger handler_time_fixture before insert on creator_withdrawals for each row execute function handler_time_fixture();`);
  check('isolated replay uses original real instruction UUID',await call('creator_payout_request',{p_creator:creator,p_request:randomUUID(),p_amount:500})===id);
  await pg.exec('drop trigger handler_time_fixture on creator_withdrawals;drop function handler_time_fixture();');
  await call('marketplace_apply_financial_observation',{p_purchase_id:purchase.id,p_order_id:'HANDLERORDER001',p_capture_id:'HANDLERCAPTURE01',p_amount_minor:1000,p_currency:'USD',p_capture_status:'COMPLETED',p_refunded_minor:0,p_can_settle:true,p_reason:'refund',p_reference_key:'explicit-synthetic-sale-verification'});
  const claimed=await call('creator_payout_claim',{p_id:id});check('ambiguous processing fixture has no provider reference',claimed.status==='processing'&&claimed.paypal_batch_id===null);
  const service=typescriptLoader({'@/lib/db/server':{createDatabaseClient:()=>db}},{fetch:async(input,init)=>{const url=new URL(String(input));assert.equal(url.origin,config.baseUrl);if(url.pathname==='/v1/payments/payouts'&&init?.method==='POST'){posts++;throw Error('NEW_PAYOUT_FORBIDDEN');}return fetch(input,init);}})('lib/marketplace/withdrawals/server.ts');
  check('real provider event handled by actual trusted service',await service.handleVerifiedPayoutEvent(event));
  const paid=await one('select * from creator_withdrawals where id=$1',[id]);check('actual provider GET recovers missing reference and finalizes Paid',paid.status==='paid'&&paid.provider_status==='SUCCESS'&&paid.paypal_batch_id===proof.provider.batchId&&paid.paypal_item_id===proof.provider.itemId&&paid.reserved_minor===0);
  const snapshot=async()=>createHash('sha256').update(JSON.stringify({w:await one('select * from creator_withdrawals where id=$1',[id]),events:(await pg.query('select * from creator_money_events where creator_user_id=$1 order by id',[creator])).rows})).digest('hex');
  const before=await snapshot();for(let n=0;n<2;n++){await service.handleVerifiedPayoutEvent(event);check('duplicate real provider event has no financial effect '+n,await snapshot()===before);}
  check('reconciler cannot resubmit completed instruction',await service.processWithdrawal(id)==='terminal'&&posts===0);
  check('exactly one paid event consumes reservation once',(await pg.query("select * from creator_money_events where withdrawal_id=$1 and kind='paid'",[id])).rows.length===1&&(await call('creator_payout_account',{p_creator:creator,p_page:1})).available===400);
  fs.writeFileSync(root+'.handler-proof.json',JSON.stringify({checks,realProviderGet:true,realProviderEvent:true,syntheticSaleAndTime:true,hostedWrites:false,payoutPosts:posts,paid:true},null,2));
  console.log(JSON.stringify({checks,realProviderGet:true,isolatedTrustedHandler:true,hostedMatchedWebhook:false,payoutPosts:posts}));
}finally{await pg.close();}
