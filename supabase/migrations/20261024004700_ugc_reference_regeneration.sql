-- Manual after 046. No backfill, job resume, asset modification or provider work.
begin;
do $$
declare prerequisite record;
begin
  for prerequisite in select * from (values
    ('ugc_reference_reviews','version','integer'),('ugc_reference_reviews','composed_asset','jsonb'),
    ('ugc_reference_reviews','sheet_version','integer'),('ugc_reference_reviews','job_id','uuid'),
    ('ugc_reference_regeneration_requests','replacement_asset','jsonb'),('ugc_reference_regeneration_requests','state','text'),
    ('ugc_generation_jobs','cancellation_requested_at','timestamp with time zone'),
    ('ugc_generation_job_events','metadata','jsonb'),('ugc_character_sheets','document','jsonb'),
    ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),('ugc_generation_jobs','project_id','uuid'),
    ('ugc_generation_jobs','status','text'),('ugc_generation_jobs','input_snapshot','jsonb'),
    ('ugc_reference_reviews','id','uuid'),('ugc_reference_reviews','owner_user_id','uuid'),('ugc_reference_reviews','project_id','uuid'),
    ('ugc_reference_reviews','reference_type','text'),('ugc_reference_reviews','composed_version','integer'),
    ('ugc_reference_reviews','character_sheet_id','uuid'),('ugc_reference_reviews','product_sheet_id','uuid'),
    ('ugc_reference_reviews','approved_at','timestamp with time zone'),('ugc_reference_reviews','approved_by','uuid'),
    ('ugc_reference_reviews','approved_version','integer'),('ugc_reference_reviews','created_at','timestamp with time zone'),
    ('ugc_reference_regeneration_requests','id','uuid'),('ugc_reference_regeneration_requests','review_id','uuid'),
    ('ugc_reference_regeneration_requests','view','text'),('ugc_reference_regeneration_requests','requested_version','integer'),
    ('ugc_generation_job_events','job_id','uuid'),('ugc_generation_job_events','status','text'),('ugc_generation_job_events','stage','text'),
    ('ugc_generation_job_events','event_type','text'),('ugc_generation_job_events','safe_message','text'),
    ('ugc_character_sheets','sheet_version','integer'),('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text')
  ) v(t,c,d) loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=prerequisite.t
      and column_name=prerequisite.c and data_type=prerequisite.d) then raise exception 'Apply 046 and prerequisites first: %.%',prerequisite.t,prerequisite.c; end if;
  end loop;
  if to_regprocedure('public.ugc_ensure_reference_review(uuid,uuid,uuid,text,uuid)') is null then raise exception 'Apply 046 first.'; end if;
end; $$;

alter table public.ugc_character_sheets drop constraint if exists ugc_character_sheets_sheet_version_check;
alter table public.ugc_character_sheets add constraint ugc_character_sheets_sheet_version_check check(sheet_version in (1,2));
alter table public.ugc_character_sheets alter column sheet_version set default 2;
alter table public.ugc_character_sheets drop constraint if exists ugc_character_sheets_document_check;
alter table public.ugc_character_sheets add constraint ugc_character_sheets_document_check check(
  jsonb_typeof(document)='object' and octet_length(document::text)<=65536
  and document->>'schemaVersion'=sheet_version::text
  and document->>'promptVersion'='character-sheet-v'||sheet_version::text
  and jsonb_typeof(document->'wardrobe')='object' and jsonb_typeof(document->'assets')='object'
  and jsonb_typeof(document->'operations')='object' and document->'analysisVersion'='1'::jsonb);
alter table public.ugc_reference_reviews drop constraint if exists ugc_reference_reviews_sheet_version_check;
alter table public.ugc_reference_reviews add constraint ugc_reference_reviews_sheet_version_check check(
  (reference_type='character' and sheet_version in (1,2)) or (reference_type='product' and sheet_version=1));
