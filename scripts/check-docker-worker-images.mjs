// Offline Linux security smoke. No Compose services, credentials, host/volume mounts or network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const smoke = String.raw`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
const lane = process.argv[2];
assert.equal(process.getuid(), 1000);
assert.throws(() => fs.writeFileSync('/app/must-be-read-only', 'x'));
for (const file of ['/app/.env.local', '/app/.git', '/app/lib', '/app/scripts']) assert.equal(fs.existsSync(file), false);
for (const name of ['SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','PAYPAL_CLIENT_SECRET','R2_SECRET_ACCESS_KEY']) assert.equal(process.env[name], undefined);
let result = spawnSync(process.execPath, ['/app/workers/laptop/supervisor.mjs', lane], { encoding: 'utf8' });
assert.equal(result.status, 1, 'Disabled supervisor must fail closed');
const env = {...process.env, SCEENYK_DOCKER_WORKERS_ENABLED:'1',PAYPAL_ENVIRONMENT:'sandbox',UGC_V3_ENABLED:'1',UGC_V3_ACCESS_MODE:'owned',
 UGC_V3_OPENAI_ENABLED:'0',UGC_V3_HIGGSFIELD_ENABLED:'0',SCEENYK_PAYPAL_PAYOUTS_ENABLED:'sandbox-confirmed',
 PAYPAL_CLIENT_ID:'offline-fixture',PAYPAL_CLIENT_SECRET:'offline-fixture',PAYPAL_WEBHOOK_ID:'offline-fixture',PAYPAL_RETURN_ORIGIN:'https://example.test'};
result = spawnSync(process.execPath, ['--conditions=react-server','/app/runtime/cycle.cjs',lane], { env, encoding:'utf8', timeout:30000 });
assert.equal(result.status, 1);
assert.match(result.stderr, /MISSING_CONFIGURATION/, 'Worker imports must reach the database configuration guard');
const health = () => spawnSync(process.execPath, ['/app/workers/laptop/healthcheck.mjs']).status;
assert.equal(health(), 1);
fs.writeFileSync('/tmp/worker-health.json', JSON.stringify({at:Date.now(),lane})); assert.equal(health(), 0);
fs.writeFileSync('/tmp/worker-health.json', JSON.stringify({at:Date.now()-60000,lane})); assert.equal(health(), 1);
if (lane !== 'payout') {
 for (const binary of ['/usr/bin/ffmpeg','/usr/bin/ffprobe']) assert.equal(spawnSync(binary,['-version'],{stdio:'ignore'}).status,0);
 const holder = spawn('/usr/bin/flock',['-x','/tmp/heavy.lock',process.execPath,'-e',
   "require('node:fs').writeFileSync('/tmp/locked','yes'); setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'});
 try {
  for (let i=0; i<100 && !fs.existsSync('/tmp/locked'); i++) await new Promise(r=>setTimeout(r,50));
  assert.ok(fs.existsSync('/tmp/locked'));
  assert.equal(spawnSync('/usr/bin/flock',['-n','/tmp/heavy.lock','/bin/true']).status,1,'Second heavy job must wait');
 } finally {
  const exited = new Promise(resolve=>holder.once('exit',resolve));
  process.kill(-holder.pid,'SIGKILL'); await exited;
 }
 assert.equal(spawnSync('/usr/bin/flock',['-n','/tmp/heavy.lock','/bin/true']).status,0,'A killed process must release the lock');
}
console.log(lane+': offline Linux import, non-root, read-only, activation/health and available media-lock checks passed');
`;

for (const lane of ['ugc', 'media', 'payout']) {
  const result = spawnSync('docker', ['run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true', '--memory', '256m', '--pids-limit', '32',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m,uid=1000,gid=1000,mode=0700',
    '--entrypoint', 'node', '-i', `sceenyk-worker-${lane}:laptop-v1`, '--input-type=module', '-', lane],
  { input: smoke, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `${lane} image smoke failed`);
}
