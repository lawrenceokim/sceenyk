-- Deterministic UGC readiness and a non-failure development pause. Apply manually
-- after 035/036. No provider execution, object writes, accounting or backfill.
begin;
do $$
declare required record;
begin
  for required in select * from (values
    ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),
    ('ugc_generation_jobs','project_id','uuid'),('ugc_generation_jobs','input_snapshot','jsonb'),
    ('ugc_generation_jobs','stage','text'),('ugc_generation_jobs','status','text'),
    ('ugc_generation_jobs','resume_stage','text'),('ugc_generation_jobs','idempotency_key','uuid'),
    ('ugc_generation_jobs','claim_token','uuid'),('ugc_generation_jobs','lease_expires_at','timestamp with time zone'),
    ('ugc_generation_jobs','worker_id','uuid'),('ugc_generation_jobs','attempt_count','integer'),
    ('ugc_generation_jobs','max_attempts','integer'),('ugc_generation_jobs','retry_eligible','boolean'),
    ('ugc_generation_jobs','next_retry_at','timestamp with time zone'),('ugc_generation_jobs','created_at','timestamp with time zone'),
    ('ugc_generation_jobs','claimed_at','timestamp with time zone'),('ugc_generation_jobs','heartbeat_at','timestamp with time zone'),
    ('ugc_generation_jobs','started_at','timestamp with time zone'),('ugc_generation_jobs','failed_at','timestamp with time zone'),
    ('ugc_generation_jobs','cancelled_at','timestamp with time zone'),('ugc_generation_jobs','cancellation_requested_at','timestamp with time zone'),
    ('ugc_generation_jobs','error_code','text'),('ugc_generation_jobs','safe_error_message','text'),
    ('ugc_generation_job_events','event_type','text'),('ugc_generation_job_events','metadata','jsonb'),
    ('ugc_generation_job_events','job_id','uuid'),('ugc_generation_job_events','status','text'),
    ('ugc_generation_job_events','stage','text'),('ugc_generation_job_events','safe_message','text'),
    ('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text'),
    ('projects','title','text'),('projects','prompt','text'),('projects','creation_type','text'),
    ('projects','ugc_type','text'),('projects','duration','text'),('projects','aspect_ratio','text'),
    ('projects','visual_style','text'),('projects','tone','text'),
    ('project_assets','id','uuid'),('project_assets','project_id','uuid'),('project_assets','owner_user_id','uuid'),
    ('project_assets','reference_id','uuid'),('project_assets','studio_role','text'),
    ('project_assets','removed_from_draft','boolean'),('project_assets','upload_status','text'),
    ('project_assets','media_type','text'),('project_assets','storage_provider','text'),
    ('project_assets','mime_type','text'),('project_assets','size_bytes','bigint'),('project_assets','verified_etag','text')
  ) v(table_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'UGC readiness prerequisite missing or incompatible: %.%',required.table_name,required.column_name;
    end if;
  end loop;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.project_assets'::regclass
    and tgname='a_ugc_v1_reference_limit' and tgenabled<>'D') then
    raise exception 'Apply the UGC reference-serialization migration 035 first.';
  end if;
  if to_regprocedure('public.ugc_update_claim(uuid,uuid,text,text,text,boolean)') is null then
    raise exception 'Apply UGC job migration 036 first.';
  end if;
end;
$$;

alter table public.ugc_generation_jobs add column if not exists pause_reason text;
alter table public.ugc_generation_jobs add column if not exists validation_completed_at timestamptz;
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_generation_jobs'
    and column_name='pause_reason' and data_type='text') or
    not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_generation_jobs'
    and column_name='validation_completed_at' and data_type='timestamp with time zone') then
    raise exception 'Inspect incompatible UGC readiness columns before continuing.';
  end if;
