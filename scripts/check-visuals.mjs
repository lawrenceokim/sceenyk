// Real migrations/services/official durable workflow engine. Provider/R2 are
// explicit fixtures here; use acceptance-visuals.mjs for real paid calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { Inngest } from "inngest";
import { InngestTestEngine } from "@inngest/test";
import { typescriptLoader } from "./lib/load-typescript.mjs";

const pg = new PGlite(), checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const one = async (sql, args = []) => (await pg.query(sql, args)).rows[0];
const scalar = async (sql, args = []) => (await one(sql, args))?.value;
let queue = Promise.resolve(), submissions = 0, uploads = 0, writes = 0, providerMode = "success", pollMode = "success", loseTaskSave = false, rejectUpload = false, rejectOutput = false;
const tasks = new Map();
function serialize(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; }
const db = {
  rpc(name, args = {}) { return serialize(async () => {
    await pg.exec("set role service_role");
    try {
      const keys = Object.keys(args);
      const data = await scalar(`select ${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(",")}) as value`, Object.values(args));
      if (name === "record_visual_task" && loseTaskSave) { loseTaskSave = false; return { data: null, error: { code: "LOST_RESPONSE" } }; }
      return { data, error: null };
    } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
    finally { await pg.exec("reset role"); }
  }); },
  from(table) {
    const filters = [], args = []; let fields = "*", sort = "";
    return { select(v) { fields = v; return this; }, eq(k, v) { args.push(v); filters.push(`${k}=$${args.length}`); return this; }, order(k) { sort = ` order by ${k}`; return this; },
      then(resolve, reject) { return this.execute(false).then(resolve, reject); }, maybeSingle() { return this.execute(true); },
      execute(single) { return serialize(async () => { const rows = (await pg.query(`select ${fields} from ${table}${filters.length ? " where " + filters.join(" and ") : ""}${sort}`, args)).rows; return { data: single ? rows[0] ?? null : rows, error: null }; }); } };
  },
};
const load = typescriptLoader({
  "@/lib/db/server": { createDatabaseClient: () => db },
  "@/lib/storage/r2": { inspectR2Object: async key => rejectUpload ? null : {etag:'fixture-etag',sizeBytes:key.includes('/prepared/')?100:1,mimeType:'video/mp4'}, signR2Read: async () => { uploads++; return {url:'https://fixture-r2.example/short-lived'}; } },
  "@/lib/media-preparation/client": { prepareVisualSource: prepareFixtureSource },
  "./provider": {
    generateScene: submit, transformScene: submit,
    async getTaskStatus(scene) { if (pollMode === "outage") throw new Error("TEMPORARY_PROVIDER_OUTAGE"); return { status: pollMode === "failed" ? "FAILED" : pollMode === "waiting" ? "RUNNING" : "SUCCEEDED", credits: null, usage: {outputDuration:scene.duration_seconds,width:1280,height:720,numFrames:Math.round(scene.duration_seconds*24)+1,fps:24,nativeAudio:false}, outputUrl: pollMode === "missing_output" ? null : "https://fixture.cloudfront.net/output.mp4" }; },
  },
  "./storage": { boundedBytes: async () => new Uint8Array([1]), async persistSceneOutput() { if (rejectOutput) throw new Error("FIXTURE_R2_UNAVAILABLE"); writes++; return { sizeBytes: 100, etag: "fixture-etag" }; } },
  "@/lib/workflows/client": { inngest: new Inngest({ id: "visual-test", isDev: true }) },
});
async function submit(scene) {
  submissions++;
  if (providerMode === "uncertain") throw new (load("lib/video-ai/contract.ts").VisualError)("UNCERTAIN_SUBMISSION");
  if (providerMode === "rejected") throw new (load("lib/video-ai/contract.ts").VisualError)("PROVIDER_REJECTED");
  if (providerMode === "rate") throw new (load("lib/video-ai/contract.ts").VisualError)("RATE_LIMIT", true);
  const id = randomUUID(); tasks.set(id, scene.estimated_cost_usd); return { taskId: id, estimatedCredits: null };
}
async function prepareFixtureSource(sceneId, jobId, runId) {
  const s = await one("select * from scene_executions where id=$1 and job_id=$2", [sceneId, jobId]);
  if (!s.preparation_required || s.status === 'completed' || s.provider_task_id) return {ready:true};
  const {normalization,normalizationKey} = load('lib/media-preparation/config.ts');
  const config=normalization('16:9'), lease=randomUUID();
  const claim=await db.rpc('reserve_source_segment',{p_scene_id:s.id,p_run_id:runId,p_normalization_key:normalizationKey(config),p_normalization:config,p_overlays:{status:'plan_mentions',types:['hud']},p_lease_id:lease});
  assert.ok(!claim.error,claim.error?.message);
  if(claim.data.state==='completed')return {ready:true};
  if(claim.data.state==='failed')return {ready:false};
  assert.equal(claim.data.state,'claimed');
  if(rejectUpload){await db.rpc('fail_source_segment',{p_scene_id:s.id,p_run_id:runId,p_segment_id:claim.data.segment_id,p_lease_id:lease,p_error:'SOURCE_UNAVAILABLE',p_permanent:true});return {ready:false};}
  const completed=await db.rpc('complete_source_segment',{p_scene_id:s.id,p_run_id:runId,p_segment_id:claim.data.segment_id,p_lease_id:lease,p_metadata:{etag:'fixture-etag',sizeBytes:100,sourceDurationMs:12000,durationMs:s.requested_duration_ms,width:640,height:360,fps:24,sourceWidth:640,sourceHeight:360,sourceRotation:0,sourceHasAudio:false,mode:'transcode'}});
  assert.ok(!completed.error&&completed.data,completed.error?.message);return {ready:true};
}
const settings = { duration: "10", aspectRatio: "16:9", visualStyle: "Original", tone: "Storytelling" };
async function fixture(kind = "mixed") {
  const owner = await scalar("insert into app_users(clerk_user_id) values($1) returning id as value", [randomUUID()]);
  const project = await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Visual fixture','cinematic','16:9','10','Original','Storytelling') returning id as value", [owner]);
  const asset = randomUUID();
  await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'fixture.mp4','video/mp4',1,'video','uploaded','fixture-etag')", [asset, owner, project, randomUUID(), `users/${owner}/projects/${project}/${asset}/${randomUUID()}`]);
  const input = { version: 1, prompt: "Make a ten-second cinematic story", category: "cinematic", settings, assetIds: [asset] };
  const quote = await scalar("select issue_generation_quote($1,$2,$3,$4,null,'fixture','unconfigured') as value", [owner, project, randomUUID(), input]);
  const admitted = await scalar("select confirm_generation_quote($1,$2,'fixture') as value", [owner, quote.quote.id]);
  assert.equal(admitted.code, "ACCEPTED");
  const job = admitted.job_id, run = "analysis-" + randomUUID();
  await db.rpc("claim_generation_job", { p_job_id: job, p_run_id: run });
  await db.rpc("advance_generation_analysis", { p_job_id: job, p_run_id: run, p_stage: "planning" });
  const attempt = await db.rpc("begin_generation_analysis", { p_job_id: job, p_run_id: run, p_attempt: 1, p_model: "fixture" });
  const base = { order: 1, durationSeconds: 6, purpose: "Opening", source: "generated", assetId: null, startTime: null, endTime: null, description: "A sunny landscape", transformationInstruction: null, narration: null, caption: null, transition: "Cut" };
  const plan = { schemaVersion: 1, summary: "A short story", contentIntent: "Tell a short story", sourceMediaSummary: [{ assetId: asset, summary: "Synthetic fixture", durationSeconds: 3 }], targetDuration: 10, aspectRatio: "16:9", tone: "Storytelling", visualStyle: "Original", narrationRequired: false,
    scenePlan: kind === "segments" ? [{...base,source:'transformed',assetId:asset,startTime:2,endTime:7,durationSeconds:5,transformationInstruction:'Cartoon, preserve HUD'}, {...base,order:2,source:'original',assetId:asset,startTime:2,endTime:7,durationSeconds:5}] : kind === "mixed" ? [base, { ...base, order: 2, durationSeconds: 3, source: "transformed", assetId: asset, startTime: 0, endTime: 3, transformationInstruction: "Polished cartoon, preserve movement and camera intent" }, { ...base, order: 3, durationSeconds: 1, source: "original", assetId: asset, startTime: 0, endTime: 1 }] : [{ ...base, durationSeconds: 10 }], audioNotes: [], editingNotes: [] };
  const saved = await db.rpc("finish_generation_analysis", { p_job_id: job, p_run_id: run, p_attempt_id: attempt.data.attempt_id, p_plan: plan, p_usage: { media: [{ assetId: asset, durationSeconds: kind==='segments'?12:3 }] }, p_model: "fixture", p_response_id: null, p_failure: null });
  assert.ok(saved.data, saved.error?.message);
  return { owner, project, job, plan, asset, run: "visual-" + randomUUID() };
}
async function denied(name, sql, args = [], role = "authenticated") { await pg.exec("set role " + role); let failed = false; try { await pg.query(sql, args); } catch { failed = true; } finally { await pg.exec("reset role"); } check(name, failed); }
const jobRow = id => one("select * from generation_jobs where id=$1", [id]);
const scenes = id => pg.query("select * from scene_executions where job_id=$1 order by scene_order", [id]).then(r => r.rows);
const reserved = id => scalar("select state as value from generation_reservations where job_id=$1", [id]);
const savedKey = process.env.FAL_KEY;
process.env.FAL_KEY = "fixture-no-real-requests"; process.env.FAL_MAX_SCENE_SECONDS = "10";
try {
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const migrations = fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort();
  for (const file of migrations.slice(0, 10)) await pg.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
  const historical = await fixture(), historicalTask = randomUUID();
  await pg.query("insert into scene_executions(job_id,owner_user_id,project_id,scene_order,operation,provider,model,prompt,duration_seconds,resolution,provider_task_id,provider_credits,status) values($1,$2,$3,1,'text_to_video','runway','gen4.5','Historical',6,'1280:720',$4,24,'processing')", [historical.job, historical.owner, historical.project, historicalTask]);
  await pg.exec(fs.readFileSync("supabase/migrations/" + migrations[10], "utf8"));
  const retained = (await scenes(historical.job))[0];
  check("migration preserves historical Runway task and stored charge", retained.provider === "runway" && retained.provider_task_id === historicalTask && Number(retained.provider_cost_usd) === .24);
  check("all eleven migrations apply", true);
  for(const file of migrations.slice(11))await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  check('prepared-segment migration applies after retained history',true);
  const service = load("lib/video-ai/server.ts"), workflow = load("lib/workflows/visuals.ts").visualWorkflow;
  await db.rpc("claim_visual_generation", { p_job_id: historical.job, p_run_id: historical.run });
  const inactiveBefore = submissions;
  await service.submitVisualScene(retained.id, historical.job, historical.run);
  const inactive = (await scenes(historical.job))[0];
  check("historical Runway work is retained inactive without fal purchase", inactive.error_code === "PROVIDER_INACTIVE" && inactive.provider_task_id === historicalTask && submissions === inactiveBefore);
  async function execute(f) { return new InngestTestEngine({ function: workflow, events: [{ name: "sceenyk/generation.visuals.requested", data: { generationJobId: f.job } }], transformCtx: ctx => ({ ...ctx, runId: f.run, step: { ...ctx.step, sleep: async () => null } }) }).execute(); }
  const f = await fixture(), before = submissions;
  const result = await execute(f);
  check("official durable workflow reaches visuals_ready", result.result?.handoff === "visuals_ready");
  const rows = await scenes(f.job);
  check("one text and one transformation task, reuse is free", submissions - before === 2 && rows.length === 3 && rows[2].provider_task_id === null);
  check("real task IDs persisted before polling", rows.slice(0, 2).every(s => s.provider_task_id && s.submission_started_at));
  check("intermediate assets persisted exactly once", (await scalar("select count(*)::int as value from scene_assets where job_id=$1", [f.job])) === 2 && writes === 2);
  check("fal USD estimates never invent Runway credits or verified charges", rows[0].provider_credits === null && rows[0].provider_cost_usd === null && Number(rows[0].estimated_cost_usd) === .54);
  check("reservation stays held, no final output or completed job", await reserved(f.job) === "reserved" && (await jobRow(f.job)).status === "processing" && !(await jobRow(f.job)).completed_at);
  assert.deepEqual((await one("select plan from generation_plans where job_id=$1", [f.job])).plan, f.plan); check("immutable Gemini plan unchanged", true);
  const duplicateCount = submissions;
  check("duplicate different-run event cannot execute paid work", (await execute({ ...f, run: "duplicate" })).result?.claim === "terminal" && submissions === duplicateCount);
  check("duplicate same-run delivery reuses ready output", (await execute(f)).result?.claim === "terminal" && submissions === duplicateCount);
  await denied("browser cannot read scene state/cost", "select * from scene_executions");
  await denied("browser cannot read generated metadata", "select * from scene_assets");
  await denied("browser cannot submit arbitrary task IDs", "select record_visual_task($1,'bad',$2,1)", [rows[0].id, randomUUID()]);
  await denied("browser cannot complete scenes", "select complete_visual_scene($1,'bad',1,'bad')", [rows[0].id]);
  await denied("service cannot directly write provider state", "update scene_executions set provider_task_id=$1 where id=$2", [randomUUID(), rows[0].id], "service_role");
  await denied("service cannot mark job visuals ready", "update generation_jobs set visuals_ready_at=now() where id=$1", [f.job], "service_role");
  const b = await fixture();
  await assert.rejects(service.submitVisualScene(rows[0].id, b.job, b.run)); check("B job cannot use A scene", true);
  await db.rpc("claim_visual_generation", { p_job_id: b.job, p_run_id: b.run });
  await service.prepareVisuals(b.job, b.run); const bRows = await scenes(b.job);
  check("wrong worker cannot reserve submission", !(await db.rpc("begin_visual_submission", { p_scene_id: bRows[0].id, p_run_id: "wrong" })).data);
  loseTaskSave = true; const lostCount = submissions;
  await assert.rejects(service.submitVisualScene(bRows[0].id, b.job, b.run));
  check("lost DB response reuses persisted paid task", (await service.submitVisualScene(bRows[0].id, b.job, b.run)).poll && submissions === lostCount + 1);
  pollMode = "outage"; await assert.rejects(service.pollVisualScene(bRows[0].id, b.job, b.run));
  check("temporary poll failure retains task and reservation", (await scenes(b.job))[0].provider_task_id && await reserved(b.job) === "reserved");
  pollMode = "success"; await service.pollVisualScene(bRows[0].id, b.job, b.run);
  const uncertain = await fixture("generated"); providerMode = "uncertain";
  await execute(uncertain); const uncertainCount = submissions;
  await service.submitVisualScene((await scenes(uncertain.job))[0].id, uncertain.job, uncertain.run);
  check("uncertain paid submission never automatically replays", submissions === uncertainCount && (await scenes(uncertain.job))[0].error_code === "UNCERTAIN_SUBMISSION");
  check("uncertain job holds reservation and shows pending", await reserved(uncertain.job) === "reserved" && !!(await jobRow(uncertain.job)).visuals_pending_at);
  providerMode = "success"; pollMode = "failed"; const failed = await fixture("generated"); await execute(failed);
  check("permanent provider failure never invents a charge", (await scenes(failed.job)).every(s => s.status === "failed" && s.provider_credits === null && s.provider_cost_usd === null));
  check("total failure restores original reservation exactly once", await reserved(failed.job) === "released" && (await jobRow(failed.job)).status === "failed");
  check("repeat finalization does not release twice", (await db.rpc("finish_visual_generation", { p_job_id: failed.job, p_run_id: failed.run })).data === "terminal");
  const map = load("lib/video-ai/mapping.ts").mapVisualScenes;
  const partialPlan = structuredClone(f.plan); partialPlan.scenePlan[1].startTime = 1;
  check("selected source segments route through preparation", map(partialPlan, [{ id: f.asset, mimeType: "video/mp4", sizeBytes: 1, durationSeconds: 10 }])[1].error_code === null);
  check("square text generation is explicitly unsupported", map({ ...f.plan, aspectRatio: "1:1" }, [])[0].error_code === "UNSUPPORTED_ASPECT_RATIO");
  process.env.FAL_MAX_SCENE_USD = ".01";
  check("central cost guard blocks spending", map(f.plan, [])[0].error_code === "COST_GUARD"); delete process.env.FAL_MAX_SCENE_USD;
  const img = structuredClone(f.plan); img.scenePlan[1].durationSeconds = 6;
  check("image transformation maps to image-to-video", map(img, [{ id: f.asset, mimeType: "image/png", sizeBytes: 1 }])[1].operation === "image_to_video");
  check("reuse requires no upload", uploads === 1);
  providerMode = "rate"; const rate = await fixture("generated");
  await db.rpc("claim_visual_generation", { p_job_id: rate.job, p_run_id: rate.run });
  await service.prepareVisuals(rate.job, rate.run); const rateScene = (await scenes(rate.job))[0]; const rateBefore = submissions;
  for (let n = 0; n < 3; n++) await assert.rejects(service.submitVisualScene(rateScene.id, rate.job, rate.run), /VISUAL_RATE_LIMIT/);
  check("explicit rate-limit rejections retry through durable step with three-attempt bound", !(await service.submitVisualScene(rateScene.id, rate.job, rate.run)).poll && submissions - rateBefore === 3);
  check("rate limits retain original accounting hold", await reserved(rate.job) === "reserved");
  providerMode = "success"; pollMode = "success"; const errors = await fixture();
  await db.rpc("claim_visual_generation", { p_job_id: errors.job, p_run_id: errors.run });
  await service.prepareVisuals(errors.job, errors.run); const errorScenes = await scenes(errors.job);
  const beforeReject = submissions; rejectUpload = true;
  await prepareFixtureSource(errorScenes[1].id,errors.job,errors.run);
  check("invalid private source fails before any paid submission", !(await service.submitVisualScene(errorScenes[1].id, errors.job, errors.run)).poll && submissions === beforeReject && (await scenes(errors.job))[1].status === "failed");
  rejectUpload = false;
  await service.submitVisualScene(errorScenes[0].id, errors.job, errors.run); pollMode = "missing_output";
  await assert.rejects(service.pollVisualScene(errorScenes[0].id, errors.job, errors.run), /VISUAL_OUTPUT_UNAVAILABLE/);
  check("missing successful output records safe error and usage estimate", (await scenes(errors.job))[0].error_code === "INVALID_OUTPUT" && Number((await scenes(errors.job))[0].estimated_cost_usd) === .54 && await reserved(errors.job) === "reserved");
  pollMode = "success"; rejectOutput = true;
  await assert.rejects(service.pollVisualScene(errorScenes[0].id, errors.job, errors.run), /VISUAL_OUTPUT_UNAVAILABLE/);
  check("R2 outage preserves provider task and accounting hold", (await scenes(errors.job))[0].error_code === "OUTPUT_PERSISTENCE_FAILED" && !!(await scenes(errors.job))[0].provider_task_id && await reserved(errors.job) === "reserved");
  rejectOutput = false; const beforeResume = submissions;
  await service.pollVisualScene(errorScenes[0].id, errors.job, errors.run);
  check("output persistence resumes without buying another task", submissions === beforeResume && (await scenes(errors.job))[0].status === "completed");
  const drift = await fixture("generated");
  await db.rpc("claim_visual_generation", { p_job_id: drift.job, p_run_id: drift.run });
  await service.prepareVisuals(drift.job, drift.run);
  const driftBefore = submissions;
  process.env.FAL_VIDEO_SECOND_USD = ".1";
  await service.submitVisualScene((await scenes(drift.job))[0].id, drift.job, drift.run);
  delete process.env.FAL_VIDEO_SECOND_USD;
  check("pricing drift cannot silently purchase against an old snapshot", submissions === driftBefore && (await scenes(drift.job))[0].error_code === "CONFIGURATION_CHANGED");
  const segmentFixture = await fixture('segments');
  await db.rpc('claim_visual_generation',{p_job_id:segmentFixture.job,p_run_id:segmentFixture.run});
  await service.prepareVisuals(segmentFixture.job,segmentFixture.run);
  const segmentScenes=await scenes(segmentFixture.job), segmentBefore=submissions;
  check('database rejects paid submission before source preparation',!(await db.rpc('begin_visual_submission',{p_scene_id:segmentScenes[0].id,p_run_id:segmentFixture.run})).data);
  const {normalization,normalizationKey}=load('lib/media-preparation/config.ts'), n=normalization('16:9');
  const reserve=(s,lease,run=segmentFixture.run)=>db.rpc('reserve_source_segment',{p_scene_id:s,p_run_id:run,p_normalization_key:normalizationKey(n),p_normalization:n,p_overlays:{status:'not_identified'},p_lease_id:lease});
  check('wrong run cannot prepare owned scene',(await reserve(segmentScenes[0].id,randomUUID(),'foreign')).data.state==='unavailable');
  const firstLease=randomUUID(), firstClaim=await reserve(segmentScenes[0].id,firstLease);
  check('one lease claims one private derivative',firstClaim.data.state==='claimed');
  check('concurrent reuse waits on the same segment',(await reserve(segmentScenes[1].id,randomUUID())).data.state==='busy'&&(await scalar('select count(*)::int as value from prepared_segments where source_asset_id=$1',[segmentFixture.asset]))===1);
  check('wrong lease cannot finish derivative',!(await db.rpc('complete_source_segment',{p_scene_id:segmentScenes[0].id,p_run_id:segmentFixture.run,p_segment_id:firstClaim.data.segment_id,p_lease_id:randomUUID(),p_metadata:{}})).data);
  await db.rpc('fail_source_segment',{p_scene_id:segmentScenes[0].id,p_run_id:segmentFixture.run,p_segment_id:firstClaim.data.segment_id,p_lease_id:firstLease,p_error:'PREPARATION_STORAGE_UNAVAILABLE',p_permanent:false});
  await prepareFixtureSource(segmentScenes[0].id,segmentFixture.job,segmentFixture.run);
  await prepareFixtureSource(segmentScenes[1].id,segmentFixture.job,segmentFixture.run);
  const preparedScenes=await scenes(segmentFixture.job);
  check('transform and reuse reference identical completed timing cache',preparedScenes[0].prepared_asset_id===preparedScenes[1].prepared_asset_id&&preparedScenes[1].status==='completed'&&preparedScenes[0].source_start_ms===2000&&preparedScenes[0].source_end_ms===7000);
  await denied('browser cannot read derivative metadata','select * from prepared_segments');
  await denied('browser cannot choose source preparation','select reserve_source_segment($1,$2,$3,$4,$5,$6)',[segmentScenes[0].id,segmentFixture.run,normalizationKey(n),n,{},randomUUID()]);
  await denied('service cannot mutate derivative ownership','update prepared_segments set owner_user_id=$1 where id=$2',[b.owner,firstClaim.data.segment_id],'service_role');
  await assert.rejects(pg.query("update prepared_segments set width=642 where id=$1",[firstClaim.data.segment_id]));
  check('completed derivative is immutable even to privileged updates',true);
  const invalid=await fixture('segments');
  await db.rpc('claim_visual_generation',{p_job_id:invalid.job,p_run_id:invalid.run});await service.prepareVisuals(invalid.job,invalid.run);
  const invalidScene=(await scenes(invalid.job))[0];
  // Isolated superuser corruption fixture proves the DB gate independently.
  await pg.query('update scene_executions set source_end_ms=8000 where id=$1',[invalidScene.id]);
  const invalidClaim=await reserve(invalidScene.id,randomUUID(),invalid.run);
  check('inconsistent timestamps fail before any fal purchase',invalidClaim.data.state==='failed'&&!(await db.rpc('begin_visual_submission',{p_scene_id:invalidScene.id,p_run_id:invalid.run})).data&&submissions===segmentBefore);
  const bounded=await fixture('segments');
  await db.rpc('claim_visual_generation',{p_job_id:bounded.job,p_run_id:bounded.run});await service.prepareVisuals(bounded.job,bounded.run);
  const boundedScene=(await scenes(bounded.job))[0];
  for(let attempt=0;attempt<3;attempt++){
    const lease=randomUUID(), claim=await reserve(boundedScene.id,lease,bounded.run);assert.equal(claim.data.state,'claimed');
    await db.rpc('fail_source_segment',{p_scene_id:boundedScene.id,p_run_id:bounded.run,p_segment_id:claim.data.segment_id,p_lease_id:lease,p_error:'PREPARATION_STORAGE_UNAVAILABLE',p_permanent:false});
  }
  check('temporary preparation is bounded to three attempts',(await reserve(boundedScene.id,randomUUID(),bounded.run)).data.state==='exhausted'&&await reserved(bounded.job)==='reserved');
  console.log(JSON.stringify({ passed: checks.length, checks, externalServices: "explicit provider/R2 fixtures" }, null, 2));
} finally { if (savedKey === undefined) delete process.env.FAL_KEY; else process.env.FAL_KEY = savedKey; delete process.env.FAL_MAX_SCENE_SECONDS; await pg.close(); }
