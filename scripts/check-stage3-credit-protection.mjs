// Essential offline financial/security checks. Synthetic frozen lineage only;
// real SQL accounting triggers remain enabled. No provider or payment HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite();
const scalar = async (sql, args = []) => (await pg.query(sql, args)).rows[0]?.value;
const rpc = async (name, args) => {
  await pg.exec('set role service_role');
  try { return await scalar('select public.' + name + '(' + Object.keys(args).map((key, i) => key + '=>$' + (i + 1)).join(',') + ') as value', Object.values(args)); }
  finally { await pg.exec('reset role'); }
};
const load = typescriptLoader({ '@/lib/db/server': { createDatabaseClient: () => ({
  async rpc(name, args) { try { return { data: await rpc(name, args), error: null }; }
    catch (error) { return { data: null, error: { message: error.message, code: error.code } }; } },
}) } }, { Error });
const policy = load('lib/accounting/generation-policy-server.ts');
const user = () => scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
const project = async owner => {
  const id = randomUUID();
  await rpc('ugc_v3_create_project', { p_owner: owner, p_project: id, p_fields: {
    title: 'Offline credit fixture', category: 'product-ad', prompt: 'No provider request.', ugcType: 'advertisement',
    settings: { duration: '5', aspectRatio: '9:16', visualStyle: 'Realistic', tone: 'Professional' },
  } }); return id;
};
const queue = (id, kind, input = {}) => scalar('insert into ugc_v3_tasks(project_id,kind,request_key,input) values($1,$2,$3,$4) returning id as value',
  [id, kind, randomUUID(), { model: 'fixture-image', directorModel: 'fixture-text', ...input }]);
