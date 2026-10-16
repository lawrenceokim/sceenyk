// Built local app + real reserved Clerk identities/hosted Supabase.
// Never creates a generation, payment, withdrawal, payout or Inngest event.
// May replay the already completed, authorized Settings acceptance purchase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import nextEnv from '@next/env';
import { createClerkClient } from '@clerk/backend';
import { typescriptLoader } from './lib/load-typescript.mjs';
import { deployedBrowser } from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const origin = process.argv.find(value => /^https?:/.test(value)) ?? 'http://localhost:3017';
assert.ok(['http://localhost:3017','https://sceenyk.vercel.app'].includes(origin), 'EXPLICIT_ACCEPTANCE_ORIGIN');
const deployed = origin === 'https://sceenyk.vercel.app';
const financialOnly = process.argv.includes('--financial-only');
const httpOnly = process.argv.includes('--http-only');
const quoteOnly = process.argv.includes('--quote-only');
const browserOnly = process.argv.includes('--browser-only');
assert.ok(Number(financialOnly)+Number(httpOnly)+Number(quoteOnly)+Number(browserOnly)<=1,'ONE_ACCEPTANCE_MODE');
const db = typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const users = await db.from('app_users').select('id,clerk_user_id,email').order('id').limit(100);
assert.ok(!users.error);
const roles = await db.from('internal_user_roles').select('user_id,role'); assert.ok(!roles.error);
const identities = users.data.filter(u => u.email?.includes('+clerk_test@') && !roles.data.some(r => r.user_id === u.id && r.role !== 'user')).slice(0, 2);
assert.equal(identities.length, 2, 'RESERVED_IDENTITIES_REQUIRED');
const [a, b] = identities;
for (const u of identities) {
  const result = await db.rpc('creation_preferences_read', { p_owner: u.id });
  assert.ok(!result.error, 'APPLY_MIGRATION_028_FIRST');
}
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, telemetry: { disabled: true } });
assert.equal((await clerk.instance.get()).environmentType, 'development');
const sessions = new Set(), checks = [], screenshots = [], cacheFailures = [];
const evidenceFile = path.join(os.tmpdir(), quoteOnly ? `sceenyk-settings-quote-${deployed ? 'deployed-' : ''}acceptance.json` : financialOnly ? `sceenyk-settings-financial-${deployed ? 'deployed-' : ''}acceptance.json` : `sceenyk-settings-${httpOnly ? 'http-' : browserOnly ? 'browser-' : ''}${deployed ? 'deployed-' : ''}acceptance.json`);
const save = () => fs.writeFileSync(evidenceFile, JSON.stringify({ checks, screenshots, cacheFailures, hostedInngestTriggered: false }, null, 2));
const check = (name, value) => { assert.ok(value, name); checks.push(name); save(); console.log(JSON.stringify({ passed: name })); };
const sections = ['account', 'creator-profile', 'credits', 'earnings', 'creation', 'notifications', 'appearance', 'privacy', 'data'];
async function protectedHash() {
  const records = [];
  for (const table of ['generation_accounts','credit_ledger','credit_purchases','creator_withdrawals','creator_earnings_ledger','generation_jobs','internal_user_roles']) {
    const result = await db.from(table).select('*'); assert.ok(!result.error, 'PROTECTED_READ');
    records.push([table, result.data.map(row => JSON.stringify(row)).sort()]);
  }
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
const before = await protectedHash();
async function verifyPrivateResponses(phase = '') {
  for (let i = 0; i < 3; i++) {
    const identity = identities[i];
    const session = identity ? await clerk.sessions.createSession({ userId: identity.clerk_user_id }) : null;
    if (session) sessions.add(session.id);
    for (const section of sections) for (const rsc of (deployed ? [false, true, '.rsc', '.prefetch.rsc', '.segments/_full.segment.rsc'] : [false, true])) {
      const token = session ? (await clerk.sessions.getToken(session.id, undefined, 60)).jwt : null;
      const headers = { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(rsc ? { RSC: '1' } : {}) };
      let url = new URL('/dashboard/settings/' + section + (typeof rsc === 'string' ? rsc : ''), origin), response;
      for (let retry = 0; retry < 4; retry++) {
        response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(60000) });
        if (![307,308].includes(response.status)) break;
        const target = new URL(response.headers.get('location'), url);
        if (target.origin !== origin || target.pathname !== url.pathname) break;
        assert.ok(response.headers.get('cache-control')?.includes('no-store'), 'PRIVATE_NORMALIZATION_REDIRECT');
        await response.body?.cancel(); url = target;
      }
      const body = await response.text();
      if (response.status !== 200 && identity && rsc !== '.prefetch.rsc') console.log(JSON.stringify({diagnostic:{section,variant:rsc,status:response.status,cache:response.headers.get('cache-control'),cdn:response.headers.get('cdn-cache-control')}}));
      const name=phase+(identity ? i===0?'A':'B':'anonymous')+' private '+section+(typeof rsc==='string'?' '+rsc:rsc?' RSC':' HTML');
      const statusOk=identity ? response.status===200 || (rsc==='.prefetch.rsc'&&response.status===404) : [302,307,308,401,403].includes(response.status);
      const isolated=identity ? !body.includes(identities[1-i].clerk_user_id) : identities.every(u=>!body.includes(u.clerk_user_id));
      const cache=response.headers.get('cache-control')??'', cdn=response.headers.get('cdn-cache-control');
      const privateCache=cache.includes('private')&&cache.includes('no-store')&&!/s-maxage|public/.test(cache)&&cdn==='no-store';
      if(statusOk&&isolated&&privateCache)check(name,true);
      else {const failure={name,status:response.status,statusOk,isolated,cache,cdn};cacheFailures.push(failure);save();console.error(JSON.stringify({failed:failure}));}

    }
  }
}
try {
  if (!financialOnly && !quoteOnly && !browserOnly) await verifyPrivateResponses();
  if (!httpOnly) await deployedBrowser(origin, { A: a.clerk_user_id, B: b.clerk_user_id }, async browser => {
    const { call, evaluate, wait, navigate, signIn, discover, invoke, errors } = browser;
    await signIn('A'); sessions.add(await evaluate('window.Clerk.session.id'));
    if (quoteOnly) {
      const projects = await db.from('projects').select('*').eq('owner_user_id',a.id).order('id').limit(1); assert.ok(!projects.error && projects.data.length);
      const project = projects.data[0];
      const jobsBefore = await db.from('generation_jobs').select('id'); assert.ok(!jobsBefore.error);
      const balanceBefore = await db.from('generation_accounts').select('*').eq('owner_user_id',a.id).single(); assert.ok(!balanceBefore.error);
      await navigate('/projects/'+project.id); await wait('!!document.querySelector("textarea")'); await discover();
      const input = {projectId:project.id,requestId:randomUUID(),inputs:{prompt:'Settings acceptance quote only. No generation is submitted.',category:project.category,settings:{duration:'10',aspectRatio:project.aspect_ratio,visualStyle:project.visual_style,tone:project.tone},assetIds:[]}};
      const quote = await invoke('quoteGenerationAction',input); assert.ok(quote.ok,'DEPLOYED_QUOTE_REQUIRED');
      const free = balanceBefore.data.free_total-balanceBefore.data.free_reserved-balanceBefore.data.free_consumed;
      check('deployed quote uses authoritative free allowance',quote.value.freeGenerationsRemaining===free&&quote.value.eligibleFreeGeneration===(free>0));
      check('deployed quote exposes no owner or provider records',!['owner_user_id','clerkUserId','snapshot','provider','apiKey'].some(key=>key in quote.value));
      const long = await invoke('quoteGenerationAction',{...input,requestId:randomUUID(),inputs:{...input.inputs,settings:{...input.inputs.settings,duration:'15'}}});assert.ok(long.ok);
      check('longer quote never uses the lifetime free allowance',long.value.eligibleFreeGeneration===false);
      check('deployed paid quote remains honest about pricing or insufficient balance',long.value.requiredCredits===null ? long.value.status==='pricing_unavailable' : long.value.status===(long.value.availableCredits<long.value.requiredCredits?'insufficient_credits':'ready'));
      check('browser-supplied credit price is rejected',(await invoke('quoteGenerationAction',{...input,requiredCredits:1})).ok===false);
      check('contextual generation balance and top-up remain available',await evaluate('document.body.innerText.includes("Paid credits:")&&document.body.innerText.includes("Top up credits")'));
      await signIn('B');sessions.add(await evaluate('window.Clerk.session.id'));await navigate('/create');await wait('!!document.querySelector("textarea")');await discover();
      const denied=await invoke('quoteGenerationAction',{...input,requestId:randomUUID()});check('B cannot quote A project',!denied.ok&&denied.code==='NOT_FOUND');
      const jobsAfter=await db.from('generation_jobs').select('id'),balanceAfter=await db.from('generation_accounts').select('*').eq('owner_user_id',a.id).single();assert.ok(!jobsAfter.error&&!balanceAfter.error);
      check('quote checks create no generation or held accounting',jobsAfter.data.length===jobsBefore.data.length&&['free_reserved','free_consumed','credit_reserved'].every(key=>balanceAfter.data[key]===balanceBefore.data[key]));
      const unchanged=await db.from('projects').select('*').eq('id',project.id).single();check('quote checks leave the existing project unchanged',!unchanged.error&&JSON.stringify(unchanged.data)===JSON.stringify(project));
      check('quote browser has no exceptions',errors.length===0);await browser.close();return;
    }
    if (financialOnly) {
      for (const [which, identity] of [['A',a],['B',b]]) {
      if(which==='B'){await signIn('B');sessions.add(await evaluate('window.Clerk.session.id'));}
      await navigate('/dashboard/settings/account');await wait('document.body.innerText.includes("Manage account")');
      check(which+' Account matches the active Clerk user',await evaluate('document.body.innerText.includes(window.Clerk.user.primaryEmailAddress.emailAddress)'));
      await navigate('/dashboard/settings/privacy');await wait('document.body.innerText.includes("Manage security")');
      check(which+' Privacy contains no internal role or provider diagnostics',await evaluate('!/internal_user_roles|service_role|PAYPAL_CLIENT_SECRET|RUNWAYML_API_SECRET|Payout support queue|Check PayPal Status/.test(document.body.innerText)'));
      const balance = await db.from('generation_accounts').select('*').eq('owner_user_id', identity.id).single(); assert.ok(!balance.error);
      await navigate('/dashboard/settings/credits');
      await wait('!!document.querySelector("#purchases-heading")&&!document.body.innerText.includes("Loading saved purchases…")&&!document.body.innerText.includes("Loading free allowance…")');
      check(which+' real paid balance matches server', await evaluate(`Array.from(document.querySelector('section[aria-label="Paid credit balance"]').querySelectorAll('p')).some(p=>p.textContent===${JSON.stringify(balance.data.credit_available.toLocaleString())})`));
      const free = balance.data.free_total - balance.data.free_reserved - balance.data.free_consumed;
      check(which+' real remaining free generations match server', await evaluate(`document.body.innerText.includes(${JSON.stringify(free === 0 ? 'No free generations remaining' : `${free} free generation${free === 1 ? '' : 's'} remaining`)})`));
      check(which+' real purchase and ledger histories load', await evaluate('!document.body.innerText.includes("Saved purchases are unavailable")&&!document.body.innerText.includes("Credit activity is unavailable")'));
      await discover(); const wallet = await invoke('creditWalletAction');
      check(which+' real wallet stays owned and authoritative', wallet.ok && wallet.data.available === balance.data.credit_available && wallet.data.reserved === balance.data.credit_reserved);
      const owned = await db.from('credit_purchases').select('paypal_order_id').eq('owner_user_id',identity.id).order('created_at',{ascending:false}).limit(20);assert.ok(!owned.error);
      check(which+' purchase history contains only owned purchases',wallet.data.purchases.length===owned.data.length&&wallet.data.purchases.every(p=>owned.data.some(row=>row.paypal_order_id===p.orderId)));
      for (const [width,dark] of (which==='A'?[[1440,false],[390,true]]:[])) {
        await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
        await evaluate(`localStorage.setItem('sceenyk-theme',${JSON.stringify(dark ? 'dark' : 'light')});window.dispatchEvent(new Event('sceenyk-theme-change'))`);
        check('loaded real credits fit ' + width, await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
        const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
        const file = path.join(os.tmpdir(), 'sceenyk-settings-loaded-credits-' + width + '.png'); fs.writeFileSync(file, Buffer.from(shot.data,'base64')); screenshots.push(file);
      }
      await navigate('/dashboard/settings/earnings'); await wait('!!document.querySelector("#payout-email")'); await discover();
      const withdrawal = await invoke('withdrawalAccountAction', 1); assert.ok(withdrawal.ok && withdrawal.data.clerkUserId === identity.clerk_user_id);
      check(which+' deployed withdrawal minimum and hold messaging remain unchanged',await evaluate('document.body.innerText.includes("Minimum withdrawal: $5 USD")&&document.body.innerText.includes("Withdrawals are held for 7 days before payout.")'));
      check(which+' real payout destination matches private owned state', await evaluate(`document.querySelector('#payout-email').value===${JSON.stringify(withdrawal.data.account.email ?? '')}`));
      const usd = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
      check(which+' real earnings and pending payout match server', await evaluate(`Array.from(document.querySelectorAll('section[aria-label="Creator withdrawals"] .sceenyk-card')).some(c=>c.innerText.includes('Available Earnings')&&c.innerText.includes(${JSON.stringify(usd(withdrawal.data.account.available))}))&&Array.from(document.querySelectorAll('section[aria-label="Creator withdrawals"] .sceenyk-card')).some(c=>c.innerText.includes('Pending Payout')&&c.innerText.includes(${JSON.stringify(usd(withdrawal.data.account.pending))}))`));
      }
      check('financial browser has no exceptions', errors.length === 0);
      await browser.close(); return;
    }
    await navigate('/dashboard/settings/account'); await wait('document.body.innerText.includes("Manage account")');
    check('real account name/email load', await evaluate('document.body.innerText.includes(window.Clerk.user.primaryEmailAddress.emailAddress)'));
    check('Clerk self deletion disabled server-side', !(await clerk.users.getUser(a.clerk_user_id)).deleteSelfEnabled);
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.innerText==="Manage account").click()');
    await wait('!!document.querySelector(".cl-modalContent")');
    check('Clerk account modal opens without delete shortcut', await evaluate('!document.querySelector(".cl-modalContent").innerText.includes("Delete account")'));
    await navigate('/dashboard/settings/appearance'); await wait('!!document.querySelector("input[name=appearance]")&&!document.querySelector("input[name=appearance]").matches(":disabled")');
    await evaluate('document.querySelector("input[value=dark]").click()');
    await wait('localStorage.getItem("sceenyk-theme")==="dark"&&document.documentElement.classList.contains("dark")');
    await navigate('/dashboard/settings/appearance'); await wait('document.querySelector("input[value=dark]")?.checked===true');
    check('real theme persists across reload', await evaluate('document.documentElement.classList.contains("dark")'));
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await evaluate('document.querySelector("input[value=system]").click()'); await wait('!document.documentElement.classList.contains("dark")');
    check('real system theme selection applies', await evaluate('localStorage.getItem("sceenyk-theme")===null'));
    for (const section of sections) {
      await navigate('/dashboard/settings/' + section); await wait('!!document.querySelector("#settings-section")');
      if (section === 'credits') await wait('!!document.querySelector("#purchases-heading")&&!document.body.innerText.includes("Loading saved purchases…")&&!document.body.innerText.includes("Loading free allowance…")');
      for (const width of [1440,768,390,320]) for (const dark of [false,true]) {
        await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
        await evaluate(`localStorage.setItem('sceenyk-theme',${JSON.stringify(dark ? 'dark' : 'light')});window.dispatchEvent(new Event('sceenyk-theme-change'))`);
        check('real ' + section + ' fits ' + width + ' ' + (dark ? 'dark' : 'light'), await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      }
      if (['appearance','credits'].includes(section)) {
        const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
        const file = path.join(os.tmpdir(), 'sceenyk-settings-real-' + section + '.png'); fs.writeFileSync(file, Buffer.from(shot.data, 'base64')); screenshots.push(file);
      }
    }
    await wait('!!document.querySelector("#settings-section")&&!document.querySelector("#settings-section").disabled');
    await evaluate('document.querySelector("#settings-section").value="/dashboard/settings/creation";document.querySelector("#settings-section").dispatchEvent(new Event("change",{bubbles:true}))');
    await wait('location.pathname==="/dashboard/settings/creation"&&!!document.querySelector("#default-aspect")');
    check('real mobile section picker navigates', await evaluate('document.querySelector("#settings-section").value==="/dashboard/settings/creation"'));
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate('Array.from(document.querySelectorAll("nav a")).find(a=>a.getAttribute("href")==="/dashboard/settings/appearance").click()');
    await wait('location.pathname==="/dashboard/settings/appearance"&&!!document.querySelector("input[name=appearance]")');check('real desktop section links navigate',true);
    await call('Emulation.setDeviceMetricsOverride',{width:768,height:1000,deviceScaleFactor:1,mobile:false});
    await wait('!!document.querySelector("#settings-section")&&!document.querySelector("#settings-section").disabled');
    await evaluate('document.querySelector("#settings-section").value="/dashboard/settings/creation";document.querySelector("#settings-section").dispatchEvent(new Event("change",{bubbles:true}))');
    await wait('location.pathname==="/dashboard/settings/creation"&&!!document.querySelector("#default-aspect")');check('real tablet section picker navigates',true);
    await navigate('/dashboard/settings/creation'); await wait('!!document.querySelector("#default-aspect")'); await discover();
    const saved = await invoke('saveCreationPreferencesAction', { aspectRatio: '9:16', category: 'social' });
    check('real preferences save', saved.ok && saved.data.clerkUserId === a.clerk_user_id);
    await navigate('/dashboard/settings/creation'); await wait('document.querySelector("#default-aspect")?.value==="9:16"');
    check('real preferences reload', await evaluate('document.querySelector("#default-category").value==="social"'));
    await navigate('/create'); await wait('!!document.querySelector("textarea")');
    check('real new project initializes defaults', await evaluate('Array.from(document.querySelectorAll("select")).some(s=>s.value==="9:16")&&document.querySelector("input[value=social]").checked'));
    const project = await db.from('projects').select('id,aspect_ratio,category').eq('owner_user_id', a.id).order('id').limit(1); assert.ok(!project.error && project.data.length);
    await navigate('/projects/' + project.data[0].id); await wait('!!document.querySelector("textarea")');
    check('real existing project retains stored settings', await evaluate(`Array.from(document.querySelectorAll('select')).some(s=>s.value===${JSON.stringify(project.data[0].aspect_ratio)})&&document.querySelector('input[value=${project.data[0].category}]').checked`));
    await call('Page.navigate', { url: origin + '/dashboard/credits?checkout=cancel&token=invalid-bookmark&PayerID=fixture' });
    await wait('location.pathname==="/dashboard/settings/credits"');
    check('legacy checkout bookmark preserves query', await evaluate('location.search.includes("checkout=cancel")&&location.search.includes("token=invalid-bookmark")'));
    await call('Page.navigate', { url: origin + '/dashboard/marketplace/earnings?page=2' }); await wait('location.pathname==="/dashboard/settings/earnings"&&location.search==="?page=2"'); check('legacy earnings preserves page', true);
    await call('Page.navigate', { url: origin + '/dashboard/marketplace/profile' }); await wait('location.pathname==="/dashboard/settings/creator-profile"'); check('legacy profile forwards to single editor', true);
    for (const entry of ['/settings','/dashboard/settings']) { await call('Page.navigate', { url: origin + entry }); await wait('location.pathname==="/dashboard/settings/account"'); check(entry + ' entry opens Account', true); }
    const topupFile=path.join(os.tmpdir(),'sceenyk-settings-topup-deployed.json');
    if(deployed&&fs.existsSync(topupFile)){
      const settled=JSON.parse(fs.readFileSync(topupFile,'utf8'));assert.equal(settled.owner,a.id);assert.ok(settled.verifiedAt);
      const paid=await db.from('credit_purchases').select('status').eq('owner_user_id',a.id).eq('paypal_order_id',settled.orderId).single();assert.ok(!paid.error&&paid.data.status==='completed');
      await navigate('/dashboard/settings/credits');await wait('!!document.querySelector("#purchases-heading")');await discover();
      const completed=await invoke('completeCreditOrderAction',{orderId:settled.orderId});
      check('settled payment replay revalidates Credits without extra grants',completed.ok&&completed.data.status==='completed'&&(await invoke('creditWalletAction')).data.available===settled.available);
    }
    await signIn('B'); sessions.add(await evaluate('window.Clerk.session.id'));
    await navigate('/dashboard/settings/creation'); await wait('!!document.querySelector("#default-aspect")'); await discover();
    const rejected = await invoke('saveCreationPreferencesAction', { aspectRatio: '1:1', category: 'gaming', ownerUserId: a.id });
    check('real B cannot forge A preference owner', !rejected.ok);
    const own = await invoke('saveCreationPreferencesAction', { aspectRatio: '1:1', category: 'gaming' });
    check('real B saves only B preferences', own.ok && own.data.clerkUserId === b.clerk_user_id);
    const ownerRead = await db.rpc('creation_preferences_read', { p_owner: a.id });
    check('real A preferences survive B saves', !ownerRead.error && ownerRead.data.aspectRatio === '9:16' && ownerRead.data.category === 'social');
    check('real navigation has no navbar theme toggle or persistent balance', await evaluate('!document.querySelector("header button[aria-label=\\"Toggle light and dark theme\\"]")&&!document.querySelector("header [aria-label^=\\"Paid credits\\"]")'));
    await call('Page.navigate', { url: origin + '/admin/payouts' }); await wait('location.pathname==="/admin/payouts"&&document.readyState!=="loading"');
    check('normal B cannot see payout support', await evaluate('!document.body.innerText.includes("Check PayPal Status")&&!document.body.innerText.includes("Payout support queue")'));
    check('real browser has no exceptions', errors.length === 0);
    await browser.close();
  });
  // Vercel's Function response can differ from the original prerender after
  // successful preference/payment actions. Enforce the same private policy.
  if(deployed&&!financialOnly&&!quoteOnly&&!browserOnly&&!httpOnly)await verifyPrivateResponses('after revalidation ');
  if (deployed) {
    let home;
    for (let i=0;i<2;i++) {
      home=await fetch(origin+'/',{signal:AbortSignal.timeout(30000)});
      const cache=home.headers.get('cache-control')??'', cdn=home.headers.get('x-vercel-cache');
      check('public home retains shared caching '+(i+1),home.status===200 && (cache.includes('s-maxage') || ['HIT','STALE'].includes(cdn) || (i===0 && cache.includes('public') && !cache.includes('no-store'))));
      if(i===0)await home.body?.cancel();
    }
    const html=await home.text();const src=Array.from(html.matchAll(/src="([^"<>]+\.js(?:\?[^"<>]*)?)"/g)).map(m=>m[1]).find(u=>u.startsWith('/_next/static/'));
    assert.ok(src,'PUBLIC_STATIC_SCRIPT_REQUIRED');const asset=await fetch(new URL(src,origin),{signal:AbortSignal.timeout(30000)});await asset.body?.cancel();
    check('hashed public JavaScript retains immutable caching',asset.status===200&&asset.headers.get('cache-control')?.includes('immutable'));
  }
  if (!quoteOnly) check('protected financial/generation/role records unchanged', await protectedHash() === before);
  assert.equal(cacheFailures.length,0,'DEPLOYED_PRIVATE_CACHE_OR_ISOLATION_FAILED');
  save(); console.log(JSON.stringify({ passed: checks.length, evidenceFile, screenshots: screenshots.length, hostedInngestTriggered: false }));
} finally {
  for (const id of sessions) {
    try { if ((await clerk.sessions.getSession(id)).status === 'active') await clerk.sessions.revokeSession(id); }
    catch (error) { if (error.status !== 404) throw error; }
  }
}
