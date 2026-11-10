-- Stage 3. Apply after 105 with old app/workers stopped. No historical debits.
begin;
do $$ declare t text; c text; begin
  if to_regprocedure('public.free_ai_dispatch(uuid,uuid,text)') is null
    or not exists(select 1 from pg_constraint where conrelid=to_regclass('public.free_ai_operations') and conname='free_ai_operations_funding_check') then
    raise exception 'Apply 105 before 106.';
  end if;
  for t,c in select * from (values
    ('generation_accounts','owner_user_id'),('generation_accounts','credit_available'),('generation_accounts','credit_reserved'),('generation_accounts','updated_at'),
    ('credit_ledger','owner_user_id'),('credit_ledger','amount'),('credit_ledger','type'),('credit_ledger','direction'),('credit_ledger','available_delta'),('credit_ledger','reserved_delta'),('credit_ledger','reason'),
    ('credit_ledger','purchase_id'),('credit_ledger','job_id'),('credit_ledger','paypal_order_id'),('credit_ledger','paypal_capture_id'),('credit_ledger','reference_key'),
    ('free_ai_accounts','owner_user_id'),('free_ai_accounts','total'),('free_ai_accounts','reserved'),('free_ai_accounts','consumed'),('free_ai_accounts','review_required'),
    ('free_ai_projects','project_id'),('free_ai_projects','state'),('free_ai_projects','historical_review'),
    ('free_ai_operations','lease_token'),('generation_free_preparations','task_id'),('generation_free_preparations','owner_user_id'),('generation_free_preparations','kind'),
    ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),('ugc_v3_packages','id'),('ugc_v3_packages','document'),
    ('ugc_v3_runs','id'),('ugc_v3_runs','project_id'),('ugc_v3_runs','state'),('ugc_v3_runs','package_id'),('ugc_v3_runs','intent'),('ugc_v3_runs','observation'),('ugc_v3_runs','result'),
    ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','status'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','lease_until'),
    ('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','provider_started'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','document')) required(t,c)
  loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then
      raise exception 'Verify 106 prerequisite %.%.',t,c;
    end if;
  end loop;
end $$;

-- USD exposure caps are lifetime, independently funded by the operator. Sandbox
-- purchases cannot increase them. Zero defaults deliberately disable paid work.
create table if not exists public.generation_paid_policy (
  singleton boolean primary key default true check(singleton),
  user_cap_microusd bigint not null default 0 check(user_cap_microusd between 0 and 9007199254740991),
  global_cap_microusd bigint not null default 0 check(global_cap_microusd between 0 and 9007199254740991)
);
insert into public.generation_paid_policy(singleton) values(true) on conflict do nothing;
create table if not exists public.generation_paid_user_caps (
  owner_user_id uuid primary key references public.generation_accounts(owner_user_id),
  cap_microusd bigint not null check(cap_microusd between 0 and 9007199254740991)
);
create table if not exists public.generation_paid_projects (
  project_id uuid primary key references public.ugc_v3_projects(project_id),
  owner_user_id uuid not null references public.generation_accounts(owner_user_id),
  created_at timestamptz not null default now()
);
-- Server-obtained authenticated /estimate evidence. No provider request is
-- submitted by this RPC. Five-minute freshness; exact body/model/owner binding.
create table if not exists public.generation_paid_quotes (
  run_id uuid primary key, project_id uuid not null references public.ugc_v3_projects(project_id),
  owner_user_id uuid not null references public.generation_accounts(owner_user_id),
  body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
  response_hash text not null check(response_hash ~ '^[a-f0-9]{64}$'),
  cost_microusd bigint not null check(cost_microusd between 1020001 and 1030000),
  verified_at timestamptz not null default now()
);
create table if not exists public.generation_paid_reservations (
  run_id uuid primary key references public.ugc_v3_runs(id),
  owner_user_id uuid not null references public.generation_accounts(owner_user_id),
  project_id uuid not null references public.generation_paid_projects(project_id),
  credits bigint not null default 103 check(credits=103),
  exposure_microusd bigint not null default 1030000 check(exposure_microusd=1030000),
  state text not null default 'reserved' check(state in ('reserved','consumed','released')),
  task_id uuid, lease_token uuid, dispatched_at timestamptz,
  created_at timestamptz not null default now(), settled_at timestamptz,
  unique(run_id,owner_user_id),
  check((state='reserved' and settled_at is null) or (state<>'reserved' and settled_at is not null))
);
create index if not exists generation_paid_reservations_owner on public.generation_paid_reservations(owner_user_id,state);
create table if not exists public.generation_paid_preparations (
  task_id uuid not null, phase text not null check(phase in ('default','plan','sheet')),
  project_id uuid not null references public.generation_paid_projects(project_id),
  lease_token uuid not null, state text not null check(state in ('prepared','started','canceled')),
  created_at timestamptz not null default now(), primary key(task_id,phase)
);

-- Extend the SAME immutable purchase/generation ledger, retaining the original
-- movement rules for old rows and its original FK/uniqueness protections.
alter table public.credit_ledger add column if not exists v3_run_id uuid;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.credit_ledger'::regclass and conname='credit_ledger_v3_fk') then
    alter table public.credit_ledger add constraint credit_ledger_v3_fk foreign key(v3_run_id,owner_user_id)
      references public.generation_paid_reservations(run_id,owner_user_id);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.credit_ledger'::regclass and conname='credit_ledger_v3_type_unique') then
    alter table public.credit_ledger add constraint credit_ledger_v3_type_unique unique(v3_run_id,type);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.credit_ledger'::regclass and conname='credit_ledger_stage3_movement') then
    alter table public.credit_ledger rename constraint credit_ledger_movement_check to credit_ledger_stage2_movement;
    -- A CHECK evaluating NULL is accepted. Use explicit false for a V3 row in
    -- the old predicate; the Stage 3 constraint below exclusively validates it.
    alter table public.credit_ledger drop constraint credit_ledger_stage2_movement;
    alter table public.credit_ledger add constraint credit_ledger_stage3_movement check (
      (v3_run_id is null and (
        (type='purchase' and direction='credit' and job_id is null and purchase_id is not null
          and paypal_order_id is not null and paypal_capture_id is not null and reason='purchase'
          and available_delta=amount and reserved_delta=0
          and reference_key='paypal:sandbox:'||paypal_order_id||':'||paypal_capture_id)
        or (job_id is not null and purchase_id is null and paypal_order_id is null and paypal_capture_id is null
          and reference_key=job_id::text||':'||type and (
            (type='reservation' and direction='hold' and available_delta=-amount and reserved_delta=amount and reason='generation_admission')
            or(type='consumption' and direction='debit' and available_delta=0 and reserved_delta=-amount and reason='stored_result_verified')
            or(type='release' and direction='restore' and available_delta=amount and reserved_delta=-amount and reason='generation_failed')))))
      or (v3_run_id is not null and job_id is null and purchase_id is null and paypal_order_id is null and paypal_capture_id is null
        and amount=103 and reference_key='v3:'||v3_run_id::text||':'||type and (
          (type='reservation' and direction='hold' and available_delta=-amount and reserved_delta=amount and reason='higgsfield_admission')
          or(type='consumption' and direction='debit' and available_delta=0 and reserved_delta=-amount and reason='higgsfield_completed')
          or(type='release' and direction='restore' and available_delta=amount and reserved_delta=-amount and reason='higgsfield_not_billed')))
    );
  end if;
end $$;

-- Keep the verified Stage 2 functions as private delegates. Only copy once:
-- rerunning 106 must never copy a wrapper into its own delegate.
do $$ declare n text; signature text; definition text; begin
  for n,signature in select * from (values
    ('free_ai_reserve','uuid'),('free_ai_request_cost','uuid,text,text,text'),('free_ai_prepare','uuid,text'),
    ('free_ai_dispatch','uuid,uuid,text'),('free_ai_dispatch_status','uuid,uuid,text'),
    ('generation_free_reserve','uuid'),('generation_project_access','uuid,uuid')) f(n,s)
  loop
    if to_regprocedure('public.stage2_'||n||'('||signature||')') is null then
      definition:=pg_get_functiondef(to_regprocedure('public.'||n||'('||signature||')'));
      execute regexp_replace(definition,'FUNCTION public\.'||n||'\(', 'FUNCTION public.stage2_'||n||'(');
    end if;
    execute format('revoke all on function public.stage2_%I(%s) from public,anon,authenticated,service_role',n,signature);
  end loop;
end $$;

create or replace function public.generation_paid_capacity(p_owner uuid,p_extra bigint) returns void language plpgsql security definer set search_path='' as $$
declare policy public.generation_paid_policy; user_cap bigint; used_global numeric; used_user numeric;
begin
  select * into policy from public.generation_paid_policy where singleton for update;
  select coalesce((select cap_microusd from public.generation_paid_user_caps where owner_user_id=p_owner),policy.user_cap_microusd) into user_cap;
  select coalesce(sum(exposure_microusd),0),coalesce(sum(exposure_microusd) filter(where owner_user_id=p_owner),0)
    into used_global,used_user from public.generation_paid_reservations where state<>'released';
  if policy.singleton is null or used_global+p_extra>policy.global_cap_microusd then raise exception 'HIGGSFIELD_GLOBAL_SPENDING_LIMIT'; end if;
  if used_user+p_extra>user_cap then raise exception 'HIGGSFIELD_USER_SPENDING_LIMIT'; end if;
end $$;

create or replace function public.free_ai_reserve(p_project uuid) returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid; a public.free_ai_accounts;
begin
  perform public.generation_free_project_limits(p_project);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=p_project;
  perform public.free_ai_account(owner_id);
  select * into a from public.free_ai_accounts where owner_user_id=owner_id for update;
  if a.review_required or exists(select 1 from public.free_ai_projects where project_id=p_project and historical_review) then raise exception 'FREE_PROJECT_HISTORY_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.generation_paid_projects where project_id=p_project) then return; end if;
  if exists(select 1 from public.free_ai_projects where project_id=p_project and state in ('reserved','consumed')) or a.total-a.reserved-a.consumed>0 then
    perform public.stage2_free_ai_reserve(p_project); return;
  end if;
  perform public.generation_paid_capacity(owner_id,1030000);
  perform 1 from public.generation_accounts where owner_user_id=owner_id and credit_available>=103 for update;
  if not found then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into public.generation_paid_projects(project_id,owner_user_id) values(p_project,owner_id) on conflict do nothing;
end $$;

create or replace function public.generation_paid_quote(p_owner uuid,p_project uuid,p_run uuid,p_model text,p_body_hash text,p_response_hash text,p_cost bigint) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner)
    or p_model is distinct from 'bytedance/seedance-2.5/reference-to-video' or p_cost is null or p_cost not between 1020001 and 1030000 then raise exception 'PAID_PROVIDER_PRICE_CHANGED'; end if;
  perform public.generation_free_project_limits(p_project);
  if exists(select 1 from public.generation_paid_reservations where run_id=p_run and (state<>'reserved' or dispatched_at is not null)) then raise exception 'PROVIDER_INTENT_ALREADY_EXISTS'; end if;
  if exists(select 1 from public.ugc_v3_runs where id=p_run and (project_id<>p_project or intent->>'bodyHash'<>p_body_hash)) then raise exception 'V3_PAID_INTENT_BINDING_INVALID'; end if;
  if exists(select 1 from public.generation_paid_quotes where run_id=p_run and (project_id<>p_project or owner_user_id<>p_owner)) then raise exception 'V3_PAID_INTENT_BINDING_INVALID'; end if;
  insert into public.generation_paid_quotes(run_id,project_id,owner_user_id,body_hash,response_hash,cost_microusd)
    values(p_run,p_project,p_owner,p_body_hash,p_response_hash,p_cost)
    on conflict(run_id) do update set body_hash=excluded.body_hash,response_hash=excluded.response_hash,cost_microusd=excluded.cost_microusd,verified_at=now();
  return true;
