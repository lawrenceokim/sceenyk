// One real Sandbox purchase via Production Settings. Reuses its saved order on
// every resume; never creates a generation, withdrawal or Inngest event.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import nextEnv from '@next/env';
import { createClerkClient } from '@clerk/backend';
import { typescriptLoader } from './lib/load-typescript.mjs';
import { deployedBrowser } from './lib/deployed-browser.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const mode = process.argv[2] ?? 'observe';
assert.ok(['begin','observe','verify','redeliver'].includes(mode));
const origin = 'https://sceenyk.vercel.app';
const load = typescriptLoader(), db = load('lib/db/server.ts').createDatabaseClient();
const paypal = load('lib/payments/paypal/client.ts'), config = load('lib/payments/paypal/config.ts').getPayPalConfig();
assert.equal(config.baseUrl, 'https://api-m.sandbox.paypal.com');
const file = path.join(os.tmpdir(), 'sceenyk-settings-topup-deployed.json');
let state;
try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { state = { checks: [], origin }; }
assert.equal(state.origin, origin);
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2));
const check = (name, value) => { assert.ok(value, name); if (!state.checks.includes(name)) state.checks.push(name); save(); console.log(JSON.stringify({ passed: name })); };
const one = async (table, column, value) => { const result = await db.from(table).select('*').eq(column, value).single(); assert.ok(!result.error && result.data, 'OWNED_RECORD_REQUIRED'); return result.data; };
const users = await db.from('app_users').select('id,clerk_user_id,email').order('id').limit(100);
const roles = await db.from('internal_user_roles').select('user_id,role'); assert.ok(!users.error && !roles.error);
const identities = users.data.filter(u => u.email?.includes('+clerk_test@') && !roles.data.some(r => r.user_id === u.id && r.role !== 'user')).slice(0,2);
assert.equal(identities.length, 2); const [a,b] = identities;
if (state.owner) assert.equal(state.owner, a.id);
state.owner = a.id; save();
const account = () => one('generation_accounts','owner_user_id',a.id);
const purchase = () => one('credit_purchases','paypal_order_id',state.orderId);
async function provider(relative, method = 'GET', body) {
  const token = await paypal.paypalAccessToken();
  const response = await fetch(config.baseUrl + relative, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
  assert.ok(response.ok, 'SANDBOX_REQUEST_FAILED_' + response.status);
  return response.status === 204 ? null : response.json();
}
async function protectedHash() {
  const rows = [];
  for (const table of ['generation_jobs','generation_reservations','creator_earnings_ledger','creator_withdrawals','creator_payout_destinations','internal_user_roles']) {
    const result = await db.from(table).select('*'); assert.ok(!result.error, 'PROTECTED_READ_' + table);
    rows.push([table,result.data.map(row=>JSON.stringify(row)).sort()]);
  }
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
async function verifySettlement() {
  const p = await purchase(), current = await account();
  const order = await paypal.readPayPalOrder(state.orderId);
  const capture = paypal.verifiedCapture(p, order);
  check('fresh purchase has one verified final Sandbox capture', p.status === 'completed' && p.environment === 'sandbox' && p.paypal_capture_id === capture.id && p.credits === 100 && p.amount_minor === 100 && p.currency === 'USD');
  check('paid balance increased by exactly purchased credits', current.credit_available === state.before.credit_available + p.credits);
  check('free counters and generation holds unchanged', ['free_total','free_reserved','free_consumed','credit_reserved'].every(key => current[key] === state.before[key]));
  const ledger = await db.from('credit_ledger').select('*').eq('purchase_id', p.id);
  check('exactly one immutable purchase ledger entry', !ledger.error && ledger.data.length === 1 && ledger.data[0].available_delta === p.credits);
  check('generation creator money payout and roles unchanged', await protectedHash() === state.protectedBefore);
  state.captureId = capture.id; state.available = current.credit_available; save();
  return p;
}
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, telemetry: { disabled: true } });
assert.equal((await clerk.instance.get()).environmentType, 'development');
const sessions = new Set();
try {
  if (mode === 'observe') {
    assert.ok(state.orderId, 'BEGIN_FIRST');
    const p = await purchase(), order = await paypal.readPayPalOrder(state.orderId);
    paypal.verifyOrder(p, order);
    console.log(JSON.stringify({ purchaseStatus: p.status, sandboxStatus: order.status, approvalUrl: p.status === 'pending' ? state.approvalUrl : undefined }));
  } else if (mode === 'redeliver') {
    assert.ok(state.verifiedAt && state.captureId, 'VERIFIED_PURCHASE_REQUIRED');
    const events = await provider('/v1/notifications/webhooks-events?transaction_id=' + encodeURIComponent(state.captureId) + '&event_type=PAYMENT.CAPTURE.COMPLETED&page_size=100');
    const event = events.events?.find(e => e.event_type === 'PAYMENT.CAPTURE.COMPLETED' && e.resource?.id === state.captureId);
    assert.ok(event?.id, 'REAL_CAPTURE_WEBHOOK_EVENT_REQUIRED');
    const detail = await provider('/v1/notifications/webhooks-events/' + encodeURIComponent(event.id));
    check('authentic webhook references the same verified capture', detail.resource?.id === state.captureId);
    for (let i=0;i<2;i++) {
      const sent = await provider('/v1/notifications/webhooks-events/' + encodeURIComponent(event.id) + '/resend','POST',{webhook_ids:[config.webhookId]});
      check('PayPal accepted real webhook redelivery ' + (i+1), sent?.id === event.id);
    }
    state.webhookEventId = event.id; state.redeliveryRequestedAt = new Date().toISOString(); save();
    await verifySettlement();
    console.log(JSON.stringify({ redeliveryRequested: true, eventId: event.id, evidenceFile: file }));
  } else {
    if (mode === 'begin' && state.orderId) {
      const order = await paypal.readPayPalOrder(state.orderId);
      console.log(JSON.stringify({ existingOrder: true, status: order.status, approvalUrl: state.approvalUrl }));
    } else await deployedBrowser(origin,{A:a.clerk_user_id,B:b.clerk_user_id},async browser=>{
      const { signIn,navigate,wait,evaluate,call,discover,invoke,errors }=browser;
      await signIn('A'); sessions.add(await evaluate('window.Clerk.session.id'));
      await navigate('/dashboard/settings/credits');
      await wait('!!document.querySelector("#purchases-heading")&&!document.body.innerText.includes("Loading saved purchases…")');
      await discover();
      if(mode==='begin') {
        assert.ok(!state.orderId, 'ONE_FRESH_ORDER_ONLY');
        const webhook=await provider('/v1/notifications/webhooks/'+encodeURIComponent(config.webhookId));
        check('Sandbox webhook targets deployed payment endpoint',webhook.url===origin+'/api/payments/paypal/webhook');
        state.before=await account();state.protectedBefore=await protectedHash();
        const prior=await db.from('credit_purchases').select('id').eq('owner_user_id',a.id);assert.ok(!prior.error);state.priorPurchaseIds=prior.data.map(p=>p.id);state.startedAt=new Date().toISOString();save();
        await wait('Array.from(document.querySelectorAll("article")).some(c=>c.innerText.includes("Small Test Pack")&&Array.from(c.querySelectorAll("button")).some(b=>!b.disabled))');
        check('Settings exposes a working Small Test Pack',true);
        await evaluate('Array.from(document.querySelectorAll("article")).find(c=>c.innerText.includes("Small Test Pack")).querySelector("button").click()');
        await wait('location.hostname==="www.sandbox.paypal.com"');
        const approval=await evaluate('location.href'); const url=new URL(approval);
        assert.equal(url.origin,'https://www.sandbox.paypal.com');assert.equal(url.pathname,'/checkoutnow');
        state.orderId=paypal.paypalOrderId.parse(url.searchParams.get('token'));state.approvalUrl=approval;save();
        const p=await purchase();assert.equal(p.owner_user_id,a.id);
        const fresh=await db.from('credit_purchases').select('id').eq('owner_user_id',a.id);assert.ok(!fresh.error);
        check('checkout launched one new authoritative Sandbox purchase',fresh.data.filter(p=>!state.priorPurchaseIds.includes(p.id)).length===1&&p.credits===100&&p.amount_minor===100&&p.status==='pending');
        check('launch did not grant credits', (await account()).credit_available===state.before.credit_available);
        const order=await paypal.readPayPalOrder(state.orderId);paypal.verifyOrder(p,order);
        console.log(JSON.stringify({approvalUrl:state.approvalUrl,amount:'$1.00 USD Sandbox test funds',credits:100,evidenceFile:file}));
      } else {
        assert.ok(state.orderId,'BEGIN_FIRST');
        await purchase();
        assert.ok(['approved','completed'].includes((await paypal.readPayPalOrder(state.orderId)).status.toLowerCase()),'SANDBOX_BUYER_APPROVAL_REQUIRED');
        await call('Page.navigate',{url:origin+'/dashboard/settings/credits?checkout=return&token='+state.orderId});
        await wait('document.body.innerText.includes("credits added. Current paid balance:")');await discover();
        check('relocated callback returns to authenticated Credits and Billing',await evaluate('location.pathname==="/dashboard/settings/credits"'));
        const final=await verifySettlement();
        check('callback success shows exact grant and refreshed balance',await evaluate(`document.body.innerText.includes(${JSON.stringify(final.credits+' credits added. Current paid balance: '+state.available+' credits.')})`));
        for(let i=0;i<2;i++){const result=await invoke('completeCreditOrderAction',{orderId:state.orderId});check('duplicate capture completion '+(i+1)+' grants nothing extra',result.ok&&result.data.status==='completed'&&(await account()).credit_available===state.available);}
        await verifySettlement();
        await call('Page.reload');await wait('!document.body.innerText.includes("Loading saved purchases…")&&!!document.querySelector("#purchases-heading")');
        await discover();check('refresh preserves authoritative new balance',(await invoke('creditWalletAction')).data?.available===state.available);
        await navigate('/dashboard/settings/account');await navigate('/dashboard/settings/credits');await wait('!document.body.innerText.includes("Loading saved purchases…")&&!!document.querySelector("#purchases-heading")');await discover();
        const wallet=await invoke('creditWalletAction');check('reopen preserves balance and completed purchase history',wallet.ok&&wallet.data.available===state.available&&wallet.data.purchases.some(p=>p.orderId===state.orderId&&p.status==='completed'));
        await signIn('B');sessions.add(await evaluate('window.Clerk.session.id'));await navigate('/dashboard/settings/credits');await wait('!!document.querySelector("#purchases-heading")');await discover();
        check('B cannot capture or read A purchase',(await invoke('completeCreditOrderAction',{orderId:state.orderId})).ok===false&&!(await invoke('creditWalletAction')).data.purchases.some(p=>p.orderId===state.orderId));
        check('deployed payment browser has no application exceptions',errors.length===0);
        state.verifiedAt=new Date().toISOString();save();console.log(JSON.stringify({passed:state.checks.length,evidenceFile:file}));
      }
      await browser.close();
    });
  }
} finally {for(const id of sessions)try{if((await clerk.sessions.getSession(id)).status==='active')await clerk.sessions.revokeSession(id);}catch(error){if(error.status!==404)throw error;}}
