// Actual migrations/SQL, guard, support services/API, shared observation domain,
// Inngest workflow and webhook handler. Clerk/provider delivery/clock are fixtures.
// PGlite serializes one connection: independent hosted contention is separate.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Inngest} from 'inngest';
import {InngestTestEngine} from '@inngest/test';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';
import {typescriptLoader} from './lib/load-typescript.mjs';

const {pg,db,call,one,scalar}=await compositionFixtureDatabase();
let checks=0,sequence=0,gets=0,posts=0;
const logs=[];
const check=(name,value)=>{assert.ok(value,name);checks++;};
const rejects=async(name,work)=>{await assert.rejects(work,undefined,name);checks++;};
const user=async(name='Fixture creator')=>one('insert into app_users(clerk_user_id,first_name) values($1,$2) returning *',[randomUUID(),name]);
const assign=(actor,role)=>pg.query('insert into internal_user_roles(user_id,role) values($1,$2) on conflict(user_id) do update set role=excluded.role',[actor.id,role]);
const row=id=>one('select * from creator_withdrawals where id=$1',[id]);
const balance=id=>call('creator_payout_account',{p_creator:id,p_page:1});
const observer=(p,refund=0)=>call('marketplace_apply_financial_observation',{p_purchase_id:p.id,p_order_id:p.paypal_order_id,p_capture_id:p.paypal_capture_id,p_amount_minor:p.amount_minor,p_currency:'USD',p_capture_status:refund===p.amount_minor?'REFUNDED':refund?'PARTIALLY_REFUNDED':'COMPLETED',p_refunded_minor:refund,p_can_settle:true,p_reason:'refund',p_reference_key:'support-fixture:'+refund});
async function sale(owner,gross=1000){
  const buyer=await user();
  const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Support fixture','gaming','1:1','10','Original','Energetic') returning id value",[owner.id]);
  const listing=randomUUID();
  await call('marketplace_create_priced',{p_owner_user_id:owner.id,p_listing_id:listing,p_project_id:project,p_title:'Payout support fixture',p_description:'Reviewed fixture',p_category:'gaming',p_tags:[],p_instructions:'Use your own story.',p_publish:true,p_rights_confirmed:true,p_adoption_type:'paid',p_price_minor:gross});
  const p=await call('marketplace_prepare_purchase',{p_buyer_user_id:buyer.id,p_listing_id:listing,p_fee_bps:0,p_pricing_version:'ignored-fixture'});
  const suffix=String(++sequence).padStart(12,'0'),order='ORDER'+suffix,capture='CAPTURE'+suffix;
  await call('marketplace_attach_order',{p_purchase_id:p.id,p_buyer_user_id:buyer.id,p_order_id:order});
  await call('marketplace_fulfil_purchase',{p_purchase_id:p.id,p_order_id:order,p_capture_id:capture,p_amount_minor:gross,p_currency:'USD',p_can_available:true});
  const purchase=await one('select * from marketplace_purchases where id=$1',[p.id]);await observer(purchase);
  return purchase;
}
async function request(owner,amount=900,aged=true){
  await call('creator_payout_destination',{p_creator:owner.id,p_email:'recipient@example.test'});
  if(aged)await pg.exec("create function support_clock_fixture() returns trigger language plpgsql as $$ begin new.requested_at=now()-interval '168 hours';new.hold_until=new.requested_at+interval '168 hours';return new;end $$;create trigger support_clock_fixture before insert on creator_withdrawals for each row execute function support_clock_fixture();");
  try{return await call('creator_payout_request',{p_creator:owner.id,p_request:randomUUID(),p_amount:amount});}
  finally{if(aged)await pg.exec('drop trigger support_clock_fixture on creator_withdrawals;drop function support_clock_fixture();');}
}
const batches=new Map();
function providerBatch(w,status='PENDING'){
  return {batch_header:{payout_batch_id:'BATCH'+w.id.replaceAll('-','').toUpperCase(),batch_status:'SUCCESS',sender_batch_header:{sender_batch_id:w.id}},items:[{payout_item_id:'ITEM'+w.id.replaceAll('-','').toUpperCase(),transaction_status:status,payout_item:{sender_item_id:w.id,receiver:w.destination_snapshot,recipient_type:'EMAIL',amount:{currency:'USD',value:(w.submitted_minor/100).toFixed(2)}}}]};
}
async function processing({reference=true,amount=900,gross=1000}={}){
  const creator=await user(),purchase=await sale(creator,gross),id=await request(creator,amount);
  check('fixture uses existing trusted eligibility',await call('creator_payout_eligible',{p_id:id}));
  await call('creator_payout_claim',{p_id:id});
  const w=await row(id),batch=providerBatch(w);batches.set(batch.batch_header.payout_batch_id,batch);
  if(reference)await call('creator_payout_observe',{p_id:id,p_batch:batch.batch_header.payout_batch_id,p_item:batch.items[0].payout_item_id,p_status:'PENDING'});
  return {creator,purchase,id,batch};
}
const setState=(fixture,status)=>{fixture.batch.items[0].transaction_status=status;};
async function financial(id){
  const w=await row(id);
  const values={withdrawal:[w.status,w.requested_minor,w.reserved_minor,w.submitted_minor,w.requested_at,w.hold_until,w.paid_at,w.failed_at],lots:(await pg.query('select * from creator_money_lots where creator_user_id=$1 order by purchase_id',[w.creator_user_id])).rows,allocations:(await pg.query('select * from creator_withdrawal_allocations where withdrawal_id=$1 order by id',[id])).rows,events:(await pg.query('select * from creator_money_events where creator_user_id=$1 order by id',[w.creator_user_id])).rows};
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}
const adapter=typescriptLoader()('lib/marketplace/withdrawals/paypal.ts');
let providerHook;
const provider={...adapter,readPayoutBatch:async id=>{gets++;if(providerHook)await providerHook(id);const batch=batches.get(id);if(!batch)throw Error('PRIVATE_PROVIDER_DIAGNOSTIC');return batch;},submitPayout:async()=>{posts++;throw Error('FORBIDDEN_SUPPORT_PAYOUT_POST');},assertPayoutWebhooksReady:async()=>{}};
const redirectSignal=new Error('NEXT_AUTH_REDIRECT'),notFoundSignal=new Error('NEXT_HTTP_NOT_FOUND');
const navigation={unstable_rethrow:error=>{if(error===redirectSignal||error===notFoundSignal)throw error;},notFound:()=>{throw notFoundSignal;}};
function actorModules(actor,{database=db,guardOverride}={}){
  const identity={ensureAppUser:async()=>{if(!actor)throw redirectSignal;return {...actor,role:'admin'};}};
  const stubs={'next/navigation':navigation,'@/lib/db/server':{createDatabaseClient:()=>database},'@/lib/auth/ensure-app-user':identity,'./ensure-app-user':identity,'./paypal':provider,'@/lib/payments/paypal/config':{getPayPalConfig:()=>({baseUrl:'https://api-m.sandbox.paypal.com'})}};
  if(guardOverride)stubs['@/lib/auth/require-admin-or-support']={...typescriptLoader(stubs)('lib/auth/require-admin-or-support.ts'),requireAdminOrSupport:guardOverride};
  const load=typescriptLoader(stubs,{Request,Response,console:{...console,warn:(...args)=>logs.push(JSON.stringify(args))}});
  return {load,service:load('lib/payout-support/server.ts'),route:load('app/api/admin/payouts/reconcile/route.ts')};
}
const post=(route,input,headers={origin:'https://fixture.invalid'})=>route.POST(new Request('https://fixture.invalid/api/admin/payouts/reconcile',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof input==='string'?input:JSON.stringify(input)}));

