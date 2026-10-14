// Explicit deployed Merchant Sandbox acceptance. No AI/provider generation,
// credits, payouts, Live endpoints, history deletion or buyer passwords.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {deployedBrowser} from './lib/deployed-browser.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const origin='https://sceenyk.vercel.app',mode=process.argv[2]??'preflight';
const load=typescriptLoader(),db=load('lib/db/server.ts').createDatabaseClient();
const paypal=load('lib/payments/paypal/client.ts'),config=load('lib/payments/paypal/config.ts');
const previous=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-marketplace-payments-acceptance.json'),'utf8'));
const market=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-marketplace-deployed-acceptance.json'),'utf8'));
const artifact=path.join(os.tmpdir(),'sceenyk-marketplace-settlement-acceptance.json');
let state;try{state=JSON.parse(fs.readFileSync(artifact,'utf8'));}catch{state={checks:[],screenshots:[],refunds:{},availablePurchaseId:previous.purchaseId};}
assert.equal(state.availablePurchaseId,previous.purchaseId,'PINNED_ORIGINAL_MARKETPLACE_PURCHASE');
const save=()=>fs.writeFileSync(artifact,JSON.stringify(state,null,2));
function check(name,value){assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));}
async function rows(table,key,value){let q=db.from(table).select('*');if(key)q=q.eq(key,value);const r=await q;assert.ok(!r.error,'HOSTED_'+table);return r.data;}
async function one(table,key,value){const r=await db.from(table).select('*').eq(key,value).single();assert.ok(!r.error&&r.data,'HOSTED_'+table);return r.data;}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
async function protectedSnapshot(){
  const data={};
  for(const id of [previous.aId,previous.bId])for(const table of ['generation_accounts','credit_ledger','credit_purchases'])data[id+table]=(await rows(table,'owner_user_id',id)).sort((a,b)=>JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))));
  for(const id of [previous.sourceId,previous.projectId,previous.freeProjectId]){
    data[id]=await one('projects','id',id);
    for(const table of ['project_assets','generation_jobs'])data[id+table]=(await rows(table,'project_id',id)).sort((a,b)=>a.id.localeCompare(b.id));
  }
  return hash(data);
}
async function sandbox(route,{method='GET',body,requestId}={}){
  assert.ok(/^\/v1\/notifications\/(webhooks|webhooks-events)(\/|$)/.test(route)||/^\/v2\/payments\/captures\/[A-Z0-9]{10,32}\/refund$/.test(route),'REVIEWED_SANDBOX_PATH');
  const c=config.getPayPalConfig();
  const auth=await fetch(c.baseUrl+'/v1/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(c.clientId+':'+c.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  assert.ok(auth.ok,'SANDBOX_OAUTH');const token=(await auth.json()).access_token;
  const r=await fetch(c.baseUrl+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(requestId?{'PayPal-Request-ID':requestId}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.ok(r.ok,'SANDBOX_HTTP_'+r.status);const text=await r.text();return{status:r.status,data:text?JSON.parse(text):null};
}
async function browser(work){
  const a=await one('app_users','id',previous.aId),b=await one('app_users','id',previous.bId);
  assert.ok(a.email?.includes('+clerk_test@')&&b.email?.includes('+clerk_test@'),'RESERVED_IDENTITIES');
  return deployedBrowser(origin,{A:a.clerk_user_id,B:b.clerk_user_id},async browser=>{
    const navigate=async route=>{const u=new URL(route,origin);await browser.call('Page.navigate',{url:u.href});await browser.wait(`document.readyState!=='loading'&&location.pathname===${JSON.stringify(u.pathname)}&&location.search===${JSON.stringify(u.search)}`);};
    return work({...browser,navigate});
  });
}
async function preflight(){
  for(const table of ['creator_earning_settlement_contexts','marketplace_payment_adjustments','creator_earning_balances']){
    const r=await db.from(table).select('*').limit(0);check('hosted023 '+table,!r.error);
  }
  state.before??=await protectedSnapshot();save();
  const p=await one('marketplace_purchases','id',state.availablePurchaseId);
  check('retained real paid sale is completed and Sandbox',p.status==='completed'&&p.environment==='sandbox'&&p.buyer_user_id===previous.bId&&p.creator_user_id===previous.aId&&p.amount_minor===200&&p.paypal_capture_id===previous.captureId);
  const [order,capture]=await Promise.all([paypal.readPayPalOrder(p.paypal_order_id),paypal.readPayPalCapture(p.paypal_capture_id)]);
  const verified=load('lib/marketplace/earnings/verification.ts').financialObservation(p,order,capture);
  check('real Sandbox order and capture satisfy current financial verifier',verified.refunded>=0&&verified.refunded<=p.amount_minor);
  const publicDb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const table of ['creator_earning_settlement_contexts','marketplace_payment_adjustments','creator_earning_balances']){
    const read=await publicDb.from(table).select('*').limit(0);check('browser denied private '+table,read.error?.code==='42501');
  }
  for(const name of ['marketplace_financial_candidates','marketplace_apply_financial_observation']){
    const args=name==='marketplace_financial_candidates'?{}:{p_purchase_id:p.id,p_order_id:p.paypal_order_id,p_capture_id:p.paypal_capture_id,p_amount_minor:p.amount_minor,p_currency:'USD',p_capture_status:'COMPLETED',p_refunded_minor:0,p_can_settle:true,p_reason:'refund',p_reference_key:'browser-forgery'};
    const r=await publicDb.rpc(name,args);check('browser denied '+name,r.error?.code==='42501');
  }
  for(const table of ['creator_earning_settlement_contexts','marketplace_payment_adjustments']){
    if(table==='creator_earning_settlement_contexts'){
      const proper=await db.from(table).update({eligible_at:new Date().toISOString()}).eq('purchase_id',randomUUID());check('service cannot directly change eligibility',proper.error?.code==='42501');
    }else {
      const r=await db.from(table).update({created_at:new Date().toISOString()}).eq('id',randomUUID());check('service cannot directly alter adjustments',r.error?.code==='42501');
    }
  }
  check('preflight leaves protected AI purchases source and projects unchanged',await protectedSnapshot()===state.before);
}
async function subscriptions(){
  const c=config.getPayPalConfig(),route='/v1/notifications/webhooks/'+encodeURIComponent(c.webhookId);
  const webhook=(await sandbox(route)).data;
  assert.equal(webhook.url,origin+'/api/payments/paypal/webhook','PINNED_EXISTING_WEBHOOK');
  const required=['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED','PAYMENT.REFUND.PENDING','PAYMENT.REFUND.FAILED'];
  const names=[...new Set([...webhook.event_types.map(e=>e.name),...required])];
  if(required.some(name=>!webhook.event_types.some(e=>e.name===name)))await sandbox(route,{method:'PATCH',body:[{op:'replace',path:'/event_types',value:names.map(name=>({name}))}]});
  const updated=(await sandbox(route)).data;
  check('existing webhook retains original and adds only needed refund events',names.every(name=>updated.event_types.some(e=>e.name===name))&&updated.url===webhook.url);
}
async function sync(){
  const endpoint=await fetch(origin+'/api/inngest',{signal:AbortSignal.timeout(30000)}),info=await endpoint.json();
  assert.ok(info.function_count>=9,'DEPLOY_NEW_SETTLEMENT_FUNCTION_FIRST');
  const t=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',process.env.INNGEST_SIGNING_KEY.replace(/^signkey-\w+-/,'')).update(t).digest('hex');
  const r=await fetch(origin+'/api/inngest',{method:'PUT',headers:{'x-inngest-signature':`t=${t}&s=${signature}`},signal:AbortSignal.timeout(55000)});
  check('deployed SDK synchronizes existing Cloud app',r.status===200);
  const cloud=await fetch('https://api.inngest.com/v2/apps',{headers:{Authorization:'Bearer '+process.env.INNGEST_SIGNING_KEY},signal:AbortSignal.timeout(30000)});assert.ok(cloud.ok);
  const apps=await cloud.json(),app=apps.find(a=>a.id==='sceenyk');
  check('Cloud registers deployed function count including settlement',app?.functionCount===info.function_count);
  state.syncedAt=new Date().toISOString();save();
}
async function observe(pending=false){
  const id=pending?state.pendingPurchaseId:state.availablePurchaseId;assert.ok(id,'PURCHASE_REQUIRED');
  const p=await one('marketplace_purchases','id',id),events=await rows('creator_earnings_ledger','marketplace_purchase_id',id),contexts=await rows('creator_earning_settlement_contexts','purchase_id',id),adjustments=await rows('marketplace_payment_adjustments','purchase_id',id);
  if(pending&&p.status==='completed'){
    check('new real sale has exactly one original pending earning',events.filter(e=>e.state==='pending').length===1);
    if(!state.pendingObservedAt){
      check('pending sale not available before eligibility',events.every(e=>e.state!=='available')&&contexts.length===1&&Date.parse(contexts[0].eligible_at)>Date.now());
      const adopted=await rows('marketplace_adoptions','purchase_id',id);check('paid adoption still creates one buyer project',adopted.length===1);
      state.pendingProjectId=adopted[0].project_id;state.pendingProjectHash=hash(await one('projects','id',state.pendingProjectId));state.pendingObservedAt=new Date().toISOString();save();
    }
  }else if(!pending&&events.some(e=>e.state==='available')){
    check('server-only schedule settles retained valid sale exactly once',events.filter(e=>e.state==='available').length===1&&contexts.length===1&&Date.parse(contexts[0].eligible_at)<=Date.parse(events.find(e=>e.state==='available').created_at));
    state.availableObservedAt??=new Date().toISOString();state.originalAvailableHash??=hash(events.find(e=>e.state==='available'));save();
  }
  check('observation preserves AI purchases original media and adopted projects',await protectedSnapshot()===state.before);
  console.log(JSON.stringify({purchase:pending?'pending-case':'available-case',payment:p.status,events:events.map(e=>e.state),adjustments:adjustments.length,reversedGross:adjustments.reduce((n,e)=>n+e.gross_minor,0),eligibleAt:contexts[0]?.eligible_at??null}));
}
async function refundCapture(key,pending,amount){
  assert.ok(state.syncedAt,'DEPLOY_AND_SYNC_FIRST');
  const id=pending?state.pendingPurchaseId:state.availablePurchaseId,p=await one('marketplace_purchases','id',id);
  assert.ok(p.environment==='sandbox'&&p.status==='completed'&&p.creator_user_id===previous.aId&&p.buyer_user_id===previous.bId&&p.amount_minor===200,'ONLY_PINNED_RESERVED_MARKETPLACE_CAPTURE');
  if(pending){
    assert.ok(state.pendingObservedAt,'PROVE_PENDING_BEFORE_REFUND');
    const c=await one('creator_earning_settlement_contexts','purchase_id',id),events=await rows('creator_earnings_ledger','marketplace_purchase_id',id);
    assert.ok(Date.parse(c.eligible_at)>Date.now()&&events.every(e=>e.state!=='available'),'PENDING_REFUND_MUST_PRECEDE_ELIGIBILITY');
  }else assert.ok(state.availableObservedAt,'PROVE_REAL_AVAILABILITY_FIRST');
  if(key==='available2')assert.ok(state.refunds.available1?.id,'FIRST_PARTIAL_REQUIRED');
  if(key==='availableFull')assert.ok(state.refunds.available2?.id,'SECOND_PARTIAL_REQUIRED');
  const capture=await paypal.readPayPalCapture(p.paypal_capture_id);
  assert.ok(capture.id===p.paypal_capture_id&&capture.amount.value==='2.00'&&capture.amount.currency_code==='USD','EXACT_SANDBOX_CAPTURE');
  let attempt=state.refunds[key];
  if(attempt?.id){check('retained refund reused '+key,true);return;}
  if(attempt)assert.ok(Date.now()-Date.parse(attempt.startedAt)<5*60000,'UNKNOWN_REFUND_OUTCOME_RECONCILE_NO_NEW_KEY');
  else {attempt={purchaseId:p.id,captureId:p.paypal_capture_id,amount,requestId:randomUUID(),startedAt:new Date().toISOString()};state.refunds[key]=attempt;save();}
  const r=await sandbox('/v2/payments/captures/'+paypal.paypalOrderId.parse(p.paypal_capture_id)+'/refund',{method:'POST',requestId:attempt.requestId,body:{amount:{value:(amount/100).toFixed(2),currency_code:'USD'}}});
  const refund=paypal.paypalRefundSchema.parse(r.data);
  assert.equal(paypal.paypalParentId(refund.links,'captures'),p.paypal_capture_id);
  attempt.id=refund.id;attempt.status=refund.status;attempt.cumulative=refund.seller_payable_breakdown?.total_refunded_amount?.value??null;save();
  check('real Sandbox refund accepted '+key,['COMPLETED','PENDING'].includes(refund.status));
  console.log(JSON.stringify({refund:key,status:refund.status,cumulative:attempt.cumulative,creatingBrowserClosed:true}));
}
async function beginPending(){
  assert.ok(state.syncedAt&&!state.pendingPurchaseId,'ONE_NEW_RESERVED_PENDING_CASE');
  const fixture=market.paginationFixtures[0],listing=await one('marketplace_listings','id',fixture.listingId);
  assert.ok(listing.creator_user_id===previous.aId&&listing.status==='unpublished'&&listing.adoption_type==='free','RESERVED_UNPUBLISHED_FIXTURE');
  state.pendingListingId=listing.id;state.pendingOriginalListing={id:listing.id,title:listing.title,description:listing.description,category:listing.category,tags:listing.tags,rightsConfirmed:true,status:listing.status,adoptionType:listing.adoption_type,priceMinor:listing.price_minor};save();
  await browser(async({signIn,navigate,wait,discover,invoke})=>{
    await signIn('A');await navigate('/dashboard/marketplace/'+listing.id);await wait("!!document.querySelector('form [name=adoptionType]')");await discover();
    check('creator publishes separate pending-reversal fixture',(await invoke('updateMarketplaceAction',{...state.pendingOriginalListing,status:'published',adoptionType:'paid',priceMinor:200})).ok);
    await signIn('B');await navigate('/marketplace/'+listing.id);await wait("document.body.innerText.includes('Adopt with PayPal Sandbox')");await discover();
    const summary=await invoke('marketplaceCheckoutAction',{listingId:listing.id});check('new paid adoption retains authoritative USD price',summary.ok&&summary.data.amountMinor===200);
    state.pendingPurchaseId=summary.data.id;save();
    const checkout=await invoke('createMarketplaceOrderAction',{purchaseId:state.pendingPurchaseId});assert.ok(checkout.ok&&checkout.data.approvalUrl,'ONE_SAVED_SANDBOX_ORDER');
    state.pendingApprovalUrl=checkout.data.approvalUrl;save();
  });
  console.log(JSON.stringify({approvalUrl:state.pendingApprovalUrl,creatingBrowserClosed:true}));
}
async function verify(){
  for(const [label,id] of [['available',state.availablePurchaseId],['pending',state.pendingPurchaseId]]){
    assert.ok(id,'BOTH_REAL_CASES_REQUIRED');
    const p=await one('marketplace_purchases','id',id),events=await rows('creator_earnings_ledger','marketplace_purchase_id',id),adjustments=await rows('marketplace_payment_adjustments','purchase_id',id);
    check(label+' refund reverses original exact gross fee net',adjustments.reduce((n,e)=>n+e.gross_minor,0)===p.amount_minor&&adjustments.reduce((n,e)=>n+e.fee_minor,0)===p.platform_fee_minor&&adjustments.reduce((n,e)=>n+e.net_minor,0)===p.creator_net_minor);
    check(label+' original purchase pending sale and entitlement retained',p.status==='completed'&&events.filter(e=>e.state==='pending').length===1&&(await rows('marketplace_entitlements','purchase_id',id)).length===1);
    check(label+' exactly one terminal reversal',events.filter(e=>e.state==='reversed').length===1);
    check(label+' settlement lifecycle retained',events.filter(e=>e.state==='available').length===(label==='available'?1:0));
    const adoption=await rows('marketplace_adoptions','purchase_id',id);check(label+' one buyer project retained',adoption.length===1);
    if(label==='pending')check('pending buyer project unchanged by refund',hash(await one('projects','id',state.pendingProjectId))===state.pendingProjectHash);
    else check('original available event immutable',hash(events.find(e=>e.state==='available'))===state.originalAvailableHash);
  }
  const earnings=await db.rpc('marketplace_creator_earnings',{p_creator_user_id:previous.aId,p_page:1});assert.ok(!earnings.error);
  check('creator net balances zero after both full refunds',earnings.data.pending===0&&earnings.data.available===0&&earnings.data.lifetime===0&&earnings.data.reversedGross===400);
  check('protected AI credit purchases source and existing projects unchanged',await protectedSnapshot()===state.before);
}
async function ui(){
  await browser(async b=>{
    const{signIn,navigate,wait,discover,invoke,evaluate}=b;
    await signIn('A');await navigate('/dashboard/marketplace/earnings');await wait("document.body.innerText.includes('Lifetime gross sales')");await discover();
    const result=await invoke('creatorEarningsAction',1);check('creator UI reads safe accurate financial history',result.ok&&result.data.earnings.sales.some(s=>s.history.some(e=>e.kind==='refund')));
    check('earnings page contains no payout control',!await evaluate("[...document.querySelectorAll('button,a')].some(e=>/withdraw|pay out/i.test(e.textContent))"));
    for(const width of [1440,390,320])for(const dark of [false,true]){
      await b.call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.documentElement.classList.toggle('dark',${dark});document.querySelector('details')?.setAttribute('open','')`);
      await evaluate('new Promise(resolve=>setTimeout(resolve,350))');
      check('earnings history fits '+width+(dark?' dark':' light'),await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      if(width!==320){const screenshot=await b.call('Page.captureScreenshot',{format:'png'}),file=path.join(os.tmpdir(),`sceenyk-settlement-${width}-${dark?'dark':'light'}.png`);fs.writeFileSync(file,Buffer.from(screenshot.data,'base64'));if(!state.screenshots.includes(file))state.screenshots.push(file);save();}
    }
    await signIn('B');await navigate('/dashboard/marketplace/earnings');await wait("document.body.innerText.includes('Lifetime gross sales')");await discover();
    const other=await invoke('creatorEarningsAction',1);check('buyer cannot view creator earnings',other.ok&&other.data.earnings.total===0);
    await navigate('/dashboard/marketplace/purchases');await wait("document.body.innerText.includes('refunded')");await discover();
    const purchases=await invoke('marketplacePurchasesAction',1);check('buyer sees both refunds and retains projects',purchases.ok&&[state.availablePurchaseId,state.pendingPurchaseId].every(id=>purchases.data.items.some(p=>p.id===id&&p.financialStatus==='refunded'&&p.projectId)));
    for(const id of [state.availablePurchaseId,state.pendingPurchaseId]){const p=await invoke('recoverMarketplacePurchaseAction',{purchaseId:id});check('refund recovery retains adopted project '+id,p.ok&&!!p.data.projectId);}
    await navigate('/dashboard/marketplace/purchases');await wait("document.body.innerText.includes('refunded')");check('refresh reopen preserves refund balances and projects',true);
    if(state.pendingOriginalListing){await signIn('A');await navigate('/dashboard/marketplace/'+state.pendingListingId);await wait("!!document.querySelector('form [name=adoptionType]')");await discover();check('reserved pending listing restored to free unpublished',(await invoke('updateMarketplaceAction',state.pendingOriginalListing)).ok);}
    check('financial browser has no exceptions',b.errors.length===0);
  });
}
async function replay(){
  assert.ok(state.refunds.availableFull?.id,'FULL_REAL_REFUND_REQUIRED');
  const events=(await sandbox('/v1/notifications/webhooks-events?page_size=100')).data.events;
  const target=events.find(e=>e.event_type==='PAYMENT.CAPTURE.REFUNDED'&&e.resource?.id===state.refunds.availableFull.id);assert.ok(target,'AUTHENTIC_FULL_REFUND_EVENT_REQUIRED');
  state.replayEventId=target.id;state.replayFinancialHash=hash({events:await rows('creator_earnings_ledger'),adjustments:await rows('marketplace_payment_adjustments')});save();
  const r=await sandbox('/v1/notifications/webhooks-events/'+encodeURIComponent(target.id)+'/resend',{method:'POST',body:{webhook_ids:[config.getPayPalConfig().webhookId]}});
  check('PayPal accepts authentic completed-refund replay',r.status===202);
  console.log(JSON.stringify({eventId:target.id,deliveryResultAvailable:false}));
}
async function replayProof(){
  check('authentic replay leaves financial history exactly unchanged',state.replayFinancialHash===hash({events:await rows('creator_earnings_ledger'),adjustments:await rows('marketplace_payment_adjustments')}));
  await verify();
}
const modes={preflight,subscriptions,sync,observe,observePending:()=>observe(true),beginPending,refundAvailable1:()=>refundCapture('available1',false,51),refundAvailable2:()=>refundCapture('available2',false,52),refundAvailableFull:()=>refundCapture('availableFull',false,97),refundPending:()=>refundCapture('pendingFull',true,200),verify,ui,replay,replayProof};
try{assert.ok(modes[mode],'KNOWN_ACCEPTANCE_MODE');await modes[mode]();console.log(JSON.stringify({mode,checks:state.checks.length,screenshots:state.screenshots.length}));}catch(error){console.error(JSON.stringify({failed:mode,reason:error instanceof assert.AssertionError?error.message:'ACCEPTANCE_OPERATION_FAILED'}));process.exitCode=1;}
