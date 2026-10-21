// Focused offline acceptance: real migrations/RPCs/services; synthetic identities
// and storage only. No hosted workflows, accounts, media or payments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { compositionFixtureDatabase } from './lib/composition-fixture.mjs';
import { typescriptLoader } from './lib/load-typescript.mjs';

const { pg, db, one, scalar } = await compositionFixtureDatabase();
let owner;
let stored;
const load = typescriptLoader({
  'next/server': { connection: async () => {} },
  'next/navigation': { unstable_rethrow: () => {} },
  '@clerk/nextjs/server': { auth: async () => ({ userId: owner ? 'fixture_clerk' : null }) },
  '@/lib/db/server': { createDatabaseClient: () => db },
  '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!owner) throw new Error('AUTH_REQUIRED'); return { id: owner }; } },
  '@/lib/media/server': { readOwnedAsset: async () => ({ url: 'https://private.invalid/owned-source' }) },
  '@/lib/storage/r2': {
    putR2CreatorAvatar: async (key, bytes) => { stored = { key, bytes }; return 'fixture-etag'; },
    readR2AnalysisMedia: async (key, etag, size) => {
      assert.equal(key, stored.key); assert.equal(etag, 'fixture-etag'); assert.equal(size, stored.bytes.length);
      return new ReadableStream({ start(controller) { controller.enqueue(stored.bytes); controller.close(); } });
    },
  },
}, { File, FormData, Response });
const service = load('lib/marketplace/server.ts');
const templates = load('lib/marketplace/project-template.ts');
const previewRoute = load('app/api/marketplace/listings/[listingId]/preview/route.ts');
let count = 0;
function check(name, value) { assert.ok(value, name); count++; }
async function rpc(name, args) { const result = await db.rpc(name, args); assert.equal(result.error, null, result.error?.message); return result.data; }
try {
  // Rerun the additive migration against its real prerequisites.
  await pg.exec(fs.readFileSync('supabase/migrations/20261021003300_project_template_previews.sql', 'utf8'));
  const a = await scalar("insert into app_users(clerk_user_id) values('template_fixture_a') returning id as value");
  const b = await scalar("insert into app_users(clerk_user_id) values('template_fixture_b') returning id as value");
  const project = await scalar("insert into projects(owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type) values($1,'Project title','product-ad','Show the product in a short unboxing scene.','9:16','10','Original','Storytelling','ugc','unboxing') returning id as value", [a]);
  const asset = randomUUID();
  await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'source.png','image/png',100,'image','uploaded','fixture-etag')", [asset, a, project, randomUUID(), `users/${a}/projects/${project}/${asset}/private`]);
  const before = JSON.stringify(await one('select * from projects where id=$1', [project]));
  owner = b;
  check('foreign Project cannot initialize a Template', !(await templates.initializeProjectTemplate(project)).ok);
  owner = null;
  await assert.rejects(() => templates.initializeProjectTemplate(project)); count++;
  owner = a;
  const [first, repeat] = await Promise.all([templates.initializeProjectTemplate(project), templates.initializeProjectTemplate(project)]);
  check('both entry attempts reuse one listing', first.ok && repeat.ok && first.listingId === repeat.listingId);
  const id = first.listingId;
  check('one source listing in database', await scalar('select count(*)::int as value from marketplace_listings where source_project_id=$1', [project]) === 1);
  const listing = await service.getOwnedMarketplaceListing(id);
  check('initialized draft stays private and unconfirmed', listing.status === 'draft' && !listing.rightsConfirmed && await service.getMarketplaceListing(id) === null);
  check('prefilled Project text', listing.title === 'Project title' && listing.description === 'Show the product in a short unboxing scene.' && listing.template.instructions === listing.description);
  check('creation enums and settings snapshotted', listing.template.creationType === 'ugc' && listing.template.ugcType === 'unboxing' && listing.template.settings.aspectRatio === '9:16');
  check('initialization leaves original Project unchanged', JSON.stringify(await one('select * from projects where id=$1', [project])) === before);
  check('draft instructions can be reviewed before first publication', (await service.updateMarketplaceListing({ id, title: listing.title, description: listing.description, category: listing.category, tags: [], rightsConfirmed: false, status: 'draft', instructions: 'Use your own product and show an unboxing sequence.' })).ok);
  check('reviewed draft instructions persist separately', (await service.getOwnedMarketplaceListing(id)).template.instructions === 'Use your own product and show an unboxing sequence.');
  check('Project resolves existing Template', (await templates.getOwnedProjectTemplates([project]))[project] === id);
  check('private preview uses exact Project source', (await rpc('marketplace_template_source', { p_listing_id: id, p_owner_user_id: a })).assetId === asset);
  check('owner source URL requires ownership', (await templates.getOwnedTemplateSource(id)).kind === 'image');
  owner = b;
  check('foreign source URL denied', await templates.getOwnedTemplateSource(id) === null);
  check('foreign relationship lookup empty', Object.keys(await templates.getOwnedProjectTemplates([project])).length === 0);
  const metadata = { id, title: listing.title, description: listing.description, category: listing.category, tags: [], rightsConfirmed: true, status: 'published' };
  check('foreign update denied', !(await service.updateMarketplaceListing(metadata)).ok);
  owner = a;
  const source = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#774499' } }).webp().withMetadata().toBuffer();
  const form = new FormData(); form.set('preview', new File([source], 'preview.webp', { type: 'image/webp' }));
  check('unconfirmed preview rejected', !(await service.updateMarketplaceListing({ ...metadata, rightsConfirmed: false }, form)).ok);
  check('publish and derivative save together', (await service.updateMarketplaceListing(metadata, form)).ok);
  const imageMetadata = await sharp(stored.bytes).metadata();
  check('public derivative reencoded without metadata', imageMetadata.format === 'webp' && !imageMetadata.exif && !imageMetadata.icc && stored.bytes.length <= 524288);
  const published = await service.getMarketplaceListing(id);
  check('published instructions cannot be rewritten', !(await service.updateMarketplaceListing({ ...metadata, instructions: 'Replace the published instructions.' })).ok);
  check('public URL uses only listing identity', published.previewUrl === `/api/marketplace/listings/${id}/preview`);
  const publicJson = JSON.stringify(published);
  check('public DTO excludes source identities and capabilities', !publicJson.includes(project) && !publicJson.includes(asset) && !publicJson.includes(a) && !publicJson.includes('users/') && !publicJson.includes('marketplace-previews/'));
  check('published derivative accessible to public gate', !!await rpc('marketplace_template_preview', { p_listing_id: id, p_owner_user_id: null }));
  owner = null;
  const publicPreview = await previewRoute.GET(null, { params: Promise.resolve({ listingId: id }) });
  check('public preview route streams derivative without a storage redirect', publicPreview.status === 200 && publicPreview.headers.get('Content-Type') === 'image/webp' && !publicPreview.headers.has('Location') && (await publicPreview.arrayBuffer()).byteLength === stored.bytes.length);
  check('preview responses prohibit browser/CDN caching', publicPreview.headers.get('Cache-Control').includes('no-store') && publicPreview.headers.get('Vercel-CDN-Cache-Control') === 'no-store');
  await pg.query("update projects set title='Later project edit',prompt='Changed private prompt' where id=$1", [project]);
  const unchanged = await service.getMarketplaceListing(id);
  check('Project edits do not overwrite published metadata or preview', unchanged.title === published.title && unchanged.template.instructions === published.template.instructions && unchanged.previewUrl === published.previewUrl);
  owner = b;
  const adopted = await service.adoptMarketplaceListing({ listingId: id, requestId: randomUUID() });
  const copy = await one('select * from projects where id=$1', [adopted.projectId]);
  check('adoption retains existing ownership and new enum snapshot', copy.owner_user_id === b && copy.creation_type === 'ugc' && copy.ugc_type === 'unboxing');
  owner = a;
  check('unpublish succeeds', (await service.updateMarketplaceListing({ ...metadata, status: 'unpublished' })).ok);
  check('unpublished derivative blocked publicly', await rpc('marketplace_template_preview', { p_listing_id: id, p_owner_user_id: null }) === null);
  check('owner still sees unpublished derivative', !!await rpc('marketplace_template_preview', { p_listing_id: id, p_owner_user_id: a }));
  owner = null;
  check('unpublished public HTTP read returns 404', (await previewRoute.GET(null, { params: Promise.resolve({ listingId: id }) })).status === 404);
  owner = b;
  check('foreign HTTP preview read returns 404', (await previewRoute.GET(null, { params: Promise.resolve({ listingId: id }) })).status === 404);
  owner = a;
  check('owner HTTP preview read remains available', (await previewRoute.GET(null, { params: Promise.resolve({ listingId: id }) })).status === 200);
  const rowBeforeInvalid = JSON.stringify(await one('select * from marketplace_listings where id=$1', [id]));
  const invalid = await db.rpc('marketplace_update_template', { p_owner_user_id: a, p_listing_id: id, p_title: 'Must roll back', p_description: metadata.description, p_category: metadata.category, p_tags: [], p_status: 'published', p_rights_confirmed: true, p_adoption_type: 'free', p_price_minor: 0, p_instructions: null, p_preview_key: 'users/private/source', p_preview_etag: 'bad', p_preview_size: 4 });
  check('invalid preview rolls back public metadata update', !!invalid.error && JSON.stringify(await one('select * from marketplace_listings where id=$1', [id])) === rowBeforeInvalid);
  for (const role of ['anon', 'authenticated']) {
    await pg.exec(`set role ${role}`);
    await assert.rejects(() => pg.query('select marketplace_initialize_template($1,$2,$3,$4,$5,$6)', [a, project, randomUUID(), 'title', 'description', 'instructions'])); count++;
    await pg.exec('reset role');
  }
  const newPage = fs.readFileSync('app/(account)/settings/templates/new/page.tsx', 'utf8');
  check('picker uses shared Project publish action, owner fence and previews', newPage.includes('<ProjectPublish') && newPage.includes('<ProjectPreview') && newPage.includes('<TemplateAccountBoundary'));
  const publish = fs.readFileSync('components/projects/project-publish.tsx', 'utf8');
  check('both paths navigate to existing management route after POST', publish.includes('initializeTemplateAction(projectId)') && publish.includes('/settings/templates/${result.listingId}') && publish.includes('inFlight.current'));
  console.log(`${count} focused Project → Template checks passed.`);
} finally { await pg.close(); }
