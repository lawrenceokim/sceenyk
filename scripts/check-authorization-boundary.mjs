// Real Route Handler/guard and creator DTO/service/action modules; request,
// database transport and provider are explicit fixtures. No hosted mutations.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {typescriptLoader} from './lib/load-typescript.mjs';

let checks = 0, reads = 0, role = 'admin', unavailable = false, session = true;
const check = (name, value) => { assert.ok(value, name); checks++; };
const user = {id: randomUUID(), clerk_user_id: 'fixture-user'};
const signal = new Error('NEXT_REQUEST_CONTROL_FLOW');
const navigation = {unstable_rethrow(error) { if (error === signal) throw error; }};
const db = {from(table) {
  assert.equal(table, 'internal_user_roles');
  return {select(fields) {assert.equal(fields, 'user_id,role');return this;}, eq(key,id) {assert.equal(key,'user_id');assert.equal(id,user.id);return this;}, async maybeSingle() {
    reads++;
    return unavailable ? {data:null,error:{message:'private-database-diagnostic'}} : {data:role ? {user_id:user.id,role} : null,error:null};
  }};
}};
const load = typescriptLoader({
  'next/navigation': navigation,
  '@/lib/auth/ensure-app-user': {ensureAppUser: async () => {if (!session) throw signal;return user;}},
  // Relative identity import is used by the real guard.
  './ensure-app-user': {ensureAppUser: async () => {if (!session) throw signal;return user;}},
  '@/lib/db/server': {createDatabaseClient: () => db},
}, {Response});
const route = load('app/api/internal/authorization/route.ts');
check('status endpoint has no mutation handler', Object.keys(route).join() === 'GET');
for (const value of ['admin','support']) {
  role = value;
  const response = await route.GET();
  check(value + ' permitted with no identity/role disclosure', response.status === 200 && await response.text() === '{"authorized":true}');
  check(value + ' response private/no-store', response.headers.get('cache-control') === 'private, no-store');
}
for (const value of ['user',null]) {
  role = value;
  const response = await route.GET();
  check('ordinary/missing role denied', response.status === 403 && await response.text() === '{"code":"ACCESS_DENIED"}');
  check('denial uncached', response.headers.get('cache-control') === 'private, no-store');
}
role = 'admin'; await route.GET(); role = 'user';
check('revocation takes effect on next request', (await route.GET()).status === 403);
role = 'admin'; unavailable = true;
const failed = await route.GET();
check('lookup outage fails closed without diagnostics', failed.status === 503 && await failed.text() === '{"code":"UNAVAILABLE"}');
unavailable = false; session = false; const before = reads;
await assert.rejects(() => route.GET(), e => e === signal); checks++;
check('anonymous framework denial preserved before role read', reads === before);
session = true;
const injected = await route.GET(new Request('https://fixture.invalid/api/internal/authorization?role=admin', {headers:{'x-role':'admin'}}));
check('caller claims cannot bypass lookup failure/authority', injected.status === 200 && reads === before + 1);
role = 'user';
check('caller claims cannot elevate ordinary user', (await route.GET(new Request('https://fixture.invalid/?role=admin'))).status === 403);

const mapper = load('lib/marketplace/withdrawals/creator-account.ts').creatorWithdrawalAccount;
const messages = load('lib/marketplace/withdrawals/contract.ts').withdrawalFailureMessages;
const entry = {id:randomUUID(),requested:500,amount:500,status:'failed',requestedAt:'2026-10-15T00:00:00Z',holdUntil:'2026-10-22T00:00:00Z',paidAt:null,failureCode:'REFUND_BELOW_MINIMUM',reviewRequired:false};
const raw = {currency:'USD',email:'creator@example.test',available:500,deficit:0,pending:0,paid:0,total:1,history:[entry]};
for (const [code, expected] of [['REFUND_BELOW_MINIMUM',messages[0]],['INSUFFICIENT_FUNDS',messages[1]],['PAYPAL_FAILED',messages[1]],['arbitrary-private-provider-diagnostic',messages[1]],[null,messages[1]]]) {
  const result = mapper({...raw,history:[{...entry,failureCode:code,provider_status:'PRIVATE_PROVIDER_STATE',paypal_batch_id:'PRIVATE_BATCH',destination_snapshot:'private@example.test',raw_payload:{secret:'private'}}]});
  check('safe failure message whitelist', result.history[0].failureMessage === expected);
  check('internal codes/references/payload stripped', !/failureCode|failure_code|PRIVATE_|raw_payload|destination_snapshot|private@example/.test(JSON.stringify(result)));
}
for (const status of ['pending','eligible','processing','paid']) {
  const result = mapper({...raw,history:[{...entry,status,failureCode:'PRIVATE_DIAGNOSTIC'}]});
  check(status + ' retains financial state with no failure diagnostic', result.history[0].status === status && result.history[0].failureMessage === null && !JSON.stringify(result).includes('PRIVATE'));
}
let providerCalls = 0;
const serviceLoad = typescriptLoader({
  'next/navigation': navigation,
  'next/cache': {revalidatePath(){}},
  '@/lib/auth/ensure-app-user': {ensureAppUser:async () => user},
  '@/lib/db/server': {createDatabaseClient: () => ({rpc:async (name,args) => {assert.equal(name,'creator_payout_account');assert.equal(args.p_creator,user.id);return {data:raw,error:null};}})},
  './paypal': {submitPayout:() => {providerCalls++;throw new Error('FORBIDDEN_PAYOUT_POST');}},
});
const service = serviceLoad('lib/marketplace/withdrawals/server.ts');
const initial = await service.getWithdrawalAccount();
const action = await serviceLoad('app/actions/creator-withdrawals.ts').withdrawalAccountAction();
check('initial server-rendered DTO strips raw failure code', !JSON.stringify(initial).includes('failureCode') && initial.account.history[0].failureMessage === messages[0]);
check('creator action response strips raw failure code', action.ok && !JSON.stringify(action).includes('failureCode') && action.data.account.history[0].failureMessage === messages[0]);
check('creator reads never invoke payout provider', providerCalls === 0);
console.log(JSON.stringify({passed:checks,scope:'actual authorization route/guard and creator service/action privacy; request/DB fixtures'}));