alter table public.ugc_reference_reviews
  add column if not exists execution_state text not null default 'idle' check(execution_state in ('idle','running','failed')),
  add column if not exists execution_attempts integer not null default 0 check(execution_attempts between 0 and 3),
  add column if not exists execution_token uuid,
  add column if not exists execution_worker_id uuid,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists processing_elapsed_ms bigint not null default 0 check(processing_elapsed_ms>=0),
  add column if not exists processing_updated_at timestamptz,
  add column if not exists execution_phase text,
  add column if not exists execution_error text check(execution_error is null or execution_error in ('REGENERATION_FAILED','RECONCILIATION_REQUIRED','IDENTITY_UNAVAILABLE','ATTEMPTS_EXHAUSTED')),
  add column if not exists composed_sheet_version integer not null default 1 check(composed_sheet_version in (1,2));
alter table public.ugc_reference_regeneration_requests
  add column if not exists checkpoint jsonb not null default '{}'::jsonb check(jsonb_typeof(checkpoint)='object' and octet_length(checkpoint::text)<=32768);

create or replace function public.ugc_guard_reference_review() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Reference review history is retained.' using errcode='23514'; end if;
  if (to_jsonb(new)-array['version','composed_version','composed_asset','approved_at','approved_by','approved_version','updated_at',
    'execution_state','execution_attempts','execution_token','execution_worker_id','heartbeat_at','lease_expires_at','processing_elapsed_ms',
    'processing_updated_at','execution_phase','execution_error','composed_sheet_version']) is distinct from
    (to_jsonb(old)-array['version','composed_version','composed_asset','approved_at','approved_by','approved_version','updated_at',
    'execution_state','execution_attempts','execution_token','execution_worker_id','heartbeat_at','lease_expires_at','processing_elapsed_ms',
    'processing_updated_at','execution_phase','execution_error','composed_sheet_version'])
    or new.version<old.version or new.version>old.version+1 or new.composed_version<old.composed_version
    or (new.composed_asset is distinct from old.composed_asset and new.composed_version=old.composed_version) then
    raise exception 'Immutable reference review identity/version history.' using errcode='23514'; end if;
  if new.version>old.version then
    if old.execution_state='running' or old.version<>old.composed_version then raise exception 'Finish the pending replacement first.' using errcode='23514'; end if;
    new.execution_attempts:=0; new.execution_state:='idle'; new.execution_error:=null; new.execution_phase:=null;
  end if;
  new.updated_at:=clock_timestamp(); return new;
end; $$;

create or replace function public.ugc_guard_regeneration_request() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Reference replacement history is retained.' using errcode='23514'; end if;
  if (to_jsonb(new)-array['state','replacement_asset','checkpoint','updated_at']) is distinct from
    (to_jsonb(old)-array['state','replacement_asset','checkpoint','updated_at']) or old.state='completed'
    or (new.replacement_asset is distinct from old.replacement_asset and new.state<>'completed')
    or not ((old.state='regeneration_requested' and new.state in ('regenerating','failed')) or
      (old.state='regenerating' and new.state in ('regenerating','failed','completed')) or (old.state='failed' and new.state='regenerating')) then
    raise exception 'Invalid reference replacement transition.' using errcode='23514'; end if;
  if old.checkpoint->>'providerId' is not null and new.checkpoint->>'providerId' is distinct from old.checkpoint->>'providerId'
    or old.checkpoint->>'key' is not null and new.checkpoint->>'key' is distinct from old.checkpoint->>'key'
    or old.checkpoint->>'statusUrl' is not null and new.checkpoint->>'statusUrl' is distinct from old.checkpoint->>'statusUrl'
    or old.checkpoint->>'requestId' is not null and new.checkpoint->>'requestId' is distinct from old.checkpoint->>'requestId' then
    raise exception 'Immutable paid request receipt.' using errcode='23514'; end if;
  new.updated_at:=clock_timestamp(); return new;
end; $$;

-- Keep all existing event types; expand once for request-scoped semantic phases.
do $$ declare expression text; begin
  select pg_get_expr(conbin,conrelid) into expression from pg_constraint where conrelid='public.ugc_generation_job_events'::regclass
    and conname='ugc_generation_job_events_event_type_check';
  if expression not like '%regeneration_started%' then
    alter table public.ugc_generation_job_events drop constraint ugc_generation_job_events_event_type_check;
    execute 'alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_event_type_check check (('
      ||expression||') or event_type ~ ''^(character|product)_reference\.(regeneration_requested|((front|back|face|primary|angle|detail)_(regeneration_started|generating|provider_ready|downloading|ready))|sheet_rebuild_started|sheet_rebuild_complete|ready_for_review|regeneration_failed)$'')';
  end if;
