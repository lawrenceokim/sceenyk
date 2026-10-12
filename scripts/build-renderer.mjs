import path from 'node:path';
import {bundle} from '@remotion/bundler';
await bundle({entryPoint:path.resolve('workers/final-render/composition.tsx'),outDir:path.resolve('workers/final-render/bundle'),onProgress(){}});
console.log('FINAL_RENDER_BUNDLE_READY');
