-- Manual application only after 035-038. Analysis only: no sheets or accounting.
-- Run the complete transaction. Preflight failures occur before any DDL.
begin;
do $$
declare required record; analysis_relation_oid oid;
begin
  for required in select * from (values
    ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),
    ('ugc_generation_jobs','project_id','uuid'),('ugc_generation_jobs','input_snapshot','jsonb'),
    ('ugc_generation_jobs','pause_reason','text'),('ugc_generation_jobs','validation_completed_at','timestamp with time zone'),
    ('ugc_generation_jobs','claim_token','uuid'),('ugc_generation_jobs','lease_expires_at','timestamp with time zone'),
    ('ugc_generation_jobs','attempt_count','integer'),('ugc_generation_jobs','max_attempts','integer'),
    ('project_assets','id','uuid'),('project_assets','owner_user_id','uuid'),('project_assets','project_id','uuid'),
    ('project_assets','storage_key','text'),('projects','id','uuid'),('projects','owner_user_id','uuid'),
    ('projects','status','text'),('ugc_generation_job_events','metadata','jsonb')
  ) v(table_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Reference analysis prerequisite missing: %.%',required.table_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.ugc_update_claim_v1(uuid,uuid,text,text,text,boolean)') is null
    or to_regprocedure('public.ugc_snapshot_matches_records(uuid,uuid,jsonb,boolean)') is null then
    raise exception 'Apply migration 037 first.';
  end if;
  -- Resolve once without throwing when absent; Boolean expression order must
  -- never be relied upon to protect a cast of a not-yet-created relation.
  analysis_relation_oid:=to_regclass('public.ugc_reference_analyses');
  if analysis_relation_oid is not null then
    if obj_description(analysis_relation_oid,'pg_class') is distinct from 'sceenyk-ugc-reference-analysis-v1-039' then
      raise exception 'Inspect existing reference analysis table before applying.';
    end if;
  end if;
end; $$;

alter table public.ugc_generation_jobs add column if not exists analysis_version integer;
alter table public.ugc_generation_jobs add column if not exists analysis_model text;
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_analysis_version;
alter table public.ugc_generation_jobs add constraint ugc_jobs_analysis_version check(
  (analysis_version is null and analysis_model is null) or
  (analysis_version is not null and analysis_version=1 and analysis_model is not null and analysis_model ~ '^[a-zA-Z0-9._:-]{1,200}$'));
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_status_stage;
alter table public.ugc_generation_jobs add constraint ugc_jobs_status_stage check(
  (status='queued' and stage in ('queued','analyze_references','character_reference')) or
  (status='running' and stage in ('validate_inputs','analyze_references','character_reference','product_reference',
    'build_storyboard','build_generation_package','cost_review','video_generation','finalizing')) or
  (status='awaiting_confirmation' and stage='awaiting_confirmation') or
  (status='completed' and stage='complete') or (status='failed' and stage='failed') or (status='cancelled' and stage='cancelled'));
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_pause_state;
alter table public.ugc_generation_jobs add constraint ugc_jobs_pause_state check(
  (pause_reason is null and not(status='queued' and stage='character_reference')) or
  (pause_reason is not null and status='queued' and validation_completed_at is not null and
    ((pause_reason='REFERENCE_ANALYSIS_NOT_IMPLEMENTED' and stage='analyze_references') or
     (pause_reason='CHARACTER_REFERENCE_NOT_IMPLEMENTED' and stage='character_reference' and analysis_version is not null and analysis_version=1))));
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_retry_state;
alter table public.ugc_generation_jobs add constraint ugc_jobs_retry_state check(
  (not retry_eligible or (status='failed' and attempt_count<max_attempts and
    ((resume_stage='validate_inputs' and error_code in ('WORKER_ERROR','WORKER_INTERRUPTED','LEASE_EXPIRED')) or
     (resume_stage='analyze_references' and error_code in ('REFERENCE_CONFIG_INVALID','REFERENCE_ASSET_UNAVAILABLE','REFERENCE_AUTH_FAILED','REFERENCE_RATE_LIMITED')))))
  and (next_retry_at is null or status='queued'));

