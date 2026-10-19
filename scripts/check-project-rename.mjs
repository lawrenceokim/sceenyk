// Focused local checks: actual project schema/grants with fixture identities.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite();
let identity;
let writes = 0;
const invalidations = [];
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const database = { from(table) {
  assert.equal(table, 'projects');
  let update, columns = '*';
  const filters = [];
  return {
    update(fields) { update = fields; return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    select(value) { columns = value; return this; },
    async maybeSingle() {
      await pg.exec('set role service_role');
      try {
        if (update) { assert.deepEqual(Object.keys(update), ['title']); writes++; }
        const args = update ? [update.title] : [];
        const where = filters.map(([column, value]) => { assert.ok(['id', 'owner_user_id', 'status'].includes(column)); args.push(value); return `${column}=$${args.length}`; }).join(' and ');
        const sql = update ? `update projects set title=$1 where ${where} returning ${columns}` : `select ${columns} from projects where ${where}`;
        return { data: (await pg.query(sql, args)).rows[0] ?? null, error: null };
      } finally { await pg.exec('reset role'); }
    },
  };
} };
const load = typescriptLoader({
  '@/lib/db/server': { createDatabaseClient: () => database },
  '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!identity) throw Error('AUTH_REQUIRED'); return { id: identity }; }, AppUserSyncError: class extends Error {} },
  'next/navigation': { unstable_rethrow: () => {} },
  'next/cache': { revalidatePath: path => invalidations.push(path) },
});

try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const migration of ['20261009000100_app_users.sql', '20261009000200_projects.sql']) await pg.exec(fs.readFileSync('supabase/migrations/' + migration, 'utf8'));
  const owner = randomUUID(), other = randomUUID(), projectId = randomUUID();
  await pg.query('insert into app_users(id,clerk_user_id) values($1,$2),($3,$4)', [owner, 'fixture-a', other, 'fixture-b']);
  await pg.query("insert into projects(id,owner_user_id,title,prompt,category,aspect_ratio,duration,visual_style,tone) values($1,$2,'Original title','Saved original prompt','cinematic','9:16','15','Anime','Dramatic')", [projectId, owner]);
  const service = load('lib/projects/server.ts');
  const action = load('app/actions/projects.ts');
  identity = owner;
  const before = (await pg.query('select * from projects where id=$1', [projectId])).rows[0];
  const renamed = await action.renameProjectAction({ id: projectId, title: '  New title  ' });
  check('owner can rename and title is trimmed', renamed.ok && renamed.project.title === 'New title');
  const after = (await pg.query('select * from projects where id=$1', [projectId])).rows[0];
  for (const column of Object.keys(before).filter(key => !['title', 'updated_at'].includes(key))) assert.deepEqual(after[column], before[column]);
  check('rename preserves every other project column', true);
  check('response exposes only summary fields', Object.keys(renamed.project).sort().join(',') === 'id,title,updatedAt');
  check('list and existing Studio route invalidate', invalidations.join(',') === `/projects,/projects/${projectId}`);
  const reopened = await service.getOwnedProject(projectId);
  check('existing Studio loader restores same ID and saved settings', reopened.id === projectId && reopened.prompt === before.prompt && reopened.settings.aspectRatio === '9:16' && reopened.settings.visualStyle === 'Anime' && reopened.settings.duration === '15' && reopened.settings.tone === 'Dramatic');
  await pg.query("update projects set prompt='Concurrent editor change' where id=$1", [projectId]);
  await service.renameOwnedProject({ id: projectId, title: 'Second title' });
  check('concurrent brief changes survive rename', (await service.getOwnedProject(projectId)).prompt === 'Concurrent editor change');
  const beforeInvalid = writes;
  for (const input of [{ id: projectId, title: ' ' }, { id: projectId, title: 'x'.repeat(121) }, { id: 'invalid', title: 'Title' }, { id: projectId, title: 'Title', owner_user_id: other }, { id: projectId, title: 'Title', prompt: 'Overwrite' }]) {
    check('invalid or injected payload rejected', (await service.renameOwnedProject(input)).code === 'INVALID_INPUT');
  }
  check('invalid input never reaches update', writes === beforeInvalid);
  identity = other;
  check('foreign project rename denied', (await action.renameProjectAction({ id: projectId, title: 'Foreign edit' })).code === 'NOT_FOUND');
  check('foreign project reopening denied', await service.getOwnedProject(projectId) === null);
  identity = null;
  check('anonymous action fails closed', !(await action.renameProjectAction({ id: projectId, title: 'Anonymous edit' })).ok);
  check('denied actions do not invalidate routes', invalidations.length === 2);
  for (const role of ['anon', 'authenticated']) {
    await pg.exec('set role ' + role);
    let denied = false;
    try { await pg.query('update projects set title=$1 where id=$2', ['Browser edit', projectId]); } catch { denied = true; }
    finally { await pg.exec('reset role'); }
    check(role + ' cannot update projects directly', denied);
  }
  identity = owner;
  check('owner data intact after denials', (await service.getOwnedProject(projectId)).title === 'Second title');
  console.log(JSON.stringify({ passed: checks.length, scope: 'Local project rename/ownership/reopen only; no hosted writes', checks }));
} finally { await pg.close(); }
