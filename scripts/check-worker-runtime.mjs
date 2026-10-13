// Production entry point + actual local binaries, with fake configuration.
// Startup/health performs no database/storage/provider requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const env = {
  ...process.env,
  NODE_ENV: 'production', PORT: String(port), MEDIA_PREPARATION_WORKER_PORT: '1', MEDIA_PREPARATION_WORKER_HOST: '127.0.0.1',
  WORKER_SHARED_SECRET: randomBytes(32).toString('hex'), NEXT_PUBLIC_WORKER_SHARED_SECRET: '',
  SUPABASE_URL: 'https://database.invalid', SUPABASE_SECRET_KEY: 'sb_secret_fixture_not_a_real_key',
  R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture', R2_BUCKET_NAME: 'worker-fixture',
  FFMPEG_PATH: require('ffmpeg-static'), FFPROBE_PATH: require('ffprobe-static').path,
};
const compiled=process.argv.includes('--compiled');
const child = spawn(process.execPath, compiled?['--conditions=react-server','workers/final-render/runtime/media-worker.cjs']:['--conditions=react-server', '--import=tsx', 'scripts/media-preparation-worker.ts'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let ready = false;
child.stdout.on('data', value => { if (String(value).includes('media_preparation_worker_ready')) ready = true; });
child.stderr.on('data', () => {});
try {
  for (let count = 0; !ready && count < 150; count++) { assert.equal(child.exitCode, null, 'production entry point stays running'); await delay(100); }
  assert.ok(ready, 'entry point validates actual binaries and starts');
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  const rejected = await fetch(`http://127.0.0.1:${port}/prepare`, { method: 'POST' });
  assert.equal(rejected.status, 401); await rejected.body?.cancel();
  console.log(JSON.stringify({ passed: 3, compiled, checks: ['production entry point validates installed FFmpeg/FFprobe', 'Render PORT takes precedence and health is safe', 'production entry point rejects unsigned processing'], scope: 'native production-mode worker; fake credentials; no hosted requests; not Docker' }, null, 2));
} finally {
  child.kill();
  if (child.exitCode === null) await once(child, 'exit');
}
