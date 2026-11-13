// Pure metadata validation; no provider, files, environment or live database.
import assert from 'node:assert/strict';
import {typescriptLoader} from './lib/load-typescript.mjs';
const load=typescriptLoader({}, {Error}),m=load('lib/final-video-generation-v3/video-metadata.ts');
let checks=0;const ok=fn=>{fn();checks++;};
const reject=(fn,reason)=>{assert.throws(fn,e=>e.message==='V3_VIDEO_TECHNICAL_VALIDATION_FAILED'&&(!reason||e.reasons?.includes(reason)));checks++;};
const published={'16:9':[854,480],'4:3':[752,560],'1:1':[640,640],'3:4':[560,752],'9:16':[480,854],'21:9':[992,432]};
for(const [aspectRatio,[width,height]] of Object.entries(published)){
 const meta={width,height,durationMs:5056,hasAudio:true},expected={durationMs:5000,aspectRatio,generateAudio:true,resolution:'480p'};
 ok(()=>m.assertV3VideoMetadata(meta,expected));
 reject(()=>m.assertV3VideoMetadata({...meta,width:width+8,height:height+8},expected),'RESOLUTION_MISMATCH');
 reject(()=>m.assertV3VideoMetadata({...meta,durationMs:5251},expected),'DURATION_MISMATCH');
 reject(()=>m.assertV3VideoMetadata({...meta,hasAudio:false},expected),'AUDIO_MISSING');
 ok(()=>m.assertApprovedVideoMetadata({...meta,technicalValidationVersion:m.nativeVideoValidationVersion},expected));
}
const expected={durationMs:5000,aspectRatio:'1:1',generateAudio:true,resolution:'480p'},native={width:640,height:640,durationMs:5056,hasAudio:true};
reject(()=>m.assertLockedVideoMetadataV1(native,expected));
reject(()=>m.assertApprovedVideoMetadata(native,expected));
ok(()=>m.assertV3VideoMetadata({width:480,height:480,durationMs:5000,hasAudio:true},expected));
for(const meta of [{...native,width:NaN},{...native,height:0},{...native,durationMs:Infinity}])reject(()=>m.assertV3VideoMetadata(meta,expected),'INVALID_MEASUREMENT');
reject(()=>m.assertV3VideoMetadata(native,{...expected,resolution:'720p'}),'RESOLUTION_MISMATCH');
reject(()=>m.assertV3VideoMetadata({...native,width:1280,height:720},expected));
const {executeV3Segment}=load('lib/final-video-generation-v3/execution.ts');
const receipt={requestId:'00000000-0000-4000-8000-000000000001',status:'completed',statusUrl:'https://fixture.invalid/status',cancelUrl:null,expiresAt:null,resultUrl:'https://fixture.invalid/result',correlationId:null,receiptHash:'a'.repeat(64),actualCostMicrousd:null};
const completed=Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(receipt).reverse())));
let submitted=0,polled=0,downloaded=0,rewrites=0,results=0;
const deps={provider:{submit:async()=>{submitted++;throw Error('NO_SUBMISSION');},reconcile:async()=>{polled++;throw Error('NO_POLL');},fetchCompletedResult:async()=>{downloaded++;throw Error('NO_DOWNLOAD');}},
 beforeSubmit:()=>{throw Error('NO_NEW_AUTHORITY');},checkpoint:async(action)=>{if(action==='result')results++;},
 readSaved:async name=>name==='completed.json'?completed:name==='result.bytes'?Buffer.from('fixture bytes'):null,
 save:async()=>{rewrites++;throw Error('NO_RECEIPT_REWRITE');},validateAndPublish:async()=>({id:'fixture'})};
await executeV3Segment({state:'provider_processing',observation:receipt,result:null},true,deps,new AbortController().signal);checks++;
assert.deepEqual([submitted,polled,downloaded,rewrites,results],[0,0,0,0,1]);checks++;
await assert.rejects(()=>executeV3Segment({state:'provider_processing',observation:{...receipt,requestId:'00000000-0000-4000-8000-000000000002'},result:null},true,deps,new AbortController().signal),/PROVIDER_RECEIPT_MISMATCH/);checks++;
console.log(JSON.stringify({nativeVideoChecks:checks,realNetworkCalls:0}));
