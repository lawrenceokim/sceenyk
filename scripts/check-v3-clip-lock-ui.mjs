// Actual input components in an offline render. No browser/provider/database I/O.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const bundle=await build({absWorkingDir:process.cwd(),stdin:{contents:`
 export {PromptComposer} from './components/creation/prompt-composer';
 export {ProjectSaveControls} from './components/creation/project-save-controls';
 export {StudioGenerationProperties} from './components/creation/studio-generation-properties';
 export {StudioReferenceSources} from './components/creation/studio-reference-sources';
 export {StudioAspectControl} from './components/creation/studio-aspect-control';`,resolveDir:process.cwd(),loader:'tsx'},
 tsconfig:resolve('tsconfig.json'),bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'offline-display',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'react',external:true}));
  b.onResolve({filter:/^(@\/components\/(account-action|ui\/button)|\.\/(local-media-preview|persistent-media-preview|studio-workspace-panels|duration-gallery|generation-settings|property-image-gallery|studio-inspector-section|visual-style-gallery)|@base-ui\/react\/popover)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>{
   if(a.path==='@base-ui/react/popover')return{contents:'import React from "react";const pass=p=>p.children;export const Popover={Root:pass,Title:pass,Close:pass,Trigger:p=>React.createElement("button",{disabled:p.disabled},p.children),Portal:pass,Positioner:pass,Popup:pass};'};
   if(a.path==='./studio-workspace-panels')return{contents:'export const useStudioPanels=()=>null;export const StudioPanelTarget=p=>p.children;'};
   const name={'@/components/account-action':'AccountAction','@/components/ui/button':'Button','./local-media-preview':'LocalMediaThumbnail','./persistent-media-preview':'PersistentMediaPreview','./studio-inspector-section':'StudioInspectorSection','./duration-gallery':'DurationGallery','./generation-settings':'GenerationSettings','./property-image-gallery':'PropertyImageGallery','./visual-style-gallery':'VisualStyleGallery'}[a.path];
   return{contents:`import React from 'react';export function ${name}(p){return ${name==='Button'?'React.createElement("button",{disabled:p.disabled},p.children)':name==='StudioInspectorSection'?'React.createElement("details",null,React.createElement("summary",null,p.title),p.children)':name==='AccountAction'?'p.children':name.endsWith('Preview')||name.endsWith('Thumbnail')?'React.createElement("span",null,"View saved image")':'React.createElement("button",null,"Saved property")'};}`};
  });
 }}]});
const m={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,m,m.exports);
let checks=0,networkCalls=0;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
const ok=v=>{assert.ok(v);checks++;},render=(name,props)=>{try{return renderToStaticMarkup(React.createElement(m.exports[name],props));}catch(e){e.message=`${name}: ${e.message}`;throw e;}};
try {
 for(const readOnly of [false,true]) {
  const prompt=render('PromptComposer',{prompt:'Approved creative direction',category:{id:'ugc',label:'UGC',example:'Example'},onChange(){},readOnly});
  ok(prompt.includes('readOnly=""')===readOnly);ok(/<button disabled=""/.test(prompt)===readOnly);ok(prompt.includes('Approved creative direction'));
  const save=render('ProjectSaveControls',{title:'Approved title',onTitleChange(){},onSave(){},state:{status:'saved'},dirty:true,mediaBusy:false,signedIn:true,authReady:true,hasLocalMedia:false,readOnly,children:parts=>React.createElement(React.Fragment,null,parts.project,parts.save)});
  ok(/<input[^>]*readOnly=""/.test(save)===readOnly);ok(/<button[^>]*disabled=""/.test(save)===readOnly);ok(save.includes('Approved title'));
  for(const studioMode of ['basic','pro']) {
   const properties=render('StudioGenerationProperties',{studioMode,settings:{duration:'40',tone:'Professional',visualStyle:'Realistic',aspectRatio:'9:16',resolution:'480p'},ugcType:'advertisement',onChange(){},onUgcTypeChange(){},readOnly});
   ok(properties.includes('<fieldset disabled=""')===readOnly);ok(properties.includes('<summary>'));ok(!/<summary[^>]*disabled/.test(properties));
  }
  const ratio=render('StudioAspectControl',{value:'9:16',onChange(){},disabled:readOnly});
  for(const button of ratio.match(/<button[^>]*>/g))ok(button.includes('disabled=""')===readOnly);
  for(const multiple of [false,true]) {
   const sources=render('StudioReferenceSources',{label:'Characters',addLabel:'Add character',role:'character',multiple,perCharacterSheets:true,
    references:[{id:'reference',images:[{asset:{id:'original',mimeType:'image/png',referenceName:'Ari',status:'uploaded',filename:'Original.png',removedFromDraft:false}}]}],
    uploadStates:{},busy:false,signedIn:true,authReady:true,readOnly,onAdd(){},onRemoveLocal(){},onRemoveAsset(){},onNameChange(){},onUpload(){},onRecover(){}});
   ok(sources.includes('Ari'));
   if(readOnly)for(const input of sources.match(/<input[^>]*>/g))ok(/(disabled|readOnly)=""/.test(input));
   // Viewing/navigation stays present; locking is not a hidden Sources panel.
   ok(sources.includes('Characters')||sources.includes('Character'));
  }
 }
 // A select portal opened before locking cannot write through its old owner
 // when the freshly rendered readonly controls receive a selection event.
 for(const readOnly of [false,true]) {
  let writes=0;
  const tree=m.exports.StudioGenerationProperties({studioMode:'pro',settings:{duration:'40',tone:'Professional',visualStyle:'Realistic'},ugcType:'advertisement',onChange(){writes++;},onUgcTypeChange(){writes++;},readOnly});
  const visit=node=>{for(const child of React.Children.toArray(node)){if(!React.isValidElement(child))continue;if(child.props.onChange)child.props.onChange('test');visit(child.props.children);}};
  visit(tree);ok(writes===(readOnly?0:4));
 }
 ok(networkCalls===0);console.log(JSON.stringify({clipLockUiChecks:checks,realNetworkCalls:networkCalls}));
} finally {globalThis.fetch=originalFetch;}
