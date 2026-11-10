// Focused offline Stage 2 checks. No providers, media, browser, hosted SQL or build.
// Real migrated catalog; synthetic run lineage isolates the new financial guards.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite();
const scalar = async (sql, args = []) => (await pg.query(sql, args)).rows[0]?.value;
const rpc = async (name, args) => {
  await pg.exec('set role service_role');
  try { return await scalar(`select ${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) as value`, Object.values(args)); }
  finally { await pg.exec('reset role'); }
};
const db = { async rpc(name, args) { try { return { data: await rpc(name, args), error: null }; }
  catch (error) { return { data: null, error: { code: error.code, message: error.message } }; } } };
let network = 0;
// Normalize hash fixtures across the TypeScript loader's VM realms; production
// canonicalization/cryptography is unchanged and is not the subject of this check.
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
const load = typescriptLoader({ '@/lib/db/server': { createDatabaseClient: () => db },
  '@/lib/video-generation-package/builder': { canonicalJson: canonical,
    packageDigest: (domain, value) => createHash('sha256').update(`${domain}:v1\n${canonical(value)}`).digest('hex') },
}, {
  Error, // Match the application's shared error realm across isolated test modules.
  fetch: async () => { network++; throw new Error('Unexpected network request'); },
});
const rules = load('lib/accounting/generation-policy.ts');
const policy = load('lib/accounting/generation-policy-server.ts');
const identity = load('lib/final-video-generation-v3/identity.ts');
const previousMode = process.env.HACKATHON_DEMO_MODE;
const hash = () => randomBytes(32).toString('hex');
const fields = duration => ({ title: 'Offline free policy fixture', category: 'product-ad', prompt: 'Offline fixture, no provider request.',
  ugcType: 'advertisement', settings: { duration: String(duration), aspectRatio: '9:16', visualStyle: 'Realistic', tone: 'Professional' } });
