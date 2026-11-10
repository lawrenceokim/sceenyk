-- After 106. No backfill, flag clearing, counter resets or project edits.
begin;
do $$ declare t text; c text; begin
  if to_regprocedure('public.stage2_free_ai_reserve(uuid)') is null
    or to_regprocedure('public.generation_paid_capacity(uuid,bigint)') is null
    or to_regprocedure('public.stage2_generation_project_access(uuid,uuid)') is null then
    raise exception 'Apply 106 before 107.';
  end if;
  for t,c in select * from (values
    ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
    ('free_ai_accounts','owner_user_id'),('free_ai_accounts','total'),('free_ai_accounts','reserved'),('free_ai_accounts','consumed'),('free_ai_accounts','review_required'),
    ('free_ai_projects','project_id'),('free_ai_projects','state'),('free_ai_projects','historical_review'),
    ('generation_paid_projects','project_id'),('generation_paid_projects','owner_user_id'),
    ('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),
    ('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','provider_started'),
    ('ugc_v3_runs','project_id'),('ugc_v3_runs','state'),('ugc_v3_runs','observation'),('ugc_v3_runs','result'),
    ('generation_accounts','owner_user_id'),('generation_accounts','credit_available'),('generation_accounts','credit_reserved'),
    ('generation_paid_policy','singleton'),('generation_paid_policy','user_cap_microusd'),('generation_paid_policy','global_cap_microusd'),
    ('generation_paid_user_caps','owner_user_id'),('generation_paid_user_caps','cap_microusd'),
    ('generation_paid_reservations','owner_user_id'),('generation_paid_reservations','state'),('generation_paid_reservations','exposure_microusd')) required(t,c)
  loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then
      raise exception 'Verify 107 prerequisite %.%.',t,c;
    end if;
  end loop;
end $$;

create or replace function public.generation_project_review_required(p_project uuid,p_account_review boolean) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.free_ai_projects where project_id=p_project and (historical_review or p_account_review))
    or (not exists(select 1 from public.free_ai_projects where project_id=p_project)
      and not exists(select 1 from public.generation_paid_projects where project_id=p_project)
      and (exists(select 1 from public.ugc_v3_artifacts where project_id=p_project and kind in ('character','product','location','storyboard'))
        or exists(select 1 from public.ugc_v3_tasks where project_id=p_project and provider_started and kind in ('character','product','location','storyboard','video'))
        or exists(select 1 from public.ugc_v3_runs where project_id=p_project and (state<>'queued' or observation is not null or result is not null))))
$$;

create or replace function public.free_ai_reserve(p_project uuid) returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid; a public.free_ai_accounts; p public.free_ai_projects;
begin
  perform public.generation_free_project_limits(p_project);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=p_project;
  perform public.free_ai_account(owner_id);
  select * into a from public.free_ai_accounts where owner_user_id=owner_id for update;
  select * into p from public.free_ai_projects where project_id=p_project;
  -- Unresolved PROJECT history stays blocked, including existing free projects
  -- belonging to an account whose free usage cannot yet be reconciled.
  if public.generation_project_review_required(p_project,a.review_required) then
    raise exception 'FREE_PROJECT_HISTORY_REVIEW_REQUIRED';
  end if;
  if exists(select 1 from public.generation_paid_projects where project_id=p_project) then return; end if;
  if p.state in ('reserved','consumed') or not a.review_required and a.total-a.reserved-a.consumed>0 then
    perform public.stage2_free_ai_reserve(p_project); return;
  end if;
  -- Account-level FREE review grants no new free allowance. A fresh project
  -- instead uses paid video funding, while OpenAI preparation stays separately
  -- platform-funded and bound by generation_free_preparations/task fences.
  -- This registry is NOT video spending authority: 106 still checks pricing,
  -- wallet + caps and holds credits atomically at run admission and dispatch.
  insert into public.generation_paid_projects(project_id,owner_user_id) values(p_project,owner_id) on conflict do nothing;
end $$;

create or replace function public.generation_project_access(p_owner uuid,p_project uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; paid boolean; free_project boolean; account_review boolean; project_review boolean;
  available bigint; held bigint; user_left bigint; global_left bigint; blocker text; project_blocker text;
begin
  base:=public.stage2_generation_project_access(p_owner,p_project); -- Includes owner check and unchanged free counters/limits.
  select review_required into account_review from public.free_ai_accounts where owner_user_id=p_owner;
  select credit_available,credit_reserved into available,held from public.generation_accounts where owner_user_id=p_owner;
  select coalesce((select cap_microusd from public.generation_paid_user_caps where owner_user_id=p_owner),user_cap_microusd)
    -(select coalesce(sum(exposure_microusd),0) from public.generation_paid_reservations where owner_user_id=p_owner and state<>'released'),
    global_cap_microusd-(select coalesce(sum(exposure_microusd),0) from public.generation_paid_reservations where state<>'released')
    into user_left,global_left from public.generation_paid_policy where singleton;
  free_project:=exists(select 1 from public.free_ai_projects where project_id=p_project and state in ('reserved','consumed'));
  project_review:=public.generation_project_review_required(p_project,account_review);
  project_blocker:=case when project_review then 'FREE_PROJECT_HISTORY_REVIEW_REQUIRED' else null end;
  paid:=exists(select 1 from public.generation_paid_projects where project_id=p_project)
    or not free_project and (account_review or (base->>'remaining')::int=0);
  if paid then
    blocker:=case when project_review then project_blocker
      when coalesce(global_left,0)<1030000 then 'HIGGSFIELD_GLOBAL_SPENDING_LIMIT'
      when coalesce(user_left,0)<1030000 then 'HIGGSFIELD_USER_SPENDING_LIMIT'
      when available<103 then 'INSUFFICIENT_CREDITS' else null end;
    base:=base||jsonb_build_object('videoAllowed',blocker is null);
  end if;
  return base||jsonb_build_object('projectAllowed',not project_review,'preparationAllowed',not project_review,
    'videoAllowed',not project_review and (base->>'videoAllowed')::boolean,
    'projectReviewRequired',project_review,'projectBlocker',project_blocker,
    'funding',case when paid then 'credits' else 'free' end,'requiredCredits',case when paid then 103 else 0 end,
    'availableCredits',available,'reservedCredits',held,'shortageCredits',case when paid then greatest(0,103-available) else 0 end,
    'paidBlocker',blocker,'paidUserRemainingMicrousd',greatest(0,coalesce(user_left,0)),'paidGlobalRemainingMicrousd',greatest(0,coalesce(global_left,0)));
end $$;

-- Keep private dispatch helpers private; no new browser/service write path.
revoke all on function public.generation_project_review_required(uuid,boolean),public.free_ai_reserve(uuid),public.generation_project_access(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.generation_project_access(uuid,uuid) to service_role;
commit;
