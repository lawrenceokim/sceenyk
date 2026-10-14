// Explicit deployed Merchant Sandbox acceptance. No AI/provider generation,
// credits, payouts, Live endpoints, history deletion or buyer passwords.
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
  assert.ok(/^\/v1\/notifications\/(webhooks|webhooks-events)(\/|\?|$)/.test(route)||/^\/v2\/payments\/captures\/[A-Z0-9]{10,32}\/refund$/.test(route),'REVIEWED_SANDBOX_PATH');
  const c=config.getPayPalConfig();
  const auth=await fetch(c.baseUrl+'/v1/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(c.clientId+':'+c.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  assert.ok(auth.ok,'SANDBOX_OAUTH');const token=(await auth.json()).access_token;
  const r=await fetch(c.baseUrl+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation',...(requestId?{'PayPal-Request-ID':requestId}:{})},...(body?{body:JSON.stringify(body)}:{})});
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
  const t=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',process.env.INNGEST_SIGNING_KEY.replace(/^signkey-\w+-/,'')).update(t).digest('hex');
  const headers={'x-inngest-signature':`t=${t}&s=${signature}`};
  const endpoint=await fetch(origin+'/api/inngest',{headers,signal:AbortSignal.timeout(30000)}),info=await endpoint.json();
  assert.equal(endpoint.status,200,'AUTHENTICATED_SDK_METADATA_REQUIRED');
  assert.ok(info.function_count>=9,'DEPLOY_NEW_SETTLEMENT_FUNCTION_FIRST');
  const r=await fetch(origin+'/api/inngest',{method:'PUT',headers,signal:AbortSignal.timeout(55000)});
  check('deployed SDK synchronizes existing Cloud app',r.status===200);
  const cloud=await fetch('https://api.inngest.com/v2/apps',{headers:{Authorization:'Bearer '+process.env.INNGEST_SIGNING_KEY},signal:AbortSignal.timeout(30000)});assert.ok(cloud.ok);
  const apps=(await cloud.json()).data,app=apps.find(a=>a.id==='sceenyk');
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
      const listing=await one('marketplace_listings','id',p.listing_id);
      state.pendingSourceId=listing.source_project_id;state.pendingSourceHash=hash(await one('projects','id',state.pendingSourceId));
      state.pendingSaleHash=hash(events.find(e=>e.state==='pending'));state.pendingPurchaseHash=hash(p);
      state.pendingProjectId=adopted[0].project_id;state.pendingProjectHash=hash(await one('projects','id',state.pendingProjectId));state.pendingObservedAt=new Date().toISOString();save();
    }
  }else if(!pending&&events.some(e=>e.state==='available')){
    check('server-only schedule settles retained valid sale exactly once',events.filter(e=>e.state==='available').length===1&&contexts.length===1&&Date.parse(contexts[0].eligible_at)<=Date.parse(events.find(e=>e.state==='available').created_at));
    state.availableObservedAt??=new Date().toISOString();state.originalAvailableHash??=hash(events.find(e=>e.state==='available'));save();
  }
  check('observation preserves AI purchases original media and adopted projects',await protectedSnapshot()===state.before);
  console.log(JSON.stringify({purchase:pending?'pending-case':'available-case',payment:p.status,events:events.map(e=>e.state),adjustments:adjustments.length,reversedGross:adjustments.reduce((n,e)=>n+e.gross_minor,0),eligibleAt:contexts[0]?.eligible_at??null}));
}
async function refundCapture(key,pending,amount,late=false){
  assert.ok(state.syncedAt,'DEPLOY_AND_SYNC_FIRST');
  const id=pending?state.pendingPurchaseId:state.availablePurchaseId,p=await one('marketplace_purchases','id',id);
  assert.ok(p.environment==='sandbox'&&p.status==='completed'&&p.creator_user_id===previous.aId&&p.buyer_user_id===previous.bId&&p.amount_minor===200,'ONLY_PINNED_RESERVED_MARKETPLACE_CAPTURE');
  if(late){
    assert.ok(pending&&state.latePendingCase?.purchaseId===p.id,'ONLY_ARCHIVED_LATE_TEST_CASE');
    const c=await one('creator_earning_settlement_contexts','purchase_id',id);
    assert.ok(Date.parse(c.eligible_at)<=Date.now(),'ONLY_EXPIRED_ACCEPTANCE_WINDOW');
  }else if(pending){
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
  if(attempt){
    const order=await paypal.readPayPalOrder(p.paypal_order_id),recorded=new Set(Object.values(state.refunds).map(r=>r.id).filter(Boolean));
    const candidates=(order.purchase_units[0].payments?.refunds??[]).filter(r=>!recorded.has(r.id)&&r.amount.currency_code==='USD'&&r.amount.value===(amount/100).toFixed(2));
    if(candidates.length===1){
      const existing=await paypal.readPayPalRefund(candidates[0].id);
      assert.equal(paypal.paypalParentId(existing.links,'captures'),p.paypal_capture_id,'RECOVER_ONLY_ORIGINAL_CAPTURE_REFUND');
      attempt.id=existing.id;attempt.status=existing.status;attempt.cumulative=existing.seller_payable_breakdown?.total_refunded_amount?.value??null;save();
      check('uncertain Sandbox response recovered without another refund '+key,true);return;
    }
    assert.ok(Date.now()-Date.parse(attempt.startedAt)<5*60000,'UNKNOWN_REFUND_OUTCOME_RECONCILE_NO_NEW_KEY');
  }
  else {attempt={purchaseId:p.id,captureId:p.paypal_capture_id,amount,requestId:randomUUID(),startedAt:new Date().toISOString()};state.refunds[key]=attempt;save();}
  const r=await sandbox('/v2/payments/captures/'+paypal.paypalOrderId.parse(p.paypal_capture_id)+'/refund',{method:'POST',requestId:attempt.requestId,body:{amount:{value:(amount/100).toFixed(2),currency_code:'USD'}}});
  const refund=paypal.paypalRefundSchema.parse(r.data);
  assert.equal(paypal.paypalParentId(refund.links,'captures'),p.paypal_capture_id);
  attempt.id=refund.id;attempt.status=refund.status;attempt.cumulative=refund.seller_payable_breakdown?.total_refunded_amount?.value??null;save();
  check('real Sandbox refund accepted '+key,['COMPLETED','PENDING'].includes(refund.status));
  console.log(JSON.stringify({refund:key,status:refund.status,cumulative:attempt.cumulative,creatingBrowserClosed:true}));
}
async function archiveLateCase(){
  assert.ok(state.pendingPurchaseId&&!state.pendingObservedAt,'ONLY_UNOBSERVED_LATE_CASE');
  const p=await one('marketplace_purchases','id',state.pendingPurchaseId),c=await one('creator_earning_settlement_contexts','purchase_id',p.id);
  assert.ok(Date.parse(c.eligible_at)<=Date.now(),'LATE_WINDOW_MUST_HAVE_ELAPSED');
  if(!state.latePendingCase){
    const events=await rows('creator_earnings_ledger','marketplace_purchase_id',p.id),adoptions=await rows('marketplace_adoptions','purchase_id',p.id),listing=await one('marketplace_listings','id',p.listing_id);
    assert.equal(adoptions.length,1,'ONE_LATE_TEST_PROJECT');
    state.latePendingCase={purchaseId:p.id,listingId:p.listing_id,originalListing:state.pendingOriginalListing,projectId:adoptions[0].project_id,projectHash:hash(await one('projects','id',adoptions[0].project_id)),sourceId:listing.source_project_id,sourceHash:hash(await one('projects','id',listing.source_project_id)),saleHash:hash(events.find(e=>e.state==='pending')),purchaseHash:hash(p),hadAvailable:events.some(e=>e.state==='available'),eligibleAt:c.eligible_at,missedAt:new Date().toISOString()};save();
  }
  await refundCapture('latePendingFull',true,200,true);
  assert.equal(state.refunds.latePendingFull.status,'COMPLETED','COMPLETE_LATE_TEST_REFUND_BEFORE_NEW_CASE');
  for(const key of ['pendingPurchaseId','pendingListingId','pendingOriginalListing','pendingApprovalUrl'])delete state[key];
  save();check('late approval case refunded and retained without claiming pending acceptance',true);
}
async function beginPending(){
  assert.ok(state.syncedAt&&!state.pendingPurchaseId,'ONE_NEW_RESERVED_PENDING_CASE');
  const fixture=market.paginationFixtures[state.latePendingCase?1:0],listing=await one('marketplace_listings','id',fixture.listingId);
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
async function monitorPending(){
  assert.ok(state.pendingPurchaseId&&!state.pendingObservedAt&&!state.refunds.pendingFull,'ONE_ACTIVE_PENDING_CASE');
  state.pendingWatcherStartedAt=new Date().toISOString();save();
  console.log(JSON.stringify({watcher:'ready',browserClosed:true,intervalSeconds:3,limitMinutes:30}));
  const deadline=Date.now()+30*60000;let tick=0;
  while(Date.now()<deadline){
    const p=await one('marketplace_purchases','id',state.pendingPurchaseId);
    if(p.status==='failed')throw new Error('PENDING_ACCEPTANCE_PAYMENT_FAILED');
    if(p.status==='completed'){
      const contexts=await rows('creator_earning_settlement_contexts','purchase_id',p.id),adoptions=await rows('marketplace_adoptions','purchase_id',p.id);
      if(contexts.length&&adoptions.length){
        await observe(true);
        await refundCapture('pendingFull',true,200);
        state.pendingWatcherFinishedAt=new Date().toISOString();save();return;
      }
    }
    if(++tick%10===0)console.log(JSON.stringify({watcher:'awaiting-approval',payment:p.status}));
    await delay(3000);
  }
  throw new Error('PENDING_ACCEPTANCE_WATCHER_EXPIRED');
}
async function partialProof(){
  const p=await one('marketplace_purchases','id',state.availablePurchaseId),adjustments=await rows('marketplace_payment_adjustments','purchase_id',p.id);
  const expected=Object.entries(state.refunds).filter(([key,r])=>key.startsWith('available')&&r.id).reduce((sum,[,r])=>sum+r.amount,0);
  assert.ok(expected>0,'REAL_REFUND_REQUIRED');
  const fee=Math.floor((2*p.platform_fee_minor*expected+p.amount_minor)/(2*p.amount_minor)),net=expected-fee;
  check('real cumulative gross fee and creator reversal '+expected,adjustments.reduce((n,r)=>n+r.gross_minor,0)===expected&&adjustments.reduce((n,r)=>n+r.fee_minor,0)===fee&&adjustments.reduce((n,r)=>n+r.net_minor,0)===net);
  check('real adjustment applied to available state '+expected,adjustments.every(r=>r.source_state==='available'));
  check('one adjustment per observed real partial refund '+expected,adjustments.length===Object.entries(state.refunds).filter(([key,r])=>key.startsWith('available')&&r.id).length);
  const balance=await one('creator_earning_balances','marketplace_purchase_id',p.id);
  check('real remaining available net '+expected,balance.net_minor-balance.reversed_net===p.creator_net_minor-net);
  check('real partial refund preserves original availability '+expected,hash((await rows('creator_earnings_ledger','marketplace_purchase_id',p.id)).find(e=>e.state==='available'))===state.originalAvailableHash);
  check('real refund preserves AI and buyer customization '+expected,await protectedSnapshot()===state.before);
}
async function verify(){
  const cases=[['available',state.availablePurchaseId],['pending',state.pendingPurchaseId],...(state.latePendingCase?[['late',state.latePendingCase.purchaseId]]:[])];
  for(const [label,id] of cases){
    assert.ok(id,'BOTH_REAL_CASES_REQUIRED');
    const p=await one('marketplace_purchases','id',id),events=await rows('creator_earnings_ledger','marketplace_purchase_id',id),adjustments=await rows('marketplace_payment_adjustments','purchase_id',id);
    check(label+' refund reverses original exact gross fee net',adjustments.reduce((n,e)=>n+e.gross_minor,0)===p.amount_minor&&adjustments.reduce((n,e)=>n+e.fee_minor,0)===p.platform_fee_minor&&adjustments.reduce((n,e)=>n+e.net_minor,0)===p.creator_net_minor);
    check(label+' original purchase pending sale and entitlement retained',p.status==='completed'&&events.filter(e=>e.state==='pending').length===1&&(await rows('marketplace_entitlements','purchase_id',id)).length===1);
    check(label+' exactly one terminal reversal',events.filter(e=>e.state==='reversed').length===1);
    check(label+' settlement lifecycle retained',events.filter(e=>e.state==='available').length===(label==='available'||(label==='late'&&state.latePendingCase.hadAvailable)?1:0));
    const adoption=await rows('marketplace_adoptions','purchase_id',id);check(label+' one buyer project retained',adoption.length===1);
    if(label==='pending'){
      const context=await one('creator_earning_settlement_contexts','purchase_id',id);
      check('real pending adjustment committed before eligibility',adjustments.length===1&&adjustments[0].source_state==='pending'&&Date.parse(adjustments[0].created_at)<Date.parse(context.eligible_at)&&Date.parse(state.pendingObservedAt)<Date.parse(context.eligible_at));
      check('pending buyer project unchanged by refund',hash(await one('projects','id',state.pendingProjectId))===state.pendingProjectHash);
      check('pending source purchase and original earning immutable',hash(await one('projects','id',state.pendingSourceId))===state.pendingSourceHash&&hash(p)===state.pendingPurchaseHash&&hash(events.find(e=>e.state==='pending'))===state.pendingSaleHash);
    }
    else if(label==='late')check('late test source purchase sale and project retained',hash(p)===state.latePendingCase.purchaseHash&&hash(events.find(e=>e.state==='pending'))===state.latePendingCase.saleHash&&hash(await one('projects','id',state.latePendingCase.projectId))===state.latePendingCase.projectHash&&hash(await one('projects','id',state.latePendingCase.sourceId))===state.latePendingCase.sourceHash);
    else check('original available event immutable',hash(events.find(e=>e.state==='available'))===state.originalAvailableHash);
  }
  const earnings=await db.rpc('marketplace_creator_earnings',{p_creator_user_id:previous.aId,p_page:1});assert.ok(!earnings.error);
  check('creator net balances zero after all retained test refunds',earnings.data.pending===0&&earnings.data.available===0&&earnings.data.lifetime===0&&earnings.data.reversedGross===cases.length*200);
  check('protected AI credit purchases source and existing projects unchanged',await protectedSnapshot()===state.before);
}
async function ui(creatorOnly=false){
  await browser(async b=>{
    const{signIn,navigate,wait,discover,invoke,evaluate}=b;
    await signIn('A');await navigate('/dashboard/marketplace/earnings');await wait("document.body.innerText.includes('Lifetime gross sales')");await discover();
    const result=await invoke('creatorEarningsAction',1);check('creator UI reads safe accurate financial history',result.ok&&result.data.earnings.sales.some(s=>s.history.some(e=>e.kind==='refund')));
    check('creator history has no private capabilities or provider data',!/X-Amz-|r2\.cloudflarestorage|paypal_capture_id|paypal_order_id|PAYPAL_CLIENT_SECRET|buyer_user_id/.test(await evaluate("document.querySelector('main').outerHTML")));
    check('earnings page contains no payout control',!await evaluate("[...document.querySelectorAll('button,a')].some(e=>/withdraw|pay out/i.test(e.textContent))"));
    check('financial history supports keyboard focus',await evaluate("(()=>{const s=document.querySelector('details summary');s.focus();return document.activeElement===s;})()"));
    for(const width of [1440,390,320])for(const dark of [false,true]){
      await b.call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.documentElement.classList.toggle('dark',${dark});document.querySelector('details')?.setAttribute('open','')`);
      await evaluate('new Promise(resolve=>setTimeout(resolve,350))');
      check('earnings history fits '+width+(dark?' dark':' light'),await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      if(width!==320){const screenshot=await b.call('Page.captureScreenshot',{format:'png'}),file=path.join(os.tmpdir(),`sceenyk-settlement-${width}-${dark?'dark':'light'}.png`);fs.writeFileSync(file,Buffer.from(screenshot.data,'base64'));if(!state.screenshots.includes(file))state.screenshots.push(file);save();}
    }
    if(creatorOnly){check('creator financial browser has no exceptions',b.errors.length===0);return;}
    await signIn('B');await navigate('/dashboard/marketplace/earnings');await wait("document.body.innerText.includes('Lifetime gross sales')");await discover();
    const other=await invoke('creatorEarningsAction',1);check('buyer cannot view creator earnings',other.ok&&other.data.earnings.total===0);
    check('buyer cannot inject creator into earnings read',!(await invoke('creatorEarningsAction',{page:1,creatorUserId:previous.aId})).ok);
    await navigate('/dashboard/marketplace/purchases');await wait("document.body.innerText.includes('refunded')");await discover();
    const purchases=await invoke('marketplacePurchasesAction',1);check('buyer sees both refunds and retains projects',purchases.ok&&[state.availablePurchaseId,state.pendingPurchaseId].every(id=>purchases.data.items.some(p=>p.id===id&&p.financialStatus==='refunded'&&p.projectId)));
    check('buyer financial page has no private capabilities or provider data',!/X-Amz-|r2\.cloudflarestorage|paypal_capture_id|paypal_order_id|PAYPAL_CLIENT_SECRET|buyer_user_id/.test(await evaluate("document.querySelector('main').outerHTML")));
    for(const [id,projectId] of [[state.availablePurchaseId,previous.projectId],[state.pendingPurchaseId,state.pendingProjectId]])for(let attempt=0;attempt<2;attempt++){const p=await invoke('recoverMarketplacePurchaseAction',{purchaseId:id});check('refund recovery retains same adopted project '+id+' '+attempt,p.ok&&p.data.projectId===projectId);}
    await navigate('/dashboard/marketplace/purchases');await wait("document.body.innerText.includes('refunded')");check('refresh reopen preserves refund balances and projects',true);
    await navigate('/projects/'+previous.projectId);await wait("!!document.querySelector('textarea')");await discover();
    const assets=await rows('project_assets','project_id',previous.sourceId);
    check('refunded buyer still cannot access creator private media',(await invoke('readMediaAction',{projectId:previous.sourceId,assetId:assets[0].id})).code==='NOT_FOUND');
    await navigate('/projects/'+previous.freeProjectId);await wait("!!document.querySelector('textarea')");check('existing free adopted project still reopens',true);
    for(const metadata of [state.pendingOriginalListing,state.latePendingCase?.originalListing].filter(Boolean)){await signIn('A');await navigate('/dashboard/marketplace/'+metadata.id);await wait("!!document.querySelector('form [name=adoptionType]')");await discover();check('reserved test listing restored to free unpublished '+metadata.id,(await invoke('updateMarketplaceAction',metadata)).ok);}
    check('financial browser has no exceptions',b.errors.length===0);
  });
}
async function listingStats(){
  const ids=[previous.listingId,state.pendingListingId,...(state.latePendingCase?[state.latePendingCase.listingId]:[])],found=[];
  for(let page=1;page<=10&&found.length<ids.length;page++){
    const r=await db.rpc('marketplace_owned',{p_owner_user_id:previous.aId,p_page:page});assert.ok(!r.error,'OWNED_LISTING_STATS');
    for(const l of r.data.items)if(ids.includes(l.id)){check('refunded listing retains sale count with zero creator net '+l.id,l.paidSalesCount===1&&l.creatorEarningsMinor===0&&l.adoptionCount>=1);found.push(l.id);}
  }
  check('all retained refunded listing statistics remain accessible',found.length===ids.length);
}
async function postEligibility(){
  const c=await one('creator_earning_settlement_contexts','purchase_id',state.pendingPurchaseId);
  assert.ok(Date.now()>=Date.parse(c.eligible_at)+60000,'WAIT_UNTIL_ONE_SCHEDULE_INTERVAL_AFTER_ELIGIBILITY');
  const events=await rows('creator_earnings_ledger','marketplace_purchase_id',state.pendingPurchaseId);
  check('pending refund never becomes available after eligibility',events.filter(e=>e.state==='available').length===0&&events.filter(e=>e.state==='reversed').length===1);
  const candidates=await db.rpc('marketplace_financial_candidates');assert.ok(!candidates.error,'CANDIDATE_READ');
  check('fully reversed purchase is excluded from settlement candidates',!candidates.data.includes(state.pendingPurchaseId));
  state.postEligibilityVerifiedAt=new Date().toISOString();save();
  await verify();
}
async function replay(){
  assert.ok(state.refunds.availableFull?.id,'FULL_REAL_REFUND_REQUIRED');
  const events=(await sandbox('/v1/notifications/webhooks-events?page_size=100')).data.events;
  const target=events.find(e=>e.event_type==='PAYMENT.CAPTURE.REFUNDED'&&e.resource?.id===state.refunds.availableFull.id);assert.ok(target,'AUTHENTIC_FULL_REFUND_EVENT_REQUIRED');
  state.replayEventId=target.id;state.replayFinancialHash=hash({events:await rows('creator_earnings_ledger','marketplace_purchase_id',state.availablePurchaseId),adjustments:await rows('marketplace_payment_adjustments','purchase_id',state.availablePurchaseId)});save();
  const r=await sandbox('/v1/notifications/webhooks-events/'+encodeURIComponent(target.id)+'/resend',{method:'POST',body:{webhook_ids:[config.getPayPalConfig().webhookId]}});
  check('PayPal accepts authentic completed-refund replay',r.status===202);
  console.log(JSON.stringify({eventId:target.id,deliveryResultAvailable:false}));
}
async function replayProof(){
  check('authentic replay leaves financial history exactly unchanged',state.replayFinancialHash===hash({events:await rows('creator_earnings_ledger','marketplace_purchase_id',state.availablePurchaseId),adjustments:await rows('marketplace_payment_adjustments','purchase_id',state.availablePurchaseId)}));
  const detail=(await sandbox('/v1/notifications/webhooks-events/'+encodeURIComponent(state.replayEventId))).data;
  state.replayDelivery={status:detail.status??null,transmissions:(detail.transmissions??[]).map(t=>({status:t.status??null,httpStatus:t.http_status??null,timestamp:t.timestamp??null}))};save();
  console.log(JSON.stringify({eventId:state.replayEventId,deliveryEvidence:state.replayDelivery}));
  if(state.pendingObservedAt&&state.refunds.pendingFull?.id)await verify();
}
async function security(){
  const names=['PAYPAL_CLIENT_SECRET','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','CLERK_SECRET_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY','WORKER_SHARED_SECRET','GEMINI_API_KEY','FAL_KEY','ELEVENLABS_API_KEY'];
  const secrets=names.map(name=>process.env[name]).filter(Boolean),scripts=new Set();
  for(const route of ['/marketplace','/marketplace/'+previous.listingId]){
    const r=await fetch(origin+route,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'PUBLIC_MARKETPLACE_READ');const body=await r.text();
    check('deployed HTML has no secrets or private R2 URL '+route.split('/').length,!secrets.some(secret=>body.includes(secret))&&!/X-Amz-Signature|r2\.cloudflarestorage\.com/.test(body));
    for(const m of body.matchAll(/<script[^>]+src="([^"]+)"/g)){const u=new URL(m[1].replaceAll('&amp;','&'),origin);if(u.origin===origin&&u.pathname.startsWith('/_next/'))scripts.add(u.href);}
  }
  for(const url of scripts){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const body=await r.text();assert.ok(!secrets.some(secret=>body.includes(secret)),'DEPLOYED_CLIENT_SECRET');assert.ok(!/PAYPAL_CLIENT_SECRET|marketplace_apply_financial_observation|marketplace_ensure_settlement|marketplace_financial_candidates|marketplace_fulfil_purchase|api-m\.sandbox\.paypal\.com/.test(body),'DEPLOYED_SERVER_BOUNDARY_LEAK');}
  check('deployed bundles keep financial accounting server-only',scripts.size>0);
  for(const type of ['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED','PAYMENT.REFUND.PENDING','PAYMENT.REFUND.FAILED']){
    const r=await fetch(origin+'/api/payments/paypal/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'UNSIGNED_REFUND_ACCEPTANCE',event_type:type,resource:{id:'REFUND0000000001'}}),signal:AbortSignal.timeout(20000)});
    check('deployed unsigned '+type+' refused',r.status===400);
  }
  state.deployedScan={clientFiles:scripts.size,configuredSecrets:secrets.length,leaks:0};save();
}
async function confirmDelivery(){
  assert.ok(process.argv.includes('--user-confirmed-delivered-success')&&state.replayEventId,'EXPLICIT_USER_DASHBOARD_CONFIRMATION_REQUIRED');
  state.userConfirmedReplay={eventId:state.replayEventId,status:'delivered',confirmedAt:new Date().toISOString(),source:'user PayPal Sandbox dashboard report'};
  check('user confirms authentic duplicate refund delivered successfully',true);
}
const modes={preflight,subscriptions,sync,observe,observePending:()=>observe(true),beginPending,monitorPending,archiveLateCase,refundAvailable1:()=>refundCapture('available1',false,51),refundAvailable2:()=>refundCapture('available2',false,52),refundAvailableFull:()=>refundCapture('availableFull',false,97),refundPending:()=>refundCapture('pendingFull',true,200),partialProof,verify,postEligibility,ui,creatorUi:()=>ui(true),listingStats,replay,replayProof,security,confirmDelivery};
try{assert.ok(modes[mode],'KNOWN_ACCEPTANCE_MODE');await modes[mode]();console.log(JSON.stringify({mode,checks:state.checks.length,screenshots:state.screenshots.length}));}catch(error){console.error(JSON.stringify({failed:mode,reason:error instanceof assert.AssertionError?error.message:'ACCEPTANCE_OPERATION_FAILED'}));process.exitCode=1;}