-- Preserve the fixed safe error catalog, extending it without raw provider text.
create or replace function public.ugc_job_error_message(p_code text) returns text
language sql immutable set search_path='' as $$
  select case p_code
    when 'STAGE_NOT_IMPLEMENTED' then 'This stage is not implemented yet. The job stopped safely.'
    when 'WORKER_INTERRUPTED' then 'The local worker stopped before this stage finished.'
    when 'WORKER_ERROR' then 'The local worker could not finish this stage.'
    when 'LEASE_EXPIRED' then 'The local worker stopped responding. Safe recovery was scheduled.'
    when 'ATTEMPTS_EXHAUSTED' then 'The job reached its retry limit and stopped safely.'
    when 'PROJECT_UNAVAILABLE' then 'The project is no longer available for this workflow.'
    when 'RECONCILIATION_REQUIRED' then 'This interrupted stage needs review before it can run again.'
    when 'INPUT_VALIDATION_FAILED' then 'Saved generation inputs or references are no longer valid. Check readiness and prepare a new request.'
    when 'REFERENCE_CONFIG_INVALID' then 'Reference analysis configuration is missing or disabled.'
    when 'REFERENCE_ASSET_UNAVAILABLE' then 'A private reference could not be loaded. Check the saved references.'
    when 'REFERENCE_IMAGE_UNSUPPORTED' then 'A reference image or analysis request is unsupported.'
    when 'REFERENCE_AUTH_FAILED' then 'Reference analysis credentials or model access were rejected.'
    when 'REFERENCE_RATE_LIMITED' then 'Reference analysis reached the provider limit. Retry later.'
    when 'REFERENCE_TIMEOUT' then 'Reference analysis timed out. Review the provider outcome before repeating it.'
    when 'REFERENCE_PROVIDER_FAILED' then 'Reference analysis could not finish. Review the provider outcome before repeating it.'
    when 'REFERENCE_OUTPUT_INVALID' then 'Reference analysis returned an incomplete or invalid result.'
    when 'REFERENCE_REFUSED' then 'The provider declined reference analysis.' end;
$$;

create or replace function public.ugc_valid_reference_analysis(p_role text,p_data jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare fields text[]; field text; observation jsonb;
begin
  if p_role is null or p_role not in ('character','product') then return false; end if;
  fields:=array['schemaVersion','analysisType','subjectVisible','imageQuality','occlusions','limitations'] ||
    case p_role when 'character' then array['visibleAppearance','visualPresentation','hair','facialFeatures','skinAppearance','clothing','accessories','colors','distinguishingVisualTraits','framingAndPose']
    when 'product' then array['category','shape','colors','materialAndFinish','proportions','designFeatures','visibleTextAndLogos','orientationAndView','visibleParts','consistencyDetails','unseenGeometry'] end;
  if fields is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>32768 then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_data) k) is distinct from
    (select array_agg(k order by k) from unnest(fields) k) then return false; end if;
  if p_data->'schemaVersion' is distinct from '1'::jsonb or p_data->>'analysisType' is distinct from p_role
    or p_data->'subjectVisible' is distinct from 'true'::jsonb then return false; end if;
  foreach field in array fields loop
    if field in ('schemaVersion','analysisType','subjectVisible') then continue; end if;
    observation:=p_data->field;
    if jsonb_typeof(observation) is distinct from 'object' then return false; end if;
    if (select array_agg(k order by k) from jsonb_object_keys(observation) k) is distinct from array['certainty','description'] then return false; end if;
    if observation->>'certainty' is null or observation->>'certainty' not in ('observed','uncertain','unknown') then return false; end if;
    if observation->>'certainty'='unknown' then
      if observation->'description' is distinct from 'null'::jsonb then return false; end if;
    elsif jsonb_typeof(observation->'description') is distinct from 'string' or char_length(observation->>'description') not between 1 and 800 then return false;
    end if;
  end loop;
  return p_role<>'product' or p_data->'unseenGeometry'->>'certainty'='unknown';
end; $$;

