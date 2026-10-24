-- Manual only after 035-040. No provider calls, backfills, accounting or remote application.
begin;
do $$
declare required record; relation_oid oid;
begin
  for required in select * from (values
    ('ugc_generation_jobs','id'),('ugc_generation_jobs','owner_user_id'),('ugc_generation_jobs','project_id'),
    ('ugc_generation_jobs','input_snapshot'),('ugc_generation_jobs','claim_token'),('ugc_generation_jobs','lease_expires_at'),
    ('ugc_generation_jobs','pause_reason'),('ugc_generation_jobs','analysis_version'),('ugc_generation_jobs','analysis_model'),
    ('ugc_generation_jobs','status'),('ugc_generation_jobs','stage'),('ugc_generation_jobs','resume_stage'),
    ('ugc_generation_jobs','attempt_count'),('ugc_generation_jobs','max_attempts'),('ugc_generation_jobs','retry_eligible'),
    ('ugc_generation_jobs','next_retry_at'),('ugc_generation_jobs','worker_id'),('ugc_generation_jobs','failed_at'),
    ('ugc_generation_jobs','error_code'),('ugc_generation_jobs','safe_error_message'),('ugc_generation_jobs','cancellation_requested_at'),
    ('ugc_generation_jobs','validation_completed_at'),('ugc_generation_job_events','job_id'),('ugc_generation_job_events','metadata'),
    ('ugc_generation_job_events','status'),('ugc_generation_job_events','stage'),('ugc_generation_job_events','event_type'),
    ('ugc_generation_job_events','safe_message'),('ugc_reference_analyses','id'),('ugc_reference_analyses','job_id'),
    ('ugc_reference_analyses','owner_user_id'),('ugc_reference_analyses','project_id'),('ugc_reference_analyses','source_asset_id'),
    ('ugc_reference_analyses','analysis_type'),('ugc_reference_analyses','analysis_version'),('ugc_reference_analyses','state'),
    ('ugc_reference_analyses','requested_model'),('project_assets','id'),('project_assets','reference_name'),
    ('projects','id'),('projects','owner_user_id'),('projects','status'),('app_users','id')
  ) v(table_name,column_name) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name) then
      raise exception 'Character Sheet prerequisite missing: %.%',required.table_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.ugc_snapshot_matches_records(uuid,uuid,jsonb,boolean)') is null
    or to_regprocedure('public.ugc_update_claim_v1(uuid,uuid,text,text,text,boolean)') is null
    or to_regprocedure('public.ugc_finish_references(uuid,uuid)') is null then raise exception 'Apply corrected 039 and 040 first.'; end if;
  relation_oid:=to_regclass('public.ugc_character_sheets');
  if relation_oid is not null then
    if obj_description(relation_oid,'pg_class') is distinct from 'sceenyk-ugc-character-sheet-v1-041' then
      raise exception 'Inspect existing Character Sheet table before applying.';
    end if;
  end if;
end; $$;

create table if not exists public.ugc_character_sheets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  project_id uuid not null,
  job_id uuid not null unique references public.ugc_generation_jobs(id) on delete restrict,
  source_asset_id uuid not null references public.project_assets(id) on delete restrict,
  character_name text not null check(char_length(character_name) between 1 and 80),
  asset_type text not null default 'character_sheet' check(asset_type='character_sheet'),
  sheet_version integer not null default 1 check(sheet_version=1),
  provider text not null default 'higgsfield' check(provider='higgsfield'),
  provider_model text not null check(provider_model='higgsfield-ai/soul/v2/standard'),
  status text not null default 'preparing' check(status in ('preparing','completed')),
  document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=65536
    and document->'schemaVersion'='1'::jsonb and document->>'promptVersion'='character-sheet-v1'
    and jsonb_typeof(document->'wardrobe')='object' and jsonb_typeof(document->'assets')='object'
    and jsonb_typeof(document->'operations')='object' and document->'analysisVersion'='1'::jsonb),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict,
  check(status<>'completed' or document->'assets' ?& array['front','back','face','sheet'])
);
comment on table public.ugc_character_sheets is 'sceenyk-ugc-character-sheet-v1-041';
alter table public.ugc_character_sheets enable row level security;
revoke all on table public.ugc_character_sheets from public,anon,authenticated,service_role;
grant select on table public.ugc_character_sheets to service_role;

