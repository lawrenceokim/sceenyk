// Real migrations/services/official durable workflow engine. Runway/R2 are
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
  "@/lib/storage/r2": { readR2AnalysisMedia: async () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }) },
  "./providers/runway": {
    async uploadSceneInput() { uploads++; if (rejectUpload) throw new (load("lib/video-ai/contract.ts").VisualError)("PROVIDER_REJECTED"); return "runway://fixture"; },
    generateScene: submit, transformScene: submit,
    async getTaskStatus(id) { if (pollMode === "outage") throw new Error("TEMPORARY_PROVIDER_OUTAGE"); return { status: pollMode === "failed" ? "FAILED" : pollMode === "waiting" ? "RUNNING" : "SUCCEEDED", credits: pollMode === "failed" ? 0 : tasks.get(id), outputUrl: pollMode === "missing_output" ? null : "https://fixture.cloudfront.net/output.mp4" }; },
  },
  "./storage": { boundedBytes: async () => new Uint8Array([1]), async persistSceneOutput() { if (rejectOutput) throw new Error("FIXTURE_R2_UNAVAILABLE"); writes++; return { sizeBytes: 100, etag: "fixture-etag" }; } },
  "@/lib/workflows/client": { inngest: new Inngest({ id: "visual-test", isDev: true }) },
});
async function submit(scene) {
  submissions++;
  if (providerMode === "uncertain") throw new (load("lib/video-ai/contract.ts").VisualError)("UNCERTAIN_SUBMISSION");
  if (providerMode === "rejected") throw new (load("lib/video-ai/contract.ts").VisualError)("PROVIDER_REJECTED");
  if (providerMode === "rate") throw new (load("lib/video-ai/contract.ts").VisualError)("RATE_LIMIT", true);
  const id = randomUUID(); tasks.set(id, scene.estimated_credits); return { taskId: id, estimatedCredits: scene.estimated_credits };
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
  const base = { order: 1, durationSeconds: 2, purpose: "Opening", source: "generated", assetId: null, startTime: null, endTime: null, description: "A sunny landscape", transformationInstruction: null, narration: null, caption: null, transition: "Cut" };
  const plan = { schemaVersion: 1, summary: "A short story", contentIntent: "Tell a short story", sourceMediaSummary: [{ assetId: asset, summary: "Synthetic fixture", durationSeconds: 3 }], targetDuration: 10, aspectRatio: "16:9", tone: "Storytelling", visualStyle: "Original", narrationRequired: false,
    scenePlan: kind === "mixed" ? [base, { ...base, order: 2, durationSeconds: 3, source: "transformed", assetId: asset, startTime: 0, endTime: 3, transformationInstruction: "Polished cartoon, preserve movement and camera intent" }, { ...base, order: 3, durationSeconds: 5, source: "original", assetId: asset, startTime: 0, endTime: 3 }] : [{ ...base, durationSeconds: 5 }, { ...base, order: 2, durationSeconds: 5 }], audioNotes: [], editingNotes: [] };
  const saved = await db.rpc("finish_generation_analysis", { p_job_id: job, p_run_id: run, p_attempt_id: attempt.data.attempt_id, p_plan: plan, p_usage: { media: [{ assetId: asset, durationSeconds: 3 }] }, p_model: "fixture", p_response_id: null, p_failure: null });
  assert.ok(saved.data, saved.error?.message);
  return { owner, project, job, plan, asset, run: "visual-" + randomUUID() };
}
async function denied(name, sql, args = [], role = "authenticated") { await pg.exec("set role " + role); let failed = false; try { await pg.query(sql, args); } catch { failed = true; } finally { await pg.exec("reset role"); } check(name, failed); }
const jobRow = id => one("select * from generation_jobs where id=$1", [id]);
const scenes = id => pg.query("select * from scene_executions where job_id=$1 order by scene_order", [id]).then(r => r.rows);
const reserved = id => scalar("select state as value from generation_reservations where job_id=$1", [id]);
const savedKey = process.env.RUNWAYML_API_SECRET;
process.env.RUNWAYML_API_SECRET = "fixture-no-real-requests";
try {
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  for (const file of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) await pg.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
  check("all ten migrations apply", true);
  const service = load("lib/video-ai/server.ts"), workflow = load("lib/workflows/visuals.ts").visualWorkflow;
  async function execute(f) { return new InngestTestEngine({ function: workflow, events: [{ name: "sceenyk/generation.visuals.requested", data: { generationJobId: f.job } }], transformCtx: ctx => ({ ...ctx, runId: f.run, step: { ...ctx.step, sleep: async () => null } }) }).execute(); }
  const f = await fixture(), before = submissions;
  const result = await execute(f);
  check("official durable workflow reaches visuals_ready", result.result?.handoff === "visuals_ready");
  const rows = await scenes(f.job);
  check("one text and one transformation task, reuse is free", submissions - before === 2 && rows.length === 3 && rows[2].provider_task_id === null);
  check("real task IDs persisted before polling", rows.slice(0, 2).every(s => s.provider_task_id && s.submission_started_at));
  check("intermediate assets persisted exactly once", (await scalar("select count(*)::int as value from scene_assets where job_id=$1", [f.job])) === 2 && writes === 2);
  check("reported provider credits remain separate from user credits", Number(rows[0].provider_credits) === 24 && Number(rows[1].provider_cost_usd) === .84);
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
  check("permanent provider failure persists measured zero cost", (await scenes(failed.job)).every(s => s.status === "failed" && Number(s.provider_credits) === 0));
  check("total failure restores original reservation exactly once", await reserved(failed.job) === "released" && (await jobRow(failed.job)).status === "failed");
  check("repeat finalization does not release twice", (await db.rpc("finish_visual_generation", { p_job_id: failed.job, p_run_id: failed.run })).data === "terminal");
  const map = load("lib/video-ai/mapping.ts").mapVisualScenes;
  const partialPlan = structuredClone(f.plan); partialPlan.scenePlan[1].startTime = 1;
  check("selected segment of longer source is unsupported, never whole-video transformed", map(partialPlan, [{ id: f.asset, mimeType: "video/mp4", sizeBytes: 1, durationSeconds: 10 }])[1].error_code === "SOURCE_SEGMENT_REQUIRED");
  check("square text generation is explicitly unsupported", map({ ...f.plan, aspectRatio: "1:1" }, [])[0].error_code === "UNSUPPORTED_ASPECT_RATIO");
  process.env.RUNWAY_MAX_SCENE_USD = ".01";
  check("central cost guard blocks spending", map(f.plan, [])[0].error_code === "COST_GUARD"); delete process.env.RUNWAY_MAX_SCENE_USD;
  const img = structuredClone(f.plan); img.scenePlan[1].durationSeconds = 5;
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
  check("rejected source upload fails scene before any paid submission", !(await service.submitVisualScene(errorScenes[1].id, errors.job, errors.run)).poll && submissions === beforeReject && (await scenes(errors.job))[1].status === "failed");
  rejectUpload = false;
  await service.submitVisualScene(errorScenes[0].id, errors.job, errors.run); pollMode = "missing_output";
  await assert.rejects(service.pollVisualScene(errorScenes[0].id, errors.job, errors.run), /VISUAL_OUTPUT_UNAVAILABLE/);
  check("missing successful output records safe error and measured cost", (await scenes(errors.job))[0].error_code === "INVALID_OUTPUT" && Number((await scenes(errors.job))[0].provider_credits) === 24 && await reserved(errors.job) === "reserved");
  pollMode = "success"; rejectOutput = true;
  await assert.rejects(service.pollVisualScene(errorScenes[0].id, errors.job, errors.run), /VISUAL_OUTPUT_UNAVAILABLE/);
  check("R2 outage preserves provider task and accounting hold", (await scenes(errors.job))[0].error_code === "OUTPUT_PERSISTENCE_FAILED" && !!(await scenes(errors.job))[0].provider_task_id && await reserved(errors.job) === "reserved");
  rejectOutput = false; const beforeResume = submissions;
  await service.pollVisualScene(errorScenes[0].id, errors.job, errors.run);
  check("output persistence resumes without buying another task", submissions === beforeResume && (await scenes(errors.job))[0].status === "completed");
  console.log(JSON.stringify({ passed: checks.length, checks, externalServices: "explicit Runway/R2 fixtures" }, null, 2));
} finally { if (savedKey === undefined) delete process.env.RUNWAYML_API_SECRET; else process.env.RUNWAYML_API_SECRET = savedKey; await pg.close(); }
