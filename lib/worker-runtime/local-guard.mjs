// Workstation-only coordination. Never imported by the web application.
import fs from 'node:fs';
import path from 'node:path';

const registered = new Set();
export function controlRoot() { return path.resolve(process.cwd(), '.worker-runtime'); }
export function readMode(root = controlRoot()) {
  try {
    const mode = fs.readFileSync(path.join(root, 'mode'), 'utf8').trim();
    if (!['local', 'docker'].includes(mode)) throw new Error('WORKER_MODE_INVALID');
    return mode;
  } catch (error) {
    if (error.code === 'ENOENT') return 'local';
    throw error;
  }
}
export function withControlGate(root, action) {
  fs.mkdirSync(root, { recursive: true });
  const gate = path.join(root, 'switch.lock');
  try { fs.mkdirSync(gate); } catch { throw new Error('WORKER_MODE_SWITCH_BUSY'); }
  try { return action(); } finally { fs.rmdirSync(gate); }
}
export function localWorkers(root = controlRoot()) {
  return fs.readdirSync(root).filter(name => /^local-\d+\.json$/.test(name)).flatMap(name => {
    const record = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
    if (!Number.isInteger(record.pid) || record.pid < 1) throw new Error('WORKER_REGISTRATION_INVALID');
    try { process.kill(record.pid, 0); return [record]; }
    catch (error) {
      if (error.code !== 'ESRCH') throw new Error('WORKER_PROCESS_CHECK_UNAVAILABLE');
      fs.unlinkSync(path.join(root, name));
      return [];
    }
  });
}
export function registerLocalWorker(role) {
  if (registered.has(role)) return;
  const root = controlRoot(), file = path.join(root, `local-${process.pid}.json`);
  withControlGate(root, () => {
    if (readMode(root) !== 'local') throw new Error('DOCKER_WORKERS_OWN_THIS_CHECKOUT_STOP_DOCKER_AND_SELECT_LOCAL');
    localWorkers(root);
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, role }), { mode: 0o600 });
    registered.add(role);
    process.once('exit', () => { try { fs.unlinkSync(file); } catch { /* Stale dead PIDs are checked on the next launch. */ } });
  });
}
