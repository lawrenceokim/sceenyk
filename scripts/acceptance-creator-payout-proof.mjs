// Real Sandbox provider evidence plus production SQL replay on the isolated
// persistent time fixture. No new payout and no hosted financial writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import nextEnv from '@next/env';
import {PGlite} from '@electric-sql/pglite';
import {typescriptLoader} from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const load=typescriptLoader(),config=load('lib/payments/paypal/config.ts').getPayPalConfig();
assert.equal(config.baseUrl,'https://api-m.sandbox.paypal.com');
const root=path.join(os.tmpdir(),'sceenyk-creator-payout-acceptance-v1');
const artifact=root+'.acceptance-proof.json';
let state;try{state=JSON.parse(fs.readFileSync(artifact,'utf8'));}catch{state={checks:[]};}
const save=()=>fs.writeFileSync(artifact,JSON.stringify(state,null,2));
const check=(name,v)=>{assert.ok(v,name);if(!state.checks.includes(name))state.checks.push(name);save();console.log(JSON.stringify({passed:name}));};
const pg=new PGlite(root),one=async(sql,args=[]) =>(await pg.query(sql,args)).rows[0];
try{
  const id=(await one('select withdrawal_id from acceptance_fixture_state')).withdrawal_id;
  const w=await one('select * from creator_withdrawals where id=$1',[id]);
  check('real provider fixture is persistently Paid',w.status==='paid'&&w.provider_status==='SUCCESS'&&w.submitted_minor===500&&w.reserved_minor===0&&w.paid_at);
  const audit=JSON.parse(fs.readFileSync(root+'.provider-evidence.json','utf8'));
  check('exactly one real payout POST was sent',audit.postAttempts===1&&audit.responses.length===1&&audit.responses[0].httpStatus===201);
  const token=await load('lib/payments/paypal/client.ts').paypalAccessToken();
  async function sandbox(route,body){assert.ok(/^\/v1\/(payments\/payouts\/[A-Z0-9]+|notifications\/webhooks-events(\?|\/))/.test(route),'READ_OR_EVENT_REPLAY_ONLY');
    const response=await fetch(config.baseUrl+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    assert.ok(response.ok,'SANDBOX_HTTP_'+response.status);const text=await response.text();return{status:response.status,data:text?JSON.parse(text):null};}
  const raw=(await sandbox('/v1/payments/payouts/'+w.paypal_batch_id+'?page_size=1000')).data;
  const adapter=load('lib/marketplace/withdrawals/paypal.ts'),batch=adapter.payoutBatchSchema.parse(raw),item=adapter.verifyPayout(w,batch,true);
  check('PayPal confirms matched recipient credited successfully',item.transaction_status==='SUCCESS'&&!!raw.items[0].transaction_id&&item.payout_item.receiver===w.destination_snapshot&&item.payout_item.amount.value==='5.00');
  state.provider={batchId:w.paypal_batch_id,itemId:w.paypal_item_id,transactionId:raw.items[0].transaction_id,status:item.transaction_status,amountMinor:500,recipientMatched:true};save();
  const snapshot=async()=>createHash('sha256').update(JSON.stringify({withdrawal:await one('select * from creator_withdrawals where id=$1',[id]),events:(await pg.query('select * from creator_money_events where withdrawal_id=$1 order by id',[id])).rows})).digest('hex');
  const before=await snapshot();
  for(let n=0;n<3;n++){const r=await one('select creator_payout_observe($1,$2,$3,$4) value',[id,w.paypal_batch_id,w.paypal_item_id,item.transaction_status]);check('duplicate trusted completion has no financial effect '+n,r.value===false&&await snapshot()===before);}
  check('paid fixture cannot claim a second submission',(await one('select creator_payout_claim($1) value',[id])).value===null);
  const events=(await sandbox('/v1/notifications/webhooks-events?page_size=100')).data.events;
  const event=events.find(e=>e.event_type==='PAYMENT.PAYOUTS-ITEM.SUCCEEDED'&&(e.resource?.payout_batch_id===w.paypal_batch_id||e.resource?.batch_header?.payout_batch_id===w.paypal_batch_id));
  if(event){
    state.webhookEventId=event.id;
    if(process.argv.includes('--replay')&&!state.replayRequestedAt){
      state.replayRequestedAt=new Date().toISOString();save();
      const r=await sandbox('/v1/notifications/webhooks-events/'+encodeURIComponent(event.id)+'/resend',{webhook_ids:[config.webhookId]});
      check('PayPal accepts authentic payout webhook replay',r.status===202);
    }
    const detail=(await sandbox('/v1/notifications/webhooks-events/'+encodeURIComponent(event.id))).data;
    state.delivery={status:detail.status??null,transmissions:(detail.transmissions??[]).map(t=>({status:t.status??null,httpStatus:t.http_status??null,timestamp:t.timestamp??null}))};save();
    console.log(JSON.stringify({providerEventId:event.id,delivery:state.delivery,matchingHostedWithdrawal:false,scope:'authentic provider replay requested; listener delivery unverified; isolated financial replay verified separately'}));
  }else console.log(JSON.stringify({payoutWebhookEventVisible:false}));
  console.log(JSON.stringify({checks:state.checks.length,realSandboxPayout:true,controlledTimeAndSaleFixture:true,postAttempts:audit.postAttempts,status:item.transaction_status,proofArtifact:artifact}));
}finally{await pg.close();}
