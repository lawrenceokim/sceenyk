-- UGC infrastructure only. No provider execution, assets, charging or dispatch.
-- Apply manually after 035. Transactional and rerunnable for this exact v1 schema.
begin;

do $$
declare required record; relation_name text;
begin
  for required in select * from (values
    ('app_users','id','uuid'), ('projects','id','uuid'), ('projects','owner_user_id','uuid'),
    ('projects','status','text'), ('projects','creation_type','text'), ('projects','ugc_type','text'),
    ('projects','title','text'), ('projects','prompt','text'), ('projects','duration','text'),
    ('projects','aspect_ratio','text'), ('projects','visual_style','text'), ('projects','tone','text'),
    ('project_assets','id','uuid'), ('project_assets','owner_user_id','uuid'),
    ('project_assets','project_id','uuid'), ('project_assets','studio_role','text'),
    ('project_assets','reference_id','uuid'), ('project_assets','removed_from_draft','boolean')
  ) as prerequisites(table_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'UGC job prerequisite missing or incompatible: %.%', required.table_name, required.column_name;
    end if;
  end loop;
  if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='public.projects'::regclass
    and c.contype in ('u','p') and (select array_agg(a.attname::text order by k.ordinality)
      from unnest(c.conkey) with ordinality k(attnum,ordinality)
      join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=array['id','owner_user_id']) then
    raise exception 'The existing owned Project unique key is required.';
  end if;
  foreach relation_name in array array['ugc_generation_jobs','ugc_generation_job_events'] loop
    if to_regclass('public.'||relation_name) is not null and
      obj_description(to_regclass('public.'||relation_name),'pg_class') is distinct from 'sceenyk-ugc-jobs-v1-036' then
      raise exception 'Inspect the pre-existing UGC relation before applying: %', relation_name;
    end if;
  end loop;
end;
$$;

-- Central database graph mirrors lib/ugc-jobs/contract.ts. No arbitrary jumps.
create or replace function public.ugc_job_next_stage(p_stage text) returns text
language sql immutable set search_path='' as $$
  select case p_stage
    when 'queued' then 'validate_inputs' when 'validate_inputs' then 'analyze_references'
    when 'analyze_references' then 'character_reference' when 'character_reference' then 'product_reference'
    when 'product_reference' then 'build_storyboard' when 'build_storyboard' then 'build_generation_package'
    when 'build_generation_package' then 'cost_review' when 'cost_review' then 'awaiting_confirmation'
    when 'awaiting_confirmation' then 'video_generation' when 'video_generation' then 'finalizing'
    when 'finalizing' then 'complete' end;
$$;

create or replace function public.ugc_job_error_message(p_code text) returns text
language sql immutable set search_path='' as $$
  select case p_code
    when 'STAGE_NOT_IMPLEMENTED' then 'This stage is not implemented yet. The job stopped safely.'
    when 'WORKER_INTERRUPTED' then 'The local worker stopped before this stage finished.'
    when 'WORKER_ERROR' then 'The local worker could not finish this stage.'
    when 'LEASE_EXPIRED' then 'The local worker stopped responding. Safe recovery was scheduled.'
    when 'ATTEMPTS_EXHAUSTED' then 'The job reached its retry limit and stopped safely.'
    when 'PROJECT_UNAVAILABLE' then 'The project is no longer available for this workflow.'
    when 'RECONCILIATION_REQUIRED' then 'This interrupted stage needs review before it can run again.' end;
$$;

create table if not exists public.ugc_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  project_id uuid not null,
  idempotency_key uuid not null,
  status text not null default 'queued' check(status in ('queued','running','awaiting_confirmation','completed','failed','cancelled')),
  stage text not null default 'queued' check(stage in ('queued','validate_inputs','analyze_references','character_reference',
    'product_reference','build_storyboard','build_generation_package','cost_review','awaiting_confirmation',
    'video_generation','finalizing','complete','failed','cancelled')),
  resume_stage text not null default 'validate_inputs' check(resume_stage in ('validate_inputs','analyze_references',
    'character_reference','product_reference','build_storyboard','build_generation_package','cost_review','video_generation','finalizing')),
  attempt_count integer not null default 0 check(attempt_count between 0 and max_attempts),
  max_attempts integer not null default 3 check(max_attempts between 1 and 10),
  retry_eligible boolean not null default false,
  next_retry_at timestamptz,
  worker_id uuid,
  claim_token uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  cancellation_requested_at timestamptz,
  error_code text,
  safe_error_message text,
  provider text check(provider is null or char_length(provider) between 1 and 100),
  provider_job_id text check(provider_job_id is null or char_length(provider_job_id) between 1 and 512),
  input_snapshot jsonb not null check(jsonb_typeof(input_snapshot)='object' and octet_length(input_snapshot::text)<=131072),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  constraint ugc_jobs_owned_project foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict,
  constraint ugc_jobs_idempotency unique(owner_user_id,idempotency_key),
  constraint ugc_jobs_status_stage check(
    (status='queued' and stage='queued') or
    (status='running' and stage in ('validate_inputs','analyze_references','character_reference','product_reference',
      'build_storyboard','build_generation_package','cost_review','video_generation','finalizing')) or
    (status='awaiting_confirmation' and stage='awaiting_confirmation') or
    (status='completed' and stage='complete') or (status='failed' and stage='failed') or
    (status='cancelled' and stage='cancelled')),
  constraint ugc_jobs_claim_state check(
    (status='running' and worker_id is not null and claim_token is not null and claimed_at is not null
      and heartbeat_at is not null and lease_expires_at is not null and started_at is not null) or
    (status<>'running' and worker_id is null and claim_token is null and lease_expires_at is null)),
  constraint ugc_jobs_terminal_times check(
    (status='completed')=(completed_at is not null) and (status='failed')=(failed_at is not null)
    and (status='cancelled')=(cancelled_at is not null)),
  constraint ugc_jobs_error_state check(
    (status='failed' and error_code is not null and safe_error_message is not null
      and public.ugc_job_error_message(error_code) is not null and safe_error_message=public.ugc_job_error_message(error_code)) or
    (status<>'failed' and error_code is null and safe_error_message is null)),
  constraint ugc_jobs_retry_state check(
    (not retry_eligible or (status='failed' and resume_stage='validate_inputs' and attempt_count<max_attempts
      and error_code in ('WORKER_ERROR','WORKER_INTERRUPTED','LEASE_EXPIRED')))
    and (next_retry_at is null or status='queued'))
);
comment on table public.ugc_generation_jobs is 'sceenyk-ugc-jobs-v1-036';
create index if not exists ugc_jobs_queue on public.ugc_generation_jobs(created_at,id) where status='queued';
create index if not exists ugc_jobs_leases on public.ugc_generation_jobs(lease_expires_at,id) where status='running';
create index if not exists ugc_jobs_owner_project on public.ugc_generation_jobs(owner_user_id,project_id,created_at desc,id desc);

