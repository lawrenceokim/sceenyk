// Actual Clerk A/B against a local production build and hosted DB.
// Does not send workflow events, invoke providers or request final rendering.
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {deployedBrowser} from './lib/deployed-browser.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const load=typescriptLoader(),db=load('lib/db/server.ts').createDatabaseClient();
const jobId=process.argv[3]??'aa88b9ac-9542-4138-93b6-e5861a96e1df',origin=process.argv[2]??'http://localhost:3015';
const c=await db.from('composition_plans').select('project_id,owner_user_id,plan').eq('job_id',jobId).single();assert.ok(!c.error&&c.data);
const speech=await db.from('narration_segments').select('id,scene_execution_id,scene_order,output_asset_id,actual_duration_ms,text').eq('job_id',jobId).eq('status','completed');assert.ok(!speech.error);
const derived=load('lib/captions/build.ts').buildCaptionTrack({plan:c.data.plan,narration:speech.data});assert.equal(derived.status,'ready');
const vtt=load('lib/captions/export.ts').exportCaptions(derived,'vtt');
const a=await db.from('app_users').select('clerk_user_id,email').eq('id',c.data.owner_user_id).single();assert.ok(!a.error&&a.data);
const candidates=await db.from('app_users').select('clerk_user_id,email').neq('id',c.data.owner_user_id).limit(100);assert.ok(!candidates.error);
const b=candidates.data.find(u=>u.email?.includes('+clerk_test@'));assert.ok(b,'RESERVED_B_IDENTITY');
const query=new URLSearchParams({projectId:c.data.project_id,jobId}).toString(),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
await deployedBrowser(origin,{A:a.data.clerk_user_id,B:b.clerk_user_id},async browser=>{
  const get=()=>browser.evaluate(`(async()=>{const r=await fetch('/api/captions?'+${JSON.stringify(query)},{cache:'no-store'});return {status:r.status,body:await r.json()};})()`);
  await browser.signIn('A');await browser.navigate('/projects/'+c.data.project_id);
  const native=await browser.evaluate(`(async()=>{
    const video=document.createElement('video'),element=document.createElement('track');
    const url=URL.createObjectURL(new Blob([${JSON.stringify(vtt)}],{type:'text/vtt'}));
    element.kind='subtitles';element.src=url;video.append(element);document.body.append(video);element.track.mode='hidden';
    try {await new Promise((resolve,reject)=>{element.onload=resolve;element.onerror=()=>reject(new Error('VTT_PARSE'));setTimeout(()=>reject(new Error('VTT_TIMEOUT')),10000);});
      return Array.from(element.track.cues).map(c=>({startMs:Math.round(c.startTime*1000),endMs:Math.round(c.endTime*1000),text:c.text}));
    }finally{video.remove();URL.revokeObjectURL(url);}
  })()`);
  check('native Chrome WebVTT parser accepts real-derived captions and exact windows',native.length===derived.cues.length&&native.every((c,i)=>c.startMs===derived.cues[i].start_ms&&c.endMs===derived.cues[i].end_ms));
  const owned=await get();check('actual owner route returns ready data or truthful schema-unavailable',owned.status===200||owned.status===503);
  const schemaAvailable=owned.status===200;
  if(schemaAvailable) {
    check('hosted owner sees ready structured captions',owned.body.track?.status==='ready');
    await browser.wait("document.body.innerText.includes('Captions ready')");
    await browser.discover();
    await browser.evaluate("document.querySelector('[aria-label=Captions] details').open=true");
    for(const theme of ['light','dark']) for(const width of [1440,390,320]) {
      await browser.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      await browser.evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);
      check(`caption preview fits ${theme} ${width}`,await browser.evaluate("document.documentElement.scrollWidth<=innerWidth&&!!document.querySelector('[aria-label=Captions] input[type=checkbox]')"));
    }
    const initial=owned.body.enabled;
    await browser.evaluate("document.querySelector('[aria-label=Captions] input').click()");
    await browser.wait(`!document.querySelector('[aria-label=Captions] input').disabled&&document.querySelector('[aria-label=Captions] input').checked===${!initial}`);
    check('real preference saved',(await get()).body.enabled===!initial);
    await browser.call('Page.reload');await browser.wait("!!document.querySelector('[aria-label=Captions] input')&&!document.querySelector('[aria-label=Captions] input').disabled");
    check('reload retains preference and identical canonical track',(await get()).body.enabled===!initial&&JSON.stringify((await get()).body.track)===JSON.stringify(owned.body.track));
    await browser.navigate('/dashboard');await browser.navigate('/projects/'+c.data.project_id);
    check('project reopen retains canonical track',JSON.stringify((await get()).body.track)===JSON.stringify(owned.body.track));
    for(const format of ['srt','vtt']) check('actual authenticated '+format+' download',await browser.evaluate(`(async()=>{const r=await fetch('/api/captions?'+${JSON.stringify(query+'&format='+format)});const t=await r.text();return r.status===200&&${format==='vtt'?'t.startsWith("WEBVTT\\n\\n")':'/00:00:00,000 -->/.test(t)'};})()`));
    if((await get()).body.enabled!==initial) {
      await browser.wait("!!document.querySelector('[aria-label=Captions] input')&&!document.querySelector('[aria-label=Captions] input').disabled");
      await browser.evaluate("document.querySelector('[aria-label=Captions] input').click()");
      await browser.wait(`!document.querySelector('[aria-label=Captions] input').disabled&&document.querySelector('[aria-label=Captions] input').checked===${initial}`);
    }
  } else check('missing migration never claims captions ready',owned.body.code==='UNAVAILABLE');
  await browser.signIn('B');
  const foreign=await get();check('real User B caption read denied before database table access',foreign.status===404&&foreign.body.code==='NOT_FOUND');
  if(schemaAvailable) {
    const result=await browser.invoke('setCaptionPreferenceAction',{projectId:c.data.project_id,jobId,enabled:false});
    check('real User B cannot edit owner caption choice',result.ok===false);
  }
  for(const format of ['srt','vtt']) check('real User B '+format+' export denied',await browser.evaluate(`(async()=>{const r=await fetch('/api/captions?'+${JSON.stringify(query+'&format='+format)});return r.status===404;})()`));
  check('browser cannot submit arbitrary captions',await browser.evaluate(`(async()=>{const r=await fetch('/api/captions?'+${JSON.stringify(query)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'ready',cues:[]})});return r.status===405;})()`));
  check('no browser runtime exceptions',browser.errors.length===0);
  console.log(JSON.stringify({passed:checks.length,schemaAvailable,checks}));
});
