// Actual PostgreSQL migrations/RPCs and production verifier/service/scheduler.
// Provider reads and time of the original sale are explicit isolated fixtures.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {Inngest} from 'inngest';
import {InngestTestEngine} from '@inngest/test';
const {pg,db,call,one,scalar}=await compositionFixtureDatabase();
let count=0,sequence=0;
const check=(name,value)=>{assert.ok(value,name);count++;};
const rejects=async(name,fn)=>{await assert.rejects(fn,undefined,name);count++;};
const policy={p_policy_version:'sandbox-settlement-v1:300',p_hold_seconds:300};
const normalize=value=>JSON.parse(JSON.stringify(value));
try {
  const a=await scalar("insert into app_users(clerk_user_id) values('settlement_A') returning id as value");
  const b=await scalar("insert into app_users(clerk_user_id) values('settlement_B') returning id as value");
  const accounts=JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  async function sale({gross=205,fee=250,old=false}={}) {
    const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Private original','gaming','1:1','10','Original','Energetic') returning id as value",[a]);
    const listing=randomUUID();
    await call('marketplace_create_priced',{p_owner_user_id:a,p_listing_id:listing,p_project_id:project,p_title:'Settlement fixture',p_description:'Reviewed configuration.',p_category:'gaming',p_tags:[],p_instructions:'Use your own story.',p_publish:true,p_rights_confirmed:true,p_adoption_type:'paid',p_price_minor:gross});
    let p=await call('marketplace_prepare_purchase',{p_buyer_user_id:b,p_listing_id:listing,p_fee_bps:fee,p_pricing_version:'sandbox-fixture'});
    const n=String(++sequence).padStart(12,'0'),order='ORDER'+n,capture='CAPTURE'+n;
    await call('marketplace_attach_order',{p_purchase_id:p.id,p_buyer_user_id:b,p_order_id:order});
    if(old)await pg.exec("create function old_sale_fixture() returns trigger language plpgsql as $$ begin new.created_at=now()-interval '10 minutes'; return new; end $$; create trigger old_sale_fixture before insert on creator_earnings_ledger for each row when(new.state='pending') execute function old_sale_fixture();");
    await call('marketplace_fulfil_purchase',{p_purchase_id:p.id,p_order_id:order,p_capture_id:capture,p_amount_minor:gross,p_currency:'USD'});
    if(old)await pg.exec('drop trigger old_sale_fixture on creator_earnings_ledger; drop function old_sale_fixture();');
    await call('marketplace_ensure_settlement',{p_purchase_id:p.id,...policy});
    p=normalize(await one('select * from marketplace_purchases where id=$1',[p.id]));
    return p;
  }
  const earning=p=>one("select * from creator_earnings_ledger where marketplace_purchase_id=$1 and state='pending'",[p.id]);
  const balance=p=>one('select * from creator_earning_balances where marketplace_purchase_id=$1',[p.id]);
  const observe=(p,refunded=0,overrides={})=>call('marketplace_apply_financial_observation',{
    p_purchase_id:p.id,p_order_id:p.paypal_order_id,p_capture_id:p.paypal_capture_id,p_amount_minor:p.amount_minor,p_currency:'USD',
    p_capture_status:refunded===p.amount_minor?'REFUNDED':refunded?'PARTIALLY_REFUNDED':'COMPLETED',p_refunded_minor:refunded,p_can_settle:true,p_reason:'refund',p_reference_key:'fixture:'+refunded,...overrides,
  });
  const pending=await sale(),original=await earning(pending),purchaseOriginal=JSON.stringify(pending);
  check('fresh sale does not settle early',(await observe(pending)).state==='pending');
  const frozen=await call('marketplace_ensure_settlement',{p_purchase_id:pending.id,...policy,p_policy_version:'sandbox-settlement-v1:60',p_hold_seconds:60});
  check('policy is frozen per original sale',frozen.hold_seconds===300&&frozen.policy_version===policy.p_policy_version&&Date.parse(frozen.eligible_at)-new Date(original.created_at).getTime()===300000);
  await rejects('frozen policy cannot be changed',()=>pg.query('update creator_earning_settlement_contexts set hold_seconds=60 where purchase_id=$1',[pending.id]));
  await rejects('frozen policy cannot be deleted',()=>pg.query('delete from creator_earning_settlement_contexts where purchase_id=$1',[pending.id]));
  await rejects('invalid Sandbox policy is rejected',()=>call('marketplace_ensure_settlement',{p_purchase_id:pending.id,p_policy_version:'production',p_hold_seconds:300}));
  const adopted=await call('marketplace_redeem_purchase',{p_buyer_user_id:b,p_purchase_id:pending.id});
  await pg.query("update projects set title='Buyer customized',prompt='Independent story' where id=$1",[adopted.projectId]);
  const projectBefore=JSON.stringify(await one('select * from projects where id=$1',[adopted.projectId]));
  check('partial pending refund stays pending',(await observe(pending,51)).state==='pending');
  let v=await balance(pending);
  check('cumulative proportional fee and creator cents',v.reversed_gross===51&&v.reversed_fee===1&&v.reversed_net===50);
  const firstAdjustment=JSON.stringify(await one('select * from marketplace_payment_adjustments where purchase_id=$1',[pending.id]));
  check('duplicate refund has no money effect',(await observe(pending,51)).adjustedGross===0&&await scalar('select count(*)::int value from marketplace_payment_adjustments where purchase_id=$1',[pending.id])===1);
  check('lower out-of-order observation cannot reduce reversal',(await observe(pending,20,{p_reference_key:'late'})).adjustedGross===0&&(await balance(pending)).reversed_gross===51);
  await observe(pending,102);v=await balance(pending);
  check('second partial uses cumulative rounding',v.reversed_fee===2&&v.reversed_net===100);
  await observe(pending,103);v=await balance(pending);
  check('cent boundary is rounded once cumulatively',v.reversed_fee===3&&v.reversed_net===100);
  check('original adjustment remains immutable',JSON.stringify(await one('select * from marketplace_payment_adjustments where purchase_id=$1 order by cumulative_gross_minor limit 1',[pending.id]))===firstAdjustment);
  check('full pending refund reaches terminal state',(await observe(pending,205)).state==='reversed');
  v=await balance(pending);
  check('100 percent reverses exactly original gross fee and net',v.reversed_gross===205&&v.reversed_fee===5&&v.reversed_net===200);
  check('only one reversed lifecycle marker',await scalar("select count(*)::int value from creator_earnings_ledger where marketplace_purchase_id=$1 and state='reversed'",[pending.id])===1);
  check('no availability after full reversal',(await observe(pending,0)).state==='reversed');
  check('duplicate definitive reversal cannot debit again',(await observe(pending,205,{p_reason:'capture_reversed',p_capture_status:'REVERSED',p_reference_key:'reversal-event'})).adjustedGross===0);
  check('original sale and completed purchase stay unchanged',JSON.stringify(await earning(pending))===JSON.stringify(original)&&JSON.stringify(normalize(await one('select * from marketplace_purchases where id=$1',[pending.id])))===purchaseOriginal);
  check('buyer project preserved across reversal',JSON.stringify(await one('select * from projects where id=$1',[adopted.projectId]))===projectBefore);
  check('refunded entitlement reopens same project',(await call('marketplace_redeem_purchase',{p_buyer_user_id:b,p_purchase_id:pending.id})).projectId===adopted.projectId);
  check('other owner cannot redeem entitlement',(await call('marketplace_redeem_purchase',{p_buyer_user_id:a,p_purchase_id:pending.id})).code==='NOT_FOUND');
  check('buyer sees safe refunded status',(await call('marketplace_purchase_financial_status',{p_buyer_user_id:b,p_purchase_id:pending.id})).financialStatus==='refunded');
  check('buyer status is owner scoped',await call('marketplace_purchase_financial_status',{p_buyer_user_id:a,p_purchase_id:pending.id})===null);
  for(const amount of [-1,206,null])await rejects('invalid cumulative gross rejected '+amount,()=>observe(pending,amount));
  for(const overrides of [{p_currency:'EUR'},{p_order_id:'OTHER000000001'},{p_capture_id:'OTHER000000002'},{p_amount_minor:1},{p_can_settle:null}])await rejects('mismatched proof rejected',()=>observe(pending,205,overrides));
  for(const table of ['marketplace_payment_adjustments','creator_earnings_ledger']) {
    await rejects('immutable '+table+' update',()=>pg.query('update '+table+' set created_at=now()'));
    await rejects('immutable '+table+' delete',()=>pg.query('delete from '+table));
  }
  const available=await sale({old:true});
  check('eligible valid sale settles once',(await observe(available)).state==='available');
  const availableEvent=JSON.stringify(await one("select * from creator_earnings_ledger where marketplace_purchase_id=$1 and state='available'",[available.id]));
  await Promise.all([observe(available),observe(available),observe(available)]);
  check('repeated settlement has one event',await scalar("select count(*)::int value from creator_earnings_ledger where marketplace_purchase_id=$1 and state='available'",[available.id])===1);
  await observe(available,100);
  check('partial available reversal debits available remaining only',(await balance(available)).reversed_net===98&&(await balance(available)).effective_state==='available');
  check('available event unchanged after adjustment',JSON.stringify(await one("select * from creator_earnings_ledger where marketplace_purchase_id=$1 and state='available'",[available.id]))===availableEvent);
  check('adjustment records availability at reversal',(await one('select source_state from marketplace_payment_adjustments where purchase_id=$1',[available.id])).source_state==='available');
  await observe(available,205,{p_reason:'capture_reversed',p_reference_key:'verified-reversed',p_capture_status:'REVERSED'});
  check('available full reversal removes exactly its net',(await balance(available)).reversed_net===200);
  const partialBefore=await sale({old:true});await observe(partialBefore,103);
  const settled=await one("select * from creator_earnings_ledger where marketplace_purchase_id=$1 and state='available'",[partialBefore.id]);
  check('only unrefunded remainder becomes available',settled.gross_minor===102&&settled.platform_fee_minor===2&&settled.net_minor===100);
  const blocked=await sale({old:true});
  check('pending provider refund blocks settlement',(await observe(blocked,0,{p_can_settle:false})).state==='pending');
  check('unknown capture status blocks settlement',(await observe(blocked,0,{p_capture_status:'PENDING'})).state==='pending');
  // Failure after inserting an adjustment rolls back every effect together.
  await pg.exec("create function fail_financial_fixture() returns trigger language plpgsql as $$ begin raise exception 'fixture outage'; end $$; create trigger fail_financial_fixture before insert on creator_earnings_ledger for each row when(new.state='reversed') execute function fail_financial_fixture();");
  await rejects('reversal is atomic on terminal-ledger outage',()=>observe(blocked,205));
  check('failed reversal leaves no partial debit',await scalar('select count(*)::int value from marketplace_payment_adjustments where purchase_id=$1',[blocked.id])===0);
  await pg.exec('drop trigger fail_financial_fixture on creator_earnings_ledger; drop function fail_financial_fixture();');
  for(const fee of [0,10000,3333,5000]){
    const p=await sale({gross:101,fee});
    let lastFee=0,lastNet=0;
    for(const gross of [1,2,3,17,50,51,100,101]){
      await observe(p,gross);const s=await balance(p);
      check('monotone bounded cents '+fee+'/'+gross,s.reversed_fee>=lastFee&&s.reversed_net>=lastNet&&s.reversed_fee<=p.platform_fee_minor&&s.reversed_net<=p.creator_net_minor&&s.reversed_fee+s.reversed_net===gross);
      lastFee=s.reversed_fee;lastNet=s.reversed_net;
    }
    check('exact original endpoint '+fee,lastFee===p.platform_fee_minor&&lastNet===p.creator_net_minor);
  }
  const stats=await call('marketplace_creator_earnings',{p_creator_user_id:a,p_page:1});
  check('projected balances are coherent',stats.available===100&&stats.pending===200&&stats.lifetime===300&&stats.lifetimeGross===1224);
  check('history includes sale settlement and adjustment',stats.sales.some(s=>s.history.some(e=>e.kind==='available')&&s.history.some(e=>e.kind==='refund')));
  check('safe creator DTO excludes provider buyer and snapshot',![b,'paypal','template_snapshot',pending.paypal_capture_id].some(secret=>JSON.stringify(stats).includes(secret)));
  check('owned listing net reflects partial reversals',(await scalar('select marketplace_owned_json(l)->>\'creatorEarningsMinor\' value from marketplace_listings l where id=$1',[partialBefore.listing_id]))==='100');
  const candidates=await call('marketplace_financial_candidates',{});
  check('candidate batch bounded and excludes terminal refunds',candidates.length<=5&&!candidates.includes(pending.id)&&!candidates.includes(available.id));
  await call('marketplace_begin_financial_check',{p_purchase_id:blocked.id,...policy});
  check('attempt durably defers failed item',!(await call('marketplace_financial_candidates',{})).includes(blocked.id));
  for(const role of ['anon','authenticated','service_role']){
    await pg.exec('set role '+role);
    for(const table of ['creator_earning_settlement_contexts','marketplace_payment_adjustments']) {
      await rejects(role+' cannot write '+table,()=>pg.query('insert into '+table+' default values'));
      if(role!=='service_role')await rejects(role+' cannot enumerate '+table,()=>pg.query('select * from '+table));
    }
    if(role!=='service_role')await rejects(role+' cannot invoke settlement',()=>pg.query('select marketplace_financial_candidates()'));
    await pg.exec('reset role');
  }
  // Actual production verification + service, provider data supplied explicitly.
  const client=typescriptLoader()('lib/payments/paypal/client.ts');
  const serviceSale=await sale({old:true}),money={value:'2.05',currency_code:'USD'};
  let order={id:serviceSale.paypal_order_id,intent:'CAPTURE',status:'COMPLETED',purchase_units:[{reference_id:serviceSale.listing_id,custom_id:serviceSale.id,invoice_id:'marketplace:'+serviceSale.id,amount:money,payments:{captures:[{id:serviceSale.paypal_capture_id,status:'COMPLETED',amount:money,final_capture:true}]}}]};
  let capture={id:serviceSale.paypal_capture_id,status:'COMPLETED',amount:money,final_capture:true,supplementary_data:{related_ids:{order_id:serviceSale.paypal_order_id}}};
  let refund={id:'REFUND0000000001',status:'COMPLETED',amount:{value:'0.51',currency_code:'USD'},links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/'+capture.id}],seller_payable_breakdown:{total_refunded_amount:{value:'0.51',currency_code:'USD'}}};
  const load=typescriptLoader({'@/lib/db/server':{createDatabaseClient:()=>db},'@/lib/payments/paypal/config':{getPayPalConfig:()=>({environment:'sandbox'})},'@/lib/payments/paypal/client':{...client,readPayPalOrder:async()=>normalize(order),readPayPalCapture:async()=>normalize(capture),readPayPalRefund:async()=>normalize(refund)}});
  const service=load('lib/marketplace/earnings/server.ts'),verify=load('lib/marketplace/earnings/verification.ts');
  check('production verifier accepts exact original proof',verify.financialObservation(serviceSale,order,capture).canSettle);
  for(const c of [{...capture,id:'OTHER000000001'},{...capture,amount:{value:'2.04',currency_code:'USD'}},{...capture,final_capture:false},{...capture,supplementary_data:{related_ids:{order_id:'OTHER000000001'}}}]){
    assert.throws(()=>verify.financialObservation(serviceSale,order,c));count++;
  }
  check('completed partial refund is verified cumulatively',verify.financialObservation(serviceSale,order,{...capture,status:'PARTIALLY_REFUNDED'},refund).refunded===51);
  check('pending refund cannot make money available',!verify.financialObservation(serviceSale,order,capture,{...refund,status:'PENDING'}).canSettle);
  assert.throws(()=>verify.financialObservation(serviceSale,order,capture,{...refund,links:[{rel:'up',href:'https://evil.test/v2/payments/captures/'+capture.id}]}));count++;
  assert.throws(()=>verify.financialObservation(serviceSale,order,capture,{...refund,seller_payable_breakdown:{total_refunded_amount:{value:'2.06',currency_code:'USD'}}}));count++;
  assert.throws(()=>verify.financialObservation(serviceSale,order,capture,{...refund,seller_payable_breakdown:undefined}));count++;
  check('provider full-refund status invalidates entire sale',verify.financialObservation(serviceSale,order,{...capture,status:'REFUNDED'}).refunded===205);
  await service.reconcileMarketplaceFinancials(serviceSale.id);
  check('scheduled service verifies then settles',(await balance(serviceSale)).effective_state==='available');
  capture.status='PARTIALLY_REFUNDED';
  const event={id:'WH-REFUND-FIXTURE',event_type:'PAYMENT.CAPTURE.REFUNDED',resource:{id:refund.id}};
  await service.handleVerifiedMarketplaceAdjustment(event);
  await service.handleVerifiedMarketplaceAdjustment(event);
  check('duplicate verified notification is financially idempotent',await scalar('select count(*)::int value from marketplace_payment_adjustments where purchase_id=$1',[serviceSale.id])===1&&(await balance(serviceSale)).reversed_net===50);
  await service.handleVerifiedMarketplaceAdjustment({id:'WH-REVERSAL-FIXTURE',event_type:'PAYMENT.CAPTURE.REVERSED',resource:{id:capture.id}});
  check('authentic reversal path fully invalidates sale',(await balance(serviceSale)).effective_state==='reversed');
  // Browserless scheduled handler uses separate durable steps and survives an
  // item failure without abandoning the next candidate.
  let definition,handler,inspected=[];
  typescriptLoader({'./client':{inngest:{createFunction:(d,h)=>{definition=d;handler=h;return {};}}},'@/lib/db/server':{createDatabaseClient:()=>({rpc:async()=>({data:[pending.id,available.id],error:null})})},'@/lib/marketplace/earnings/server':{reconcileMarketplaceFinancials:async id=>{inspected.push(id);if(id===pending.id)throw Error('temporary');}}})('lib/workflows/marketplace-earnings.ts');
  const scheduled=await handler({step:{run:async(_name,fn)=>fn()}});
  check('durable minute schedule is bounded and serialized',definition.triggers.cron==='* * * * *'&&definition.concurrency===1&&definition.retries===4);
  check('failed provider item does not starve next item',scheduled.inspected===2&&scheduled.deferred===1&&inspected.length===2);
  const sdkWorkflow=typescriptLoader({'./client':{inngest:new Inngest({id:'settlement-fixture',isDev:true})},'@/lib/db/server':{createDatabaseClient:()=>({rpc:async()=>({data:[pending.id,available.id],error:null})})},'@/lib/marketplace/earnings/server':{reconcileMarketplaceFinancials:async id=>{if(id===pending.id)throw Error('temporary');}}})('lib/workflows/marketplace-earnings.ts').marketplaceEarningsReconciliation;
  const sdkResult=await new InngestTestEngine({function:sdkWorkflow,events:[{name:'inngest/scheduled.timer',data:{}}]}).execute();
  check('official durable SDK executes scheduled accounting handler',sdkResult.result.inspected===2&&sdkResult.result.deferred===1);
  let signatureValid=false,handlerCalls=0,handlerFails=false;
  const route=typescriptLoader({'@/lib/payments/paypal/client':{verifyPayPalWebhook:async()=>signatureValid},'@/lib/payments/server':{handleVerifiedPayPalEvent:async()=>false},'@/lib/marketplace/payments/server':{handleVerifiedMarketplacePayPalEvent:async input=>{handlerCalls++;if(handlerFails)throw Error('temporary');await service.handleVerifiedMarketplaceAdjustment(input);}}},{Request,Response})('app/api/payments/paypal/webhook/route.ts');
  const request=()=>new Request('https://app.invalid/api/payments/paypal/webhook',{method:'POST',body:JSON.stringify(event)});
  check('invalid refund signature is refused before accounting',(await route.POST(request())).status===400&&handlerCalls===0);
  signatureValid=true;
  check('verified duplicate refund route acknowledges safely',(await route.POST(request())).status===200&&handlerCalls===1);
  handlerFails=true;
  check('temporary verified refund failure requests redelivery',(await route.POST(request())).status===503);
  check('route duplicate does not create additional adjustment',await scalar('select count(*)::int value from marketplace_payment_adjustments where purchase_id=$1',[serviceSale.id])===2);
  const policyModule=typescriptLoader()('lib/marketplace/earnings/config.ts'),previousHold=process.env.SCEENYK_MARKETPLACE_TEST_SETTLEMENT_SECONDS;
  try {
    process.env.SCEENYK_MARKETPLACE_TEST_SETTLEMENT_SECONDS='0300';
    check('holding policy normalizes leading zero configuration',policyModule.sandboxSettlementPolicy().version==='sandbox-settlement-v1:300');
    for(const invalid of ['0','59','86401','300.5','-300','300seconds']){process.env.SCEENYK_MARKETPLACE_TEST_SETTLEMENT_SECONDS=invalid;assert.throws(()=>policyModule.sandboxSettlementPolicy());count++;}
  } finally {if(previousHold===undefined)delete process.env.SCEENYK_MARKETPLACE_TEST_SETTLEMENT_SECONDS;else process.env.SCEENYK_MARKETPLACE_TEST_SETTLEMENT_SECONDS=previousHold;}
  check('AI credits and free allowances remain untouched',await scalar('select count(*)::int value from credit_ledger')===0&&JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows)===accounts);
  console.log(JSON.stringify({passed:count,realSql:true,productionVerifier:true,providerFixtures:true,realProviderEvidence:false}));
} finally {await pg.close();}
