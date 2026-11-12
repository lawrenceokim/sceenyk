// Actual component handlers/dialog with isolated React hook state; no browser/provider/network.
import assert from 'node:assert/strict';
import React from 'react';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { compile } from 'tailwindcss';
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
      const names=args.path.endsWith('/button')?['Button']:['Dialog','DialogClose','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle','DialogTrigger'];
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
 if(process.argv.includes('--details-only')) {
  const calls=[];
  const workspace={projectId:'project',runs:[],proDurationRetained:false,preflight:{packageId:'package'},multiClip:{packageId:'package',clips:[],committedMicrousd:0,reservedMicrousd:0}};
  const props={workspace,studioMode:'pro',disabled:false,act:async(...args)=>{calls.push(args);return true;}};
  const render=()=>{cursor=0;return V3ClipManager(props);};
  const cards=tree=>elements(tree).find(n=>n.type==='ol').props.children;
  const details=card=>elements(card).find(n=>n.type?.name==='Dialog');
  // Portal contents never contribute to the underlying card's layout.
  const layout=n=>n==null||typeof n!=='object'?n:Array.isArray(n)?n.map(layout):n.type?.name==='DialogContent'?null:
   {type:typeof n.type==='string'?n.type:n.type?.name,className:n.props.className,children:layout(n.props.children)};
  for(const count of [1,2,7,9]) {
   slots=[];workspace.runs=[];
   workspace.multiClip.clips=Array.from({length:count},(_,i)=>({id:`clip-${i+1}`,number:i+1,runId:null,durationMs:10000,startMs:i*10000,endMs:(i+1)*10000,
    purpose:`Description for clip ${i+1}: ${'long content '.repeat(100)}`,attempts:0,canGenerate:false,canRegenerate:false,authorized:false,
    estimatedCostMicrousd:2000000,blockers:['HIGGSFIELD_CREDENTIALS_REQUIRED']}));
   let tree=render();equal(cards(tree).length,count);
   for(let i=0;i<count;i++) {
    const before=layout(cards(tree));const dialog=details(cards(tree)[i]);equal(dialog.props.open,false);
    const trigger=elements(dialog).find(n=>n.type?.name==='DialogTrigger');equal(trigger.props['aria-label'],`Clip ${i+1} details`);
    equal(trigger.props.render.props.variant,'ghost');equal(text(trigger),'Details');
    dialog.props.onOpenChange(true);tree=render();
    equal(cards(tree).filter(card=>details(card).props.open).length,1);const open=details(cards(tree)[i]);equal(open.props.open,true);
    const content=elements(open).find(n=>n.type?.name==='DialogContent');
    equal(text(elements(content).find(n=>n.type?.name==='DialogTitle')),`Clip ${i+1} details`);
    ok(text(content).includes(workspace.multiClip.clips[i].purpose));ok(text(content).includes('Setup required'));ok(text(content).includes('provider account is not configured'));
    ok(!elements(cards(tree)[i]).some(n=>n.type==='details'||n.type==='summary'));
    equal(layout(cards(tree)),before);
    const close=elements(content).find(n=>n.type?.name==='DialogClose');equal(text(close),'OK');equal(close.props.onClick,undefined);equal(close.props.render.props.onClick,undefined);
    // Base UI DialogClose dispatches this root callback and restores its paired trigger focus.
    open.props.onOpenChange(false);tree=render();equal(details(cards(tree)[i]).props.open,false);equal(layout(cards(tree)),before);equal(calls,[]);
   }
   // Dismissal through Escape/backdrop shares the same controlled close callback.
   details(cards(tree)[0]).props.onOpenChange(true);tree=render();details(cards(tree)[0]).props.onOpenChange(false);tree=render();
   equal(cards(tree).filter(card=>details(card).props.open).length,0);
  }
  const clip=workspace.multiClip.clips[6];clip.runId='failed';clip.attempts=2;
  workspace.runs=[{id:'failed',current:true,state:'reconciliation_required',hasKnownRequest:true,errorCode:'OUTPUT_HOST_APPROVAL_REQUIRED'}];
  let tree=render();details(cards(tree)[6]).props.onOpenChange(true);tree=render();
  let modal=details(cards(tree)[6]);ok(text(modal).includes('Recovery needed'));ok(text(modal).includes('administrator download-host approval'));ok(text(modal).includes('2 saved attempts.'));
  // Status refreshes preserve the selected clip and present current saved evidence.
  workspace.runs[0]={id:'failed',current:true,state:'failed',errorCode:'V3_PROVIDER_REJECTED_REVIEW_RETRY'};tree=render();modal=details(cards(tree)[6]);
  equal(modal.props.open,true);ok(text(modal).includes('Failed'));ok(text(modal).includes('provider rejected this attempt'));
  modal.props.onOpenChange(false);tree=render();equal(details(cards(tree)[6]).props.open,false);equal(calls,[]);
  // Verify the reused primitive's desktop/mobile containment, theme and focus/portal ownership.
  const primitive=await readFile(resolve('components/ui/dialog.tsx'),'utf8');
  for(const value of ['DialogPrimitive.Root','DialogPrimitive.Trigger','DialogPrimitive.Close','<DialogPortal>','<DialogOverlay />','fixed top-1/2 left-1/2','-translate-x-1/2 -translate-y-1/2','max-h-[calc(100dvh-2rem)]','max-w-[calc(100%-2rem)]','overflow-y-auto','sm:max-w-md','bg-popover','text-popover-foreground','bg-overlay'])ok(primitive.includes(value));
  const source=await readFile(resolve('components/creation/v3-clip-manager.tsx'),'utf8');ok(!source.includes('scrollIntoView'));ok(!source.includes('<details'));
  equal(networkCalls,0);console.info(JSON.stringify({clipDetailsUiChecks:checks,realNetworkCalls:networkCalls,workflowActions:calls.length}));
 } else {
 const calls=[],selected=[];
 globalThis.__studioPanels={selectMedia:id=>selected.push(id)};
 const clip={id:'clip-1',number:1,startMs:0,endMs:30000,durationMs:30000,purpose:'The first demonstration.',segmentId:'segment-1',
  runId:null,attempts:0,needsContinuityReview:false,estimatedCostMicrousd:6170010,suggestedMaximumMicrousd:7410000,authorized:true,canGenerate:true,canRegenerate:false,blockers:[]};
 const group={packageId:'package',packageHash:'hash',committedMicrousd:0,reservedMicrousd:9000000,clips:[clip],readyForMerging:false};
 const workspace={projectId:'project',multiClip:group,runs:[],preflight:{packageId:'package',quoteId:'quote'},proDurationRetained:false,processing:false};
 const props={workspace,act:async(action,payload)=>{calls.push({action,payload});return true;},disabled:false,studioMode:'pro'};
 const render=()=>{cursor=0;return V3ClipManager(props);};
 let tree=render();ok(text(tree).includes('Clip 1'));ok(text(tree).includes('30s'));ok(text(tree).includes('Waiting'));
 ok(elements(tree).some(n=>n.type==='ol'&&n.props['aria-label']==='Planned video clips'&&n.props.className.includes('@min-[32rem]/final-video:grid-cols-2')));
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
 ok(elements(tree).some(n=>n.type?.name==='V3MergeReview'));ok(elements(tree).some(n=>n.type?.name==='V3MergeReview'&&n.props.workspace===workspace));ok(text(tree).includes('approval are preserved'));
 ok(!elements(tree).some(n=>n.type?.name==='Button'&&text(n)==='Merge Videos'));
 // Busy independent workers do not disable a different waiting clip.
 workspace.processing=true;workspace.runs=[];group.clips=[clip];tree=render();equal(find(tree,'Generate Clip').props.disabled,false);
 props.disabled=true;tree=render();equal(find(tree,'Generate Clip').props.disabled,true);
 props.disabled=false;workspace.proDurationRetained=true;tree=render();equal(find(tree,'Generate Clip').props.disabled,true);
 // Arbitrary saved plan lengths, actual per-card data, drawer-width layout and semantic theme tokens.
 workspace.proDurationRetained=false;workspace.processing=false;group.readyForMerging=false;workspace.runs=[];
 for(const count of [1,2,4,7,9]) {
  slots=[];group.clips=Array.from({length:count},(_,i)=>({...clip,id:`clip-${i+1}`,number:i+1,startMs:i*10000,endMs:(i+1)*10000,durationMs:10000,purpose:`Saved purpose ${i+1}`,estimatedCostMicrousd:(i+1)*1000000}));
  tree=render();const list=elements(tree).find(n=>n.type==='ol'&&n.props['aria-label']==='Planned video clips');
  const cards=list.props.children;equal(cards.length,count);ok(text(tree).includes(`${count} planned ${count===1?'clip':'clips'}`));
  equal(elements(tree).filter(n=>n.type?.name==='Button'&&text(n)==='Generate Clip').length,count);
  ok(list.props.className.includes('grid-cols-1'));ok(!list.props.className.includes('sm:grid-cols'));
  ok(tree.props.className.includes('@container/final-video'));ok(text(tree).includes('Pro'));
  cards.forEach((card,i)=>{
   ok(text(card).includes(`Saved purpose ${i+1}`));ok(text(card).includes(`${i*10}–${(i+1)*10}s`));ok(text(card).includes(`~$${i+1}.00`));
   ok(card.props.className.includes('min-w-0'));ok(card.props.className.includes('bg-card'));ok(card.props.className.includes('text-card-foreground'));
   equal(elements(card).find(n=>n.type?.name==='Dialog').props.open,false);
  });
 }
 group.clips=[clip];group.committedMicrousd=1234567;group.reservedMicrousd=9876543;slots=[];tree=render();
 const summary=elements(tree).find(n=>n.type==='dl');ok(text(summary).includes('$1.23'));ok(text(summary).includes('$9.88'));
 equal(find(tree,'How it works').props['aria-expanded'],false);ok(!elements(tree).some(n=>n.props.id==='v3-clip-instructions-project'));
 find(tree,'How it works').props.onClick();tree=render();equal(find(tree,'How it works').props['aria-expanded'],true);
 ok(text(elements(tree).find(n=>n.props.id==='v3-clip-instructions-project')).includes('1 saved clip · 0 approved'));
 find(tree,'How it works').props.onClick();tree=render();equal(find(tree,'How it works').props['aria-expanded'],false);
 // Actual saved setup/error codes are disclosed without opening eligibility gates.
 for(const blocker of ['HIGGSFIELD_CREDENTIALS_REQUIRED','V3_SEGMENT_AUTHORIZATION_REQUIRED','V3_CUSTOM_SAVED_CHECK']) {
  group.clips=[{...clip,authorized:false,canGenerate:false,blockers:[blocker]}];tree=render();
  ok(text(tree).includes('Setup required'));ok(text(tree).includes('Details'));equal(find(tree,'Generate Clip').props.disabled,true);
  const details=elements(tree).find(n=>n.type?.name==='Dialog');equal(details.props.open,false);
  ok(text(details).includes(blocker==='HIGGSFIELD_CREDENTIALS_REQUIRED'?'provider account':blocker==='V3_SEGMENT_AUTHORIZATION_REQUIRED'?'unused spending approval':'custom saved check'));
  ok(!elements(tree).some(n=>n.type?.name==='Button'&&['Approve Clip','Regenerate','Recover saved work'].includes(text(n))));
 }
 group.clips=[{...clip,runId:'run-1',canGenerate:false,blockers:[]}];workspace.runs=[{...base,state:'provider_processing',errorCode:'OUTPUT_HOST_APPROVAL_REQUIRED',preview:null}];tree=render();
 ok(text(tree).includes('administrator download-host approval'));find(tree,'Recover saved work');
 equal(elements(tree).filter(n=>n.props['aria-label']==='Generating clip 1').length,0);
 workspace.runs=[{...base,state:'queued',submissionBlocker:'V3_REFERENCE_DELIVERY_EXPIRED',preview:null}];tree=render();
 await find(tree,'Refresh saved request links').props.onClick();equal(calls.at(-1),{action:'refresh_video_delivery',payload:{id:'run-1'}});
 workspace.runs=[{...base,state:'awaiting_review',preview:null}];tree=render();ok(text(tree).includes('Preview unavailable'));
 ok(!elements(tree).some(n=>n.type?.name==='Button'&&['Approve Clip','View in Preview'].includes(text(n))));
 // One approved neighbor stays unchanged while another clip requests safe replacement authorization.
 slots=[];group.clips=[{...clip,runId:'approved-1',canGenerate:false},{...clip,id:'clip-2',number:2,segmentId:'segment-2',runId:'deleted-2',authorized:false,canGenerate:false,canRegenerate:true}];
 workspace.runs=[{...base,id:'approved-1',state:'approved'},{...base,id:'deleted-2',state:'deleted',preview:null}];tree=render();
 ok(text(tree).includes('Rejected'));const approvedCard=elements(tree).find(n=>n.type==='ol').props.children[0];
 equal(elements(approvedCard).filter(n=>n.type?.name==='Button').map(text),['View in Preview']);
 find(tree,'Regenerate').props.onClick();tree=render();elements(tree).find(n=>n.type==='input').props.onChange({target:{checked:true}});tree=render();
 await find(tree,'Approve regeneration cost').props.onClick();equal(calls.at(-1).payload.previousRunId,'deleted-2');equal(calls.at(-1).payload.segmentId,'segment-2');
 equal(workspace.runs[0].state,'approved');equal(group.clips[0].runId,'approved-1');
 // The existing 40-second plan keeps exact 30s/10s boundaries and server estimates.
 slots=[];workspace.runs=[];group.clips=[clip,{...clip,id:'clip-2',number:2,startMs:30000,endMs:40000,durationMs:10000,purpose:'Saved story resolution.',estimatedCostMicrousd:2056670}];
 tree=render();const fortyCards=elements(tree).find(n=>n.type==='ol').props.children;
 ok(text(fortyCards[0]).includes('0–30s'));ok(text(fortyCards[0]).includes('~$6.17'));
 ok(text(fortyCards[1]).includes('30–40s'));ok(text(fortyCards[1]).includes('10s'));ok(text(fortyCards[1]).includes('~$2.06'));
 group.clips=[{...clip,runId:'run-1',canGenerate:false,authorized:false,canRegenerate:true}];workspace.runs=[{...base,state:'failed',preview:null,errorCode:'V3_PROVIDER_REJECTED_REVIEW_RETRY'}];tree=render();
 ok(text(tree).includes('Failed'));ok(text(tree).includes('provider rejected'));find(tree,'Regenerate');
 ok(!elements(tree).some(n=>n.type?.name==='Button'&&text(n)==='Recover saved work'));
 group.clips=[{...clip,canGenerate:false,authorized:false,canRenewAuthorization:true,blockers:['V3_AUTHORIZATION_EXPIRED']}];workspace.runs=[];tree=render();
 find(tree,'Approve Clip Cost');equal(find(tree,'Generate Clip').props.disabled,true);
 const css=(await compile('@tailwind utilities;')).build(['@container/final-video','@min-[32rem]/final-video:grid-cols-2']);
 ok(css.includes('container-name: final-video'));ok(css.includes('@container final-video (width >= 32rem)'));
 // Empty/loading preflight preserves navigation guidance without inventing clips or paid actions.
 slots=[];workspace.multiClip=null;tree=render();ok(text(tree).includes('Final Video'));ok(!elements(tree).some(n=>n.type==='ol'));
 ok(!elements(tree).some(n=>n.type?.name==='Button'&&text(n)==='Generate Clip'));
 equal(networkCalls,0);console.info(JSON.stringify({individualClipUiChecks:checks,realNetworkCalls:networkCalls}));
 }
} finally {globalThis.fetch=originalFetch;delete globalThis.__referenceReact;delete globalThis.__studioPanels;}
