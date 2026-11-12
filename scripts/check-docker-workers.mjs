// Focused offline isolation and SQL security checks. No application env loading.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const root = process.cwd();
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'sceenyk-worker-guard-'));
let local;
const runMode = (mode, env = process.env) => spawnSync(process.execPath, [path.join(root, 'scripts/worker-mode.mjs'), mode], {
  cwd: temporary, env, encoding: 'utf8', timeout: 20000,
});
try {
  assert.equal(runMode('status').status, 0);
  const guardUrl = pathToFileURL(path.join(root, 'lib/worker-runtime/local-guard.mjs')).href;
  local = spawn(process.execPath, ['--input-type=module', '-e',
    `import {registerLocalWorker} from ${JSON.stringify(guardUrl)}; registerLocalWorker('ugc'); process.send('ready'); setInterval(()=>{},1000);`],
  { cwd: temporary, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GUARD_FIXTURE_TIMEOUT')), 10000);
    local.once('message', () => { clearTimeout(timer); resolve(); });
    local.once('error', reject);
  });
  const blocked = runMode('docker');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /STOP_LOCAL_WORKERS/);
  assert.equal(JSON.parse(runMode('status').stdout).mode, 'local');
  const ended = new Promise(resolve => local.once('exit', resolve));
  local.kill(); await ended;
  assert.equal(runMode('docker').status, 0, 'Dead registration must not prevent recovery');
  const denied = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import {registerLocalWorker} from ${JSON.stringify(guardUrl)}; registerLocalWorker('media');`],
  { cwd: temporary, encoding: 'utf8' });
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /DOCKER_WORKERS_OWN_THIS_CHECKOUT/);
  assert.equal(runMode('local', { ...process.env, PATH: '' }).status, 1, 'Unavailable Docker state must fail closed');
  assert.equal(JSON.parse(runMode('status').stdout).mode, 'docker');
} finally {
  local?.kill();
  // Only this exact mkdtemp fixture directory is removed.
  await fs.rm(temporary, { recursive: true, force: true });
}

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.projects(id uuid primary key, deleted_at timestamptz);
    create table public.ugc_v3_projects(project_id uuid primary key);
    create table public.ugc_v3_tasks(id uuid primary key, project_id uuid, kind text, status text,
      available_at timestamptz default now(), lease_until timestamptz, lease_token uuid,
      provider_started boolean default false, created_at timestamptz default now(), error_code text);
    create function public.ugc_v3_worker_claim(uuid,boolean) returns jsonb language sql as $$ select null::jsonb $$;
    create function public.project_video_preview_claim() returns jsonb language sql as $$ select null::jsonb $$;
  `);
  const migration = await fs.readFile(path.join(root, 'supabase/migrations/20261112011300_laptop_worker_lanes.sql'), 'utf8');
  const before = (await db.query("select pg_get_functiondef('public.ugc_v3_worker_claim(uuid,boolean)'::regprocedure) as body")).rows[0].body;
  await db.exec(migration);
  await db.exec(migration); // Transactional rerun must preserve existing APIs.
  assert.equal((await db.query("select pg_get_functiondef('public.ugc_v3_worker_claim(uuid,boolean)'::regprocedure) as body")).rows[0].body, before);
  for (const role of ['anon', 'authenticated']) {
    const grants = await db.query("select has_function_privilege($1,'public.laptop_v3_worker_claim(uuid,boolean,text,boolean)','execute') as allowed", [role]);
    assert.equal(grants.rows[0].allowed, false);
  }
  assert.equal((await db.query("select has_function_privilege('service_role','public.laptop_v3_worker_claim(uuid,boolean,text,boolean)','execute') as allowed")).rows[0].allowed, true);
  const project = randomUUID();
  await db.query('insert into projects values($1,null)', [project]);
  await db.query('insert into ugc_v3_projects values($1)', [project]);
  const jobs = {};
  for (const [kind, status, started, lease] of [
    ['character', 'queued', false, null], ['video', 'queued', false, null],
    ['join', 'queued', false, null], ['product', 'running', false, 'past'],
    ['storyboard', 'running', true, 'future'], ['location', 'queued', true, null],
  ]) {
    const id = randomUUID(); jobs[kind] = id;
    await db.query(`insert into ugc_v3_tasks(id,project_id,kind,status,provider_started,lease_until)
      values($1,$2,$3,$4,$5,$6::timestamptz)`, [id, project, kind, status, started,
      lease === 'past' ? new Date(Date.now() - 60000).toISOString() : lease === 'future' ? new Date(Date.now() + 60000).toISOString() : null]);
  }
  const claim = async (lane, submit, openai) => (await db.query('select laptop_v3_worker_claim($1,$2,$3,$4) as task', [project, submit, lane, openai])).rows[0].task;
  const join = await claim('media', false, false);
  assert.equal(join.id, jobs.join);
  assert.equal(join.status, 'running');
  assert.ok(join.lease_token);
  assert.ok(Date.parse(join.lease_until) > Date.now() + 14 * 60000);
  assert.equal(await claim('media', true, true), null, 'Media cannot claim AI work or an active merge');
  assert.equal((await claim('ugc', false, false)).id, jobs.location, 'Started work remains recoverable with new OpenAI disabled');
  assert.equal(await claim('ugc', false, false), null, 'Disabled new submissions remain unclaimed');
  const ugc = await claim('ugc', true, true);
  assert.ok([jobs.character, jobs.video, jobs.product].includes(ugc.id));
  assert.notEqual(ugc.id, jobs.join);
  assert.notEqual(ugc.id, jobs.storyboard, 'An active task lease cannot be stolen');
  // Expire only fixture tasks, proving crash recovery preserves started intent.
  await db.query("update ugc_v3_tasks set lease_until=now()-interval '1 second' where id=$1", [jobs.location]);
  const resumed = await claim('ugc', false, false);
  assert.equal(resumed.id, jobs.location);
  assert.equal(resumed.provider_started, true);
  await db.query('update projects set deleted_at=now() where id=$1', [project]);
  assert.equal(await claim('ugc', true, true), null, 'Deleted projects are excluded');
  await assert.rejects(claim('invalid', true, true), /LAPTOP_WORKER_LANE_INVALID/);
} finally { await db.close(); }
console.info('DOCKER_WORKER_OFFLINE_CHECKS_PASSED: mode exclusion, crash registration recovery, SQL lanes/leases, disabled submissions, grants and migration rerun; networkCalls=0');
