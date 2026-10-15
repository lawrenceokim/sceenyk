import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';
import {typescriptLoader} from './lib/load-typescript.mjs';
import {payoutNativeFixture} from './lib/payout-native-fixture.mjs';

const native=process.argv.includes('--native-postgres');
const {pg,db,scalar}=await (native?payoutNativeFixture():compositionFixtureDatabase());
const checks=[];const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
let identity=null;const objects=new Map();
const load=typescriptLoader({
  'next/server':{connection:async()=>{}},
  'next/navigation':{unstable_rethrow:()=>{}},
  'next/cache':{revalidatePath:()=>{}},
  '@/lib/db/server':{createDatabaseClient:()=>db},
  '@/lib/auth/ensure-app-user':{ensureAppUser:async()=>{if(!identity)throw Error('AUTH_REQUIRED');return{id:identity,clerk_user_id:'fixture-session'};}},
  '@/lib/storage/r2':{
    putR2CreatorAvatar:async(key,bytes)=>{objects.set(key,bytes);return 'fixture-etag';},
    readR2AnalysisMedia:async(key,etag,size)=>{assert.equal(etag,'fixture-etag');assert.equal(objects.get(key)?.byteLength,size);return new ReadableStream({start(c){c.enqueue(objects.get(key));c.close();}});},
  },
},{Request,Response,ReadableStream});
const service=load('lib/marketplace/creators/server.ts'),contract=load('lib/marketplace/creators/contract.ts'),avatar=load('lib/marketplace/creators/avatar.ts'),market=load('lib/marketplace/server.ts');
const user=async name=>scalar('insert into app_users(clerk_user_id,first_name,email) values($1,$2,$3) returning id value',[randomUUID(),name,'private@example.test']);
async function denies(name,sql,args=[],role='authenticated'){
  await pg.exec('set role '+role);let denied=false;try{await pg.query(sql,args);}catch{denied=true;}finally{await pg.exec('reset role');}check(name,denied);
}
try {
  const a=await user('Private A'),b=await user('Private B');
  const accountBefore=JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  identity=a;
  check('no automatic account-profile publication',(await service.getOwnedCreatorProfile()).profile===null);
  const publicInput={displayName:'Shared Creator',bio:'Independent creative templates.',slug:' Shared Creator '};
  const pa=await service.saveCreatorProfile(publicInput);check('server-normalized slug',pa.slug==='shared-creator');
  identity=b;const pb=await service.saveCreatorProfile(publicInput);check('collision uses neutral suffix',pb.slug==='shared-creator-2');
  check('one creator record on repeat setup',(await service.saveCreatorProfile(publicInput).catch(e=>e)).code==='SLUG_FIXED');
  check('B cannot post A owner ID',!contract.profileInput.safeParse({...publicInput,ownerUserId:a}).success);
  check('B cannot post another profile slug as authority',(await service.saveCreatorProfile({...publicInput,slug:pa.slug}).catch(e=>e)).code==='SLUG_FIXED');
  check('A profile unchanged by B',(await service.getCreatorStorefront(pa.slug)).profile.bio===publicInput.bio);
  identity=a;const changed=await service.saveCreatorProfile({displayName:'New Public Name',bio:'Changed public bio.',slug:null});
  check('name and bio persist',(await service.getOwnedCreatorProfile()).profile.displayName===changed.displayName&&changed.bio==='Changed public bio.');
  check('name changes preserve slug',changed.slug===pa.slug);
  for(const bad of ['private@example.test',a,'user_123456789012','https://private.invalid','sb_secret_test']) check('private profile text rejected '+checks.length,!contract.profileInput.safeParse({...publicInput,bio:bad}).success);
  const third=await user('Private C');identity=third;
  check('reserved slug reports unavailable',(await service.saveCreatorProfile({...publicInput,slug:'admin'}).catch(e=>e)).code==='SLUG_UNAVAILABLE');
  check('blank normalization uses neutral fallback',(await service.saveCreatorProfile({...publicInput,slug:'東京'})).slug==='creator');
  identity=a;
  const storefront=await service.getCreatorStorefront(pa.slug);check('empty storefront contains no private content',storefront.total===0&&storefront.items.length===0&&storefront.adoptionCount===0);
  check('unknown and malformed slugs unavailable',await service.getCreatorStorefront('unknown')===null&&await service.getCreatorStorefront('../private')===null);
  const inputs=[];
  for(let i=0;i<14;i++){
    const project=await scalar("insert into projects(owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone) values($1,'Private source','cinematic','PRIVATE_SOURCE_PROMPT','16:9','10','Original','Storytelling') returning id value",[a]);
    const input={id:randomUUID(),sourceProjectId:project,title:'Public template '+i,description:'Reusable template.',category:'cinematic',tags:[],instructions:'Use your own idea.',publish:i<13,rightsConfirmed:true};
    check('owned listing created '+i,(await market.createMarketplaceListing(input)).ok);inputs.push(input);
  }
  const page1=await service.getCreatorStorefront(pa.slug),page2=await service.getCreatorStorefront(pa.slug,2);
  check('published-only paginated grid',page1.total===13&&page1.items.length===12&&page2.items.length===1&&new Set([...page1.items,...page2.items].map(l=>l.id)).size===13);
  check('listing creator links use canonical profile',page1.items.every(l=>l.creatorSlug===pa.slug&&l.creatorName===changed.displayName));
  const legacy=await db.rpc('marketplace_detail',{p_listing_id:inputs[0].id});check('migration preserves old strict listing DTO',!legacy.error&&!('creatorSlug' in legacy.data)&&legacy.data.creatorName==='Private A');
  const publicJson=JSON.stringify(page1);check('public DTO excludes owners source and finances',![a,b,inputs[0].sourceProjectId,'PRIVATE_SOURCE_PROMPT','private@example.test','creatorEarningsMinor','withdrawal','paypal','owner_user_id'].some(v=>publicJson.includes(v)));
  const target=inputs[0],metadata={id:target.id,title:target.title,description:target.description,category:target.category,tags:[],rightsConfirmed:true,status:'unpublished'};
  identity=b;check('B cannot edit A listing',(await market.updateMarketplaceListing(metadata)).code==='NOT_FOUND');
  const adopted=await market.adoptMarketplaceListing({listingId:target.id,requestId:randomUUID()});check('existing adoption still works',adopted.ok&&!!adopted.projectId);
  check('stats count successful public adoptions',(await service.getCreatorStorefront(pa.slug)).adoptionCount===1);
  identity=a;check('owner unpublishes normally',(await market.updateMarketplaceListing(metadata)).ok);
  const hidden=await service.getCreatorStorefront(pa.slug);check('unpublished listing and adoption count excluded',hidden.total===12&&hidden.adoptionCount===0&&!hidden.items.some(l=>l.id===target.id));
  check('private avatar key injection rejected',!(await db.rpc('creator_profile_avatar_save',{p_owner:a,p_key:'users/'+a+'/private',p_etag:'x',p_size:100})).data);
  check('partial avatar metadata cannot bypass SQL null checks',!!(await db.rpc('creator_profile_avatar_save',{p_owner:a,p_key:`marketplace/avatars/${a}/${randomUUID()}.webp`,p_etag:'etag',p_size:null})).error);
  const image=await sharp({create:{width:900,height:700,channels:3,background:'#7351d9'}}).jpeg().withMetadata().toBuffer();
  const derivative=await avatar.makePublicAvatar(image,'image/jpeg');const meta=await sharp(derivative).metadata();
  check('avatar resized and metadata stripped',meta.width===512&&meta.height===512&&meta.format==='webp'&&!meta.exif&&!meta.icc);
  for(const [bytes,mime] of [[image,'image/png'],[Buffer.from('<svg></svg>'),'image/svg+xml'],[Buffer.from([0xff,0xd8,0xff]),'image/jpeg'],[Buffer.alloc(2*1024*1024+1),'image/png']]){
    let rejected=false;try{await avatar.makePublicAvatar(bytes,mime);}catch{rejected=true;}check('unsafe image rejected '+checks.length,rejected);
  }
  const uploaded=await avatar.uploadCreatorAvatar(new Request('http://localhost/api/marketplace/creator-avatar',{method:'POST',headers:{'content-type':'image/jpeg'},body:image}));
  const post=load('app/api/marketplace/creator-avatar/route.ts');
  const crossOrigin=await post.POST(new Request('http://localhost/api/marketplace/creator-avatar',{method:'POST',headers:{origin:'https://foreign.invalid','content-type':'image/jpeg'},body:image}));check('cross-origin avatar writes denied',crossOrigin.status===403);
  const malformed=await post.POST(new Request('http://localhost/api/marketplace/creator-avatar',{method:'POST',headers:{origin:'http://localhost','content-type':'image/jpeg'},body:Buffer.from([0xff,0xd8,0xff])}));check('invalid avatar returns safe 400',malformed.status===400&&!JSON.stringify(await malformed.json()).includes('Error'));
  let largeRefused=false;try{await avatar.uploadCreatorAvatar(new Request('http://localhost/api/marketplace/creator-avatar',{method:'POST',headers:{'content-type':'image/jpeg'},body:Buffer.alloc(2*1024*1024+1)}));}catch(e){largeRefused=e.code==='INVALID_IMAGE';}check('streamed upload bound enforced without content length',largeRefused);
  check('avatar persisted to own profile',uploaded.avatarUrl==='/api/marketplace/creators/'+pa.slug+'/avatar'&&(await service.getOwnedCreatorProfile()).profile.avatarUrl===uploaded.avatarUrl);
  const stream=await avatar.readPublicCreatorAvatar(pa.slug);check('public avatar reads only recorded derivative',stream.size===derivative.byteLength);
  check('private key absent from public DTO',!JSON.stringify(await service.getCreatorStorefront(pa.slug)).includes('marketplace/avatars/'));
  identity=b;check('B removal applies only to B profile',(await service.removeCreatorAvatar()).avatarUrl===null&&(await service.getCreatorStorefront(pa.slug)).profile.avatarUrl!==null);
  identity=a;check('owner can remove avatar',(await service.removeCreatorAvatar()).avatarUrl===null&&await avatar.readPublicCreatorAvatar(pa.slug)===null);
  for(const role of ['anon','authenticated']){
    await denies(role+' cannot read profile table','select * from marketplace_creator_profiles',[],role);
    await denies(role+' cannot update other profile','update marketplace_creator_profiles set bio=$1 where owner_user_id=$2',['forged',a],role);
    await denies(role+' cannot call profile mutation','select creator_profile_save($1,$2,$3,$4)',[a,'Forged','','forged'],role);
    await denies(role+' cannot read avatar metadata','select creator_profile_avatar($1)',[pa.slug],role);
    await denies(role+' cannot read private projects','select * from projects where owner_user_id=$1',[a],role);
  }
  await denies('service cannot directly mutate profile','update marketplace_creator_profiles set bio=$1 where owner_user_id=$2',['forged',a],'service_role');
  let immutable=false;try{await pg.query('update marketplace_creator_profiles set creator_slug=$1 where owner_user_id=$2',['renamed',a]);}catch{immutable=true;}check('database forbids changing assigned slug',immutable);
  check('profile DTO rejects unexpected private fields',!contract.creatorProfile.safeParse({...pa,email:'private@example.test'}).success);
  identity=null;let refused=false;try{await service.saveCreatorProfile(publicInput);}catch{refused=true;}check('anonymous cannot save profile',refused);
  check('all AI balances unchanged',JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows.filter(r=>[a,b].includes(r.owner_user_id)))===accountBefore);
  check('no payment money or generation created',await scalar('select (select count(*) from marketplace_purchases)+(select count(*) from creator_earnings_ledger)+(select count(*) from generation_jobs) value')===0);
  if(native){
    const owners=await Promise.all([0,1,2,3].map(i=>user('Concurrent '+i)));
    const replies=await Promise.all(owners.map(p_owner=>db.rpc('creator_profile_save',{p_owner,p_name:'Concurrent Creator',p_bio:'',p_slug:'concurrent-creator'})));
    check('independent concurrent collisions all allocate',replies.every(r=>!r.error&&r.data.code==='SAVED')&&new Set(replies.map(r=>r.data.profile.slug)).size===4);
    const repeat=await Promise.all([0,1,2,3].map(()=>db.rpc('creator_profile_save',{p_owner:owners[0],p_name:'Changed Concurrent Name',p_bio:'',p_slug:null})));
    check('concurrent repeat setup keeps one slug',repeat.every(r=>!r.error&&r.data.profile.slug===replies[0].data.profile.slug));
    check('multiple PostgreSQL connections overlapped',pg.stats().maximumIndependentClients>=2);
  }
  console.log(JSON.stringify({passed:checks.length,native,checks}));
} finally {await pg.close();}
