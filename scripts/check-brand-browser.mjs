// Production-build visual acceptance for the supplied logo assets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nextEnv from '@next/env';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {deployedBrowser} from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const origin=process.argv[2]??'http://localhost:3015';
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const job=await db.from('composition_plans').select('owner_user_id')
  .eq('job_id','aa88b9ac-9542-4138-93b6-e5861a96e1df').single();
assert.ok(!job.error&&job.data,'TEST_OWNER_AVAILABLE');
const owner=await db.from('app_users').select('clerk_user_id').eq('id',job.data.owner_user_id).single();
assert.ok(!owner.error&&owner.data,'TEST_CLERK_OWNER_AVAILABLE');
const checks=[],screenshots=[];
function check(name,condition){assert.ok(condition,name);checks.push(name);}
const logo=(selector)=>`(()=>{const link=document.querySelector(${JSON.stringify(selector)});const visible=Array.from(link?.querySelectorAll('img')??[]).filter(img=>img.getClientRects().length&&getComputedStyle(img).display!=='none');const image=visible[0];const rect=image?.getBoundingClientRect();return {links:!!link,visible:visible.length,source:image?decodeURIComponent(image.currentSrc||image.src):'',loaded:!!image?.naturalWidth,ratio:rect?.width/rect?.height,inside:!!rect&&rect.left>=0&&rect.right<=innerWidth};})()`;
async function viewport(browser,width){await browser.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});}
async function theme(browser,name){
  await browser.evaluate(`localStorage.setItem('sceenyk-theme',${JSON.stringify(name)})`);
  await browser.call('Page.reload');
  await browser.wait("document.readyState==='complete'&&!!document.getElementById('sceenyk-favicon')");
  check(`${name} initialized before inspection`,await browser.evaluate(`document.documentElement.classList.contains('dark')===${name==='dark'}`));
  check(`${name} favicon`,await browser.evaluate(`decodeURIComponent(document.getElementById('sceenyk-favicon').href).includes(${JSON.stringify('small-logo '+(name==='dark'?'darkmode':'lightmode'))})`));
}
async function shot(browser,name){const result=await browser.call('Page.captureScreenshot',{format:'png',fromSurface:true});const file=path.join(os.tmpdir(),`sceenyk-brand-${name}.png`);fs.writeFileSync(file,Buffer.from(result.data,'base64'));screenshots.push(file);}

await deployedBrowser(origin,{A:owner.data.clerk_user_id},async browser=>{
  await browser.navigate('/');
  for(const name of ['light','dark'])for(const width of [390,1440]){
    await viewport(browser,width);await theme(browser,name);
    const nav=await browser.evaluate(logo('header a[aria-label="Sceenyk home"]'));
    const footer=await browser.evaluate(logo('footer a[aria-label="Sceenyk home"]'));
    const expected=name==='dark'?'darkmode':'lightmode';
    check(`${name} ${width}px navbar logo`,nav.visible===1&&nav.loaded&&nav.inside&&nav.source.includes(expected)&&nav.source.includes(width<1024?'small-logo':'sceenyk logo'));
    check(`${name} ${width}px footer wordmark`,footer.visible===1&&footer.source.includes(expected)&&footer.source.includes('sceenyk logo'));
    check(`${name} ${width}px public no overflow`,await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    if(name==='dark'&&width===390||name==='light'&&width===1440)await shot(browser,`public-${name}-${width}`);
  }
  await browser.call('Emulation.clearDeviceMetricsOverride');
  await browser.signIn('A');await browser.navigate('/create');
  for(const name of ['light','dark'])for(const width of [390,1440]){
    await viewport(browser,width);await theme(browser,name);
    await browser.wait("!!document.querySelector('[aria-label=\"Open workspace navigation\"]')||!!document.querySelector('[aria-label=\"Workspace sidebar\"] a[aria-label=\"Sceenyk home\"]')");
    const selector=width<1024?'header a[aria-label="Sceenyk home"]':'[aria-label="Workspace sidebar"] a[aria-label="Sceenyk home"]';
    const brand=await browser.evaluate(logo(selector));
    check(`${name} ${width}px workspace logo`,brand.visible===1&&brand.loaded&&brand.inside&&brand.source.includes(name==='dark'?'darkmode':'lightmode')&&brand.source.includes(width<1024?'small-logo':'sceenyk logo'));
    check(`${name} ${width}px workspace no overflow`,await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    if(name==='dark'&&width===390||name==='light'&&width===1440)await shot(browser,`workspace-${name}-${width}`);
  }
  await viewport(browser,390);
  await browser.evaluate("document.querySelector('[aria-label=\"Open workspace navigation\"]').click()");
  await browser.wait("!!document.querySelector('[role=dialog] a[aria-label=\"Sceenyk home\"]')");
  const drawer=await browser.evaluate(logo('[role=dialog] a[aria-label="Sceenyk home"]'));
  check('mobile drawer uses full logo',drawer.visible===1&&drawer.source.includes('sceenyk logo'));
  check('brand links retain accessible names',await browser.evaluate("Array.from(document.querySelectorAll('a[aria-label=\"Sceenyk home\"]')).every(a=>a.tabIndex>=0)"));
  check('no browser exceptions',browser.errors.length===0);
});
console.log(JSON.stringify({passed:checks.length,checks,screenshots}));
