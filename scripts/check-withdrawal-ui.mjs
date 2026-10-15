// Actual component/Base UI/CSS in real Chrome; account/actions/router are
// explicit presentation fixtures. No Clerk, database or PayPal acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-withdrawal-ui-'));
const js=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{WithdrawalPanel}from'./components/marketplace/withdrawal-panel';
const now='2026-10-15T12:00:00Z';const initial={currency:'USD',email:'creator@example.test',available:2000,deficit:0,pending:0,paid:0,total:5,history:['pending','eligible','processing','paid','failed'].map((status,i)=>({id:'fixture-'+i,requested:500,amount:500,status,requestedAt:now,holdUntil:'2026-10-22T12:00:00Z',paidAt:status==='paid'?now:null,failureMessage:status==='failed'?'Refund adjustments reduced this withdrawal below $5. Remaining valid funds were returned to available earnings.':null}))};
window.requests=[];window.saves=[];window.fixtureWithdraw=async input=>{window.requests.push(input);return{ok:true}};window.fixtureSave=async input=>{window.saves.push(input);return{ok:true}};
function App(){const[account,setAccount]=useState(initial);window.setFixtureAccount=(patch)=>setAccount(a=>({...a,...patch}));return <main className='mx-auto max-w-5xl space-y-5 p-4'><h1 className='text-3xl font-bold'>Creator earnings</h1><WithdrawalPanel account={account} page={1} clerkUserId='fixture_creator' onChanged={async()=>{const r=window.requests.at(-1);if(r)setAccount(a=>({...a,available:2000-r.amountMinor,pending:r.amountMinor}));}}/></main>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'explicit-ui-fixtures',setup(b){
  b.onResolve({filter:/^(next\/navigation|next\/link|@\/app\/actions\/creator-withdrawals)$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',contents:args.path==='next/navigation'?`export const useRouter=()=>({refresh(){}});`:args.path==='next/link'?`import React from 'react';export default function Link(p){return <a {...p}/>}`:`export const payoutDestinationAction=i=>window.fixtureSave(i);export const withdrawalRequestAction=i=>window.fixtureWithdraw(i);`,resolveDir:process.cwd()}));
}}]});
const css=fs.readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('.next/static/chunks/'+f,'utf8')).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js.outputFiles[0].text:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-inter:Arial;--font-geist-mono:monospace}</style></head><body class="bg-background text-foreground font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9364','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws,checks=0;const errors=[];
const check=(name,value)=>{assert.ok(value,name);checks++;};
try{
  let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch('http://127.0.0.1:9364/json')).json();break;}catch{await delay(100);}}
  assert.ok(tabs,'Chrome started');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  const pending=new Map();let sequence=0;
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error('CDP_FAILED'));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push('BROWSER_EXCEPTION');};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('FIXTURE_EVALUATION_FAILED');return r.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw Error('UI_CONDITION_TIMEOUT');};
  await call('Page.enable');await call('Runtime.enable');await call('Page.navigate',{url:origin});await wait("!!document.querySelector('#withdrawal-amount')");
  for(const width of [320,390,1440])for(const dark of [false,true]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);await delay(60);
    check('responsive containment '+width+' '+dark,await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    check('hold and lifecycle visible '+width+' '+dark,await evaluate("document.body.innerText.includes('Withdrawals are held for 7 days before payout.')&&['Pending','Eligible','Processing','Paid','Failed'].every(s=>document.body.innerText.includes(s))"));
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(dir,`withdrawal-${width}-${dark?'dark':'light'}.png`),Buffer.from(shot.data,'base64'));
  }
  await evaluate('window.setFixtureAccount({available:499})');await delay(30);check('under five dollars disables withdrawal',await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Withdraw').disabled"));
  await evaluate('window.setFixtureAccount({available:500})');await delay(30);check('five dollars enables withdrawal',await evaluate("!Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Withdraw').disabled"));
  await evaluate('window.setFixtureAccount({available:2000})');
  const fill=async(value)=>{await evaluate(`(()=>{const el=document.querySelector('#withdrawal-amount');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(30);};
  await fill('4.99');await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Withdraw').click()");await delay(30);check('invalid amount makes no server request',await evaluate('window.requests.length===0'));
  await fill('15.00');await evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Withdraw');b.click();b.click();})()");await wait('window.requests.length===1');await delay(50);
  check('double click submits one stable request',await evaluate("window.requests.length===1&&window.requests[0].amountMinor===1500&&typeof window.requests[0].requestId==='string'"));
  check('available and pending refresh immediately',await evaluate("document.body.innerText.includes('$5.00')&&document.body.innerText.includes('$15.00')"));
  check('inputs have associated labels and minimum target',await evaluate("['payout-email','withdrawal-amount'].every(id=>document.querySelector('label[for='+id+']')&&document.getElementById(id).getBoundingClientRect().height>=44)"));
  await evaluate("document.getElementById('payout-email').focus()");await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  check('keyboard reaches save action',await evaluate("document.activeElement.innerText==='Save payout email'"));
  check('no internal provider IDs rendered',await evaluate("!document.body.innerText.includes('paypal_batch_id')&&!document.body.innerText.includes('sender_batch_id')"));
  check('safe refund failure explanation preserved',await evaluate("document.body.innerText.includes('Refund adjustments reduced this withdrawal below $5. Remaining valid funds were returned to available earnings.')"));
  check('creator interface contains no internal failure diagnostics',! /failureCode|REFUND_BELOW_MINIMUM/.test(js.outputFiles[0].text));
  check('no browser exceptions',errors.length===0);
  console.log(JSON.stringify({checks,passed:true,evidence:'real Chrome/component/CSS with explicit account/action fixtures',screenshots:dir}));
  await call('Browser.close');
}finally{ws?.close();chrome.kill();await new Promise(resolve=>server.close(resolve));}