const count = owner => scalar('select jsonb_build_array(free_total,free_reserved,free_consumed,credit_available) as value from generation_accounts where owner_user_id=$1', [owner]);
async function project(owner, duration = 5, resolution = '480p') {
  const id = randomUUID();
  await rpc('ugc_v3_create_project', { p_owner: owner, p_project: id, p_fields: fields(duration) });
  if (resolution !== '480p') await pg.query('update projects set video_resolution=$2 where id=$1', [id, resolution]);
  return id;
}
async function runFixture(owner, { duration = 5, resolution = '480p', wholeDuration = duration * 1000, segments = 1 } = {}) {
  const projectId = await project(owner), packageId = randomUUID(), runId = randomUUID(), authorizationId = randomUUID(), quoteId = randomUUID(), segmentUuid = randomUUID();
  const body = { prompt: 'Offline fixture', duration, resolution, generate_audio: true, aspect_ratio: '9:16', output_format: 'mp4' };
  const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString(), packageHash = hash(), segmentHash = hash();
  const auth = { schema: 'v3-paid-authorization-v1', id: authorizationId, projectId, packageId, packageVersion: 1, packageHash, quoteId, segmentUuid,
    segmentId: 'segment-1', segmentVersion: 1, segmentHash, provider: 'higgsfield', model: 'bytedance/seedance-2.5/reference-to-video', resolution,
    durationMs: duration * 1000, generateAudio: true, maxRequests: 1, maxEstimatedCostMicrousd: 2000000, operatorId: owner,
    packageMaxEstimatedCostMicrousd: 2000000, approvedAt: now, expiresAt: expires };
  auth.hash = identity.v3Digest('runtime-authorization', auth);
  const intent = { schema: 'v3-paid-intent-v1', id: randomUUID(), executionId: runId, projectId, packageId, packageVersion: 1, packageHash,
    segmentUuid, segmentId: 'segment-1', segmentVersion: 1, segmentHash, provider: 'higgsfield', model: auth.model,
    requestFingerprint: segmentHash, body, bodyHash: identity.v3BodyHash(body), estimatedCostMicrousd: 1028335, authorization: auth,
    idempotencyKey: randomUUID(), attempt: 1, createdAt: now, deliveryExpiresAt: expires };
  intent.hash = identity.v3Digest('paid-intent', intent);
  // Frozen source/authorization lineage is synthetic here. Existing M5/M6/M7
  // guards are not retested; only Stage 2 admission/settlement is exercised.
  await pg.exec('set session_replication_role=replica');
  try {
    await pg.query('insert into ugc_v3_sources(project_id,revision,input,input_hash,private_bindings,project_input_hash,operator_id) values($1,1,$2,$3,$4,$5,$6)', [projectId, {}, hash(), {}, hash(), owner]);
    await pg.query('insert into ugc_v3_packages(id,project_id,version,source_revision,document,package_hash) values($1,$2,1,1,$3,$4)', [packageId, projectId,
      { source: { storyboardContent: { durationMs: wholeDuration } }, segments: Array.from({ length: segments }, () => ({})) }, packageHash]);
    await pg.query('insert into ugc_v3_quotes(id,project_id,package_id,document) values($1,$2,$3,$4)', [quoteId, projectId, packageId, {}]);
    await pg.query('insert into ugc_v3_run_authorizations(id,project_id,package_id,quote_id,segment_uuid,document) values($1,$2,$3,$4,$5,$6)', [authorizationId, projectId, packageId, quoteId, segmentUuid, auth]);
  } finally { await pg.exec('set session_replication_role=origin'); }
  const insert = () => pg.query("insert into ugc_v3_runs(id,project_id,package_id,segment_uuid,segment_key,authorization_id,intent,state) values($1,$2,$3,$4,'segment-1',$5,$6,'queued')", [runId, projectId, packageId, segmentUuid, authorizationId, intent]);
  return { projectId, packageId, runId, intent, insert };
}
async function videoTask(run) {
  return scalar("insert into ugc_v3_tasks(project_id,kind,request_key,input) values($1,'video',$2,$3) returning id as value", [run.projectId, `video:${run.runId}`, { runId: run.runId }]);
}
async function started(run) {
  const task = await videoTask(run);
  await pg.query("update ugc_v3_tasks set provider_started=true,status='running',lease_until=now()+interval '10 minutes' where id=$1", [task]);
  await pg.query("update ugc_v3_runs set state='submitting' where id=$1", [run.runId]);
  return task;
}
try {
  delete process.env.HACKATHON_DEMO_MODE;
  assert.equal(policy.generationPolicyConfiguration().demoMode, true);
  process.env.HACKATHON_DEMO_MODE = 'false';
  assert.equal(policy.generationPolicyConfiguration().paidGenerationConnected, false);
  rules.assertFreeVideoSettings(5, '480p');
  for (const pair of [[10, '480p'], [5, '720p'], [5, '1080p'], [120, '480p']]) assert.throws(() => rules.assertFreeVideoSettings(...pair));
  process.env.HACKATHON_DEMO_MODE = 'TRUE';
  assert.throws(() => policy.generationPolicyConfiguration());
  process.env.HACKATHON_DEMO_MODE = 'true';
  assert.throws(() => policy.assertLegacyGenerationUnavailable());

  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of fs.readdirSync('supabase/migrations').filter(file => file.endsWith('.sql') && Number(file.match(/(\d{3})00_/)[1]) <= 101).sort()) {
    await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  const a = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  const b = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  const c = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  assert.deepEqual(await count(a), [2, 0, 0, 0]);
  const purchase = await rpc('prepare_credit_purchase', { p_owner_user_id: a, p_pack_id: 'fixture-legacy', p_pack_name: 'Historical purchased credits', p_amount_minor: 1000, p_currency: 'USD', p_credits: 1000 });
  await rpc('attach_paypal_order', { p_purchase_id: purchase.id, p_owner_user_id: a, p_order_id: 'ORDER1234567890' });
  await rpc('fulfil_paypal_purchase', { p_owner_user_id: a, p_order_id: 'ORDER1234567890', p_capture_id: 'CAPTURE1234567890', p_amount_minor: 1000, p_currency: 'USD' });
  const history = await scalar('select jsonb_agg(to_jsonb(x)) as value from credit_ledger x');
  const historical = await runFixture(a, { duration: 10, resolution: '720p' });
  await pg.exec('set session_replication_role=replica');
  try {
    await historical.insert();
    await pg.query("update ugc_v3_runs set state='approved',result=$2,completed_at=now() where id=$1", [historical.runId, { id: historical.runId, mimeType: 'video/mp4', durationMs: 10000 }]);
  } finally { await pg.exec('set session_replication_role=origin'); }
  const oldVideo = await scalar('select to_jsonb(r) as value from ugc_v3_runs r where id=$1', [historical.runId]);
  const migration = fs.readFileSync('supabase/migrations/20261109010200_free_generation_policy.sql', 'utf8');
  await pg.exec(migration); await pg.exec(migration);
  assert.deepEqual(await count(a), [2, 0, 0, 1000]);

  // Disable only old creative-lineage triggers in this disposable fixture. All
  // Stage 2 triggers, constraints, permissions and actual SQL functions stay on.
  const oldTriggers = (await pg.query("select c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in ('ugc_v3_runs','ugc_v3_tasks') and not t.tgisinternal and t.tgname not like 'z_generation_free_%'")).rows;
  for (const trigger of oldTriggers) await pg.exec(`alter table public.${trigger.relname} disable trigger "${trigger.tgname}"`);

  for (const options of [{ duration: 10 }, { resolution: '720p' }, { duration: 5, wholeDuration: 10000, segments: 2 }]) {
    const bad = await runFixture(a, options); await assert.rejects(bad.insert, /GENERATION_LIMIT_5S_480P/);
  }
  const prepProject = await project(b);
  const preparation = () => scalar("insert into ugc_v3_tasks(project_id,kind,request_key,input) values($1,'character',$2,'{}') returning id as value", [prepProject, randomUUID()]);
  const prep = await preparation();
  assert.equal((await policy.generationAccess(b)).preparationRemaining.character, 2);
  await pg.query('update ugc_v3_tasks set provider_started=true where id=$1', [prep]);
  await pg.query('update ugc_v3_tasks set provider_started=true where id=$1', [prep]);
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [prep]);
  const prep2 = await preparation();
  await pg.query('update ugc_v3_tasks set provider_started=true where id=$1', [prep2]);
  await assert.rejects(preparation, /FREE_PREPARATION_LIMIT/);
  await assert.rejects(() => pg.query('delete from generation_free_preparations where task_id=$1', [prep]));
  assert.equal((await policy.generationAccess(b)).preparationRemaining.character, 0);
  const wrongProject = await project(b, 10);
  await assert.rejects(() => pg.query("insert into ugc_v3_tasks(project_id,kind,request_key,input) values($1,'product',$2,'{}')", [wrongProject, randomUUID()]), /GENERATION_LIMIT_5S_480P/);

  const first = await runFixture(a); await first.insert();
  assert.deepEqual(await count(a), [2, 1, 0, 1000]);
  await policy.assertFreeV3Submission(a, first.projectId, first.runId, 5, '480p');
  await policy.assertFreeV3Submission(a, first.projectId, first.runId, 5, '480p');
  assert.deepEqual(await count(a), [2, 1, 0, 1000]);
  await assert.rejects(() => policy.assertFreeV3Submission(b, first.projectId, first.runId, 5, '480p'));
  const Transport = load('lib/final-video-generation-v3/adapters/higgsfield-transport.ts').HiggsfieldV3Transport;
  const transport = new Transport({ enabled: true, credentials: 'fixture:secret', accountScope: 'fixture', outputHosts: [] }, async () => { network++; throw new Error('Unexpected POST'); });
  await assert.rejects(() => transport.submit(first.intent, new AbortController().signal), error => error.code === 'FREE_RESERVATION_REQUIRED' && error.outcome === 'rejected'); // No provider HTTP was sent.
  assert.equal(network, 0);
  await started(first);
  await policy.assertFreeV3Transport(first.projectId, first.runId, first.intent.hash, 5, '480p');
  await assert.rejects(() => policy.assertFreeV3Transport(first.projectId, first.runId, hash(), 5, '480p'));
  await assert.rejects(() => policy.assertFreeV3Transport(first.projectId, first.runId, first.intent.hash, 10, '480p'));
  await pg.query("update ugc_v3_runs set observation=$2,result=$3,state='awaiting_review' where id=$1", [first.runId, { status: 'completed' }, { id: first.runId, mimeType: 'video/mp4' }]);
  assert.deepEqual(await count(a), [2, 0, 1, 1000]);
  await pg.query("update ugc_v3_runs set state='deleting',result=null where id=$1", [first.runId]);
  await pg.query("update ugc_v3_runs set state='deleted' where id=$1", [first.runId]);
  assert.deepEqual(await count(a), [2, 0, 1, 1000]); // Successful regeneration costs a second allowance.

  const second = await runFixture(a); await second.insert();
  assert.deepEqual(await count(a), [2, 1, 1, 1000]);
  const over = await runFixture(a); await assert.rejects(over.insert, /FREE_ALLOWANCE_EXHAUSTED/);
  await pg.query("update ugc_v3_runs set state='failed' where id=$1", [second.runId]);
  await pg.query("update ugc_v3_runs set state='failed' where id=$1", [second.runId]);
  assert.deepEqual(await count(a), [2, 0, 1, 1000]); // No provider started: safe restoration once.
  const third = await runFixture(a); await third.insert(); await started(third);
  await pg.query("update ugc_v3_runs set state='reconciliation_required',observation=$2 where id=$1", [third.runId, { status: 'in_progress' }]);
  assert.deepEqual(await count(a), [2, 1, 1, 1000]);
  await pg.query("update ugc_v3_runs set state='failed',observation=$2 where id=$1", [third.runId, { status: 'failed' }]);
  assert.deepEqual(await count(a), [2, 0, 1, 1000]);
  const fourth = await runFixture(a); await fourth.insert(); const failedTask = await started(fourth);
  await pg.query("update ugc_v3_runs set state='failed',observation=$2 where id=$1", [fourth.runId, { status: 'completed' }]);
  assert.deepEqual(await count(a), [2, 1, 1, 1000]); // A storage/unknown failure cannot refund completed work.
  await pg.query("update ugc_v3_runs set error_code='V3_VIDEO_TECHNICAL_VALIDATION_FAILED' where id=$1", [fourth.runId]);
  await pg.query("insert into ugc_v3_runtime_events(project_id,entity_id,kind,document) values($1,$2,'failed',$3)", [fourth.projectId, failedTask, { outcome: 'unusable', code: 'V3_VIDEO_TECHNICAL_VALIDATION_FAILED' }]);
  assert.deepEqual(await count(a), [2, 0, 1, 1000]); // Proven unusable output restores once.
  const fifth = await runFixture(a); await fifth.insert(); await started(fifth);
  await pg.query("update ugc_v3_runs set observation=$2,result=$3,state='awaiting_review' where id=$1", [fifth.runId, { status: 'completed' }, { id: fifth.runId, mimeType: 'video/mp4' }]);
  assert.deepEqual(await count(a), [2, 0, 2, 1000]);
  const exhausted = await runFixture(a); await assert.rejects(exhausted.insert, /FREE_ALLOWANCE_EXHAUSTED/);
  await assert.rejects(() => pg.query("insert into ugc_v3_tasks(project_id,kind,request_key,input) values($1,'location',$2,'{}')", [fifth.projectId, randomUUID()]), /FREE_ALLOWANCE_EXHAUSTED/);
  assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(x)) as value from credit_ledger x'), history);
  await pg.query('update app_users set first_name=$2 where id=$1', [a, 'Repeat profile sync']);
  assert.deepEqual(await count(a), [2, 0, 2, 1000]);
  assert.deepEqual(await count(c), [2, 0, 0, 0]);
  const legacyProject = await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Unsupported legacy fixture','cinematic','16:9','10','Original','Storytelling') returning id as value", [c]);
  const legacyQuote = await rpc('issue_generation_quote', { p_owner_user_id: c, p_project_id: legacyProject, p_request_id: randomUUID(),
    p_snapshot: { version: 1, prompt: 'Offline fixture', category: 'cinematic', settings: { duration: '10', aspectRatio: '16:9', visualStyle: 'Original', tone: 'Storytelling' }, assetIds: [] },
    p_credit_cost: null, p_pricing_version: 'fixture-v1', p_pricing_mode: 'unconfigured' });
  await assert.rejects(() => rpc('confirm_generation_quote', { p_owner_user_id: c, p_quote_id: legacyQuote.quote.id, p_current_pricing_version: 'fixture-v1' }), /GENERATION_PIPELINE_NOT_SUPPORTED/);
  assert.deepEqual(await count(c), [2, 0, 0, 0]); // Denial rolls back the legacy hold too.
  const rejected = await runFixture(c); await rejected.insert(); const rejectedTask = await started(rejected);
  await pg.query("update ugc_v3_runs set state='failed' where id=$1", [rejected.runId]);
  assert.deepEqual(await count(c), [2, 1, 0, 0]);
  for (let repeat = 0; repeat < 2; repeat++) await pg.query("insert into ugc_v3_runtime_events(project_id,entity_id,kind,document) values($1,$2,'failed',$3)", [rejected.projectId, rejectedTask, { outcome: 'rejected', code: 'HIGGSFIELD_HTTP_429' }]);
  assert.deepEqual(await count(c), [2, 0, 0, 0]);
  await pg.exec(migration);
  assert.deepEqual(await count(a), [2, 0, 2, 1000]);
  assert.deepEqual(await scalar('select to_jsonb(r) as value from ugc_v3_runs r where id=$1', [historical.runId]), oldVideo);
  assert.equal(await scalar('select count(*)::integer as value from generation_free_runs where run_id=$1', [historical.runId]), 0);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await pg.exec(`set role ${role}`);
    try {
      await assert.rejects(() => pg.exec('update generation_accounts set free_consumed=0'));
      await assert.rejects(() => pg.exec("update generation_free_runs set state='released'"));
      if (role !== 'service_role') await assert.rejects(() => pg.query('select generation_free_submit($1,$2,$3)', [a, first.projectId, first.runId]));
    } finally { await pg.exec('reset role'); }
  }
  // Known provider outcomes use the same recovery path; new-submission policy is not consulted.
  const execute = load('lib/final-video-generation-v3/execution.ts').executeV3Segment;
  let posts = 0, published = false;
  await execute({ intent: { ...first.intent, body: { duration: 10, resolution: '720p' } }, state: 'provider_processing', observation: { requestId: randomUUID(), status: 'completed', statusUrl: 'https://example.test/status', resultUrl: 'https://example.test/video', expiresAt: null, correlationId: null, receiptHash: hash(), actualCostMicrousd: null }, result: null }, true, {
    provider: { submit: async () => { posts++; throw new Error('No new submission'); }, reconcile: async value => value, fetchCompletedResult: async () => Buffer.from('offline saved video') },
    beforeSubmit: async () => { throw new Error('Known recovery must not enter policy admission'); },
    checkpoint: async () => {}, readSaved: async () => null, save: async () => {}, validateAndPublish: async () => { published = true; return {}; },
  }, new AbortController().signal);
  assert.equal(posts, 0); assert.equal(published, true); assert.equal(network, 0);
  console.log('Stage 2 focused checks passed: real migrated policy SQL, two lifetime allowances, reservations/settlement/replay, failure vs unknown/unusable results, exhausted paid-credit blocking, bounded preparation, roles, config, transport denial before HTTP and known-request recovery. Zero real provider/network calls.');
} finally {
  if (previousMode === undefined) delete process.env.HACKATHON_DEMO_MODE; else process.env.HACKATHON_DEMO_MODE = previousMode;
  await pg.close();
}
