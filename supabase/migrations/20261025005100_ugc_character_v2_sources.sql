-- Manual after 050. Definitions only; no job/request/approval/file backfill.
begin;
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_reference_reviews' and column_name='character_validations')
  or to_regprocedure('public.ugc_character_slots_valid(uuid,jsonb)') is null
  or to_regprocedure('public.ugc_update_reference_regeneration_m66_storage(uuid,uuid,text,uuid,jsonb,jsonb,text,text)') is null
  or to_regprocedure('public.ugc_checkpoint_character_sheet_m5(uuid,uuid,jsonb,text)') is null then raise exception 'Apply 050 first.'; end if;
end; $$;

create or replace function public.ugc_character_front_transform_valid(a jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case when a->'generation' is null then true else coalesce(
  a->'generation'->>'promptVersion'='2' and a->'generation'->>'contractVersion'='2'
  and a->'generation'->>'revision'='single-view-local-front-v2' and a->'generation'->>'outputRole'='front_source'
  and a->'generation'->>'batchSize'='1' and a->'generation'->>'enhancePrompt'='false'
  and a->'characterValidation'->>'stage'='canonical'
  and a->'sourceValidation'->>'stage'='front_source' and a->'sourceValidation'->>'state'='passed'
  and a->'sourceValidation'->>'view'='front' and a->'sourceValidation'->'reasons'='[]'::jsonb
  and a->'sourceValidation'->'observations' @> '{"subjects":1,"poses":1,"faces":1,"headVisible":true,"fullBody":true,"frontFacing":true,"backFacing":false,"neckDownOnly":false,"shoulderUpCloseUp":false,"completeOutfitAndFootwear":true,"collageOrPanels":false,"extraInset":false,"mirroredPose":false,"fillsFrame":true,"neutralBackground":true,"annotations":false,"uncertain":false}'::jsonb
  and a->'sourceValidation'->>'cropSafe'='true' and (a->'sourceValidation'->>'cropTop')::integer between 500 and 3500
  and a->'frontCrop'->>'version'='1'
  and a->'frontCrop'->>'sourceSha256'=a->'sourceValidation'->>'sha256'
  and a->'frontCrop'->>'canonicalSha256'=a->>'sha256'
  and (a->'frontCrop'->>'top')::integer=ceil((a->'frontCrop'->>'sourceHeight')::numeric*(a->'sourceValidation'->>'cropTop')::numeric/10000)::integer
  and (a->'frontCrop'->>'sourceWidth')::integer=(a->'frontCrop'->>'width')::integer
  and (a->'frontCrop'->>'width')::integer=(a->>'width')::integer
  and (a->'frontCrop'->>'height')::integer=(a->>'height')::integer
  and (a->'frontCrop'->>'height')::integer=(a->'frontCrop'->>'sourceHeight')::integer-(a->'frontCrop'->>'top')::integer,false) end;
$$;

create or replace function public.ugc_character_generation_valid(g jsonb,v text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(g->>'promptVersion'='2' and g->>'contractVersion'='2' and g->>'revision'='single-view-local-front-v2'
  and g->>'builder'='characterViewPrompt' and g->>'providerModel'='higgsfield-ai/soul/v2/standard'
  and coalesce(g->>'promptSha256','') ~ '^[a-f0-9]{64}$' and g->>'batchSize'='1' and g->>'enhancePrompt'='false'
  and g->>'resolution'='1080p' and g->>'aspectRatio'=case when v='face' then '1:1' else '2:3' end
  and g->>'outputRole'=case v when 'front' then 'front_source' when 'back' then 'back_reference' when 'face' then 'face_reference' end,false);
$$;

do $$ begin
 if to_regprocedure('public.ugc_request_reference_regeneration_m66_validation(uuid,uuid,uuid,text,text,integer,uuid,uuid)') is null then
  alter function public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid) rename to ugc_request_reference_regeneration_m66_validation;
 end if;
end; $$;
create or replace function public.ugc_request_reference_regeneration(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid,p_reference_type text,
 p_view text,p_expected_version integer,p_sheet_id uuid,p_request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.ugc_reference_reviews; q public.ugc_reference_regeneration_requests; j public.ugc_generation_jobs; archived jsonb; attempts integer;
begin
 if p_reference_type<>'character' then return public.ugc_request_reference_regeneration_m66_validation(p_owner_user_id,p_project_id,p_job_id,p_reference_type,p_view,p_expected_version,p_sheet_id,p_request_id); end if;
 r:=public.ugc_ensure_reference_review(p_owner_user_id,p_project_id,p_job_id,'character',p_sheet_id);
 if r.id is null or p_view is null or p_view not in ('front','back','face') or p_request_id is null then return false; end if;
 -- Lost-response retry uses the same logical request or archived operation key.
 select * into q from public.ugc_reference_regeneration_requests where id=p_request_id;
 if found then return q.review_id=r.id and q.view=p_view and q.requested_by=p_owner_user_id; end if;
 select * into q from public.ugc_reference_regeneration_requests where review_id=r.id and
  (checkpoint->>'key'=p_request_id::text or exists(select 1 from jsonb_array_elements(coalesce(checkpoint->'previousAttempts','[]'::jsonb)) prior where prior->>'key'=p_request_id::text));
 if found then return q.view=p_view and q.requested_by=p_owner_user_id; end if;
 if r.version is distinct from p_expected_version then return false; end if;
 if exists(select 1 from public.ugc_reference_reviews where job_id=p_job_id and execution_state='running' and lease_expires_at>clock_timestamp()) then return false; end if;
 if exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and checkpoint->'diagnostic'->>'reason'='CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED') then return false; end if;
 select * into q from public.ugc_reference_regeneration_requests where review_id=r.id and view=p_view and state<>'completed' for update;
 if not found then return public.ugc_request_reference_regeneration_m66_validation(p_owner_user_id,p_project_id,p_job_id,p_reference_type,p_view,p_expected_version,p_sheet_id,p_request_id); end if;
 if r.execution_state not in ('failed','idle') or r.version>=1000000 or q.checkpoint->>'state' is null
  or q.checkpoint->>'state' not in ('completed','rejected')
  or coalesce(jsonb_array_length(q.checkpoint->'previousAttempts'),0)>=5 then return false; end if;
 -- Unknown dispatch intents/accepted requests cannot be superseded as completed.
 if q.checkpoint->>'state'='completed' and coalesce(q.checkpoint->>'providerId','') !~ '^[a-fA-F0-9-]{36}$' then return false; end if;
 select count(*) into attempts from jsonb_array_elements(coalesce(q.checkpoint->'previousAttempts','[]'::jsonb)||jsonb_build_array(q.checkpoint-'previousAttempts')) op
  where op->'generation'->>'revision'='single-view-local-front-v2';
 if attempts>=2 or q.checkpoint->'diagnostic'->>'reason'='CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED' then return false; end if;
 -- No resets for current-strategy validation uncertainty or a still-active slot.
 if q.checkpoint->'generation'->>'revision'='single-view-local-front-v2'
  and q.checkpoint->'validation'->>'state' is distinct from 'rejected' then return false; end if;
 archived:=(q.checkpoint-'previousAttempts')||jsonb_build_object('requestedVersion',q.requested_version);
 update public.ugc_reference_reviews set version=version+1,approved_at=null,approved_by=null,approved_version=null where id=r.id returning * into r;
 update public.ugc_reference_regeneration_requests set requested_version=r.version,state='regenerating',checkpoint=jsonb_build_object(
  'key',p_request_id,'manualRequestId',p_request_id,'state','rejected','startedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'polls',0,'previousAttempts',coalesce(q.checkpoint->'previousAttempts','[]'::jsonb)||jsonb_build_array(archived)) where id=q.id;
 select * into j from public.ugc_generation_jobs where id=p_job_id;
 insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
  values(j.id,j.status,'character_reference','character_reference.slot_validation','Explicit new Character slot request; historical provider receipt preserved.',jsonb_build_object('view',p_view));
 return true;
end; $$;

create or replace function public.ugc_guard_regeneration_request() returns trigger
language plpgsql set search_path='' as $$
declare manual boolean;
begin
 if tg_op='DELETE' then raise exception 'Reference replacement history is retained.' using errcode='23514'; end if;
 manual:=coalesce(old.state<>'completed' and old.checkpoint->>'state' in ('completed','rejected')
  and new.state='regenerating' and new.requested_version>old.requested_version
  and new.checkpoint->>'state'='rejected' and new.checkpoint->>'manualRequestId'=new.checkpoint->>'key'
  and new.checkpoint->'previousAttempts'=coalesce(old.checkpoint->'previousAttempts','[]'::jsonb)||
    jsonb_build_array((old.checkpoint-'previousAttempts')||jsonb_build_object('requestedVersion',old.requested_version))
  and exists(select 1 from public.ugc_reference_reviews where id=new.review_id and reference_type='character' and execution_state='idle'
    and version=new.requested_version),false);
 if (to_jsonb(new)-case when manual then array['state','replacement_asset','checkpoint','updated_at','requested_version'] else array['state','replacement_asset','checkpoint','updated_at'] end) is distinct from
  (to_jsonb(old)-case when manual then array['state','replacement_asset','checkpoint','updated_at','requested_version'] else array['state','replacement_asset','checkpoint','updated_at'] end)
  or old.state='completed' or (new.replacement_asset is distinct from old.replacement_asset and new.state<>'completed')
  or not ((old.state='regeneration_requested' and new.state in ('regenerating','failed')) or (old.state='regenerating' and new.state in ('regenerating','failed','completed')) or (old.state='failed' and new.state='regenerating')) then
  raise exception 'Invalid reference replacement transition.' using errcode='23514'; end if;
 if not manual and not coalesce(old.checkpoint->'validation'->>'state'='rejected' and coalesce(jsonb_array_length(old.checkpoint->'previousAttempts'),0)<5
  and new.checkpoint->>'state' in ('intent','rejected')
  and new.checkpoint->'previousAttempts'=coalesce(old.checkpoint->'previousAttempts','[]'::jsonb)||jsonb_build_array(old.checkpoint-'previousAttempts')
  and exists(select 1 from public.ugc_reference_reviews where id=new.review_id and reference_type='character'),false)
  and (old.checkpoint->>'providerId' is not null and new.checkpoint->>'providerId' is distinct from old.checkpoint->>'providerId'
   or old.checkpoint->>'key' is not null and new.checkpoint->>'key' is distinct from old.checkpoint->>'key'
   or old.checkpoint->>'statusUrl' is not null and new.checkpoint->>'statusUrl' is distinct from old.checkpoint->>'statusUrl'
   or old.checkpoint->>'requestId' is not null and new.checkpoint->>'requestId' is distinct from old.checkpoint->>'requestId'
   or old.checkpoint->'generation' is not null and new.checkpoint->'generation' is distinct from old.checkpoint->'generation'
   or coalesce(new.checkpoint->'previousAttempts','[]'::jsonb) is distinct from coalesce(old.checkpoint->'previousAttempts','[]'::jsonb)) then
  raise exception 'Immutable paid request receipt.' using errcode='23514'; end if;
 new.updated_at:=clock_timestamp(); return new;
end; $$;

-- Existing validator/publication definitions are extended below without backfill.
create or replace function public.ugc_character_validation_valid(p jsonb,v text,h text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(coalesce(p->>'stage','canonical')='canonical' and p->>'version'='1' and p->>'state'='passed' and p->>'view'=v and p->>'sha256'=h
 and h ~ '^[a-f0-9]{64}$' and length(p->>'model') between 1 and 200 and p->'reasons'='[]'::jsonb
 and p->'observations' @> '{"subjects":1,"poses":1,"collageOrPanels":false,"extraInset":false,"mirroredPose":false,"fillsFrame":true,"neutralBackground":true,"annotations":false,"uncertain":false}'::jsonb
 and case v
 when 'front' then p->'observations' @> '{"faces":0,"headVisible":false,"frontFacing":true,"backFacing":false,"fullBody":false,"neckDownOnly":true,"shoulderUpCloseUp":false,"completeOutfitAndFootwear":true}'::jsonb
 when 'back' then p->'observations' @> '{"faces":0,"headVisible":true,"frontFacing":false,"backFacing":true,"fullBody":true,"neckDownOnly":false,"shoulderUpCloseUp":false,"completeOutfitAndFootwear":true}'::jsonb
 when 'face' then p->'observations' @> '{"faces":1,"headVisible":true,"frontFacing":true,"backFacing":false,"neckDownOnly":false,"shoulderUpCloseUp":true,"fullBody":false,"completeOutfitAndFootwear":false}'::jsonb
 else false end,false);
$$;

create or replace function public.ugc_character_slots_valid(p_job_id uuid,p_sheet jsonb default null) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare s public.ugc_character_sheets; r public.ugc_reference_reviews; v text; a jsonb; proof jsonb; final jsonb;
begin
 select * into s from public.ugc_character_sheets where job_id=p_job_id;
 if not found then return false; end if;
 select * into r from public.ugc_reference_reviews where job_id=p_job_id and reference_type='character';
 final:=coalesce(p_sheet,case when r.composed_version>1 then r.composed_asset else s.document->'assets'->'sheet' end);
 foreach v in array array['front','back','face'] loop
  select replacement_asset into a from public.ugc_reference_regeneration_requests where review_id=r.id and view=v and state='completed' order by requested_version desc limit 1;
  a:=coalesce(a,s.document->'assets'->v); proof:=a->'characterValidation';
  if not public.ugc_character_validation_valid(proof,v,a->>'sha256') then proof:=r.character_validations->v; end if;
  if not public.ugc_character_validation_valid(proof,v,a->>'sha256') or final->'characterInputs'->>v is distinct from a->>'sha256' then return false; end if;
  if v='front' and not public.ugc_character_front_transform_valid(a) then return false; end if;
 end loop;
 return final is not null;
end; $$;

create or replace function public.ugc_character_asset_admission() returns trigger
language plpgsql security definer set search_path='' as $$
declare v text; a jsonb;
begin
 foreach v in array array['front','back','face'] loop
  a:=new.document->'assets'->v;
  if a is not null and new.document->'operations'->v->'generation' is not null and a->'generation' is distinct from new.document->'operations'->v->'generation' then
   raise exception 'Character asset requires dispatch provenance.' using errcode='23514'; end if;
  if a is not null and (tg_op='INSERT' or a is distinct from old.document->'assets'->v)
   and (not public.ugc_character_validation_valid(a->'characterValidation',v,a->>'sha256') or v='front' and not public.ugc_character_front_transform_valid(a)) then raise exception 'Character slot requires visual validation.' using errcode='23514'; end if;
 end loop;
 if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
  foreach v in array array['front','back','face'] loop
   a:=new.document->'assets'->v;
   if not public.ugc_character_validation_valid(a->'characterValidation',v,a->>'sha256') or v='front' and not public.ugc_character_front_transform_valid(a)
    or new.document->'assets'->'sheet'->'characterInputs'->>v is distinct from a->>'sha256' then raise exception 'Character sheet requires three validated slots.' using errcode='23514'; end if;
  end loop;
 end if;
 return new;
end; $$;

create or replace function public.ugc_update_reference_regeneration(p_review_id uuid,p_token uuid,p_action text,
 p_request_id uuid default null,p_checkpoint jsonb default null,p_asset jsonb default null,p_phase text default null,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.ugc_reference_reviews; j public.ugc_generation_jobs; v text; saved boolean;
begin
 select j0.* into j from public.ugc_generation_jobs j0 join public.ugc_reference_reviews r0 on r0.job_id=j0.id where r0.id=p_review_id for update of j0;
 if not found then return false; end if;
 select * into r from public.ugc_reference_reviews where id=p_review_id for update;
 if r.reference_type='character' then
  if p_action='checkpoint' and p_checkpoint->>'state'='intent' then
   select view into v from public.ugc_reference_regeneration_requests where id=p_request_id and review_id=r.id;
   if not public.ugc_character_generation_valid(p_checkpoint->'generation',v) then return false; end if;
   if (select count(*) from jsonb_array_elements(coalesce(p_checkpoint->'previousAttempts','[]'::jsonb)) prior
    where prior->'generation'->>'revision'='single-view-local-front-v2')>=2 then return false; end if;
  end if;
  if p_action='fail' then
   if p_checkpoint is not null and not public.ugc_regeneration_diagnostic_valid(p_checkpoint) then return false; end if;
   if coalesce(p_error,'REGENERATION_FAILED') not in ('REGENERATION_FAILED','RECONCILIATION_REQUIRED','IDENTITY_UNAVAILABLE','ATTEMPTS_EXHAUSTED',
     'CHARACTER_SHEET_RECOVERY_FAILED','CHARACTER_SHEET_COMPOSITION_FAILED') then return false; end if;
   -- The private heartbeat rechecks the live token, lease, owner and draft gate
   -- before any failure write, and accounts for the final processing segment.
   if not public.ugc_update_reference_regeneration_m66_storage(p_review_id,p_token,'heartbeat') then return false; end if;
   update public.ugc_reference_regeneration_requests set state='failed' where review_id=r.id and id=p_request_id and state='regenerating';
   update public.ugc_reference_reviews set execution_state='failed',execution_error=coalesce(p_error,'REGENERATION_FAILED'),
    execution_diagnostic=p_checkpoint,execution_phase='regeneration_failed',processing_updated_at=null,
    execution_token=null,execution_worker_id=null,lease_expires_at=null where id=r.id;
   perform public.ugc_regeneration_event(r.id,p_request_id,'regeneration_failed');
   return true;
  elsif p_action='character_validation' then
   if p_token is null or r.execution_state<>'running' or r.execution_token is distinct from p_token or r.lease_expires_at<=clock_timestamp()
    or j.status not in ('queued','failed') or j.cancellation_requested_at is not null
    or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return false; end if;
   v:=p_checkpoint->>'view';
   if p_checkpoint is null or v is null or v not in ('front','back','face') or octet_length(p_checkpoint::text)>4096
    or p_checkpoint->>'state' is null or p_checkpoint->>'state' not in ('intent','passed','rejected','unavailable') or p_checkpoint->>'version' is distinct from '1'
    or coalesce(p_checkpoint->>'sha256','') !~ '^[a-f0-9]{64}$' then return false; end if;
   update public.ugc_reference_reviews set character_validations=jsonb_set(character_validations,array[v],p_checkpoint),execution_phase='output_validation' where id=r.id;
   return public.ugc_update_reference_regeneration_m66_storage(p_review_id,p_token,'heartbeat');
  elsif p_action='view_ready' then
   select view into v from public.ugc_reference_regeneration_requests where id=p_request_id and review_id=r.id;
   if not public.ugc_character_validation_valid(p_asset->'characterValidation',v,p_asset->>'sha256')
    or v='front' and not public.ugc_character_front_transform_valid(p_asset) then return false; end if;
   if exists(select 1 from public.ugc_reference_regeneration_requests where id=p_request_id and checkpoint->'generation' is not null
    and checkpoint->'generation' is distinct from p_asset->'generation') then return false; end if;
  elsif p_action='complete' and not public.ugc_character_slots_valid(j.id,p_asset) then return false;
  end if;
 end if;
 saved:=public.ugc_update_reference_regeneration_m66_storage(p_review_id,p_token,p_action,p_request_id,p_checkpoint,p_asset,p_phase,p_error);
 if saved and r.reference_type='character' and p_action='checkpoint' and p_checkpoint->'validation'->>'state'='intent' then
  select view into v from public.ugc_reference_regeneration_requests where id=p_request_id and review_id=r.id;
  update public.ugc_reference_reviews set execution_phase=v||'_validating' where id=r.id;
 end if;
 return saved;
end; $$;

create or replace function public.ugc_checkpoint_character_sheet_m5(p_job_id uuid,p_claim_token uuid,p_document jsonb,p_message text) returns boolean
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
  for item in select * from jsonb_each(p_document->'operations') loop
    if item.key in ('front','back','face') and item.value->>'state'='intent'
      and not public.ugc_character_generation_valid(item.value->'generation',item.key) then return false; end if;
    if item.key in ('front','back','face') and item.value->>'state'='intent' and
      (select count(*) from jsonb_array_elements(coalesce(item.value->'previousAttempts','[]'::jsonb)) prior
        where prior->'generation'->>'revision'='single-view-local-front-v2')>=2 then return false; end if;
  end loop;
  for item in select * from jsonb_each(s.document->'assets') loop
    if p_document->'assets'->item.key is distinct from item.value then return false; end if;
  end loop;
  for item in select * from jsonb_each(s.document->'operations') loop
    incoming:=p_document->'operations'->item.key;
    if coalesce(item.key in ('front','back','face') and item.value->'validation'->>'state'='rejected'
 and coalesce(jsonb_array_length(item.value->'previousAttempts'),0)<5
 and incoming->>'state'='intent' and incoming->>'key' is distinct from item.value->>'key'
 and incoming->'previousAttempts'=coalesce(item.value->'previousAttempts','[]'::jsonb)||jsonb_build_array(item.value-'previousAttempts'),false) then continue; end if;
    if item.value->'generation' is not null and incoming->'generation' is distinct from item.value->'generation' then return false; end if;
    if coalesce(incoming->'previousAttempts','[]'::jsonb) is distinct from coalesce(item.value->'previousAttempts','[]'::jsonb) then return false; end if;
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

create or replace function public.ugc_character_validation_events() returns trigger
language plpgsql security definer set search_path='' as $$
declare v text; p jsonb; prior jsonb; j public.ugc_generation_jobs; attempts integer; msg text; reason text; n jsonb:=to_jsonb(new); o jsonb:=to_jsonb(old);
begin
 if tg_table_name in ('ugc_character_sheets','ugc_reference_reviews') then
  if tg_table_name='ugc_reference_reviews' and n->>'reference_type'<>'character' then return new; end if;
  select * into j from public.ugc_generation_jobs where id=(n->>'job_id')::uuid;
 else
  select j0.* into j from public.ugc_generation_jobs j0 join public.ugc_reference_reviews r on r.job_id=j0.id where r.id=(n->>'review_id')::uuid and r.reference_type='character';
  if not found then return new; end if;
 end if;
 foreach v in array array['front','back','face'] loop
  attempts:=0;
  if tg_table_name='ugc_character_sheets' then p:=n->'document'->'operations'->v->'validation'; prior:=o->'document'->'operations'->v->'validation'; attempts:=coalesce(jsonb_array_length(n->'document'->'operations'->v->'previousAttempts'),0);
  elsif tg_table_name='ugc_reference_reviews' then p:=n->'character_validations'->v; prior:=o->'character_validations'->v;
  else
   if n->>'view'<>v then continue; end if;
   p:=n->'checkpoint'->'validation'; prior:=o->'checkpoint'->'validation'; attempts:=coalesce(jsonb_array_length(n->'checkpoint'->'previousAttempts'),0);
  end if;
  if p is null or p is not distinct from prior then continue; end if;
  msg:=case p->>'state' when 'intent' then 'Checking single-view output' when 'passed' then 'Single-view output validated'
   when 'rejected' then 'Output rejected' when 'unavailable' then 'Visual validation unavailable; automatic replay stopped' end;
  if msg is null then continue; end if;
  reason:='';
  if p->>'state'='rejected' then
   select string_agg(x,', ') into reason from jsonb_array_elements_text(p->'reasons') x where x in
    ('MULTIPLE_SUBJECTS','MULTIPLE_POSES','MULTIPLE_FACES','COLLAGE_OR_PANEL','EXTRA_INSET','MIRRORED_POSE','HEAD_OR_FACE_VISIBLE',
     'WRONG_FRONT_FRAMING','WRONG_BACK_FRAMING','WRONG_FACE_FRAMING','FULL_BODY_IN_PORTRAIT','MIXED_ORIENTATION','OUTFIT_OR_FEET_CROPPED',
     'POOR_CARD_FILL','NON_NEUTRAL_BACKGROUND','ANNOTATIONS','UNCERTAIN_CONTENT','WRONG_FRONT_SOURCE_FRAMING','UNSAFE_HEAD_CROP');
  end if;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
   values(j.id,j.status,'character_reference','character_reference.slot_validation',msg||case when p->>'stage'='front_source' then ' (Front source)' else '' end||coalesce(': '||nullif(reason,''),'')||
    case when attempts>0 then '. Slot retry; attempt '||(attempts+1)::text else '' end||'. Previous canonical assets preserved.',jsonb_build_object('view',v));
 end loop;
 return new;
end; $$;

revoke all on function public.ugc_character_front_transform_valid(jsonb),public.ugc_character_generation_valid(jsonb,text),
 public.ugc_request_reference_regeneration_m66_validation(uuid,uuid,uuid,text,text,integer,uuid,uuid),
 public.ugc_checkpoint_character_sheet_m5(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid),
 public.ugc_update_reference_regeneration(uuid,uuid,text,uuid,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid),
 public.ugc_update_reference_regeneration(uuid,uuid,text,uuid,jsonb,jsonb,text,text) to service_role;
commit;
