// Actual component handlers/dialog with isolated React hook state; no browser/provider/network.
import assert from 'node:assert/strict';
import React from 'react';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
let slots=[],cursor=0,calls=[],resolveRequest;
const hooks={...React,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect(){},useCallback:value=>value,
};
globalThis.__referenceReact=hooks;
const bundled=await build({absWorkingDir:process.cwd(),entryPoints:[resolve('components/creation/v3-workflow-preview.tsx')],tsconfig:resolve('tsconfig.json'),bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{
  name:'reference-ui-fixtures',setup(builder){
    builder.onResolve({filter:/^(react|next\/image|@\/components\/ui\/(button|dialog))$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>{
      if(args.path==='react')return{contents:'const r=globalThis.__referenceReact;export const useState=r.useState,useRef=r.useRef,useEffect=r.useEffect,useCallback=r.useCallback;'};
      if(args.path==='next/image')return{contents:'export default function Image(props){return null;}'};
      const names=args.path.endsWith('/button')?['Button']:['Dialog','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle'];
      return{contents:names.map(name=>`export function ${name}(props){return props.children;}`).join('\n')};
    });
  },
}]});
const bundledModule={exports:{}};
new Function('require','module','exports',bundled.outputFiles[0].text)(require,bundledModule,bundledModule.exports);
const {V3WorkflowPreview}=bundledModule.exports;
const text=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
const elements=node=>node==null?[]:Array.isArray(node)?node.flatMap(elements):typeof node==='object'&&node.props?[node,...elements(node.props.children)]:[];
const find=(tree,predicate)=>{const found=elements(tree).find(predicate);assert.ok(found);return found;};
let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const originalFetch=globalThis.fetch;
try {
  globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return new Promise(resolve=>{resolveRequest=resolve;});};
  for(const kind of ['character','product']) {
    slots=[];calls=[];
    const subject=kind==='character'?'Character':'Product',id=`saved-${kind}`;
    const initial={projectId:'fixture-project',artifacts:[{id,kind,version:1,activeSlot:true,current:true,approved:false,rejected:false,preview:'private-old-image'}],tasks:[],runs:[],processing:false,preflight:null,complete:false};
    const saved=JSON.stringify(initial);
    const props={initial,projectId:initial.projectId,assets:[{id:'source',studioRole:kind,status:'uploaded',removedFromDraft:false}],dirty:false,revision:'saved'};
    const render=()=>{cursor=0;return V3WorkflowPreview(props);};
    const modal=tree=>find(tree,node=>node.type?.name==='ReferenceRegenerationDialog');
    const button=tree=>find(tree,node=>node.type?.name==='Button'&&text(node)===`Regenerate ${subject} Sheet`);
    button(render()).props.onClick();
    let tree=render(),dialog=modal(tree);
    equal(calls.length,0);equal(dialog.props.kind,kind);
    const content=dialog.type(dialog.props);
    equal(content.props.open,true);
    equal(text(find(content,node=>node.type?.name==='DialogTitle')),`Regenerate ${subject} Sheet?`);
    equal(text(find(content,node=>node.type?.name==='DialogDescription')),`Regenerating will permanently delete the current ${subject} Sheet and generate a new one. This action cannot be undone.`);
    equal(elements(content).filter(node=>node.type?.name==='Button').map(text),['Cancel','Continue']);
    find(content,node=>node.type?.name==='Button'&&text(node)==='Cancel').props.onClick();
    equal(modal(render()).props.kind,null);equal(calls.length,0);equal(JSON.stringify(initial),saved);
    button(render()).props.onClick();dialog=modal(render());
    const failed=dialog.props.onContinue();
    resolveRequest(Response.json({ok:false,code:'V3_REFERENCE_STORAGE_DELETE_FAILED'},{status:409}));await failed;
    dialog=modal(render());equal(dialog.props.kind,kind);equal(dialog.props.error.includes('replacement is held'),true);
    equal(JSON.stringify(initial),saved);dialog.props.onCancel();calls=[];
    button(render()).props.onClick();dialog=modal(render());
    const pending=dialog.props.onContinue();
    await dialog.props.onContinue(); // The same stale closure cannot race the synchronous action ref.
    equal(calls.length,1);equal(calls[0].confirmedDeletion,true);equal(calls[0].expectedId,id);equal(calls[0].expectedVersion,1);equal(calls[0].kind,kind);
    resolveRequest(Response.json({ok:true,workspace:{...initial,artifacts:[],tasks:[{kind,status:'queued',current:true,providerStarted:false}],processing:true}}));
    await pending;
    equal(modal(render()).props.kind,null);equal(text(render()).includes('version 1'),false);
    // An empty slot uses Generate directly, with no deletion confirmation.
    slots=[];calls=[];props.initial={...initial,artifacts:[]};
    const empty=render();
    find(empty,node=>node.type?.name==='Button'&&text(node)===`Generate ${subject} Sheet`).props.onClick();
    equal(calls.length,1);equal(calls[0].confirmedDeletion,undefined);equal(modal(render()).props.kind,null);
    resolveRequest(Response.json({ok:true,workspace:props.initial}));await new Promise(resolve=>setTimeout(resolve,0));
    // Dirty state blocks Continue but never prevents Cancel.
    slots=[];calls=[];props.initial=initial;props.dirty=false;
    button(render()).props.onClick();props.dirty=true;
    dialog=modal(render());const dirtyContent=dialog.type(dialog.props);
    equal(find(dirtyContent,node=>node.type?.name==='Button'&&text(node)==='Continue').props.disabled,true);
    equal(find(dirtyContent,node=>node.type?.name==='Button'&&text(node)==='Cancel').props.disabled,false);
    dialog.props.onCancel();equal(calls.length,0);
    // Missing output removes Recover, enables an explicit new request, and exposes only local sanitized details.
    slots=[];calls=[];props.dirty=false;
    const diagnostics={provider:'openai',model:'fixture-image',taskId:'failed-task',stage:'after_provider_intent',httpStatus:null,requestId:null,
      errorCode:'V3_TASK_FAILED',responseSaved:false,imageSaved:false,imageOutputAvailable:false,recoveryAvailable:false,canStartNew:true,category:'unknown'};
    const failedTask={id:'failed-task',kind,status:'reconciliation_required',providerStarted:true,current:true,canStartNew:true,recoveryAvailable:false,diagnostics};
    props.initial={...initial,artifacts:[],tasks:[failedTask],localEnabled:true};
    tree=render();
    equal(elements(tree).some(node=>node.type?.name==='Button'&&text(node)==='Recover saved response'),false);
    equal(text(tree).includes(`OpenAI ${subject} Sheet outcome unknown — no saved response`),true);
    const generate=find(tree,node=>node.type?.name==='Button'&&text(node)===`Generate ${subject} Sheet`);
    equal(generate.props.disabled,false);
    const technical=find(tree,node=>node.type?.name==='ReferenceTechnicalDetails');
    equal(text(technical.type(technical.props)).includes('Technical details'),true);
    equal(text(technical.type(technical.props)).includes('Recovery availableNo'),true);
    generate.props.onClick();equal(calls.length,1);equal(calls[0].failedTaskId,'failed-task');equal(calls[0].confirmNewRequest,true);
    resolveRequest(Response.json({ok:true,workspace:{...initial,artifacts:[],tasks:[]}}));await new Promise(resolve=>setTimeout(resolve,0));
    slots=[];props.initial={...props.initial,localEnabled:false};
    equal(elements(render()).some(node=>node.type?.name==='ReferenceTechnicalDetails'),false);
    // Valid output offers recovery on the same task and does not ask for a new provider request.
    slots=[];calls=[];
    props.initial={...initial,artifacts:[],localEnabled:true,tasks:[{...failedTask,canStartNew:false,recoveryAvailable:true,
      diagnostics:{...diagnostics,canStartNew:false,recoveryAvailable:true,responseSaved:true,imageOutputAvailable:true,category:'saved'}}]};
    tree=render();
    equal(find(tree,node=>node.type?.name==='Button'&&text(node)===`Generate ${subject} Sheet`).props.disabled,true);
    find(tree,node=>node.type?.name==='Button'&&text(node)==='Recover saved response').props.onClick();
    equal(calls.length,1);equal(calls[0].action,'recover_task');equal(calls[0].id,'failed-task');equal(calls[0].confirmNewRequest,undefined);
    resolveRequest(Response.json({ok:true,workspace:{...initial,artifacts:[],tasks:[]}}));await new Promise(resolve=>setTimeout(resolve,0));
  }
  // Package view retains asynchronous failure reasons, exposes stages/details and suppresses duplicate clicks.
  slots=[];calls=[];
  const packageId='10000000-0000-4000-8000-000000000001';
  const packageBuild={stage:'delivery',code:'V3_PACKAGE_BINDING_INVALID',httpStatus:null,packageId,segmentId:null,estimateStatus:'not_requested',recoverable:false};
  const packageTask={id:'package-task',kind:'package',status:'failed',errorCode:'V3_TASK_FAILED',packageBuild};
  const initial={projectId:'fixture-project',artifacts:[{id:'storyboard',kind:'storyboard',activeSlot:true,current:true,approved:true,rejected:false}],tasks:[packageTask],runs:[],processing:false,preflight:null,complete:false,localEnabled:true};
  const props={initial,projectId:initial.projectId,assets:[],dirty:false,revision:'saved'};
  const render=()=>{cursor=0;return V3WorkflowPreview(props);};
  find(render(),node=>node.type==='button'&&text(node)==='Package').props.onClick();
  let tree=render(),status=find(tree,node=>node.type?.name==='PackageStatus');
  equal(text(status.type(status.props)).includes('Package build failed'),true);
  equal(text(status.type(status.props)).includes('Recovery required'),false);
  equal(text(status.type(status.props)).includes('Package technical details'),true);
  const buildButton=find(tree,node=>node.type?.name==='Button'&&text(node)==='Build package and estimate');
  buildButton.props.onClick();buildButton.props.onClick();equal(calls.length,1);equal(calls[0].retryTaskId,'package-task');
  resolveRequest(Response.json({ok:true,workspace:{...initial,tasks:[{...packageTask,status:'running',packageBuild:{...packageBuild,code:null,stage:'estimate',estimateStatus:'requested'}}],processing:true}}));
  await new Promise(resolve=>setTimeout(resolve,0));
  tree=render();status=find(tree,node=>node.type?.name==='PackageStatus');equal(text(status.type(status.props)).includes('Checking generation cost'),true);
  equal(find(tree,node=>node.type?.name==='Button'&&text(node)==='Build package and estimate').props.disabled,true);
  slots=[];props.initial={...initial,localEnabled:false};
  find(render(),node=>node.type==='button'&&text(node)==='Package').props.onClick();
  status=find(render(),node=>node.type?.name==='PackageStatus');equal(text(status.type(status.props)).includes('Package technical details'),false);
  slots=[];props.initial={...initial,tasks:[{...packageTask,status:'done',packageBuild:{...packageBuild,stage:'ready',code:null,estimateStatus:'available'}}],
    preflight:{durationMs:10000,aspectRatio:'9:16',currentness:'current',estimatedCostMicrousd:1250000,authorizedMaximumMicrousd:null,packageHash:'hash',issues:[],transportEnabled:false,canSubmit:false,quoteId:'quote'}};
  find(render(),node=>node.type==='button'&&text(node)==='Package').props.onClick();
  equal(text(render()).includes('Estimated video cost: $1.2500'),true);
  status=find(render(),node=>node.type?.name==='PackageStatus');equal(text(status.type(status.props)).includes('Generation Package ready'),true);
  slots=[];props.initial={...props.initial,tasks:[{...packageTask,status:'done',packageBuild:{...packageBuild,estimateStatus:'unavailable'}}],preflight:{...props.initial.preflight,estimatedCostMicrousd:null,quoteId:null}};
  find(render(),node=>node.type==='button'&&text(node)==='Package').props.onClick();
  equal(find(render(),node=>node.type?.name==='Button'&&text(node)==='Approve Generation Package').props.disabled,true);
  console.info(`${checks} actual V3 confirmation/package-stage/double-click UI checks passed; zero network calls.`);
} finally {globalThis.fetch=originalFetch;delete globalThis.__referenceReact;}
