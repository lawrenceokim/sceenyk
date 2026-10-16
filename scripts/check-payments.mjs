// Actual SQL and payment service/REST adapter; explicit PayPal/Clerk fixtures.
// No hosted writes, real payment, browser approval or multi-connection claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite();
let count = 0;
const check = (name, value) => { assert.ok(value, name); count++; };
const one = async (sql, args = []) => (await pg.query(sql, args)).rows[0];
const scalar = async (sql, args = []) => (await one(sql, args))?.value;
async function rejects(name, fn) { await assert.rejects(fn); count++; }
let queue = Promise.resolve();
const serialize = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
const db = {
  rpc(name, args = {}) { return serialize(async () => {
    await pg.exec('set role service_role');
    try { return { data: await scalar(`select ${name}(${Object.keys(args).map((key, index) => `${key}=>$${index + 1}`).join(',')}) as value`, Object.values(args)), error: null }; }
    catch (error) { return { data: null, error: { code: error.code } }; }
    finally { await pg.exec('reset role'); }
  }); },
  from(table) {
    const filters = [], args = []; let fields = '*', order = '', limit = '';
    return {
      select(value) { fields = value; return this; },
      eq(key, value) { args.push(value); filters.push(`${key}=$${args.length}`); return this; },
      in(key, values) { args.push(values); filters.push(`${key}=any($${args.length})`); return this; },
      not(key, op, value) { assert.equal(op, 'is'); assert.equal(value, null); filters.push(`${key} is not null`); return this; },
      order(key, options) { order = ` order by ${key} ${options?.ascending === false ? 'desc' : 'asc'}`; return this; },
      limit(value) { limit = ` limit ${Number(value)}`; return this; },
      then(resolve, reject) { return this.execute(false).then(resolve, reject); },
      single() { return this.execute(true); }, maybeSingle() { return this.execute(true); },
      execute(single) { return serialize(async () => {
        await pg.exec('set role service_role');
        try { const rows = (await pg.query(`select ${fields} from ${table}${filters.length ? ' where ' + filters.join(' and ') : ''}${order}${limit}`, args)).rows; return { data: single ? rows[0] ?? null : rows, error: null }; }
        catch (error) { return { data: null, error: { code: error.code } }; }
        finally { await pg.exec('reset role'); }
      }); },
    };
  },
};
const call = async (name, args) => { const result = await db.rpc(name, args); assert.equal(result.error, null, name); return result.data; };
const names = ['PAYPAL_ENVIRONMENT', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_RETURN_ORIGIN', 'SCEENYK_LOW_CREDIT_THRESHOLD'];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
Object.assign(process.env, { PAYPAL_ENVIRONMENT: 'sandbox', PAYPAL_CLIENT_ID: 'fixture-client', PAYPAL_CLIENT_SECRET: 'fixture-secret', PAYPAL_WEBHOOK_ID: 'fixture-webhook', PAYPAL_RETURN_ORIGIN: 'http://localhost:3000' });
delete process.env.SCEENYK_LOW_CREDIT_THRESHOLD;
let owner, httpCalls = 0, captures = 0, creates = 0, lostCreate = false, lostCapture = false, invalidSignature = false, verificationBody;
const orders = new Map(), requestOrders = new Map();
const fetchFixture = async (url, init) => {
  httpCalls++;
  assert.ok(String(url).startsWith('https://api-m.sandbox.paypal.com/'), 'all HTTP is fixed Sandbox');
  assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
  if (String(url).endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'fixture-token', token_type: 'Bearer' });
  if (String(url).endsWith('/verify-webhook-signature')) { verificationBody = init.body; return Response.json({ verification_status: invalidSignature ? 'FAILURE' : 'SUCCESS' }); }
  if (String(url).endsWith('/v2/checkout/orders')) {
    const body = JSON.parse(init.body), key = init.headers['PayPal-Request-ID'];
    assert.equal(body.payment_source.paypal.experience_context.shipping_preference, 'NO_SHIPPING');
    assert.equal(body.payment_source.paypal.experience_context.return_url, 'http://localhost:3000/dashboard/settings/credits?checkout=return');
    let id = requestOrders.get(key);
    if (!id) { id = `ORDER${String(++creates).padStart(12, '0')}`; requestOrders.set(key, id);
      orders.set(id, { id, intent: 'CAPTURE', status: 'PAYER_ACTION_REQUIRED', purchase_units: body.purchase_units,
        links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] }); }
    if (lostCreate) { lostCreate = false; throw new Error('Fixture create response lost'); }
    return Response.json(orders.get(id));
  }
  const id = String(url).split('/')[6], order = orders.get(id);
  assert.ok(order, 'fixture order exists');
  if (String(url).endsWith('/capture')) {
    if (order.status !== 'APPROVED') return Response.json({}, { status: 422 });
    captures++;
    order.status = 'COMPLETED';
    order.purchase_units[0].payments = { captures: [{ id: `CAPTURE${String(captures).padStart(10, '0')}`, status: 'COMPLETED', final_capture: true, amount: order.purchase_units[0].amount }] };
    if (lostCapture) { lostCapture = false; throw new Error('Fixture capture response lost'); }
  }
  return Response.json(order);
};
const load = typescriptLoader({ '@/lib/db/server': { createDatabaseClient: () => db }, '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!owner) throw new Error('Unauthenticated'); return { id: owner }; } } }, { fetch: fetchFixture, Headers, Request, Response });
const service = load('lib/payments/server.ts'), client = load('lib/payments/paypal/client.ts'), config = load('lib/payments/paypal/config.ts');
const wallet = () => service.getCreditWallet();
const prepare = async (user = owner, pack = 'fixture', credits = 100) => call('prepare_credit_purchase', { p_owner_user_id: user, p_pack_id: pack, p_pack_name: pack, p_amount_minor: 100, p_currency: 'USD', p_credits: credits });
const fulfil = (p, capture = 'CAPTURE1234567890', changes = {}) => call('fulfil_paypal_purchase', { p_owner_user_id: p.owner_user_id, p_order_id: p.paypal_order_id, p_capture_id: capture, p_amount_minor: p.amount_minor, p_currency: p.currency, ...changes });
async function denied(name, sql, args = [], role = 'authenticated') {
  await pg.exec(`set role ${role}`);
  try { await rejects(name, () => pg.query(sql, args)); } finally { await pg.exec('reset role'); }
}
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of fs.readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort()) await pg.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
  const a = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  const b = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  owner = a;
  const project = await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Payment accounting fixture','cinematic','16:9','10','Original','Storytelling') returning id as value", [a]);
  const snapshot = { version: 1, prompt: 'No provider is invoked', category: 'cinematic', settings: { duration: '10', aspectRatio: '16:9', visualStyle: 'Original', tone: 'Storytelling' }, assetIds: [] };
  async function reserve(input, cost = null) {
    const quote = await call('issue_generation_quote', { p_owner_user_id: a, p_project_id: project, p_request_id: randomUUID(), p_snapshot: input, p_credit_cost: cost, p_pricing_version: 'fixture-v1', p_pricing_mode: cost === null ? 'unconfigured' : 'test' });
    const result = await call('confirm_generation_quote', { p_owner_user_id: a, p_quote_id: quote.quote.id, p_current_pricing_version: 'fixture-v1' });
    assert.equal(result.code, 'ACCEPTED');
    return result.job_id;
  }
  const freeJob = await reserve(snapshot);
  const originalReservation = await one('select * from generation_reservations where job_id=$1', [freeJob]);
  check('new user paid balance zero', (await wallet()).available === 0);
  check('zero paid balance has central low-credit notice and empty activity', (await wallet()).lowBalance && (await wallet()).activity.length === 0);
  for (const claim of [{ packId: 'sandbox-small-v1', amount: '0.01' }, { packId: 'sandbox-small-v1', credits: 99999 }, { packId: 'sandbox-small-v1', owner: b }, { packId: 'unknown' }]) await rejects('browser commercial/owner tampering rejected', () => service.createCreditOrder(claim));
  check('invalid input causes no PayPal HTTP', httpCalls === 0);
  owner = null; await rejects('signed out create denied', () => service.createCreditOrder({ packId: 'sandbox-small-v1' })); owner = a;
  const created = await service.createCreditOrder({ packId: 'sandbox-small-v1' });
  check('Sandbox order redirects to Sandbox and grants nothing', created.approvalUrl.startsWith('https://www.sandbox.paypal.com/') && (await wallet()).available === 0);
  check('repeat create reuses order/request/snapshot', (await service.createCreditOrder({ packId: 'sandbox-small-v1' })).orderId === created.orderId && creates === 1);
  check('unapproved reconciliation grants nothing', (await service.completeCreditOrder({ orderId: created.orderId })).status === 'pending' && captures === 0);
  owner = b; const beforeB = httpCalls;
  await rejects('B cannot capture A order', () => service.completeCreditOrder({ orderId: created.orderId }));
  check('ownership denied before any PayPal HTTP', httpCalls === beforeB && (await wallet()).available === 0); owner = a;
  orders.get(created.orderId).status = 'APPROVED';
  const completed = await Promise.all([service.completeCreditOrder({ orderId: created.orderId }), service.completeCreditOrder({ orderId: created.orderId })]);
  check('concurrent completion grants exactly one effect', completed.every(r => r.status === 'completed') && (await wallet()).available === 100 && captures === 1);
  check('refresh and duplicate completion preserve balance', (await service.completeCreditOrder({ orderId: created.orderId })).status === 'completed' && (await wallet()).available === 100);
  const initialWallet = await wallet();
  check('wallet exposes safe human activity without internal or provider fields', initialWallet.activity.length === 1 && initialWallet.activity[0].type === 'purchase' && initialWallet.activity[0].availableDelta === 100 && Object.keys(initialWallet.activity[0]).sort().join(',') === 'amount,availableDelta,createdAt,type');
  check('funded account above central threshold clears warning', !initialWallet.lowBalance);
  process.env.SCEENYK_LOW_CREDIT_THRESHOLD = '100';
  check('low-credit threshold is centrally configurable and inclusive', (await wallet()).lowBalance);
  delete process.env.SCEENYK_LOW_CREDIT_THRESHOLD;
  owner = b;
  check('User B wallet excludes User A balance purchases and ledger activity', (await wallet()).available === 0 && (await wallet()).purchases.length === 0 && (await wallet()).activity.length === 0);
  owner = a;
  const p = await one('select * from credit_purchases where paypal_order_id=$1', [created.orderId]);
  const ledger = await one('select * from credit_ledger where purchase_id=$1', [p.id]);
  check('immutable purchase ledger records exact owner/credits/references', ledger.type === 'purchase' && ledger.amount === 100 && ledger.owner_user_id === a && ledger.paypal_order_id === created.orderId && ledger.paypal_capture_id === p.paypal_capture_id && ledger.reference_key === `paypal:sandbox:${created.orderId}:${p.paypal_capture_id}` && ledger.job_id === null);
  check('free totals and held balances unchanged', (await one('select * from generation_accounts where owner_user_id=$1', [a])).free_total === 2 && (await wallet()).reserved === 0);
  check('purchase preserves original in-flight free reservation and counters', (await one('select free_reserved from generation_accounts where owner_user_id=$1', [a])).free_reserved === 1 && JSON.stringify(await one('select * from generation_reservations where job_id=$1', [freeJob])) === JSON.stringify(originalReservation));
  check('mismatched duplicate capture cannot fulfil', !await fulfil(p, 'CAPTURE9999999999'));
  for (const changes of [{ p_amount_minor: 1 }, { p_currency: 'EUR' }, { p_owner_user_id: b }, { p_amount_minor: null }, { p_currency: null }]) check('SQL wrong owner/value/null proof denied', !await fulfil(p, p.paypal_capture_id, changes));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await denied(`${role} cannot mint balance directly`, 'update generation_accounts set credit_available=99999 where owner_user_id=$1', [a], role);
    await denied(`${role} cannot write ledger`, "insert into credit_ledger(owner_user_id,amount,type,direction,available_delta,reserved_delta,reason,reference_key) values($1,1,'purchase','credit',1,0,'purchase','forged')", [a], role);
    await denied(`${role} cannot mutate purchase directly`, "update credit_purchases set credits=99999 where id=$1", [p.id], role);
    if (role !== 'service_role') {
      await denied(`${role} cannot read purchases`, 'select * from credit_purchases', [], role);
      await denied(`${role} cannot invoke fulfilment`, 'select fulfil_paypal_purchase($1,$2,$3,100,\'USD\')', [a, p.paypal_order_id, p.paypal_capture_id], role);
    }
  }
  await denied('ledger immutable even to SQL owner', 'delete from credit_ledger where id=$1', [ledger.id], 'postgres');
  await denied('completed purchase immutable even to SQL owner', "update credit_purchases set status='failed' where id=$1", [p.id], 'postgres');
  await denied('purchase snapshot immutable', 'update credit_purchases set amount_minor=1 where id=$1', [p.id], 'postgres');
  const cancelled = await service.createCreditOrder({ packId: 'sandbox-medium-v1' });
  check('cancelled unapproved payment grants zero', (await service.completeCreditOrder({ orderId: cancelled.orderId }, true)).status === 'cancelled' && (await wallet()).available === 100);
  orders.get(cancelled.orderId).status = 'APPROVED';
  check('cancelled order not newly captured by reconciliation', (await service.completeCreditOrder({ orderId: cancelled.orderId })).status === 'cancelled' && captures === 1);
  const failed = await service.createCreditOrder({ packId: 'sandbox-large-v1' }); orders.get(failed.orderId).status = 'VOIDED';
  check('verified failed order grants zero', (await service.completeCreditOrder({ orderId: failed.orderId })).status === 'failed' && (await wallet()).available === 100);
  const declined = await service.createCreditOrder({ packId: 'sandbox-large-v1' });
  const declinedOrder = orders.get(declined.orderId); declinedOrder.status = 'COMPLETED';
  declinedOrder.purchase_units[0].payments = { captures: [{ id: 'CAPTURE5555555555', status: 'DECLINED', final_capture: true, amount: declinedOrder.purchase_units[0].amount }] };
  check('completed order with declined capture fails without credit', (await service.completeCreditOrder({ orderId: declined.orderId })).status === 'failed' && (await wallet()).available === 100);
  const recover = await service.createCreditOrder({ packId: 'sandbox-small-v1' }); orders.get(recover.orderId).status = 'APPROVED'; lostCapture = true;
  check('lost capture response recovers verified order once', (await service.completeCreditOrder({ orderId: recover.orderId })).status === 'completed' && (await wallet()).available === 200 && captures === 2);
  lostCreate = true;
  await rejects('lost create response remains pending', () => service.createCreditOrder({ packId: 'sandbox-small-v1' }));
  const createRecovered = await service.createCreditOrder({ packId: 'sandbox-small-v1' });
  check('create retry uses original request ID without second order', creates === 6 && !!createRecovered.orderId);
  orders.get(createRecovered.orderId).status = 'APPROVED';
  const event = { id: 'WH-fixture', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: createRecovered.orderId } };
  await service.handleVerifiedPayPalEvent(event); await service.handleVerifiedPayPalEvent(event);
  check('browser disappearance and duplicate webhook recover once', (await wallet()).available === 300 && captures === 3);
  const captureEvent = { id: 'WH-capture', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'ignored-fixture', supplementary_data: { related_ids: { order_id: createRecovered.orderId } } } };
  await service.handleVerifiedPayPalEvent(captureEvent);
  check('capture callback duplicates grant nothing extra', (await wallet()).available === 300);
  const headers = new Headers({ 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/FIXTURE', 'paypal-transmission-id': 'fixture', 'paypal-transmission-sig': 'fixture', 'paypal-transmission-time': new Date().toISOString() });
  const raw = JSON.stringify(event, null, 2);
  check('unsigned webhook rejected', !await client.verifyPayPalWebhook(raw, new Headers()));
  check('official signature postback required', await client.verifyPayPalWebhook(raw, headers) && verificationBody.includes(`"webhook_event":${raw}`));
  invalidSignature = true; check('forged signature fails closed', !await client.verifyPayPalWebhook(raw, headers)); invalidSignature = false;
  const badHeaders = new Headers(headers); badHeaders.set('paypal-cert-url', 'https://attacker.invalid/cert');
  check('untrusted certificate URL rejected', !await client.verifyPayPalWebhook(raw, badHeaders));
  const route = load('app/api/payments/paypal/webhook/route.ts');
  check('actual webhook handler refuses unsigned event', (await route.POST(new Request('http://localhost/api/payments/paypal/webhook', { method: 'POST', body: raw }))).status === 400);
  check('actual verified webhook retries are idempotent', (await route.POST(new Request('http://localhost/api/payments/paypal/webhook', { method: 'POST', headers, body: raw }))).status === 200 && (await wallet()).available === 300);
  check('oversized webhook refused', (await route.POST(new Request('http://localhost/api/payments/paypal/webhook', { method: 'POST', headers, body: 'x'.repeat(262145) }))).status === 503);
  const notYetApproved = await service.createCreditOrder({ packId: 'sandbox-large-v1' });
  const delayedEvent = { id: 'WH-delayed', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: notYetApproved.orderId } };
  check('authentic approval with not-yet-visible order state requests redelivery', (await route.POST(new Request('http://localhost/api/payments/paypal/webhook', { method: 'POST', headers, body: JSON.stringify(delayedEvent) }))).status === 503 && (await wallet()).available === 300);
  const previousFulfil = db.rpc;
  const unpaid = orders.get(notYetApproved.orderId); unpaid.status = 'APPROVED';
  db.rpc = (name, args) => name === 'fulfil_paypal_purchase' ? Promise.resolve({ data: null, error: { code: 'fixture-unavailable' } }) : previousFulfil(name, args);
  check('verified payment with DB failure is not acknowledged', (await route.POST(new Request('http://localhost/api/payments/paypal/webhook', { method: 'POST', headers, body: JSON.stringify(delayedEvent) }))).status === 503 && (await wallet()).available === 300);
  db.rpc = previousFulfil;
  check('provider redelivery recovers committed capture without recapture', (await route.POST(new Request('http://localhost/api/payments/paypal/webhook', { method: 'POST', headers, body: JSON.stringify(delayedEvent) }))).status === 200 && (await wallet()).available === 950);
  const actualOrder = orders.get(createRecovered.orderId);
  for (const change of [o => o.id = 'ORDER999999999999', o => o.purchase_units[0].amount.value = '0.01', o => o.purchase_units[0].amount.currency_code = 'EUR', o => o.purchase_units[0].custom_id = randomUUID(), o => o.purchase_units[0].payments.captures[0].final_capture = false, o => o.purchase_units[0].payments.captures[0].status = 'PENDING']) {
    const changed = structuredClone(actualOrder); change(changed);
    const savedPurchase = await one('select * from credit_purchases where paypal_order_id=$1', [createRecovered.orderId]);
    assert.throws(() => client.verifiedCapture(savedPurchase, changed)); count++;
  }
  const unsafe = structuredClone(actualOrder); unsafe.links[0].href = 'https://www.paypal.com/checkoutnow?token=' + unsafe.id;
  assert.throws(() => client.approvalUrl(unsafe)); count++;
  const approved = await service.createCreditOrder({ packId: 'sandbox-small-v1' }); orders.get(approved.orderId).status = 'APPROVED';
  const recovered = await service.reconcileOwnedCreditOrders();
  check('owned on-demand reconciliation recovers approved payment', recovered.recovered === 1 && (await wallet()).available === 1050);
  check('recovery identifies the verified owned purchase for exact success copy', recovered.recoveredOrders.length === 1 && recovered.recoveredOrders[0] === approved.orderId);
  // Unique capture reuse rolls back ledger, purchase status and account together.
  const conflict = await prepare(a, 'conflict'); await call('attach_paypal_order', { p_purchase_id: conflict.id, p_owner_user_id: a, p_order_id: 'ORDER888888888888' }); conflict.paypal_order_id = 'ORDER888888888888';
  const collision = await db.rpc('fulfil_paypal_purchase', { p_owner_user_id: a, p_order_id: conflict.paypal_order_id, p_capture_id: p.paypal_capture_id, p_amount_minor: 100, p_currency: 'USD' });
  check('unique capture collision rolls entire transaction back', !!collision.error && (await wallet()).available === 1050 && (await one('select status from credit_purchases where id=$1', [conflict.id])).status === 'pending');
  const paidJob = await reserve({ ...snapshot, settings: { ...snapshot.settings, duration: '15' } }, 10);
  const paidReservation = await one('select * from generation_reservations where job_id=$1', [paidJob]);
  const paidLedger = await one('select * from credit_ledger where job_id=$1', [paidJob]);
  check('purchased credits fund future existing quote admission', (await wallet()).available === 1040 && (await wallet()).reserved === 10 && paidLedger.type === 'reservation');
  const alongside = await service.createCreditOrder({ packId: 'sandbox-medium-v1' }); orders.get(alongside.orderId).status = 'APPROVED';
  await service.completeCreditOrder({ orderId: alongside.orderId });
  check('purchase leaves paid reservation and original movement immutable', (await wallet()).available === 1390 && (await wallet()).reserved === 10 && JSON.stringify(await one('select * from generation_reservations where job_id=$1', [paidJob])) === JSON.stringify(paidReservation) && JSON.stringify(await one('select * from credit_ledger where job_id=$1', [paidJob])) === JSON.stringify(paidLedger));
  await call('claim_generation_job', { p_job_id: paidJob, p_run_id: 'fixture-run' });
  await call('fail_generation_claim', { p_job_id: paidJob, p_run_id: 'fixture-run' });
  await call('fail_generation_claim', { p_job_id: paidJob, p_run_id: 'fixture-run' });
  check('existing paid failure restoration still works exactly once after purchase migration', (await wallet()).available === 1400 && (await wallet()).reserved === 0 && Number(await scalar("select count(*) as value from credit_ledger where job_id=$1 and type='release'", [paidJob])) === 1);
  check('activity includes authoritative reservation and restoration movements', (await wallet()).activity.some(entry => entry.type === 'reservation' && entry.availableDelta === -10) && (await wallet()).activity.some(entry => entry.type === 'release' && entry.availableDelta === 10));
  const totals = await one('select sum(available_delta) as available,sum(reserved_delta) as reserved from credit_ledger where owner_user_id=$1', [a]);
  check('all purchase and generation ledger movements reconcile to balance', Number(totals.available) === 1400 && Number(totals.reserved) === 0);
  const cancelledPaid = await service.createCreditOrder({ packId: 'sandbox-small-v1' });
  await service.completeCreditOrder({ orderId: cancelledPaid.orderId }, true);
  // Trusted completion can race cancellation, but never produces two effects.
  const cancelledRow = await one('select * from credit_purchases where paypal_order_id=$1', [cancelledPaid.orderId]);
  check('verified capture wins cancellation race once', await fulfil(cancelledRow, 'CAPTURE7777777777') && await fulfil(cancelledRow, 'CAPTURE7777777777') && (await wallet()).available === 1500);
  const early = await prepare(a, 'early-webhook');
  const earlyOrderId = 'ORDER666666666666';
  orders.set(earlyOrderId, { id: earlyOrderId, intent: 'CAPTURE', status: 'APPROVED', purchase_units: [{ reference_id: early.id, custom_id: early.id, invoice_id: early.id, amount: { value: '1.00', currency_code: 'USD' } }] });
  await service.handleVerifiedPayPalEvent({ id: 'WH-early', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: earlyOrderId } });
  check('authentic early webhook attaches lost-create identity then fulfils', (await wallet()).available === 1600 && (await one('select paypal_order_id from credit_purchases where id=$1', [early.id])).paypal_order_id === earlyOrderId);
  // Explicit provider fixtures: exercise verified PENDING/DENIED semantics,
  // which a successful real buyer payment does not naturally generate.
  const pendingCapture = await service.createCreditOrder({ packId: 'sandbox-large-v1' });
  const pendingOrder = orders.get(pendingCapture.orderId); pendingOrder.status = 'COMPLETED';
  pendingOrder.purchase_units[0].payments = { captures: [{ id: 'CAPTURE2222222222', status: 'PENDING', final_capture: true, amount: pendingOrder.purchase_units[0].amount }] };
  const pendingEvent = { id: 'WH-pending-fixture', event_type: 'PAYMENT.CAPTURE.PENDING', resource: { id: 'CAPTURE2222222222', supplementary_data: { related_ids: { order_id: pendingCapture.orderId } } } };
  const pendingResponse = await route.POST(new Request('http://localhost/api/payments/paypal/webhook', { method: 'POST', headers, body: JSON.stringify(pendingEvent) }));
  const pendingPurchase = await one('select * from credit_purchases where paypal_order_id=$1', [pendingCapture.orderId]);
  check('verified pending capture requests recovery without premature credits', pendingResponse.status === 503 && (await wallet()).available === 1600 && Number(await scalar('select count(*) as value from credit_ledger where purchase_id=$1', [pendingPurchase.id])) === 0);
  pendingOrder.purchase_units[0].payments.captures[0].status = 'DECLINED';
  const deniedEvent = { ...pendingEvent, id: 'WH-denied-fixture', event_type: 'PAYMENT.CAPTURE.DENIED' };
  const deniedResponse = await route.POST(new Request('http://localhost/api/payments/paypal/webhook', { method: 'POST', headers, body: JSON.stringify(deniedEvent) }));
  check('verified denied notification persists failed purchase with zero credits', deniedResponse.status === 200 && (await wallet()).available === 1600 && (await one('select status from credit_purchases where id=$1', [pendingPurchase.id])).status === 'failed');
  const completedOnly = await service.createCreditOrder({ packId: 'sandbox-large-v1' });
  const completedOrder = orders.get(completedOnly.orderId); completedOrder.status = 'COMPLETED';
  completedOrder.purchase_units[0].payments = { captures: [{ id: 'CAPTURE3333333333', status: 'COMPLETED', final_capture: true, amount: completedOrder.purchase_units[0].amount }] };
  const completedEvent = { id: 'WH-completed-only-fixture', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAPTURE3333333333', supplementary_data: { related_ids: { order_id: completedOnly.orderId } } } };
  const completeDelivery = () => route.POST(new Request('http://localhost/api/payments/paypal/webhook', { method: 'POST', headers, body: JSON.stringify(completedEvent) }));
  check('completed capture alone fulfils once without any ORDER.COMPLETED notification', (await completeDelivery()).status === 200 && (await completeDelivery()).status === 200 && (await wallet()).available === 2250);
  process.env.PAYPAL_ENVIRONMENT = 'live'; check('Live rejected explicitly', !config.isPayPalConfigured()); await rejects('Live cannot call PayPal', () => service.createCreditOrder({ packId: 'sandbox-small-v1' }));
  process.env.PAYPAL_ENVIRONMENT = 'sandbox'; process.env.PAYPAL_RETURN_ORIGIN = 'http://attacker.invalid'; check('insecure nonlocal return URL rejected', !config.isPayPalConfigured());
  process.env.PAYPAL_RETURN_ORIGIN = 'http://localhost:3000';
  const savedPublicSecret = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_SECRET;
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_SECRET = 'fixture-public-secret';
  check('public secret misconfiguration rejected', !config.isPayPalConfigured());
  if (savedPublicSecret === undefined) delete process.env.NEXT_PUBLIC_PAYPAL_CLIENT_SECRET; else process.env.NEXT_PUBLIC_PAYPAL_CLIENT_SECRET = savedPublicSecret;
  console.log(JSON.stringify({ passed: count, paypal: 'fixture', database: 'isolated PostgreSQL', realSandboxAcceptance: false }));
} finally {
  await pg.close();
  for (const name of names) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
}
