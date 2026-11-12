import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { controlRoot, localWorkers, readMode, withControlGate } from '../lib/worker-runtime/local-guard.mjs';

try {
  const requested = process.argv[2], root = controlRoot();
  if (!['local', 'docker', 'status'].includes(requested) || process.argv.length !== 3) throw new Error('USE_NODE_SCRIPTS_WORKER_MODE_MJS_LOCAL_DOCKER_OR_STATUS');
  withControlGate(root, () => {
    const mode = readMode(root), workers = localWorkers(root);
    if (requested === 'status') { console.info(JSON.stringify({ mode, localWorkers: workers })); return; }
    if (requested === 'docker' && workers.length) throw new Error('STOP_LOCAL_WORKERS_BEFORE_SELECTING_DOCKER');
    if (requested === 'local' && mode === 'docker') {
      // Check all compose-labelled containers, including a restart in progress.
      let states;
      try { states = execFileSync('docker', ['ps', '-a', '--filter', 'label=com.docker.compose.project=sceenyk-workers', '--format', '{{.State}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }); }
      catch { throw new Error('DOCKER_STATE_UNAVAILABLE_MODE_UNCHANGED'); }
      if (states.trim().split(/\s+/).some(s => ['running', 'restarting', 'paused', 'created', 'removing'].includes(s))) throw new Error('STOP_OR_REMOVE_DOCKER_WORKERS_BEFORE_SELECTING_LOCAL');
    }
    const temporary = path.join(root, 'mode.next');
    fs.writeFileSync(temporary, `${requested}\n`, { mode: 0o600 });
    fs.renameSync(temporary, path.join(root, 'mode'));
    console.info(`WORKER_MODE_${requested.toUpperCase()}`);
  });
} catch (error) { console.error(error.message); process.exitCode = 1; }
