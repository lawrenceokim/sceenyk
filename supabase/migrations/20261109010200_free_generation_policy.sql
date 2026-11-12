-- Stage 2. No balance/free reset, historical backfill or paid-credit debit.
begin;
do $$
declare r record;
begin
  for r in select * from (values
    ('generation_accounts','owner_user_id'),('generation_accounts','free_total'),('generation_accounts','free_reserved'),('generation_accounts','free_consumed'),('generation_accounts','updated_at'),
    ('projects','id'),('projects','duration'),('projects','video_resolution'),('projects','deleted_at'),
    ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
    ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','input'),('ugc_v3_tasks','status'),('ugc_v3_tasks','lease_until'),
    ('ugc_v3_runs','id'),('ugc_v3_runs','project_id'),('ugc_v3_runs','intent'),('ugc_v3_runs','state'),('ugc_v3_runs','result'),('ugc_v3_runs','observation'),('ugc_v3_runs','package_id'),('ugc_v3_runs','error_code'),
    ('ugc_v3_packages','id'),('ugc_v3_packages','document'),
    ('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','document'),
    ('generation_jobs','id'),('ugc_generation_jobs','id'),('ugc_final_operations','kind')) as required(t,c)
  loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.t and column_name=r.c)
      then raise exception 'Verify Stage 2 prerequisite %.% before migration 102.',r.t,r.c; end if;
  end loop;
end $$;

create table if not exists public.generation_free_runs (
  run_id uuid primary key references public.ugc_v3_runs(id) on delete restrict,
  owner_user_id uuid not null references public.generation_accounts(owner_user_id) on delete restrict,
  project_id uuid not null references public.ugc_v3_projects(project_id) on delete restrict,
  state text not null default 'reserved' check(state in ('reserved','consumed','released')),
  provider_completed boolean not null default false,
  created_at timestamptz not null default now(), settled_at timestamptz,
  check((state='reserved' and settled_at is null) or (state<>'reserved' and settled_at is not null))
);
create table if not exists public.generation_free_preparations (
  task_id uuid primary key references public.ugc_v3_tasks(id) on delete restrict,
  owner_user_id uuid not null references public.generation_accounts(owner_user_id) on delete restrict,
  kind text not null check(kind in ('character','product','location','storyboard')),
  created_at timestamptz not null default now()
);
create index if not exists generation_free_preparations_owner_kind on public.generation_free_preparations(owner_user_id,kind);

create or replace function public.generation_free_history_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or tg_table_name='generation_free_preparations' then raise exception 'Free history is immutable.'; end if;
  if (new.run_id,new.owner_user_id,new.project_id,new.created_at) is distinct from (old.run_id,old.owner_user_id,old.project_id,old.created_at)
    or old.state<>'reserved' and new is distinct from old or old.provider_completed and not new.provider_completed then
    raise exception 'Free history is immutable.';
  end if;
  return new;
end $$;
drop trigger if exists generation_free_run_history on public.generation_free_runs;
create trigger generation_free_run_history before update or delete on public.generation_free_runs for each row execute function public.generation_free_history_guard();
drop trigger if exists generation_free_preparation_history on public.generation_free_preparations;
create trigger generation_free_preparation_history before update or delete on public.generation_free_preparations for each row execute function public.generation_free_history_guard();

create or replace function public.generation_free_project_limits(p_project uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.projects where id=p_project and deleted_at is null and duration='5' and video_resolution='480p') then
    raise exception 'GENERATION_LIMIT_5S_480P';
  end if;
end $$;

