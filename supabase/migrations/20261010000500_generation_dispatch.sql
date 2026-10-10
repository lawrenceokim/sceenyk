-- Transactional outbox and trusted worker boundary. Apply after migration 004.
begin;

alter table public.generation_jobs
  add column dispatch_status text not null default 'pending' check (dispatch_status in ('pending','dispatched','claimed','dispatch_failed')),
  add column dispatch_attempts integer not null default 0 check (dispatch_attempts >= 0),
  add column last_dispatch_at timestamptz,
  add column dispatched_at timestamptz,
  add column dispatch_error text check (dispatch_error = 'SEND_FAILED'),
  add column worker_run_id text check (char_length(worker_run_id) between 1 and 200),
  add column worker_started_at timestamptz,
  add constraint generation_jobs_dispatch_state check (
    (dispatch_status = 'claimed' and worker_run_id is not null and worker_started_at is not null and status in ('processing','failed','completed') and dispatch_error is null)
    or (dispatch_status <> 'claimed' and worker_run_id is null and worker_started_at is null)
  ),
  add constraint generation_jobs_dispatch_attempt_state check (
    (dispatch_attempts = 0 and last_dispatch_at is null and dispatched_at is null and dispatch_status = 'pending' and dispatch_error is null)
    or (dispatch_attempts > 0 and last_dispatch_at is not null)
    or (dispatch_status = 'claimed' and dispatch_attempts = 0 and last_dispatch_at is null)
  ),
  add constraint generation_jobs_dispatch_error_state check (
    (dispatch_status = 'dispatch_failed' and dispatch_error = 'SEND_FAILED')
    or (dispatch_status <> 'dispatch_failed' and dispatch_error is null)
  );

create index generation_jobs_dispatch_recovery_idx on public.generation_jobs(last_dispatch_at nulls first, created_at, id) where status = 'queued';
create index generation_jobs_stale_claim_idx on public.generation_jobs(worker_started_at, id) where status = 'processing' and dispatch_status = 'claimed';

-- Preserve 004's immutable identity and transition rules, allowing outbox-only
-- writes without pretending that dispatch is a generation-stage transition.
drop trigger generation_jobs_guard on public.generation_jobs;
create trigger generation_jobs_insert_guard before insert on public.generation_jobs for each row execute function public.guard_generation_job();
create trigger generation_jobs_update_guard before update on public.generation_jobs for each row
when (row(new.id,new.owner_user_id,new.project_id,new.request_id,new.input_snapshot,new.status,new.current_stage,new.error_code,new.error_message,new.started_at,new.completed_at,new.failed_at,new.created_at)
  is distinct from row(old.id,old.owner_user_id,old.project_id,old.request_id,old.input_snapshot,old.status,old.current_stage,old.error_code,old.error_message,old.started_at,old.completed_at,old.failed_at,old.created_at))
execute function public.guard_generation_job();

create function public.guard_generation_dispatch() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.dispatch_status <> 'pending' or new.dispatch_attempts <> 0 or new.last_dispatch_at is not null or new.dispatched_at is not null or new.dispatch_error is not null or new.worker_run_id is not null or new.worker_started_at is not null then
      raise exception 'Dispatch must start pending.' using errcode = '23514';
    end if;
  else
    if old.status in ('completed','failed') then raise exception 'Terminal generation is immutable.' using errcode = '23514'; end if;
    if old.worker_run_id is not null and row(new.worker_run_id,new.worker_started_at,new.dispatch_status) is distinct from row(old.worker_run_id,old.worker_started_at,old.dispatch_status) then
      raise exception 'Worker claim is immutable.' using errcode = '23514';
    end if;
    if new.dispatch_attempts < old.dispatch_attempts then raise exception 'Dispatch attempts cannot decrease.' using errcode = '23514'; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger generation_jobs_dispatch_guard before insert or update on public.generation_jobs for each row execute function public.guard_generation_dispatch();

