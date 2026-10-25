-- Manual after 048. Definitions only: no job/request/approval/asset backfill.
begin;
do $$ declare needed record; begin
  for needed in select * from (values
    ('ugc_reference_reviews','execution_diagnostic','jsonb'),('ugc_reference_reviews','execution_token','uuid'),
    ('ugc_reference_reviews','execution_state','text'),('ugc_reference_reviews','version','integer'),
    ('ugc_reference_reviews','composed_version','integer'),('ugc_reference_reviews','character_sheet_id','uuid'),
    ('ugc_generation_jobs','pause_reason','text'),('ugc_generation_jobs','stage','text'),
    ('ugc_generation_jobs','status','text'),('ugc_reference_regeneration_requests','replacement_asset','jsonb')
  ) v(t,c,d) loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=needed.t
      and column_name=needed.c and data_type=needed.d) then raise exception 'Apply 048 and prerequisites first: %.%',needed.t,needed.c; end if;
  end loop;
  if to_regprocedure('public.ugc_claim_reference_regeneration_m66(uuid,boolean)') is null
    or to_regprocedure('public.ugc_regeneration_diagnostic_valid(jsonb)') is null
    or to_regprocedure('public.ugc_reference_group_approved(uuid,text)') is null then raise exception 'Apply 048 first.'; end if;
end; $$;

alter table public.ugc_reference_reviews drop constraint if exists ugc_reference_reviews_execution_error_check;
alter table public.ugc_reference_reviews add constraint ugc_reference_reviews_execution_error_check check(execution_error is null or execution_error in
  ('REGENERATION_FAILED','RECONCILIATION_REQUIRED','IDENTITY_UNAVAILABLE','ATTEMPTS_EXHAUSTED','CHARACTER_SHEET_RECOVERY_FAILED','CHARACTER_SHEET_COMPOSITION_FAILED'));

-- Preserve the existing running-stage admission checks, adding the missing
-- queued Location gate. No Location worker/stage implementation is introduced.
create or replace function public.ugc_reference_claim_gate() returns trigger
language plpgsql security definer set search_path='' as $$
declare blocked boolean; character_ready boolean; product_ready boolean;
begin
  if new.status='running' and (old.status<>'running' or new.stage is distinct from old.stage) and new.stage in ('character_reference','product_reference') then
    blocked:=exists(select 1 from public.ugc_reference_reviews r where r.job_id=new.id and (r.version<>r.composed_version
      or exists(select 1 from public.ugc_reference_regeneration_requests q where q.review_id=r.id and q.state<>'completed')));
    if new.stage='product_reference' and not public.ugc_reference_group_approved(new.id,'character') then blocked:=true; end if;
    if blocked then
      new.status:='queued'; new.resume_stage:=new.stage;
      new.pause_reason:=case new.stage when 'product_reference' then 'PRODUCT_REFERENCE_NOT_IMPLEMENTED' else 'CHARACTER_REFERENCE_NOT_IMPLEMENTED' end;
      new.worker_id:=null; new.claim_token:=null; new.lease_expires_at:=null;
      new.attempt_count:=old.attempt_count; new.product_attempt_count:=old.product_attempt_count;
    end if;
  end if;
  if new.stage is distinct from old.stage and new.stage in ('build_storyboard','build_generation_package','cost_review','awaiting_confirmation','video_generation','finalizing','complete')
    and not public.ugc_location_references_approved(new.id) then raise exception 'Current Character and Product approval is required.' using errcode='23514'; end if;
  if new.stage='location_reference' then
    if new.status<>'queued' or new.pause_reason is distinct from 'LOCATION_REFERENCE_NOT_IMPLEMENTED' then
      raise exception 'Location generation is not implemented.' using errcode='23514'; end if;
    character_ready:=public.ugc_reference_group_approved(new.id,'character');
    product_ready:=public.ugc_reference_group_approved(new.id,'product');
    if not character_ready or not product_ready then
      new.stage:=case when not character_ready then 'character_reference' else 'product_reference' end;
      new.resume_stage:=new.stage;
      new.pause_reason:=case when not character_ready then 'CHARACTER_REFERENCE_NOT_IMPLEMENTED' else 'PRODUCT_REFERENCE_NOT_IMPLEMENTED' end;
    end if;
  end if;
  return new;
end; $$;

