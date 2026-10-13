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
const origin = process.env.PAYPAL_ACCEPTANCE_ORIGIN ?? process.env.PAYPAL_RETURN_ORIGIN ?? 'http://localhost:3000';
let state;
try { state = JSON.parse(fs.readFileSync(artifact, 'utf8')); } catch { state = { origin, checks: [] }; }
// Earlier UI-only checks used localhost. Switching to the deployed app is safe
// until this retained acceptance run has actually created a payment order.
if (!state.orderId) state.origin = origin;
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
async function sandboxRequest(route, method = 'GET', body, allowFailure = false) {
  assert.ok(route.startsWith('/v1/notifications/') || route.startsWith('/v2/checkout/orders/'), 'REVIEWED_SANDBOX_API_PATH');
  const c = config.getPayPalConfig();
  const auth = await fetch(c.baseUrl + '/v1/oauth2/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Basic ' + Buffer.from(c.clientId + ':' + c.clientSecret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  assert.ok(auth.ok, 'SANDBOX_AUTH');
  const token = (await auth.json()).access_token;
  const response = await fetch(c.baseUrl + route, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!allowFailure) assert.ok(response.ok, 'SANDBOX_MANAGEMENT_HTTP_' + response.status);
  const raw = await response.text();
  return { status: response.status, data: raw ? JSON.parse(raw) : null };
}
async function webhookReadiness() {
  const c = config.getPayPalConfig();
  const { data } = await sandboxRequest('/v1/notifications/webhooks/' + encodeURIComponent(c.webhookId));
  const required = ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED'];
  const events = data.event_types.map(event => event.name);
  check('real Sandbox Merchant webhook URL matches deployed app', data.url === origin + '/api/payments/paypal/webhook');
  check('real Merchant subscriptions need no ORDER.COMPLETED event', required.every(name => events.includes(name)));
  state.merchantWebhook = { checkedAt: new Date().toISOString(), events, origin }; save();
}
async function webhookProof(replay = false) {
  assert.ok(state.orderId && state.originalAccount, 'CREATE_SANDBOX_ORDER_FIRST');
  const purchase = await row('credit_purchases', 'paypal_order_id', state.orderId);
  const account = await row('generation_accounts', 'owner_user_id', state.ownerId);
  if (!state.actualSandboxCaptureVerified) {
    // This mode deliberately makes no Sceenyk browser/action requests. Thus a
    // completed purchase at this checkpoint proves browser-independent recovery.
    check('browser-closed purchase recovered before any completion action', purchase.status === 'completed' && account.credit_available === state.originalAccount.credit_available + purchase.credits);
    const order = await paypal.readPayPalOrder(state.orderId);
    const capture = paypal.verifiedCapture(purchase, order);
    check('browser-independent recovery is backed by actual Sandbox capture', capture.id === purchase.paypal_capture_id);
    state.browserIndependentRecovery = true; state.captureId = capture.id; save();
  }
  const { data } = await sandboxRequest('/v1/notifications/webhooks-events?' + new URLSearchParams({ transaction_id: purchase.paypal_capture_id, page_size: '20' }));
  const event = data.events.find(event => event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && event.resource.id === purchase.paypal_capture_id);
  check('real PayPal completed-capture notification exists', !!event);
  if (replay) {
    const before = await row('generation_accounts', 'owner_user_id', state.ownerId);
    const c = config.getPayPalConfig();
    const resent = await sandboxRequest('/v1/notifications/webhooks-events/' + encodeURIComponent(event.id) + '/resend', 'POST', { webhook_ids: [c.webhookId] });
    check('PayPal accepts authentic completed-capture webhook redelivery', resent.status === 202);
    state.webhookReplay = { eventId: event.id, requestedAt: new Date().toISOString(), balanceBefore: before.credit_available };
    save();
  }
  state.completedCaptureEventId = event.id; save();
  console.log(JSON.stringify({ orderCompleted: purchase.status === 'completed', browserIndependentRecovery: state.browserIndependentRecovery === true, completedCaptureEventId: event.id, replayRequested: replay }));
}
async function webhookReplayProof() {
  assert.ok(state.webhookReplay, 'REQUEST_AUTHENTIC_WEBHOOK_REPLAY_FIRST');
  const purchase = await row('credit_purchases', 'paypal_order_id', state.orderId);
  const account = await row('generation_accounts', 'owner_user_id', state.ownerId);
  const ledger = await db.from('credit_ledger').select('id,amount,paypal_capture_id').eq('purchase_id', purchase.id);
  check('authentic webhook replay preserves exactly one purchase ledger effect', !ledger.error && ledger.data.length === 1 && ledger.data[0].paypal_capture_id === purchase.paypal_capture_id && account.credit_available === state.webhookReplay.balanceBefore);
  const detail = (await sandboxRequest('/v1/notifications/webhooks-events/' + encodeURIComponent(state.webhookReplay.eventId))).data;
  const transmissions = (detail.transmissions ?? []).map(transmission => ({ status: transmission.status,
    httpStatus: transmission.http_status, timestamp: transmission.timestamp, fields: Object.keys(transmission) }));
  state.webhookReplay.deliveryEvidence = { status: detail.status ?? null, transmissions }; save();
  console.log(JSON.stringify({ eventFields: Object.keys(detail), deliveryEvidence: state.webhookReplay.deliveryEvidence }));
  // The API accepts redelivery but does not expose listener response headers.
  // Delivery confirmation still needs PayPal delivery evidence or the observed
  // actual effect from browser-independent recovery; do not invent telemetry.
}
async function boundarySecurity() {
  const secretNames = ['PAYPAL_CLIENT_SECRET', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CLERK_SECRET_KEY', 'R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID', 'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY', 'WORKER_SHARED_SECRET', 'GEMINI_API_KEY', 'FAL_KEY', 'ELEVENLABS_API_KEY'];
  const secrets = secretNames.map(name => process.env[name]).filter(Boolean);
  const htmlResponse = await fetch(origin, { signal: AbortSignal.timeout(20000) }); assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  check('deployed public HTML exposes no configured server credential', !secrets.some(secret => html.includes(secret)));
  const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => new URL(match[1].replaceAll('&amp;', '&'), origin)).filter(url => url.origin === origin && url.pathname.startsWith('/_next/')).map(url => url.href))];
  assert.ok(scripts.length, 'DEPLOYED_SCRIPT_INVENTORY');
  for (const url of scripts) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) }); assert.equal(response.status, 200);
    const body = await response.text(); assert.ok(!secrets.some(secret => body.includes(secret)), 'DEPLOYED_SECRET_LEAK');
    assert.ok(!/PAYPAL_CLIENT_SECRET|fulfil_paypal_purchase|api-m\.sandbox\.paypal\.com|SUPABASE_SECRET_KEY/.test(body), 'DEPLOYED_SERVER_MARKER');
  }
  check('deployed public client scripts keep PayPal and database credentials server-only', scripts.length > 0);
  for (const type of ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.DENIED']) {
    const event = { id: 'WH-unauthenticated-acceptance', event_type: type, resource: { id: 'ORDER000000000000', supplementary_data: { related_ids: { order_id: 'ORDER000000000000' } } } };
    const response = await fetch(origin + '/api/payments/paypal/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event), signal: AbortSignal.timeout(20000) });
    check('deployed webhook rejects unsigned ' + type, response.status === 400);
  }
  state.deployedSecretScan = { clientFiles: scripts.length, configuredSecrets: secrets.length, leaks: 0, checkedAt: new Date().toISOString() }; save();
}
async function observe() {
  assert.ok(state.orderId, 'CREATE_SANDBOX_ORDER_FIRST');
  const purchase = await row('credit_purchases', 'paypal_order_id', state.orderId);
  const account = await row('generation_accounts', 'owner_user_id', state.ownerId);
  const ledger = await db.from('credit_ledger').select('id').eq('purchase_id', purchase.id);
  assert.ok(!ledger.error);
  console.log(JSON.stringify({ purchaseStatus: purchase.status, creditAvailable: account.credit_available,
    creditIncrease: account.credit_available - state.originalAccount.credit_available,
    purchaseLedgerEntries: ledger.data.length, lifetimeFreeAndReservationsUnchanged: unchangedUsage(state.originalAccount, account) }));
}
async function browserSecurity() {
  assert.ok(state.orderId, 'CREATE_SANDBOX_ORDER_FIRST');
  await browser(async ({ signIn, navigate, wait, discover, invoke, evaluate, errors }) => {
    await signIn('B'); await navigate('/dashboard/credits'); await wait("document.body.innerText.includes('Recent purchases')"); await discover();
    const appUser = await row('app_users', 'clerk_user_id', identities().B);
    const before = await row('generation_accounts', 'owner_user_id', appUser.id);
    const countBefore = await db.from('credit_purchases').select('id', { count: 'exact', head: true }).eq('owner_user_id', appUser.id);
    assert.ok(!countBefore.error);
    check('real User B cannot complete User A pending or completed order', (await invoke('completeCreditOrderAction', { orderId: state.orderId })).ok === false);
    for (const extra of [{ amount: '0.01' }, { credits: 999999 }, { currency: 'EUR' }, { owner: state.ownerId }]) {
      check('authenticated browser commercial or ownership tampering is rejected', (await invoke('createCreditOrderAction', { packId: 'sandbox-small-v1', ...extra })).ok === false);
    }
    const countAfter = await db.from('credit_purchases').select('id', { count: 'exact', head: true }).eq('owner_user_id', appUser.id);
    const after = await row('generation_accounts', 'owner_user_id', appUser.id);
    check('rejected browser requests create no purchases or balance changes', !countAfter.error && countAfter.count === countBefore.count && after.credit_available === before.credit_available && unchangedUsage(before, after));
    const urls = await evaluate("[...new Set([...document.scripts].map(s=>s.src).filter(src=>src.startsWith(location.origin+'/_next/')))]");
    const secrets = ['PAYPAL_CLIENT_SECRET', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CLERK_SECRET_KEY', 'R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID', 'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY', 'WORKER_SHARED_SECRET', 'GEMINI_API_KEY', 'FAL_KEY', 'ELEVENLABS_API_KEY'].map(name => process.env[name]).filter(Boolean);
    for (const url of urls) {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) }); assert.equal(response.status, 200);
      const body = await response.text(); assert.ok(!secrets.some(secret => body.includes(secret)), 'AUTHENTICATED_CLIENT_SECRET_LEAK');
      assert.ok(!/PAYPAL_CLIENT_SECRET|fulfil_paypal_purchase|api-m\.sandbox\.paypal\.com|SUPABASE_SECRET_KEY/.test(body), 'AUTHENTICATED_CLIENT_SERVER_MARKER');
    }
    check('authenticated checkout bundles contain no payment or database secrets', urls.length > 0);
    check('authenticated security browser has no uncaught exceptions', errors.length === 0);
    state.authenticatedSecretScan = { clientFiles: urls.length, configuredSecrets: secrets.length, leaks: 0 }; save();
  });
}
async function databaseSecurity() {
  const purchase = await row('credit_purchases', 'paypal_order_id', state.orderId);
  assert.equal(purchase.status, 'completed', 'REAL_PAYMENT_REQUIRED');
  const ledger = await row('credit_ledger', 'purchase_id', purchase.id);
  const account = await row('generation_accounts', 'owner_user_id', state.ownerId);
  // No-op probes only: even an unexpected permissive grant cannot alter these
  // values, and the balance predicate prevents overwriting a concurrent change.
  const probes = [
    await db.from('credit_ledger').update({ amount: ledger.amount }).eq('id', ledger.id),
    await db.from('credit_purchases').update({ status: 'completed' }).eq('id', purchase.id),
    await db.from('generation_accounts').update({ credit_available: account.credit_available }).eq('owner_user_id', state.ownerId).eq('credit_available', account.credit_available),
  ];
  check('hosted service role cannot directly mutate ledger purchases or balance', probes.every(result => result.error?.code === '42501'));
  if (process.env.SUPABASE_PUBLISHABLE_KEY) {
    const { createClient } = await import('@supabase/supabase-js');
    const publicDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const read = await publicDb.from('credit_purchases').select('id').eq('id', purchase.id);
    const write = await publicDb.from('generation_accounts').update({ credit_available: account.credit_available }).eq('owner_user_id', state.ownerId).eq('credit_available', account.credit_available);
    check('hosted browser database role cannot read purchases or change balance', !!read.error && !!write.error);
  }
  check('completed payment history survives permission probes unchanged', JSON.stringify(await row('credit_ledger', 'id', ledger.id)) === JSON.stringify(ledger) && (await row('generation_accounts', 'owner_user_id', state.ownerId)).credit_available === account.credit_available);
  state.hostedLedgerId = ledger.id; save();
}
async function browser(work) {
  assert.equal(state.origin, origin, 'USE_SAME_ACCEPTANCE_ORIGIN');
  return deployedBrowser(origin, identities(), work);
}
async function ui() {
  await browser(async ({ signIn, navigate, wait, evaluate, call, dir, errors, discover, invoke }) => {
    await signIn('A'); await navigate('/dashboard/credits');
    await wait("document.body.innerText.includes('Recent purchases') && !document.body.innerText.includes('Loading saved purchases…')");
    check('real authenticated browser opens Buy Credits', await evaluate("document.querySelector('h1')?.textContent==='Buy credits'"));
    if (state.actualSandboxCaptureVerified) {
      await discover(); const wallet = await invoke('creditWalletAction'); assert.ok(wallet.ok);
      await wait("document.querySelector('[aria-label=\"Paid credit balance\"]')?.innerText.includes('" + wallet.data.available + "')");
      check('real paid-success UI displays purchased balance and completed history', wallet.data.available === state.originalAccount.credit_available + 100 && await evaluate("document.body.innerText.includes('Purchase successful. Your paid credit balance is updated.')"));
    }
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
    if (!state.unapprovedFailureVerified) {
      const rejected = await sandboxRequest('/v2/checkout/orders/' + encodeURIComponent(state.cancelledOrderId) + '/capture', 'POST', {}, true);
      const issues = rejected.data?.details?.map(detail => detail.issue) ?? [];
      check('real PayPal rejects capture before Sandbox buyer approval', rejected.status === 422 && issues.some(issue => ['ORDER_NOT_APPROVED', 'PAYER_ACTION_REQUIRED'].includes(issue)));
      const pending = await row('credit_purchases', 'paypal_order_id', state.cancelledOrderId);
      const ledger = await db.from('credit_ledger').select('id').eq('purchase_id', pending.id);
      check('real rejected unapproved capture grants no credits or ledger effect', !ledger.error && ledger.data.length === 0 && (await row('generation_accounts', 'owner_user_id', state.ownerId)).credit_available === account.credit_available);
      state.unapprovedFailureVerified = true; save();
    }
    check('real unpaid checkout cancellation persists', (await invoke('cancelCreditOrderAction', { orderId: state.cancelledOrderId })).data?.status === 'cancelled');
    check('cancelled unpaid checkout grants zero credits', (await row('generation_accounts', 'owner_user_id', state.ownerId)).credit_available === account.credit_available);
    state.approvalPending = false; state.actualSandboxCaptureVerified = true; state.captureId = capture.id; state.verifiedAt = new Date().toISOString();
    // Do not mark the whole unit complete here: signed webhook recovery and
    // an actual failed-payment case still need their own recorded evidence.
    check('real acceptance browser has no uncaught exceptions', errors.length === 0); save();
    console.log(JSON.stringify({ actualSandboxCaptureVerified: true, browserIndependentRecovery: state.browserIndependentRecovery === true, unapprovedFailureVerified: state.unapprovedFailureVerified === true,
      remaining: ['authenticated pending/denied capture status cases are fixture coverage unless actual events are generated'] }));
  });
}
if (mode === 'preflight') await preflight();
else if (mode === 'ui') await ui();
else if (mode === 'begin') await begin();
else if (mode === 'verify') await verify();
else if (mode === 'webhook-readiness') await webhookReadiness();
else if (mode === 'webhook-proof') await webhookProof();
else if (mode === 'webhook-replay') await webhookProof(true);
else if (mode === 'webhook-replay-proof') await webhookReplayProof();
else if (mode === 'boundary-security') await boundarySecurity();
else if (mode === 'observe') await observe();
else if (mode === 'browser-security') await browserSecurity();
else if (mode === 'database-security') await databaseSecurity();
else if (mode === 'confirm-webhook-delivery') {
  assert.ok(state.webhookReplay?.eventId && state.actualSandboxCaptureVerified, 'REAL_CAPTURE_AND_REPLAY_REQUIRED');
  state.webhookReplay.userConfirmedHttp200 = true;
  state.webhookReplay.userConfirmedAt = new Date().toISOString();
  check('user confirms PayPal dashboard HTTP 200 for authentic completed-capture replay', true);
  await webhookReplayProof();
}
else throw new Error('Use preflight, ui, begin, verify, observe, webhook-readiness, webhook-proof, webhook-replay, webhook-replay-proof, boundary-security, browser-security, database-security or confirm-webhook-delivery.');
