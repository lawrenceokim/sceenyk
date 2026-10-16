// Explicit real Clerk/browser + hosted Supabase/private R2 acceptance.
// Only reserved development identities; no provider generation, capture or payout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import nextEnv from '@next/env';
import sharp from 'sharp';
import {createClerkClient} from '@clerk/backend';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {deployedBrowser} from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const origin=process.argv[2]??'http://localhost:3017';
const finalChecksOnly=process.argv.includes('--final-checks');
const resumeBrowserTail=process.argv.includes('--resume-browser-tail');
assert.ok(!(finalChecksOnly&&resumeBrowserTail),'ONE_RESUME_STAGE');
assert.ok(['http://localhost:3017','https://sceenyk.vercel.app'].includes(origin),'EXPLICIT_ACCEPTANCE_ORIGIN');
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const table=await db.from('marketplace_creator_profiles').select('creator_slug').limit(0);assert.ok(!table.error,'APPLY_MIGRATION_027_FIRST');
assert.ok(!(await db.rpc('creator_profile_listing_identities',{p_ids:[]})).error,'FINAL_MIGRATION_027_PROJECTIONS_REQUIRED');
const evidenceFile=path.join(os.tmpdir(),origin.includes('localhost')?'sceenyk-creator-profile-acceptance.json':'sceenyk-creator-profile-deployed-acceptance.json');
let state;try{state=JSON.parse(fs.readFileSync(evidenceFile,'utf8'));}catch{state={projectId:randomUUID(),listingId:randomUUID(),draftProjectId:randomUUID(),draftId:randomUUID(),requestId:randomUUID()};}
if(finalChecksOnly)assert.ok(state.completedAt||state.browserCompletedAt,'FULL_BROWSER_ACCEPTANCE_REQUIRED_FIRST');
else if(resumeBrowserTail)assert.ok(state.checks.includes('paid adoption preserves B ownership and excludes private creator media')&&state.protectedBefore,'CORE_BROWSER_ACCEPTANCE_REQUIRED_FIRST');
else{state.checks=[];state.screenshots=[];state.browserExceptions=[];delete state.completedAt;delete state.browserCompletedAt;}state.cacheFailures=[];state.origin=origin;
if(!finalChecksOnly&&!resumeBrowserTail)state.startedAt=new Date().toISOString();
const save=()=>fs.writeFileSync(evidenceFile,JSON.stringify(state,null,2));
const check=(name,value)=>{assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));};
// Complete independent privacy/avatar/accounting checks even when deployed
// cache headers fail. A recorded failure still prevents successful acceptance.
const cacheCheck=(name,value)=>{if(value)return check(name,true);state.cacheFailures.push(name);save();console.error(JSON.stringify({failed:name}));};
const one=async(table,key,id)=>{const r=await db.from(table).select('*').eq(key,id).single();assert.ok(!r.error&&r.data,'HOSTED_'+table);return r.data;};
const composition=await db.from('composition_plans').select('project_id').eq('job_id','aa88b9ac-9542-4138-93b6-e5861a96e1df').single();assert.ok(composition.data&&!composition.error);
const source=await one('projects','id',composition.data.project_id);
const a=await one('app_users','id',source.owner_user_id);
const users=await db.from('app_users').select('id,clerk_user_id,email').neq('id',a.id).order('id').limit(100);assert.ok(!users.error);
const b=users.data.find(u=>u.email?.includes('+clerk_test@'));assert.ok(b,'RESERVED_B');
for(const u of [a,b])assert.ok(u.email?.includes('+clerk_test@'),'RESERVED_TEST_IDENTITIES_ONLY');
const privateAssets=await db.from('project_assets').select('id,storage_key').eq('project_id',source.id).eq('upload_status','uploaded');assert.ok(!privateAssets.error&&privateAssets.data.length);
const secretNames=['PAYPAL_CLIENT_SECRET','ELEVENLABS_API_KEY','WORKER_SHARED_SECRET','MEDIA_PREPARATION_WORKER_TOKEN','FAL_KEY','RUNWAYML_API_SECRET','GEMINI_API_KEY','CLERK_SECRET_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY'];
secretNames.push('INNGEST_SIGNING_KEY_FALLBACK');
const secrets=secretNames.map(k=>process.env[k]).filter(Boolean),bundleUrls=new Set();
const serverMarkers=/marketplace_creator_profiles|creator_profile_avatar_save|creator_profile_listing_identities|creator_storefront|putR2CreatorAvatar|makePublicAvatar|avatar_key|payout_support_events|payout_support_check|payout_support_actor|payout_support_queue|payout_support_detail|inspectExistingPayout|commitPayoutCheck|failureCode|REFUND_BELOW_MINIMUM|internal_user_roles|requireAdminOrSupport|SupportAuthorizationError|creator_payout_claim|creator_payout_observe|creator_payout_request|creator_money_lots|creator_withdrawal_allocations|SCEENYK_PAYPAL_PAYOUTS_ENABLED|paypalAccessToken|sender_batch_header|marketplace_fulfil_purchase|marketplace_redeem_purchase|marketplace_creator_earnings|marketplace_prepare_purchase|marketplace_begin_order|marketplace_apply_financial_observation|marketplace_purchase_financial_status|generativelanguage\.googleapis\.com|begin_generation_analysis|finish_generation_analysis|issue_generation_quote|confirm_generation_quote|reserve_generation_dispatch|claim_generation_job|admit_generation|complete_generation_with_result|trustedGenerationCost|caption_source|persist_caption_track|set_caption_preference|set_caption_style|caption_dispatch_candidates|fulfil_paypal_purchase|api-m\.sandbox\.paypal\.com|ensure_render_job|claim_render_job|complete_render_job|finalize_render_generation|@remotion\/renderer|composition_asset_ref|claim_composition_generation|record_composition_asset_check|finish_composition_generation|api\.elevenlabs\.io|begin_narration_submission|complete_narration_segment|reserve_source_segment|complete_source_segment|queue\.fal\.run|api\.dev\.runwayml\.com|begin_visual_submission|record_visual_task/;
const canonical=x=>Array.isArray(x)?x.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
async function protectedSnapshot(){
  const tables=['generation_accounts','credit_ledger','credit_purchases','marketplace_purchases','marketplace_entitlements','creator_earnings_ledger','creator_withdrawals','creator_money_lots','generation_jobs','scene_executions','narration_segments','caption_tracks','caption_preferences','render_jobs','internal_user_roles'];
  const data=await Promise.all(tables.map(async t=>{const r=await db.from(t).select('*');assert.ok(!r.error,'SNAPSHOT_'+t);return[t,r.data];}));
  data.push(['source',await one('projects','id',source.id)]);
  return createHash('sha256').update(JSON.stringify(canonical(Object.fromEntries(data)))).digest('hex');
}
const before=finalChecksOnly||resumeBrowserTail?state.protectedBefore:await protectedSnapshot();assert.equal(typeof before,'string','FULL_ACCEPTANCE_SNAPSHOT_REQUIRED');
if(!finalChecksOnly&&!resumeBrowserTail){state.protectedBefore=before;save();}
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,publishableKey:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});
const sessions=new Set();
const avatarFile=path.join(os.tmpdir(),'sceenyk-creator-avatar-fixture.png');
await sharp({create:{width:900,height:700,channels:3,background:'#7351d9'}}).png().withMetadata().toFile(avatarFile);
try {
 if(!finalChecksOnly)await deployedBrowser(origin,{A:a.clerk_user_id,B:b.clerk_user_id},async browser=>{
  const {evaluate,call,invoke,signIn,markDiagnosticPhase}=browser;
  let profileVisits=0,activeUser='anonymous';
  const wait=async expression=>{try{await browser.wait(expression);}catch(error){state.conditionFailure=await evaluate(`({user:window.Clerk?.user?.id===${JSON.stringify(a.clerk_user_id)}?'A':window.Clerk?.user?.id===${JSON.stringify(b.clerk_user_id)}?'B':'anonymous',unavailable:document.body.innerText.includes('unavailable'),hasTitleField:!!document.querySelector('input[name=title]'),hasProfileField:!!document.querySelector('input[name=displayName]')})`);state.browserExceptions=browser.exceptions;save();console.error(JSON.stringify({conditionFailure:state.conditionFailure,exceptions:browser.exceptions}));throw error;}};
  const discover=async()=>{
    const urls=await evaluate("[...Array.from(document.scripts,s=>s.src),...performance.getEntriesByType('resource').map(r=>r.name)].filter(u=>u.startsWith(location.origin+'/_next/')&&new URL(u).pathname.endsWith('.js'))");
    for(const url of urls)bundleUrls.add(url);
    await browser.discover();
  };
  const navigate=async route=>{const target=new URL(route,origin);if(target.pathname!=='/dashboard/settings/creator-profile')markDiagnosticPhase('other surface');await call('Page.navigate',{url:target.href});await wait(`document.readyState!=='loading'&&location.pathname===${JSON.stringify(target.pathname)}&&location.search===${JSON.stringify(target.search)}`);};
  const login=async who=>{markDiagnosticPhase('sign in '+who);await signIn(who);activeUser=who;sessions.add(await evaluate('window.Clerk.session.id'));};
  const fill=async(name,value)=>{assert.ok(await evaluate(`(()=>{const e=document.querySelector('[name="${name}"]');if(!e)return false;Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`),'FIELD_'+name);};
  const click=async text=>{assert.ok(await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true;})()`),'BUTTON_'+text);};
  const toggleTheme=()=>evaluate(`localStorage.setItem('sceenyk-theme',document.documentElement.classList.contains('dark')?'light':'dark');window.dispatchEvent(new Event('sceenyk-theme-change'))`);
  const ownerProfile=async()=>{markDiagnosticPhase('profile '+activeUser+' visit '+(++profileVisits));await navigate('/dashboard/settings/creator-profile');await wait('!!document.querySelector("input[name=displayName]")');await discover();};
  const publicPrivacy=async slug=>{
    await navigate('/marketplace/creators/'+slug);await wait('!!document.querySelector("#creator-items")');
    await wait(`!!document.querySelector('img[width="96"][src^="/api/marketplace/creators/"]')?.naturalWidth`);
    check('public storefront avatar renders in the browser',true);
    const html=await evaluate('(async()=>await (await fetch(location.href,{cache:"no-store"})).text())()');
    check('public HTML excludes creator private fields',![a.id,a.clerk_user_id,a.email,source.id,state.projectId,state.draftProjectId,state.archiveProjectId,'creatorEarningsMinor','payout_destination','failureCode',...privateAssets.data.flatMap(x=>[x.id,x.storage_key])].some(v=>v&&html.includes(v))&&!/X-Amz-|r2\.cloudflarestorage\.com|avatar_key/.test(html));
    check('public HTML contains no configured secrets',!secrets.some(s=>html.includes(s)||html.includes(encodeURIComponent(s))));
  };
  const project={id:state.projectId,mode:state.projectSaved?'update':'create',title:'Creator storefront acceptance',category:'cinematic',prompt:'PRIVATE_STOREFRONT_SOURCE',settings:{aspectRatio:'16:9',duration:'10',visualStyle:'Original',tone:'Storytelling'}};
  const listing={id:state.listingId,sourceProjectId:state.projectId,title:'Public Storefront Recipe',description:'A public reusable brief for your own story.',category:'cinematic',tags:['storefront'],instructions:'Introduce your own subject, then reveal a new perspective.',publish:true,rightsConfirmed:true,adoptionType:'free',priceMinor:0};
  if(!resumeBrowserTail){
  await login('A');await ownerProfile();
  await fill('displayName','Storefront Acceptance Creator');await fill('bio','Public creative recipes for your own ideas.');
  await click('Save public profile');await wait('document.body.innerText.includes("Public profile saved.")');
  const owned=await db.rpc('creator_profile_owned',{p_owner:a.id});assert.ok(!owned.error&&owned.data);state.aSlug=owned.data.slug;save();
  check('A configures persisted public profile',owned.data.displayName==='Storefront Acceptance Creator'&&owned.data.bio==='Public creative recipes for your own ideas.');
  const stableSlug=state.aSlug;
  await fill('displayName','Storefront Creator Renamed');await fill('bio','Updated public bio, saved independently of account settings.');await click('Save public profile');await wait('document.body.innerText.includes("Public profile saved.")');
  await ownerProfile();check('display name bio and slug survive reload',await evaluate(`document.querySelector('[name=displayName]').value==='Storefront Creator Renamed'&&document.querySelector('[name=bio]').value.startsWith('Updated public bio')&&document.querySelector('[name=slug]').value===${JSON.stringify(stableSlug)}`));
  await evaluate(`(()=>{const original=window.fetch;window.__avatarUploadStatus=null;window.fetch=async(...args)=>{const r=await original(...args);if(String(args[0]).startsWith('/api/marketplace/creator-avatar')){window.__avatarUploadStatus=r.status;window.fetch=original;}return r;};})()`);
  const root=await call('DOM.getDocument'),node=await call('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input[name=avatar]'});await call('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[avatarFile]});
  await click('Save public avatar');
  try{await wait('document.body.innerText.includes("Public avatar saved.")');}catch(error){console.error(JSON.stringify({avatarDiagnostic:await evaluate(`({status:window.__avatarUploadStatus,signedIn:!!window.Clerk?.session,pending:!!document.querySelector('[aria-busy="true"]'),safeError:document.body.innerText.includes('couldn’t be saved')})`),exceptions:browser.exceptions}));throw error;}
  await ownerProfile();check('avatar survives reload',await evaluate("Array.from(document.images).some(img=>img.getAttribute('src')?.startsWith('/api/marketplace/creators/'))"));
  for(const width of [1440,390])for(const dark of [false,true]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
    if(await evaluate('document.documentElement.classList.contains("dark")')===dark){await toggleTheme();await wait(`document.documentElement.classList.contains('dark')!==${dark}`);}
    await toggleTheme();await wait(`document.documentElement.classList.contains('dark')===${dark}`);
    await ownerProfile();
    check('private editor fits and preserves theme '+width+' '+(dark?'dark':'light'),await evaluate(`document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.classList.contains('dark')===${dark}&&localStorage.getItem('sceenyk-theme')===${JSON.stringify(dark?'dark':'light')}`));
    if((width===1440&&!dark)||(width===390&&dark)){const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});const file=path.join(os.tmpdir(),'sceenyk-creator-editor-'+width+'-'+dark+'.png');fs.writeFileSync(file,Buffer.from(shot.data,'base64'));state.screenshots.push(file);save();}
  }
  await call('Emulation.clearDeviceMetricsOverride');
  const avatarResponse=await fetch(origin+'/api/marketplace/creators/'+state.aSlug+'/avatar');check('public derivative loads without credentials',avatarResponse.status===200&&avatarResponse.headers.get('content-type')==='image/webp'&&avatarResponse.headers.get('cache-control')==='no-store'&&avatarResponse.headers.get('x-content-type-options')==='nosniff'&&!avatarResponse.headers.get('location'));
  const avatarMeta=await sharp(Buffer.from(await avatarResponse.arrayBuffer())).metadata();check('real stored avatar resized without metadata',avatarMeta.width===512&&avatarMeta.height===512&&!avatarMeta.exif);
  const originalProfile=await db.from('marketplace_creator_profiles').select('avatar_key').eq('owner_user_id',a.id).single();assert.ok(originalProfile.data&&!originalProfile.error);
  await navigate('/projects/'+source.id);await wait('!!document.querySelector("input[name=title]")');await discover();
  const ownedMedia=await invoke('readMediaAction',{projectId:source.id,assetId:privateAssets.data[0].id});check('owned private media still available',ownedMedia.ok&&!!ownedMedia.value.url);
  const generation=await invoke('latestGenerationAction',source.id);const latest=await db.from('generation_jobs').select('id,status').eq('project_id',source.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);assert.ok(!latest.error);
  check('owned generation recovery unchanged',generation.ok&&generation.value?.id===latest.data[0]?.id&&generation.value?.status===latest.data[0]?.status);
  const captionQuery=new URLSearchParams({projectId:source.id,jobId:'aa88b9ac-9542-4138-93b6-e5861a96e1df'}).toString();
  check('owned caption track and style unchanged',await evaluate(`(async()=>{const r=await fetch('/api/captions?'+${JSON.stringify(captionQuery)});const body=await r.json();return r.status===200&&body.track?.status==='ready'&&body.style?.schema_version===1;})()`));
  await navigate('/dashboard/settings/credits');await wait('document.body.innerText.includes("Buy credits")');await discover();
  const wallet=await invoke('creditWalletAction'),checkout=await invoke('creditCheckoutAction'),account=await one('generation_accounts','owner_user_id',a.id);
  check('AI credit wallet retains authoritative balances',wallet.ok&&wallet.data.available===account.credit_available&&wallet.data.reserved===account.credit_reserved);
  check('PayPal Sandbox credit options unchanged',checkout.ok&&checkout.data.configured&&checkout.data.packs.length===3);
  check('verified credit purchase history remains available',wallet.ok&&wallet.data.purchases.some(p=>p.status==='completed'));
  await navigate('/dashboard/settings/earnings');await wait('document.body.innerText.includes("Lifetime gross sales")');await discover();
  const earnings=await invoke('creatorEarningsAction',1),withdrawals=await invoke('withdrawalAccountAction',1);
  check('creator earnings and withdrawal history remain owner-only readable',earnings.ok&&earnings.data.clerkUserId===a.clerk_user_id&&withdrawals.ok&&withdrawals.data.clerkUserId===a.clerk_user_id);
  const unsignedObject=new URL(ownedMedia.value.url);unsignedObject.search='';const raw=await fetch(unsignedObject,{signal:AbortSignal.timeout(15000)});await raw.body?.cancel();check('private R2 rejects unsigned access',[400,401,403].includes(raw.status));
  await navigate('/create');await wait('!!document.querySelector("input[name=title]")');await discover();
  const saved=await invoke('saveProjectAction',project);check('owned isolated source saved',saved.ok);state.projectSaved=true;save();
  const draftProject=await invoke('saveProjectAction',{...project,id:state.draftProjectId,mode:state.draftProjectSaved?'update':'create',title:'Private draft source'});check('owned draft source saved',draftProject.ok);state.draftProjectSaved=true;save();
  await navigate('/dashboard/marketplace/new?project='+state.projectId);await wait('!!document.querySelector("input[name=title]")');await discover();
  let published=await invoke('createMarketplaceAction',listing);check('A publishes owned template',published.ok);state.listingId=published.listingId;save();
  if(published.existing){published=await invoke('updateMarketplaceAction',{id:state.listingId,title:listing.title,description:listing.description,category:listing.category,tags:listing.tags,rightsConfirmed:true,status:'published',adoptionType:'free',priceMinor:0});check('existing acceptance template republished',published.ok);}
  const draft=await invoke('createMarketplaceAction',{...listing,id:state.draftId,sourceProjectId:state.draftProjectId,title:'PRIVATE_STOREFRONT_DRAFT',publish:false});check('A retains separate private draft',draft.ok);
  await navigate('/marketplace');await wait(`!!document.querySelector('a[href="/marketplace/${state.listingId}"]')?.closest('article')?.querySelector('a[href="/marketplace/creators/${state.aSlug}"]')`);check('Marketplace card links to storefront',await evaluate(`!!document.querySelector('a[href="/marketplace/${state.listingId}"]')?.closest('article')?.querySelector('a[href="/marketplace/creators/${state.aSlug}"]')`));
  await navigate('/marketplace/'+state.listingId);await wait(`!!document.querySelector('a[href="/marketplace/creators/${state.aSlug}"]')`);check('detail links to storefront',await evaluate(`!!document.querySelector('a[href="/marketplace/creators/${state.aSlug}"]')`));
  await login('B');await publicPrivacy(state.aSlug);check('B sees published listing but no draft',await evaluate('document.body.innerText.includes("Public Storefront Recipe")&&!document.body.innerText.includes("PRIVATE_STOREFRONT_DRAFT")'));
  for(const width of [1440,768,390,320])for(const dark of [false,true]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
    check('storefront fits '+width+' '+(dark?'dark':'light'),await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    if((width===1440&&!dark)||(width===390&&dark)){const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});const file=path.join(os.tmpdir(),'sceenyk-creator-'+width+'-'+dark+'.png');fs.writeFileSync(file,Buffer.from(shot.data,'base64'));state.screenshots.push(file);save();}
  }
  await call('Emulation.clearDeviceMetricsOverride');
  await ownerProfile();
  const forged=await invoke('saveCreatorProfileAction',{displayName:'Forged Creator',bio:'',slug:state.aSlug,ownerUserId:a.id});check('B cannot supply A ownership',!forged.ok&&forged.code==='INVALID_INPUT');
  const collision=await invoke('saveCreatorProfileAction',{displayName:'Same Public Name',bio:'B public bio',slug:state.aSlug});check('real slug collision safely handled',collision.ok?collision.profile.slug!==state.aSlug:['SLUG_FIXED','SLUG_UNAVAILABLE'].includes(collision.code));
  const unchanged=await db.rpc('creator_profile_owned',{p_owner:a.id});check('B requests leave A profile unchanged',unchanged.data.displayName==='Storefront Creator Renamed'&&unchanged.data.slug===state.aSlug);
  const avatarBody=fs.readFileSync(avatarFile).toString('base64');
  const forgedAvatar=await evaluate(`(async()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(avatarBody)}),c=>c.charCodeAt(0));const r=await fetch('/api/marketplace/creator-avatar?creatorSlug='+${JSON.stringify(state.aSlug)}+'&ownerUserId='+${JSON.stringify(a.id)},{method:'POST',headers:{'Content-Type':'image/png'},body:bytes});return r.json();})()`);
  const stillOwned=await db.from('marketplace_creator_profiles').select('avatar_key').eq('owner_user_id',a.id).single();check('B avatar owner spoof cannot change A',!stillOwned.error&&stillOwned.data.avatar_key===originalProfile.data.avatar_key&&(!forgedAvatar.ok||forgedAvatar.profile.slug!==state.aSlug));
  await navigate('/projects/'+source.id);await wait('document.body.innerText.includes("Project unavailable")');check('B cannot open A private source',await evaluate('!document.querySelector("input[name=title]")'));
  await navigate('/projects/'+state.projectId);await wait('document.body.innerText.includes("Project unavailable")');check('storefront source project stays private',await evaluate('!document.body.innerText.includes("PRIVATE_STOREFRONT_SOURCE")'));
  await navigate('/create');await wait('!!document.querySelector("input[name=title]")');await discover();
  const deniedMedia=await invoke('readMediaAction',{projectId:source.id,assetId:privateAssets.data[0].id});check('B cannot obtain A private media capability',!deniedMedia.ok);
  await navigate('/dashboard/marketplace/new');await wait('document.body.innerText.includes("Publish")');await discover();
  const foreign=await invoke('createMarketplaceAction',{...listing,id:randomUUID(),sourceProjectId:source.id});check('B cannot publish A source',!foreign.ok);
  await navigate('/marketplace/'+state.listingId);await wait('document.body.innerText.includes("Public Storefront Recipe")');await discover();
  const adopted=await invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:state.requestId});check('existing free adoption works',adopted.ok&&!!adopted.projectId);
  const duplicate=await invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:state.requestId});check('adoption replay returns same owned project',duplicate.ok&&duplicate.projectId===adopted.projectId);
  const adoptedProject=await one('projects','id',adopted.projectId);check('adopted project belongs to B',adoptedProject.owner_user_id===b.id);
  const transferred=await db.from('project_assets').select('id').eq('project_id',adopted.projectId);check('no private media copied',!transferred.error&&transferred.data.length===0);
  await navigate('/dashboard/marketplace/purchases');await wait('document.body.innerText.includes("My Marketplace purchases")');await discover();
  const purchases=await invoke('marketplacePurchasesAction',1);check('B retains private Marketplace purchase history',purchases.ok&&purchases.data.clerkUserId===b.clerk_user_id);
  const completed=purchases.data.items.find(p=>p.status==='completed'&&p.projectId);assert.ok(completed,'EXISTING_COMPLETED_PAID_ADOPTION_REQUIRED');
  const recovered=await invoke('recoverMarketplacePurchaseAction',{purchaseId:completed.id}),replayed=await invoke('recoverMarketplacePurchaseAction',{purchaseId:completed.id});
  check('completed paid adoption recovery is idempotent without charging again',recovered.ok&&replayed.ok&&recovered.data.projectId===completed.projectId&&replayed.data.projectId===completed.projectId);
  const paidProject=await one('projects','id',completed.projectId),paidAssets=await db.from('project_assets').select('id').eq('project_id',completed.projectId);
  check('paid adoption preserves B ownership and excludes private creator media',paidProject.owner_user_id===b.id&&!paidAssets.error&&paidAssets.data.length===0);
  state.coreBrowserCompletedAt=new Date().toISOString();save();
  }
  await login('A');await navigate('/dashboard/marketplace/'+state.listingId);await wait('!!document.querySelector("input[name=title]")');await discover();
  const unpublished=await invoke('updateMarketplaceAction',{id:state.listingId,title:listing.title,description:listing.description,category:listing.category,tags:listing.tags,rightsConfirmed:true,status:'unpublished',adoptionType:'free',priceMinor:0});check('unpublish remains supported',unpublished.ok);
  state.archiveProjectId??=randomUUID();state.archiveId??=randomUUID();save();
  await navigate('/create');await wait('!!document.querySelector("input[name=title]")');await discover();
  const archiveProject=await invoke('saveProjectAction',{...project,id:state.archiveProjectId,mode:state.archiveProjectSaved?'update':'create',title:'Private archived source'});check('owned archive fixture source saved',archiveProject.ok);state.archiveProjectSaved=true;save();
  await navigate('/dashboard/marketplace/new');await wait('document.body.innerText.includes("Publish")');await discover();
  const archiveDraft=await invoke('createMarketplaceAction',{...listing,id:state.archiveId,sourceProjectId:state.archiveProjectId,title:'PRIVATE_STOREFRONT_ARCHIVED',publish:false});assert.ok(archiveDraft.ok,'ARCHIVE_FIXTURE_ONLY');
  const archiveRow=await one('marketplace_listings','id',state.archiveId);
  const archived=archiveRow.status==='archived'?{ok:true}:await invoke('updateMarketplaceAction',{id:state.archiveId,title:'PRIVATE_STOREFRONT_ARCHIVED',description:listing.description,category:listing.category,tags:listing.tags,rightsConfirmed:true,status:'archived',adoptionType:'free',priceMinor:0});check('archive remains supported',archived.ok);
  await evaluate('window.Clerk.signOut()');await publicPrivacy(state.aSlug);check('signed-out storefront excludes unpublished listing',await evaluate('!document.body.innerText.includes("Public Storefront Recipe")&&!document.body.innerText.includes("PRIVATE_STOREFRONT_DRAFT")'));
  check('signed-out storefront excludes archived listing',await evaluate('!document.body.innerText.includes("PRIVATE_STOREFRONT_ARCHIVED")'));
  const empty=await db.rpc('creator_storefront',{p_slug:state.aSlug,p_page:1});check('published counts match datastore',!empty.error&&empty.data.total===empty.data.items.length&&empty.data.items.every(l=>l.status==='published'));
  await navigate('/marketplace/creators/unknown-creator-acceptance');await wait('document.body.innerText.includes("Creator not found")');check('unknown creator has safe not-found state',await evaluate('document.body.innerText.includes("Creator not found")'));
  const unsigned=await evaluate('(async()=>{const r=await fetch("/api/marketplace/creator-avatar",{method:"POST",headers:{"Content-Type":"image/png"},body:new Uint8Array([1,2,3])});return r.status;})()');check('anonymous avatar mutation denied',unsigned!==200);
  state.browserExceptions=browser.exceptions;save();if(browser.errors.length)console.error(JSON.stringify({browserExceptions:browser.exceptions}));
  if(!browser.errors.length)check('browser has no unexpected exceptions',true);
 });
 if(!finalChecksOnly){state.browserCompletedAt=new Date().toISOString();state.clientBundleUrls=[...bundleUrls];save();}
 const profile=(await db.rpc('creator_profile_owned',{p_owner:a.id})).data;assert.ok(profile);
 const session=await clerk.sessions.createSession({userId:a.clerk_user_id});sessions.add(session.id);
 let token=(await clerk.sessions.getToken(session.id,undefined,60)).jwt;
 if(!finalChecksOnly||state.clientBundleUrls?.length){
  // A resumed browser tail may not have loaded the earlier private financial
  // and generation chunks. Include their real server-rendered script URLs.
  const urls=new Set(state.clientBundleUrls);
  const routes=['/dashboard/settings/creator-profile','/dashboard/settings/credits','/dashboard/settings/earnings','/dashboard/marketplace/purchases','/projects/'+source.id];
  const published=await db.from('marketplace_listings').select('id').eq('status','published').limit(1);assert.ok(!published.error);
  if(published.data.length)routes.push('/marketplace/'+published.data[0].id);
  for(const route of routes){
   token=(await clerk.sessions.getToken(session.id,undefined,60)).jwt;
   const response=await fetch(origin+route,{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(60000)});assert.equal(response.status,200,'CLIENT_SURFACE_SSR');const html=await response.text();
   for(const match of html.matchAll(/\b(?:src|href)="([^"]+\.js(?:\?[^"]*)?)"/g)){const url=new URL(match[1].replaceAll('&amp;','&'),origin);if(url.origin===origin&&url.pathname.startsWith('/_next/'))urls.add(url.href);}
  }
  state.clientBundleUrls=[...urls];state.clientSSRSurfacesScanned=routes.length;save();
  for(const url of state.clientBundleUrls){
   assert.ok(url.startsWith(origin+'/_next/'),'SAME_ORIGIN_CLIENT_BUNDLE');const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,'DEPLOYED_CLIENT_BUNDLE_FETCH');const body=await response.text();
   // Clerk's shared browser SDK includes this environment-variable name in a
   // generic error message. The actual configured value is still forbidden.
   const configuredSecret=secrets.some(s=>body.includes(s)||body.includes(encodeURIComponent(s))),environmentNames=secretNames.filter(s=>s!=='CLERK_SECRET_KEY'&&body.includes(s)),serverMarker=body.match(serverMarkers)?.[0]??body.match(/marketplace_create|marketplace_update|marketplace_adopt|marketplace_owned_listing|marketplace_origin|marketplace_browse|marketplace_detail|marketplace_ensure_settlement|marketplace_begin_financial_check|marketplace_financial_candidates|SCEENYK_TEST_PRICING_JSON|WORKFLOW_NOT_CONFIGURED|GENERATION_UNAVAILABLE_OR_INVALID|MEDIA_WORKER_URL/)?.[0]??null;
   if(configuredSecret||environmentNames.length||serverMarker)console.error(JSON.stringify({clientScanFailure:{configuredSecret,environmentNames,serverMarker}}));
   assert.ok(!configuredSecret&&!environmentNames.length&&!serverMarker,'DEPLOYED_CLIENT_SECRET_OR_SERVER_MARKER');
  }
  state.clientBundlesScanned=state.clientBundleUrls.length;state.configuredSecretsChecked=secrets.length;save();check('served client bundles contain no secrets or server-only markers',state.clientBundlesScanned>0);
 }
 token=(await clerk.sessions.getToken(session.id,undefined,60)).jwt;
 for(const rsc of [false,true]){
  const headers={Authorization:'Bearer '+token,...(rsc?{RSC:'1'}:{})};
  let response=await fetch(origin+'/dashboard/settings/creator-profile',{headers,redirect:'manual',signal:AbortSignal.timeout(60000)});
  if(rsc&&[307,308].includes(response.status)){
    const target=new URL(response.headers.get('location'),origin);assert.equal(target.origin,origin);assert.equal(target.pathname,'/dashboard/settings/creator-profile');
    cacheCheck('private RSC normalization redirect is uncached',response.headers.get('cache-control')?.includes('no-store')&&response.headers.get('cdn-cache-control')==='no-store');
    await response.body?.cancel();response=await fetch(target,{headers,redirect:'manual',signal:AbortSignal.timeout(60000)});
  }
  await response.body?.cancel();cacheCheck('private profile '+(rsc?'RSC':'HTML')+' has browser and CDN no-store',response.status===200&&response.headers.get('cache-control')?.includes('private')&&response.headers.get('cache-control')?.includes('no-store')&&response.headers.get('cdn-cache-control')==='no-store');
 }
 const avatarBefore=await fetch(origin+profile.avatarUrl,{signal:AbortSignal.timeout(15000)});const oldBytes=Buffer.from(await avatarBefore.arrayBuffer()),oldHash=createHash('sha256').update(oldBytes).digest('hex');
 // Alternate the fixture so --final-checks can resume a failed cache check
 // after the previous run already saved its replacement image.
 const replacementColour=(await sharp(oldBytes).stats()).channels[1].mean>128?'#7351d9':'#19a67b';
 const replacement=await sharp({create:{width:700,height:900,channels:3,background:replacementColour}}).png().withMetadata().toBuffer();
 token=(await clerk.sessions.getToken(session.id,undefined,60)).jwt;
 const upload=await fetch(origin+'/api/marketplace/creator-avatar',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'image/png'},body:replacement,signal:AbortSignal.timeout(60000)});
 const update=await upload.json();check('existing public avatar can be replaced',upload.status===200&&update.ok&&update.profile.slug===state.aSlug);
 const avatarAfter=await fetch(origin+profile.avatarUrl,{signal:AbortSignal.timeout(15000)});const newBytes=Buffer.from(await avatarAfter.arrayBuffer()),newHash=createHash('sha256').update(newBytes).digest('hex');
 check('same public URL delivers persisted replacement without stale cache',avatarAfter.status===200&&avatarAfter.headers.get('cache-control')==='no-store'&&oldHash!==newHash);
 const metadata=await sharp(newBytes).metadata();check('replacement derivative remains bounded and stripped',metadata.width===512&&metadata.height===512&&!metadata.exif&&!metadata.icc);
 const bad=await fetch(origin+'/api/marketplace/creator-avatar',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'image/jpeg'},body:Buffer.from([0xff,0xd8,0xff]),signal:AbortSignal.timeout(15000)});const badBody=await bad.text();check('real invalid avatar save has safe error',bad.status===400&&!/stack|avatar_key|r2\.cloudflarestorage/.test(badBody));
 const denied=await fetch(origin+'/api/marketplace/creator-avatar',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://foreign.invalid','Content-Type':'image/png'},body:replacement,signal:AbortSignal.timeout(15000)});await denied.body?.cancel();check('real cross-origin avatar save denied',denied.status===403);
 const empty=await db.rpc('creator_storefront',{p_slug:state.aSlug,p_page:1});
 if(empty.data.total===0){const response=await fetch(origin+'/marketplace/creators/'+state.aSlug,{signal:AbortSignal.timeout(60000)});const html=await response.text();check('real empty storefront contains no private drafts',response.status===200&&html.includes('This creator has no published Marketplace items yet.')&&!html.includes('PRIVATE_STOREFRONT_DRAFT'));}
 const legacy=await fetch('https://sceenyk.vercel.app/marketplace',{signal:AbortSignal.timeout(60000)});const legacyHtml=await legacy.text();check('existing deployed Marketplace remains available after migration',legacy.status===200&&!legacyHtml.includes('Marketplace is temporarily unavailable'));
 state.protectedAfter=await protectedSnapshot();check('financial generation caption and role state unchanged',state.protectedAfter===before);
 state.checkedAt=new Date().toISOString();save();
 assert.equal(state.browserExceptions.length,0,'BROWSER_EXCEPTION_ACCEPTANCE_FAILED');
 assert.equal(state.cacheFailures.length,0,'PRIVATE_PROFILE_CACHE_ACCEPTANCE_FAILED');
 state.completedAt=new Date().toISOString();save();console.log(JSON.stringify({passed:state.checks.length,evidenceFile,screenshots:state.screenshots.length,deployed:origin.includes('vercel')}));
} finally {
 for(const id of sessions)try{if((await clerk.sessions.getSession(id)).status==='active')await clerk.sessions.revokeSession(id);}catch(error){if(error.status!==404)throw error;}
}