create or replace function public.ugc_reconcile_reference_gate(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; target text; pause text;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'queued' or j.stage not in ('character_reference','product_reference','location_reference')
    or j.cancellation_requested_at is not null or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft')
    or not exists(select 1 from public.ugc_character_sheets where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id and status='completed') then return false; end if;
  if not public.ugc_reference_group_approved(j.id,'character') then target:='character_reference'; pause:='CHARACTER_REFERENCE_NOT_IMPLEMENTED';
  elsif not public.ugc_reference_group_approved(j.id,'product') then target:='product_reference'; pause:='PRODUCT_REFERENCE_NOT_IMPLEMENTED';
  else target:='location_reference'; pause:='LOCATION_REFERENCE_NOT_IMPLEMENTED'; end if;
  if j.stage is distinct from target or j.pause_reason is distinct from pause then
    update public.ugc_generation_jobs set stage=target,resume_stage=target,pause_reason=pause,next_retry_at=null where id=j.id;
  end if;
  return true;
end; $$;
create or replace function public.ugc_review_reconcile_gate() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform public.ugc_reconcile_reference_gate(new.job_id); return new; end; $$;
drop trigger if exists ugc_review_reconcile_gate on public.ugc_reference_reviews;
create trigger ugc_review_reconcile_gate after insert or update of version,composed_version,approved_version,execution_state
  on public.ugc_reference_reviews for each row execute function public.ugc_review_reconcile_gate();

create or replace function public.ugc_claim_character_sheet_recovery(p_job_id uuid,p_worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; r public.ugc_reference_reviews; now_at timestamptz:=clock_timestamp();
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or p_worker_id is null or j.status<>'queued' or j.stage not in ('character_reference','product_reference','location_reference')
    or j.cancellation_requested_at is not null
    or j.input_snapshot->>'schemaVersion' is distinct from '3' or not exists(select 1 from public.projects
      where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return null; end if;
  select * into r from public.ugc_reference_reviews where job_id=j.id and reference_type='character'
    and owner_user_id=j.owner_user_id and project_id=j.project_id for update;
  if not found then return null; end if;
  if exists(select 1 from public.ugc_reference_reviews where job_id=j.id and execution_state='running' and lease_expires_at>now_at) then return null; end if;
  perform public.ugc_reconcile_reference_gate(j.id);
  if r.version=r.composed_version then return null; end if;
  if r.execution_attempts>=3 or r.approved_at is not null or exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed')
    or not exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and view='front' and state='completed' and replacement_asset is not null)
    or not exists(select 1 from public.ugc_character_sheets where id=r.character_sheet_id and job_id=j.id and owner_user_id=j.owner_user_id
      and project_id=j.project_id and status='completed' and document->'assets' ?& array['front','back','face','sheet']) then return null; end if;
  update public.ugc_reference_reviews set execution_state='running',execution_attempts=execution_attempts+1,
    execution_token=gen_random_uuid(),execution_worker_id=p_worker_id,heartbeat_at=now_at,lease_expires_at=now_at+interval '90 seconds',
    processing_elapsed_ms=processing_elapsed_ms+case when processing_updated_at is not null then
      greatest(0,extract(epoch from (least(now_at,lease_expires_at)-processing_updated_at))*1000)::bigint else 0 end,
    processing_updated_at=now_at,execution_error=null,execution_phase='recovery_front_validating' where id=r.id returning * into r;
  return to_jsonb(r);
end; $$;

do $$ declare expression text; begin
  select pg_get_expr(conbin,conrelid) into expression from pg_constraint where conrelid='public.ugc_generation_job_events'::regclass
    and conname='ugc_generation_job_events_event_type_check';
  if expression not like '%recovery_front_validating%' then
    alter table public.ugc_generation_job_events drop constraint ugc_generation_job_events_event_type_check;
    execute 'alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_event_type_check check (('
      ||expression||') or event_type in (''character_reference.recovery_front_validating'',''character_reference.recovery_back_loading'',
      ''character_reference.recovery_face_loading'',''character_reference.recovery_sheet_validating'',
      ''character_reference.recovery_sheet_rebuilding'',''character_reference.recovery_sheet_saving''))';
  end if;
end; $$;

