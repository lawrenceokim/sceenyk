-- Supersedes video-based free admission. Apply after 103 with old workers stopped.
begin;
do $$ begin
  if to_regprocedure('public.generation_free_access(uuid)') is null
    or to_regclass('public.generation_free_preparations') is null
    or to_regprocedure('public.ugc_v3_location_checkpoint(uuid,uuid,text,jsonb)') is null then
    raise exception 'Verify migrations 102/103 before 104.';
  end if;
  if exists(select 1 from pg_constraint where conrelid=to_regclass('public.generation_free_preparations')
    and contype='f' and confrelid=to_regclass('public.ugc_v3_tasks')) then raise exception 'Apply 103 before 104.'; end if;
end $$;

create table if not exists public.free_ai_project_policy (
  singleton boolean primary key default true check(singleton),
  max_cost_microusd bigint not null check(max_cost_microusd between 1 and 1000000000)
);
insert into public.free_ai_project_policy values(true,3000000) on conflict do nothing;
-- Deliberately empty: the operator must review worst-case input/output/model
-- costs before enabling an exact provider/model/kind/phase. Missing rates deny.
create table if not exists public.free_ai_operation_prices (
  kind text not null check(kind in ('character','product','location','storyboard','video')),
  phase text not null check(phase in ('default','plan','sheet')),
  provider text not null check(provider in ('openai','higgsfield')), model text not null check(length(model) between 1 and 200),
  max_cost_microusd bigint not null check(max_cost_microusd between 1 and 1000000000),
  primary key(kind,phase,provider,model)
);
create table if not exists public.free_ai_accounts (
  owner_user_id uuid primary key references public.generation_accounts(owner_user_id),
  total integer not null default 2 check(total=2), reserved integer not null default 0 check(reserved>=0),
  consumed integer not null default 0 check(consumed>=0), review_required boolean not null default false,
  check(reserved+consumed<=total)
);
create table if not exists public.free_ai_projects (
  project_id uuid primary key references public.ugc_v3_projects(project_id),
  owner_user_id uuid not null references public.free_ai_accounts(owner_user_id),
  state text not null check(state in ('reserved','consumed','released')),
  budget_microusd bigint not null check(budget_microusd>0),
  historical_review boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.free_ai_operations (
  task_id uuid not null, phase text not null check(phase in ('default','plan','sheet')),
  project_id uuid not null references public.free_ai_projects(project_id),
  kind text not null, provider text not null, model text not null,
  max_cost_microusd bigint not null check(max_cost_microusd>0),
  state text not null check(state in ('prepared','started','canceled')),
  lease_token uuid not null, created_at timestamptz not null default now(),
  primary key(task_id,phase)
);
create index if not exists free_ai_operations_project on public.free_ai_operations(project_id);

-- Preserve old counters/ledger verbatim. Snapshot a conservative historical
-- floor; map known spent projects once. Unknown deleted-task history needs review.
insert into public.free_ai_accounts(owner_user_id,consumed,review_required)
select a.owner_user_id,least(2,greatest(a.free_consumed+a.free_reserved,(
  select count(distinct v.project_id)::integer from public.ugc_v3_projects v where v.owner_user_id=a.owner_user_id and (
    exists(select 1 from public.ugc_v3_tasks t where t.project_id=v.project_id and t.provider_started and t.kind in ('character','product','location','storyboard','video'))
    or exists(select 1 from public.generation_free_runs r where r.project_id=v.project_id and r.state in ('reserved','consumed')))))),
  a.free_reserved>0 or exists(select 1 from public.generation_free_preparations p where p.owner_user_id=a.owner_user_id
    and not exists(select 1 from public.ugc_v3_tasks t where t.id=p.task_id))
from public.generation_accounts a on conflict do nothing;
insert into public.free_ai_projects(project_id,owner_user_id,state,budget_microusd,historical_review)
select v.project_id,v.owner_user_id,'consumed',p.max_cost_microusd,true
from public.ugc_v3_projects v cross join public.free_ai_project_policy p
where exists(select 1 from public.ugc_v3_tasks t where t.project_id=v.project_id and t.provider_started and t.kind in ('character','product','location','storyboard','video'))
  or exists(select 1 from public.generation_free_runs r where r.project_id=v.project_id and r.state in ('reserved','consumed'))
on conflict do nothing;

create or replace function public.free_ai_account(p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.free_ai_accounts(owner_user_id) select owner_user_id from public.generation_accounts where owner_user_id=p_owner on conflict do nothing;
  if not exists(select 1 from public.free_ai_accounts where owner_user_id=p_owner) then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
end $$;
create or replace function public.free_ai_reserve(p_project uuid) returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid; a public.free_ai_accounts; p public.free_ai_projects; cap bigint;
begin
  perform public.generation_free_project_limits(p_project);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=p_project;
  perform public.free_ai_account(owner_id);
  select * into a from public.free_ai_accounts where owner_user_id=owner_id for update;
  select * into p from public.free_ai_projects where project_id=p_project for update;
  if a.review_required or coalesce(p.historical_review,false) then raise exception 'FREE_PROJECT_HISTORY_REVIEW_REQUIRED'; end if;
  select max_cost_microusd into cap from public.free_ai_project_policy where singleton;
  if cap is null then raise exception 'FREE_PROJECT_PRICING_REQUIRED'; end if;
  if p.state in ('reserved','consumed') then return; end if;
  if a.total-a.reserved-a.consumed<1 then raise exception 'FREE_ALLOWANCE_EXHAUSTED'; end if;
  insert into public.free_ai_projects(project_id,owner_user_id,state,budget_microusd) values(p_project,owner_id,'reserved',cap)
    on conflict(project_id) do update set state='reserved';
  update public.free_ai_accounts set reserved=reserved+1 where owner_user_id=owner_id;
end $$;

create or replace function public.free_ai_request_cost(p_project uuid,p_kind text,p_phase text,p_model text) returns bigint language plpgsql security definer set search_path='' as $$
declare cost bigint; cap bigint; exposure bigint;
begin
  perform public.free_ai_reserve(p_project);
  select max_cost_microusd into cost from public.free_ai_operation_prices where kind=p_kind and phase=p_phase
    and provider=case when p_kind='video' then 'higgsfield' else 'openai' end and model=p_model;
  if cost is null then raise exception 'FREE_PROJECT_PRICING_REQUIRED'; end if;
  select least(c.max_cost_microusd,p.budget_microusd) into cap from public.free_ai_projects p cross join public.free_ai_project_policy c where p.project_id=p_project and c.singleton;
  select coalesce(sum(max_cost_microusd),0) into exposure from public.free_ai_operations where project_id=p_project and state<>'canceled';
  if cap is null or exposure+cost>cap then raise exception 'FREE_PROJECT_BUDGET_EXHAUSTED'; end if;
  return cost;
end $$;
create or replace function public.free_ai_prepare(p_task uuid,p_phase text) returns void language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; p public.free_ai_projects; op public.free_ai_operations; provider_id text; model_id text; cost bigint;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.id is null or t.status<>'running' or t.lease_token is null or t.lease_until<=now() or t.input->>'referenceCleanupHold'='true' then raise exception 'V3_LEASE_LOST'; end if;
  if t.kind not in ('character','product','location','storyboard','video')
    or t.kind='location' and p_phase not in ('plan','sheet') or t.kind<>'location' and p_phase<>'default' then raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED'; end if;
  perform public.free_ai_reserve(t.project_id);
  select * into p from public.free_ai_projects where project_id=t.project_id for update;
  select * into op from public.free_ai_operations where task_id=p_task and phase=p_phase;
  if op.task_id is not null then
    if op.state='prepared' and op.lease_token=t.lease_token then return; end if;
    raise exception 'PROVIDER_INTENT_ALREADY_EXISTS';
  end if;
  provider_id:=case when t.kind='video' then 'higgsfield' else 'openai' end;
  if t.kind='video' then
    select intent->>'model' into model_id from public.ugc_v3_runs where id=(t.input->>'runId')::uuid and project_id=t.project_id;
  else model_id:=case when t.kind='location' and p_phase='plan' then t.input->>'directorModel' else t.input->>'model' end; end if;
  cost:=public.free_ai_request_cost(t.project_id,t.kind,p_phase,model_id);
  if t.kind='video' and cost<(select (intent->>'estimatedCostMicrousd')::bigint from public.ugc_v3_runs where id=(t.input->>'runId')::uuid) then raise exception 'FREE_PROJECT_PRICING_REQUIRED'; end if;
  insert into public.free_ai_operations(task_id,phase,project_id,kind,provider,model,max_cost_microusd,state,lease_token)
    values(p_task,p_phase,t.project_id,t.kind,provider_id,model_id,cost,'prepared',t.lease_token);
end $$;

-- Second checkpoint immediately before HTTP. A lost acknowledgement cannot
-- authorize another POST: the same operation may transition to started once.
create or replace function public.free_ai_dispatch(p_task uuid,p_token uuid,p_phase text) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; p public.free_ai_projects; op public.free_ai_operations; cap bigint;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.id is null then raise exception 'V3_LEASE_LOST'; end if;
  perform public.free_ai_reserve(t.project_id);
  select * into p from public.free_ai_projects where project_id=t.project_id for update;
  select * into t from public.ugc_v3_tasks where id=p_task and lease_token=p_token and status='running' and lease_until>now() for update;
  if t.id is null or not t.provider_started then raise exception 'V3_LEASE_LOST'; end if;
  select * into op from public.free_ai_operations where task_id=p_task and phase=p_phase for update;
  if op.task_id is null or op.state<>'prepared' or op.lease_token<>p_token then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  if not exists(select 1 from public.free_ai_operation_prices where kind=op.kind and phase=op.phase and provider=op.provider and model=op.model and max_cost_microusd=op.max_cost_microusd) then raise exception 'FREE_PROJECT_PRICING_REQUIRED'; end if;
  select least(max_cost_microusd,p.budget_microusd) into cap from public.free_ai_project_policy where singleton;
  if (select sum(max_cost_microusd) from public.free_ai_operations where project_id=t.project_id and state<>'canceled')>cap then raise exception 'FREE_PROJECT_BUDGET_EXHAUSTED'; end if;
  update public.free_ai_operations set state='started' where task_id=p_task and phase=p_phase;
  if p.state='reserved' then
    update public.free_ai_accounts set reserved=reserved-1,consumed=consumed+1 where owner_user_id=p.owner_user_id and reserved>0;
    if not found then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
    update public.free_ai_projects set state='consumed' where project_id=t.project_id;
  end if;
  return true;
end $$;

create or replace function public.generation_free_preparation(p_task uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; owner_id uuid;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.id is null or t.kind not in ('character','product','location','storyboard') then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  perform public.free_ai_reserve(t.project_id);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=t.project_id;
  if exists(select 1 from public.generation_free_preparations where task_id=p_task) then return true; end if;
  if (select count(*) from public.generation_free_preparations where owner_user_id=owner_id and kind=t.kind)>=2 then raise exception 'FREE_PREPARATION_LIMIT'; end if;
  insert into public.generation_free_preparations(task_id,owner_user_id,kind) values(p_task,owner_id,t.kind);
  return true;
end $$;
-- Read-only proof for failure handling. No ledger/old historical evidence means
-- unknown, never permission to refund a possibly started request.
create or replace function public.free_ai_dispatch_status(p_task uuid,p_token uuid,p_phase text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare t public.ugc_v3_tasks; op public.free_ai_operations;
begin
  select * into t from public.ugc_v3_tasks where id=p_task and lease_token=p_token and status='running' and lease_until>now();
  if t.id is null or not exists(select 1 from public.free_ai_projects where project_id=t.project_id and not historical_review) then return null; end if;
  select * into op from public.free_ai_operations where task_id=p_task and phase=p_phase;
  if op.task_id is not null then return op.state='started'; end if;
  if not t.provider_started then return false; end if;
  return null;
end $$;
create or replace function public.generation_free_task_admit() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; phase_key text; model_id text;
begin
  if new.kind not in ('character','product','location','storyboard','video') then return new; end if;
  if tg_op='INSERT' then
    if new.provider_started then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
    perform public.free_ai_reserve(new.project_id);
    select owner_user_id into owner_id from public.ugc_v3_projects where project_id=new.project_id;
    if new.kind<>'video' and (select count(*) from public.generation_free_preparations where owner_user_id=owner_id and kind=new.kind)>=2 then raise exception 'FREE_PREPARATION_LIMIT'; end if;
    if new.kind='video' then select intent->>'model' into model_id from public.ugc_v3_runs where id=(new.input->>'runId')::uuid and project_id=new.project_id;
    else model_id:=case when new.kind='location' then new.input->>'directorModel' else new.input->>'model' end; end if;
    perform public.free_ai_request_cost(new.project_id,new.kind,case when new.kind='location' then 'plan' else 'default' end,model_id);
  else
    if new.kind='location' then
      phase_key:=new.output->'requests'->-1->>'key';
      if phase_key not in ('plan','sheet') or phase_key is null then raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED'; end if;
    else phase_key:='default'; end if;
    if new.kind<>'video' then perform public.generation_free_preparation(new.id); end if;
    perform public.free_ai_prepare(new.id,phase_key);
  end if;
  return new;
end $$;
-- Preserve frozen run/clip guards, but reserve the project rather than a video.
create or replace function public.generation_free_reserve(p_run uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.ugc_v3_runs; d jsonb;
begin
  select * into r from public.ugc_v3_runs where id=p_run;
  if r.id is null then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  select document into d from public.ugc_v3_packages where id=r.package_id;
  if r.intent->'body'->>'resolution' is distinct from '480p' or r.intent->'authorization'->>'resolution' is distinct from '480p'
    or (r.intent->'body'->>'duration')::numeric is distinct from 5 or d->'source'->'storyboardContent'->>'durationMs' is distinct from '5000'
    or jsonb_array_length(d->'segments') is distinct from 1 then raise exception 'GENERATION_LIMIT_5S_480P'; end if;
  perform public.free_ai_reserve(r.project_id); return true;
end $$;
-- Old run holds/counters are historical. Video results cannot refund/charge projects.
create or replace function public.generation_free_settle(p_run uuid,p_rejected boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin return; end $$;

create or replace function public.free_ai_release_unstarted() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.free_ai_projects;
begin
  if new.status not in ('failed','done') then return new; end if;
  select * into p from public.free_ai_projects where project_id=new.project_id;
  if p.project_id is null or p.historical_review then return new; end if;
  perform 1 from public.free_ai_accounts where owner_user_id=p.owner_user_id for update;
  select * into p from public.free_ai_projects where project_id=new.project_id for update;
  -- A terminal task with no dispatch can safely surrender its prepared budget.
  update public.free_ai_operations set state='canceled' where task_id=new.id and state='prepared';
  if p.state='reserved' and not exists(select 1 from public.free_ai_operations where project_id=p.project_id and state='started')
    and not exists(select 1 from public.ugc_v3_tasks where project_id=p.project_id and kind in ('character','product','location','storyboard','video') and status in ('queued','running','reconciliation_required')) then
    update public.free_ai_projects set state='released' where project_id=p.project_id;
    update public.free_ai_accounts set reserved=reserved-1 where owner_user_id=p.owner_user_id and reserved>0;
  end if;
  return new;
end $$;
drop trigger if exists z_free_ai_release on public.ugc_v3_tasks;
create trigger z_free_ai_release after update of status on public.ugc_v3_tasks for each row execute function public.free_ai_release_unstarted();

create or replace function public.generation_project_access(p_owner uuid,p_project uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.free_ai_accounts; p public.free_ai_projects; cap bigint; exposure bigint;
begin
  perform public.free_ai_account(p_owner);
  select * into a from public.free_ai_accounts where owner_user_id=p_owner;
  if p_project is not null and not exists(select 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner) then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
  select * into p from public.free_ai_projects where project_id=p_project;
  select least(max_cost_microusd,coalesce(p.budget_microusd,max_cost_microusd)) into cap from public.free_ai_project_policy where singleton;
  select coalesce(sum(max_cost_microusd),0) into exposure from public.free_ai_operations where project_id=p_project and state<>'canceled';
  return jsonb_build_object('total',a.total,'remaining',a.total-a.reserved-a.consumed,'reserved',a.reserved,'consumed',a.consumed,
    'projectAllowed',not a.review_required and not coalesce(p.historical_review,false) and (coalesce(p.state in ('reserved','consumed'),false) or a.total-a.reserved-a.consumed>0),
    'historyReview',a.review_required or coalesce(p.historical_review,false),'budgetMicrousd',cap,'budgetUsedMicrousd',exposure,
    'preparationRemaining',jsonb_build_object(
      'character',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='character')),
      'product',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='product')),
      'location',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='location')),
      'storyboard',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='storyboard'))));
