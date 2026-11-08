// GET-only fresh guest browser diagnostic. No saved session, worker or generation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const origin = new URL(process.argv[2] ?? 'http://localhost:3011');
if (!['localhost','127.0.0.1'].includes(origin.hostname) || origin.protocol !== 'http:') throw Error('LOCAL_DIAGNOSTIC_ONLY');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-studio-load-'));
const chrome=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+path.join(root,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
 const portFile=path.join(root,'profile','DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(portFile);i++)await delay(100);
 const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let seq=0;const pending=new Map(),requests={},hmr={},navigation=[],errors=[],reloads=[],responses={};let blocked=0;
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result);return;}
  const p=m.params;
  if(m.method==='Fetch.requestPaused'){
   if(!['GET','HEAD','OPTIONS'].includes(p.request.method)){blocked++;void call('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'});}else void call('Fetch.continueRequest',{requestId:p.requestId});
  }
  if(m.method==='Network.requestWillBeSent'){
   const url=new URL(p.request.url);const route=url.origin===origin.origin?url.pathname:url.hostname.endsWith('clerk.accounts.dev')?'CLERK':url.protocol;
   const key=p.request.method+' '+route;requests[key]=(requests[key]??0)+1;
   if(p.type==='Document')navigation.push({reason:'document',initiator:p.initiator.type,functions:p.initiator.stack?.callFrames.map(f=>f.functionName).slice(0,8)});
  }
  if(m.method==='Page.frameRequestedNavigation')navigation.push({reason:p.reason});
  if(m.method==='Network.responseReceived' && p.type==='Document')responses[p.response.status]=(responses[p.response.status]??0)+1;
  if(m.method==='Network.webSocketFrameSent'){try{const data=JSON.parse(p.response.payloadData);if(/reload/.test(data.event??''))reloads.push({event:data.event,stackFunctions:data.stackTrace?.split('\n').filter(s=>s.trim().startsWith('at ')).map(s=>s.replace(/\(.*/, '').trim()).slice(0,6)});}catch{/* No private payloads are retained. */}}
  if(m.method==='Network.webSocketFrameReceived'){try{const data=JSON.parse(p.response.payloadData);const key=data.type??data.action??'other';hmr[key]=(hmr[key]??0)+1;}catch{/* Non-HMR traffic is not inspected. */}}
  if(m.method==='Runtime.exceptionThrown')errors.push({text:p.exceptionDetails.text,name:p.exceptionDetails.exception?.className});
 };
 await call('Page.enable');await call('Network.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 await call('Page.navigate',{url:origin.origin+'/studio'});
 await delay(45000);
 const state=await call('Runtime.evaluate',{expression:'JSON.stringify({path:location.pathname,editor:!!document.querySelector("textarea"),skeleton:!!document.querySelector("[data-slot=skeleton]"),loaded:document.readyState})',returnByValue:true});
 console.info(JSON.stringify({requests,hmr,navigation,reloads,responses,errors,blocked,state:JSON.parse(state.result.value??'null')},null,2));
}finally{ws?.close();chrome.kill();await delay(300);if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('sceenyk-studio-load-'))throw Error('DIAGNOSTIC_CLEANUP_SCOPE');fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
