// Real Sandbox/hosted SQL/Clerk acceptance. Never calls the render/provider path.
// begin creates one Sandbox order; buyer approval is a separate deliberate step.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nextEnv from '@next/env';
import { typescriptLoader } from './lib/load-typescript.mjs';
import { deployedBrowser } from './lib/deployed-browser.mjs';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const load = typescriptLoader(), db = load('lib/db/server.ts').createDatabaseClient();
const config = load('lib/payments/paypal/config.ts'), paypal = load('lib/payments/paypal/client.ts');
const artifact = path.join(os.tmpdir(), 'sceenyk-paypal-sandbox-acceptance.json');
const mode = process.argv[2] ?? 'preflight';
const origin = process.env.PAYPAL_ACCEPTANCE_ORIGIN ?? 'http://localhost:3000';
let state;
try { state = JSON.parse(fs.readFileSync(artifact, 'utf8')); } catch { state = { origin, checks: [] }; }
const save = () => fs.writeFileSync(artifact, JSON.stringify(state, null, 2));
const check = (name, value) => { assert.ok(value, name); if (!state.checks.includes(name)) state.checks.push(name); save(); console.log(JSON.stringify({ passed: name })); };
async function row(table, column, id) {
  const result = await db.from(table).select('*').eq(column, id).single();
  assert.ok(!result.error && result.data, 'HOSTED_ROW_' + table);
  return result.data;
}
async function preflight() {
  const schema = await db.from('credit_purchases').select('id,owner_user_id,environment,pack_id,amount_minor,currency,credits,paypal_order_id,paypal_capture_id,capture_request_id,status,created_at,updated_at,completed_at').limit(0);
  const ledger = await db.from('credit_ledger').select('purchase_id,paypal_order_id,paypal_capture_id').limit(0);
  const configured = config.isPayPalConfigured();
  let oauth = false;
  if (configured) {
    const c = config.getPayPalConfig();
    const response = await fetch(c.baseUrl + '/v1/oauth2/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Basic ' + Buffer.from(c.clientId + ':' + c.clientSecret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
    oauth = response.ok && typeof (await response.json()).access_token === 'string';
  }
  state.preflight = { migration017Available: !schema.error && !ledger.error, safeSchemaCode: schema.error?.code ?? ledger.error?.code ?? null, sandboxConfigured: configured, sandboxOAuthAccepted: oauth, checkedAt: new Date().toISOString() };
  save(); console.log(JSON.stringify(state.preflight));
}
function identities() {
  const accepted = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sceenyk-deployed-narration-acceptance.json'), 'utf8'));
  assert.ok(accepted.ownerClerkId && accepted.secondClerkId, 'RESERVED_ACCEPTANCE_IDENTITIES_REQUIRED');
  return { A: accepted.ownerClerkId, B: accepted.secondClerkId };
}
const unchangedUsage = (before, after) => ['free_total', 'free_reserved', 'free_consumed', 'credit_reserved'].every(key => before[key] === after[key]);
async function browser(work) {
  assert.equal(state.origin, origin, 'USE_SAME_ACCEPTANCE_ORIGIN');
  return deployedBrowser(origin, identities(), work);
}
async function ui() {
  await browser(async ({ signIn, navigate, wait, evaluate, call, dir, errors }) => {
    await signIn('A'); await navigate('/dashboard/credits');
    await wait("document.body.innerText.includes('Recent purchases') && !document.body.innerText.includes('Loading saved purchases…')");
    check('real authenticated browser opens Buy Credits', await evaluate("document.querySelector('h1')?.textContent==='Buy credits'"));
    for (const width of [1440, 390, 320]) for (const dark of [false, true]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
      await evaluate(`document.documentElement.classList.toggle('dark',${dark})`);
      check(`credits UI fits ${width}px ${dark ? 'dark' : 'light'}`, await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(dir, `credits-${width}-${dark ? 'dark' : 'light'}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    check('credits page has keyboard focus', await evaluate("document.activeElement!==document.body"));
    check('credits UI browser has no uncaught exceptions', errors.length === 0);
    state.screenshots = dir; save();
  });
}
async function begin() {
  await preflight(); assert.ok(state.preflight.migration017Available && state.preflight.sandboxOAuthAccepted, 'CONFIGURE_SANDBOX_AND_APPLY_017_FIRST');
  await browser(async ({ signIn, navigate, wait, discover, invoke, call }) => {
    await signIn('A'); await navigate('/dashboard/credits'); await wait("document.body.innerText.includes('Recent purchases')"); await discover();
    const wallet = await invoke('creditWalletAction'); assert.ok(wallet.ok, 'REAL_WALLET');
    if (!state.orderId) {
      const appUser = await row('app_users', 'clerk_user_id', identities().A);
      state.ownerId = appUser.id; state.originalAccount = await row('generation_accounts', 'owner_user_id', appUser.id);
      const result = await invoke('createCreditOrderAction', { packId: 'sandbox-small-v1' }); assert.ok(result.ok && result.data.approvalUrl, 'REAL_SANDBOX_CREATE');
      state.orderId = result.data.orderId; save();
    }
    const purchase = await row('credit_purchases', 'paypal_order_id', state.orderId);
    const order = await paypal.readPayPalOrder(state.orderId); paypal.verifyOrder(purchase, order);
    check('real Sandbox order created with server-owned pack snapshot', purchase.owner_user_id === state.ownerId && purchase.amount_minor === 100 && purchase.credits === 100 && purchase.environment === 'sandbox');
    check('unapproved order grants no credits', purchase.status === 'pending' && (await row('generation_accounts', 'owner_user_id', state.ownerId)).credit_available === state.originalAccount.credit_available);
    await call('Page.reload'); await wait("document.body.innerText.includes('Recent purchases')");
    const refreshed = await invoke('creditWalletAction');
    check('refresh during approval preserves pending order and balance', refreshed.ok && refreshed.data.available === wallet.data.available && refreshed.data.purchases.some(p => p.orderId === state.orderId));
    state.approvalPending = true; save();
    console.log(JSON.stringify({ sandboxApprovalUrl: paypal.approvalUrl(order), next: 'Approve using a Sandbox personal buyer, then run verify. No real PayPal account.' }));
  });
}
async function verify() {
  assert.ok(state.orderId && state.originalAccount, 'RUN_BEGIN_FIRST');
  await browser(async ({ signIn, navigate, wait, discover, invoke, call, errors }) => {
    await signIn('A'); await navigate('/dashboard/credits'); await wait("document.body.innerText.includes('Recent purchases')"); await discover();
    const result = await invoke('completeCreditOrderAction', { orderId: state.orderId });
    assert.ok(result.ok && result.data.status === 'completed', 'REAL_BUYER_APPROVAL_AND_CAPTURE_REQUIRED');
    const purchase = await row('credit_purchases', 'paypal_order_id', state.orderId);
    const order = await paypal.readPayPalOrder(state.orderId); const capture = paypal.verifiedCapture(purchase, order);
    const account = await row('generation_accounts', 'owner_user_id', state.ownerId);
    check('real Sandbox completed capture verified', capture.id === purchase.paypal_capture_id && order.status === 'COMPLETED');
    check('real purchase adds correct credits without changing allowances or holds', account.credit_available === state.originalAccount.credit_available + purchase.credits && unchangedUsage(state.originalAccount, account));
    const entries = await db.from('credit_ledger').select('*').eq('purchase_id', purchase.id); assert.ok(!entries.error);
    check('exactly one hosted immutable purchase ledger entry', entries.data.length === 1 && entries.data[0].type === 'purchase' && entries.data[0].amount === purchase.credits && entries.data[0].paypal_capture_id === capture.id);
    for (let i = 0; i < 2; i++) check('actual duplicate completion returns original outcome', (await invoke('completeCreditOrderAction', { orderId: state.orderId })).data?.status === 'completed');
    check('duplicate capture adds zero extra credits', (await row('generation_accounts', 'owner_user_id', state.ownerId)).credit_available === account.credit_available);
    await call('Page.reload'); await wait("document.body.innerText.includes('Recent purchases')");
    check('refresh retains real updated paid balance', (await invoke('creditWalletAction')).data?.available === account.credit_available);
    await signIn('B'); await navigate('/dashboard/credits'); await wait("document.body.innerText.includes('Recent purchases')"); await discover();
    check('real User B cannot capture User A order', (await invoke('completeCreditOrderAction', { orderId: state.orderId })).ok === false);
    check('real User B denial preserves A balance', (await row('generation_accounts', 'owner_user_id', state.ownerId)).credit_available === account.credit_available);
    await signIn('A'); await navigate('/dashboard/credits'); await wait("document.body.innerText.includes('Recent purchases')"); await discover();
    if (!state.cancelledOrderId) {
      const cancelled = await invoke('createCreditOrderAction', { packId: 'sandbox-medium-v1' }); assert.ok(cancelled.ok && cancelled.data.approvalUrl, 'UNPAID_CANCELLATION_ORDER');
      state.cancelledOrderId = cancelled.data.orderId; save();
    }
    check('real unpaid checkout cancellation persists', (await invoke('cancelCreditOrderAction', { orderId: state.cancelledOrderId })).data?.status === 'cancelled');
    check('cancelled unpaid checkout grants zero credits', (await row('generation_accounts', 'owner_user_id', state.ownerId)).credit_available === account.credit_available);
    state.approvalPending = false; state.actualSandboxCaptureVerified = true; state.captureId = capture.id; state.verifiedAt = new Date().toISOString();
    // Do not mark the whole unit complete here: signed webhook recovery and
    // an actual failed-payment case still need their own recorded evidence.
    check('real acceptance browser has no uncaught exceptions', errors.length === 0); save();
    console.log(JSON.stringify({ actualSandboxCaptureVerified: true, remaining: ['authentic signed webhook/browser-disappearance acceptance', 'actual failed Sandbox payment grants zero'] }));
  });
}
if (mode === 'preflight') await preflight();
else if (mode === 'ui') await ui();
else if (mode === 'begin') await begin();
else if (mode === 'verify') await verify();
else throw new Error('Use preflight, ui, begin or verify.');
