// Real Clerk/hosted data/Sandbox acceptance for the credit UX. No generation
// confirmation, AI call, render, direct balance write or fake payment approval.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import nextEnv from '@next/env';
import { typescriptLoader } from './lib/load-typescript.mjs';
import { deployedBrowser } from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const mode = process.argv[2] ?? 'ui';
const origin = process.env.SCEENYK_CREDIT_UX_ORIGIN ?? 'http://localhost:3000';
if (mode === 'serve') {
  // Process-local arbitrary test credit units, explicitly labeled by the app.
  // Never writes environment files or deployed pricing configuration.
  const workload = duration => ({ category: 'cinematic', duration, operation: 'new_generation', modelTier: 'unassigned', quality: 'workspace-default', features: [] });
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start'], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, SCEENYK_TEST_PRICING_JSON: JSON.stringify({ version: 'local-credit-ux-acceptance', rules: [{ workload: workload('15'), credits: 32 }, { workload: workload('30'), credits: 150 }] }) },
  });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const load = typescriptLoader();
  const db = load('lib/db/server.ts').createDatabaseClient();
  const paypal = load('lib/payments/paypal/client.ts');
  const prior = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sceenyk-paypal-sandbox-acceptance.json'), 'utf8'));
  const identities = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sceenyk-deployed-narration-acceptance.json'), 'utf8'));
  const file = path.join(os.tmpdir(), 'sceenyk-credit-ux-acceptance.json');
  let state;
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { state = { checks: [], origin }; }
  assert.equal(state.origin, origin);
  const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2));
  const check = (name, value) => { assert.ok(value, name); if (!state.checks.includes(name)) state.checks.push(name); save(); console.log(JSON.stringify({ passed: name })); };
  const one = async (table, key, value) => { const r = await db.from(table).select('*').eq(key, value).single(); assert.ok(!r.error && r.data, 'HOSTED_READ'); return r.data; };
  const userA = await one('app_users', 'clerk_user_id', identities.ownerClerkId);
  const account = () => one('generation_accounts', 'owner_user_id', userA.id);
  if (mode === 'verify') {
    const p = await one('credit_purchases','paypal_order_id',state.orderId);
    assert.ok(state.browserIndependentNewPurchase && p.status === 'completed', 'READ_ONLY_OBSERVE_MUST_PROVE_BROWSER_CLOSED_RECOVERY_BEFORE_VERIFY');
  }
  if (mode === 'observe') {
    assert.ok(state.orderId, 'BEGIN_FIRST');
    const p = await one('credit_purchases', 'paypal_order_id', state.orderId);
    const providerOrder = await paypal.readPayPalOrder(state.orderId);
    paypal.verifyOrder(p, providerOrder);
    if (p.status === 'completed' && providerOrder.status === 'COMPLETED') {
      state.browserIndependentNewPurchase = true;
      state.browserIndependentObservedAt = new Date().toISOString(); save();
    }
    console.log(JSON.stringify({ status: p.status, sandboxOrderStatus:providerOrder.status, credits: p.credits, available: (await account()).credit_available }));
  } else await deployedBrowser(origin, { A: identities.ownerClerkId, B: identities.secondClerkId }, async ({ signIn, navigate, wait, evaluate, call, discover, invoke, dir, errors }) => {
    const click = text => evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button||button.disabled)return false;button.click();return true;})()`);
    const setDuration = async duration => {
      await evaluate(`(()=>{const s=document.querySelector('select[name="duration"]');s.value=${JSON.stringify(duration)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await wait(`document.querySelector('select[name="duration"]').value===${JSON.stringify(duration)}`);
    };
    await signIn('A');
    if (mode === 'public') {
      check('public pricing explains pay-as-you-go and links to Buy credits', await evaluate("document.querySelector('#pricing')?.innerText.includes('PAY AS YOU GO') && !!document.querySelector('#pricing a[href=\"/dashboard/credits\"]') && !document.querySelector('#pricing')?.innerText.includes('Purchases are not available')"));
      for (const width of [1440,390,320]) for (const dark of [false,true]) {
        await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
        await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
        check(`public pricing fits ${width}px ${dark ? 'dark' : 'light'}`,await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      }
      return;
    }
    await navigate('/dashboard/credits');
    await wait("document.body.innerText.includes('Paid credit activity') && !document.body.innerText.includes('Loading saved purchases…')");
    await discover();
    const initial = await account();
    const wallet = await invoke('creditWalletAction'); assert.ok(wallet.ok);
    check('real owned wallet matches hosted paid balance and held credits', wallet.data.available === initial.credit_available && wallet.data.reserved === initial.credit_reserved);
    check('free allowance is separate from paid credits in actual UI', await evaluate("document.body.innerText.includes('Your free allowance stays separate') && document.body.innerText.includes('lifetime free video generations')"));
    check('owned paid ledger history has no internal/provider identifiers', wallet.data.activity.length > 0 && wallet.data.activity.every(entry => Object.keys(entry).sort().join(',') === 'amount,availableDelta,createdAt,type') && await evaluate(`!document.body.innerText.includes(${JSON.stringify(prior.orderId)})`));
    const historicalPurchase = await one('credit_purchases', 'paypal_order_id', prior.orderId);
    const order = await paypal.readPayPalOrder(prior.orderId);
    check('existing real Sandbox purchase remains backed by completed capture', historicalPurchase.status === 'completed' && paypal.verifiedCapture(historicalPurchase, order).id === historicalPurchase.paypal_capture_id);
    if (mode === 'expiry') {
      await navigate('/projects/' + state.projectId);
      await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Review generation cost'&&!b.disabled)");
      await setDuration('15'); assert.ok(await click('Review generation cost'));
      await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Confirm 32 credits'&&!b.disabled)");
      // Actual quote lifetime; no forged clock, quote, action or database edit.
      for (let n=0;n<11;n++) {
        if (await evaluate("document.body.innerText.includes('This quote has expired.')")) break;
        console.log(JSON.stringify({waitingForActualQuoteExpiry:true})); await delay(30000);
      }
      check('actual five-minute quote expiry disables new paid confirmation', await evaluate("document.body.innerText.includes('This quote has expired.') && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Confirm 32 credits'&&b.disabled)"));
      assert.ok(await click('Update quote'));
      await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Confirm 32 credits'&&!b.disabled)");
      check('fresh authoritative quote restores explicit confirmation after expiry', true);
      return;
    }
    if (mode === 'resume') {
      assert.ok(state.projectId && state.orderId, 'BEGIN_FIRST');
      await navigate('/projects/' + state.projectId);
      await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Review generation cost'&&!b.disabled)");
      await setDuration('30'); assert.ok(await click('Review generation cost'));
      await wait("document.body.innerText.includes('This generation requires 150 credits')");
      const beforeBlocked = await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Confirm 150 credits'&&b.disabled)");
      assert.ok(await click('Top up credits'));
      await wait("document.querySelector('[role=dialog]')?.innerText.includes('Small Test Pack') && !document.querySelector('[role=dialog]')?.innerText.includes('Loading saved purchases…')");
      let completed = false;
      for (let n=0;n<60;n++) {
        completed = (await one('credit_purchases','paypal_order_id',state.orderId)).status === 'completed';
        if (completed) break;
        if (n%10===0) console.log(JSON.stringify({sandboxApprovalPending:true}));
        await delay(2000);
      }
      if (!completed) { console.log(JSON.stringify({sandboxApprovalPending:true,continue:'Run resume again after manual approval.'})); return; }
      await wait("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent.trim()==='Check purchases'&&!b.disabled)");
      assert.ok(await click('Check purchases'));
      await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Confirm 150 credits'&&!b.disabled)");
      check('real top-up re-quotes existing editor without reload or automatic generation', await evaluate(`location.pathname==='/projects/${state.projectId}'&&document.querySelector('select[name=duration]').value==='30'`));
      if (beforeBlocked) { check('fresh Sandbox purchase changes insufficient quote into explicit affordable confirmation', true); state.liveInsufficientToAffordable = true; }
      const current = await account();
      check('open top-up reads authoritative new balance', await evaluate(`document.querySelector('[role=dialog]').innerText.includes('${current.credit_available}')`));
      check('top-up preserves two lifetime free counters and generation holds', ['free_total','free_reserved','free_consumed','credit_reserved'].every(key=>current[key]===state.beforePurchase[key]));
      check('top-up does not automatically submit a generation', !(await db.from('generation_jobs').select('id').eq('project_id',state.projectId)).data.length);
      state.resumeVerifiedAt = new Date().toISOString(); save(); return;
    }
    if (mode === 'begin') {
      assert.ok(state.projectId && !state.orderId, 'ONE_FRESH_ORDER_WITH_EXISTING_ACCEPTANCE_DRAFT');
      await navigate('/projects/' + state.projectId);
      await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Top up credits')");
      assert.ok(await click('Top up credits'));
      await wait("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent.trim()==='Pay with PayPal Sandbox'&&!b.disabled)");
      state.beforePurchase = await account(); save();
      assert.ok(await click('Pay with PayPal Sandbox'));
      await wait("document.querySelector('[role=dialog]')?.innerText.includes('Approve your test purchase in PayPal Sandbox')");
      await discover();
      const pendingWallet = await invoke('creditWalletAction'); assert.ok(pendingWallet.ok);
      const pending = pendingWallet.data.purchases.find(p=>p.status==='pending'&&p.pack_id==='sandbox-small-v1'); assert.ok(pending?.orderId);
      state.orderId = pending.orderId;
      const p = await one('credit_purchases','paypal_order_id',state.orderId);
      check('real top-up UI creates only authoritative Sandbox pack without granting credits', p.credits === 100 && p.amount_minor === 100 && p.environment === 'sandbox' && (await account()).credit_available === state.beforePurchase.credit_available);
      state.approvalUrl = paypal.approvalUrl(await paypal.readPayPalOrder(state.orderId)); save();
      console.log(JSON.stringify({sandboxApprovalUrl:state.approvalUrl,next:'Manually approve using a Sandbox personal buyer. The creating browser now closes; verify reads hosted completion before any completion action.'}));
      return;
    }
    if (mode === 'verify') {
      assert.ok(state.orderId && state.beforePurchase, 'BEGIN_FIRST');
      const p = await one('credit_purchases', 'paypal_order_id', state.orderId);
      const now = await account();
      check('new Sandbox purchase recovered with browser closed before any completion action', p.status === 'completed' && now.credit_available === state.beforePurchase.credit_available + p.credits);
      const verifiedOrder = await paypal.readPayPalOrder(p.paypal_order_id);
      check('new purchase is backed by actual final Sandbox capture', paypal.verifiedCapture(p, verifiedOrder).id === p.paypal_capture_id);
      for (let i = 0; i < 2; i++) check('actual duplicate capture completion preserves exactly-once balance', (await invoke('completeCreditOrderAction', { orderId: state.orderId })).data?.status === 'completed' && (await account()).credit_available === now.credit_available);
      const ledger = await db.from('credit_ledger').select('id').eq('purchase_id', p.id);
      check('new completed purchase has exactly one hosted ledger entry', !ledger.error && ledger.data.length === 1);
      check('purchase preserves free counters and generation holds', ['free_total','free_reserved','free_consumed','credit_reserved'].every(key => now[key] === state.beforePurchase[key]));
      await call('Page.navigate', { url: origin + '/dashboard/credits?checkout=return&token=' + state.orderId });
      await wait("document.body.innerText.includes('credits added. Current paid balance:')");
      check('return UI displays exact purchased credits and authoritative balance', await evaluate(`document.body.innerText.includes(${JSON.stringify(p.credits + ' credits added. Current paid balance: ' + now.credit_available + ' credits.')})`));
      state.newPurchaseVerified = true; save();
    } else {
      // Re-run the changed success presentation against a real verified capture.
      await call('Page.navigate', { url: origin + '/dashboard/credits?checkout=return&token=' + prior.orderId });
      await wait("document.body.innerText.includes('credits added. Current paid balance:')");
      check('changed success UX displays actual verified Sandbox pack and current balance', await evaluate(`document.body.innerText.includes(${JSON.stringify(historicalPurchase.credits + ' credits added. Current paid balance: ' + initial.credit_available + ' credits.')})`));
    }
    await call('Page.reload'); await wait("document.body.innerText.includes('Paid credit activity') && !document.body.innerText.includes('Loading saved purchases…')");
    check('refresh reopens authoritative wallet without losing purchased credits', (await invoke('creditWalletAction')).data?.available === (await account()).credit_available);
    for (const width of [1440,390,320]) for (const dark of [false,true]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
      await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
      check(`credits fit ${width}px ${dark ? 'dark' : 'light'}`, await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(dir, `credit-ux-${width}-${dark ? 'dark' : 'light'}.png`), Buffer.from(shot.data, 'base64'));
    }
    await call('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
    await navigate('/create'); await wait("document.body.innerText.includes('Save draft')"); await discover();
    if (!state.projectId) {
      const result = await invoke('saveProjectAction', { id: randomUUID(), mode:'create', title:'Credit UX acceptance', category:'cinematic', prompt:'Reserved credit UX acceptance draft. No generation is submitted.', settings:{ duration:'10', aspectRatio:'16:9', visualStyle:'Original', tone:'Storytelling' } });
      assert.ok(result.ok); state.projectId = result.project.id; save();
    }
    await navigate('/projects/' + state.projectId);
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Review generation cost'&&!b.disabled)");
    check('actual editor displays paid balance and top-up entry', await evaluate("document.body.innerText.includes('Paid credits:') && document.body.innerText.includes('Top up credits')"));
    assert.ok(await click('Review generation cost'));
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Confirm free generation'&&!b.disabled)");
    check('actual free quote preserves paid balance and separate entitlement', await evaluate("document.body.innerText.includes('Uses one lifetime free generation. Your paid credits stay unchanged.')"));
    await setDuration('15'); assert.ok(await click('Review generation cost'));
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Confirm 32 credits'&&!b.disabled)");
    check('affordable server quote enables explicit confirmation with before-after balance', await evaluate("document.body.innerText.includes('Estimated cost') && document.body.innerText.includes('After reservation') && document.body.innerText.includes('Development/test credit configuration')"));
    await setDuration('30'); assert.ok(await click('Review generation cost'));
    await wait("document.body.innerText.includes('This generation requires 150 credits')");
    if ((await account()).credit_available < 150) check('insufficient authoritative quote blocks confirmation', await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Confirm 150 credits'&&b.disabled)"));
    else check('topped-up quote enables explicit affordable confirmation', await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Confirm 150 credits'&&!b.disabled)"));
    assert.ok(await click('Top up credits'));
    await wait("document.querySelector('[role=dialog]')?.innerText.includes('Small Test Pack') && !document.querySelector('[role=dialog]')?.innerText.includes('Loading saved purchases…')");
    check('in-place top-up uses authoritative Sandbox packs without leaving project', await evaluate(`location.pathname==='/projects/${state.projectId}' && document.querySelector('[role=dialog]').innerText.includes('100 credits') && document.querySelector('[role=dialog]').innerText.includes('$1.00 USD')`));
    for (const width of [1440,390,320]) for (const dark of [false,true]) {
      await call('Emulation.setDeviceMetricsOverride', { width,height:1000,deviceScaleFactor:1,mobile:width<500 });
      await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
      check(`top-up dialog fits ${width}px ${dark ? 'dark' : 'light'}`, await evaluate("(()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&d.scrollWidth<=d.clientWidth&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()"));
      const shot = await call('Page.captureScreenshot', {format:'png',captureBeyondViewport:true});
      fs.writeFileSync(path.join(dir, `top-up-${width}-${dark ? 'dark' : 'light'}.png`), Buffer.from(shot.data, 'base64'));
    }
    await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    check('top-up keyboard focus remains inside dialog', await evaluate("!!document.activeElement.closest('[role=dialog]')"));
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await wait("!document.querySelector('[role=dialog]')");
    check('closing top-up preserves project settings and prompt', await evaluate("document.querySelector('select[name=duration]').value==='30' && document.querySelector('textarea').value==='Reserved credit UX acceptance draft. No generation is submitted.'"));
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Update quote'&&!b.disabled)");
    const quoteCount = async () => { const r=await db.from('generation_quotes').select('id',{count:'exact',head:true}).eq('project_id',state.projectId); assert.ok(!r.error); return r.count; };
    const beforeTab = await quoteCount();
    const target = await call('Target.createTarget',{url:origin+'/dashboard/credits',background:true});
    let refreshed = false;
    for (let n=0;n<40;n++) { if ((await quoteCount())>beforeTab) { refreshed=true; break; } await delay(500); }
    check('real second credit tab invalidates and refreshes existing editor quote', refreshed);
    await call('Target.closeTarget',{targetId:target.targetId});
    await signIn('B'); await navigate('/dashboard/credits'); await wait("document.body.innerText.includes('Paid credit activity') && !document.body.innerText.includes('Loading saved purchases…')"); await discover();
    const b = await one('app_users','clerk_user_id',identities.secondClerkId), ba = await one('generation_accounts','owner_user_id',b.id), bw = await invoke('creditWalletAction');
    check('actual User B reads only own balance and history', bw.ok && bw.data.available === ba.credit_available && !bw.data.purchases.some(p=>p.orderId===prior.orderId || p.orderId===state.orderId));
    const bLedger = await db.from('credit_ledger').select('type,amount,available_delta,created_at').eq('owner_user_id',b.id).order('created_at',{ascending:false}).limit(20);
    check('actual User B activity exactly matches only B hosted ledger', !bLedger.error && JSON.stringify(bw.data.activity) === JSON.stringify(bLedger.data.map(e=>({type:e.type,amount:e.amount,availableDelta:e.available_delta,createdAt:e.created_at}))));
    check('low-credit notice matches central default and separate free allowance', bw.data.lowBalance === (ba.credit_available <= 25) && (ba.credit_available > 25 || await evaluate("document.body.innerText.includes('You’re running low on paid credits.')")));
    check('actual User B cannot complete User A purchase', !(await invoke('completeCreditOrderAction',{orderId:prior.orderId})).ok);
    for (const extra of [{credits:999999},{amount:'0.01'},{owner:userA.id}]) check('authenticated pack tampering rejected', !(await invoke('createCreditOrderAction',{packId:'sandbox-small-v1',...extra})).ok);
    check('no generation was dispatched during credit UX acceptance', !(await db.from('generation_jobs').select('id').eq('project_id',state.projectId)).data.length);
    check('credit UX browser has no uncaught exceptions', errors.length === 0);
    state.screenshots = dir; state.lastCheckedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ passed:state.checks.length, newPurchaseVerified:state.newPurchaseVerified === true, screenshots:dir }));
  });
}
