import fs from 'node:fs';
try {
  const value = JSON.parse(fs.readFileSync('/tmp/worker-health.json', 'utf8'));
  if (!Number.isFinite(value.at) || Date.now() - value.at > 45000 || value.connectionAvailable === false) process.exitCode = 1;
} catch { process.exitCode = 1; }
