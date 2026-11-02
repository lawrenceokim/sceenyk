// Focused real React Activity/history/guard/delete checks in isolated Chrome.
// All identity, project and media responses are fixtures; no providers or hosted data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { typescriptLoader } from './lib/load-typescript.mjs';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
const invalidations = [];
let available = true, unavailable = false, deleteOk = true;
const load = typescriptLoader({
  '@/lib/projects/server': {
    getOwnedProject: async () => { if (unavailable) throw Error('DB_UNAVAILABLE'); return available ? { id: a } : null; },
    deleteOwnedProject: async () => deleteOk ? { ok: true, projectId: a } : { ok: false, code: 'UNAVAILABLE' },
  },
  '@/lib/auth/ensure-app-user': { AppUserSyncError: class extends Error {} },
  'next/navigation': { unstable_rethrow() {} },
  'next/cache': { revalidatePath: value => invalidations.push(value) },
});
const actions = load('app/actions/projects.ts');
check('availability confirms accessible project', (await actions.projectAvailabilityAction(a)).available === true);
available = false;
check('availability rejects missing/deleted/inaccessible project', (await actions.projectAvailabilityAction(a)).available === false);
unavailable = true;
check('DB outage stays an error instead of deleting local state', (await actions.projectAvailabilityAction(a)).ok === false);
deleteOk = false;
await actions.deleteProjectAction({ id: a });
check('failed delete invalidates nothing', invalidations.length === 0);
deleteOk = true;
await actions.deleteProjectAction({ id: a });
assert.deepEqual(invalidations, ['/projects', `/projects/${a}`, '/studio']);
check('successful delete invalidates list, project and Studio', true);
const page = fs.readFileSync('app/(workspace)/projects/[id]/page.tsx', 'utf8');
check('server missing-project redirect precedes reference/status loading', page.includes('if (!project) redirect("/studio")') && page.indexOf('if (!project) redirect("/studio")') < page.indexOf('await isOwnedV3Project'));
const workspace = fs.readFileSync('components/creation/creation-workspace.tsx', 'utf8');
check('actual editor binds saved ID and strips saved props on fresh reset', workspace.includes('onProjectSaved?.(result.project.id)') && workspace.includes('{...(fresh ? {} : props)}'));

