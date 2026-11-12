import fs from 'node:fs';
import { spawn } from 'node:child_process';

const lane = process.argv[2];
const healthFile = '/tmp/worker-health.json';
const payoutSchedule = '/data/payout-next-check';
let child, stopped = false, cycleStarted = 0;
let connectionAvailable = true, connectionFailures = 0;
const pause = milliseconds => new Promise(resolve => {
  const done = () => { clearTimeout(timer); process.removeListener('SIGTERM', done); process.removeListener('SIGINT', done); resolve(); };
  const timer = setTimeout(done, milliseconds);
  process.once('SIGTERM', done);
  process.once('SIGINT', done);
});
function assertActivation() {
  if (!['ugc', 'media', 'payout'].includes(lane) || process.env.SCEENYK_DOCKER_WORKERS_ENABLED !== '1' ||
    process.env.PAYPAL_ENVIRONMENT !== 'sandbox' || fs.readFileSync('/control/mode', 'utf8').trim() !== 'docker' ||
    lane === 'payout' && process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED !== 'sandbox-confirmed') throw new Error('DOCKER_WORKER_ACTIVATION_REQUIRED');
}
function killCycle() {
  if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ } }
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopped = true; killCycle(); });
function heartbeat() {
  assertActivation();
  if (cycleStarted && Date.now() - cycleStarted > 40 * 60_000) throw new Error('DOCKER_WORKER_CYCLE_STALLED');
  fs.writeFileSync(healthFile, JSON.stringify({ at: Date.now(), lane, connectionAvailable }), { mode: 0o600 });
}
async function cycle() {
  cycleStarted = Date.now();
  const nodeArgs = ['--conditions=react-server', '/app/runtime/cycle.cjs', lane];
  // Linux kernel lock covers the entire AI/media job, not just an FFmpeg child.
  // The shared volume inode releases automatically on exit, OOM, or power loss.
  const command = lane === 'payout' ? 'node' : '/usr/bin/flock';
  const args = lane === 'payout' ? nodeArgs : ['--exclusive', '/data/heavy-job.lock', 'node', ...nodeArgs];
  await new Promise((resolve, reject) => {
    child = spawn(command, args, { stdio: 'inherit', detached: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      child = undefined;
      if (stopped || code === 0) resolve();
      else reject(Object.assign(new Error(`WORKER_CYCLE_EXIT_${signal ?? code}`), { exitCode: code }));
    });
  });
  cycleStarted = 0;
}
let pulse;
try {
  assertActivation();
  heartbeat();
  pulse = setInterval(() => {
    try { heartbeat(); }
    catch { console.error('DOCKER_WORKER_WATCHDOG_STOP'); killCycle(); process.exit(1); }
  }, 10000);
  console.info(JSON.stringify({ stage: 'DOCKER_WORKER_READY', lane, concurrency: 1, sandbox: true }));
  while (!stopped) {
    assertActivation();
    if (lane === 'payout') {
      let next = 0;
      try {
        const value = fs.readFileSync(payoutSchedule, 'utf8');
        if (!/^\d{1,16}$/.test(value)) throw new Error('PAYOUT_SCHEDULE_INVALID');
        next = Number(value);
      }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!Number.isFinite(next) || next < 0) throw new Error('PAYOUT_SCHEDULE_INVALID');
      if (Date.now() < next) { await pause(Math.min(next - Date.now(), 30000)); continue; }
      // Persist BEFORE processing. Restarts never accelerate the hourly schedule.
      const descriptor = fs.openSync(`${payoutSchedule}.next`, 'w', 0o600);
      try { fs.writeFileSync(descriptor, String(Date.now() + 3600000)); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      fs.renameSync(`${payoutSchedule}.next`, payoutSchedule);
      const directory = fs.openSync('/data', 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
    try {
      await cycle();
      if (connectionFailures) console.info(JSON.stringify({ stage: 'DOCKER_WORKER_CONNECTION_RECOVERED', lane, failures: connectionFailures }));
      connectionAvailable = true; connectionFailures = 0; heartbeat();
    } catch (error) {
      if (lane === 'payout' || error.exitCode !== 75) throw error;
      // A fresh iteration rediscovers authoritative SQL state and lets existing
      // leases/receipts reconcile any uncertain work. No provider POST replay.
      cycleStarted = 0; connectionAvailable = false; connectionFailures++; heartbeat();
      const delayMs = Math.min(60000, Math.round(3000 * 2 ** Math.min(connectionFailures - 1, 5) * (1 + Math.random() * .2)));
      console.error(JSON.stringify({ stage: 'DOCKER_WORKER_DATABASE_RETRY', lane, failures: connectionFailures, delayMs }));
      if (!stopped) await pause(delayMs);
      continue;
    }
    if (!stopped && lane !== 'payout') await pause(5000);
  }
} catch {
  console.error('DOCKER_WORKER_STOPPED_CHECK_SETUP_OR_QUEUE');
  killCycle();
  process.exitCode = 1;
} finally { clearInterval(pulse); }
