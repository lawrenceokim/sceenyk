// Actual Server Action with offline payment/cache ports; no account or provider calls.
import assert from "node:assert/strict";
import { typescriptLoader } from "./lib/load-typescript.mjs";

const paths = [];
let outcome = { recovered: 0, recoveredOrders: [], pending: false };
let failure = null, calls = 0, checks = 0;
const load = typescriptLoader({
  "next/cache": { revalidatePath: path => paths.push(path) },
  "next/navigation": { unstable_rethrow: error => { if (error?.frameworkSignal) throw error; } },
  "@/lib/payments/server": { reconcileOwnedCreditOrders: async () => { calls++; if (failure) throw failure; return outcome; } },
  "@/lib/accounting/server": {},
  "@/lib/auth/ensure-app-user": {},
  "@/lib/payments/credit-pricing-config": {},
  "@/lib/payments/credit-pricing": { CreditPricingError: class extends Error {} },
  "@/lib/payments/paypal/config": {},
}, { fetch: async () => { throw new Error("NETWORK_FORBIDDEN"); } });
const { reconcileCreditOrdersAction } = load("app/actions/payments.ts");
const equal = (a, b) => { assert.equal(JSON.stringify(a), JSON.stringify(b)); checks++; };

for (let index = 0; index < 3; index++) {
  const result = await reconcileCreditOrdersAction();
  equal(result.ok, true);
  equal(result.data, outcome);
}
equal(paths, []); // Idle/mount/focus checks must not invalidate their own page.
outcome = { recovered: 0, recoveredOrders: [], pending: true };
equal((await reconcileCreditOrdersAction()).data, outcome);
equal(paths, []);
outcome = { recovered: 1, recoveredOrders: ["fixture-order"], pending: false };
equal((await reconcileCreditOrdersAction()).data, outcome);
equal(paths, ["/studio", "/credits", "/settings/credits"]);
paths.length = 0;
outcome = { recovered: 0, recoveredOrders: [], pending: false };
await reconcileCreditOrdersAction();
equal(paths, []); // The render following a recovered payment settles at a no-op.
failure = new Error("fixture failure");
equal((await reconcileCreditOrdersAction()).ok, false);
equal(paths, []);
failure = { frameworkSignal: true };
await assert.rejects(() => reconcileCreditOrdersAction(), error => error === failure); checks++;
equal(paths, []);
equal(calls, 8);
console.log(JSON.stringify({ checks, realNetworkCalls: 0, paidRequests: 0 }));
