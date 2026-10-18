// Real built app/Clerk, isolated job-state presentation fixtures. No generation
// admission, provider call or accounting write. Hosted persistence is separate.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
const require=createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sceenyk-analysis-ui-"));
const fixture=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),"sceenyk-hosted-identity-fixture.json"),"utf8"));
const hosted=process.argv.includes("--hosted");
const visuals=process.argv.includes("--visuals");
const preparation=process.argv.includes("--preparation");
const hostedResult=hosted?JSON.parse(fs.readFileSync(path.join(os.tmpdir(),preparation?"sceenyk-preparation-acceptance.json":visuals?"sceenyk-fal-acceptance.json":"sceenyk-hosted-analysis.json"),"utf8")):null;
if (hosted && visuals) fixture.clerkUserId=hostedResult.clerkUserId;
const failure=process.argv.includes("--failure");
const readyLabel=failure?"Generation failed":visuals?"Visuals ready":"Production plan ready";
const backend=require("@clerk/backend").createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,publishableKey:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});
const chrome=spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=9341","--user-data-dir="+path.join(dir,"profile"),"about:blank"],{windowsHide:true,stdio:"ignore"});
const checks=[],errors=[];let ws;
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log(JSON.stringify({passed:name}));};
try{
  assert.equal((await backend.instance.get()).environmentType,"development");
  let tabs;for(let n=0;n<60;n++){try{tabs=await(await fetch("http://127.0.0.1:9341/json")).json();break;}catch{await delay(100);}}
  ws=new WebSocket(tabs.find(t=>t.type==="page").webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let sequence=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(new Error(m.error.message));else p.resolve(m.result);}else if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.text);};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async(expression)=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error("Browser evaluation failed");return r.result.value;};
  const wait=async(expression)=>{for(let n=0;n<450;n++){try{if(await evaluate(expression))return;}catch{}await delay(100);}fs.writeFileSync(path.join(dir,"failure-page.txt"),await evaluate("document.body.innerText"));throw new Error("Browser condition timed out: "+expression.slice(0,100)+"; diagnostics: "+dir);};
  const navigate=async(route)=>{await call("Page.navigate",{url:"http://localhost:3001"+route});await wait("document.readyState!=='loading'&&location.pathname==="+JSON.stringify(route));};
  await call("Page.enable");await call("Runtime.enable");
  await navigate("/");await wait("!!window.Clerk?.loaded");
  const user=await backend.users.getUser(fixture.clerkUserId);assert.ok(user.emailAddresses.some(e=>e.emailAddress.includes("+clerk_test@")));
  const ticket=await backend.signInTokens.createSignInToken({userId:fixture.clerkUserId,expiresInSeconds:60});
  await evaluate(`(async()=>{const r=await window.Clerk.client.signIn.create({strategy:'ticket',ticket:${JSON.stringify(ticket.token)}});await window.Clerk.setActive({session:r.createdSessionId});})()`);
  await wait("window.Clerk.user?.id==="+JSON.stringify(fixture.clerkUserId));await delay(2500);
  const manifest=JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json","utf8"));
  const action=Object.entries(manifest.node).find(([,v])=>v.exportedName==="latestGenerationAction")?.[0];assert.ok(action);
  const project=hostedResult?.projectId??"f38ccbee-7c61-4d40-941d-de1a0cbf7f71";
  const job={id:"455c7d0e-82d4-4fbc-ae77-97a7aa3d9f4b",requestId:"155c7d0e-82d4-4fbc-ae77-97a7aa3d9f4b",projectId:project,status:"processing",dispatchStatus:"claimed",stage:"planning",productionPlanReadyAt:"2028-01-01T00:00:00Z",input:{version:1,prompt:"UI presentation fixture",category:"cinematic",settings:{duration:"10",aspectRatio:"16:9",visualStyle:"Original",tone:"Storytelling"},assetIds:[]},errorCode:null,errorMessage:null,startedAt:"2028-01-01T00:00:00Z",completedAt:null,failedAt:null,createdAt:"2028-01-01T00:00:00Z",updatedAt:"2028-01-01T00:00:00Z"};
  if(!hosted)await call("Page.addScriptToEvaluateOnNewDocument",{source:`(()=>{window.__analysisJob=${JSON.stringify(job)};const original=window.fetch;window.fetch=async function(resource,options){const r=await original.apply(this,arguments);if(new Headers(options?.headers).get('Next-Action')!==${JSON.stringify(action)})return r;const body=await r.text();const lines=body.split(String.fromCharCode(10));for(let i=0;i<lines.length;i++){const at=lines[i].indexOf(':');try{const v=JSON.parse(lines[i].slice(at+1));if(v?.ok!==undefined){lines[i]=lines[i].slice(0,at+1)+JSON.stringify({ok:true,value:window.__analysisJob});break;}}catch{}}return new Response(lines.join(String.fromCharCode(10)),{status:r.status,headers:{'Content-Type':'text/x-component'}});};})()`});
  if (visuals && !hosted) await call("Page.addScriptToEvaluateOnNewDocument",{source:"window.__analysisJob={...window.__analysisJob,stage:'generating',visualsReadyAt:'2028-01-01T00:00:00Z',visualsPendingAt:null}"});
  await navigate("/projects/"+project);await wait("document.body.innerText.includes("+JSON.stringify(readyLabel)+")");
  check(hosted?"real hosted job readiness appears for owner":"ready state uses persisted-job DTO presentation",true);
  const preparedPath=preparation?'/api/media/prepared?'+new URLSearchParams({projectId:project,sceneId:hostedResult.segmentSceneId}):null;
  if(preparation){
    const owned=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(preparedPath)});const a=await r.json();return {status:r.status,id:a.id,durationMs:a.durationMs,expires:a.url?new URL(a.url).searchParams.get('X-Amz-Expires'):null,cache:r.headers.get('Cache-Control')};})()`);
    check('real Clerk owner can resolve prepared segment through authenticated route',owned.status===200&&owned.id===hostedResult.segmentId&&owned.durationMs===5000&&owned.expires==='900'&&owned.cache.includes('no-store'));
    check('browser cannot add source keys or timestamps to prepared read',await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(preparedPath+'&storageKey=arbitrary&startMs=0')});return r.status===404;})()`));
  }
  check("no fabricated completed video or raw plan JSON",await evaluate("!document.body.innerText.includes('schemaVersion')&&!document.body.innerText.includes('Generation completed')"));
  const refresh=async()=>{await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Check generation status').click()");await wait("!document.body.innerText.includes('Checking status…')");};
  if(!hosted && visuals){
    await evaluate("window.__analysisJob={...window.__analysisJob,visualsReadyAt:null,updatedAt:new Date(Date.now()+86400000000).toISOString()}");await refresh();await wait("document.body.innerText.includes('Generating visuals')");check("honest visual generation label",true);
    await evaluate("window.__analysisJob={...window.__analysisJob,visualsPendingAt:new Date().toISOString(),updatedAt:new Date(Date.now()+86400000001).toISOString()}");await refresh();await wait("document.body.innerText.includes('Visual scenes need attention')");check("unsupported or uncertain scenes remain pending",true);
    await evaluate("window.__analysisJob={...window.__analysisJob,visualsPendingAt:null,visualsReadyAt:new Date().toISOString(),updatedAt:new Date(Date.now()+86400000002).toISOString()}");await refresh();await wait("document.body.innerText.includes('Visuals ready')");
  } else if(!hosted){
    for(const stage of ["analyzing","planning"]){await evaluate(`window.__analysisJob={...window.__analysisJob,productionPlanReadyAt:null,stage:${JSON.stringify(stage)},updatedAt:new Date(Date.now()+86400000000).toISOString()}`);await refresh();await wait("document.body.innerText.includes("+JSON.stringify(stage==="analyzing"?"Analyzing your media":"Planning your content")+")");check("honest "+stage+" label",true);}
    await evaluate("window.__analysisJob={...window.__analysisJob,productionPlanReadyAt:new Date().toISOString(),updatedAt:new Date(Date.now()+86400000001).toISOString()}");await refresh();await wait("document.body.innerText.includes('Production plan ready')");
  }else{
    await refresh();check("explicit refresh retains hosted readiness",await evaluate("document.body.innerText.includes("+JSON.stringify(readyLabel)+")"));
    await call("Page.reload",{ignoreCache:true});await wait("document.body.innerText.includes("+JSON.stringify(readyLabel)+")");check("full reload retains hosted readiness",true);
    await navigate("/dashboard");await wait("document.body.innerText.includes('Your projects')");await navigate("/projects/"+project);await wait("document.body.innerText.includes("+JSON.stringify(readyLabel)+")");check("leave and reopen retains hosted readiness",true);
  }
  for(const width of [1440,390,320]){await call("Emulation.setDeviceMetricsOverride",{width,height:960,deviceScaleFactor:1,mobile:width<768});for(const dark of [false,true]){await evaluate("document.documentElement.classList.toggle('dark',"+dark+")");await delay(150);check("ready plan fits "+width+" "+(dark?"dark":"light"),await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));await evaluate("document.querySelector('section[aria-label=\"Project generation\"]').scrollIntoView({block:'start',behavior:'instant'})");await delay(150);if(width===320){const shot=await call("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(dir,"ready-320-"+(dark?"dark":"light")+".png"),Buffer.from(shot.data,"base64"));}}}
  await evaluate("Array.from(document.querySelectorAll('section[aria-label=\"Project generation\"] button')).find(b=>b.textContent.trim()==='Check generation status').focus()");check("status refresh remains keyboard focusable",await evaluate("document.activeElement?.textContent.includes('Check generation status')"));
  if(hosted){
    const second=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),"sceenyk-hosted-identity-fixture-2.json"),"utf8"));
    assert.notEqual(second.clerkUserId,fixture.clerkUserId);
    assert.ok((await backend.users.getUser(second.clerkUserId)).emailAddresses.some(e=>e.emailAddress.includes("+clerk_test@")));
    const otherTicket=await backend.signInTokens.createSignInToken({userId:second.clerkUserId,expiresInSeconds:60});
    await evaluate("window.Clerk.signOut()");await navigate("/");await wait("!!window.Clerk?.loaded");
    await evaluate(`(async()=>{const r=await window.Clerk.client.signIn.create({strategy:'ticket',ticket:${JSON.stringify(otherTicket.token)}});await window.Clerk.setActive({session:r.createdSessionId});})()`);await wait("window.Clerk.user?.id==="+JSON.stringify(second.clerkUserId));await delay(1500);
    await navigate("/projects/"+project);await wait("document.body.innerText.includes('Project unavailable')");
    check("second real Clerk account cannot open owned plan project",await evaluate("!document.body.innerText.includes('Production plan ready')&&!document.body.innerText.includes('Gemini synthetic media acceptance')"));
    await navigate("/studio");await wait("location.pathname==='/studio'&&!!document.querySelector('textarea')");
    const denied=await evaluate(`(async()=>{const r=await fetch(location.pathname,{method:'POST',headers:{'Next-Action':${JSON.stringify(action)},Accept:'text/x-component','Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify([${JSON.stringify(project)}])});return await r.text();})()`);
    check("second account cannot read owned generation through action",!denied.includes(hostedResult.jobId)&&!denied.includes('productionPlanReadyAt'));
    if(preparation)check('real Clerk User B cannot resolve User A prepared segment',await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(preparedPath)});return r.status===404&&!(await r.text()).includes(${JSON.stringify(hostedResult.segmentId)});})()`));
  }
  check("no uncaught browser exceptions",errors.length===0);
  fs.writeFileSync(path.join(os.tmpdir(),preparation?'sceenyk-preparation-hosted-ui.json':visuals?(hosted?"sceenyk-visual-hosted-ui.json":"sceenyk-visual-ui.json"):(hosted?"sceenyk-analysis-hosted-ui.json":"sceenyk-analysis-ui.json")),JSON.stringify({passed:checks.length,checks,artifacts:dir,scope:hosted?"real hosted job and Clerk A/B; no mocked responses":"job presentation fixtures; real Clerk; no hosted persistence claim"},null,2));
  console.log(JSON.stringify({passed:checks.length,artifacts:dir}));await call("Browser.close");
}finally{ws?.close();chrome.kill();}
