// Real PostgreSQL migrations/RPCs and application services. Identity is an
// explicit isolated fixture; no hosted accounts, storage, providers or payments.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';
import {typescriptLoader} from './lib/load-typescript.mjs';

const {pg,db,one,scalar}=await compositionFixtureDatabase();
const checks=[];function check(name,value){assert.ok(value,name);checks.push(name);}
let identity=null;
const load=typescriptLoader({
  'next/server':{connection:async()=>{}},
  '@/lib/db/server':{createDatabaseClient:()=>db},
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>{if(!identity)throw new Error('AUTH_REQUIRED');return{id:identity};}},
});
const service=load('lib/marketplace/server.ts');
const contract=load('lib/marketplace/contract.ts');
async function denied(name,sql,args=[],role='authenticated'){
  await pg.exec('set role '+role);let refused=false;
  try{await pg.query(sql,args);}catch{refused=true;}finally{await pg.exec('reset role');}
  check(name,refused);
}
try {
  const a=await scalar("insert into app_users(clerk_user_id,first_name,last_name,email) values('fixture_A','Avery','Creator','private@example.test') returning id as value");
  const b=await scalar("insert into app_users(clerk_user_id,first_name) values('fixture_B','Blair') returning id as value");
  const project=await scalar("insert into projects(owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone) values($1,'Private title','cinematic','PRIVATE_ORIGINAL_PROMPT','9:16','15','Anime','Energetic') returning id as value",[a]);
  const asset=randomUUID();await pg.query("insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'private.png','image/png',100,'image','uploaded','fixture-etag')",[asset,a,project,randomUUID(),`users/${a}/projects/${project}/${asset}/private`]);
  const original=JSON.stringify(await one('select * from projects where id=$1',[project]));
  const accounting=JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  const input={id:randomUUID(),sourceProjectId:project,title:'Neon Story',description:'An adaptable cinematic recipe for your own story.',category:'cinematic',tags:['neon','story'],instructions:'Introduce your own character, build anticipation, then reveal their destination.',publish:false,rightsConfirmed:false};
  identity=b;
  check('B cannot publish A project',(await service.createMarketplaceListing({...input,publish:true,rightsConfirmed:true})).code==='NOT_FOUND');
  check('arbitrary source ID denied',(await service.createMarketplaceListing({...input,sourceProjectId:randomUUID()})).code==='NOT_FOUND');
  identity=a;
  check('browser owner override rejected',(await service.createMarketplaceListing({...input,creator_user_id:b})).code==='INVALID_INPUT');
  check('snapshot injection rejected',(await service.createMarketplaceListing({...input,template:{assetIds:[asset]}})).code==='INVALID_INPUT');
  for(const value of ['https://private.invalid/object?X-Amz-Signature=secret',`users/${a}/private`,a,'sb_secret_private','user_123456789012','private@example.test']){
    check('private reference rejected: '+checks.length,!contract.createListingSchema.safeParse({...input,instructions:value}).success);
  }
  check('published requires explicit rights',(await service.createMarketplaceListing({...input,publish:true})).code==='INVALID_INPUT');
  const created=await service.createMarketplaceListing(input);check('owned draft saved',created.ok&&created.listingId===input.id);
  check('draft hidden from detail',await service.getMarketplaceListing(input.id)===null);
  check('draft hidden from browse',(await service.browseMarketplace()).total===0);
  const draft=await service.getOwnedMarketplaceListing(input.id);
  check('owned draft visible',draft.status==='draft'&&!draft.rightsConfirmed);
  const metadata={id:input.id,title:input.title,description:input.description,category:input.category,tags:input.tags,rightsConfirmed:true,status:'published'};
  check('creator publishes draft',(await service.updateMarketplaceListing(metadata)).ok);
  const row=await one('select * from marketplace_listings where id=$1',[input.id]);
  check('rights timestamp and publish timestamp persisted',!!row.rights_confirmed_at&&!!row.published_at);
  const detail=await service.getMarketplaceListing(input.id);
  check('unconfigured pricing shows no invented estimate',detail.estimate===null);
  check('detail has approved settings',detail.template.settings.aspectRatio==='9:16'&&detail.template.settings.duration==='15'&&detail.template.settings.visualStyle==='Anime'&&detail.template.settings.tone==='Energetic');
  check('explicit reusable instructions copied',detail.template.instructions===input.instructions);
  check('public DTO hides private source and identity',!JSON.stringify(detail).includes(project)&&!JSON.stringify(detail).includes(a)&&!JSON.stringify(detail).includes(asset)&&!JSON.stringify(detail).includes('PRIVATE_ORIGINAL_PROMPT')&&!JSON.stringify(detail).includes('private@example.test'));
  check('public creator name only',detail.creatorName==='Avery Creator');
  check('browse finds published listing',(await service.browseMarketplace()).items[0].id===input.id);
  check('full-text title search',(await service.browseMarketplace({query:'Neon'})).total===1);
  check('tag search',(await service.browseMarketplace({query:'story'})).total===1);
  check('category filter',(await service.browseMarketplace({category:'cinematic'})).total===1&&(await service.browseMarketplace({category:'gaming'})).total===0);
  check('search no results',(await service.browseMarketplace({query:'nonexistent'})).total===0);
  check('SQL-like search is data',(await service.browseMarketplace({query:"x'); drop table projects;--"})).total===0);
  const duplicate=await service.createMarketplaceListing({...input,id:randomUUID(),publish:true,rightsConfirmed:true});
  check('repeated publishing reuses one source listing',duplicate.ok&&duplicate.existing&&duplicate.listingId===input.id&&await scalar('select count(*)::int as value from marketplace_listings')===1);
  identity=b;
  check('B cannot read creator draft management',await service.getOwnedMarketplaceListing(input.id)===null);
  check('B cannot edit A listing',(await service.updateMarketplaceListing({...metadata,title:'Hijack'})).code==='NOT_FOUND');
  check('B cannot unpublish A listing',(await service.updateMarketplaceListing({...metadata,status:'unpublished'})).code==='NOT_FOUND');
  check('B owned list is empty',(await service.listOwnedMarketplaceListings()).total===0);
  const request={listingId:input.id,requestId:randomUUID()};
  const adopted=await service.adoptMarketplaceListing(request);
  check('adoption creates a new project',adopted.ok&&adopted.projectId&&adopted.projectId!==project);
  const copy=await one('select * from projects where id=$1',[adopted.projectId]);
  check('adopter owns the new project',copy.owner_user_id===b);
  check('copy has all approved reusable fields',copy.prompt===input.instructions&&copy.category==='cinematic'&&copy.aspect_ratio==='9:16'&&copy.duration==='15'&&copy.visual_style==='Anime'&&copy.tone==='Energetic');
  const projectService=load('lib/projects/server.ts');
  check('existing project service rejects B reading A project',await projectService.getOwnedProject(project)===null);
  check('existing project service opens the adopter-owned copy',(await projectService.getOwnedProject(adopted.projectId)).prompt===input.instructions);
  check('private media is not copied',await scalar('select count(*)::int as value from project_assets where project_id=$1',[adopted.projectId])===0);
  check('creator original unchanged',JSON.stringify(await one('select * from projects where id=$1',[project]))===original);
  check('origin persisted and readable by adopter',(await service.getOwnedProjectOrigin(adopted.projectId)).listingId===input.id);
  const repeated=await Promise.all([service.adoptMarketplaceListing(request),service.adoptMarketplaceListing(request)]);
  check('duplicate adoption retains one intended project',repeated.every(v=>v.ok&&v.projectId===adopted.projectId)&&await scalar('select count(*)::int as value from marketplace_adoptions')===1);
  check('adoption owner injection rejected',(await service.adoptMarketplaceListing({...request,owner_user_id:a})).code==='INVALID_INPUT');
  check('unknown adopted listing denied',(await service.adoptMarketplaceListing({listingId:randomUUID(),requestId:randomUUID()})).code==='NOT_FOUND');
  check('no free allowance or credits change',JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows)===accounting);
  check('no generation, quote, ledger or payment created',await scalar('select ((select count(*) from generation_jobs)+(select count(*) from generation_quotes)+(select count(*) from credit_ledger)+(select count(*) from credit_purchases))::int as value')===0);
  identity=a;check('creator cannot read adopter origin',await service.getOwnedProjectOrigin(adopted.projectId)===null);
  check('owner metadata edit succeeds',(await service.updateMarketplaceListing({...metadata,title:'Neon Story revised'})).ok);
  check('snapshot stays unchanged on edits',JSON.stringify((await one('select template_snapshot from marketplace_listings where id=$1',[input.id])).template_snapshot)===JSON.stringify(row.template_snapshot));
  await denied('service cannot change snapshot directly','update marketplace_listings set template_snapshot=$1 where id=$2',[{},input.id],'service_role');
  await denied('admin cannot accidentally rewrite snapshot','update marketplace_listings set template_snapshot=$1 where id=$2',[{},input.id],'postgres');
  await denied('provenance cannot be changed','update marketplace_adoptions set listing_title=\'Changed\' where project_id=$1',[adopted.projectId],'postgres');
  for(const role of ['anon','authenticated']){
    await denied(role+' cannot read Marketplace tables','select * from marketplace_listings',[],role);
    await denied(role+' cannot read adoption provenance','select * from marketplace_adoptions',[],role);
    await denied(role+' cannot invoke publish','select marketplace_create($1,$2,$3,$4,$5,$6,$7,$8,true,true)',[a,randomUUID(),project,'Title','Description','cinematic',[],'Instructions'],role);
    await denied(role+' cannot invoke adoption','select marketplace_adopt($1,$2,$3)',[b,input.id,randomUUID()],role);
    await denied(role+' cannot read private projects','select * from projects where id=$1',[project],role);
    await denied(role+' cannot read private asset metadata','select * from project_assets where project_id=$1',[project],role);
  }
  check('creator unpublishes',(await service.updateMarketplaceListing({...metadata,status:'unpublished'})).ok);
  check('unpublished absent from discovery and detail',(await service.browseMarketplace()).total===0&&await service.getMarketplaceListing(input.id)===null);
  identity=b;
  check('new adoption denied after unpublish',(await service.adoptMarketplaceListing({listingId:input.id,requestId:randomUUID()})).code==='NOT_FOUND');
  check('committed retry recovers after unpublish',(await service.adoptMarketplaceListing(request)).projectId===adopted.projectId);
  identity=a;
  check('creator republish works',(await service.updateMarketplaceListing(metadata)).ok);
  // Failure after project insert must roll back the whole adoption transaction.
  await pg.exec("create function public.reject_adoption_fixture() returns trigger language plpgsql as $$ begin raise exception 'fixture failure'; end; $$; create trigger reject_fixture before insert on marketplace_adoptions for each row execute function reject_adoption_fixture();");
  const projectCount=await scalar('select count(*)::int as value from projects');identity=b;
  let failed=false;try{await service.adoptMarketplaceListing({listingId:input.id,requestId:randomUUID()});}catch{failed=true;}
  check('adoption failure rolls back project and provenance',failed&&await scalar('select count(*)::int as value from projects')===projectCount);
  await pg.exec('drop trigger reject_fixture on marketplace_adoptions; drop function reject_adoption_fixture();');
  // Seed distinct owned briefs to prove database-side paging, without any media.
  identity=a;
  for(let i=0;i<13;i++){
    const source=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Page fixture','social','1:1','10','Original','Funny') returning id as value",[a]);
    await service.createMarketplaceListing({...input,id:randomUUID(),sourceProjectId:source,title:`Social ${i}`,category:'social',publish:true,rightsConfirmed:true});
  }
  const first=await service.browseMarketplace({category:'social',page:1}),second=await service.browseMarketplace({category:'social',page:2});
  check('fixed database-backed pagination',first.total===13&&first.items.length===12&&second.items.length===1&&!first.items.some(x=>x.id===second.items[0].id));
  check('owned listing pagination',(await service.listOwnedMarketplaceListings(1)).items.length===12&&(await service.listOwnedMarketplaceListings(2)).items.length===2);
  identity=b;
  check('same request cannot adopt a different listing',(await service.adoptMarketplaceListing({listingId:first.items[0].id,requestId:request.requestId})).code==='CONFLICT');
  identity=a;
  check('creator archives listing',(await service.updateMarketplaceListing({...metadata,status:'archived'})).ok);
  check('archived cannot be republished',(await service.updateMarketplaceListing(metadata)).code==='INVALID_INPUT');
  identity=null;let anonymousDenied=false;try{await service.adoptMarketplaceListing(request);}catch{anonymousDenied=true;}
  check('anonymous adoption denied',anonymousDenied);
  console.log(JSON.stringify({passed:checks.length,checks}));
} finally {await pg.close();}
