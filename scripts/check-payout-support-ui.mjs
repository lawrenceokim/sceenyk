// Real components/CSS/Chrome. Server DTO, routing and HTTP are presentation
// fixtures; authorization and accounting are checked separately against SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-payout-support-ui-'));
const js=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{PayoutQueueView,PayoutDetailView,SupportUnavailable}from'./components/payout-support/views';
const id='11111111-1111-4111-8111-111111111111',now='2026-10-15T12:00:00Z';
const summary={id,creatorId:id,creatorName:'Creator with a long display name',requested:900,reserved:900,submitted:900,currency:'USD',status:'processing',requestedAt:now,holdUntil:now,processingAt:now,paidAt:null,ageMinutes:10090,providerStatus:'PROCESSING',lastAttemptAt:null,lastCheckedAt:null,lastOutcome:null,submissionAcknowledgedAt:null,reviewRequired:true};
const detail={found:true,withdrawal:summary,creatorBalance:{available:0,pending:900,paid:0,deficit:0},destination:'r***@e***',batchId:null,itemId:null,failureCode:null,history:{total:26,items:[{id,at:now,kind:'refund',amount:90,purchaseId:id,gross:100,fee:10}]},audit:{total:26,items:[{id,at:now,actorId:id,actorName:'Support operator',source:'support',action:'check_finished',attemptId:id,priorStatus:'processing',observedStatus:'PROCESSING',resultingStatus:'processing',outcome:'processing',reason:'provider_processing'}]},allocations:{total:26,originalTotal:900,remainingTotal:810,items:[{id,purchaseId:id,original:900,remaining:810,lotReversed:90,lotAvailable:0,lotOffset:0}]}};
window.calls=[];window.refreshes=0;window.fetch=async(url,options)=>{window.calls.push({url,options});return await new Promise(resolve=>{window.finishCheck=(message,ok=true)=>resolve({ok,json:async()=>({message})});});};
function App(){const[mode,setMode]=useState('queue'),[patch,setPatch]=useState({});window.fixture=(mode,patch={})=>{setMode(mode);setPatch(patch)};return <main className='mx-auto max-w-7xl p-4'>{mode==='queue'?<PayoutQueueView data={{total:13,page:1,pageSize:12,items:['pending','eligible','processing','paid','failed'].map((status,i)=>({...summary,id:id.slice(0,-1)+i,status}))}} query='Example query' status='review'/>:mode==='empty'?<PayoutQueueView data={{total:0,page:1,pageSize:12,items:[]}} query='' status='all'/>:mode==='unavailable'?<SupportUnavailable/>:<PayoutDetailView data={{...detail,...patch,withdrawal:{...summary,...patch.withdrawal}}} historyPage={1} auditPage={1} allocationPage={1}/>}</main>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'presentation-fixtures',setup(b){
  b.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',contents:args.path==='next/navigation'?`export const useRouter=()=>({refresh(){window.refreshes++}});`:`import React from 'react';export default function Link({prefetch,...p}){return <a {...p}/>}`,resolveDir:process.cwd()}));
}}]});
const css=fs.readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('.next/static/chunks/'+f,'utf8')).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js.outputFiles[0].text:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-inter:Arial;--font-geist-mono:monospace}</style></head><body class="bg-background text-foreground font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9365','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws,checks=0;const errors=[];
const check=(name,value)=>{assert.ok(value,name);checks++;};
try{
  let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch('http://127.0.0.1:9365/json')).json();break;}catch{await delay(100);}}
  assert.ok(tabs,'Chrome started');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  const pending=new Map();let sequence=0;
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error('CDP_FAILED'));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push('BROWSER_EXCEPTION');};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('FIXTURE_EVALUATION_FAILED');return r.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw Error('UI_CONDITION_TIMEOUT');};
  await call('Page.enable');await call('Runtime.enable');await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await wait("!!document.querySelector('#payout-search')");
  for(const mode of ['queue','detail']){
    await evaluate(`window.fixture(${JSON.stringify(mode)})`);await delay(60);
    for(const width of [320,390,768,1440])for(const dark of [false,true]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);await delay(60);
      check('responsive containment '+mode+width+dark,await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      check('headings visible '+mode+width+dark,await evaluate(mode==='queue'?"document.body.innerText.includes('Payout support')&&document.body.innerText.includes('Needs Review')":"document.body.innerText.includes('Accounting and reversal history')&&document.body.innerText.includes('Support and processing audit history')"));
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(dir,`${mode}-${width}-${dark?'dark':'light'}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  check('masked recipient and original timestamps',await evaluate("document.body.innerText.includes('r***@e***')&&!document.body.innerText.includes('recipient@example.test')&&document.body.innerText.includes('Unknown')&&document.body.innerText.includes('WAT')"));
  check('missing reference explanation',await evaluate("document.body.innerText.includes('Provider reference missing. Manual provider investigation required.')"));
  check('allocation/reversal/audit detail and independent pagination',await evaluate("document.body.innerText.includes('remaining backing')&&document.body.innerText.includes('platform fee reversal')&&document.body.innerText.toLowerCase().includes('support operator')&&['historyPage=2','auditPage=2','allocationPage=2'].every(v=>Array.from(document.links).some(a=>a.href.includes(v)))"));
  check('only check status financial action',await evaluate("Array.from(document.querySelectorAll('button')).filter(b=>b.innerText==='Check PayPal Status').length===1&&!/Mark Paid|Mark Failed|Resend|Retry payout|Restore funds|Edit amount|Shorten hold/.test(document.body.innerText)"));
  await evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Check PayPal Status');b.click();b.click()})()");await wait('window.calls.length===1');
  check('duplicate clicks are blocked during request',await evaluate("window.calls.length===1&&Array.from(document.querySelectorAll('button')).some(b=>b.innerText==='Checking…'&&b.disabled)"));
  check('client submits only withdrawal identity',await evaluate("window.calls[0].url==='/api/admin/payouts/reconcile'&&Object.keys(JSON.parse(window.calls[0].options.body)).join()==='withdrawalId'"));
  await evaluate("window.finishCheck('Provider confirms Paid.')");await wait('window.refreshes===1');check('status outcome announced',await evaluate("Array.from(document.querySelectorAll('[role=status]')).some(e=>e.innerText==='Provider confirms Paid.'&&e.getAttribute('aria-live')==='polite')"));
  for(const status of ['pending','eligible']){await evaluate(`window.fixture('detail',{withdrawal:{status:${JSON.stringify(status)}}})`);await delay(30);check(status+' disabled',await evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.innerText==='Check PayPal Status'&&b.disabled)"));}
  await evaluate("window.fixture('detail',{withdrawal:{status:'paid',providerStatus:'RETURNED'}})");await delay(30);check('Paid returned preserves paid record explanation',await evaluate("document.body.innerText.includes('The original Paid record is preserved')"));
  await evaluate("window.fixture('queue')");await wait("!!document.getElementById('payout-search')");
  check('search/status labels and minimum targets',await evaluate("['payout-search','payout-status'].every(id=>document.querySelector('label[for='+id+']')&&document.getElementById(id).getBoundingClientRect().height>=44)"));
  check('query/status survive pagination',await evaluate("Array.from(document.links).some(a=>a.href.includes('query=Example+query')&&a.href.includes('status=review')&&a.href.includes('page=2'))"));
  await evaluate("document.getElementById('payout-search').focus()");await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});check('keyboard reaches status filter',await evaluate("document.activeElement.id==='payout-status'"));
  await evaluate("window.fixture('empty')");await wait("document.body.innerText.includes('No withdrawals match')");check('empty state clear filters',await evaluate("Array.from(document.links).some(a=>a.innerText==='Clear filters')"));
  await evaluate("window.fixture('unavailable')");await wait("document.body.innerText.includes('Payout support is unavailable')");check('unavailable state safe and actionable',await evaluate("document.querySelector('[role=alert]').innerText.includes('Refresh')"));
  check('no browser exceptions',errors.length===0);
  console.log(JSON.stringify({checks,passed:true,evidence:'real Chrome/components/CSS; explicit DTO/router/HTTP fixtures',screenshots:dir}));await call('Browser.close');
}finally{ws?.close();chrome.kill();await new Promise(resolve=>server.close(resolve));}