create or replace function public.generation_free_reserve(p_run uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.ugc_v3_runs; owner_id uuid; a public.generation_accounts; d jsonb;
begin
  select * into r from public.ugc_v3_runs where id=p_run;
  if r.id is null then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=r.project_id;
  -- Account first for every financial transition, shared with legacy reservations.
  select * into a from public.generation_accounts where owner_user_id=owner_id for update;
  if a.owner_user_id is null then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  if exists(select 1 from public.generation_free_runs where run_id=p_run and state='reserved') then return true; end if;
  if exists(select 1 from public.generation_free_runs where run_id=p_run) then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  select document into d from public.ugc_v3_packages where id=r.package_id;
  if r.state<>'queued' or r.result is not null or r.observation is not null
    or exists(select 1 from public.ugc_v3_tasks where project_id=r.project_id and input->>'runId'=p_run::text and provider_started)
    then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  -- Check the whole package as well as the exact immutable provider request.
  if r.intent->'body'->>'resolution' is distinct from '480p' or r.intent->'authorization'->>'resolution' is distinct from '480p'
    or (r.intent->'body'->>'duration')::numeric is distinct from 5
    or d->'source'->'storyboardContent'->>'durationMs' is distinct from '5000'
    or jsonb_array_length(d->'segments') is distinct from 1 then raise exception 'GENERATION_LIMIT_5S_480P'; end if;
  if a.free_total-a.free_reserved-a.free_consumed<1 then raise exception 'FREE_ALLOWANCE_EXHAUSTED'; end if;
  insert into public.generation_free_runs(run_id,owner_user_id,project_id) values(p_run,owner_id,r.project_id);
  update public.generation_accounts set free_reserved=free_reserved+1,updated_at=now() where owner_user_id=owner_id;
  return true;
end $$;

create or replace function public.generation_free_run_admit() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.generation_free_reserve(new.id); return new; end $$;
drop trigger if exists z_generation_free_admit on public.ugc_v3_runs;
create trigger z_generation_free_admit after insert on public.ugc_v3_runs for each row execute function public.generation_free_run_admit();

create or replace function public.generation_free_preparation(p_task uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; owner_id uuid; a public.generation_accounts;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.id is null or t.kind not in ('character','product','location','storyboard') then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  perform public.generation_free_project_limits(t.project_id);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=t.project_id;
  select * into a from public.generation_accounts where owner_user_id=owner_id for update;
  if a.owner_user_id is null then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  if a.free_total-a.free_reserved-a.free_consumed<1 and not exists(select 1 from public.generation_free_runs
    where owner_user_id=owner_id and project_id=t.project_id and state='reserved') then raise exception 'FREE_ALLOWANCE_EXHAUSTED'; end if;
  if exists(select 1 from public.generation_free_preparations where task_id=p_task) then return true; end if;
  if (select count(*) from public.generation_free_preparations where owner_user_id=owner_id and kind=t.kind)>=2 then raise exception 'FREE_PREPARATION_LIMIT'; end if;
  insert into public.generation_free_preparations(task_id,owner_user_id,kind) values(p_task,owner_id,t.kind);
  return true;
end $$;
create or replace function public.generation_free_task_admit() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; a public.generation_accounts;
begin
  if new.kind in ('character','product','location','storyboard') then
    if tg_op='INSERT' then
      perform public.generation_free_project_limits(new.project_id);
      select owner_user_id into owner_id from public.ugc_v3_projects where project_id=new.project_id;
      select * into a from public.generation_accounts where owner_user_id=owner_id for update;
      if a.owner_user_id is null then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
      if a.free_total-a.free_reserved-a.free_consumed<1 then raise exception 'FREE_ALLOWANCE_EXHAUSTED'; end if;
      if (select count(*) from public.generation_free_preparations where owner_user_id=owner_id and kind=new.kind)>=2 then raise exception 'FREE_PREPARATION_LIMIT'; end if;
      -- Queueing/retiring an unstarted task costs no preparation attempt. The
      -- provider-intent transaction below atomically reserves the actual slot.
    else perform public.generation_free_preparation(new.id); end if;
  elsif new.kind='video' and new.provider_started and not old.provider_started then
    if not exists(select 1 from public.generation_free_runs where run_id=(new.input->>'runId')::uuid and state='reserved') then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  end if;
  return new;
end $$;
drop trigger if exists z_generation_free_task_insert on public.ugc_v3_tasks;
create trigger z_generation_free_task_insert after insert on public.ugc_v3_tasks for each row execute function public.generation_free_task_admit();
drop trigger if exists z_generation_free_task_submit on public.ugc_v3_tasks;
create trigger z_generation_free_task_submit before update of provider_started on public.ugc_v3_tasks for each row when(new.provider_started) execute function public.generation_free_task_admit();

create or replace function public.generation_free_settle(p_run uuid,p_rejected boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare h public.generation_free_runs; r public.ugc_v3_runs; consumed boolean; released boolean;
begin
  select * into h from public.generation_free_runs where run_id=p_run;
  if h.run_id is null then return; end if; -- Historical runs never charged/backfilled.
  perform 1 from public.generation_accounts where owner_user_id=h.owner_user_id for update;
  select * into h from public.generation_free_runs where run_id=p_run for update;
  if h.state<>'reserved' then return; end if;
  select * into r from public.ugc_v3_runs where id=p_run;
  if r.observation->>'status'='completed' and not h.provider_completed then
    update public.generation_free_runs set provider_completed=true where run_id=p_run; h.provider_completed:=true;
  end if;
  consumed:=r.result is not null and r.state in ('awaiting_review','approved');
  released:=r.state='failed' and r.result is null and ((not h.provider_completed and (
    r.observation->>'status' in ('failed','nsfw','canceled') or p_rejected or not exists(
      select 1 from public.ugc_v3_tasks where project_id=r.project_id and input->>'runId'=p_run::text and provider_started)))
    or (p_rejected and r.error_code='V3_VIDEO_TECHNICAL_VALIDATION_FAILED'));
  if consumed or released then
    update public.generation_accounts set free_reserved=free_reserved-1,free_consumed=free_consumed+case when consumed then 1 else 0 end,updated_at=now()
      where owner_user_id=h.owner_user_id and free_reserved>0;
    if not found then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
    update public.generation_free_runs set state=case when consumed then 'consumed' else 'released' end,settled_at=now() where run_id=p_run;
  end if;
end $$;
create or replace function public.generation_free_result_settle() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.generation_free_settle(new.id); return new; end $$;
drop trigger if exists z_generation_free_settle on public.ugc_v3_runs;
create trigger z_generation_free_settle after update of state,result,observation on public.ugc_v3_runs for each row execute function public.generation_free_result_settle();
create or replace function public.generation_free_rejection_settle() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.kind='failed' and (new.document->>'outcome'='rejected' or new.document->>'outcome'='unusable' and new.document->>'code'='V3_VIDEO_TECHNICAL_VALIDATION_FAILED') then
    perform public.generation_free_settle((input->>'runId')::uuid,true) from public.ugc_v3_tasks where id=new.entity_id and kind='video';
  end if;
  return new;
end $$;
drop trigger if exists z_generation_free_rejection on public.ugc_v3_runtime_events;
create trigger z_generation_free_rejection after insert on public.ugc_v3_runtime_events for each row execute function public.generation_free_rejection_settle();

create or replace function public.generation_free_submit(p_owner uuid,p_project uuid,p_run uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.ugc_v3_projects p join public.ugc_v3_runs r on r.project_id=p.project_id
    where p.owner_user_id=p_owner and p.project_id=p_project and r.id=p_run) then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  return public.generation_free_reserve(p_run);
end $$;
create or replace function public.generation_free_access(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('total',free_total,'remaining',free_total-free_reserved-free_consumed,'reserved',free_reserved,'consumed',free_consumed,
    'preparationRemaining',jsonb_build_object(
      'character',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='character')),
      'product',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='product')),
      'location',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='location')),
      'storyboard',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='storyboard'))))
  from public.generation_accounts where owner_user_id=p_owner
