// Actual selector handlers + independent client state; offline, no live auth/providers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {typescriptLoader} from './lib/load-typescript.mjs';

const require=createRequire(import.meta.url),originalFetch=globalThis.fetch;
let checks=0,networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
const eq=(a,b)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;};
const ok=value=>{assert.ok(value);checks++;};
const load=typescriptLoader(),{StudioModeStore}=load('lib/studio-mode/client-state.ts');
const {needsBasicConfirmation}=load('lib/studio-mode/contract.ts');
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};};
const result=(viewer,preferredMode,projectMode=null)=>({ok:true,data:{clerkUserId:viewer,preferredMode,projectMode}});
const elements=node=>node==null?[]:Array.isArray(node)?node.flatMap(elements):typeof node==='object'&&node.props?[node,...elements(node.props.children)]:[];

try {
  let preferred='basic',reads=0,writes=0,guest='basic';
  const projects={a:'basic',b:'pro'};
  const store=new StudioModeStore({
    read:async id=>{reads++;return result('owner',preferred,id?projects[id]:null);},
    save:async({projectId,mode})=>{writes++;preferred=mode;if(projectId)projects[projectId]=mode;return result('owner',preferred,projectId?mode:null);},
    readGuest:()=>guest,saveGuest:value=>{guest=value;},
  });
  eq(store.getSnapshot().mode,'basic');
  await store.open({userId:'owner',projectId:'a'});
  eq(store.getSnapshot().mode,'basic');
  await store.select('pro');eq(projects,{a:'pro',b:'pro'});eq(preferred,'pro');
  await store.select('basic');eq(projects,{a:'basic',b:'pro'});
  await store.open({userId:'owner',projectId:'b'});eq(store.getSnapshot().mode,'pro');
  await store.open({userId:'owner',projectId:null});eq(store.getSnapshot().mode,'basic');
  await store.select('pro');
  await store.open({userId:'owner',projectId:'a'});eq(store.getSnapshot().mode,'basic');eq(preferred,'pro');
  await store.open({userId:'owner',projectId:null});eq(store.getSnapshot().mode,'pro');
  // Recreate the client after a refresh; only persisted state restores the mode.
  const refreshed=new StudioModeStore({read:async id=>result('owner',preferred,id?projects[id]:null),save:async()=>{throw Error('Unexpected write');},readGuest:()=>null,saveGuest:()=>{}});
  await refreshed.open({userId:'owner',projectId:'a'});eq(refreshed.getSnapshot().mode,'basic');
  await refreshed.open({userId:'owner',projectId:null});eq(refreshed.getSnapshot().mode,'pro');
  // A slow response for project A must not change project B after navigation.
  const slow=deferred();
  const racing=new StudioModeStore({read:id=>id==='a'?slow.promise:Promise.resolve(result('owner','basic','pro')),save:async()=>result('owner','basic'),readGuest:()=>null,saveGuest:()=>{}});
  const old=racing.open({userId:'owner',projectId:'a'});await Promise.resolve();
  await racing.open({userId:'owner',projectId:'b'});slow.resolve(result('owner','basic','basic'));await old;
  eq(racing.getSnapshot().mode,'pro');ok(racing.getSnapshot().key.endsWith(':b'));
  // Navigation waits for the submitted write, then reads server truth. Repeated
  // clicks while pending cannot create duplicate writes.
  const saving=deferred();let saveCalls=0,readAfterSave=false,committed=false;
  const ordered=new StudioModeStore({read:async id=>{if(id==='b')readAfterSave=committed;return result('owner',committed?'pro':'basic',id?'basic':null);},save:async()=>{saveCalls++;await saving.promise;committed=true;return result('owner','pro','pro');},readGuest:()=>null,saveGuest:()=>{}});
  await ordered.open({userId:'owner',projectId:'a'});
  const write=ordered.select('pro');void ordered.select('pro');eq(saveCalls,1);ok(ordered.getSnapshot().pending);
  const navigating=ordered.open({userId:'owner',projectId:'b'});saving.resolve();await write;await navigating;ok(readAfterSave);eq(ordered.getSnapshot().mode,'basic');
  const invalid=new StudioModeStore({read:async()=>result('another-owner','pro','pro'),save:async()=>({ok:false,message:'Failed'}),readGuest:()=>null,saveGuest:()=>{}});
  await invalid.open({userId:'owner',projectId:'a'});eq(invalid.getSnapshot().ready,false);ok(invalid.getSnapshot().error);
  const failing=new StudioModeStore({read:async()=>result('owner','basic','basic'),save:async()=>({ok:false,message:'Failed'}),readGuest:()=>null,saveGuest:()=>{}});
  await failing.open({userId:'owner',projectId:'a'});await failing.select('pro');eq(failing.getSnapshot().mode,'basic');eq(failing.getSnapshot().pending,false);ok(failing.getSnapshot().error);
  const counts=[reads,writes];await store.open({userId:null,projectId:null});await store.select('pro');eq(guest,'pro');eq([reads,writes],counts);
  await store.open({userId:undefined,projectId:null});eq(store.getSnapshot().ready,false);eq([reads,writes],counts);
  eq(needsBasicConfirmation('pro','basic',[]),false);
  eq(needsBasicConfirmation('pro','basic',['Multiple characters']),true);
  eq(needsBasicConfirmation('basic','pro',['Multiple characters']),false);

  // Use the actual React markup/handlers; only the metadata context is a fixture.
  globalThis.__studioModeReact={...React,useId:()=> 'mode-fixture'};
  const built=await build({absWorkingDir:process.cwd(),entryPoints:[resolve('components/workspace/studio-mode-selector.tsx')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',tsconfig:resolve('tsconfig.json'),plugins:[{name:'mode-context-fixture',setup(b){
    b.onResolve({filter:/^@\/lib\/studio-mode\/contract$/},()=>({path:resolve('lib/studio-mode/contract.ts')}));
    b.onResolve({filter:/^\.\/studio-mode-provider$/},()=>({path:'mode-context',namespace:'fixture'}));
    b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='react'?'export const useId=()=>globalThis.__studioModeReact.useId();':'export const useStudioMode=()=>globalThis.__studioModeFixture;'}));
  }}]});
  const bundled={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,bundled,bundled.exports);
  const {StudioModeSelector,StudioModeBadge}=bundled.exports;
  await store.open({userId:'owner',projectId:'a'});
  const context=()=>{globalThis.__studioModeFixture={...store.getSnapshot(),select:mode=>store.select(mode),retry:()=>store.open({userId:'owner',projectId:'a'})};};
  for(const collapsed of [false,true])for(const mode of ['basic','pro']){
    await store.select(mode);context();
    const tree=StudioModeSelector({collapsed}),html=renderToStaticMarkup(tree);
    const inputs=elements(tree).filter(e=>e.type==='input');
    eq(inputs.length,2);eq(inputs.filter(e=>e.props.checked).length,1);
    eq(inputs.find(e=>e.props.checked).props.value,mode);
    ok(html.includes(`${mode==='pro'?'Pro':'Basic'} Studio active`));ok(html.includes('Studio mode'));
    ok(html.includes('peer-focus-visible:outline-2'));ok(html.includes('peer-checked:bg-primary'));
    const badge=renderToStaticMarkup(StudioModeBadge());ok(badge.includes(`data-studio-mode="${mode}"`));ok(!badge.includes('hidden'));
    const next=mode==='pro'?'basic':'pro';await inputs.find(e=>e.props.value===next).props.onChange();eq(store.getSnapshot().mode,next);
    ok(!/upgrade|subscription|120 seconds|Merge Videos/.test(html));
  }
  const sidebar=fs.readFileSync('components/workspace/workspace-sidebar.tsx','utf8');ok(sidebar.indexOf('<StudioModeSelector')<sidebar.indexOf('workspace-collapse'));
  ok(fs.readFileSync('components/workspace/workspace-mobile-nav.tsx','utf8').includes('<StudioModeSelector />'));
  ok(fs.readFileSync('components/creation/studio-layout.tsx','utf8').includes('<StudioModeBadge />'));
  const modeSources=['app/actions/studio-mode.ts','lib/studio-mode/server.ts','lib/studio-mode/client-state.ts','components/workspace/studio-mode-provider.tsx'].map(p=>fs.readFileSync(p,'utf8')).join('\n');
  ok(!/revalidatePath\(|router\.|location\.(reload|assign)|final-video-generation|openai|higgsfield/i.test(modeSources));
  eq(networkCalls,0);
  console.log(JSON.stringify({passed:checks,networkCalls,evidence:'Client persistence/races/identity/failure handling; actual expanded/collapsed selector and badge markup/handlers; navigation placement and future confirmation policy. Visual/browser acceptance separate.'}));
} finally {globalThis.fetch=originalFetch;delete globalThis.__studioModeReact;delete globalThis.__studioModeFixture;}
