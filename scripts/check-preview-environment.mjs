// Real configuration/PayPal adapters with in-memory request/provider fixtures.
// No local env files, real network, payments, database writes or workers.
import assert from "node:assert/strict";
import { typescriptLoader } from "./lib/load-typescript.mjs";

let checks = 0, requests = 0, validSignature = true;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const throws = (fn, pattern) => { assert.throws(fn, pattern); checks++; };
const env = {}, bodies = [];
let incoming = new Headers();
const configure = values => { for (const key of Object.keys(env)) delete env[key]; Object.assign(env, values); };
const paypal = { PAYPAL_ENVIRONMENT: "sandbox", PAYPAL_CLIENT_ID: "fixture", PAYPAL_CLIENT_SECRET: "fixture", PAYPAL_WEBHOOK_ID: "fixture-webhook" };
const load = typescriptLoader({
  "next/headers": { headers: async () => incoming },
  "./auth": { workerSharedSecret: () => "fixture-worker-secret" },
}, { process: { env }, Headers, Request, Response, fetch: async (url, init) => {
  requests++;
  assert.ok(String(url).startsWith("https://api-m.sandbox.paypal.com/")); checks++;
  equal(init.redirect, "error"); equal(init.cache, "no-store");
  if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "fixture-token", token_type: "Bearer" });
  if (String(url).endsWith("/verify-webhook-signature")) {
    equal(JSON.parse(init.body).webhook_id, "fixture-webhook");
    assert.ok(init.body.includes('"webhook_event":{ "id": "event-fixture" }')); checks++;
    return Response.json({ verification_status: validSignature ? "SUCCESS" : "FAILURE" });
  }
  const body = JSON.parse(init.body); bodies.push(body);
  equal(init.headers["PayPal-Request-ID"], "00000000-0000-4000-8000-000000000001");
  return Response.json({ id: "ORDER00000001", intent: "CAPTURE", status: "PAYER_ACTION_REQUIRED", purchase_units: body.purchase_units });
} });
const origin = load("lib/application-origin.ts");
const config = load("lib/payments/paypal/config.ts");
const client = load("lib/payments/paypal/client.ts");
const requestOrigin = load("lib/payments/paypal/checkout-origin.ts");
const database = load("lib/db/config.ts");
const clerk = load("lib/auth/config.ts");
const worker = load("lib/media-preparation/config.ts");
const purchase = { id: "00000000-0000-4000-8000-000000000001", amount_minor: 100, currency: "USD", pack_name: "Fixture", listing_title: "Fixture", listing_id: "00000000-0000-4000-8000-000000000002" };

configure({ ...paypal, NODE_ENV: "development", PAYPAL_RETURN_ORIGIN: "http://localhost:3001" });
equal(origin.applicationOrigin(), "http://localhost:3001");
equal(origin.checkoutOrigin("http://localhost:3001"), "http://localhost:3001");
equal(origin.checkoutOrigin(null, "attacker.example.test"), "http://localhost:3001");
throws(() => origin.checkoutOrigin("https://attacker.example.test"), /APPLICATION_ORIGIN_UNTRUSTED/);
throws(() => origin.validateApplicationOrigin("not-an-origin"), /APPLICATION_ORIGIN_INVALID/);
await client.createPayPalOrder(purchase, origin.checkoutOrigin("http://localhost:3001"));
equal(bodies.at(-1).payment_source.paypal.experience_context.return_url, "http://localhost:3001/dashboard/settings/credits?checkout=return");
equal(bodies.at(-1).payment_source.paypal.experience_context.cancel_url, "http://localhost:3001/dashboard/settings/credits?checkout=cancel");

