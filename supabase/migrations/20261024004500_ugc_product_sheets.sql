-- Manual only, after 043/044 and prerequisites. No job resume/backfill or provider call.
begin;
do $$
declare required record;
begin
  for required in select * from (values
    ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),('ugc_generation_jobs','project_id','uuid'),
    ('ugc_generation_jobs','input_snapshot','jsonb'),('ugc_generation_jobs','status','text'),('ugc_generation_jobs','stage','text'),
    ('ugc_generation_jobs','resume_stage','text'),('ugc_generation_jobs','pause_reason','text'),('ugc_generation_jobs','claim_token','uuid'),
    ('ugc_generation_jobs','lease_expires_at','timestamp with time zone'),('ugc_generation_jobs','analysis_version','integer'),
    ('ugc_generation_jobs','analysis_model','text'),('ugc_generation_jobs','attempt_count','integer'),('ugc_generation_jobs','max_attempts','integer'),
    ('ugc_generation_jobs','retry_eligible','boolean'),('ugc_generation_jobs','next_retry_at','timestamp with time zone'),
    ('ugc_generation_jobs','worker_id','uuid'),('ugc_generation_jobs','claimed_at','timestamp with time zone'),
    ('ugc_generation_jobs','heartbeat_at','timestamp with time zone'),('ugc_generation_jobs','started_at','timestamp with time zone'),
    ('ugc_generation_jobs','failed_at','timestamp with time zone'),('ugc_generation_jobs','cancelled_at','timestamp with time zone'),
    ('ugc_generation_jobs','error_code','text'),('ugc_generation_jobs','safe_error_message','text'),
    ('ugc_generation_jobs','cancellation_requested_at','timestamp with time zone'),('ugc_generation_jobs','validation_completed_at','timestamp with time zone'),
    ('ugc_generation_jobs','processing_elapsed_ms','bigint'),('ugc_generation_jobs','created_at','timestamp with time zone'),
    ('ugc_generation_job_events','job_id','uuid'),('ugc_generation_job_events','status','text'),('ugc_generation_job_events','stage','text'),
    ('ugc_generation_job_events','event_type','text'),('ugc_generation_job_events','safe_message','text'),('ugc_generation_job_events','metadata','jsonb'),
    ('ugc_character_sheets','id','uuid'),('ugc_character_sheets','job_id','uuid'),('ugc_character_sheets','owner_user_id','uuid'),
    ('ugc_character_sheets','project_id','uuid'),('ugc_character_sheets','status','text'),('ugc_character_sheets','document','jsonb'),
    ('ugc_reference_analyses','id','uuid'),('ugc_reference_analyses','job_id','uuid'),('ugc_reference_analyses','owner_user_id','uuid'),
    ('ugc_reference_analyses','project_id','uuid'),('ugc_reference_analyses','source_asset_id','uuid'),('ugc_reference_analyses','state','text'),
    ('ugc_reference_analyses','analysis_type','text'),('ugc_reference_analyses','analysis_version','integer'),('ugc_reference_analyses','requested_model','text'),
    ('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text'),('project_assets','id','uuid'),('app_users','id','uuid')
  ) v(table_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=required.table_name
      and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Product Sheet prerequisite missing or incompatible: %.%',required.table_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.ugc_checkpoint_character_sheet_m5(uuid,uuid,jsonb,text)') is null
    or to_regprocedure('public.ugc_snapshot_matches_records(uuid,uuid,jsonb,boolean)') is null
    or to_regprocedure('public.ugc_update_claim_v1(uuid,uuid,text,text,text,boolean)') is null then
    raise exception 'Apply prerequisites through 043/044 first.'; end if;
  if to_regclass('public.ugc_product_sheets') is not null and obj_description(to_regclass('public.ugc_product_sheets'),'pg_class')
    is distinct from 'sceenyk-ugc-product-sheet-v1-045' then raise exception 'Inspect existing Product Sheet relation first.'; end if;
end; $$;

