-- After 108. Stop old app/workers, apply, then deploy matching source.
-- A video/free-history hold must not veto a separately credit-funded AI request.
begin;
do $$ declare t text; c text; fk record; begin
  if to_regprocedure('public.generation_openai_receipt(uuid,uuid,text,text)') is null
    or to_regprocedure('public.generation_free_historical_video_used(uuid)') is null then raise exception 'Apply 108 before 109.'; end if;
  for t,c in select * from (values
    ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
    ('free_ai_accounts','owner_user_id'),('free_ai_accounts','total'),('free_ai_accounts','reserved'),('free_ai_accounts','consumed'),('free_ai_accounts','review_required'),
    ('free_ai_projects','project_id'),('free_ai_projects','state'),
    ('generation_paid_projects','project_id'),('generation_paid_preparations','project_id'),('generation_paid_preparations','task_id'),('generation_paid_preparations','phase'),('generation_paid_preparations','lease_token'),('generation_paid_preparations','state'),
    ('generation_openai_reservations','project_id'),('generation_openai_reservations','task_id'),('generation_openai_reservations','phase'),('generation_openai_reservations','state'),('generation_openai_reservations','lease_token'),('generation_openai_reservations','dispatched_at'),
    ('generation_accounts','owner_user_id'),('generation_accounts','credit_available'),('generation_accounts','credit_reserved'),('generation_accounts','updated_at'),
    ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','status'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','provider_started'),
    ('free_ai_operations','task_id'),('free_ai_operations','phase'),('free_ai_operations','state'),('free_ai_operations','lease_token'),
    ('generation_free_preparations','task_id'),('generation_free_preparations','owner_user_id'),('generation_free_preparations','kind'),
    ('credit_ledger','openai_task_id'),('credit_ledger','openai_phase')) required(t,c)
  loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify 109 prerequisite %.%.',t,c; end if;
  end loop;
  -- OpenAI requests may use credits on an existing free/reviewed project.
  -- Repoint only these project FKs; video funding and all retained rows stay put.
  foreach t in array array['generation_paid_preparations','generation_openai_reservations'] loop
    for fk in select conname,confrelid from pg_constraint where conrelid=to_regclass('public.'||t) and contype='f'
      and conkey=array[(select attnum from pg_attribute where attrelid=to_regclass('public.'||t) and attname='project_id')] loop
      if fk.confrelid='public.generation_paid_projects'::regclass then
        execute format('alter table public.%I drop constraint %I',t,fk.conname);
        execute format('alter table public.%I add constraint %I foreign key(project_id) references public.ugc_v3_projects(project_id)',t,t||'_project_fkey');
      elsif fk.confrelid<>'public.ugc_v3_projects'::regclass then raise exception 'Inspect 109 project FK on %.',t; end if;
    end loop;
    if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.'||t) and contype='f' and confrelid='public.ugc_v3_projects'::regclass
      and conkey=array[(select attnum from pg_attribute where attrelid=to_regclass('public.'||t) and attname='project_id')]) then raise exception 'Verify 109 project FK on %.',t; end if;
  end loop;
end $$;

-- Preserve 108 video policy verbatim as private delegates, including on reruns.
do $$ declare n text; s text; d text; begin
  for n,s in select * from (values ('free_ai_prepare','uuid,text'),('free_ai_dispatch','uuid,uuid,text'),
    ('free_ai_dispatch_status','uuid,uuid,text'),('free_ai_request_cost','uuid,text,text,text'),
    ('generation_project_access','uuid,uuid')) f(n,s) loop
    if to_regprocedure('public.video_policy_108_'||n||'('||s||')') is null then
      d:=pg_get_functiondef(to_regprocedure('public.'||n||'('||s||')'));
      execute regexp_replace(d,'FUNCTION public\.'||n||'\(', 'FUNCTION public.video_policy_108_'||n||'(');
    end if;
    execute format('revoke all on function public.video_policy_108_%I(%s) from public,anon,authenticated,service_role',n,s);
  end loop;
end $$;

create or replace function public.generation_preparation_is_free(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select not exists(select 1 from public.generation_paid_projects where project_id=p_project)
    and not public.generation_project_review_required(p_project,a.review_required)
    and (coalesce(p.state in ('reserved','consumed'),false) or not a.review_required and a.total-a.reserved-a.consumed>0)
    from public.ugc_v3_projects v join public.free_ai_accounts a on a.owner_user_id=v.owner_user_id
    left join public.free_ai_projects p on p.project_id=v.project_id where v.project_id=p_project),false)
