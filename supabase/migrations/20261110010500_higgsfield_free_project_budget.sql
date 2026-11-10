-- After 104. Stop old app/workers before applying; deploy matching source.
-- Forward policy: $0.206/s * 5s = $1.03 Higgsfield exposure per free project.
-- OpenAI is platform-funded and separately attempt-limited, not free of cost.
begin;
do $$ declare t text; c text; begin
  if to_regprocedure('public.free_ai_dispatch(uuid,uuid,text)') is null then raise exception 'Apply 104 before 105.'; end if;
  for t,c in select * from (values
    ('free_ai_project_policy','max_cost_microusd'),('free_ai_operation_prices','model'),
    ('free_ai_accounts','owner_user_id'),('free_ai_accounts','reserved'),('free_ai_accounts','consumed'),
    ('free_ai_projects','project_id'),('free_ai_projects','budget_microusd'),('free_ai_projects','historical_review'),
    ('free_ai_operations','task_id'),('free_ai_operations','phase'),('free_ai_operations','provider'),('free_ai_operations','state'),
    ('free_ai_operations','max_cost_microusd'),('free_ai_operations','lease_token'),('ugc_v3_runs','result'),('ugc_v3_runs','state')) required(t,c)
  loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then
      raise exception 'Verify 105 prerequisite %.%.',t,c;
    end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.free_ai_operations'::regclass
    and conname in ('free_ai_operations_max_cost_microusd_check','free_ai_operations_funding_check')) then
    raise exception 'Inspect operation-cost constraints before 105.';
  end if;
end $$;

-- Old OpenAI ceilings stay in immutable history. Zero on NEW OpenAI records
-- means zero Higgsfield reservation; it is not a zero OpenAI invoice estimate.
alter table public.free_ai_operations drop constraint if exists free_ai_operations_max_cost_microusd_check;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.free_ai_operations'::regclass and conname='free_ai_operations_funding_check') then
    alter table public.free_ai_operations add constraint free_ai_operations_funding_check
      check(max_cost_microusd>=0 and (provider<>'higgsfield' or max_cost_microusd>0));
  end if;
end $$;
insert into public.free_ai_project_policy(singleton,max_cost_microusd) values(true,1030000)
  on conflict(singleton) do update set max_cost_microusd=least(public.free_ai_project_policy.max_cost_microusd,excluded.max_cost_microusd);
insert into public.free_ai_operation_prices(kind,phase,provider,model,max_cost_microusd)
  values('video','default','higgsfield','bytedance/seedance-2.5/reference-to-video',1030000)
  on conflict(kind,phase,provider,model) do update set max_cost_microusd=excluded.max_cost_microusd;

create or replace function public.free_ai_request_cost(p_project uuid,p_kind text,p_phase text,p_model text) returns bigint language plpgsql security definer set search_path='' as $$
declare cost bigint; cap bigint; exposure bigint; account_exposure bigint; owner_id uuid;
begin
  perform public.free_ai_reserve(p_project);
  if p_kind in ('character','product','location','storyboard') then
    if (p_kind='location' and p_phase in ('plan','sheet') or p_kind<>'location' and p_phase='default') and coalesce(p_model,'')<>'' then
      return 0; -- Platform-funded. Existing model/input/attempt guards still apply.
    end if;
    raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED';
  end if;
  if p_kind<>'video' or p_phase<>'default' or p_model is distinct from 'bytedance/seedance-2.5/reference-to-video' then raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED'; end if;
  -- Account/project row locks held by free_ai_reserve serialize this slot across
  -- tasks/tabs/restarts. Old duplicate history is preserved, never backfilled/reset.
  if exists(select 1 from public.free_ai_operations where project_id=p_project and provider='higgsfield' and state<>'canceled')
    or exists(select 1 from public.ugc_v3_runs where project_id=p_project and (state='approved' or result is not null)) then
    raise exception 'FREE_PROJECT_VIDEO_USED';
  end if;
  select max_cost_microusd into cost from public.free_ai_operation_prices where kind='video' and phase='default' and provider='higgsfield' and model=p_model;
  if cost is distinct from 1030000::bigint then raise exception 'FREE_PROJECT_PRICING_REQUIRED'; end if;
  select least(c.max_cost_microusd,p.budget_microusd,1030000) into cap from public.free_ai_projects p cross join public.free_ai_project_policy c where p.project_id=p_project and c.singleton;
  select coalesce(sum(max_cost_microusd),0) into exposure from public.free_ai_operations where project_id=p_project and provider='higgsfield' and state<>'canceled';
  if cap is null or exposure+cost>cap then raise exception 'FREE_PROJECT_BUDGET_EXHAUSTED'; end if;
  select owner_user_id into owner_id from public.free_ai_projects where project_id=p_project;
  select coalesce(sum(o.max_cost_microusd),0) into account_exposure from public.free_ai_operations o join public.free_ai_projects p using(project_id)
    where p.owner_user_id=owner_id and o.provider='higgsfield' and o.state<>'canceled';
  if account_exposure+cost>2060000 then raise exception 'FREE_PROJECT_BUDGET_EXHAUSTED'; end if;
  return cost;
