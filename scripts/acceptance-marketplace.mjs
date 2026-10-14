// Real Chrome/Clerk A+B and hosted Supabase/R2 acceptance. Creates one explicit
// free listing and one adopted test project; leaves listing unpublished. Never
// calls AI, generation confirmation, payment capture, rendering or deletion.
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
const origin=process.argv[2]??'http://localhost:3015';
const deployed=process.argv.includes('--deployed');
const discoveryOnly=process.argv.includes('--discovery-only');
if(discoveryOnly)assert.ok(deployed,'DEPLOYED_DISCOVERY_RESUME');
if(deployed)assert.equal(origin,'https://sceenyk.vercel.app','EXPLICIT_PRODUCTION_ACCEPTANCE_ORIGIN');
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const evidenceFile=path.join(os.tmpdir(),deployed?'sceenyk-marketplace-deployed-acceptance.json':'sceenyk-marketplace-acceptance.json');
let state;try{state=JSON.parse(fs.readFileSync(evidenceFile,'utf8'));}catch{state={listingId:randomUUID(),checks:[],screenshots:[]};}
state.origin??=origin;assert.equal(state.origin,origin,'EVIDENCE_ORIGIN');
const save=()=>fs.writeFileSync(evidenceFile,JSON.stringify(state,null,2));
function check(name,value){assert.ok(value,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));}
async function one(table,key,id){const r=await db.from(table).select('*').eq(key,id).single();assert.ok(!r.error&&r.data,'HOSTED_'+table);return r.data;}
const composition=await one('composition_plans','job_id','aa88b9ac-9542-4138-93b6-e5861a96e1df');
const source=await one('projects','id',composition.project_id);
const userA=await one('app_users','id',source.owner_user_id);
const others=await db.from('app_users').select('id,clerk_user_id,email').neq('id',userA.id).order('id').limit(100);assert.ok(!others.error);
// Pin identity across reruns: profile upserts can change an unordered heap scan.
// Older evidence can recover its B identity from its original owned-project set.
if(!state.bUserId&&state.bProjectsBefore?.length){
  const baseline=await one('projects','id',state.bProjectsBefore[0]);state.bUserId=baseline.owner_user_id;
}
const userB=state.bUserId?await one('app_users','id',state.bUserId):others.data.find(user=>user.email?.includes('+clerk_test@'));assert.ok(userB&&userB.id!==userA.id&&userB.email?.includes('+clerk_test@'),'RESERVED_SECOND_USER');
state.bUserId=userB.id;state.aUserId??=userA.id;assert.equal(state.aUserId,userA.id,'PINNED_CREATOR');
if(state.projectId){
  const existingCopy=await one('projects','id',state.projectId);
  if(existingCopy.owner_user_id!==userB.id){state.diagnosticAdoptionProjectId=state.projectId;delete state.projectId;delete state.requestId;delete state.concurrentProjectId;delete state.concurrentRequestId;delete state.customized;}
}
if(deployed&&!discoveryOnly){state.attempts??=[];state.attempts.push({startedAt:new Date().toISOString(),previousChecks:state.checks.length});state.checks=[];state.screenshots=[];}
if(discoveryOnly)assert.ok(state.projectId&&state.requestId&&state.concurrentProjectId&&state.customized,'COMPLETE_ADOPTION_BEFORE_DISCOVERY_RESUME');
save();
const media=await db.from('project_assets').select('id,storage_key').eq('project_id',source.id).eq('upload_status','uploaded');assert.ok(!media.error&&media.data.length,'REAL_PRIVATE_MEDIA');
if(deployed&&!state.created){
  const existing=await db.rpc('marketplace_owned_listing',{p_owner_user_id:userA.id,p_listing_id:null,p_project_id:source.id});assert.ok(!existing.error);
  if(existing.data){state.listingId=existing.data.id;state.created=true;save();}
}
const publicTitle='Morning Story Recipe';
const publicInstructions='Introduce your own subject in a quiet opening scene. Build anticipation through a visual reveal, then close with an optimistic ending. Replace the subject and details with your own idea.';
const metadata={id:state.listingId,title:publicTitle,description:'A reusable storytelling approach with an opening, a reveal and a hopeful ending. Bring your own ideas and media.',category:source.category,tags:['morning','story','marketplace'],rightsConfirmed:true};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
async function untouched(){
  const rows={source:await one('projects','id',source.id)};
  for(const [table,column,id] of [['project_assets','project_id',source.id],['generation_jobs','project_id',source.id],['generation_plans','job_id',composition.job_id],['composition_plans','job_id',composition.job_id],['scene_executions','job_id',composition.job_id],['scene_assets','job_id',composition.job_id],['narration_segments','job_id',composition.job_id],['narration_assets','job_id',composition.job_id],['caption_tracks','job_id',composition.job_id],['caption_preferences','job_id',composition.job_id],['generation_reservations','job_id',composition.job_id],['render_jobs','generation_job_id',composition.job_id]]){
    const r=await db.from(table).select('*').eq(column,id);assert.ok(!r.error,'UNCHANGED_'+table);rows[table]=r.data.sort((a,b)=>JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))));
  }
  for(const user of [userA,userB])for(const [table,column] of [['generation_accounts','owner_user_id'],['credit_ledger','owner_user_id'],['credit_purchases','owner_user_id']]){
    const r=await db.from(table).select('*').eq(column,user.id);assert.ok(!r.error,'UNCHANGED_'+table);rows[user.id+table]=r.data.sort((a,b)=>JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))));
  }
  return hash(rows);
}
state.before??=await untouched();save();
const initialProjects=await db.from('projects').select('id').eq('owner_user_id',userB.id);assert.ok(!initialProjects.error);
state.bProjectsBefore??=initialProjects.data.map(p=>p.id);save();
if(process.env.SUPABASE_PUBLISHABLE_KEY){
  const publicDb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const table of ['marketplace_listings','marketplace_adoptions']){
    const r=await publicDb.from(table).select('*').limit(0);check('hosted browser role denied '+table,r.error?.code==='42501');
  }
  const denied=await publicDb.rpc('marketplace_adopt',{p_owner_user_id:userB.id,p_listing_id:state.listingId,p_request_id:randomUUID()});check('hosted browser role cannot forge adopter through RPC',denied.error?.code==='42501');
}
const direct=await db.from('marketplace_listings').update({status:'published'}).eq('id',randomUUID());check('hosted service role direct listing writes denied',direct.error?.code==='42501');

