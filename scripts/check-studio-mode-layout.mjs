// Real mounted shell/provider/Studio layout; fixture identity/persistence only.
// Browser network is blocked. No live project, auth, provider or media operations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {compile} from '@tailwindcss/node';
import {Scanner} from '@tailwindcss/oxide';

const source=`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{WorkspaceShell}from'./components/workspace/workspace-shell';import{StudioLayout}from'./components/creation/studio-layout';
window.fixturePath='/projects/00000000-0000-4000-8000-000000000001';window.modeDB={preferredMode:'basic',projects:{'00000000-0000-4000-8000-000000000001':'basic','00000000-0000-4000-8000-000000000002':'pro'}};window.editorMounts=0;window.navigateModeFixture=path=>{window.fixturePath=path;window.dispatchEvent(new Event('fixture-route'));};
function Editor(){const[title,setTitle]=useState('Saved title');const[prompt,setPrompt]=useState('Saved prompt');const[file,setFile]=useState('');useEffect(()=>{window.editorMounts++;},[]);return <StudioLayout sources={<><input id="fixture-file" type="file" onChange={e=>setFile(e.target.files[0]?.name??'')}/><p id="fixture-file-name">{file}</p></>} toolbar={<input id="fixture-title" aria-label="Fixture title" value={title} onChange={e=>setTitle(e.target.value)} className="min-w-0 flex-1"/>} stage={<textarea id="fixture-prompt" aria-label="Fixture prompt" value={prompt} onChange={e=>setPrompt(e.target.value)}/>} properties={<p>Existing Properties</p>} workflow={<p>Existing Workflow</p>}/>;}
createRoot(document.getElementById('root')).render(<WorkspaceShell><Editor/></WorkspaceShell>);`;
const fixtures={
  'next/navigation':`import{useSyncExternalStore}from'react';const sub=f=>{window.addEventListener('fixture-route',f);return()=>window.removeEventListener('fixture-route',f);};export const usePathname=()=>useSyncExternalStore(sub,()=>window.fixturePath,()=>'/studio');`,
  'next/link':`import React from'react';export default function Link({children,href,...props}){return <a href={href} {...props}>{children}</a>;}`,
  '@clerk/nextjs':`export const useAuth=()=>({isLoaded:true,userId:'fixture-owner'});`,
  '@/components/auth/auth-availability':`export const useAuthAvailable=()=>true;`,
  '@/app/actions/studio-mode':`const state=id=>({ok:true,data:{clerkUserId:'fixture-owner',preferredMode:window.modeDB.preferredMode,projectMode:id?window.modeDB.projects[id]??'basic':null}});export async function readStudioModeAction(id){return state(id);}export async function saveStudioModeAction({projectId,mode}){window.modeDB.preferredMode=mode;if(projectId)window.modeDB.projects[projectId]=mode;return state(projectId);}`,
  '@/components/brand':`import React from'react';export function Brand(){return <a href="/studio">Sceenyk</a>;}`,
  './workspace-user-menu':`export function WorkspaceUserMenu(){return null;}`,
  './persistent-media-preview':`export function PersistentMediaPreview(){throw Error('No private media is loaded by this fixture');}`,
  'next/image':`import React from'react';export default function Image(props){return <img {...props}/>;}`,
};
const bundle=await build({absWorkingDir:process.cwd(),stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',tsconfig:path.resolve('tsconfig.json'),plugins:[{name:'mode-layout-fixtures',setup(b){
  b.onResolve({filter:/.*/},a=>Object.hasOwn(fixtures,a.path)?{path:a.path,namespace:'fixture'}:undefined);
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fixtures[a.path],loader:'tsx',resolveDir:process.cwd()}));
}}]});
const compiler=await compile(fs.readFileSync('app/globals.css','utf8'),{base:path.resolve('app'),onDependency(){}});
const scanner=new Scanner({sources:[{base:process.cwd(),pattern:'components/workspace/**/*.tsx',negated:false},{base:process.cwd(),pattern:'components/creation/studio-layout.tsx',negated:false},{base:process.cwd(),pattern:'components/ui/**/*.tsx',negated:false}]});
const css=compiler.build([...scanner.scan(),'bg-background','text-foreground','min-w-0','flex-1']);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-studio-mode-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws,checks=0,externalRequests=0;const errors=[];
try {
  const portFile=path.join(dir,'profile','DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(portFile);i++)await delay(100);
  const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
  const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let sequence=0;const pending=new Map();
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const item=pending.get(m.id);pending.delete(m.id);if(m.error)item.reject(Error(m.error.message));else item.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent'&&/^https?:/.test(m.params.request.url))externalRequests++;};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??'Evaluation failed');return r.result.value;};
  const check=async(expression,label)=>{assert.ok(await evaluate(expression),label);checks++;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(50);}throw Error('Fixture timeout: '+expression);};
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*']});
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const {frameTree}=await call('Page.getFrameTree');
  await call('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="bg-background text-foreground"><div id="root"></div></body></html>`});
  await evaluate(bundle.outputFiles[0].text);
  await wait("document.querySelector('[data-studio-mode-selector] fieldset:not(:disabled)')!==null");
  await check("document.querySelector('[data-studio-mode]').dataset.studioMode==='basic'",'Existing project defaults to Basic');
  await evaluate("(()=>{const t=document.querySelector('#fixture-title'),p=document.querySelector('#fixture-prompt');for(const[e,v]of[[t,'Unsaved title'],[p,'Unsaved prompt']]){Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}const input=document.querySelector('#fixture-file'),data=new DataTransfer();data.items.add(new File(['local fixture'],'retained-source.txt',{type:'text/plain'}));input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));window.originalEditorInput=p;})()");
  await delay(40);
  for(const theme of ['light','dark']){
    await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);
    await evaluate("document.querySelector('aside input[value=pro]').click()");await wait("document.querySelector('[data-studio-mode]').dataset.studioMode==='pro'");
    await check("getComputedStyle(document.querySelector('aside input[value=pro]+span')).backgroundColor!==getComputedStyle(document.querySelector('aside input[value=basic]+span')).backgroundColor",'Purple Pro selection differs from Basic in '+theme);
    await check("document.querySelector('#fixture-title').value==='Unsaved title'&&document.querySelector('#fixture-prompt').value==='Unsaved prompt'&&document.querySelector('#fixture-file').files[0].name==='retained-source.txt'&&window.editorMounts===1&&window.originalEditorInput===document.querySelector('#fixture-prompt')",'Switch preserves mounted editor, unsaved inputs and selected File');
    await check("document.querySelector('aside [data-studio-mode-selector]').getBoundingClientRect().bottom<=document.querySelector('.workspace-collapse').getBoundingClientRect().top",'Selector is directly above Collapse');
    await evaluate("document.querySelector('aside input[value=basic]').click()");await wait("document.querySelector('[data-studio-mode]').dataset.studioMode==='basic'");
  }
  await evaluate("document.querySelector('[aria-label=\"Collapse sidebar\"]').click()");await delay(200);
  await check("[...document.querySelectorAll('aside label')].every(e=>e.getBoundingClientRect().width>15)&&document.querySelector('aside').scrollWidth<=document.querySelector('aside').clientWidth",'Collapsed controls fit the rail');
  await evaluate("document.querySelector('aside input[value=basic]').focus()");
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await wait("document.querySelector('[data-studio-mode]').dataset.studioMode==='pro'");checks++;
  await evaluate("window.navigateModeFixture('/projects/00000000-0000-4000-8000-000000000002')");await wait("document.querySelector('aside fieldset:not(:disabled)')!==null");
  await evaluate("document.querySelector('aside input[value=basic]').click()");await wait("document.querySelector('[data-studio-mode]').dataset.studioMode==='basic'");
  await evaluate("window.navigateModeFixture('/projects/00000000-0000-4000-8000-000000000001')");await wait("document.querySelector('[data-studio-mode]').dataset.studioMode==='pro'");checks++;
  await check("window.modeDB.projects['00000000-0000-4000-8000-000000000002']==='basic'",'Different project retains its own mode');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);
  for(const theme of ['light','dark']){
    await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);
    await check("(()=>{const r=document.querySelector('[data-studio-mode]').getBoundingClientRect();return r.width>0&&r.x>=0&&r.right<=innerWidth;})()",'Active Studio mode stays visible on mobile');
    await evaluate("document.querySelector('[aria-label=\"Open workspace navigation\"]').click()");await wait("!!document.querySelector('.workspace-drawer input[value=basic]')");
    await evaluate("document.querySelector('.workspace-drawer input[value=basic]').click()");await wait("document.querySelector('[data-studio-mode]').dataset.studioMode==='basic'");
    await evaluate("document.querySelector('.workspace-drawer input[value=pro]').click()");await wait("document.querySelector('[data-studio-mode]').dataset.studioMode==='pro'");checks+=2;
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(200);
    await check("document.documentElement.scrollWidth<=innerWidth",'No mobile page overflow');
  }
  await check("window.editorMounts===1&&window.originalEditorInput===document.querySelector('#fixture-prompt')&&document.querySelector('#fixture-prompt').value==='Unsaved prompt'&&document.querySelector('#fixture-file').files.length===1",'Navigation/mode/mobile controls leave existing editor mounted');
  assert.deepEqual(errors,[]);checks++;assert.equal(externalRequests,0);checks++;
  console.log(JSON.stringify({passed:checks,externalRequests,providerRequests:0,evidence:'Isolated real shell/provider/Studio, expanded/collapsed/mobile controls, both themes, radio keyboard and mounted unsaved input/File preservation. Full hosted Studio visual acceptance remains manual.'}));
} finally {
  ws?.close();chrome.kill();await delay(300);
  const target=path.resolve(dir),tempRoot=path.resolve(os.tmpdir());
  if(path.dirname(target)!==tempRoot||!path.basename(target).startsWith('sceenyk-studio-mode-'))throw Error('Unexpected temporary target');
  fs.rmSync(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