create table if not exists public.ugc_product_sheets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  project_id uuid not null,
  job_id uuid not null unique references public.ugc_generation_jobs(id) on delete restrict,
  source_asset_id uuid not null references public.project_assets(id) on delete restrict,
  product_name text not null check(char_length(product_name) between 1 and 80),
  asset_type text not null default 'product_sheet' check(asset_type='product_sheet'),
  sheet_version integer not null default 1 check(sheet_version=1),
  provider text not null default 'openai' check(provider='openai'),
  provider_model text not null check(provider_model='gpt-image-2.5-sunburst'),
  status text not null default 'preparing' check(status in ('preparing','completed')),
  document jsonb not null check((jsonb_typeof(document)='object' and octet_length(document::text)<=131072
    and document->'schemaVersion'='1'::jsonb and document->>'promptVersion'='product-sheet-v1'
    and document->'analysisVersion'='1'::jsonb and jsonb_typeof(document->'instructions')='object'
    and jsonb_typeof(document->'operations')='object' and jsonb_typeof(document->'assets')='object'
    and jsonb_typeof(document->'provenance')='object') is true),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict,
  check(status<>'completed' or document->'assets' ?& array['primary','angle','detail','sheet'])
);
comment on table public.ugc_product_sheets is 'sceenyk-ugc-product-sheet-v1-045';
alter table public.ugc_product_sheets enable row level security;
revoke all on table public.ugc_product_sheets from public,anon,authenticated,service_role;
grant select on table public.ugc_product_sheets to service_role;

-- Separate bounded Product claims let a Character-complete job at 3/3 continue
-- without resetting immutable max_attempts, historical claims or paid checkpoints.
alter table public.ugc_generation_jobs add column if not exists product_attempt_count integer not null default 0;
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_generation_jobs'
    and column_name='product_attempt_count' and data_type='integer' and is_nullable='NO') then
    raise exception 'Incompatible Product claim counter.'; end if;
end; $$;
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_product_attempts;
alter table public.ugc_generation_jobs add constraint ugc_jobs_product_attempts check(product_attempt_count between 0 and 3);

-- Location is a queued, non-runnable boundary only. No Location execution handler.
alter table public.ugc_generation_jobs drop constraint if exists ugc_generation_jobs_stage_check;
alter table public.ugc_generation_jobs add constraint ugc_generation_jobs_stage_check check(stage in (
  'queued','validate_inputs','analyze_references','character_reference','product_reference','location_reference',
  'build_storyboard','build_generation_package','cost_review','awaiting_confirmation','video_generation','finalizing','complete','failed','cancelled'));
alter table public.ugc_generation_jobs drop constraint if exists ugc_generation_jobs_resume_stage_check;
alter table public.ugc_generation_jobs add constraint ugc_generation_jobs_resume_stage_check check(resume_stage in (
  'validate_inputs','analyze_references','character_reference','product_reference','location_reference',
  'build_storyboard','build_generation_package','cost_review','video_generation','finalizing'));
alter table public.ugc_generation_job_events drop constraint if exists ugc_generation_job_events_stage_check;
alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_stage_check check(stage in (
  'queued','validate_inputs','analyze_references','character_reference','product_reference','location_reference',
  'build_storyboard','build_generation_package','cost_review','awaiting_confirmation','video_generation','finalizing','complete','failed','cancelled'));
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_status_stage;
alter table public.ugc_generation_jobs add constraint ugc_jobs_status_stage check(
  (status='queued' and stage in ('queued','analyze_references','character_reference','product_reference','location_reference')) or
  (status='running' and stage in ('validate_inputs','analyze_references','character_reference','product_reference',
    'build_storyboard','build_generation_package','cost_review','video_generation','finalizing')) or
  (status='awaiting_confirmation' and stage='awaiting_confirmation') or (status='completed' and stage='complete') or
  (status='failed' and stage='failed') or (status='cancelled' and stage='cancelled'));
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_pause_state;
alter table public.ugc_generation_jobs add constraint ugc_jobs_pause_state check(
  (pause_reason is null and stage<>'location_reference') or
  (pause_reason is not null and status='queued' and validation_completed_at is not null and
    ((pause_reason='REFERENCE_ANALYSIS_NOT_IMPLEMENTED' and stage='analyze_references') or
     (pause_reason='CHARACTER_REFERENCE_NOT_IMPLEMENTED' and stage='character_reference' and analysis_version=1) or
     (pause_reason='PRODUCT_REFERENCE_NOT_IMPLEMENTED' and stage='product_reference' and analysis_version=1) or
     (pause_reason='LOCATION_REFERENCE_NOT_IMPLEMENTED' and stage='location_reference' and analysis_version=1))));
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_retry_state;
alter table public.ugc_generation_jobs add constraint ugc_jobs_retry_state check(
  (not retry_eligible or (status='failed' and
    ((resume_stage='product_reference' and product_attempt_count<3 and error_code in (
      'PRODUCT_CONFIG_INVALID','PRODUCT_SOURCE_UNAVAILABLE','PRODUCT_PRIMARY_GENERATION_FAILED','PRODUCT_ANGLE_GENERATION_FAILED',
      'PRODUCT_DETAIL_GENERATION_FAILED','PRODUCT_OUTPUT_STORAGE_FAILED','PRODUCT_SHEET_COMPOSITION_FAILED','WORKER_ERROR','WORKER_INTERRUPTED','LEASE_EXPIRED')) or
     (attempt_count<max_attempts and
      ((resume_stage='validate_inputs' and error_code in ('WORKER_ERROR','WORKER_INTERRUPTED','LEASE_EXPIRED')) or
       (resume_stage='analyze_references' and error_code in ('REFERENCE_CONFIG_INVALID','REFERENCE_ASSET_UNAVAILABLE','REFERENCE_AUTH_FAILED','REFERENCE_RATE_LIMITED')) or
       (resume_stage='character_reference' and error_code in ('CHARACTER_CONFIG_INVALID','CHARACTER_STORAGE_FAILED','CHARACTER_COMPOSITION_FAILED',
         'CHARACTER_AUTH_FAILED','CHARACTER_RATE_LIMITED','WORKER_INTERRUPTED','LEASE_EXPIRED','WORKER_ERROR','CHARACTER_OUTPUT_INVALID')))))))
  and (next_retry_at is null or status='queued'));

