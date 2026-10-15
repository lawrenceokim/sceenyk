// Explicit hosted role-source/grant acceptance. No role assignment, real-row
// mutation, financial call, sign-in token creation or private identity output.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {createClerkClient} from '@clerk/backend';
import {typescriptLoader} from './lib/load-typescript.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, {info(){}, error(){}});
const load = typescriptLoader(), db = load('lib/db/server.ts').createDatabaseClient();
let checks = 0;
const check = (name, value) => { assert.ok(value, name); checks++; console.log(JSON.stringify({passed: name})); };
const records = await db.from('internal_user_roles').select('user_id,role,created_at,updated_at').limit(100);
check('hosted025 role contract readable', !records.error && records.data.every(row => ['user', 'support', 'admin'].includes(row.role) && row.created_at && row.updated_at));
const admin = records.data.find(row => row.role === 'admin');
check('existing trusted admin assignment present', Boolean(admin));
const account = await db.from('app_users').select('id,clerk_user_id').eq('id', admin.user_id).single();
check('admin references existing application identity', !account.error && account.data?.id === admin.user_id);
const clerk = createClerkClient({secretKey: process.env.CLERK_SECRET_KEY, telemetry: {disabled: true}});
const identity = await clerk.users.getUser(account.data.clerk_user_id);
check('admin mapping matches real Clerk identity', identity.id === account.data.clerk_user_id);
// The identity is verified above, but the request context below is deliberately
// a fixture. This does not claim an interactive admin Clerk session was tested.
let user = account.data;
const authorization = typescriptLoader({
  './ensure-app-user': {ensureAppUser: async () => user},
  'next/navigation': {unstable_rethrow(){}},
})('lib/auth/require-admin-or-support.ts');
const actor = await authorization.requireAdminOrSupport();
check('real helper permits hosted admin role', actor.userId === admin.user_id && actor.role === 'admin' && Object.keys(actor).length === 3);
const candidates = await db.from('app_users').select('id,clerk_user_id').limit(100);
check('ordinary identity available for denial', !candidates.error && candidates.data.some(candidate => !records.data.some(record => record.user_id === candidate.id && ['support','admin'].includes(record.role))));
user = candidates.data.find(candidate => !records.data.some(record => record.user_id === candidate.id && ['support','admin'].includes(record.role)));
await assert.rejects(() => authorization.requireAdminOrSupport(), e => e.code === 'SUPPORT_ACCESS_DENIED');
check('real helper denies hosted ordinary role', true);
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
assert.ok(publicKey, 'PUBLIC_DATABASE_KEY_REQUIRED');
const browser = createClient(process.env.SUPABASE_URL, publicKey, {auth: {persistSession: false, autoRefreshToken: false}});
const absent = randomUUID();
// Verify the probe target is absent before denied mutations. Even accidental
// insert permission cannot create a role because its identity FK is absent.
const absentUser = await db.from('app_users').select('id').eq('id', absent).maybeSingle();
check('all mutation probes target nonexistent identity', !absentUser.error && absentUser.data === null);
for (const [name, client] of [['browser', browser], ['service', db]]) {
  if (name === 'browser') check('browser cannot read role authority', (await client.from('internal_user_roles').select('role').limit(0)).error?.code === '42501');
  for (const [operation, run] of [
    ['insert', () => client.from('internal_user_roles').insert({user_id: absent, role: 'admin'})],
    ['upsert', () => client.from('internal_user_roles').upsert({user_id: absent, role: 'admin'}, {onConflict: 'user_id'})],
    ['update', () => client.from('internal_user_roles').update({role: 'admin'}).eq('user_id', absent)],
    ['delete', () => client.from('internal_user_roles').delete().eq('user_id', absent)],
  ]) check(name + ' cannot ' + operation + ' role authority', (await run()).error?.code === '42501');
}
const unchanged = await db.from('internal_user_roles').select('user_id,role,created_at,updated_at').limit(100);
const normalize = rows => JSON.stringify([...rows].sort((a,b) => a.user_id.localeCompare(b.user_id)));
check('hosted assignments and timestamps unchanged', !unchanged.error && normalize(unchanged.data) === normalize(records.data));
console.log(JSON.stringify({passed: checks, scope: 'hosted Supabase/Clerk identity + real helper with request-identity fixture', interactiveAdminSession: 'not tested', hostedRoleRevocation: 'not performed; isolated SQL acceptance only'}));
