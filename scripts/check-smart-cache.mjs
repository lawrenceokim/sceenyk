// Focused offline cache/mutation/account-boundary checks. No external services.
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { typescriptLoader } from "./lib/load-typescript.mjs";

let checks = 0, now = Date.now();
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const equal = (a, b) => { assert.deepEqual(plain(a), plain(b)); checks++; };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const load = typescriptLoader({}, { AbortController, Date: class extends Date { static now() { return now; } } });
const { AccountSessionCache, accountSessionCache, confirmedAction, shareConfirmed } = load("lib/cache/account-cache.ts");
const cache = new AccountSessionCache(), scope = "user-a/session-a", viewer = "user-a";
const reply = data => ({ clerkUserId: viewer, data });
let reads = 0, respond = async () => reply({ available: 100, purchases: [{ id: "paid", status: "pending" }, { id: "free", status: "completed" }] });
const read = async signal => { reads++; return respond(signal); };
try {
  cache.setScope(scope);
  const pending = deferred(); respond = () => pending.promise;
  const first = cache.load(scope, viewer, "wallet:1", "wallet", read), duplicate = cache.load(scope, viewer, "wallet:1", "wallet", read);
  await Promise.resolve(); equal(reads, 1);
  pending.resolve(reply({ available: 100, purchases: [{ id: "paid", status: "pending" }, { id: "free", status: "completed" }] }));
  await Promise.all([first, duplicate]);
  const original = cache.read(scope, "wallet:1"); equal(original.available, 100); equal(cache.read("other/session", "wallet:1"), undefined);
  await cache.load(scope, viewer, "wallet:1", "wallet", read); equal(reads, 1);
  cache.scroll(scope, "route:/settings/data", 320); equal(cache.scroll(scope, "route:/settings/data"), 320);
  equal(cache.permit(scope, "recovery"), true); equal(cache.permit(scope, "recovery"), false);
  equal(cache.receipt("saved-order", { status: "pending" }), true); equal(cache.receipt("saved-order", { status: "pending" }), false);
  equal(cache.receipt("saved-order", { status: "completed" }), true);
  let invalidations = 0, refreshed = 0;
  cache.register("projects", { reset() {}, invalidate: acting => { equal(acting, scope); invalidations++; }, refresh: async acting => { equal(acting, scope); refreshed++; } });
  respond = async () => reply({ available: 100, purchases: [{ id: "paid", status: "pending" }, { id: "free", status: "completed" }] });
  await Promise.all([cache.confirmed(["wallet", "projects"]), cache.confirmed(["wallet", "projects"])]);
  equal(reads, 2); equal(refreshed, 1); equal(invalidations, 2); assert.equal(cache.read(scope, "wallet:1"), original); checks++;
  respond = async () => reply({ available: 200, purchases: [{ id: "paid", status: "completed" }, { id: "free", status: "completed" }] });
  await cache.confirmed(["wallet"]);
  const updated = cache.read(scope, "wallet:1"); equal(updated.available, 200); assert.equal(updated.purchases[1], original.purchases[1]); checks++;
  // A pre-mutation read may finish, but it cannot overwrite the confirmed result.
  const stale = deferred(); respond = () => stale.promise;
  const oldRequest = cache.load(scope, viewer, "wallet:1", "wallet", read, true); await Promise.resolve();
  respond = async () => reply({ available: 300, purchases: updated.purchases });
  const reconcile = cache.confirmed(["wallet"]); stale.resolve(reply({ available: 1, purchases: [] }));
  await oldRequest; await reconcile; equal(cache.read(scope, "wallet:1").available, 300);
  respond = async () => { throw new Error("offline"); };
  await assert.rejects(() => cache.load(scope, viewer, "wallet:1", "wallet", read, true)); checks++;
  equal(cache.read(scope, "wallet:1").available, 300); equal(!!cache.error(scope, "wallet:1"), true);
  const before = reads; await assert.rejects(() => cache.load(scope, viewer, "wallet:1", "wallet", read, true)); checks++; equal(reads, before);
  cache.retry(scope, "wallet:1"); respond = async () => reply({ available: 300, purchases: updated.purchases });
  await cache.load(scope, viewer, "wallet:1", "wallet", read); equal(cache.error(scope, "wallet:1"), undefined);
  const late = deferred(); let aborted = false;
  respond = signal => { signal.addEventListener("abort", () => { aborted = true; }); return late.promise; };
  const flight = cache.load(scope, viewer, "wallet:1", "wallet", read, true); await Promise.resolve();
  cache.setScope("user-b/session-b"); equal(aborted, true); late.resolve(reply({ available: 999 })); await flight;
  equal(cache.read("user-b/session-b", "wallet:1"), undefined); equal(cache.read(scope, "wallet:1"), undefined); equal(cache.scroll(scope, "route:/settings/data"), undefined);
  cache.setScope(scope); respond = async () => ({ clerkUserId: "other", data: { available: 888 } });
  await assert.rejects(() => cache.load(scope, viewer, "wallet:1", "wallet", read), /ACCOUNT_CHANGED/); checks++; equal(cache.read(scope, "wallet:1"), undefined);
  const row = { id: "a", title: "Saved" }, second = { id: "b", title: "Other" };
  const reordered = shareConfirmed([row, second], [second, row]); assert.equal(reordered[1], row); checks++;
} finally { cache.setScope(null); }