$$;
create or replace function public.generation_free_transport(p_project uuid,p_run uuid,p_hash text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ugc_v3_runs r join public.generation_free_runs h on h.run_id=r.id
    where r.id=p_run and r.project_id=p_project and h.state='reserved' and r.state='submitting'
      and r.intent->>'hash'=p_hash and r.intent->'body'->>'resolution'='480p' and (r.intent->'body'->>'duration')::numeric=5
      and exists(select 1 from public.ugc_v3_tasks t where t.project_id=p_project and t.input->>'runId'=r.id::text and t.provider_started and t.status='running' and t.lease_until>now()))
$$;

-- Close unsupported admissions; existing result reads/known recovery/local merges remain.
create or replace function public.generation_block_legacy() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='ugc_final_operations' and to_jsonb(new)->>'kind'='composition' then return new; end if;
  raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED';
end $$;
do $$ declare t text;
begin
  foreach t in array array['generation_jobs','ugc_generation_jobs','ugc_final_operations'] loop
    execute format('drop trigger if exists z_generation_free_legacy on public.%I',t);
    execute format('create trigger z_generation_free_legacy before insert on public.%I for each row execute function public.generation_block_legacy()',t);
  end loop;
  foreach t in array array['generation_free_runs','generation_free_preparations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on table public.%I to service_role',t);
  end loop;
end $$;
revoke all on function public.generation_free_history_guard(),public.generation_free_project_limits(uuid),public.generation_free_reserve(uuid),
  public.generation_free_run_admit(),public.generation_free_preparation(uuid),public.generation_free_task_admit(),public.generation_free_settle(uuid,boolean),
  public.generation_free_result_settle(),public.generation_free_rejection_settle(),public.generation_block_legacy(),
  public.generation_free_submit(uuid,uuid,uuid),public.generation_free_access(uuid),public.generation_free_transport(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.generation_free_submit(uuid,uuid,uuid),public.generation_free_access(uuid),public.generation_free_transport(uuid,uuid,text) to service_role;
commit;
