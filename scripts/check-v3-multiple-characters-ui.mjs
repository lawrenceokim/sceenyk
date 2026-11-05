// Actual Sources/workflow/mode-confirmation handlers with isolated React hooks.
// No browser, server, live auth, storage, provider, or media generation.
import assert from 'node:assert/strict';
import React from 'react';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const frames=new Map();let frame,cursor=0,effects=[];const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const slot=initial=>{const i=cursor++;if(!(i in frame))frame[i]=typeof initial==='function'?initial():initial;return[frame[i],v=>{frame[i]=typeof v==='function'?v(frame[i]):v;}];};
const hooks={...React,
 useState(initial){const slots=frame;const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
 useRef(initial){return slot(()=>({current:initial}))[0];},useId(){return slot(()=>`fixture-${frames.size}-${cursor}`)[0];},
 useMemo(fn,deps){const [s]=slot(()=>({deps:null,value:null}));if(!same(s.deps,deps)){s.value=fn();s.deps=deps;}return s.value;},
 useCallback(fn,deps){return this.useMemo(()=>fn,deps);},
 useEffect(fn,deps){const[s]=slot(()=>({deps:null,cleanup:null}));if(!same(s.deps,deps)){s.deps=deps;effects.push(()=>{s.cleanup?.();s.cleanup=fn();});}},
 useSyncExternalStore(_subscribe,get){return get();},useContext:context=>context._currentValue,
};
hooks.useCallback=(fn,deps)=>hooks.useMemo(()=>fn,deps);
globalThis.__castHooks=hooks;globalThis.__castMode={mode:'pro'};globalThis.__castPath='/studio';
const render=(Component,props,key=Component.name)=>{frame=frames.get(key)??[];frames.set(key,frame);cursor=0;effects=[];return Component(props);};
const flush=async()=>{for(const effect of effects)effect();effects=[];await Promise.resolve();await Promise.resolve();};
const elements=node=>node==null?[]:Array.isArray(node)?node.flatMap(elements):typeof node==='object'&&node.props?[node,...elements(node.props.children)]:[];
const text=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
const find=(tree,predicate)=>{const x=elements(tree).find(predicate);assert.ok(x);return x;};
let checks=0,networkCalls=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=v=>{assert.ok(v);checks++;};
const oldFetch=globalThis.fetch,oldLocalStorage=globalThis.localStorage;
const requests=[];let response;
globalThis.fetch=async(url,init)=>{if(String(url)!=='/api/ugc/v3'){networkCalls++;throw Error('NETWORK_FORBIDDEN');}requests.push(JSON.parse(init.body));return Response.json({ok:true,workspace:response});};
globalThis.localStorage={getItem:()=> 'pro',setItem:()=>{}};
const fixtureSources={
 react:`const r=globalThis.__castHooks;export const createContext=r.createContext,useContext=r.useContext,useState=r.useState,useRef=r.useRef,useId=r.useId,useEffect=r.useEffect,useCallback=r.useCallback,useMemo=r.useMemo,useSyncExternalStore=r.useSyncExternalStore;`,
 'next/navigation':`export const usePathname=()=>globalThis.__castPath;`,
 '@clerk/nextjs':`export const useAuth=()=>({isLoaded:true,userId:null});`,
 '@/components/auth/auth-availability':`export const useAuthAvailable=()=>false;`,
 '@/app/actions/studio-mode':`export const readStudioModeAction=async()=>{throw Error('AUTH_REQUEST_FORBIDDEN');};export const saveStudioModeAction=readStudioModeAction;`,
 '@/components/workspace/studio-mode-provider':`export const useStudioMode=()=>globalThis.__castMode;`,
 './studio-workspace-panels':`export const useStudioPanels=()=>globalThis.__castPanels;export function StudioPanelPortal(props){return props.children;}export function StudioPanelTarget(){return null;}export function StudioWorkflowMedia(){return null;}`,
 'next/image':`export default function Image(){return null;}`,
 './persistent-media-preview':`export function PersistentMediaPreview(){return null;}`,
 './local-media-preview':`export function LocalMediaThumbnail(){return null;}`,
 '@/components/account-action':`export function AccountAction(props){return props.children;}`,
 '@/components/ui/button':`export function Button(props){return props.children;}`,
 '@/components/ui/dialog':['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription','DialogFooter'].map(n=>`export function ${n}(props){return props.children;}`).join('\n'),
};
try{
 const b=await build({absWorkingDir:process.cwd(),stdin:{contents:'export {StudioReferenceSources} from "./components/creation/studio-reference-sources";export {ProjectSaveControls} from "./components/creation/project-save-controls";export {V3WorkflowPreview} from "./components/creation/v3-workflow-preview";export {StudioModeProvider} from "./components/workspace/studio-mode-provider";export {workflowProgress} from "./components/creation/v3-progress-state";',loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',tsconfig:resolve('tsconfig.json'),plugins:[{name:'cast-ui-fixtures',setup(b){
  b.onResolve({filter:/^\.\/components\//},a=>({path:resolve(a.path+(a.path.endsWith('v3-progress-state')?'.ts':'.tsx'))}));
  b.onResolve({filter:/.*/},a=>Object.hasOwn(fixtureSources,a.path)?{path:a.path,namespace:'fixture'}:undefined);
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fixtureSources[a.path]}));
 }}]});
 const m={exports:{}};new Function('require','module','exports',b.outputFiles[0].text)(require,m,m.exports);
 const{StudioReferenceSources,ProjectSaveControls,V3WorkflowPreview,StudioModeProvider,workflowProgress}=m.exports;
 let saveClicks=0;
 const saveProps={title:'Retained Pro draft',onTitleChange:()=>{},onSave:()=>saveClicks++,state:{status:'error',message:'Project saving is blocked by database permissions (42501). Check migration 096.'},dirty:true,mediaBusy:false,signedIn:true,authReady:true,hasLocalMedia:false,children:parts=>[parts.project,parts.save]};
 let saveTree=render(ProjectSaveControls,saveProps,'save-controls');
 const alert=find(saveTree,e=>e.props.role==='alert');ok(text(alert).includes('42501'));ok(!alert.props.className.includes('sr-only'));
 find(saveTree,e=>e.props['aria-label']==='Save project').props.onClick();eq(saveClicks,1);
 saveTree=render(ProjectSaveControls,{...saveProps,state:{status:'saved'},dirty:false},'save-controls');
 eq(elements(saveTree).filter(e=>e.props.role==='alert').length,0);eq(find(saveTree,e=>e.props['aria-label']==='Project saved').props.disabled,false);eq(find(saveTree,e=>e.type==='input'&&e.props.name==='title').props.value,'Retained Pro draft');
 const selected=[],named=[],removed=[];globalThis.__castPanels={selectMedia:id=>selected.push(id)};
 const assets=['Ari','Bea','Cam'].map((name,i)=>({id:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,referenceId:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,referenceName:name,studioRole:'character',filename:name+'.png',status:'uploaded',kind:'image',createdAt:'2026-11-05',projectId:'10000000-0000-4000-8000-000000000010'}));
 const added=[];
 const props={label:'Characters',addLabel:'Add Character',role:'character',references:assets.map(a=>({id:a.id,images:[{asset:a}]})),multiple:true,perCharacterSheets:true,onAdd:files=>added.push(files),onRemoveLocal:()=>{},onRemoveAsset:a=>removed.push(a.id),onUpload:()=>{},onRecover:()=>{},onNameChange:(a,v)=>named.push([a.id,v]),uploadStates:{},busy:false,signedIn:true,authReady:true};
 const sources=(props,key='sources')=>{const wrapper=StudioReferenceSources(props);return render(wrapper.type,wrapper.props,key);};
 const visible=tree=>elements(tree).filter(e=>e.props['data-character-detail']&&!e.props.hidden);
 const detail=tree=>find(tree,e=>e.props['aria-label']==='Character details');
 const choose=(tree,i)=>elements(tree).filter(e=>e.props['data-character-selector'])[i];
 let tree=sources({...props,references:[]},'zero');eq(visible(tree).length,0);ok(text(tree).includes('0 characters'));
 tree=sources({...props,references:props.references.slice(0,1)},'one');eq(visible(tree).length,1);eq(elements(tree).filter(e=>['Previous character','Next character'].includes(e.props['aria-label'])).length,0);ok(choose(tree,0).props.className.includes('aspect-square'));
 tree=sources(props);eq(visible(tree).map(e=>e.props['data-character-detail']),[assets[0].id]);
 const scrolled=[],focused=[];
 find(tree,e=>e.type==='ul').props.ref.current={clientWidth:140,scrollTo:value=>scrolled.push(value)};
 elements(tree).filter(e=>e.props['data-character-selector']).forEach((e,i)=>e.props.ref({offsetLeft:i*104,offsetWidth:96,focus:()=>focused.push(i)}));await flush();eq(scrolled.at(-1).left,0);eq(scrolled.at(-1).behavior,'smooth');
 eq(elements(tree).filter(e=>['Previous character','Next character'].includes(e.props['aria-label'])).length,0);
 ok(find(tree,e=>e.type==='ul').props.className.includes('overflow-x-auto'));ok(find(tree,e=>e.type==='ul').props.className.includes('py-2'));
 for(const card of elements(tree).filter(e=>e.props['data-character-selector']))ok(card.props.className.includes('aspect-square'));
 ok(!find(tree,e=>e.type==='span'&&text(e)==='Pro').props.className.includes('rounded-full'));
 const row=find(tree,e=>e.type==='ul'),rowElement={scrollLeft:0,dataset:{},setPointerCapture:()=>{},hasPointerCapture:()=>true,releasePointerCapture:()=>{}};
 const rowEvent=(x,type='mouse')=>({pointerType:type,isPrimary:true,button:0,pointerId:2,clientX:x,clientY:10,target:{closest:()=>null},currentTarget:rowElement,preventDefault:()=>{}});
 row.props.onPointerDown(rowEvent(150));row.props.onPointerMove(rowEvent(50));eq(rowElement.scrollLeft,100);eq(rowElement.dataset.dragging,'true');row.props.onPointerUp(rowEvent(50));eq(rowElement.dataset.dragging,undefined);
 let rowClicks=0;row.props.onClickCapture({detail:1,preventDefault:()=>rowClicks++,stopPropagation:()=>rowClicks++});eq(rowClicks,2);
 row.props.onPointerDown(rowEvent(150,'touch'));row.props.onPointerMove(rowEvent(50,'touch'));eq(rowElement.scrollLeft,100); // Touch scrolling stays browser-owned.
 row.props.onPointerDown({...rowEvent(150),target:{closest:()=>({})}});row.props.onPointerMove(rowEvent(50));eq(rowElement.scrollLeft,100); // Remove buttons do not start a drag.
 eq(elements(tree).filter(e=>e.props.panel?.startsWith('character:')).map(e=>e.props.panel),assets.map(a=>'character:'+a.id));
 const names=elements(tree).filter(e=>e.type==='input'&&e.props.name==='character-name');eq(names.map(e=>e.props.value),['Ari','Bea','Cam']);
 names[1].props.onChange({target:{value:'Beatrice'}});eq(named,[[assets[1].id,'Beatrice']]);
 choose(tree,1).props.onClick();tree=sources(props);await flush();eq(selected.at(-1),assets[1].id);eq(visible(tree)[0].props['data-character-detail'],assets[1].id);ok(text(tree).includes('Character 2 of 3'));eq(choose(tree,1).props['aria-pressed'],true);eq(scrolled.at(-1).left,82);
 const event=(x,y,target={closest:()=>null})=>({isPrimary:true,button:0,pointerId:1,clientX:x,clientY:y,target,currentTarget:{setPointerCapture:()=>{}}});
 detail(tree).props.onPointerDown(event(120,20));detail(tree).props.onPointerMove(event(20,22));detail(tree).props.onPointerUp(event(20,22));tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[2].id);ok(text(tree).includes('Character 3 of 3'));
 let suppressed=0;detail(tree).props.onClickCapture({detail:1,preventDefault:()=>suppressed++,stopPropagation:()=>suppressed++});eq(suppressed,2);
 // Vertical movement, editing and controls never navigate or prevent scrolling.
 detail(tree).props.onPointerDown(event(120,20));detail(tree).props.onPointerMove(event(110,100));detail(tree).props.onPointerUp(event(10,120));tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[2].id);
 detail(tree).props.onPointerDown(event(120,20,{closest:()=>({tagName:'INPUT'})}));detail(tree).props.onPointerUp(event(20,20));tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[2].id);
 const wheelEvent=(deltaX,deltaY,timeStamp)=>({target:{closest:()=>null},deltaX,deltaY,timeStamp});
 detail(tree).props.onWheel(wheelEvent(-80,1,1000));tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[1].id);
 detail(tree).props.onWheel(wheelEvent(-80,1,1050));tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[1].id);
 detail(tree).props.onWheel(wheelEvent(0,100,1400));tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[1].id);
 find(tree,e=>e.type==='ul').props.onKeyDown({key:'ArrowRight',target:{closest:()=>({})},preventDefault:()=>{}});tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[2].id);
 find(tree,e=>e.type==='ul').props.onKeyDown({key:'ArrowLeft',target:{closest:()=>({})},preventDefault:()=>{}});tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[1].id);
 find(tree,e=>e.props['aria-label']==='Go to character 1: Ari').props.onClick();tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[0].id);
 find(tree,e=>e.type==='ul').props.onKeyDown({key:'End',target:{closest:()=>({})},preventDefault:()=>{}});tree=sources(props);eq(visible(tree)[0].props['data-character-detail'],assets[2].id);eq(focused.at(-1),2);
 find(tree,e=>e.props['aria-label']==='Remove Bea.png').props.onClick();eq(removed,[assets[1].id]);
 tree=sources({...props,references:[props.references[0],props.references[2]]});await flush();eq(visible(tree)[0].props['data-character-detail'],assets[2].id);ok(text(tree).includes('Character 2 of 2'));eq(focused.at(-1),2);
 tree=sources({...props,references:props.references.slice(0,1)});eq(visible(tree)[0].props['data-character-detail'],assets[0].id);
 tree=sources({...props,references:[]});eq(visible(tree).length,0);
 const extra=Array.from({length:3},(_,i)=>({...assets[0],id:'extra-'+i,referenceId:'extra-'+i,referenceName:'Extra '+i}));
 const many={...props,references:[...assets,...extra].map(a=>({id:a.referenceId,images:[{asset:a}]}))};tree=sources(many,'many');eq(elements(tree).filter(e=>e.props['data-character-selector']).length,6);eq(visible(tree).length,1);choose(tree,5).props.onClick();tree=sources(many,'many');ok(text(tree).includes('Character 6 of 6'));
 for(const count of [1,3,6]){
  const sample=sources({...many,references:many.references.slice(0,count)},'scroll-'+count),scrollRow=find(sample,e=>e.type==='ul');
  let left=0,prevented=0;const max=Math.max(0,count*104-8-200);
  const viewport={dataset:{},get scrollLeft(){return left;},set scrollLeft(v){left=Math.max(0,Math.min(max,v));},setPointerCapture:()=>{},hasPointerCapture:()=>false};
  const drag={...rowEvent(150),currentTarget:viewport,preventDefault:()=>prevented++};
  scrollRow.props.onPointerDown(drag);scrollRow.props.onPointerMove({...drag,clientX:-1000});scrollRow.props.onPointerUp({...drag,clientX:-1000});eq(left,max);
  const prior=left;scrollRow.props.onPointerDown({...drag,pointerType:'touch'});scrollRow.props.onPointerMove({...drag,pointerType:'touch',clientX:50});eq(left,prior);eq(prevented,1);
  eq(elements(sample).filter(e=>e.props['data-character-selector']).length,count);eq(elements(sample).filter(e=>Object.hasOwn(e.props,'data-character-remove')).length,count);
 }
 const files=[new File(['a'],'one.png',{type:'image/png'}),new File(['b'],'two.png',{type:'image/png'}),new File(['c'],'three.png',{type:'image/png'})];
 find(tree,e=>e.type==='input'&&e.props.multiple).props.onChange({currentTarget:{files,value:'selection'}});eq(added.at(-1),files);
 find(tree,e=>e.type==='input'&&e.props['aria-label']==='Add Character').props.onChange({currentTarget:{files,value:'selection'}});eq(added.at(-1),files.slice(0,1));
 const addCount=added.length;find(tree,e=>e.type==='input'&&e.props.multiple).props.onChange({currentTarget:{files:[],value:''}});eq(added.length,addCount);
 const edited={...props,references:[props.references[0],{id:assets[1].id,images:[{asset:{...assets[1],referenceName:'Beatrice'}}]},props.references[2]]};tree=sources(edited,'reopened');eq(elements(tree).filter(e=>e.type==='input'&&e.props.name==='character-name').map(e=>e.props.value),['Ari','Beatrice','Cam']);
 const local={id:'local-before-upload',file:files[0],kind:'image',studioRole:'character',referenceId:'stable-reference'};
 tree=sources({...props,references:[props.references[0],{id:'stable-reference',images:[{local}]}]},'uploading');choose(tree,1).props.onClick();tree=sources({...props,references:[props.references[0],{id:'stable-reference',images:[{asset:{...assets[1],referenceId:'stable-reference'}}]}]},'uploading');eq(visible(tree)[0].props['data-character-detail'],'stable-reference');eq(find(visible(tree)[0],e=>e.props.panel).props.panel,'character:'+assets[1].id);
 tree=sources({...props,multiple:false},'basic');eq(find(tree,e=>e.type==='input'&&e.props.type==='file').props.disabled,true);ok(text(tree).includes('Your Pro characters and sheets are saved'));eq(elements(tree).filter(e=>e.type==='input'&&e.props.multiple).length,0);eq(visible(tree).length,0);
 const workspace={projectId:assets[0].projectId,artifacts:[],tasks:[],runs:[],processing:false,localEnabled:true,complete:false,preflight:null};
 const viewProps={projectId:workspace.projectId,initial:workspace,assets:assets.slice(0,2),dirty:false,revision:'fixture'};
 response=workspace;tree=render(V3WorkflowPreview,viewProps,'empty-cast');
 const panel=(tree,id)=>find(tree,e=>e.props.panel==='character:'+id);
 for(const asset of assets.slice(0,2)){
  ok(text(panel(tree,asset.id)).includes('No sheet generated yet'));ok(find(panel(tree,asset.id),e=>e.type==='div'&&text(e)==='No sheet generated yet').props.className.includes('aspect-square'));
  eq(elements(panel(tree,asset.id)).filter(e=>e.type?.name==='Button'&&['Approve','Reject'].includes(text(e))).length,0);
 }
 const generate=(tree,id)=>find(panel(tree,id),e=>e.type?.name==='Button'&&text(e)==='Generate Character Sheet');
 let gated=render(V3WorkflowPreview,{...viewProps,dirty:true},'save-gate');
 for(const asset of assets.slice(0,2))eq(generate(gated,asset.id).props.disabled,true);
 gated=render(V3WorkflowPreview,{...viewProps,dirty:false},'save-gate');
 for(const asset of assets.slice(0,2))eq(generate(gated,asset.id).props.disabled,false);
 for(const asset of assets.slice(0,2)){
  find(panel(tree,asset.id),e=>e.type?.name==='Button'&&text(e)==='Generate Character Sheet').props.onClick();await new Promise(r=>setTimeout(r,0));
  eq(requests.at(-1).assetId,asset.id);
  tree=render(V3WorkflowPreview,viewProps,'empty-cast');
 }
 const sheets=assets.slice(0,2).map((a,i)=>({id:'sheet-'+i,characterId:a.id,kind:'character',version:i+1,activeSlot:true,current:true,approved:false,rejected:false,preview:'https://fixture.invalid/'+i,storyboard:null}));
 const review={...workspace,artifacts:sheets};response=review;
 const reviewProps={...viewProps,initial:review};tree=render(V3WorkflowPreview,reviewProps,'review-cast');
 eq(elements(panel(tree,assets[0].id)).filter(e=>e.type==='div'&&text(e)==='No sheet generated yet').length,0);ok(find(panel(tree,assets[0].id),e=>e.type?.name==='Image').props.className.includes('aspect-square'));
 find(panel(tree,assets[1].id),e=>e.type?.name==='Button'&&text(e)==='Approve').props.onClick();await new Promise(r=>setTimeout(r,0));eq(requests.at(-1).id,sheets[1].id);
 tree=render(V3WorkflowPreview,reviewProps,'review-cast');
 find(panel(tree,assets[0].id),e=>e.type==='button'&&e.props['aria-label']?.startsWith('Preview Character')).props.onClick();eq(selected.at(-1),'v3-reference:'+sheets[0].id);
 find(panel(tree,assets[1].id),e=>e.type?.name==='Button'&&text(e)==='Regenerate').props.onClick();tree=render(V3WorkflowPreview,reviewProps,'review-cast');
 const dialog=find(tree,e=>e.type?.name==='ReferenceRegenerationDialog');eq(dialog.props.kind,'character');await dialog.props.onContinue();eq(requests.at(-1).assetId,assets[1].id);eq(requests.at(-1).expectedId,sheets[1].id);eq(requests.at(-1).confirmedDeletion,true);
 globalThis.__castMode={mode:'basic'};const basicReview=render(V3WorkflowPreview,reviewProps,'basic-sheet-label');ok(text(panel(basicReview,assets[1].id)).includes('Regenerate Character Sheet'));globalThis.__castMode={mode:'pro'};
 // Independent work: a queued task for Bea cannot disable Ari's approval.
 const partial={...review,processing:true,tasks:[{id:'beas-task',kind:'character',characterId:assets[1].id,status:'queued',current:true,providerStarted:false}]};
 tree=render(V3WorkflowPreview,{...reviewProps,initial:partial},'independent');eq(find(panel(tree,assets[0].id),e=>e.type?.name==='Button'&&text(e)==='Approve').props.disabled,false);
 const persistedReview={...review,artifacts:[{...sheets[0],approved:true},sheets[1]]};
 tree=render(V3WorkflowPreview,{...reviewProps,initial:persistedReview},'restored-review');ok(text(panel(tree,assets[0].id)).includes('Approved'));ok(text(panel(tree,assets[1].id)).includes('Ready for review'));eq(elements(panel(tree,assets[0].id)).filter(e=>e.type?.name==='Button'&&text(e)==='Approve').length,0);
 const progressFixture={...review,characterIds:assets.slice(0,2).map(a=>a.id),artifacts:[{...sheets[0],approved:true},{id:'location',kind:'location',activeSlot:true,current:true,approved:true}],tasks:[]};
 eq(workflowProgress(progressFixture,false).stages[0].status,'in_progress');
 progressFixture.tasks=[{kind:'character',characterId:assets[0].id,status:'queued',current:true},{kind:'character',characterId:assets[1].id,status:'done',current:true}];
 eq(workflowProgress(progressFixture,false).stages[0].status,'in_progress');
 progressFixture.tasks[0].status='failed';eq(workflowProgress(progressFixture,false).stages[0].status,'failed');
 progressFixture.tasks=[];progressFixture.artifacts.push({...sheets[1],approved:true});eq(workflowProgress(progressFixture,false).stages[0].status,'completed');
 // Real mode provider: report actual incompatible features; Cancel does not save,
 // confirmation changes metadata only, with the same mounted children/data.
 const child=React.createElement('div',{'data-retained':'characters-and-sheets'});
 const wrapper=render(StudioModeProvider,{children:child},'mode-outer');const Session=wrapper.type;
 let session=render(Session,wrapper.props,'mode-session');await flush();session=render(Session,wrapper.props,'mode-session');
 eq(session.props.value.mode,'pro');session.props.value.reportFeatures('cast',null,['Multiple characters']);session=render(Session,wrapper.props,'mode-session');
 session.props.value.select('basic');session=render(Session,wrapper.props,'mode-session');
 eq(find(session,e=>e.type?.name==='Dialog').props.open,true);eq(session.props.value.mode,'pro');
 find(session,e=>e.type?.name==='Button'&&text(e)==='Cancel').props.onClick();session=render(Session,wrapper.props,'mode-session');eq(session.props.value.mode,'pro');eq(find(session,e=>e.type?.name==='Dialog').props.open,false);
 session.props.value.select('basic');session=render(Session,wrapper.props,'mode-session');find(session,e=>e.type?.name==='Button'&&text(e)==='Switch to Basic').props.onClick();session=render(Session,wrapper.props,'mode-session');eq(session.props.value.mode,'basic');eq(session.props.children[0],child);
 eq(networkCalls,0);console.log(JSON.stringify({passed:checks,providerRequests:0,networkCalls,scope:'Pro selector, swipe/keyboard/trackpad navigation, upload/deletion IDs, square sheets, independent review, Save controls and mode confirmation; isolated hooks only.'}));
}finally{globalThis.fetch=oldFetch;if(oldLocalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldLocalStorage;for(const k of ['__castHooks','__castMode','__castPath','__castPanels'])delete globalThis[k];}
