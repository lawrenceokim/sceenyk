// Focused 105 financial checks. Synthetic lineage; no provider/media/network I/O.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';
const pg = new PGlite(), previousDemo = process.env.HACKATHON_DEMO_MODE;
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
const { generationCreditsFromMicrousd } = load('lib/payments/credit-pricing.ts');
const user = () => scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
const project = async owner => { const id = randomUUID(); await rpc('ugc_v3_create_project', { p_owner: owner, p_project: id, p_fields: {
  title: 'Offline budget fixture', category: 'product-ad', prompt: 'No provider request.', ugcType: 'advertisement',
  settings: { duration: '5', aspectRatio: '9:16', visualStyle: 'Realistic', tone: 'Professional' },
} }); return id; };
const access = (owner, id = null) => rpc('generation_project_access', { p_owner: owner, p_project: id });
const queue = (id, kind, input = {}) => scalar("insert into ugc_v3_tasks(project_id,kind,request_key,input) values($1,$2,$3,$4) returning id as value", [id, kind, randomUUID(), { model: 'fixture-image', directorModel: 'fixture-text', ...input }]);
const lease = async id => { const token = randomUUID(); await pg.query("update ugc_v3_tasks set status='running',lease_token=$2,lease_until=now()+interval '5 minutes' where id=$1", [id, token]); return token; };
const prepare = (id, output = null) => pg.query('update ugc_v3_tasks set provider_started=true,output=coalesce($2,output) where id=$1', [id, output]);
const dispatch = (id, token, phase = 'default') => policy.dispatchFreeProjectOperation({ id, lease_token: token }, phase);
const done = id => pg.query("update ugc_v3_tasks set status='done' where id=$1", [id]);
const syntheticRun = async (id, estimate = 1028335) => {
  const run = randomUUID(), hash = 'a'.repeat(64);
  // Only frozen creative/package/authorization lineage is synthetic.
  await pg.exec('set session_replication_role=replica');
  try { await pg.query("insert into ugc_v3_runs(id,project_id,package_id,segment_uuid,segment_key,authorization_id,intent,state) values($1,$2,$3,$4,'segment-1',$5,$6,'submitting')", [run, id, randomUUID(), randomUUID(), randomUUID(), { model: 'bytedance/seedance-2.5/reference-to-video', hash, estimatedCostMicrousd: estimate, body: { duration: 5, resolution: '480p' } }]); }
  finally { await pg.exec('set session_replication_role=origin'); }
  return { run, hash };
};
const paidBalance = async owner => {
  const p = await rpc('prepare_credit_purchase', { p_owner_user_id: owner, p_pack_id: 'fixture-history', p_pack_name: 'Existing credits', p_amount_minor: 1000, p_currency: 'USD', p_credits: 1000 });
  const order = 'ORDER' + randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase();
  await rpc('attach_paypal_order', { p_purchase_id: p.id, p_owner_user_id: owner, p_order_id: order });
  await rpc('fulfil_paypal_purchase', { p_owner_user_id: owner, p_order_id: order, p_capture_id: 'CAP' + randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase(), p_amount_minor: 1000, p_currency: 'USD' });
};
const migration = fs.readFileSync('supabase/migrations/20261110010500_higgsfield_free_project_budget.sql', 'utf8');
try {
  process.env.HACKATHON_DEMO_MODE = 'true';
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of fs.readdirSync('supabase/migrations').filter(file => file.endsWith('.sql') && Number(file.match(/(\d{3})00_/)[1]) <= 104).sort()) await pg.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
  // Preserve new financial, cleanup and creative-lock guards. Old source-intent
  // gates are outside these disposable synthetic financial fixtures.
  const triggers = (await pg.query("select tgname from pg_trigger where tgrelid='public.ugc_v3_tasks'::regclass and not tgisinternal and tgname not like 'z_generation_free_%' and tgname not in ('z_free_ai_release','a_v3_creative_lock','ugc_v3_reference_cleanup_intent','ugc_v3_reference_cleanup_enqueue')")).rows;
  for (const row of triggers) await pg.exec('alter table ugc_v3_tasks disable trigger "' + row.tgname + '"');
  const lockBefore = await scalar("select pg_get_functiondef('public.ugc_v3_creative_lock_guard()'::regprocedure) as value");
  await pg.exec("insert into free_ai_operation_prices values('character','default','openai','fixture-image',300000)");
  const oldOwner = await user(), oldProject = await project(oldOwner), oldTask = await queue(oldProject, 'character'), oldToken = await lease(oldTask);
  await prepare(oldTask); await dispatch(oldTask, oldToken); await done(oldTask);
  const oldOperation = await scalar('select to_jsonb(o) as value from free_ai_operations o where task_id=$1', [oldTask]);
  const oldAccount = await scalar('select to_jsonb(a) as value from free_ai_accounts a where owner_user_id=$1', [oldOwner]);
  const preserved = await syntheticRun(oldProject);
  await pg.exec("insert into free_ai_operation_prices values('video','default','higgsfield','bytedance/seedance-2.5/reference-to-video',1100000)");
  const oldVideo = await queue(oldProject, 'video', { runId: preserved.run }), oldVideoToken = await lease(oldVideo);
  await prepare(oldVideo); await dispatch(oldVideo, oldVideoToken); await done(oldVideo);
  const oldVideoRecord = await scalar('select to_jsonb(o) as value from free_ai_operations o where task_id=$1', [oldVideo]);
  await pg.exec('set session_replication_role=replica');
  try { await pg.query("update ugc_v3_runs set state='approved',result=$2 where id=$1", [preserved.run, { id: preserved.run, mimeType: 'video/mp4' }]); }
  finally { await pg.exec('set session_replication_role=origin'); }
  const approved = await scalar('select to_jsonb(r) as value from ugc_v3_runs r where id=$1', [preserved.run]);
  await pg.exec(migration); await pg.exec(migration);
  assert.deepEqual(await scalar('select to_jsonb(o) as value from free_ai_operations o where task_id=$1', [oldTask]), oldOperation);
  assert.deepEqual(await scalar('select to_jsonb(a) as value from free_ai_accounts a where owner_user_id=$1', [oldOwner]), oldAccount);
  assert.deepEqual(await scalar('select to_jsonb(r) as value from ugc_v3_runs r where id=$1', [preserved.run]), approved);
  assert.deepEqual(await scalar('select to_jsonb(o) as value from free_ai_operations o where task_id=$1', [oldVideo]), oldVideoRecord);
  assert.equal((await access(oldOwner, oldProject)).budgetUsedMicrousd, 1100000);
  assert.equal((await access(oldOwner, oldProject)).accountBudgetRemainingMicrousd, 960000);
  assert.equal((await access(oldOwner, oldProject)).videoAllowed, false);
  assert.equal(await scalar("select pg_get_functiondef('public.ugc_v3_creative_lock_guard()'::regprocedure) as value"), lockBefore);
  await pg.exec("delete from free_ai_operation_prices where provider='openai'"); // Fixture only: now unnecessary.
  const oldSecondProject = await project(oldOwner), oldSecondAI = await queue(oldSecondProject, 'product'), oldSecondToken = await lease(oldSecondAI);
  await prepare(oldSecondAI); await dispatch(oldSecondAI, oldSecondToken); await done(oldSecondAI);
  const oldNewVideo = await syntheticRun(oldSecondProject);
  await assert.rejects(() => queue(oldSecondProject, 'video', { runId: oldNewVideo.run }), /FREE_PROJECT_BUDGET_EXHAUSTED/);
  const owner = await user(), a = await project(owner), b = await project(owner), c = await project(owner);
  await paidBalance(owner);
  const money = await scalar('select jsonb_agg(to_jsonb(l) order by id) as value from credit_ledger l');
  assert.equal((await access(owner)).remaining, 2);
  const first = await queue(a, 'character'), duplicate = await queue(a, 'product');
  assert.equal((await access(owner)).reserved, 1);
  const token = await lease(first); await prepare(first);
  assert.equal((await access(owner)).consumed, 0);
  await assert.rejects(() => dispatch(first, randomUUID()), /V3_LEASE_LOST/);
  await dispatch(first, token); await assert.rejects(() => dispatch(first, token), /FREE_RESERVATION_REQUIRED/); await done(first);
  const pt = await lease(duplicate); await prepare(duplicate); await dispatch(duplicate, pt); await done(duplicate);
  const loc = await queue(a, 'location'), lt = await lease(loc);
  await prepare(loc, { requests: [{ key: 'plan', status: 'intent' }] }); await dispatch(loc, lt, 'plan');
  await prepare(loc, { requests: [{ key: 'plan', status: 'saved' }, { key: 'sheet', status: 'intent' }] }); await dispatch(loc, lt, 'sheet'); await done(loc);
  const story = await queue(a, 'storyboard'), st = await lease(story); await prepare(story); await dispatch(story, st); await done(story);
  assert.equal((await access(owner)).consumed, 1);
  assert.equal((await access(owner, a)).budgetUsedMicrousd, 0);
  assert.equal((await access(owner, a)).budgetMicrousd, 1030000);
  assert.equal(generationCreditsFromMicrousd(1030000), 103);
  assert.equal((await policy.generationAccess(owner, a)).videoAllowed, true);
  const ra = await syntheticRun(a), video = await queue(a, 'video', { runId: ra.run }), vt = await lease(video); await prepare(video);
  await assert.rejects(() => queue(a, 'video', { runId: ra.run }), /FREE_PROJECT_VIDEO_USED/);
  assert.equal(await rpc('generation_free_transport', { p_project: a, p_run: ra.run, p_hash: 'b'.repeat(64) }), false);
  assert.equal(await rpc('generation_free_transport', { p_project: a, p_run: ra.run, p_hash: ra.hash }), true);
  await assert.rejects(() => dispatch(video, vt), /FREE_RESERVATION_REQUIRED/); await done(video);
  assert.equal((await access(owner, a)).budgetUsedMicrousd, 1030000);
  assert.equal((await access(owner, a)).videoAllowed, false);
  const zeroOpenAI = await scalar("select count(*)::int as value from free_ai_operations where project_id=$1 and provider='openai' and max_cost_microusd<>0", [a]);
  assert.equal(zeroOpenAI, 0);
  await assert.rejects(() => queue(a, 'video', { runId: ra.run }), /FREE_PROJECT_VIDEO_USED/);
  // Full Higgsfield use does not disable separately funded OpenAI work.
  const char2 = await queue(a, 'character'), ct = await lease(char2); await prepare(char2); await dispatch(char2, ct); await done(char2);
  await assert.rejects(() => queue(a, 'character'), /FREE_PREPARATION_LIMIT/);
  await pg.query('delete from ugc_v3_tasks where id=$1', [first]);
  assert.equal((await access(owner, a)).preparationRemaining.character, 0);
  const second = await queue(b, 'product'), bt = await lease(second); await prepare(second); await dispatch(second, bt); await done(second);
  assert.equal((await access(owner)).consumed, 2);
  assert.equal((await access(owner, a)).projectAllowed, true);
  const rb = await syntheticRun(b), failed = await queue(b, 'video', { runId: rb.run }); await lease(failed); await prepare(failed);
  await rpc('generation_free_transport', { p_project: b, p_run: rb.run, p_hash: rb.hash });
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [failed]);
  await assert.rejects(() => queue(b, 'video', { runId: rb.run }), /FREE_PROJECT_VIDEO_USED/);
  assert.equal(await scalar("select sum(o.max_cost_microusd)::int as value from free_ai_operations o join free_ai_projects p using(project_id) where p.owner_user_id=$1 and o.provider='higgsfield' and o.state='started'", [owner]), 2060000);
  await assert.rejects(() => queue(c, 'storyboard'), /FREE_ALLOWANCE_EXHAUSTED/);
  assert.equal(await scalar('select credit_available as value from generation_accounts where owner_user_id=$1', [owner]), 1000);
  assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(l) order by id) as value from credit_ledger l'), money);
  const fresh = await user(), d = await project(fresh), unused = await queue(d, 'storyboard'); await lease(unused); await prepare(unused);
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [unused]); assert.equal((await access(fresh)).remaining, 2);
  const rd = await syntheticRun(d, 1240000), expensive = await queue(d, 'video', { runId: rd.run }); await lease(expensive);
  await assert.rejects(() => prepare(expensive), /FREE_PROJECT_PRICING_REQUIRED/);
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [expensive]); assert.equal((await access(fresh)).remaining, 2);
  // A proven-undispatched video does not spend a slot or reserve a second $1.03.
  const retryRun = await syntheticRun(d), noPost = await queue(d, 'video', { runId: retryRun.run }); await lease(noPost); await prepare(noPost);
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [noPost]);
  assert.equal((await access(fresh, d)).budgetUsedMicrousd, 0);
  const safeReplacement = await queue(d, 'video', { runId: retryRun.run }); await lease(safeReplacement); await prepare(safeReplacement);
  assert.equal((await access(fresh, d)).budgetUsedMicrousd, 1030000);
  await pg.query("update ugc_v3_tasks set status='failed' where id=$1", [safeReplacement]);
  assert.equal((await access(fresh)).remaining, 2);
  const incompatible = await project(fresh);
  await pg.query("update projects set duration='10' where id=$1", [incompatible]);
  await assert.rejects(() => queue(incompatible, 'storyboard'), /GENERATION_LIMIT_5S_480P/);
  await assert.rejects(() => access(fresh, a), /FRESH_V3_PROJECT_REQUIRED/);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await pg.exec('set role ' + role);
    try {
      await assert.rejects(() => pg.query('update free_ai_project_policy set max_cost_microusd=5000000'), /permission denied/);
      await assert.rejects(() => pg.query('delete from free_ai_operations'), /permission denied/);
      if (role !== 'service_role') await assert.rejects(() => scalar('select public.generation_project_access($1,null) as value', [owner]), /permission denied/);
    } finally { await pg.exec('reset role'); }
  }
  await assert.rejects(() => pg.query('delete from free_ai_operations where task_id=$1', [first]), /immutable/);
  await pg.exec(migration);
  assert.equal((await access(owner)).consumed, 2);
  assert.equal((await access(owner, a)).budgetUsedMicrousd, 1030000);
  console.log('PASS: 105 reruns/history, first AI project consumption, OpenAI budget exclusion/attempt limits, one $1.03 video/project, $2.06/account, paid retry refusal, no-dispatch restoration, estimate ceiling, role/ownership denial and unchanged credits/approved media/clip locking. Zero real provider calls.');
} catch (error) {
  console.error(error.message, error.code ?? '', error.where ?? '', error.position ?? '');
  if (!error.query) console.error(error.stack);
  process.exitCode = 1;
} finally {
  if (previousDemo === undefined) delete process.env.HACKATHON_DEMO_MODE; else process.env.HACKATHON_DEMO_MODE = previousDemo;
  await pg.close();
}
