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
  tree=render();status=find(tree,node=>node.type?.name==='PackageStatus');equal(text(status.type(status.props)).includes('Calculating approximate cost'),true);
  equal(find(tree,node=>node.type?.name==='Button'&&text(node)==='Build package and estimate').props.disabled,true);
  slots=[];props.initial={...initial,localEnabled:false};
  find(render(),node=>node.type==='button'&&text(node)==='Package').props.onClick();
  status=find(render(),node=>node.type?.name==='PackageStatus');equal(text(status.type(status.props)).includes('Package technical details'),false);
  slots=[];props.initial={...initial,tasks:[{...packageTask,status:'done',packageBuild:{...packageBuild,stage:'ready',code:null,estimateStatus:'available'}}],
    preflight:{durationMs:30000,aspectRatio:'9:16',currentness:'current',estimatedCostMicrousd:16923000,authorizedMaximumMicrousd:null,packageHash:'hash',issues:[],transportEnabled:false,canSubmit:false,quoteId:'quote',suggestedMaximumMicrousd:20310000,suggestedAuthorizationBufferPercent:20}};
  find(render(),node=>node.type==='button'&&text(node)==='Package').props.onClick();
  equal(text(render()).includes('Estimated video cost: ~$16.92'),true);
  equal(text(render()).includes('real provider charge may differ'),true);
  let ceiling=find(render(),node=>node.type==='input'&&node.props.type==='number');equal(ceiling.props.value,'20.31');
  ceiling.props.onChange({target:{value:'25.00'}});ceiling=find(render(),node=>node.type==='input'&&node.props.type==='number');equal(ceiling.props.value,'25.00');
  calls=[];equal(calls.length,0);
  find(render(),node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({target:{checked:true}});
  const approvePackage=find(render(),node=>node.type?.name==='Button'&&text(node)==='Approve Generation Package');equal(approvePackage.props.disabled,false);
  approvePackage.props.onClick();equal(calls.length,1);equal(calls[0].action,'authorize');equal(calls[0].maximumMicrousd,25000000);equal(calls[0].operatorApproved,true);
  resolveRequest(Response.json({ok:true,workspace:props.initial}));await new Promise(resolve=>setTimeout(resolve,0));
  status=find(render(),node=>node.type?.name==='PackageStatus');equal(text(status.type(status.props)).includes('Generation Package ready'),true);
  slots=[];props.initial={...props.initial,tasks:[{...packageTask,status:'done',packageBuild:{...packageBuild,estimateStatus:'unavailable'}}],preflight:{...props.initial.preflight,estimatedCostMicrousd:null,quoteId:null}};
  find(render(),node=>node.type==='button'&&text(node)==='Package').props.onClick();
  equal(find(render(),node=>node.type?.name==='Button'&&text(node)==='Approve Generation Package').props.disabled,true);
  slots=[];props.initial={...props.initial,preflight:{...props.initial.preflight,estimatedCostMicrousd:28205000}};
  find(render(),node=>node.type==='button'&&text(node)==='Package').props.onClick();equal(text(render()).includes('Estimated video cost: ~$28.21'),true);
  // Actual Final Video handlers: confirmation cannot spend, rejection is explicit, and host recovery reveals no URL.
  slots=[];
  const video={id:'saved-video',packageId:'saved-package',segmentId:'segment-1',state:'awaiting_review',current:true,completedAt:null,errorCode:null,quality:null,
    actualDurationMs:30000,hasAudio:true,preview:'https://private.example.test/preview',expectedDialogue:[],shotTimings:[],provider:'higgsfield',model:'bytedance/seedance-2.5/reference-to-video',
    aspectRatio:'9:16',resolution:'480p',estimatedCostMicrousd:16923000,actualCostMicrousd:null,stage:{stage:'V3_FINAL_VIDEO_READY_FOR_REVIEW'},outputHostname:null};
  const videoProps={initial:{projectId:'fixture-project',artifacts:[],tasks:[],runs:[video],preflight:null,processing:false,complete:false},projectId:'fixture-project',assets:[],dirty:false,revision:'saved'};
  cursor=0;let outer=V3WorkflowPreview(videoProps);
  find(outer,node=>node.type==='button'&&text(node)==='Final Video').props.onClick();cursor=0;outer=V3WorkflowPreview(videoProps);
  const review=find(outer,node=>node.type?.name==='VideoReview'),reviewCalls=[];
  slots=[];const reviewProps={...review.props,act:async(action,payload)=>{reviewCalls.push({action,...payload});return true;}};
  const renderReview=()=>{cursor=0;return review.type(reviewProps);};
  let reviewTree=renderReview();equal(text(reviewTree).includes('Actual provider cost: Unknown'),true);equal(text(reviewTree).includes('9:16'),true);equal(text(reviewTree).includes('480p'),true);
  equal(find(reviewTree,node=>node.type?.name==='Dialog').props.open,false);
  find(reviewTree,node=>node.type?.name==='Button'&&text(node)==='Reject and Delete').props.onClick();
  equal(reviewCalls.length,0);reviewTree=renderReview();let videoDialog=find(reviewTree,node=>node.type?.name==='Dialog');equal(videoDialog.props.open,true);
  find(videoDialog,node=>node.type?.name==='Button'&&text(node)==='Cancel').props.onClick();equal(find(renderReview(),node=>node.type?.name==='Dialog').props.open,false);equal(reviewCalls.length,0);
  find(renderReview(),node=>node.type?.name==='Button'&&text(node)==='Reject and Delete').props.onClick();videoDialog=find(renderReview(),node=>node.type?.name==='Dialog');
  find(videoDialog,node=>node.type?.name==='Button'&&text(node)==='Reject and Delete').props.onClick();await new Promise(resolve=>setTimeout(resolve,0));
  equal(reviewCalls.length,1);equal(reviewCalls[0].action,'reject_delete');equal(reviewCalls[0].confirmedDeletion,true);equal(reviewCalls[0].id,video.id);
  reviewProps.run={...video,state:'reconciliation_required',preview:null,errorCode:'OUTPUT_HOST_APPROVAL_REQUIRED',outputHostname:'cdn.example.test'};
  reviewTree=renderReview();equal(text(reviewTree).includes('cdn.example.test'),true);equal(text(reviewTree).includes('Recovery will not submit another generation request'),true);
  equal(text(reviewTree).includes('https://'),false);find(reviewTree,node=>node.type?.name==='Button'&&text(node)==='Recover saved work').props.onClick();
  equal(reviewCalls.at(-1).action,'recover');equal(reviewCalls.at(-1).id,video.id);equal(reviewCalls.some(c=>c.action==='generate'),false);
  reviewProps.run={...video,state:'deleted',preview:null};equal(text(renderReview()).includes('Review and approve the Generation Package again'),true);
  console.info(`${checks} actual V3 reference/package/video confirmation, host-approval and double-click UI checks passed; zero network calls.`);
} finally {globalThis.fetch=originalFetch;delete globalThis.__referenceReact;}