create or replace function public.ugc_guard_character_sheet() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Character Sheet history is retained.' using errcode='23514'; end if;
  if old.status='completed' or (to_jsonb(new)-array['document','status','updated_at']) is distinct from
    (to_jsonb(old)-array['document','status','updated_at']) then raise exception 'Immutable Character Sheet identity.' using errcode='23514'; end if;
  if (new.document-array['operations','assets']) is distinct from (old.document-array['operations','assets']) then
    raise exception 'Immutable Character Sheet instructions.' using errcode='23514'; end if;
  new.updated_at:=clock_timestamp(); return new;
end; $$;
drop trigger if exists ugc_guard_character_sheet on public.ugc_character_sheets;
create trigger ugc_guard_character_sheet before update or delete on public.ugc_character_sheets
for each row execute function public.ugc_guard_character_sheet();

alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_status_stage;
alter table public.ugc_generation_jobs add constraint ugc_jobs_status_stage check(
  (status='queued' and stage in ('queued','analyze_references','character_reference','product_reference')) or
  (status='running' and stage in ('validate_inputs','analyze_references','character_reference','product_reference',
    'build_storyboard','build_generation_package','cost_review','video_generation','finalizing')) or
  (status='awaiting_confirmation' and stage='awaiting_confirmation') or (status='completed' and stage='complete') or
  (status='failed' and stage='failed') or (status='cancelled' and stage='cancelled'));
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_pause_state;
alter table public.ugc_generation_jobs add constraint ugc_jobs_pause_state check(
  (pause_reason is null and not(status='queued' and stage='product_reference')) or
  (pause_reason is not null and status='queued' and validation_completed_at is not null and
    ((pause_reason='REFERENCE_ANALYSIS_NOT_IMPLEMENTED' and stage='analyze_references') or
     (pause_reason='CHARACTER_REFERENCE_NOT_IMPLEMENTED' and stage='character_reference' and analysis_version=1) or
     (pause_reason='PRODUCT_REFERENCE_NOT_IMPLEMENTED' and stage='product_reference' and analysis_version=1))));
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_retry_state;
alter table public.ugc_generation_jobs add constraint ugc_jobs_retry_state check(
  (not retry_eligible or (status='failed' and attempt_count<max_attempts and
    ((resume_stage='validate_inputs' and error_code in ('WORKER_ERROR','WORKER_INTERRUPTED','LEASE_EXPIRED')) or
     (resume_stage='analyze_references' and error_code in ('REFERENCE_CONFIG_INVALID','REFERENCE_ASSET_UNAVAILABLE','REFERENCE_AUTH_FAILED','REFERENCE_RATE_LIMITED')) or
     (resume_stage='character_reference' and error_code in ('CHARACTER_CONFIG_INVALID','CHARACTER_STORAGE_FAILED','CHARACTER_COMPOSITION_FAILED',
       'CHARACTER_AUTH_FAILED','CHARACTER_RATE_LIMITED','WORKER_INTERRUPTED','LEASE_EXPIRED','WORKER_ERROR')))))
  and (next_retry_at is null or status='queued'));
alter table public.ugc_generation_job_events drop constraint if exists ugc_generation_job_events_event_type_check;
alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_event_type_check check(event_type in (
  'enqueued','claimed','stage_changed','failed','completed','cancelled','cancellation_requested','retry_scheduled','released',
  'inputs_validated','development_paused','development_resumed','reference_analyzed','character_progress','character_ready'));