create table if not exists public.ugc_generation_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.ugc_generation_jobs(id) on delete restrict,
  status text not null check(status in ('queued','running','awaiting_confirmation','completed','failed','cancelled')),
  stage text not null check(stage in ('queued','validate_inputs','analyze_references','character_reference',
    'product_reference','build_storyboard','build_generation_package','cost_review','awaiting_confirmation',
    'video_generation','finalizing','complete','failed','cancelled')),
  event_type text not null check(event_type in ('enqueued','claimed','stage_changed','failed','completed','cancelled',
    'cancellation_requested','retry_scheduled','released')),
  safe_message text not null,
  metadata jsonb not null,
  created_at timestamptz not null default now()
);
comment on table public.ugc_generation_job_events is 'sceenyk-ugc-jobs-v1-036';
create index if not exists ugc_job_events_order on public.ugc_generation_job_events(job_id,id);

-- No direct browser/service writes: only the narrowly scoped RPCs below.
alter table public.ugc_generation_jobs enable row level security;
alter table public.ugc_generation_job_events enable row level security;
revoke all on table public.ugc_generation_jobs,public.ugc_generation_job_events from public,anon,authenticated,service_role;
revoke all on sequence public.ugc_generation_job_events_id_seq from public,anon,authenticated,service_role;
grant select on table public.ugc_generation_jobs,public.ugc_generation_job_events to service_role;