create table if not exists public.ugc_reference_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  project_id uuid not null,
  job_id uuid not null references public.ugc_generation_jobs(id) on delete restrict,
  source_asset_id uuid not null references public.project_assets(id) on delete restrict,
  analysis_type text not null check(analysis_type in ('character','product')),
  analysis_version integer not null check(analysis_version=1),
  prompt_version text not null check(prompt_version='reference-analysis-v1'),
  provider text not null check(provider='openai'),
  requested_model text not null check(requested_model ~ '^[a-zA-Z0-9._:-]{1,200}$'),
  state text not null check(state in ('submitted','completed','rejected','uncertain')),
  submission_claim_token uuid not null,
  submission_attempt integer not null check(submission_attempt between 1 and 10),
  analysis jsonb,
  usage jsonb check(usage is null or (jsonb_typeof(usage)='object' and octet_length(usage::text)<=2048)),
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict,
  unique(job_id,analysis_type,submission_claim_token),
  check((state='submitted' and analysis is null and usage is null and error_code is null) or
    (state='completed' and public.ugc_valid_reference_analysis(analysis_type,analysis) is true and usage is not null and error_code is null) or
    (state in ('rejected','uncertain') and analysis is null and error_code is not null and error_code in (
      'REFERENCE_AUTH_FAILED','REFERENCE_RATE_LIMITED','REFERENCE_IMAGE_UNSUPPORTED','REFERENCE_TIMEOUT',
      'REFERENCE_PROVIDER_FAILED','REFERENCE_OUTPUT_INVALID','REFERENCE_REFUSED','RECONCILIATION_REQUIRED')))
);
comment on table public.ugc_reference_analyses is 'sceenyk-ugc-reference-analysis-v1-039';
create unique index if not exists ugc_reference_completed on public.ugc_reference_analyses(job_id,analysis_type,analysis_version) where state='completed';
create index if not exists ugc_reference_job on public.ugc_reference_analyses(job_id,analysis_type,created_at);
alter table public.ugc_reference_analyses enable row level security;
revoke all on table public.ugc_reference_analyses from public,anon,authenticated,service_role;
grant select on table public.ugc_reference_analyses to service_role;

create or replace function public.ugc_guard_reference_record() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Reference analysis history cannot be deleted.'; end if;
  if old.state<>'submitted' or row(new.id,new.owner_user_id,new.project_id,new.job_id,new.source_asset_id,new.analysis_type,
    new.analysis_version,new.prompt_version,new.provider,new.requested_model,new.submission_claim_token,new.submission_attempt,new.created_at)
    is distinct from row(old.id,old.owner_user_id,old.project_id,old.job_id,old.source_asset_id,old.analysis_type,
    old.analysis_version,old.prompt_version,old.provider,old.requested_model,old.submission_claim_token,old.submission_attempt,old.created_at) then
    raise exception 'Reference analysis identity and terminal records are immutable.';
  end if;
  new.updated_at:=clock_timestamp(); return new;
end; $$;
drop trigger if exists ugc_reference_identity on public.ugc_reference_analyses;
create trigger ugc_reference_identity before update or delete on public.ugc_reference_analyses for each row execute function public.ugc_guard_reference_record();

create or replace function public.ugc_guard_analysis_version() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.analysis_version is not null and row(new.analysis_version,new.analysis_model) is distinct from row(old.analysis_version,old.analysis_model) then
    raise exception 'Analysis version and requested model are immutable.';
  end if;
  return new;
end; $$;
drop trigger if exists ugc_jobs_analysis_identity on public.ugc_generation_jobs;
create trigger ugc_jobs_analysis_identity before update on public.ugc_generation_jobs for each row execute function public.ugc_guard_analysis_version();

alter table public.ugc_generation_job_events drop constraint if exists ugc_generation_job_events_event_type_check;
alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_event_type_check check(event_type in (
  'enqueued','claimed','stage_changed','failed','completed','cancelled','cancellation_requested','retry_scheduled','released',
  'inputs_validated','development_paused','development_resumed','reference_analyzed'));

