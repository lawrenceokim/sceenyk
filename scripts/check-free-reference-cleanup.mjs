// Focused disposable SQL + real cleanup coordinators. No provider/storage I/O.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite();
const scalar = async (sql, args = []) => (await pg.query(sql, args)).rows[0]?.value;
const rpc = async (name, args) => {
  await pg.exec('set role service_role');
  try { return await scalar(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) as value`, Object.values(args)); }
  finally { await pg.exec('reset role'); }
};
let storageCalls = 0, network = 0;
const purged = [];
const load = typescriptLoader({ './runtime-media': {
  deleteReferencePrivate: async () => { storageCalls++; },
  purgeReferenceSpool: async id => { purged.push(id); },
}, '@/lib/video-generation-package/builder': {
  // Location cleanup hashes flat task/key strings. Normalize the VM object
  // realm at this fixture seam; production hashing is unchanged and not tested.
  packageDigest: (domain, value) => createHash('sha256').update(`${domain}:v1\n${JSON.stringify(value, Object.keys(value).sort())}`).digest('hex'),
} }, { Error, fetch: async () => { network++; throw new Error('NETWORK_FORBIDDEN'); } });
const { permanentlyDeleteReference } = load('lib/final-video-generation-v3/reference-deletion.ts');
const { discardReference } = load('lib/final-video-generation-v3/reference-retention.ts');
const migration = fs.readFileSync('supabase/migrations/20261110010300_free_preparation_cleanup.sql', 'utf8');
const usage = owner => scalar('select public.generation_free_access($1) as value', [owner]);
const account = owner => scalar('select to_jsonb(a) as value from generation_accounts a where owner_user_id=$1', [owner]);
const store = { rpc };
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of fs.readdirSync('supabase/migrations').filter(file => file.endsWith('.sql') && Number(file.match(/(\d{3})00_/)[1]) <= 102).sort()) {
    await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  const owner = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  const other = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  const fixture = async kind => {
    const project = randomUUID(), id = randomUUID();
    await rpc('ugc_v3_create_project', { p_owner: owner, p_project: project, p_fields: {
      title: 'Offline cleanup fixture', category: 'product-ad', prompt: 'No provider call.', ugcType: 'advertisement',
      settings: { duration: '5', aspectRatio: '9:16', visualStyle: 'Realistic', tone: 'Professional' },
    } });
    // Synthetic completed provider output; actual policy and cleanup guards stay
    // enabled. Call the private accounting helper as the fixture superuser only.
    const task = await scalar("insert into ugc_v3_tasks(project_id,kind,request_key,input,status,provider_started) values($1,$2,$3,'{}','done',true) returning id as value", [project, kind, randomUUID()]);
    await pg.query('select public.generation_free_preparation($1)', [task]);
    const asset = { id, storageKey: `users/${owner}/projects/${project}/v3/${id}.png`, mimeType: 'image/png',
      sizeBytes: 20, sha256: 'a'.repeat(64), etag: 'fixture', width: 32, height: 32, durationMs: 0, hasAudio: false };
    await pg.query('insert into ugc_v3_artifacts(id,project_id,task_id,kind,version,document) values($1,$2,$3,$4,1,$5)', [id, project, task, kind, { asset }]);
    return { project, id, task, kind, version: 1 };
  };
  const character = await fixture('character');
  const before = await account(owner), startedUsage = await usage(owner);
  const reject = (target, user = owner) => permanentlyDeleteReference(store, user, target.project, target, 'reject', null, new AbortController().signal);
  await assert.rejects(() => reject(character), /V3_REFERENCE_DELETE_FINALIZE_FAILED/);
  const pending = await scalar('select to_jsonb(d) as value from ugc_v3_reference_deletions d where id=$1', [character.id]);
  assert.equal(pending.state, 'prepared');
  assert.equal(pending.error_code, 'V3_REFERENCE_DELETE_FINALIZE_FAILED');
  assert.equal(await scalar('select count(*)::int as value from ugc_v3_tasks where id=$1', [character.task]), 1);
  // Confirm the hidden database cause, rather than treating the generic UI code
  // as proof. The failed transaction must leave image/task metadata retryable.
  const retry = await rpc('ugc_v3_reference_delete_prepare', { p_owner: owner, p_project: character.project,
    p_kind: 'character', p_id: character.id, p_version: 1, p_mode: 'reject', p_input: null });
  await assert.rejects(() => rpc('ugc_v3_reference_delete_finish', { p_owner: owner, p_project: character.project,
    p_id: character.id, p_token: retry.lease_token, p_error: null }),
  error => error.code === '23001' && error.constraint === 'generation_free_preparations_task_id_fkey');
  await rpc('ugc_v3_reference_delete_finish', { p_owner: owner, p_project: character.project,
    p_id: character.id, p_token: retry.lease_token, p_error: 'V3_REFERENCE_DELETE_FINALIZE_FAILED' });
  await pg.exec(migration); await pg.exec(migration);
  await assert.rejects(() => reject(character, other), /FRESH_V3_PROJECT_REQUIRED/);
  await reject(character);
  const completed = await scalar('select to_jsonb(d) as value from ugc_v3_reference_deletions d where id=$1', [character.id]);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.asset, null); assert.equal(completed.source_task_id, null);
  assert.equal(await scalar('select count(*)::int as value from ugc_v3_tasks where id=$1', [character.task]), 0);
  assert.equal(await scalar('select count(*)::int as value from ugc_v3_artifacts where id=$1', [character.id]), 0);
  assert.equal(await scalar('select count(*)::int as value from generation_free_preparations where task_id=$1', [character.task]), 1);
  assert.deepEqual(await usage(owner), startedUsage);
  assert.deepEqual(await account(owner), before);
  const calls = storageCalls; await reject(character); assert.equal(storageCalls, calls);
  for (const kind of ['product', 'location']) {
    const target = await fixture(kind), used = await usage(owner);
    if (kind === 'product') await reject(target);
    else await discardReference(store, owner, target.project, target, new AbortController().signal, true);
    assert.equal(await scalar('select count(*)::int as value from ugc_v3_tasks where id=$1', [target.task]), 0);
    assert.equal(await scalar('select count(*)::int as value from generation_free_preparations where task_id=$1', [target.task]), 1);
    assert.deepEqual(await usage(owner), used);
    assert(purged.includes(target.task));
  }
  const second = await fixture('character'); await reject(second);
  assert.equal((await usage(owner)).preparationRemaining.character, 0);
  await assert.rejects(() => fixture('character'), /FREE_PREPARATION_LIMIT/);
  await assert.rejects(() => pg.query('delete from generation_free_preparations where task_id=$1', [character.task]), /immutable/);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await pg.exec(`set role ${role}`);
    try { await assert.rejects(() => pg.query('delete from generation_free_preparations where task_id=$1', [character.task]), /permission denied/); }
    finally { await pg.exec('reset role'); }
  }
  await pg.exec(migration);
  assert.deepEqual(await account(owner), before);
  assert.equal(network, 0);
  console.log('PASS: Stage 2 cleanup failure reproduced; 103 reruns, owned Character/Product rejection and Location discard finalize, replay is idempotent, preparation usage survives deletion and still blocks a third start, account balances and write protections unchanged. Zero real network/provider/storage calls.');
} finally { await pg.close(); }
