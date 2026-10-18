// Render the actual owned-listings account fence and library with explicit
// identity/data fixtures. Server/database ownership is tested separately.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const source = `import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{OwnedListings}from'./components/marketplace/owned-listings';
export function render(result){return renderToStaticMarkup(<OwnedListings clerkUserId='owner-a' result={result} presentation='library'/>);}`;
const bundle = await build({ absWorkingDir: process.cwd(), tsconfig:'tsconfig.json', stdin:{ contents:source,resolveDir:process.cwd(),loader:'tsx' }, bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',plugins:[{name:'identity-fixtures',setup(b){
  b.onResolve({filter:/^@clerk\/nextjs$|^@\/components\/auth\/auth-availability$|^@\/components\/account-action$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='@clerk/nextjs'?`export const useAuth=()=>globalThis.templateIdentity;`:args.path.endsWith('auth-availability')?`export const useAuthAvailable=()=>true;`:`import React from'react';export const AccountAction=({children})=><button>{children}</button>;`}));
}}] });
const require=createRequire(import.meta.url), loaded={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(require,loaded,loaded.exports);
const checks=[];const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const listing={id:'11111111-1111-4111-8111-111111111111',title:'Owned reusable scene',description:'Bring your own subject.',status:'published',template:{version:1,category:'cinematic',instructions:'Your own scene.',settings:{aspectRatio:'16:9',duration:'10',visualStyle:'Original',tone:'Storytelling'}}};
const result={items:[listing],total:25,page:2,pageSize:12};
globalThis.templateIdentity={isLoaded:true,userId:'owner-a'};
let html=loaded.exports.render(result);
check('existing configuration cover renders',html.includes('Template configuration preview')&&html.includes('Owned reusable scene'));
check('existing management route remains the template action',html.includes('/dashboard/marketplace/'+listing.id));
check('published template retains public detail action',html.includes('/marketplace/'+listing.id));
check('gallery pagination stays in Templates',html.includes('/dashboard/templates?page=1')&&html.includes('/dashboard/templates?page=3'));
check('does not fabricate media or filters',!/<video|<img|type="search"|<select/.test(html));
check('library omits management financial counters',!html.includes('Creator earnings')&&!html.includes('Paid sales'));
for(const status of ['draft','unpublished','archived']){
  html=loaded.exports.render({...result,items:[{...listing,status}]});
  check('non-public template never links to public detail '+status,!html.includes('href="/marketplace/'+listing.id+'"'));
}
html=loaded.exports.render({items:[],total:0,page:1,pageSize:12});
check('empty library offers the existing project publishing flow',html.includes('Your next starting point')&&html.includes('/dashboard/marketplace/new'));
html=loaded.exports.render({items:[],total:25,page:4,pageSize:12});
check('out of range has a usable recovery destination',html.includes('No templates on this page')&&html.includes('href="/dashboard/templates"'));
globalThis.templateIdentity={isLoaded:true,userId:'owner-b'};
html=loaded.exports.render(result);
check('account switch hides stale owner content',!html.includes(listing.title)&&!html.includes(listing.id)&&html.includes('Sign in to manage listings'));
globalThis.templateIdentity={isLoaded:false,userId:undefined};
check('pending identity never renders private template content',!loaded.exports.render(result).includes(listing.title));
delete globalThis.templateIdentity;
console.log(JSON.stringify({passed:checks.length,checks,evidence:'Actual React account fence/gallery with explicit identity and listing fixtures'}));
