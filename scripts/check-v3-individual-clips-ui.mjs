// Actual component handlers/dialog with isolated React hook state; no browser/provider/network.
import assert from 'node:assert/strict';
import React from 'react';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
let slots=[],cursor=0;
const hooks={...React,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect(){},useCallback:value=>value,useMemo:value=>value(),
};
globalThis.__referenceReact=hooks;
const bundled=await build({absWorkingDir:process.cwd(),stdin:{contents:'export {V3ClipManager} from "./components/creation/v3-clip-manager";',resolveDir:process.cwd(),loader:'tsx'},tsconfig:resolve('tsconfig.json'),bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{
  name:'reference-ui-fixtures',setup(builder){
    builder.onResolve({filter:/^\.\/components\//},args=>({path:resolve(args.path+'.tsx')}));
    builder.onResolve({filter:/^(react|next\/image|@\/components\/workspace\/studio-mode-provider|@\/components\/ui\/(button|dialog)|\.\/studio-workspace-panels)$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>{
      if(args.path==='react')return{contents:'const r=globalThis.__referenceReact;export const useState=r.useState,useRef=r.useRef,useEffect=r.useEffect,useCallback=r.useCallback,useMemo=r.useMemo;'};
      if(args.path==='@/components/workspace/studio-mode-provider')return{contents:'export const useStudioMode=()=>({mode:"basic"});'};
      if(args.path==='./studio-workspace-panels')return{contents:'export const useStudioPanels=()=>globalThis.__studioPanels??null;export function StudioPanelPortal(props){return props.children;}export function StudioWorkflowMedia(){return null;}'};
      if(args.path==='next/image')return{contents:'export default function Image(props){return null;}'};
      const names=args.path.endsWith('/button')?['Button']:['Dialog','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle'];
      return{contents:names.map(name=>`export function ${name}(props){return props.children;}`).join('\n')};
    });
  },
}]});
const bundledModule={exports:{}};
new Function('require','module','exports',bundled.outputFiles[0].text)(require,bundledModule,bundledModule.exports);
const {V3ClipManager}=bundledModule.exports;
const text=n=>n==null||typeof n==='boolean'?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
const elements=n=>n==null?[]:Array.isArray(n)?n.flatMap(elements):typeof n==='object'&&n.props?[n,...elements(n.props.children)]:[];
const find=(tree,label)=>{const value=elements(tree).find(n=>n.type?.name==='Button'&&text(n)===label);assert.ok(value,label);return value;};
let checks=0,networkCalls=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=v=>{assert.ok(v);checks++;};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
try {
 const calls=[],selected=[];
 globalThis.__studioPanels={selectMedia:id=>selected.push(id)};
 const clip={id:'clip-1',number:1,startMs:0,endMs:30000,durationMs:30000,purpose:'The first demonstration.',segmentId:'segment-1',
  runId:null,attempts:0,needsContinuityReview:false,estimatedCostMicrousd:6170010,suggestedMaximumMicrousd:7410000,authorized:true,canGenerate:true,canRegenerate:false};
 const group={packageId:'package',packageHash:'hash',committedMicrousd:0,reservedMicrousd:9000000,clips:[clip],readyForMerging:false};
 const workspace={multiClip:group,runs:[],preflight:{packageId:'package',quoteId:'quote'},proDurationRetained:false,processing:false};
 const props={workspace,act:async(action,payload)=>{calls.push({action,payload});return true;},disabled:false};
 const render=()=>{cursor=0;return V3ClipManager(props);};
 let tree=render();ok(text(tree).includes('Clip 1'));ok(text(tree).includes('30s'));ok(text(tree).includes('Waiting to generate'));
 ok(elements(tree).some(n=>n.type==='ol'&&n.props['aria-label']==='Planned video clips'&&n.props.className.includes('sm:grid-cols-2')));
 equal(find(tree,'Generate Clip').props.disabled,false);await find(tree,'Generate Clip').props.onClick();
 equal(calls.at(-1),{action:'generate_clip',payload:{packageId:'package',packageHash:'hash',clipId:'clip-1',segmentId:'segment-1'}});
 const base={id:'run-1',current:true,state:'awaiting_review',preview:'private-signed-url',hasKnownRequest:true,errorCode:null,submissionBlocker:null};
 for(const state of ['queued','submitting','provider_processing','result_saved','awaiting_review','approved','failed','reconciliation_required','deleting','deleted']) {
  slots=[];workspace.runs=[{...base,state,preview:['awaiting_review','approved'].includes(state)?base.preview:null}];group.clips=[{...clip,runId:'run-1',attempts:1,canGenerate:false}];
  tree=render();equal(elements(tree).filter(n=>n.props['aria-label']==='Generating clip 1').length,['queued','submitting','provider_processing','result_saved'].includes(state)?1:0);
  equal(elements(tree).some(n=>n.props.className?.includes('animate-pulse')),false);
  if(state==='awaiting_review') {
   find(tree,'View in Preview').props.onClick();equal(selected.at(-1),'v3-video:run-1');
   await find(tree,'Approve Clip').props.onClick();equal(calls.at(-1),{action:'approve',payload:{id:'run-1',reviewMode:'direct'}});
   find(tree,'Reject and Delete').props.onClick();tree=render();ok(text(tree).includes('Delete Clip 1?'));ok(text(tree).includes('Other clips stay saved'));
   const count=calls.length;equal(calls.length,count);await find(tree,'Confirm deletion').props.onClick();equal(calls.at(-1).action,'reject_delete');equal(calls.at(-1).payload.confirmedDeletion,true);
  }
  if(state==='approved') {ok(!elements(tree).some(n=>text(n)==='Regenerate'&&n.type?.name==='Button'));find(tree,'View in Preview').props.onClick();equal(selected.at(-1),'v3-video:run-1');}
  if(state==='reconciliation_required') {await find(tree,'Recover saved work').props.onClick();equal(calls.at(-1).action,'recover');}
 }
 slots=[];group.clips=[{...clip,runId:'run-1',attempts:1,authorized:false,canRegenerate:true}];workspace.runs=[{...base,state:'deleted',preview:null}];
 tree=render();find(tree,'Regenerate').props.onClick();tree=render();equal(find(tree,'Approve regeneration cost').props.disabled,true);
 const checkbox=elements(tree).find(n=>n.type==='input'&&n.props.type==='checkbox');checkbox.props.onChange({target:{checked:true}});tree=render();
 equal(find(tree,'Approve regeneration cost').props.disabled,false);
 group.reservedMicrousd+=10000;tree=render();equal(find(tree,'Approve regeneration cost').props.disabled,true);ok(text(tree).includes('Spending reservations changed'));
 group.reservedMicrousd-=10000;tree=render();await find(tree,'Approve regeneration cost').props.onClick();
 equal(calls.at(-1),{action:'authorize_clip',payload:{operatorApproved:true,packageId:'package',packageHash:'hash',quoteId:'quote',segmentId:'segment-1',previousRunId:'run-1',maximumMicrousd:7410000,cumulativeMaximumMicrousd:16410000}});
 equal(calls.filter(c=>c.action==='generate_clip').length,1);
 // A changed selection requires a fresh confirmation, including while a dialog is open.
 slots=[];tree=render();find(tree,'Regenerate').props.onClick();group.clips=[{...group.clips[0],runId:'run-2'}];tree=render();equal(find(tree,'Approve regeneration cost').props.disabled,true);
 slots=[];group.clips=[{...clip,runId:'run-1',needsContinuityReview:true}];workspace.runs=[{...base,state:'approved'}];group.readyForMerging=true;tree=render();
 ok(text(tree).includes('ready for merging'));ok(text(tree).includes('final video is not complete yet'));ok(text(tree).includes('approval are preserved'));
 ok(!elements(tree).some(n=>n.type?.name==='Button'&&text(n)==='Merge Videos'));
 // Busy independent workers do not disable a different waiting clip.
 workspace.processing=true;workspace.runs=[];group.clips=[clip];tree=render();equal(find(tree,'Generate Clip').props.disabled,false);
 props.disabled=true;tree=render();equal(find(tree,'Generate Clip').props.disabled,true);
 props.disabled=false;workspace.proDurationRetained=true;tree=render();equal(find(tree,'Generate Clip').props.disabled,true);
 equal(networkCalls,0);console.info(JSON.stringify({individualClipUiChecks:checks,realNetworkCalls:networkCalls}));
} finally {globalThis.fetch=originalFetch;delete globalThis.__referenceReact;delete globalThis.__studioPanels;}
