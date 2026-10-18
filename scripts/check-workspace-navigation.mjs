// Exercise real route/action boundaries with explicit session/domain fixtures.
import assert from 'node:assert/strict';
import { typescriptLoader } from './lib/load-typescript.mjs';

let signedIn = true, authEnabled = true, protections = 0;
const invalidations = [], checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const load = typescriptLoader({
  '@clerk/nextjs/server': { clerkMiddleware: callback => request => callback({ protect: async () => { protections++; if (!signedIn) throw Error('AUTH_REQUIRED'); } }, request) },
  '@/lib/auth/config': { getClerkDevelopmentConfig: () => ({ enabled: authEnabled }) },
  'next/server': { NextResponse: { next: () => ({ headers: new Headers(), next: true }), redirect: url => ({ status: 307, url: String(url) }) } },
  'next/cache': { revalidatePath: path => invalidations.push(path) },
  'next/navigation': { redirect: url => { throw Object.assign(Error('REDIRECT'), { url }); }, unstable_rethrow: () => {} },
  '@/lib/projects/server': { saveOwnedProject: async () => ({ ok: true, project: { id: 'owned' } }) },
  '@/lib/marketplace/server': { adoptMarketplaceListing: async () => ({ ok: true, projectId: 'adopted' }), createMarketplaceListing: async () => ({ ok: true }), updateMarketplaceListing: async () => ({ ok: true }) },
  '@/lib/marketplace/payments/server': { recoverMarketplacePurchase: async () => ({ projectId: 'purchased' }) },
}, { Headers, URL });
const proxy = load('proxy.ts').default;
const request = url => ({ url: 'https://example.test'+url, nextUrl: new URL('https://example.test'+url) });
for (const [input, expected] of [['/dashboard','/create'],['/dashboard?page=2','/dashboard/projects?page=2'],['/dashboard?page=evil%26query','/dashboard/projects?page=evil%26query']]) {
  const result = await proxy(request(input), {});
  check('authenticated compatibility redirect '+input, result.status === 307 && result.url === 'https://example.test'+expected);
}
check('compatibility still authenticates', protections === 3);
for (const url of ['/create','/marketplace','/marketplace/creators/example','/documentation','/documentation/credits']) {
  const before = protections; await proxy(request(url), {}); check('public exploration '+url, before === protections);
}
for (const url of ['/api/inngest','/api/payments/paypal/webhook']) {
  const before = protections; check('callback bypass preserved '+url, (await proxy(request(url), {})).next && before === protections);
}
signedIn = false;
for (const url of ['/dashboard','/dashboard/projects','/dashboard/templates','/dashboard/settings/account','/projects/foreign']) {
  await assert.rejects(() => proxy(request(url), {}), /AUTH_REQUIRED/); check('anonymous private route denied '+url, true);
}
authEnabled = false;
check('missing auth config still denies private route', (await proxy(request('/dashboard/projects'), {})).url === 'https://example.test/?auth=sign-in');
check('missing auth config retains guest Studio', (await proxy(request('/create'), {})).next);
await load('app/actions/projects.ts').saveProjectAction({});
check('save invalidates new Projects destination and editor', invalidations.includes('/dashboard/projects') && invalidations.includes('/projects/owned'));
invalidations.length = 0;
await load('app/actions/marketplace.ts').adoptMarketplaceAction({});
check('free adoption invalidates new Projects destination', invalidations.includes('/dashboard/projects'));
check('listing changes invalidate the Templates gallery', invalidations.includes('/dashboard/templates'));
invalidations.length = 0;
await load('app/actions/marketplace-payments.ts').recoverMarketplacePurchaseAction({});
check('paid recovery invalidates new Projects destination', invalidations.includes('/dashboard/projects'));
console.log(JSON.stringify({ passed: checks.length, checks, evidence: 'Actual proxy/actions with session and domain fixtures; no hosted events' }));
