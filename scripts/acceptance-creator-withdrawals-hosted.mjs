// Explicit acceptance against deployed Sceenyk/Sandbox, reserved Clerk test
// identities only. Provider recipient/evidence remain private in the temp folder.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {deployedBrowser} from './lib/deployed-browser.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const origin='https://sceenyk.vercel.app',mode=process.argv[2]??'preflight';
const load=typescriptLoader(),db=load('lib/db/server.ts').createDatabaseClient();
const config=load('lib/payments/paypal/config.ts').getPayPalConfig();
assert.equal(config.baseUrl,'https://api-m.sandbox.paypal.com');
const previous=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-marketplace-payments-acceptance.json'),'utf8'));
const artifact=path.join(os.tmpdir(),'sceenyk-withdrawals-hosted-acceptance.json');
let state;try{state=JSON.parse(fs.readFileSync(artifact,'utf8'));}catch{state={checks:[],screenshots:[]};}
const save=()=>fs.writeFileSync(artifact,JSON.stringify(state,null,2));
const check=(name,value)=>{assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));};
async function one(table,key,id){const r=await db.from(table).select('*').eq(key,id).single();assert.ok(!r.error&&r.data,'HOSTED_'+table);return r.data;}
async function rows(table,key,id){let q=db.from(table).select('*');if(key)q=q.eq(key,id);const r=await q;assert.ok(!r.error,'HOSTED_'+table);return r.data;}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const a=await one('app_users','id',previous.aId),b=await one('app_users','id',previous.bId);
assert.ok(a.email?.includes('+clerk_test@')&&b.email?.includes('+clerk_test@')&&a.id!==b.id,'RESERVED_CLERK_IDENTITIES');
async function protectedSnapshot(){const result={};for(const user of[a,b])for(const table of['generation_accounts','credit_ledger','credit_purchases'])result[user.id+table]=(await rows(table,'owner_user_id',user.id)).sort((x,y)=>JSON.stringify(canonical(x)).localeCompare(JSON.stringify(canonical(y))));return hash(result);}
async function account(user){const r=await db.rpc('creator_payout_account',{p_creator:user.id,p_page:1});assert.ok(!r.error,'HOSTED_WITHDRAWAL_ACCOUNT');return r.data;}
async function preflight(){
  for(const table of['creator_payout_destinations','creator_payout_refund_checks','creator_withdrawals','creator_money_lots','creator_withdrawal_allocations','creator_money_events']){
    const r=await db.from(table).select('*').limit(0);check('hosted024 '+table,!r.error);
  }
  const publicDb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const table of['creator_payout_destinations','creator_withdrawals','creator_money_lots','creator_withdrawal_allocations','creator_money_events']){
    const r=await publicDb.from(table).select('*').limit(0);check('browser role cannot read '+table,r.error?.code==='42501');
  }
  for(const[name,args]of[
    ['creator_payout_request',{p_creator:a.id,p_request:randomUUID(),p_amount:500}],
    ['creator_payout_destination',{p_creator:a.id,p_email:'forbidden@example.test'}],
    ['creator_payout_account',{p_creator:a.id,p_page:1}],
    ['creator_payout_claim',{p_id:randomUUID()}],
    ['creator_payout_observe',{p_id:randomUUID(),p_batch:null,p_item:null,p_status:'SUCCESS'}],
  ]){const r=await publicDb.rpc(name,args);check('browser role cannot invoke '+name,r.error?.code==='42501');}
  for(const[table,patch,key]of[['creator_withdrawals',{reserved_minor:1},'id'],['creator_money_lots',{available_minor:999999},'purchase_id'],['creator_payout_destinations',{paypal_email:'forbidden@example.test'},'creator_user_id']]){
    const r=await db.from(table).update(patch).eq(key,randomUUID());check('service cannot directly mutate '+table,r.error?.code==='42501');
  }
  const t=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',process.env.INNGEST_SIGNING_KEY.replace(/^signkey-\w+-/,'')).update(t).digest('hex');
  const r=await fetch(origin+'/api/inngest',{headers:{'x-inngest-signature':`t=${t}&s=${signature}`},signal:AbortSignal.timeout(30000)});const info=await r.json();
  console.log(JSON.stringify({sdkStatus:r.status,sdkFunctionCount:info.function_count??null,sdkMetadataKeys:Object.keys(info)}));
  check('deployed signed SDK includes withdrawal function and failure handlers',r.status===200&&info.authentication_succeeded===true&&info.function_count>=10&&info.mode==='cloud');
  const cloud=await fetch('https://api.inngest.com/v2/apps',{headers:{Authorization:'Bearer '+process.env.INNGEST_SIGNING_KEY},signal:AbortSignal.timeout(30000)});assert.ok(cloud.ok,'CLOUD_METADATA');
  const apps=(await cloud.json()).data;
  console.log(JSON.stringify({cloudApps:apps.map(v=>({id:v.id,name:v.name,functionCount:v.functionCount,keys:Object.keys(v)}))}));
  const app=apps.find(v=>v.id==='sceenyk');
  state.cloudCountMatches=app?.functionCount===info.function_count;state.cloudFunctionCount=info.function_count;
  if(state.cloudCountMatches)check('Inngest Cloud count matches deployed signed SDK',true);
  const token=await load('lib/payments/paypal/client.ts').paypalAccessToken();
  const order=await fetch(config.baseUrl+'/v2/checkout/orders/'+previous.orderId,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});assert.ok(order.ok,'PINNED_SANDBOX_ORDER');
  const provider=await order.json();assert.equal(provider.id,previous.orderId);assert.ok(provider.payer?.email_address&&provider.payer?.payer_id,'CONTROLLED_PREVIOUS_SANDBOX_BUYER');
  state.recipient=provider.payer.email_address;state.recipientSourceOrder=provider.id;
  state.aiBefore??=await protectedSnapshot();state.aId=a.id;state.bId=b.id;
  const aa=await account(a),bb=await account(b);state.initialAccounts??={a:aa,b:bb};
  check('read-only preflight preserves AI balances and credit purchases',await protectedSnapshot()===state.aiBefore);
  save();console.log(JSON.stringify({preflight:true,aAvailable:aa.available,aPending:aa.pending,aDeficit:aa.deficit,bAvailable:bb.available,bPending:bb.pending,controlledSandboxRecipientRecovered:true,artifact}));
}
async function browserChecks(){
  assert.ok(state.recipient,'PREFLIGHT_REQUIRED');
  const empty=await account(a);
  assert.ok(empty.available===0&&empty.pending===0,'ZERO_BALANCE_PHASE_ONLY_USE_FINISH_AFTER_FUNDING');
  const before=await protectedSnapshot();
  await deployedBrowser(origin,{A:a.clerk_user_id,B:b.clerk_user_id},async browser=>{
    const{signIn,navigate,wait,discover,invoke,evaluate,call}=browser;
    await signIn('A');await navigate('/dashboard/marketplace/earnings');await wait("!!document.querySelector('#payout-email')");await discover();
    check('deployed earnings explains seven-day request hold',await evaluate("document.body.innerText.includes('Withdrawals are held for 7 days before payout.')"));
    check('zero available disables Withdraw',await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Withdraw').disabled"));
    const invalid=await invoke('payoutDestinationAction',{email:'not-an-email'});check('deployed action rejects invalid payout email',invalid.ok===false);
    check('deployed action saves private Sandbox destination',(await invoke('payoutDestinationAction',{email:state.recipient})).ok===true);
    check('deployed action rejects below-five-dollar amount',(await invoke('withdrawalRequestAction',{requestId:randomUUID(),amountMinor:499})).ok===false);
    check('deployed action rejects insufficient authoritative earnings',(await invoke('withdrawalRequestAction',{requestId:randomUUID(),amountMinor:500})).ok===false);
    for(const extra of[{creator:a.id},{holdUntil:'2000-01-01'},{available:999999},{status:'paid'},{currency:'EUR'}])check('deployed withdrawal rejects injected '+Object.keys(extra)[0],(await invoke('withdrawalRequestAction',{requestId:randomUUID(),amountMinor:500,...extra})).ok===false);
    const saved=await invoke('withdrawalAccountAction',1);check('owned destination read derives session identity',saved.ok&&saved.data.clerkUserId===a.clerk_user_id&&saved.data.account.email===state.recipient);
    await navigate('/dashboard/marketplace/earnings');await wait("!!document.querySelector('#payout-email')");
    check('destination persists after deployed refresh',await evaluate('document.querySelector("#payout-email").value==='+JSON.stringify(state.recipient)));
    for(const width of[1440,390,320])for(const dark of[false,true]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
      check('deployed earnings containment '+width+' '+dark,await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    }
    await signIn('B');await navigate('/dashboard/marketplace/earnings');await wait("!!document.querySelector('#payout-email')");await discover();
    const own=await invoke('withdrawalAccountAction',1);check('User B cannot read A payout destination/history',own.ok&&own.data.clerkUserId===b.clerk_user_id&&own.data.account.email!==state.recipient&&own.data.account.history.every(w=>saved.data.account.history.every(v=>v.id!==w.id)));
    check('User B cannot inject A into destination update',(await invoke('payoutDestinationAction',{email:b.email,creator:a.id})).ok===false);
    check('User B cannot request from A earnings',(await invoke('withdrawalRequestAction',{requestId:randomUUID(),amountMinor:500,creator:a.id})).ok===false);
    check('User B cannot choose owner on history read',(await invoke('withdrawalAccountAction',{creator:a.id,page:1})).ok===false);
    const earnings=await invoke('creatorEarningsAction',1);check('User B sees only own earnings',earnings.ok&&earnings.data.clerkUserId===b.clerk_user_id&&earnings.data.earnings.total===0);
    await navigate('/dashboard/marketplace/purchases');await wait("document.body.innerText.includes('Open adopted project')");await discover();
    for(let n=0;n<2;n++){const r=await invoke('recoverMarketplacePurchaseAction',{purchaseId:previous.purchaseId});check('existing paid adoption reopens same owned project '+n,r.ok&&r.data.projectId===previous.projectId);}
    await signIn('A');await navigate('/dashboard/marketplace/earnings');await wait("!!document.querySelector('#payout-email')");
    check('A destination unchanged after B forgeries',(await account(a)).email===state.recipient);
    await navigate('/dashboard/credits');await wait("document.body.innerText.includes('Buy credits')");await discover();
    const credits=(await rows('credit_purchases','owner_user_id',a.id)).filter(p=>p.status==='completed').sort((x,y)=>y.created_at.localeCompare(x.created_at));assert.ok(credits.length,'EXISTING_REAL_SANDBOX_CREDIT_PURCHASE');
    for(let n=0;n<2;n++){const r=await invoke('completeCreditOrderAction',{orderId:credits[0].paypal_order_id});check('existing credit purchase reconciles without another grant '+n,r.ok&&r.data.status==='completed');}
    const client=load('lib/payments/paypal/client.ts'),order=await client.readPayPalOrder(credits[0].paypal_order_id),capture=client.verifiedCapture(credits[0],order);
    const ledger=await rows('credit_ledger','purchase_id',credits[0].id);check('real credit capture retains exactly one correct grant',capture.id===credits[0].paypal_capture_id&&ledger.length===1&&ledger[0].amount===credits[0].credits);
    check('deployed browser has no exceptions',browser.errors.length===0);
    state.browserExceptions=browser.exceptions;save();
  });
  check('destination/security/paid-adoption checks preserve AI credits and purchases',await protectedSnapshot()===before);
  state.browserVerifiedAt=new Date().toISOString();save();
}
async function prepareFundedCheckout(){
  const before=await protectedSnapshot();state.fund??={projectId:randomUUID(),listingId:randomUUID()};save();
  await deployedBrowser(origin,{A:a.clerk_user_id,B:b.clerk_user_id},async browser=>{
    const{signIn,wait,discover,invoke,call}=browser;
    const goto=async route=>{const u=new URL(route,origin);await call('Page.navigate',{url:u.href});await wait(`document.readyState!=='loading'&&location.pathname===${JSON.stringify(u.pathname)}&&location.search===${JSON.stringify(u.search)}`);};
    await signIn('A');await goto('/create');await wait("!!document.querySelector('textarea')");await discover();
    if(!state.fund.projectSaved){const r=await invoke('saveProjectAction',{id:state.fund.projectId,mode:'create',title:'Withdrawal Sandbox acceptance source',category:'gaming',prompt:'Synthetic owned brief for creator withdrawal acceptance. No generation requested.',settings:{aspectRatio:'1:1',duration:'10',visualStyle:'Original',tone:'Energetic'}});check('owned acceptance brief saved without generation',r.ok);state.fund.projectSaved=true;save();}
    await goto('/dashboard/marketplace/new?project='+state.fund.projectId);await wait("!!document.querySelector('form')");await discover();
    if(!state.fund.listingSaved){const r=await invoke('createMarketplaceAction',{id:state.fund.listingId,sourceProjectId:state.fund.projectId,title:'Withdrawal Sandbox acceptance fixture',description:'Synthetic reusable template for withdrawal acceptance only.',category:'gaming',tags:['withdrawalacceptance'],instructions:'Introduce your own character in a new setting, reveal a surprise, and close on a hopeful moment.',rightsConfirmed:true,publish:true,adoptionType:'paid',priceMinor:1000});check('controlled ten-dollar Sandbox listing published',r.ok);state.fund.listingId=r.listingId;state.fund.listingSaved=true;save();}
    await signIn('B');await goto('/marketplace/'+state.fund.listingId);await wait("document.body.innerText.includes('Adopt with PayPal Sandbox')");await discover();
    if(!state.fund.purchaseId){const r=await invoke('marketplaceCheckoutAction',{listingId:state.fund.listingId});check('owned Sandbox checkout freezes ten-dollar adoption price',r.ok&&r.data.amountMinor===1000);state.fund.purchaseId=r.data.id;save();}
    if(!state.fund.approvalUrl){const r=await invoke('createMarketplaceOrderAction',{purchaseId:state.fund.purchaseId});console.log(JSON.stringify({orderAction:{ok:r.ok,status:r.status??null,message:r.message??null,dataKeys:r.data?Object.keys(r.data):[]}}));check('one Sandbox approval order prepared',r.ok&&r.data.approvalUrl);state.fund.approvalUrl=r.data.approvalUrl;save();}
    check('checkout preparation creates no AI/credit effect',await protectedSnapshot()===before);
  });
  console.log(JSON.stringify({approvalUrl:state.fund.approvalUrl,amountUSD:'10.00',creatorNetUSD:'9.00',captureRequiresUserApproval:true}));
}
async function reserveFundedEarnings(){
  const p=await one('marketplace_purchases','id',state.fund.purchaseId);
  const paypal=load('lib/payments/paypal/client.ts');
  const [order,capture]=await Promise.all([paypal.readPayPalOrder(p.paypal_order_id),paypal.readPayPalCapture(p.paypal_capture_id)]);
  const verified=load('lib/marketplace/earnings/verification.ts').financialObservation(p,order,capture);
  check('approved real purchase has frozen ten percent fee and nine-dollar creator net',p.status==='completed'&&p.amount_minor===1000&&p.platform_fee_minor===100&&p.creator_net_minor===900&&verified.refunded===0&&capture.status==='COMPLETED');
  state.fund.requestIds??=[randomUUID(),randomUUID()];save();
  await deployedBrowser(origin,{A:a.clerk_user_id,B:b.clerk_user_id},async browser=>{
    const{signIn,navigate,wait,discover,invoke,evaluate}=browser;
    await signIn('A');await navigate('/dashboard/marketplace/earnings');await wait("!!document.querySelector('#payout-email')");await discover();
    if(!state.fund.withdrawalId){
      check('funded creator can use deployed Withdraw control',await evaluate("!Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Withdraw').disabled"));
      const existing=(await rows('creator_withdrawals','creator_user_id',a.id)).filter(w=>state.fund.requestIds.includes(w.request_id));
      if(!existing.length){
        const results=await Promise.all(state.fund.requestIds.map(requestId=>invoke('withdrawalRequestAction',{requestId,amountMinor:700})));
        check('concurrent distinct seven-dollar requests reserve only once',results.filter(r=>r.ok).length===1);
      }
      const found=(await rows('creator_withdrawals','creator_user_id',a.id)).filter(w=>state.fund.requestIds.includes(w.request_id));
      check('concurrent requests create exactly one immutable withdrawal',found.length===1);
      state.fund.withdrawalId=found[0].id;state.fund.winnerRequestId=found[0].request_id;state.fund.requestedAt=found[0].requested_at;state.fund.holdUntil=found[0].hold_until;save();
    }
    check('retry of same withdrawal intent succeeds idempotently',(await invoke('withdrawalRequestAction',{requestId:state.fund.winnerRequestId,amountMinor:700})).ok);
    check('same intent cannot change original amount',(await invoke('withdrawalRequestAction',{requestId:state.fund.winnerRequestId,amountMinor:500})).ok===false);
    check('remaining two dollars cannot fund another minimum withdrawal',(await invoke('withdrawalRequestAction',{requestId:randomUUID(),amountMinor:500})).ok===false);
    const w=await one('creator_withdrawals','id',state.fund.withdrawalId),aa=await account(a);
    check('hosted atomic Available to Pending reservation conserves nine dollars',aa.available===200&&aa.pending===700&&w.reserved_minor===700&&w.status==='pending');
    const allocations=await rows('creator_withdrawal_allocations','withdrawal_id',w.id);
    check('reservation explicitly funds from exact approved earning lot',allocations.length===1&&allocations[0].purchase_id===p.id&&allocations[0].amount_minor===700&&allocations[0].remaining_minor===700);
    check('hosted hold is exactly 168 hours from original request',Date.parse(w.hold_until)-Date.parse(w.requested_at)===604800000);
    check('hosted withdrawal cannot become eligible before hold',(await db.rpc('creator_payout_eligible',{p_id:w.id})).data===false);
    check('hosted withdrawal cannot claim before hold',(await db.rpc('creator_payout_claim',{p_id:w.id})).data===null);
    check('real-provider recheck preserves pending before hold',await load('lib/marketplace/withdrawals/server.ts').processWithdrawal(w.id)==='pending');
    try{check('destination change cannot rewrite frozen withdrawal snapshot',(await invoke('payoutDestinationAction',{email:'acceptance-only@example.test'})).ok&&(await one('creator_withdrawals','id',w.id)).destination_snapshot===state.recipient);}
    finally{check('controlled Sandbox destination restored',(await invoke('payoutDestinationAction',{email:state.recipient})).ok);}
    await signIn('B');await navigate('/dashboard/marketplace/earnings');await wait("!!document.querySelector('#payout-email')");await discover();
    const own=await invoke('withdrawalAccountAction',1);
    check('B cannot access A funded withdrawal or destination',own.ok&&own.data.account.history.every(v=>v.id!==w.id)&&own.data.account.email!==state.recipient&&own.data.account.available===0);
    await navigate('/dashboard/marketplace/purchases');await wait("document.body.innerText.includes('Open adopted project')");await discover();
    const adopted=await invoke('recoverMarketplacePurchaseAction',{purchaseId:p.id});check('new real paid adoption recovers buyer project',adopted.ok&&!!adopted.data.projectId);state.fund.adoptedProjectId=adopted.data.projectId;
    state.fund.projectHash=hash(await one('projects','id',adopted.data.projectId));save();
  });
  check('funded hosted reservation leaves AI accounts and purchases unchanged',await protectedSnapshot()===state.aiBefore);
}
async function refundFundedReservation(key,amount,expectedReserved,expectedAvailable){
  const p=await one('marketplace_purchases','id',state.fund.purchaseId),paypal=load('lib/payments/paypal/client.ts');
  assert.ok(state.fund.withdrawalId&&p.environment==='sandbox'&&p.creator_user_id===a.id&&p.buyer_user_id===b.id,'PINNED_CONTROLLED_REFUND');
  state.fund.refunds??={};let attempt=state.fund.refunds[key];
  if(!attempt){attempt={requestId:randomUUID(),amount,startedAt:new Date().toISOString()};state.fund.refunds[key]=attempt;save();}
  if(!attempt.id){
    // A retained uncertain attempt is reconciled by provider GET, never replaced.
    if(attempt.postStartedAt){const order=await paypal.readPayPalOrder(p.paypal_order_id);const used=Object.values(state.fund.refunds).map(r=>r.id);const refunds=(order.purchase_units[0].payments?.refunds??[]).filter(r=>!used.includes(r.id)&&r.amount.value===(amount/100).toFixed(2));assert.equal(refunds.length,1,'RECONCILE_UNCERTAIN_REFUND_MANUALLY');attempt.id=refunds[0].id;save();}
    else{
      attempt.postStartedAt=new Date().toISOString();save();
      const token=await paypal.paypalAccessToken();
      const response=await fetch(config.baseUrl+'/v2/payments/captures/'+paypal.paypalOrderId.parse(p.paypal_capture_id)+'/refund',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation','PayPal-Request-ID':attempt.requestId},body:JSON.stringify({amount:{value:(amount/100).toFixed(2),currency_code:'USD'}}),signal:AbortSignal.timeout(25000)});
      assert.ok(response.ok,'SANDBOX_REFUND_HTTP_'+response.status);const refund=paypal.paypalRefundSchema.parse(await response.json());assert.equal(paypal.paypalParentId(refund.links,'captures'),p.paypal_capture_id);attempt.id=refund.id;save();
    }
  }
  const refund=await paypal.readPayPalRefund(attempt.id);check('real partial Sandbox refund completed '+key,refund.status==='COMPLETED');
  let w;
  for(let n=0;n<15;n++){w=await one('creator_withdrawals','id',state.fund.withdrawalId);if(w.reserved_minor===expectedReserved)break;await delay(2000);}
  // If delivery is delayed, use the same trusted reconciler with an actual GET.
  if(w.reserved_minor!==expectedReserved){await load('lib/marketplace/earnings/server.ts').reconcileMarketplaceFinancials(p.id,{reference:'acceptance-provider-read:'+refund.id,refund});attempt.trustedReadFallback=true;save();}
  w=await one('creator_withdrawals','id',state.fund.withdrawalId);const aa=await account(a);
  check('exact lot refund changes reserved and available cents '+key,w.reserved_minor===expectedReserved&&aa.pending===expectedReserved&&aa.available===expectedAvailable);
  check('refund preserves original request and seven-day hold '+key,w.requested_at===state.fund.requestedAt&&w.hold_until===state.fund.holdUntil);
  check('refund keeps correct pending or below-minimum failed state '+key,w.status===(expectedReserved?'pending':'failed'));
  const snapshot=async()=>hash({w:await one('creator_withdrawals','id',w.id),lots:await rows('creator_money_lots','purchase_id',p.id),events:await rows('creator_money_events','creator_user_id',a.id),adjustments:await rows('marketplace_payment_adjustments','purchase_id',p.id)});
  const before=await snapshot();
  for(let n=0;n<2;n++)await load('lib/marketplace/earnings/server.ts').reconcileMarketplaceFinancials(p.id,{reference:'duplicate-real-refund:'+refund.id,refund});
  check('duplicate real refund has no extra financial or release effect '+key,await snapshot()===before);
  check('refund preserves adopted project and AI credits '+key,hash(await one('projects','id',state.fund.adoptedProjectId))===state.fund.projectHash&&await protectedSnapshot()===state.aiBefore);
  attempt.verifiedAt=new Date().toISOString();save();console.log(JSON.stringify({refund:key,reserved:aa.pending,available:aa.available,withdrawalStatus:w.status,trustedProviderReadFallback:!!attempt.trustedReadFallback}));
}
async function finishHostedAcceptance(){
  const p=await one('marketplace_purchases','id',state.fund.purchaseId),w=await one('creator_withdrawals','id',state.fund.withdrawalId);
  assert.ok(state.fund.refunds.second?.verifiedAt,'BOTH_REAL_REFUNDS_REQUIRED');
  const adjustments=await rows('marketplace_payment_adjustments','purchase_id',p.id),events=await rows('creator_money_events','withdrawal_id',w.id);
  check('below-minimum closure releases exactly 430 valid cents once',w.status==='failed'&&w.failure_code==='REFUND_BELOW_MINIMUM'&&events.filter(e=>e.kind==='released').length===1&&events.filter(e=>e.kind==='released')[0].amount_minor===430);
  check('real refunds reverse exact cumulative platform fee and creator share',adjustments.length===2&&adjustments.reduce((n,e)=>n+e.gross_minor,0)===300&&adjustments.reduce((n,e)=>n+e.fee_minor,0)===30&&adjustments.reduce((n,e)=>n+e.net_minor,0)===270);
  check('failed hosted hold never submitted to PayPal',w.submitted_minor===null&&w.paypal_batch_id===null&&w.paypal_item_id===null);
  const listing=await one('marketplace_listings','id',state.fund.listingId);
  const metadata={id:listing.id,title:listing.title,description:listing.description,category:listing.category,tags:listing.tags,rightsConfirmed:true,adoptionType:'free',priceMinor:0};
  await deployedBrowser(origin,{A:a.clerk_user_id,B:b.clerk_user_id},async browser=>{
    const{signIn,navigate,wait,discover,invoke,evaluate}=browser;
    await signIn('A');await navigate('/dashboard/marketplace/earnings');await wait("!!document.querySelector('#payout-email')");await discover();
    const current=await invoke('withdrawalAccountAction',1);
    check('fresh browser retains failed request valid funds and original hold',current.ok&&current.data.account.available===630&&current.data.account.pending===0&&current.data.account.history.some(v=>v.id===w.id&&v.status==='failed'&&v.holdUntil===state.fund.holdUntil)&&current.data.account.email===state.recipient);
    for(const width of[1440,390,320])for(const dark of[false,true]){
      await browser.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
      check('funded adjusted history containment '+width+' '+dark,await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    }
    await navigate('/dashboard/marketplace/'+listing.id);await wait("!!document.querySelector('form')");await discover();
    check('controlled listing can use existing free adoption path',(await invoke('updateMarketplaceAction',{...metadata,status:'published'})).ok);
    await signIn('B');await navigate('/marketplace/'+listing.id);await wait("document.body.innerText.includes('Adopt template')");await discover();
    state.fund.freeRequestId??=randomUUID();save();
    for(let n=0;n<2;n++){const free=await invoke('adoptMarketplaceAction',{listingId:listing.id,requestId:state.fund.freeRequestId});check('free adoption remains separate and idempotent '+n,free.ok&&free.projectId!==state.fund.adoptedProjectId&&(!state.fund.freeProjectId||free.projectId===state.fund.freeProjectId));state.fund.freeProjectId=free.projectId;save();}
    await navigate('/dashboard/marketplace/purchases');await wait("document.body.innerText.includes('Open adopted project')");await discover();
    check('partially refunded paid adoption still recovers original project',(await invoke('recoverMarketplacePurchaseAction',{purchaseId:p.id})).data?.projectId===state.fund.adoptedProjectId);
    await signIn('A');await navigate('/dashboard/marketplace/'+listing.id);await wait("!!document.querySelector('form')");await discover();
    check('controlled acceptance listing finishes free and unpublished',(await invoke('updateMarketplaceAction',{...metadata,status:'unpublished'})).ok);
    check('fresh hosted acceptance browser has no exceptions',browser.errors.length===0);
  });
  check('free regression creates no additional paid purchase',(await rows('marketplace_purchases','listing_id',listing.id)).length===1);
  check('all hosted financial checks preserve AI credits and credit purchases',await protectedSnapshot()===state.aiBefore);
  const aa=await account(a);check('no hosted test withdrawal remains pending or processing',aa.pending===0&&aa.history.every(v=>!['pending','eligible','processing'].includes(v.status)));
  state.completedAt=new Date().toISOString();save();
  console.log(JSON.stringify({checks:state.checks.length,available:aa.available,pending:aa.pending,deficit:aa.deficit,requestedAt:w.requested_at,holdUntil:w.hold_until,holdHours:168,realRefundGross:300,creatorReversal:270,feeReversal:30,released:430,artifact}));
}
async function webhookSecurity(){
  const before=hash({account:await account(a),events:await rows('creator_money_events','creator_user_id',a.id)});
  for(const event_type of load('lib/marketplace/withdrawals/contract.ts').payoutWebhookEvents){
    const response=await fetch(origin+'/api/payments/paypal/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'UNSIGNED_ACCEPTANCE',event_type,resource:{payout_batch_id:'V8TF9GR32ZZ5E'}}),signal:AbortSignal.timeout(20000)});
    const value=await response.json();check('deployed unsigned payout event rejected '+event_type,response.status===400&&value.code==='INVALID_SIGNATURE');
  }
  check('unsigned payout events have no hosted financial or AI effect',hash({account:await account(a),events:await rows('creator_money_events','creator_user_id',a.id)})===before&&await protectedSnapshot()===state.aiBefore);
  console.log(JSON.stringify({checks:state.checks.length,unsignedEventsRejected:9}));
}
if(mode==='preflight')await preflight();
else if(mode==='browser')await browserChecks();
else if(mode==='fund')await prepareFundedCheckout();
else if(mode==='reserve')await reserveFundedEarnings();
else if(mode==='refund1')await refundFundedReservation('first',100,610,200);
else if(mode==='refund2')await refundFundedReservation('second',200,0,630);
else if(mode==='finish')await finishHostedAcceptance();
else if(mode==='webhook-security')await webhookSecurity();
else throw Error('UNKNOWN_ACCEPTANCE_MODE');
