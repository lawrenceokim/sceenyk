// Actual migration, registry and HTTP boundary against disk-backed PostgreSQL
// (PGlite). No hosted writes or paid submissions. Cloud races need hosted proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sceenyk-replay-test-'));
let pg = new PGlite(directory), queue = Promise.resolve(), outage = false, invalidResult = false, calls = 0;
const checks = [], servers = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const scalar = async (sql, args = []) => (await pg.query(sql, args)).rows[0]?.value;
const serialize = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
const db = { rpc(name, args) { return serialize(async () => {
  assert.equal(name, 'register_media_worker_request');
  if (outage) return { error: { message: 'fixture-private-diagnostic' }, data: null };
  if (invalidResult) return { error: null, data: 'unknown-result' };
  await pg.exec('set role service_role');
  try { return { data: await scalar('select public.register_media_worker_request($1,$2) as value', [args.p_nonce, args.p_timestamp_ms]), error: null }; }
  finally { await pg.exec('reset role'); }
}); } };
const loader = () => typescriptLoader({ '@/lib/db/server': { createDatabaseClient: () => db } });
const secret = 'local-fixture-secret-only-' + randomUUID();
const body = JSON.stringify({ generationJobId: randomUUID(), sceneExecutionId: randomUUID() });
let hold;
async function server() {
  // New module instances: no shared process-memory nonce registry.
  const load = loader();
  const { registerWorkerRequest } = load('lib/media-preparation/replay.ts');
  const { server, drain } = load('lib/media-preparation/http.ts').createPreparationServer(secret, async () => { calls++; await hold; return { ready: true }; }, registerWorkerRequest);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const item = { server, drain, origin: `http://127.0.0.1:${server.address().port}` };
  servers.push(item); return item;
}
const sign = loader()('lib/media-preparation/auth.ts').signWorkerRequest;
const signed = () => { const timestamp = String(Date.now()), nonce = randomUUID(); return { timestamp, nonce, signature: sign(secret, 'POST', '/prepare', timestamp, nonce, body) }; };
async function send(target, input) {
  const r = await fetch(target.origin + '/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-worker-timestamp': input.timestamp, 'x-worker-nonce': input.nonce, 'x-worker-signature': input.signature }, body });
  return { status: r.status, body: await r.json() };
}
async function stop(item) { item.drain(); item.server.closeAllConnections(); if (item.server.listening) await once(item.server, 'close'); }
async function denied(role, sql) {
  await pg.exec('set role ' + role);
  try { await assert.rejects(pg.query(sql), /permission denied/); }
  finally { await pg.exec('reset role'); }
}
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await pg.exec(fs.readFileSync('supabase/migrations/20261012001300_media_worker_replay_protection.sql', 'utf8'));
  check('migration creates private RLS table', await scalar("select relrowsecurity as value from pg_class where oid='public.media_worker_request_nonces'::regclass"));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await denied(role, 'select * from public.media_worker_request_nonces');
    await denied(role, "insert into public.media_worker_request_nonces values(gen_random_uuid(),now())");
    await denied(role, 'delete from public.media_worker_request_nonces');
    if (role !== 'service_role') await denied(role, 'select public.register_media_worker_request(gen_random_uuid(),0)');
  }
  check('browser roles cannot call registry; even service role cannot read insert or erase table directly', true);
  const register = loader()('lib/media-preparation/replay.ts').registerWorkerRequest;
  const nonce = randomUUID(), timestamp = String(Date.now());
  check('service-only RPC accepts a fresh nonce', await register(nonce, timestamp) === 'accepted');
  check('same persisted nonce rejected', await register(nonce, timestamp) === 'replay');
  check('fresh timestamp does not bypass recorded nonce', await register(nonce, String(Date.now() + 1000)) === 'replay');
  const retention = await scalar('select extract(epoch from (expires_at-clock_timestamp())) as value from public.media_worker_request_nonces where nonce=$1', [nonce]);
  check('retention covers maximum ten-minute remaining signature lifetime', retention > 650 && retention <= 660);
  check('database clock rejects expired timestamp', await register(randomUUID(), String(Date.now() - 301000)) === 'unauthorized');
  check('database clock rejects future timestamp outside window', await register(randomUUID(), String(Date.now() + 301000)) === 'unauthorized');
  check('invalid timestamp rejected without inserting', await scalar('select public.register_media_worker_request($1,0) as value', [randomUUID()]) === 'unauthorized');

  const a = await server(), b = await server();
  const request = signed();
  check('fresh real HTTP request succeeds with durable registry', (await send(a, request)).status === 200);
  const beforeReplay = calls;
  const replay = await send(b, request);
  check('another worker rejects exact replay with safe code', replay.status === 409 && replay.body.code === 'REPLAY_DETECTED' && calls === beforeReplay);
  await stop(a); await stop(b); await queue; await pg.close();
  pg = new PGlite(directory);
  const restarted = await server();
  const later = await send(restarted, request);
  check('replay remains denied after database reopen and worker restart', later.status === 409 && later.body.code === 'REPLAY_DETECTED' && calls === beforeReplay);

  const second = await server(), duplicate = signed();
  let release;
  hold = new Promise(resolve => { release = resolve; });
  const pending = send(restarted, duplicate);
  try {
    for (let n = 0; calls === beforeReplay && n < 200; n++) await new Promise(r => setTimeout(r, 10));
    assert.equal(calls, beforeReplay + 1);
    const simultaneous = await send(second, duplicate);
    check('duplicate during active processing denied across worker instances', simultaneous.status === 409 && calls === beforeReplay + 1);
  } finally { release(); hold = undefined; }
  assert.equal((await pending).status, 200);
  const raced = await Promise.all([send(restarted, signed()), send(second, signed())]);
  check('distinct signed retries remain usable', raced.every(r => r.status === 200));
  const race = signed(), beforeRace = calls;
  const results = await Promise.all([send(restarted, race), send(second, race)]);
  check('simultaneous exact duplicates accept only one in local SQL-backed test', results.map(r => r.status).sort().join() === '200,409' && calls === beforeRace + 1);

  for (const mode of ['outage', 'invalidResult']) {
    outage = mode === 'outage'; invalidResult = mode === 'invalidResult';
    const before = calls, failure = await send(restarted, signed());
    check(mode + ' fails closed without executing or exposing diagnostics', failure.status === 503 && failure.body.code === 'PREPARATION_UNAVAILABLE' && calls === before);
  }
  outage = invalidResult = false;
  await pg.query("insert into public.media_worker_request_nonces select gen_random_uuid(),now()-interval '1 hour' from generate_series(1,1001)");
  await register(randomUUID(), String(Date.now()));
  check('cleanup deletes at most 1000 expired rows per valid request', Number(await scalar('select count(*) as value from public.media_worker_request_nonces where expires_at < now()')) === 1);
  await register(randomUUID(), String(Date.now()));
  check('subsequent traffic removes remaining expired history', Number(await scalar('select count(*) as value from public.media_worker_request_nonces where expires_at < now()')) === 0);
  check('cleanup preserves unexpired accepted nonce', await register(nonce, timestamp) === 'replay');
  const expiredNonce = randomUUID();
  await pg.query("insert into public.media_worker_request_nonces values($1,now()-interval '1 hour')", [expiredNonce]);
  await register(randomUUID(), String(Date.now()));
  check('old signed timestamp remains denied after its nonce record is purged', await register(expiredNonce, String(Date.now() - 700000)) === 'unauthorized');
  const columns = (await pg.query("select column_name from information_schema.columns where table_name='media_worker_request_nonces' order by ordinal_position")).rows.map(r => r.column_name);
  check('nonce storage contains only identifier and expiry', columns.join() === 'nonce,expires_at');
  console.log(JSON.stringify({ passed: checks.length, checks, scope: 'actual SQL/HTTP/registry; disk-backed PGlite restart; hosted concurrent transactions still require deployed acceptance' }, null, 2));
} finally {
  await Promise.allSettled(servers.map(stop));
  await queue; await pg.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('sceenyk-replay-test-'));
  fs.rmSync(directory, { recursive: true, force: true });
}
