// Focused, disposable SQL/service verification. No provider, browser or remote I/O.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { compositionFixtureDatabase } from './lib/composition-fixture.mjs';
import { typescriptLoader } from './lib/load-typescript.mjs';

const { pg, db, one, scalar } = await compositionFixtureDatabase();
let owner;
const service = typescriptLoader({
  '@/lib/auth/read-app-user': { readAppUser: async () => { if (!owner) throw new Error('AUTH_REQUIRED'); return { id: owner, clerk_user_id: `clerk-${owner}` }; } },
  '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!owner) throw new Error('AUTH_REQUIRED'); return { id: owner, clerk_user_id: `clerk-${owner}` }; } },
  '@/lib/db/server': { createDatabaseClient: () => db },
  '@/lib/marketplace/server': { MarketplaceAccessError: class extends Error {} },
})('lib/marketplace/purchases/server.ts');
let checks = 0;
const check = (name, value) => { assert.ok(value, name); checks++; };
const rpc = async (name, args) => { const r = await db.rpc(name, args); assert.equal(r.error, null, r.error?.message); return r.data; };
async function denied(sql, role) {
  await pg.exec(`set role ${role}`);
  try { await assert.rejects(() => pg.query(sql)); checks++; } finally { await pg.exec('reset role'); }
}
try {
  const creator = await scalar("insert into app_users(clerk_user_id) values('purchase-creator') returning id as value");
  const buyer = await scalar("insert into app_users(clerk_user_id) values('purchase-buyer') returning id as value");
  const stranger = await scalar("insert into app_users(clerk_user_id) values('purchase-stranger') returning id as value");
  const accounting = JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  async function listing(paid = false, index = 0) {
    const source = await scalar("insert into projects(owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone) values($1,'Private original','cinematic','PRIVATE CREATOR PROMPT','16:9','10','Cinematic','Storytelling') returning id as value", [creator]);
    const id = randomUUID();
    await rpc('marketplace_create_priced', { p_owner_user_id: creator, p_listing_id: id, p_project_id: source,
      p_title: `Shared template ${index}`, p_description: 'Reviewed public description', p_category: 'cinematic', p_tags: [],
      p_instructions: 'Shared creative instructions', p_publish: true, p_rights_confirmed: true, p_adoption_type: paid ? 'paid' : 'free', p_price_minor: paid ? 500 : 0 });
    return { id, source };
  }
  const free = await listing();
  const adopted = await rpc('marketplace_adopt', { p_owner_user_id: buyer, p_listing_id: free.id, p_request_id: randomUUID() });
  // Historical multiple free adoptions remain intact but show one acquired template.
  await rpc('marketplace_adopt', { p_owner_user_id: buyer, p_listing_id: free.id, p_request_id: randomUUID() });
  owner = buyer;
  let page = await service.getAcquiredTemplates();
  check('legacy free records appear once', page.total === 1 && page.items[0].kind === 'free' && page.items[0].amountMinor === 0);
  const freeId = page.items[0].id;
  await pg.query("update projects set prompt='BUYER EDITS' where id=$1", [adopted.projectId]);
  check('details use shared snapshot, not edited/private project', (await service.getAcquiredTemplate(freeId)).purchase.template.instructions === 'Shared creative instructions');
  const paid = await listing(true, 1);
  const prepared = await rpc('marketplace_prepare_purchase', { p_buyer_user_id: buyer, p_listing_id: paid.id, p_fee_bps: 1000, p_pricing_version: 'fixture' });
  check('pending purchase excluded', (await service.getAcquiredTemplates()).total === 1 && await service.getAcquiredTemplate(prepared.id) === null);
  check('pending purchase cannot create project', !(await service.openAcquiredTemplate(prepared.id)).ok);
  await rpc('marketplace_attach_order', { p_purchase_id: prepared.id, p_buyer_user_id: buyer, p_order_id: 'ORDER1234567890' });
  await rpc('marketplace_fulfil_purchase', { p_purchase_id: prepared.id, p_order_id: 'ORDER1234567890', p_capture_id: 'CAPTURE1234567890', p_amount_minor: 500, p_currency: 'USD', p_can_available: true });
  check('completed entitlement visible before project redemption', (await service.getAcquiredTemplates()).total === 2);
  const paidOpen = await service.openAcquiredTemplate(prepared.id);
  check('existing redemption creates owned project', paidOpen.ok && !!(await one('select id from projects where id=$1 and owner_user_id=$2', [paidOpen.projectId, buyer])));
  const again = await service.openAcquiredTemplate(prepared.id);
  check('repeated open reuses same project', again.projectId === paidOpen.projectId);
  await pg.query("update projects set prompt='PRESERVED BUYER EDITS' where id=$1", [paidOpen.projectId]);
  await service.openAcquiredTemplate(prepared.id);
  check('existing edits preserved', (await one('select prompt from projects where id=$1', [paidOpen.projectId])).prompt === 'PRESERVED BUYER EDITS');
  await pg.query("update marketplace_listings set price_minor=900,status='archived',preview_key=$2,preview_etag='fixture',preview_size=100 where id=$1", [paid.id, `marketplace-previews/${paid.id}/${randomUUID()}.webp`]);
  const detail = (await service.getAcquiredTemplate(prepared.id)).purchase;
  check('historical paid price and archive access preserved', detail.amountMinor === 500 && !detail.listingAvailable);
  check('private prompt/storage/payment proof never sent to client', !/PRIVATE CREATOR|PRESERVED BUYER|preview_key|paypal_|source_project_id|storage_key/.test(JSON.stringify(detail)));
  check('only reviewed derivative preview returned', (await service.getAcquiredTemplatePreview(prepared.id)).key.startsWith(`marketplace-previews/${paid.id}/`));
  owner = stranger;
  check('other account sees no acquisitions', (await service.getAcquiredTemplates()).total === 0);
  for (const id of [freeId, prepared.id, paid.id]) {
    check('other account detail denied', await service.getAcquiredTemplate(id) === null);
    check('other account preview denied', await service.getAcquiredTemplatePreview(id) === null);
    check('other account open denied', !(await service.openAcquiredTemplate(id)).ok);
  }
  owner = null;
  await assert.rejects(() => service.getAcquiredTemplates()); checks++;
  await assert.rejects(() => service.openAcquiredTemplate(prepared.id)); checks++;
  owner = buyer;
  await rpc('delete_owned_project', { p_owner_user_id: buyer, p_project_id: paidOpen.projectId });
  const replacement = await service.openAcquiredTemplate(prepared.id);
  check('deleted version replaced without repurchasing', replacement.ok && replacement.projectId !== paidOpen.projectId);
  check('replacement deduplicated', (await service.openAcquiredTemplate(prepared.id)).projectId === replacement.projectId);
  check('replacement uses purchased instructions', (await one('select prompt from projects where id=$1', [replacement.projectId])).prompt === 'Shared creative instructions');
  check('replacement has no copied private assets', await scalar('select count(*)::integer as value from project_assets where project_id=$1', [replacement.projectId]) === 0);
  check('replacement provenance retained', (await rpc('marketplace_origin', { p_owner_user_id: buyer, p_project_id: replacement.projectId })).listingId === paid.id);
  check('original adoption preserved', await scalar('select count(*)::integer as value from marketplace_adoptions where purchase_id=$1', [prepared.id]) === 1);
  check('creator original untouched', (await one('select prompt from projects where id=$1', [paid.source])).prompt === 'PRIVATE CREATOR PROMPT');
  const failListing = await listing(true, 2);
  const failed = await rpc('marketplace_prepare_purchase', { p_buyer_user_id: buyer, p_listing_id: failListing.id, p_fee_bps: 1000, p_pricing_version: 'fixture' });
  await rpc('marketplace_purchase_state', { p_purchase_id: failed.id, p_status: 'failed' });
  check('failed purchase excluded', await service.getAcquiredTemplate(failed.id) === null);
  for (let i = 3; i < 15; i++) {
    const item = await listing(false, i);
    await rpc('marketplace_adopt', { p_owner_user_id: buyer, p_listing_id: item.id, p_request_id: randomUUID() });
  }
  page = await service.getAcquiredTemplates();
  const second = await service.getAcquiredTemplates(2);
  check('pagination counts acquired templates only', page.total === 14 && page.items.length === 12 && second.items.length === 2);
  check('stable pagination has no overlap', second.items.every(item => !page.items.some(first => first.id === item.id)));
  check('out of range returns honest empty page', (await service.getAcquiredTemplates(3)).items.length === 0);
  await assert.rejects(() => service.getAcquiredTemplates(0)); checks++;
  for (const role of ['anon', 'authenticated']) {
    await denied('select * from marketplace_acquisitions', role);
    await denied('select * from marketplace_acquisition_projects', role);
    await denied(`select marketplace_acquisition_detail('${buyer}','${prepared.id}')`, role);
    await denied(`select marketplace_open_acquisition('${buyer}','${prepared.id}')`, role);
    await denied(`select marketplace_acquisition_preview('${buyer}','${prepared.id}')`, role);
  }
  await denied('delete from marketplace_acquisition_projects', 'service_role');
  check('wallet/free accounting unchanged', JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows) === accounting);
  check('no generation jobs created', await scalar('select count(*)::integer as value from generation_jobs') === 0);
  await pg.exec(fs.readFileSync('supabase/migrations/20261110011000_purchases_library.sql', 'utf8'));
  check('migration reruns without losing purchases/projects', (await service.getAcquiredTemplates()).total === 14 && (await service.openAcquiredTemplate(prepared.id)).projectId === replacement.projectId);
  console.log(`Purchases library: ${checks} focused checks passed.`);
} finally { await pg.close(); }
