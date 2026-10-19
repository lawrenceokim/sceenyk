// Focused local route/SQL checks only: no browser, provider or hosted writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { typescriptLoader } from './lib/load-typescript.mjs';

// Match the global installed by Next's Node runtime when using its config helper.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { unstable_getResponseFromNextConfig } = await import('next/experimental/testing/server.js');

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const config = typescriptLoader()('next.config.ts').default;
for (const [before, after] of [
  ['/dashboard', '/studio'], ['/dashboard?page=2', '/projects?page=2'],
  ['/dashboard/projects?page=3', '/projects?page=3'], ['/dashboard/templates', '/templates'],
  ['/dashboard/marketplace', '/settings/templates'],
  ['/dashboard/marketplace/new?project=sample', '/settings/templates/new?project=sample'],
  ['/dashboard/marketplace/sample', '/settings/templates/sample'],
  ['/dashboard/marketplace/profile', '/settings/creator-profile'],
  ['/dashboard/marketplace/earnings', '/settings/earnings'],
  ['/dashboard/marketplace/purchases?checkout=return&token=sample', '/marketplace/purchases?checkout=return&token=sample'],
  ['/dashboard/settings/credits?checkout=cancel', '/settings/credits?checkout=cancel'],
  ['/dashboard/credits', '/settings/credits'],
]) {
  const response = await unstable_getResponseFromNextConfig({ url: `https://example.test${before}`, nextConfig: config });
  check(`redirect ${before}`, response.status === 308 && response.headers.get('location') === `https://example.test${after}`);
}
check('obsolete route directory removed', !fs.existsSync('app/dashboard'));
check('template details use owned reader', fs.readFileSync('app/(account)/templates/[listingId]/page.tsx','utf8').includes('getOwnedMarketplaceListing(listingId)'));
check('private templates have account fence', fs.readFileSync('app/(account)/templates/[listingId]/page.tsx','utf8').includes('<TemplateAccountBoundary'));
for (const route of ['/settings/templates', '/templates', '/projects', '/marketplace/purchases']) {
  for (const suffix of ['', '.rsc', '.prefetch.rsc', '.segments/_full.segment.rsc']) {
    const response = await unstable_getResponseFromNextConfig({ url: `https://example.test${route}${suffix}`, nextConfig: config });
    check(`private header ${route}${suffix}`, response.headers.get('cache-control')?.includes('no-store'));
  }
}
const transform = JSON.parse(fs.readFileSync('vercel.json','utf8')).routes[0];
check('final response transform covers private template details', new RegExp(transform.src).test('/templates/sample'));

