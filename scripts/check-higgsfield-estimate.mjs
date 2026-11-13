// Focused actual adapter/admission/route checks. All I/O is injected; no env,
// real HTTP, provider generation, database writes or worker activation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { typescriptLoader } from './lib/load-typescript.mjs';
let checks=0,posts=0,quotes=0,generations=0,codeResponse,logs=[];
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const ok=v=>{assert.ok(v);checks++;};
const pricing=JSON.parse(fs.readFileSync('scripts/fixtures/higgsfield-seedance-published-pricing.json','utf8'));
// The live probe captured these two field names/types. The public description
// is a retained separate primary-source fixture; this wrapper is synthetic.
const formula={type:'fixture_formula',pricing_description:pricing.description};
const model='bytedance/seedance-2.5/reference-to-video';
const body={prompt:'Fixture prompt',duration:5,resolution:'480p',aspect_ratio:'1:1',generate_audio:true,image_urls:['https://private.invalid/reference?fixture-secret']};
const owner='00000000-0000-4000-8000-000000000001',project='00000000-0000-4000-8000-000000000002';
let amount=1030000,reserved=false;
const db={from:table=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='ugc_v3_runs'?reserved?{id:'run'}:null:reserved?{run_id:'run'}:null,error:null})}),rpc:async(name,args)=>{equal(name,'generation_paid_quote');quotes++;equal(args.p_cost,amount);equal(args.p_body_hash,'a'.repeat(64));ok(/^[a-f0-9]{64}$/.test(args.p_response_hash));return{data:true,error:null};}};
let failure;
// VM modules have distinct Object prototypes; normalize only fixture hashing
// across that test boundary. Production's canonical serializer is unchanged.
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')}}`;
const load=typescriptLoader({
 '@/lib/video-generation-package/builder':{canonicalJson:canonical,packageDigest:(domain,value)=>createHash('sha256').update(`${domain}:v1\n${canonical(value)}`).digest('hex')},
 '@/lib/db/server':{createDatabaseClient:()=>db},
 '@/lib/final-video-generation-v3/runtime-config':{v3TransportConfig:()=>config},
 './generation-policy-server':{generationAccess:async()=>({funding:'credits'})},
 '@/lib/final-video-generation-v3/runtime-server':{ownedV3Action:async()=>{throw failure;},readOwnedV3:async()=>{throw failure;}},
 '@/lib/final-video-generation-v3/final-operation-server':{readOwnedV3FinalStatus:async()=>{throw Error('UNEXPECTED_READ');}},
 'next/navigation':{unstable_rethrow(){}},
},{Error,TypeError,SyntaxError,Response,Request,fetch:async(url,init)=>{posts++;ok(String(url).includes('/estimate/'));if(!String(url).includes('/estimate/')){generations++;throw Error('GENERATION_FORBIDDEN');}equal(init.method,'POST');equal(JSON.parse(init.body),body);return Response.json(codeResponse,{headers:{'x-correlation-id':'fixture-correlation'}});},console:{error:(...args)=>logs.push(args)}});
const {normalizeHiggsfieldEstimate}=load('lib/final-video-generation-v3/adapters/higgsfield-estimate.ts');
const {HiggsfieldV3Transport,HiggsfieldTransportError}=load('lib/final-video-generation-v3/adapters/higgsfield-transport.ts');
const config={enabled:true,credentials:'fixture:key',accountScope:'fixture',outputHosts:[]};
const transport=new HiggsfieldV3Transport(config);
const route=load('app/api/ugc/v3/route.ts');
// Reproduce the pre-fix exception and exact browser response without any POST.
try{z.object({usd:z.string()}).parse(formula);}catch(error){failure=error;}
let response=await route.GET(new Request('https://app.test/api/ugc/v3?project='+project));
equal(response.status,409);equal((await response.json()).code,'V3_ACTION_UNAVAILABLE');
ok(JSON.stringify(logs).includes('V3_ACTION_FAILURE'));
codeResponse=formula;
const estimate=await transport.estimate(model,body,new AbortController().signal);
equal(estimate.usd,'0.588500');equal(estimate.pricingSource,'provider_formula');equal(estimate.correlationId,'fixture-correlation');
for(const ratio of ['16:9','4:3','1:1','3:4','9:16','21:9'])equal(normalizeHiggsfieldEstimate(model,{...body,aspect_ratio:ratio},formula).usd,'0.588500');
equal(normalizeHiggsfieldEstimate(model,{...body,audio_urls:['https://private.invalid/audio']},formula).usd,'0.588500');
const changed=normalizeHiggsfieldEstimate(model,{...body,prompt:'Other fixture'},formula);
ok(changed.responseHash!==estimate.responseHash);
for(const [changedBody,changedResponse] of [
 [{...body,duration:10},formula],[{...body,resolution:'720p'},formula],[{...body,resolution:'1080p'},formula],
 [{...body,video_urls:['https://private.invalid/video']},formula],[{...body,number_of_outputs:2},formula],
 [{...body,image_urls:[]},formula],[{...body,generate_audio:false},formula],
 [body,{...formula,pricing_description:pricing.description.replace('$0.1177','$1.177')}],
 [body,{...formula,pricing_description:'Token pricing needs unverified dimensions'}],
 [body,{...formula,usd:null}],
 ]){assert.throws(()=>normalizeHiggsfieldEstimate(model,changedBody,changedResponse),/HIGGSFIELD_ESTIMATE_(PRICING_UNVERIFIED|RESPONSE_INVALID)/);checks++;}
