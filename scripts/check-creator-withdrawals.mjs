// Actual PostgreSQL functions. Provider/time/auth are explicitly isolated fixtures.
// PGlite is single-connection; simultaneous promises verify serial transaction
// outcomes, not independent hosted connection contention.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {Inngest} from 'inngest';
import {InngestTestEngine} from '@inngest/test';
const {pg,db,call,one,scalar}=await compositionFixtureDatabase();
let checks=0,sequence=0;
const check=(name,value)=>{assert.ok(value,name);checks++;};
const rejects=async(name,fn)=>{await assert.rejects(fn,undefined,name);checks++;};
const creator=()=>scalar('insert into app_users(clerk_user_id) values($1) returning id value',[randomUUID()]);
const account=id=>call('creator_payout_account',{p_creator:id,p_page:1});
const destination=id=>call('creator_payout_destination',{p_creator:id,p_email:'creator@example.test'});
const request=(id,amount,key=randomUUID())=>call('creator_payout_request',{p_creator:id,p_request:key,p_amount:amount});
const row=id=>one('select * from creator_withdrawals where id=$1',[id]);
async function sale(owner,gross=2000,clear=true) {
  const buyer=await creator();
  const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Lot fixture','gaming','1:1','10','Original','Energetic') returning id value",[owner]);
  const listing=randomUUID();
  await call('marketplace_create_priced',{p_owner_user_id:owner,p_listing_id:listing,p_project_id:project,p_title:'Withdrawal fixture',p_description:'Reviewed configuration.',p_category:'gaming',p_tags:[],p_instructions:'Use your own story.',p_publish:true,p_rights_confirmed:true,p_adoption_type:'paid',p_price_minor:gross});
  let p=await call('marketplace_prepare_purchase',{p_buyer_user_id:buyer,p_listing_id:listing,p_fee_bps:0,p_pricing_version:'browser_cannot_choose_fee'});
  const n=String(++sequence).padStart(12,'0'),order='ORDER'+n,capture='CAPTURE'+n;
  await call('marketplace_attach_order',{p_purchase_id:p.id,p_buyer_user_id:buyer,p_order_id:order});
  check('verified capture commits',await call('marketplace_fulfil_purchase',{p_purchase_id:p.id,p_order_id:order,p_capture_id:capture,p_amount_minor:gross,p_currency:'USD',p_can_available:clear}));
  p=await one('select * from marketplace_purchases where id=$1',[p.id]);
  check('new intents freeze ten percent fee',p.fee_bps===1000&&p.creator_net_minor===gross-Math.floor(gross/10)&&p.pricing_version==='marketplace-withdrawal-v1');
  if(clear)await observe(p);
  return p;
}
const observe=(p,refund=0,clear=true)=>call('marketplace_apply_financial_observation',{
  p_purchase_id:p.id,p_order_id:p.paypal_order_id,p_capture_id:p.paypal_capture_id,p_amount_minor:p.amount_minor,p_currency:'USD',
  p_capture_status:refund===p.amount_minor?'REFUNDED':refund?'PARTIALLY_REFUNDED':'COMPLETED',p_refunded_minor:refund,p_can_settle:clear,p_reason:'refund',p_reference_key:'fixture:'+refund,
});
async function agedRequest(owner,amount,age='168 hours') {
  // This trigger exists only inside the disposable test database. Production
  // RPC has no time parameter and production identity/hold guards are untouched.
  await pg.exec(`create function withdrawal_time_fixture() returns trigger language plpgsql as $$ begin new.requested_at=now()-interval '${age}'; new.hold_until=new.requested_at+interval '168 hours'; return new; end $$;
    create trigger withdrawal_time_fixture before insert on creator_withdrawals for each row execute function withdrawal_time_fixture();`);
  try{return await request(owner,amount);}finally{await pg.exec('drop trigger withdrawal_time_fixture on creator_withdrawals; drop function withdrawal_time_fixture();');}
}
const eligible=id=>call('creator_payout_eligible',{p_id:id});
const claim=id=>call('creator_payout_claim',{p_id:id});
const provider=(id,status='SUCCESS')=>call('creator_payout_observe',{p_id:id,p_batch:'BATCH'+id.replaceAll('-','').toUpperCase(),p_item:'ITEM'+id.replaceAll('-','').toUpperCase(),p_status:status});
try {
  const a=await creator(),b=await creator();await destination(a);await destination(b);
  const blockedOwner=await creator();await destination(blockedOwner);const blockedSale=await sale(blockedOwner,1000,false);
  check('known refund blocks new-sale availability',(await account(blockedOwner)).available===0);
  await observe(blockedSale,0,false);check('blocked provider evidence cannot settle new sale',(await account(blockedOwner)).available===0);
  await observe(blockedSale);check('clear trusted evidence makes new sale available without sale hold',(await account(blockedOwner)).available===900);
  await rejects('no funds rejects',()=>request(a,500));
  const small=await sale(a,500);check('new verified sale immediately available',(await account(a)).available===450);
  await rejects('less than minimum balance rejects',()=>request(a,500));
  await rejects('less than minimum request rejects',()=>request(a,499));
  await observe(small,500);
  const p=await sale(a);const key=randomUUID(),w=await request(a,1500,key),initial=await row(w);
  check('exact request starts exact 168-hour hold',new Date(initial.hold_until)-new Date(initial.requested_at)===604800000);
  check('atomic available to pending',(await account(a)).available===300&&(await account(a)).pending===1500);
  check('same request returns same reservation',await request(a,1500,key)===w);
  await rejects('changed amount with same key conflicts',()=>request(a,500,key));
  await rejects('reserved funds cannot be requested twice',()=>request(a,500));
  check('another creator cannot spend A earnings',(await account(b)).available===0);
  await rejects('another creator cannot reserve A funds',()=>request(b,1500));
  check('other creator history and destination isolated',(await account(b)).history.length===0&&(await account(b)).email==='creator@example.test');
  check('before hold eligibility false',await eligible(w)===false);
  check('before hold claim impossible',await claim(w)===null);
  await call('creator_payout_destination',{p_creator:a,p_email:'changed@example.test'});
  check('destination snapshot immutable',(await row(w)).destination_snapshot==='creator@example.test');
  for(const sql of ["update creator_withdrawals set hold_until=now()", "update creator_withdrawals set reserved_minor=-1", "update creator_withdrawals set destination_snapshot='other@example.test'", 'delete from creator_money_events']) await rejects('database rejects tamper '+sql,()=>pg.exec(sql));
  await observe(p,100);check('refund reduces exact reservation',(await row(w)).reserved_minor===1410);
  check('refund keeps request/hold timestamps',(await row(w)).requested_at.getTime()===initial.requested_at.getTime()&&(await row(w)).hold_until.getTime()===initial.hold_until.getTime());
  await observe(p,100);check('duplicate refund has no effect',(await row(w)).reserved_minor===1410);
  await observe(p,1500);check('below minimum fails and restores valid remainder once',(await row(w)).status==='failed'&&(await account(a)).available===450&&(await account(a)).pending===0);
  await observe(p,1500);check('repeat failure/refund cannot release twice',(await account(a)).available===450);
  await observe(p,2000);check('full reversal retains no available funds',(await account(a)).available===0);

  const split=await creator();await destination(split);const sp=await sale(split);const s1=await request(split,800),s2=await request(split,800);
  await observe(sp,100);check('split earning adjusts oldest pending reservation first',(await row(s1)).reserved_minor===710&&(await row(s2)).reserved_minor===800);
  check('explicit reservation-to-sale allocations exist',await scalar('select count(*)::int value from creator_withdrawal_allocations where purchase_id=$1',[sp.id])===2);
  const c=await creator();await destination(c);await sale(c);
  const race=await Promise.allSettled([request(c,1000),request(c,1000)]);
  check('simultaneous intents reserve at most available',race.filter(r=>r.status==='fulfilled').length===1&&(await account(c)).available===800);

  const expired=await creator();await destination(expired);const ep=await sale(expired);
  const at=await agedRequest(expired,1000);
  await observe(ep,0,false);check('pending provider refund blocks expired hold',await eligible(at)===false);
  await call('creator_payout_refund_observe',{p_purchase:ep.id,p_refund:'REFUND0000000001',p_pending:true});
  await observe(ep);check('capture-only completion cannot clear known pending refund',await eligible(at)===false);
  await call('creator_payout_refund_observe',{p_purchase:ep.id,p_refund:'REFUND0000000001',p_pending:false});
  await observe(ep);check('exact seven-day boundary permits eligible',await eligible(at)===true);
  const cl=await claim(at);check('eligible atomically freezes instruction',cl.status==='processing'&&cl.submitted_minor===1000);
  check('duplicate claims cannot submit twice',await claim(at)===null);
  check('submission acceptance is not paid',await provider(at,'PENDING')&&(await row(at)).status==='processing');
  check('trusted completion finalizes exactly once',await provider(at)&&(await row(at)).status==='paid');
  check('duplicate completion has no ledger effect',await provider(at)===false&&await scalar("select count(*)::int value from creator_money_events where withdrawal_id=$1 and kind='paid'",[at])===1);
  check('paid does not subtract available again',(await account(expired)).available===800&&(await account(expired)).pending===0);

  const debtOwner=await creator();await destination(debtOwner);const dp=await sale(debtOwner);const dw=await agedRequest(debtOwner,1800);
  await claim(dw);await provider(dw);await observe(dp,2000);
  check('paid reversal creates exact creator deficit',(await account(debtOwner)).deficit===1800&&(await account(debtOwner)).available===0);
  await rejects('negative creator balance blocks withdrawals',()=>request(debtOwner,500));
  await sale(debtOwner,1000);check('future earnings first offset deficit',(await account(debtOwner)).deficit===900&&(await account(debtOwner)).available===0);
  await sale(debtOwner,2000);check('only remainder of future earnings becomes available',(await account(debtOwner)).deficit===0&&(await account(debtOwner)).available===900);
  await observe(dp,2000);check('duplicate paid reversal creates no debt twice',(await account(debtOwner)).available===900);

  const uncertain=await creator();await destination(uncertain);const up=await sale(uncertain);const uw=await agedRequest(uncertain,1800);
  await claim(uw);await observe(up,100);
  check('processing refund freezes submitted amount',(await row(uw)).submitted_minor===1800&&(await row(uw)).reserved_minor===1800&&(await account(uncertain)).deficit===0);
  await provider(uw);check('processing refund becomes debt only on success',(await account(uncertain)).deficit===90);
  const failed=await creator();await destination(failed);const fp=await sale(failed);const fw=await agedRequest(failed,1800);
  await claim(fw);await observe(fp,100);await provider(fw,'FAILED');
  check('definitive failure restores only still-valid reservation',(await account(failed)).available===1710&&(await account(failed)).deficit===0);
  await provider(fw,'FAILED');check('duplicate failure restores once',(await account(failed)).available===1710);
  const zero=await creator();await destination(zero);const zp=await sale(zero);const zw=await request(zero,1800);await observe(zp,2000);
  check('zeroed withdrawal closes without returning reversed funds',(await row(zw)).status==='failed'&&(await account(zero)).available===0&&await scalar("select count(*)::int value from creator_money_events where withdrawal_id=$1 and kind='released'",[zw])===0);
  const edge=await creator();await destination(edge);await sale(edge);
  await pg.exec('begin'); // Freeze PostgreSQL now() at the exact fixture boundary.
  const ew=await agedRequest(edge,1800,'167 hours 59 minutes 59 seconds');
  check('one second before seven-day boundary is ineligible',await eligible(ew)===false&&await claim(ew)===null);
  await pg.exec('commit');

  // Server identity is explicit auth fixture; actual DB is used by actions/services.
  let active={id:a,clerk_user_id:'fixture_A'};
  const load=typescriptLoader({'@/lib/db/server':{createDatabaseClient:()=>db},'@/lib/auth/ensure-app-user':{ensureAppUser:async()=>active},'@/lib/payments/paypal/config':{getPayPalConfig:()=>({})}});
  const service=load('lib/marketplace/withdrawals/server.ts');
  await rejects('browser cannot inject owner into withdrawal',()=>service.requestWithdrawal({creator:a,requestId:randomUUID(),amountMinor:500}));
  await rejects('browser cannot shorten hold',()=>service.requestWithdrawal({requestId:randomUUID(),amountMinor:500,holdUntil:'past'}));
  await rejects('server validates payout email',()=>service.savePayoutDestination({email:'not an email'}));
  active={id:b,clerk_user_id:'fixture_B'};check('server read derives authenticated owner',(await service.getWithdrawalAccount()).account.history.length===0);
  const adapter=typescriptLoader()('lib/marketplace/withdrawals/paypal.ts');
  const savedFlag=process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED;
  const batches=new Map();let posts=0,mode='normal',setupReady=true;const inspectedLots=[];
  function batchFor(w,status='PENDING') { return {batch_header:{payout_batch_id:'BATCH'+w.id.replaceAll('-','').toUpperCase(),batch_status:'SUCCESS',sender_batch_header:{sender_batch_id:w.id}},items:[{payout_item_id:'ITEM'+w.id.replaceAll('-','').toUpperCase(),transaction_status:status,payout_item:{sender_item_id:w.id,receiver:w.destination_snapshot,recipient_type:'EMAIL',amount:{currency:'USD',value:(w.submitted_minor/100).toFixed(2)}}}]}; }
  const liveService=typescriptLoader({
    '@/lib/db/server':{createDatabaseClient:()=>db}, '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>active},
    '@/lib/payments/paypal/config':{getPayPalConfig:()=>({})},
    '../earnings/server':{reconcileMarketplaceFinancials:async id=>{inspectedLots.push(id);const p=await one('select * from marketplace_purchases where id=$1',[id]);await observe(p);}},
    './paypal':{...adapter,assertPayoutWebhooksReady:async()=>{if(!setupReady)throw Error('setup missing');},submitPayout:async w=>{posts++;if(mode==='rejected')throw new adapter.PayoutRejected('INSUFFICIENT_FUNDS');const value=batchFor(w);batches.set(value.batch_header.payout_batch_id,value);if(mode==='ambiguous')throw Error('fixture timeout');return value;},readPayoutBatch:async id=>batches.get(id)},
  })('lib/marketplace/withdrawals/server.ts');
  try {
    const flowOwner=await creator();await destination(flowOwner);await sale(flowOwner);const flowId=await agedRequest(flowOwner,1800);
    delete process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED;
    check('missing manual enablement prevents any payout',await liveService.processWithdrawal(flowId)==='sandbox_setup_required'&&posts===0);
    process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED='sandbox-confirmed';
    setupReady=false;await rejects('enable flag cannot bypass missing webhook setup',()=>liveService.processWithdrawal(flowId));
    check('setup failure leaves withdrawal eligible without submission',(await row(flowId)).status==='eligible'&&posts===0);setupReady=true;
    check('server sends exactly one instruction',await liveService.processWithdrawal(flowId)==='submitted'&&posts===1);
    await liveService.processWithdrawal(flowId);check('processing retry only reads existing batch',posts===1&&(await row(flowId)).status==='processing');
    const full=await row(flowId),flowBatch=batches.get(full.paypal_batch_id);flowBatch.items[0].transaction_status='SUCCESS';
    const payoutEvent={event_type:'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',resource:{payout_batch_id:full.paypal_batch_id}};
    await liveService.handleVerifiedPayoutEvent(payoutEvent);await liveService.handleVerifiedPayoutEvent(payoutEvent);
    check('provider GET and duplicate webhook finalize once',(await row(flowId)).status==='paid'&&posts===1);
    flowBatch.items[0].transaction_status='REFUNDED';
    await liveService.handleVerifiedPayoutEvent({event_type:'PAYMENT.PAYOUTS-ITEM.REFUNDED',resource:{payout_batch_id:full.paypal_batch_id}});
    await liveService.handleVerifiedPayoutEvent({event_type:'PAYMENT.PAYOUTS-ITEM.REFUNDED',resource:{payout_batch_id:full.paypal_batch_id}});
    check('paid return is immutable support evidence, no automatic re-credit',(await row(flowId)).status==='paid'&&(await account(flowOwner)).available===0&&(await account(flowOwner)).history[0].reviewRequired===true);
    check('duplicate paid-return observation has one event',await scalar("select count(*)::int value from creator_money_events where withdrawal_id=$1 and kind='provider_returned'",[flowId])===1);
    const mismatched=structuredClone(flowBatch);mismatched.items[0].payout_item.receiver='attacker@example.test';
    assert.throws(()=>adapter.verifyPayout(full,mismatched));checks++;
    const unsafeAmount=structuredClone(flowBatch);unsafeAmount.items[0].payout_item.amount.value='0.01';
    assert.throws(()=>adapter.verifyPayout(full,unsafeAmount));checks++;
    const otherId=structuredClone(flowBatch);otherId.items[0].payout_item.sender_item_id=randomUUID();assert.throws(()=>adapter.verifyPayout(full,otherId));checks++;
    const lostOwner=await creator();await destination(lostOwner);await sale(lostOwner);const lostId=await agedRequest(lostOwner,1800);
    mode='ambiguous';check('unknown submission stays processing',await liveService.processWithdrawal(lostId)==='ambiguous'&&(await row(lostId)).status==='processing');
    const postCount=posts;check('unknown response never resubmits',await liveService.processWithdrawal(lostId)==='awaiting_verified_provider_reference'&&posts===postCount);
    const lost=await row(lostId),lostBatch=batchFor(lost,'SUCCESS');batches.set(lostBatch.batch_header.payout_batch_id,lostBatch);
    await liveService.handleVerifiedPayoutEvent({event_type:'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',resource:{payout_batch_id:lostBatch.batch_header.payout_batch_id}});
    check('verified webhook recovers lost response by frozen sender UUID',(await row(lostId)).status==='paid'&&posts===postCount);
    const rejectOwner=await creator();await destination(rejectOwner);await sale(rejectOwner);const rejectId=await agedRequest(rejectOwner,1800);
    mode='rejected';check('explicit provider rejection restores safely',await liveService.processWithdrawal(rejectId)==='rejected'&&(await account(rejectOwner)).available===1800&&(await row(rejectId)).failure_code==='INSUFFICIENT_FUNDS');
    mode='normal';const scheduledOwner=await creator();await destination(scheduledOwner);await sale(scheduledOwner);const scheduledId=await agedRequest(scheduledOwner,1800);
    const sdk=typescriptLoader({'./client':{inngest:new Inngest({id:'withdrawal-fixture',isDev:true})},'@/lib/db/server':{createDatabaseClient:()=>({rpc:async()=>({data:[scheduledId],error:null})})},'@/lib/marketplace/withdrawals/server':{processWithdrawal:liveService.processWithdrawal}})('lib/workflows/creator-payouts.ts').creatorPayoutReconciliation;
    await new InngestTestEngine({function:sdk,events:[{name:'inngest/scheduled.timer',data:{}}]}).execute();
    const afterScheduled=posts;
    await new InngestTestEngine({function:sdk,events:[{name:'inngest/scheduled.timer',data:{}}]}).execute();
    check('duplicate durable workflow does not submit twice',posts===afterScheduled&&(await row(scheduledId)).status==='processing');
    let verified=false;
    const route=typescriptLoader({'@/lib/payments/paypal/client':{verifyPayPalWebhook:async()=>verified},'@/lib/marketplace/withdrawals/server':liveService,'@/lib/payments/server':{handleVerifiedPayPalEvent:async()=>false},'@/lib/marketplace/payments/server':{handleVerifiedMarketplacePayPalEvent:async()=>{}}},{Request,Response})('app/api/payments/paypal/webhook/route.ts');
    const hook=()=>new Request('https://fixture.invalid/api/payments/paypal/webhook',{method:'POST',body:JSON.stringify(payoutEvent)});
    check('payout webhook requires signature',(await route.POST(hook())).status===400);
    verified=true;check('duplicate authenticated payout webhook is acknowledged',(await route.POST(hook())).status===200);
    const early=await creator();await destination(early);await sale(early);const earlyId=await request(early,1800);const beforeEarly=posts;
    check('early service execution never sends payout',await liveService.processWithdrawal(earlyId)==='pending'&&posts===beforeEarly);
    const mixed=await creator();await destination(mixed);const firstLot=await sale(mixed,1000),secondLot=await sale(mixed,1000);const mixedId=await agedRequest(mixed,1800);
    await observe(firstLot,1000);check('full reversal of one lot reduces mixed withdrawal',(await row(mixedId)).reserved_minor===900);
    inspectedLots.length=0;await liveService.processWithdrawal(mixedId);
    check('only valid remaining backing lots require eligibility reads',!inspectedLots.includes(firstLot.id)&&inspectedLots.includes(secondLot.id)&&(await row(mixedId)).submitted_minor===900);
  } finally { if(savedFlag===undefined)delete process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED;else process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED=savedFlag; }
  for(const role of ['anon','authenticated','service_role']){
    await pg.exec('set role '+role);
    for(const table of ['creator_payout_destinations','creator_withdrawals','creator_money_lots','creator_withdrawal_allocations','creator_money_events']) await rejects(role+' cannot directly mutate '+table,()=>pg.exec('delete from '+table));
    if(role!=='service_role'){
      await rejects(role+' cannot read private payout destination',()=>pg.query('select * from creator_payout_destinations'));
      await rejects(role+' cannot call reservation RPC',()=>pg.query('select creator_payout_request($1,$2,500)',[a,randomUUID()]));
      await rejects(role+' cannot mark paid',()=>pg.query("select creator_payout_observe($1,'BATCHID','ITEMID','SUCCESS')",[at]));
    }
    await pg.exec('reset role');
  }
  check('withdrawal operations never alter AI accounting',await scalar("select count(*)::int value from generation_accounts where free_total<>2 or free_reserved<>0 or free_consumed<>0 or credit_available<>0 or credit_reserved<>0")===0);
  check('paid buyer entitlement remains preserved',await scalar('select count(*)::int value from marketplace_entitlements where purchase_id=$1',[dp.id])===1);
  check('all lot equations reconcile after financial scenarios',await scalar('select bool_and(creator_money_consistent(id)) value from app_users')===true);
  console.log(JSON.stringify({checks,passed:true,evidence:'isolated PostgreSQL, fixture clock/provider/auth; single-connection request serialization'}));
}finally{await pg.close();}