// Thin mutation adapters preserve exact action results. Pending payments grant
// no assumed credits, failed actions emit nothing, and old-account receipts die.
try {
  accountSessionCache.setScope(scope);
  let server = { available: 20, purchases: [] }, calls = 0;
  const fetchWallet = async () => { calls++; return reply(server); };
  await accountSessionCache.load(scope, viewer, "wallet:1", "wallet", fetchWallet);
  const failed = { ok: false, message: "Uncertain" };
  assert.equal(await confirmedAction(["wallet"], async () => failed), failed); checks++; equal(calls, 1);
  const waiting = { ok: true, data: { status: "pending" } }; server = { available: 20, purchases: [{ id: "order", status: "pending" }] };
  assert.equal(await confirmedAction(["wallet"], async () => waiting), waiting); checks++;
  equal(accountSessionCache.read(scope, "wallet:1").available, 20); equal(accountSessionCache.read(scope, "wallet:1").purchases[0].status, "pending");
  const completed = { ok: true, data: { status: "completed" } }; server = { available: 120, purchases: [{ id: "order", status: "completed" }] };
  await confirmedAction(["wallet"], async () => completed); equal(accountSessionCache.read(scope, "wallet:1").available, 120);
  const result = deferred(); const action = confirmedAction(["wallet"], () => result.promise); accountSessionCache.setScope("user-b/session-b");
  result.resolve(completed); assert.equal(await action, completed); checks++; equal(accountSessionCache.read("user-b/session-b", "wallet:1"), undefined);
} finally { accountSessionCache.setScope(null); }

