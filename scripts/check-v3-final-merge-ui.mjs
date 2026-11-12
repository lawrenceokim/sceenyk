// Actual component handlers/dialog with isolated React hook state; no browser/provider/network.
import assert from 'node:assert/strict';
import React from 'react';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
let slots=[],cursor=0;
const hooks={...React,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect(){},useCallback:value=>value,useMemo:value=>value(),
};
globalThis.__referenceReact=hooks;
const bundled=await build({absWorkingDir:process.cwd(),stdin:{contents:'export {V3MergeReview} from "./components/creation/v3-merge-review";',resolveDir:process.cwd(),loader:'tsx'},tsconfig:resolve('tsconfig.json'),bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{
  name:'reference-ui-fixtures',setup(builder){
    builder.onResolve({filter:/^\.\/components\//},args=>({path:resolve(args.path+'.tsx')}));
    builder.onResolve({filter:/^(react|next\/image|@\/components\/workspace\/studio-mode-provider|@\/components\/ui\/(button|dialog)|\.\/studio-workspace-panels)$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>{
      if(args.path==='react')return{contents:'const r=globalThis.__referenceReact;export const useState=r.useState,useRef=r.useRef,useEffect=r.useEffect,useCallback=r.useCallback,useMemo=r.useMemo;'};
      if(args.path==='@/components/workspace/studio-mode-provider')return{contents:'export const useStudioMode=()=>({mode:"basic"});'};
      if(args.path==='./studio-workspace-panels')return{contents:'export const useStudioPanels=()=>globalThis.__studioPanels??null;export function StudioPanelPortal(props){return props.children;}export function StudioWorkflowMedia(){return null;}'};
      if(args.path==='next/image')return{contents:'export default function Image(props){return null;}'};
      const names=args.path.endsWith('/button')?['Button']:['Dialog','DialogClose','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle','DialogTrigger'];
      return{contents:names.map(name=>`export function ${name}(props){return props.children;}`).join('\n')};
    });
  },
}]});
const bundledModule={exports:{}};
new Function('require','module','exports',bundled.outputFiles[0].text)(require,bundledModule,bundledModule.exports);
const {V3MergeReview}=bundledModule.exports;
const text=n=>n==null||typeof n==='boolean'?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
const elements=n=>n==null?[]:Array.isArray(n)?n.flatMap(elements):typeof n==='object'&&n.props?[n,...elements(n.props.children)]:[];
const find=(tree,label)=>{const value=elements(tree).find(n=>n.type?.name==='Button'&&text(n)===label);assert.ok(value,label);return value;};
let checks=0,networkCalls=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=v=>{assert.ok(v);checks++;};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};

try {
 const calls=[],selections=[];globalThis.__studioPanels={selectMedia:id=>selections.push(id)};
 const group={packageId:'package',packageHash:'hash',readyForMerging:false,clips:[],merge:{manifestHash:'manifest',canMerge:false,taskId:null,status:null,resultId:null,errorCode:null}};
 const workspace={projectId:'project',multiClip:group,runs:[],tasks:[]};
 const props={workspace,disabled:false,act:async(action,payload)=>{calls.push({action,payload});return true;}};
 const render=()=>{cursor=0;return V3MergeReview(props);};
 let tree=render();ok(text(tree).includes('Approve every required clip'));equal(find(tree,'Merge Videos').props.disabled,true);
 for(const count of [2,4,7,9]){
  slots=[];group.clips=Array.from({length:count},(_,i)=>({id:'clip-'+i}));group.readyForMerging=true;group.merge.canMerge=true;
  tree=render();ok(text(tree).includes('Ready to merge'));equal(find(tree,'Merge Videos').props.disabled,false);
  const button=find(tree,'Merge Videos');button.props.onClick();button.props.onClick();await new Promise(resolve=>setImmediate(resolve));
  equal(calls.at(-1),{action:'merge',payload:{packageId:'package',packageHash:'hash',manifestHash:'manifest'}});
  equal(calls.filter(c=>c.action==='merge').length,[2,4,7,9].indexOf(count)+1);
 }
 group.merge.status='running';tree=render();ok(text(tree).includes('Merging videos...'));equal(find(tree,'Merge Videos').props.disabled,true);
 ok(elements(tree).some(n=>n.props?.className?.includes('motion-safe:animate-spin')));
 group.merge.status='failed';group.merge.errorCode='V3_MERGE_SOURCE_INVALID';tree=render();ok(text(tree).includes('Merging failed'));equal(find(tree,'Retry merging').props.disabled,false);ok(!text(tree).includes('V3_MERGE_SOURCE_INVALID'));
 group.merge.status='done';group.merge.resultId='merged';workspace.runs=[{id:'merged',packageId:'package',segmentId:'joined',state:'awaiting_review',current:true,preview:'private-preview'}];
 tree=render();ok(text(tree).includes('Final video ready for review'));equal(find(tree,'Approve Final Video').props.disabled,false);
 find(tree,'View in Preview').props.onClick();equal(selections,['v3-video:merged']);
 find(tree,'Approve Final Video').props.onClick();await new Promise(resolve=>setImmediate(resolve));equal(calls.at(-1),{action:'approve',payload:{id:'merged',reviewMode:'direct'}});
 workspace.runs[0].preview=null;tree=render();equal(find(tree,'Approve Final Video').props.disabled,true);
 workspace.runs[0].preview='private-preview';workspace.runs[0].current=false;group.merge.resultId=null;tree=render();ok(text(tree).includes('outdated'));equal(find(tree,'Approve Final Video').props.disabled,true);equal(find(tree,'Merge Videos').props.disabled,false);
 workspace.runs[0].current=true;group.merge.resultId='merged';tree=render();find(tree,'Reject and Delete').props.onClick();tree=render();ok(elements(tree).some(n=>n.type?.name==='Dialog'&&n.props.open));ok(text(tree).includes('approved individual clips stay saved'));
 const deleteButton=elements(tree).filter(n=>n.type?.name==='Button'&&text(n)==='Reject and Delete').at(-1);deleteButton.props.onClick();await new Promise(resolve=>setImmediate(resolve));equal(calls.at(-1).action,'reject_delete');equal(calls.at(-1).payload.id,'merged');equal(calls.at(-1).payload.confirmedDeletion,true);
 workspace.runs[0].state='approved';tree=render();ok(text(tree).includes('Final video approved'));ok(!elements(tree).some(n=>n.type?.name==='Button'&&text(n)==='Approve Final Video'));
 workspace.runs[0].state='deleting';workspace.runs[0].errorCode='DELETE_FAILED';tree=render();ok(text(tree).includes('Deleting merged video...'));find(tree,'Retry deletion').props.onClick();await new Promise(resolve=>setImmediate(resolve));equal(calls.at(-1),{action:'recover',payload:{id:'merged'}});
 workspace.runs[0].state='deleted';group.merge.deleted=true;tree=render();equal(find(tree,'Merge Videos').props.disabled,false);
 props.disabled=true;tree=render();equal(find(tree,'Merge Videos').props.disabled,true);
 props.disabled=false;props.operation={active:true,blocked:true,message:'Checking final approval...',detail:'The response was interrupted. Checking saved status...',error:'',checkStatus(){}};
 workspace.runs[0].state='awaiting_review';tree=render();ok(text(tree).includes('Checking final approval...'));equal(find(tree,'Approving...').props.disabled,true);equal(find(tree,'Reject and Delete').props.disabled,true);equal(tree.props['aria-busy'],true);ok(text(tree).includes('Checking saved status'));
 props.operation={active:false,blocked:true,message:null,detail:null,error:'The service needs administrator attention.',checkStatus(){calls.push({action:'check-status'});}};tree=render();find(tree,'Check status').props.onClick();equal(calls.at(-1).action,'check-status');equal(find(tree,'Approve Final Video').props.disabled,true);
 props.operation=undefined;props.refreshing=true;tree=render();ok(text(tree).includes('Refreshing final status...'));equal(find(tree,'Approve Final Video').props.disabled,true);props.refreshing=false;
 const source=await readFile('components/creation/v3-merge-review.tsx','utf8');
 for(const token of ['flex-wrap','min-w-0','max-w-full','whitespace-normal','bg-primary/5','border-primary/20','role="status"','aria-live="polite"'])ok(source.includes(token));
 ok(!calls.some(c=>['generate','generate_clip','authorize','authorize_clip'].includes(c.action)));equal(networkCalls,0);
 console.info(JSON.stringify({finalMergeUiChecks:checks,realNetworkCalls:networkCalls}));
} finally {globalThis.fetch=originalFetch;delete globalThis.__referenceReact;delete globalThis.__studioPanels;}
