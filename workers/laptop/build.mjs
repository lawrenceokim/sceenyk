import { build } from 'esbuild';
import path from 'node:path';
await build({
  absWorkingDir: process.cwd(), tsconfig: path.resolve('tsconfig.json'),
  entryPoints: [path.resolve('scripts/docker-worker-cycle.ts')], outfile: 'workers/laptop/runtime/cycle.cjs',
  bundle: true, packages: 'external', platform: 'node', target: 'node22', format: 'cjs',
  define: { 'import.meta.url': '__workerModuleUrl' },
  banner: { js: "const __workerModuleUrl = require('node:url').pathToFileURL(__filename).href;" },
  logLevel: 'warning',
});