end $$;

create or replace function public.generation_free_reserve(p_run uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.ugc_v3_runs; owner_id uuid; d jsonb;
begin
  select * into r from public.ugc_v3_runs where id=p_run;
  if r.id is null then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  perform public.free_ai_reserve(r.project_id);
  if not exists(select 1 from public.generation_paid_projects where project_id=r.project_id) then return public.stage2_generation_free_reserve(p_run); end if;
  select document into d from public.ugc_v3_packages where id=r.package_id;
  if r.intent->'body'->>'resolution' is distinct from '480p' or r.intent->'authorization'->>'resolution' is distinct from '480p'
    or (r.intent->'body'->>'duration')::numeric is distinct from 5 or d->'source'->'storyboardContent'->>'durationMs' is distinct from '5000'
    or jsonb_array_length(d->'segments') is distinct from 1 or r.intent->>'model' is distinct from 'bytedance/seedance-2.5/reference-to-video'
    then raise exception 'GENERATION_LIMIT_5S_480P'; end if;
  select owner_user_id into owner_id from public.generation_paid_projects where project_id=r.project_id;
  -- Global lock serializes all paid admissions, including competing owners.
  perform 1 from public.generation_paid_policy where singleton for update;
  perform 1 from public.generation_accounts where owner_user_id=owner_id for update;
  if exists(select 1 from public.generation_paid_reservations where run_id=p_run and state='reserved') then return true; end if;
  if exists(select 1 from public.generation_paid_reservations where run_id=p_run) then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  if r.state<>'queued' or r.observation is not null or r.result is not null then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  if not exists(select 1 from public.generation_paid_quotes where run_id=p_run and owner_user_id=owner_id and project_id=r.project_id
    and body_hash=r.intent->>'bodyHash' and verified_at>now()-interval '5 minutes') then raise exception 'PAID_PROVIDER_PRICE_REQUIRED'; end if;
  perform public.generation_paid_capacity(owner_id,1030000);
  update public.generation_accounts set credit_available=credit_available-103,credit_reserved=credit_reserved+103,updated_at=now()
    where owner_user_id=owner_id and credit_available>=103;
  if not found then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into public.generation_paid_reservations(run_id,owner_user_id,project_id) values(p_run,owner_id,r.project_id);
  insert into public.credit_ledger(owner_user_id,v3_run_id,amount,type,direction,available_delta,reserved_delta,reason,reference_key)
    values(owner_id,p_run,103,'reservation','hold',-103,103,'higgsfield_admission','v3:'||p_run::text||':reservation');
  return true;
end $$;

create or replace function public.free_ai_request_cost(p_project uuid,p_kind text,p_phase text,p_model text) returns bigint language plpgsql security definer set search_path='' as $$
begin
  perform public.free_ai_reserve(p_project);
  if not exists(select 1 from public.generation_paid_projects where project_id=p_project) then return public.stage2_free_ai_request_cost(p_project,p_kind,p_phase,p_model); end if;
  if p_kind='video' and p_phase='default' and p_model='bytedance/seedance-2.5/reference-to-video' then return 1030000; end if;
  if p_kind in ('character','product','location','storyboard') and coalesce(p_model,'')<>'' and
    (p_kind='location' and p_phase in ('plan','sheet') or p_kind<>'location' and p_phase='default') then return 0; end if;
  raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED';
end $$;

create or replace function public.free_ai_prepare(p_task uuid,p_phase text) returns void language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; h public.generation_paid_reservations;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if not exists(select 1 from public.generation_paid_projects where project_id=t.project_id) then perform public.stage2_free_ai_prepare(p_task,p_phase); return; end if;
  perform public.free_ai_reserve(t.project_id);
  if t.status<>'running' or t.lease_token is null or t.lease_until<=now() or t.input->>'referenceCleanupHold'='true' then raise exception 'V3_LEASE_LOST'; end if;
  if t.kind='video' then
    select * into h from public.generation_paid_reservations where run_id=(t.input->>'runId')::uuid and project_id=t.project_id for update;
    if h.run_id is null or h.state<>'reserved' or h.dispatched_at is not null or p_phase<>'default'
      or h.task_id is not null and (h.task_id,h.lease_token) is distinct from (t.id,t.lease_token) then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
    update public.generation_paid_reservations set task_id=t.id,lease_token=t.lease_token where run_id=h.run_id;
  else
    perform public.free_ai_request_cost(t.project_id,t.kind,p_phase,case when t.kind='location' and p_phase='plan' then t.input->>'directorModel' else t.input->>'model' end);
    if exists(select 1 from public.generation_paid_preparations where task_id=p_task and phase=p_phase) then raise exception 'PROVIDER_INTENT_ALREADY_EXISTS'; end if;
    insert into public.generation_paid_preparations(task_id,phase,project_id,lease_token,state) values(t.id,p_phase,t.project_id,t.lease_token,'prepared');
  end if;
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

create or replace function public.free_ai_dispatch(p_task uuid,p_token uuid,p_phase text) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; h public.generation_paid_reservations; r public.ugc_v3_runs;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if not exists(select 1 from public.generation_paid_projects where project_id=t.project_id) then return public.stage2_free_ai_dispatch(p_task,p_token,p_phase); end if;
  perform public.free_ai_reserve(t.project_id);
  select * into t from public.ugc_v3_tasks where id=p_task and status='running' and lease_token=p_token and lease_until>now() for update;
  if t.id is null or not t.provider_started then raise exception 'V3_LEASE_LOST'; end if;
  if t.kind='video' then
    perform public.generation_paid_capacity((select owner_user_id from public.generation_paid_projects where project_id=t.project_id),0);
    select * into h from public.generation_paid_reservations where run_id=(t.input->>'runId')::uuid and project_id=t.project_id for update;
    if h.state is distinct from 'reserved' or h.dispatched_at is not null or h.task_id is distinct from p_task or h.lease_token is distinct from p_token then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
    select * into r from public.ugc_v3_runs where id=h.run_id;
    if not exists(select 1 from public.generation_paid_quotes where run_id=r.id and body_hash=r.intent->>'bodyHash' and verified_at>now()-interval '5 minutes') then raise exception 'PAID_PROVIDER_PRICE_REQUIRED'; end if;
    update public.generation_paid_reservations set dispatched_at=now() where run_id=h.run_id;
  else
    update public.generation_paid_preparations set state='started' where task_id=p_task and phase=p_phase and lease_token=p_token and state='prepared';
    if not found then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  end if;
  return true;
end $$;

create or replace function public.free_ai_dispatch_status(p_task uuid,p_token uuid,p_phase text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare t public.ugc_v3_tasks; result boolean;
begin
  select * into t from public.ugc_v3_tasks where id=p_task and status='running' and lease_token=p_token and lease_until>now();
  if t.id is null then return null; end if;
  if not exists(select 1 from public.generation_paid_projects where project_id=t.project_id) then return public.stage2_free_ai_dispatch_status(p_task,p_token,p_phase); end if;
  if t.kind='video' then
    select dispatched_at is not null into result from public.generation_paid_reservations where run_id=(t.input->>'runId')::uuid;
  else select state='started' into result from public.generation_paid_preparations where task_id=t.id and phase=p_phase; end if;
  if result is null and not t.provider_started then return false; end if;
  return result;
end $$;

create or replace function public.generation_paid_settle(p_run uuid,p_rejected boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare h public.generation_paid_reservations; r public.ugc_v3_runs; outcome text;
begin
  select * into h from public.generation_paid_reservations where run_id=p_run;
  if h.run_id is null then return; end if;
  perform 1 from public.generation_paid_policy where singleton for update;
  perform 1 from public.generation_accounts where owner_user_id=h.owner_user_id for update;
  select * into h from public.generation_paid_reservations where run_id=p_run for update;
  if h.state<>'reserved' then return; end if;
  select * into r from public.ugc_v3_runs where id=p_run;
  if r.observation->>'status'='completed' then outcome:='consumed';
  elsif r.observation->>'status' in ('failed','nsfw','canceled') or p_rejected and r.observation is null
    or h.dispatched_at is null and r.state='failed' then outcome:='released';
  else return; end if;
  update public.generation_accounts set credit_reserved=credit_reserved-h.credits,
    credit_available=credit_available+case when outcome='released' then h.credits else 0 end,updated_at=now()
    where owner_user_id=h.owner_user_id and credit_reserved>=h.credits;
  if not found then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  update public.generation_paid_reservations set state=outcome,settled_at=now() where run_id=p_run;
  insert into public.credit_ledger(owner_user_id,v3_run_id,amount,type,direction,available_delta,reserved_delta,reason,reference_key)
    values(h.owner_user_id,p_run,h.credits,case when outcome='consumed' then 'consumption' else 'release' end,
      case when outcome='consumed' then 'debit' else 'restore' end,case when outcome='released' then h.credits else 0 end,-h.credits,
      case when outcome='consumed' then 'higgsfield_completed' else 'higgsfield_not_billed' end,
      'v3:'||p_run::text||':'||case when outcome='consumed' then 'consumption' else 'release' end);
end $$;

create or replace function public.generation_paid_result_settle() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.generation_paid_settle(new.id); return new; end $$;
drop trigger if exists z_generation_paid_settle on public.ugc_v3_runs;
create trigger z_generation_paid_settle after update of state,result,observation on public.ugc_v3_runs for each row execute function public.generation_paid_result_settle();
create or replace function public.generation_paid_rejection_settle() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.kind='failed' and new.document->>'outcome'='rejected' then
    perform public.generation_paid_settle((input->>'runId')::uuid,true) from public.ugc_v3_tasks where id=new.entity_id and kind='video';
  end if;
  return new;
end $$;
drop trigger if exists z_generation_paid_rejection on public.ugc_v3_runtime_events;
create trigger z_generation_paid_rejection after insert on public.ugc_v3_runtime_events for each row execute function public.generation_paid_rejection_settle();

-- Terminal work with a proven absence of dispatch can release its hold even
-- when failure occurred before the run checkpoint (claim/preflight failures).
create or replace function public.generation_paid_task_release() returns trigger language plpgsql security definer set search_path='' as $$
declare h public.generation_paid_reservations;
begin
  if new.status not in ('failed','done') then return new; end if;
  update public.generation_paid_preparations set state='canceled' where task_id=new.id and state='prepared';
  if new.kind='video' then
    select * into h from public.generation_paid_reservations where run_id=(new.input->>'runId')::uuid;
    if h.state='reserved' and h.dispatched_at is null then perform public.generation_paid_settle(h.run_id,true); end if;
  end if;
  return new;
end $$;
drop trigger if exists z_generation_paid_task_release on public.ugc_v3_tasks;
create trigger z_generation_paid_task_release after update of status on public.ugc_v3_tasks for each row execute function public.generation_paid_task_release();

create or replace function public.generation_paid_history_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or tg_table_name='generation_paid_projects' then raise exception 'Paid generation history is immutable.'; end if;
  if tg_table_name='generation_paid_reservations' then
    if (new.run_id,new.owner_user_id,new.project_id,new.credits,new.exposure_microusd,new.created_at)
      is distinct from (old.run_id,old.owner_user_id,old.project_id,old.credits,old.exposure_microusd,old.created_at)
      or old.state<>'reserved' and new is distinct from old
      or old.task_id is not null and (new.task_id,new.lease_token) is distinct from (old.task_id,old.lease_token)
      or old.dispatched_at is not null and new.dispatched_at is distinct from old.dispatched_at then raise exception 'Paid generation history is immutable.'; end if;
  else
    if (new.task_id,new.phase,new.project_id,new.lease_token,new.created_at) is distinct from (old.task_id,old.phase,old.project_id,old.lease_token,old.created_at)
      or old.state<>'prepared' and new is distinct from old then raise exception 'Paid generation history is immutable.'; end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['generation_paid_projects','generation_paid_reservations','generation_paid_preparations'] loop
    execute format('drop trigger if exists generation_paid_history on public.%I',t);
    execute format('create trigger generation_paid_history before update or delete on public.%I for each row execute function public.generation_paid_history_guard()',t);
  end loop;
  foreach t in array array['generation_paid_policy','generation_paid_user_caps','generation_paid_projects','generation_paid_quotes','generation_paid_reservations','generation_paid_preparations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on table public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.generation_project_access(p_owner uuid,p_project uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; paid boolean; free_project boolean; available bigint; held bigint; user_left bigint; global_left bigint; blocker text;
begin
  base:=public.stage2_generation_project_access(p_owner,p_project);
  select credit_available,credit_reserved into available,held from public.generation_accounts where owner_user_id=p_owner;
  select coalesce((select cap_microusd from public.generation_paid_user_caps where owner_user_id=p_owner),user_cap_microusd)
    -(select coalesce(sum(exposure_microusd),0) from public.generation_paid_reservations where owner_user_id=p_owner and state<>'released'),
    global_cap_microusd-(select coalesce(sum(exposure_microusd),0) from public.generation_paid_reservations where state<>'released')
    into user_left,global_left from public.generation_paid_policy where singleton;
  free_project:=exists(select 1 from public.free_ai_projects where project_id=p_project and state in ('reserved','consumed'));
  paid:=exists(select 1 from public.generation_paid_projects where project_id=p_project) or not free_project and (base->>'remaining')::int=0;
  if paid then
    blocker:=case when (base->>'historyReview')::boolean then 'FREE_PROJECT_HISTORY_REVIEW_REQUIRED'
      when coalesce(global_left,0)<1030000 then 'HIGGSFIELD_GLOBAL_SPENDING_LIMIT'
      when coalesce(user_left,0)<1030000 then 'HIGGSFIELD_USER_SPENDING_LIMIT'
      when available<103 then 'INSUFFICIENT_CREDITS' else null end;
    -- Already funded OpenAI work remains platform-funded even during a hold.
    base:=base||jsonb_build_object('projectAllowed',not (base->>'historyReview')::boolean and
      (exists(select 1 from public.generation_paid_projects where project_id=p_project) or blocker is null), 'videoAllowed',blocker is null);
  end if;
  return base||jsonb_build_object('funding',case when paid then 'credits' else 'free' end,'requiredCredits',case when paid then 103 else 0 end,
    'availableCredits',available,'reservedCredits',held,'shortageCredits',case when paid then greatest(0,103-available) else 0 end,
    'paidBlocker',blocker,'paidUserRemainingMicrousd',greatest(0,coalesce(user_left,0)),'paidGlobalRemainingMicrousd',greatest(0,coalesce(global_left,0)));
end $$;

revoke all on function public.generation_paid_capacity(uuid,bigint),public.generation_paid_settle(uuid,boolean),public.generation_paid_result_settle(),
  public.generation_paid_rejection_settle(),public.generation_paid_task_release(),public.generation_paid_history_guard(),public.generation_paid_quote(uuid,uuid,uuid,text,text,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.generation_paid_quote(uuid,uuid,uuid,text,text,text,bigint) to service_role;
-- Replaced Stage 2 functions preserve their existing private/RPC ACLs.
commit;
