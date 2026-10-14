// Actual SQL and payment service/REST adapter; explicit PayPal/Clerk fixtures.
// No hosted writes, real payment, browser approval or multi-connection claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { typescriptLoader } from './lib/load-typescript.mjs';

const pg = new PGlite();
let count = 0;
const check = (name, value) => { assert.ok(value, name); count++; };
const one = async (sql, args = []) => (await pg.query(sql, args)).rows[0];
const scalar = async (sql, args = []) => (await one(sql, args))?.value;
async function rejects(name, fn) { await assert.rejects(fn); count++; }
let queue = Promise.resolve();
const serialize = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
const db = {
  rpc(name, args = {}) { return serialize(async () => {
    await pg.exec('set role service_role');
    try { return { data: await scalar(`select ${name}(${Object.keys(args).map((key, index) => `${key}=>$${index + 1}`).join(',')}) as value`, Object.values(args)), error: null }; }
    catch (error) { return { data: null, error: { code: error.code } }; }
    finally { await pg.exec('reset role'); }
  }); },
  from(table) {
    const filters = [], args = []; let fields = '*', order = '', limit = '';
    return {
      select(value) { fields = value; return this; },
      range(start,end) { limit = ` limit ${end-start+1} offset ${start}`; return this; },
      eq(key, value) { args.push(value); filters.push(`${key}=$${args.length}`); return this; },
      in(key, values) { args.push(values); filters.push(`${key}=any($${args.length})`); return this; },
      not(key, op, value) { assert.equal(op, 'is'); assert.equal(value, null); filters.push(`${key} is not null`); return this; },
      order(key, options) { order = ` order by ${key} ${options?.ascending === false ? 'desc' : 'asc'}`; return this; },
      limit(value) { limit = ` limit ${Number(value)}`; return this; },
      then(resolve, reject) { return this.execute(false).then(resolve, reject); },
      single() { return this.execute(true); }, maybeSingle() { return this.execute(true); },
      execute(single) { return serialize(async () => {
        await pg.exec('set role service_role');
        try { const rows = (await pg.query(`select ${fields} from ${table}${filters.length ? ' where ' + filters.join(' and ') : ''}${order}${limit}`, args)).rows; return { data: JSON.parse(JSON.stringify(single ? rows[0] ?? null : rows)), error: null }; }
        catch (error) { return { data: null, error: { code: error.code } }; }
        finally { await pg.exec('reset role'); }
      }); },
    };
  },
};
const names = ['PAYPAL_ENVIRONMENT', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_RETURN_ORIGIN', 'SCEENYK_MARKETPLACE_DEMO_FEE_BPS'];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
Object.assign(process.env, { PAYPAL_ENVIRONMENT: 'sandbox', PAYPAL_CLIENT_ID: 'fixture-client', PAYPAL_CLIENT_SECRET: 'fixture-secret', PAYPAL_WEBHOOK_ID: 'fixture-webhook', PAYPAL_RETURN_ORIGIN: 'http://localhost:3000' });
delete process.env.SCEENYK_MARKETPLACE_DEMO_FEE_BPS;
let owner, httpCalls = 0, captures = 0, creates = 0, lostCreate = false, lostCapture = false, invalidSignature = false;
const orders = new Map(), requestOrders = new Map();
const fetchFixture = async (url, init) => {
  httpCalls++;
  assert.ok(String(url).startsWith('https://api-m.sandbox.paypal.com/'), 'all HTTP is fixed Sandbox');
  assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
  if (String(url).endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'fixture-token', token_type: 'Bearer' });
  if (String(url).endsWith('/verify-webhook-signature')) { return Response.json({ verification_status: invalidSignature ? 'FAILURE' : 'SUCCESS' }); }
  if (String(url).endsWith('/v2/checkout/orders')) {
    const body = JSON.parse(init.body), key = init.headers['PayPal-Request-ID'];
    assert.equal(body.payment_source.paypal.experience_context.shipping_preference, 'NO_SHIPPING');
    assert.equal(body.payment_source.paypal.experience_context.return_url, 'http://localhost:3000/dashboard/marketplace/purchases?checkout=return');
    let id = requestOrders.get(key);
    if (!id) { id = `ORDER${String(++creates).padStart(12, '0')}`; requestOrders.set(key, id);
      orders.set(id, { id, intent: 'CAPTURE', status: 'PAYER_ACTION_REQUIRED', purchase_units: body.purchase_units,
        links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] }); }
    if (lostCreate) { lostCreate = false; throw new Error('Fixture create response lost'); }
    return Response.json(orders.get(id));
  }
  const id = String(url).split('/')[6], order = orders.get(id);
  assert.ok(order, 'fixture order exists');
  if (String(url).endsWith('/capture')) {
    if (order.status !== 'APPROVED') return Response.json({}, { status: 422 });
    captures++;
    order.status = 'COMPLETED';
    order.purchase_units[0].payments = { captures: [{ id: `CAPTURE${String(captures).padStart(10, '0')}`, status: 'COMPLETED', final_capture: true, amount: order.purchase_units[0].amount }] };
    if (lostCapture) { lostCapture = false; throw new Error('Fixture capture response lost'); }
  }
  return Response.json(order);
};
const load = typescriptLoader({ '@/lib/db/server': { createDatabaseClient: () => db }, '@/lib/auth/ensure-app-user': { ensureAppUser: async () => { if (!owner) throw new Error('Unauthenticated'); return { id: owner }; } } }, { fetch: fetchFixture, Headers, Request, Response });
const service = load('lib/marketplace/payments/server.ts');
const listings = typescriptLoader({ 'next/server': {connection:async()=>{}}, '@/lib/db/server': {createDatabaseClient:()=>db}, '@/lib/auth/ensure-app-user': {ensureAppUser:async()=>{if(!owner)throw new Error('AUTH_REQUIRED');return{id:owner};}} })('lib/marketplace/server.ts');
async function denied(name, sql, args = [], role = 'authenticated') {
  await pg.exec(`set role ${role}`);
  try { await rejects(name, () => pg.query(sql, args)); } finally { await pg.exec('reset role'); }
}
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const a=await scalar("insert into app_users(clerk_user_id) values('paid_creator') returning id as value");
  const b=await scalar("insert into app_users(clerk_user_id) values('paid_buyer') returning id as value");
  const c=await scalar("insert into app_users(clerk_user_id) values('paid_buyer_two') returning id as value");
  const project=await scalar("insert into projects(owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone) values($1,'Private original','cinematic','PRIVATE ORIGINAL','16:9','10','Anime','Dramatic') returning id as value",[a]);
  const original=JSON.stringify(await one('select * from projects where id=$1',[project]));
  const accounts=JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows);
  const input={id:randomUUID(),sourceProjectId:project,title:'Paid cinematic recipe',description:'Reusable approved recipe.',category:'cinematic',tags:['paid'],instructions:'Approved reusable instructions',publish:true,rightsConfirmed:true,adoptionType:'paid',priceMinor:200};
  owner=a;
  check('creator publishes paid listing',(await listings.createMarketplaceListing(input)).ok);
  check('server rejects demo prices outside limits',!(await listings.updateMarketplaceListing({...input,sourceProjectId:undefined,instructions:undefined,publish:undefined,status:'published',priceMinor:99999})).ok);
  const publicListing=await listings.getMarketplaceListing(input.id);
  check('public price is authoritative USD',publicListing.priceMinor===200&&publicListing.currency==='USD');
  check('paid reusable instructions are not public',publicListing.template.instructions!==input.instructions&&!JSON.stringify(publicListing).includes(project));
  check('creator still sees reviewed snapshot',(await listings.getOwnedMarketplaceListing(input.id)).template.instructions===input.instructions);
  await rejects('creator cannot create self sale',()=>service.prepareMarketplaceCheckout({listingId:input.id}));
  owner=b;
  check('unpaid free-path bypass refused',!(await listings.adoptMarketplaceListing({listingId:input.id,requestId:randomUUID()})).ok);
  const p=await service.prepareMarketplaceCheckout({listingId:input.id});
  check('payment summary from frozen purchase',p.amountMinor===200&&p.status==='pending'&&!p.projectId);
  check('repeat summary reuses purchase',(await service.prepareMarketplaceCheckout({listingId:input.id})).id===p.id);
  for(const extra of [{amountMinor:1},{currency:'EUR'},{creator_user_id:b},{net:200},{status:'completed'}])await rejects('browser financial field rejected',()=>service.prepareMarketplaceCheckout({listingId:input.id,...extra}));
  await rejects('buyer cannot pass capture proof',()=>service.recoverMarketplacePurchase({purchaseId:p.id,captureId:'CAPTURE0000000000'}));
  const start=await service.createMarketplaceOrder({purchaseId:p.id});
  check('hosted Sandbox approval link',start.approvalUrl.startsWith('https://www.sandbox.paypal.com/checkoutnow'));
  check('one stable create across repeated checkout',(await service.createMarketplaceOrder({purchaseId:p.id})).approvalUrl===start.approvalUrl&&creates===1);
  const row=await one('select * from marketplace_purchases where id=$1',[p.id]);const order=orders.get(row.paypal_order_id);
  check('provider binds listing and purchase',order.purchase_units[0].reference_id===input.id&&order.purchase_units[0].invoice_id==='marketplace:'+p.id);
  check('unapproved order grants nothing',!(await service.recoverMarketplacePurchase({purchaseId:p.id})).projectId&&await scalar('select count(*)::int as value from creator_earnings_ledger')===0);
  owner=a;const beforeHttp=httpCalls;
  await rejects('foreign buyer cannot capture',()=>service.recoverMarketplacePurchase({purchaseId:p.id}));
  check('foreign refusal precedes provider HTTP',httpCalls===beforeHttp);
  owner=b;
  const unit=order.purchase_units[0];const amount={...unit.amount};
  for(const patch of [{value:'0.01'},{currency_code:'EUR'}]){
    unit.amount={...amount,...patch};await rejects('mismatched provider money denied',()=>service.recoverMarketplacePurchase({purchaseId:p.id}));
  }
  unit.amount=amount;const reference=unit.reference_id;unit.reference_id=randomUUID();
  await rejects('mismatched listing reference denied',()=>service.recoverMarketplacePurchase({purchaseId:p.id}));unit.reference_id=reference;
  order.status='COMPLETED';
  const validCapture={id:'CAPTURE9999999999',status:'COMPLETED',final_capture:true,amount};
  for(const patch of [{status:'PENDING'},{status:'DENIED'},{final_capture:false},{amount:{value:'0.01',currency_code:'USD'}},{amount:{value:'2.00',currency_code:'EUR'}}]){
    unit.payments={captures:[{...validCapture,...patch}]};
    if(patch.status==='DENIED')continue; // Definitive denial is checked separately below.
    await rejects('nonfinal or mismatched capture cannot grant',()=>service.recoverMarketplacePurchase({purchaseId:p.id}));
  }
  unit.payments={captures:[validCapture,validCapture]};await rejects('multiple captures cannot fulfil',()=>service.recoverMarketplacePurchase({purchaseId:p.id}));
  delete unit.payments;order.status='PAYER_ACTION_REQUIRED';
  const route=load('app/api/payments/paypal/webhook/route.ts');
  const event={id:'WH-PAID',event_type:'CHECKOUT.ORDER.APPROVED',resource:{id:order.id}};
  const headers={'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.sandbox.paypal.com/v1/notifications/certs/fixture','paypal-transmission-id':'fixture','paypal-transmission-sig':'fixture','paypal-transmission-time':'fixture'};
  const deliver=()=>route.POST(new Request('http://localhost/api/payments/paypal/webhook',{method:'POST',headers,body:JSON.stringify(event)}));
  check('unsigned webhook cannot grant paid adoption',(await route.POST(new Request('http://localhost/api/payments/paypal/webhook',{method:'POST',body:JSON.stringify(event)}))).status===400);
  invalidSignature=true;check('failed official signature denied',(await deliver()).status===400);invalidSignature=false;
  order.status='APPROVED';
  await pg.exec("create function fail_paid_project() returns trigger language plpgsql as $$ begin raise exception 'fixture project outage'; end $$; create trigger fail_paid_project before insert on projects for each row execute function fail_paid_project();");
  check('temporary project failure requests webhook recovery',(await deliver()).status===503);
  check('verified payment commits before failed project',(await one('select status from marketplace_purchases where id=$1',[p.id])).status==='completed'&&await scalar('select count(*)::int as value from marketplace_entitlements')===1&&await scalar('select count(*)::int as value from creator_earnings_ledger')===1);
  check('failed project insertion rolls back project and provenance',await scalar('select count(*)::int as value from marketplace_adoptions')===0&&await scalar('select count(*)::int as value from projects where owner_user_id=$1',[b])===0);
  await pg.exec('drop trigger fail_paid_project on projects; drop function fail_paid_project();');
  check('authentic webhook retries recover without browser',(await deliver()).status===200);
  const adopted=await service.recoverMarketplacePurchase({purchaseId:p.id});
  check('exactly one intended buyer project',!!adopted.projectId&&await scalar('select count(*)::int as value from projects where owner_user_id=$1',[b])===1);
  await Promise.all([deliver(),deliver(),service.recoverMarketplacePurchase({purchaseId:p.id}),service.recoverMarketplacePurchase({purchaseId:p.id})]);
  check('duplicate capture webhook redemption effects stay one',captures===1&&creates===1&&await scalar('select count(*)::int as value from marketplace_adoptions')===1&&await scalar('select count(*)::int as value from creator_earnings_ledger')===1&&await scalar('select count(*)::int as value from marketplace_entitlements')===1);
  const copy=await one('select * from projects where id=$1',[adopted.projectId]);
  check('paid adoption copies reviewed settings only',copy.owner_user_id===b&&copy.prompt===input.instructions&&copy.visual_style==='Anime'&&copy.tone==='Dramatic'&&copy.aspect_ratio==='16:9');
  check('private media never copied',await scalar('select count(*)::int as value from project_assets where project_id=$1',[adopted.projectId])===0);
  check('creator original unchanged',JSON.stringify(await one('select * from projects where id=$1',[project]))===original);
  check('all AI credit and free counters unchanged',JSON.stringify((await pg.query('select * from generation_accounts order by owner_user_id')).rows)===accounts&&await scalar('select count(*)::int as value from credit_ledger')===0&&await scalar('select count(*)::int as value from credit_purchases')===0);
  const ownB=await service.getCreatorEarnings();check('buyer cannot read creator earnings',ownB.earnings.pending===0&&ownB.earnings.sales.length===0);
  owner=a;const earnings=await service.getCreatorEarnings();check('pending separate USD gross fee net',earnings.earnings.pending===200&&earnings.earnings.available===0&&earnings.earnings.lifetime===200&&earnings.earnings.sales[0].gross===200&&earnings.earnings.sales[0].fee===0);
  check('creator DTO excludes buyer and provider identity',!JSON.stringify(earnings).includes(b)&&!JSON.stringify(earnings).includes(order.id)&&!JSON.stringify(earnings).includes(row.paypal_capture_id||'NOTAPPLICABLE'));
  const owned=await listings.getOwnedMarketplaceListing(input.id);check('owned listing small sale stats',owned.adoptionCount===1&&owned.paidSalesCount===1&&owned.creatorEarningsMinor===200);
  const meta={id:input.id,title:input.title,description:input.description,category:input.category,tags:input.tags,rightsConfirmed:true,status:'published',adoptionType:'paid',priceMinor:300};
  owner=b;check('buyer cannot alter creator price',!(await listings.updateMarketplaceListing(meta)).ok);
  owner=a;check('creator edits paid price',(await listings.updateMarketplaceListing(meta)).ok);
  owner=b;check('saved purchase immutable price',(await service.prepareMarketplaceCheckout({listingId:input.id})).amountMinor===200);
  owner=a;check('creator unpublishes paid listing',(await listings.updateMarketplaceListing({...meta,status:'unpublished'})).ok);
  owner=b;check('completed entitlement survives unpublish',(await service.recoverMarketplacePurchase({purchaseId:p.id})).projectId===adopted.projectId);
  owner=c;await rejects('new purchase denied after unpublish',()=>service.prepareMarketplaceCheckout({listingId:input.id}));
  owner=a;await listings.updateMarketplaceListing(meta);owner=c;
  lostCreate=true;const second=await service.prepareMarketplaceCheckout({listingId:input.id});
  await rejects('lost order create response persists purchase',()=>service.createMarketplaceOrder({purchaseId:second.id}));
  const earlyId=requestOrders.get(second.id);orders.get(earlyId).status='APPROVED';lostCapture=true;
  await service.handleVerifiedMarketplacePayPalEvent({event_type:'CHECKOUT.ORDER.APPROVED',resource:{id:earlyId}});
  check('early webhook attaches lost create and lost capture safely',(await service.recoverMarketplacePurchase({purchaseId:second.id})).projectId&&captures===2&&creates===2);
  for(const table of ['marketplace_purchases','marketplace_entitlements','creator_earnings_ledger']){
    for(const role of ['anon','authenticated'])await denied(role+' financial read denied','select * from '+table,[],role);
    await denied('service direct financial write denied','delete from '+table+' where false',[],'service_role');
    await rejects('admin cannot mutate history',()=>pg.query('delete from '+table));
  }
  await denied('browser cannot call fulfilment',"select marketplace_fulfil_purchase($1,$2,$3,200,'USD')",[p.id,order.id,'CAPTURE1234567890']);
  await denied('browser cannot redeem entitlement','select marketplace_redeem_purchase($1,$2)',[b,p.id]);
  await denied('browser cannot read earnings RPC','select marketplace_creator_earnings($1,1)',[a]);
  owner=a;await listings.updateMarketplaceListing({...meta,adoptionType:'free',priceMinor:0});owner=b;
  const free=await listings.adoptMarketplaceListing({listingId:input.id,requestId:randomUUID()});
  check('free adoption still bypasses PayPal',free.ok&&free.projectId!==adopted.projectId&&creates===2&&captures===2&&await scalar('select count(*)::int as value from creator_earnings_ledger')===2);

  owner=a;await listings.updateMarketplaceListing(meta);
  const d=await scalar("insert into app_users(clerk_user_id) values('pending_buyer') returning id as value");owner=d;
  const pending=await service.prepareMarketplaceCheckout({listingId:input.id});await service.createMarketplaceOrder({purchaseId:pending.id});
  const pendingRow=await one('select * from marketplace_purchases where id=$1',[pending.id]);const pendingOrder=orders.get(pendingRow.paypal_order_id);
  pendingOrder.status='CREATED';pendingOrder.purchase_units[0].payments={captures:[{id:'CAPTURE8888888888',status:'PENDING',final_capture:true,amount:pendingOrder.purchase_units[0].amount}]};
  const captureEvent={id:'WH-PENDING-PAID',event_type:'PAYMENT.CAPTURE.PENDING',resource:{id:'CAPTURE8888888888',supplementary_data:{related_ids:{order_id:pendingOrder.id}}}};
  const pendingDelivery=()=>route.POST(new Request('http://localhost/api/payments/paypal/webhook',{method:'POST',headers,body:JSON.stringify(captureEvent)}));
  check('verified pending capture grants nothing',(await pendingDelivery()).status===200&&(await service.recoverMarketplacePurchase({purchaseId:pending.id})).status==='pending'&&await scalar('select count(*)::int as value from creator_earnings_ledger')===2);
  captureEvent.event_type='PAYMENT.CAPTURE.COMPLETED';check('premature completed notification asks for redelivery',(await pendingDelivery()).status===503);
  captureEvent.event_type='PAYMENT.CAPTURE.DENIED';pendingOrder.purchase_units[0].payments.captures[0].status='DENIED';
  check('verified denied capture records failure without earnings',(await pendingDelivery()).status===200&&(await one('select status from marketplace_purchases where id=$1',[pending.id])).status==='failed'&&await scalar('select count(*)::int as value from creator_earnings_ledger')===2);
  const beforeFailed=creates;await rejects('failed purchase cannot create replacement charge',()=>service.createMarketplaceOrder({purchaseId:pending.id}));check('failed checkout has no new provider order',creates===beforeFailed);
  console.log(JSON.stringify({passed:count,sandboxHttpFixture:true,realSql:true}));
} finally {
  for(const name of names) { if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name]; }
  await pg.close();
}