-- One durable intent per submission. Lost begin replies never authorize resubmit.
create or replace function public.ugc_begin_reference_analysis(p_job_id uuid,p_claim_token uuid,p_role text,p_model text) returns text
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; a public.ugc_reference_analyses;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'analyze_references' or p_claim_token is null or j.claim_token is distinct from p_claim_token
    or j.lease_expires_at<=clock_timestamp() or j.cancellation_requested_at is not null then return 'STOP'; end if;
  if p_role is null or p_role not in ('character','product') or p_model is null or p_model !~ '^[a-zA-Z0-9._:-]{1,200}$' then return 'STOP'; end if;
  if j.analysis_version is not null and (j.analysis_version<>1 or j.analysis_model<>p_model) then return 'STOP'; end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then return 'STOP'; end if;
  if j.lease_expires_at<=clock_timestamp() then return 'STOP'; end if;
  select * into a from public.ugc_reference_analyses where job_id=j.id and analysis_type=p_role order by created_at desc,id desc limit 1;
  if found then
    if a.state='completed' then return 'REUSE'; end if;
    if a.state<>'rejected' or a.error_code not in ('REFERENCE_AUTH_FAILED','REFERENCE_RATE_LIMITED')
      or a.submission_claim_token=p_claim_token then return 'RECONCILE'; end if;
  end if;
  update public.ugc_generation_jobs set analysis_version=1,analysis_model=p_model where id=j.id;
  insert into public.ugc_reference_analyses(owner_user_id,project_id,job_id,source_asset_id,analysis_type,
    analysis_version,prompt_version,provider,requested_model,state,submission_claim_token,submission_attempt)
  values(j.owner_user_id,j.project_id,j.id,(j.input_snapshot->p_role->>'assetId')::uuid,p_role,
    1,'reference-analysis-v1','openai',p_model,'submitted',p_claim_token,j.attempt_count);
  return 'SUBMIT';
end; $$;