await deployedBrowser(origin,{A:userA.clerk_user_id,B:userB.clerk_user_id},async browser=>{
  const {wait,evaluate,call,signIn,discover,invoke}=browser;
  const navigate=async route=>{const target=new URL(route,origin);await call('Page.navigate',{url:target.href});await wait(`document.readyState!=='loading'&&location.pathname===${JSON.stringify(target.pathname)}&&location.search===${JSON.stringify(target.search)}`);};
  const click=async text=>{const ok=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true;})()`);assert.ok(ok,'BUTTON_'+text);};
  const fill=async(name,value)=>{assert.ok(await evaluate(`(()=>{const e=document.querySelector('form [name="${name}"]');if(!e)return false;const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`),'FIELD_'+name);};
  const bundleUrls=new Set();
  const secretNames=['PAYPAL_CLIENT_SECRET','ELEVENLABS_API_KEY','WORKER_SHARED_SECRET','MEDIA_PREPARATION_WORKER_TOKEN','FAL_KEY','RUNWAYML_API_SECRET','GEMINI_API_KEY','CLERK_SECRET_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY','INNGEST_SIGNING_KEY_FALLBACK'];
  const secrets=secretNames.map(k=>process.env[k]).filter(Boolean);
  async function publicPrivacy(label){
    const body=await evaluate("(async()=>document.querySelector('main')?.outerHTML+' '+await (await fetch(location.href,{cache:'no-store'})).text())()");
    check(label+' has no private project or R2 capability',!/[?&]X-Amz-|X-Amz-Signature|r2\.cloudflarestorage\.com|storage_key|creator_user_id|source_project_id/i.test(body)&&!body.includes(source.id)&&!body.includes(userA.id)&&!media.data.some(asset=>body.includes(asset.storage_key)||body.includes(asset.id)));
    check(label+' has no configured secrets',!secrets.some(secret=>body.includes(secret)||body.includes(encodeURIComponent(secret))));
    const urls=await evaluate("Array.from(document.scripts).map(s=>s.src).filter(s=>s.startsWith(location.origin+'/_next/'))");for(const url of urls)bundleUrls.add(url);
  }
  const captionQuery=new URLSearchParams({projectId:source.id,jobId:composition.job_id}).toString();
  async function responsive(route,ready,label){
    await navigate(route);await wait("!document.body.innerText.includes('Loading Marketplace…')");await wait(ready);
    check(label+' content visibly rendered',await evaluate("!document.body.innerText.includes('Loading Marketplace…')"));
    for(const width of [1440,768,390,320])for(const dark of [false,true]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
      check(`${label} ${width}px ${dark?'dark':'light'} fits`,await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      if((width===1440&&!dark)||(width===390&&dark)){
        const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});
        const file=path.join(os.tmpdir(),`sceenyk-marketplace-${deployed?'deployed-':''}${label}-${width}-${dark?'dark':'light'}.png`);fs.writeFileSync(file,Buffer.from(shot.data,'base64'));if(!state.screenshots.includes(file))state.screenshots.push(file);save();
      }
    }
    await call('Emulation.clearDeviceMetricsOverride');
  }
  if(!discoveryOnly){
  await navigate('/marketplace');await wait("!!document.querySelector('form[role=search]')");
  check('public Marketplace loads',await evaluate("!!document.querySelector('h1')&&document.body.innerText.includes('Free adoption costs zero credits')"));
  await signIn('A');await navigate('/projects/'+source.id);await wait("!!document.querySelector('input[name=title]')");await discover();
  check('owned project exposes publishing action',await evaluate(`!!document.querySelector('a[href="/dashboard/marketplace/new?project=${source.id}"]')`));
  const mediaRef={projectId:source.id,assetId:media.data[0].id};
  const ownedRead=await invoke('readMediaAction',mediaRef);check('creator still reads private media',ownedRead.ok&&!!ownedRead.value.url);
  // Neither the signed URL nor the storage key is persisted in acceptance evidence.
  const unsigned=new URL(ownedRead.value.url);unsigned.search='';
  const raw=await fetch(unsigned,{signal:AbortSignal.timeout(15000)});await raw.body?.cancel();check('R2 still rejects unsigned private media',[400,401,403].includes(raw.status));
  if(deployed){
    const generation=await invoke('latestGenerationAction',source.id);const latest=await db.from('generation_jobs').select('id,status').eq('project_id',source.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);assert.ok(!latest.error);
    check('deployed owned generation recovery unchanged',generation.ok&&generation.value?.id===latest.data[0]?.id&&generation.value?.status===latest.data[0]?.status);
    const captions=await evaluate(`(async()=>{const r=await fetch('/api/captions?'+${JSON.stringify(captionQuery)},{cache:'no-store'});return {status:r.status,body:await r.json()};})()`);check('deployed owned caption track and style load',captions.status===200&&captions.body.track?.status==='ready'&&captions.body.style?.schema_version===1);
    for(const format of ['srt','vtt'])check('deployed owned '+format+' export unchanged',await evaluate(`(async()=>{const r=await fetch('/api/captions?'+${JSON.stringify(captionQuery+'&format='+format)},{cache:'no-store'});const body=await r.text();return r.status===200&&${format==='vtt'?'body.startsWith("WEBVTT")':'body.includes(" --> ")'};})()`));
    await navigate('/dashboard/credits');await wait("document.body.innerText.includes('Buy credits')");await discover();
    const wallet=await invoke('creditWalletAction');const checkout=await invoke('creditCheckoutAction');const account=await one('generation_accounts','owner_user_id',userA.id);
    check('deployed credit wallet matches authoritative balance',wallet.ok&&wallet.data.available===account.credit_available&&wallet.data.reserved===account.credit_reserved);
    check('deployed PayPal Sandbox options remain configured',checkout.ok&&checkout.data.configured&&checkout.data.packs.length===3);
    check('deployed verified purchase history remains available',wallet.ok&&wallet.data.purchases.some(p=>p.status==='completed'));
    const urls=await evaluate("Array.from(document.scripts).map(s=>s.src).filter(s=>s.startsWith(location.origin+'/_next/'))");for(const url of urls)bundleUrls.add(url);
  }
  await navigate('/dashboard/marketplace/new?project='+source.id);await wait("!!document.querySelector('form input[name=title]')");await discover();
  if(!state.created){
    await fill('title',metadata.title);await fill('description',metadata.description);await fill('tags',metadata.tags.join(', '));await fill('instructions',publicInstructions);
    check('publish blocks missing rights confirmation',await evaluate("!!document.querySelector('button[type=submit]').disabled"));
    await click('Save draft');await wait("location.pathname.startsWith('/dashboard/marketplace/')&&!location.pathname.endsWith('/new')");
    state.listingId=await evaluate('location.pathname.split("/").pop()');metadata.id=state.listingId;state.created=true;save();
    const draft=await one('marketplace_listings','id',state.listingId);check('actual owned draft persisted',draft.status==='draft'&&draft.rights_confirmed_at===null);
    check('draft absent from public discovery',!(await db.rpc('marketplace_detail',{p_listing_id:state.listingId})).data);
  }else {await navigate('/dashboard/marketplace/'+state.listingId);await wait("!!document.querySelector('form input[name=title]')");}
  await responsive('/dashboard/marketplace/'+state.listingId,"!!document.querySelector('form input[name=title]')",'editor');
  await discover();
  if(deployed&&await evaluate("!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Unpublish')")){
    await click('Unpublish');await wait("!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Publish to Marketplace')");
  }
  if(!await evaluate("document.querySelector('input[name=rightsConfirmed]').checked"))await evaluate("document.querySelector('input[name=rightsConfirmed]').click()");
  await click(await evaluate("document.querySelector('button[type=submit]').textContent.trim()"));
  await wait("document.body.innerText.includes('Published to Marketplace.')||document.querySelector('a[href^=\"/marketplace/\"]')");
  const listing=await one('marketplace_listings','id',state.listingId);check('A publishes owned template with rights timestamp',listing.status==='published'&&!!listing.rights_confirmed_at);
  check('safe snapshot excludes private original prompt',listing.template_snapshot.instructions===publicInstructions&&listing.template_snapshot.instructions!==source.prompt);
  check('snapshot contains only approved keys',Object.keys(listing.template_snapshot).sort().join(',')==='category,instructions,settings,version');
  check('public DTO excludes private source, IDs and media',!JSON.stringify((await db.rpc('marketplace_detail',{p_listing_id:state.listingId})).data).includes(source.id)&&!JSON.stringify((await db.rpc('marketplace_detail',{p_listing_id:state.listingId})).data).includes(userA.id));
  await responsive('/marketplace',`!!document.querySelector('a[href="/marketplace/${state.listingId}"]')`,'browse');
  if(deployed)await publicPrivacy('deployed public browse');
  await evaluate("document.querySelector('input[name=q]').focus()");
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  check('search keyboard reaches category with visible focus',await evaluate("document.activeElement?.name==='category'&&getComputedStyle(document.activeElement).outlineStyle!=='none'"));
  check('search finds actual listing',(await db.rpc('marketplace_browse',{p_query:'Morning',p_category:null,p_page:1})).data.items.some(x=>x.id===state.listingId));
  await navigate('/marketplace?q=Morning&category='+source.category);await wait(`!!document.querySelector('a[href="/marketplace/${state.listingId}"]')`);check('search and category browser results work',await evaluate("document.querySelector('input[name=q]').value==='Morning'"));
  if(deployed){await navigate('/marketplace?category='+(source.category==='gaming'?'cinematic':'gaming'));await wait("document.body.innerText.includes('No matching templates')");check('deployed category filter excludes nonmatching listing',!await evaluate(`!!document.querySelector('a[href="/marketplace/${state.listingId}"]')`));}
  await navigate('/marketplace?q=NoSuchMarketplaceTemplate');await wait("document.body.innerText.includes('No matching templates')");check('search no results state',true);
  await responsive('/marketplace/'+state.listingId,"!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Adopt template')",'detail');
  check('detail distinguishes adoption and generation cost',await evaluate("document.body.innerText.includes('Creator adoption price: Free')&&document.body.innerText.includes('Normal Sceenyk credits may still be required')"));
  if(deployed){
    await publicPrivacy('deployed public detail');
    await evaluate("document.querySelector('[aria-label=\"Toggle light and dark theme\"]').click()");
    const expectedTheme=await evaluate("document.documentElement.classList.contains('dark')");await call('Page.reload');await wait("!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Adopt template')");
    check('deployed theme control persists through reload',await evaluate(`document.documentElement.classList.contains('dark')===${expectedTheme}`));
  }
  await signIn('B');await navigate('/marketplace/'+state.listingId);await wait("!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Adopt template')");await discover();
  check('B cannot publish A project',(await invoke('createMarketplaceAction',{...metadata,id:randomUUID(),sourceProjectId:source.id,instructions:publicInstructions,publish:true})).code==='NOT_FOUND');
  check('browser creator ownership injection rejected',(await invoke('createMarketplaceAction',{...metadata,id:randomUUID(),sourceProjectId:source.id,instructions:publicInstructions,publish:true,creator_user_id:userA.id})).code==='INVALID_INPUT');
  for(const status of ['published','unpublished','archived'])check('B cannot change A listing to '+status,(await invoke('updateMarketplaceAction',{...metadata,title:'Unauthorized metadata change',status})).code==='NOT_FOUND');
  check('B cannot get A private media',(await invoke('readMediaAction',mediaRef)).code==='NOT_FOUND');
  if(deployed){
    check('deployed foreign caption read denied',await evaluate(`(async()=>{const r=await fetch('/api/captions?'+${JSON.stringify(captionQuery)});return r.status===404;})()`));
    const foreignGeneration=await invoke('latestGenerationAction',source.id);
    if(!foreignGeneration.ok||foreignGeneration.value!==null)console.log(JSON.stringify({diagnostic:'foreign-generation',ok:foreignGeneration.ok,code:foreignGeneration.code,httpStatus:foreignGeneration.status,keys:Object.keys(foreignGeneration),valueType:typeof foreignGeneration.value}));
    check('deployed foreign generation recovery denied',foreignGeneration.ok&&foreignGeneration.value===null);
    await navigate('/dashboard/marketplace');await wait("document.body.innerText.includes('My Marketplace Listings')");check('B owned listings do not include A listing',!await evaluate(`!!document.querySelector('a[href="/dashboard/marketplace/${state.listingId}"]')`));
  }
  await navigate('/dashboard/marketplace/'+state.listingId);await wait("document.body.innerText.includes('This listing is unavailable')");check('B cannot open A listing management',true);
  await navigate('/projects/'+source.id);await wait("document.body.innerText.includes('Project unavailable')");check('B cannot open A original project',!await evaluate("!!document.querySelector('input[name=title]')"));
  await navigate('/marketplace/'+state.listingId);await wait("!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Adopt template')");
  state.requestId??=randomUUID();save();await evaluate(`sessionStorage.setItem(${JSON.stringify(`sceenyk-adoption:${userB.clerk_user_id}:${state.listingId}`)},${JSON.stringify(state.requestId)})`);
  await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Adopt template');b.click();b.click();})()");
  await wait("location.pathname.startsWith('/projects/')&&!!document.querySelector('[aria-label=\"Adopted template\"]')");
  state.projectId=await evaluate('location.pathname.split("/").pop()');save();
  const adopted=await one('projects','id',state.projectId);check('B receives a distinct owned project',adopted.id!==source.id&&adopted.owner_user_id===userB.id);
  check('adopted settings copy accurately',adopted.category===source.category&&adopted.aspect_ratio===source.aspect_ratio&&adopted.duration===source.duration&&adopted.visual_style===source.visual_style&&adopted.tone===source.tone&&adopted.prompt===publicInstructions+(state.customized?' My own subject is a lantern.':''));
  const primaryProjects=await db.from('projects').select('id').eq('owner_user_id',userB.id);assert.ok(!primaryProjects.error);
  check('one adoption action creates exactly one new B project',primaryProjects.data.filter(p=>!state.bProjectsBefore.includes(p.id)&&p.id!==state.concurrentProjectId).length===1);
  const copied=await db.from('project_assets').select('id').eq('project_id',state.projectId);check('no private creator media transfers',!copied.error&&copied.data.length===0);
  const adoption=await one('marketplace_adoptions','project_id',state.projectId);
  state.requestId=adoption.request_id;save();
  const repeat=await Promise.all([invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:adoption.request_id}),invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:adoption.request_id})]);
  check('actual concurrent duplicate adoption returns same project',repeat.every(x=>x.ok&&x.projectId===state.projectId));
  const provenance=await db.from('marketplace_adoptions').select('project_id').eq('adopter_user_id',userB.id).eq('request_id',adoption.request_id);check('duplicate has exactly one provenance row',!provenance.error&&provenance.data.length===1);
  state.concurrentRequestId??=randomUUID();save();
  const competing=await Promise.all([invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:state.concurrentRequestId}),invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:state.concurrentRequestId})]);
  check('simultaneous first adoption has one winner project',competing.every(x=>x.ok&&x.projectId===competing[0].projectId));
  const competingRows=await db.from('marketplace_adoptions').select('project_id').eq('adopter_user_id',userB.id).eq('request_id',state.concurrentRequestId);check('simultaneous first adoption persists exactly one project',!competingRows.error&&competingRows.data.length===1);
  state.concurrentProjectId=competing[0].projectId;save();
  await call('Page.reload');await wait("!!document.querySelector('[aria-label=\"Adopted template\"]')");check('refresh restores adoption and settings',await evaluate(`document.querySelector('textarea')?.value===${JSON.stringify(publicInstructions+(state.customized?' My own subject is a lantern.':''))}`));
  await discover();
  const customized=await invoke('saveProjectAction',{id:state.projectId,mode:'update',title:'My independently customized recipe',category:adopted.category,prompt:publicInstructions+' My own subject is a lantern.',settings:{duration:adopted.duration,aspectRatio:adopted.aspect_ratio,visualStyle:adopted.visual_style,tone:adopted.tone}});check('B independently customizes new project',customized.ok);
  state.customized=true;save();
  if(deployed){
    const quote=await invoke('quoteGenerationAction',{projectId:state.projectId,requestId:randomUUID(),inputs:{category:adopted.category,prompt:publicInstructions,settings:{duration:adopted.duration,aspectRatio:adopted.aspect_ratio,visualStyle:adopted.visual_style,tone:adopted.tone},assetIds:[]}});
    check('deployed adopted project follows normal server quote flow',quote.ok&&!!quote.value.id&&['ready','insufficient_credits','pricing_unavailable'].includes(quote.value.status));
  }
  await navigate('/dashboard');await navigate('/projects/'+state.projectId);await wait("!!document.querySelector('input[name=title]')");check('customization survives reopen',await evaluate("document.querySelector('input[name=title]').value==='My independently customized recipe'"));
  await signIn('A');await navigate('/projects/'+state.projectId);await wait("document.body.innerText.includes('Project unavailable')");check('A cannot read B adopted project',true);
  await navigate('/dashboard/marketplace');await wait(`!!document.querySelector('a[href="/dashboard/marketplace/${state.listingId}"]')`);check('creator sees own persisted listing',true);
  await navigate('/dashboard/marketplace/'+state.listingId);await wait("!!document.querySelector('input[name=title]')");await discover();
  await fill('description',metadata.description+' Customize the structure in your own project.');await click('Save published listing');
  await wait("document.body.innerText.includes('Published to Marketplace.')");check('creator safely edits listing metadata',(await one('marketplace_listings','id',state.listingId)).description.endsWith('own project.'));
  }else{
    await signIn('A');await navigate('/projects/'+source.id);await wait("!!document.querySelector('input[name=title]')");await discover();
    await navigate('/dashboard/credits');await wait("document.body.innerText.includes('Buy credits')");
    const urls=await evaluate("Array.from(document.scripts).map(s=>s.src).filter(s=>s.startsWith(location.origin+'/_next/'))");for(const url of urls)bundleUrls.add(url);
    await navigate('/dashboard/marketplace/'+state.listingId);await wait("!!document.querySelector('input[name=title]')");await discover();
    const current=await one('marketplace_listings','id',state.listingId);
    if(current.status!=='published')assert.ok((await invoke('updateMarketplaceAction',{...metadata,title:current.title,description:current.description,category:current.category,tags:current.tags,status:'published'})).ok,'RESUME_PUBLISHED_LISTING');
  }
  if(deployed){
    state.paginationFixtures??=Array.from({length:13},(_,i)=>({sourceProjectId:randomUUID(),listingId:randomUUID(),title:`Pagination template ${String(i+1).padStart(2,'0')}`}));save();
    for(const [index,fixture] of state.paginationFixtures.entries()){
      if(!fixture.saved){
        const result=await invoke('saveProjectAction',{id:fixture.sourceProjectId,mode:'create',title:fixture.title,category:'gaming',prompt:'Temporary owned brief for deployed pagination acceptance.',settings:{aspectRatio:'1:1',duration:'10',visualStyle:'Original',tone:'Energetic'}});
        assert.ok(result.ok,'PAGINATION_OWNED_SOURCE');fixture.saved=true;save();
      }
      const details={id:fixture.listingId,title:fixture.title,description:'Temporary free template for deployed discovery acceptance.',category:'gaming',tags:['marketplacepagingtest'],rightsConfirmed:true};
      const result=fixture.created?await invoke('updateMarketplaceAction',{...details,status:'published'}):await invoke('createMarketplaceAction',{...details,sourceProjectId:fixture.sourceProjectId,instructions:'Introduce your own character, reveal a new setting, and close with a bold moment.',publish:true});
      assert.ok(result.ok&&result.listingId,'PAGINATION_LISTING_PUBLISH');fixture.listingId=result.listingId;fixture.created=true;save();console.log(JSON.stringify({paginationFixture:index+1,published:true}));
    }
    await responsive('/marketplace?q=marketplacepagingtest&category=gaming',"document.querySelectorAll('main article').length===12",'browse');await publicPrivacy('deployed public browse');
    const firstIds=await evaluate("Array.from(document.querySelectorAll('main article')).map(a=>a.querySelector('a').getAttribute('href'))");
    check('deployed first page has twelve of thirteen filtered listings',await evaluate("document.querySelector('nav[aria-label=\"Listing pages\"]')?.innerText.includes('13 listings')"));
    await evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Listing pages\"] a')).find(a=>a.textContent.trim()==='Next').click()");
    await wait("location.search.includes('page=2')&&document.querySelectorAll('main article').length===1");
    await wait("!document.body.innerText.includes('Loading Marketplace…')");
    const secondIds=await evaluate("Array.from(document.querySelectorAll('main article')).map(a=>a.querySelector('a').getAttribute('href'))");
    check('deployed second page has remaining distinct listing',secondIds.length===1&&!firstIds.includes(secondIds[0]));
    check('deployed paging preserves search and category',await evaluate("new URLSearchParams(location.search).get('q')==='marketplacepagingtest'&&new URLSearchParams(location.search).get('category')==='gaming'"));
    await evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Listing pages\"] a')).find(a=>a.textContent.trim()==='Previous').click()");await wait("location.search.includes('page=1')&&document.querySelectorAll('main article').length===12");check('deployed previous page works',true);
    await responsive('/marketplace/'+state.listingId,"!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Adopt template')",'detail');await publicPrivacy('deployed public detail');await discover();
    await responsive('/dashboard/marketplace/'+state.listingId,"!!document.querySelector('form input[name=title]')",'editor');await discover();
    await navigate('/dashboard/marketplace');await wait("!document.body.innerText.includes('Loading Marketplace…')&&document.querySelectorAll('main article').length===12");
    check('My Marketplace Listings paginates twelve owned records',await evaluate("!!Array.from(document.querySelectorAll('nav[aria-label=\"Listing pages\"] a')).find(a=>a.textContent.trim()==='Next')"));
    await evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Listing pages\"] a')).find(a=>a.textContent.trim()==='Next').click()");await wait("location.search.includes('page=2')&&!document.body.innerText.includes('Loading Marketplace…')&&document.querySelectorAll('main article').length>0");check('owned listings second page loads',true);
    await discover();
    for(const fixture of state.paginationFixtures){
      const result=await invoke('updateMarketplaceAction',{id:fixture.listingId,title:fixture.title,description:'Temporary free template for deployed discovery acceptance.',category:'gaming',tags:['marketplacepagingtest'],rightsConfirmed:true,status:'unpublished'});
      assert.ok(result.ok,'PAGINATION_UNPUBLISH');fixture.unpublished=true;save();
    }
    const removed=await db.rpc('marketplace_browse',{p_query:'marketplacepagingtest',p_category:'gaming',p_page:1});check('all thirteen pagination fixtures unpublished',!removed.error&&removed.data.total===0);
    await navigate('/dashboard/marketplace/'+state.listingId);await wait("!!document.querySelector('input[name=title]')");
  }
  await click('Unpublish');await wait("document.body.innerText.includes('Listing unpublished.')");
  check('creator unpublishes',(await one('marketplace_listings','id',state.listingId)).status==='unpublished');
  await navigate('/marketplace?q=Morning');await wait("document.body.innerText.includes('No matching templates')");check('unpublished disappears from browser search',true);
  await navigate('/marketplace');await wait("document.body.innerText.includes('The next idea could be yours')");check('empty Marketplace state after unpublish',true);
  await navigate('/marketplace/'+state.listingId);await wait("document.body.innerText.includes('This template is unavailable')");check('unpublished detail denied',true);
  await signIn('B');
  check('new adoption denied after unpublish',!(await invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:randomUUID()})).ok);
  check('committed retry recovers after unpublish',(await invoke('adoptMarketplaceAction',{listingId:state.listingId,requestId:state.requestId})).projectId===state.projectId);
  if(deployed){
    for(const url of bundleUrls){
      const response=await fetch(url);assert.equal(response.status,200,'DEPLOYED_CLIENT_SCRIPT');const body=await response.text();
      assert.ok(!secrets.some(secret=>body.includes(secret)||body.includes(encodeURIComponent(secret))),'DEPLOYED_BUNDLE_SECRET');
      assert.ok(!/marketplace_create|marketplace_update|marketplace_adopt|marketplace_owned_listing|marketplace_origin|SUPABASE_SECRET_KEY|R2_SECRET_ACCESS_KEY|PAYPAL_CLIENT_SECRET|GEMINI_API_KEY|ELEVENLABS_API_KEY|fulfil_paypal_purchase|claim_generation_job|persist_caption_track/.test(body),'DEPLOYED_BUNDLE_SERVER_MARKER');
    }
    state.clientScan={files:bundleUrls.size,configuredSecrets:secrets.length,leaks:0,serverMarkers:0};save();check('deployed public and account client scripts contain no secrets',bundleUrls.size>0);
  }
  if(browser.errors.length)console.log(JSON.stringify({browserExceptions:browser.exceptions}));
  check('no browser exceptions',browser.errors.length===0);
});
check('original project, private assets, generation, captions, payment and accounting unchanged',await untouched()===state.before);
console.log(JSON.stringify({passed:state.checks.length,checks:state.checks,screenshots:state.screenshots,evidenceFile,listingStatus:'unpublished'}));
