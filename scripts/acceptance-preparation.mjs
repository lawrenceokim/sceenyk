// Opt-in hosted acceptance: reserved DEV identity, private synthetic video,
// actual Gemini planning, external FFmpeg worker and ONE guarded fal transform.
// A persisted artifact resumes task IDs rather than purchasing replacements.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import nextEnv from '@next/env';
import { createClerkClient } from '@clerk/backend';
import { InngestTestEngine } from '@inngest/test';
import { typescriptLoader } from './lib/load-typescript.mjs';

assert.ok(process.argv.includes('--real'), 'Pass --real to authorize real hosted acceptance and one guarded paid transform.');
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const require = createRequire(import.meta.url), run = promisify(execFile);
const artifact = path.join(os.tmpdir(), 'sceenyk-preparation-acceptance.json');
let state; try { state = JSON.parse(fs.readFileSync(artifact, 'utf8')); } catch { state = { checks: [] }; }
const save = () => fs.writeFileSync(artifact, JSON.stringify(state, null, 2));
const check = (name, value) => { assert.ok(value, name); if (!state.checks.includes(name)) state.checks.push(name); save(); console.log(JSON.stringify({ passed: name })); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const transport = async (input, init) => {
  if (new URL(String(input)).hostname === 'queue.fal.run' && init?.method === 'POST') {
    const body = JSON.parse(init.body);
    assert.ok(state.preparedKey && new URL(body.video_url).pathname.endsWith('/' + state.preparedKey), 'fal receives prepared private key, never full source');
    state.preparedInputVerified = true; save();
  }
  return fetch(input, init);
};
const load = typescriptLoader({}, { fetch: transport }), db = load('lib/db/server.ts').createDatabaseClient();
const row = async (table, id, key = 'id') => { const r = await db.from(table).select('*').eq(key, id).single(); assert.ok(!r.error, table + ' persisted: ' + r.error?.code); return r.data; };
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, telemetry: { disabled: true } });
let worker, localDir;
try {
  check('hosted migration 012 is applied', !(await db.from('prepared_segments').select('id,normalization,start_ms,end_ms').limit(0)).error);
  assert.equal((await clerk.instance.get()).environmentType, 'development');
  if (!state.clerkUserId) {
    const user = await clerk.users.createUser({ username: 'sceenykprep' + randomUUID().replaceAll('-', '').slice(0, 16), emailAddress: [`sceenyk-prep-${randomUUID()}+clerk_test@example.com`], password: randomUUID() + 'Aa1!', firstName: 'Preparation', lastName: 'Acceptance' });
    state.clerkUserId = user.id; save();
  }
  const user = await clerk.users.getUser(state.clerkUserId);
  assert.ok(user.emailAddresses.some(e => e.emailAddress.includes('+clerk_test@')));
  const upsert = await db.from('app_users').upsert({ clerk_user_id: user.id, email: user.emailAddresses[0].emailAddress, first_name: user.firstName, last_name: user.lastName, image_url: user.imageUrl }, { onConflict: 'clerk_user_id' }).select('*').single();
  assert.ok(!upsert.error); const owner = upsert.data; state.ownerId = owner.id; save();
  const ownedLoad = typescriptLoader({ '@/lib/auth/ensure-app-user': { ensureAppUser: async () => owner }, './dispatch': { attemptGenerationDispatch: async () => {} } });
  const settings = { duration: '10', aspectRatio: '16:9', visualStyle: 'Original', tone: 'Storytelling' };
  const prompt = 'Exactly TWO shots totaling 10 seconds, both using the supplied 12-second video. Shot 1: source transformed, durationSeconds 5, startTime 2, endTime 7, supplied video assetId. Apply a polished 2D cartoon style while preserving movement, camera and framing. Source contains important HUD/UI text; retain source overlay provenance for later composition. Shot 2: source original, durationSeconds 5, startTime 2, endTime 7, SAME supplied video assetId, reuse this exact segment unchanged. No generated shots, no narration, no other assets. Keep descriptions and transformation instructions below 800 characters.';
  state.projectId ??= randomUUID(); save();
  const saved = await ownedLoad('lib/projects/server.ts').saveOwnedProject({ id: state.projectId, mode: state.asset ? 'update' : 'create', title: 'Owned source segment acceptance', category: 'cinematic', prompt, settings });
  assert.ok(saved.ok);
  if (!state.asset) {
    localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sceenyk-prep-acceptance-'));
    const file = path.join(localDir, 'source.mp4');
    await run(require('ffmpeg-static'), ['-v','error','-nostdin','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=12','-an','-vf','drawbox=x=10:y=10:w=120:h=35:color=white:t=3','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',file], { windowsHide: true, timeout: 90_000 });
    const bytes = fs.readFileSync(file), media = ownedLoad('lib/media/server.ts');
    state.uploadRequest ??= randomUUID(); save();
    const authorization = await media.authorizeOwnedUpload({ projectId: state.projectId, requestId: state.uploadRequest, filename: 'synthetic-12-second-source.mp4', kind: 'video', mimeType: 'video/mp4', sizeBytes: bytes.length });
    if (authorization.upload) {
      const result = await fetch(authorization.upload.url, { method: 'PUT', headers: authorization.upload.headers, body: bytes, signal: AbortSignal.timeout(30_000) });
      assert.ok([200,412].includes(result.status)); await result.body?.cancel();
    }
    state.asset = await media.finalizeOwnedUpload({ projectId: state.projectId, assetId: authorization.asset.id }); save();
  }
  check('real owned twelve-second source persists privately', state.asset.status === 'uploaded');
  if (!state.jobId) {
    const quote = await ownedLoad('lib/pricing/server.ts').quoteGeneration({ projectId: state.projectId, requestId: randomUUID(), inputs: { prompt, category: 'cinematic', settings, assetIds: [state.asset.id] } });
    assert.ok(quote.ok && quote.value.eligibleFreeGeneration);
    const accepted = await ownedLoad('lib/generation/server.ts').createGenerationJob({ quoteId: quote.value.id });
    assert.ok(accepted.ok); state.jobId = accepted.value.id; state.analysisRunId = 'preparation-analysis-' + randomUUID(); state.visualRunId = 'preparation-visual-' + randomUUID(); save();
  }
  const initial = await row('generation_jobs', state.jobId);
  if (!initial.production_plan_ready_at) {
    const analysis = await new InngestTestEngine({ function: load('lib/workflows/generation.ts').generationWorkflow, events: [{ name: 'sceenyk/generation.requested', data: { generationJobId: state.jobId } }], steps: [{ id: 'analysis-retry-backoff', handler: () => delay(10_000) }], transformCtx: ctx => ({ ...ctx, runId: state.analysisRunId }) }).execute();
    assert.equal(analysis.result?.handoff, 'production_plan_ready');
  }
  const plan = await row('generation_plans', state.jobId, 'job_id');
  state.planDigest ??= digest(plan); save();
  check('actual Gemini plan selects exactly 2–7 seconds for transform and reuse', plan.plan.scenePlan.length === 2 && plan.plan.scenePlan.every(s => s.assetId === state.asset.id && s.startTime === 2 && s.endTime === 7 && s.durationSeconds === 5) && plan.plan.scenePlan[0].source === 'transformed' && plan.plan.scenePlan[1].source === 'original');
  const sourceBefore = await row('project_assets', state.asset.id), reservationBefore = await row('generation_reservations', state.jobId, 'job_id');
  assert.equal(reservationBefore.state, 'reserved');
  const token = randomBytes(32).toString('hex');
  process.env.MEDIA_WORKER_URL = 'http://127.0.0.1:3012'; process.env.WORKER_SHARED_SECRET = token;
  const tempBefore = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('sceenyk-segment-'));
  worker = spawn(process.execPath, ['--conditions=react-server','--import=tsx','scripts/media-preparation-worker.ts'], { cwd: process.cwd(), env: { ...process.env, MEDIA_PREPARATION_WORKER_PORT: '3012' }, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let ready = false; worker.stdout.on('data', data => { if (data.toString().includes('media_preparation_worker_ready')) ready = true; });
  worker.stderr.on('data', () => {}); // Never emit secret-bearing raw worker diagnostics.
  for (let n=0;n<100&&!ready;n++) { assert.equal(worker.exitCode, null, 'worker starts'); await delay(100); }
  assert.ok(ready, 'worker ready');
  const { signWorkerRequest } = load('lib/media-preparation/auth.ts');
  const call = (input, authorized=true) => {
    const body = JSON.stringify(input), timestamp = String(Date.now());
    return fetch('http://127.0.0.1:3012/prepare', { method:'POST', headers:{'Content-Type':'application/json', ...(authorized?{'x-worker-timestamp':timestamp,'x-worker-signature':signWorkerRequest(token,'POST','/prepare',timestamp,body)}:{})}, body });
  };
  check('external worker rejects unauthenticated calls', (await call({}, false)).status === 401);
  check('worker rejects browser-supplied keys, URLs and timestamps', (await call({sceneExecutionId:randomUUID(),generationJobId:state.jobId,runId:state.visualRunId,storageKey:'arbitrary',startMs:0,url:'https://example.com/video'})).status === 400);
  let scenes = (await db.from('scene_executions').select('*').eq('job_id',state.jobId).order('scene_order')).data;
  const service = load('lib/video-ai/server.ts'), current = await row('generation_jobs',state.jobId);
  if (!current.visuals_ready_at) {
    const claim = await db.rpc('claim_visual_generation',{p_job_id:state.jobId,p_run_id:state.visualRunId});
    assert.ok(!claim.error&&['claimed','resumed'].includes(claim.data));
    await service.prepareVisuals(state.jobId,state.visualRunId);
    scenes=(await db.from('scene_executions').select('*').eq('job_id',state.jobId).order('scene_order')).data;
    const prep = load('lib/media-preparation/client.ts');
    for (const scene of scenes) assert.ok((await prep.prepareVisualSource(scene.id,state.jobId,state.visualRunId)).ready);
    scenes=(await db.from('scene_executions').select('*').eq('job_id',state.jobId).order('scene_order')).data;
  }
  const segment = await row('prepared_segments',scenes[0].prepared_asset_id);
  state.preparedKey = segment.storage_key; state.segmentId = segment.id; state.segmentSceneId = scenes[0].id; save();
  check('transform and reuse share one completed prepared segment', scenes.every(s=>s.prepared_asset_id===segment.id)&&segment.status==='completed'&&segment.attempts===1);
  check('actual probe verifies five seconds from twelve-second source', segment.source_duration_ms===12000 && Math.abs(segment.duration_ms-5000)<=43 && segment.start_ms===2000 && segment.end_ms===7000);
  check('prepared orientation and framing are 640x360 at 24fps', segment.width===640&&segment.height===360&&Number(segment.fps)===24&&segment.source_rotation===0);
  check('reuse completes without provider task and keeps overlay provenance', scenes[1].status==='completed'&&!scenes[1].provider_task_id&&scenes[0].source_overlays.status==='plan_mentions');
  check('FFmpeg temporary files are removed', digest(fs.readdirSync(os.tmpdir()).filter(f=>f.startsWith('sceenyk-segment-')))===digest(tempBefore));
  const own = ownedLoad('lib/media-preparation/owned.ts');
  const reference={projectId:state.projectId,sceneId:scenes[0].id};
  for(let reopen=0;reopen<2;reopen++) {
    const signed=await own.readOwnedPreparedSegment(reference), response=await fetch(signed.url,{signal:AbortSignal.timeout(30_000)});
    assert.equal(response.status,200);const bytes=await response.arrayBuffer();assert.equal(bytes.byteLength,segment.size_bytes);
    const url=new URL(signed.url);assert.equal(url.searchParams.get('X-Amz-Expires'),'900');url.search='';
    const denied=await fetch(url,{signal:AbortSignal.timeout(15_000)});await denied.body?.cancel();assert.ok([400,401,403].includes(denied.status));
  }
  check('reopen resolves private prepared media through fresh fifteen-minute capabilities',true);
  const other=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-hosted-identity-fixture-2.json'),'utf8'));
  const b=await row('app_users',other.clerkUserId,'clerk_user_id');assert.notEqual(b.id,owner.id);
  await assert.rejects(typescriptLoader({'@/lib/auth/ensure-app-user':{ensureAppUser:async()=>b}})('lib/media-preparation/owned.ts').readOwnedPreparedSegment(reference));
  check('User B cannot retrieve User A prepared media',true);
  const otherAcceptance=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'sceenyk-fal-failure-acceptance.json'),'utf8'));
  const otherJob=await row('generation_jobs',otherAcceptance.jobId);assert.notEqual(otherJob.owner_user_id,owner.id);
  const cross=await call({sceneExecutionId:scenes[0].id,generationJobId:otherJob.id});await cross.body?.cancel();
  check('trusted worker rejects scene and job from different owners',cross.status===403);
  check('preparation leaves original source and accounting unchanged', digest(await row('project_assets',state.asset.id))===digest(sourceBefore)&&digest(await row('generation_reservations',state.jobId,'job_id'))===digest(reservationBefore));
  console.log(JSON.stringify({stage:'real_fal_transform',estimatedUsd:scenes[0].estimated_cost_usd}));
  const workflow=load('lib/workflows/visuals.ts').visualWorkflow;
  const execute=runId=>new InngestTestEngine({function:workflow,events:[{name:'sceenyk/generation.visuals.requested',data:{generationJobId:state.jobId}}],transformCtx:ctx=>({...ctx,runId,step:{...ctx.step,sleep:()=>delay(10_000)}})}).execute();
  const result=await execute(state.visualRunId);
  check('real fal transform reaches visuals_ready using prepared segment',!!(await row('generation_jobs',state.jobId)).visuals_ready_at&&(result.result?.handoff==='visuals_ready'||result.result?.claim==='terminal')&&state.preparedInputVerified);
  scenes=(await db.from('scene_executions').select('*').eq('job_id',state.jobId).order('scene_order')).data;
  check('exactly one actual fal task and one generated output persist',scenes[0].status==='completed'&&scenes[0].submission_attempts===1&&!!scenes[0].provider_task_id&&!!scenes[0].output_asset_id&&!scenes[1].provider_task_id);
  const before=digest(scenes);await execute(state.visualRunId);await execute('duplicate-'+randomUUID());
  check('duplicate workflow preserves prepared asset and paid task',digest((await db.from('scene_executions').select('*').eq('job_id',state.jobId).order('scene_order')).data)===before&&digest(await row('prepared_segments',segment.id))===digest(segment));
  check('Gemini plan and customer accounting remain unchanged',digest(await row('generation_plans',state.jobId,'job_id'))===state.planDigest&&digest(await row('generation_reservations',state.jobId,'job_id'))===digest(reservationBefore));
  state.metrics={sourceDurationMs:segment.source_duration_ms,preparedDurationMs:segment.duration_ms,sourceBytes:segment.source_size_bytes,preparedBytes:segment.size_bytes,bytesReductionPercent:Number(((1-segment.size_bytes/segment.source_size_bytes)*100).toFixed(2)),durationReductionPercent:58.33,providerUsage:scenes[0].provider_usage,estimatedUsd:scenes[0].estimated_cost_usd,actualChargeUsd:scenes[0].provider_cost_usd};save();
  console.log(JSON.stringify({passed:state.checks.length,metrics:state.metrics,scope:'real hosted Supabase/R2/Gemini/fal; local external worker; actual charges unverified'},null,2));
} finally {
  worker?.kill();
  if(localDir){const resolved=path.resolve(localDir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('sceenyk-prep-acceptance-'));fs.rmSync(resolved,{recursive:true,force:true});}
}