create or replace function public.ugc_finish_reference_analysis(p_job_id uuid,p_claim_token uuid,p_role text,p_analysis jsonb,p_usage jsonb,p_error_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; a public.ugc_reference_analyses; final_state text; usage_field text;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'analyze_references' or p_claim_token is null
    or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp() then return false; end if;
  -- Persist a received success even if cancellation was requested in flight.
  select * into a from public.ugc_reference_analyses where job_id=j.id and analysis_type=p_role and submission_claim_token=p_claim_token for update;
  if not found then return false; end if;
  if a.state<>'submitted' then return a.analysis is not distinct from p_analysis and a.usage is not distinct from p_usage and a.error_code is not distinct from p_error_code; end if;
  if p_error_code is null then
    if public.ugc_valid_reference_analysis(p_role,p_analysis) is not true or p_usage is null then return false; end if;
    final_state:='completed';
  else
    if p_error_code not in ('REFERENCE_AUTH_FAILED','REFERENCE_RATE_LIMITED','REFERENCE_IMAGE_UNSUPPORTED','REFERENCE_TIMEOUT',
      'REFERENCE_PROVIDER_FAILED','REFERENCE_OUTPUT_INVALID','REFERENCE_REFUSED','RECONCILIATION_REQUIRED') then return false; end if;
    final_state:=case when p_error_code in ('REFERENCE_TIMEOUT','REFERENCE_PROVIDER_FAILED','RECONCILIATION_REQUIRED') then 'uncertain' else 'rejected' end;
  end if;
  -- Usage is a fixed safe projection, not an arbitrary provider response/body.
  if p_usage is not null then
    if jsonb_typeof(p_usage) is distinct from 'object' then return false; end if;
    if (select array_agg(k order by k) from jsonb_object_keys(p_usage) k) is distinct from
      array['inputTokens','latencyMs','model','outputTokens','responseId','totalTokens'] then return false; end if;
    if jsonb_typeof(p_usage->'model') is distinct from 'string' or char_length(p_usage->>'model') not between 1 and 200
      or jsonb_typeof(p_usage->'latencyMs') is distinct from 'number' or p_usage->>'latencyMs' !~ '^[0-9]+$' then return false; end if;
    if jsonb_typeof(p_usage->'responseId') not in ('null','string') or
      (jsonb_typeof(p_usage->'responseId')='string' and char_length(p_usage->>'responseId')>200) then return false; end if;
    foreach usage_field in array array['inputTokens','outputTokens','totalTokens'] loop
      if p_usage->usage_field is distinct from 'null'::jsonb and
        (jsonb_typeof(p_usage->usage_field) is distinct from 'number' or p_usage->>usage_field !~ '^[0-9]+$') then return false; end if;
    end loop;
  end if;
  update public.ugc_reference_analyses set state=final_state,analysis=p_analysis,usage=p_usage,error_code=p_error_code where id=a.id;
  if final_state='completed' then
    insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
      values(j.id,j.status,j.stage,'reference_analyzed',case p_role when 'character' then 'Character reference analyzed.' else 'Product reference analyzed.' end,
        jsonb_build_object('attempt',j.attempt_count,'resumeStage',j.resume_stage));
  end if;
  return true;
end; $$;

-- Dedicated completion gate; generic advance cannot skip validated analyses.
create or replace function public.ugc_finish_references(p_job_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'analyze_references' or p_claim_token is null
    or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp() then return null; end if;
  if j.cancellation_requested_at is not null then return public.ugc_update_claim_v1(j.id,p_claim_token,j.stage,'cancel'); end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then
    return public.ugc_update_claim_v1(j.id,p_claim_token,j.stage,'fail','INPUT_VALIDATION_FAILED',false);
  end if;
  if j.lease_expires_at<=clock_timestamp() then return null; end if;
  if (select count(*) from public.ugc_reference_analyses a where a.job_id=j.id and a.owner_user_id=j.owner_user_id
    and a.project_id=j.project_id and a.state='completed' and a.analysis_version=j.analysis_version
    and a.requested_model=j.analysis_model and a.source_asset_id=(j.input_snapshot->a.analysis_type->>'assetId')::uuid)<>2 then return null; end if;
  update public.ugc_generation_jobs set status='queued',stage='character_reference',resume_stage='character_reference',
    pause_reason='CHARACTER_REFERENCE_NOT_IMPLEMENTED',worker_id=null,claim_token=null,lease_expires_at=null
    where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;

-- Explicit local operator action for old M3 pauses only; migration never drains them.
create or replace function public.ugc_resume_reference_analysis(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'queued' or j.stage<>'analyze_references' or j.pause_reason is distinct from 'REFERENCE_ANALYSIS_NOT_IMPLEMENTED'
    or j.attempt_count>=j.max_attempts or j.cancellation_requested_at is not null then return false; end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then return false; end if;
  update public.ugc_generation_jobs set pause_reason=null where id=j.id;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(j.id,j.status,j.stage,'development_resumed','Reference analysis enabled for the local worker.',
      jsonb_build_object('attempt',j.attempt_count,'resumeStage',j.resume_stage));
  return true;
end; $$;

-- Extend safe explicit retries, never uncertain submissions or failed output.
create or replace function public.ugc_update_claim(p_job_id uuid,p_claim_token uuid,p_expected_stage text,p_operation text,p_error_code text default null,p_retryable boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; safe_retry boolean;
begin
  if p_operation='advance' and p_expected_stage in ('validate_inputs','analyze_references') then
    raise exception 'Use the validated stage checkpoint operation.' using errcode='23514';
  end if;
  if p_operation='fail' and p_expected_stage='analyze_references' then
    select * into j from public.ugc_generation_jobs where id=p_job_id for update;
    if not found or j.status<>'running' or j.stage<>p_expected_stage or p_claim_token is null
      or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp() then return null; end if;
    if j.cancellation_requested_at is not null then return public.ugc_update_claim_v1(j.id,p_claim_token,j.stage,'cancel'); end if;
    if public.ugc_job_error_message(p_error_code) is null then return null; end if;
    safe_retry:=coalesce(p_retryable,false) and j.attempt_count<j.max_attempts and
      p_error_code in ('REFERENCE_CONFIG_INVALID','REFERENCE_ASSET_UNAVAILABLE','REFERENCE_AUTH_FAILED','REFERENCE_RATE_LIMITED') and
      not exists(select 1 from public.ugc_reference_analyses where job_id=j.id and state in ('submitted','uncertain'));
    update public.ugc_generation_jobs set status='failed',stage='failed',resume_stage='analyze_references',failed_at=clock_timestamp(),
      error_code=p_error_code,safe_error_message=public.ugc_job_error_message(p_error_code),retry_eligible=safe_retry,
      worker_id=null,claim_token=null,lease_expires_at=null where id=j.id returning * into j;
    return to_jsonb(j);
  end if;
  return public.ugc_update_claim_v1(p_job_id,p_claim_token,p_expected_stage,p_operation,p_error_code,p_retryable);
end; $$;

create or replace function public.ugc_retry_owned_job(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id and owner_user_id=p_owner_user_id and project_id=p_project_id for update;
  if not found or not exists(select 1 from public.projects where id=p_project_id and owner_user_id=p_owner_user_id and status='draft') then return null; end if;
  if j.status='queued' then return to_jsonb(j); end if;
  if j.status<>'failed' or not j.retry_eligible or j.attempt_count>=j.max_attempts or j.resume_stage not in ('validate_inputs','analyze_references')
    or j.cancellation_requested_at is not null then return null; end if;
  if j.resume_stage='analyze_references' and exists(select 1 from public.ugc_reference_analyses where job_id=j.id and state in ('submitted','uncertain')) then return null; end if;
  update public.ugc_generation_jobs set status='queued',stage=case when resume_stage='validate_inputs' then 'queued' else resume_stage end,
    failed_at=null,error_code=null,safe_error_message=null,retry_eligible=false,next_retry_at=clock_timestamp()+interval '5 seconds'
    where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;

-- New validation continues under the same live claim; existing M3 pauses need explicit resume.
create or replace function public.ugc_finish_input_validation(p_job_id uuid,p_claim_token uuid,p_input_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; matches boolean;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'validate_inputs' or p_claim_token is null
    or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp() then return null; end if;
  if j.cancellation_requested_at is not null then
    update public.ugc_generation_jobs set status='cancelled',stage='cancelled',cancelled_at=clock_timestamp(),
      worker_id=null,claim_token=null,lease_expires_at=null where id=j.id returning * into j;
    return to_jsonb(j);
  end if;
  matches:=j.input_snapshot is not distinct from p_input_snapshot and public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,p_input_snapshot,false);
  -- Record locks can wait; recheck the deadline after acquiring all references.
  if j.lease_expires_at<=clock_timestamp() then return null; end if;
  if not matches then
    update public.ugc_generation_jobs set status='failed',stage='failed',resume_stage='validate_inputs',failed_at=clock_timestamp(),
      error_code='INPUT_VALIDATION_FAILED',safe_error_message=public.ugc_job_error_message('INPUT_VALIDATION_FAILED'),
      worker_id=null,claim_token=null,lease_expires_at=null where id=j.id returning * into j;
    return to_jsonb(j);
  end if;
  update public.ugc_generation_jobs set validation_completed_at=clock_timestamp() where id=j.id;
  update public.ugc_generation_jobs set stage='analyze_references',resume_stage='analyze_references',pause_reason=null
    where id=j.id returning * into j;
  return to_jsonb(j);
end;
$$;

create or replace function public.ugc_append_job_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_kind text; message text;
begin
  if tg_op='INSERT' then event_kind:='enqueued';
  elsif new.validation_completed_at is distinct from old.validation_completed_at then event_kind:='inputs_validated';
  elsif new.pause_reason is not null and old.pause_reason is null then event_kind:='development_paused';
  elsif new.status='queued' and old.status='failed' then event_kind:='retry_scheduled';
  elsif new.status='queued' and old.status='running' then event_kind:='released';
  elsif new.status='running' and old.status='queued' then event_kind:='claimed';
  elsif new.status='failed' and old.status<>'failed' then event_kind:='failed';
  elsif new.status='cancelled' and old.status<>'cancelled' then event_kind:='cancelled';
  elsif new.status='completed' and old.status<>'completed' then event_kind:='completed';
  elsif new.cancellation_requested_at is distinct from old.cancellation_requested_at then event_kind:='cancellation_requested';
  elsif new.stage is distinct from old.stage then event_kind:='stage_changed'; else return new; end if;
  message:=case event_kind
    when 'inputs_validated' then 'Generation inputs validated.'
    when 'development_paused' then case new.pause_reason when 'CHARACTER_REFERENCE_NOT_IMPLEMENTED' then 'References analyzed. Character Reference Sheet generation is not available yet.' else 'Inputs validated. Reference analysis is not available yet.' end
    when 'enqueued' then 'Job queued for the local worker.' when 'claimed' then 'Local worker claimed this job.'
    when 'failed' then new.safe_error_message when 'cancelled' then 'Job cancelled at a safe boundary.'
    when 'completed' then 'Job completed.' when 'retry_scheduled' then 'A bounded safe retry was scheduled.'
    when 'released' then 'Local worker released safe unfinished work.' when 'cancellation_requested' then 'Cancellation requested.'
    else 'Workflow stage changed.' end;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(new.id,new.status,new.stage,event_kind,message,jsonb_build_object('attempt',new.attempt_count,'resumeStage',new.resume_stage));
  return new;
end;
$$;

create or replace function public.ugc_enqueue_validated_job(p_owner_user_id uuid,p_project_id uuid,p_idempotency_key uuid,p_input_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; project_available boolean;
begin
  if p_owner_user_id is null or p_project_id is null or p_idempotency_key is null then return jsonb_build_object('code','PROJECT_UNAVAILABLE'); end if;
  select * into j from public.ugc_generation_jobs where owner_user_id=p_owner_user_id and idempotency_key=p_idempotency_key;
  if found then
    if j.project_id<>p_project_id then return jsonb_build_object('code','INPUT_CHANGED'); end if;
    return jsonb_build_object('code','ACCEPTED','job',to_jsonb(j));
  end if;
  -- Same Project lock used by 035 serializes new role inserts/reactivation.
  perform 1 from public.projects where id=p_project_id and owner_user_id=p_owner_user_id and status='draft' and creation_type='ugc' for update;
  project_available:=found;
  -- Another same-key request may have committed while this lock waited. Recover
  -- its original snapshot even if later draft edits now fail readiness.
  select * into j from public.ugc_generation_jobs where owner_user_id=p_owner_user_id and idempotency_key=p_idempotency_key;
  if found then
    if j.project_id<>p_project_id then return jsonb_build_object('code','INPUT_CHANGED'); end if;
    return jsonb_build_object('code','ACCEPTED','job',to_jsonb(j));
  end if;
  if p_input_snapshot->'settings'->>'duration' is null or p_input_snapshot->'settings'->>'duration' not in ('5','10','30') then return jsonb_build_object('code','INPUT_CHANGED'); end if;
  if not project_available then return jsonb_build_object('code','PROJECT_UNAVAILABLE'); end if;
  if not public.ugc_snapshot_matches_records(p_owner_user_id,p_project_id,p_input_snapshot,true) then
    return jsonb_build_object('code','INPUT_CHANGED');
  end if;
  insert into public.ugc_generation_jobs(owner_user_id,project_id,idempotency_key,input_snapshot)
    values(p_owner_user_id,p_project_id,p_idempotency_key,p_input_snapshot) on conflict(owner_user_id,idempotency_key) do nothing;
  select * into j from public.ugc_generation_jobs where owner_user_id=p_owner_user_id and idempotency_key=p_idempotency_key;
  if j.project_id<>p_project_id then return jsonb_build_object('code','INPUT_CHANGED'); end if;
  return jsonb_build_object('code','ACCEPTED','job',to_jsonb(j));
end;
$$;

revoke all on function public.ugc_valid_reference_analysis(text,jsonb),public.ugc_guard_reference_record(),public.ugc_guard_analysis_version(),
  public.ugc_begin_reference_analysis(uuid,uuid,text,text),public.ugc_finish_reference_analysis(uuid,uuid,text,jsonb,jsonb,text),
  public.ugc_finish_references(uuid,uuid),public.ugc_resume_reference_analysis(uuid),
  public.ugc_update_claim(uuid,uuid,text,text,text,boolean),public.ugc_retry_owned_job(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.ugc_begin_reference_analysis(uuid,uuid,text,text),public.ugc_finish_reference_analysis(uuid,uuid,text,jsonb,jsonb,text),
  public.ugc_finish_references(uuid,uuid),public.ugc_resume_reference_analysis(uuid),
  public.ugc_update_claim(uuid,uuid,text,text,text,boolean),public.ugc_retry_owned_job(uuid,uuid,uuid) to service_role;
commit;