alter table public.ugc_generation_job_events drop constraint if exists ugc_generation_job_events_event_type_check;
alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_event_type_check check(event_type in (
  'enqueued','claimed','stage_changed','failed','completed','cancelled','cancellation_requested','retry_scheduled','released',
  'inputs_validated','development_paused','development_resumed','reference_analyzed','character_progress','character_ready',
  'character_reference.started','character_reference.soul_id_ready','character_reference.front_generating','character_reference.front_ready',
  'character_reference.back_generating','character_reference.back_ready','character_reference.face_generating','character_reference.face_ready',
  'character_reference.composing','character_reference.complete',
  'product_reference.started','product_reference.primary_generating','product_reference.primary_ready',
  'product_reference.angle_generating','product_reference.angle_ready','product_reference.detail_generating','product_reference.detail_ready',
  'product_reference.composing','product_reference.complete'));

do $$ begin
  if to_regprocedure('public.ugc_job_error_message_m5(text)') is null then
    alter function public.ugc_job_error_message(text) rename to ugc_job_error_message_m5; end if;
  if to_regprocedure('public.ugc_job_next_stage_m5(text)') is null then
    alter function public.ugc_job_next_stage(text) rename to ugc_job_next_stage_m5; end if;
  if to_regprocedure('public.ugc_update_claim_m5(uuid,uuid,text,text,text,boolean)') is null then
    alter function public.ugc_update_claim(uuid,uuid,text,text,text,boolean) rename to ugc_update_claim_m5; end if;
  if to_regprocedure('public.ugc_retry_owned_job_m5(uuid,uuid,uuid)') is null then
    alter function public.ugc_retry_owned_job(uuid,uuid,uuid) rename to ugc_retry_owned_job_m5; end if;
end; $$;
create or replace function public.ugc_job_next_stage(p_stage text) returns text
language sql immutable set search_path='' as $$
  select case when p_stage='product_reference' then 'location_reference' when p_stage='location_reference' then 'build_storyboard'
    else public.ugc_job_next_stage_m5(p_stage) end;
