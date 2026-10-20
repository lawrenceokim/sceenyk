// Route relocation checks only: no database, provider, browser or hosted calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { typescriptLoader } from './lib/load-typescript.mjs';

let signedIn = true, authEnabled = true, protections = 0;
const invalidations = [];
const load = typescriptLoader({
  '@clerk/nextjs/server': { clerkMiddleware: callback => request => callback({ protect: async () => { protections++; if (!signedIn) throw Error('AUTH_REQUIRED'); } }, request) },
  '@/lib/auth/config': { getClerkDevelopmentConfig: () => ({ enabled: authEnabled }) },
  'next/server': { NextResponse: { next: () => ({ headers: new Headers(), next: true }), redirect: url => ({ status: 307, url: String(url) }) } },
  'next/navigation': { unstable_rethrow: () => {} },
  'next/cache': { revalidatePath: path => invalidations.push(path) },
  '@/lib/payments/server': { completeCreditOrder: async () => ({ status: 'completed' }), reconcileOwnedCreditOrders: async () => ({ pending: 0 }) },
  '@/lib/marketplace/withdrawals/server': { savePayoutDestination: async () => {}, requestWithdrawal: async () => {} },
  '@/lib/accounting/server': {},
  '@/lib/auth/ensure-app-user': {},
  '@/lib/payments/paypal/config': {},
}, { Headers, URL });
const proxy = load('proxy.ts').default;
const config = load('next.config.ts').default;
const request = path => ({ url: 'https://example.test' + path, nextUrl: new URL('https://example.test' + path) });
const creditPaths = ['/credits', '/credits?checkout=return&token=existing-order', '/credits.rsc', '/credits.prefetch.rsc', '/credits.segments/account.segment.rsc', '/credits/earnings', '/credits/earnings?page=2', '/credits/earnings.rsc', '/credits/earnings.prefetch.rsc'];
for (const path of creditPaths) {
  const before = protections;
  const response = await proxy(request(path), {});
  assert.equal(protections, before + 1, path);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-cache, no-store, max-age=0, must-revalidate', path);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store', path);
}
signedIn = false;
for (const path of creditPaths) await assert.rejects(() => proxy(request(path), {}), /AUTH_REQUIRED/, path);
authEnabled = false;
for (const path of creditPaths) assert.equal((await proxy(request(path), {})).url, 'https://example.test/?auth=sign-in', path);
authEnabled = true;
for (const path of ['/studio', '/marketplace', '/documentation/credits', '/credits-public']) {
  const before = protections;
  await proxy(request(path), {});
  assert.equal(protections, before, path);
}
const redirects = await config.redirects();
for (const source of ['/settings/credits', '/dashboard/settings/credits', '/dashboard/credits']) {
  assert.equal(redirects.find(rule => rule.source === source)?.destination, '/credits', source);
}
for (const source of ['/settings/earnings', '/dashboard/settings/earnings', '/dashboard/marketplace/earnings']) {
  assert.equal(redirects.find(rule => rule.source === source)?.destination, '/credits/earnings', source);
}
const headers = await config.headers();
for (const source of ['/credits/:path*', '/credits.html', '/credits.rsc', '/credits.prefetch.rsc', '/credits.segments/:path*']) {
  assert.equal(headers.find(rule => rule.source === source)?.headers.find(header => header.key === 'Cache-Control')?.value, 'private, no-cache, no-store, max-age=0, must-revalidate', source);
}
const transform = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).routes[0];
for (const path of [...creditPaths.filter(path => !path.includes('?')), '/credits.html']) assert.ok(new RegExp(transform.src).test(path), path);
assert.equal(new RegExp(transform.src).test('/marketplace'), false);
const actions = load('app/actions/payments.ts');
assert.equal((await actions.completeCreditOrderAction({ orderId: 'fixture' })).ok, true);
assert.equal((await actions.reconcileCreditOrdersAction()).ok, true);
assert.equal(invalidations.filter(path => path === '/credits').length, 2);
assert.equal(invalidations.filter(path => path === '/settings/credits').length, 2);
const withdrawals = load('app/actions/creator-withdrawals.ts');
assert.equal((await withdrawals.payoutDestinationAction({})).ok, true);
assert.equal((await withdrawals.withdrawalRequestAction({})).ok, true);
assert.equal(invalidations.filter(path => path === '/credits/earnings').length, 2);
assert.equal(invalidations.filter(path => path === '/settings/earnings').length, 2);
// Existing provider callback URLs still enter the compatibility redirect.
assert.ok(fs.readFileSync('lib/payments/paypal/client.ts', 'utf8').includes('"/dashboard/settings/credits"'));
console.log('Credits route protection, private cache policies, legacy callbacks, public-route isolation and credit-page invalidation checks passed.');
