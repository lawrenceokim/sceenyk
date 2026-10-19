// Brief local checks for palette repair and shared artwork. No hosted writes,
// browser runs, providers, financial fixtures or production build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite();
const migration = '20261019003000_marketplace_preview_palette.sql';
const sql = fs.readFileSync(`supabase/migrations/${migration}`, 'utf8');
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const scalar = async (sql,args=[]) => (await pg.query(sql,args)).rows[0]?.value;
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of fs.readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')&&file<migration).sort()) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  const owner=await scalar('insert into app_users(clerk_user_id) values($1) returning id value',[randomUUID()]);
  const other=await scalar('insert into app_users(clerk_user_id) values($1) returning id value',[randomUUID()]);
  const snapshot={version:1,category:'cinematic',instructions:'Bring your own subject.',settings:{aspectRatio:'16:9',duration:'10',visualStyle:'Original',tone:'Professional'}};
  const oldColors=['#66616f','#66616f','#59516d','#48596d','#675765','#54626a','#596257'];
  const ids=[];
  async function insert(index,color) {
    const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Source','cinematic','16:9','10','Original','Professional') returning id value",[owner]);
    const id=randomUUID();
    await pg.query(`insert into marketplace_listings(id,creator_user_id,source_project_id,title,description,category,tags,creator_name,template_snapshot,status,rights_confirmed_at,published_at,created_at${color?',fallback_color':''})
      values($1,$2,$3,'Creative look','A reusable creative template.','cinematic','{}','Creator',$4,$5,now(),now(),$6${color?',$7':''})`,[id,owner,project,snapshot,index<2?'published':'draft',new Date(Date.UTC(2026,0,1,0,0,index)).toISOString(),...(color?[color]:[])]);
    return id;
  }
  for(let i=0;i<23;i++)ids.push(await insert(i,oldColors[i%oldColors.length]));
  const before=(await pg.query('select id,to_jsonb(l)-\'fallback_color\' value from marketplace_listings l order by id')).rows;
  const colorsBefore=(await pg.query('select id,fallback_color from marketplace_listings order by id')).rows;
  await pg.exec(sql);
  assert.deepEqual((await pg.query('select id,to_jsonb(l)-\'fallback_color\' value from marketplace_listings l order by id')).rows,before);
  check('all unrelated listing fields and timestamps unchanged',true);
  check('existing duplicate assignments become distinct',Number(await scalar('select count(distinct fallback_color) value from marketplace_listings'))===23);
  check('one existing published color retained',await scalar('select fallback_color value from marketplace_listings where id=$1',[ids[0]])==='#66616f');
  check('neighboring published duplicate repaired',await scalar('select fallback_color value from marketplace_listings where id=$1',[ids[1]])!=='#66616f');
  const saved=(await pg.query('select id,fallback_color from marketplace_listings order by id')).rows;
  check('only duplicate assignments changed',saved.filter(row=>colorsBefore.find(old=>old.id===row.id).fallback_color===row.fallback_color).length===6);
  await pg.exec(sql);
  assert.deepEqual((await pg.query('select id,fallback_color from marketplace_listings order by id')).rows,saved);
  check('repeatable repair preserves saved assignments',true);
  const newest=await insert(24);
  const color=await scalar('select fallback_color value from marketplace_listings where id=$1',[newest]);
  check('new listing gets persisted unused color',/^#[0-9a-f]{6}$/.test(color)&&!saved.some(row=>row.fallback_color===color));
  for(let i=25;i<43;i++)await insert(i);
  const fullPalette=(await pg.query('select id,fallback_color from marketplace_listings order by id')).rows;
  await pg.exec(sql);
  assert.deepEqual((await pg.query('select id,fallback_color from marketplace_listings order by id')).rows,fullPalette);
  check('palette exhaustion never rotates valid new assignments on rerun',true);
  let immutable=false;try{await pg.query("update marketplace_listings set fallback_color='#77618f' where id=$1",[ids[0]]);}catch{immutable=true;}
  check('color immutability restored',immutable);
  const detail=await scalar('select marketplace_detail($1) value',[ids[1]]);
  const owned=await scalar('select marketplace_owned_listing($1,$2,null) value',[owner,ids[1]]);
  const publicPage=await scalar("select marketplace_browse('',null,1) value");
  check('public detail and owned detail expose same saved color',detail.fallbackColor===owned.fallbackColor&&saved.find(row=>row.id===ids[1]).fallback_color===detail.fallbackColor);
  check('gallery JSON retains saved color',publicPage.items.find(row=>row.id===ids[1]).fallbackColor===detail.fallbackColor);
  check('other owner cannot read private configuration',await scalar('select marketplace_owned_listing($1,$2,null) value',[other,ids[1]])===null);
  const {templateAppearance,templatePattern}=typescriptLoader()('components/marketplace/template-appearance.ts');
  const first=templateAppearance({id:ids[1],fallbackColor:detail.fallbackColor});
  check('CSS receives persisted color unchanged',first['--template-color']===detail.fallbackColor);
  check('geometry remains stable across appearances',JSON.stringify(first)===JSON.stringify(templateAppearance({id:ids[1],fallbackColor:detail.fallbackColor})));
  check('same-color covers use different geometry',JSON.stringify(templateAppearance({id:'first',fallbackColor:color}))!==JSON.stringify(templateAppearance({id:'second',fallbackColor:color})));
  check('placeholder patterns stay stable',templatePattern(ids[1])===templatePattern(ids[1]));
  for(const file of ['components/marketplace/listing-card.tsx','components/marketplace/template-detail.tsx','components/templates/template-library.tsx','components/workspace/workspace-page-frame.tsx']){
    const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
    check(`valid JSX ${file}`,!(result.diagnostics??[]).some(item=>item.category===ts.DiagnosticCategory.Error));
  }
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
} finally { await pg.close(); }
