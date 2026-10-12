-- Private intermediate speech. No customer debit or final-video settlement.
begin;
alter table public.generation_jobs add column narration_execution_version integer not null default 0 check(narration_execution_version in (0,1));
alter table public.generation_jobs alter column narration_execution_version set default 1;
alter table public.generation_jobs add column narration_run_id text;
alter table public.generation_jobs add column narration_started_at timestamptz;
alter table public.generation_jobs add column narration_pending_at timestamptz;
alter table public.generation_jobs add column audio_ready_at timestamptz;

create table public.narration_segments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_plans(job_id),
  scene_execution_id uuid not null unique,
  owner_user_id uuid not null, project_id uuid not null,
  scene_order integer not null check(scene_order between 1 and 20),
  text text check(char_length(text) between 1 and 4000 and btrim(text)<>''),
  status text not null check(status in ('pending','generating','completed','failed','skipped')),
  voice_provider text not null check(voice_provider='elevenlabs'), voice_id text not null, model_id text not null,
  configuration jsonb not null check(jsonb_typeof(configuration)='object'),
  expected_duration_ms integer not null check(expected_duration_ms between 1 and 30000),
  actual_duration_ms integer check(actual_duration_ms between 1 and 120000),
  timing_mismatch boolean not null default false,
  character_count integer not null check(character_count between 0 and 4000),
  submission_started_at timestamptz, submission_attempts integer not null default 0 check(submission_attempts between 0 and 3),
  provider_request_id text check(provider_request_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  provider_usage jsonb not null default '{}' check(jsonb_typeof(provider_usage)='object'),
  estimated_provider_cost numeric check(estimated_provider_cost>=0),
  output_asset_id uuid unique, error_code text check(error_code ~ '^[A-Z_]{1,60}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  unique(job_id,scene_order), unique(id,job_id,owner_user_id,project_id),
  foreign key(scene_execution_id,job_id,owner_user_id,project_id) references public.scene_executions(id,job_id,owner_user_id,project_id),
  check((status='skipped' and text is null and character_count=0) or (status<>'skipped' and text is not null and character_count=char_length(text))),
  check(status<>'completed' or (output_asset_id is not null and actual_duration_ms is not null and completed_at is not null)),
  check(status<>'generating' or submission_started_at is not null)
);
create table public.narration_assets (
  id uuid primary key, narration_segment_id uuid not null unique,
  job_id uuid not null, owner_user_id uuid not null, project_id uuid not null,
  storage_key text not null unique, mime_type text not null check(mime_type='audio/mpeg'),
  size_bytes bigint not null check(size_bytes between 1 and 10485760), verified_etag text not null check(char_length(verified_etag)>0),
  duration_ms integer not null check(duration_ms between 1 and 120000),
  sample_rate integer not null check(sample_rate=44100), channels integer not null check(channels in (1,2)),
  created_at timestamptz not null default now(),
  unique(id,narration_segment_id),
  foreign key(narration_segment_id,job_id,owner_user_id,project_id) references public.narration_segments(id,job_id,owner_user_id,project_id)
);
alter table public.narration_segments add foreign key(output_asset_id,id) references public.narration_assets(id,narration_segment_id);
create index narration_segments_job_status on public.narration_segments(job_id,status);
create trigger narration_assets_immutable before update or delete on public.narration_assets for each row execute function public.immutable_accounting_record();

create function public.guard_narration_job() returns trigger language plpgsql set search_path='' as $$
begin
  if new.narration_execution_version<>old.narration_execution_version or
    (old.narration_run_id is not null and new.narration_run_id is distinct from old.narration_run_id) or
    (old.narration_started_at is not null and new.narration_started_at is distinct from old.narration_started_at) or
    (old.audio_ready_at is not null and new.audio_ready_at is distinct from old.audio_ready_at) then raise exception 'Narration provenance is immutable.'; end if;
  if new.audio_ready_at is not null and new.audio_ready_at is distinct from old.audio_ready_at and (new.visuals_ready_at is null or
    not exists(select 1 from public.narration_segments where job_id=new.id) or
    exists(select 1 from public.narration_segments where job_id=new.id and status not in ('completed','skipped'))) then raise exception 'Narration is incomplete.'; end if;
  return new;
end;
$$;
create trigger generation_narration_guard before update on public.generation_jobs for each row execute function public.guard_narration_job();

create function public.claim_narration_generation(p_job_id uuid,p_run_id text,p_configuration jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs; p jsonb; s public.scene_executions; original jsonb; n text; total integer;
begin
  if p_run_id is null or char_length(p_run_id) not between 1 and 200 or
    p_configuration->>'provider' is distinct from 'elevenlabs' or
    p_configuration->>'voiceId' is distinct from 'JBFqnCBsd6RMkjVDRZzb' or
    coalesce(p_configuration->>'modelId','') not in ('eleven_multilingual_v2','eleven_flash_v2_5') or
    p_configuration->>'format' is distinct from 'mp3_44100_128' or
    p_configuration->>'version' is distinct from 'narration-v1-2026-10-12' then return 'invalid'; end if;
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.narration_execution_version<>1 or j.visuals_ready_at is null then return 'invalid'; end if;
  if j.status<>'processing' or j.audio_ready_at is not null then return 'terminal'; end if;
  if not exists(select 1 from public.generation_reservations where job_id=j.id and owner_user_id=j.owner_user_id and state='reserved') then return 'invalid'; end if;
  if j.narration_run_id is not null then return case when j.narration_run_id=p_run_id then 'resumed' else 'duplicate' end; end if;
  if j.current_stage<>'generating' then return 'invalid'; end if;
  select plan into p from public.generation_plans where job_id=j.id and owner_user_id=j.owner_user_id;
  if p is null or (select count(*) from public.scene_executions where job_id=j.id and status in ('completed','skipped'))<>jsonb_array_length(p->'scenePlan') then return 'invalid'; end if;
  select coalesce(sum(char_length(value->>'narration')),0) into total from jsonb_array_elements(p->'scenePlan');
  if (p->>'narrationRequired')::boolean is distinct from (total>0) then return 'invalid'; end if;
  for s in select * from public.scene_executions where job_id=j.id order by scene_order loop
    original := p->'scenePlan'->(s.scene_order-1); n := original->>'narration';
    if (original->>'order')::integer is distinct from s.scene_order or (original->>'durationSeconds')::numeric is distinct from s.duration_seconds or (n is not null and btrim(n)='') then raise exception 'Narration does not match immutable plan.'; end if;
    insert into public.narration_segments(job_id,scene_execution_id,owner_user_id,project_id,scene_order,text,status,voice_provider,voice_id,model_id,configuration,expected_duration_ms,character_count,error_code)
    values(j.id,s.id,j.owner_user_id,j.project_id,s.scene_order,n,case when n is null then 'skipped' else 'pending' end,'elevenlabs',p_configuration->>'voiceId',p_configuration->>'modelId',p_configuration,round(s.duration_seconds*1000)::integer,coalesce(char_length(n),0),case when char_length(n)>500 or total>1000 then 'COST_GUARD' end);
  end loop;
  update public.generation_jobs set current_stage='voice' where id=j.id;
  update public.generation_jobs set narration_run_id=p_run_id,narration_started_at=now() where id=j.id;
  return 'claimed';
end;
$$;

create function public.begin_narration_submission(p_segment_id uuid,p_run_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.narration_segments s set status='generating',submission_started_at=now(),submission_attempts=submission_attempts+1,error_code=null,updated_at=now()
  from public.generation_jobs j where s.id=p_segment_id and j.id=s.job_id and j.narration_run_id=p_run_id and j.status='processing' and j.current_stage='voice'
    and s.status='pending' and (s.error_code is null or s.error_code in ('RATE_LIMIT','MISSING_CREDENTIAL','DATABASE_UNAVAILABLE','OUTPUT_RECOVERY_REQUIRED','DURATION_PROBE_FAILED')) and s.submission_started_at is null and s.submission_attempts<3
    and exists(select 1 from public.generation_reservations r where r.job_id=j.id and r.owner_user_id=j.owner_user_id and r.state='reserved');
  return found;
end;
$$;

create function public.record_narration_response(p_segment_id uuid,p_run_id text,p_request_id text,p_usage jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if jsonb_typeof(p_usage) is distinct from 'object' or octet_length(p_usage::text)>4096 then return false; end if;
  update public.narration_segments s set provider_request_id=coalesce(provider_request_id,p_request_id),provider_usage=p_usage,updated_at=now()
  from public.generation_jobs j where s.id=p_segment_id and j.id=s.job_id and j.narration_run_id=p_run_id and j.status='processing' and s.status='generating';
  return found;
end;
$$;

create function public.record_narration_error(p_segment_id uuid,p_run_id text,p_error text,p_permanent boolean,p_rejected boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_error is null or p_error !~ '^[A-Z_]{1,60}$' or (p_rejected and p_error<>'RATE_LIMIT') then return false; end if;
  update public.narration_segments s set error_code=p_error,
    status=case when p_permanent then 'failed' when p_rejected then 'pending' else s.status end,
    submission_started_at=case when p_rejected then null else s.submission_started_at end,updated_at=now()
  from public.generation_jobs j where s.id=p_segment_id and j.id=s.job_id and j.narration_run_id=p_run_id and j.status='processing'
    and (s.status not in ('completed','skipped','failed') or (s.status='completed' and p_permanent and p_error in ('STORED_AUDIO_MISSING','INVALID_STORED_AUDIO')))
    and (not p_rejected or s.provider_request_id is null);
  return found;
end;
$$;

create function public.complete_narration_segment(p_segment_id uuid,p_run_id text,p_metadata jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.narration_segments; j public.generation_jobs; key text; duration integer;
begin
  select * into s from public.narration_segments where id=p_segment_id for update;
  if not found then return false; end if;
  select * into j from public.generation_jobs where id=s.job_id;
  if j.narration_run_id is distinct from p_run_id or j.status<>'processing' or j.current_stage<>'voice' then return false; end if;
  if s.status='completed' then return true; end if;
  if s.status<>'generating' or not exists(select 1 from public.generation_reservations where job_id=j.id and state='reserved') then return false; end if;
  key := 'users/'||s.owner_user_id||'/projects/'||s.project_id||'/generations/'||s.job_id||'/narration/'||s.id||'.mp3';
  duration := (p_metadata->>'durationMs')::integer;
  insert into public.narration_assets(id,narration_segment_id,job_id,owner_user_id,project_id,storage_key,mime_type,size_bytes,verified_etag,duration_ms,sample_rate,channels)
  values(s.id,s.id,s.job_id,s.owner_user_id,s.project_id,key,'audio/mpeg',(p_metadata->>'sizeBytes')::bigint,p_metadata->>'etag',duration,(p_metadata->>'sampleRate')::integer,(p_metadata->>'channels')::integer);
  update public.narration_segments set status='completed',output_asset_id=s.id,actual_duration_ms=duration,
    timing_mismatch=duration>s.expected_duration_ms+greatest(250,round(s.expected_duration_ms*.1)::integer),error_code=null,completed_at=now(),updated_at=now() where id=s.id;
  return true;
end;
$$;

create function public.finish_narration_generation(p_job_id uuid,p_run_id text) returns text
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.narration_run_id is distinct from p_run_id then return 'invalid'; end if;
  if j.status<>'processing' then return 'terminal'; end if;
  if exists(select 1 from public.narration_segments where job_id=j.id and status='failed') then
    -- Existing terminal trigger restores the original reservation once.
    update public.generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' where id=j.id;
    return 'narration_failed';
  end if;
  if j.audio_ready_at is not null then return 'audio_ready'; end if;
  if exists(select 1 from public.narration_segments where job_id=j.id) and not exists(select 1 from public.narration_segments where job_id=j.id and status not in ('completed','skipped')) then
    update public.generation_jobs set audio_ready_at=now(),narration_pending_at=null where id=j.id;
    return 'audio_ready';
  end if;
  update public.generation_jobs set narration_pending_at=now() where id=j.id;
  return 'narration_pending';
end;
$$;

create function public.narration_dispatch_candidates() returns table(job_id uuid)
language sql security definer set search_path='' as $$
  select id from public.generation_jobs where status='processing' and current_stage='generating' and narration_execution_version=1 and visuals_ready_at is not null and narration_run_id is null order by visuals_ready_at,id limit 25;
$$;

alter table public.narration_segments enable row level security;
alter table public.narration_assets enable row level security;
revoke all on public.narration_segments,public.narration_assets from public,anon,authenticated,service_role;
grant select on public.narration_segments,public.narration_assets to service_role;
revoke all on function public.guard_narration_job(),public.claim_narration_generation(uuid,text,jsonb),public.begin_narration_submission(uuid,text),public.record_narration_response(uuid,text,text,jsonb),public.record_narration_error(uuid,text,text,boolean,boolean),public.complete_narration_segment(uuid,text,jsonb),public.finish_narration_generation(uuid,text),public.narration_dispatch_candidates() from public,anon,authenticated,service_role;
grant execute on function public.claim_narration_generation(uuid,text,jsonb),public.begin_narration_submission(uuid,text),public.record_narration_response(uuid,text,text,jsonb),public.record_narration_error(uuid,text,text,boolean,boolean),public.complete_narration_segment(uuid,text,jsonb),public.finish_narration_generation(uuid,text),public.narration_dispatch_candidates() to service_role;
commit;
