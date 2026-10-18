// Actual internal layout and readSupportPage; explicit role/transport and UI
// wrapper fixtures. No role grants, hosted reads or payout checks are performed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const source=`import React from'react';import{renderToStaticMarkup}from'react-dom/server';import Layout from'./app/admin/layout';
export async function render(){const layout=Layout({children:<p>PRIVATE_CHILD_FIXTURE</p>});const boundary=layout.props.children;return renderToStaticMarkup(await boundary.type(boundary.props));}`;
const fixture={
  '@/lib/auth/require-admin-or-support':`export class SupportAuthorizationError extends Error{constructor(code){super(code);this.code=code;}}export async function requireAdminOrSupport(){globalThis.internalReads++;if(globalThis.internalMode==='deny')throw new SupportAuthorizationError('SUPPORT_ACCESS_DENIED');if(globalThis.internalMode==='unavailable')throw Error('TRANSPORT_FIXTURE');return{role:'support'};}`,
  '@/lib/marketplace/withdrawals/observations':`export class PayoutCheckError extends Error{}`,
  './server':`export class PayoutSupportInputError extends Error{}`,
  'next/navigation':`export function notFound(){throw Error('NEXT_NOT_FOUND')}export function unstable_rethrow(){}`,
  'next/link':`import React from'react';export default function Link({prefetch,...props}){return <a {...props}/>}`,
  '@/components/workspace/workspace-shell':`import React from'react';export function WorkspaceShell({children}){return <div data-fixture-shell>{children}</div>}`,
  '@/components/workspace/workspace-page-frame':`import React from'react';export function WorkspacePageFrame({children}){return <div data-fixture-frame>{children}</div>}`,
  '@/components/payout-support/views':`import React from'react';export function SupportUnavailable(){return <p role='alert'>Support unavailable fixture</p>}`,
  'server-only':'',
};
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',plugins:[{name:'boundary-fixtures',setup(b){
  b.onResolve({filter:/.*/},args=>Object.hasOwn(fixture,args.path)?{path:args.path,namespace:'fixture'}:undefined);
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixture[args.path],loader:'jsx',resolveDir:process.cwd()}));
}}]});
const loaded={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),loaded,loaded.exports);
globalThis.internalReads=0;globalThis.internalMode='allow';
const allowed=await loaded.exports.render();assert.ok(allowed.includes('data-fixture-shell')&&allowed.includes('data-fixture-frame')&&allowed.includes('Internal navigation')&&allowed.includes('PRIVATE_CHILD_FIXTURE'));
globalThis.internalMode='deny';await assert.rejects(()=>loaded.exports.render(),/NEXT_NOT_FOUND/);
globalThis.internalMode='unavailable';const failed=await loaded.exports.render();assert.ok(failed.includes('Support unavailable fixture')&&!failed.includes('PRIVATE_CHILD_FIXTURE'));
assert.equal(globalThis.internalReads,3);
delete globalThis.internalMode;delete globalThis.internalReads;
console.log(JSON.stringify({passed:4,evidence:'Actual admin layout/read boundary with explicit role, transport and shell-wrapper fixtures; no hosted role change'}));