-- Preserve earlier RPC implementations privately; reruns must not rename wrappers.
do $$ begin
  if to_regprocedure('public.ugc_job_error_message_m4(text)') is null then
    alter function public.ugc_job_error_message(text) rename to ugc_job_error_message_m4;
  end if;
  if to_regprocedure('public.ugc_update_claim_m4(uuid,uuid,text,text,text,boolean)') is null then
    alter function public.ugc_update_claim(uuid,uuid,text,text,text,boolean) rename to ugc_update_claim_m4;
  end if;
  if to_regprocedure('public.ugc_claim_job_m4(uuid)') is null then
    alter function public.ugc_claim_job(uuid) rename to ugc_claim_job_m4;
  end if;
  if to_regprocedure('public.ugc_retry_owned_job_m4(uuid,uuid,uuid)') is null then
    alter function public.ugc_retry_owned_job(uuid,uuid,uuid) rename to ugc_retry_owned_job_m4;
  end if;
end; $$;
create or replace function public.ugc_job_error_message(p_code text) returns text
language sql immutable set search_path='' as $$
  select case p_code
    when 'CHARACTER_CONFIG_INVALID' then 'Character generation configuration is missing or disabled.'
    when 'CHARACTER_AUTH_FAILED' then 'Character generation credentials or model access were rejected.'
    when 'CHARACTER_RATE_LIMITED' then 'Character generation reached the provider limit. Retry later.'
    when 'CHARACTER_PROVIDER_FAILED' then 'Character generation stopped safely. Review the provider outcome.'
    when 'CHARACTER_TIMEOUT' then 'Character generation timed out. Review the existing provider request.'
    when 'CHARACTER_OUTPUT_INVALID' then 'A generated character image was missing, rejected or invalid.'
    when 'CHARACTER_STORAGE_FAILED' then 'A private character asset could not be saved or loaded.'
    when 'CHARACTER_COMPOSITION_FAILED' then 'The character reference sheet could not be composed.'
    else public.ugc_job_error_message_m4(p_code) end;
$$;

-- CHECK expressions retain function OIDs through RENAME. Rebind to the extended
-- catalog, otherwise Character failures would still use the M4-only function.
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_error_state;
alter table public.ugc_generation_jobs add constraint ugc_jobs_error_state check(
  (status='failed' and error_code is not null and safe_error_message is not null
    and public.ugc_job_error_message(error_code) is not null and safe_error_message=public.ugc_job_error_message(error_code)) or
  (status<>'failed' and error_code is null and safe_error_message is null));