const migrationFile = '20261018002900_marketplace_preview_colors.sql';
const sql = fs.readFileSync(`supabase/migrations/${migrationFile}`, 'utf8');
const pg = new PGlite();
await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
const scalar = async (sql, args = []) => (await pg.query(sql, args)).rows[0]?.value;
try {
  for (const file of fs.readdirSync('supabase/migrations').filter(file => file.endsWith('.sql') && file < migrationFile).sort()) {
    await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  const owner = await scalar('insert into app_users(clerk_user_id) values($1) returning id value', [randomUUID()]);
  const other = await scalar('insert into app_users(clerk_user_id) values($1) returning id value', [randomUUID()]);
  const snapshot = { version: 1, category: 'cinematic', instructions: 'Use your own footage.', settings: { aspectRatio: '16:9', duration: '10', visualStyle: 'Original', tone: 'Professional' } };
  async function insertListing(index, status = 'published', category = 'cinematic', paid = false) {
    const project = await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Source','cinematic','16:9','10','Original','Professional') returning id value", [owner]);
    const id = randomUUID();
    await pg.query(`insert into marketplace_listings(id,creator_user_id,source_project_id,title,description,category,tags,creator_name,template_snapshot,status,rights_confirmed_at,published_at,adoption_type,price_minor)
      values($1,$2,$3,$4,'A reusable creative configuration.',$5,'{muted}','Creator',$6,$7,now(),case when $7='published' then now() end,$8,$9)`, [id,owner,project,`Look ${index}`,category,snapshot,status,paid?'paid':'free',paid?100:0]);
    return id;
  }
  const first = await insertListing(0);
  const immutableBefore = await scalar('select template_snapshot value from marketplace_listings where id=$1', [first]);
  // Simulate a valid assignment already present before a rerun/backfill.
  await pg.exec('alter table marketplace_listings add column fallback_color text');
  await pg.query("update marketplace_listings set fallback_color='#48596d' where id=$1", [first]);
  const draft = await insertListing(1, 'draft');
  const paid = await insertListing(2, 'published', 'social', true);
  await pg.exec(sql);
  check('valid existing color preserved', await scalar('select fallback_color value from marketplace_listings where id=$1',[first]) === '#48596d');
  check('null backfill assigned', /^#[0-9a-f]{6}$/.test(await scalar('select fallback_color value from marketplace_listings where id=$1',[draft])));
  const backfilled = (await pg.query('select id,fallback_color from marketplace_listings order by id')).rows;
  await pg.exec(sql);
  assert.deepEqual((await pg.query('select id,fallback_color from marketplace_listings order by id')).rows, backfilled);
  check('migration rerun retains every assignment', true);
  assert.deepEqual(await scalar('select template_snapshot value from marketplace_listings where id=$1',[first]), immutableBefore);
  check('template snapshot unchanged', true);
  for (let i=3;i<15;i++) await insertListing(i);
  check('new listings get saved default', await scalar('select count(*) value from marketplace_listings where fallback_color is null') === 0);
  let blocked = false;
  try { await pg.query("update marketplace_listings set fallback_color='#59516d' where id=$1",[first]); } catch { blocked = true; }
  check('saved assignment cannot be overwritten', blocked);
  let identity = owner;
  const db = { async rpc(name, args = {}) {
    await pg.exec('set role service_role');
    try { return { data: await scalar(`select ${name}(${Object.keys(args).map((key,index) => `${key}=>$${index+1}`).join(',')}) value`,Object.values(args)),error:null }; }
    catch (error) { return { data:null,error:{code:error.code} }; }
    finally { await pg.exec('reset role'); }
  } };
  const service = typescriptLoader({ 'next/server': {connection:async()=>{}}, '@/lib/db/server': {createDatabaseClient:()=>db}, '@/lib/auth/ensure-app-user': {ensureAppUser:async()=>({id:identity})} })('lib/marketplace/server.ts');
  const one = await service.browseMarketplace({ category:'cinematic',page:1 });
  const two = await service.browseMarketplace({ category:'cinematic',page:2 });
  check('small server batches retained',one.items.length===12 && two.items.length===1 && one.total===13);
  check('pagination has no duplicates',!one.items.some(a=>two.items.some(b=>a.id===b.id)));
  check('filter excludes other categories',one.items.every(item=>item.category==='cinematic'));
  check('search URLs retain backend tag search',(await service.browseMarketplace({query:'muted'})).total===14);
  check('public detail has saved color',(await service.getMarketplaceListing(first)).fallbackColor==='#48596d');
  check('paid public instructions remain masked',(await service.getMarketplaceListing(paid)).template.instructions!==snapshot.instructions);
  check('owner can read unpublished detail',(await service.getOwnedMarketplaceListing(draft)).id===draft);
  identity=other;
  check('other owner cannot read private detail',await service.getOwnedMarketplaceListing(draft)===null);
  check('other owner cannot edit template',(await service.updateMarketplaceListing({id:draft,title:'Changed',description:'Changed description',category:'cinematic',tags:[],status:'published',rightsConfirmed:true})).code==='NOT_FOUND');
  for(const role of ['anon','authenticated']) {
    await pg.exec(`set role ${role}`); let denied=false;
    try{await pg.query('select fallback_color from marketplace_listings');}catch{denied=true;}finally{await pg.exec('reset role');}
    check(`${role} cannot read table directly`,denied);
  }
  const endpoint = typescriptLoader({'next/navigation':{unstable_rethrow:()=>{}},'@/lib/marketplace/server':{browseMarketplace:service.browseMarketplace}}, {Response,Request})('app/api/marketplace/listings/route.ts');
  check('infinite endpoint rejects invalid page',(await endpoint.GET(new Request('https://example.test/api/marketplace/listings?page=-1'))).status===400);
  const response = await endpoint.GET(new Request('https://example.test/api/marketplace/listings?category=cinematic&page=2'));
  check('infinite endpoint returns next filtered page',response.status===200 && (await response.json()).items.length===1);
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
} finally { await pg.close(); }
