// Actual React components and built CSS in Chrome. Identity/actions/data are
// explicit presentation fixtures; this is not real two-user/hosted acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-creator-ui-'));
const source=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CreatorStorefront}from'./components/marketplace/creator-storefront';import{CreatorProfileEditor}from'./components/marketplace/creator-profile-editor';import{MarketplaceLoading,MarketplaceFailure}from'./components/marketplace/listing-card';
const profile={slug:'public-creator-with-a-stable-readable-slug',displayName:'Creator with a long public display name',bio:'A short public creative biography. Bring your own stories and ideas.',avatarUrl:null,creatorSince:'2026-10-15T12:00:00Z'};
const listing={id:'11111111-1111-4111-8111-111111111111',title:'A reusable creative story template',description:'Use your own subject and ideas.',creatorName:profile.displayName,creatorSlug:profile.slug,creatorAvatar:null,category:'cinematic',tags:['story'],template:{version:1,category:'cinematic',instructions:'Use your own idea.',settings:{aspectRatio:'16:9',duration:'10',visualStyle:'Original',tone:'Storytelling'}},adoptionType:'free',priceMinor:0,currency:'USD',status:'published',createdAt:profile.creatorSince,publishedAt:profile.creatorSince,estimate:null};
window.saveCalls=[];window.profile=profile;
function App(){const[mode,setMode]=useState('storefront');window.fixture=m=>setMode(m);return <main className='sceenyk-container py-8'>{mode==='storefront'||mode==='empty'?<CreatorStorefront data={{profile,adoptionCount:mode==='empty'?0:4,total:mode==='empty'?0:13,items:mode==='empty'?[]:[listing],page:1,pageSize:12}}/>:mode==='editor'||mode==='setup'?<CreatorProfileEditor key={mode} clerkUserId='fixture-owner' profile={mode==='setup'?null:profile}/>:mode==='loading'?<MarketplaceLoading/>:<MarketplaceFailure/>}</main>};createRoot(document.getElementById('root')).render(<App/>);`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'presentation',setup(b){
 b.onResolve({filter:/^next\/(link|image)$|^@clerk\/nextjs$|^@\/app\/actions\/creator-profile$|^@\/components\/account-action$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/link'?`import React from'react';export default function Link({prefetch,...p}){return <a {...p}/>}`:args.path==='next/image'?`import React from'react';export default function Image({unoptimized,...p}){return <img {...p}/>}`:args.path==='@clerk/nextjs'?`export const useAuth=()=>({isLoaded:true,userId:'fixture-owner'});`:args.path==='@/components/account-action'?`import React from'react';export const AccountAction=({children})=><button>{children}</button>;`:`export const saveCreatorProfileAction=async input=>{window.saveCalls.push(input);return new Promise(resolve=>{window.finishSave=resolve})};export const removeCreatorAvatarAction=async()=>({ok:true,profile:window.profile});`}));
}}]});
const css=fs.readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('.next/static/chunks/'+f,'utf8')).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-inter:Arial;--font-geist-mono:monospace}</style></head><body class="bg-background text-foreground font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9371','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;let count=0;const errors=[];const check=(name,value)=>{assert.ok(value,name);count++;};
try{
 let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch('http://127.0.0.1:9371/json')).json();break;}catch{await delay(100);}}
 assert.ok(tabs);ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let sequence=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error('CDP_FAILED'));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push('BROWSER_EXCEPTION');};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('EVALUATION_FAILED');return r.result.value;};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw Error('UI_TIMEOUT');};
 await call('Page.enable');await call('Runtime.enable');await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await wait('!!document.querySelector("#creator-items")');
 for(const mode of ['storefront','editor']){
  await evaluate(`window.fixture('${mode}')`);await wait(mode==='editor'?'!!document.querySelector("input[name=displayName]")':'!!document.querySelector("#creator-items")');
  for(const width of [1440,768,390,320])for(const dark of [false,true]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);await delay(30);
   check(mode+' fits '+width+' '+dark,await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
   if((width===1440&&!dark)||(width===390&&dark)){const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(dir,mode+'-'+width+'-'+dark+'.png'),Buffer.from(shot.data,'base64'));}
  }
 }
 check('slug read-only after setup',await evaluate('document.querySelector("input[name=slug]").readOnly'));
 check('public fields have labels',await evaluate('[...document.querySelectorAll("input,textarea")].every(e=>!!document.querySelector(`label[for="${e.id}"]`))'));
 await evaluate('document.querySelector("input[name=displayName]").focus()');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});check('keyboard reaches bio',await evaluate('document.activeElement.name==="bio"'));
 await evaluate('document.querySelector("form").requestSubmit()');await wait('window.saveCalls.length===1');check('save disabled while pending',await evaluate('document.querySelector("fieldset").disabled'));
 await evaluate('document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');check('duplicate save blocked',await evaluate('window.saveCalls.length===1'));
 await evaluate('window.finishSave({ok:false,message:"This public URL is unavailable. Choose a different slug."})');await wait('document.body.innerText.includes("This public URL is unavailable")');check('save error announced',await evaluate('document.querySelector("[role=status]").textContent.includes("unavailable")'));
 await evaluate('document.querySelector("form").requestSubmit()');await wait('window.saveCalls.length===2');await evaluate('window.finishSave({ok:true,profile:window.profile})');await wait('document.body.innerText.includes("Public profile saved.")');check('successful save announced',await evaluate("Array.from(document.links).some(a=>a.getAttribute('href')?.startsWith('/marketplace/creators/'))"));
 await evaluate('window.fixture("setup")');await wait('!!document.querySelector("input[name=slug]")&&!document.querySelector("input[name=slug]").readOnly');check('initial slug choice enabled',await evaluate('!document.querySelector("input[name=slug]").readOnly'));
 check('avatar requires profile setup',await evaluate('document.querySelector("input[name=avatar]").matches(":disabled")'));
 await evaluate('window.fixture("storefront")');await wait('!!document.querySelector("#creator-items")');check('creator and detail links stay in Marketplace',await evaluate("Array.from(document.links).some(a=>a.getAttribute('href')?.startsWith('/marketplace/creators/'))&&Array.from(document.links).some(a=>a.getAttribute('href')==='/marketplace/11111111-1111-4111-8111-111111111111')"));
 check('no nested interactive links',await evaluate('!document.querySelector("a a")'));
 check('no financial or social controls',await evaluate('![...document.querySelectorAll("button,a")].some(e=>/^(earnings|withdraw|revenue|follow|comment|reviews?)(?:\\s|$)/i.test(e.innerText))'));
 await evaluate('window.fixture("empty")');await wait('document.body.innerText.includes("This creator has no published Marketplace items yet.")');check('empty state has no listing cards',await evaluate('document.querySelectorAll("article").length===0'));
 await evaluate('window.fixture("loading")');await wait('!!document.querySelector("[aria-busy=true]")');check('loading announces status',await evaluate('!!document.querySelector("[role=status]")'));
 await evaluate('window.fixture("error")');await wait('!!document.querySelector("[role=alert]")');check('error state offers reload',await evaluate('document.querySelector("[role=alert]").innerText.includes("Reload listings")'));
 check('no browser exceptions',errors.length===0);await call('Browser.close');console.log(JSON.stringify({passed:count,evidence:'Chrome/components/CSS; explicit presentation/auth/action fixtures',screenshots:dir}));
}finally{ws?.close();chrome.kill();await new Promise(resolve=>server.close(resolve));}
