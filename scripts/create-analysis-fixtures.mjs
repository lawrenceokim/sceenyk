// Non-sensitive synthetic media for real Gemini acceptance. Actual verified
// Clerk -> project/media actions -> private R2 PUT -> server finalization.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const require=createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sceenyk-analysis-fixtures-"));
const fixture=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),"sceenyk-hosted-identity-fixture.json"),"utf8"));
const backend=require("@clerk/backend").createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,publishableKey:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});
const chrome=spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=9342","--user-data-dir="+path.join(dir,"profile"),"about:blank"],{windowsHide:true,stdio:"ignore"});
let ws;
try{
  assert.equal((await backend.instance.get()).environmentType,"development");
  let tabs;for(let n=0;n<60;n++){try{tabs=await(await fetch("http://127.0.0.1:9342/json")).json();break;}catch{await delay(100);}}
  ws=new WebSocket(tabs.find(t=>t.type==="page").webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let sequence=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(new Error("CDP failed"));else p.resolve(m.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async(expression)=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error("Browser evaluation failed");return r.result.value;};
  const wait=async(expression)=>{for(let n=0;n<450;n++){try{if(await evaluate(expression))return;}catch{}await delay(100);}throw new Error("Browser condition timed out");};
  await call("Page.enable");await call("Runtime.enable");await call("Page.navigate",{url:"http://localhost:3001/"});await wait("!!window.Clerk?.loaded");
  const user=await backend.users.getUser(fixture.clerkUserId);assert.ok(user.emailAddresses.some(e=>e.emailAddress.includes("+clerk_test@")));
  const ticket=await backend.signInTokens.createSignInToken({userId:fixture.clerkUserId,expiresInSeconds:60});
  await evaluate(`(async()=>{const r=await window.Clerk.client.signIn.create({strategy:'ticket',ticket:${JSON.stringify(ticket.token)}});await window.Clerk.setActive({session:r.createdSessionId});})()`);await wait("window.Clerk.user?.id==="+JSON.stringify(fixture.clerkUserId));await delay(2500);
  await call("Page.navigate",{url:"http://localhost:3001/create"});await wait("location.pathname==='/create'&&!!document.querySelector('textarea')");await delay(500);
  const generated=await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d');function draw(n){ctx.fillStyle='#241245';ctx.fillRect(0,0,640,360);ctx.fillStyle='#25c7e8';ctx.fillRect(20+n*8,160,70,70);ctx.fillStyle='white';ctx.font='30px sans-serif';ctx.fillText('SCEENYK SYNTHETIC TEST',65,65);ctx.font='20px sans-serif';ctx.fillText('A cyan square moves left to right',120,115);}draw(0);const image=c.toDataURL('image/png').split(',')[1];const stream=c.captureStream(10),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();for(let n=0;n<35;n++){draw(n);await new Promise(resolve=>setTimeout(resolve,100));}recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return {image,video:btoa(binary)};})()`);
  const manifest=JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json","utf8"));
  const actions=Object.fromEntries(Object.entries(manifest.node).filter(([,v])=>v.exportedName).map(([id,v])=>[v.exportedName,id]));
  const invoke=async(name,input)=>evaluate(`(async()=>{const r=await fetch(location.pathname,{method:'POST',headers:{'Next-Action':${JSON.stringify(actions[name])},Accept:'text/x-component','Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify([${JSON.stringify(input)}])});const body=await r.text();for(const line of body.split(String.fromCharCode(10))){try{const v=JSON.parse(line.slice(line.indexOf(':')+1));if(v?.ok!==undefined)return v;}catch{}}return {ok:false};})()`);
  const project=randomUUID();const saved=await invoke("saveProjectAction",{id:project,mode:"create",title:"Gemini synthetic media acceptance",category:"storytelling",prompt:"Describe the visible synthetic square moving and make a short creative story.",settings:{duration:"10",aspectRatio:"16:9",visualStyle:"Original",tone:"Storytelling"}});assert.ok(saved.ok,"Actual project save succeeds");
  const assets=[];
  for(const [kind,mimeType,filename]of[["image","image/png","synthetic-square.png"],["video","video/webm","synthetic-square.webm"]]){
    const bytes=Buffer.from(generated[kind],"base64");fs.writeFileSync(path.join(dir,filename),bytes);
    const auth=await invoke("authorizeMediaAction",{projectId:project,requestId:randomUUID(),filename,mimeType,sizeBytes:bytes.length,kind});assert.ok(auth.ok&&auth.value.upload,"Owned upload authorized");
    const uploaded=await fetch(auth.value.upload.url,{method:"PUT",headers:auth.value.upload.headers,body:bytes,signal:AbortSignal.timeout(30000)});assert.equal(uploaded.status,200,"Actual R2 upload succeeds");await uploaded.body?.cancel();
    const final=await invoke("finalizeMediaAction",{projectId:project,assetId:auth.value.asset.id});assert.ok(final.ok&&final.value.status==="uploaded","Server verified private media");assets.push(final.value);
  }
  const report={projectId:project,assets,artifacts:dir,scope:"Synthetic canvas only; actual Clerk/actions/private R2; no generation admission"};
  fs.writeFileSync(path.join(os.tmpdir(),"sceenyk-analysis-media-fixture.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await call("Browser.close");
}finally{ws?.close();chrome.kill();}
