// Real isolated Chrome/Clerk acceptance helper. No mocked browser responses.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createClerkClient } from '@clerk/backend';

export async function deployedBrowser(origin, identities, work) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-render-cloud-browser-'));
  const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9357','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws,closed=false;const errors=[],exceptions=[],actions={};let currentRoute='unknown';
  try {
    let tabs;for(let n=0;n<100;n++){try{tabs=await(await fetch('http://127.0.0.1:9357/json')).json();break;}catch{await delay(100);}}
    assert.ok(tabs,'CHROME_AVAILABLE');
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let sequence=0;const pending=new Map();
    ws.onmessage=e=>{
      const m=JSON.parse(e.data);
      if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error('CDP_FAILED'));else p?.resolve(m.result);}
      else if(m.method==='Page.frameNavigated'&&!m.params.frame.parentId){try{currentRoute=new URL(m.params.frame.url).pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27}/gi,':id');}catch{currentRoute='unknown';}}
      else if(m.method==='Runtime.exceptionThrown'){
        errors.push('BROWSER_EXCEPTION');
        const detail=m.params.exceptionDetails,exception=detail.exception;
        let message=(exception?.description??detail.text??'Unknown browser exception').split('\n')[0];
        for(const [name,value] of Object.entries(process.env))if(/SECRET|TOKEN|API_KEY|SIGNING_KEY|ACCESS_KEY|FAL_KEY/.test(name)&&value?.length>8)message=message.replaceAll(value,'[redacted]');
        message=message.replace(/https?:\/\/[^\s)]+/g,'[url]').replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,'[token]').replace(/X-Amz-[^\s]+/gi,'[capability]').replace(/[a-f0-9]{8}-[a-f0-9-]{27}/gi,'[id]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]').slice(0,240);
        const frame=detail.stackTrace?.callFrames?.[0],url=frame?.url??detail.url??'';
        exceptions.push({name:exception?.className??'Error',message,source:url.startsWith(origin)?'application':/clerk/i.test(url)?'identity':url?'external':'evaluation',route:currentRoute});
      }
    };
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('BROWSER_EVALUATION_FAILED');return r.result.value;};
    const wait=async expression=>{for(let n=0;n<500;n++){try{if(await evaluate(expression))return;}catch{}await delay(100);}throw new Error('BROWSER_CONDITION_TIMEOUT');};
    const navigate=async route=>{await call('Page.navigate',{url:origin+route});await wait("document.readyState!=='loading'&&location.pathname==="+JSON.stringify(route));};
    await call('Page.enable');await call('Runtime.enable');
    const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,publishableKey:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});
    assert.equal((await clerk.instance.get()).environmentType,'development');
    const signIn=async which=>{
      await navigate('/');await wait('!!window.Clerk?.loaded');
      if(await evaluate('!!window.Clerk.user')){await evaluate('window.Clerk.signOut()');await navigate('/');await wait('!!window.Clerk?.loaded');}
      const who=identities[which],user=await clerk.users.getUser(who);
      assert.ok(user.emailAddresses.some(e=>e.emailAddress.includes('+clerk_test@')),'RESERVED_TEST_IDENTITY');
      const ticket=await clerk.signInTokens.createSignInToken({userId:who,expiresInSeconds:60});
      await evaluate(`(async()=>{const r=await window.Clerk.client.signIn.create({strategy:'ticket',ticket:${JSON.stringify(ticket.token)}});await window.Clerk.setActive({session:r.createdSessionId});})()`);
      await wait('window.Clerk.user?.id==='+JSON.stringify(who));await delay(1800);
    };
    const discover=async()=>{
      const urls=await evaluate("Array.from(document.scripts).map(s=>s.src).filter(s=>s.startsWith(location.origin+'/_next/'))");
      for(const url of urls){const r=await fetch(url);assert.equal(r.status,200);const body=await r.text();for(const m of body.matchAll(/"([a-f0-9]{40,42})"[^;]{0,220}?"([a-zA-Z]+Action)"/g))actions[m[2]]=m[1];}
    };
    const invoke=async(name,input)=>{
      assert.ok(actions[name],'DEPLOYED_ACTION_'+name);
      return evaluate(`(async()=>{const r=await fetch(location.pathname,{method:'POST',headers:{'Next-Action':${JSON.stringify(actions[name])},Accept:'text/x-component','Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify([${JSON.stringify(input)}])});const body=await r.text();for(const line of body.split(String.fromCharCode(10))){try{const v=JSON.parse(line.slice(line.indexOf(':')+1));if(v?.ok!==undefined)return v;}catch{}}return {ok:false,status:r.status};})()`);
    };
    const close=async()=>{if(!closed){closed=true;await call('Browser.close');}};
    return await work({call,evaluate,wait,navigate,signIn,discover,invoke,close,dir,errors,exceptions});
  } finally {
    if(ws?.readyState===1){if(!closed)ws.send(JSON.stringify({id:999999,method:'Browser.close'}));ws.close();}
    chrome.kill();
  }
}
