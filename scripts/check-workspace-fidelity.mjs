// Read-only local visual review. No save, upload, generation, checkout or publish.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import nextEnv from '@next/env';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { typescriptLoader } from './lib/load-typescript.mjs';
import { deployedBrowser } from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const db = typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const users = await db.from('app_users').select('clerk_user_id,email');
assert.ok(!users.error);
const identity = users.data.find(user => user.email?.includes('+clerk_test@'));
assert.ok(identity, 'Reserved development identity');
const origin = process.env.VISUAL_ORIGIN ?? 'http://localhost:3018';
const baseline = process.argv.includes('--baseline');
const studioOnly = process.argv.includes('--studio-only');
// Populated galleries are explicitly labeled visual fixtures. The reserved
// account may have no owned templates; do not create records to fill a screenshot.
const bundle = await build({ absWorkingDir:process.cwd(),tsconfig:'tsconfig.json',stdin:{contents:`import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{TemplateLibrary}from'./components/templates/template-library';import{ListingCard}from'./components/marketplace/listing-card';export function render(items,marketplace){return renderToStaticMarkup(marketplace?<div className="workspace-gallery">{items.map(item=><ListingCard key={item.id} listing={item}/>)}</div>:<TemplateLibrary result={{items,total:items.length,page:1,pageSize:12}}/>);}`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic' });
const loaded={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),loaded,loaded.exports);
const samples = ['A quiet beginning','City after hours','Small moments','Into the blue','A different perspective','Nightfall','An open horizon','The next chapter','Soft light','In motion'].map((title,i)=>({id:`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`,title,description:'Visual layout sample. Bring your own subject and creative direction.',status:'published',category:'cinematic',creatorName:'Sample creator',creatorSlug:null,creatorAvatar:null,tags:['Cinematic'],adoptionType:'free',priceMinor:0,estimate:null,template:{version:1,category:'cinematic',instructions:'Visual fixture only.',settings:{aspectRatio:'16:9',duration:'10',visualStyle:'Original',tone:'Storytelling'}}}));
await deployedBrowser(origin, [identity.clerk_user_id], async ({ call, evaluate, wait, navigate, signIn, dir, exceptions }) => {
  const captures = [], checks = [];
  const size = async (width, height = 626) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(250);
  };
  const theme = async dark => {
    await evaluate(`localStorage.setItem('sceenyk-theme', '${dark ? 'dark' : 'light'}');window.dispatchEvent(new Event('sceenyk-theme-change'))`);
    await delay(200);
  };
  const shot = async name => {
    const result = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(result.data, 'base64'));
    captures.push(name);
  };
  const geometry = () => evaluate(`(() => {
    const rect = selector => { const e = document.querySelector(selector); if (!e) return null; const r = e.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,visible:!!(r.width&&r.height) }; };
    return { width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,sidebar:rect('[aria-label="Workspace sidebar"]'),sources:rect('.studio-sources'),stage:rect('.studio-stage'),properties:rect('.studio-properties'),toolbar:rect('.studio-toolbar'),grid:rect('.workspace-gallery') };
  })()`);
  await size(1366);
  await navigate('/create'); await wait('!!document.querySelector("textarea")&&!!window.Clerk?.loaded');
  await theme(true); await shot('studio-guest-1366-dark');
  await signIn(0);
  const routes = studioOnly ? ['/create'] : ['/create','/dashboard/templates','/marketplace','/documentation','/dashboard/projects','/dashboard/settings/appearance'];
  for (const route of routes) {
    console.log(JSON.stringify({reviewing:route}));
    await size(1366); await navigate(route);
    await wait('!!document.querySelector("[data-workspace-shell]")');
    if (route === '/create') await wait('!!document.querySelector("textarea")');
    if (route === '/marketplace') await wait('!!document.querySelector("#marketplace-search")');
    if (route === '/dashboard/templates') await wait('!!document.querySelector("#templates")');
    await delay(1000);
    for (const dark of baseline || studioOnly ? [true] : [true,false]) {
      await theme(dark);
      for (const width of baseline || studioOnly ? [1366,390] : [1600,1440,1366,1024,768,550,390,320]) {
        await size(width, width === 550 ? 623 : width < 600 ? 844 : 626);
        const values = await geometry();
        assert.ok(!values.overflow, `Horizontal overflow: ${route} ${width}`);
        if (!baseline && route === '/create') {
          assert.equal(values.toolbar.height,54,'Compact Studio toolbar');
          if (width >= 1280) {
            assert.equal(values.sidebar.width,260,'Expanded sidebar');
            assert.equal(values.sources.width,254,'Sources rail');
            assert.equal(values.properties.width,254,'Properties rail');
            assert.ok(values.stage.width>values.sources.width,'Dominant Stage');
            assert.equal(values.stage.y,8,'Top viewport gutter');
          }
          if (width < 600) assert.ok(values.stage.y<values.properties.y,'Mobile Stage before Properties');
        }
        checks.push({ route, dark, ...values });
        if ([1440,1366,550,390,320].includes(width)) await shot(route.replaceAll('/','-').slice(1) + '-' + width + '-' + (dark?'dark':'light'));
      }
    }
  }
  if (!baseline && !studioOnly) for (const marketplace of [false,true]) {
    await size(1366); await navigate(marketplace?'/marketplace':'/dashboard/templates');
    const selector = marketplace?'.workspace-gallery':'#templates';
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    const markup = loaded.exports.render(samples,marketplace);
    for (const dark of [true,false]) {
      await theme(dark);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).outerHTML=${JSON.stringify(markup)}`);
      for (const width of [1366,390,320]) {
        await size(width,width<600?844:626);
        assert.ok(!(await geometry()).overflow);
        await shot((marketplace?'marketplace':'templates')+'-populated-fixture-'+width+'-'+(dark?'dark':'light'));
      }
    }
  }
  await size(1366); await navigate('/create'); await wait('!!document.querySelector("textarea")'); await theme(true);
  await wait(`!!document.querySelector('button[aria-label="Collapse sidebar"],button[aria-label="Expand sidebar"]')`);
  await evaluate(`document.querySelector('button[aria-label="Collapse sidebar"]')?.click()`); await delay(300);
  checks.push({ route:'collapsed', ...await geometry() }); await shot('studio-collapsed-1366-dark');
  const studioLink = await evaluate(`(() => {const r=document.querySelector('aside a[aria-label="Studio"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...studioLink});
  await wait(`Array.from(document.querySelectorAll('[role="tooltip"]')).some(e=>e.textContent==='Studio')`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:20});
  await size(390,844);
  await evaluate(`document.querySelector('button[aria-label="Open workspace navigation"]').click()`); await delay(300); await shot('mobile-navigation-dark');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'}); await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'}); await delay(300);
  await evaluate('document.querySelector(".studio-sources-trigger").click()'); await delay(300);
  assert.equal(await evaluate('document.querySelector("dialog:modal").clientWidth'),390);
  await shot('mobile-sources-dark');
  await evaluate('document.querySelector(".studio-sources-close").click()'); await delay(150);
  assert.ok(await evaluate('document.activeElement.classList.contains("studio-sources-trigger")'));
  // Preview an existing local artwork without saving or uploading it.
  const artwork = path.resolve('public/images',fs.readdirSync('public/images').find(name=>name.endsWith('.png')));
  const documentNode = await call('DOM.getDocument');
  const input = await call('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'input[type=file]'});
  await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[artwork]});
  await wait(`!!document.querySelector('.studio-media img')?.naturalWidth`);
  await shot('studio-local-source-390-dark');
  await size(1366); await shot('studio-local-source-collapsed-1366-dark');
  await evaluate(`document.querySelector('button[aria-label="Expand sidebar"]')?.click()`); await delay(300);
  const desktopScroll = await evaluate(`({height:innerHeight,root:document.documentElement.scrollHeight,body:document.body.scrollHeight,scrollY,visual:{height:visualViewport.height,offsetTop:visualViewport.offsetTop,pageTop:visualViewport.pageTop},shell:document.querySelector('[data-workspace-shell]').getBoundingClientRect().toJSON(),outside:Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().bottom>innerHeight+1&&getComputedStyle(e).position==='fixed').map(e=>({tag:e.tagName,classes:String(e.className).slice(0,120),rect:e.getBoundingClientRect().toJSON()})),children:Array.from(document.body.children).map(e=>({tag:e.tagName,height:e.getBoundingClientRect().height,bottom:e.getBoundingClientRect().bottom,position:getComputedStyle(e).position})),...Object.fromEntries(['.workspace-gutter','.workspace-content','.studio-layout','.studio-stage','.studio-sources'].map(s=>[s,document.querySelector(s)?.getBoundingClientRect().toJSON()]))})`);
  fs.writeFileSync(path.join(dir,'desktop-scroll.json'),JSON.stringify(desktopScroll,null,2));
  if (desktopScroll.root>desktopScroll.height+1) console.log(JSON.stringify({evidence:dir,desktopScroll}));
  assert.ok(desktopScroll.root<=desktopScroll.height+1,'Desktop scroll stays inside panels');
  await shot('studio-local-source-1366-dark');
  fs.writeFileSync(path.join(dir,'visual-report.json'), JSON.stringify({ scope:'Local production, read-only reserved-account pages; populated gallery samples are DOM-only renderings of actual components with explicit fixtures; local artwork is not uploaded or saved.',captures,checks,exceptions },null,2));
  console.log(JSON.stringify({ evidence:dir,captures:captures.length,layouts:checks.length,exceptions }));
});
