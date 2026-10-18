// Local app, real reserved development identities, owned save/reopen/R2.
// Creates one clearly named test project and one tiny PNG. No generation submit.
import sharp from 'sharp';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import nextEnv from '@next/env';
import { typescriptLoader } from './lib/load-typescript.mjs';
import { deployedBrowser } from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const users=await db.from('app_users').select('id,clerk_user_id,email');assert.ok(!users.error);
const roles=await db.from('internal_user_roles').select('user_id,role');assert.ok(!roles.error);
const identities=users.data.filter(u=>u.email?.includes('+clerk_test@')&&!roles.data.some(r=>r.user_id===u.id&&r.role!=='user')).slice(0,2);assert.equal(identities.length,2);
async function protectedHash(){const rows=[];for(const table of ['generation_jobs','generation_accounts','credit_ledger','credit_purchases','creator_withdrawals','creator_earnings_ledger']){const r=await db.from(table).select('*');assert.ok(!r.error);rows.push([table,r.data.map(v=>JSON.stringify(v)).sort()])}return createHash('sha256').update(JSON.stringify(rows)).digest('hex')}
const existing=await db.from('projects').select('id').eq('owner_user_id',identities[0].id).like('title','Studio Phase 3 browser acceptance %').order('created_at',{ascending:false}).limit(1);assert.ok(!existing.error);
const before=await protectedHash(),checks=[];
const origin=process.env.STUDIO_BROWSER_ORIGIN??'http://localhost:3000';
function check(name,value){assert.ok(value,name);checks.push(name);console.log(JSON.stringify({passed:name}))}
await deployedBrowser(origin,identities.map(u=>u.clerk_user_id),async({call,evaluate,wait,navigate,signIn,discover,invoke,dir,errors,exceptions,onProtocolEvent})=>{
 const requests=[],corsErrors=[];await call('Network.enable');onProtocolEvent('Network.loadingFailed',e=>{if(e.corsErrorStatus)corsErrors.push(e.corsErrorStatus.corsError)});onProtocolEvent('Network.requestWillBeSent',e=>requests.push(e.request.url));
 const viewport=async width=>{await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await delay(150)};
 const set=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}))})()`)};
 const click=async text=>{await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);await delay(150)};
 try{
  await viewport(1440);await navigate('/studio');await wait('!!document.querySelector(".studio-layout textarea")&&!!window.Clerk?.loaded');
  const title='Studio Phase 3 browser acceptance '+Date.now();
  await set('input[name=title]',title);await set('textarea','A violet forest, calm narration, soft camera movement.');await set('select[name=aspect-ratio]','1:1');await set('select[name=tone]','Dramatic');
  await click('Sign in to generate');await wait('!!document.querySelector(".cl-modalBackdrop")');
  check('guest opens existing Clerk modal and saves bounded brief',await evaluate('!!sessionStorage.getItem("sceenyk-studio-auth-draft-v1")'));
  // The helper signs in through real Clerk ticket/session APIs. Navigation away
  // also exercises the redirect/reload handoff instead of relying on memory.
  await signIn(0);await navigate('/studio');await wait(`document.querySelector('input[name=title]')?.value===${JSON.stringify(title)}`);
  check('real authentication restores guest choices',await evaluate('document.querySelector("textarea").value.includes("violet forest")&&document.querySelector("select[name=aspect-ratio]").value==="1:1"&&document.querySelector("select[name=tone]").value==="Dramatic"&&!sessionStorage.getItem("sceenyk-studio-auth-draft-v1")'));
  if(existing.data[0]){await navigate('/projects/'+existing.data[0].id);await wait('!!document.querySelector("textarea")');await set('input[name=title]',title);await set('textarea','A violet forest, calm narration, soft camera movement.');await set('select[name=aspect-ratio]','1:1');await set('select[name=tone]','Dramatic');}
  await click('Save');await wait('!!document.querySelector("a[href^=\\"/projects/\\"]")&&document.body.textContent.includes("Draft saved")');
  const projectHref=await evaluate('document.querySelector("a[href^=\\"/projects/\\"]").getAttribute("href")');
  await navigate(projectHref);await wait(`document.querySelector('input[name=title]')?.value===${JSON.stringify(title)}`);
  check('real project save and owner reopen retain brief',await evaluate('document.querySelector("textarea").value.includes("violet forest")&&document.querySelector("select[name=tone]").value==="Dramatic"'));
  const file=path.join(dir,'studio-source.png');await sharp({create:{width:16,height:16,channels:3,background:'#7840e0'}}).png().toFile(file);
  const doc=await call('DOM.getDocument');const input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]});
  await wait('!!document.querySelector("img[alt=\\"Local source: studio-source.png\\"]")');check('real local import previews in Stage',true);
  await click('Upload to project');await wait('document.body.textContent.includes("Uploaded · Private")');await wait('!!document.querySelector("img[alt=\\"Project source: studio-source.png\\"]")');
  await wait(`document.querySelector('img[alt="Project source: studio-source.png"]')?.naturalWidth>0`);
  check('real R2 upload finalizes and switches to private source',true);
  await call('Page.reload');await wait('!!document.querySelector("img[alt=\\"Project source: studio-source.png\\"]")');check('uploaded private media survives reload',true);
  for(const width of [1440,1024,768,390,320])for(const dark of [false,true]){
   await viewport(width);await evaluate(`localStorage.setItem('sceenyk-theme',${JSON.stringify(dark?'dark':'light')});window.dispatchEvent(new Event('sceenyk-theme-change'))`);await delay(300);
   check('owned media workspace fits '+width+' '+dark,await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
   const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(dir,'studio-owned-'+width+'-'+dark+'.png'),Buffer.from(shot.data,'base64'));
  }
  await click('Sources');await wait('!!document.querySelector("dialog:modal")');check('live mobile Sources is full-screen',await evaluate('document.querySelector("dialog:modal").clientWidth===innerWidth&&document.querySelector("dialog:modal").clientHeight===innerHeight'));
  await click('Close Sources');await wait('!document.querySelector("dialog:modal")');check('live Sources returns focus',await evaluate('document.activeElement.textContent.trim()==="Sources"'));
  await discover();const readAsset=await db.from('project_assets').select('id').eq('project_id',projectHref.split('/').pop()).limit(1);assert.ok(!readAsset.error&&readAsset.data.length);
  await signIn(1);await navigate(projectHref);await wait('document.body.innerText.includes("Project unavailable")');check('real B cannot open newly saved A project',true);
  await navigate('/studio');await wait('!!document.querySelector("textarea")');await discover();
  const denied=await invoke('readMediaAction',{projectId:projectHref.split('/').pop(),assetId:readAsset.data[0].id});check('real B cannot obtain A source capability',denied.ok===false);
  check('generation and financial records unchanged',before===await protectedHash());check('no hosted workflow or provider requests',!requests.some(url=>/inngest\.(com|net)|fal\.(ai|run)|api\.elevenlabs|generativelanguage/.test(url)));check('no browser exceptions',errors.length===0);
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({checks,exceptions,projectHref,scope:'Real reserved test identities; one test project and tiny private source; no generation/payment'},null,2));console.log(JSON.stringify({passed:checks.length,evidence:dir}));
 }catch(error){const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(dir,'failure.png'),Buffer.from(shot.data,'base64'));const messages=await evaluate('Array.from(document.querySelectorAll("[role=status],[role=alert]")).map(e=>e.textContent).filter(Boolean)');console.log(JSON.stringify({messages,corsErrors}));fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({checks,exceptions,failure:error.message},null,2));console.log(JSON.stringify({evidence:dir,failure:error.message,exceptions}));throw error}
});
