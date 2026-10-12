// Actual migrations/services/Inngest engine. Provider/storage/auth are explicit
// fixtures; this suite never makes a paid call or claims hosted acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Inngest } from 'inngest';
import { InngestTestEngine } from '@inngest/test';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite(), checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); }
const one = async (sql, args = []) => (await pg.query(sql, args)).rows[0];
const scalar = async (sql, args = []) => (await one(sql, args))?.value;
let queue = Promise.resolve(), paid = 0, writes = 0, providerMode = 'success', storageMode = 'success', user = null, loseCompletion = false;
const objects = new Map();
function serialize(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; }
const db = {
  rpc(name, args = {}) { return serialize(async () => {
    await pg.exec('set role service_role');
    try {
      const value = await scalar(`select ${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) as value`, Object.values(args));
      if (name === 'complete_narration_segment' && loseCompletion) { loseCompletion = false; return { data: null, error: { code: 'LOST_RESPONSE' } }; }
      return { data: value, error: null };
    } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
    finally { await pg.exec('reset role'); }
  }); },
  from(table) {
    const filters = [], args = []; let fields = '*', sort = '';
    return { select(v) { fields = v; return this; }, eq(k, v) { args.push(v); filters.push(`${k}=$${args.length}`); return this; }, order(k) { sort = ` order by ${k}`; return this; },
      then(resolve, reject) { return this.execute(false).then(resolve, reject); }, maybeSingle() { return this.execute(true); },
      execute(single) { return serialize(async () => { const rows = (await pg.query(`select ${fields} from ${table}${filters.length ? ' where ' + filters.join(' and ') : ''}${sort}`, args)).rows; return { data: single ? rows[0] ?? null : rows, error: null }; }); } };
  },
};
let load;
const output = { sizeBytes: 100, etag: 'fixture-etag', durationMs: 4800, sampleRate: 44100, channels: 1 };
load = typescriptLoader({
  '@/lib/db/server': { createDatabaseClient: () => db },
  '@/lib/auth/ensure-app-user': { ensureAppUser: async () => user ? { id: user } : null },
  './storage': {
    async recoverNarration(segment) { if (storageMode === 'read_failure') throw new Error('R2_UNAVAILABLE'); return objects.get(segment.id) ?? null; },
    async persistNarration(segment) { writes++; if (storageMode === 'upload_failure') throw new Error('R2_UNAVAILABLE'); objects.set(segment.id, output); if (storageMode === 'probe_failure') throw new (load('lib/voice-ai/contract.ts').VoiceError)('DURATION_PROBE_FAILED', true); return output; },
  },
  './provider': { async generateNarration(text, config, received) { paid++; const { VoiceError } = load('lib/voice-ai/contract.ts'); if (providerMode !== 'success') throw new VoiceError(providerMode, providerMode === 'RATE_LIMIT'); await received({ requestId: randomUUID(), usage: { characterCost: Array.from(text).length } }); return Buffer.from('fixture'); } },
  '@/lib/storage/r2': { async inspectR2Object(key) { return key.endsWith('.mp3') ? { etag: output.etag, sizeBytes: output.sizeBytes, mimeType: 'audio/mpeg' } : null; }, async signR2Read() { return { url: 'https://private-fixture.invalid/signed', expiresAt: new Date().toISOString() }; } },
  '@/lib/voice-ai/client': { requestNarration: (generationJobId, sceneExecutionId) => load('lib/voice-ai/server.ts').executeNarration({ generationJobId, sceneExecutionId }) },
  '@/lib/workflows/client': { inngest: new Inngest({ id: 'narration-test', isDev: true }) },
});
const config = load('lib/voice-ai/config.ts').getVoiceConfiguration('Storytelling');
const jobRow = id => one('select * from generation_jobs where id=$1', [id]);
const segments = id => pg.query('select * from narration_segments where job_id=$1 order by scene_order', [id]).then(r => r.rows);
const reserved = id => scalar('select state as value from generation_reservations where job_id=$1', [id]);
async function fixture(lines = ['A small beginning.', 'A bright new day.', null]) {
  const owner = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  const project = await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Narration fixture','cinematic','16:9','10','Original','Storytelling') returning id as value", [owner]);
  const asset = randomUUID();
  await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'fixture.png','image/png',1,'image','uploaded','fixture-etag')", [asset, owner, project, randomUUID(), `users/${owner}/projects/${project}/${asset}/${randomUUID()}`]);
  const input = { version: 1, prompt: 'A ten-second narrated story', category: 'cinematic', settings: { duration: '10', aspectRatio: '16:9', visualStyle: 'Original', tone: 'Storytelling' }, assetIds: [asset] };
  const quote = await scalar("select issue_generation_quote($1,$2,$3,$4,null,'fixture','unconfigured') as value", [owner, project, randomUUID(), input]);
  const admitted = await scalar("select confirm_generation_quote($1,$2,'fixture') as value", [owner, quote.quote.id]);
  assert.equal(admitted.code, 'ACCEPTED');
  const job = admitted.job_id, analysisRun = randomUUID();
  await db.rpc('claim_generation_job', { p_job_id: job, p_run_id: analysisRun });
  await db.rpc('advance_generation_analysis', { p_job_id: job, p_run_id: analysisRun, p_stage: 'planning' });
  const attempt = await db.rpc('begin_generation_analysis', { p_job_id: job, p_run_id: analysisRun, p_attempt: 1, p_model: 'fixture' });
  const scene = { purpose: 'Opening', source: 'original', assetId: asset, startTime: null, endTime: null, description: 'A sunny landscape', transformationInstruction: null, caption: null, transition: 'Cut' };
  const plan = { schemaVersion: 1, summary: 'Short story', contentIntent: 'Narration fixture', sourceMediaSummary: [{ assetId: asset, summary: 'Synthetic', durationSeconds: null }], targetDuration: 10, aspectRatio: '16:9', tone: 'Storytelling', visualStyle: 'Original', narrationRequired: lines.some(Boolean), scenePlan: lines.map((line, i) => ({ ...scene, order: i + 1, durationSeconds: i === 0 ? 4 : 3, narration: line })), audioNotes: [], editingNotes: [] };
  const saved = await db.rpc('finish_generation_analysis', { p_job_id: job, p_run_id: analysisRun, p_attempt_id: attempt.data.attempt_id, p_plan: plan, p_usage: {}, p_model: 'fixture', p_response_id: null, p_failure: null });
  assert.ok(saved.data, saved.error?.message);
  const visualRun = randomUUID();
  await db.rpc('claim_visual_generation', { p_job_id: job, p_run_id: visualRun });
  const mapped = load('lib/video-ai/mapping.ts').mapVisualScenes(plan, [{ id: asset, mimeType: 'image/png', sizeBytes: 1 }]);
  const prepared = await db.rpc('prepare_visual_scenes', { p_job_id: job, p_run_id: visualRun, p_scenes: mapped });
  assert.ok(prepared.data, prepared.error?.message);
  assert.equal((await db.rpc('finish_visual_generation', { p_job_id: job, p_run_id: visualRun })).data, 'visuals_ready');
  return { owner, project, job, plan, run: randomUUID() };
}
async function claim(f) { const result = await db.rpc('claim_narration_generation', { p_job_id: f.job, p_run_id: f.run, p_configuration: config }); assert.equal(result.data, 'claimed', result.error?.message); return segments(f.job); }
const execute = f => new InngestTestEngine({ function: load('lib/workflows/narration.ts').narrationWorkflow, events: [{ name: 'sceenyk/generation.narration.requested', data: { generationJobId: f.job } }], transformCtx: ctx => ({ ...ctx, runId: f.run }) }).execute();
const speak = (f, s) => load('lib/voice-ai/server.ts').executeNarration({ generationJobId: f.job, sceneExecutionId: s.scene_execution_id });
const finish = f => db.rpc('finish_narration_generation', { p_job_id: f.job, p_run_id: f.run }).then(r => { assert.ok(!r.error, r.error?.message); return r.data; });
async function denied(name, sql, args = [], role = 'authenticated') { await pg.exec('set role ' + role); let failed = false; try { await pg.query(sql, args); } catch { failed = true; } finally { await pg.exec('reset role'); } check(name, failed); }
const previousKey = process.env.ELEVENLABS_API_KEY;
const previousFalKey = process.env.FAL_KEY;
process.env.ELEVENLABS_API_KEY = 'fixture-never-used-for-http';
process.env.FAL_KEY = 'fixture-no-fal-requests';
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) await pg.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
  check('all migrations including 014 apply', true);
  const f = await fixture(), before = paid;
  const result = await execute(f);
  assert.equal(result.result.handoff, 'audio_ready');
  check('official durable engine generates two distinct spoken scenes', paid === before + 2);
  const rows = await segments(f.job), j = await jobRow(f.job);
  check('silent third scene is persisted skipped without a paid request', rows[2].status === 'skipped' && rows[2].submission_attempts === 0);
  check('integer actual timing and mismatch recorded without truncation', rows[0].actual_duration_ms === 4800 && rows[0].expected_duration_ms === 4000 && rows[0].timing_mismatch);
  check('exact voice/model/configuration/character usage recorded', rows[0].voice_id === config.voiceId && rows[0].model_id === config.modelId && rows[0].provider_usage.characterCost === rows[0].character_count && rows[0].estimated_provider_cost === null);
  check('audio readiness is processing/voice with original hold', j.status === 'processing' && j.current_stage === 'voice' && j.audio_ready_at && await reserved(f.job) === 'reserved');
  check('no final result receipt', await scalar('select count(*)::integer as value from generation_result_receipts where job_id=$1', [f.job]) === 0);
  check('scene links and original immutable plan remain', rows.every((s, i) => s.scene_order === i + 1 && s.text === f.plan.scenePlan[i].narration) && (await one('select plan from generation_plans where job_id=$1', [f.job])).plan.summary === f.plan.summary);
  const duplicate = await execute({ ...f, run: randomUUID() });
  check('duplicate completed delivery has no additional paid speech', duplicate.result.claim === 'terminal' && paid === before + 2);
  const active = await fixture(), activeRows = await claim(active), paidBefore = paid;
  const other = await db.rpc('claim_narration_generation', { p_job_id: active.job, p_run_id: randomUUID(), p_configuration: config });
  check('competing active run cannot claim', other.data === 'duplicate');
  await Promise.all([speak(active, activeRows[0]), speak(active, activeRows[0])]);
  check('concurrent repeated scene delivery gets one paid slot', paid === paidBefore + 1);
  await speak(active, (await segments(active.job))[0]);
  check('completed R2 output reused', paid === paidBefore + 1);
  const missing = await fixture(), missingRows = await claim(missing), missingBefore = paid;
  delete process.env.ELEVENLABS_API_KEY;
  await assert.rejects(() => speak(missing, missingRows[0]), /MISSING_CREDENTIAL/);
  check('missing key persists without paid call or submission slot', paid === missingBefore && (await segments(missing.job))[0].error_code === 'MISSING_CREDENTIAL' && (await segments(missing.job))[0].submission_attempts === 0);
  check('missing key holds accounting at honest pending', await finish(missing) === 'narration_pending' && await reserved(missing.job) === 'reserved');
  process.env.ELEVENLABS_API_KEY = 'fixture-never-used-for-http';
  await speak(missing, (await segments(missing.job))[0]);
  check('configured key resumes unspent segment safely', (await segments(missing.job))[0].status === 'completed');
  const uncertain = await fixture(), uncertainRows = await claim(uncertain), uncertainBefore = paid;
  providerMode = 'UNCERTAIN_SUBMISSION';
  await speak(uncertain, uncertainRows[0]); providerMode = 'success';
  await speak(uncertain, (await segments(uncertain.job))[0]);
  check('unknown provider acceptance is never repurchased', paid === uncertainBefore + 1 && (await segments(uncertain.job))[0].error_code === 'UNCERTAIN_SUBMISSION');
  check('uncertain submission remains pending with hold', await finish(uncertain) === 'narration_pending' && await reserved(uncertain.job) === 'reserved');
  const rate = await fixture(), rateRows = await claim(rate), rateBefore = paid;
  providerMode = 'RATE_LIMIT';
  for (let i = 0; i < 3; i++) await assert.rejects(() => speak(rate, rateRows[0]), /RATE_LIMIT/);
  await speak(rate, rateRows[0]); providerMode = 'success';
  check('explicit rate rejections bounded to three persistent attempts', paid === rateBefore + 3 && (await segments(rate.job))[0].submission_attempts === 3);
  const failed = await fixture(), failedRows = await claim(failed);
  providerMode = 'QUOTA_EXHAUSTED'; await speak(failed, failedRows[0]); providerMode = 'success';
  check('definitive failure safely persists and restores exactly once', await finish(failed) === 'narration_failed' && await finish(failed) === 'terminal' && await reserved(failed.job) === 'released');
  const probe = await fixture(), probeRows = await claim(probe), probeBefore = paid;
  storageMode = 'probe_failure'; await assert.rejects(() => speak(probe, probeRows[0]), /DURATION_PROBE_FAILED/); storageMode = 'success';
  await speak(probe, (await segments(probe.job))[0]);
  check('probe interruption recovers persisted audio without repurchase', paid === probeBefore + 1 && (await segments(probe.job))[0].status === 'completed');
  const lost = await fixture(), lostRows = await claim(lost), lostBefore = paid;
  loseCompletion = true; await assert.rejects(() => speak(lost, lostRows[0]), /DATABASE_UNAVAILABLE/);
  await speak(lost, (await segments(lost.job))[0]);
  check('lost completion reply recovers same asset', paid === lostBefore + 1 && await scalar('select count(*)::integer as value from narration_assets where narration_segment_id=$1', [lostRows[0].id]) === 1);
  const upload = await fixture(), uploadRows = await claim(upload), uploadBefore = paid;
  storageMode = 'upload_failure'; await assert.rejects(() => speak(upload, uploadRows[0]), /OUTPUT_RECOVERY_REQUIRED/); storageMode = 'success';
  await speak(upload, (await segments(upload.job))[0]);
  check('R2 failure before persistence cannot purchase replacement audio', paid === uploadBefore + 1 && await reserved(upload.job) === 'reserved');
  const earlyRead = await fixture(), earlyRows = await claim(earlyRead), earlyBefore = paid;
  storageMode = 'read_failure'; await assert.rejects(() => speak(earlyRead, earlyRows[0]), /OUTPUT_RECOVERY_REQUIRED/); storageMode = 'success';
  await speak(earlyRead, (await segments(earlyRead.job))[0]);
  check('R2 outage before submission can retry its unspent slot', paid === earlyBefore + 1 && (await segments(earlyRead.job))[0].status === 'completed');
  const missingStored = await fixture(), missingStoredRows = await claim(missingStored), storedBefore = paid;
  await speak(missingStored, missingStoredRows[0]); objects.delete(missingStoredRows[0].id);
  await speak(missingStored, (await segments(missingStored.job))[0]);
  check('missing previously completed audio fails safely without repurchase', paid === storedBefore + 1 && await finish(missingStored) === 'narration_failed' && await reserved(missingStored.job) === 'released');
  const guard = await fixture(['x'.repeat(501), 'Short.', null]), guardRows = await claim(guard), guardBefore = paid;
  await speak(guard, guardRows[0]);
  check('development character safety guard blocks paid work', paid === guardBefore && (await segments(guard.job))[0].error_code === 'COST_GUARD');
  const silent = await fixture([null, null, null]), silentBefore = paid;
  delete process.env.ELEVENLABS_API_KEY;
  const silentResult = await execute(silent);
  check('entire silent plan becomes audio ready without key or provider', silentResult.result.handoff === 'audio_ready' && paid === silentBefore);
  user = f.owner;
  const owned = load('lib/voice-ai/owned.ts').readOwnedNarration;
  const read = await owned({ projectId: f.project, sceneId: rows[0].scene_execution_id });
  check('owner reads restored private audio and measured timing', read.actualDurationMs === 4800 && read.url && !('storage_key' in read) && !('provider_usage' in read));
  await assert.rejects(() => owned({ projectId: f.project, sceneId: rows[0].scene_execution_id, voiceId: 'arbitrary' }));
  check('browser voice override rejected', true);
  user = active.owner;
  await assert.rejects(() => owned({ projectId: f.project, sceneId: rows[0].scene_execution_id }));
  check('User B cannot obtain User A narration capability', true);
  user = null;
  await assert.rejects(() => owned({ projectId: f.project, sceneId: rows[0].scene_execution_id }));
  check('signed-out narration read denied', true);
  await assert.rejects(() => speak(active, rows[0]));
  check('mixed job/scene identifiers cannot regenerate another user audio', true);
  await denied('browser cannot read narration', 'select * from narration_segments');
  await denied('browser cannot read private audio metadata', 'select * from narration_assets');
  await denied('browser cannot claim narration', 'select claim_narration_generation($1,$2,$3)', [f.job, randomUUID(), config]);
  await denied('browser cannot mark narration completed', 'select complete_narration_segment($1,$2,$3)', [rows[0].id, f.run, output]);
  await denied('service cannot directly mutate provider task', "update narration_segments set provider_request_id='fake' where id=$1", [rows[0].id], 'service_role');
  await denied('service cannot replace owned asset key', "update narration_assets set storage_key='fake' where id=$1", [rows[0].id], 'service_role');
  check('wrong worker run cannot acquire paid slot', !(await db.rpc('begin_narration_submission', { p_segment_id: activeRows[1].id, p_run_id: randomUUID() })).data);
  check('private audio assets uniquely linked to owned segments', await scalar('select count(*)::integer as value from narration_assets a join narration_segments s on a.narration_segment_id=s.id where a.owner_user_id<>s.owner_user_id or a.job_id<>s.job_id') === 0);
  console.log(JSON.stringify({ checks: checks.length, passed: checks, fixturePaidCalls: paid, fixtureWrites: writes, realProviderCalls: 0 }));
} finally {
  if (previousKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = previousKey;
  if (previousFalKey === undefined) delete process.env.FAL_KEY; else process.env.FAL_KEY = previousFalKey;
  await pg.close();
}
