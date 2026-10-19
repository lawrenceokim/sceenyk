// Actual SQL migrations/RPCs with isolated identities; never touches hosted data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { compositionFixtureDatabase } from './lib/composition-fixture.mjs';
import { typescriptLoader } from './lib/load-typescript.mjs';

const { pg, db, scalar, call } = await compositionFixtureDatabase();
const checks = [], invalidations = [];
let identity = null;
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const load = typescriptLoader({
  '@/lib/db/server': { createDatabaseClient: () => db },
  '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!identity) throw Error('AUTH_REQUIRED'); return { id: identity }; }, AppUserSyncError: class extends Error {} },
  'next/navigation': { unstable_rethrow: () => {} },
  'next/cache': { revalidatePath: path => invalidations.push(path) },
  '@/lib/storage/server': {},
  '@/lib/storage/r2': {},
});
const service = load('lib/projects/server.ts'), action = load('app/actions/projects.ts');
const media = load('lib/media/server.ts'), finalVideo = load('lib/final-render/server.ts');
const user = async () => scalar('insert into app_users(clerk_user_id) values($1) returning id value', [randomUUID()]);
const project = async owner => scalar("insert into projects(owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone) values($1,'Delete fixture','cinematic','Saved prompt','16:9','10','Original','Professional') returning id value", [owner]);
const snapshot = { version: 1, prompt: 'Describe a scene.', category: 'cinematic', settings: { aspectRatio: '16:9', duration: '10', visualStyle: 'Original', tone: 'Professional' }, assetIds: [] };
const quoteArgs = (owner, id) => ({ p_owner_user_id: owner, p_project_id: id, p_request_id: randomUUID(), p_snapshot: snapshot, p_credit_cost: null, p_pricing_version: 'fixture', p_pricing_mode: 'unconfigured' });
async function denied(sql, args, role = 'service_role') {
  await pg.exec('set role ' + role);
  try { await pg.query(sql, args); return false; }
  catch { return true; }
  finally { await pg.exec('reset role'); }
}
try {
  const owner = await user(), other = await user(), id = await project(owner);
  const asset = randomUUID();
  await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'source.png','image/png',100,'image','uploaded','etag')", [asset, owner, id, randomUUID(), `users/${owner}/projects/${id}/${asset}/${randomUUID()}`]);
  const template = { version: 1, category: 'cinematic', instructions: 'Use your own scene.', settings: snapshot.settings };
  const listing = randomUUID();
  await pg.query("insert into marketplace_listings(id,creator_user_id,source_project_id,title,description,category,creator_name,template_snapshot,status,rights_confirmed_at,published_at) values($1,$2,$3,'Shared template','A reusable brief.','cinematic','Creator',$4,'published',now(),now())", [listing, owner, id, template]);
  const assetsBefore = JSON.stringify((await pg.query('select * from project_assets')).rows);
  const listingsBefore = JSON.stringify((await pg.query('select * from marketplace_listings')).rows);
  const financialBefore = JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  identity = other;
  check('foreign project delete denied', (await action.deleteProjectAction({ id })).code === 'NOT_FOUND');
  check('foreign and missing IDs are indistinguishable', (await action.deleteProjectAction({ id: randomUUID() })).code === 'NOT_FOUND');
  identity = null;
  check('anonymous delete fails closed', !(await action.deleteProjectAction({ id })).ok);
  identity = owner;
  for (const input of [{ id: 'bad' }, { id, owner_user_id: other }, { id, title: 'Injected' }]) check('invalid/injected delete rejected', (await service.deleteOwnedProject(input)).code === 'INVALID_INPUT');
  check('denials do not invalidate routes', invalidations.length === 0);
  check('owner delete succeeds', (await action.deleteProjectAction({ id })).ok);
  check('project removed from active list selection', Number(await scalar("select count(*) value from projects where id=$1 and status='draft'", [id])) === 0);
  check('deleted project cannot reopen', await service.getOwnedProject(id) === null);
  await assert.rejects(() => media.listOwnedAssets(id), error => error.code === 'NOT_FOUND');
  check('deleted project cannot list retained private media', true);
  check('deleted project cannot obtain a final-video URL', await finalVideo.getOwnedFinalVideo({ projectId: id, jobId: randomUUID() }) === null);
  check('deletion marker retained', !!await scalar('select deleted_at value from projects where id=$1', [id]));
  check('repeated deletion idempotent', (await action.deleteProjectAction({ id })).ok);
  check('list and editor caches invalidated', invalidations.join(',') === `/projects,/projects/${id},/projects,/projects/${id}`);
  check('project media records retained', JSON.stringify((await pg.query('select * from project_assets')).rows) === assetsBefore);
  check('published template/snapshot retained', JSON.stringify((await pg.query('select * from marketplace_listings')).rows) === listingsBefore);
  check('free/credit balances unchanged', JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows) === financialBefore);
  check('deleted project cannot be renamed', await denied('update projects set title=$1 where id=$2', ['Revive', id]));
  check('direct marker mutation prohibited', await denied('update projects set deleted_at=null where id=$1', [id]));
  check('direct project deletion prohibited', await denied('delete from projects where id=$1', [id]));
  const active = await project(owner);
  const quote = await call('issue_generation_quote', quoteArgs(owner, active));
  const admitted = await call('confirm_generation_quote', { p_owner_user_id: owner, p_quote_id: quote.quote.id, p_current_pricing_version: 'fixture' });
  check('fixture generation admitted', admitted.code === 'ACCEPTED');
  check('queued generation prevents deletion', (await service.deleteOwnedProject({ id: active })).code === 'ACTIVE_GENERATION');
  const balancesDuring = JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  const jobDuring = JSON.stringify((await pg.query('select * from generation_jobs')).rows);
  check('blocked deletion preserves live project', !!await service.getOwnedProject(active));
  await call('claim_generation_job', { p_job_id: admitted.job_id, p_run_id: randomUUID() });
  check('processing generation prevents deletion', (await service.deleteOwnedProject({ id: active })).code === 'ACTIVE_GENERATION');
  check('blocked delete leaves reservation balances intact', JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows) === balancesDuring);
  check('blocked delete leaves jobs intact', (await scalar('select count(*) value from generation_jobs')) === JSON.parse(jobDuring).length);
  const beforeRejectedJob = JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  const rejected = await db.rpc('issue_generation_quote', quoteArgs(owner, id));
  check('new quote cannot attach to deleted project', rejected.error?.code === '23503');
  check('rejected admission grants/debits nothing', JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows) === beforeRejectedJob);
  const newAsset = randomUUID();
  check('new source reference blocked', await denied("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type) values($1,$2,$3,$4,$5,'new.png','image/png',100,'image')", [newAsset, owner, id, randomUUID(), `users/${owner}/projects/${id}/${newAsset}/${randomUUID()}`]));
  const stale = await project(owner);
  const staleQuote = await call('issue_generation_quote', quoteArgs(owner, stale));
  check('unconfirmed quote does not block deletion', (await service.deleteOwnedProject({ id: stale })).ok);
  const beforeStaleConfirmation = JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  const staleConfirmation = await db.rpc('confirm_generation_quote', { p_owner_user_id: owner, p_quote_id: staleQuote.quote.id, p_current_pricing_version: 'fixture' });
  check('stale quote cannot start deleted project', !!staleConfirmation.error);
  check('stale quote rejection does not debit', JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows) === beforeStaleConfirmation);
  for (const role of ['anon', 'authenticated']) {
    check(role + ' cannot invoke deletion RPC', await denied('select delete_owned_project($1,$2)', [owner, id], role));
    check(role + ' cannot mark projects deleted', await denied("update projects set status='deleted',deleted_at=now() where id=$1", [active], role));
  }
  const markerBefore = await scalar('select deleted_at value from projects where id=$1', [id]);
  await pg.exec(fs.readFileSync('supabase/migrations/20261019003100_project_deletion.sql', 'utf8'));
  check('migration rerun preserves deletion marker', String(await scalar('select deleted_at value from projects where id=$1', [id])) === String(markerBefore));
  check('deletion remains idempotent after migration rerun', (await service.deleteOwnedProject({ id })).ok);
  console.log(JSON.stringify({ passed: checks.length, scope: 'Local actual-schema deletion, ownership, references, accounting and rerun checks; no hosted writes', checks }));
} finally { await pg.close(); }
