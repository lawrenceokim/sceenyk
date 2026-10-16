// Real read-only Clerk/browser hydration diagnosis. Never logs response bodies,
// identity values, input values, tokens, component props or private media URLs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nextEnv from '@next/env';
import {createClerkClient} from '@clerk/backend';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {deployedBrowser} from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const origin=process.argv[2];
assert.ok(['https://sceenyk.vercel.app','http://localhost:3017'].includes(origin),'EXPLICIT_ORIGIN');
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const composition=await db.from('composition_plans').select('project_id').eq('job_id','aa88b9ac-9542-4138-93b6-e5861a96e1df').single();assert.ok(!composition.error&&composition.data);
const project=await db.from('projects').select('owner_user_id').eq('id',composition.data.project_id).single();assert.ok(!project.error&&project.data);
const users=await db.from('app_users').select('id,clerk_user_id,email').order('id').limit(100);assert.ok(!users.error);
const a=users.data.find(u=>u.id===project.data.owner_user_id),b=users.data.find(u=>u.id!==a?.id&&u.email?.includes('+clerk_test@'));
assert.ok(a?.email?.includes('+clerk_test@')&&b,'EXISTING_RESERVED_USERS');
const profiles={};for(const [label,user]of [['A',a],['B',b]]){const r=await db.rpc('creator_profile_owned',{p_owner:user.id});assert.ok(!r.error&&r.data);profiles[label]=r.data;}
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,telemetry:{disabled:true}}),sessions=new Set();
const evidence={origin,startedAt:new Date().toISOString(),observations:[],pauses:[],server:[]};
const file=path.join(os.tmpdir(),origin.includes('localhost')?'sceenyk-profile-hydration-local-diagnosis.json':'sceenyk-profile-hydration-deployed-diagnosis.json');
const save=()=>fs.writeFileSync(file,JSON.stringify(evidence,null,2));
try{await deployedBrowser(origin,{A:a.clerk_user_id,B:b.clerk_user_id},async browser=>{
 const {call,evaluate,wait,navigate,onProtocolEvent,markDiagnosticPhase}=browser;let phase='start';
 const setPhase=value=>{phase=value;markDiagnosticPhase(value);};
 // Pause at React's mismatch throw before recovery discards its fiber. Only
 // structural descriptors are extracted; personal content is never retained.
 onProtocolEvent('Debugger.paused',async event=>{
  try{
   const description=event.data?.description??'';
   if(!/#(?:418|519)\b|Hydration failed/.test(description))return;
   const diagnostic={phase,code:Number(description.match(/#(\d+)/)?.[1]??418),frames:[],dom:[]};
   for(const frame of event.callFrames.slice(0,3)){
    const local=frame.scopeChain.find(scope=>scope.type==='local');if(!local)continue;
    const properties=await call('Runtime.getProperties',{objectId:local.object.objectId,ownProperties:true});
    for(const property of properties.result){
     if(!/^[a-zA-Z_$][\w$]*$/.test(property.name)||property.value?.type!=='object')continue;
     const result=await call('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,returnByValue:true,expression:`(()=>{const f=${property.name};if(!f||typeof f.tag!=='number'||!('return'in f)||!('pendingProps'in f))return null;const chain=[];for(let n=f;n&&chain.length<9;n=n.return)chain.push({tag:n.tag,type:typeof n.type==='string'?n.type:typeof n.type==='function'?n.type.name:'boundary',className:typeof n.pendingProps?.className==='string'?n.pendingProps.className.slice(0,160):null});return {chain,node:f.stateNode?.nodeName??null};})()`});
     if(result.result?.value)diagnostic.frames.push(result.result.value);
    }
    const closure=frame.scopeChain.find(scope=>scope.type==='closure');
    if(closure){const properties=await call('Runtime.getProperties',{objectId:closure.object.objectId,ownProperties:true});for(const property of properties.result){if(property.value?.subtype!=='node'||!/^[a-zA-Z_$][\w$]*$/.test(property.name))continue;const result=await call('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,returnByValue:true,expression:`(()=>{const n=${property.name};return {node:n.nodeName,parent:n.parentNode?.nodeName??null,className:typeof n.className==='string'?n.className.slice(0,160):null,openingProfile:n.textContent?.includes('Opening your public profile settings')??false};})()`});if(result.result?.value)diagnostic.dom.push(result.result.value);}}
   }
   evidence.pauses.push(diagnostic);save();console.log(JSON.stringify({hydrationPause:diagnostic}));
  }catch{evidence.diagnosticFailure=true;save();}finally{await call('Debugger.resume').catch(()=>{});}
 });
 const documents=new Map();
 onProtocolEvent('Network.responseReceived',event=>{if(event.type==='Document'&&new URL(event.response.url).pathname==='/dashboard/marketplace/profile'){const header=name=>Object.entries(event.response.headers).find(([key])=>key.toLowerCase()===name)?.[1]??null;documents.set(event.requestId,{phase,cache:header('cache-control'),cdn:header('cdn-cache-control')});}});
 onProtocolEvent('Network.loadingFinished',async event=>{
  if(!documents.has(event.requestId))return;const document=documents.get(event.requestId);documents.delete(event.requestId);
  try{const response=await call('Network.getResponseBody',{requestId:event.requestId});const html=response.body,account=html.match(/<div class="flex items-center gap-3 border-t border-sidebar-border p-5">([\s\S]*?)<\/aside>/)?.[1],prefix=account?.split('<div class="min-w-0">')[0];const summary={...document,openingProfile:html.includes('Opening your public profile settings'),profileField:html.includes('name="displayName"'),avatar:html.includes('name="avatar"'),accountFirstTag:prefix?.match(/^<([a-z]+)/)?.[1]??null,accountPlaceholder:prefix?.includes('class="size-11 shrink-0"')??false,noOtherUser:!html.includes(document.phase.startsWith('A ')?b.clerk_user_id:a.clerk_user_id)};evidence.server.push(summary);save();}catch{}
 });
 await call('Network.enable');
 if(process.argv.includes('--pause')){await call('Debugger.enable');await call('Debugger.setPauseOnExceptions',{state:'all'});}
 try{for(const who of ['A','B']){
  setPhase('sign in '+who);await browser.signIn(who);sessions.add(await evaluate('window.Clerk.session.id'));
  const open=async label=>{setPhase(who+' '+label);await navigate('/dashboard/marketplace/profile');await wait('!!document.querySelector("input[name=displayName]")');await browser.discover();await wait('!!document.querySelector(".cl-userButtonTrigger")');};
  for(let n=1;n<=3;n++)await open('warmup '+n);
  for(const width of [1440,390])for(const dark of [false,true]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
   const toggle=`document.querySelector('button[aria-label="Toggle light and dark theme"]')`;
   await wait(`!!${toggle}`);
   const clickToggle=async()=>{const point=await evaluate(`(()=>{const r=${toggle}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});};
   if(await evaluate('document.documentElement.classList.contains("dark")')===dark){await clickToggle();await wait(`document.documentElement.classList.contains('dark')!==${dark}`);}
   await clickToggle();await wait(`document.documentElement.classList.contains('dark')===${dark}`);
   await open('width '+width+' '+(dark?'dark':'light'));await evaluate('new Promise(resolve=>setTimeout(resolve,1000))');
   await wait('!!document.querySelector(".cl-userButtonTrigger")');
   const result={user:who,width,dark,correctUser:await evaluate(`window.Clerk.user?.id===${JSON.stringify(who==='A'?a.clerk_user_id:b.clerk_user_id)}`),correctProfile:await evaluate(`document.querySelector('[name=displayName]').value===${JSON.stringify(profiles[who].displayName)}&&document.querySelector('[name=bio]').value===${JSON.stringify(profiles[who].bio)}&&document.querySelector('[name=slug]').value===${JSON.stringify(profiles[who].slug)}`),theme:await evaluate(`document.documentElement.classList.contains('dark')===${dark}`),fits:await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),accountButton:true,errors:browser.exceptions.length};evidence.observations.push(result);save();console.log(JSON.stringify(result));
  }
  await call('Emulation.clearDeviceMetricsOverride');
  assert.ok(await evaluate(`(()=>{const button=[...document.querySelectorAll('.cl-userButtonTrigger')].find(b=>b.getBoundingClientRect().width>0);if(!button)return false;button.click();return true;})()`),'VISIBLE_ACCOUNT_BUTTON');await wait('!!document.querySelector(".cl-userButtonPopoverCard")');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});evidence.observations.at(-1).accountMenuOpens=true;save();
 }}finally{evidence.exceptions=browser.exceptions;save();}
});}finally{for(const id of sessions){try{await clerk.sessions.revokeSession(id);}catch{assert.ok(['revoked','ended','expired','removed','abandoned'].includes((await clerk.sessions.getSession(id)).status));}}}
evidence.checkedAt=new Date().toISOString();save();console.log(JSON.stringify({observations:evidence.observations.length,exceptions:evidence.exceptions.length,pauses:evidence.pauses.length,evidenceFile:file}));
assert.equal(evidence.exceptions.length,0,'HYDRATION_BROWSER_ERRORS');
assert.equal(evidence.pauses.length,0,'HYDRATION_MISMATCH_THROW');
assert.ok(!evidence.diagnosticFailure,'HYDRATION_DIAGNOSTICS_FAILED');
assert.equal(evidence.observations.length,8,'COMPLETE_USER_THEME_VIEWPORT_MATRIX');
assert.ok(evidence.observations.every(r=>r.correctUser&&r.correctProfile&&r.theme&&r.fits&&r.accountButton),'PROFILE_MATRIX_FAILED');
assert.ok(evidence.server.length>=14&&evidence.server.every(r=>r.accountPlaceholder&&r.noOtherUser&&r.cache?.includes('private')&&r.cache?.includes('no-store')&&r.cdn==='no-store'),'SERVER_SNAPSHOT_CACHE_OR_ISOLATION_FAILED');