-- SECURITY DEFINER grants are deliberately restricted to service_role below.
-- No browser endpoint exposes these RPCs; the caller is trusted server code.
create function public.reserve_generation_dispatch(p_job_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare attempt integer;
begin
  update public.generation_jobs set dispatch_attempts = dispatch_attempts + 1,
    last_dispatch_at = now(), dispatch_status = 'pending', dispatch_error = null
  where id = p_job_id and status = 'queued' and worker_run_id is null
    and (last_dispatch_at is null or last_dispatch_at <= now() - interval '2 minutes')
  returning dispatch_attempts into attempt;
  return coalesce(attempt,0);
end;
$$;

create function public.acknowledge_generation_dispatch(p_job_id uuid, p_attempt integer, p_success boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.generation_jobs set
    dispatch_status = case when p_success then 'dispatched' else 'dispatch_failed' end,
    dispatched_at = case when p_success then now() else dispatched_at end,
    dispatch_error = case when p_success then null else 'SEND_FAILED' end
  where id = p_job_id and status = 'queued' and dispatch_status = 'pending' and dispatch_attempts = p_attempt and p_attempt > 0;
  return found;
end;
$$;

create function public.claim_generation_job(p_job_id uuid, p_run_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare job public.generation_jobs;
begin
  if p_run_id is null or char_length(p_run_id) not between 1 and 200 then return 'invalid'; end if;
  select * into job from public.generation_jobs where id = p_job_id for update;
  if not found then return 'missing'; end if;
  if job.status in ('completed','failed') then return 'terminal'; end if;
  if public.valid_generation_snapshot(job.input_snapshot) is not true
    or not exists (select 1 from public.projects p join public.app_users u on u.id = p.owner_user_id where p.id = job.project_id and p.owner_user_id = job.owner_user_id and char_length(u.clerk_user_id) > 0)
    or exists (select 1 from jsonb_array_elements_text(job.input_snapshot->'assetIds') a(id)
      where not exists (select 1 from public.project_assets p where p.id = a.id::uuid and p.owner_user_id = job.owner_user_id and p.project_id = job.project_id and p.upload_status = 'uploaded' and p.verified_etag is not null)) then
    update public.generation_jobs set status = 'failed', error_code = 'PROCESSING_FAILED', error_message = 'This generation couldn’t be completed. Your saved project is still available.' where id = p_job_id;
    return 'invalid';
  end if;
  if job.worker_run_id is not null then
    if job.worker_run_id = p_run_id and job.status = 'processing' and job.current_stage = 'preparing' then return 'resumed'; end if;
    return 'duplicate';
  end if;
  if job.status <> 'queued' then return 'duplicate'; end if;
  update public.generation_jobs set status = 'processing', current_stage = 'preparing',
    dispatch_status = 'claimed', dispatch_error = null, worker_run_id = p_run_id, worker_started_at = now()
  where id = p_job_id;
  return 'claimed';
end;
$$;

create function public.fail_generation_claim(p_job_id uuid, p_run_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.generation_jobs set status = 'failed', error_code = 'PROCESSING_FAILED',
    error_message = 'This generation couldn’t be completed. Your saved project is still available.'
  where id = p_job_id and worker_run_id = p_run_id and status = 'processing' and current_stage = 'preparing';
  return found;
end;
$$;

create function public.generation_dispatch_candidates() returns table(job_id uuid)
language sql security definer set search_path = '' as $$
  select id from public.generation_jobs where status = 'queued' and worker_run_id is null
    and (last_dispatch_at is null or last_dispatch_at <= now() - interval '2 minutes')
  order by last_dispatch_at nulls first, created_at, id limit 25;
$$;

create function public.expire_generation_claims() returns integer
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with stale as (select id from public.generation_jobs where status = 'processing' and current_stage = 'preparing' and dispatch_status = 'claimed'
    and worker_started_at < now() - interval '15 minutes' order by worker_started_at, id limit 25 for update skip locked)
  update public.generation_jobs g set status = 'failed', error_code = 'PROCESSING_FAILED',
    error_message = 'This generation couldn’t be completed. Your saved project is still available.'
  from stale where g.id = stale.id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Restrict insert fields too: service creation cannot supply dispatch/claim state.
revoke insert on public.generation_jobs from service_role;
grant insert (owner_user_id,project_id,request_id,input_snapshot) on public.generation_jobs to service_role;
revoke all on function public.guard_generation_dispatch(), public.reserve_generation_dispatch(uuid), public.acknowledge_generation_dispatch(uuid,integer,boolean), public.claim_generation_job(uuid,text), public.fail_generation_claim(uuid,text), public.generation_dispatch_candidates(), public.expire_generation_claims() from public, anon, authenticated;
grant execute on function public.guard_generation_dispatch(), public.reserve_generation_dispatch(uuid), public.acknowledge_generation_dispatch(uuid,integer,boolean), public.claim_generation_job(uuid,text), public.fail_generation_claim(uuid,text), public.generation_dispatch_candidates(), public.expire_generation_claims() to service_role;
commit;