// The private endpoint accepts only fixed resources/page, derives ownership and
// retains exact confirmed financial DTOs. It never accepts an owner or amount.
let actor = "user-a", earningsActor = actor, walletReads = 0;
const apiLoad = typescriptLoader({
  "next/navigation": { unstable_rethrow: () => {} },
  "@/lib/auth/read-app-user": { readAppUser: async () => { if (!actor) throw new Error("AUTH_REQUIRED"); return { id: "owner", clerk_user_id: actor }; } },
  "@/lib/payments/server": { getCreditWallet: async () => { walletReads++; return { available: 7, reserved: 3, purchases: [{ status: "pending" }] }; } },
  "@/lib/accounting/server": { getCreditSummary: async () => ({ available: 7 }), getFreeAllowance: async () => ({ available: 1 }) },
  "@/lib/marketplace/payments/server": { getCreatorEarnings: async () => ({ clerkUserId: earningsActor, earnings: { available: 500 } }), getMarketplacePurchases: async () => ({ clerkUserId: actor, items: [], total: 0 }) },
  "@/lib/marketplace/withdrawals/server": { getWithdrawalAccount: async () => ({ clerkUserId: actor, account: { reserved: 500 } }) },
  "@/lib/settings/server": { getCreationPreferences: async () => ({ clerkUserId: actor, preferences: {} }) },
  "@/lib/marketplace/creators/server": { getOwnedCreatorProfile: async () => ({ clerkUserId: actor, profile: null }) },
  "@/lib/settings/account": { prepareSettingsAccount: async () => ({ clerkUserId: actor }) },
  "@/lib/payments/credit-pricing-config": { getCreditPurchasePricing: () => ({}) },
  "@/lib/payments/paypal/config": { isPayPalConfigured: () => true },
  "@/lib/marketplace/server": { getMarketplaceListing: async () => null, listOwnedMarketplaceListings: async () => ({ items: [], total: 0 }) },
}, { Response, Request });
const { POST } = apiLoad("app/api/account-cache/route.ts");
const request = (body, origin = "https://fixture.invalid") => new Request("https://fixture.invalid/api/account-cache", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
equal((await POST(request({ resource: "wallet" }, "https://other.invalid"))).status, 403); equal(walletReads, 0);
equal((await POST(request({ resource: "wallet", owner: "other", available: 999 }))).status, 503); equal(walletReads, 0);
const response = await POST(request({ resource: "wallet" })); equal(response.status, 200); equal(response.headers.get("cache-control"), "private, no-store"); equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
equal((await response.json()).data, { available: 7, reserved: 3, purchases: [{ status: "pending" }] });
earningsActor = "other"; equal((await POST(request({ resource: "earnings" }))).status, 503);
actor = null; equal((await POST(request({ resource: "wallet" }))).status, 503); equal(walletReads, 1);

// Compare the financial business owners to HEAD. Read auth/invalidation may
// change here; payment/withdrawal/pricing/settlement function bodies must not.
const unchanged = {
  "lib/payments/server.ts": ["createCreditOrder", "completeCreditOrder", "reconcileOwnedCreditOrders", "handleVerifiedPayPalEvent"],
  "lib/marketplace/payments/server.ts": ["prepareMarketplaceCheckout", "createMarketplaceOrder", "recoverMarketplacePurchase", "handleVerifiedMarketplacePayPalEvent"],
  "lib/marketplace/withdrawals/server.ts": ["savePayoutDestination", "requestWithdrawal"],
  "lib/settings/account.ts": ["prepareSettingsAccount"],
};
const functionBody = (file, source, name) => {
  const parsed = ts.createSourceFile(file, source.replaceAll("\r\n", "\n"), ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration?.body, name); return declaration.body.getText(parsed);
};
for (const [file, names] of Object.entries(unchanged)) {
  const baseline = execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" }), current = fs.readFileSync(file, "utf8");
  for (const name of names) equal(functionBody(file, current, name).replace("await readAppUser()", "await ensureAppUser()"), functionBody(file, baseline, name));
}
for (const [file, names] of Object.entries({
  "lib/payments/server.ts": ["getCreditWallet", "completeCreditOrder", "reconcileOwnedCreditOrders"], "lib/accounting/server.ts": ["getPaidCreditBalance", "getFreeAllowance"],
  "lib/marketplace/payments/server.ts": ["getCreatorEarnings", "getMarketplacePurchases", "recoverMarketplacePurchase"], "lib/marketplace/withdrawals/server.ts": ["getWithdrawalAccount"],
  "lib/settings/server.ts": ["getCreationPreferences"], "lib/marketplace/creators/server.ts": ["getOwnedCreatorProfile"],
})) for (const name of names) {
  const body = functionBody(file, fs.readFileSync(file, "utf8"), name); equal(body.includes("await readAppUser()"), true); equal(body.includes("await ensureAppUser()"), false);
}
console.log(JSON.stringify({ checks, realNetworkCalls: 0, paymentMutations: 0 }));
