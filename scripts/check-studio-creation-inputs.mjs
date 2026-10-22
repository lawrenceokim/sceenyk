// Focused offline draft/media checks. No hosted services or workflows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite();
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const migration = fs.readFileSync('supabase/migrations/20261020003200_studio_creation_inputs.sql', 'utf8');
let identity;
// The small adapter executes real SQL as the application's restricted server role.
const db = { from(table) {
  const args = [], filters = [], orders = [];
  let fields = '*', mutation = '', returning = false;
  const parameter = value => { args.push(value); return '$' + args.length; };
  const query = {
    select(value) { fields = value; returning = !!mutation; return this; },
    insert(values) { const keys = Object.keys(values); mutation = `insert into ${table} (${keys.join(',')}) values (${keys.map(key => parameter(values[key])).join(',')})`; return this; },
    update(values) { mutation = `update ${table} set ${Object.entries(values).map(([key, value]) => `${key}=${parameter(value)}`).join(',')}`; return this; },
    eq(key, value) { filters.push(`${key}=${parameter(value)}`); return this; },
    in(key, values) { filters.push(`${key} in (${values.map(parameter).join(',')})`); return this; },
    order(key) { orders.push(key); return this; },
    single() { return this.execute(true); }, maybeSingle() { return this.execute(true); },
    then(resolve, reject) { return this.execute(false).then(resolve, reject); },
    async execute(single) {
      const sql = (mutation || `select ${fields} from ${table}`) + (filters.length ? ' where ' + filters.join(' and ') : '')
        + (orders.length ? ' order by ' + orders.join(',') : '') + (returning ? ` returning ${fields}` : '');
      await pg.exec('set role service_role');
      try { const rows = (await pg.query(sql, args)).rows; return { data: single ? rows[0] ?? null : rows, error: null }; }
      catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
      finally { await pg.exec('reset role'); }
    },
  };
  return query;
} };
const load = typescriptLoader({
  '@/lib/db/server': { createDatabaseClient: () => db },
  '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!identity) throw Error('AUTH_REQUIRED'); return { id: identity }; } },
  '@/lib/storage/server': {
    getStorageConfig: () => ({ maxUploadBytes: 1000000 }),
    createStorageKey: (owner, project, asset) => `users/${owner}/projects/${project}/${asset}/fixture`,
    createUploadUrl: async () => ({ url: 'https://example.invalid/upload', headers: {}, expiresAt: 'fixture' }),
    verifyStoredMedia: async () => ({ status: 'verified', etag: 'fixture' }),
    createReadUrl: async () => ({ url: 'https://example.invalid/private' }),
  },
});
const scalar = async (sql, args = []) => (await pg.query(sql, args)).rows[0]?.value;
async function refused(sql, args = [], role = 'service_role') {
  await pg.exec(`set role ${role}`);
  try { await pg.query(sql, args); return false; } catch { return true; }
  finally { await pg.exec('reset role'); }
}
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of ['20261009000100_app_users.sql', '20261009000200_projects.sql', '20261009000300_project_assets.sql']) {
    await pg.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
  }
  const owner = await scalar("insert into app_users(clerk_user_id) values ('fixture-a') returning id value");
  const other = await scalar("insert into app_users(clerk_user_id) values ('fixture-b') returning id value");
  const legacyId = await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values ($1,'Legacy','cinematic','16:9','10','Original','Storytelling') returning id value", [owner]);
  await pg.exec(migration);
  await pg.exec(migration);
  check(await scalar('select creation_type value from projects where id=$1', [legacyId]) === 'freestyle', 'migration reruns preserve legacy flow');
  identity = owner;
  const projects = load('lib/projects/server.ts'), media = load('lib/media/server.ts');
  const legacy = await projects.getOwnedProject(legacyId);
  check(legacy.creationType === 'freestyle' && legacy.ugcType === 'advertisement', 'legacy project reopens');
  const id = randomUUID();
  const brief = { title: 'UGC fixture', prompt: 'A product demonstration', category: 'cinematic', creationType: 'ugc', ugcType: 'unboxing', settings: legacy.settings };
  check((await projects.saveOwnedProject({ ...brief, id, mode: 'create' })).ok, 'new UGC saves');
  check((await projects.getOwnedProject(id)).ugcType === 'unboxing', 'UGC choice survives reopen');
  const upload = async role => media.authorizeOwnedUpload({ projectId: id, requestId: randomUUID(), referenceId: role === 'freestyle' ? null : randomUUID(), studioRole: role, filename: role + '.png', mimeType: 'image/png', sizeBytes: 12, kind: 'image' });
  const character = await upload('character');
  await media.finalizeOwnedUpload({ projectId: id, assetId: character.asset.id });
  // Seed historical data before installing V1; current services must never create it.
  const character2 = { asset: { ...character.asset, id: randomUUID() } };
  await pg.query(`insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,reference_id)
    select $1,owner_user_id,project_id,$2,$3,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag,studio_role,$4 from project_assets where id=$5`,
    [character2.asset.id, randomUUID(), `users/${owner}/projects/${id}/${character2.asset.id}/legacy`, randomUUID(), character.asset.id]);
  const oldProducts = [randomUUID(), randomUUID()];
  for (const assetId of oldProducts) await pg.query(`insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,studio_role,reference_id)
    values($1,$2,$3,$4,$5,'old-product.png','image/png',12,'image','product',$6)`,
    [assetId, owner, legacyId, randomUUID(), `users/${owner}/projects/${legacyId}/${assetId}/legacy`, randomUUID()]);
  const v1Migration = fs.readFileSync('supabase/migrations/20261022003500_ugc_v1_reference_limits.sql', 'utf8');
  await pg.exec(v1Migration); await pg.exec(v1Migration);
  check((await media.listOwnedAssets(legacyId)).length === 2, 'migration preserves all legacy product references');
  const oldProductSave = await projects.saveOwnedProject({ ...brief, id: legacyId, mode: 'update' });
  check(!oldProductSave.ok && oldProductSave.message.includes('one product'), 'legacy product extras block UGC save clearly');
  await assert.rejects(() => media.finalizeOwnedUpload({ projectId: legacyId, assetId: oldProducts[0] }), error => error.code === 'INVALID_INPUT'); checks++;
  await media.removeOwnedStudioReference({ projectId: legacyId, assetId: oldProducts[1] });
  check((await media.finalizeOwnedUpload({ projectId: legacyId, assetId: oldProducts[0] })).status === 'uploaded', 'legacy pending upload recovers after reducing extras');
  const product = await upload('product'), freestyle = await upload('freestyle');
  for (const { asset } of [product, freestyle]) await media.finalizeOwnedUpload({ projectId: id, assetId: asset.id });
  check((await media.listOwnedAssets(id)).length === 4, 'all roles reuse private media');
  await projects.saveOwnedProject({ ...brief, id, mode: 'update', creationType: 'freestyle' });
  check((await media.listOwnedAssets(id)).length === 4 && (await projects.getOwnedProject(id)).ugcType === 'unboxing', 'switch retains both flows and hidden UGC type');
  const invalidSave = await projects.saveOwnedProject({ ...brief, id, mode: 'update' });
  check(!invalidSave.ok && invalidSave.code === 'INVALID_INPUT' && invalidSave.message.includes('one character'), 'legacy over-limit UGC save is blocked clearly');
  await assert.rejects(() => upload('character'), error => error.code === 'INVALID_INPUT' && error.message.includes('one character')); checks++;
  await assert.rejects(() => upload('product'), error => error.code === 'INVALID_INPUT' && error.message.includes('one product')); checks++;
  const sources = load('components/creation/studio-inputs.ts');
  const before = sources.collectStudioSources([], await media.listOwnedAssets(id));
  check(before.characters.length === 2 && before.products.length === 1 && before.projectMedia.assets.length === 1, 'sources remain partitioned');
  check(sources.prepareStudioInputs(brief, before).characters.length === 2, 'UGC preparation exposes structured references');
  check(!sources.prepareStudioInputs(brief, before).generationValidation.ready, 'legacy extras block UGC generation readiness');
  check(!('ugcType' in sources.prepareStudioInputs({ ...brief, creationType: 'freestyle' }, before)), 'Freestyle preparation omits UGC type');
  await media.removeOwnedStudioReference({ projectId: id, assetId: character.asset.id });
  await media.removeOwnedStudioReference({ projectId: id, assetId: character.asset.id });
  const after = sources.collectStudioSources([], await media.listOwnedAssets(id));
  check(after.characters.length === 1 && after.products.length === 1 && after.projectMedia.assets.length === 1, 'individual removal is durable and idempotent');
  check((await projects.saveOwnedProject({ ...brief, id, mode: 'update' })).ok, 'UGC save resumes after reducing references');
  check(sources.prepareStudioInputs(brief, after).generationValidation.ready, 'exactly one uploaded character/product is ready');
  check(await scalar('select count(*)::int value from project_assets where project_id=$1', [id]) === 4, 'removal retains bytes metadata/history');
  const referenceSchema = load('lib/projects/ugc-v1.ts');
  for (const role of ['character', 'product']) {
    check(referenceSchema.ugcV1SelectionError(role, 0, 1) === null, role + ' accepts one selection');
    check(!!referenceSchema.ugcV1SelectionError(role, 0, 2), role + ' rejects multi-file picker injection');
    check(!!referenceSchema.ugcV1SelectionError(role, 1, 1), role + ' rejects second state selection');
    check(referenceSchema.ugcV1SelectionError(role, 0, 1) === null, role + ' permits replacement after removal');
  }
  check(!referenceSchema.ugcV1ReferenceLimitsSchema.safeParse({ characters: [1, 2], products: [1] }).success, 'draft validation rejects two characters');
  check(!referenceSchema.ugcV1ReferenceLimitsSchema.safeParse({ characters: [1], products: [1, 2] }).success, 'draft validation rejects two products');
  for (const [characters, products] of [[[], []], [after.characters, []], [[], after.products]]) {
    check(!sources.prepareStudioInputs(brief, { ...after, characters, products }).generationValidation.ready, 'missing required reference blocks future generation');
  }
  check(!sources.prepareStudioInputs({ ...brief, prompt: ' ' }, after).generationValidation.ready, 'blank scene blocks future generation');
  // Both roles can be removed/replaced without deleting bytes or refreshing.
  await media.removeOwnedStudioReference({ projectId: id, assetId: character2.asset.id });
  await media.removeOwnedStudioReference({ projectId: id, assetId: product.asset.id });
  const replacement = await upload('character'), replacementProduct = await upload('product');
  check(replacement.asset.id !== character2.asset.id && replacementProduct.asset.id !== product.asset.id, 'both freed slots accept replacement');
  const retryInput = { projectId: id, requestId: randomUUID(), referenceId: null, studioRole: 'freestyle', filename: 'extra.png', mimeType: 'image/png', sizeBytes: 12, kind: 'image' };
  check((await media.authorizeOwnedUpload(retryInput)).asset.studioRole === 'freestyle', 'Freestyle still accepts more media');
  const row = (await pg.query('select * from project_assets where id=$1', [replacement.asset.id])).rows[0];
  const retry = await media.authorizeOwnedUpload({ projectId: id, requestId: row.upload_request_id, referenceId: row.reference_id, studioRole: 'character', filename: row.original_filename, mimeType: row.mime_type, sizeBytes: row.size_bytes, kind: row.media_type });
  check(retry.asset.id === replacement.asset.id, 'same-slot upload retry remains idempotent');
  const duplicate = { ...row, id: randomUUID(), upload_request_id: randomUUID(), storage_key: `users/${owner}/projects/${id}/${randomUUID()}/blocked` };
  duplicate.storage_key = `users/${owner}/projects/${id}/${duplicate.id}/blocked`;
  delete duplicate.created_at; delete duplicate.updated_at;
  const insertion = await db.from('project_assets').insert(duplicate).select('*').single();
  check(insertion.error?.code === '23514' && insertion.error.message.includes('one character'), 'SQL rejects bypassing service limit');
  check(await refused('update project_assets set removed_from_draft=false where id=$1', [character.asset.id]), 'SQL rejects reattaching into an occupied slot');
  await assert.rejects(() => media.removeOwnedStudioReference({ projectId: id, assetId: freestyle.asset.id })); checks++;
  identity = other;
  check(await projects.getOwnedProject(id) === null, 'other account cannot read project');
  check(!(await projects.saveOwnedProject({ ...brief, id, mode: 'update' })).ok, 'other account cannot update project');
  for (const operation of [() => media.listOwnedAssets(id), () => media.removeOwnedStudioReference({ projectId: id, assetId: product.asset.id }), () => media.readOwnedAsset({ projectId: id, assetId: product.asset.id })]) {
    await assert.rejects(operation); checks++;
  }
  identity = null;
  await assert.rejects(() => projects.saveOwnedProject({ ...brief, id, mode: 'update' })); checks++;
  for (const role of ['anon', 'authenticated']) {
    check(await refused('select * from projects', [], role), role + ' cannot read projects');
    check(await refused('update project_assets set removed_from_draft=true', [], role), role + ' cannot detach media');
  }
  check(await refused("update project_assets set studio_role='product' where id=$1", [character2.asset.id]), 'service cannot reassign reference role');
  check(await refused("update projects set creation_type='invalid' where id=$1", [id]), 'database validates creation type');
  const validation = load('lib/media/validation.ts').authorizeUploadSchema;
  check(!validation.safeParse({ projectId: id, requestId: randomUUID(), filename: 'video.mp4', mimeType: 'video/mp4', sizeBytes: 12, kind: 'video', studioRole: 'character', referenceId: randomUUID() }).success, 'UGC references reject video');
  const localA = { id: randomUUID(), referenceId: randomUUID(), studioRole: 'character', kind: 'image', file: new File(['a'], 'a.png', { type: 'image/png' }) };
  const localB = { ...localA, id: randomUUID(), studioRole: 'product', referenceId: randomUUID() };
  const locals = sources.collectStudioSources([localA, localB], []);
  check(locals.characters.length === 1 && locals.products.length === 1, 'local roles remain independent');
  check(sources.collectStudioSources([localB], []).products.length === 1, 'local removal keeps other references');
  const grouped = sources.collectStudioSources([localA, { ...localA, id: randomUUID() }], []);
  check(grouped.characters.length === 1 && grouped.characters[0].images.length === 2, 'reference model supports future image grouping');
  const storage = new Map();
  const guest = typescriptLoader({}, { sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } })('components/creation/guest-draft.ts');
  guest.rememberGuestDraft(brief, [localA, localB]);
  check(guest.readGuestDraft().brief.creationType === 'ugc' && guest.readGuestDraft().brief.ugcType === 'unboxing', 'guest brief retains creation choices');
  check(guest.readGuestDraft().files[0].referenceId === localA.referenceId && guest.readGuestDraft().files[1].studioRole === 'product', 'same-document auth retains reference roles and groups');
  check(![...storage.values()][0].includes(localA.referenceId), 'guest storage excludes file references');
  guest.clearGuestDraft();
  console.log(JSON.stringify({ passed: checks, scope: 'Studio migration rerun, compatibility, persistence, source isolation, removal, ownership and validation; offline only' }));
} finally { await pg.close(); }
