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
const users = await db.from('app_users').select('id,clerk_user_id,email');
assert.ok(!users.error);
const identities = users.data.filter(u => u.email?.includes('+clerk_test@')).slice(0, 2);
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
  const click = async selector => { await evaluate(`${visible(selector)}.click()`); await delay(250); };
  const key = async key => { await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key }); await delay(150); };
  const viewport = async width => { await call('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 }); await delay(150); };
  const route = async url => { await call('Page.navigate', { url: origin + url }); };
  try {
    await viewport(1440);
    await navigate('/create');
    await wait('!!document.querySelector("textarea")&&!!window.Clerk?.loaded');
    check('guest Studio stays public', await evaluate('!window.Clerk.user&&!!document.querySelector("[data-workspace-shell]")'));
    await navigate('/marketplace'); await wait('!!document.querySelector("#marketplace-search")');
    check('guest Marketplace search preserved', true);
    await route('/dashboard/projects'); await wait('location.pathname==="/"');
    check('anonymous Projects denied by server', true);
    await signIn(0);
    await route('/dashboard'); await wait('location.pathname==="/create"&&!!document.querySelector("textarea")');
    check('Dashboard redirects to Studio', true);
    check('Studio is active with no Dashboard navigation', await evaluate('document.querySelector("aside nav a[aria-current=page]").textContent==="Studio"&&!Array.from(document.querySelectorAll("aside nav a")).some(a=>a.textContent==="Dashboard")'));
    await route('/dashboard#projects'); await wait('location.pathname==="/dashboard/projects"&&!!document.querySelector("#projects")');
    check('legacy Projects hash remains usable', true);
    await route('/dashboard?page=2#projects'); await wait('location.pathname==="/dashboard/projects"&&location.search==="?page=2"');
    check('legacy project page retained', true);
    await route('/dashboard#templates'); await wait('location.pathname==="/dashboard/projects"&&location.hash==="#templates"');
    check('legacy Templates placeholder retained', true);
    await route('/dashboard#credits'); await wait('location.pathname==="/dashboard/settings/credits"');
    check('legacy Credits bookmark opens Settings billing', true);
    await navigate('/create'); await wait('!!document.querySelector("textarea")');
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

    for (const [slug, url] of [['studio','/create'],['projects','/dashboard/projects'],['marketplace','/marketplace'],['settings','/dashboard/settings/appearance']]) {
      await navigate(url); await wait('!!document.querySelector("[data-workspace-shell]")'); await delay(600);
      await wait(slug==='studio'?'!!document.querySelector("textarea")':slug==='projects'?'!!document.querySelector("#projects")':slug==='marketplace'?'!!document.querySelector("#marketplace-search")':'!!document.querySelector("input[name=appearance]")');
      for (const width of [1440,1024,768,390,320]) for (const dark of [false,true]) {
        await viewport(width); await evaluate(`localStorage.setItem('sceenyk-theme',${JSON.stringify(dark?'dark':'light')});window.dispatchEvent(new Event('sceenyk-theme-change'))`);
        await wait(`document.documentElement.classList.contains('dark')===${dark}`);
        await delay(250); // Capture the final token colors after control transitions.
        check(`${slug} fits ${width} ${dark?'dark':'light'}`, await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
        check(`${slug} navigation adapts ${width} ${dark}`, await evaluate(width >= 1024 ? 'getComputedStyle(document.querySelector("aside")).display!=="none"' : `getComputedStyle(document.querySelector('aside')).display==='none'&&!!document.querySelector('button[aria-label="Open workspace navigation"]')`));
        if ([1440,390].includes(width)) { const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true }); fs.writeFileSync(path.join(dir,`${slug}-${width}-${dark?'dark':'light'}.png`),Buffer.from(shot.data,'base64')); }
      }
    }
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
    await navigate('/projects/'+owned.data[0].id); await wait('document.body.innerText.includes("Project unavailable")');
    check('B cannot open A project', true);
    check('protected generation and financial records unchanged', before === await protectedHash());
    await navigate('/create'); await wait(`!!document.querySelector('button[aria-label="Open account menu"]')`);
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