const preview = { ...paypal, NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "deployment.example.test", VERCEL_BRANCH_URL: "branch.example.test", VERCEL_PROJECT_PRODUCTION_URL: "production.example.test", PAYPAL_RETURN_ORIGIN: "https://preview.example.test" };
configure(preview);
equal(origin.applicationOrigin(), "https://deployment.example.test");
equal(config.getPayPalConfig().origin, "https://preview.example.test"); // Webhook stays stable.
for (const host of ["deployment.example.test", "branch.example.test", "preview.example.test"]) {
  incoming = new Headers({ origin: `https://${host}`, host });
  const checkout = await requestOrigin.requestCheckoutOrigin();
  equal(checkout, `https://${host}`);
  await client.createPayPalOrder(purchase, checkout);
  const body = bodies.at(-1);
  equal(body.payment_source.paypal.experience_context.return_url, `https://${host}/dashboard/settings/credits?checkout=return`);
  equal(body.payment_source.paypal.experience_context.cancel_url, `https://${host}/dashboard/settings/credits?checkout=cancel`);
  equal(body.purchase_units[0].custom_id, purchase.id); equal(body.purchase_units[0].amount.value, "1.00");
  await client.createMarketplacePayPalOrder(purchase, checkout);
  equal(bodies.at(-1).payment_source.paypal.experience_context.return_url, `https://${host}/dashboard/marketplace/purchases?checkout=return`);
  equal(bodies.at(-1).payment_source.paypal.experience_context.cancel_url, `https://${host}/dashboard/marketplace/purchases?checkout=cancel`);
}
equal(origin.checkoutOrigin(null, "branch.example.test"), "https://branch.example.test");
equal(origin.checkoutOrigin(null, "attacker.example.test"), "https://deployment.example.test");
for (const value of ["https://production.example.test", "https://unrelated-project.vercel.app", "https://branch.example.test.attacker.test", "http://localhost:3000", "https://localhost", "https://user:pass@branch.example.test", "https://branch.example.test/path", "https://branch.example.test?next=evil", "https://branch.example.test#fragment"]) {
  const before = requests;
  await assert.rejects(() => client.createPayPalOrder(purchase, value)); checks++;
  equal(requests, before);
}
env.PAYPAL_RETURN_ORIGIN = "http://localhost:3000";
equal(config.isPayPalConfigured(), false);
equal(origin.applicationOrigin(), "https://deployment.example.test");
env.PAYPAL_RETURN_ORIGIN = preview.PAYPAL_RETURN_ORIGIN;
env.PAYPAL_ENVIRONMENT = "live"; throws(() => config.getPayPalConfig(), /PAYPAL_SANDBOX_REQUIRED/);
env.PAYPAL_ENVIRONMENT = "sandbox";
const savedPreview = { ...env };
delete env.PAYPAL_RETURN_ORIGIN; delete env.VERCEL_URL; delete env.VERCEL_BRANCH_URL;
throws(() => origin.applicationOrigin(), /APPLICATION_ORIGIN_REQUIRED/);
configure(savedPreview);
const signature = new Headers({ "paypal-auth-algo": "fixture", "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/fixture", "paypal-transmission-id": "fixture", "paypal-transmission-sig": "fixture", "paypal-transmission-time": "fixture" });
equal(await client.verifyPayPalWebhook('{ "id": "event-fixture" }', signature), true);
validSignature = false;
equal(await client.verifyPayPalWebhook('{ "id": "event-fixture" }', signature), false);
equal(await client.verifyPayPalWebhook("{}", new Headers()), false);
const order = { id: "ORDER00000001", intent: "CAPTURE", status: "COMPLETED", purchase_units: [{
  reference_id: purchase.id, custom_id: purchase.id, invoice_id: purchase.id,
  amount: { currency_code: "USD", value: "1.00" },
  payments: { captures: [{ id: "CAPTURE000001", status: "COMPLETED", final_capture: true, amount: { currency_code: "USD", value: "1.00" } }] },
}] };
const paid = { ...purchase, listing_id: undefined, paypal_order_id: order.id };
equal(client.verifiedCapture(paid, order).id, "CAPTURE000001");
for (const changes of [{ amount_minor: 200 }, { currency: "EUR" }, { paypal_order_id: "OTHERORDER001" }, { id: "another-purchase" }]) {
  throws(() => client.verifiedCapture({ ...paid, ...changes }, order), /PAYPAL_ORDER_MISMATCH/);
}
throws(() => client.verifiedCapture(paid, { ...order, status: "APPROVED" }), /PAYPAL_CAPTURE_NOT_COMPLETED/);
throws(() => client.verifiedCapture(paid, { ...order, purchase_units: [{ ...order.purchase_units[0], payments: { captures: [{ ...order.purchase_units[0].payments.captures[0], status: "PENDING" }] } }] }), /PAYPAL_CAPTURE_MISMATCH/);

configure({ ...preview, VERCEL_ENV: "production", PAYPAL_RETURN_ORIGIN: "https://production.example.test" });
equal(origin.applicationOrigin(), "https://production.example.test");
equal(origin.checkoutOrigin("https://production.example.test"), "https://production.example.test");
await client.createPayPalOrder(purchase, origin.checkoutOrigin("https://production.example.test"));
equal(bodies.at(-1).payment_source.paypal.experience_context.return_url, "https://production.example.test/dashboard/settings/credits?checkout=return");
delete env.PAYPAL_RETURN_ORIGIN;
equal(origin.applicationOrigin(), "https://production.example.test");
env.VERCEL_URL = "deployment.example.test/evil";
throws(() => origin.checkoutOrigin("https://production.example.test"), /APPLICATION_ORIGIN_INVALID/);

configure({ NODE_ENV: "development", SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "sb_secret_fixture", MEDIA_WORKER_URL: "http://127.0.0.1:3012", SCEENYK_LOCAL_JOBS_ONLY: "1", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture", CLERK_SECRET_KEY: "sk_test_fixture" });
equal(database.getDatabaseConfig().url, "http://127.0.0.1:54321");
equal(worker.workerConnection().url, "http://127.0.0.1:3012/prepare");
equal(clerk.getClerkDevelopmentConfig().enabled, true);
env.VERCEL = "1"; env.NODE_ENV = "production";
throws(() => database.getDatabaseConfig(), /Application database configuration/);
throws(() => worker.workerConnection(), /PREPARATION_UNAVAILABLE/);
env.SUPABASE_URL = "https://database.example.test";
equal(database.getDatabaseConfig().url, "https://database.example.test");
equal(clerk.getClerkDevelopmentConfig().enabled, true);
env.NEXT_PUBLIC_SUPABASE_SECRET_KEY = "forbidden";
throws(() => database.getDatabaseConfig(), /Application database configuration/);
delete env.NEXT_PUBLIC_SUPABASE_SECRET_KEY;
env.NEXT_PUBLIC_PAYPAL_CLIENT_SECRET = "forbidden";
throws(() => config.getPayPalConfig(), /PUBLIC_PAYPAL_SECRET_REJECTED/);
console.log(JSON.stringify({ checks, fixtureHttpCalls: requests, realNetworkCalls: 0, paidRequests: 0, databaseWrites: 0 }));
