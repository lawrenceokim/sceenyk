// Local production browser + real reserved Clerk users/owned hosted reads.
// No generation, checkout, financial mutation or hosted Inngest event.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import nextEnv from '@next/env';
import { typescriptLoader } from './lib/load-typescript.mjs';
import { deployedBrowser } from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const origin = 'http://localhost:3017';
const db = typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const { documentationTopics } = typescriptLoader()('lib/documentation/content.ts');
const users = await db.from('app_users').select('id,clerk_user_id,email');
assert.ok(!users.error);
const roles = await db.from('internal_user_roles').select('user_id,role'); assert.ok(!roles.error);
const identities = users.data.filter(u => u.email?.includes('+clerk_test@')&&!roles.data.some(r=>r.user_id===u.id&&r.role!=='user')).slice(0, 2);
assert.equal(identities.length, 2, 'TWO_RESERVED_USERS');
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); console.log(JSON.stringify({passed:name})); }
async function protectedHash() {
  const records = [];
  for (const table of ['generation_accounts','credit_ledger','credit_purchases','creator_withdrawals','creator_earnings_ledger','generation_jobs']) {
    const r = await db.from(table).select('*'); assert.ok(!r.error);
    records.push([table, r.data.map(row => JSON.stringify(row)).sort()]);
  }
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
const before = await protectedHash();
await deployedBrowser(origin, identities.map(u => u.clerk_user_id), async ({ call, evaluate, wait, navigate, signIn, dir, errors, exceptions, onProtocolEvent }) => {
  const requests = [];
  await call('Network.enable');
  onProtocolEvent('Network.requestWillBeSent', e => requests.push({ url: e.request.url, method: e.request.method }));
  const visible = selector => `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height)`;
  const click = async selector => { await wait(`!!(${visible(selector)})`); await evaluate(`${visible(selector)}.click()`); await delay(250); };
  const key = async key => { await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key }); await delay(150); };
  const viewport = async width => { await call('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 }); await delay(150); };
  const route = async url => { await call('Page.navigate', { url: origin + url }); };
  try {
    await viewport(1440);
    await navigate('/studio');
    await wait('!!document.querySelector("textarea")&&!!window.Clerk?.loaded');
    check('guest Studio stays public', await evaluate('!window.Clerk.user&&!!document.querySelector("[data-workspace-shell]")'));
    await navigate('/marketplace'); await wait('!!document.querySelector("#marketplace-search")');
    check('guest Marketplace search preserved', true);
    await navigate('/documentation'); await wait('document.querySelectorAll("article h2").length===3');
    check('Documentation stays publicly readable in the shared workspace', await evaluate('!window.Clerk?.user&&!!document.querySelector("[data-workspace-shell]")'));
    await route('/dashboard/templates'); await wait('location.pathname==="/"');
    check('anonymous Templates denied by server', true);
    await route('/dashboard/projects'); await wait('location.pathname==="/"');
    check('anonymous Projects denied by server', true);
    await signIn(0);
    await route('/dashboard'); await wait('location.pathname==="/studio"&&!!document.querySelector("textarea")');
    check('Dashboard redirects to Studio', true);
    check('Studio is active with no Dashboard navigation', await evaluate('document.querySelector("aside nav a[aria-current=page]").textContent==="Studio"&&!Array.from(document.querySelectorAll("aside nav a")).some(a=>a.textContent==="Dashboard")'));
    await route('/dashboard#projects'); await wait('location.pathname==="/dashboard/projects"&&!!document.querySelector("#projects")');
    check('legacy Projects hash remains usable', true);
    await route('/dashboard?page=2#projects'); await wait('location.pathname==="/dashboard/projects"&&location.search==="?page=2"');
    check('legacy project page retained', true);
    await route('/dashboard#templates'); await wait('location.pathname==="/dashboard/templates"');
    check('legacy Templates bookmark opens the migrated gallery', true);
    await route('/dashboard#credits'); await wait('location.pathname==="/dashboard/settings/credits"');
    check('legacy Credits bookmark opens Settings billing', true);
    await navigate('/studio'); await wait('!!document.querySelector("textarea")');
    const expanded = await evaluate('document.querySelector("#workspace-content").getBoundingClientRect().width');
    await click('button[aria-label="Collapse sidebar"]');
    check('collapsed rail gains content width and saves preference', await evaluate(`document.querySelector('[data-workspace-shell]').dataset.collapsed==='true'&&document.querySelector('#workspace-content').getBoundingClientRect().width>${expanded}+100&&localStorage.getItem('sceenyk-workspace-collapsed')==='true'`));
    await call('Page.reload'); await wait(`!!document.querySelector('button[aria-label="Expand sidebar"]')`);
    check('collapse survives reload', true);
    await evaluate('document.querySelector("aside nav a").focus()'); await key('Tab');
    await wait('!!document.querySelector("[role=tooltip]")');
    check('collapsed labels available to keyboard users', await evaluate('document.activeElement.getAttribute("aria-label")==="Projects"&&document.querySelector("[role=tooltip]").textContent==="Projects"'));
    await wait('!!document.querySelector("textarea")');
    const rail = await call('Page.captureScreenshot', { format: 'png', fromSurface: true }); fs.writeFileSync(path.join(dir,'collapsed-rail.png'),Buffer.from(rail.data,'base64'));
    await key('Escape');
    await click('button[aria-label="Expand sidebar"]');
    await evaluate('Storage.prototype.setItem=function(){throw Error("blocked")};');
    await click('button[aria-label="Collapse sidebar"]');
    check('collapse works with unwritable storage', await evaluate('document.querySelector("[data-workspace-shell]").dataset.collapsed==="true"'));
    await call('Page.reload'); await wait('!!document.querySelector("textarea")');
    await click('button[aria-label="Open account menu"]'); await wait('!!document.querySelector("[role=menu]")');
    check('profile menu reuses Settings destinations', await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).some(a=>a.getAttribute("href")==="/dashboard/settings/earnings")'));
    await key('Escape');
    check('menu returns focus', await evaluate('document.activeElement.getAttribute("aria-label")==="Open account menu"'));
    await click('aside nav a[href="/dashboard/settings/credits"]'); await wait('location.pathname==="/dashboard/settings/credits"&&document.body.innerText.includes("Credits & Billing")');
    check('Credits opens existing Settings billing', true);

    for (const [slug, url] of [['studio','/studio'],['projects','/dashboard/projects'],['marketplace','/marketplace'],['settings','/dashboard/settings/appearance'],['templates','/dashboard/templates'],['documentation','/documentation']]) {
      await navigate(url); await wait('!!document.querySelector("[data-workspace-shell]")'); await delay(600);
      await wait(slug==='studio'?'!!document.querySelector("textarea")':slug==='projects'?'!!document.querySelector("#projects")':slug==='marketplace'?'!!document.querySelector("#marketplace-search")':slug==='settings'?'!!document.querySelector("input[name=appearance]")':slug==='templates'?'!!document.querySelector("#templates")':'document.querySelectorAll("article h2").length===3');
      for (const width of [1600,1440,1024,768,390,320]) for (const dark of [false,true]) {
        await viewport(width); await evaluate(`localStorage.setItem('sceenyk-theme',${JSON.stringify(dark?'dark':'light')});window.dispatchEvent(new Event('sceenyk-theme-change'))`);
        await wait(`document.documentElement.classList.contains('dark')===${dark}`);
        await delay(250); // Capture the final token colors after control transitions.
        check(`${slug} fits ${width} ${dark?'dark':'light'}`, await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
        if(slug==='templates')check(`template titles and badges stay within cards ${width} ${dark}`,await evaluate(`Array.from(document.querySelectorAll('#templates article h2,#templates article h2+span')).every(e=>{const outer=e.closest('article').getBoundingClientRect(),inner=e.getBoundingClientRect();return inner.left>=outer.left&&inner.right<=outer.right+1})`));
        check(`${slug} navigation adapts ${width} ${dark}`, await evaluate(width >= 1024 ? 'getComputedStyle(document.querySelector("aside")).display!=="none"' : `getComputedStyle(document.querySelector('aside')).display==='none'&&!!document.querySelector('button[aria-label="Open workspace navigation"]')`));
        if ([1440,390].includes(width)) { const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true }); fs.writeFileSync(path.join(dir,`${slug}-${width}-${dark?'dark':'light'}.png`),Buffer.from(shot.data,'base64')); }
      }
    }
    await viewport(1600); await navigate('/documentation'); await wait('document.querySelectorAll("article h2").length===3');
    check('desktop docs have topic navigation and secondary contents links', await evaluate(`getComputedStyle(document.querySelector('nav[aria-label="Documentation topics"]')).display!=='none'&&getComputedStyle(document.querySelector('nav[aria-label="On this page"]')).display!=='none'`));
    for(const dark of [false,true]){
      await evaluate(`localStorage.setItem('sceenyk-theme',${JSON.stringify(dark?'dark':'light')});window.dispatchEvent(new Event('sceenyk-theme-change'))`);await delay(300);
      const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(dir,`documentation-1600-${dark?'dark':'light'}.png`),Buffer.from(shot.data,'base64'));
    }
    check('Templates and Documentation no longer show Soon', await evaluate(`!document.querySelector('aside[aria-label="Workspace sidebar"]').textContent.includes('Soon')`));
    const topicUrls = await evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Documentation topics"] a')).map(a=>a.getAttribute('href'))`);
    for(const url of topicUrls){
      await navigate(url); await wait('document.querySelectorAll("article h2").length===3');
      const expectedTopic=documentationTopics.find(topic=>topic.slug===(url.split('/')[2]||'getting-started'));
      await wait(`document.querySelector('article')?.getAttribute('aria-label')===${JSON.stringify(expectedTopic.label)}`);
      const anchors=await evaluate(`Array.from(document.querySelectorAll('nav[aria-label="On this page"] a')).map(a=>a.getAttribute('href'))`);
      for(const href of anchors){await click(`nav[aria-label="On this page"] a[href="${href}"]`);await wait(`location.hash===${JSON.stringify(href)}`);check('docs anchor resolves '+url+href,await evaluate(`!!document.getElementById(${JSON.stringify(href.slice(1))})&&document.activeElement.id===${JSON.stringify(href.slice(1))}`));}
    }
    await viewport(390); await navigate('/documentation'); await wait('!document.querySelector("#documentation-topic").disabled');
    await evaluate(`const picker=document.querySelector('#documentation-topic');picker.value='/documentation/credits';picker.dispatchEvent(new Event('change',{bubbles:true}))`);
    await wait('location.pathname==="/documentation/credits"&&document.querySelector("h1").textContent==="Credits & Billing"');
    check('mobile docs picker navigates without desktop columns',await evaluate(`getComputedStyle(document.querySelector('nav[aria-label="Documentation topics"]')).display==='none'&&getComputedStyle(document.querySelector('nav[aria-label="On this page"]')).display==='none'`));
    await route('/documentation/unknown-topic'); await wait('document.body.innerText.includes("Topic not found")'); check('unknown docs topic has safe recovery',true);
    for(const url of ['/dashboard/marketplace','/dashboard/marketplace/new','/dashboard/marketplace/purchases']){
      await navigate(url); await wait('!!document.querySelector("h1")');
      for(const width of [1440,390]){await viewport(width);check('creator page shares workspace and fits '+url+width,await evaluate('!!document.querySelector("[data-workspace-shell]")&&document.documentElement.scrollWidth<=innerWidth+1'));}
    }
    await route('/admin/payouts');await wait('document.body.innerText.includes("404")||document.body.innerText.includes("could not be found")');
    check('ordinary user still denied internal support',await evaluate('!document.querySelector("#payout-search")'));
    await navigate('/dashboard/templates');await wait('!!document.querySelector("#templates")');
    check('Templates uses its own active navigation destination',await evaluate(`document.querySelector('aside nav a[aria-current=page]').textContent==='Templates'`));
    check('no invented owned-template filters',await evaluate(`!document.querySelector('#workspace-content input[type=search],#workspace-content select')`));
    await viewport(390);
    await click('button[aria-label="Open workspace navigation"]'); await wait('!!document.querySelector("[role=dialog]")');
    check('mobile drawer has seven entries and account control', await evaluate(`document.querySelectorAll('[role=dialog] nav li').length===7&&!!document.querySelector('[role=dialog] button[aria-label="Open account menu"]')`));
    await delay(500);
    check('drawer receives focus', await evaluate('!!document.activeElement.closest("[role=dialog]")'));
    for (let i=0;i<12;i++) await key('Tab');
    check('drawer contains keyboard focus', await evaluate('!!document.activeElement.closest("[role=dialog]")'));
    await click('[role=dialog] button[aria-label="Open account menu"]'); await wait('!!document.querySelector("[role=menu]")');
    await click('[role=menuitem][href="/dashboard/settings/creator-profile"]'); await wait('location.pathname==="/dashboard/settings/creator-profile"&&!document.querySelector("[role=dialog]")');
    check('mobile account menu navigates and closes drawer', true);
    await click('button[aria-label="Open workspace navigation"]'); await key('Escape'); await wait('!document.querySelector("[role=dialog]")');
    check('Escape returns focus to hamburger', await evaluate('document.activeElement.getAttribute("aria-label")==="Open workspace navigation"'));
    await click('button[aria-label="Open workspace navigation"]'); await viewport(1440); await wait('!document.querySelector("[role=dialog]")');
    check('drawer closes when crossing desktop breakpoint', true);
    // A project known to belong to A must never render for B.
    const owned = await db.from('projects').select('id,title').eq('owner_user_id',identities[0].id).limit(1); assert.ok(!owned.error&&owned.data.length);
    await navigate('/projects/'+owned.data[0].id); await wait('!!document.querySelector("textarea")');
    check('A resumes owned project inside Studio shell', await evaluate(`document.querySelector('input[name=title]').value===${JSON.stringify(owned.data[0].title)}&&document.querySelector('aside nav a[aria-current=page]').textContent==='Studio'`));
    await signIn(1); await navigate('/dashboard/projects'); await wait('!!document.querySelector("#projects")');
    check('B project list excludes A project', await evaluate(`!Array.from(document.querySelectorAll('a')).some(a=>a.getAttribute('href')===${JSON.stringify('/projects/'+owned.data[0].id)})`));
    const aListings=await db.rpc('marketplace_owned',{p_owner_user_id:identities[0].id,p_page:1});assert.ok(!aListings.error);
    await navigate('/dashboard/templates');await wait('!!document.querySelector("#templates")');
    const foreignIds=(Array.isArray(aListings.data)?aListings.data:aListings.data?.items??[]).map(item=>item.id).filter(Boolean);
    assert.ok(foreignIds.length,'OWNED_TEMPLATE_FIXTURE_REQUIRED');
    check('B Templates gallery excludes A listing links',await evaluate(`!Array.from(document.querySelectorAll('#templates a')).some(a=>${JSON.stringify(foreignIds)}.some(id=>a.getAttribute('href')?.includes(id)))`));
    await navigate('/dashboard/marketplace/'+foreignIds[0]);await wait('document.body.innerText.includes("This listing is unavailable")');
    check('B cannot open A template management',true);
    await navigate('/projects/'+owned.data[0].id); await wait('document.body.innerText.includes("Project unavailable")');
    check('B cannot open A project', true);
    check('protected generation and financial records unchanged', before === await protectedHash());
    await navigate('/studio'); await wait(`!!document.querySelector('button[aria-label="Open account menu"]')`);
    await click('button[aria-label="Open account menu"]'); await wait('!!document.querySelector("[role=menu]")');
    await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).find(e=>e.textContent==="Sign out").click()');
    await wait('location.pathname==="/"&&!window.Clerk?.user');
    check('profile sign out uses Clerk and returns home', true);
    check('no hosted Inngest or provider requests', !requests.some(r=>/inngest\.(com|net)|fal\.(ai|run)|api\.elevenlabs|generativelanguage/.test(r.url)));
    check('no browser exceptions', errors.length===0);
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({checks,exceptions,hostedInngestTriggered:false},null,2));
    console.log(JSON.stringify({passed:checks.length,evidence:dir,scope:'Local production, real reserved Clerk users/owned reads; no generation or financial mutations'}));
  } catch (error) {
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({checks,exceptions,failure:error.message},null,2));
    console.log(JSON.stringify({passed:checks.length,evidence:dir,failure:error.message,exceptions})); throw error;
  }
});
