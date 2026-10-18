// Run after next build. Verify the compiled routing policy rather than copying
// the source matcher: the old slash wildcard passed HTTP checks on next start
// while missing the RSC resource paths used by the deployment platform.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {getCacheControlHeader}=require('next/dist/server/lib/cache-control.js');
const routes=JSON.parse(fs.readFileSync('.next/routes-manifest.json','utf8'));
const prerender=JSON.parse(fs.readFileSync('.next/prerender-manifest.json','utf8'));
const {config}=JSON.parse(fs.readFileSync('.next/required-server-files.json','utf8'));
const base='/dashboard/marketplace/profile';
let checks=0;
function check(name,condition){assert.ok(condition,name);checks++;}
function matchingPolicy(pathname){
  return routes.headers.filter(rule=>new RegExp(rule.regex).test(pathname))
    .flatMap(rule=>rule.headers).reduce((result,header)=>({...result,[header.key.toLowerCase()]:header.value}),{});
}
function privatePolicy(pathname){
  const policy=matchingPolicy(pathname);
  return policy['cache-control']?.includes('private')&&policy['cache-control'].includes('no-store')&&
    !/s-maxage|\bpublic\b/.test(policy['cache-control'])&&
    policy['cdn-cache-control']==='no-store'&&policy['vercel-cdn-cache-control']==='no-store';
}
for(const pathname of [base,base+'/',base+'.html',base+'.rsc',base+'.prefetch.rsc',base+'.segments/_tree.segment.rsc',base+'.segments/_full.segment.rsc',base+'.segments/dashboard/marketplace/profile/__PAGE__.segment.rsc']){
  check('compiled browser/CDN policy covers '+pathname,privatePolicy(pathname));
}
for(const pathname of ['/admin/payouts','/admin/payouts.rsc','/admin/payouts.prefetch.rsc','/api/admin/payouts/reconcile','/api/marketplace/creator-avatar']){
  check('existing private policy preserved '+pathname,privatePolicy(pathname));
}
for(const pathname of ['/','/studio','/marketplace','/marketplace/creators/example-creator','/marketplace/creators/example-creator.rsc','/marketplace/example-listing','/_next/static/chunks/example.js','/dashboard/credits','/dashboard/marketplace/earnings',base+'-other',base+'s']){
  check('no new private header rule on '+pathname,!matchingPolicy(pathname)['cache-control']);
}
check('Cache Components preserved',config.cacheComponents===true);
check('Partial Prefetching preserved',config.partialPrefetching===true);
check('public home remains static',prerender.routes['/'].initialRevalidateSeconds===false);
check('public Marketplace PPR preserved',prerender.routes['/marketplace'].renderingMode==='PARTIALLY_STATIC');
check('private profile retains request-time PPR holes',prerender.routes[base].renderingMode==='PARTIALLY_STATIC');
check('confirmed source of one-year shell header',getCacheControlHeader({revalidate:prerender.routes[base].initialRevalidateSeconds})==='s-maxage=31536000');
console.log(JSON.stringify({passed:checks,scope:'compiled Next routing policy, public caching preservation and shell-header provenance'}));
