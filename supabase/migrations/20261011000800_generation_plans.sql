-- Understanding/planning only. Preserve admission, pricing and settlement.
begin;

alter table public.generation_jobs add column production_plan_ready_at timestamptz;

create table public.generation_plans (
  job_id uuid primary key,
  owner_user_id uuid not null,
  schema_version integer not null check (schema_version=1),
  provider text not null check (provider='gemini'),
  model text not null check (char_length(model) between 1 and 150),
  plan jsonb not null check (jsonb_typeof(plan)='object' and octet_length(plan::text)<=262144),
  created_at timestamptz not null default now(),
  foreign key(job_id,owner_user_id) references public.generation_jobs(id,owner_user_id) on delete restrict
);
create table public.generation_analysis_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  owner_user_id uuid not null,
  worker_run_id text not null,
  attempt integer not null check (attempt between 1 and 2),
  provider text not null default 'gemini' check (provider='gemini'),
  requested_model text not null check (char_length(requested_model) between 1 and 150),
  model text,
  state text not null default 'started' check (state in ('started','succeeded','failed','invalid')),
  failure_code text check (failure_code in ('TIMEOUT','RATE_LIMIT','PROVIDER_UNAVAILABLE','INVALID_OUTPUT','UNSUPPORTED_MEDIA','MEDIA_UNAVAILABLE','PROVIDER_REJECTED','UNCERTAIN_ATTEMPT','CONFIGURATION_MISSING')),
  response_id text check (char_length(response_id)<=200),
  usage jsonb check (jsonb_typeof(usage)='object' and octet_length(usage::text)<=32768),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(job_id,attempt),
  foreign key(job_id,owner_user_id) references public.generation_jobs(id,owner_user_id) on delete restrict,
  check ((state='started' and finished_at is null and failure_code is null) or
    (state='succeeded' and finished_at is not null and failure_code is null and usage is not null) or
    (state in ('failed','invalid') and finished_at is not null and failure_code is not null))
);
create trigger generation_plans_immutable before update or delete on public.generation_plans for each row execute function public.immutable_accounting_record();

create function public.guard_analysis_attempt() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.state<>'started' or new.state='started' or
    row(new.id,new.job_id,new.owner_user_id,new.worker_run_id,new.attempt,new.provider,new.requested_model,new.started_at)
      is distinct from row(old.id,old.job_id,old.owner_user_id,old.worker_run_id,old.attempt,old.provider,old.requested_model,old.started_at) then
    raise exception 'Analysis history is immutable.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger generation_analysis_attempt_guard before update or delete on public.generation_analysis_attempts for each row execute function public.guard_analysis_attempt();

create function public.guard_production_plan_ready() returns trigger language plpgsql set search_path='' as $$
begin
  if old.production_plan_ready_at is not null and new.production_plan_ready_at is distinct from old.production_plan_ready_at then
    raise exception 'Plan readiness is immutable.' using errcode='23514';
  end if;
  if new.production_plan_ready_at is not null and not exists(select 1 from public.generation_plans p where p.job_id=new.id and p.owner_user_id=new.owner_user_id) then
    raise exception 'A persisted plan is required.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger generation_plan_ready_guard before update on public.generation_jobs for each row execute function public.guard_production_plan_ready();

-- Authoritative claim validation still uses the original 005 + 006 checks.
-- Same-run retries may now resume either AI stage; different runs cannot claim.
create or replace function public.claim_generation_job(p_job_id uuid,p_run_id text) returns text
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs; result text;
begin
  if p_run_id is null or char_length(p_run_id) not between 1 and 200 then return 'invalid'; end if;
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then return 'missing'; end if;
  if j.status in ('completed','failed') then return 'terminal'; end if;
  if j.accounting_version=0 and j.status='queued' then
    update public.generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' where id=j.id;
    return 'invalid';
  end if;
  if j.accounting_version=1 and not exists(select 1 from public.generation_reservations r where r.job_id=j.id and r.owner_user_id=j.owner_user_id and r.state='reserved') then return 'invalid'; end if;
  result := public.claim_generation_job_before_accounting(p_job_id,p_run_id);
  if result='duplicate' and j.worker_run_id=p_run_id and j.status='processing' and j.current_stage in ('analyzing','planning') then return 'resumed'; end if;
  return result;
end;
$$;

create function public.advance_generation_analysis(p_job_id uuid,p_run_id text,p_stage text) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.worker_run_id is distinct from p_run_id or j.status<>'processing' then return false; end if;
  if p_stage not in ('analyzing','planning') or j.current_stage not in ('preparing','analyzing','planning') then return false; end if;
  if j.production_plan_ready_at is not null then return true; end if;
  if j.current_stage=p_stage or (j.current_stage='planning' and p_stage='analyzing') then return true; end if;
  update public.generation_jobs set current_stage=p_stage where id=j.id;
  return true;
end;
$$;