const source = `
import React,{Activity,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {StudioProjectGuard} from './components/creation/studio-project-guard';
import {ProjectDelete} from './components/projects/project-delete';
import {isProjectDeleted,markProjectDeleted} from './lib/projects/client-lifecycle';
window.fixtureA='${a}';window.fixtureB='${b}';window.failDelete=false;window.holdCheck=false;
window.checks=[];window.replacements=[];window.mounts=0;window.polls=0;window.cleanups=0;
window.isDeleted=isProjectDeleted;window.markDeleted=markProjectDeleted;
const defaults={title:'Untitled Project',character:null,product:null,references:[],error:'',storyboard:null,package:null,video:null,settings:'Original/10/Storytelling'};
function Editor({bind,fresh,initialId}) {
  const [state,setState]=useState(()=>initialId&&!fresh?{...defaults,title:'Saved B'}:{...defaults});
  const [id,setId]=useState(initialId&&!fresh?initialId:null);
  const file=useRef({name:'local-file-object'});
  useEffect(()=>{window.mounts++;},[]);
  window.editorFile=file.current;window.editorState=state;
  window.editTitle=title=>setState(s=>({...s,title}));
  window.seedProject=()=>{localStorage.setItem('fixture:'+window.fixtureA,'active');setId(window.fixtureA);bind(window.fixtureA);
    setState({...defaults,title:'Project A',character:'source-A',product:'prop-A',references:['ref-A'],error:'old-error',storyboard:'old-storyboard',package:'old-package',video:'old-video',settings:'changed'});
    history.replaceState(null,'','/projects/'+window.fixtureA);window.routeChanged();};
  useEffect(()=>{if(!id)return;let active=true;const timer=setInterval(()=>window.polls++,30);
    window.deliverLate=()=>{if(active)setState(s=>({...s,error:'late-deleted-status'}));};
    return()=>{active=false;window.cleanups++;clearInterval(timer);};},[id]);
  return <section data-editor><input name="title" value={state.title} readOnly/><pre>{JSON.stringify(state)}</pre></section>;
}
function App(){
  const pathname=useSyncExternalStore(window.subscribeRoute,()=>location.pathname);
  const [revision,refresh]=useState(0);window.refreshProjects=()=>refresh(v=>v+1);
  const [other,setOther]=useState(null);window.openOther=()=>{setOther(window.fixtureB);window.navigate('/projects/'+window.fixtureB);};
  const initial=useRef(/^\\/projects\\/([^/]+)$/.exec(location.pathname)?.[1]);
  return <><Activity mode={pathname==='/projects'?'hidden':'visible'}>
    <StudioProjectGuard key={other??'original'} initialProjectId={other??initial.current}>
      {(bind,fresh)=><Editor bind={bind} fresh={fresh} initialId={other??initial.current}/>}
    </StudioProjectGuard>
  </Activity>{pathname==='/projects'&&<section data-projects data-revision={revision}>
    {!localStorage.getItem('fixture:deleted:'+window.fixtureA)&&<article data-card="A"><ProjectDelete projectId={window.fixtureA} title="Project A"/></article>}
    <article data-card="B">Project B</article></section>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
const bundle = await build({
  absWorkingDir: process.cwd(), tsconfig: path.resolve('tsconfig.json'),
  stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'deletion-fixtures', setup(builder) {
    builder.onResolve({ filter: /^(next\/navigation|@\/app\/actions\/projects|.*studio-skeleton)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
      if (args.path.endsWith('studio-skeleton')) return { resolveDir: process.cwd(), contents: 'export function StudioSkeleton(){return <p data-checking>Checking project</p>}', loader: 'jsx' };
      if (args.path === 'next/navigation') return { resolveDir: process.cwd(), contents: `
        import {useSyncExternalStore} from 'react';
        const listeners=new Set();window.routeChanged=()=>listeners.forEach(fn=>fn());
        window.subscribeRoute=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
        window.addEventListener('popstate',window.routeChanged);
        window.navigate=path=>{history.pushState(null,'',path);window.routeChanged()};
        const router={replace(path){window.replacements.push(path);history.replaceState(null,'',path);window.routeChanged()}};
        export const useRouter=()=>router;
        export const usePathname=()=>useSyncExternalStore(window.subscribeRoute,()=>location.pathname);
      ` };
      return { contents: `
        export async function projectAvailabilityAction(id){window.checks.push(id);
          if(window.holdCheck)await new Promise(resolve=>window.releaseCheck=resolve);
          if(window.checkError)return {ok:false};
          return {ok:true,available:!localStorage.getItem('fixture:deleted:'+id)};
        }
        export async function deleteProjectAction({id}){
          if(window.failDelete)return {ok:false,message:'Fixture delete failed'};
          localStorage.setItem('fixture:deleted:'+id,'1');window.refreshProjects();return {ok:true,projectId:id};
        }
      ` };
    });
  } }],
});
const script = bundle.outputFiles[0].text;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sceenyk-deletion-'));
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/fixture.js' ? script : '<!doctype html><html><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + path.join(dir, 'profile'), 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let ws;
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
    if (message.id) {
      const item = pending.get(message.id); pending.delete(message.id);
      if (message.error) item?.reject(Error(message.error.message)); else item?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? 'EVALUATION_FAILED');
    return result.result.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
    throw Error('TIMEOUT ' + expression);
  };
  const visible = `Array.from(document.querySelectorAll('[data-editor]')).find(e=>e.checkVisibility())`;
  const click = async label => {
    await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.checkVisibility()&&(e.textContent.trim()===${JSON.stringify(label)}||e.getAttribute('aria-label')===${JSON.stringify(label)})).click()`);
    await delay(50);
  };
  await call('Page.enable'); await call('Runtime.enable');
  const base = `http://127.0.0.1:${server.address().port}`;
  await call('Page.navigate', { url: base + '/studio' });
  await wait(`!!(${visible})`);
  check('opening Studio does not create a project or check a nonexistent ID', await evaluate('window.checks.length===0&&window.mounts===1'));
  await evaluate('window.originalFile=window.editorFile;window.seedProject()');
  await wait('window.checks.length>0');
  check('first save and native URL binding preserve editor and local File', await evaluate('window.mounts===1&&window.editorFile===window.originalFile&&location.pathname.endsWith(window.fixtureA)'));
  await evaluate('window.preFocusCleanups=window.cleanups;window.holdCheck=true;window.dispatchEvent(new Event("focus"))');
  await wait('!!window.releaseCheck');
  check('file-picker focus checks do not hide Studio or stop its effects', await evaluate(`!!(${visible})&&window.cleanups===window.preFocusCleanups&&window.editorFile===window.originalFile`));
  await evaluate('window.holdCheck=false;window.releaseCheck()');
  await wait(`!!(${visible})`);
  await evaluate('window.checkError=true;window.beforeFocusChecks=window.checks.length;window.dispatchEvent(new Event("focus"))');
  await wait('window.checks.length>window.beforeFocusChecks');
  check('transient file-picker focus-check failure preserves the admitted editor', await evaluate(`!!(${visible})&&window.cleanups===window.preFocusCleanups`));
  await evaluate('window.checkError=false;window.releaseCheck=null;window.holdCheck=true;document.dispatchEvent(new Event("visibilitychange"))');
  await wait('!!window.releaseCheck');
  check('same-document visibility checks keep Studio visible during upload', await evaluate(`!!(${visible})&&window.cleanups===window.preFocusCleanups`));
  await evaluate('window.holdCheck=false;window.releaseCheck()');
  await evaluate('window.late=window.deliverLate;window.navigate("/projects")');
  await wait('!!document.querySelector("[data-projects]")');
  check('navigating away cleans up polling', await evaluate('window.cleanups>0'));
  await evaluate('window.failDelete=true');
  await click('Delete Project A'); await click('Delete');
  await wait('document.body.textContent.includes("Fixture delete failed")');
  check('failed deletion retains card and publishes no deletion marker', await evaluate('!!document.querySelector("[data-card=A]")&&!window.isDeleted(window.fixtureA)'));
  await click('Cancel');
  await evaluate('window.navigate("/studio")');
  await wait(`!!(${visible})`);
  check('failed deletion preserves all existing draft fields', await evaluate('window.editorState.title==="Project A"&&window.editorState.character==="source-A"&&window.editorFile===window.originalFile'));
  await evaluate('window.navigate("/projects");window.failDelete=false');
  await click('Delete Project A'); await click('Delete');
  await wait('!document.querySelector("[data-card=A]")');
  check('successful deletion removes only its card and records its ID', await evaluate('!!document.querySelector("[data-card=B]")&&window.isDeleted(window.fixtureA)&&!window.isDeleted(window.fixtureB)'));
  await evaluate('window.navigate("/studio")');
  await wait(`!!(${visible})&&window.editorState.title==="Untitled Project"`);
  check('fresh reset removes every project field and restores defaults', await evaluate('JSON.stringify(window.editorState)===JSON.stringify({title:"Untitled Project",character:null,product:null,references:[],error:"",storyboard:null,package:null,video:null,settings:"Original/10/Storytelling"})'));
  await evaluate('window.late()'); await delay(100);
  check('late old polling cannot repopulate fresh editor', await evaluate('window.editorState.error===""'));
  await evaluate('history.back()'); await wait('location.pathname==="/projects"');
  await evaluate('history.go(-3)');
  await wait('location.pathname==="/studio"&&window.replacements.length>0');
  check('Back to deleted native-history route replaces it with Studio', await evaluate('window.editorState.title==="Untitled Project"'));
  // Preserve an old deleted URL in the forward stack without visiting it yet.
  await evaluate('window.navigate("/projects");history.replaceState({fixture:"base"},"","/projects");history.pushState({fixture:"deleted"},"","/projects/"+window.fixtureA);history.pushState({fixture:"tail"},"","/projects");history.go(-2)');
  await wait('history.state?.fixture==="base"');
  await evaluate('window.beforeForward=window.replacements.length;history.forward()');
  await wait('location.pathname==="/studio"&&window.replacements.length>window.beforeForward');
  check('Forward to a deleted history entry replaces it with Studio', await evaluate('window.editorState.title==="Untitled Project"'));
  await evaluate('window.navigate("/projects/"+window.fixtureA)');
  await wait('location.pathname==="/studio"');
  await evaluate('window.navigate("/projects");history.back()'); await wait('location.pathname==="/studio"');
  await evaluate('history.forward()'); await wait('location.pathname==="/projects"');
  await evaluate('window.navigate("/projects/"+window.fixtureA)'); await wait('location.pathname==="/studio"');
  check('repeated deleted-route navigation cannot restore stale state', await evaluate('window.editorState.character===null'));
  await call('Page.navigate', { url: base + `/projects/${a}` });
  await wait('location.pathname==="/studio"&&!!window.editorState');
  check('manual deleted URL reload replaces with Studio', await evaluate('window.editorState.title==="Untitled Project"'));
  // Existence is still checked when no local deletion notification was received.
  await evaluate('window.openOther()'); await wait(`!!(${visible})&&window.editorState.title==="Saved B"`);
  await evaluate('window.editTitle("Unsaved B");window.navigate("/projects")'); await wait('!!document.querySelector("[data-projects]")');
  await evaluate('window.markDeleted(window.fixtureA);window.releaseCheck=null;window.holdCheck=true;window.navigate("/projects/"+window.fixtureB)');
  await wait('!!window.releaseCheck');
  check('retained project stays hidden until fresh DB verification', await evaluate(`!(${visible})`));
  await evaluate('window.holdCheck=false;window.releaseCheck()'); await wait(`!!(${visible})`);
  check('unrelated deletion preserves live project and unsaved changes', await evaluate('window.editorState.title==="Unsaved B"'));
  await evaluate('window.checkError=true;window.dispatchEvent(new Event("pageshow"))');
  await wait('document.body.textContent.includes("Your project couldn’t be checked")');
  check('DB outage hides retained project without discarding it', await evaluate(`!(${visible})&&window.editorState.title==="Unsaved B"`));
  await evaluate('window.checkError=false'); await click('Try again'); await wait(`!!(${visible})`);
  check('retry restores the same unsaved draft after DB recovery', await evaluate('window.editorState.title==="Unsaved B"'));
  await evaluate('window.navigate("/projects")'); await wait('!!document.querySelector("[data-projects]")');
  await evaluate('localStorage.setItem("fixture:deleted:"+window.fixtureB,"1");window.navigate("/projects/"+window.fixtureB)');
  await wait('location.pathname==="/studio"');
  check('database absence overrides retained state without a tombstone', await evaluate('window.editorState.title==="Untitled Project"'));
  check('blocked browser storage still retains confirmed-deletion cleanup in memory', await evaluate(`(()=>{
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    try{Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')};
      window.markDeleted('storage-blocked-fixture');return window.isDeleted('storage-blocked-fixture')&&!window.isDeleted('unrelated-fixture');
    }finally{Storage.prototype.getItem=get;Storage.prototype.setItem=set;}
  })()`));
  check('no browser exceptions', errors.length === 0);
  console.log(JSON.stringify({ passed: checks.length, checks, scope: 'Isolated React Activity/history/delete/guard fixtures; no provider or hosted calls' }));
  await call('Browser.close');
} finally {
  ws?.close(); chrome.kill(); await new Promise(resolve => server.close(resolve));
}
