import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const options = {
  absWorkingDir: process.cwd(), tsconfig: path.resolve('tsconfig.json'),
  bundle: true, packages: 'external', platform: 'node', target: 'node22', format: 'cjs',
  define: { 'import.meta.url': '__workerModuleUrl' },
  banner: { js: "const __workerModuleUrl = require('node:url').pathToFileURL(__filename).href;" },
  logLevel: 'warning',
};
await build({ ...options, entryPoints: [path.resolve('scripts/docker-worker-cycle.ts')], outfile: 'workers/laptop/runtime/cycle.cjs' });
await build({ ...options, entryPoints: [path.resolve('scripts/diagnose-generation-worker.ts')], outfile: 'workers/laptop/runtime/diagnose.cjs' });
const policy = await fs.readFile('lib/accounting/generation-policy-server.ts', 'utf8');
const policyVersion = Number(/policyVersion: z\.literal\((\d+)\)/.exec(policy)?.[1]);
if (!Number.isInteger(policyVersion) || policyVersion < 114) throw new Error('DOCKER_POLICY_VERSION_REQUIRED');
await fs.writeFile('workers/laptop/runtime/build-info.json', JSON.stringify({ policyVersion,
  bundleSha256: createHash('sha256').update(await fs.readFile('workers/laptop/runtime/cycle.cjs')).digest('hex') }) + '\n');