end $$;
create or replace function public.generation_free_access(p_owner uuid) returns jsonb language sql security definer set search_path='' as $$
select public.generation_project_access(p_owner,null) $$;

create or replace function public.generation_free_transport(p_project uuid,p_run uuid,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks;
begin
  if not exists(select 1 from public.ugc_v3_runs where id=p_run and project_id=p_project and state='submitting' and intent->>'hash'=p_hash
    and intent->'body'->>'resolution'='480p' and (intent->'body'->>'duration')::numeric=5) then return false; end if;
  select * into t from public.ugc_v3_tasks where project_id=p_project and input->>'runId'=p_run::text
    and kind='video' and provider_started and status='running' and lease_until>now();
  if t.id is null then return false; end if;
  return public.free_ai_dispatch(t.id,t.lease_token,'default');
end $$;

create or replace function public.free_ai_history_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Free project history is immutable.'; end if;
  if tg_table_name='free_ai_operations' then
   if ((new.task_id,new.phase,new.project_id,new.kind,new.provider,new.model,new.max_cost_microusd,new.lease_token,new.created_at)
      is distinct from (old.task_id,old.phase,old.project_id,old.kind,old.provider,old.model,old.max_cost_microusd,old.lease_token,old.created_at)
    or old.state<>'prepared' and new is distinct from old) then raise exception 'Free project history is immutable.'; end if;
  elsif tg_table_name='free_ai_projects' then
   if ((new.project_id,new.owner_user_id,new.created_at,new.budget_microusd) is distinct from (old.project_id,old.owner_user_id,old.created_at,old.budget_microusd)
    or old.state='consumed' and new.state<>'consumed') then raise exception 'Free project history is immutable.'; end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['free_ai_projects','free_ai_operations'] loop
    execute format('drop trigger if exists free_ai_history on public.%I',t);
    execute format('create trigger free_ai_history before update or delete on public.%I for each row execute function public.free_ai_history_guard()',t);
  end loop;
  foreach t in array array['free_ai_project_policy','free_ai_operation_prices','free_ai_accounts','free_ai_projects','free_ai_operations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on table public.%I to service_role',t);
  end loop;
end $$;
revoke all on function public.free_ai_account(uuid),public.free_ai_reserve(uuid),public.free_ai_request_cost(uuid,text,text,text),public.free_ai_prepare(uuid,text),
  public.free_ai_dispatch(uuid,uuid,text),public.free_ai_dispatch_status(uuid,uuid,text),public.free_ai_release_unstarted(),public.free_ai_history_guard(),public.generation_project_access(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.free_ai_dispatch(uuid,uuid,text),public.free_ai_dispatch_status(uuid,uuid,text),public.generation_project_access(uuid,uuid) to service_role;
commit;
