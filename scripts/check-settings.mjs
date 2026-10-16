// Isolated PostgreSQL/service/Clerk-policy checks; no hosted workflow/provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { compositionFixtureDatabase } from './lib/composition-fixture.mjs';
import { typescriptLoader } from './lib/load-typescript.mjs';

const { pg, db, scalar } = await compositionFixtureDatabase();
let identity = null;
const invalidations = [];
const load = typescriptLoader({
  '@/lib/db/server': { createDatabaseClient: () => db },
  '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!identity) throw Error('AUTH_REQUIRED'); return { id: identity, clerk_user_id: 'clerk-' + identity }; } },
  'next/navigation': { unstable_rethrow: () => {} },
  'next/cache': { revalidatePath: path => invalidations.push(path) },
});
const service = load('lib/settings/server.ts'), actions = load('app/actions/settings.ts');
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
async function denied(name, sql, args, role) {
  await pg.exec('set role ' + role); let refused = false;
  try { await pg.query(sql, args); } catch { refused = true; } finally { await pg.exec('reset role'); }
  check(name, refused);
}
try {
  const a = await scalar('insert into app_users(clerk_user_id) values($1) returning id value', [randomUUID()]);
  const b = await scalar('insert into app_users(clerk_user_id) values($1) returning id value', [randomUUID()]);
  const project = await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Existing draft','cinematic','16:9','10','Original','Storytelling') returning id value", [a]);
  const protectedBefore = JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  identity = a;
  check('new account receives standard defaults', (await service.getCreationPreferences()).preferences.aspectRatio === '16:9');
  const saved = await actions.saveCreationPreferencesAction({ aspectRatio: '9:16', category: 'social' });
  check('save returns verified account and values', saved.ok && saved.data.clerkUserId === 'clerk-' + a && saved.data.preferences.category === 'social');
  check('defaults persist after reread', (await service.getCreationPreferences()).preferences.aspectRatio === '9:16');
  check('save invalidates creation settings', invalidations.includes('/dashboard/settings/creation'));
  identity = b;
  check('B cannot read A settings', (await service.getCreationPreferences()).preferences.category === 'cinematic');
  for (const extra of [{ ownerUserId: a }, { userId: a }, { p_owner: a }, { credits: 100000 }, { role: 'admin' }, { captionsEnabled: true }]) {
    const result = await actions.saveCreationPreferencesAction({ aspectRatio: '1:1', category: 'gaming', ...extra });
    check('strict settings reject injected fields ' + checks.length, !result.ok && !JSON.stringify(result).includes(a));
  }
  for (const input of [{ aspectRatio: '4:3', category: 'gaming' }, { aspectRatio: '1:1', category: 'unknown' }, null, {}, { aspectRatio: '1:1', category: 'gaming', voice: 'arbitrary' }]) {
    check('invalid value rejected ' + checks.length, !(await actions.saveCreationPreferencesAction(input)).ok);
  }
  await service.saveCreationPreferences({ aspectRatio: '1:1', category: 'gaming' });
  check('B saves only B settings', (await service.getCreationPreferences()).preferences.category === 'gaming');
  identity = a;
  check('A remains unchanged by B', (await service.getCreationPreferences()).preferences.category === 'social');
  check('existing project settings remain unchanged', (await pg.query('select aspect_ratio,category from projects where id=$1', [project])).rows[0].aspect_ratio === '16:9');
  for (const role of ['anon', 'authenticated']) {
    await denied(role + ' cannot read table', 'select * from creation_preferences', [], role);
    await denied(role + ' cannot mutate table', 'update creation_preferences set category=$1 where owner_user_id=$2', ['gaming', a], role);
    await denied(role + ' cannot read RPC with forged owner', 'select creation_preferences_read($1)', [a], role);
    await denied(role + ' cannot save RPC with forged owner', 'select creation_preferences_save($1,$2,$3)', [a, '1:1', 'gaming'], role);
  }
  await denied('service cannot directly alter preferences', 'update creation_preferences set category=$1 where owner_user_id=$2', ['gaming', a], 'service_role');
  check('SQL validates options independently', !!(await db.rpc('creation_preferences_save', { p_owner: a, p_aspect_ratio: 'forged', p_category: 'gaming' })).error);
  check('SQL forbids nonexistent owners', !!(await db.rpc('creation_preferences_save', { p_owner: randomUUID(), p_aspect_ratio: '1:1', p_category: 'gaming' })).error);
  identity = null;
  check('anonymous cannot read preferences', !(await actions.creationPreferencesAction()).ok);
  check('anonymous cannot save preferences', !(await actions.saveCreationPreferencesAction({ aspectRatio: '1:1', category: 'gaming' })).ok);
  check('AI balances untouched', JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows) === protectedBefore);
  check('no financial or generation side effects', await scalar('select (select count(*) from credit_purchases)+(select count(*) from creator_withdrawals)+(select count(*) from generation_jobs) value') === 0);

  let deletionEnabled = true, writes = 0, rejectDisable = false;
  const account = typescriptLoader({
    '@/lib/auth/ensure-app-user': { ensureAppUser: async () => ({ clerk_user_id: 'verified-owner' }) },
    '@clerk/nextjs/server': { clerkClient: async () => ({ users: {
      getUser: async id => ({ id, deleteSelfEnabled: deletionEnabled }),
      updateUser: async (id, input) => { assert.equal(id, 'verified-owner'); assert.equal(input.deleteSelfEnabled, false); writes++; deletionEnabled = rejectDisable; return { deleteSelfEnabled: deletionEnabled }; },
    } }) },
  })('lib/settings/account.ts');
  check('Clerk policy protects verified account', (await account.prepareSettingsAccount()).clerkUserId === 'verified-owner' && !deletionEnabled && writes === 1);
  await account.prepareSettingsAccount(); check('already disabled deletion needs no repeated write', writes === 1);
  deletionEnabled = true; rejectDisable = true;
  let refused = false; try { await account.prepareSettingsAccount(); } catch { refused = true; }
  check('Clerk policy fails closed on ineffective enforcement', refused);

  // Real browser APIs represented by explicit isolated storage/media fixtures.
  let stored = null, blocked = false, writeBlocked = false, systemDark = false, rootDark = false, favicon = {}, changeEvents = 0;
  const theme = typescriptLoader({}, {
    localStorage: { getItem: () => { if (blocked) throw Error(); return stored; }, setItem: (key, value) => { if (blocked || writeBlocked) throw Error(); stored = value; }, removeItem: () => { if (blocked || writeBlocked) throw Error(); stored = null; } },
    matchMedia: () => ({ matches: systemDark }),
    document: { documentElement: { classList: { toggle: (name, value) => { rootDark = value; } } }, getElementById: () => favicon },
    window: { dispatchEvent: () => { changeEvents++; } }, Event,
  })('lib/theme.ts');
  theme.setThemePreference('dark'); check('dark applies and persists', stored === 'dark' && rootDark);
  theme.setThemePreference('light'); check('light applies and persists', stored === 'light' && !rootDark);
  systemDark = true; theme.setThemePreference('system'); check('system removes override and follows OS', stored === null && rootDark);
  systemDark = false; theme.applyThemePreference(); check('system tracks OS changes', !rootDark);
  theme.setThemePreference('light'); systemDark = true; theme.applyThemePreference(); check('explicit preference survives OS changes', !rootDark);
  stored = 'dark'; theme.applyThemePreference(); check('cross-tab storage change applies', rootDark);
  blocked = true; theme.setThemePreference('light'); theme.applyThemePreference(); check('blocked storage retains in-page explicit preference', !rootDark && theme.readThemePreference() === 'light');
  theme.setThemePreference('system'); check('blocked storage still supports system', rootDark);
  blocked = false; writeBlocked = true; stored = 'dark'; theme.setThemePreference('light'); theme.applyThemePreference();
  check('readable but unwritable storage retains immediate choice', !rootDark && stored === 'dark');
  check('favicon and same-tab synchronization retained', Boolean(favicon.href) && changeEvents === 7);

  // Verify compiled header rules after build, including sibling resource paths.
  if (fs.existsSync('.next/routes-manifest.json')) {
    const rules = JSON.parse(fs.readFileSync('.next/routes-manifest.json', 'utf8')).headers;
    for (const section of ['account','creator-profile','credits','earnings','creation','notifications','appearance','privacy','data']) {
      const base = '/dashboard/settings/' + section;
      for (const suffix of ['', '.html', '.rsc', '.prefetch.rsc', '.segments/_full.segment.rsc']) {
        const headers = rules.filter(r => new RegExp(r.regex).test(base + suffix)).flatMap(r => r.headers);
        check('private compiled policy ' + section + suffix, headers.some(h => h.key === 'Cache-Control' && h.value.includes('private') && h.value.includes('no-store')) && headers.some(h => h.key === 'Vercel-CDN-Cache-Control' && h.value === 'no-store'));
      }
    }
    check('public storefront caching preserved', !rules.some(r => new RegExp(r.regex).test('/marketplace/creators/example')));
  }
  console.log(JSON.stringify({ passed: checks.length, checks, hostedInngestTriggered: false }));
} finally { await pg.close(); }
