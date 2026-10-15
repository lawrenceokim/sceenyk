// Explicit local Next.js + hosted Clerk/Supabase acceptance. Creates and revokes
// fresh development sessions; never revokes existing sessions or changes roles.
// The temporary status-only probe is removed in finally and never deployed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import nextEnv from '@next/env';
import {createClerkClient} from '@clerk/backend';
import {typescriptLoader} from './lib/load-typescript.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, {info(){}, error(){}});
const db = typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const clerk = createClerkClient({secretKey: process.env.CLERK_SECRET_KEY, telemetry: {disabled: true}});
assert.equal((await clerk.instance.get()).environmentType, 'development');
const roles = await db.from('internal_user_roles').select('user_id,role').limit(100);
assert.equal(roles.error, null);
const admin = roles.data.find(row => row.role === 'admin'); assert.ok(admin, 'ADMIN_REQUIRED');
const users = await db.from('app_users').select('id,clerk_user_id,email').limit(100);
assert.equal(users.error, null);
const adminUser = users.data.find(row => row.id === admin.user_id);
const ordinary = users.data.find(row => row.email?.includes('+clerk_test@') && !roles.data.some(role => role.user_id === row.id && ['support','admin'].includes(role.role)));
assert.ok(adminUser && ordinary, 'ADMIN_AND_RESERVED_ORDINARY_IDENTITY_REQUIRED');

const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
// Reuse the checkout's existing local dev server rather than contending for its
// framework lock or stopping a server owned by the user.
const reuseServer = fs.existsSync('.next/dev/lock');
const origin = reuseServer ? 'http://localhost:3000' : `http://127.0.0.1:${port}`;
const name = 'authorization-acceptance-' + randomUUID();
const directory = path.resolve('app/api', name), file = path.join(directory, 'route.ts');
const sessions = [];
let server, checks = 0;
const check = (name, value) => { assert.ok(value, name); checks++; console.log(JSON.stringify({passed: name})); };
const status = async (token, options = {}) => {
  const response = await fetch(origin + '/api/' + name + (options.query ?? ''), {
    method: options.method ?? 'GET', redirect: 'manual', signal: AbortSignal.timeout(60000),
    headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...options.headers},
    ...(options.body ? {body: JSON.stringify(options.body)} : {}),
  });
  const body = await response.text();
  return {status: response.status, body, cache: response.headers.get('cache-control')};
};
try {
  fs.mkdirSync(directory);
  fs.writeFileSync(file, `import {unstable_rethrow} from 'next/navigation';
import {requireAdminOrSupport,SupportAuthorizationError} from '@/lib/auth/require-admin-or-support';
async function probe(){
  try {await requireAdminOrSupport();return Response.json({authorized:true},{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){unstable_rethrow(error);return new Response(null,{status:error instanceof SupportAuthorizationError&&error.code==='SUPPORT_ACCESS_DENIED'?403:503,headers:{'Cache-Control':'private, no-store'}});}
}
export const GET=probe;
export const POST=probe;
`);
  if (!reuseServer) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)], {windowsHide: true, stdio: ['ignore','pipe','pipe'], env: {...process.env, NEXT_TELEMETRY_DISABLED: '1'}});
    // Drain framework output; it may contain private request diagnostics.
    server.stdout.resume(); server.stderr.resume();
  }
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server) assert.equal(server.exitCode, null, 'LOCAL_NEXT_PROCESS_EXITED');
    try {const response = await fetch(origin + '/api/' + name, {redirect:'manual',signal:AbortSignal.timeout(3000)});await response.body?.cancel();ready=true;break;} catch {await delay(500);}
  }
  assert.ok(ready, 'LOCAL_NEXT_READY');
  const anonymous = await status();
  check('real Next anonymous request denied before authorization', [302,307,401,404].includes(anonymous.status) && !anonymous.body.includes('"authorized":true'));
  for (const user of [adminUser, ordinary]) {
    const session = await clerk.sessions.createSession({userId: user.clerk_user_id}); sessions.push(session.id);
    assert.equal(session.status, 'active');
    const token = (await clerk.sessions.getToken(session.id, undefined, 60)).jwt;
    const response = await status(token);
    if (user === adminUser) {
      check('real Clerk admin session passes real Next helper', response.status === 200 && response.body === '{"authorized":true}');
      check('authorized response is private and uncached', response.cache?.includes('no-store') && response.cache.includes('private'));
      const post = await status(token, {method:'POST'});
      check('admin direct POST independently authorized', post.status === 200 && post.body === '{"authorized":true}');
    } else {
      check('real Clerk ordinary session denied by server', response.status === 403 && response.body === '');
      const post = await status(token, {method:'POST',headers:{'Content-Type':'application/json','x-role':'admin'},body:{role:'admin',userId:adminUser.id},query:'?role=admin&userId='+encodeURIComponent(adminUser.id)});
      check('ordinary direct POST and forged role/identity denied', post.status === 403 && post.body === '');
      const again = await status(token);
      check('prior admin request does not cache permission for ordinary user', again.status === 403);
    }
  }
  const forged = await status('invalid-session-token');
  check('forged bearer session denied', [302,307,401,404].includes(forged.status) && !forged.body.includes('"authorized":true'));
  for (const route of ['/admin/payouts', '/api/admin/payouts']) {
    const r = await fetch(origin + route, {redirect:'manual',signal:AbortSignal.timeout(60000)}); await r.body?.cancel();
    check('payout-support route remains absent ' + route, r.status === 404);
  }
} finally {
  let cleanupFailed = false;
  for (const id of sessions) {
    try {await clerk.sessions.revokeSession(id);} catch {cleanupFailed = true;}
  }
  if (server?.pid && server.exitCode === null) {
    if (process.platform === 'win32') await promisify(execFile)('taskkill', ['/PID',String(server.pid),'/T','/F'], {windowsHide:true}).catch(() => {});
    else server.kill('SIGTERM');
  }
  if (fs.existsSync(file)) fs.unlinkSync(file);
  if (fs.existsSync(directory)) fs.rmdirSync(directory);
  assert.ok(!cleanupFailed, 'FRESH_DEVELOPMENT_SESSION_CLEANUP_FAILED');
}
check('temporary status probe removed', !fs.existsSync(directory));
console.log(JSON.stringify({passed: checks, scope:'local Next HTTP + real temporary Clerk sessions + hosted Supabase roles', hostedRoleRevocation:'not performed; isolated SQL acceptance only', deployedApplication:'not changed'}));
