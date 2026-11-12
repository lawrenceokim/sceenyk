// Disposable SQL accounting only; no real providers, payments or database.
// Creative lineage is synthetic; all financial triggers remain enabled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const pg = new PGlite();
const value = async (sql, args=[]) => (await pg.query(sql,args)).rows[0]?.v;
const rpc = async (name,args) => {
  await pg.exec('set role service_role');
  try {return await value(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) as v`,Object.values(args));}
  finally {await pg.exec('reset role');}
};
const user = () => value('insert into app_users(clerk_user_id) values($1) returning id as v',[randomUUID()]);
async function project(owner) {
  const id=randomUUID(); await rpc('ugc_v3_create_project',{p_owner:owner,p_project:id,p_fields:{title:'Offline funding',category:'product-ad',prompt:'Fixture',ugcType:'advertisement',settings:{duration:'5',aspectRatio:'9:16',visualStyle:'Realistic',tone:'Professional'}}});return id;
}
async function grant(owner,credits) {
  const p=await rpc('prepare_credit_purchase',{p_owner_user_id:owner,p_pack_id:randomUUID(),p_pack_name:'Fixture',p_amount_minor:2000,p_currency:'USD',p_credits:credits});
  const order='ORDER'+randomUUID().replaceAll('-','').slice(0,20).toUpperCase();
  await rpc('attach_paypal_order',{p_purchase_id:p.id,p_owner_user_id:owner,p_order_id:order});
  const a={p_owner_user_id:owner,p_order_id:order,p_capture_id:'CAP'+randomUUID().replaceAll('-','').slice(0,20).toUpperCase(),p_amount_minor:2000,p_currency:'USD'};
  await rpc('fulfil_paypal_purchase',a);await rpc('fulfil_paypal_purchase',a);
}
const access=(owner,id)=>rpc('generation_project_access',{p_owner:owner,p_project:id});
const wallet=owner=>value('select jsonb_build_array(credit_available,credit_reserved) as v from generation_accounts where owner_user_id=$1',[owner]);
const queue=(id,kind,input)=>value('insert into ugc_v3_tasks(project_id,kind,request_key,input) values($1,$2,$3,$4) returning id as v',[id,kind,randomUUID(),input]);
async function run(owner,id,{priced=true,cost=1030000,duration=5,resolution='480p'}={}) {
  const rid=randomUUID(),pid=randomUUID();
  if(priced)await rpc('generation_paid_quote',{p_owner:owner,p_project:id,p_run:rid,p_model:'bytedance/seedance-2.5/reference-to-video',p_body_hash:'a'.repeat(64),p_response_hash:'b'.repeat(64),p_cost:cost});
  await pg.exec('begin; set local session_replication_role=replica');
  try {
    const version=await value('select coalesce(max(version),0)+1 as v from ugc_v3_packages where project_id=$1',[id]);
    await pg.query('insert into ugc_v3_packages(id,project_id,source_revision,version,document,package_hash) values($1,$2,1,$3,$4,$5)',[pid,id,version,{source:{storyboardContent:{durationMs:duration*1000}},segments:[{}]},randomUUID().replaceAll('-','').repeat(2)]);
    await pg.query('insert into ugc_v3_runs(id,project_id,package_id,segment_uuid,segment_key,authorization_id,intent,state) values($1,$2,$3,$4,$5,$6,$7,\'queued\')',[rid,id,pid,randomUUID(),randomUUID(),randomUUID(),{model:'bytedance/seedance-2.5/reference-to-video',hash:'c'.repeat(64),bodyHash:'a'.repeat(64),estimatedCostMicrousd:1028335,authorization:{resolution,maxEstimatedCostMicrousd:1030000},body:{duration,resolution}}]);
    await pg.exec('set local session_replication_role=origin');
    await value('select public.generation_free_reserve($1) as v',[rid]);await pg.exec('commit');return rid;
  }catch(e){await pg.exec('rollback');throw e;}
}
async function submit(id,rid) {
  const task=await queue(id,'video',{runId:rid}),token=randomUUID();
  await pg.query("update ugc_v3_tasks set status='running',lease_token=$2,lease_until=now()+interval '5 minutes' where id=$1",[task,token]);
  await pg.query('update ugc_v3_tasks set provider_started=true where id=$1',[task]);
  await pg.query("update ugc_v3_runs set state='submitting' where id=$1",[rid]);
  assert.equal(await rpc('generation_free_transport',{p_project:id,p_run:rid,p_hash:'c'.repeat(64)}),true);
  await assert.rejects(()=>rpc('generation_free_transport',{p_project:id,p_run:rid,p_hash:'c'.repeat(64)}));
  return {task,token};
}
const observe=(rid,status)=>pg.query('update ugc_v3_runs set observation=$2 where id=$1',[rid,{requestId:randomUUID(),status}]);
try {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls');
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  // Preserve financial triggers while removing synthetic-fixture-only creative guards.
  for(const table of ['ugc_v3_tasks','ugc_v3_runs'])for(const row of (await pg.query(`select tgname from pg_trigger where tgrelid='public.${table}'::regclass and not tgisinternal`)).rows){
    if(!['z_generation_free_admit','z_generation_free_task','z_generation_paid_settle','z_generation_paid_task_release','z_generation_openai_settle','z_free_ai_release'].includes(row.tgname)
      && !row.tgname.startsWith('z_generation_free_'))await pg.exec(`alter table ${table} disable trigger "${row.tgname}"`);
  }
  await pg.exec('alter table ugc_v3_runs enable always trigger z_generation_free_admit');
  await pg.exec('update generation_paid_policy set user_cap_microusd=10300000,global_cap_microusd=103000000');
  const owner=await user(),id=await project(owner);await grant(owner,1000);await access(owner,id);
  await pg.query('update free_ai_accounts set consumed=1,review_required=true where owner_user_id=$1',[owner]);
  await pg.query("insert into free_ai_projects(project_id,owner_user_id,state,budget_microusd,historical_review) values($1,$2,'consumed',1030000,true)",[id,owner]);
  const history=await value('select to_jsonb(a) as v from free_ai_accounts a where owner_user_id=$1',[owner]);
  const assignment=await value('select to_jsonb(p) as v from free_ai_projects p where project_id=$1',[id]);
  let a=await access(owner,id);assert.equal(a.policyVersion,114);assert.equal(a.projectReviewRequired,true);assert.equal(a.funding,'credits');assert.equal(a.videoAllowed,true);assert.equal(a.requiredCredits,103);
  await assert.rejects(()=>run(owner,id,{priced:false}),/PAID_PROVIDER_PRICE_REQUIRED/);
  await assert.rejects(()=>run(owner,id,{cost:1030001}),/PAID_PROVIDER_PRICE_CHANGED/);
  await assert.rejects(()=>run(owner,id,{duration:10}),/GENERATION_LIMIT_5S_480P/);
  const first=await run(owner,id,{cost:900000});assert.deepEqual(await wallet(owner),[897,103]);
  await rpc('generation_free_submit',{p_owner:owner,p_project:id,p_run:first});assert.deepEqual(await wallet(owner),[897,103]);
  const started=await submit(id,first);
  await observe(first,'processing');assert.deepEqual(await wallet(owner),[897,103]);
  assert.equal(await rpc('free_ai_dispatch_status',{p_task:started.task,p_token:started.token,p_phase:'default'}),true);
  await observe(first,'completed');await observe(first,'completed');assert.deepEqual(await wallet(owner),[897,0]);
  const second=await run(owner,id);await submit(id,second);await observe(second,'failed');await observe(second,'failed');assert.deepEqual(await wallet(owner),[897,0]);
  const third=await run(owner,id);await submit(id,third);await observe(third,'completed');assert.deepEqual(await wallet(owner),[794,0]);
  assert.deepEqual(await value('select to_jsonb(a) as v from free_ai_accounts a where owner_user_id=$1',[owner]),history);
  assert.deepEqual(await value('select to_jsonb(p) as v from free_ai_projects p where project_id=$1',[id]),assignment);
  assert.equal(await value('select count(*)::int as v from generation_paid_projects where project_id=$1',[id]),0);
  assert.equal(await value('select count(*)::int as v from free_ai_review_resolutions where project_id=$1',[id]),0);
  // New accounts retain exactly two free project assignments; video usage
  // switches only the next attempt to credits, without changing OpenAI funding.
  const fresh=await user();await grant(fresh,500);
  for(let i=0;i<2;i++){
    const p=await project(fresh);assert.equal((await access(fresh,p)).funding,'free');
    const r=await run(fresh,p,{priced:false});await submit(p,r);await observe(r,'completed');
    assert.equal((await access(fresh,p)).funding,'credits');
    assert.equal((await access(fresh,p)).preparationFunding,'free');
    const paid=await run(fresh,p);await submit(p,paid);await observe(paid,'completed');
    assert.equal((await access(fresh,p)).preparationFunding,'free');
  }
  const p3=await project(fresh);assert.equal((await access(fresh,p3)).funding,'credits');assert.equal((await access(fresh,p3)).remaining,0);assert.equal((await access(fresh,p3)).consumed,2);
  const poor=await user(),poorProject=await project(poor);await access(poor,poorProject);
  await pg.query('update free_ai_accounts set consumed=2 where owner_user_id=$1',[poor]);
  assert.equal((await access(poor,poorProject)).paidBlocker,'INSUFFICIENT_CREDITS');
  await assert.rejects(()=>run(poor,poorProject),/INSUFFICIENT_CREDITS/);
  await assert.rejects(()=>access(poor,id),/FRESH_V3_PROJECT_REQUIRED/);
  await assert.rejects(()=>rpc('generation_free_submit',{p_owner:poor,p_project:id,p_run:third}),/FREE_RESERVATION_REQUIRED/);
  await pg.exec('update generation_paid_policy set global_cap_microusd=0');
  assert.equal((await access(owner,id)).paidBlocker,'HIGGSFIELD_GLOBAL_SPENDING_LIMIT');await assert.rejects(()=>run(owner,id),/HIGGSFIELD_GLOBAL_SPENDING_LIMIT/);
  await pg.exec('update generation_paid_policy set global_cap_microusd=103000000,user_cap_microusd=0');
  assert.equal((await access(owner,id)).paidBlocker,'HIGGSFIELD_USER_SPENDING_LIMIT');await assert.rejects(()=>run(owner,id),/HIGGSFIELD_USER_SPENDING_LIMIT/);
  const protectedBefore=await value("select jsonb_agg(to_jsonb(l) order by id) as v from credit_ledger l");
  const lockBefore=await value("select pg_get_functiondef('public.ugc_v3_creative_lock_guard()'::regprocedure) as v");
  await pg.exec(fs.readFileSync('supabase/migrations/20261112011400_video_attempt_funding.sql','utf8'));
  assert.deepEqual(await value('select jsonb_agg(to_jsonb(l) order by id) as v from credit_ledger l'),protectedBefore);
  assert.equal(await value("select pg_get_functiondef('public.ugc_v3_creative_lock_guard()'::regprocedure) as v"),lockBefore);
  assert.equal(await value(`select count(*)::int as v from generation_accounts a where a.credit_available<>(select coalesce(sum(available_delta),0) from credit_ledger where owner_user_id=a.owner_user_id) or a.credit_reserved<>(select coalesce(sum(reserved_delta),0) from credit_ledger where owner_user_id=a.owner_user_id)`),0);
  for(const role of ['anon','authenticated','service_role']){
    await pg.exec('set role '+role);try{await assert.rejects(()=>value('select public.generation_free_reserve($1) as v',[third]),/permission denied/);}finally{await pg.exec('reset role');}
  }
  console.log('PASS: 114 migration/rerun, two free projects, paid continuation/repeat/refund, historical preservation, lower provider prices, wallet/ledger, unknown hold, dispatch replay, ownership and finite caps. Zero real network calls.');
}catch(error){console.error(error.message,error.code??'',error.where??'');process.exitCode=1;}finally{await pg.close();}
