-- After 113. Deploy matching app/worker code with writers stopped.
-- New paid attempts do not reinterpret historical free usage or change balances.
begin;
do $$ declare f text; fk record; begin
  foreach f in array array['generation_preparation_is_free(uuid)','generation_paid_capacity(uuid,bigint)',
    'generation_project_access(uuid,uuid)','generation_free_reserve(uuid)','free_ai_prepare(uuid,text)',
    'free_ai_dispatch(uuid,uuid,text)','free_ai_dispatch_status(uuid,uuid,text)'] loop
    if to_regprocedure('public.'||f) is null then raise exception 'Verify 114 prerequisite %',f; end if;
  end loop;
  if to_regprocedure('public.laptop_v3_worker_claim(uuid,boolean,text,boolean)') is null then
    raise exception 'Apply 113 before 114.';
  end if;
  -- Same boundary as 109 OpenAI funding: a paid attempt may belong to an
  -- existing free/historical V3 project without converting that project.
  for fk in select conname,confrelid from pg_constraint where conrelid='public.generation_paid_reservations'::regclass and contype='f'
    and conkey=array[(select attnum from pg_attribute where attrelid='public.generation_paid_reservations'::regclass and attname='project_id')] loop
    if fk.confrelid='public.generation_paid_projects'::regclass then
      execute format('alter table public.generation_paid_reservations drop constraint %I',fk.conname);
      alter table public.generation_paid_reservations add constraint generation_paid_reservations_project_fkey
        foreign key(project_id) references public.ugc_v3_projects(project_id);
    elsif fk.confrelid<>'public.ugc_v3_projects'::regclass then raise exception 'Inspect paid video project FK.'; end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.generation_paid_reservations'::regclass and contype='f'
    and confrelid='public.ugc_v3_projects'::regclass and conkey=array[(select attnum from pg_attribute where attrelid='public.generation_paid_reservations'::regclass and attname='project_id')]) then
    raise exception 'Verify paid video project FK.';
  end if;
end $$;

do $$ declare c text; begin
  select pg_get_constraintdef(oid) into c from pg_constraint where conrelid='public.generation_paid_quotes'::regclass
    and conname='generation_paid_quotes_cost_microusd_check';
  if c is null or position('1030000' in c)=0 then raise exception 'Inspect existing paid quote cost CHECK before 114.'; end if;
  alter table public.generation_paid_quotes drop constraint generation_paid_quotes_cost_microusd_check;
  alter table public.generation_paid_quotes add constraint generation_paid_quotes_cost_microusd_check check(cost_microusd between 1 and 1030000);
end $$;

-- Preserve the installed 109 delegates once. Never overwrite them on reruns.
do $$ declare n text; s text; d text; begin
  for n,s in select * from (values ('generation_project_access','uuid,uuid'),('generation_free_reserve','uuid'),
    ('free_ai_prepare','uuid,text'),('free_ai_dispatch','uuid,uuid,text'),('free_ai_dispatch_status','uuid,uuid,text')) f(n,s) loop
    if to_regprocedure('public.video_policy_109_'||n||'('||s||')') is null then
      d:=pg_get_functiondef(to_regprocedure('public.'||n||'('||s||')'));
      execute regexp_replace(d,'FUNCTION public\.'||n||'\(', 'FUNCTION public.video_policy_109_'||n||'(');
    end if;
    execute format('revoke all on function public.video_policy_109_%I(%s) from public,anon,authenticated,service_role',n,s);
  end loop;
end $$;

