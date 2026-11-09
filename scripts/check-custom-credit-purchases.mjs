// Essential, offline payment checks only. Disposable SQL and mocked PayPal;
// no browser, real HTTP, hosted writes or generation/provider execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite();
const settings = ['PAYPAL_ENVIRONMENT', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_RETURN_ORIGIN',
  'SCEENYK_CREDIT_PAYPAL_FEE_BPS', 'SCEENYK_CREDIT_PAYPAL_FIXED_FEE_CENTS', 'SCEENYK_CREDIT_COMMISSION_BPS'];
const saved = Object.fromEntries(settings.map(name => [name, process.env[name]]));
Object.assign(process.env, { PAYPAL_ENVIRONMENT: 'sandbox', PAYPAL_CLIENT_ID: 'fixture', PAYPAL_CLIENT_SECRET: 'fixture',
  PAYPAL_WEBHOOK_ID: 'fixture', PAYPAL_RETURN_ORIGIN: 'http://localhost:3000' });
for (const name of settings.filter(name => name.startsWith('SCEENYK_'))) delete process.env[name];

const scalar = async (sql, args = []) => (await pg.query(sql, args)).rows[0]?.value;
let queue = Promise.resolve();
function serialize(fn) { const result = queue.then(fn); queue = result.catch(() => {}); return result; }
const db = {
  rpc(name, args) { return serialize(async () => {
    await pg.exec('set role service_role');
    try { return { data: await scalar(`select ${name}(${Object.keys(args).map((key, index) => `${key}=>$${index + 1}`).join(',')}) as value`, Object.values(args)), error: null }; }
    catch (error) { return { data: null, error: { code: error.code } }; }
    finally { await pg.exec('reset role'); }
  }); },
  from(table) {
    const filters = [], args = [];
    return { select() { return this; }, eq(key, value) { args.push(value); filters.push(`${key}=$${args.length}`); return this; },
      maybeSingle() { return serialize(async () => {
        await pg.exec('set role service_role');
        try { return { data: (await pg.query(`select * from ${table} where ${filters.join(' and ')}`, args)).rows[0] ?? null, error: null }; }
        finally { await pg.exec('reset role'); }
      }); } };
  },
};
let owner, http = 0, creates = 0, captures = 0;
const orders = new Map(), requestIds = new Map();
const fetchFixture = async (url, init) => {
  http++;
  assert.ok(String(url).startsWith('https://api-m.sandbox.paypal.com/'));
  assert.equal(init.redirect, 'error');
  if (String(url).endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'fixture', token_type: 'Bearer' });
  if (String(url).endsWith('/verify-webhook-signature')) return Response.json({ verification_status: 'FAILURE' });
  if (String(url).endsWith('/v2/checkout/orders')) {
    const requestId = init.headers['PayPal-Request-ID'];
    if (requestIds.has(requestId)) return Response.json(orders.get(requestIds.get(requestId)));
    const id = `ORDER${String(++creates).padStart(12, '0')}`;
    const body = JSON.parse(init.body);
    const order = { id, intent: 'CAPTURE', status: 'PAYER_ACTION_REQUIRED', purchase_units: body.purchase_units,
      links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] };
    orders.set(id, order); requestIds.set(requestId, id); return Response.json(order);
  }
  const order = orders.get(String(url).split('/')[6]);
  assert.ok(order);
  if (String(url).endsWith('/capture')) {
    assert.equal(order.status, 'APPROVED');
    order.status = 'COMPLETED';
    order.purchase_units[0].payments = { captures: [{ id: `CAPTURE${String(++captures).padStart(10, '0')}`,
      status: 'COMPLETED', final_capture: true, amount: order.purchase_units[0].amount }] };
  }
  return Response.json(order);
};
const load = typescriptLoader({ '@/lib/db/server': { createDatabaseClient: () => db }, '@/lib/auth/ensure-app-user': {
  ensureAppUser: async () => { if (!owner) throw new Error('Unauthenticated'); return { id: owner }; },
} }, { fetch: fetchFixture });
const math = load('lib/payments/credit-pricing.ts');
const config = load('lib/payments/credit-pricing-config.ts');
const service = load('lib/payments/server.ts');
const client = load('lib/payments/paypal/client.ts');

