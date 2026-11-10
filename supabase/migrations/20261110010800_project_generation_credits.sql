-- After 107, with old writers/workers stopped. Forward accounting only.
begin;
do $$ declare t text; c text; begin
  if to_regprocedure('public.generation_project_review_required(uuid,boolean)') is null
    or to_regprocedure('public.stage2_free_ai_dispatch(uuid,uuid,text)') is null then
    raise exception 'Apply 107 before 108.';
  end if;
  for t,c in select * from (values
    ('credit_ledger','v3_run_id'),('credit_ledger','reference_key'),
    ('generation_paid_preparations','task_id'),('generation_paid_preparations','phase'),('generation_paid_preparations','state'),
    ('generation_accounts','credit_available'),('generation_accounts','credit_reserved'),
    ('free_ai_projects','historical_review'),('free_ai_projects','state'),('free_ai_projects','owner_user_id'),
    ('free_ai_accounts','consumed'),('free_ai_accounts','reserved'),('free_ai_accounts','review_required'),
    ('generation_free_runs','project_id'),('generation_free_runs','state'),
    ('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','output'),
    ('ugc_v3_artifacts','kind'),('ugc_v3_runs','observation')) required(t,c)
  loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then
      raise exception 'Verify 108 prerequisite %.%.',t,c;
    end if;
  end loop;
end $$;

-- Keep the old movement CHECK verbatim for purchase/job/video rows. A separate
-- namespace validates each new OpenAI task/phase; historical rows stay unchanged.
create table if not exists public.generation_openai_reservations (
  task_id uuid not null, phase text not null check(phase in ('default','plan','sheet')),
  owner_user_id uuid not null references public.generation_accounts(owner_user_id),
  project_id uuid not null references public.generation_paid_projects(project_id),
  lease_token uuid not null, state text not null default 'reserved' check(state in ('reserved','consumed','released')),
  dispatched_at timestamptz, created_at timestamptz not null default now(), settled_at timestamptz,
  primary key(task_id,phase), unique(task_id,phase,owner_user_id),
  check((state='reserved' and settled_at is null) or (state<>'reserved' and settled_at is not null))
);
alter table public.credit_ledger add column if not exists openai_task_id uuid;
alter table public.credit_ledger add column if not exists openai_phase text;
do $$ declare old_check text; begin
  if not exists(select 1 from pg_constraint where conrelid='public.credit_ledger'::regclass and conname='credit_ledger_openai_movement') then
    select pg_get_expr(conbin,conrelid) into old_check from pg_constraint
      where conrelid='public.credit_ledger'::regclass and conname='credit_ledger_stage3_movement';
    if old_check is null then raise exception 'Verify existing ledger movement CHECK before 108.'; end if;
    alter table public.credit_ledger drop constraint credit_ledger_stage3_movement;
    execute 'alter table public.credit_ledger add constraint credit_ledger_openai_movement check (
      (openai_task_id is null and openai_phase is null and ('||old_check||')) or
      (openai_task_id is not null and openai_phase is not null and v3_run_id is null and job_id is null and purchase_id is null
        and paypal_order_id is null and paypal_capture_id is null and amount=1
        and reference_key=''openai:''||openai_task_id::text||'':''||openai_phase||'':''||type and (
          (type=''reservation'' and direction=''hold'' and available_delta=-1 and reserved_delta=1 and reason=''openai_admission'') or
          (type=''consumption'' and direction=''debit'' and available_delta=0 and reserved_delta=-1 and reason=''openai_completed'') or
          (type=''release'' and direction=''restore'' and available_delta=1 and reserved_delta=-1 and reason=''openai_not_billed''))))';
    alter table public.credit_ledger add constraint credit_ledger_openai_fk foreign key(openai_task_id,openai_phase,owner_user_id)
      references public.generation_openai_reservations(task_id,phase,owner_user_id);
    alter table public.credit_ledger add constraint credit_ledger_openai_unique unique(openai_task_id,openai_phase,type);
  end if;
end $$;

