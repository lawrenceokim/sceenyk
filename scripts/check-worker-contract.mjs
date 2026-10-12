// Actual context/client code with explicit database/transport fixtures. No live
// services or paid calls. SQL constraints/idempotency run in test:visuals.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { typescriptLoader } from './lib/load-typescript.mjs';

const checks = [], check = (name, value) => { assert.ok(value, name); checks.push(name); };
const jobId = randomUUID(), sceneId = randomUUID(), owner = randomUUID(), projectId = randomUUID(), assetId = randomUUID();
let outage = false, mutations = 0;
const rows = {
  generation_jobs: { id: jobId, visual_run_id: 'persisted-run', status: 'processing', current_stage: 'generating', owner_user_id: owner, project_id: projectId, input_snapshot: { assetIds: [assetId] } },
  projects: { id: projectId, owner_user_id: owner },
  generation_reservations: { job_id: jobId, owner_user_id: owner, state: 'reserved' },
  scene_executions: { id: sceneId, job_id: jobId, owner_user_id: owner, project_id: projectId, preparation_required: true, status: 'pending', input_asset_id: assetId },
  generation_plans: { job_id: jobId, owner_user_id: owner, plan: {} },
  project_assets: { id: assetId, owner_user_id: owner, project_id: projectId, upload_status: 'uploaded', verified_etag: 'verified', storage_key: `users/${owner}/projects/${projectId}/${assetId}/${randomUUID()}` },
};
const db = {
  from(table) {
    const filters = [];
    return { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, async maybeSingle() {
      const row = rows[table];
      return { data: !row || !filters.every(([key, value]) => row[key] === value) ? null : row, error: outage ? { code: 'FIXTURE_OUTAGE' } : null };
    } };
  },
  async rpc() { mutations++; return { data: true, error: null }; },
};
const load = typescriptLoader({ '@/lib/db/server': { createDatabaseClient: () => db } });
const { resolveWorkerPreparation, loadPreparation } = load('lib/media-preparation/context.ts');
const ids = { generationJobId: jobId, sceneExecutionId: sceneId };
const resolved = await resolveWorkerPreparation(ids);
check('worker derives run claim from Supabase instead of caller', resolved.runId === 'persisted-run' && resolved.jobId === jobId && resolved.sceneId === sceneId);
check('authoritative owned context loads', (await loadPreparation(resolved)).source.id === assetId);
await assert.rejects(resolveWorkerPreparation({ ...ids, runId: 'browser-run' }));
check('request cannot override persisted run claim', true);
for (const table of ['projects', 'generation_reservations', 'scene_executions', 'generation_plans']) {
  const previous = rows[table].owner_user_id;
  rows[table].owner_user_id = randomUUID();
  await assert.rejects(loadPreparation(resolved), /SOURCE_UNAVAILABLE/);
  rows[table].owner_user_id = previous;
}
check('foreign project/reservation/scene/plan denied before processing', mutations === 0);
await assert.rejects(loadPreparation({ ...resolved, sceneId: randomUUID() }), /SOURCE_UNAVAILABLE/);
await assert.rejects(resolveWorkerPreparation({ ...ids, generationJobId: randomUUID() }), /SOURCE_UNAVAILABLE/);
check('mixed job and scene identifiers cannot select another owner media', true);
const originalOwner = rows.project_assets.owner_user_id;
rows.project_assets.owner_user_id = randomUUID();
const unavailable = await loadPreparation(resolved);
check('foreign source fails scene before downloading bytes', unavailable.scene.status === 'failed' && unavailable.source === null && mutations === 1);
rows.project_assets.owner_user_id = originalOwner;
for (const [key, value] of [['status', 'failed'], ['current_stage', 'planning'], ['visual_run_id', 'another-run']]) {
  const previous = rows.generation_jobs[key]; rows.generation_jobs[key] = value;
  await assert.rejects(loadPreparation(resolved), /SOURCE_UNAVAILABLE/);
  rows.generation_jobs[key] = previous;
}
rows.generation_jobs.visual_run_id = null;
await assert.rejects(resolveWorkerPreparation(ids), /SOURCE_UNAVAILABLE/);
rows.generation_jobs.visual_run_id = 'persisted-run';
check('terminal/wrong-stage/wrong-claim/unclaimed jobs denied', true);
outage = true;
await assert.rejects(resolveWorkerPreparation(ids), /PREPARATION_DATABASE_UNAVAILABLE/);
outage = false;
check('database outage stays retryable', true);

let calls = 0, saved = 0;
const secret = randomBytes(32).toString('hex');
const fixtureContext = { scene: rows.scene_executions, db: { async rpc() { saved++; return { error: null }; } } };
const clientLoad = typescriptLoader({
  './context': { loadPreparation: async input => { assert.equal(input.runId, 'persisted-run'); return fixtureContext; } },
  './config': { workerConnection: () => ({ url: 'https://worker.invalid/prepare', secret }), preparationLimits: { requestMs: 240000 } },
}, { fetch: async (url, init) => {
  calls++;
  assert.equal(url, 'https://worker.invalid/prepare');
  assert.deepEqual(JSON.parse(init.body), ids);
  assert.equal(init.headers['x-worker-signature'], createHmac('sha256', secret).update(`POST\n/prepare\n${init.headers['x-worker-timestamp']}\n`).update(init.body).digest('hex'));
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, undefined);
  if (calls === 1) throw Error('fixture lost response after preparation');
  return { ok: true, json: async () => ({ ready: true }) };
} });
const { prepareVisualSource } = clientLoad('lib/media-preparation/client.ts');
await assert.rejects(prepareVisualSource(sceneId, jobId, 'persisted-run'), /PREPARATION_UNAVAILABLE/);
check('lost response preserves retryable pending state', saved === 1);
check('retry sends same identifiers with valid HMAC and accepts persisted readiness', (await prepareVisualSource(sceneId, jobId, 'persisted-run')).ready && calls === 2);
fixtureContext.scene = { ...rows.scene_executions, provider_task_id: 'persisted-paid-task' };
check('existing paid identity never sends another preparation request', (await prepareVisualSource(sceneId, jobId, 'persisted-run')).ready && calls === 2);
console.log(JSON.stringify({ passed: checks.length, checks, scope: 'actual context/client; explicit database/transport fixtures' }, null, 2));
