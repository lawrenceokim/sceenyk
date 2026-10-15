// Read-only real-session HTML/RSC isolation and cache checks. Never logs tokens,
// identities or response bodies; only sessions created here are revoked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nextEnv from '@next/env';
import {createClerkClient} from '@clerk/backend';
import {typescriptLoader} from './lib/load-typescript.mjs';

nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const origin=process.argv[2];
assert.ok(['http://localhost:3017','https://sceenyk.vercel.app'].includes(origin),'EXPLICIT_ACCEPTANCE_ORIGIN');
const db=typescriptLoader()('lib/db/server.ts').createDatabaseClient();
const users=await db.from('app_users').select('id,clerk_user_id,email').order('id').limit(100);
assert.ok(!users.error);
const existingProfiles=await db.from('marketplace_creator_profiles').select('owner_user_id');assert.ok(!existingProfiles.error);
const identities=users.data.filter(u=>u.email?.includes('+clerk_test@')&&existingProfiles.data.some(p=>p.owner_user_id===u.id)).slice(0,2);
assert.equal(identities.length,2,'TWO_EXISTING_RESERVED_IDENTITIES');
const profiles=await Promise.all(identities.map(async u=>{const r=await db.rpc('creator_profile_owned',{p_owner:u.id});assert.ok(!r.error&&r.data,'EXISTING_PROFILE');return r.data;}));
const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,telemetry:{disabled:true}});
assert.equal((await clerk.instance.get()).environmentType,'development');
const sessions=[],results=[];
const variants=[
  {name:'HTML'}, {name:'RSC',rsc:true}, {name:'RSC-query',rsc:true,query:true},
  {name:'HTML-cookie',cookie:true}, {name:'RSC-cookie',rsc:true,cookie:true},
];
// next start routes the canonical URL; the platform additionally exposes these
// generated paths. Their local coverage is checked in the compiled manifest.
if(origin.includes('vercel.app'))variants.push(
  {name:'RSC-resource',rsc:true,suffix:'.rsc'},
  {name:'RSC-prefetch-resource',rsc:true,suffix:'.prefetch.rsc',shell:true},
  {name:'RSC-segment-resource',rsc:true,suffix:'.segments/_full.segment.rsc',shell:true},
);
try {
  for(let index=0;index<3;index++){
    const session=index<2?await clerk.sessions.createSession({userId:identities[index].clerk_user_id}):null;
    if(session)sessions.push(session.id);
    for(const variant of variants){
      const token=session?(await clerk.sessions.getToken(session.id,undefined,60)).jwt:null;
      const headers={...(token?{Authorization:'Bearer '+token}:{}),...(variant.rsc?{RSC:'1'}:{}),...(token&&variant.cookie?{Cookie:'__session='+token}:{})};
      let url=new URL('/dashboard/marketplace/profile'+(variant.suffix??''),origin);
      if(variant.query)url.searchParams.set('_rsc','cacheacceptance');
      let response;
      for(let n=0;n<4;n++){
        response=await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(60000)});
        if(![307,308].includes(response.status))break;
        const target=new URL(response.headers.get('location'),url);
        if(target.origin!==origin||target.pathname!==url.pathname)break;
        assert.ok(response.headers.get('cache-control')?.includes('no-store'),'PRIVATE_NORMALIZATION_REDIRECT');
        await response.body?.cancel();url=target;
      }
      const body=await response.text(),cache=response.headers.get('cache-control'),cdn=response.headers.get('cdn-cache-control');
      const isolated=index<2?!body.includes(identities[1-index].clerk_user_id):identities.every(u=>!body.includes(u.clerk_user_id));
      const ownData=index<2?response.status===200&&(variant.shell||body.includes(profiles[index].bio)&&body.includes(identities[index].clerk_user_id)):[302,307,308,401,403].includes(response.status);
      const uncached=cache?.includes('private')&&cache.includes('no-store')&&cdn==='no-store';
      const result={user:index<2?'user-'+(index+1):'anonymous',variant:variant.name,status:response.status,cache,cdn,isolated,ownData,uncached:!!uncached,passed:isolated&&ownData&&!!uncached};
      results.push(result);console.log(JSON.stringify(result));
    }
  }
  const evidenceFile=path.join(os.tmpdir(),origin.includes('localhost')?'sceenyk-creator-profile-cache-local.json':'sceenyk-creator-profile-cache-deployed.json');
  fs.writeFileSync(evidenceFile,JSON.stringify({origin,checkedAt:new Date().toISOString(),results},null,2));
  assert.ok(results.every(r=>r.passed),'PRIVATE_PROFILE_CACHE_OR_ISOLATION_FAILED');
  console.log(JSON.stringify({passed:results.length,evidenceFile}));
} finally {
  for(const id of sessions)if((await clerk.sessions.getSession(id)).status==='active')await clerk.sessions.revokeSession(id);
}