create or replace function public.ugc_guard_job_identity() returns trigger
language plpgsql set search_path='' as $$
begin
  if row(new.id,new.owner_user_id,new.project_id,new.idempotency_key,new.input_snapshot,new.metadata,
      new.created_at,new.max_attempts,new.provider,new.provider_job_id)
    is distinct from row(old.id,old.owner_user_id,old.project_id,old.idempotency_key,old.input_snapshot,old.metadata,
      old.created_at,old.max_attempts,old.provider,old.provider_job_id) then
    raise exception 'UGC identity, snapshot and reserved provider fields are immutable.' using errcode='23514';
  end if;
  if old.status in ('completed','cancelled') then
    raise exception 'Terminal UGC jobs cannot change.' using errcode='23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists ugc_jobs_identity on public.ugc_generation_jobs;
create trigger ugc_jobs_identity before update on public.ugc_generation_jobs for each row execute function public.ugc_guard_job_identity();

create or replace function public.ugc_append_job_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_kind text; message text;
begin
  if tg_op='INSERT' then event_kind:='enqueued';
  elsif new.status='queued' and old.status='failed' then event_kind:='retry_scheduled';
  elsif new.status='queued' and old.status='running' then event_kind:='released';
  elsif new.status='running' and old.status='queued' then event_kind:='claimed';
  elsif new.status='failed' and old.status<>'failed' then event_kind:='failed';
  elsif new.status='cancelled' and old.status<>'cancelled' then event_kind:='cancelled';
  elsif new.status='completed' and old.status<>'completed' then event_kind:='completed';
  elsif new.cancellation_requested_at is distinct from old.cancellation_requested_at then event_kind:='cancellation_requested';
  elsif new.stage is distinct from old.stage then event_kind:='stage_changed';
  else return new; end if; -- Heartbeats update the job, not an endless history.
  message := case event_kind
    when 'enqueued' then 'Job queued for the local worker.' when 'claimed' then 'Local worker claimed this job.'
    when 'failed' then new.safe_error_message when 'cancelled' then 'Job cancelled at a safe boundary.'
    when 'completed' then 'Job completed.' when 'retry_scheduled' then 'A bounded safe retry was scheduled.'
    when 'released' then 'Local worker released safe unfinished work.'
    when 'cancellation_requested' then 'Cancellation requested.' else 'Workflow stage changed.' end;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(new.id,new.status,new.stage,event_kind,message,
      jsonb_build_object('attempt',new.attempt_count,'resumeStage',new.resume_stage));
  return new;
end;
$$;
drop trigger if exists ugc_jobs_event on public.ugc_generation_jobs;
create trigger ugc_jobs_event after insert or update on public.ugc_generation_jobs for each row execute function public.ugc_append_job_event();
create or replace function public.ugc_reject_event_mutation() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'UGC job history is append-only.' using errcode='23514'; end;
$$;
drop trigger if exists ugc_events_append_only on public.ugc_generation_job_events;
create trigger ugc_events_append_only before update or delete on public.ugc_generation_job_events
  for each row execute function public.ugc_reject_event_mutation();