try {
  const pricing = config.getCreditPurchasePricing();
  for (const [amount, paypal, commission, credits] of [[100, 52, 1, 47], [500, 66, 5, 429], [1000, 84, 10, 906], [53, 51, 1, 1]]) {
    const quote = math.calculateCreditPurchase(amount, pricing);
    assert.deepEqual([quote.paypalFeeMinor, quote.commissionMinor, quote.credits], [paypal, commission, credits]);
  }
  assert.throws(() => math.calculateCreditPurchase(52, pricing));
  for (const input of ['0', '-1', '1.001', '1e2', 'Infinity', 'NaN', '1000.01', ' 5.00', '01.00', '5.00junk']) assert.throws(() => math.parseCreditPaymentAmount(input));
  assert.equal(math.parseCreditPaymentAmount('1000.00'), 100000);
  assert.equal(math.calculateCreditPurchase(150, { ...pricing, paypalBasisPoints: 100, paypalFixedMinor: 0, commissionBasisPoints: 0 }).paypalFeeMinor, 2);
  assert.equal(math.generationCreditsFromMicrousd(2060000), 206);
  assert.equal(math.generationCreditsFromMicrousd(1028335), 103);
  process.env.SCEENYK_CREDIT_PAYPAL_FEE_BPS = '';
  assert.throws(() => config.getCreditPurchasePricing());
  delete process.env.SCEENYK_CREDIT_PAYPAL_FEE_BPS;

  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  // Only the existing payment prerequisites, not the unrelated 100-migration suite.
  for (const file of fs.readdirSync('supabase/migrations').filter(file => /^202610(0[89]|1[0-3])/.test(file) && file.endsWith('.sql')).sort()) {
    if (Number(file.match(/(\d{3})00_/)[1]) <= 17) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  const a = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  const b = await scalar('insert into app_users(clerk_user_id) values($1) returning id as value', [randomUUID()]);
  owner = a;
  // Persist legacy terms before applying the new migration.
  const legacy = (await db.rpc('prepare_credit_purchase', { p_owner_user_id: a, p_pack_id: 'sandbox-small-v1', p_pack_name: 'Small Test Pack',
    p_amount_minor: 100, p_currency: 'USD', p_credits: 100 })).data;
  assert.ok(legacy);
  const migration = fs.readFileSync('supabase/migrations/20261109010100_custom_credit_purchases.sql', 'utf8');
  await pg.exec(migration);
  await pg.exec(migration); // Rerun preserves old records and installed security.
  assert.equal(await scalar('select pricing_snapshot is null as value from credit_purchases where id=$1', [legacy.id]), true);

  const input = { amountUsd: '5.00', pricingVersion: pricing.version };
  const first = await service.createCreditOrder(input);
  const second = await service.createCreditOrder(input);
  assert.equal(first.orderId, second.orderId);
  assert.equal(creates, 1);
  const purchase = (await pg.query('select * from credit_purchases where paypal_order_id=$1', [first.orderId])).rows[0];
  assert.equal(purchase.credits, 429);
  assert.equal(purchase.pricing_snapshot.paypalFeeMinor, 66);
  assert.equal(await scalar('select credit_available as value from generation_accounts where owner_user_id=$1', [a]), 0);
  const beforeRejected = http;
  await assert.rejects(() => service.createCreditOrder({ ...input, credits: 999999 }));
  await assert.rejects(() => service.createCreditOrder({ packId: 'sandbox-large-v1' }));
  await assert.rejects(() => service.createCreditOrder({ ...input, amountUsd: '0.52' }));
  process.env.SCEENYK_CREDIT_COMMISSION_BPS = '200';
  await assert.rejects(() => service.createCreditOrder(input));
  assert.equal(http, beforeRejected);
  const resumed = await service.createCreditOrder({ purchaseId: purchase.id });
  assert.equal(resumed.orderId, first.orderId);
  assert.equal(creates, 1);
  owner = b;
  const beforeOtherUser = http;
  await assert.rejects(() => service.createCreditOrder({ purchaseId: purchase.id }));
  await assert.rejects(() => service.completeCreditOrder({ orderId: first.orderId }));
  assert.equal(http, beforeOtherUser);
  owner = null;
  await assert.rejects(() => service.createCreditOrder(input));
  assert.equal(http, beforeOtherUser);
  owner = a;

  orders.get(first.orderId).purchase_units[0].amount.value = '6.00';
  await assert.rejects(() => service.completeCreditOrder({ orderId: first.orderId }));
  assert.equal(captures, 0);
  orders.get(first.orderId).purchase_units[0].amount.value = '5.00';
  assert.equal((await service.completeCreditOrder({ orderId: first.orderId })).status, 'pending');
  orders.get(first.orderId).status = 'APPROVED';
  const completions = await Promise.all([service.completeCreditOrder({ orderId: first.orderId }), service.completeCreditOrder({ orderId: first.orderId })]);
  assert.ok(completions.every(result => result.status === 'completed'));
  await service.completeCreditOrder({ orderId: first.orderId });
  await service.handleVerifiedPayPalEvent({ id: 'fixture-event', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { supplementary_data: { related_ids: { order_id: first.orderId } } } });
  assert.equal(captures, 1);
  assert.equal(await scalar('select count(*)::integer as value from credit_ledger where purchase_id=$1', [purchase.id]), 1);
  assert.equal(await scalar('select credit_available as value from generation_accounts where owner_user_id=$1', [a]), 429);
  await assert.rejects(() => pg.query("update credit_purchases set pricing_snapshot='{}' where id=$1", [purchase.id]));
  const headers = new Headers({ 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/fixture',
    'paypal-transmission-id': 'fixture', 'paypal-transmission-sig': 'fixture', 'paypal-transmission-time': new Date().toISOString() });
  assert.equal(await client.verifyPayPalWebhook('{}', headers), false);

  // Legacy grants keep their stored 100 credits rather than applying new fees.
  const oldCheckout = await service.createCreditOrder({ purchaseId: legacy.id });
  assert.equal(orders.get(oldCheckout.orderId).purchase_units[0].amount.value, '1.00');
  orders.get(oldCheckout.orderId).status = 'APPROVED';
  await service.completeCreditOrder({ orderId: oldCheckout.orderId });
  assert.equal(await scalar('select credit_available as value from generation_accounts where owner_user_id=$1', [a]), 529);
  assert.equal(await scalar('select free_total-free_reserved-free_consumed as value from generation_accounts where owner_user_id=$1', [a]), 2);
  process.env.PAYPAL_ENVIRONMENT = 'live';
  const beforeLive = http;
  await assert.rejects(() => service.createCreditOrder({ purchaseId: legacy.id }));
  assert.equal(http, beforeLive);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await pg.exec(`set role ${role}`);
    try {
      await assert.rejects(() => pg.exec('update generation_accounts set credit_available=999999'));
      await assert.rejects(() => pg.exec('update credit_purchases set credits=999999'));
      if (role !== 'service_role') await assert.rejects(() => pg.query('select prepare_custom_credit_purchase($1,500,349,49,100,$2)', [a, pricing.version]));
    } finally { await pg.exec('reset role'); }
  }
  console.log('Essential custom-credit checks passed: integer math/config, SQL rerun/history, saved-term recovery, strict input/ownership, verified capture/replay, signature refusal and role protections. Zero real HTTP/payment/provider requests.');
} finally {
  for (const name of settings) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  await pg.close();
}
