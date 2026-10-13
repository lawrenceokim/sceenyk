// Real Clerk A/B, hosted style row and read-only renderer handoff.
// Uses an existing generation only; never dispatches providers or rendering.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import nextEnv from '@next/env';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {deployedBrowser} from './lib/deployed-browser.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const load=typescriptLoader(),db=load('lib/db/server.ts').createDatabaseClient();
const origin=process.argv[2]??'http://localhost:3015',jobId='aa88b9ac-9542-4138-93b6-e5861a96e1df';
const c=await db.from('composition_plans').select('project_id,owner_user_id,plan').eq('job_id',jobId).single();
assert.ok(!c.error&&c.data,'HOSTED_READY_COMPOSITION');
const projectId=c.data.project_id,ownerId=c.data.owner_user_id,route='/projects/'+projectId;
const owner=await db.from('app_users').select('clerk_user_id').eq('id',ownerId).single();assert.ok(!owner.error&&owner.data);
const others=await db.from('app_users').select('clerk_user_id,email').neq('id',ownerId).limit(100);assert.ok(!others.error);
const other=others.data.find(user=>user.email?.includes('+clerk_test@'));assert.ok(other);
const query=new URLSearchParams({projectId,jobId}).toString(),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function upstream(){const data={};for(const table of ['generation_plans','composition_plans','scene_executions','scene_assets','narration_segments','narration_assets','generation_reservations','render_jobs']){
  const r=await db.from(table).select('*').eq(table==='render_jobs'?'generation_job_id':'job_id',jobId);assert.ok(!r.error,table);
  data[table]=r.data.sort((a,b)=>String(a.id??a.job_id).localeCompare(String(b.id??b.job_id)));
}const j=await db.from('generation_jobs').select('*').eq('id',jobId).single();assert.ok(!j.error);data.job=j.data;return hash(data);}
const before=await upstream();
const initialRow=await db.from('caption_preferences').select('enabled,style').eq('job_id',jobId).maybeSingle();
assert.ok(!initialRow.error,'MIGRATION_019_APPLIED');
const originalStyle=initialRow.data?.style??load('lib/captions/style.ts').defaultCaptionStyleSelection;
const get=`(async()=>{const r=await fetch('/api/captions?${query}',{cache:'no-store'});return r.status===200?await r.json():{status:r.status};})()`;
const select=(label,value)=>`(()=>{const x=Array.from(document.querySelectorAll('[aria-label="Scene caption overlay preview"] label')).find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}))?.querySelector('select');if(!x)return false;x.value=${JSON.stringify(value)};x.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`;
const saved=expression=>`(async()=>{const r=await fetch('/api/captions?${query}',{cache:'no-store'});if(!r.ok)return false;const x=await r.json();return ${expression};})()`;
const overlay="document.querySelector('[data-caption-cue]')";
try {
await deployedBrowser(origin,{A:owner.data.clerk_user_id},async browser=>{
  await browser.signIn('A');await browser.navigate(route);
  await browser.wait(`!!${overlay}`);await browser.discover();
  const original=await browser.evaluate(get);
  check('owner reads versioned default or existing saved style',original.style?.schema_version===1);
  check('default preset is available',await browser.evaluate("!!Array.from(document.querySelectorAll('[aria-label=\"Scene caption overlay preview\"] select')).find(x=>Array.from(x.options).some(o=>o.value==='default'))"));
  check('Clean preset selector updates immediately',await browser.evaluate(select('Preset','clean')));
  await browser.wait(saved("x.style?.preset==='clean'"));
  check('Clean persists and uses shadow-only background',await browser.evaluate(`(()=>{const e=${overlay};return !!e&&/0\\)$/.test(getComputedStyle(e.querySelector('span')).backgroundColor);})()`));
  check('Bold preset selector updates immediately',await browser.evaluate(select('Preset','bold')));
  await browser.wait(saved("x.style?.preset==='bold'"));
  check('Bold persists and uses strong type',await browser.evaluate(`(()=>{const e=${overlay};return !!e&&getComputedStyle(e.querySelector('span')).fontWeight==='700';})()`));
  check('Default preset can be restored',await browser.evaluate(select('Preset','default')));
  await browser.wait(saved("x.style?.preset==='default'"));
  for(const [label,value,field] of [['Position','top','position'],['Text size','large','size'],['Alignment','left','alignment'],['Contrast','high','contrast']]){
    check(`${label} changes preview choice`,await browser.evaluate(select(label,value)));
    await browser.wait(saved(`x.style?.${field}===${JSON.stringify(value)}`));
  }
  const changed=(await browser.evaluate(get)).style;
  check('saved controls match requested values',changed.position==='top'&&changed.size==='large'&&changed.alignment==='left'&&changed.contrast==='high');
  const frame=await browser.evaluate(`(()=>{const f=document.querySelector('[aria-label="Scene caption overlay preview"] .relative').getBoundingClientRect(),e=${overlay}.getBoundingClientRect();return {inside:e.left>=f.left&&e.right<=f.right&&e.top>=f.top&&e.bottom<=f.bottom,top:e.top<f.top+f.height/2,align:getComputedStyle(${overlay}).textAlign};})()`);
  check('top position remains in 16:9 safe area',frame.inside&&frame.top&&frame.align==='left');
  const payload=await load('lib/captions/renderer-server.ts').readRendererCaptionPayload(jobId);
  check('hosted renderer handoff matches persisted style',same(payload.style,load('lib/captions/style.ts').resolveCaptionStyle(changed,c.data.plan.aspect_ratio)));
  const track=(await browser.evaluate(get)).track;
  check('style save leaves caption cue timing untouched',same(payload.cues.map(x=>[x.start_ms,x.end_ms]),track.cues.map(x=>[x.start_ms,x.end_ms])));
  await browser.call('Page.reload');await browser.wait(`!!${overlay}`);
  check('refresh restores saved selection',same((await browser.evaluate(get)).style,changed));
  await browser.navigate('/dashboard');await browser.navigate(route);await browser.wait(`!!${overlay}`);
  check('project reopen restores saved selection',same((await browser.evaluate(get)).style,changed));
  const result1=await browser.invoke('setCaptionStyleAction',{projectId,jobId,style:changed});
  const result2=await browser.invoke('setCaptionStyleAction',{projectId,jobId,style:changed});
  const count=await db.from('caption_preferences').select('job_id').eq('job_id',jobId);
  check('duplicate saves reuse one row',result1.ok&&result2.ok&&count.data?.length===1);
});
// New Chrome profile proves persistence without relying on the first browser's state.
await deployedBrowser(origin,{A:owner.data.clerk_user_id,B:other.clerk_user_id},async browser=>{
  await browser.signIn('A');await browser.navigate(route);await browser.wait(`!!${overlay}`);await browser.discover();
  const persisted=await browser.evaluate(get);
  check('fresh browser reads saved style',persisted.style?.position==='top'&&persisted.style?.size==='large'&&persisted.style?.alignment==='left');
  const invalid=await browser.invoke('setCaptionStyleAction',{projectId,jobId,style:{...persisted.style,rendererReady:true}});
  check('browser cannot mark renderer handoff ready',invalid.ok===false);
  await browser.signIn('B');
  check('User B cannot read A style',(await browser.evaluate(get)).status===404);
  const denied=await browser.invoke('setCaptionStyleAction',{projectId,jobId,style:persisted.style});
  check('User B cannot edit A style',denied.ok===false);
  await browser.signIn('A');await browser.navigate(route);await browser.discover();
  const restored=await browser.invoke('setCaptionStyleAction',{projectId,jobId,style:originalStyle});
  check('original style restored',restored.ok&&same((await browser.evaluate(get)).style,originalStyle));
  check('no uncaught browser exceptions',browser.errors.length===0);
});
} finally {
  const restored=await db.rpc('set_caption_style',{p_owner_user_id:ownerId,p_job_id:jobId,p_project_id:projectId,p_style:originalStyle});
  assert.ok(!restored.error&&restored.data,'ORIGINAL_STYLE_RESTORED');
}
check('upstream records remain unchanged',await upstream()===before);
console.log(JSON.stringify({passed:checks.length,checks,aspect:c.data.plan.aspect_ratio,hostedPortrait:false,
  rendererPayloadVersion:1,upstreamUnchanged:true}));
