import assert from "node:assert/strict";
import { calculateManualEstimate, getEstimatedRate, pricingConfiguration, suggestedAuthorizationMicrousd, validateManualSnapshot } from "../lib/final-video-generation-v3/pricing/higgsfield-pricing";
import { HiggsfieldVideoGenerationProvider, higgsfieldModels } from "../lib/final-video-generation-v3/adapters/higgsfield";
import { buildFrozenPackage, readFrozenPackage, packageCost, restoreSegment } from "../lib/final-video-generation-v3/package";
import { v3Input, v3Context, v3Id, sealV3 } from "./final-video-v3-fixture";
import { createRuntimeAuthorization, runtimePreflight } from "../lib/final-video-generation-v3/execution-package";
import { quoteSchema } from "../lib/final-video-generation-v3/runtime-contract";
import { v3BodyHash, v3Digest } from "../lib/final-video-generation-v3/identity";
let checks=0,network=0;
globalThis.fetch=async()=>{network++;throw new Error("NETWORK_FORBIDDEN");};
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
for(const [mode,rate] of [["text",470100],["image",470100],["reference",205667]] as const){
  const model=higgsfieldModels[mode];eq(getEstimatedRate("higgsfield",model,`${mode}-to-video`)?.rate,rate);
  for(const seconds of [4,10,30]){const s=calculateManualEstimate("higgsfield",model,`${mode}-to-video`,seconds*1000);eq(s.estimatedCostMicrousd,rate*seconds);eq(s.pricingVersion,"seedance-observed-2026-11-01");eq(s.pricingSource,"manual_provider_estimate");eq(validateManualSnapshot(JSON.parse(JSON.stringify(s))),s);}
}
eq(calculateManualEstimate("higgsfield",higgsfieldModels.reference,"reference-to-video",30000).estimatedUsd,"6.170010");
eq(calculateManualEstimate("higgsfield",higgsfieldModels.reference,"reference-to-video",10000).estimatedUsd,"2.056670");
const reference = calculateManualEstimate("higgsfield",higgsfieldModels.reference,"reference-to-video",30000);
eq(reference.estimatedUsdPerSecond,"0.2056666667");eq((reference.estimatedCostMicrousd/1000000).toFixed(2),"6.17");
for(const decimal of ["0.2056","0.205667","0.2056665","0.2056666667"])eq(validateManualSnapshot({...reference,estimatedUsdPerSecond:decimal}).rateMicrousdPerSecond,205667);
for(const decimal of ["0.2057","0.2056664","0.205665","0.5641","0.20566666670","2e-1",null]){assert.throws(()=>validateManualSnapshot({...reference,estimatedUsdPerSecond:decimal}));checks++;}
assert.throws(()=>calculateManualEstimate("higgsfield","unsupported","reference-to-video",10000),/V3_APPROXIMATE_PRICING_NOT_CONFIGURED/);checks++;
for(const ms of [0,3000,4001,31000,NaN]){assert.throws(()=>calculateManualEstimate("higgsfield",higgsfieldModels.reference,"reference-to-video",ms),/V3_PRICING_DURATION_INVALID/);checks++;}
eq(suggestedAuthorizationMicrousd(16923000),20310000);eq(suggestedAuthorizationMicrousd(5641000),6770000);
const provider=new HiggsfieldVideoGenerationProvider(),now=new Date().toISOString();
for(const resolution of ["480p","720p","1080p"] as const)for(const ratio of ["9:16","16:9","1:1"]){
  const input=v3Input([30000]);input.resolution=resolution;input.storyboardContent.aspectRatio=ratio;sealV3(input);
  const context=v3Context(input,provider);context.now=now;context.accountScope="no-provider-credentials";
  const doc=buildFrozenPackage(input,provider,context,{id:v3Id(100),version:1,sourceRevision:1});
  eq(doc.pricing.totalMicrousd,6170010);eq(doc.pricing.expiresAt,null);eq(doc.pricing.pricingVersion,pricingConfiguration.version);
  eq(readFrozenPackage(JSON.parse(JSON.stringify(doc))).hash,doc.hash);
  eq(packageCost(doc,provider,"2030-01-01T00:00:00Z").totalMicrousd,6170010);
}
const input=v3Input([30000,30000]),context=v3Context(input,provider);context.now=now;
const doc=buildFrozenPackage(input,provider,context,{id:v3Id(101),version:1,sourceRevision:1});
eq(doc.segments.map(s=>s.estimate.estimatedCostMicrousd),[6170010,6170010]);eq(doc.pricing.totalMicrousd,12340020);
const media=new Map(input.references.map(r=>[r.id,`https://fixture.invalid/${r.id}`]));
const quote=quoteSchema.parse({id:v3Id(102),packageId:doc.id,packageHash:doc.hash,projectId:input.scope.projectId,pricingSource:"manual_provider_estimate",
  currency:"USD",observedAt:now,expiresAt:null,deliveryExpiresAt:new Date(Date.now()-1000).toISOString(),totalMicrousd:doc.pricing.totalMicrousd,
  segments:doc.segments.map((s,i)=>{const request=provider.prepareRequest(restoreSegment(doc,s.id),media);return{segmentUuid:v3Id(110+i),segmentId:s.id,segmentVersion:1,
    fingerprint:s.fingerprint,model:request.model,body:request.input,bodyHash:v3BodyHash(request.input),estimatedCostMicrousd:s.estimate.estimatedCostMicrousd,estimateResponseHash:s.estimate.evidenceHash};})});
