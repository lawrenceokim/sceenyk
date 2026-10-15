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
assert.ok(['http://localhost:3017','https://sceenyk.vercel.app'].includes(origin),'EXPLICIT_ACCEPTANCE_ORIGIN');
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const table=await db.from('marketplace_creator_profiles').select('creator_slug').limit(0);assert.ok(!table.error,'APPLY_MIGRATION_027_FIRST');
assert.ok(!(await db.rpc('creator_profile_listing_identities',{p_ids:[]})).error,'FINAL_MIGRATION_027_PROJECTIONS_REQUIRED');
const evidenceFile=path.join(os.tmpdir(),origin.includes('localhost')?'sceenyk-creator-profile-acceptance.json':'sceenyk-creator-profile-deployed-acceptance.json');
let state;try{state=JSON.parse(fs.readFileSync(evidenceFile,'utf8'));}catch{state={projectId:randomUUID(),listingId:randomUUID(),draftProjectId:randomUUID(),draftId:randomUUID(),requestId:randomUUID()};}
if(finalChecksOnly)assert.ok(state.completedAt,'FULL_BROWSER_ACCEPTANCE_REQUIRED_FIRST');
else{state.checks=[];state.screenshots=[];}state.origin=origin;
const save=()=>fs.writeFileSync(evidenceFile,JSON.stringify(state,null,2));
const check=(name,value)=>{assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));};
const one=async(table,key,id)=>{const r=await db.from(table).select('*').eq(key,id).single();assert.ok(!r.error&&r.data,'HOSTED_'+table);return r.data;};
const composition=await db.from('composition_plans').select('project_id').eq('job_id','aa88b9ac-9542-4138-93b6-e5861a96e1df').single();assert.ok(composition.data&&!composition.error);
const source=await one('projects','id',composition.data.project_id);
const a=await one('app_users','id',source.owner_user_id);
const users=await db.from('app_users').select('id,clerk_user_id,email').neq('id',a.id).order('id').limit(100);assert.ok(!users.error);
const b=users.data.find(u=>u.email?.includes('+clerk_test@'));assert.ok(b,'RESERVED_B');
for(const u of [a,b])assert.ok(u.email?.includes('+clerk_test@'),'RESERVED_TEST_IDENTITIES_ONLY');
const privateAssets=await db.from('project_assets').select('id,storage_key').eq('project_id',source.id).eq('upload_status','uploaded');assert.ok(!privateAssets.error&&privateAssets.data.length);
const secretNames=['PAYPAL_CLIENT_SECRET','ELEVENLABS_API_KEY','WORKER_SHARED_SECRET','MEDIA_PREPARATION_WORKER_TOKEN','FAL_KEY','RUNWAYML_API_SECRET','GEMINI_API_KEY','CLERK_SECRET_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY'];
const secrets=secretNames.map(k=>process.env[k]).filter(Boolean);
const canonical=x=>Array.isArray(x)?x.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
async function protectedSnapshot(){
  const tables=['generation_accounts','credit_ledger','credit_purchases','marketplace_purchases','marketplace_entitlements','creator_earnings_ledger','creator_withdrawals','creator_money_lots','generation_jobs','scene_executions','narration_segments','caption_tracks','caption_preferences','render_jobs','internal_user_roles'];
  const data=await Promise.all(tables.map(async t=>{const r=await db.from(t).select('*');assert.ok(!r.error,'SNAPSHOT_'+t);return[t,r.data];}));
  data.push(['source',await one('projects','id',source.id)]);
  return createHash('sha256').update(JSON.stringify(canonical(Object.fromEntries(data)))).digest('hex');
}
const before=await protectedSnapshot();
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,publishableKey:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});
const sessions=new Set();
const avatarFile=path.join(os.tmpdir(),'sceenyk-creator-avatar-fixture.png');
await sharp({create:{width:900,height:700,channels:3,background:'#7351d9'}}).png().withMetadata().toFile(avatarFile);
try {
 if(!finalChecksOnly)await deployedBrowser(origin,{A:a.clerk_user_id,B:b.clerk_user_id},async browser=>{
  const {evaluate,call,wait,discover,invoke,signIn}=browser;
  const navigate=async route=>{const target=new URL(route,origin);await call('Page.navigate',{url:target.href});await wait(`document.readyState!=='loading'&&location.pathname===${JSON.stringify(target.pathname)}&&location.search===${JSON.stringify(target.search)}`);};
  const login=async who=>{await signIn(who);sessions.add(await evaluate('window.Clerk.session.id'));};
  const fill=async(name,value)=>{assert.ok(await evaluate(`(()=>{const e=document.querySelector('[name="${name}"]');if(!e)return false;Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`),'FIELD_'+name);};
  const click=async text=>{assert.ok(await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true;})()`),'BUTTON_'+text);};
  const ownerProfile=async()=>{await navigate('/dashboard/marketplace/profile');await wait('!!document.querySelector("input[name=displayName]")');await discover();};
  const publicPrivacy=async slug=>{
    await navigate('/marketplace/creators/'+slug);await wait('!!document.querySelector("#creator-items")');
    const html=await evaluate('(async()=>await (await fetch(location.href,{cache:"no-store"})).text())()');
    check('public HTML excludes creator private fields',![a.id,a.clerk_user_id,a.email,source.id,state.projectId,state.draftProjectId,'creatorEarningsMinor','payout_destination','failureCode',...privateAssets.data.flatMap(x=>[x.id,x.storage_key])].some(v=>v&&html.includes(v))&&!/X-Amz-|r2\.cloudflarestorage\.com|avatar_key/.test(html));
    check('public HTML contains no configured secrets',!secrets.some(s=>html.includes(s)||html.includes(encodeURIComponent(s))));
  };
  await login('A');await ownerProfile();
  await fill('displayName','Storefront Acceptance Creator');await fill('bio','Public creative recipes for your own ideas.');
  await click('Save public profile');await wait('document.body.innerText.includes("Public profile saved.")');
  const owned=await db.rpc('creator_profile_owned',{p_owner:a.id});assert.ok(!owned.error&&owned.data);state.aSlug=owned.data.slug;save();
  check('A configures persisted public profile',owned.data.displayName==='Storefront Acceptance Creator'&&owned.data.bio==='Public creative recipes for your own ideas.');
  const stableSlug=state.aSlug;
  await fill('displayName','Storefront Creator Renamed');await fill('bio','Updated public bio, saved independently of account settings.');await click('Save public profile');await wait('document.body.innerText.includes("Public profile saved.")');
  await ownerProfile();check('display name bio and slug survive reload',await evaluate(`document.querySelector('[name=displayName]').value==='Storefront Creator Renamed'&&document.querySelector('[name=bio]').value.startsWith('Updated public bio')&&document.querySelector('[name=slug]').value===${JSON.stringify(stableSlug)}`));
  const root=await call('DOM.getDocument'),node=await call('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input[name=avatar]'});await call('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[avatarFile]});
  await click('Save public avatar');await wait('document.body.innerText.includes("Public avatar saved.")');
  await ownerProfile();check('avatar survives reload',await evaluate("Array.from(document.images).some(img=>img.getAttribute('src')?.startsWith('/api/marketplace/creators/'))"));
  const avatarResponse=await fetch(origin+'/api/marketplace/creators/'+state.aSlug+'/avatar');check('public derivative loads without credentials',avatarResponse.status===200&&avatarResponse.headers.get('content-type')==='image/webp'&&!avatarResponse.headers.get('location'));
  const avatarMeta=await sharp(Buffer.from(await avatarResponse.arrayBuffer())).metadata();check('real stored avatar resized without metadata',avatarMeta.width===512&&avatarMeta.height===512&&!avatarMeta.exif);
  const originalProfile=await db.from('marketplace_creator_profiles').select('avatar_key').eq('owner_user_id',a.id).single();assert.ok(originalProfile.data&&!originalProfile.error);
  await navigate('/projects/'+source.id);await wait('!!document.querySelector("input[name=title]")');await discover();
  const ownedMedia=await invoke('readMediaAction',{projectId:source.id,assetId:privateAssets.data[0].id});check('owned private media still available',ownedMedia.ok&&!!ownedMedia.value.url);
  const unsignedObject=new URL(ownedMedia.value.url);unsignedObject.search='';const raw=await fetch(unsignedObject,{signal:AbortSignal.timeout(15000)});await raw.body?.cancel();check('private R2 rejects unsigned access',[400,401,403].includes(raw.status));
  await navigate('/create');await wait('!!document.querySelector("input[name=title]")');await discover();
  const project={id:state.projectId,mode:state.projectSaved?'update':'create',title:'Creator storefront acceptance',category:'cinematic',prompt:'PRIVATE_STOREFRONT_SOURCE',settings:{aspectRatio:'16:9',duration:'10',visualStyle:'Original',tone:'Storytelling'}};
  const saved=await invoke('saveProjectAction',project);check('owned isolated source saved',saved.ok);state.projectSaved=true;save();
  const draftProject=await invoke('saveProjectAction',{...project,id:state.draftProjectId,mode:state.draftProjectSaved?'update':'create',title:'Private draft source'});check('owned draft source saved',draftProject.ok);state.draftProjectSaved=true;save();
  await navigate('/dashboard/marketplace/new?project='+state.projectId);await wait('!!document.querySelector("input[name=title]")');await discover();
  const listing={id:state.listingId,sourceProjectId:state.projectId,title:'Public Storefront Recipe',description:'A public reusable brief for your own story.',category:'cinematic',tags:['storefront'],instructions:'Introduce your own subject, then reveal a new perspective.',publish:true,rightsConfirmed:true,adoptionType:'free',priceMinor:0};
  let published=await invoke('createMarketplaceAction',listing);check('A publishes owned template',published.ok);state.listingId=published.listingId;save();
  if(published.existing){published=await invoke('updateMarketplaceAction',{id:state.listingId,title:listing.title,description:listing.description,category:listing.category,tags:listing.tags,rightsConfirmed:true,status:'published',adoptionType:'free',priceMinor:0});check('existing acceptance template republished',published.ok);}
  const draft=await invoke('createMarketplaceAction',{...listing,id:state.draftId,sourceProjectId:state.draftProjectId,title:'PRIVATE_STOREFRONT_DRAFT',publish:false});check('A retains separate private draft',draft.ok);
  await navigate('/marketplace');await wait(`!!document.querySelector('a[href="/marketplace/creators/${state.aSlug}"]')`);check('Marketplace card links to storefront',await evaluate(`!!document.querySelector('a[href="/marketplace/creators/${state.aSlug}"]')`));
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
  await login('A');await navigate('/dashboard/marketplace/'+state.listingId);await wait('!!document.querySelector("input[name=title]")');await discover();
  const unpublished=await invoke('updateMarketplaceAction',{id:state.listingId,title:listing.title,description:listing.description,category:listing.category,tags:listing.tags,rightsConfirmed:true,status:'unpublished',adoptionType:'free',priceMinor:0});check('unpublish remains supported',unpublished.ok);
  await evaluate('window.Clerk.signOut()');await publicPrivacy(state.aSlug);check('signed-out storefront excludes unpublished listing',await evaluate('!document.body.innerText.includes("Public Storefront Recipe")&&!document.body.innerText.includes("PRIVATE_STOREFRONT_DRAFT")'));
  const empty=await db.rpc('creator_storefront',{p_slug:state.aSlug,p_page:1});check('published counts match datastore',!empty.error&&empty.data.total===empty.data.items.length&&empty.data.items.every(l=>l.status==='published'));
  await navigate('/marketplace/creators/unknown-creator-acceptance');await wait('document.body.innerText.includes("Creator not found")');check('unknown creator has safe not-found state',await evaluate('document.body.innerText.includes("Creator not found")'));
  const unsigned=await evaluate('(async()=>{const r=await fetch("/api/marketplace/creator-avatar",{method:"POST",headers:{"Content-Type":"image/png"},body:new Uint8Array([1,2,3])});return r.status;})()');check('anonymous avatar mutation denied',unsigned!==200);
  check('browser has no unexpected exceptions',browser.errors.length===0);
 });
 const profile=(await db.rpc('creator_profile_owned',{p_owner:a.id})).data;assert.ok(profile);
 const session=await clerk.sessions.createSession({userId:a.clerk_user_id});sessions.add(session.id);
 let token=(await clerk.sessions.getToken(session.id,undefined,60)).jwt;
 for(const rsc of [false,true]){
  const headers={Authorization:'Bearer '+token,...(rsc?{RSC:'1'}:{})};
  let response=await fetch(origin+'/dashboard/marketplace/profile',{headers,redirect:'manual',signal:AbortSignal.timeout(60000)});
  if(rsc&&[307,308].includes(response.status)){
    const target=new URL(response.headers.get('location'),origin);assert.equal(target.origin,origin);assert.equal(target.pathname,'/dashboard/marketplace/profile');
    check('private RSC normalization redirect is uncached',response.headers.get('cache-control')?.includes('no-store')&&response.headers.get('cdn-cache-control')==='no-store');
    await response.body?.cancel();response=await fetch(target,{headers,redirect:'manual',signal:AbortSignal.timeout(60000)});
  }
  await response.body?.cancel();check('private profile '+(rsc?'RSC':'HTML')+' has browser and CDN no-store',response.status===200&&response.headers.get('cache-control')?.includes('private')&&response.headers.get('cache-control')?.includes('no-store')&&response.headers.get('cdn-cache-control')==='no-store');
 }
 const avatarBefore=await fetch(origin+profile.avatarUrl,{signal:AbortSignal.timeout(15000)});const oldHash=createHash('sha256').update(Buffer.from(await avatarBefore.arrayBuffer())).digest('hex');
 const replacement=await sharp({create:{width:700,height:900,channels:3,background:'#19a67b'}}).png().withMetadata().toBuffer();
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
 check('financial generation caption and role state unchanged',await protectedSnapshot()===before);
 state.completedAt=new Date().toISOString();save();console.log(JSON.stringify({passed:state.checks.length,evidenceFile,screenshots:state.screenshots.length,deployed:origin.includes('vercel')}));
} finally {
 for(const id of sessions)try{if((await clerk.sessions.getSession(id)).status==='active')await clerk.sessions.revokeSession(id);}catch(error){if(error.status!==404)throw error;}
}
