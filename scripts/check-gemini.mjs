// Actual REST adapter with fixture transport. No real uploads or provider cost.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { typescriptLoader } from "./lib/load-typescript.mjs";
const input={version:1,prompt:"A sunrise story",category:"cinematic",settings:{duration:"10",aspectRatio:"16:9",visualStyle:"Original",tone:"Storytelling"},assetIds:[]};
const plan={schemaVersion:1,summary:"Sunrise",contentIntent:"Hope",sourceMediaSummary:[],targetDuration:10,aspectRatio:"16:9",tone:"Storytelling",visualStyle:"Original",narrationRequired:false,scenePlan:[{order:1,durationSeconds:10,purpose:"Opening",source:"generated",assetId:null,startTime:null,endTime:null,description:"Sunrise",transformationInstruction:null,narration:null,caption:null,transition:"Fade"}],audioNotes:[],editingNotes:[]};
const calls=[],checks=[];let mode="success";
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
const transport=async(url,init)=>{
  calls.push({url:String(url),init});
  if(init.method==="DELETE")return new Response(null,{status:200});
  if(String(url).includes("/upload/"))return new Response(null,{headers:{"x-goog-upload-url":mode==="foreign-url"?"https://attacker.invalid/upload":"https://generativelanguage.googleapis.com/fixture-upload"}});
  if(String(url).endsWith("fixture-upload")){
    const reader=init.body.getReader();let bytes=0;for(;;){const v=await reader.read();if(v.done)break;bytes+=v.value.length;}assert.equal(bytes,3);
    return Response.json({file:{name:"files/fixture",uri:"https://generativelanguage.googleapis.com/v1beta/files/fixture",state:"ACTIVE",videoMetadata:{videoDuration:"2s"}}});
  }
  if(mode==="network")throw new Error("private network detail");
  if(mode==="timeout")await new Promise((_,reject)=>{const keepAlive=setTimeout(()=>reject(new Error("fixture deadline exceeded")),2000);init.signal.addEventListener("abort",()=>{clearTimeout(keepAlive);reject(new Error("private timeout detail"));},{once:true});});
  if(mode==="rate")return new Response("private upstream detail",{status:429});
  if(mode==="outage")return new Response("private upstream detail",{status:503});
  if(mode==="rejected")return new Response("private upstream detail",{status:400});
  const body=JSON.parse(init.body);assert.ok(!JSON.stringify(body).includes("fixture-secret"));assert.equal(body.generationConfig.responseMimeType,"application/json");assert.ok(!JSON.stringify(body.generationConfig.responseJsonSchema).includes("exclusiveMinimum"));
  return Response.json({modelVersion:"gemini-fixture",responseId:"fixture-response",usageMetadata:{promptTokenCount:100,candidatesTokenCount:50,totalTokenCount:160,thoughtsTokenCount:10,promptTokensDetails:[{modality:"VIDEO",tokenCount:90}],untrusted:"never retained"},candidates:[{finishReason:mode==="truncated"?"MAX_TOKENS":"STOP",content:{parts:[{text:mode==="malformed"?"not JSON":JSON.stringify(plan)}]}}]});
};
const load=typescriptLoader({"../config":{getAnalysisConfiguration:()=>({apiKey:"fixture-secret",timeoutMs:1000})}},{fetch:transport});
const {understandAndPlan}=load("lib/ai/providers/gemini.ts");
const run=(media=[])=>understandAndPlan({input,media,retry:false,model:"gemini-fixture"});
let result=await run();check("text REST result strictly validated",result.plan?.schemaVersion===1);
check("usage counters/thinking/modality preserved",result.usage.inputTokens===100&&result.usage.thinkingTokens===10&&result.usage.inputDetails[0].modality==="VIDEO");
check("raw usage extras and invented cost excluded",!JSON.stringify(result).includes("untrusted")&&result.usage.estimatedCost===null);
check("credential sent only in trusted Google request header",calls[0].init.headers["x-goog-api-key"]==="fixture-secret"&&!calls[0].url.includes("fixture-secret"));
for(const failure of ["malformed","truncated"]){mode=failure;result=await run();check(failure+" output rejected but usage retained",!result.plan&&result.failure==="INVALID_OUTPUT"&&result.usage.totalTokens===160);}
for(const [failure,code]of[["rate","RATE_LIMIT"],["outage","PROVIDER_UNAVAILABLE"],["rejected","PROVIDER_REJECTED"],["network","UNCERTAIN_ATTEMPT"],["timeout","TIMEOUT"]]){mode=failure;await assert.rejects(run(),e=>e.code===code&&!e.message.includes("private"));check(failure+" has safe classified failure",true);}
mode="success";const id=randomUUID();input.assetIds=[id];plan.sourceMediaSummary=[{assetId:id,summary:"Fixture image",durationSeconds:null}];
result=await run([{id,mimeType:"image/png",sizeBytes:3,read:async()=>new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close();}})}]);
check("private media bytes streamed through authenticated Files API",calls.some(c=>c.url.endsWith("fixture-upload")&&c.init.duplex==="half")&&!!result.plan);
check("temporary Google file deletion requested",calls.some(c=>c.init.method==="DELETE"));
check("media metadata captured without storage keys or URLs",result.usage.media[0].sizeBytes===3&&!JSON.stringify(result.usage).includes("http"));
mode="malformed";const deletesBefore=calls.filter(c=>c.init.method==="DELETE").length;
await run([{id,mimeType:"image/png",sizeBytes:3,read:async()=>new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close();}})}]);
check("invalid output still cleans provider files",calls.filter(c=>c.init.method==="DELETE").length===deletesBefore+1);
mode="foreign-url";await assert.rejects(run([{id,mimeType:"image/png",sizeBytes:3,read:async()=>{throw new Error("must not read");}}]),e=>e.code==="PROVIDER_REJECTED");check("untrusted upload origin rejected before private read",true);
const count=calls.length;await assert.rejects(run([{id,mimeType:"image/bmp",sizeBytes:3,read:async()=>{throw new Error("must not read");}}]),e=>e.code==="UNSUPPORTED_MEDIA");check("unsupported media rejected without upload",calls.length===count);
mode="success";await assert.rejects(run([{id,mimeType:"image/png",sizeBytes:3,read:async()=>{throw new Error("private R2 failure");}}]),e=>e.code==="MEDIA_UNAVAILABLE"&&!e.message.includes("private"));check("inaccessible private media has safe failure",true);
console.log(JSON.stringify({passed:checks.length,checks,transport:"fixture"},null,2));