const lease = async id => { const token = randomUUID(); await pg.query("update ugc_v3_tasks set status='running',lease_token=$2,lease_until=now()+interval '5 minutes' where id=$1", [id, token]); return token; };
const prepare = id => pg.query('update ugc_v3_tasks set provider_started=true where id=$1', [id]);
const dispatch = (id, token) => rpc('free_ai_dispatch', { p_task: id, p_token: token, p_phase: 'default' });
const done = id => pg.query("update ugc_v3_tasks set status='done' where id=$1", [id]);
const account = owner => scalar('select jsonb_build_array(credit_available,credit_reserved) as value from generation_accounts where owner_user_id=$1', [owner]);
const grant = async (owner, credits = 1000) => {
  const purchase = await rpc('prepare_credit_purchase', { p_owner_user_id: owner, p_pack_id: randomUUID(), p_pack_name: 'Existing credits', p_amount_minor: 2000, p_currency: 'USD', p_credits: credits });
  const order = 'ORDER' + randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase();
  const capture = 'CAP' + randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase();
  await rpc('attach_paypal_order', { p_purchase_id: purchase.id, p_owner_user_id: owner, p_order_id: order });
  const args = { p_owner_user_id: owner, p_order_id: order, p_capture_id: capture, p_amount_minor: 2000, p_currency: 'USD' };
  await rpc('fulfil_paypal_purchase', args); await rpc('fulfil_paypal_purchase', args);
  return purchase.id;
};
const exhaust = async owner => {
  for (const kind of ['character', 'product']) {
    const id = await project(owner), t = await queue(id, kind), token = await lease(t);
    await prepare(t); await dispatch(t, token); await done(t);
  }
};
const quote = (owner, id, run, bodyHash = 'a'.repeat(64), cost = 1030000) => rpc('generation_paid_quote', {
  p_owner: owner, p_project: id, p_run: run, p_model: 'bytedance/seedance-2.5/reference-to-video', p_body_hash: bodyHash, p_response_hash: 'b'.repeat(64), p_cost: cost,
});
// Bypass ONLY creative source/authorization construction in the fixture. The
// actual financial admission trigger is ALWAYS enabled, including in replica.
const run = async (owner, id, { priced = true, cost = 1030000, duration = 5, resolution = '480p' } = {}) => {
  const rid = randomUUID(), packageId = randomUUID();
  if (priced) await quote(owner, id, rid, 'a'.repeat(64), cost);
  await pg.exec('begin; set local session_replication_role=replica');
  try {
    await pg.query('insert into ugc_v3_packages(id,project_id,source_revision,version,document,package_hash) values($1,$2,1,1,$3,$4)',
      [packageId, id, { source: { storyboardContent: { durationMs: duration * 1000 } }, segments: [{}] }, randomUUID().replaceAll('-', '').repeat(2)]);
    await pg.query('insert into ugc_v3_runs(id,project_id,package_id,segment_uuid,segment_key,authorization_id,intent,state) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [rid, id, packageId, randomUUID(), randomUUID(), randomUUID(), { model: 'bytedance/seedance-2.5/reference-to-video', hash: 'c'.repeat(64), bodyHash: 'a'.repeat(64), estimatedCostMicrousd: 1028335,
        authorization: { resolution }, body: { duration, resolution } }, 'queued']);
    await pg.exec('set local session_replication_role=origin');
    await scalar('select public.generation_free_reserve($1) as value', [rid]);
    await pg.exec('commit'); return rid;
  } catch (error) { await pg.exec('rollback'); throw error; }
};
const submit = async (id, rid) => {
  const task = await queue(id, 'video', { runId: rid }), token = await lease(task); await prepare(task);
  await pg.query("update ugc_v3_runs set state='submitting' where id=$1", [rid]);
  assert.equal(await rpc('generation_free_transport', { p_project: id, p_run: rid, p_hash: 'c'.repeat(64) }), true);
  return { task, token };
};
const observe = (rid, status) => pg.query('update ugc_v3_runs set observation=$2 where id=$1', [rid, { requestId: randomUUID(), status }]);
const correction = fs.readFileSync('supabase/migrations/20261110010700_generation_access_funding_separation.sql', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261110010600_paid_video_credit_protection.sql', 'utf8') + '\n' + correction;
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls');
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && Number(f.match(/(\d{3})00_/)[1]) <= 105).sort())
    await pg.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
  const lockBefore = await scalar("select pg_get_functiondef('public.ugc_v3_creative_lock_guard()'::regprocedure) as value");
  const purchaseBefore = await scalar("select pg_get_functiondef('public.fulfil_paypal_purchase(uuid,text,text,integer,text)'::regprocedure) as value");
  const triggers = (await pg.query("select tgname from pg_trigger where tgrelid='public.ugc_v3_tasks'::regclass and not tgisinternal and tgname not like 'z_generation_free_%' and tgname not in ('z_free_ai_release','a_v3_creative_lock','ugc_v3_reference_cleanup_intent','ugc_v3_reference_cleanup_enqueue')")).rows;
  for (const row of triggers) await pg.exec('alter table ugc_v3_tasks disable trigger "' + row.tgname + '"');
  // Frozen creative-state update guards do not admit synthetic packages. Keep
  // every financial trigger; only these old creative fixtures are synthetic.
  for (const row of (await pg.query("select tgname from pg_trigger where tgrelid='public.ugc_v3_runs'::regclass and not tgisinternal and tgname not like 'z_generation_free_%'")).rows)
    await pg.exec('alter table ugc_v3_runs disable trigger "' + row.tgname + '"');
  const oldOwner = await user(), freeProject = await project(oldOwner), freeTask = await queue(freeProject, 'storyboard'), ft = await lease(freeTask);
  await prepare(freeTask); await dispatch(freeTask, ft); await done(freeTask); await grant(oldOwner);
  const before = await scalar('select jsonb_agg(to_jsonb(l) order by id) as value from credit_ledger l');
  const freeBefore = await scalar('select to_jsonb(a) as value from free_ai_accounts a where owner_user_id=$1', [oldOwner]);
  await pg.exec(migration); await pg.exec(migration);
  await pg.exec('alter table ugc_v3_runs enable always trigger z_generation_free_admit');
  assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(l)-\'v3_run_id\' order by id) as value from credit_ledger l'), before);
  assert.deepEqual(await scalar('select to_jsonb(a) as value from free_ai_accounts a where owner_user_id=$1', [oldOwner]), freeBefore);
  assert.equal(await scalar("select pg_get_functiondef('public.ugc_v3_creative_lock_guard()'::regprocedure) as value"), lockBefore);
  assert.equal(await scalar("select pg_get_functiondef('public.fulfil_paypal_purchase(uuid,text,text,integer,text)'::regprocedure) as value"), purchaseBefore);
  assert.equal((await policy.generationAccess(oldOwner, freeProject)).funding, 'free');
  const freeRun = await run(oldOwner, freeProject, { priced: false });
  const freeVideo = await submit(freeProject, freeRun); await observe(freeRun, 'completed'); await done(freeVideo.task);
  const freeAccess = await policy.generationAccess(oldOwner, freeProject);
  assert.equal(freeAccess.budgetUsedMicrousd, 1030000); assert.equal(freeAccess.videoAllowed, false);
  assert.equal(freeAccess.consumed, 1); assert.deepEqual(await account(oldOwner), [1000, 0]);

  const owner = await user(); await grant(owner); await exhaust(owner);
  const id = await project(owner);
  assert.equal((await policy.generationAccess(owner, id)).paidBlocker, 'HIGGSFIELD_GLOBAL_SPENDING_LIMIT');
  const noPaidBudget = await queue(id, 'product');
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [noPaidBudget]);
  assert.deepEqual(await account(owner), [1000, 0]); // OpenAI is independent of paid caps.
  await assert.rejects(() => run(owner, id), /HIGGSFIELD_GLOBAL_SPENDING_LIMIT/);
  await pg.exec('update generation_paid_policy set user_cap_microusd=10300000,global_cap_microusd=20600000');
  assert.equal((await policy.generationAccess(owner, id)).funding, 'credits');
  const prep = await queue(id, 'storyboard'), pt = await lease(prep); await prepare(prep); await dispatch(prep, pt);
  await assert.rejects(() => dispatch(prep, pt), /FREE_RESERVATION_REQUIRED/); await done(prep);
  assert.equal((await policy.generationAccess(owner, id)).consumed, 2);
  assert.deepEqual(await account(owner), [1000, 0]);
  await assert.rejects(() => run(owner, id, { priced: false }), /PAID_PROVIDER_PRICE_REQUIRED/);
  await assert.rejects(() => run(owner, id, { cost: 1040000 }), /PAID_PROVIDER_PRICE_CHANGED/);
  await assert.rejects(() => run(owner, id, { duration: 10 }), /GENERATION_LIMIT_5S_480P/);
  const first = await run(owner, id); assert.deepEqual(await account(owner), [897, 103]);
  assert.equal(await scalar('select public.generation_free_reserve($1) as value', [first]), true);
  assert.deepEqual(await account(owner), [897, 103]);
  const { task, token } = await submit(id, first);
  await assert.rejects(() => dispatch(task, token), /PAID_RESERVATION_REQUIRED/);
  await assert.rejects(() => dispatch(task, randomUUID()), /V3_LEASE_LOST/);
  await observe(first, 'queued'); await observe(first, 'in_progress');
  await pg.query("update ugc_v3_runs set state='reconciliation_required' where id=$1", [first]);
  await done(task); // Unknown/accepted work cannot be refunded by task status.
  assert.deepEqual(await account(owner), [897, 103]);
  await pg.exec(migration); assert.deepEqual(await account(owner), [897, 103]);
  await observe(first, 'completed'); await observe(first, 'completed');
  assert.deepEqual(await account(owner), [897, 0]);
  await observe(first, 'failed'); // Terminal consumed history cannot re-credit.
  assert.deepEqual(await account(owner), [897, 0]);
  assert.equal(await scalar("select count(*)::int as value from credit_ledger where v3_run_id=$1 and type='consumption'", [first]), 1);
  await assert.rejects(() => scalar('select public.generation_free_reserve($1) as value', [first]), /PAID_RESERVATION_REQUIRED/);

  for (const status of ['failed', 'nsfw', 'canceled']) {
    const pid = await project(owner), r = await run(owner, pid); await submit(pid, r);
    await observe(r, 'queued'); await observe(r, status); await observe(r, status);
    assert.deepEqual(await account(owner), [897, 0]);
    assert.equal(await scalar("select count(*)::int as value from credit_ledger where v3_run_id=$1 and type='release'", [r]), 1);
  }
  // Proven nonacceptance despite dispatch fence is eligible; no accepted receipt.
  const rejectProject = await project(owner), rejectedRun = await run(owner, rejectProject), rejectedTask = await submit(rejectProject, rejectedRun);
  await pg.query("insert into ugc_v3_runtime_events(project_id,entity_id,kind,document) values($1,$2,'failed',$3)", [rejectProject, rejectedTask.task, { outcome: 'rejected' }]);
  assert.deepEqual(await account(owner), [897, 0]);
  // Unstarted task failure safely restores a hold; no provider-status invention.
  const unusedProject = await project(owner), unused = await run(owner, unusedProject), unusedTask = await queue(unusedProject, 'video', { runId: unused });
  await lease(unusedTask); await prepare(unusedTask);
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [unusedTask]);
  assert.deepEqual(await account(owner), [897, 0]);

  // Cap totals include consumed + unknown/reserved work across owners.
  await pg.query('insert into generation_paid_user_caps values($1,1030000)', [owner]);
  assert.equal((await policy.generationAccess(owner, id)).paidBlocker, 'HIGGSFIELD_USER_SPENDING_LIMIT');
  await assert.rejects(async () => run(owner, await project(owner)), /HIGGSFIELD_USER_SPENDING_LIMIT/);
  await pg.query('update generation_paid_user_caps set cap_microusd=2060000 where owner_user_id=$1', [owner]);
  const heldProject = await project(owner), held = await run(owner, heldProject);
  await pg.exec('update generation_paid_policy set global_cap_microusd=2060000');
  const other = await user(); await grant(other); await exhaust(other);
  await assert.rejects(async () => run(other, await project(other)), /HIGGSFIELD_GLOBAL_SPENDING_LIMIT/);
  const heldTask = await queue(heldProject, 'video', { runId: held }); const heldToken = await lease(heldTask); await prepare(heldTask);
  await pg.exec('update generation_paid_policy set global_cap_microusd=1030000');
  await assert.rejects(() => dispatch(heldTask, heldToken), /HIGGSFIELD_GLOBAL_SPENDING_LIMIT/);
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [heldTask]);
  assert.deepEqual(await account(owner), [897, 0]);
  await pg.exec('update generation_paid_policy set global_cap_microusd=20600000');

  // One wallet shared with Sandbox fulfilment; no top-up resets usage/caps.
  const poor = await user(); await grant(poor, 102); await exhaust(poor); const poorProject = await project(poor);
  assert.equal((await policy.generationAccess(poor, poorProject)).shortageCredits, 1);
  const fundedByPlatform = await queue(poorProject, 'storyboard'), platformToken = await lease(fundedByPlatform);
  await prepare(fundedByPlatform); await dispatch(fundedByPlatform, platformToken); await done(fundedByPlatform);
  assert.deepEqual(await account(poor), [102, 0]);
  await grant(poor, 1); assert.equal((await policy.generationAccess(poor, poorProject)).videoAllowed, true);
  const poorRun = await run(poor, poorProject); assert.deepEqual(await account(poor), [0, 103]);
  await assert.rejects(async () => run(poor, await project(poor)), /INSUFFICIENT_CREDITS/);
  const poorTask = await queue(poorProject, 'video', { runId: poorRun }); await lease(poorTask); await prepare(poorTask);
  await pg.query("update generation_paid_quotes set verified_at=now()-interval '6 minutes' where run_id=$1", [poorRun]);
  await assert.rejects(async () => dispatch(poorTask, await scalar('select lease_token as value from ugc_v3_tasks where id=$1', [poorTask])), /PAID_PROVIDER_PRICE_REQUIRED/);
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [poorTask]);
  assert.deepEqual(await account(poor), [103, 0]);
  assert.equal((await policy.generationAccess(poor, poorProject)).consumed, 2);
  await assert.rejects(() => rpc('generation_project_access', { p_owner: other, p_project: id }), /FRESH_V3_PROJECT_REQUIRED/);
  await assert.rejects(() => quote(other, id, randomUUID()), /PAID_PROVIDER_PRICE_CHANGED/);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await pg.exec('set role ' + role);
    try {
      await assert.rejects(() => pg.query('update generation_paid_policy set global_cap_microusd=90000000'), /permission denied/);
      await assert.rejects(() => pg.query('delete from generation_paid_reservations'), /permission denied/);
      await assert.rejects(() => scalar('select public.generation_paid_settle($1,true) as value', [first]), /permission denied/);
      await assert.rejects(() => scalar('select public.stage2_free_ai_reserve($1) as value', [id]), /permission denied/);
      if (role !== 'service_role') await assert.rejects(() => scalar('select public.generation_paid_quote($1,$2,$3,$4,$5,$6,$7) as value',
        [owner, id, randomUUID(), 'bytedance/seedance-2.5/reference-to-video', 'a'.repeat(64), 'b'.repeat(64), 1030000]), /permission denied/);
    } finally { await pg.exec('reset role'); }
  }
  await assert.rejects(() => pg.query('delete from generation_paid_reservations where run_id=$1', [first]), /immutable/);
  await assert.rejects(() => pg.query('delete from credit_ledger where v3_run_id=$1', [first]), /immutable/);
  // Exact request estimation is injected; no real API credential or transport.
  let estimateUsd = '1.028335', estimateCount = 0;
  const pricingLoad = typescriptLoader({
    '@/lib/db/server': { createDatabaseClient: () => ({ async rpc(name, args) { return { data: await rpc(name, args), error: null }; } }) },
    '@/lib/final-video-generation-v3/adapters/higgsfield-transport': { HiggsfieldV3Transport: class {
      async estimate(model, body) {
        estimateCount++; assert.equal(model, 'bytedance/seedance-2.5/reference-to-video');
        assert.equal(body.image_urls[0], 'https://fixture.invalid/exact-signed-input');
        return { usd: estimateUsd, responseHash: 'f'.repeat(64) };
      }
    } },
    '@/lib/final-video-generation-v3/runtime-config': { v3TransportConfig: () => ({}) },
    './generation-policy-server': policy,
  }, { Error });
  const pricing = pricingLoad('lib/accounting/paid-video-pricing.ts');
  assert.equal(pricing.providerUsdMicrousd('1.028335'), 1028335);
  assert.equal(pricing.providerUsdMicrousd('1.030000000001'), 1030001);
  assert.throws(() => pricing.providerUsdMicrousd('NaN'), /PAID_PROVIDER_PRICE_REQUIRED/);
  const exactIntent = { projectId: poorProject, executionId: randomUUID(), model: 'bytedance/seedance-2.5/reference-to-video', bodyHash: 'e'.repeat(64),
    body: { duration: 5, resolution: '480p', image_urls: ['https://fixture.invalid/exact-signed-input'] }, authorization: { maxEstimatedCostMicrousd: 1240000 } };
  await pricing.verifyPaidVideoPrice(poor, exactIntent, AbortSignal.timeout(1000));
  assert.equal(await scalar('select cost_microusd::int as value from generation_paid_quotes where run_id=$1', [exactIntent.executionId]), 1028335);
  estimateUsd = '1.04'; await assert.rejects(() => pricing.verifyPaidVideoPrice(poor, exactIntent, AbortSignal.timeout(1000)), /PAID_PROVIDER_PRICE_CHANGED/);
  estimateUsd = '1.00'; await assert.rejects(() => pricing.verifyPaidVideoPrice(poor, exactIntent, AbortSignal.timeout(1000)), /PAID_PROVIDER_PRICE_CHANGED/);
  await pricing.verifyPaidVideoPrice(oldOwner, { ...exactIntent, projectId: freeProject }, AbortSignal.timeout(1000));
  assert.equal(estimateCount, 3); // Free video path never calls the paid estimator.
  // Reproduce the reported 147-credit account without changing genuine history:
  // account-level free review + an existing project hold + two deleted starts.
  const reviewed = await user(); await grant(reviewed, 147);
  const historical = await project(reviewed), characterTasks = [];
  for (let i = 0; i < 2; i++) {
    const t = await queue(historical, 'character'), token = await lease(t);
    await prepare(t); await dispatch(t, token); await done(t); characterTasks.push(t);
  }
  await pg.query('delete from ugc_v3_tasks where id=any($1::uuid[])', [characterTasks]);
  await pg.query('update free_ai_accounts set review_required=true where owner_user_id=$1', [reviewed]);
  await pg.query('update free_ai_projects set historical_review=true where project_id=$1', [historical]);
  const heldHistory = await scalar('select to_jsonb(p) as value from free_ai_projects p where project_id=$1', [historical]);
  const reviewedCounters = await scalar('select to_jsonb(a) as value from free_ai_accounts a where owner_user_id=$1', [reviewed]);
  await pg.exec(correction); await pg.exec(correction);
  const blocked = await policy.generationAccess(reviewed, historical);
  assert.equal(blocked.historyReview, true); assert.equal(blocked.projectReviewRequired, true);
  assert.equal(blocked.preparationAllowed, false); assert.equal(blocked.projectAllowed, false);
  await assert.rejects(() => queue(historical, 'product'), /FREE_PROJECT_HISTORY_REVIEW_REQUIRED/);
  await assert.rejects(() => queue(historical, 'character'), /FREE_PROJECT_HISTORY_REVIEW_REQUIRED/);
  const fresh = await project(reviewed), independent = await policy.generationAccess(reviewed, fresh);
  assert.equal(independent.historyReview, true); assert.equal(independent.projectReviewRequired, false);
  assert.equal(independent.projectAllowed, true); assert.equal(independent.preparationAllowed, true);
  assert.equal(independent.funding, 'credits'); assert.equal(independent.videoAllowed, true);
  assert.equal(independent.requiredCredits, 103); assert.equal(independent.preparationRemaining.character, 0);
  await assert.rejects(() => queue(fresh, 'character'), /FREE_PREPARATION_LIMIT/);
  const product = await queue(fresh, 'product'), productToken = await lease(product);
  await prepare(product); await dispatch(product, productToken); await done(product);
  assert.deepEqual(await account(reviewed), [147, 0]);
  const reviewedRun = await run(reviewed, fresh); assert.deepEqual(await account(reviewed), [44, 103]);
  await submit(fresh, reviewedRun); await observe(reviewedRun, 'completed');
  assert.deepEqual(await account(reviewed), [44, 0]);
  assert.deepEqual(await scalar('select to_jsonb(a) as value from free_ai_accounts a where owner_user_id=$1', [reviewed]), reviewedCounters);
  assert.deepEqual(await scalar('select to_jsonb(p) as value from free_ai_projects p where project_id=$1', [historical]), heldHistory);
  // Unmapped old approved evidence cannot be silently enrolled as paid access.
  const unmapped = await project(reviewed), artifactId = randomUUID();
  await pg.exec('begin; set local session_replication_role=replica');
  await pg.query("insert into ugc_v3_artifacts(id,task_id,project_id,kind,version,document,approved_at) values($1,$3,$2,'character',1,'{}',now())", [artifactId, unmapped, randomUUID()]);
  await pg.exec('commit');
  const unmappedAccess = await policy.generationAccess(reviewed, unmapped);
  assert.equal(unmappedAccess.projectReviewRequired, true); assert.equal(unmappedAccess.videoAllowed, false);
  await assert.rejects(() => queue(unmapped, 'product'), /FREE_PROJECT_HISTORY_REVIEW_REQUIRED/);
  assert.equal(await scalar('select count(*)::int as value from generation_paid_projects where project_id=$1', [unmapped]), 0);
  assert.equal(await scalar('select approved_at is not null as value from ugc_v3_artifacts where id=$1', [artifactId]), true);
  // Even zero credits/caps do not purchase or block OpenAI preparation.
  const empty = await user(); await exhaust(empty);
  await pg.query('update free_ai_accounts set review_required=true where owner_user_id=$1', [empty]);
  await pg.exec('update generation_paid_policy set global_cap_microusd=0,user_cap_microusd=0');
  const emptyProject = await project(empty), emptyAccess = await policy.generationAccess(empty, emptyProject);
  assert.equal(emptyAccess.historyReview, true);
  assert.equal(emptyAccess.preparationAllowed, true); assert.equal(emptyAccess.videoAllowed, false);
  const platformTask = await queue(emptyProject, 'storyboard'), platformLease = await lease(platformTask);
  await prepare(platformTask); await dispatch(platformTask, platformLease); await done(platformTask);
  assert.deepEqual(await account(empty), [0, 0]);
  await assert.rejects(() => run(empty, emptyProject), /HIGGSFIELD_GLOBAL_SPENDING_LIMIT/);
  const explain = load('lib/accounting/generation-unavailability.ts').generationUnavailability;
  assert.match(explain({ ...blocked, ready: true, reason: null, settingsSupported: true }, 'product').join(' '), /historical AI usage needs review/);
  assert.match(explain({ ...independent, ready: true, reason: null, settingsSupported: true }, 'character').join(' '), /both lifetime platform-funded starts/);
  assert.equal(explain({ ...emptyAccess, ready: true, reason: null, settingsSupported: true }, 'storyboard').length, 0);
  assert.match(explain({ ...emptyAccess, ready: true, reason: null, settingsSupported: true }, 'video').join(' '), /platform video spending limit/);
  // Every wallet equals the append-only ledger, including exactly-once purchases.
  assert.equal(await scalar(`select count(*)::int as value from generation_accounts a where
    a.credit_available<>(select coalesce(sum(available_delta),0) from credit_ledger where owner_user_id=a.owner_user_id)
    or a.credit_reserved<>(select coalesce(sum(reserved_delta),0) from credit_ledger where owner_user_id=a.owner_user_id)`), 0);
  console.log('PASS: 106/107 reruns/history, 147-credit review reproduction, separate project/free review, platform-funded preparation independent of wallet/caps, retained attempt tombstones, protected historical projects, paid holds/settlement, pricing/caps, wallet/ledger reconciliation and role/owner denial. Synthetic lineage; zero real provider calls.');
} catch (error) {
  console.error(error.message, error.code ?? '', error.where ?? '', error.position ?? '', error.stack ?? ''); process.exitCode = 1;
} finally { await pg.close(); }
