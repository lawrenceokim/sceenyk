-- Manual after 047. No existing review/request/job updates or provider execution.
begin;
do $$ declare prerequisite record; begin
  for prerequisite in select * from (values ('execution_state','text'),('execution_token','uuid'),
    ('lease_expires_at','timestamp with time zone'),('execution_error','text'),('composed_sheet_version','integer')) v(c,d) loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_reference_reviews'
      and column_name=prerequisite.c and data_type=prerequisite.d) then raise exception 'Apply 047 first: %',prerequisite.c; end if;
  end loop;
  if to_regprocedure('public.ugc_update_reference_regeneration(uuid,uuid,text,uuid,jsonb,jsonb,text,text)') is null
    or to_regprocedure('public.ugc_guard_reference_review()') is null
    or (to_regprocedure('public.ugc_claim_reference_regeneration(uuid,boolean)') is null
      and to_regprocedure('public.ugc_claim_reference_regeneration_m66(uuid,boolean)') is null) then raise exception 'Apply 047 first.'; end if;
end; $$;

-- Claim callers must get literal JSON null when no review was leased. Preserve
-- the 047 implementation privately; never rename the wrapper during a rerun.
do $$ begin
  if to_regprocedure('public.ugc_claim_reference_regeneration_m66(uuid,boolean)') is null then
    alter function public.ugc_claim_reference_regeneration(uuid,boolean) rename to ugc_claim_reference_regeneration_m66;
  end if;
end; $$;
create or replace function public.ugc_claim_reference_regeneration(p_worker_id uuid,p_product_enabled boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ugc_reference_reviews;
begin
  r:=public.ugc_claim_reference_regeneration_m66(p_worker_id,p_product_enabled);
  if r.id is null then return null; end if;
  return to_jsonb(r);
end; $$;
revoke all on function public.ugc_claim_reference_regeneration_m66(uuid,boolean),
  public.ugc_claim_reference_regeneration(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ugc_claim_reference_regeneration(uuid,boolean) to service_role;

create or replace function public.ugc_regeneration_diagnostic_valid(d jsonb) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(d)='object' and octet_length(d::text)<=4096
    and (d-array['version','phase','code','category','view','httpStatus'])='{}'::jsonb
    and d->'version'='1'::jsonb
    and d->>'phase' in ('claim_validation','job_read','snapshot_validation','sheet_read','base_validation','requests_read','request_validation',
      'replacement_lookup','identity_reuse','analysis_read','analysis_validation','provider_configuration','checkpoint_validation','provider_submit',
      'provider_poll','output_download','output_decode','view_storage','view_publication','sheet_lookup','sheet_inputs_read','sheet_composition',
      'sheet_storage','sheet_publication','database_checkpoint','heartbeat')
    and d->>'category' in ('database','validation','provider','storage','composition','lease','internal')
    and coalesce(d->>'code','') ~ '^[A-Z][A-Z0-9_]{0,99}$'
    and (not(d ? 'view') or d->>'view' in ('front','back','face','primary','angle','detail'))
    and (not(d ? 'httpStatus') or jsonb_typeof(d->'httpStatus')='number' and (d->>'httpStatus')::numeric between 100 and 599),false);
$$;
revoke all on function public.ugc_regeneration_diagnostic_valid(jsonb) from public,anon,authenticated,service_role;
alter table public.ugc_reference_reviews add column if not exists execution_diagnostic jsonb
  check(execution_diagnostic is null or public.ugc_regeneration_diagnostic_valid(execution_diagnostic));

-- Updated guard and fenced failure checkpoint follow. No direct service writes.

create or replace function public.ugc_guard_reference_review() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Reference review history is retained.' using errcode='23514'; end if;
  if (to_jsonb(new)-array['version','composed_version','composed_asset','approved_at','approved_by','approved_version','updated_at',
    'execution_state','execution_attempts','execution_token','execution_worker_id','heartbeat_at','lease_expires_at','processing_elapsed_ms',
    'processing_updated_at','execution_phase','execution_error','composed_sheet_version','execution_diagnostic']) is distinct from
    (to_jsonb(old)-array['version','composed_version','composed_asset','approved_at','approved_by','approved_version','updated_at',
    'execution_state','execution_attempts','execution_token','execution_worker_id','heartbeat_at','lease_expires_at','processing_elapsed_ms',
    'processing_updated_at','execution_phase','execution_error','composed_sheet_version','execution_diagnostic'])
    or new.version<old.version or new.version>old.version+1 or new.composed_version<old.composed_version
    or (new.composed_asset is distinct from old.composed_asset and new.composed_version=old.composed_version) then
    raise exception 'Immutable reference review identity/version history.' using errcode='23514'; end if;
  if new.version>old.version then
    if old.execution_state='running' or old.version<>old.composed_version then raise exception 'Finish the pending replacement first.' using errcode='23514'; end if;
    new.execution_attempts:=0; new.execution_state:='idle'; new.execution_error:=null; new.execution_phase:=null; new.execution_diagnostic:=null;
  end if;
  new.updated_at:=clock_timestamp(); return new;
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
      when p_action='complete' then 'ready_for_review' else 'regeneration_failed' end where id=r.id;
  return true;
end; $$;


commit;
