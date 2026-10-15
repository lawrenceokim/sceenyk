// Production REST adapter with explicit HTTP fixtures; no real payout.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {typescriptLoader} from './lib/load-typescript.mjs';
let checks=0,posts=0,gets=0,mode='normal';
const check=(name,value)=>{assert.ok(value,name);checks++;};
const id=randomUUID(),w={id,creator_user_id:randomUUID(),currency:'USD',status:'processing',destination_snapshot:'recipient@example.test',submitted_minor:500,paypal_batch_id:null,paypal_item_id:null};
const batch={batch_header:{payout_batch_id:'BATCH00000001',batch_status:'PENDING',sender_batch_header:{sender_batch_id:id}}};
const complete={...batch,items:[{payout_item_id:'ITEM000000001',payout_batch_id:'BATCH00000001',transaction_status:'SUCCESS',payout_item:{sender_item_id:id,receiver:w.destination_snapshot,recipient_type:'EMAIL',amount:{currency:'USD',value:'5.00'}}}]};
const events=typescriptLoader()('lib/marketplace/withdrawals/contract.ts').payoutWebhookEvents;
const loader=typescriptLoader({
  '@/lib/payments/paypal/config':{getPayPalConfig:()=>({baseUrl:'https://api-m.sandbox.paypal.com',origin:'https://fixture.invalid',webhookId:'FIXTURE'})},
  '@/lib/payments/paypal/client':{paypalAccessToken:async()=> 'fixture-token'},
},{Response,fetch:async(url,init)=>{
  if(String(url).includes('/v1/notifications/webhooks/'))return Response.json({url:'https://fixture.invalid/api/payments/paypal/webhook',event_types:mode==='missing_setup'?[]:events.map(name=>({name}))});
  check('fixed Sandbox endpoint',String(url).startsWith('https://api-m.sandbox.paypal.com/v1/payments/payouts'));
  check('server-only authenticated HTTP',init.headers.Authorization==='Bearer fixture-token'&&init.cache==='no-store'&&init.redirect==='error');
  if(init.method==='POST'){
    posts++;const body=JSON.parse(init.body);check('one exact USD email item',body.items.length===1&&body.items[0].amount.value==='5.00'&&body.items[0].amount.currency==='USD'&&body.items[0].receiver===w.destination_snapshot);
    check('stable server-generated batch and item IDs',body.sender_batch_header.sender_batch_id===id&&body.items[0].sender_item_id===id);
    if(mode==='timeout')throw Error('fixture timeout');
    if(mode==='reject')return Response.json({name:'INSUFFICIENT_FUNDS'},{status:422});
    if(mode==='duplicate')return Response.json({name:'VALIDATION_ERROR',details:[{issue:'DUPLICATE_BATCH_ID'}]},{status:400});
    if(mode==='server')return Response.json({name:'INTERNAL_ERROR'},{status:500});
    return Response.json(batch,{status:201});
  }
  gets++;return Response.json(complete);
}});
const provider=loader('lib/marketplace/withdrawals/paypal.ts');
await provider.assertPayoutWebhooksReady();checks++;
mode='missing_setup';await assert.rejects(()=>provider.assertPayoutWebhooksReady(),/PAYPAL_PAYOUT_SETUP_REQUIRED/);checks++;
mode='normal';
check('accepted submission is just a batch',(await provider.submitPayout(w)).batch_header.batch_status==='PENDING');
check('accepted response cannot establish item completion',provider.verifyPayout(w,batch)===null);
check('GET validates provider item completion',provider.verifyPayout(w,await provider.readPayoutBatch(batch.batch_header.payout_batch_id),true).transaction_status==='SUCCESS');
for(const kind of ['timeout','duplicate','server']){
  mode=kind;const before=posts;await assert.rejects(()=>provider.submitPayout(w),error=>!(error instanceof provider.PayoutRejected));checks++;
  check('adapter never automatically retries '+kind,posts===before+1);
}
mode='reject';await assert.rejects(()=>provider.submitPayout(w),error=>error instanceof provider.PayoutRejected&&error.code==='INSUFFICIENT_FUNDS');checks++;
for(const update of [{status:'pending'},{submitted_minor:null}]){assert.throws(()=>provider.payoutInstruction({...w,...update}));checks++;}
assert.throws(()=>provider.readPayoutBatch('../evil'));checks++;
const config=typescriptLoader()('lib/payments/paypal/config.ts'),original=process.env.PAYPAL_ENVIRONMENT;
try{process.env.PAYPAL_ENVIRONMENT='live';assert.throws(()=>config.getPayPalConfig(),/PAYPAL_SANDBOX_REQUIRED/);checks++;}finally{if(original===undefined)delete process.env.PAYPAL_ENVIRONMENT;else process.env.PAYPAL_ENVIRONMENT=original;}
check('reconciliation is provider GET only',gets===1);
console.log(JSON.stringify({checks,passed:true,http:'fixture',realSandboxPayout:false}));
