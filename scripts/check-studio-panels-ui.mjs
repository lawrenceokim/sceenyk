// Focused presentation fixture requested for the Studio rearrangement.
// Real React/Sheet/Dialog/Studio components; all project/media responses are fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const source = `import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';
import{StudioLayout}from'./components/creation/studio-layout';
import{StudioPanelTarget}from'./components/creation/studio-workspace-panels';
import{StudioReferenceSources}from'./components/creation/studio-reference-sources';
import{V3WorkflowPreview}from'./components/creation/v3-workflow-preview';
window.fixtureImage='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000"><rect width="600" height="1000" fill="purple"/></svg>');
window.posts=[];window.mounts=0;window.unmounts=0;
const workspace={projectId:'fixture',artifacts:['character','product','location'].map(kind=>({id:kind,kind,version:1,activeSlot:true,current:true,approved:false,rejected:false,preview:window.fixtureImage})),tasks:[],runs:[],processing:false,complete:false,preflight:{packageId:'package',packageHash:'hash',durationMs:10000,aspectRatio:'9:16',currentness:'current',estimatedCostMicrousd:1000000,displayEstimatedCostMicrousd:1000000,authorizedMaximumMicrousd:null,suggestedMaximumMicrousd:1200000,suggestedAuthorizationBufferPercent:20,segmentCount:1,quoteId:'quote',issues:[],transportEnabled:false,canSubmit:false}};
window.fetch=async(url,options)=>{if(options?.method==='POST')window.posts.push(JSON.parse(options.body));return{ok:true,json:async()=>({ok:true,workspace:structuredClone(workspace)})}};
function Owner({assets,revision}){useEffect(()=>{window.mounts++;return()=>{window.unmounts++}},[]);return <V3WorkflowPreview initial={workspace} projectId="fixture" assets={assets} dirty={false} revision={String(revision)}/>}
function App(){const[revision,setRevision]=useState(0),[prompt,setPrompt]=useState('Keep this direction'),[assets,setAssets]=useState(['character','product'].map(kind=>({id:'source-'+kind,projectId:'fixture',studioRole:kind,kind:'image',filename:kind+'.png',status:'uploaded',referenceName:kind+' name'})));
window.addVideo=()=>{workspace.runs=[{id:'video',packageId:'package',segmentId:'joined',state:'awaiting_review',current:true,preview:'/fixture.mp4',expectedDialogue:[],shotTimings:[],actualDurationMs:10000,hasAudio:true,aspectRatio:'9:16',resolution:'480p',provider:'fixture',model:'fixture',estimatedCostMicrousd:1000000,actualCostMicrousd:null}];setRevision(n=>n+1)};
return <main className="p-2"><StudioLayout media={assets.map(asset=>({id:asset.id,label:asset.filename,kind:'asset',asset}))}
sources={<><input aria-label="Project title" defaultValue="Keep this project"/>{assets.map(asset=><StudioReferenceSources key={asset.id} label={asset.studioRole} addLabel={'Add '+asset.studioRole} role={asset.studioRole} references={[{id:asset.id,images:[{asset}]}]} onAdd={()=>{}} onRemoveLocal={()=>{}} onRemoveAsset={()=>{}} onUpload={()=>{}} onRecover={()=>{}} onNameChange={(a,value)=>setAssets(all=>all.map(item=>item.id===a.id?{...item,referenceName:value}:item))} uploadStates={{}} busy={false} signedIn authReady/>)}<StudioPanelTarget panel="location"/></>}
toolbar={<span>Preview</span>} stage={<div data-empty-preview>Preview · UGC · Advertisement · 10 sec</div>}
properties={<label>Scene<input aria-label="Scene" value={prompt} onChange={e=>setPrompt(e.target.value)}/></label>}
workflow={<Owner assets={assets} revision={revision}/>}/></main>};createRoot(document.getElementById('root')).render(<App/>);`;
const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', tsconfig: path.resolve('tsconfig.json'), plugins: [{ name: 'private-media-fixture', setup(builder) {
  builder.onResolve({ filter: /^(next\/image|@\/app\/actions\/media|@\/components\/account-action)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'next/image'
    ? `import React from'react';export default function Image({fill,unoptimized,sizes,...props}){return <img {...props} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:undefined}/>}`
    : args.path.endsWith('/media') ? 'export const readMediaAction=async()=>({ok:true,value:{url:window.fixtureImage}});'
      : `import React from'react';export function AccountAction({children}){return <span>{children}</span>}`, loader: 'tsx', resolveDir: process.cwd() }));
} }] });
const compiler = await compile(fs.readFileSync('app/globals.css', 'utf8'), { base: path.resolve('app'), onDependency() {} });
const scanner = new Scanner({ sources: [{ base: process.cwd(), pattern: 'components/**/*.tsx', negated: false }] });
const css = compiler.build(scanner.scan());
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : req.url === '/fixture.css' ? 'text/css' : 'text/html');
  if (req.url === '/fixture.mp4') { res.statusCode = 204; res.end(); return; }
  res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : req.url === '/fixture.css' ? css : '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="bg-background text-foreground"><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sceenyk-studio-panels-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + path.join(dir, 'profile'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws, count = 0;
const errors = [];
try {
  const portFile = path.join(dir, 'profile', 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
  const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) { const item = pending.get(message.id); pending.delete(message.id); if (message.error) item.reject(Error(message.error.message)); else item.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression: `(()=>{const result=eval(${JSON.stringify(expression)});return result instanceof Node?true:result})()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? 'Evaluation failed'); return r.result.value; };
  const check = async (name, expression) => { assert.ok(await evaluate(expression), name); count++; };
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); } throw Error('Timeout: ' + expression); };
  const click = async label => { await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.checkVisibility()&&(e.textContent.trim()===${JSON.stringify(label)}||e.getAttribute('aria-label')===${JSON.stringify(label)})).click()`); await delay(400); };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await wait(`document.querySelector('[aria-label="Character Sheet"]')?.checkVisibility()`);
  await check('clean empty Preview', `!!document.querySelector('[data-empty-preview]')&&!document.querySelector('[aria-label="Preview content"] [aria-label="Workflow view"]')`);
  await check('generation follows Character name in Sources', `document.querySelector('#studio-sources [aria-label="Character Sheet"] button').textContent==='Generate Character Sheet'||document.querySelector('#studio-sources [aria-label="Character Sheet"] button').textContent==='Regenerate Character Sheet'`);
  await check('closed drawer hidden', `!document.querySelector('[data-slot="sheet-content"]').checkVisibility()`);
  await click('Preview character.png');
  await check('uploaded source in desktop Preview', `document.querySelector('[aria-label="Preview content"] img')?.alt.includes('character.png')`);
  await click('Preview Character Sheet version 1');
  await check('generated source in desktop Preview', `document.querySelector('[aria-label="Preview content"] img')?.alt.includes('Character Sheet')`);
  await evaluate(`window.previewNode=document.querySelector('[aria-label="Preview content"] img');window.nameNode=document.querySelector('input[name="character-name"]')`);
  await click('Open Workflow');
  await check('desktop overlay width is approximately 45vw', `Math.abs(document.querySelector('[data-slot="sheet-content"]').getBoundingClientRect().width-innerWidth*.45)<12`);
  await check('four workflow views', `Array.from(document.querySelector('[aria-label="Workflow view"]').querySelectorAll('button')).map(e=>e.textContent).join(',')==='Progress,Storyboard,Package,Final Video'`);
  await click('Package');
  await evaluate(`const field=document.querySelector('input[type="number"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'7.23');field.dispatchEvent(new Event('input',{bubbles:true}));window.packageField=field`);
  await click('Close'); await click('Open Workflow');
  await check('drawer keeps package form mounted and edited', `window.packageField===document.querySelector('input[type="number"]')&&window.packageField.value==='7.23'&&window.mounts===1&&window.unmounts===0`);
  await click('Close');
  await check('Preview/Sources nodes preserved', `window.previewNode===document.querySelector('[aria-label="Preview content"] img')&&window.nameNode===document.querySelector('input[name="character-name"]')`);
  await click('Clear Preview');
  await check('clear returns empty Preview', `!!document.querySelector('[data-empty-preview]')`);
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(200);
  await click('Open Sources');
  await evaluate(`window.sourceScroll=document.querySelector('[aria-label="Sources controls"]');window.sourceScroll.scrollTop=100;window.sourcePosition=window.sourceScroll.scrollTop`);
  await click('Preview Character Sheet version 1');
  await check('mobile image occupies full viewport', `(()=>{const r=document.querySelector('[data-slot="dialog-content"]').getBoundingClientRect();return Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2})()`);
  await check('mobile image fits and empty stage retained', `getComputedStyle(document.querySelector('[data-slot="dialog-content"] img')).objectFit==='contain'&&!!document.querySelector('[data-empty-preview]')`);
  await click('Close image preview');
  await check('returns to same open Sources with scrolling retained', `document.querySelector('#studio-sources').matches(':modal')&&window.nameNode===document.querySelector('input[name="character-name"]')&&window.sourceScroll.scrollTop===window.sourcePosition&&document.body.style.overflow==='hidden'`);
  await click('Regenerate Character Sheet');
  await check('confirmation renders inside native Sources top layer', `document.querySelector('#studio-sources [data-slot="dialog-content"]')?.textContent.includes('Regenerate Character Sheet?')`);
  await click('Cancel');
  await check('cancel queues nothing', `window.posts.length===0&&document.querySelector('#studio-sources').open`);
  await click('Close Sources'); await click('Open Workflow');
  await check('mobile Workflow occupies full viewport', `(()=>{const r=document.querySelector('[data-slot="sheet-content"]').getBoundingClientRect();return Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2})()`);
  await click('Close'); await evaluate('window.addVideo()');
  await click('Open Workflow'); await click('Final Video');
  await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.checkVisibility()&&e.textContent==='View in Preview')`);
  await check('video rejection button enabled', `!Array.from(document.querySelectorAll('[data-slot="sheet-content"] [aria-label="Final video review"] button')).find(e=>e.textContent==='Reject and Delete').disabled`);
  await evaluate(`Array.from(document.querySelectorAll('[data-slot="sheet-content"] [aria-label="Final video review"] button')).find(e=>e.textContent==='Reject and Delete').click()`); await delay(400);
  await check('video deletion confirmation is nested above Workflow', `document.querySelector('[data-slot="dialog-content"]')?.checkVisibility()&&document.querySelector('[data-slot="sheet-content"]').checkVisibility()`);
  await click('Cancel'); await click('View in Preview');
  await wait(`!!document.querySelector('[aria-label="Preview content"] video')`);
  await check('actual video element in Preview', `document.querySelector('[aria-label="Preview content"] video').getAttribute('src')==='/fixture.mp4'`);
  await check('no workflow remount or generation request', `window.mounts===1&&window.unmounts===0&&window.posts.length===0`);
  assert.deepEqual(errors, []);
  console.info(`${count} Studio media/drawer/focus-container/state presentation checks passed with local fixture responses; no provider or live data calls.`);
} finally {
  ws?.close(); chrome.kill(); await new Promise(resolve => server.close(resolve));
}