-- Record why a blanket 104 hold is safe to bypass. Never clear its original
-- flag, change counters, invent a provider cost, or touch approved media.
create table if not exists public.free_ai_review_resolutions (
  project_id uuid primary key references public.free_ai_projects(project_id),
  evidence jsonb not null, created_at timestamptz not null default now()
);
insert into public.free_ai_review_resolutions(project_id,evidence)
select p.project_id,jsonb_build_object('reason','known_consumed_project','consumed',a.consumed,
  'videoHistory',exists(select 1 from public.ugc_v3_tasks t where t.project_id=p.project_id and t.kind='video' and t.provider_started)
    or exists(select 1 from public.ugc_v3_runs v where v.project_id=p.project_id and (v.state<>'queued' or v.observation is not null or v.result is not null))
    or exists(select 1 from public.generation_free_runs v where v.project_id=p.project_id and v.state in ('reserved','consumed')),
  'operationIds',(select coalesce(jsonb_agg(jsonb_build_array(o.task_id,o.phase)),'[]'::jsonb) from public.free_ai_operations o where o.project_id=p.project_id and o.state='started'),
  'taskIds',(select coalesce(jsonb_agg(t.id),'[]'::jsonb) from public.ugc_v3_tasks t
    where t.project_id=p.project_id and t.provider_started and t.kind in ('character','product','location','storyboard','video')),
  'runIds',(select coalesce(jsonb_agg(r.run_id),'[]'::jsonb) from public.generation_free_runs r where r.project_id=p.project_id and r.state in ('reserved','consumed')))
from public.free_ai_projects p join public.free_ai_accounts a on a.owner_user_id=p.owner_user_id
where p.historical_review and p.state='consumed'
  and not exists(select 1 from public.generation_paid_projects where project_id=p.project_id)
  and (select count(*) from public.free_ai_projects q where q.owner_user_id=p.owner_user_id and q.state='consumed')<=a.consumed
  and (exists(select 1 from public.free_ai_operations o where o.project_id=p.project_id and o.state='started')
    or exists(select 1 from public.ugc_v3_tasks t where t.project_id=p.project_id and t.provider_started and t.kind in ('character','product','location','storyboard','video'))
    or exists(select 1 from public.generation_free_runs r where r.project_id=p.project_id and r.state in ('reserved','consumed')))
on conflict do nothing;

-- Reconciled assignment does not prove old video spending was absent. Snapshot
-- that uncertainty separately; unlimited OpenAI does not mint another video.
create or replace function public.generation_free_historical_video_used(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.free_ai_review_resolutions where project_id=p_project and evidence->>'videoHistory'='true')
$$;

create or replace function public.generation_project_review_required(p_project uuid,p_account_review boolean) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.free_ai_projects p where p.project_id=p_project and p.historical_review
      and not exists(select 1 from public.free_ai_review_resolutions r where r.project_id=p.project_id))
    or (not exists(select 1 from public.free_ai_projects where project_id=p_project)
      and not exists(select 1 from public.generation_paid_projects where project_id=p_project)
      and (exists(select 1 from public.ugc_v3_artifacts where project_id=p_project and kind in ('character','product','location','storyboard'))
        or exists(select 1 from public.ugc_v3_tasks where project_id=p_project and provider_started and kind in ('character','product','location','storyboard','video'))
        or exists(select 1 from public.ugc_v3_runs where project_id=p_project and (state<>'queued' or observation is not null or result is not null))))
$$;

create or replace function public.free_ai_reserve(p_project uuid) returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid; a public.free_ai_accounts; p public.free_ai_projects; cap bigint;
begin
  perform public.generation_free_project_limits(p_project);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=p_project;
  perform public.free_ai_account(owner_id);
  select * into a from public.free_ai_accounts where owner_user_id=owner_id for update;
  select * into p from public.free_ai_projects where project_id=p_project for update;
  if public.generation_project_review_required(p_project,a.review_required) then raise exception 'FREE_PROJECT_HISTORY_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.generation_paid_projects where project_id=p_project) then return; end if;
  if p.state in ('reserved','consumed') then return; end if;
  if not a.review_required and a.total-a.reserved-a.consumed>0 then
    select max_cost_microusd into cap from public.free_ai_project_policy where singleton;
    if cap is null then raise exception 'FREE_PROJECT_PRICING_REQUIRED'; end if;
    insert into public.free_ai_projects(project_id,owner_user_id,state,budget_microusd) values(p_project,owner_id,'reserved',cap)
      on conflict(project_id) do update set state='reserved';
    update public.free_ai_accounts set reserved=reserved+1 where owner_user_id=owner_id;
  else
    insert into public.generation_paid_projects(project_id,owner_user_id) values(p_project,owner_id) on conflict do nothing;
  end if;