revoke all on function public.ugc_reconcile_reference_gate(uuid),public.ugc_review_reconcile_gate(),public.ugc_reference_claim_gate(),
  public.ugc_claim_character_sheet_recovery(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ugc_claim_character_sheet_recovery(uuid,uuid) to service_role;

-- Updated diagnostic validator and existing fenced publication RPC follow.

-- VOLATILE read predicates see the approval/version writes made by their calling trigger.
create or replace function public.ugc_reference_group_approved(p_job_id uuid,p_reference_type text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare r public.ugc_reference_reviews; j public.ugc_generation_jobs; sheet jsonb; views text[];
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id;
  if not found or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return false; end if;
  select * into r from public.ugc_reference_reviews where job_id=j.id and reference_type=p_reference_type
    and owner_user_id=j.owner_user_id and project_id=j.project_id;
  if not found or r.approved_at is null or r.approved_by is distinct from j.owner_user_id or r.approved_version is distinct from r.version
    or r.version<>r.composed_version or exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed') then return false; end if;
  sheet:=public.ugc_review_sheet(j.id,p_reference_type);
  views:=case p_reference_type when 'character' then array['front','back','face','sheet'] when 'product' then array['primary','angle','detail','sheet'] end;
  return coalesce(sheet->>'status'='completed' and (sheet->>'id')::uuid=coalesce(r.character_sheet_id,r.product_sheet_id)
    and (sheet->>'sheet_version')::integer=r.sheet_version and sheet->'document'->'assets' ?& views,false);
end; $$;
create or replace function public.ugc_location_references_approved(p_job_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  select public.ugc_reference_group_approved(p_job_id,'character') and public.ugc_reference_group_approved(p_job_id,'product');
$$;


create or replace function public.ugc_regeneration_diagnostic_valid(d jsonb) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(d)='object' and octet_length(d::text)<=4096
    and (d-array['version','phase','code','category','view','httpStatus'])='{}'::jsonb
    and d->'version'='1'::jsonb
    and d->>'phase' in ('claim_validation','job_read','snapshot_validation','sheet_read','base_validation','requests_read','request_validation',
      'replacement_lookup','identity_reuse','analysis_read','analysis_validation','provider_configuration','checkpoint_validation','provider_submit',
      'provider_poll','output_download','output_decode','view_storage','view_publication','sheet_lookup','sheet_inputs_read','sheet_composition',
      'sheet_storage','sheet_publication','database_checkpoint','heartbeat','recovery_front_validating','recovery_back_loading','recovery_face_loading','recovery_sheet_validating','recovery_sheet_rebuilding','recovery_sheet_saving')
    and d->>'category' in ('database','validation','provider','storage','composition','lease','internal')
    and coalesce(d->>'code','') ~ '^[A-Z][A-Z0-9_]{0,99}$'
    and (not(d ? 'view') or d->>'view' in ('front','back','face','primary','angle','detail'))
    and (not(d ? 'httpStatus') or jsonb_typeof(d->'httpStatus')='number' and (d->>'httpStatus')::numeric between 100 and 599),false);
$$;

create or replace function public.ugc_update_reference_regeneration(p_review_id uuid,p_token uuid,p_action text,
  p_request_id uuid default null,p_checkpoint jsonb default null,p_asset jsonb default null,p_phase text default null,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.ugc_reference_reviews; j public.ugc_generation_jobs; q public.ugc_reference_regeneration_requests;
  now_at timestamptz:=clock_timestamp(); expected_type text; expected_version integer;
begin
  select j0.* into j from public.ugc_generation_jobs j0 join public.ugc_reference_reviews r0 on r0.job_id=j0.id where r0.id=p_review_id for update of j0;
  if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null or not exists(
    select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return false; end if;
  select * into r from public.ugc_reference_reviews where id=p_review_id for update;
  if not found or r.execution_state<>'running' or p_token is null or r.execution_token is distinct from p_token or r.lease_expires_at<=now_at then return false; end if;
  if p_action not in ('heartbeat','checkpoint','view_ready','composing','complete','fail','recovery_progress') then return false; end if;
  if p_action in ('checkpoint','view_ready') then
    select * into q from public.ugc_reference_regeneration_requests where id=p_request_id and review_id=r.id for update;
    if not found or q.state='completed' or not ((r.reference_type='character' and q.view in ('front','back','face')) or
      (r.reference_type='product' and q.view in ('primary','angle','detail'))) then return false; end if;
  end if;
  if p_action in ('view_ready','complete') then
    expected_type:=case when p_action='complete' then r.reference_type||'_sheet' else r.reference_type||'_'||q.view||'_reference' end;
    expected_version:=case when p_action='complete' then r.version else q.requested_version end;
    if p_asset is null or p_asset->>'type' is distinct from expected_type or (p_asset->>'storageKey' is distinct from
      'ugc/'||r.owner_user_id||'/'||r.project_id||'/'||r.job_id||'/reference-review-v1/'||r.id||'/v'||expected_version||'/'||expected_type||'.png'
      and (p_action<>'complete' or r.reference_type<>'character' or p_asset->>'storageKey' is distinct from
      'ugc/'||r.owner_user_id||'/'||r.project_id||'/'||r.job_id||'/reference-review-v1/'||r.id||'/v'||expected_version||'/character_sheet_recovered/'||(p_asset->>'id')||'.png'))
      or p_asset->>'mimeType' is distinct from 'image/png' or coalesce(p_asset->>'sha256','') !~ '^[a-f0-9]{64}$'
      or coalesce((p_asset->>'sizeBytes')::bigint,0) not between 1 and 20971520 or coalesce(length(p_asset->>'etag'),0) not between 1 and 512
      or coalesce((p_asset->>'width')::integer,0) not between 256 and 4096 or coalesce((p_asset->>'height')::integer,0) not between 256 and 4096
      or coalesce(p_asset->>'id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' then return false; end if;
  end if;
  if p_action='recovery_progress' then
    if r.reference_type<>'character' or p_phase is null or p_phase not in
      ('recovery_front_validating','recovery_back_loading','recovery_face_loading','recovery_sheet_validating','recovery_sheet_rebuilding','recovery_sheet_saving')
      or exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed') then return false; end if;
    if not exists(select 1 from public.ugc_generation_job_events where job_id=j.id and event_type='character_reference.'||p_phase
      and metadata->>'reviewId'=r.id::text and metadata->>'version'=r.version::text and metadata->>'recoveryAttempt'=r.execution_attempts::text) then
      insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
        values(j.id,j.status,'character_reference','character_reference.'||p_phase,case p_phase
          when 'recovery_front_validating' then 'Validating replacement Front.' when 'recovery_back_loading' then 'Loading existing Back.'
          when 'recovery_face_loading' then 'Loading existing Face.' when 'recovery_sheet_validating' then 'Validating rebuilt sheet.'
          when 'recovery_sheet_rebuilding' then 'Rebuilding Character Sheet.' else 'Saving Character Sheet.' end,
          jsonb_build_object('reviewId',r.id,'version',r.version,'recoveryAttempt',r.execution_attempts));
    end if;
  elsif p_action='checkpoint' then
    if p_checkpoint is null or p_phase not in ('regeneration_started','generating','provider_ready','downloading') then return false; end if;
    update public.ugc_reference_regeneration_requests set state='regenerating',checkpoint=p_checkpoint where id=q.id;
    perform public.ugc_regeneration_event(r.id,q.id,p_phase);
  elsif p_action='view_ready' then
    if q.state<>'regenerating' then return false; end if;
    update public.ugc_reference_regeneration_requests set state='completed',replacement_asset=p_asset where id=q.id;
    perform public.ugc_regeneration_event(r.id,q.id,'ready');
  elsif p_action='composing' then
    if exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed') then return false; end if;
    perform public.ugc_regeneration_event(r.id,null,'sheet_rebuild_started');
  elsif p_action='complete' then
    if exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed') then return false; end if;
    update public.ugc_reference_reviews set composed_version=version,composed_asset=p_asset,
      composed_sheet_version=case when reference_type='character' then 2 else 1 end,execution_state='idle' where id=r.id;
    perform public.ugc_regeneration_event(r.id,null,'sheet_rebuild_complete');
    perform public.ugc_regeneration_event(r.id,null,'ready_for_review');
  elsif p_action='fail' then
    if p_checkpoint is not null and not public.ugc_regeneration_diagnostic_valid(p_checkpoint) then return false; end if;
    update public.ugc_reference_regeneration_requests set state='failed' where review_id=r.id and state='regenerating';
    update public.ugc_reference_reviews set execution_state='failed',execution_error=coalesce(p_error,'REGENERATION_FAILED'),execution_diagnostic=p_checkpoint where id=r.id;
    perform public.ugc_regeneration_event(r.id,p_request_id,'regeneration_failed');
  end if;
  update public.ugc_reference_reviews set
    processing_elapsed_ms=processing_elapsed_ms+greatest(0,extract(epoch from (least(now_at,lease_expires_at)-processing_updated_at))*1000)::bigint,
    heartbeat_at=now_at,processing_updated_at=case when p_action in ('complete','fail') then null else now_at end,
    lease_expires_at=case when p_action in ('complete','fail') then null else now_at+interval '90 seconds' end,
    execution_token=case when p_action in ('complete','fail') then null else execution_token end,
    execution_worker_id=case when p_action in ('complete','fail') then null else execution_worker_id end,
    execution_phase=case when p_action='heartbeat' then execution_phase when p_action='checkpoint' then q.view||'_'||p_phase
      when p_action='view_ready' then q.view||'_ready' when p_action='composing' then 'sheet_rebuild_started'
      when p_action='complete' then 'ready_for_review' when p_action='recovery_progress' then p_phase else 'regeneration_failed' end where id=r.id;
  return true;
end; $$;



commit;
