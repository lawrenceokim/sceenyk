// Isolated actual clip/merge components, real CSS and Chrome. All page networking is blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {compile} from '@tailwindcss/node';
import {Scanner} from '@tailwindcss/oxide';

const source=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{V3ClipManager}from'./components/creation/v3-clip-manager';
window.fixtureActions=[];window.previewSelection=null;
function Fixture(){const[state,setState]=useState('ready');window.mergeState=setState;
const clips=Array.from({length:7},(_,i)=>({id:'clip-'+i,number:i+1,segmentId:'segment-'+i,runId:'run-'+i,durationMs:10000,startMs:i*10000,endMs:(i+1)*10000,purpose:'An approved story moment with a long description that must wrap inside a narrow drawer.',attempts:1,authorized:false,canGenerate:false,canRegenerate:false,canRenewAuthorization:false,blockers:[],needsContinuityReview:false,estimatedCostMicrousd:2056670,suggestedMaximumMicrousd:2500000}));
const status=state==='merging'?'running':state==='failed'?'failed':state==='ready'?'queued':'done';
const result=['review','approved','outdated','deleting','deleted'].includes(state)?{id:'merged',packageId:'package',segmentId:'joined',state:state==='review'||state==='outdated'?'awaiting_review':state,current:state!=='outdated',preview:state==='deleting'||state==='deleted'?null:'data:video/mp4;base64,',errorCode:state==='deleting'?'DELETE_FAILED':null}:null;
const workspace={projectId:'fixture-project',runs:[...clips.map(c=>({id:c.runId,packageId:'package',segmentId:c.segmentId,state:'approved',current:true,preview:null})),...(result?[result]:[])],tasks:[],preflight:{packageId:'package'},multiClip:{packageId:'package',packageHash:'hash',clips,committedMicrousd:14396690,reservedMicrousd:0,readyForMerging:true,merge:{manifestHash:'manifest',canMerge:true,taskId:state==='ready'?null:'merge-task',status:state==='ready'?null:status,resultId:result?.id??null,errorCode:state==='failed'?'V3_MERGE_SOURCE_INVALID':null}}};
return <main id="panel" style={{width:740,maxWidth:'calc(100vw - 32px)',margin:16}}><V3ClipManager workspace={workspace} studioMode="pro" disabled={false} act={async(action,payload)=>{window.fixtureActions.push({action,payload});if(action==='merge')setState('merging');if(action==='approve')setState('approved');if(action==='reject_delete')setState('deleted');return true;}}/></main>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const bundle=await build({absWorkingDir:process.cwd(),stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',tsconfig:path.resolve('tsconfig.json'),plugins:[{name:'merge-layout-fixtures',setup(b){
 b.onResolve({filter:/^\.\/studio-workspace-panels$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useStudioPanels=()=>({selectMedia:id=>{window.previewSelection=id;}});',loader:'js'}));
}}]});
const compiler=await compile(fs.readFileSync('app/globals.css','utf8'),{base:path.resolve('app'),onDependency(){}});
const scanner=new Scanner({sources:[{base:process.cwd(),pattern:'components/creation/v3-{clip-manager,merge-review}.tsx',negated:false},{base:process.cwd(),pattern:'components/ui/**/*.tsx',negated:false}]});
const css=compiler.build([...scanner.scan(),'bg-background','text-foreground']);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-merge-layout-'));
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws,checks=0,externalRequests=0;const errors=[];
try {
 const portFile=path.join(dir,'profile','DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(portFile);i++)await delay(100);
 const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let sequence=0;const pending=new Map();
 ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}
  else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
  else if(m.method==='Network.requestWillBeSent'&&/^https?:/.test(m.params.request.url))externalRequests++;};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??'Evaluation failed');return r.result.value;};
 const check=async(expression,label)=>{assert.ok(await evaluate(expression),label);checks++;};
 const click=async label=>{await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);await delay(50);};
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*']});
 const {frameTree}=await call('Page.getFrameTree');
 await call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="bg-background text-foreground"><div id="root"></div></body></html>`});
 await evaluate(bundle.outputFiles[0].text);
 for(let i=0;i<100&&!await evaluate('typeof window.mergeState==="function"');i++)await delay(50);
 for(const [width,panel] of [[1440,740],[1440,360],[390,358],[320,288]]) {
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await evaluate(`document.getElementById('panel').style.width='${panel}px'`);
  for(const theme of ['light','dark']) {
   await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);
   for(const state of ['ready','merging','failed','review','approved','outdated','deleting','deleted']) {
    await evaluate(`window.mergeState('${state}')`);await delay(35);
    await check('document.documentElement.scrollWidth<=innerWidth','No page overflow');
    await check("[...document.querySelectorAll('#panel button')].every(b=>b.getBoundingClientRect().right<=document.getElementById('panel').getBoundingClientRect().right+1)",'Buttons stay inside drawer');
    await check("getComputedStyle(document.querySelector('ol')).gridTemplateColumns.split(' ').length==="+(panel>=512?2:1),'Clip grid responds to drawer width');
    await check("document.querySelectorAll('ol>li').length===7",'Every approved clip remains mounted');
   }
   await evaluate("window.mergeState('review')");await delay(35);await click('View in Preview');await check("window.previewSelection==='v3-video:merged'",'Existing Preview selection');
  }
 }
 await evaluate("window.mergeState('review')");await delay(50);await click('Approve Final Video');await check("document.body.textContent.includes('Final video approved')",'Final approval handler');
 await evaluate("window.mergeState('review')");await delay(50);await click('Reject and Delete');
 await check("document.querySelector('[role=dialog]')?.textContent.includes('approved individual clips stay saved')",'Confirmation preserves clips');
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(350);
 await check("!document.querySelector('[role=dialog]')",'Dialog closes with Escape');
 await evaluate("window.mergeState('ready')");await delay(50);
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Merge Videos').focus()");
 await check("document.activeElement.textContent.trim()==='Merge Videos'&&!document.activeElement.disabled",'Merge receives keyboard focus');
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(50);
 await check("document.body.textContent.includes('Merging videos...')",'Keyboard merge activation');
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await check(`getComputedStyle(document.querySelector('svg[class*="animate-spin"]')).animationName==='none'`,'Reduced motion spinner');
 await check("window.fixtureActions.every(a=>!['generate','generate_clip','authorize','authorize_clip'].includes(a.action))",'UI never requests paid work');
 assert.deepEqual(errors,[]);checks++;assert.equal(externalRequests,0);checks++;
 console.info(JSON.stringify({mergeLayoutChecks:checks,widths:[1440,390,320],narrowDesktopDrawer:360,themes:['light','dark'],externalRequests}));
} finally {
 ws?.close();chrome.kill();await delay(300);
 if(path.dirname(dir)!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('sceenyk-merge-layout-'))throw Error('FIXTURE_CLEANUP_SCOPE');
 fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