end $$;

-- Audit starts without an account-wide attempt quota. Tombstones still survive
-- cleanup. Model, token, request-size, lease and creative guards are unchanged.
create or replace function public.generation_free_preparation(p_task uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; owner_id uuid;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.id is null or t.kind not in ('character','product','location','storyboard') then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  perform public.free_ai_reserve(t.project_id);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=t.project_id;
  insert into public.generation_free_preparations(task_id,owner_user_id,kind) values(p_task,owner_id,t.kind) on conflict do nothing;
  return true;
end $$;

create or replace function public.generation_free_task_admit() returns trigger language plpgsql security definer set search_path='' as $$
declare phase_key text; model_id text; owner_id uuid; price integer;
begin
  if new.kind not in ('character','product','location','storyboard','video') then return new; end if;
  if tg_op='INSERT' then
    if new.provider_started then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
    perform public.free_ai_reserve(new.project_id);
    if new.kind='video' then select intent->>'model' into model_id from public.ugc_v3_runs where id=(new.input->>'runId')::uuid and project_id=new.project_id;
    else model_id:=case when new.kind='location' then new.input->>'directorModel' else new.input->>'model' end; end if;
    perform public.free_ai_request_cost(new.project_id,new.kind,case when new.kind='location' then 'plan' else 'default' end,model_id);
    if new.kind<>'video' then
      select owner_user_id into owner_id from public.generation_paid_projects where project_id=new.project_id;
      price:=case when new.kind='location' then 2 else 1 end;
      if owner_id is not null and not exists(select 1 from public.generation_accounts where owner_user_id=owner_id and credit_available>=price) then raise exception 'INSUFFICIENT_CREDITS'; end if;
    end if;
  else
    phase_key:=case when new.kind='location' then new.output->'requests'->-1->>'key' else 'default' end;
    if phase_key is null or new.kind='location' and phase_key not in ('plan','sheet') then raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED'; end if;
    if new.kind<>'video' then perform public.generation_free_preparation(new.id); end if;
    perform public.free_ai_prepare(new.id,phase_key);
  end if;
  return new;
end $$;

-- Capture only the previous prepare/dispatch/status implementations once.
do $$ declare n text; s text; d text; begin
  for n,s in select * from (values ('free_ai_request_cost','uuid,text,text,text'),('free_ai_prepare','uuid,text'),('free_ai_dispatch','uuid,uuid,text'),('free_ai_dispatch_status','uuid,uuid,text')) f(n,s) loop
    if to_regprocedure('public.stage3_'||n||'('||s||')') is null then
      d:=pg_get_functiondef(to_regprocedure('public.'||n||'('||s||')'));
      execute regexp_replace(d,'FUNCTION public\.'||n||'\(', 'FUNCTION public.stage3_'||n||'(');
    end if;
    execute format('revoke all on function public.stage3_%I(%s) from public,anon,authenticated,service_role',n,s);
  end loop;
end $$;

create or replace function public.free_ai_request_cost(p_project uuid,p_kind text,p_phase text,p_model text) returns bigint language plpgsql security definer set search_path='' as $$
begin
  if p_kind='video' and not exists(select 1 from public.generation_paid_projects where project_id=p_project)
    and public.generation_free_historical_video_used(p_project) then raise exception 'FREE_PROJECT_VIDEO_USED'; end if;
  return public.stage3_free_ai_request_cost(p_project,p_kind,p_phase,p_model);
end $$;

create or replace function public.generation_openai_reserve(p_task uuid,p_phase text) returns void language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; owner_id uuid; h public.generation_openai_reservations;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  select owner_user_id into owner_id from public.generation_paid_projects where project_id=t.project_id;
  if owner_id is null or t.kind='video' then return; end if;
  perform public.free_ai_reserve(t.project_id);
  perform 1 from public.generation_accounts where owner_user_id=owner_id for update;
  select * into h from public.generation_openai_reservations where task_id=p_task and phase=p_phase;
  if h.task_id is not null then
    if h.state='reserved' and h.lease_token=t.lease_token and h.dispatched_at is null then return; end if;
    raise exception 'PAID_RESERVATION_REQUIRED';
  end if;
  if not exists(select 1 from public.generation_paid_preparations where task_id=p_task and phase=p_phase and state='prepared' and lease_token=t.lease_token) then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  update public.generation_accounts set credit_available=credit_available-1,credit_reserved=credit_reserved+1,updated_at=now() where owner_user_id=owner_id and credit_available>=1;
  if not found then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into public.generation_openai_reservations(task_id,phase,owner_user_id,project_id,lease_token) values(t.id,p_phase,owner_id,t.project_id,t.lease_token);
  insert into public.credit_ledger(owner_user_id,openai_task_id,openai_phase,amount,type,direction,available_delta,reserved_delta,reason,reference_key)
    values(owner_id,t.id,p_phase,1,'reservation','hold',-1,1,'openai_admission','openai:'||t.id::text||':'||p_phase||':reservation');
end $$;
create or replace function public.free_ai_prepare(p_task uuid,p_phase text) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.stage3_free_ai_prepare(p_task,p_phase);
  perform public.generation_openai_reserve(p_task,p_phase);
end $$;
create or replace function public.free_ai_dispatch(p_task uuid,p_token uuid,p_phase text) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.ugc_v3_tasks t where t.id=p_task and t.kind='video'
    and not exists(select 1 from public.generation_paid_projects where project_id=t.project_id)
    and public.generation_free_historical_video_used(t.project_id)) then raise exception 'FREE_PROJECT_VIDEO_USED'; end if;
  -- Also handles prepared-but-undispatched requests made before this migration.
  -- A delegate rejection rolls back both reservation and dispatch atomically.
  perform public.generation_openai_reserve(p_task,p_phase);
  perform public.stage3_free_ai_dispatch(p_task,p_token,p_phase);
  update public.generation_openai_reservations set dispatched_at=now() where task_id=p_task and phase=p_phase and lease_token=p_token and state='reserved' and dispatched_at is null;
  return true;
