-- Manual only after 043. Progress timing only: no job UPDATE/backfill, worker
-- execution, retry/resume, provider call or change to a workflow/accounting gate.
begin;

do $$
declare required record;
begin
  for required in select * from (values
    ('id','uuid'),('status','text'),('pause_reason','text'),('lease_expires_at','timestamp with time zone')
  ) v(column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name='ugc_generation_jobs' and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Processing timing prerequisite missing: ugc_generation_jobs.%',required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.ugc_character_progress_events()') is null
    or not exists(select 1 from pg_catalog.pg_trigger t
      where t.tgrelid=to_regclass('public.ugc_generation_jobs') and t.tgname='ugc_jobs_identity' and not t.tgisinternal) then
    raise exception 'Apply 043 and its job-identity prerequisites before 044.';
  end if;
end; $$;

-- No default/backfill: NULL on old jobs means unknown historical active time,
-- including the already-completed Character job. New inserts initialize at zero.
alter table public.ugc_generation_jobs add column if not exists processing_elapsed_ms bigint;
alter table public.ugc_generation_jobs add column if not exists processing_updated_at timestamptz;
comment on column public.ugc_generation_jobs.processing_elapsed_ms is 'ugc-processing-time-v1-044: accumulated leased processing milliseconds; NULL for historical jobs';
comment on column public.ugc_generation_jobs.processing_updated_at is 'ugc-processing-time-v1-044: start of the current unsettled leased processing segment';
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_generation_jobs'
      and column_name='processing_elapsed_ms' and data_type='bigint')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_generation_jobs'
      and column_name='processing_updated_at' and data_type='timestamp with time zone') then
    raise exception 'Unexpected processing timing column types.';
  end if;
end; $$;
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_processing_time_shape;
alter table public.ugc_generation_jobs add constraint ugc_jobs_processing_time_shape check(
  (processing_elapsed_ms is null and processing_updated_at is null) or
  (processing_elapsed_ms is not null and processing_elapsed_ms between 0 and 9007199254740991
    and (processing_updated_at is null or (status='running' and pause_reason is null and lease_expires_at is not null))));

-- Existing service writes already hold the job lock and enforce claim/lease
-- fencing. Observe their transitions without altering them. Heartbeats settle
-- processing as they happen; pause, release, failure and cancellation freeze it.
-- A late lease recovery can add at most the old lease's remaining lifetime,
-- never the hours/days the development worker was stopped afterward.
create or replace function public.ugc_track_processing_time() returns trigger
language plpgsql set search_path='' as $$
declare observed_at timestamptz:=clock_timestamp(); segment_end timestamptz; delta_ms bigint:=0;
begin
  if tg_op='INSERT' then
    new.processing_elapsed_ms:=0;
  elsif old.processing_elapsed_ms is null then
    -- Never manufacture accurate history for an old job, including on resume.
    new.processing_elapsed_ms:=null;
    new.processing_updated_at:=null;
    return new;
  else
    if old.status='running' and old.pause_reason is null and old.processing_updated_at is not null
      and old.lease_expires_at is not null then
      segment_end:=least(observed_at,old.lease_expires_at);
      delta_ms:=greatest(0,floor(extract(epoch from (segment_end-old.processing_updated_at))*1000))::bigint;
    end if;
    new.processing_elapsed_ms:=old.processing_elapsed_ms+delta_ms;
  end if;
  new.processing_updated_at:=case when new.status='running' and new.pause_reason is null
    and new.lease_expires_at>observed_at then observed_at else null end;
  return new;
end; $$;
revoke all on function public.ugc_track_processing_time() from public,anon,authenticated,service_role;
drop trigger if exists ugc_jobs_processing_time on public.ugc_generation_jobs;
create trigger ugc_jobs_processing_time before insert or update on public.ugc_generation_jobs
  for each row execute function public.ugc_track_processing_time();

-- Existing identity/event triggers, immutable snapshots/history, RLS/grants,
-- claim/heartbeat/recovery functions and financial/provider behavior stay intact.
commit;
