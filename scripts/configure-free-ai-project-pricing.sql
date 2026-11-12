-- Manual 105 policy audit/configuration. No provider request or user-history edit.
-- $0.206/s * 5s = $1.03/project; 2 lifetime free projects = $2.06 maximum
-- new Higgsfield reservations/account. OpenAI costs are platform-funded.
-- Apply migration 105 after 104 with old workers stopped before running this.
-- Section A is read-only. Section B is an optional administrator transaction.

-- A. Read-only configuration/history audit; never invokes mutable access RPCs.
select singleton,max_cost_microusd from public.free_ai_project_policy;
select kind,phase,provider,model,max_cost_microusd
from public.free_ai_operation_prices
where provider='higgsfield' order by kind,phase,model;
select provider,state,count(*) as operations,sum(max_cost_microusd) as recorded_microusd
from public.free_ai_operations group by provider,state order by provider,state;
-- Old OpenAI amounts above are historical metadata, NOT Higgsfield exposure.
-- Old prepared video prices may need safe failure/reconciliation under 105;
-- never reprice started operations or issue a replacement provider POST here.

-- B. Optional manual/idempotent configuration. Migration 105 already does this.
begin;
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.free_ai_operations')
    and conname='free_ai_operations_funding_check') then
    raise exception 'Apply 105 before Higgsfield-only configuration.';
  end if;
  -- Keep intentionally lower budgets; do not raise a project/account allowance.
  insert into public.free_ai_project_policy(singleton,max_cost_microusd) values(true,1030000)
    on conflict(singleton) do update set max_cost_microusd=least(public.free_ai_project_policy.max_cost_microusd,excluded.max_cost_microusd);
  insert into public.free_ai_operation_prices(kind,phase,provider,model,max_cost_microusd)
    values('video','default','higgsfield','bytedance/seedance-2.5/reference-to-video',1030000)
    on conflict(kind,phase,provider,model) do update set max_cost_microusd=excluded.max_cost_microusd;
end $$;
select singleton,max_cost_microusd from public.free_ai_project_policy;
commit;
-- Existing project caps/usage, operations, free-account counters, historical
-- OpenAI prices, paid purchases/fees/credit ledgers and approved media are untouched.
-- 103 generation credits = $1.03; purchase fees/1% commission never apply here.