end; $$;

-- Service-only append helper: fixed phase copy, no provider text or storage paths.
create or replace function public.ugc_regeneration_event(p_review_id uuid,p_request_id uuid,p_phase text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.ugc_reference_reviews; j public.ugc_generation_jobs; q public.ugc_reference_regeneration_requests; message text; event text;
begin
  select * into r from public.ugc_reference_reviews where id=p_review_id;
  select * into j from public.ugc_generation_jobs where id=r.job_id;
  select * into q from public.ugc_reference_regeneration_requests where id=p_request_id and review_id=r.id;
  message:=case p_phase when 'regeneration_requested' then 'Regeneration requested. Start the local UGC worker to continue.'
    when 'regeneration_started' then 'Reference view regeneration started.' when 'generating' then case when r.reference_type='character' then 'Provider is generating the reference view.' else 'Reference view requested from the provider.' end
    when 'provider_ready' then 'Provider output is ready.' when 'downloading' then case when r.reference_type='character' then 'Downloading and validating the reference view.' else 'Validating and storing the received reference view.' end
    when 'ready' then 'Replacement reference view saved.' when 'sheet_rebuild_started' then 'Rebuilding the reference sheet.'
    when 'sheet_rebuild_complete' then 'Reference sheet rebuilt.' when 'ready_for_review' then 'Reference ready for review. Approval is required.'
    when 'regeneration_failed' then 'Reference regeneration stopped safely. Previous references remain available.' end;
  if message is null or r.id is null then raise exception 'Invalid regeneration phase.'; end if;
  event:=r.reference_type||'_reference.'||case when p_phase in ('regeneration_started','generating','provider_ready','downloading','ready') then q.view||'_' else '' end||p_phase;
  if event is null then raise exception 'Missing regeneration request.'; end if;
  if not exists(select 1 from public.ugc_generation_job_events where job_id=j.id and event_type=event
    and metadata->>'reviewId'=r.id::text and metadata->>'version'=r.version::text
    and metadata->>'requestId' is not distinct from p_request_id::text) then
    insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
      values(j.id,j.status,r.reference_type||'_reference',event,message,jsonb_build_object('reviewId',r.id,'requestId',p_request_id,'version',r.version,'view',q.view));
  end if;
end; $$;

-- New requests also write the precise semantic event, in the same transaction.
create or replace function public.ugc_regeneration_requested_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform public.ugc_regeneration_event(new.review_id,new.id,'regeneration_requested'); return new; end; $$;
drop trigger if exists ugc_regeneration_requested_event on public.ugc_reference_regeneration_requests;
create trigger ugc_regeneration_requested_event after insert on public.ugc_reference_regeneration_requests
  for each row execute function public.ugc_regeneration_requested_event();

create or replace function public.ugc_claim_reference_regeneration(p_worker_id uuid,p_product_enabled boolean default false) returns public.ugc_reference_reviews
language plpgsql security definer set search_path='' as $$
declare candidate record; j public.ugc_generation_jobs; r public.ugc_reference_reviews; now_at timestamptz:=clock_timestamp();
begin
  if p_worker_id is null then return null; end if;
  for candidate in select id,job_id from public.ugc_reference_reviews
    where version<>composed_version and execution_state in ('idle','running')
    and (reference_type='character' or p_product_enabled) order by created_at loop
    -- Match every existing mutation's job -> review lock order, without waiting.
    select * into j from public.ugc_generation_jobs where id=candidate.job_id for update skip locked;
    if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null
      or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then continue; end if;
    if exists(select 1 from public.ugc_reference_reviews where job_id=j.id and execution_state='running' and lease_expires_at>now_at) then continue; end if;
    select * into r from public.ugc_reference_reviews where id=candidate.id for update skip locked;
    if not found or r.version=r.composed_version or r.execution_state='failed' or
      (r.execution_state='running' and r.lease_expires_at>now_at) then continue; end if;
    if r.execution_attempts>=3 then
      update public.ugc_reference_reviews set execution_state='failed',execution_error='ATTEMPTS_EXHAUSTED',
        processing_elapsed_ms=processing_elapsed_ms+case when processing_updated_at is not null then
          greatest(0,extract(epoch from (least(now_at,lease_expires_at)-processing_updated_at))*1000)::bigint else 0 end,
        execution_token=null,execution_worker_id=null,lease_expires_at=null,processing_updated_at=null where id=r.id;
      perform public.ugc_regeneration_event(r.id,null,'regeneration_failed'); continue;
    end if;
    update public.ugc_reference_reviews set execution_state='running',execution_attempts=execution_attempts+1,
      execution_token=gen_random_uuid(),execution_worker_id=p_worker_id,heartbeat_at=now_at,lease_expires_at=now_at+interval '90 seconds',
      processing_elapsed_ms=processing_elapsed_ms+case when processing_updated_at is not null then
        greatest(0,extract(epoch from (least(now_at,lease_expires_at)-processing_updated_at))*1000)::bigint else 0 end,
      processing_updated_at=now_at,execution_error=null where id=r.id returning * into r;
    return r;
  end loop;
  return null;
end; $$;

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
  if p_action not in ('heartbeat','checkpoint','view_ready','composing','complete','fail') then return false; end if;
  if p_action in ('checkpoint','view_ready') then
    select * into q from public.ugc_reference_regeneration_requests where id=p_request_id and review_id=r.id for update;
    if not found or q.state='completed' or not ((r.reference_type='character' and q.view in ('front','back','face')) or
      (r.reference_type='product' and q.view in ('primary','angle','detail'))) then return false; end if;
  end if;
  if p_action in ('view_ready','complete') then
    expected_type:=case when p_action='complete' then r.reference_type||'_sheet' else r.reference_type||'_'||q.view||'_reference' end;
    expected_version:=case when p_action='complete' then r.version else q.requested_version end;
    if p_asset is null or p_asset->>'type' is distinct from expected_type or p_asset->>'storageKey' is distinct from
      'ugc/'||r.owner_user_id||'/'||r.project_id||'/'||r.job_id||'/reference-review-v1/'||r.id||'/v'||expected_version||'/'||expected_type||'.png'
      or p_asset->>'mimeType' is distinct from 'image/png' or coalesce(p_asset->>'sha256','') !~ '^[a-f0-9]{64}$'
      or coalesce((p_asset->>'sizeBytes')::bigint,0) not between 1 and 20971520 or coalesce(length(p_asset->>'etag'),0) not between 1 and 512
      or coalesce((p_asset->>'width')::integer,0) not between 256 and 4096 or coalesce((p_asset->>'height')::integer,0) not between 256 and 4096
      or coalesce(p_asset->>'id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' then return false; end if;
  end if;
  if p_action='checkpoint' then
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
    update public.ugc_reference_regeneration_requests set state='failed' where review_id=r.id and state='regenerating';
    update public.ugc_reference_reviews set execution_state='failed',execution_error=coalesce(p_error,'REGENERATION_FAILED') where id=r.id;
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
      when p_action='complete' then 'ready_for_review' else 'regeneration_failed' end where id=r.id;
  return true;
end; $$;

create or replace function public.ugc_resume_reference_regeneration(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; affected integer;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null or not exists(
    select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return false; end if;
  update public.ugc_reference_reviews set execution_state='idle',execution_error=null where job_id=j.id and execution_state='failed'
    and execution_attempts<3 and version<>composed_version;
  get diagnostics affected=row_count; return affected>0;
end; $$;

revoke all on function public.ugc_regeneration_event(uuid,uuid,text),public.ugc_regeneration_requested_event(),
  public.ugc_claim_reference_regeneration(uuid,boolean),public.ugc_update_reference_regeneration(uuid,uuid,text,uuid,jsonb,jsonb,text,text),
  public.ugc_resume_reference_regeneration(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ugc_claim_reference_regeneration(uuid,boolean),
  public.ugc_update_reference_regeneration(uuid,uuid,text,uuid,jsonb,jsonb,text,text),public.ugc_resume_reference_regeneration(uuid) to service_role;

-- Version-aware preparation/review functions follow below.

create or replace function public.ugc_ensure_reference_review(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid,p_reference_type text,p_sheet_id uuid)
returns public.ugc_reference_reviews language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; r public.ugc_reference_reviews; sheet jsonb;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id and owner_user_id=p_owner_user_id and project_id=p_project_id for update;
  if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null or not exists(
    select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return null; end if;
  sheet:=public.ugc_review_sheet(j.id,p_reference_type);
  if sheet is null or (sheet->>'id')::uuid is distinct from p_sheet_id or (sheet->>'owner_user_id')::uuid is distinct from j.owner_user_id
    or (sheet->>'project_id')::uuid is distinct from j.project_id or not ((p_reference_type='character' and sheet->>'sheet_version' in ('1','2')) or (p_reference_type='product' and sheet->>'sheet_version'='1')) then return null; end if;
  insert into public.ugc_reference_reviews(owner_user_id,project_id,job_id,reference_type,character_sheet_id,product_sheet_id,sheet_version,composed_sheet_version)
    values(j.owner_user_id,j.project_id,j.id,p_reference_type,case when p_reference_type='character' then p_sheet_id end,
      case when p_reference_type='product' then p_sheet_id end,(sheet->>'sheet_version')::integer,(sheet->>'sheet_version')::integer) on conflict(job_id,reference_type) do nothing;
  select * into r from public.ugc_reference_reviews where job_id=j.id and reference_type=p_reference_type for update;
  if r.owner_user_id is distinct from j.owner_user_id or r.project_id is distinct from j.project_id or
    coalesce(r.character_sheet_id,r.product_sheet_id) is distinct from p_sheet_id then return null; end if;
  if r.execution_state='running' then return null; end if;
  return r;
end; $$;


-- Preserve the existing receipt-only output recovery for new v2 sheets too.
create or replace function public.ugc_resume_character_output(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_character_sheets; op record; known_view boolean:=false;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'failed' or j.resume_stage<>'character_reference'
    or j.error_code is distinct from 'CHARACTER_OUTPUT_INVALID' or j.attempt_count>=j.max_attempts
    or j.cancellation_requested_at is not null or j.pause_reason is not null
    or j.input_snapshot->>'schemaVersion' is distinct from '3' or j.analysis_version is distinct from 1 then return false; end if;
  if not exists(select 1 from public.projects p where p.id=j.project_id and p.owner_user_id=j.owner_user_id and p.status='draft')
    or not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then return false; end if;
  select * into s from public.ugc_character_sheets where job_id=j.id and owner_user_id=j.owner_user_id
    and project_id=j.project_id for update;
  if not found or s.status<>'preparing' or s.sheet_version not in (1,2)
    or s.source_asset_id::text is distinct from j.input_snapshot->'character'->>'assetId'
    or s.document->'operations'->'identity'->>'state' is distinct from 'completed'
    or coalesce(s.document->'operations'->'identity'->>'providerId','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
    or jsonb_typeof(s.document->'operations') is distinct from 'object' then return false; end if;
  if (select count(*) from public.ugc_reference_analyses a where a.job_id=j.id and a.owner_user_id=j.owner_user_id
    and a.project_id=j.project_id and a.state='completed' and a.analysis_version=j.analysis_version
    and a.requested_model=j.analysis_model and a.source_asset_id::text=j.input_snapshot->a.analysis_type->>'assetId')<>2 then return false; end if;
  for op in select * from jsonb_each(s.document->'operations') loop
    if op.key='identity' then continue; end if;
    -- Unknown intents, rejected/terminal operations and unexpected roles do not
    -- qualify. Every submitted view must have the SAME known request to resume.
    if op.key not in ('front','back','face') or op.value->>'state' is null or op.value->>'state' not in ('accepted','completed')
      or coalesce(op.value->>'providerId','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
      or op.value->>'statusUrl' is distinct from 'https://api.higgsfield.ai/requests/'||(op.value->>'providerId')||'/status' then return false; end if;
    known_view:=true;
  end loop;
  if not known_view then return false; end if;
  update public.ugc_generation_jobs set status='queued',stage='character_reference',resume_stage='character_reference',
    failed_at=null,error_code=null,safe_error_message=null,retry_eligible=false,next_retry_at=clock_timestamp()+interval '5 seconds'
    where id=j.id;
  -- Existing append-only trigger emits retry_scheduled. Provider IDs, successful
  -- assets, wardrobe, snapshots and the three-claim attempt budget stay intact.
  return true;
end; $$;

commit;