end; $$;
create index if not exists ugc_jobs_runnable_queue on public.ugc_generation_jobs(created_at,id)
  where status='queued' and pause_reason is null;
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_status_stage;
alter table public.ugc_generation_jobs add constraint ugc_jobs_status_stage check(
  (status='queued' and stage='queued') or
  (status='queued' and stage='analyze_references' and pause_reason='REFERENCE_ANALYSIS_NOT_IMPLEMENTED') or
  (status='running' and stage in ('validate_inputs','analyze_references','character_reference','product_reference',
    'build_storyboard','build_generation_package','cost_review','video_generation','finalizing')) or
  (status='awaiting_confirmation' and stage='awaiting_confirmation') or
  (status='completed' and stage='complete') or (status='failed' and stage='failed') or (status='cancelled' and stage='cancelled'));
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_pause_state;
alter table public.ugc_generation_jobs add constraint ugc_jobs_pause_state check(
  (pause_reason is null and not(status='queued' and stage='analyze_references')) or
  (pause_reason is not null and pause_reason='REFERENCE_ANALYSIS_NOT_IMPLEMENTED' and status='queued'
    and stage='analyze_references' and validation_completed_at is not null));

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
    when 'INPUT_VALIDATION_FAILED' then 'Saved generation inputs or references are no longer valid. Check readiness and prepare a new request.' end;
$$;

