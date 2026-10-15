// Real SQL/grants and real authorization/profile-sync modules. Clerk and Next
// request context are explicit fixtures; this is not hosted session acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {typescriptLoader} from './lib/load-typescript.mjs';

const pg = new PGlite();
let checks = 0;
const check = (name, value) => { assert.ok(value, name); checks++; };
const migrations = ['20261009000100_app_users.sql', '20261015002500_internal_user_roles.sql'];
await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
for (const name of migrations) await pg.exec(fs.readFileSync('supabase/migrations/' + name, 'utf8'));
const queryAs = (role, sql, args = []) => pg.transaction(async tx => {
  await tx.exec(`set local role ${role}`);
  return tx.query(sql, args);
});
const one = async (sql, args = []) => (await pg.query(sql, args)).rows[0];
const alice = await one('insert into app_users(clerk_user_id) values($1) returning *', ['fixture-alice']);
const bob = await one('insert into app_users(clerk_user_id) values($1) returning *', ['fixture-bob']);
const role = async (user, value) => pg.query('insert into internal_user_roles(user_id,role) values($1,$2) on conflict(user_id) do update set role=excluded.role', [user.id, value]);

try {
  for (const who of ['anon', 'authenticated', 'service_role']) {
    for (const [action, sql, args] of [
      ['insert', 'insert into internal_user_roles(user_id,role) values($1,$2)', [bob.id, 'admin']],
      ['update', "update internal_user_roles set role='admin' where user_id=$1", [bob.id]],
      ['delete', 'delete from internal_user_roles where user_id=$1', [alice.id]],
      ['upsert', "insert into internal_user_roles(user_id,role) values($1,'admin') on conflict(user_id) do update set role=excluded.role", [bob.id]],
      ['truncate', 'truncate internal_user_roles', []],
    ]) {
      await assert.rejects(() => queryAs(who, sql, args), e => e.code === '42501', who + ' cannot ' + action);
      checks++;
    }
    if (who !== 'service_role') {
      await assert.rejects(() => queryAs(who, 'select * from internal_user_roles'), e => e.code === '42501');
      checks++;
    }
  }
  await role(alice, 'admin');
  check('service can only read protected authority', (await queryAs('service_role', 'select role from internal_user_roles where user_id=$1', [alice.id])).rows[0].role === 'admin');
  check('RLS enabled with no browser policies', (await one("select relrowsecurity as enabled from pg_class where oid='public.internal_user_roles'::regclass")).enabled && (await one("select count(*)::int as n from pg_policies where tablename='internal_user_roles'")).n === 0);
  await assert.rejects(() => role(bob, 'owner'), e => e.code === '23514'); checks++;
  await assert.rejects(() => pg.query("insert into internal_user_roles(user_id,role) values($1,'admin')", [randomUUID()]), e => e.code === '23503'); checks++;
  await assert.rejects(() => pg.query("insert into internal_user_roles(user_id,role) values($1,'support')", [alice.id]), e => e.code === '23505'); checks++;

  let session = alice.clerk_user_id, reads = 0, connections = 0, override;
  const controlFlow = new Error('NEXT_REQUEST_CONTROL_FLOW');
  const profile = () => ({id: session, firstName: 'Updated profile', lastName: null, imageUrl: null, primaryEmailAddressId: null, emailAddresses: [], publicMetadata: {role: 'admin'}, unsafeMetadata: {role: 'admin'}});
  const db = { from(table) {
    let fields, key, value, input;
    return {
      upsert(v) { input = v; return this; },
      select(v) { fields = v; return this; },
      eq(k, v) { key = k; value = v; return this; },
      async single() {
        assert.equal(table, 'app_users');
        assert.ok(!Object.hasOwn(input, 'role'));
        const result = await queryAs('service_role', `insert into app_users(clerk_user_id,email,first_name,last_name,image_url) values($1,$2,$3,$4,$5) on conflict(clerk_user_id) do update set email=excluded.email,first_name=excluded.first_name,last_name=excluded.last_name,image_url=excluded.image_url returning ${fields}`, Object.values(input));
        return {data: result.rows[0], error: null};
      },
      async maybeSingle() {
        assert.equal(table, 'internal_user_roles'); assert.equal(key, 'user_id'); reads++;
        if (override) return override(value);
        const result = await queryAs('service_role', `select ${fields} from internal_user_roles where user_id=$1`, [value]);
        return {data: result.rows[0] ?? null, error: null};
      },
    };
  }};
  const load = typescriptLoader({
    'next/server': {connection: async () => { connections++; }},
    'next/navigation': {unstable_rethrow: error => { if (error === controlFlow) throw error; }},
    '@clerk/nextjs/server': {clerkClient: async () => ({users: {getUser: async () => profile()}})},
    './require-user': {requireClerkUser: async () => { if (!session) throw controlFlow; return {userId: session}; }},
    '@/lib/db/server': {createDatabaseClient: () => db},
  });
  const {requireAdminOrSupport, SupportAuthorizationError} = load('lib/auth/require-admin-or-support.ts');
  const denied = async (name, code = 'SUPPORT_ACCESS_DENIED', args = []) => {
    await assert.rejects(() => requireAdminOrSupport(...args), error => error instanceof SupportAuthorizationError && error.code === code && error.message === 'Internal access is unavailable.', name); checks++;
  };
  const actor = await requireAdminOrSupport();
  check('admin permitted with minimal server actor', JSON.stringify(actor) === JSON.stringify({userId: alice.id, clerkUserId: alice.clerk_user_id, role: 'admin'}));
  check('profile synchronization preserves admin role', (await one('select role from internal_user_roles where user_id=$1', [alice.id])).role === 'admin');
  check('profile update still works', (await one('select first_name from app_users where id=$1', [alice.id])).first_name === 'Updated profile');
  await role(alice, 'support');
  check('support permitted without recreating helper', (await requireAdminOrSupport()).role === 'support');
  await role(alice, 'user'); await denied('revocation is effective on the next call');
  await role(alice, 'admin'); await pg.query('delete from internal_user_roles where user_id=$1', [alice.id]);
  await denied('deleted role denies former admin');
  session = bob.clerk_user_id;
  await denied('missing role denies ordinary authenticated user');
  await denied('caller identity/role arguments cannot impersonate admin', 'SUPPORT_ACCESS_DENIED', [{userId: alice.id, role: 'admin', isAdmin: true}]);
  check('Clerk metadata does not grant authority', (await one('select count(*)::int as n from internal_user_roles where user_id=$1', [bob.id])).n === 0);
  await role(bob, 'user'); await denied('explicit ordinary role denied');
  session = null; const before = reads;
  await assert.rejects(() => requireAdminOrSupport(), e => e === controlFlow); checks++;
  check('anonymous request never reads role storage', reads === before);
  session = alice.clerk_user_id; await role(alice, 'admin');
  for (const [name, response] of [
    ['unknown role', {data: {user_id: alice.id, role: 'owner'}, error: null}],
    ['wrong identity', {data: {user_id: bob.id, role: 'admin'}, error: null}],
    ['malformed identity', {data: {user_id: 'bad', role: 'admin'}, error: null}],
    ['missing role field', {data: {user_id: alice.id}, error: null}],
    ['extra private fields', {data: {user_id: alice.id, role: 'admin', secret: 'fixture'}, error: null}],
    ['duplicate/unexpected array', {data: [{user_id: alice.id, role: 'admin'}], error: null}],
    ['missing schema/permission/outage', {data: null, error: {code: '42501', message: 'fixture-private-diagnostic'}}],
  ]) { override = async () => response; await denied(name, 'SUPPORT_AUTHORIZATION_UNAVAILABLE'); }
  override = async () => { throw new Error('fixture-private-network-diagnostic'); };
  await denied('transport exception is safe and fails closed', 'SUPPORT_AUTHORIZATION_UNAVAILABLE');
  override = async () => { throw controlFlow; };
  await assert.rejects(() => requireAdminOrSupport(), e => e === controlFlow); checks++;
  override = undefined;
  check('recovered lookup permits current trusted admin', (await requireAdminOrSupport()).role === 'admin');
  check('every invocation is request-time', connections > reads);
  const updated = await one("update internal_user_roles set role='support',updated_at='2000-01-01' where user_id=$1 returning updated_at", [alice.id]);
  check('existing trigger replaces manually supplied stale timestamp', new Date(updated.updated_at).getUTCFullYear() > 2000);
  const source = fs.readFileSync('lib/auth/require-admin-or-support.ts', 'utf8');
  check('helper remains server-only and uncached', source.includes('import "server-only"') && !/\b(?:cache|unstable_cache)\s*\(|["']use cache/.test(source));
  check('no public role or payout-support routes added', !fs.existsSync('app/admin') && !fs.existsSync('app/api/admin') && !fs.existsSync('app/actions/payout-support.ts'));
  console.log(JSON.stringify({passed: checks, scope: 'isolated SQL + real helper/profile modules; Clerk/request fixtures'}));
} finally { await pg.close(); }
