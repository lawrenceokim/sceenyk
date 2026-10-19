// Minimal action/service and pagination-helper checks with explicit read fixtures.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { typescriptLoader } from './lib/load-typescript.mjs';

let identity = { id: randomUUID(), clerk_user_id: 'fixture-a' };
let fail = false;
const calls = [];
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const item = id => ({ id, title: 'Saved template', description: 'A reusable creative brief.', category: 'cinematic', tags: [], creatorName: 'Creator', creatorSlug: null, creatorAvatar: null, template: { version: 1, category: 'cinematic', instructions: 'Describe your own scene.', settings: { aspectRatio: '16:9', duration: '10', visualStyle: 'Original', tone: 'Professional' } }, adoptionType: 'free', priceMinor: 0, currency: 'USD', status: 'draft', createdAt: '2026-10-19T00:00:00Z', publishedAt: null, fallbackColor: '#66616f', sourceProjectId: randomUUID(), rightsConfirmed: true, adoptionCount: 3, paidSalesCount: 2, creatorEarningsMinor: 180 });
const a = [item(randomUUID()), item(randomUUID())], b = [item(randomUUID())];
const ownerA = identity.id;
const load = typescriptLoader({
  '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!identity) throw Error('AUTH_REQUIRED'); return identity; } },
  '@/lib/db/server': { createDatabaseClient: () => ({ rpc: async (name, args) => {
    calls.push({ name, args });
    if (fail) throw Error('PRIVATE_DATABASE_DETAIL');
    if (name === 'creator_profile_listing_identities') return { data: [], error: null };
    assert.equal(name, 'marketplace_owned');
    return { data: { items: args.p_page > 1 ? [] : args.p_owner_user_id === ownerA ? a : b, total: args.p_owner_user_id === ownerA ? a.length : b.length, page: args.p_page, pageSize: 12 }, error: null };
  } }) },
  '@/lib/pricing/config': { quoteGenerationCost: () => ({ requiredCredits: null }) },
  'next/navigation': { unstable_rethrow: () => {} },
  'next/server': { connection: async () => {} },
}, { getComputedStyle: element => ({ overflowY: element.overflowY }) });
const { loadOwnedListingsAction: read } = load('app/actions/owned-listings.ts');
const { appendUniqueListings, listingScrollRoot } = load('components/marketplace/infinite-listings.ts');

const first = await read(1);
check('owner page and verified Clerk identity returned', first.ok && first.clerkUserId === 'fixture-a' && first.page.items.length === 2);
check('existing service derives owner for RPC', calls[0].args.p_owner_user_id === ownerA);
check('saved colors and statistics unchanged', first.page.items[0].fallbackColor === '#66616f' && first.page.items[0].creatorEarningsMinor === 180);
const last = await read(2);
check('page number forwarded and empty terminal page retained', last.ok && last.page.page === 2 && last.page.items.length === 0);
const readsBeforeInvalid = calls.length;
for (const input of [0, -1, 1.5, 100001, '2', { page: 1, owner: ownerA }]) check('invalid page rejected', !(await read(input)).ok);
check('invalid pages never query listings', calls.length === readsBeforeInvalid);
identity = { id: randomUUID(), clerk_user_id: 'fixture-b' };
const other = await read(1);
check('second account uses its own page', other.ok && other.clerkUserId === 'fixture-b' && other.page.items[0].id === b[0].id);
check('second owner passed to existing ownership service', calls.some(call => call.args.p_owner_user_id === identity.id));
identity = null;
const beforeAnonymous = calls.length;
check('anonymous read fails closed without query', !(await read(1)).ok && calls.length === beforeAnonymous);
identity = { id: ownerA, clerk_user_id: 'fixture-a' }; fail = true;
const failed = await read(1);
check('service failures return safe message', !failed.ok && !failed.message.includes('PRIVATE_DATABASE_DETAIL'));
const merged = appendUniqueListings([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }, { id: 'c' }]);
check('duplicate-free stable append', merged.map(item => item.id).join(',') === 'a,b,c');
const workspace = { overflowY: 'auto', parentElement: null };
const center = { overflowY: 'auto', parentElement: workspace };
check('Settings center is observer root before outer workspace', listingScrollRoot({ parentElement: { overflowY: 'visible', parentElement: center } }) === center);
check('Marketplace retains workspace root', listingScrollRoot({ parentElement: workspace }) === workspace);
check('normal document scrolling uses viewport', listingScrollRoot({ parentElement: { overflowY: 'visible', parentElement: null } }) === null);
console.log(JSON.stringify({ passed: checks.length, scope: 'Read-only action/service and infinite-scroll helpers; fixture identities, no hosted calls', checks }));