$$;
create or replace function public.generation_preparation_reserve(p_project uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid; account_review boolean; free boolean;
begin
  perform public.generation_free_project_limits(p_project);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=p_project;
  perform public.free_ai_account(owner_id);
  select review_required into account_review from public.free_ai_accounts where owner_user_id=owner_id for update;
  free:=public.generation_preparation_is_free(p_project);
  if free or not public.generation_project_review_required(p_project,account_review) then
    perform public.free_ai_reserve(p_project);
  end if;
  -- A held project uses credits for NEW OpenAI requests without enrolling its
  -- video as paid, clearing history or assigning another free allowance.
  return free;
end $$;
create or replace function public.free_ai_request_cost(p_project uuid,p_kind text,p_phase text,p_model text) returns bigint language plpgsql security definer set search_path='' as $$
begin
  if p_kind='video' then return public.video_policy_108_free_ai_request_cost(p_project,p_kind,p_phase,p_model); end if;
  if p_kind not in ('character','product','location','storyboard') or coalesce(p_model,'')=''
    or not (p_kind='location' and p_phase in ('plan','sheet') or p_kind<>'location' and p_phase='default') then raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED'; end if;
  perform public.generation_preparation_reserve(p_project); return 0;
end $$;
create or replace function public.generation_free_preparation(p_task uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; owner_id uuid;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.id is null or t.kind not in ('character','product','location','storyboard') then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  perform public.generation_preparation_reserve(t.project_id);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=t.project_id;
  insert into public.generation_free_preparations(task_id,owner_user_id,kind) values(t.id,owner_id,t.kind) on conflict do nothing;
  return true;
end $$;
create or replace function public.generation_free_task_admit() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; phase_key text; model_id text; price integer;
begin
  if new.kind='video' then
    if tg_op='INSERT' then
      if new.provider_started then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
      perform public.free_ai_reserve(new.project_id);
      select intent->>'model' into model_id from public.ugc_v3_runs where id=(new.input->>'runId')::uuid and project_id=new.project_id;
      perform public.free_ai_request_cost(new.project_id,new.kind,'default',model_id);
    else perform public.free_ai_prepare(new.id,'default'); end if;
    return new;
  end if;
  if new.kind not in ('character','product','location','storyboard') then return new; end if;
  if tg_op='INSERT' then
    if new.provider_started then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
    model_id:=case when new.kind='location' then new.input->>'directorModel' else new.input->>'model' end;
    perform public.free_ai_request_cost(new.project_id,new.kind,case when new.kind='location' then 'plan' else 'default' end,model_id);
    if not public.generation_preparation_is_free(new.project_id) then
      select owner_user_id into owner_id from public.ugc_v3_projects where project_id=new.project_id;
      price:=case when new.kind='location' then 2 else 1 end;
      if not exists(select 1 from public.generation_accounts where owner_user_id=owner_id and credit_available>=price) then raise exception 'INSUFFICIENT_CREDITS'; end if;
    end if;
  else
    phase_key:=case when new.kind='location' then new.output->'requests'->-1->>'key' else 'default' end;
    if phase_key is null or new.kind='location' and phase_key not in ('plan','sheet') then raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED'; end if;
    perform public.generation_free_preparation(new.id);
    perform public.free_ai_prepare(new.id,phase_key);
  end if;
  return new;
end $$;

create or replace function public.generation_openai_reserve(p_task uuid,p_phase text) returns void language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; owner_id uuid; h public.generation_openai_reservations;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.kind='video' then return; end if;
  if t.id is null or t.status<>'running' or t.lease_token is null or t.lease_until<=now() then raise exception 'V3_LEASE_LOST'; end if;
  if not exists(select 1 from public.generation_paid_preparations where task_id=p_task and phase=p_phase and state='prepared' and lease_token=t.lease_token) then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=t.project_id;
  perform 1 from public.generation_accounts where owner_user_id=owner_id for update;
  select * into h from public.generation_openai_reservations where task_id=p_task and phase=p_phase;
  if h.task_id is not null then
    if h.state='reserved' and h.lease_token=t.lease_token and h.dispatched_at is null then return; end if;
    raise exception 'PAID_RESERVATION_REQUIRED';
  end if;
  update public.generation_accounts set credit_available=credit_available-1,credit_reserved=credit_reserved+1,updated_at=now() where owner_user_id=owner_id and credit_available>=1;
  if not found then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into public.generation_openai_reservations(task_id,phase,owner_user_id,project_id,lease_token) values(t.id,p_phase,owner_id,t.project_id,t.lease_token);
  insert into public.credit_ledger(owner_user_id,openai_task_id,openai_phase,amount,type,direction,available_delta,reserved_delta,reason,reference_key)
    values(owner_id,t.id,p_phase,1,'reservation','hold',-1,1,'openai_admission','openai:'||t.id::text||':'||p_phase||':reservation');
end $$;
create or replace function public.free_ai_prepare(p_task uuid,p_phase text) returns void language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; op public.free_ai_operations; pp public.generation_paid_preparations; free boolean; model_id text;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.kind='video' then perform public.video_policy_108_free_ai_prepare(p_task,p_phase); return; end if;
  if t.id is null or t.status<>'running' or t.lease_token is null or t.lease_until<=now() or t.input->>'referenceCleanupHold'='true' then raise exception 'V3_LEASE_LOST'; end if;
  model_id:=case when t.kind='location' and p_phase='plan' then t.input->>'directorModel' else t.input->>'model' end;
  perform public.free_ai_request_cost(t.project_id,t.kind,p_phase,model_id);
  select * into op from public.free_ai_operations where task_id=p_task and phase=p_phase;
  select * into pp from public.generation_paid_preparations where task_id=p_task and phase=p_phase;
  if op.task_id is not null and pp.task_id is not null then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  if op.task_id is not null then
    if op.state='prepared' and op.lease_token=t.lease_token then return; end if;
    raise exception 'PROVIDER_INTENT_ALREADY_EXISTS';
  end if;
  if pp.task_id is not null then
    if pp.state<>'prepared' or pp.lease_token<>t.lease_token then raise exception 'PROVIDER_INTENT_ALREADY_EXISTS'; end if;
    perform public.generation_openai_reserve(p_task,p_phase); return;
  end if;
  free:=public.generation_preparation_is_free(t.project_id);
  if free then
    insert into public.free_ai_operations(task_id,phase,project_id,kind,provider,model,max_cost_microusd,state,lease_token)
      values(t.id,p_phase,t.project_id,t.kind,'openai',model_id,0,'prepared',t.lease_token);
  else
    insert into public.generation_paid_preparations(task_id,phase,project_id,lease_token,state) values(t.id,p_phase,t.project_id,t.lease_token,'prepared');
    perform public.generation_openai_reserve(p_task,p_phase);
  end if;
end $$;
create or replace function public.free_ai_dispatch(p_task uuid,p_token uuid,p_phase text) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.kind='video' then return public.video_policy_108_free_ai_dispatch(p_task,p_token,p_phase); end if;
  if t.id is null or t.status<>'running' or t.lease_token is distinct from p_token or t.lease_until<=now() or not t.provider_started then raise exception 'V3_LEASE_LOST'; end if;
  -- The persisted operation fixes free/paid funding across leases and retries.
  if exists(select 1 from public.generation_paid_preparations where task_id=p_task and phase=p_phase) then
    perform public.generation_openai_reserve(p_task,p_phase);
    update public.generation_paid_preparations set state='started' where task_id=p_task and phase=p_phase and lease_token=p_token and state='prepared';
    if not found then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
    update public.generation_openai_reservations set dispatched_at=now() where task_id=p_task and phase=p_phase and lease_token=p_token and state='reserved' and dispatched_at is null;
    if not found then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
    return true;
  end if;
  return public.stage2_free_ai_dispatch(p_task,p_token,p_phase);
end $$;
create or replace function public.free_ai_dispatch_status(p_task uuid,p_token uuid,p_phase text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare t public.ugc_v3_tasks; dispatched boolean;
begin
  select * into t from public.ugc_v3_tasks where id=p_task and status='running' and lease_token=p_token and lease_until>now();
  if t.id is null then return null; end if;
  if t.kind='video' then return public.video_policy_108_free_ai_dispatch_status(p_task,p_token,p_phase); end if;
  select state='started' into dispatched from public.generation_paid_preparations where task_id=p_task and phase=p_phase;
  if dispatched is null then select state='started' into dispatched from public.free_ai_operations where task_id=p_task and phase=p_phase; end if;
  if dispatched is null and not t.provider_started then return false; end if;
  return dispatched;
end $$;
create or replace function public.generation_project_access(p_owner uuid,p_project uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; free boolean;
begin
  base:=public.video_policy_108_generation_project_access(p_owner,p_project); -- Owner and video checks unchanged.
  free:=case when p_project is null then not (base->>'historyReview')::boolean and (base->>'remaining')::int>0 else public.generation_preparation_is_free(p_project) end;
  return base||jsonb_build_object('policyVersion',109,'preparationFunding',case when free then 'free' else 'credits' end,
    'preparationAllowed',free or (base->>'availableCredits')::bigint>=1,'preparationCredits',case when free then 0 else 1 end);
end $$;

revoke all on function public.generation_preparation_is_free(uuid),public.generation_preparation_reserve(uuid) from public,anon,authenticated,service_role;
-- Replaced functions retain their existing private/RPC ACLs. No data backfill,
-- historical flag clearing, new free assignment for a held project or video grant.
commit;
