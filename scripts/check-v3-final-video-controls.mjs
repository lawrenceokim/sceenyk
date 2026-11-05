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
const bundled=await build({absWorkingDir:process.cwd(),stdin:{contents:'export {V3WorkflowPreview} from "./components/creation/v3-workflow-preview"; export {FinalVideoGenerate, FinalVideoReview} from "./components/creation/v3-final-video-controls";',resolveDir:process.cwd(),loader:'tsx'},tsconfig:resolve('tsconfig.json'),bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{
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
const {V3WorkflowPreview,FinalVideoGenerate,FinalVideoReview}=bundledModule.exports;
const text=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
const elements=node=>node==null?[]:Array.isArray(node)?node.flatMap(elements):typeof node==='object'&&node.props?[node,...elements(node.props.children)]:[];
const find=(tree,predicate)=>{const found=elements(tree).find(predicate);assert.ok(found);return found;};
let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};

let networkCalls=0; const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
try {
  const baseRun={id:'saved-run',packageId:'package',state:'queued',preview:null,current:true,errorCode:null,submissionBlocker:null,segmentId:'segment-1',expectedDialogue:[],shotTimings:[],estimatedCostMicrousd:null,hasAudio:null,actualDurationMs:null,actualCostMicrousd:null};
  const initial={projectId:'project',artifacts:[],tasks:[],runs:[],processing:false,preflight:{packageId:'package',packageHash:'hash',canSubmit:true,segmentCount:1,issues:[],authorizationState:'bound',currentness:'current',transportEnabled:true},complete:false};
  const props={initial,projectId:'project',assets:[],dirty:false,revision:'saved'};
  const render=()=>{cursor=0;return V3WorkflowPreview(props);};
  const finalTree=()=>{slots=[];let tree=render();find(tree,n=>n.type==='button'&&text(n)==='Final Video').props.onClick();return render();};
  for(const state of ['queued','submitting','provider_processing','result_saved','awaiting_review','approved','failed','reconciliation_required']){
    props.initial={...initial,runs:[{...baseRun,state,preview:['awaiting_review','approved'].includes(state)?'saved-video':null,hasKnownRequest:true}],complete:state==='approved'};
    const tree=finalTree(),generate=find(tree,n=>n.type===FinalVideoGenerate),running=['queued','submitting','provider_processing','result_saved'].includes(state);
    equal(generate.props.generating,running);equal(generate.props.disabled,true);
    const controls=FinalVideoGenerate(generate.props);equal(elements(controls).some(n=>n.props?.['aria-label']==='Generating final video'),running);
    equal(text(controls).includes('Generating...'),running);
    equal(find(controls,n=>n.type?.name==='Button').props.disabled,true);
    equal(text(tree).includes('Preparing your request'),false);equal(text(tree).includes('Final Video details'),false);
    if(state==='approved')equal(text(tree).includes('Complete'),true);
  }
  props.initial={...initial,runs:[{...baseRun,state:'provider_processing',errorCode:'DOWNLOAD_FAILED'}]};
  equal(find(finalTree(),n=>n.type===FinalVideoGenerate).props.generating,false);
  props.initial={...initial,tasks:[{id:'join',kind:'join',status:'running'}]};
  equal(find(finalTree(),n=>n.type===FinalVideoGenerate).props.generating,true);
  // A saved segment awaiting review stays hidden while another segment processes.
  props.initial={...initial,preflight:{...initial.preflight,segmentCount:2},runs:[{...baseRun,id:'ready-segment',state:'awaiting_review',preview:'saved-video'}, {...baseRun,id:'processing-segment',state:'provider_processing'}]};
  const mixed=find(finalTree(),n=>n.type===FinalVideoReview);
  equal(mixed.props.generating,true);
  cursor=0;const hiddenReview=FinalVideoReview(mixed.props);
  equal(text(hiddenReview).includes('Ready for review'),false);
  equal(elements(hiddenReview).some(n=>n.type?.name==='Button'),false);
  props.initial=initial;let tree=finalTree(),generate=find(tree,n=>n.type===FinalVideoGenerate);equal(generate.props.generating,false);equal(generate.props.disabled,false);
  // Actual Generate handler, pending UI, failed response. No live requests.
  const requests=[];let resolveRequest;
  globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return new Promise(resolve=>resolveRequest=resolve);};
  generate.props.onGenerate();tree=render();equal(requests.length,1);equal(requests[0].action,'generate');equal(requests[0].packageId,'package');
  generate=find(tree,n=>n.type===FinalVideoGenerate);equal(generate.props.generating,true);equal(generate.props.disabled,true);
  equal(text(tree).includes('Preparing your request'),false);
  resolveRequest(Response.json({ok:false,code:'V3_PROVIDER_OUTCOME_UNKNOWN'},{status:409}));await new Promise(resolve=>setTimeout(resolve,0));
  equal(find(render(),n=>n.type===FinalVideoGenerate).props.generating,false);
  props.initial={...initial,runs:[{...baseRun,state:'awaiting_review',preview:'saved-video'}]};
  tree=finalTree();
  const approval=find(tree,n=>n.type===FinalVideoReview).props.act('approve',{id:'saved-run',reviewMode:'direct'});
  resolveRequest(Response.json({ok:false,code:'V3_DIRECT_APPROVAL_SETUP_REQUIRED'},{status:409}));await approval;
  equal(text(render()).includes('migration 092 after 091'),true);
  equal(text(render()).includes('before building the Generation Package'),false);
  const selections=[];globalThis.__studioPanels={selectMedia:id=>selections.push(id)};
  const actions=[];const reviewProps={run:{...baseRun,state:'awaiting_review',preview:'saved-video'},busy:false,segmentCount:1,act:async(...args)=>{actions.push(args);return true;}};
  const review=()=>{cursor=0;return FinalVideoReview(reviewProps);};slots=[];
  tree=review();equal(elements(tree).some(n=>['select','textarea'].includes(n.type)),false);
  equal(text(tree).includes('Ready for review'),true);
  equal(text(tree).includes('Use Preview to watch the video before approving.'),true);
  equal(find(tree,n=>n.type?.name==='Button'&&text(n)==='View in Preview').props.className,'w-full');
  // Progress history keeps its previous compact presentation.
  cursor=0;const history=FinalVideoReview({...reviewProps,compact:true});
  equal(text(history).includes('Ready for review'),false);
  equal(text(history).includes('Use Preview to watch the video before approving.'),false);
  equal(find(history,n=>n.type?.name==='Button'&&text(n)==='View in Preview').props.className,undefined);
  find(tree,n=>n.type?.name==='Button'&&text(n)==='View in Preview').props.onClick();equal(selections,['v3-video:saved-run']);
  find(tree,n=>n.type?.name==='Button'&&text(n)==='Approve Final Video').props.onClick();
  equal(actions,[['approve',{id:'saved-run',reviewMode:'direct'}]]);actions.length=0;
  find(tree,n=>n.type?.name==='Button'&&text(n)==='Reject and Delete').props.onClick();tree=review();
  const dialog=find(tree,n=>n.type?.name==='Dialog');equal(dialog.props.open,true);equal(actions.length,0);
  find(dialog,n=>n.type?.name==='Button'&&text(n)==='Cancel').props.onClick();equal(find(review(),n=>n.type?.name==='Dialog').props.open,false);equal(actions.length,0);
  find(review(),n=>n.type?.name==='Button'&&text(n)==='Reject and Delete').props.onClick();
  find(find(review(),n=>n.type?.name==='Dialog'),n=>n.type?.name==='Button'&&text(n)==='Reject and Delete').props.onClick();await Promise.resolve();
  equal(actions[0][0],'reject_delete');equal(actions[0][1].confirmedDeletion,true);equal(Object.values(actions[0][1].quality).includes('pass'),false);equal(find(review(),n=>n.type?.name==='Dialog').props.open,false);
  reviewProps.run.current=false;equal(find(review(),n=>n.type?.name==='Button'&&text(n)==='Approve Final Video').props.disabled,true);
  for(const state of ['queued','provider_processing','failed','approved','deleted','reconciliation_required']){
    reviewProps.run={...baseRun,state};tree=review();equal(elements(tree).some(n=>n.type?.name==='Button'&&text(n)==='View in Preview'),false);
    equal(text(tree).includes('Ready for review'),false);
    equal(text(tree).includes('Use Preview to watch the video before approving.'),false);
    equal(elements(tree).some(n=>n.type?.name==='Button'&&text(n)==='Approve Final Video'),false);
    if(state==='reconciliation_required')find(tree,n=>n.type?.name==='Button'&&text(n)==='Recover saved work').props.onClick();
  }
  equal(actions.at(-1),['recover',{id:'saved-run'}]);
  reviewProps.run={...baseRun,submissionBlocker:'V3_REFERENCE_DELIVERY_EXPIRED'};
  find(review(),n=>n.type?.name==='Button'&&text(n)==='Refresh saved request links').props.onClick();equal(actions.at(-1),['refresh_video_delivery',{id:'saved-run'}]);
  reviewProps.run={...baseRun,state:'deleting'};find(review(),n=>n.type?.name==='Button'&&text(n)==='Retry deletion').props.onClick();equal(actions.at(-1),['recover',{id:'saved-run'}]);
  reviewProps.run={...baseRun,state:'approved',resolution:'720p',actualDimensions:{width:720,height:1280}};tree=review();
  equal(text(tree).includes('Requested: 720p'),true);equal(text(tree).includes('Actual: 720 × 1280'),true);
  equal(networkCalls,0);
  console.log(JSON.stringify({checks,realNetworkCalls:networkCalls,scope:'Final Video saved-state UI and actual handlers'}));
}finally{globalThis.fetch=originalFetch;delete globalThis.__referenceReact;delete globalThis.__studioPanels;}
