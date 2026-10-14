// Explicit real Sandbox acceptance. No AI calls, credit grants or rendering.
// UI/begin publish a reserved creator fixture; begin starts ONE retained order.
// Buyer approval remains manual. Observe makes no application mutation calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {deployedBrowser} from './lib/deployed-browser.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const mode=process.argv[2]??'preflight';
const origin=process.argv[3]??'http://localhost:3015';
assert.ok(['http://localhost:3015','https://sceenyk.vercel.app'].includes(origin),'REVIEWED_ACCEPTANCE_ORIGIN');
const load=typescriptLoader(),db=load('lib/db/server.ts').createDatabaseClient();
const paypal=load('lib/payments/paypal/client.ts'),config=load('lib/payments/paypal/config.ts');
const artifact=path.join(os.tmpdir(),'sceenyk-marketplace-payments-acceptance.json');
let state;try{state=JSON.parse(fs.readFileSync(artifact,'utf8'));}catch{state={checks:[],screenshots:[]};}
if(state.orderId)assert.equal(origin,state.purchaseOrigin,'KEEP_PURCHASE_ORIGIN_FOR_RECOVERY');
const save=()=>fs.writeFileSync(artifact,JSON.stringify(state,null,2));
function check(name,value){assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));}
async function one(table,key,id){const r=await db.from(table).select('*').eq(key,id).single();assert.ok(!r.error&&r.data,'HOSTED_'+table);return r.data;}
async function rows(table,key,id){const r=await db.from(table).select('*').eq(key,id);assert.ok(!r.error,'HOSTED_'+table);return r.data;}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
async function fixtures(){
  const prior=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-marketplace-deployed-acceptance.json'),'utf8'));
  const a=await one('app_users','id',prior.aUserId),b=await one('app_users','id',prior.bUserId);
  assert.ok(a.email?.includes('+clerk_test@')&&b.email?.includes('+clerk_test@')&&a.id!==b.id,'RESERVED_IDENTITIES');
  const listing=await one('marketplace_listings','id',prior.listingId);
  assert.equal(listing.creator_user_id,a.id);
  const source=await one('projects','id',listing.source_project_id);
  state.aId??=a.id;state.bId??=b.id;state.listingId??=listing.id;state.sourceId??=source.id;
  state.originalListing??={id:listing.id,title:listing.title,description:listing.description,category:listing.category,tags:listing.tags,rightsConfirmed:true,status:listing.status,adoptionType:listing.adoption_type,priceMinor:listing.price_minor};
  save();return{a,b,listing,source};
}
async function protectedSnapshot(){
  const result={source:await one('projects','id',state.sourceId)};
  for(const t of ['project_assets','generation_jobs'])result[t]=(await rows(t,'project_id',state.sourceId)).sort((a,b)=>a.id.localeCompare(b.id));
  for(const id of [state.aId,state.bId])for(const table of ['generation_accounts','credit_ledger','credit_purchases'])result[id+table]=(await rows(table,'owner_user_id',id)).sort((a,b)=>JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))));
  return hash(result);
}
async function sandboxRequest(route,method='GET',body){
  assert.ok(route.startsWith('/v1/notifications/'),'REVIEWED_MANAGEMENT_PATH');
  const c=config.getPayPalConfig();
  const auth=await fetch(c.baseUrl+'/v1/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(c.clientId+':'+c.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  assert.ok(auth.ok,'SANDBOX_OAUTH');const token=(await auth.json()).access_token;
  const r=await fetch(c.baseUrl+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.ok(r.ok,'SANDBOX_MANAGEMENT_'+r.status);return{status:r.status,data:await r.json()};
}
async function preflight(){
  for(const table of ['marketplace_purchases','marketplace_entitlements','creator_earnings_ledger']){
    const r=await db.from(table).select('*').limit(0);check('hosted migration 021 '+table,!r.error);
  }
  const r=await db.from('marketplace_listings').select('price_minor,currency,adoption_type').limit(0);check('hosted listing price columns',!r.error);
  const attempt=await db.from('marketplace_purchases').select('paypal_create_started_at').limit(0);check('hosted migration 022 first-create window',!attempt.error);
  const publicDb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const table of ['marketplace_purchases','marketplace_entitlements','creator_earnings_ledger']){
    const read=await publicDb.from(table).select('*').limit(0);check('hosted browser financial read denied '+table,read.error?.code==='42501');
    const write=await db.from(table).update({created_at:new Date().toISOString()}).eq(table==='marketplace_entitlements'?'purchase_id':'id',randomUUID());check('hosted service direct financial write denied '+table,write.error?.code==='42501');
  }
  check('explicit Sandbox environment',config.isPayPalConfigured());
  const c=config.getPayPalConfig();const webhook=(await sandboxRequest('/v1/notifications/webhooks/'+encodeURIComponent(c.webhookId))).data;
  check('existing authentic webhook remains registered',webhook.url==='https://sceenyk.vercel.app/api/payments/paypal/webhook'&&['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED'].every(name=>webhook.event_types.some(e=>e.name===name)));
  console.log(JSON.stringify({mode,ready:true,purchasePrepared:!!state.purchaseId,realOrderStarted:!!state.orderId}));
}
async function browser(work){const f=await fixtures();return deployedBrowser(origin,{A:f.a.clerk_user_id,B:f.b.clerk_user_id},async browser=>{
  const navigate=async route=>{const u=new URL(route,origin);await browser.call('Page.navigate',{url:u.href});await browser.wait(`document.readyState!=='loading'&&location.pathname===${JSON.stringify(u.pathname)}&&location.search===${JSON.stringify(u.search)}`);};
  const click=async text=>{assert.ok(await browser.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true;})()`),'BUTTON_'+text);};
  return work({...browser,navigate,click},f);
});}
async function ui(begin=false){
  assert.ok(!state.browserIndependentRecovery,'RETAINED_PURCHASE_COMPLETED_USE_VERIFY_OR_REOPEN');
  await browser(async(browser,f)=>{
    const{signIn,navigate,wait,evaluate,discover,invoke,click}=browser;
    state.before??=await protectedSnapshot();state.bProjectsBefore??=(await rows('projects','owner_user_id',f.b.id)).map(p=>p.id);save();
    await signIn('A');await navigate('/dashboard/marketplace/'+state.listingId);await wait("!!document.querySelector('form [name=adoptionType]')");await discover();
    const metadata={...state.originalListing,status:'published',adoptionType:'paid',priceMinor:200};
    check('creator publishes USD paid template',(await invoke('updateMarketplaceAction',metadata)).ok===true);
    await navigate('/marketplace/'+state.listingId);await wait("document.body.innerText.includes('Creator adoption price: $2.00')");
    check('detail separates template price from generation',await evaluate("document.body.innerText.includes('AI generation usage')&&document.body.innerText.includes('generation')"));
    const html=await evaluate("document.querySelector('main').outerHTML+' '+document.body.innerText");
    check('paid public detail hides original project and reusable instructions',!html.includes(f.source.id)&&!html.includes(f.listing.template_snapshot.instructions)&&!/X-Amz-|r2\.cloudflarestorage/.test(html));
    await navigate('/marketplace');await wait("document.body.innerText.includes('Creator adoption price: $2.00')");check('browse shows paid price',true);
    await signIn('B');await navigate('/marketplace/'+state.listingId);await wait("document.body.innerText.includes('Adopt with PayPal Sandbox')");await discover();
    check('buyer cannot change creator price',(await invoke('updateMarketplaceAction',{...metadata,priceMinor:100})).ok===false);
    for(const status of ['unpublished','archived'])check('buyer cannot '+status+' creator paid listing',(await invoke('updateMarketplaceAction',{...metadata,status})).ok===false);
    check('buyer cannot bypass payment through free adoption',(await invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:randomUUID()})).ok===false);
    await click('Adopt with PayPal Sandbox');await wait("document.querySelector('[role=dialog]')?.innerText.includes('Template price: $2.00')");
    const summary=await invoke('marketplaceCheckoutAction',{listingId:state.listingId});check('checkout summary uses saved server price',summary.ok&&summary.data.amountMinor===200&&summary.data.currency==='USD');
    state.purchaseId=summary.data.id;state.purchaseOrigin=origin;save();
    check('payment dialog contains keyboard focus',await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"));
    for(const extra of [{amountMinor:1},{currency:'EUR'},{creatorNetMinor:999999},{buyer_user_id:f.a.id}])check('browser cannot set financial fields '+Object.keys(extra)[0],(await invoke('marketplaceCheckoutAction',{listingId:state.listingId,...extra})).ok===false);
    for(const width of [1440,390,320])for(const dark of [false,true]){
      await browser.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
      await evaluate('new Promise(resolve=>setTimeout(resolve,300))');
      const colors=await evaluate("(()=>{const p=document.querySelector('[role=dialog]');const s=getComputedStyle(p);return{background:s.backgroundColor,color:s.color,opacity:s.opacity}})()");
      state.dialogColors??={};state.dialogColors[width+(dark?' dark':' light')]=colors;save();
      check('payment dialog fits '+width+(dark?' dark':' light'),await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('[role=dialog]').getBoundingClientRect().width<=innerWidth"));
      if((width===1440&&!dark)||(width===390&&dark)){const screenshot=await browser.call('Page.captureScreenshot',{format:'png'});const p=path.join(os.tmpdir(),`sceenyk-marketplace-payment-summary-${width}-${dark?'dark':'light'}.png`);fs.writeFileSync(p,Buffer.from(screenshot.data,'base64'));state.screenshots.push(p);save();}
    }
    check('before approval no earning entitlement or project',(await rows('creator_earnings_ledger','marketplace_purchase_id',state.purchaseId)).length===0&&(await rows('marketplace_entitlements','purchase_id',state.purchaseId)).length===0&&(await rows('marketplace_adoptions','purchase_id',state.purchaseId)).length===0);
    if(begin){
      await click('Pay with PayPal Sandbox');await wait("location.hostname==='www.sandbox.paypal.com'");
      const p=await one('marketplace_purchases','id',state.purchaseId);assert.ok(p.paypal_order_id,'SANDBOX_ORDER_ATTACHED');
      state.orderId=p.paypal_order_id;state.approvalUrl=await evaluate('location.href');save();
      check('real PayPal Sandbox order identity amount and listing verified',(()=>{return p.amount_minor===200&&p.listing_id===state.listingId&&p.buyer_user_id===f.b.id;})());
      const order=await paypal.readPayPalOrder(p.paypal_order_id);paypal.verifyOrder(p,order);check('PayPal authoritative USD amount matches saved purchase',order.purchase_units[0].amount.value==='2.00');
    }
    check('payment summary browser has no exceptions',browser.errors.length===0);
  });
  if(begin)console.log(JSON.stringify({purchasePrepared:true,creatingBrowserClosed:true,approvalUrl:state.approvalUrl}));
}
async function observe(requireCompleted=false){
  assert.ok(state.purchaseId,'PREPARE_CHECKOUT_FIRST');
  const p=await one('marketplace_purchases','id',state.purchaseId);
  const earnings=await rows('creator_earnings_ledger','marketplace_purchase_id',p.id),entitlements=await rows('marketplace_entitlements','purchase_id',p.id),adoptions=await rows('marketplace_adoptions','purchase_id',p.id);
  if(requireCompleted){
    check('browser-closed payment recovered before any buyer completion action',p.status==='completed'&&earnings.length===1&&entitlements.length===1&&adoptions.length===1);
    const order=await paypal.readPayPalOrder(p.paypal_order_id);const capture=paypal.verifiedCapture(p,order);check('real completed final capture verified',capture.id===p.paypal_capture_id);
    state.browserIndependentRecovery=true;state.projectId=adoptions[0].project_id;state.captureId=capture.id;save();
  }
  check('AI accounts credit purchases and original private source unchanged',await protectedSnapshot()===state.before);
  console.log(JSON.stringify({status:p.status,earnings:earnings.length,entitlements:entitlements.length,projects:adoptions.length,browserIndependentRecovery:state.browserIndependentRecovery===true}));
}
async function verify(){
  assert.ok(state.browserIndependentRecovery,'OBSERVE_COMPLETED_WITH_BROWSER_CLOSED_FIRST');
  await browser(async(browser,f)=>{
    const {signIn,navigate,wait,discover,invoke,evaluate}=browser;
    await signIn('B');await navigate('/dashboard/marketplace/purchases');await wait("document.body.innerText.includes('Open adopted project')");await discover();
    for(let i=0;i<3;i++){const r=await invoke('recoverMarketplacePurchaseAction',{purchaseId:state.purchaseId});check('duplicate completion recovers same project '+i,r.ok&&r.data.projectId===state.projectId);}
    const copy=await one('projects','id',state.projectId);check('buyer owns independently copied reusable project',copy.owner_user_id===f.b.id&&copy.prompt===f.listing.template_snapshot.instructions+(state.customized?' My own subject is a paper bird.':'')&&copy.aspect_ratio===f.source.aspect_ratio);
    check('buyer gets exactly one intended paid project',(await rows('projects','owner_user_id',f.b.id)).filter(p=>!state.bProjectsBefore.includes(p.id)&&p.id!==state.freeProjectId).length===1);
    check('no private media copied',(await rows('project_assets','project_id',state.projectId)).length===0);
    await navigate('/projects/'+state.projectId);await wait("!!document.querySelector('textarea')");await discover();
    const assets=await rows('project_assets','project_id',state.sourceId);
    check('buyer cannot access creator private media',(await invoke('readMediaAction',{projectId:state.sourceId,assetId:assets[0].id})).code==='NOT_FOUND');
    const customized=await invoke('saveProjectAction',{id:state.projectId,mode:'update',title:'My paid adopted recipe',category:copy.category,prompt:f.listing.template_snapshot.instructions+' My own subject is a paper bird.',settings:{aspectRatio:copy.aspect_ratio,duration:copy.duration,visualStyle:copy.visual_style,tone:copy.tone}});
    check('buyer customizes independently',customized.ok===true);state.customized=true;save();
    await navigate('/projects/'+state.projectId);await wait("!!document.querySelector('textarea')");check('refresh reopen retains adopted project',true);
    await navigate('/projects/'+state.sourceId);await wait("document.body.innerText.includes('Project unavailable')");check('buyer cannot open original project',true);
    await navigate('/dashboard/marketplace/earnings');await wait("document.body.innerText.includes('No Marketplace sales yet.')");check('buyer cannot see creator earnings',true);
    await signIn('A');await navigate('/dashboard/marketplace/earnings');await wait("document.body.innerText.includes('Pending earnings')&&document.body.innerText.includes('$2.00')");await discover();
    const result=await invoke('creatorEarningsAction',1);check('creator pending earnings dashboard verified',result.ok&&result.data.earnings.pending>=200&&result.data.earnings.available===0&&result.data.earnings.sales.some(s=>s.listingId===state.listingId&&s.gross===200&&s.fee===0&&s.net===200));
    check('creator cannot recover buyer purchase',(await invoke('recoverMarketplacePurchaseAction',{purchaseId:state.purchaseId})).ok===false);
    for(const width of [1440,390,320])for(const dark of [false,true]){await browser.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);check('earnings fits '+width+(dark?' dark':' light'),await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));}
    await navigate('/dashboard/marketplace/'+state.listingId);await wait("!!document.querySelector('form')");await discover();
    check('creator can publish free again',(await invoke('updateMarketplaceAction',{...state.originalListing,status:'published',adoptionType:'free',priceMinor:0})).ok===true);
    await signIn('B');await navigate('/marketplace/'+state.listingId);await wait("document.body.innerText.includes('Adopt template')");await discover();
    state.freeRequestId??=randomUUID();save();
    const free=await invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:state.freeRequestId});check('free adoption still creates a project without PayPal',free.ok&&free.projectId!==state.projectId);state.freeProjectId=free.projectId;save();
    check('free regression adds no purchase or earning',(await rows('marketplace_purchases','listing_id',state.listingId)).length===1&&(await rows('creator_earnings_ledger','marketplace_purchase_id',state.purchaseId)).length===1);
    await signIn('A');await navigate('/dashboard/marketplace/'+state.listingId);await wait("!!document.querySelector('form')");await discover();
    check('creator restores free unpublished fixture',(await invoke('updateMarketplaceAction',state.originalListing)).ok===true);
    check('real payment browser has no exceptions',browser.errors.length===0);
  });
  await observe(true);
}
async function accounts(){
  await browser(async(browser)=>{
    const {signIn,navigate,wait,discover,invoke,evaluate,call}=browser;
    for(const [identity,route,ready,label] of [
      ['B','/dashboard/marketplace/purchases',"document.body.innerText.includes('Continue saved Sandbox checkout')||document.body.innerText.includes('Open adopted project')",'buyer purchases'],
      ['A','/dashboard/marketplace/earnings',"document.body.innerText.includes('Pending earnings')",'creator earnings'],
    ]){
      await signIn(identity);await navigate(route);await wait(ready);await discover();
      if(identity==='A')check('creator cannot recover buyer unapproved purchase',(await invoke('recoverMarketplacePurchaseAction',{purchaseId:state.purchaseId})).ok===false);
      if(identity==='B')check('browser cannot choose another earnings owner',(await invoke('creatorEarningsAction',{creatorUserId:state.aId})).ok===false);
      for(const width of [1440,390,320])for(const dark of [false,true]){
        await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);await evaluate('new Promise(resolve=>setTimeout(resolve,300))');
        check(label+' fits '+width+(dark?' dark':' light'),await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
        if((width===1440&&!dark)||(width===390&&dark)){const shot=await call('Page.captureScreenshot',{format:'png'});const filename=path.join(os.tmpdir(),`sceenyk-marketplace-${label.replaceAll(' ','-')}-${width}-${dark?'dark':'light'}.png`);fs.writeFileSync(filename,Buffer.from(shot.data,'base64'));state.screenshots.push(filename);save();}
      }
      const html=await evaluate("document.querySelector('main')?.outerHTML??document.body.outerHTML");
      check(label+' omits private capabilities and payment credentials',!/X-Amz-|r2\.cloudflarestorage|paypal_capture_id|PAYPAL_CLIENT_SECRET|buyer_user_id/.test(html));
    }
    check('financial account browser has no exceptions',browser.errors.length===0);
  });
  check('financial account screens preserve accounting and source',await protectedSnapshot()===state.before);
}
async function replay(proof=false){
  assert.ok(state.captureId,'VERIFIED_SANDBOX_CAPTURE_FIRST');
  if(!proof){const events=(await sandboxRequest('/v1/notifications/webhooks-events?'+new URLSearchParams({transaction_id:state.captureId,page_size:'20'}))).data;
    const event=events.events.find(e=>e.event_type==='PAYMENT.CAPTURE.COMPLETED'&&e.resource.id===state.captureId);assert.ok(event,'REAL_CAPTURE_EVENT');
    const r=await sandboxRequest('/v1/notifications/webhooks-events/'+encodeURIComponent(event.id)+'/resend','POST',{webhook_ids:[config.getPayPalConfig().webhookId]});check('PayPal accepts authentic Marketplace webhook replay',r.status===202);state.replayedEventId=event.id;save();
  }else{
    assert.ok(state.replayedEventId,'REQUEST_REPLAY_FIRST');await observe(true);
    const detail=(await sandboxRequest('/v1/notifications/webhooks-events/'+encodeURIComponent(state.replayedEventId))).data;
    state.replayDelivery={status:detail.status??null,transmissions:(detail.transmissions??[]).map(t=>({status:t.status??null,httpStatus:t.http_status??null,timestamp:t.timestamp??null}))};save();
    check('requested authentic replay retains one earning entitlement and project',true);
    console.log(JSON.stringify({eventId:state.replayedEventId,deliveryEvidence:state.replayDelivery}));
  }
}
async function security(){
  const names=['PAYPAL_CLIENT_SECRET','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','CLERK_SECRET_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY','WORKER_SHARED_SECRET','GEMINI_API_KEY','FAL_KEY','ELEVENLABS_API_KEY'];
  const secrets=names.map(name=>process.env[name]).filter(Boolean),scripts=new Set();
  for(const route of ['/marketplace','/marketplace/'+state.listingId]){
    const r=await fetch(origin+route,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const body=await r.text();
    check('deployed public HTML keeps server credentials private '+route.split('/').length,!secrets.some(secret=>body.includes(secret))&&!/X-Amz-Signature|r2\.cloudflarestorage\.com/.test(body));
    for(const m of body.matchAll(/<script[^>]+src="([^"]+)"/g)){const u=new URL(m[1].replaceAll('&amp;','&'),origin);if(u.origin===origin&&u.pathname.startsWith('/_next/'))scripts.add(u.href);}
  }
  for(const url of scripts){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const body=await r.text();assert.ok(!secrets.some(secret=>body.includes(secret)),'DEPLOYED_CLIENT_SECRET');assert.ok(!/PAYPAL_CLIENT_SECRET|marketplace_fulfil_purchase|marketplace_redeem_purchase|marketplace_creator_earnings|api-m\.sandbox\.paypal\.com/.test(body),'DEPLOYED_SERVER_BOUNDARY_LEAK');}
  check('deployed public payment bundles keep financial services server-only',scripts.size>0);
  for(const type of ['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED']){const r=await fetch(origin+'/api/payments/paypal/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'UNSIGNED_ACCEPTANCE',event_type:type,resource:{id:'ORDER000000000000',supplementary_data:{related_ids:{order_id:'ORDER000000000000'}}}}),signal:AbortSignal.timeout(20000)});check('deployed unsigned '+type+' cannot grant adoption',r.status===400);}
  state.deployedScan={clientFiles:scripts.size,configuredSecrets:secrets.length,leaks:0};save();
}
async function creditRegression(){
  const completed=(await rows('credit_purchases','owner_user_id',state.aId)).filter(p=>p.status==='completed').sort((a,b)=>b.created_at.localeCompare(a.created_at));
  assert.ok(completed.length,'EXISTING_REAL_CREDIT_PURCHASE');
  const p=completed[0],order=await paypal.readPayPalOrder(p.paypal_order_id),capture=paypal.verifiedCapture(p,order);
  const ledger=await rows('credit_ledger','purchase_id',p.id);
  check('existing real PayPal credit purchase still has verified capture and one credit grant',capture.id===p.paypal_capture_id&&ledger.length===1&&ledger[0].amount===p.credits);
  check('Marketplace sale preserves existing credit purchase accounting',await protectedSnapshot()===state.before);
}
async function stats(){
  let page=1,listing;
  for(;page<=10;page++){
    const r=await db.rpc('marketplace_owned',{p_owner_user_id:state.aId,p_page:page});assert.ok(!r.error);
    listing=r.data.items.find(l=>l.id===state.listingId);if(listing)break;
  }
  assert.ok(listing,'OWNED_LISTING_STATS');
  check('owned listing counts paid sale separately',listing.paidSalesCount===1&&listing.creatorEarningsMinor===200&&listing.adoptionCount>=2);
  await browser(async({signIn,navigate,wait,discover,invoke,evaluate})=>{
    await signIn('A');await navigate('/dashboard/marketplace?page='+page);await wait(`!!document.querySelector('a[href="/dashboard/marketplace/${state.listingId}"]')`);
    const text=await evaluate(`document.querySelector('a[href="/dashboard/marketplace/${state.listingId}"]').closest('article').innerText`);
    check('My Marketplace Listings displays real paid sales and creator net',text.includes('Paid sales: 1')&&text.includes('Creator earnings: $2.00'));
    await navigate('/dashboard/marketplace/'+state.listingId);await wait("!!document.querySelector('form')");await discover();
    await signIn('B');await navigate('/marketplace/'+state.listingId);
    for(const status of ['published','unpublished','archived']){
      const r=await invoke('updateMarketplaceAction',{...state.originalListing,status,adoptionType:'paid',priceMinor:100});
      check('B cannot edit paid price or set creator status '+status,r.ok===false&&r.code==='NOT_FOUND');
    }
  });
  const final=await one('marketplace_listings','id',state.listingId);
  check('denied edits leave creator listing free and unpublished',final.adoption_type==='free'&&final.status==='unpublished'&&final.price_minor===0);
}
async function reopen(){
  await browser(async({signIn,navigate,wait,evaluate,call},f)=>{
    const expected=f.listing.template_snapshot.instructions+' My own subject is a paper bird.';
    await signIn('B');await navigate('/projects/'+state.projectId);await wait("!!document.querySelector('[aria-label=\"Adopted template\"]')&&!!document.querySelector('textarea')");
    check('fresh browser restores independently customized paid project',await evaluate(`document.querySelector('textarea').value===${JSON.stringify(expected)}&&document.querySelector('input[name=title]').value==='My paid adopted recipe'`));
    await call('Page.reload');await wait("!!document.querySelector('textarea')&&!!document.querySelector('[aria-label=\"Adopted template\"]')");
    check('full refresh retains paid customization and provenance',await evaluate(`document.querySelector('textarea').value===${JSON.stringify(expected)}`));
    const p=await one('projects','id',state.projectId);check('persisted customized project retains buyer ownership',p.owner_user_id===state.bId&&p.prompt===expected);
  });
}
if(mode==='preflight')await preflight();
else if(mode==='ui')await ui();
else if(mode==='accounts')await accounts();
else if(mode==='begin')await ui(true);
else if(mode==='observe')await observe();
else if(mode==='webhook-proof')await observe(true);
else if(mode==='verify')await verify();
else if(mode==='webhook-replay')await replay();
else if(mode==='webhook-replay-proof')await replay(true);
else if(mode==='security')await security();
else if(mode==='credit-regression')await creditRegression();
else if(mode==='stats')await stats();
else if(mode==='reopen')await reopen();
else if(mode==='confirm-webhook-delivery'){
  assert.ok(process.argv.includes('--user-confirmed-delivered-success')&&state.replayedEventId,'EXPLICIT_USER_DASHBOARD_CONFIRMATION_REQUIRED');
  state.userConfirmedReplay={eventId:state.replayedEventId,status:'delivered/success',confirmedAt:new Date().toISOString(),source:'user PayPal Sandbox dashboard report'};
  check('user confirms authentic duplicate webhook delivered successfully',true);
}
else throw new Error('UNKNOWN_ACCEPTANCE_MODE');