try{
  const admin=await user('Internal admin'),secondAdmin=await user('Second admin'),support=await user('Support operator'),ordinary=await user('Ordinary user');
  await assign(admin,'admin');await assign(secondAdmin,'admin');await assign(support,'support');
  const adminModules=actorModules(admin),staff=adminModules.service;
  const sample=await processing();
  for(const actor of [ordinary,null]){
    const modules=actorModules(actor),before=gets;
    if(actor){
      await rejects('ordinary cannot read queue',()=>modules.service.getPayoutSupportQueue({}));
      await rejects('ordinary cannot inspect other creator detail',()=>modules.service.getPayoutSupportDetail({id:sample.id}));
      const denied=await post(modules.route,{withdrawalId:sample.id,role:'admin'});
      check('ordinary direct API denied before body/lookup',denied.status===403&&(await denied.text()).includes('Internal access denied'));
      await assert.rejects(()=>modules.load('lib/payout-support/page-read.ts').readSupportPage(()=>modules.service.getPayoutSupportDetail({id:sample.id})),e=>e===notFoundSignal);checks++;
    }else{await assert.rejects(()=>post(modules.route,{withdrawalId:sample.id}),e=>e===redirectSignal);checks++;}
    check('unauthorized requests never query PayPal',gets===before);
  }
  const forced=actorModules(ordinary,{guardOverride:async()=>({userId:ordinary.id,clerkUserId:ordinary.clerk_user_id,role:'admin'})});
  await rejects('database independently refuses an ordinary actor even if app guard regresses',()=>forced.service.getPayoutSupportQueue({}));
  const detail=await staff.getPayoutSupportDetail({id:sample.id});
  check('admin detail masks payout recipient',detail.destination==='r***@e***'&&!JSON.stringify(detail).includes('recipient@example.test'));
  check('admin sees persisted provider refs',detail.batchId===sample.batch.batch_header.payout_batch_id&&detail.itemId===sample.batch.items[0].payout_item_id);
  check('detail has backing allocations and accounting history',detail.allocations.originalTotal===900&&detail.allocations.remainingTotal===900&&detail.history.items.length>0);
  check('historical submission timestamp stays unknown',detail.withdrawal.submissionAcknowledgedAt===null);
  check('detail view itself is audited',detail.audit.items.some(e=>e.action==='detail_view'&&e.actorId===admin.id));
  check('support can read same authorized queue',(await actorModules(support).service.getPayoutSupportQueue({})).items.some(w=>w.id===sample.id));
  const queueCreator=await user('Queue support tester');await sale(queueCreator,10000);
  const pendingIds=[];for(let i=0;i<13;i++)pendingIds.push(await request(queueCreator,500,false));
  const q1=await staff.getPayoutSupportQueue({query:'Queue support tester',page:1}),q2=await staff.getPayoutSupportQueue({query:'Queue support tester',page:2});
  check('queue is bounded and paginated',q1.total===13&&q1.items.length===12&&q2.items.length===1&&!q1.items.some(a=>q2.items.some(b=>a.id===b.id)));
  check('search matches safe withdrawal reference',(await staff.getPayoutSupportQueue({query:sample.id})).total===1);
  check('search matches persisted payout reference',(await staff.getPayoutSupportQueue({query:detail.batchId})).total===1);
  check('literal wildcard characters are not broad query operators',(await staff.getPayoutSupportQueue({query:'%_'})).total===0);
  for(const field of [{actor:admin.id},{status:'all; drop table'},{query:'x'.repeat(121)},{page:0}])await rejects('queue rejects unsafe/invalid fields',()=>staff.getPayoutSupportQueue(field));
  for(const field of [{role:'admin'},{creator:sample.creator.id},{status:'paid'},{amount:999999},{batchId:'FORGED'},{itemId:'FORGED'},{holdUntil:'2000-01-01'},{restore:true}]){
    const before=gets;const invalid=await post(adminModules.route,{withdrawalId:sample.id,...field});
    check('reconciliation rejects injected '+Object.keys(field)[0],invalid.status===400&&gets===before);
  }
  check('cross-origin support POST denied',(await post(adminModules.route,{withdrawalId:sample.id},{origin:'https://attacker.invalid'})).status===403);
  check('cookie request without Origin denied',(await post(adminModules.route,{withdrawalId:sample.id},{})).status===403);
  check('malformed JSON denied',(await post(adminModules.route,'{')).status===400);
  check('oversized body rejected',(await post(adminModules.route,JSON.stringify({withdrawalId:sample.id,padding:'x'.repeat(2000)}))).status===400);
  const beforePending=gets;
  const noSubmit=await staff.reconcileSupportPayout({withdrawalId:pendingIds[0]});
  check('support never submits pending withdrawal',noSubmit.outcome==='not_submitted'&&gets===beforePending&&(await row(pendingIds[0])).status==='pending');
  const eligibleOwner=await user(),eligibleSale=await sale(eligibleOwner),eligibleId=await request(eligibleOwner);
  assert.ok(eligibleSale);await call('creator_payout_eligible',{p_id:eligibleId});
  check('support never claims/submits eligible withdrawal',(await staff.reconcileSupportPayout({withdrawalId:eligibleId})).outcome==='not_submitted'&&(await row(eligibleId)).status==='eligible'&&posts===0);
  const missing=await processing({reference:false}),missingBefore=await financial(missing.id),missingGets=gets;
  const missingResult=await staff.reconcileSupportPayout({withdrawalId:missing.id});
  check('missing reference safely flagged without GET or send',missingResult.outcome==='needs_review'&&missingResult.message==='Provider reference missing. Manual provider investigation required.'&&gets===missingGets&&await financial(missing.id)===missingBefore);
  check('review filter includes missing processing reference',(await staff.getPayoutSupportQueue({status:'review'})).items.some(w=>w.id===missing.id));
  for(const status of ['PENDING','PROCESSING','ONHOLD','UNCLAIMED','FUTURE_STATE','REFUNDED']){
    setState(sample,status);const before=await financial(sample.id);
    const result=await staff.reconcileSupportPayout({withdrawalId:sample.id});
    check(status+' preserves financial state',await financial(sample.id)===before&&result.outcome===(['FUTURE_STATE','REFUNDED'].includes(status)?'needs_review':'processing'));
  }
  const originalReceiver=sample.batch.items[0].payout_item.receiver;sample.batch.items[0].payout_item.receiver='wrong@example.test';
  const mismatchBefore=await financial(sample.id);check('receiver mismatch cannot affect money',(await staff.reconcileSupportPayout({withdrawalId:sample.id})).outcome==='needs_review'&&await financial(sample.id)===mismatchBefore);sample.batch.items[0].payout_item.receiver=originalReceiver;
  const originalAmount=sample.batch.items[0].payout_item.amount.value;sample.batch.items[0].payout_item.amount.value='0.01';check('frozen amount mismatch rejected',(await staff.reconcileSupportPayout({withdrawalId:sample.id})).outcome==='needs_review'&&await financial(sample.id)===mismatchBefore);sample.batch.items[0].payout_item.amount.value=originalAmount;
  const originalItem=sample.batch.items[0];sample.batch.items=[];
  check('missing established item requires review, never batch-success finalization',(await staff.reconcileSupportPayout({withdrawalId:sample.id})).outcome==='needs_review'&&await financial(sample.id)===mismatchBefore);sample.batch.items=[originalItem];
  const originalSender=originalItem.payout_item.sender_item_id;originalItem.payout_item.sender_item_id=randomUUID();
  check('item sender mismatch preserves finance',(await staff.reconcileSupportPayout({withdrawalId:sample.id})).outcome==='needs_review'&&await financial(sample.id)===mismatchBefore);originalItem.payout_item.sender_item_id=originalSender;
  const originalBatchSender=sample.batch.batch_header.sender_batch_header.sender_batch_id;sample.batch.batch_header.sender_batch_header.sender_batch_id=randomUUID();
  check('batch sender mismatch requires review',(await staff.reconcileSupportPayout({withdrawalId:sample.id})).outcome==='needs_review'&&await financial(sample.id)===mismatchBefore);sample.batch.batch_header.sender_batch_header.sender_batch_id=originalBatchSender;
  const classifier=adminModules.load('lib/marketplace/withdrawals/reconciliation.ts');
  const submittedNoItem=providerBatch(await row(missing.id));submittedNoItem.items=[];
  const pendingAcceptance=classifier.payoutObservation(await row(missing.id),submittedNoItem,true);
  check('accepted submission without item retains verified batch without guessing Paid',pendingAcceptance.apply&&pendingAcceptance.batchId===submittedNoItem.batch_header.payout_batch_id&&pendingAcceptance.outcome==='needs_review'&&pendingAcceptance.providerStatus==='BATCH_SUCCESS');
  const deniedAcceptance={...submittedNoItem,batch_header:{...submittedNoItem.batch_header,batch_status:'DENIED'}};
  check('POST batch denial never releases from an acceptance response',classifier.payoutObservation(await row(missing.id),deniedAcceptance,true).providerStatus==='BATCH_DENIED');
  const attempt=await adminModules.load('lib/marketplace/withdrawals/observations.ts').beginPayoutCheck(sample.id,'support',admin.id);
  const directIdEdit=await db.rpc('payout_support_check_finish',{p_attempt:attempt.attempt,p_actor:admin.id,p_batch:'FORGEDBATCH',p_item:originalItem.payout_item_id,p_status:'SUCCESS',p_outcome:'paid',p_reason:'provider_success',p_apply:true});
  check('SQL refuses support reference editing',Boolean(directIdEdit.error)&&await financial(sample.id)===mismatchBefore);
  providerHook=async()=>{throw Error('PRIVATE_PROVIDER_DIAGNOSTIC')};
  const unavailable=await post(adminModules.route,{withdrawalId:sample.id});
  check('network failure returns clear safe result with no financial effect',unavailable.status===200&&(await unavailable.text()).includes('Provider unavailable')&&await financial(sample.id)===mismatchBefore);providerHook=undefined;
  setState(sample,'SUCCESS');
  providerHook=async id=>{const w=[...batches.values()].find(batch=>batch.batch_header.payout_batch_id===id);check('audit attempt exists before provider read',await scalar("select count(*)::int value from payout_support_events where withdrawal_id=$1 and action='check_started'",[w.batch_header.sender_batch_header.sender_batch_id])>0);};
  const duplicates=await Promise.all([staff.reconcileSupportPayout({withdrawalId:sample.id}),actorModules(secondAdmin).service.reconcileSupportPayout({withdrawalId:sample.id}),actorModules(support).service.reconcileSupportPayout({withdrawalId:sample.id})]);providerHook=undefined;
  check('duplicate clicks/multiple operators finalize Paid once',duplicates.every(r=>r.outcome==='paid')&&await scalar("select count(*)::int value from creator_money_events where withdrawal_id=$1 and kind='paid'",[sample.id])===1);
  check('finalization never debits available twice',(await balance(sample.creator.id)).available===0&&(await balance(sample.creator.id)).paid===900);
  const paidBefore=await financial(sample.id);await staff.reconcileSupportPayout({withdrawalId:sample.id});check('repeat Paid check has no financial effect',await financial(sample.id)===paidBefore);
  setState(sample,'RETURNED');await staff.reconcileSupportPayout({withdrawalId:sample.id});await staff.reconcileSupportPayout({withdrawalId:sample.id});
  check('post-Paid return retains Paid and never restores funds',(await row(sample.id)).status==='paid'&&(await balance(sample.creator.id)).available===0&&await scalar("select count(*)::int value from creator_money_events where withdrawal_id=$1 and kind='provider_returned'",[sample.id])===1);
  for(const status of ['FAILED','DENIED','BLOCKED','CANCELED','RETURNED']){
    const f=await processing();setState(f,status);await staff.reconcileSupportPayout({withdrawalId:f.id});const before=await financial(f.id);await staff.reconcileSupportPayout({withdrawalId:f.id});
    check(status+' restores valid funds exactly once',(await row(f.id)).status==='failed'&&(await balance(f.creator.id)).available===900&&await financial(f.id)===before&&await scalar("select count(*)::int value from creator_money_events where withdrawal_id=$1 and kind='released'",[f.id])===1);
  }
  const adjusted=await processing();await observer(adjusted.purchase,100);setState(adjusted,'FAILED');await staff.reconcileSupportPayout({withdrawalId:adjusted.id});
  check('failure restores only remaining valid backing after refund',(await balance(adjusted.creator.id)).available===810);
  const conflictBefore=await financial(adjusted.id);setState(adjusted,'SUCCESS');
  check('SUCCESS after local failure requires review without override',(await staff.reconcileSupportPayout({withdrawalId:adjusted.id})).outcome==='needs_review'&&await financial(adjusted.id)===conflictBefore);
  const fault=await processing();setState(fault,'SUCCESS');const faultBefore=await financial(fault.id);
  await pg.exec("create function fail_support_audit_fixture() returns trigger language plpgsql as $$ begin if new.action='check_finished' then raise exception 'PRIVATE_AUDIT_FAILURE';end if;return new;end $$;create trigger fail_support_audit_fixture before insert on payout_support_events for each row execute function fail_support_audit_fixture();");
  const failedAudit=await post(adminModules.route,{withdrawalId:fault.id});
  check('audit outcome failure rolls back Paid/accounting',failedAudit.status===503&&await financial(fault.id)===faultBefore);
  await pg.exec('drop trigger fail_support_audit_fixture on payout_support_events;drop function fail_support_audit_fixture();');
  await staff.reconcileSupportPayout({withdrawalId:fault.id});check('retry after audit recovery finalizes once',await scalar("select count(*)::int value from creator_money_events where withdrawal_id=$1 and kind='paid'",[fault.id])===1);
  const noAuditDb={...db,rpc:async(name,args)=>name==='payout_support_check_begin'?{data:null,error:{code:'XX000',message:'PRIVATE_AUDIT_FAILURE'}}:db.rpc(name,args)};
  const noAuditBefore=gets;check('missing audit store prevents provider lookup',(await post(actorModules(admin,{database:noAuditDb}).route,{withdrawalId:fault.id})).status===503&&gets===noAuditBefore);
  const revoked=await processing();setState(revoked,'SUCCESS');const revokedBefore=await financial(revoked.id);
  providerHook=async()=>{await assign(admin,'user');};
  const deniedFinish=await post(adminModules.route,{withdrawalId:revoked.id});providerHook=undefined;
  check('revocation during provider GET denies commit and preserves money',deniedFinish.status===403&&await financial(revoked.id)===revokedBefore);
  check('in-flight revocation has append-only denied audit',await scalar("select count(*)::int value from payout_support_events where withdrawal_id=$1 and action='check_finished' and outcome='denied' and reason='role_revoked'",[revoked.id])===1);await assign(admin,'admin');
  const concurrent=await processing();setState(concurrent,'SUCCESS');
  const worker=adminModules.load('lib/marketplace/withdrawals/server.ts');
  const hook=typescriptLoader({'@/lib/marketplace/withdrawals/server':worker,'@/lib/payments/paypal/client':{verifyPayPalWebhook:async()=>true},'@/lib/payments/server':{handleVerifiedPayPalEvent:async()=>false},'@/lib/marketplace/payments/server':{handleVerifiedMarketplacePayPalEvent:async()=>{}}},{Request,Response})('app/api/payments/paypal/webhook/route.ts');
  const scheduled=typescriptLoader({'./client':{inngest:new Inngest({id:'payout-support-fixture',isDev:true})},'@/lib/db/server':{createDatabaseClient:()=>({rpc:async()=>({data:[concurrent.id],error:null})})},'@/lib/marketplace/withdrawals/server':worker})('lib/workflows/creator-payouts.ts').creatorPayoutReconciliation;
  const deliveries=await Promise.all([staff.reconcileSupportPayout({withdrawalId:concurrent.id}),new InngestTestEngine({function:scheduled,events:[{name:'inngest/scheduled.timer',data:{}}]}).execute(),hook.POST(new Request('https://fixture.invalid/api/payments/paypal/webhook',{method:'POST',body:JSON.stringify({event_type:'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',resource:{payout_batch_id:concurrent.batch.batch_header.payout_batch_id}})}))]);
  check('support + actual Inngest + authenticated webhook have one financial effect',deliveries[2].status===200&&(await row(concurrent.id)).status==='paid'&&await scalar("select count(*)::int value from creator_money_events where withdrawal_id=$1 and kind='paid'",[concurrent.id])===1);
  const concurrencyBefore=await financial(concurrent.id);await worker.processWithdrawal(concurrent.id);await staff.reconcileSupportPayout({withdrawalId:concurrent.id});check('worker/manual later replays are harmless',await financial(concurrent.id)===concurrencyBefore);
  const manyAudits=await staff.getPayoutSupportDetail({id:sample.id,auditPage:2});
  check('audit history pagination bounded',manyAudits.audit.items.length<=25&&manyAudits.audit.total>25);
  check('all source checks produce distinct immutable audit attempts',await scalar("select count(*)::int value from payout_support_events where withdrawal_id=$1 and source='support' and action='check_finished'",[sample.id])>=10);
  check('no raw diagnostic stored in audit',!(await pg.query('select * from payout_support_events')).rows.some(e=>JSON.stringify(e).includes('PRIVATE_')));
  for(const who of ['anon','authenticated','service_role']){
    await pg.exec('set role '+who);
    for(const sql of ["insert into payout_support_events(attempt_id,source,action,outcome,reason) values(gen_random_uuid(),'worker','check_started','started','check_started')","update payout_support_events set reason='viewed'","delete from payout_support_events","truncate payout_support_events"])await rejects(who+' cannot mutate audit',()=>pg.exec(sql));
    if(who!=='service_role'){
      await rejects(who+' cannot read internal audit',()=>pg.query('select * from payout_support_events'));
      await rejects(who+' cannot bypass support route through RPC',()=>pg.query("select payout_support_queue($1,'','all',1)",[admin.id]));
    }
    await rejects(who+' cannot call private detail projection',()=>pg.query('select payout_support_summary($1)',[sample.id]));
    await pg.exec('reset role');
  }
  for(const sql of ["update payout_support_events set reason='viewed'","delete from payout_support_events","truncate payout_support_events"])await rejects('table-owner routine history rewrite blocked',()=>pg.exec(sql));
  const roleDenied=await db.rpc('payout_support_check_begin',{p_id:sample.id,p_attempt:randomUUID(),p_source:'support',p_actor:ordinary.id,p_submission:false});check('private RPC requires trusted support role',roleDenied.error?.code==='42501');
  const invalidSource=await db.rpc('payout_support_check_begin',{p_id:sample.id,p_attempt:randomUUID(),p_source:'support',p_actor:admin.id,p_submission:true});check('human cannot declare a submission observation',Boolean(invalidSource.error));
  check('no support path ever calls payout creation',posts===0);
  check('AI balances/allowances/credits untouched',await scalar('select count(*)::int value from generation_accounts where free_total<>2 or free_reserved<>0 or free_consumed<>0 or credit_available<>0 or credit_reserved<>0')===0);
  check('financial lot equations still reconcile',await scalar('select bool_and(creator_money_consistent(id)) value from app_users')===true);
  check('denial logs are safe and contain no identity/provider diagnostics',logs.length>0&&logs.every(line=>!line.includes('PRIVATE_')&&!line.includes(admin.id)&&!line.includes(sample.id)));
  console.log(JSON.stringify({passed:checks,providerGets:gets,payoutPosts:posts,sql:'actual migrations + financial/audit RPCs',concurrency:'actual manual/Inngest/webhook paths; PGlite single-connection serialization; hosted contention separate',authentication:'explicit Clerk request fixture; actual role storage/guard'}));
}finally{await pg.close();}