create or replace function public.ugc_enqueue_job(p_owner_user_id uuid,p_project_id uuid,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; p public.projects; snapshot jsonb;
begin
  if p_owner_user_id is null or p_project_id is null or p_idempotency_key is null then return null; end if;
  -- Existing request identity always returns its frozen input, even after edits.
  select * into j from public.ugc_generation_jobs where owner_user_id=p_owner_user_id and idempotency_key=p_idempotency_key;
  if found then
    if j.project_id<>p_project_id then raise exception 'UGC request identity conflict.' using errcode='23514'; end if;
    return to_jsonb(j);
  end if;
  select * into p from public.projects where id=p_project_id and owner_user_id=p_owner_user_id
    and status='draft' and creation_type='ugc' for update;
  if not found then return null; end if;
  -- Infrastructure snapshot only; complete source/readiness validation is M3.
  snapshot := jsonb_build_object('schemaVersion',1,'readiness','not_validated','projectTitle',p.title,
    'creationType',p.creation_type,'ugcType',p.ugc_type,'sceneDescription',p.prompt,
    'settings',jsonb_build_object('duration',p.duration,'aspectRatio',p.aspect_ratio,'visualStyle',p.visual_style,'tone',p.tone),
    'narration',jsonb_build_object('mode','prompt'),
    'references',(select coalesce(jsonb_agg(jsonb_build_object('assetId',a.id,'referenceId',a.reference_id,'role',a.studio_role) order by a.id),'[]'::jsonb)
      from public.project_assets a where a.project_id=p.id and a.owner_user_id=p_owner_user_id
        and a.studio_role in ('character','product') and not a.removed_from_draft));
  insert into public.ugc_generation_jobs(owner_user_id,project_id,idempotency_key,input_snapshot)
    values(p_owner_user_id,p_project_id,p_idempotency_key,snapshot) on conflict(owner_user_id,idempotency_key) do nothing;
  select * into j from public.ugc_generation_jobs where owner_user_id=p_owner_user_id and idempotency_key=p_idempotency_key;
  if j.project_id<>p_project_id then raise exception 'UGC request identity conflict.' using errcode='23514'; end if;
  return to_jsonb(j);
end;
$$;

create or replace function public.ugc_claim_job(p_worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; failure text; can_retry boolean;
begin
  if p_worker_id is null then return null; end if;
  -- Bounded recovery is part of polling; no external cron or hosted dispatcher.
  for j in select * from public.ugc_generation_jobs where status='running' and lease_expires_at<=clock_timestamp()
    order by lease_expires_at,id for update skip locked limit 25 loop
    if j.cancellation_requested_at is not null then
      update public.ugc_generation_jobs set status='cancelled',stage='cancelled',cancelled_at=clock_timestamp(),
        worker_id=null,claim_token=null,lease_expires_at=null where id=j.id;
    else
      can_retry := j.stage='validate_inputs' and j.attempt_count<j.max_attempts;
      failure := case when j.stage<>'validate_inputs' then 'RECONCILIATION_REQUIRED'
        when j.attempt_count>=j.max_attempts then 'ATTEMPTS_EXHAUSTED' else 'LEASE_EXPIRED' end;
      update public.ugc_generation_jobs set status='failed',resume_stage=j.stage,stage='failed',failed_at=clock_timestamp(),
        error_code=failure,safe_error_message=public.ugc_job_error_message(failure),retry_eligible=can_retry,
        worker_id=null,claim_token=null,lease_expires_at=null where id=j.id;
      if can_retry then
        update public.ugc_generation_jobs set status='queued',stage='queued',failed_at=null,error_code=null,
          safe_error_message=null,retry_eligible=false,next_retry_at=clock_timestamp()+interval '5 seconds' where id=j.id;
      end if;
    end if;
  end loop;
  -- Deleted projects never leave queued work invisible forever. Later draft
  -- edits/type switches do not rewrite or invalidate this request's snapshot.
  for j in select * from public.ugc_generation_jobs q where q.status='queued' and not exists(
      select 1 from public.projects p where p.id=q.project_id and p.owner_user_id=q.owner_user_id and p.status='draft')
    order by q.created_at,q.id for update skip locked limit 25 loop
    update public.ugc_generation_jobs set status='failed',stage='failed',failed_at=clock_timestamp(),next_retry_at=null,
      error_code='PROJECT_UNAVAILABLE',safe_error_message=public.ugc_job_error_message('PROJECT_UNAVAILABLE') where id=j.id;
  end loop;
  select q.* into j from public.ugc_generation_jobs q where q.status='queued' and q.attempt_count<q.max_attempts
    and (q.next_retry_at is null or q.next_retry_at<=clock_timestamp())
    and exists(select 1 from public.projects p where p.id=q.project_id and p.owner_user_id=q.owner_user_id and p.status='draft')
    order by q.created_at,q.id for update skip locked limit 1;
  if not found then return null; end if;
  update public.ugc_generation_jobs set status='running',stage=resume_stage,attempt_count=attempt_count+1,
    worker_id=p_worker_id,claim_token=gen_random_uuid(),claimed_at=clock_timestamp(),heartbeat_at=clock_timestamp(),
    lease_expires_at=clock_timestamp()+interval '90 seconds',started_at=coalesce(started_at,clock_timestamp()),next_retry_at=null
    where id=j.id returning * into j;
  return to_jsonb(j);
end;
$$;

create or replace function public.ugc_update_claim(p_job_id uuid,p_claim_token uuid,p_expected_stage text,
  p_operation text,p_error_code text default null,p_retryable boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; next_stage text; failure text; can_retry boolean;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or p_claim_token is null or j.claim_token is distinct from p_claim_token
    or j.lease_expires_at<=clock_timestamp() then return null; end if;
  -- A lost successful advance response may be replayed without a second event.
  if j.stage is distinct from p_expected_stage then
    if p_operation='advance' and j.stage=public.ugc_job_next_stage(p_expected_stage) then return to_jsonb(j); end if;
    return null;
  end if;
  if p_operation not in ('heartbeat','advance','fail','release','cancel') or p_operation is null then
    raise exception 'Invalid UGC worker operation.' using errcode='23514';
  end if;
  if p_operation='heartbeat' then
    update public.ugc_generation_jobs set heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds'
      where id=j.id returning * into j;
    return to_jsonb(j);
  end if;
  if j.cancellation_requested_at is not null then
    update public.ugc_generation_jobs set status='cancelled',stage='cancelled',cancelled_at=clock_timestamp(),
      worker_id=null,claim_token=null,lease_expires_at=null where id=j.id returning * into j;
    return to_jsonb(j);
  end if;
  if not exists(select 1 from public.projects p where p.id=j.project_id and p.owner_user_id=j.owner_user_id and p.status='draft') then
    p_operation:='fail';p_error_code:='PROJECT_UNAVAILABLE';p_retryable:=false;
  end if;
  if p_operation='cancel' then return null; end if; -- Requires an owner's persisted request.
  if p_operation='advance' then
    next_stage:=public.ugc_job_next_stage(j.stage);
    if next_stage is null or next_stage in ('video_generation','complete') then
      -- Future confirmation/output/accounting RPCs must implement these gates.
      raise exception 'UGC confirmation or output finalization is not connected.' using errcode='23514';
    end if;
    update public.ugc_generation_jobs set stage=next_stage,
      status=case when next_stage='awaiting_confirmation' then 'awaiting_confirmation' else 'running' end,
      resume_stage=case when next_stage='awaiting_confirmation' then resume_stage else next_stage end,
      worker_id=case when next_stage='awaiting_confirmation' then null else worker_id end,
      claim_token=case when next_stage='awaiting_confirmation' then null else claim_token end,
      lease_expires_at=case when next_stage='awaiting_confirmation' then null else lease_expires_at end
      where id=j.id returning * into j;
  elsif p_operation='release' and j.stage='validate_inputs' and j.attempt_count<j.max_attempts then
    update public.ugc_generation_jobs set status='queued',stage='queued',resume_stage=j.stage,
      next_retry_at=clock_timestamp()+interval '5 seconds',worker_id=null,claim_token=null,lease_expires_at=null
      where id=j.id returning * into j;
  else
    failure:=case when p_operation='release' and j.stage<>'validate_inputs' then 'RECONCILIATION_REQUIRED'
      when p_operation='release' then 'ATTEMPTS_EXHAUSTED' else p_error_code end;
    if failure is null or public.ugc_job_error_message(failure) is null then
      raise exception 'Invalid safe UGC failure code.' using errcode='23514';
    end if;
    can_retry:=coalesce(p_retryable,false) and j.stage='validate_inputs' and j.attempt_count<j.max_attempts
      and failure in ('WORKER_ERROR','WORKER_INTERRUPTED','LEASE_EXPIRED');
    update public.ugc_generation_jobs set status='failed',stage='failed',resume_stage=j.stage,
      failed_at=clock_timestamp(),error_code=failure,safe_error_message=public.ugc_job_error_message(failure),
      retry_eligible=can_retry,worker_id=null,claim_token=null,lease_expires_at=null where id=j.id returning * into j;
  end if;
  return to_jsonb(j);
end;
$$;

create or replace function public.ugc_cancel_owned_job(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id and owner_user_id=p_owner_user_id and project_id=p_project_id for update;
  if not found then return null; end if;
  if j.status='cancelled' then return to_jsonb(j); end if;
  if j.status in ('failed','completed') then return null; end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_user_id=p_owner_user_id and status='draft') then return null; end if;
  if j.cancellation_requested_at is not null then return to_jsonb(j); end if;
  update public.ugc_generation_jobs set cancellation_requested_at=clock_timestamp(),
    status=case when status in ('queued','awaiting_confirmation') then 'cancelled' else status end,
    stage=case when status in ('queued','awaiting_confirmation') then 'cancelled' else stage end,
    cancelled_at=case when status in ('queued','awaiting_confirmation') then clock_timestamp() else null end,
    next_retry_at=null where id=j.id returning * into j;
  return to_jsonb(j);
end;
$$;

create or replace function public.ugc_retry_owned_job(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id and owner_user_id=p_owner_user_id and project_id=p_project_id for update;
  if not found then return null; end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_user_id=p_owner_user_id and status='draft') then return null; end if;
  if j.status='queued' then return to_jsonb(j); end if;
  if j.status<>'failed' or not j.retry_eligible or j.attempt_count>=j.max_attempts or j.resume_stage<>'validate_inputs'
    or j.cancellation_requested_at is not null then return null; end if;
  update public.ugc_generation_jobs set status='queued',stage='queued',failed_at=null,error_code=null,
    safe_error_message=null,retry_eligible=false,next_retry_at=clock_timestamp()+interval '5 seconds'
    where id=j.id returning * into j;
  return to_jsonb(j);
end;
$$;

-- Explicit allowlist; PostgreSQL otherwise grants new functions PUBLIC execute.
revoke all on function public.ugc_job_next_stage(text),public.ugc_job_error_message(text),
  public.ugc_guard_job_identity(),public.ugc_append_job_event(),public.ugc_reject_event_mutation(),
  public.ugc_enqueue_job(uuid,uuid,uuid),public.ugc_claim_job(uuid),
  public.ugc_update_claim(uuid,uuid,text,text,text,boolean),public.ugc_cancel_owned_job(uuid,uuid,uuid),
  public.ugc_retry_owned_job(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ugc_job_next_stage(text),public.ugc_job_error_message(text),
  public.ugc_enqueue_job(uuid,uuid,uuid),public.ugc_claim_job(uuid),
  public.ugc_update_claim(uuid,uuid,text,text,text,boolean),public.ugc_cancel_owned_job(uuid,uuid,uuid),
  public.ugc_retry_owned_job(uuid,uuid,uuid) to service_role;
commit;