end $$;

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
  if op.provider='higgsfield' then
    if op.kind<>'video' or op.model<>'bytedance/seedance-2.5/reference-to-video' or op.max_cost_microusd<>1030000
      or not exists(select 1 from public.free_ai_operation_prices where kind=op.kind and phase=op.phase and provider=op.provider and model=op.model and max_cost_microusd=op.max_cost_microusd) then
      raise exception 'FREE_PROJECT_PRICING_REQUIRED';
    end if;
    if exists(select 1 from public.free_ai_operations where project_id=t.project_id and provider='higgsfield' and state<>'canceled' and (task_id,phase)<>(op.task_id,op.phase))
      or exists(select 1 from public.ugc_v3_runs where project_id=t.project_id and (state='approved' or result is not null)) then raise exception 'FREE_PROJECT_VIDEO_USED'; end if;
    select least(max_cost_microusd,p.budget_microusd,1030000) into cap from public.free_ai_project_policy where singleton;
    if cap is null or (select sum(max_cost_microusd) from public.free_ai_operations where project_id=t.project_id and provider='higgsfield' and state<>'canceled')>cap then
      raise exception 'FREE_PROJECT_BUDGET_EXHAUSTED';
    end if;
    if (select coalesce(sum(o.max_cost_microusd),0) from public.free_ai_operations o join public.free_ai_projects f using(project_id)
      where f.owner_user_id=p.owner_user_id and o.provider='higgsfield' and o.state<>'canceled')>2060000 then raise exception 'FREE_PROJECT_BUDGET_EXHAUSTED'; end if;
  elsif op.provider<>'openai' or op.kind not in ('character','product','location','storyboard') then raise exception 'GENERATION_PIPELINE_NOT_SUPPORTED';
  end if;
  update public.free_ai_operations set state='started' where task_id=p_task and phase=p_phase;
  if p.state='reserved' then
    update public.free_ai_accounts set reserved=reserved-1,consumed=consumed+1 where owner_user_id=p.owner_user_id and reserved>0;
    if not found then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
    update public.free_ai_projects set state='consumed' where project_id=t.project_id;
  end if;
  return true;
end $$;

create or replace function public.generation_project_access(p_owner uuid,p_project uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.free_ai_accounts; p public.free_ai_projects; cap bigint; exposure bigint; account_exposure bigint; eligible boolean; video_slot boolean;
begin
  perform public.free_ai_account(p_owner);
  select * into a from public.free_ai_accounts where owner_user_id=p_owner;
  if p_project is not null and not exists(select 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner) then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
  select * into p from public.free_ai_projects where project_id=p_project;
  select least(max_cost_microusd,coalesce(p.budget_microusd,max_cost_microusd),1030000) into cap from public.free_ai_project_policy where singleton;
  select coalesce(sum(max_cost_microusd),0) into exposure from public.free_ai_operations where project_id=p_project and provider='higgsfield' and state<>'canceled';
  select coalesce(sum(o.max_cost_microusd),0) into account_exposure from public.free_ai_operations o join public.free_ai_projects f using(project_id)
    where f.owner_user_id=p_owner and o.provider='higgsfield' and o.state<>'canceled';
  eligible:=not a.review_required and not coalesce(p.historical_review,false) and (coalesce(p.state in ('reserved','consumed'),false) or a.total-a.reserved-a.consumed>0);
  video_slot:=not exists(select 1 from public.free_ai_operations where project_id=p_project and provider='higgsfield' and state<>'canceled')
    and not exists(select 1 from public.ugc_v3_runs where project_id=p_project and (state='approved' or result is not null));
  return jsonb_build_object('total',a.total,'remaining',a.total-a.reserved-a.consumed,'reserved',a.reserved,'consumed',a.consumed,
    'projectAllowed',eligible,'videoAllowed',eligible and video_slot and coalesce(cap-exposure>=1030000,false) and account_exposure+1030000<=2060000
      and exists(select 1 from public.free_ai_operation_prices where kind='video' and phase='default' and provider='higgsfield' and model='bytedance/seedance-2.5/reference-to-video' and max_cost_microusd=1030000),
    'historyReview',a.review_required or coalesce(p.historical_review,false),'budgetMicrousd',cap,'budgetUsedMicrousd',exposure,
    'accountBudgetRemainingMicrousd',greatest(0,2060000-account_exposure),
    'preparationRemaining',jsonb_build_object(
      'character',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='character')),
      'product',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='product')),
      'location',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='location')),
      'storyboard',greatest(0,2-(select count(*) from public.generation_free_preparations where owner_user_id=p_owner and kind='storyboard'))));
end $$;
-- Existing ownership, private helpers, operation history, RLS, preparation
-- limits and role grants remain. Reassert the replaced public/private boundaries.
revoke all on function public.free_ai_request_cost(uuid,text,text,text),public.free_ai_dispatch(uuid,uuid,text),public.generation_project_access(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.free_ai_dispatch(uuid,uuid,text),public.generation_project_access(uuid,uuid) to service_role;
commit;
