// Persist the already-observed real text result without another Gemini call.
// Actual SQL on disk-backed isolated PostgreSQL; hosted acceptance is separate.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { typescriptLoader } from "./lib/load-typescript.mjs";
const kind=process.argv[2]??"text";assert.ok(["text","image","video"].includes(kind));
const observed=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),`sceenyk-gemini-${kind}-plan.json`),"utf8"));
const {validateProductionPlan}=typescriptLoader()("lib/ai/plan.ts");
const media=observed.usage.media.map(m=>({id:m.assetId,mimeType:m.mimeType,sizeBytes:m.sizeBytes,durationSeconds:m.durationSeconds}));
const plan=validateProductionPlan(observed.plan,observed.input,media);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sceenyk-real-plan-db-"));
let pg=new PGlite(dir);
const scalar=async(sql,args=[]) => (await pg.query(sql,args)).rows[0].value;
try{
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  for(const file of fs.readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort())await pg.exec(fs.readFileSync("supabase/migrations/"+file,"utf8"));
  const owner=await scalar("insert into app_users(clerk_user_id) values($1) returning id as value",[randomUUID()]);
  const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Real Gemini result persistence','storytelling','16:9','10','Original','Storytelling') returning id as value",[owner]);
  for(const asset of media)await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'isolated metadata fixture',$6,$7,$8,'uploaded','isolated-etag')",[asset.id,owner,project,randomUUID(),`users/${owner}/projects/${project}/${asset.id}/${randomUUID()}`,asset.mimeType,asset.sizeBytes,asset.mimeType.split('/')[0]]);
  const quote=await scalar("select issue_generation_quote($1,$2,$3,$4,null,'acceptance','unconfigured') as value",[owner,project,randomUUID(),observed.input]);
  const accepted=await scalar("select confirm_generation_quote($1,$2,'acceptance') as value",[owner,quote.quote.id]);assert.equal(accepted.code,"ACCEPTED");
  const job=accepted.job_id;
  assert.equal(await scalar("select claim_generation_job($1,'real-plan-acceptance') as value",[job]),"claimed");
  assert.equal(await scalar("select advance_generation_analysis($1,'real-plan-acceptance','analyzing') as value",[job]),true);
  const attempt=await scalar("select begin_generation_analysis($1,'real-plan-acceptance',1,$2) as value",[job,observed.model]);
  assert.equal(await scalar("select finish_generation_analysis($1,'real-plan-acceptance',$2,$3,$4,$5,null,null) as value",[job,attempt.attempt_id,plan,observed.usage,observed.model]),true);
  await pg.close();pg=new PGlite(dir);
  const stored=(await pg.query("select p.plan,p.model,j.status,j.current_stage,j.production_plan_ready_at,r.state,a.usage from generation_plans p join generation_jobs j on j.id=p.job_id join generation_reservations r on r.job_id=j.id join generation_analysis_attempts a on a.job_id=j.id where j.id=$1",[job])).rows[0];
  assert.deepEqual(stored.plan,plan);assert.equal(stored.model,observed.model);assert.equal(stored.status,"processing");assert.equal(stored.current_stage,"planning");assert.ok(stored.production_plan_ready_at);assert.equal(stored.state,"reserved");assert.equal(stored.usage.totalTokens,observed.usage.totalTokens);
  console.log(JSON.stringify({passed:8,kind,scope:"actual real Gemini result; isolated disk-backed SQL; media metadata fixtures; close/reopen",model:stored.model,totalTokens:stored.usage.totalTokens,artifact:dir}));
}finally{await pg.close();}
