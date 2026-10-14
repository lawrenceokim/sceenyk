// Actual migrations/SQL with explicit verified-capture fixtures, no real money.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {compositionFixtureDatabase} from './lib/composition-fixture.mjs';
const {pg,call,one,scalar}=await compositionFixtureDatabase();
let count=0;const check=(name,value)=>{assert.ok(value,name);count++;};
const rejects=async(name,fn)=>{await assert.rejects(fn,undefined,name);count++;};
try {
  const a=await scalar("insert into app_users(clerk_user_id) values('earnings_A') returning id as value");
  const b=await scalar("insert into app_users(clerk_user_id) values('earnings_B') returning id as value");
  const c=await scalar("insert into app_users(clerk_user_id) values('earnings_C') returning id as value");
  const accounts=JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  async function listing(price=200){
    const project=await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Private','gaming','1:1','10','Original','Energetic') returning id as value",[a]);
    const id=randomUUID();
    await call('marketplace_create_priced',{p_owner_user_id:a,p_listing_id:id,p_project_id:project,p_title:'Money fixture',p_description:'A reviewed template.',p_category:'gaming',p_tags:[],p_instructions:'Use your own story.',p_publish:true,p_rights_confirmed:true,p_adoption_type:'paid',p_price_minor:price});
    return id;
  }
  const id=await listing(205);
  const prepare=(buyer=b,fee=0)=>call('marketplace_prepare_purchase',{p_buyer_user_id:buyer,p_listing_id:id,p_fee_bps:fee,p_pricing_version:'sandbox-fixture'});
  const p=await prepare(b,250);
  check('demo percentage snapshots exact integer cents',p.amount_minor===205&&p.platform_fee_minor===5&&p.creator_net_minor===200&&p.fee_bps===250);
  check('preparation never earns',await scalar('select count(*)::int as value from creator_earnings_ledger')===0);
  const repeat=await Promise.all([prepare(b,0),prepare(b,10000)]);
  check('repeated preparation retains original fee and price',repeat.every(v=>v.id===p.id&&v.platform_fee_minor===5));
  const order='ORDER00000000001',capture='CAPTURE0000000001';
  await call('marketplace_attach_order',{p_purchase_id:p.id,p_buyer_user_id:b,p_order_id:order});
  const args={p_purchase_id:p.id,p_order_id:order,p_capture_id:capture,p_amount_minor:205,p_currency:'USD'};
  check('wrong money cannot fulfil',!await call('marketplace_fulfil_purchase',{...args,p_amount_minor:1}));
  check('wrong currency cannot fulfil',!await call('marketplace_fulfil_purchase',{...args,p_currency:'EUR'}));
  check('wrong order cannot fulfil',!await call('marketplace_fulfil_purchase',{...args,p_order_id:'ORDER00000000099'}));
  check('missing capture cannot fulfil',!await call('marketplace_fulfil_purchase',{...args,p_capture_id:null}));
  check('no premature earning',await scalar('select count(*)::int as value from creator_earnings_ledger')===0);
  // Inject an entitlement write outage to establish all-or-nothing fulfilment.
  await pg.exec("create function fail_entitlement_fixture() returns trigger language plpgsql as $$ begin raise exception 'fixture outage'; end $$; create trigger fail_entitlement_fixture before insert on marketplace_entitlements for each row execute function fail_entitlement_fixture();");
  await rejects('fulfilment rolls back on entitlement outage',()=>pg.query('select marketplace_fulfil_purchase($1,$2,$3,$4,$5)',Object.values(args)));
  check('failed transaction leaves no money or entitlement effect',await scalar('select count(*)::int as value from creator_earnings_ledger')===0&&await scalar('select count(*)::int as value from marketplace_entitlements')===0&&(await one('select status from marketplace_purchases where id=$1',[p.id])).status==='pending');
  await pg.exec('drop trigger fail_entitlement_fixture on marketplace_entitlements; drop function fail_entitlement_fixture();');
  check('verified proof fixture fulfils',await call('marketplace_fulfil_purchase',args));
  check('repeat proof retains exactly one money effect',await call('marketplace_fulfil_purchase',args)&&await scalar('select count(*)::int as value from creator_earnings_ledger')===1);
  check('different capture cannot overwrite completion',!await call('marketplace_fulfil_purchase',{...args,p_capture_id:'CAPTURE0000000002'}));
  const read=()=>call('marketplace_creator_earnings',{p_creator_user_id:a,p_page:1});
  const first=await read();
  check('pending available lifetime are separate',first.pending===200&&first.available===0&&first.lifetime===200);
  check('sale history projects gross fee net',first.sales[0].gross===205&&first.sales[0].fee===5&&first.sales[0].net===200&&first.sales[0].state==='pending');
  check('sale DTO contains no buyer or provider data',!JSON.stringify(first).includes(b)&&!JSON.stringify(first).includes(order)&&!JSON.stringify(first).includes(capture));
  check('buyer earnings query has no creator rows',(await call('marketplace_creator_earnings',{p_creator_user_id:b,p_page:1})).total===0);
  for(const table of ['creator_earnings_ledger','marketplace_entitlements','marketplace_purchases']){
    await rejects('immutable '+table+' update',()=>pg.query('update '+table+' set created_at=now()'));
    await rejects('immutable '+table+' delete',()=>pg.query('delete from '+table));
  }
  await rejects('unique one earning per sale/state',()=>pg.query("insert into creator_earnings_ledger(creator_user_id,marketplace_purchase_id,listing_id,listing_title,gross_minor,platform_fee_minor,net_minor,currency,state) select creator_user_id,marketplace_purchase_id,listing_id,listing_title,gross_minor,platform_fee_minor,net_minor,currency,state from creator_earnings_ledger"));
  const zeroNet=await prepare(c,10000);check('future fee representation can hold zero net',zeroNet.creator_net_minor===0&&zeroNet.platform_fee_minor===205);
  const delayedBuyer=await scalar("insert into app_users(clerk_user_id) values('delayed_checkout') returning id as value");
  await pg.query("insert into marketplace_purchases(listing_id,buyer_user_id,creator_user_id,listing_title,template_snapshot,amount_minor,platform_fee_minor,creator_net_minor,fee_bps,pricing_version,currency,created_at) select listing_id,$1,creator_user_id,listing_title,template_snapshot,amount_minor,platform_fee_minor,creator_net_minor,fee_bps,pricing_version,currency,now()-interval '1 hour' from marketplace_purchases where id=$2",[delayedBuyer,p.id]);
  const delayed=await one('select * from marketplace_purchases where buyer_user_id=$1',[delayedBuyer]);
  const attempt=await call('marketplace_begin_order',{p_purchase_id:delayed.id,p_buyer_user_id:delayedBuyer});
  check('old reviewed checkout starts a fresh first-create window',Date.now()-Date.parse(attempt.paypal_create_started_at)<60000&&Date.parse(attempt.created_at)<Date.now()-30*60000);
  check('duplicate first-create window never resets',(await call('marketplace_begin_order',{p_purchase_id:delayed.id,p_buyer_user_id:delayedBuyer})).paypal_create_started_at===attempt.paypal_create_started_at);
  await rejects('create window cannot be moved after a request',()=>pg.query('update marketplace_purchases set paypal_create_started_at=now() where id=$1',[delayed.id]));
  await call('marketplace_attach_order',{p_purchase_id:zeroNet.id,p_buyer_user_id:c,p_order_id:'ORDER00000000002'});
  await rejects('unique provider capture across Marketplace purchases',()=>pg.query('select marketplace_fulfil_purchase($1,$2,$3,205,\'USD\')',[zeroNet.id,'ORDER00000000002',capture]));
  check('capture collision rolls back other effects',(await read()).total===1);
  // Future transition preparation only: privileged test fixtures append events.
  const sale=await one('select * from creator_earnings_ledger where marketplace_purchase_id=$1',[p.id]);
  async function append(state){await pg.query("insert into creator_earnings_ledger(creator_user_id,marketplace_purchase_id,listing_id,listing_title,gross_minor,platform_fee_minor,net_minor,currency,state,available_at) values($1,$2,$3,$4,$5,$6,$7,'USD',$8,case when $8='available' then now() end)",[a,p.id,id,sale.listing_title,205,5,200,state]);}
  await append('available');const available=await read();check('future availability uses append-only event',available.pending===0&&available.available===200&&available.lifetime===200&&available.sales[0].state==='available');
  await append('reversed');const reversed=await read();check('future reversal preserves history and removes net from earnings',reversed.pending===0&&reversed.available===0&&reversed.lifetime===0&&reversed.sales[0].state==='reversed'&&await scalar('select count(*)::int as value from creator_earnings_ledger')===3);
  check('original pending entry unchanged',JSON.stringify(await one('select * from creator_earnings_ledger where id=$1',[sale.id]))===JSON.stringify(sale));
  for(const role of ['anon','authenticated','service_role']){
    await pg.exec('set role '+role);
    await rejects(role+' cannot create arbitrary earnings',()=>pg.query("insert into creator_earnings_ledger default values"));
    if(role!=='service_role')await rejects(role+' cannot enumerate private earnings',()=>pg.query('select * from creator_earnings_ledger'));
    await pg.exec('reset role');
  }
  check('AI credit ledger and original accounts remain independent',await scalar('select count(*)::int as value from credit_ledger')===0&&JSON.stringify((await pg.query('select * from generation_accounts where owner_user_id=any($1) order by owner_user_id',[[a,b,c]])).rows)===accounts);
  console.log(JSON.stringify({passed:count,realSql:true,verifiedCaptureFixture:true,settlementAutomation:false}));
} finally { await pg.close(); }
