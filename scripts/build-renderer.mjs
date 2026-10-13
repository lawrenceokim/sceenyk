import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {build} from 'esbuild';
// The render child needs normal React exports, separate from react-server.
// Compile our code at image-build time so rendering allocates no TS loader.
await build({absWorkingDir:process.cwd(),entryPoints:[path.resolve('workers/final-render/render-child.ts')],bundle:true,packages:'external',platform:'node',target:'node22',format:'cjs',outfile:path.resolve('workers/final-render/runtime/render-child.cjs'),logLevel:'error'});
for (const [entry,output] of [['scripts/media-preparation-worker.ts','media-worker'],['workers/final-render/server.ts','render-server']]) {
  await build({absWorkingDir:process.cwd(),entryPoints:[path.resolve(entry)],bundle:true,packages:'external',platform:'node',target:'node22',format:'cjs',outfile:path.resolve(`workers/final-render/runtime/${output}.cjs`),logLevel:'error',
    define:{'import.meta.url':'__workerModuleUrl'},banner:{js:"const __workerModuleUrl = require('node:url').pathToFileURL(__filename).href;"}});
}
await bundle({entryPoint:path.resolve('workers/final-render/composition.tsx'),outDir:path.resolve('workers/final-render/bundle'),onProgress(){}});
console.log('FINAL_RENDER_BUNDLE_READY');
