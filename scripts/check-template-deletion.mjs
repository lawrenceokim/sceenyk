// Isolated PostgreSQL/services only; no hosted migrations, storage or providers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { compositionFixtureDatabase } from './lib/composition-fixture.mjs';
import { typescriptLoader } from './lib/load-typescript.mjs';

const { pg, db, one, scalar } = await compositionFixtureDatabase();
let identity;
const load = typescriptLoader({
  'next/server': { connection: async () => {} },
  '@/lib/db/server': { createDatabaseClient: () => db },
  '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!identity) throw new Error('AUTH_REQUIRED'); return { id: identity }; } },
});
const service = load('lib/marketplace/server.ts');
const templates = load('lib/marketplace/project-template.ts');
const purchases = load('lib/marketplace/purchases/server.ts');
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; }
async function rpc(name, args) { const result = await db.rpc(name, args); assert.equal(result.error, null, result.error?.message); return result.data; }
try {
  await pg.exec(fs.readFileSync('supabase/migrations/20261021003400_template_deletion.sql', 'utf8'));
  const a = await scalar("insert into app_users(clerk_user_id) values('delete_fixture_a') returning id as value");
  const b = await scalar("insert into app_users(clerk_user_id) values('delete_fixture_b') returning id as value");
  async function listing(title, options = {}) {
    const projectId = await scalar("insert into projects(owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone) values($1,$2,'cinematic','Private source brief','16:9','10','Original','Storytelling') returning id as value", [a, title]);
    const input = { id: randomUUID(), sourceProjectId: projectId, title, description: 'A reusable starting point.', category: 'cinematic', tags: [], instructions: 'Bring your own subject and tell a short story.', publish: true, rightsConfirmed: true, ...options };
    assert.ok((await service.createMarketplaceListing(input)).ok);
    return { ...input, projectId };
  }
  identity = a;
  const free = await listing('Free template');
  const paid = await listing('Paid template', { adoptionType: 'paid', priceMinor: 200 });
  const archived = await listing('Ordinary archived template');
  assert.ok((await service.updateMarketplaceListing({ id: archived.id, title: archived.title, description: archived.description, category: archived.category, tags: [], rightsConfirmed: true, status: 'archived' })).ok);
  for (let index = 0; index < 12; index++) await listing(`Other template ${index}`, { publish: false, rightsConfirmed: false });
  const originalProject = JSON.stringify(await one('select * from projects where id=$1', [free.projectId]));
  const sourceId = randomUUID();
  await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'source.png','image/png',100,'image','uploaded','fixture-etag')", [sourceId, a, free.projectId, randomUUID(), `users/${a}/projects/${free.projectId}/${sourceId}/${randomUUID()}`]);
  const sourceBefore = JSON.stringify(await one('select * from project_assets where id=$1', [sourceId]));
  await pg.query('update marketplace_listings set preview_source_asset_id=$1,preview_key=$2,preview_etag=$3,preview_size=4 where id=$4', [sourceId, `marketplace-previews/${free.id}/${randomUUID()}.webp`, 'fixture-etag', free.id]);
  check('reviewed preview initially available', !!await rpc('marketplace_template_preview', { p_listing_id: free.id, p_owner_user_id: null }));
  const originalListing = await one('select * from marketplace_listings where id=$1', [free.id]);
  const visibleBefore = (await service.listOwnedMarketplaceListings()).total;
  identity = b;
  check('foreign deletion denied', (await service.deleteOwnedTemplate({ id: free.id })).code === 'NOT_FOUND');
  check('foreign attempt leaves public listing visible', !!await service.getMarketplaceListing(free.id));
  const adopted = await service.adoptMarketplaceListing({ listingId: free.id, requestId: randomUUID() });
  assert.ok(adopted.ok);
  const adoptionBefore = JSON.stringify(await one('select * from marketplace_adoptions where listing_id=$1', [free.id]));
  const adoptedProjectBefore = JSON.stringify(await one('select * from projects where id=$1', [adopted.projectId]));
  const purchase = await rpc('marketplace_prepare_purchase', { p_buyer_user_id: b, p_listing_id: paid.id, p_fee_bps: 1000, p_pricing_version: 'fixture' });
  assert.equal(await rpc('marketplace_attach_order', { p_purchase_id: purchase.id, p_buyer_user_id: b, p_order_id: 'ORDER00000000001' }), true);
  assert.equal(await rpc('marketplace_fulfil_purchase', { p_purchase_id: purchase.id, p_order_id: 'ORDER00000000001', p_capture_id: 'CAPTURE000000001', p_amount_minor: 200, p_currency: 'USD' }), true);
  const paidAdoption = await rpc('marketplace_redeem_purchase', { p_buyer_user_id: b, p_purchase_id: purchase.id });
  async function financialHistory() {
    return JSON.stringify({
      purchase: await one('select * from marketplace_purchases where id=$1', [purchase.id]),
      entitlement: await one('select * from marketplace_entitlements where purchase_id=$1', [purchase.id]),
      earnings: (await pg.query('select * from creator_earnings_ledger where marketplace_purchase_id=$1 order by id', [purchase.id])).rows,
    });
  }
  const financialBefore = await financialHistory();
  identity = null;
  await assert.rejects(() => service.deleteOwnedTemplate({ id: free.id })); checks++;
  identity = a;
  check('owner override input rejected', (await service.deleteOwnedTemplate({ id: free.id, owner_user_id: b })).code === 'INVALID_INPUT');
  check('invalid id rejected', (await service.deleteOwnedTemplate({ id: 'invalid' })).code === 'INVALID_INPUT');
  check('unknown listing denied', (await service.deleteOwnedTemplate({ id: randomUUID() })).code === 'NOT_FOUND');
  const [removed, repeated] = await Promise.all([service.deleteOwnedTemplate({ id: free.id }), service.deleteOwnedTemplate({ id: free.id })]);
  check('owner deletion and repeated request succeed', removed.ok && repeated.ok && removed.listingId === free.id && repeated.listingId === free.id);
  const tombstone = await one('select * from marketplace_listings where id=$1', [free.id]);
  check('listing archived with persistent deletion marker', tombstone.status === 'archived' && !!tombstone.deleted_at);
  check('immutable listing identity/snapshot/color retained', tombstone.source_project_id === originalListing.source_project_id && JSON.stringify(tombstone.template_snapshot) === JSON.stringify(originalListing.template_snapshot) && tombstone.fallback_color === originalListing.fallback_color);
  check('public detail removed', await service.getMarketplaceListing(free.id) === null);
  check('public preview access revoked', await rpc('marketplace_template_preview', { p_listing_id: free.id, p_owner_user_id: null }) === null);
  check('public browse removed', !(await service.browseMarketplace()).items.some(item => item.id === free.id));
  const page = await service.listOwnedMarketplaceListings();
  const page2 = await service.listOwnedMarketplaceListings(2);
  check('owned gallery count and filled pagination exclude deletion', page.total === visibleBefore - 1 && page.items.length === 12 && page2.items.length === page.total - 12);
  check('deleted card stays absent after another list read', ![...page.items, ...page2.items].some(item => item.id === free.id));
  check('normal archived templates retain existing gallery behavior', [...page.items, ...page2.items].some(item => item.id === archived.id));
  check('original Project preserved', JSON.stringify(await one('select * from projects where id=$1', [free.projectId])) === originalProject);
  check('private source media references retained', JSON.stringify(await one('select * from project_assets where id=$1', [sourceId])) === sourceBefore);
  check('deleted direct owner detail is unavailable', await service.getOwnedMarketplaceListing(free.id) === null);
  check('deleted Project template relationship is hidden', await service.getOwnedMarketplaceListing(free.projectId, true) === null && !Object.hasOwn(await templates.getOwnedProjectTemplates([free.projectId]), free.projectId));
  check('deleted creator source and preview are unavailable', await templates.getOwnedTemplateSource(free.id) === null && await rpc('marketplace_template_preview', { p_listing_id: free.id, p_owner_user_id: a }) === null);
  check('existing adoption and adopted Project preserved', JSON.stringify(await one('select * from marketplace_adoptions where listing_id=$1', [free.id])) === adoptionBefore && JSON.stringify(await one('select * from projects where id=$1', [adopted.projectId])) === adoptedProjectBefore);
  check('deleted listing cannot be republished', !(await service.updateMarketplaceListing({ id: free.id, title: free.title, description: free.description, category: free.category, tags: [], rightsConfirmed: true, status: 'published' })).ok);
  check('paid template can be deleted with purchase/history FKs', (await service.deleteOwnedTemplate({ id: paid.id })).ok);
  check('paid direct owner detail and preview are unavailable', await service.getOwnedMarketplaceListing(paid.id) === null && await rpc('marketplace_template_preview', { p_listing_id: paid.id, p_owner_user_id: a }) === null);
  check('purchase, entitlement and earnings snapshots unchanged', await financialHistory() === financialBefore);
  const redeemedAgain = await rpc('marketplace_redeem_purchase', { p_buyer_user_id: b, p_purchase_id: purchase.id });
  check('existing purchased template access still resolves same Project', redeemedAgain.projectId === paidAdoption.projectId);
  identity = b;
  const acquiredFree = (await purchases.getAcquiredTemplates()).items.find(item => item.listingId === free.id);
  const acquiredPaid = await purchases.getAcquiredTemplate(purchase.id);
  check('free adopter keeps private acquisition after creator deletion', !!acquiredFree && (await purchases.getAcquiredTemplate(acquiredFree.id)).purchase.template.instructions === free.instructions);
  check('paid buyer keeps private acquisition after creator deletion', acquiredPaid?.purchase.kind === 'paid' && acquiredPaid.purchase.amountMinor === 200);
  check('free buyer keeps reviewed preview after creator deletion', (await purchases.getAcquiredTemplatePreview(acquiredFree.id)).listingId === free.id);
  check('buyer opens existing paid version after deletion', (await purchases.openAcquiredTemplate(purchase.id)).projectId === paidAdoption.projectId);
  check('adopted free Project points to private acquired template', (await service.getOwnedProjectOrigin(adopted.projectId)).acquisitionId === acquiredFree.id);
  check('adopted paid Project points to private acquired template', (await service.getOwnedProjectOrigin(paidAdoption.projectId)).acquisitionId === purchase.id);
  check('deleted listing cannot be newly adopted', (await service.adoptMarketplaceListing({ listingId: free.id, requestId: randomUUID() })).code === 'NOT_FOUND');
  identity = a;
  const newListing = await templates.initializeProjectTemplate(free.projectId);
  const replacementId = newListing.ok && newListing.listingId;
  check('original Project can start a distinct new template', !!replacementId && replacementId !== free.id);
  check('only new active template maps to original Project', (await templates.getOwnedProjectTemplates([free.projectId]))[free.projectId] === replacementId && (await service.getOwnedMarketplaceListing(free.projectId, true)).id === replacementId);
  check('old tombstone stays absent after republishing', await service.getOwnedMarketplaceListing(free.id) === null && await service.getMarketplaceListing(free.id) === null);
  identity = b;
  check('new listing does not alter historical free copy', (await purchases.getAcquiredTemplate(acquiredFree.id)).purchase.listingId === free.id);
  identity = a;
  for (const role of ['anon', 'authenticated']) {
    await pg.exec(`set role ${role}`);
    await assert.rejects(() => pg.query('select delete_owned_template($1,$2)', [a, archived.id])); checks++;
    await pg.exec('reset role');
  }
  check('missing owner cannot call deletion successfully', (await rpc('delete_owned_template', { p_owner_user_id: null, p_listing_id: archived.id })).code === 'NOT_FOUND');
  await pg.exec(fs.readFileSync('supabase/migrations/20261111011100_deleted_template_visibility.sql', 'utf8'));
  check('migration safely reruns', await service.getOwnedMarketplaceListing(free.id) === null && (await templates.getOwnedProjectTemplates([free.projectId]))[free.projectId] === replacementId);
  console.log(`${checks} focused Template deletion checks passed.`);
} finally { await pg.close(); }
