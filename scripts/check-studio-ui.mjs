// Actual Studio components/hooks in Chrome, with explicit server/storage fixtures.
// No hosted generation, financial transaction, provider request, or user media.
import sharp from 'sharp';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { typescriptLoader } from './lib/load-typescript.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sceenyk-studio-ui-'));
const png = (await sharp({create:{width:16,height:16,channels:3,background:"#7840e0"}}).png().toBuffer()).toString("base64");
const jobId='44444444-4444-4444-8444-444444444444',sceneId='55555555-5555-4555-8555-555555555555',assetId='77777777-7777-4777-8777-777777777777',narrationId='88888888-8888-4888-8888-888888888888';
const plan={schema_version:1,generation_job_id:jobId,aspect_ratio:'16:9',total_duration_ms:10000,configuration:{schema_version:1,narration_offset_ms:0,technical_tolerance_ms:0},status:'ready',issues:[],scenes:[{scene_execution_id:sceneId,scene_order:1,start_ms:0,end_ms:10000,duration_ms:10000,visual:{asset_kind:'scene_asset',asset_id:assetId,media_type:'image',actual_duration_ms:null,input_start_ms:0,input_end_ms:10000},narration:{asset_id:narrationId,start_offset_ms:0,actual_duration_ms:3000,start_ms:0,end_ms:3000,trailing_silence_ms:7000},transition:{type:'cut',duration_ms:0},timing_status:'valid'}]};
const track=typescriptLoader()('lib/captions/build.ts').buildCaptionTrack({plan,narration:[{id:narrationId,scene_execution_id:sceneId,scene_order:1,output_asset_id:narrationId,actual_duration_ms:3000,text:'A violet forest comes alive'}]});
const videoPath=path.join(dir,'fixture.mp4');const encoded=spawnSync(ffmpeg,['-f','lavfi','-i','color=c=purple:s=160x90:d=1','-c:v','libx264','-pix_fmt','yuv420p','-y',videoPath],{windowsHide:true});assert.equal(encoded.status,0,'SYNTHETIC_VIDEO');
const source = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{CreationWorkspace}from'./components/creation/creation-workspace';
window.user=null;window.job=null;window.saved=null;window.assets=[];window.calls=[];
window.preferences={aspectRatio:'9:16',category:'social'};
window.png='data:image/png;base64,${png}';
window.asset={id:'77777777-7777-4777-8777-777777777777',projectId:'33333333-3333-4333-8333-333333333333',kind:'image',filename:'sample.png',sizeBytes:68,mimeType:'image/png',status:'uploaded'};
window.plan=${JSON.stringify(plan)};window.captionResponse={track:${JSON.stringify(track)},enabled:true,style:{schema_version:1,preset:'default',position:'bottom',size:'normal',alignment:'center',contrast:'default'}};
window.quoteStatus='ready';window.free=true;window.blockSave=false;
window.fetch=async url=>({ok:true,json:async()=>url.startsWith('/api/media/final')?{video:{url:'/fixture.mp4',downloadUrl:'/fixture.mp4',durationMs:10000,width:1920,height:1080}}:url.startsWith('/api/composition')?{plan:window.plan}:url.startsWith('/api/media/scene-preview')?{sceneId:window.plan.scenes[0].scene_execution_id,mediaType:'image',url:window.png,expiresAt:'future'}:window.captionResponse});
function App(){const[revision,setRevision]=useState(0);const[opened,setOpened]=useState(false);
window.rerender=()=>setRevision(n=>n+1);window.reopen=()=>{setOpened(true);setRevision(n=>n+1)};window.reset=()=>{setOpened(false);setRevision(n=>n+1)};
return <main style={{padding:8}}><h1 className='sr-only'>Sceenyk Studio</h1><CreationWorkspace key={revision} initialProject={opened?window.saved:undefined} initialAssets={opened?window.assets:[]} initialGeneration={window.job} viewerUserId={window.user}/></main>};createRoot(document.getElementById('root')).render(<App/>);`;
const bundle = await build({absWorkingDir:process.cwd(),tsconfig:'tsconfig.json',stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},outfile:'fixture.js',bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^next\/(link|image)$|^@clerk\/nextjs$|^@\/app\/actions\/|auth-availability$|^@\/lib\/media\/upload-client$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:
 a.path==='next/link'?`import React from'react';export default function Link({prefetch,...p}){return <a {...p}/>}`:
 a.path==='next/image'?`import React from'react';export default function Image({fill,unoptimized,...p}){return <img style={fill?{position:'absolute',height:'100%',width:'100%'}:undefined} {...p}/>}`:
 a.path==='@clerk/nextjs'?`import React from'react';export const useAuth=()=>({isLoaded:true,isSignedIn:!!window.user,userId:window.user});export function SignInButton({children}){return React.cloneElement(children,{onClick:e=>{children.props.onClick?.(e);window.user='owner';window.rerender()}})}export const SignUpButton=SignInButton;`:
 a.path.endsWith('auth-availability')?`export const useAuthAvailable=()=>true;`:
 a.path.endsWith('/settings')?`export const creationPreferencesAction=async()=>({ok:true,data:{clerkUserId:window.user,preferences:window.preferences}});`:
 a.path.endsWith('/projects')?`export const saveProjectAction=async input=>{window.calls.push(['save',input]);if(window.blockSave)await new Promise(r=>window.finishSave=r);window.saved={...input,status:'draft',createdAt:'2026-10-18',updatedAt:'2026-10-18'};return{ok:true,project:window.saved}};`:
 a.path.endsWith('/media')?`export const listMediaAction=async()=>({ok:true,value:window.assets});export const readMediaAction=async()=>({ok:true,value:{url:window.png}});export const authorizeMediaAction=async input=>{window.calls.push(['authorize',input]);window.asset={...window.asset,projectId:input.projectId};return{ok:true,value:{asset:{...window.asset,status:'pending'},upload:{url:'fixture',headers:{}}}}};export const finalizeMediaAction=async input=>{window.calls.push(['finalize',input]);window.assets=[window.asset];return{ok:true,value:window.asset}};`:
 a.path.endsWith('/upload-client')?`export const uploadFileDirectly=async(file,auth,progress)=>{window.calls.push(['upload',file.name]);progress(50);await new Promise(r=>setTimeout(r,30));progress(100)};`:
 a.path.endsWith('/generation')?`export const latestGenerationAction=async()=>({ok:true,value:window.job});export const createGenerationAction=async input=>{window.calls.push(['generate',input]);return{ok:false,code:'CONFLICT',message:'Fixture submission rejected safely'}};`:
 a.path.endsWith('/pricing')?`export const quoteGenerationAction=async input=>{window.calls.push(['quote',input]);return{ok:true,value:{id:'fixture-quote',status:window.quoteStatus,eligibleFreeGeneration:window.free,requiredCredits:30,availableCredits:window.quoteStatus==='insufficient_credits'?5:100,expectedRemainingCredits:70,freeGenerationsRemaining:2,expiresAt:new Date(Date.now()+300000).toISOString(),breakdown:{durationSeconds:10,operation:'generation'},pricingMode:'test'}}};`:
 a.path.endsWith('/accounting')?`export const freeAllowanceAction=async()=>({ok:true,value:{total:2,available:2,reserved:0,consumed:0}});`:
 a.path.endsWith('/payments')?`export const creditWalletAction=async()=>({ok:true,data:{available:100,lowBalance:false}});export const creditPacksAction=async()=>({ok:true,packs:[],configured:false});export const createCreditOrderAction=async()=>({ok:false});export const cancelCreditOrderAction=async()=>({ok:false});export const completeCreditOrderAction=async()=>({ok:false});export const reconcileCreditOrdersAction=async()=>({ok:true,data:{pending:0,recovered:0}});export const creditSummaryAction=async()=>({ok:true,data:{available:100,lowBalance:false}});export const creditCheckoutAction=async()=>({ok:false});`:
 a.path.endsWith('/captions')?`export const setCaptionPreferenceAction=async input=>{window.calls.push(['caption',input]);return{ok:true}};export const setCaptionStyleAction=async input=>{window.calls.push(['caption-style',input]);return{ok:true}};`:
 'export const unused=()=>{};'}));
}}]});
const css = fs.readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('.next/static/chunks/'+f,'utf8')).join('\n');
const script = bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const server = http.createServer((req,res)=>{if(req.url==='/fixture.mp4'){res.setHeader('Content-Type','video/mp4');res.end(fs.readFileSync(videoPath));return}res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?script:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="bg-background text-foreground"><div id="root"></div><script src="/fixture.js"></script></body></html>`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9374','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;const checks=[],errors=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log(JSON.stringify({passed:name}))};
try {
 let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch('http://127.0.0.1:9374/json')).json();break}catch{await delay(100)}}
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 let sequence=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error('CDP_FAILED'));else p?.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text)};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??'EVALUATION_FAILED');return r.result.value};
 const wait=async expression=>{for(let n=0;n<150;n++){if(await evaluate(expression))return;await delay(100)}throw Error('TIMEOUT '+expression)};
 const click=async text=>{await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);await delay(100)};
 const set=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}))})()`)};
 const viewport=async width=>{await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await delay(100)};
 const key=async key=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Escape'?27:key==='Tab'?9:0});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='Escape'?27:key==='Tab'?9:0});await delay(100)};
 await call('Page.enable');await call('Runtime.enable');await viewport(1440);await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/create'});await wait('!!document.querySelector("textarea")');
 for(const width of [1600,1366,1050,1024,768,720,390,320])for(const dark of [false,true]){
  await viewport(width);await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
  check('fits '+width+' '+dark,await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  check('64px toolbar '+width+' '+dark,await evaluate('document.querySelector(".studio-toolbar").getBoundingClientRect().height===64'));
  if(width>=1366)check('Stage dominant '+width+' '+dark,await evaluate('document.querySelector(".studio-stage").clientWidth>document.querySelector(".studio-sources").clientWidth&&document.querySelector(".studio-stage").clientWidth>document.querySelector(".studio-properties").clientWidth'));
  if(width<720)check('Stage precedes Properties '+width+' '+dark,await evaluate('document.querySelector(".studio-stage").getBoundingClientRect().bottom<=document.querySelector(".studio-properties").getBoundingClientRect().top'));
  if([1366,768,390].includes(width)){const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(dir,width+'-'+dark+'.png'),Buffer.from(shot.data,'base64'))}
 }
 await viewport(390);await set('textarea','A violet forest with calm narration');await set('select[name=aspect-ratio]','1:1');await set('select[name=tone]','Dramatic');
 await evaluate('window.previewNode=document.querySelector("[aria-label=\\"Creation preview\\"]");window.scrollTo(0,180)');const scroll=await evaluate('scrollY');
 await click('Sources');await wait('!!document.querySelector("dialog:modal")');
 check('Sources locks background scroll',await evaluate('document.body.style.overflow==="hidden"'));
 check('Sources fills viewport',await evaluate('document.querySelector("dialog:modal").clientWidth===innerWidth&&document.querySelector("dialog:modal").clientHeight===innerHeight'));
 await set('input[name=title]','Guest forest');
 for(let i=0;i<15;i++)await key('Tab');check('focus trapped in Sources',await evaluate('document.querySelector("dialog:modal").contains(document.activeElement)'));
 await evaluate(`(()=>{const bytes=Uint8Array.from(atob(window.png.split(',')[1]),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'sample.png',{type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 await key('Escape');await wait('!document.querySelector("dialog:modal")');
 check('Sources closes with focus and scroll restored',await evaluate(`document.activeElement.textContent.trim()==='Sources'&&Math.abs(scrollY-${scroll})<=1`));
 check('preview and values survive Sources',await evaluate('window.previewNode===document.querySelector("[aria-label=\\"Creation preview\\"]")&&document.querySelector("textarea").value.includes("violet")&&document.querySelector("select[name=aspect-ratio]").value==="1:1"&&!!document.querySelector("img[alt=\\"Local source: sample.png\\"]")'));
 await click('Sign in to generate');await wait('!!window.user&&document.querySelector("textarea")?.value.includes("violet")');
 check('guest auth restores brief ahead of account defaults',await evaluate('document.querySelector("input[name=title]").value==="Guest forest"&&document.querySelector("select[name=aspect-ratio]").value==="1:1"&&document.querySelector("select[name=tone]").value==="Dramatic"&&!!document.querySelector("img[alt=\\"Local source: sample.png\\"]")'));
 await click('Save');await wait('!!window.saved');check('save uses original strict payload',await evaluate('window.saved.prompt.includes("violet")&&window.saved.settings.aspectRatio==="1:1"&&window.calls.filter(c=>c[0]==="save").length===1'));
 await click('Sources');await click('Upload to project');await wait('document.body.textContent.includes("Uploaded · Private")');await click('Close Sources');
 check('upload retains existing authorize PUT finalize flow',await evaluate('window.calls.some(c=>c[0]==="authorize")&&window.calls.some(c=>c[0]==="upload")&&window.calls.some(c=>c[0]==="finalize")&&!!document.querySelector("img[alt=\\"Project source: sample.png\\"]")'));
 await evaluate('window.reopen()');await wait('!!document.querySelector("textarea")');check('reopen retains saved brief and uploaded source',await evaluate('document.querySelector("textarea").value===window.saved.prompt&&document.querySelector("input[name=title]").value===window.saved.title&&!!document.querySelector("img[alt=\\"Project source: sample.png\\"]")'));
 await click('Review generation cost');await wait('document.body.textContent.includes("Free generation —")');check('review is separate from confirmation',await evaluate('window.calls.filter(c=>c[0]==="generate").length===0'));
 await click('Confirm free generation');await wait('window.calls.some(c=>c[0]==="generate")');check('confirmation submits quote ID only',await evaluate('JSON.stringify(window.calls.find(c=>c[0]==="generate")[1])===JSON.stringify({quoteId:"fixture-quote"})'));
 await evaluate('window.free=false;window.quoteStatus="insufficient_credits"');await click('Review generation cost');await wait('document.body.textContent.includes("You need 30 credits")');check('insufficient credits blocks confirmation',await evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.textContent.includes("Confirm 30 credits")).disabled'));
 await set('textarea','Edited request');check('editing invalidates quote',await evaluate('!document.body.textContent.includes("You need 30 credits")'));
 for(const [status,stage,extra,label] of [['queued',null,{},'Generation queued'],['processing','planning',{productionPlanReadyAt:'ready'},'Production plan ready'],['processing','voice',{},'Generating voice-over'],['processing','planning',{visualsReadyAt:'ready'},'Visuals ready'],['processing','rendering',{renderStatus:'verifying'},'Finalizing video'],['failed','rendering',{},'Render failed']]){
  await evaluate(`window.job={id:'44444444-4444-4444-8444-444444444444',status:${JSON.stringify(status)},stage:${JSON.stringify(stage)},...${JSON.stringify(extra)},errorMessage:'Fixture failure',updatedAt:'2026-10-18',createdAt:'2026-10-18'};window.reopen()`);await wait(`document.querySelector('.studio-toolbar-status')?.textContent===${JSON.stringify(label)}`);check('truthful status '+label,true);
 }
 await evaluate(`window.job={id:'44444444-4444-4444-8444-444444444444',status:'processing',stage:'rendering',compositionReadyAt:'ready'};window.reopen()`);await wait(`!!document.querySelector('[aria-label="Scene caption overlay preview"]')&&!!document.querySelector('.studio-caption-properties select')`);
 check('caption controls live in Properties with preview in Stage',await evaluate(`!!document.querySelector('.studio-properties input[type=checkbox]')&&document.querySelectorAll('.studio-caption-properties select').length===5&&!!document.querySelector('.studio-stage [aria-label="Scene caption overlay preview"]')`));
 await click('Play');await wait('!!document.querySelector("[data-caption-cue]")');check('existing playback paints actual caption cue',await evaluate('document.querySelector("[data-caption-cue]").textContent.includes("violet forest")'));
 await click('Pause');await set('.studio-caption-properties select','bold');await wait('window.calls.some(c=>c[0]==="caption-style")');check('caption preset persists existing style payload',await evaluate('window.calls.find(c=>c[0]==="caption-style")[1].style.preset==="bold"'));
 await evaluate('document.querySelector(".studio-properties input[type=checkbox]").click()');await wait('window.calls.some(c=>c[0]==="caption")');check('caption preference retains existing action',await evaluate('window.calls.find(c=>c[0]==="caption")[1].enabled===false'));
 check('existing SRT and VTT exports retained',await evaluate('Array.from(document.querySelectorAll("a")).some(a=>a.href.includes("format=srt"))&&Array.from(document.querySelectorAll("a")).some(a=>a.href.includes("format=vtt"))'));
 await evaluate('window.job={id:"44444444-4444-4444-8444-444444444444",status:"completed",stage:"rendering"};window.reopen()');await wait(`!!document.querySelector('video[aria-label="Final generated video"]')`);check('completed video and download stay in Stage',await evaluate('!!document.querySelector(".studio-stage video")&&!!document.querySelector(".studio-stage a[download]")'));
 await evaluate('document.querySelector("video").play()');await wait('document.querySelector("video").currentTime>0');check('existing final playback works',true);
 check('no browser exceptions',errors.length===0);
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({checks,errors,limits:'Explicit identity, actions, media storage and workflow fixtures. No hosted execution.'},null,2));
 console.log(JSON.stringify({passed:checks.length,evidence:dir}));await call('Browser.close');
} finally {ws?.close();chrome.kill();await new Promise(r=>server.close(r))}