create function public.begin_generation_analysis(p_job_id uuid,p_run_id text,p_attempt integer,p_model text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs; a public.generation_analysis_attempts;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.worker_run_id is distinct from p_run_id or j.status<>'processing' or j.current_stage not in ('analyzing','planning') then return jsonb_build_object('code','INVALID'); end if;
  if exists(select 1 from public.generation_plans p where p.job_id=j.id) then return jsonb_build_object('code','READY'); end if;
  if p_attempt not between 1 and 2 or p_attempt is null or p_model is null then return jsonb_build_object('code','INVALID'); end if;
  select * into a from public.generation_analysis_attempts where job_id=j.id and attempt=p_attempt;
  if found then return jsonb_build_object('code',case when a.state='started' then 'UNCERTAIN' else upper(a.state) end); end if;
  if p_attempt=2 and not exists(select 1 from public.generation_analysis_attempts where job_id=j.id and attempt=1 and state in ('failed','invalid') and failure_code in ('RATE_LIMIT','PROVIDER_UNAVAILABLE','INVALID_OUTPUT')) then return jsonb_build_object('code','INVALID'); end if;
  insert into public.generation_analysis_attempts(job_id,owner_user_id,worker_run_id,attempt,requested_model)
    values(j.id,j.owner_user_id,p_run_id,p_attempt,p_model) returning * into a;
  return jsonb_build_object('code','STARTED','attempt_id',a.id);
end;
$$;

-- Only trusted server code can submit a Zod-validated plan. SQL additionally
-- ties settings, source IDs and provenance to the immutable admitted snapshot.
create function public.finish_generation_analysis(p_job_id uuid,p_run_id text,p_attempt_id uuid,p_plan jsonb,p_usage jsonb,p_model text,p_response_id text,p_failure text) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs; a public.generation_analysis_attempts; s jsonb;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.worker_run_id is distinct from p_run_id then return false; end if;
  select * into a from public.generation_analysis_attempts where id=p_attempt_id and job_id=j.id and worker_run_id=p_run_id for update;
  if not found then return false; end if;
  if a.state<>'started' then return (a.state='succeeded' and exists(select 1 from public.generation_plans p where p.job_id=j.id and p.plan=p_plan)) or (a.failure_code=p_failure and p_plan is null); end if;
  if p_plan is not null then
    if j.status<>'processing' or j.current_stage not in ('analyzing','planning') or p_failure is not null or p_usage is null or p_model is null then return false; end if;
    if p_plan->'schemaVersion'<>'1'::jsonb or (p_plan->>'targetDuration')::numeric<>(j.input_snapshot->'settings'->>'duration')::numeric or
      p_plan->>'aspectRatio' is distinct from j.input_snapshot->'settings'->>'aspectRatio' or
      p_plan->>'tone' is distinct from j.input_snapshot->'settings'->>'tone' or
      p_plan->>'visualStyle' is distinct from j.input_snapshot->'settings'->>'visualStyle' or
      jsonb_typeof(p_plan->'scenePlan') is distinct from 'array' or jsonb_array_length(p_plan->'scenePlan') not between 1 and 20 then raise exception 'Invalid production plan.' using errcode='23514'; end if;
    for s in select value from jsonb_array_elements(p_plan->'scenePlan') loop
      if s->>'source' not in ('original','transformed','generated') or
        (s->>'source'='generated' and s->'assetId'<>'null'::jsonb) or
        (s->>'source'<>'generated' and not exists(select 1 from public.project_assets x where x.id=(s->>'assetId')::uuid and x.owner_user_id=j.owner_user_id and x.project_id=j.project_id and x.upload_status='uploaded' and x.verified_etag is not null and j.input_snapshot->'assetIds' ? x.id::text)) then
        raise exception 'Invalid plan source.' using errcode='23514';
      end if;
    end loop;
    insert into public.generation_plans(job_id,owner_user_id,schema_version,provider,model,plan) values(j.id,j.owner_user_id,1,'gemini',p_model,p_plan);
    -- One forward stage transition; readiness-only update does not trigger the
    -- original transition guard, and cannot be written through table grants.
    if j.current_stage='analyzing' then update public.generation_jobs set current_stage='planning' where id=j.id; end if;
    update public.generation_jobs set production_plan_ready_at=now() where id=j.id;
  elsif p_failure is null then return false;
  end if;
  update public.generation_analysis_attempts set state=case when p_plan is not null then 'succeeded' when p_failure='INVALID_OUTPUT' then 'invalid' else 'failed' end,
    failure_code=p_failure,usage=p_usage,model=p_model,response_id=p_response_id,finished_at=now() where id=a.id;
  return true;
end;
$$;

create or replace function public.fail_generation_claim(p_job_id uuid,p_run_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.'
  where id=p_job_id and worker_run_id=p_run_id and status='processing' and current_stage in ('preparing','analyzing','planning') and production_plan_ready_at is null;
  return found;
end;
$$;
create or replace function public.expire_generation_claims() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  with stale as(select id from public.generation_jobs where status='processing' and current_stage in ('preparing','analyzing','planning') and production_plan_ready_at is null and dispatch_status='claimed'
    and worker_started_at<now()-interval '15 minutes' order by worker_started_at,id limit 25 for update skip locked)
  update public.generation_jobs g set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' from stale where g.id=stale.id;
  get diagnostics affected=row_count;
  return affected;
end;
$$;

alter table public.generation_plans enable row level security;
alter table public.generation_analysis_attempts enable row level security;
revoke all on public.generation_plans,public.generation_analysis_attempts from public,anon,authenticated,service_role;
grant select on public.generation_plans,public.generation_analysis_attempts to service_role;
revoke all on function public.guard_analysis_attempt(),public.guard_production_plan_ready(),public.advance_generation_analysis(uuid,text,text),public.begin_generation_analysis(uuid,text,integer,text),public.finish_generation_analysis(uuid,text,uuid,jsonb,jsonb,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.advance_generation_analysis(uuid,text,text),public.begin_generation_analysis(uuid,text,integer,text),public.finish_generation_analysis(uuid,text,uuid,jsonb,jsonb,text,text,text) to service_role;
commit;
