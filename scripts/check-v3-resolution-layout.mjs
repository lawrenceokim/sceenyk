// Local, isolated selector only; all browser network requests are blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {compile} from '@tailwindcss/node';
import {Scanner} from '@tailwindcss/oxide';

const source=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{StudioResolution}from'./components/creation/studio-resolution';import{StudioInspectorSection}from'./components/creation/studio-inspector-section';
function Fixture(){const[value,setValue]=useState('480p');window.selectedResolution=value;return <main id="panel" style={{width:280,maxWidth:'calc(100vw - 32px)',margin:16}}><StudioInspectorSection title="Resolution" open><StudioResolution value={value} onChange={setValue}/></StudioInspectorSection></main>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',tsconfig:path.resolve('tsconfig.json')});
const compiler=await compile(fs.readFileSync('app/globals.css','utf8'),{base:path.resolve('app'),onDependency(){}});
const scanner=new Scanner({sources:[{base:process.cwd(),pattern:'components/creation/studio-resolution.tsx',negated:false},{base:process.cwd(),pattern:'components/creation/studio-inspector-section.tsx',negated:false}]});
const css=compiler.build([...scanner.scan(),'bg-background','text-foreground']);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-resolution-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws,checks=0;const errors=[];
try{
 const portFile=path.join(dir,'profile','DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(portFile);i++)await delay(100);
 const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let sequence=0;const pending=new Map();
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const item=pending.get(message.id);pending.delete(message.id);if(message.error)item.reject(Error(message.error.message));else item.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??'Evaluation failed');return r.result.value;};
 const check=async(expression,label)=>{assert.ok(await evaluate(expression),label);checks++;};
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*']});
 const {frameTree}=await call('Page.getFrameTree');
 await call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="bg-background text-foreground"><div id="root"></div></body></html>`});
 await evaluate(bundle.outputFiles[0].text);
 for(let i=0;i<100&&!await evaluate("!!document.querySelector('input:checked')");i++)await delay(50);
 for(const [width,mobile] of [[1440,false],[390,true],[320,true],[250,true]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile});
  for(const theme of ['dark','light']){
   await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);await delay(50);
   await check('document.documentElement.scrollWidth<=innerWidth','No page overflow');
   await check("[...document.querySelectorAll('label>span')].every(e=>e.scrollWidth<=e.clientWidth+1)",'Option contents fit');
   await check("[...document.querySelectorAll('label>span')].every(e=>e.getBoundingClientRect().height>=44)",'Touch target heights');
   await check("new Set([...document.querySelectorAll('label')].map(e=>Math.round(e.getBoundingClientRect().top))).size===1",'Three horizontal choices');
   for(const resolution of ['480p','720p','1080p']){
    await evaluate(`document.querySelector('input[value="${resolution}"]').click()`);await delay(30);
    await check(`window.selectedResolution==='${resolution}'&&document.querySelectorAll('input:checked').length===1`,'Controlled single selection');
   }
   await check("getComputedStyle(document.querySelector('input:checked+span')).backgroundColor!==getComputedStyle(document.querySelector('input:not(:checked)+span')).backgroundColor",'Selected theme styling');
  }
 }
 await evaluate("document.querySelector('input:checked').focus()");
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await delay(50);
 await check("window.selectedResolution==='480p'",'Native radio keyboard navigation');
 assert.deepEqual(errors,[]);checks++;
 console.log(JSON.stringify({checks,scope:'Isolated resolution selector at desktop/mobile/narrow widths, both themes, real clicks and keyboard',providerRequests:0}));
}finally{
 ws?.close();chrome.kill();await delay(300);
 if(path.dirname(dir)!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('sceenyk-resolution-'))throw Error('Unexpected temporary path');
 fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