end $$;

create or replace function public.generation_openai_settle(p_task uuid,p_phase text,p_outcome text) returns void language plpgsql security definer set search_path='' as $$
declare h public.generation_openai_reservations; outcome text;
begin
  select * into h from public.generation_openai_reservations where task_id=p_task and phase=p_phase;
  if h.task_id is null then return; end if; -- No retroactive charge for old requests.
  perform 1 from public.generation_accounts where owner_user_id=h.owner_user_id for update;
  select * into h from public.generation_openai_reservations where task_id=p_task and phase=p_phase for update;
  if h.state<>'reserved' then return; end if;
  if p_outcome='completed' and h.dispatched_at is not null then outcome:='consumed';
  elsif p_outcome='rejected' or p_outcome='unstarted' and h.dispatched_at is null then outcome:='released';
  else return; end if;
  update public.generation_accounts set credit_reserved=credit_reserved-1,credit_available=credit_available+case when outcome='released' then 1 else 0 end,updated_at=now()
    where owner_user_id=h.owner_user_id and credit_reserved>=1;
  if not found then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  update public.generation_openai_reservations set state=outcome,settled_at=now() where task_id=p_task and phase=p_phase;
  insert into public.credit_ledger(owner_user_id,openai_task_id,openai_phase,amount,type,direction,available_delta,reserved_delta,reason,reference_key)
    values(h.owner_user_id,p_task,p_phase,1,case when outcome='consumed' then 'consumption' else 'release' end,
      case when outcome='consumed' then 'debit' else 'restore' end,case when outcome='released' then 1 else 0 end,-1,
      case when outcome='consumed' then 'openai_completed' else 'openai_not_billed' end,
      'openai:'||p_task::text||':'||p_phase||':'||case when outcome='consumed' then 'consumption' else 'release' end);
