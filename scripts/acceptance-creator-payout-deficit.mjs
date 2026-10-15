// Synthetic reversal/future earnings applied only to the persistent isolated
// fixture whose $5 payout actually succeeded in Sandbox. Never hosted writes,
// new provider submissions, PayPal debits or production time changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const root=path.join(os.tmpdir(),'sceenyk-creator-payout-acceptance-v1');
const proof=JSON.parse(fs.readFileSync(root+'.acceptance-proof.json','utf8'));
assert.equal(proof.provider.status,'SUCCESS');
const pg=new PGlite(root),one=async(sql,args=[]) =>(await pg.query(sql,args)).rows[0];
const call=async(name,args={})=>(await one(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args))).value;
const scalar=async(sql,args=[]) =>(await one(sql,args)).value;
let checks=0;const check=(name,v)=>{assert.ok(v,name);checks++;console.log(JSON.stringify({passed:name}));};
try{
  const id=(await one('select withdrawal_id from acceptance_fixture_state')).withdrawal_id;
  const w=await one('select * from creator_withdrawals where id=$1',[id]);
  assert.equal(w.status,'paid');assert.equal(w.paypal_batch_id,proof.provider.batchId);
  const originalHash=createHash('sha256').update(JSON.stringify(w)).digest('hex');
  const lot=await one('select * from creator_withdrawal_allocations where withdrawal_id=$1',[id]);
  const p=await one('select * from marketplace_purchases where id=$1',[lot.purchase_id]);
  const account=()=>call('creator_payout_account',{p_creator:w.creator_user_id,p_page:1});
  const reverse=()=>call('marketplace_apply_financial_observation',{p_purchase_id:p.id,p_order_id:p.paypal_order_id,p_capture_id:p.paypal_capture_id,p_amount_minor:p.amount_minor,p_currency:'USD',p_capture_status:'REFUNDED',p_refunded_minor:p.amount_minor,p_can_settle:false,p_reason:'refund',p_reference_key:'synthetic-after-real-payout'});
  await pg.exec('create table if not exists acceptance_deficit_proof(id integer primary key, proof jsonb not null);begin;');
  let retained=await one('select proof from acceptance_deficit_proof where id=1');
  if(!retained){
    const before=await account();check('actual Paid fixture retains valid four-dollar remainder',before.available===400&&before.paid===500);
    await reverse();const debt=await account();check('synthetic full reversal after real payout creates five-dollar deficit',debt.deficit===500&&debt.available===0&&debt.pending===0);
    await pg.exec('savepoint expected_rejection');let rejected=false;
    try{await call('creator_payout_request',{p_creator:w.creator_user_id,p_request:randomUUID(),p_amount:500});}catch{rejected=true;}
    await pg.exec('rollback to savepoint expected_rejection');check('negative creator balance rejects another withdrawal',rejected);
    async function futureSale(gross,n){
      const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Synthetic deficit offset','gaming','1:1','10','Original','Energetic') returning id value",[w.creator_user_id]);
      const listing=randomUUID();await call('marketplace_create_priced',{p_owner_user_id:w.creator_user_id,p_listing_id:listing,p_project_id:project,p_title:'Synthetic future earning',p_description:'Isolated acceptance fixture.',p_category:'gaming',p_tags:[],p_instructions:'Use your own story.',p_publish:true,p_rights_confirmed:true,p_adoption_type:'paid',p_price_minor:gross});
      const next=await call('marketplace_prepare_purchase',{p_buyer_user_id:p.buyer_user_id,p_listing_id:listing,p_fee_bps:1000,p_pricing_version:'marketplace-withdrawal-v1'});
      const order='OFFSETORDER0000'+n,capture='OFFSETCAPTURE00'+n;
      await call('marketplace_attach_order',{p_purchase_id:next.id,p_buyer_user_id:p.buyer_user_id,p_order_id:order});
      await call('marketplace_fulfil_purchase',{p_purchase_id:next.id,p_order_id:order,p_capture_id:capture,p_amount_minor:gross,p_currency:'USD',p_can_available:true});return next.id;
    }
    const sale1=await futureSale(300,1),first=await account();check('future 270-cent earning offsets debt before availability',first.deficit===230&&first.available===0);
    const sale2=await futureSale(500,2),second=await account();check('future 450-cent earning clears debt and exposes only 220 cents',second.deficit===0&&second.available===220);
    await pg.query('insert into acceptance_deficit_proof values(1,$1)',[JSON.stringify({firstDeficit:500,blockedWithdrawal:rejected,sale1,sale2,available:second.available,deficit:second.deficit})]);retained=await one('select proof from acceptance_deficit_proof where id=1');
  }
  const events=()=>pg.query('select * from creator_money_events where creator_user_id=$1 order by id',[w.creator_user_id]);
  const before=JSON.stringify((await events()).rows);await reverse();await reverse();
  check('duplicate synthetic paid reversal creates no additional debt or offsets',JSON.stringify((await events()).rows)===before&&(await account()).available===220&&(await account()).deficit===0);
  check('original actual Paid withdrawal remains immutable',createHash('sha256').update(JSON.stringify(await one('select * from creator_withdrawals where id=$1',[id]))).digest('hex')===originalHash);
  const fee=await one('select sum(fee_minor)::int fee,sum(net_minor)::int net from marketplace_payment_adjustments where purchase_id=$1',[p.id]);check('platform fee and creator reversal remain separate exact cents',fee.fee===100&&fee.net===900);
  await pg.exec('commit');
  fs.writeFileSync(root+'.deficit-proof.json',JSON.stringify({evidence:'real completed Sandbox payout; synthetic reversal and future sales in isolated PostgreSQL only',checks,retained:retained.proof,hostedWrites:false,providerCalls:0},null,2));
  console.log(JSON.stringify({checks,syntheticReversal:true,actualPreviouslyPaid:true,hostedWrites:false,providerCalls:0,available:220,deficit:0}));
}finally{await pg.close();}