$$;
create or replace function public.ugc_job_error_message(p_code text) returns text
language sql immutable set search_path='' as $$
  select case
    when p_code='PRODUCT_CONFIG_INVALID' then 'Product generation configuration is missing or disabled.'
    when p_code='PRODUCT_SOURCE_UNAVAILABLE' then 'The original private product image could not be loaded.'
    when p_code='PRODUCT_CHARACTER_NOT_READY' then 'The character reference must be complete before preparing the product.'
    when p_code='PRODUCT_ANALYSIS_INVALID' then 'The saved product analysis could not be validated.'
    when p_code in ('PRODUCT_PRIMARY_GENERATION_FAILED','PRODUCT_ANGLE_GENERATION_FAILED','PRODUCT_DETAIL_GENERATION_FAILED') then 'Product image generation stopped safely. Review the request outcome before retrying.'
    when p_code in ('PRODUCT_PRIMARY_OUTPUT_MISSING','PRODUCT_ANGLE_OUTPUT_MISSING','PRODUCT_DETAIL_OUTPUT_MISSING') then 'The requested product view was missing from the provider response.'
    when p_code='PRODUCT_OUTPUT_EMPTY' then 'The generated product image was empty.'
    when p_code='PRODUCT_OUTPUT_TOO_LARGE' then 'The generated product image exceeded the supported size.'
    when p_code='PRODUCT_OUTPUT_FORMAT_UNSUPPORTED' then 'The generated product image format was unsupported.'
    when p_code='PRODUCT_OUTPUT_DECODE_FAILED' then 'The generated product image could not be decoded.'
    when p_code='PRODUCT_OUTPUT_DIMENSIONS_INVALID' then 'The generated product image dimensions were invalid.'
    when p_code='PRODUCT_OUTPUT_STORAGE_FAILED' then 'A private product image could not be saved or loaded.'
    when p_code='PRODUCT_OUTPUT_INTEGRITY_FAILED' then 'A saved product image failed its integrity check.'
    when p_code='PRODUCT_CHECKPOINT_INVALID' then 'The saved product reference checkpoint could not be validated.'
    when p_code='PRODUCT_SHEET_COMPOSITION_FAILED' then 'The product reference sheet could not be composed.'
    else public.ugc_job_error_message_m5(p_code) end;
$$;
-- Rebind CHECK OID after function rename. Historical Character failures retain copy.
alter table public.ugc_generation_jobs drop constraint if exists ugc_jobs_error_state;
alter table public.ugc_generation_jobs add constraint ugc_jobs_error_state check(
  (status='failed' and error_code is not null and safe_error_message is not null
    and public.ugc_job_error_message(error_code) is not null and safe_error_message=public.ugc_job_error_message(error_code)) or
  (status<>'failed' and error_code is null and safe_error_message is null));

create or replace function public.ugc_guard_product_sheet() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Product reference history is retained.' using errcode='23514'; end if;
  if old.status='completed' or (to_jsonb(new)-array['document','status','updated_at']) is distinct from
    (to_jsonb(old)-array['document','status','updated_at']) or
    (new.document-array['operations','assets']) is distinct from (old.document-array['operations','assets']) then
    raise exception 'Immutable Product reference identity and instructions.' using errcode='23514'; end if;
  new.updated_at:=clock_timestamp(); return new;
end; $$;
drop trigger if exists ugc_guard_product_sheet on public.ugc_product_sheets;
create trigger ugc_guard_product_sheet before update or delete on public.ugc_product_sheets for each row execute function public.ugc_guard_product_sheet();

create or replace function public.ugc_append_product_progress(p_job_id uuid,p_event text,p_view text default null) returns void
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; message text;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'product_reference' or j.lease_expires_at<=clock_timestamp() then return; end if;
  message:=case p_event
    when 'product_reference.started' then 'Creating product reference.'
    when 'product_reference.primary_generating' then 'Generating the primary product view.'
    when 'product_reference.primary_ready' then 'Primary product view saved.'
    when 'product_reference.angle_generating' then 'Generating the angled product view.'
    when 'product_reference.angle_ready' then 'Angled product view saved.'
    when 'product_reference.detail_generating' then 'Generating the product detail reference.'
    when 'product_reference.detail_ready' then 'Product detail reference saved.'
    when 'product_reference.composing' then 'Building the product sheet.'
    when 'product_reference.complete' then 'Product reference complete.' end;
  if message is null or (p_view is not null and p_view not in ('primary','angle','detail')) then
    raise exception 'Unsupported Product progress event.' using errcode='23514'; end if;
  if not exists(select 1 from public.ugc_generation_job_events where job_id=j.id and event_type=p_event) then
    insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
      values(j.id,j.status,j.stage,p_event,message,jsonb_build_object('attempt',j.product_attempt_count,'resumeStage',j.resume_stage)||
        case when p_view is null then '{}'::jsonb else jsonb_build_object('view',p_view) end);
  end if;
end; $$;