end $$;
create or replace function public.generation_openai_receipt(p_task uuid,p_token uuid,p_phase text,p_outcome text) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_outcome not in ('completed','rejected') or not exists(select 1 from public.ugc_v3_tasks where id=p_task and lease_token=p_token and status='running' and lease_until>now()
    and kind in ('character','product','location','storyboard')) then raise exception 'V3_LEASE_LOST'; end if;
  perform public.generation_openai_settle(p_task,p_phase,p_outcome); return true;
end $$;
create or replace function public.generation_openai_task_settle() returns trigger language plpgsql security definer set search_path='' as $$
declare h public.generation_openai_reservations;
begin
  if new.status not in ('failed','done') then return new; end if;
  for h in select * from public.generation_openai_reservations where task_id=new.id and state='reserved' loop
    -- Task failure alone never proves a dispatched request was unbilled.
    perform public.generation_openai_settle(h.task_id,h.phase,'unstarted');
  end loop;
  return new;
end $$;
drop trigger if exists z_generation_openai_settle on public.ugc_v3_tasks;
create trigger z_generation_openai_settle after update of status on public.ugc_v3_tasks for each row execute function public.generation_openai_task_settle();

create or replace function public.free_ai_dispatch_status(p_task uuid,p_token uuid,p_phase text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare t public.ugc_v3_tasks; dispatched boolean;
begin
  select * into t from public.ugc_v3_tasks where id=p_task and lease_token=p_token and status='running' and lease_until>now();
  if t.id is null then return null; end if;
  if exists(select 1 from public.generation_paid_projects where project_id=t.project_id) then return public.stage3_free_ai_dispatch_status(p_task,p_token,p_phase); end if;
  select state='started' into dispatched from public.free_ai_operations where task_id=p_task and phase=p_phase;
  if dispatched is null and not t.provider_started then return false; end if;
  return dispatched;
end $$;

create or replace function public.free_ai_release_unstarted() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.free_ai_projects;
begin
  if new.status not in ('failed','done') then return new; end if;
  select * into p from public.free_ai_projects where project_id=new.project_id;
  if p.project_id is null or public.generation_project_review_required(new.project_id,false) then return new; end if;
  perform 1 from public.free_ai_accounts where owner_user_id=p.owner_user_id for update;
  select * into p from public.free_ai_projects where project_id=new.project_id for update;
  update public.free_ai_operations set state='canceled' where task_id=new.id and state='prepared';
  if p.state='reserved' and not exists(select 1 from public.free_ai_operations where project_id=p.project_id and state='started')
    and not exists(select 1 from public.ugc_v3_tasks where project_id=p.project_id and kind in ('character','product','location','storyboard','video') and status in ('queued','running','reconciliation_required')) then
    update public.free_ai_projects set state='released' where project_id=p.project_id;
    update public.free_ai_accounts set reserved=reserved-1 where owner_user_id=p.owner_user_id and reserved>0;
  end if;
  return new;
end $$;

create or replace function public.generation_project_access(p_owner uuid,p_project uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; a public.free_ai_accounts; p public.free_ai_projects; paid boolean; review boolean; eligible boolean;
  available bigint; held bigint; user_left bigint; global_left bigint; blocker text; exposure bigint; account_exposure bigint; cap bigint;
begin
  perform public.free_ai_account(p_owner);
  if p_project is not null and not exists(select 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner) then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
  select * into a from public.free_ai_accounts where owner_user_id=p_owner;
  select * into p from public.free_ai_projects where project_id=p_project;
  select credit_available,credit_reserved into available,held from public.generation_accounts where owner_user_id=p_owner;
  review:=public.generation_project_review_required(p_project,a.review_required);
  paid:=exists(select 1 from public.generation_paid_projects where project_id=p_project)
    or not coalesce(p.state in ('reserved','consumed'),false) and (a.review_required or a.total-a.reserved-a.consumed=0);
  eligible:=not review and (paid or coalesce(p.state in ('reserved','consumed'),false) or not a.review_required and a.total-a.reserved-a.consumed>0);
  select least(max_cost_microusd,coalesce(p.budget_microusd,max_cost_microusd),1030000) into cap from public.free_ai_project_policy where singleton;
  select coalesce(sum(max_cost_microusd),0) into exposure from public.free_ai_operations where project_id=p_project and provider='higgsfield' and state<>'canceled';
  select coalesce(sum(o.max_cost_microusd),0) into account_exposure from public.free_ai_operations o join public.free_ai_projects f using(project_id) where f.owner_user_id=p_owner and o.provider='higgsfield' and o.state<>'canceled';
  select coalesce((select cap_microusd from public.generation_paid_user_caps where owner_user_id=p_owner),user_cap_microusd)
    -(select coalesce(sum(exposure_microusd),0) from public.generation_paid_reservations where owner_user_id=p_owner and state<>'released'),
    global_cap_microusd-(select coalesce(sum(exposure_microusd),0) from public.generation_paid_reservations where state<>'released')
    into user_left,global_left from public.generation_paid_policy where singleton;
  if paid then blocker:=case when review then 'FREE_PROJECT_HISTORY_REVIEW_REQUIRED' when coalesce(global_left,0)<1030000 then 'HIGGSFIELD_GLOBAL_SPENDING_LIMIT'
    when coalesce(user_left,0)<1030000 then 'HIGGSFIELD_USER_SPENDING_LIMIT' when available<103 then 'INSUFFICIENT_CREDITS' else null end; end if;
  return jsonb_build_object('policyVersion',108,'total',a.total,'remaining',a.total-a.reserved-a.consumed,'reserved',a.reserved,'consumed',a.consumed,
    'historyReview',a.review_required,'projectAllowed',eligible,'projectReviewRequired',review,'projectBlocker',case when review then 'FREE_PROJECT_HISTORY_REVIEW_REQUIRED' else null end,
    'preparationAllowed',eligible and (not paid or available>=1),'preparationCredits',case when paid then 1 else 0 end,
    'videoAllowed',eligible and case when paid then blocker is null else not public.generation_free_historical_video_used(p_project)
      and coalesce(cap-exposure>=1030000,false) and account_exposure+1030000<=2060000
      and not exists(select 1 from public.free_ai_operations where project_id=p_project and provider='higgsfield' and state<>'canceled')
      and not exists(select 1 from public.ugc_v3_runs where project_id=p_project and (state='approved' or result is not null)) end,
    'funding',case when paid then 'credits' else 'free' end,'requiredCredits',case when paid then 103 else 0 end,
    'availableCredits',available,'reservedCredits',held,'shortageCredits',case when paid then greatest(0,103-available) else 0 end,'paidBlocker',blocker,
    'budgetMicrousd',cap,'budgetUsedMicrousd',exposure,'accountBudgetRemainingMicrousd',greatest(0,2060000-account_exposure),
    'paidUserRemainingMicrousd',greatest(0,coalesce(user_left,0)),'paidGlobalRemainingMicrousd',greatest(0,coalesce(global_left,0)));
end $$;

create or replace function public.generation_credit_history_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or tg_table_name='free_ai_review_resolutions' then raise exception 'Generation credit history is immutable.'; end if;
  if (new.task_id,new.phase,new.owner_user_id,new.project_id,new.lease_token,new.created_at) is distinct from (old.task_id,old.phase,old.owner_user_id,old.project_id,old.lease_token,old.created_at)
    or old.state<>'reserved' and new is distinct from old or old.dispatched_at is not null and new.dispatched_at is distinct from old.dispatched_at then raise exception 'Generation credit history is immutable.'; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['generation_openai_reservations','free_ai_review_resolutions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on table public.%I to service_role',t);
    execute format('drop trigger if exists generation_credit_history on public.%I',t);
    execute format('create trigger generation_credit_history before update or delete on public.%I for each row execute function public.generation_credit_history_guard()',t);
  end loop;
end $$;
revoke all on function public.generation_openai_reserve(uuid,text),public.generation_openai_settle(uuid,text,text),public.generation_openai_receipt(uuid,uuid,text,text),
  public.generation_openai_task_settle(),public.generation_credit_history_guard(),public.generation_free_historical_video_used(uuid) from public,anon,authenticated,service_role;
grant execute on function public.generation_openai_receipt(uuid,uuid,text,text) to service_role;
-- Replaced functions retain their existing ACLs. All new helpers are private.
commit;