assert.throws(()=>normalizeHiggsfieldEstimate('different-model',body,formula),/PRICING_UNVERIFIED/);checks++;
codeResponse={usd:'1.030000'};
equal((await transport.estimate(model,body,new AbortController().signal)).usd,'1.030000');
const {verifyPaidVideoPrice}=load('lib/accounting/paid-video-pricing.ts');
const intent={projectId:project,executionId:'run',model,body,bodyHash:'a'.repeat(64),authorization:{maxEstimatedCostMicrousd:1030000}};
amount=588500;codeResponse=formula;await verifyPaidVideoPrice(owner,intent,new AbortController().signal);equal(quotes,1);
// Price is independently checked at dispatch for an admitted paid reservation.
reserved=true;await verifyPaidVideoPrice(owner,intent,new AbortController().signal);equal(quotes,2);
const beforeQuotes=quotes;codeResponse={usd:'1.030001'};
await assert.rejects(()=>verifyPaidVideoPrice(owner,intent,new AbortController().signal),/PAID_PROVIDER_PRICE_CHANGED/);checks++;equal(quotes,beforeQuotes);
codeResponse={usd:'0.000000'};await assert.rejects(()=>verifyPaidVideoPrice(owner,intent,new AbortController().signal),/PAID_PROVIDER_PRICE_REQUIRED/);checks++;equal(quotes,beforeQuotes);
codeResponse={type:'fixture_formula',pricing_description:'Unverified private-token data'};
try{await transport.estimate(model,body,new AbortController().signal);}catch(error){failure=error;}
ok(failure instanceof HiggsfieldTransportError);equal(failure.outcome,'observation_failed');
response=await route.POST(new Request('https://app.test/api/ugc/v3',{method:'POST',headers:{origin:'https://app.test'},body:JSON.stringify({action:'generate',projectId:project})}));
equal((await response.json()).code,'HIGGSFIELD_ESTIMATE_PRICING_UNVERIFIED');
const serialized=JSON.stringify(logs);ok(serialized.includes('fixture-correlation'));ok(!serialized.includes('fixture-secret'));ok(!serialized.includes('Unverified private-token data'));equal(generations,0);
console.info(JSON.stringify({estimateChecks:checks,fixtureEstimateRequests:posts,realNetworkCalls:0,generationRequests:generations}));