create or replace function public.ugc_prepare_product_sheet(p_job_id uuid,p_claim_token uuid,p_model text,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_product_sheets;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'product_reference' or p_claim_token is null or j.claim_token is distinct from p_claim_token
    or j.lease_expires_at<=clock_timestamp() or j.cancellation_requested_at is not null or j.input_snapshot->>'schemaVersion'<>'3'
    or j.analysis_version is distinct from 1 or p_model is distinct from 'gpt-image-2.5-sunburst' then return null; end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then return null; end if;
  if not exists(select 1 from public.ugc_character_sheets c where c.id=(p_document->>'characterSheetId')::uuid and c.job_id=j.id
    and c.owner_user_id=j.owner_user_id and c.project_id=j.project_id and c.status='completed' and c.document->'assets' ? 'sheet')
    or not exists(select 1 from public.ugc_reference_analyses a where a.id=(p_document->>'analysisId')::uuid and a.job_id=j.id
      and a.owner_user_id=j.owner_user_id and a.project_id=j.project_id and a.source_asset_id=(j.input_snapshot->'product'->>'assetId')::uuid
      and a.analysis_type='product' and a.state='completed' and a.analysis_version=j.analysis_version and a.requested_model=j.analysis_model)
    or j.lease_expires_at<=clock_timestamp() then return null; end if;
  select * into s from public.ugc_product_sheets where job_id=j.id;
  if found then
    if s.provider_model<>p_model or (s.document-array['instructions','operations','assets','provenance']) is distinct from
      (p_document-array['instructions','operations','assets','provenance']) then return null; end if;
    return to_jsonb(s);
  end if;
  if p_document->'operations' is distinct from '{}'::jsonb or p_document->'assets' is distinct from '{}'::jsonb then return null; end if;
  insert into public.ugc_product_sheets(owner_user_id,project_id,job_id,source_asset_id,product_name,provider_model,document)
    values(j.owner_user_id,j.project_id,j.id,(j.input_snapshot->'product'->>'assetId')::uuid,j.input_snapshot->'product'->>'name',p_model,p_document) returning * into s;
  perform public.ugc_append_product_progress(j.id,'product_reference.started');
  return to_jsonb(s);
end; $$;

create or replace function public.ugc_checkpoint_product_sheet(p_job_id uuid,p_claim_token uuid,p_document jsonb,p_composing boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_product_sheets; item record; incoming jsonb; view_name text; asset jsonb;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'product_reference' or p_claim_token is null or j.claim_token is distinct from p_claim_token
    or j.lease_expires_at<=clock_timestamp() or j.cancellation_requested_at is not null then return false; end if;
  select * into s from public.ugc_product_sheets where job_id=j.id for update;
  if not found or s.status<>'preparing' or (p_document-array['operations','assets']) is distinct from (s.document-array['operations','assets'])
    or jsonb_typeof(p_document->'operations') is distinct from 'object' or jsonb_typeof(p_document->'assets') is distinct from 'object' then return false; end if;
  for item in select * from jsonb_each(s.document->'assets') loop
    if p_document->'assets'->item.key is distinct from item.value then return false; end if;
  end loop;
  for item in select * from jsonb_each(s.document->'operations') loop
    incoming:=p_document->'operations'->item.key;
    if incoming is null then return false; end if;
    if item.value->>'state'='completed' and incoming is distinct from item.value then return false; end if;
    if item.value->>'state'<>'rejected' and incoming->>'key' is distinct from item.value->>'key' then return false; end if;
    if item.value->>'state'='received' and incoming->>'state' not in ('received','completed') then return false; end if;
    if item.value->>'requestId' is not null and item.value->>'state'<>'rejected'
      and incoming->>'requestId' is distinct from item.value->>'requestId' then return false; end if;
    if item.value->'usage' is not null and incoming->'usage' is distinct from item.value->'usage' then return false; end if;
  end loop;
  for item in select * from jsonb_each(p_document->'operations') loop
    if item.key not in ('primary','angle','detail') or coalesce(item.value->>'state','') not in ('intent','rejected','received','completed')
      or coalesce(item.value->>'key','') !~ '^[a-f0-9-]{36}$' then return false; end if;
    if item.value->>'state'='completed' and not(p_document->'assets' ? item.key) then return false; end if;
  end loop;
  for item in select * from jsonb_each(p_document->'assets') loop
    asset:=item.value;
    if item.key not in ('primary','angle','detail','sheet') or jsonb_typeof(asset) is distinct from 'object'
      or asset->>'storageKey' is distinct from ('ugc/'||j.owner_user_id||'/'||j.project_id||'/'||j.id||'/product-v1/'||s.id||'/'||
        case item.key when 'sheet' then 'product_sheet' else 'product_'||item.key||'_reference' end||'.png')
      or asset->>'type' is distinct from (case item.key when 'sheet' then 'product_sheet' else 'product_'||item.key||'_reference' end)
      or asset->>'mimeType' is distinct from 'image/png' or coalesce(asset->>'sha256','') !~ '^[a-f0-9]{64}$'
      or coalesce(asset->>'etag','')='' or coalesce(asset->>'id','') !~ '^[a-f0-9-]{36}$'
      or coalesce((asset->>'sizeBytes')::bigint,0) not between 1 and 20971520
      or coalesce((asset->>'width')::integer,0) not between 256 and 4096
      or coalesce((asset->>'height')::integer,0) not between 256 and 4096 then return false; end if;
    if item.key<>'sheet' and p_document->'operations'->item.key->>'state' is distinct from 'completed' then return false; end if;
    if item.key='sheet' and not(p_document->'assets' ?& array['primary','angle','detail']) then return false; end if;
  end loop;
  if coalesce(p_composing,false) and not(p_document->'assets' ?& array['primary','angle','detail']) then return false; end if;
  update public.ugc_product_sheets set document=p_document where id=s.id;
  foreach view_name in array array['primary','angle','detail'] loop
    if p_document->'operations' ? view_name then perform public.ugc_append_product_progress(j.id,'product_reference.'||view_name||'_generating',view_name); end if;
    if p_document->'assets' ? view_name then perform public.ugc_append_product_progress(j.id,'product_reference.'||view_name||'_ready',view_name); end if;
  end loop;
  if coalesce(p_composing,false) then perform public.ugc_append_product_progress(j.id,'product_reference.composing'); end if;
  return true;
end; $$;

create or replace function public.ugc_finish_product_sheet(p_job_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_product_sheets;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'product_reference' or p_claim_token is null
    or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp() then return null; end if;
  if j.cancellation_requested_at is not null then return public.ugc_update_claim_v1(j.id,p_claim_token,j.stage,'cancel'); end if;
  select * into s from public.ugc_product_sheets where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id for update;
  if not found or not(s.document->'assets' ?& array['primary','angle','detail','sheet'])
    or s.document->'operations'->'primary'->>'state' is distinct from 'completed'
    or s.document->'operations'->'angle'->>'state' is distinct from 'completed'
    or s.document->'operations'->'detail'->>'state' is distinct from 'completed' then return null; end if;
  if s.status<>'completed' then update public.ugc_product_sheets set status='completed' where id=s.id; end if;
  perform public.ugc_append_product_progress(j.id,'product_reference.complete');
  update public.ugc_generation_jobs set status='queued',stage='location_reference',resume_stage='location_reference',
    pause_reason='LOCATION_REFERENCE_NOT_IMPLEMENTED',worker_id=null,claim_token=null,lease_expires_at=null,next_retry_at=null
    where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;

create or replace function public.ugc_resume_product_sheet(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'queued' or j.stage<>'product_reference' or j.pause_reason is distinct from 'PRODUCT_REFERENCE_NOT_IMPLEMENTED'
    or j.product_attempt_count>=3 or j.cancellation_requested_at is not null or j.input_snapshot->>'schemaVersion'<>'3'
    or j.analysis_version is distinct from 1 then return false; end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false)
    or not exists(select 1 from public.ugc_character_sheets where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id
      and status='completed' and document->'assets' ?& array['front','back','face','sheet'])
    or (select count(*) from public.ugc_reference_analyses a where a.job_id=j.id and a.owner_user_id=j.owner_user_id
      and a.project_id=j.project_id and a.state='completed' and a.analysis_version=1 and a.requested_model=j.analysis_model
      and a.source_asset_id=(j.input_snapshot->a.analysis_type->>'assetId')::uuid)<>2 then return false; end if;
  update public.ugc_generation_jobs set pause_reason=null where id=j.id;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(j.id,j.status,j.stage,'development_resumed','Product generation enabled for the local worker.',jsonb_build_object('resumeStage',j.resume_stage));
  return true;
end; $$;

-- A known successful asset can recover a crash between R2 PUT and SQL. Unknown
-- intents may be inspected on a bounded restart but the service NEVER resubmits
-- them. Missing R2 then produces RECONCILIATION_REQUIRED, not another paid edit.
create or replace function public.ugc_update_claim(p_job_id uuid,p_claim_token uuid,p_expected_stage text,p_operation text,p_error_code text default null,p_retryable boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  if p_operation='advance' and p_expected_stage in ('product_reference','location_reference') then
    raise exception 'Use Product completion; Location generation is not implemented.' using errcode='23514'; end if;
  if p_expected_stage='product_reference' and p_operation in ('fail','release') then
    select * into j from public.ugc_generation_jobs where id=p_job_id for update;
    if not found or j.status<>'running' or j.stage<>p_expected_stage or p_claim_token is null
      or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=clock_timestamp() then return null; end if;
    if j.cancellation_requested_at is not null then return public.ugc_update_claim_v1(j.id,p_claim_token,j.stage,'cancel'); end if;
    if p_operation='release' and j.product_attempt_count<3 then
      update public.ugc_generation_jobs set status='queued',worker_id=null,claim_token=null,lease_expires_at=null,
        next_retry_at=clock_timestamp()+interval '5 seconds' where id=j.id returning * into j;
      return to_jsonb(j);
    end if;
    if p_operation='release' then p_error_code:='ATTEMPTS_EXHAUSTED'; p_retryable:=false; end if;
    if public.ugc_job_error_message(p_error_code) is null then return null; end if;
    update public.ugc_generation_jobs set status='failed',stage='failed',resume_stage='product_reference',failed_at=clock_timestamp(),
      error_code=p_error_code,safe_error_message=public.ugc_job_error_message(p_error_code),worker_id=null,claim_token=null,lease_expires_at=null,
      retry_eligible=coalesce(p_retryable,false) and j.product_attempt_count<3 and p_error_code in (
        'PRODUCT_CONFIG_INVALID','PRODUCT_SOURCE_UNAVAILABLE','PRODUCT_PRIMARY_GENERATION_FAILED','PRODUCT_ANGLE_GENERATION_FAILED',
        'PRODUCT_DETAIL_GENERATION_FAILED','PRODUCT_OUTPUT_STORAGE_FAILED','PRODUCT_SHEET_COMPOSITION_FAILED','WORKER_ERROR')
      where id=j.id returning * into j;
    return to_jsonb(j);
  end if;
  return public.ugc_update_claim_m5(p_job_id,p_claim_token,p_expected_stage,p_operation,p_error_code,p_retryable);
end; $$;

create or replace function public.ugc_claim_job(p_worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; failure text; can_retry boolean;
begin
  if p_worker_id is null then return null; end if;
  -- Preserve Character known-ID recovery and validation-only automatic retry.
  for j in select * from public.ugc_generation_jobs q where q.status='running' and q.lease_expires_at<=clock_timestamp()
    order by q.lease_expires_at,q.id for update skip locked limit 25 loop
    if j.cancellation_requested_at is not null then
      update public.ugc_generation_jobs set status='cancelled',stage='cancelled',cancelled_at=clock_timestamp(),
        worker_id=null,claim_token=null,lease_expires_at=null where id=j.id;
    elsif (j.stage='character_reference' and j.attempt_count<j.max_attempts and public.ugc_character_can_resume(j.id))
      or (j.stage='product_reference' and j.product_attempt_count<3) then
      update public.ugc_generation_jobs set status='queued',worker_id=null,claim_token=null,lease_expires_at=null,
        next_retry_at=clock_timestamp()+interval '5 seconds' where id=j.id;
    else
      can_retry:=j.stage='validate_inputs' and j.attempt_count<j.max_attempts;
      failure:=case when j.stage<>'validate_inputs' then 'RECONCILIATION_REQUIRED'
        when j.attempt_count>=j.max_attempts then 'ATTEMPTS_EXHAUSTED' else 'LEASE_EXPIRED' end;
      update public.ugc_generation_jobs set status='failed',resume_stage=j.stage,stage='failed',failed_at=clock_timestamp(),
        error_code=failure,safe_error_message=public.ugc_job_error_message(failure),retry_eligible=can_retry,
        worker_id=null,claim_token=null,lease_expires_at=null where id=j.id;
      if can_retry then
        update public.ugc_generation_jobs set status='queued',stage='queued',failed_at=null,error_code=null,safe_error_message=null,
          retry_eligible=false,next_retry_at=clock_timestamp()+interval '5 seconds' where id=j.id;
      end if;
    end if;
  end loop;
  for j in select * from public.ugc_generation_jobs q where q.status='queued' and not exists(
      select 1 from public.projects p where p.id=q.project_id and p.owner_user_id=q.owner_user_id and p.status='draft')
    order by q.created_at,q.id for update skip locked limit 25 loop
    update public.ugc_generation_jobs set status='failed',stage='failed',pause_reason=null,failed_at=clock_timestamp(),next_retry_at=null,
      error_code='PROJECT_UNAVAILABLE',safe_error_message=public.ugc_job_error_message('PROJECT_UNAVAILABLE') where id=j.id;
  end loop;
  select q.* into j from public.ugc_generation_jobs q where q.status='queued' and q.pause_reason is null
    and q.stage<>'location_reference' and case when q.resume_stage='product_reference' then q.product_attempt_count<3 else q.attempt_count<q.max_attempts end
    and (q.next_retry_at is null or q.next_retry_at<=clock_timestamp())
    and exists(select 1 from public.projects p where p.id=q.project_id and p.owner_user_id=q.owner_user_id and p.status='draft')
    order by q.created_at,q.id for update skip locked limit 1;
  if not found then return null; end if;
  update public.ugc_generation_jobs set status='running',stage=resume_stage,
    attempt_count=attempt_count+case when resume_stage='product_reference' then 0 else 1 end,
    product_attempt_count=product_attempt_count+case when resume_stage='product_reference' then 1 else 0 end,
    worker_id=p_worker_id,claim_token=gen_random_uuid(),claimed_at=clock_timestamp(),heartbeat_at=clock_timestamp(),
    lease_expires_at=clock_timestamp()+interval '90 seconds',started_at=coalesce(started_at,clock_timestamp()),next_retry_at=null
    where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;

create or replace function public.ugc_retry_owned_job(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id and owner_user_id=p_owner_user_id and project_id=p_project_id for update;
  if not found then return null; end if;
  if j.resume_stage<>'product_reference' then return public.ugc_retry_owned_job_m5(p_owner_user_id,p_project_id,p_job_id); end if;
  if j.status='queued' then return to_jsonb(j); end if;
  if j.status<>'failed' or not j.retry_eligible or j.product_attempt_count>=3 or j.cancellation_requested_at is not null
    or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return null; end if;
  update public.ugc_generation_jobs set status='queued',stage='product_reference',failed_at=null,error_code=null,safe_error_message=null,
    retry_eligible=false,next_retry_at=clock_timestamp()+interval '5 seconds' where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;

-- Preserve existing fixed-copy events, adding only the new Location pause copy.
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
    when 'development_paused' then case new.pause_reason
      when 'LOCATION_REFERENCE_NOT_IMPLEMENTED' then 'Your character and product references are ready. Location generation has not started yet.'
      when 'PRODUCT_REFERENCE_NOT_IMPLEMENTED' then 'Character ready. Product Reference Sheet generation is not available yet.'
      when 'CHARACTER_REFERENCE_NOT_IMPLEMENTED' then 'References analyzed. Character Reference Sheet generation is not available yet.'
      else 'Inputs validated. Reference analysis is not available yet.' end
    when 'enqueued' then 'Job queued for the local worker.' when 'claimed' then 'Local worker claimed this job.'
    when 'failed' then new.safe_error_message when 'cancelled' then 'Job cancelled at a safe boundary.'
    when 'completed' then 'Job completed.' when 'retry_scheduled' then 'A bounded safe retry was scheduled.'
    when 'released' then 'Local worker released safe unfinished work.' when 'cancellation_requested' then 'Cancellation requested.'
    else 'Workflow stage changed.' end;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(new.id,new.status,new.stage,event_kind,message,jsonb_build_object('attempt',new.attempt_count,'resumeStage',new.resume_stage));
  return new;
end; $$;

revoke all on function public.ugc_job_error_message_m5(text),public.ugc_job_next_stage_m5(text),
  public.ugc_update_claim_m5(uuid,uuid,text,text,text,boolean),public.ugc_retry_owned_job_m5(uuid,uuid,uuid),
  public.ugc_guard_product_sheet(),public.ugc_append_product_progress(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.ugc_prepare_product_sheet(uuid,uuid,text,jsonb),public.ugc_checkpoint_product_sheet(uuid,uuid,jsonb,boolean),
  public.ugc_finish_product_sheet(uuid,uuid),public.ugc_resume_product_sheet(uuid),public.ugc_update_claim(uuid,uuid,text,text,text,boolean),
  public.ugc_claim_job(uuid),public.ugc_retry_owned_job(uuid,uuid,uuid),public.ugc_job_error_message(text),public.ugc_job_next_stage(text)
  from public,anon,authenticated;
grant execute on function public.ugc_prepare_product_sheet(uuid,uuid,text,jsonb),public.ugc_checkpoint_product_sheet(uuid,uuid,jsonb,boolean),
  public.ugc_finish_product_sheet(uuid,uuid),public.ugc_resume_product_sheet(uuid),public.ugc_update_claim(uuid,uuid,text,text,text,boolean),
  public.ugc_claim_job(uuid),public.ugc_retry_owned_job(uuid,uuid,uuid) to service_role;
commit;
