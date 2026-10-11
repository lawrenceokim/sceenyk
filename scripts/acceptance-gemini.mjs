// Explicit real-provider acceptance. Reads only already-uploaded media owned by
// the selected project. Never logs keys, object keys, temporary URLs or content.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { typescriptLoader } from "./lib/load-typescript.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const load=typescriptLoader(), {understandAndPlan}=load("lib/ai/providers/gemini.ts"), {getAnalysisConfiguration}=load("lib/ai/config.ts"), {readR2AnalysisMedia}=load("lib/storage/r2.ts");
const projectId=process.env.SCEENYK_ACCEPTANCE_PROJECT_ID ?? "639d6d99-1809-4d87-9177-9f02c7ca83a5";
const p=await db.from("projects").select("*").eq("id",projectId).single();
assert.ok(!p.error&&p.data,"Owned fixture project exists");
const a=await db.from("project_assets").select("*").eq("project_id",projectId).eq("owner_user_id",p.data.owner_user_id).eq("upload_status","uploaded");
assert.ok(!a.error,"Owned media query succeeds");
const config=getAnalysisConfiguration(), reports=[];
const cases=process.argv.includes("--text-only")?[{kind:"text",mime:null}]:process.argv.includes("--image-only")?[{kind:"image",mime:"image/png"}]:process.argv.includes("--video-only")?[{kind:"video",mime:"video/webm"}]:process.argv.includes("--media-only")?[{kind:"image",mime:"image/png"},{kind:"video",mime:"video/webm"}]:[{kind:"text",mime:null},{kind:"image",mime:"image/png"},{kind:"video",mime:"video/webm"}];
for(const item of cases){
  const asset=item.mime?a.data.find(x=>x.mime_type===item.mime):null;
  if(item.mime)assert.ok(asset?.verified_etag,"Verified "+item.kind+" input exists");
  const input={version:1,prompt:item.kind==="text"?"Create a ten-second cinematic story about a sunrise and a hopeful new beginning.":"Describe what is actually visible in this uploaded media, then plan a ten-second creative story using the source where appropriate. Clearly distinguish imagined scenes from observed footage.",category:"storytelling",settings:{duration:"10",aspectRatio:"16:9",visualStyle:"Original",tone:"Storytelling"},assetIds:asset?[asset.id]:[]};
  const media=asset?[{id:asset.id,mimeType:asset.mime_type,sizeBytes:asset.size_bytes,read:signal=>readR2AnalysisMedia(asset.storage_key,asset.verified_etag,asset.size_bytes,signal)}]:[];
  let unsignedStatus=null;
  if(asset){
    const signed=await load("lib/storage/r2.ts").signR2Read(asset.storage_key,asset.verified_etag,asset.mime_type);
    const authorized=await fetch(signed.url,{signal:AbortSignal.timeout(15000)});assert.equal(authorized.status,200,"Verified object is retrievable with authorized access");await authorized.body?.cancel();
    const unsignedUrl=new URL(signed.url);unsignedUrl.search="";
    const unsigned=await fetch(unsignedUrl,{signal:AbortSignal.timeout(15000)});
    unsignedStatus=unsigned.status;await unsigned.body?.cancel();assert.ok([400,401,403].includes(unsignedStatus),"Private R2 refuses unsigned access");
  }
  const attempts=[];let result;
  for(let attempt=1;attempt<=2;attempt++){
    try{result=await understandAndPlan({input,media,retry:attempt>1,model:config.model});attempts.push({attempt,ready:!!result.plan,failure:result.failure,model:result.model,usage:result.usage});}
    catch(error){attempts.push({attempt,ready:false,failure:error.code??"ACCEPTANCE_FAILED",operation:error.operation});if(attempt===1&&["RATE_LIMIT","PROVIDER_UNAVAILABLE"].includes(error.code)){await delay(10000);continue;}break;}
    if(result.plan)break;
  }
  const record={kind:item.kind,projectId,assetId:asset?.id??null,unsignedStatus,ready:!!result?.plan,attempts};reports.push(record);
  if(result?.plan)fs.writeFileSync(path.join(os.tmpdir(),`sceenyk-gemini-${item.kind}-plan.json`),JSON.stringify({input,plan:result.plan,model:result.model,usage:result.usage},null,2));
  console.log(JSON.stringify(record));
}
const reportFile=path.join(os.tmpdir(),"sceenyk-gemini-acceptance.json");
let previous=[];try{previous=JSON.parse(fs.readFileSync(reportFile,"utf8"));}catch{}
fs.writeFileSync(reportFile,JSON.stringify([...previous.filter(r=>!reports.some(n=>n.kind===r.kind)),...reports],null,2));
if(reports.some(r=>!r.ready))process.exitCode=1;