create or replace function public.generation_project_access(p_owner uuid,p_project uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb; free boolean; blocker text;
begin
  b:=public.video_policy_109_generation_project_access(p_owner,p_project);
  -- Old review restricts free funding only. A new paid request has its own
  -- immutable quote, wallet hold and provider exposure reservation.
  free:=(b->>'funding'='free') and (b->>'videoAllowed')::boolean;
  blocker:=case when (b->>'paidGlobalRemainingMicrousd')::bigint<1030000 then 'HIGGSFIELD_GLOBAL_SPENDING_LIMIT'
    when (b->>'paidUserRemainingMicrousd')::bigint<1030000 then 'HIGGSFIELD_USER_SPENDING_LIMIT'
    when (b->>'availableCredits')::bigint<103 then 'INSUFFICIENT_CREDITS' else null end;
  return b||jsonb_build_object('policyVersion',114,'projectAllowed',true,'projectBlocker',null,
    'funding',case when free then 'free' else 'credits' end,'requiredCredits',case when free then 0 else 103 end,
    'shortageCredits',case when free then 0 else greatest(0,103-(b->>'availableCredits')::bigint) end,
    'videoAllowed',free or blocker is null,'paidBlocker',case when free then null else blocker end);
end $$;

create or replace function public.generation_free_reserve(p_run uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.ugc_v3_runs; owner_id uuid; d jsonb; b jsonb;
begin
  select * into r from public.ugc_v3_runs where id=p_run;
  if r.id is null then raise exception 'FREE_RESERVATION_REQUIRED'; end if;
  perform public.generation_free_project_limits(r.project_id);
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=r.project_id;
  -- Match existing financial lock order; all paid admissions serialize here.
  perform 1 from public.generation_paid_policy where singleton for update;
  perform public.free_ai_account(owner_id);
  perform 1 from public.free_ai_accounts where owner_user_id=owner_id for update;
  perform 1 from public.generation_accounts where owner_user_id=owner_id for update;
  if exists(select 1 from public.generation_paid_reservations where run_id=p_run and state='reserved') then return true; end if;
  if exists(select 1 from public.generation_paid_reservations where run_id=p_run) then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  -- Previously admitted free runs keep their original funding during recovery.
  if exists(select 1 from public.free_ai_operations o join public.ugc_v3_tasks t on t.id=o.task_id
    where t.input->>'runId'=p_run::text and t.project_id=r.project_id and t.kind='video')
    or exists(select 1 from public.generation_free_runs where run_id=p_run) then
    return public.video_policy_109_generation_free_reserve(p_run);
  end if;
  b:=public.generation_project_access(owner_id,r.project_id);
  if b->>'funding'='free' then return public.video_policy_109_generation_free_reserve(p_run); end if;
  select document into d from public.ugc_v3_packages where id=r.package_id;
  if r.intent->'body'->>'resolution' is distinct from '480p' or r.intent->'authorization'->>'resolution' is distinct from '480p'
    or (r.intent->'body'->>'duration')::numeric is distinct from 5 or d->'source'->'storyboardContent'->>'durationMs' is distinct from '5000'
    or jsonb_array_length(d->'segments') is distinct from 1 or r.intent->>'model' is distinct from 'bytedance/seedance-2.5/reference-to-video'
    then raise exception 'GENERATION_LIMIT_5S_480P'; end if;
  if r.state<>'queued' or r.observation is not null or r.result is not null then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  if not exists(select 1 from public.generation_paid_quotes where run_id=p_run and owner_user_id=owner_id and project_id=r.project_id
    and body_hash=r.intent->>'bodyHash' and verified_at>now()-interval '5 minutes'
    and cost_microusd<=(r.intent->'authorization'->>'maxEstimatedCostMicrousd')::bigint) then raise exception 'PAID_PROVIDER_PRICE_REQUIRED'; end if;
  perform public.generation_paid_capacity(owner_id,1030000);
  update public.generation_accounts set credit_available=credit_available-103,credit_reserved=credit_reserved+103,updated_at=now()
    where owner_user_id=owner_id and credit_available>=103;
  if not found then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into public.generation_paid_reservations(run_id,owner_user_id,project_id) values(p_run,owner_id,r.project_id);
  insert into public.credit_ledger(owner_user_id,v3_run_id,amount,type,direction,available_delta,reserved_delta,reason,reference_key)
    values(owner_id,p_run,103,'reservation','hold',-103,103,'higgsfield_admission','v3:'||p_run::text||':reservation');
  return true;
end $$;

-- Existing 109 task/phase funding remains unchanged for OpenAI and free video.
-- Paid video is selected by this run's reservation, never today's project flag.
create or replace function public.free_ai_prepare(p_task uuid,p_phase text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; h public.generation_paid_reservations;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.kind<>'video' or not exists(select 1 from public.generation_paid_reservations where run_id=(t.input->>'runId')::uuid) then
    perform public.video_policy_109_free_ai_prepare(p_task,p_phase); return;
  end if;
  if t.status<>'running' or t.lease_token is null or t.lease_until<=now() or t.input->>'referenceCleanupHold'='true' then raise exception 'V3_LEASE_LOST'; end if;
  select * into h from public.generation_paid_reservations where run_id=(t.input->>'runId')::uuid and project_id=t.project_id for update;
  if h.run_id is null or h.state<>'reserved' or h.dispatched_at is not null or p_phase<>'default'
    or h.task_id is not null and (h.task_id,h.lease_token) is distinct from (t.id,t.lease_token) then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  update public.generation_paid_reservations set task_id=t.id,lease_token=t.lease_token where run_id=h.run_id;
end $$;
create or replace function public.free_ai_dispatch(p_task uuid,p_token uuid,p_phase text) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; h public.generation_paid_reservations; r public.ugc_v3_runs;
begin
  select * into t from public.ugc_v3_tasks where id=p_task;
  if t.kind<>'video' or not exists(select 1 from public.generation_paid_reservations where run_id=(t.input->>'runId')::uuid) then
    return public.video_policy_109_free_ai_dispatch(p_task,p_token,p_phase);
  end if;
  select * into t from public.ugc_v3_tasks where id=p_task and status='running' and lease_token=p_token and lease_until>now() for update;
  if t.id is null or not t.provider_started or p_phase<>'default' then raise exception 'V3_LEASE_LOST'; end if;
  select * into h from public.generation_paid_reservations where run_id=(t.input->>'runId')::uuid and project_id=t.project_id;
  -- Match settlement: acquire the global policy lock before the receipt lock.
  perform public.generation_paid_capacity(h.owner_user_id,0);
  select * into h from public.generation_paid_reservations where run_id=(t.input->>'runId')::uuid and project_id=t.project_id for update;
  if h.state is distinct from 'reserved' or h.dispatched_at is not null or h.task_id is distinct from p_task or h.lease_token is distinct from p_token then raise exception 'PAID_RESERVATION_REQUIRED'; end if;
  select * into r from public.ugc_v3_runs where id=h.run_id;
  if not exists(select 1 from public.generation_paid_quotes where run_id=r.id and body_hash=r.intent->>'bodyHash' and verified_at>now()-interval '5 minutes'
    and cost_microusd<=(r.intent->'authorization'->>'maxEstimatedCostMicrousd')::bigint) then raise exception 'PAID_PROVIDER_PRICE_REQUIRED'; end if;
  update public.generation_paid_reservations set dispatched_at=now() where run_id=h.run_id;
  return true;
end $$;
create or replace function public.free_ai_dispatch_status(p_task uuid,p_token uuid,p_phase text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare t public.ugc_v3_tasks; dispatched boolean;
begin
  select * into t from public.ugc_v3_tasks where id=p_task and status='running' and lease_token=p_token and lease_until>now();
  if t.id is null then return null; end if;
  if t.kind<>'video' or not exists(select 1 from public.generation_paid_reservations where run_id=(t.input->>'runId')::uuid) then
    return public.video_policy_109_free_ai_dispatch_status(p_task,p_token,p_phase);
  end if;
  select dispatched_at is not null into dispatched from public.generation_paid_reservations
    where run_id=(t.input->>'runId')::uuid and project_id=t.project_id and task_id=t.id and lease_token=p_token;
  return dispatched;
end $$;

-- Keep the installed trigger and every OpenAI branch. Only paid video skips
-- project-free admission, because its run already owns a funded reservation.
do $$ declare d text; begin
  d:=pg_get_functiondef('public.generation_free_task_admit()'::regprocedure);
  if position('video_attempt_114' in d)=0 then
    if position('if new.kind=''video'' then' in d)=0 then raise exception 'Verify 109 task trigger before 114.'; end if;
    d:=replace(d,'if new.kind=''video'' then', E'if new.kind=''video'' then\n    -- video_attempt_114\n    if exists(select 1 from public.generation_paid_reservations where run_id=(new.input->>''runId'')::uuid and project_id=new.project_id) then\n      if tg_op=''INSERT'' then\n        if new.provider_started then raise exception ''PAID_RESERVATION_REQUIRED''; end if;\n      else perform public.free_ai_prepare(new.id,''default''); end if;\n      return new;\n    end if;');
    execute d;
  end if;
  -- Retail video stays 103 credits. A lower real quote is safe; the old
  -- 1020001 lower bound incorrectly rejected provider price reductions.
  d:=pg_get_functiondef('public.generation_paid_quote(uuid,uuid,uuid,text,text,text,bigint)'::regprocedure);
  if position('p_cost not between 1020001 and 1030000' in d)>0 then
    execute replace(d,'p_cost not between 1020001 and 1030000','p_cost not between 1 and 1030000');
  elsif position('p_cost not between 1 and 1030000' in d)=0 then raise exception 'Inspect paid quote policy before 114.'; end if;
end $$;
-- Replaced routines retain existing private/service-only grants and RLS.

-- A legacy unused approval with a smaller ceiling must not swallow an explicit
-- new approval. Append the new immutable authorization; never edit the old one.
do $$ declare d text; needle text; replacement text; begin
  d:=pg_get_functiondef('public.ugc_v3_runtime_action(uuid,uuid,text,jsonb)'::regprocedure);
  needle:='and (a.document->>''expiresAt'')::timestamptz>now() and not exists(select 1 from public.ugc_v3_runs r where r.authorization_id=a.id))';
  replacement:='and (a.document->>''expiresAt'')::timestamptz>now() and not exists(select 1 from public.ugc_v3_runs r where r.authorization_id=a.id) and (a.document->>''maxEstimatedCostMicrousd'')::bigint>=(d->>''maxEstimatedCostMicrousd'')::bigint) /* authority_ceiling_114 */';
  if position(needle in d)>0 then execute replace(d,needle,replacement);
  elsif position('authority_ceiling_114' in d)=0 then raise exception 'Inspect installed authorization idempotency before 114.'; end if;
end $$;
commit;