-- Internal comparison only. TypeScript remains the central semantic validator;
-- this closes the read/check/insert race under current Project/asset row locks.
-- Mirror JavaScript trim exactly, including Unicode whitespace, without
-- rewriting interior text or the user's creative direction.
create or replace function public.ugc_normalize_input_text(p_value text) returns text
language sql immutable strict set search_path='' as $$
  select btrim(p_value,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||
    U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
create or replace function public.ugc_snapshot_matches_records(p_owner uuid,p_project uuid,p_snapshot jsonb,p_match_brief boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.projects; c public.project_assets; r public.project_assets; expected jsonb;
begin
  if p_snapshot is null or p_snapshot->'schemaVersion' is distinct from '2'::jsonb
    or p_snapshot->>'readiness' is distinct from 'validated' or p_snapshot->>'projectId' is distinct from p_project::text then return false; end if;
  select * into p from public.projects where id=p_project and owner_user_id=p_owner and status='draft' for share;
  if not found then return false; end if;
  select * into c from public.project_assets where id=(p_snapshot->'character'->>'assetId')::uuid
    and project_id=p_project and owner_user_id=p_owner and studio_role='character' and not removed_from_draft
    and upload_status='uploaded' and media_type='image' and storage_provider='r2' and verified_etag is not null for share;
  if not found then return false; end if;
  select * into r from public.project_assets where id=(p_snapshot->'product'->>'assetId')::uuid
    and project_id=p_project and owner_user_id=p_owner and studio_role='product' and not removed_from_draft
    and upload_status='uploaded' and media_type='image' and storage_provider='r2' and verified_etag is not null for share;
  if not found or c.id=r.id then return false; end if;
  if p_match_brief then
    if p.creation_type<>'ugc' or char_length(public.ugc_normalize_input_text(p.title))=0 or char_length(public.ugc_normalize_input_text(p.prompt))=0 then return false; end if;
    if (select count(*) from public.project_assets where project_id=p_project and owner_user_id=p_owner
        and studio_role='character' and not removed_from_draft)<>1 or
      (select count(*) from public.project_assets where project_id=p_project and owner_user_id=p_owner
        and studio_role='product' and not removed_from_draft)<>1 then return false; end if;
    expected:=jsonb_build_object('schemaVersion',2,'readiness','validated','projectId',p_project,'projectTitle',public.ugc_normalize_input_text(p.title),
      'creationType',p.creation_type,'ugcType',p.ugc_type,'sceneDescription',public.ugc_normalize_input_text(p.prompt),
      'settings',jsonb_build_object('duration',p.duration,'aspectRatio',p.aspect_ratio,'visualStyle',p.visual_style,'tone',p.tone),
      'narration',jsonb_build_object('mode','prompt'));
  else
    -- Already immutable: later draft text/settings/type edits do not replace it.
    expected:=p_snapshot-'character'-'product';
  end if;
  expected:=expected||jsonb_build_object(
    'character',jsonb_build_object('assetId',c.id,'referenceId',c.reference_id,'mimeType',c.mime_type,'sizeBytes',c.size_bytes,'etag',c.verified_etag),
    'product',jsonb_build_object('assetId',r.id,'referenceId',r.reference_id,'mimeType',r.mime_type,'sizeBytes',r.size_bytes,'etag',r.verified_etag));
  return coalesce(expected=p_snapshot,false);
exception when invalid_text_representation then return false;
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
-- Preserve history/definition, but no service caller can bypass new validation.
revoke all on function public.ugc_enqueue_job(uuid,uuid,uuid) from public,anon,authenticated,service_role;

alter table public.ugc_generation_job_events drop constraint if exists ugc_generation_job_events_event_type_check;
alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_event_type_check check(event_type in (
  'enqueued','claimed','stage_changed','failed','completed','cancelled','cancellation_requested','retry_scheduled','released',
  'inputs_validated','development_paused'));
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
    when 'development_paused' then 'Inputs validated. Reference analysis is not available yet.'
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
  update public.ugc_generation_jobs set status='queued',stage='analyze_references',resume_stage='analyze_references',
    pause_reason='REFERENCE_ANALYSIS_NOT_IMPLEMENTED',worker_id=null,claim_token=null,lease_expires_at=null
    where id=j.id returning * into j;
  return to_jsonb(j);
end;
$$;

-- Keep 036's live-claim heartbeat/failure logic, with no generic validation bypass.
do $$ begin
  if to_regprocedure('public.ugc_update_claim_v1(uuid,uuid,text,text,text,boolean)') is null then
    alter function public.ugc_update_claim(uuid,uuid,text,text,text,boolean) rename to ugc_update_claim_v1;
  end if;
end; $$;
revoke all on function public.ugc_update_claim_v1(uuid,uuid,text,text,text,boolean) from public,anon,authenticated,service_role;
create or replace function public.ugc_update_claim(p_job_id uuid,p_claim_token uuid,p_expected_stage text,p_operation text,p_error_code text default null,p_retryable boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_operation='advance' and p_expected_stage='validate_inputs' then
    raise exception 'Use the validated input checkpoint operation.' using errcode='23514';
  end if;
  return public.ugc_update_claim_v1(p_job_id,p_claim_token,p_expected_stage,p_operation,p_error_code,p_retryable);
end;
$$;

create or replace function public.ugc_claim_job(p_worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; failure text; can_retry boolean;
begin
  if p_worker_id is null then return null; end if;
  for j in select * from public.ugc_generation_jobs where status='running' and lease_expires_at<=clock_timestamp()
    order by lease_expires_at,id for update skip locked limit 25 loop
    if j.cancellation_requested_at is not null then
      update public.ugc_generation_jobs set status='cancelled',stage='cancelled',cancelled_at=clock_timestamp(),
        worker_id=null,claim_token=null,lease_expires_at=null where id=j.id;
    else
      can_retry:=j.stage='validate_inputs' and j.attempt_count<j.max_attempts;
      failure:=case when j.stage<>'validate_inputs' then 'RECONCILIATION_REQUIRED'
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
  for j in select * from public.ugc_generation_jobs q where q.status='queued' and not exists(
      select 1 from public.projects p where p.id=q.project_id and p.owner_user_id=q.owner_user_id and p.status='draft')
    order by q.created_at,q.id for update skip locked limit 25 loop
    update public.ugc_generation_jobs set status='failed',stage='failed',pause_reason=null,failed_at=clock_timestamp(),next_retry_at=null,
      error_code='PROJECT_UNAVAILABLE',safe_error_message=public.ugc_job_error_message('PROJECT_UNAVAILABLE') where id=j.id;
  end loop;
  select q.* into j from public.ugc_generation_jobs q where q.status='queued' and q.pause_reason is null and q.attempt_count<q.max_attempts
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
    pause_reason=null,next_retry_at=null where id=j.id returning * into j;
  return to_jsonb(j);
end;
$$;
revoke all on function public.ugc_normalize_input_text(text),public.ugc_snapshot_matches_records(uuid,uuid,jsonb,boolean),
  public.ugc_enqueue_validated_job(uuid,uuid,uuid,jsonb),public.ugc_finish_input_validation(uuid,uuid,jsonb),
  public.ugc_update_claim(uuid,uuid,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ugc_enqueue_validated_job(uuid,uuid,uuid,jsonb),
  public.ugc_finish_input_validation(uuid,uuid,jsonb),public.ugc_update_claim(uuid,uuid,text,text,text,boolean) to service_role;
-- Existing claim/cancel grants survive CREATE OR REPLACE; restore explicitly.
revoke all on function public.ugc_claim_job(uuid),public.ugc_cancel_owned_job(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ugc_claim_job(uuid),public.ugc_cancel_owned_job(uuid,uuid,uuid) to service_role;
commit;