const auth=createRuntimeAuthorization(doc,quote,quote.segments[0].segmentUuid,{operatorId:input.scope.ownerId,approved:true,maximumMicrousd:20310000,packageMaximumMicrousd:40620000,now});
eq(Date.parse(auth.expiresAt)-Date.parse(auth.approvedAt),pricingConfiguration.authorizationLifetimeMs);
const report=runtimePreflight(doc,quote,auth,{current:true,transportEnabled:false,now,validityIssues:[]});
eq(report.estimatedCostMicrousd,12340020);eq(report.issues.includes("COST_ESTIMATE_UNAVAILABLE"),false);eq(report.issues.includes("V3_REFERENCE_DELIVERY_EXPIRED"),true);eq(report.canSubmit,false);
const mutated=JSON.parse(JSON.stringify(doc));mutated.segments[0].estimate.pricing.estimatedUsd="0.000000";const {hash:_,...body}=mutated;void _;mutated.hash=v3Digest("frozen-package",body);
assert.throws(()=>readFrozenPackage(mutated),/V3_PRICING_SNAPSHOT_INVALID/);checks++;
// A saved rate/version remains reproducible after the active configuration changes.
const prior=JSON.parse(JSON.stringify(doc));prior.pricing.pricingVersion="seedance-prior-fixture";prior.pricing.configurationDate="2026-10-30";prior.pricing.totalMicrousd=30000000;
for(const segment of prior.segments){const s=segment.estimate.pricing;Object.assign(s,{rateMicrousdPerSecond:500000,estimatedUsdPerSecond:"0.5000",estimatedCostMicrousd:15000000,estimatedUsd:"15.000000",pricingVersion:prior.pricing.pricingVersion,configurationDate:prior.pricing.configurationDate});
  segment.estimate.estimatedCostMicrousd=15000000;segment.estimate.pricingVersion=s.pricingVersion;segment.estimate.evidenceHash=v3Digest("manual-pricing",s);}
const {hash:oldHash,...priorBody}=prior;void oldHash;prior.hash=v3Digest("frozen-package",priorBody);
eq(packageCost(readFrozenPackage(prior),provider,"2030-01-01T00:00:00Z").totalMicrousd,30000000);
eq(network,0);console.info(`${checks} local pricing, frozen-snapshot, resolution/ratio, multi-segment and authorization checks passed; zero network calls.`);