-- All writes acquire the job lock first; no direct service table writes.
create or replace function public.ugc_prepare_character_sheet(p_job_id uuid,p_claim_token uuid,p_model text,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_character_sheets;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'character_reference' or p_claim_token is null
    or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp()
    or j.cancellation_requested_at is not null or j.input_snapshot->>'schemaVersion'<>'3'
    or j.analysis_version is distinct from 1 then return null; end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then return null; end if;
  if not exists(select 1 from public.ugc_reference_analyses a where a.id=(p_document->>'analysisId')::uuid
    and a.job_id=j.id and a.owner_user_id=j.owner_user_id and a.project_id=j.project_id
    and a.source_asset_id=(j.input_snapshot->'character'->>'assetId')::uuid and a.analysis_type='character'
    and a.state='completed' and a.analysis_version=j.analysis_version and a.requested_model=j.analysis_model) then return null; end if;
  select * into s from public.ugc_character_sheets where job_id=j.id;
  if found then
    if s.provider_model<>p_model or s.document->>'snapshotSha256' is distinct from p_document->>'snapshotSha256'
      or s.document->>'analysisId' is distinct from p_document->>'analysisId' then return null; end if;
    return to_jsonb(s);
  end if;
  if p_document->'operations' is distinct from '{}'::jsonb or p_document->'assets' is distinct from '{}'::jsonb then return null; end if;
  insert into public.ugc_character_sheets(owner_user_id,project_id,job_id,source_asset_id,character_name,provider_model,document)
    values(j.owner_user_id,j.project_id,j.id,(j.input_snapshot->'character'->>'assetId')::uuid,j.input_snapshot->'character'->>'name',p_model,p_document)
    returning * into s;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(j.id,j.status,j.stage,'character_progress','Creating wardrobe',jsonb_build_object('attempt',j.attempt_count,'resumeStage',j.resume_stage));
  return to_jsonb(s);
end; $$;

create or replace function public.ugc_checkpoint_character_sheet(p_job_id uuid,p_claim_token uuid,p_document jsonb,p_message text) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_character_sheets; item record; incoming jsonb;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'character_reference' or p_claim_token is null
    or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp()
    or j.cancellation_requested_at is not null then return false; end if;
  if p_message is null or p_message not in ('Preparing character','Generating character views','Building character sheet',
    'Saving character reference','Character generation stopped safely') then return false; end if;
  select * into s from public.ugc_character_sheets where job_id=j.id for update;
  if not found or s.status<>'preparing' then return false; end if;
  if (p_document-array['operations','assets']) is distinct from (s.document-array['operations','assets']) then return false; end if;
  for item in select * from jsonb_each(s.document->'assets') loop
    if p_document->'assets'->item.key is distinct from item.value then return false; end if;
  end loop;
  for item in select * from jsonb_each(s.document->'operations') loop
    incoming:=p_document->'operations'->item.key;
    if incoming is null or incoming->>'key' is distinct from item.value->>'key' then return false; end if;
    if item.value->>'providerId' is not null and incoming->>'providerId' is distinct from item.value->>'providerId' then return false; end if;
    if item.value->>'statusUrl' is not null and incoming->>'statusUrl' is distinct from item.value->>'statusUrl' then return false; end if;
    if item.value->>'state'='completed' and incoming->>'state' is distinct from 'completed' then return false; end if;
    if item.value->>'state'='failed' and incoming is distinct from item.value then return false; end if;
  end loop;
  update public.ugc_character_sheets set document=p_document where id=s.id;
  -- Progress events only when work changes; polling does not flood the event log.
  if not exists(select 1 from public.ugc_generation_job_events where job_id=j.id and event_type='character_progress'
    and safe_message=p_message) then
    insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
      values(j.id,j.status,j.stage,'character_progress',p_message,jsonb_build_object('attempt',j.attempt_count,'resumeStage',j.resume_stage));
  end if;
  return true;
end; $$;

create or replace function public.ugc_finish_character_sheet(p_job_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_character_sheets;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'character_reference' or p_claim_token is null
    or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp() then return null; end if;
  if j.cancellation_requested_at is not null then return public.ugc_update_claim_v1(j.id,p_claim_token,j.stage,'cancel'); end if;
  select * into s from public.ugc_character_sheets where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id for update;
  if not found or not(s.document->'assets' ?& array['front','back','face','sheet'])
    or s.document->'operations'->'identity'->>'state' is distinct from 'completed'
    or s.document->'operations'->'front'->>'state' is distinct from 'completed'
    or s.document->'operations'->'back'->>'state' is distinct from 'completed'
    or s.document->'operations'->'face'->>'state' is distinct from 'completed' then return null; end if;
  if s.status<>'completed' then update public.ugc_character_sheets set status='completed' where id=s.id; end if;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(j.id,j.status,j.stage,'character_ready','Character ready',jsonb_build_object('attempt',j.attempt_count,'resumeStage',j.resume_stage));
  update public.ugc_generation_jobs set status='queued',stage='product_reference',resume_stage='product_reference',
    pause_reason='PRODUCT_REFERENCE_NOT_IMPLEMENTED',worker_id=null,claim_token=null,lease_expires_at=null where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;

-- Completed M4 transitions directly; old intentional pauses require explicit operator resume.
create or replace function public.ugc_finish_references(p_job_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'analyze_references' or p_claim_token is null
    or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp() then return null; end if;
  if j.cancellation_requested_at is not null then return public.ugc_update_claim_v1(j.id,p_claim_token,j.stage,'cancel'); end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then
    return public.ugc_update_claim_v1(j.id,p_claim_token,j.stage,'fail','INPUT_VALIDATION_FAILED',false); end if;
  if (select count(*) from public.ugc_reference_analyses a where a.job_id=j.id and a.owner_user_id=j.owner_user_id
    and a.project_id=j.project_id and a.state='completed' and a.analysis_version=j.analysis_version
    and a.requested_model=j.analysis_model and a.source_asset_id=(j.input_snapshot->a.analysis_type->>'assetId')::uuid)<>2 then return null; end if;
  update public.ugc_generation_jobs set stage='character_reference',resume_stage='character_reference',pause_reason=null where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;
create or replace function public.ugc_resume_character_sheet(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'queued' or j.stage<>'character_reference' or j.pause_reason is distinct from 'CHARACTER_REFERENCE_NOT_IMPLEMENTED'
    or j.attempt_count>=j.max_attempts or j.cancellation_requested_at is not null or j.input_snapshot->>'schemaVersion'<>'3' then return false; end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then return false; end if;
  update public.ugc_generation_jobs set pause_reason=null where id=j.id;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(j.id,j.status,j.stage,'development_resumed','Character generation enabled for the local worker.',
      jsonb_build_object('attempt',j.attempt_count,'resumeStage',j.resume_stage));
  return true;
end; $$;

create or replace function public.ugc_character_can_resume(p_job_id uuid) returns boolean
language sql stable set search_path='' as $$
  select not exists(select 1 from public.ugc_character_sheets s, jsonb_each(s.document->'operations') op
    where s.job_id=p_job_id and op.value->>'state' in ('intent','failed'));
$$;
create or replace function public.ugc_update_claim(p_job_id uuid,p_claim_token uuid,p_expected_stage text,p_operation text,p_error_code text default null,p_retryable boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; safe_retry boolean;
begin
  if p_operation='advance' and p_expected_stage in ('character_reference','product_reference') then
    raise exception 'Use the Character Sheet checkpoint; Product generation is not implemented.' using errcode='23514'; end if;
  if p_expected_stage='character_reference' and p_operation in ('fail','release') then
    select * into j from public.ugc_generation_jobs where id=p_job_id for update;
    if not found or j.status<>'running' or j.stage<>p_expected_stage or p_claim_token is null
      or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp() then return null; end if;
    if j.cancellation_requested_at is not null then return public.ugc_update_claim_v1(j.id,p_claim_token,j.stage,'cancel'); end if;
    safe_retry:=public.ugc_character_can_resume(j.id);
    if p_operation='release' and safe_retry and j.attempt_count<j.max_attempts then
      update public.ugc_generation_jobs set status='queued',stage='character_reference',worker_id=null,claim_token=null,
        lease_expires_at=null,next_retry_at=clock_timestamp()+interval '5 seconds' where id=j.id returning * into j;
      return to_jsonb(j);
    end if;
    if p_operation='release' then p_error_code:='RECONCILIATION_REQUIRED'; p_retryable:=false; end if;
    if public.ugc_job_error_message(p_error_code) is null then return null; end if;
    safe_retry:=safe_retry and coalesce(p_retryable,false) and j.attempt_count<j.max_attempts and p_error_code in (
      'CHARACTER_CONFIG_INVALID','CHARACTER_STORAGE_FAILED','CHARACTER_COMPOSITION_FAILED','CHARACTER_AUTH_FAILED','CHARACTER_RATE_LIMITED','WORKER_ERROR');
    update public.ugc_generation_jobs set status='failed',stage='failed',resume_stage='character_reference',failed_at=clock_timestamp(),
      error_code=p_error_code,safe_error_message=public.ugc_job_error_message(p_error_code),retry_eligible=safe_retry,
      worker_id=null,claim_token=null,lease_expires_at=null where id=j.id returning * into j;
    return to_jsonb(j);
  end if;
  return public.ugc_update_claim_m4(p_job_id,p_claim_token,p_expected_stage,p_operation,p_error_code,p_retryable);
end; $$;

-- Known remote IDs are safe to poll after a crash. Unknown submission intents
-- remain reconciliation-only through the existing M4 lease recovery.
create or replace function public.ugc_claim_job(p_worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  if p_worker_id is null then return null; end if;
  for j in select * from public.ugc_generation_jobs q where q.status='running' and q.stage='character_reference'
    and q.lease_expires_at<=clock_timestamp() and q.attempt_count<q.max_attempts and q.cancellation_requested_at is null
    order by q.lease_expires_at,q.id for update skip locked limit 25 loop
    if public.ugc_character_can_resume(j.id) then
      update public.ugc_generation_jobs set status='queued',stage='character_reference',worker_id=null,claim_token=null,
        lease_expires_at=null,next_retry_at=clock_timestamp()+interval '5 seconds' where id=j.id;
    end if;
  end loop;
  return public.ugc_claim_job_m4(p_worker_id);
end; $$;
create or replace function public.ugc_retry_owned_job(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id and owner_user_id=p_owner_user_id and project_id=p_project_id for update;
  if not found then return null; end if;
  if j.resume_stage<>'character_reference' then return public.ugc_retry_owned_job_m4(p_owner_user_id,p_project_id,p_job_id); end if;
  if j.status='queued' then return to_jsonb(j); end if;
  if j.status<>'failed' or not j.retry_eligible or j.attempt_count>=j.max_attempts or j.cancellation_requested_at is not null
    or not public.ugc_character_can_resume(j.id) or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return null; end if;
  update public.ugc_generation_jobs set status='queued',stage='character_reference',failed_at=null,error_code=null,safe_error_message=null,
    retry_eligible=false,next_retry_at=clock_timestamp()+interval '5 seconds' where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;

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
    when 'development_paused' then case new.pause_reason when 'PRODUCT_REFERENCE_NOT_IMPLEMENTED' then 'Character ready. Product Reference Sheet generation is not available yet.' when 'CHARACTER_REFERENCE_NOT_IMPLEMENTED' then 'References analyzed. Character Reference Sheet generation is not available yet.' else 'Inputs validated. Reference analysis is not available yet.' end
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

revoke all on function public.ugc_job_error_message_m4(text),public.ugc_update_claim_m4(uuid,uuid,text,text,text,boolean),
  public.ugc_claim_job_m4(uuid),public.ugc_retry_owned_job_m4(uuid,uuid,uuid),public.ugc_character_can_resume(uuid),
  public.ugc_guard_character_sheet() from public,anon,authenticated,service_role;
revoke all on function public.ugc_prepare_character_sheet(uuid,uuid,text,jsonb),public.ugc_checkpoint_character_sheet(uuid,uuid,jsonb,text),
  public.ugc_finish_character_sheet(uuid,uuid),public.ugc_resume_character_sheet(uuid),public.ugc_job_error_message(text),
  public.ugc_finish_references(uuid,uuid),public.ugc_update_claim(uuid,uuid,text,text,text,boolean),public.ugc_claim_job(uuid),
  public.ugc_retry_owned_job(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ugc_prepare_character_sheet(uuid,uuid,text,jsonb),public.ugc_checkpoint_character_sheet(uuid,uuid,jsonb,text),
  public.ugc_finish_character_sheet(uuid,uuid),public.ugc_resume_character_sheet(uuid),public.ugc_finish_references(uuid,uuid),
  public.ugc_update_claim(uuid,uuid,text,text,text,boolean),public.ugc_claim_job(uuid),public.ugc_retry_owned_job(uuid,uuid,uuid) to service_role;
commit;
