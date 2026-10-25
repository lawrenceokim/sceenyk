-- Character V4. Apply manually after 052. No backfill, job resume or execution.
-- Existing private tables/RPCs, leases, RLS and events are reused.
begin;
do $$ begin
 if to_regprocedure('public.ugc_character_generation_valid(jsonb,text)') is null
  or to_regprocedure('public.ugc_update_reference_regeneration_m66_storage(uuid,uuid,text,uuid,jsonb,jsonb,text,text)') is null
  or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_reference_reviews' and column_name='character_validations') then
  raise exception 'Apply 052 and its prerequisites first.';
 end if;
 -- Retain historical predicates privately; reruns never wrap a wrapper.
 if to_regprocedure('public.ugc_character_front_transform_valid_pre_v4(jsonb)') is null then
  alter function public.ugc_character_front_transform_valid(jsonb) rename to ugc_character_front_transform_valid_pre_v4;
 end if;
 if to_regprocedure('public.ugc_character_validation_valid_pre_v4(jsonb,text,text)') is null then
  alter function public.ugc_character_validation_valid(jsonb,text,text) rename to ugc_character_validation_valid_pre_v4;
 end if;
 if to_regprocedure('public.ugc_character_slots_valid_pre_v4(uuid,jsonb)') is null then
  alter function public.ugc_character_slots_valid(uuid,jsonb) rename to ugc_character_slots_valid_pre_v4;
 end if;
end; $$;

-- Only fixed presentation phases can be emitted. They commit with real saved
-- operations/assets and are deduplicated per operation and review cycle.
create or replace function public.ugc_character_v4_event(p_job uuid,p_view text,p_phase text,p_key text,p_version text) returns void
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; message text;
begin
 select * into j from public.ugc_generation_jobs where id=p_job;
 if not found or p_view not in ('face','back','front','sheet') then return; end if;
 message:=case p_phase
  when 'preparing' then 'Preparing '||initcap(p_view)||' reference'
  when 'generating' then 'Generating '||initcap(p_view)
  when 'validating' then case when p_view='front' then 'Validating Front source' else 'Validating '||initcap(p_view) end
  when 'creating_headless' then 'Creating headless Front'
  when 'validating_canonical' then 'Validating canonical Front'
  when 'ready' then initcap(p_view)||' ready'
  when 'ready_for_review' then 'Ready for review' end;
 if message is null then return; end if;
 if not exists(select 1 from public.ugc_generation_job_events where job_id=p_job and event_type='character_reference.slot_validation'
  and metadata->>'phase'=p_phase and metadata->>'operationKey'=p_key and metadata->>'version'=p_version) then
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
   values(j.id,j.status,'character_reference','character_reference.slot_validation',message,
    jsonb_build_object('view',p_view,'phase',p_phase,'operationKey',p_key,'version',p_version,'revision','face-back-front-v1'));
 end if;
end; $$;
create or replace function public.ugc_character_v4_phase_events() returns trigger
language plpgsql security definer set search_path='' as $$
declare v text; op jsonb; asset jsonb; job_id uuid; version text; phase text; r public.ugc_reference_reviews;
begin
 if tg_table_name='ugc_character_sheets' then
  if new.document->>'strategyRevision' is distinct from 'face-back-front-v1' then return new; end if;
  job_id:=new.job_id; version:='base';
 else
  select * into r from public.ugc_reference_reviews where id=new.review_id and reference_type='character';
  if not found or new.checkpoint->>'strategyRevision' is distinct from 'face-back-front-v1' then return new; end if;
  job_id:=r.job_id; version:=r.version::text;
 end if;
 foreach v in array array['face','back','front'] loop
  if tg_table_name='ugc_character_sheets' then op:=new.document->'operations'->v; asset:=new.document->'assets'->v;
  else
   if new.view<>v then continue; end if;
   op:=new.checkpoint; asset:=new.replacement_asset;
  end if;
  if op is null then continue; end if;
  phase:=case op->>'workPhase' when 'preparing_source' then 'preparing' when 'sending_i2i' then 'generating'
   when 'checking_original_face' then case when op->'originalFaceValidation' is null then 'preparing' else 'validating' end
   when 'validating_source' then 'validating' when 'cropping_front' then 'creating_headless' when 'validating_crop' then 'validating_canonical' end;
  if phase is not null then perform public.ugc_character_v4_event(job_id,v,phase,op->>'key',version); end if;
  if asset is not null then perform public.ugc_character_v4_event(job_id,v,'ready',op->>'key',version); end if;
 end loop;
 if tg_table_name='ugc_character_sheets' then
  if new.status='completed' then perform public.ugc_character_v4_event(job_id,'sheet','ready_for_review',new.id::text,version); end if;
 end if;
 return new;
end; $$;
drop trigger if exists ugc_character_v4_phases on public.ugc_character_sheets;
create trigger ugc_character_v4_phases after insert or update on public.ugc_character_sheets for each row execute function public.ugc_character_v4_phase_events();
drop trigger if exists ugc_character_v4_phases on public.ugc_reference_regeneration_requests;
create trigger ugc_character_v4_phases after insert or update on public.ugc_reference_regeneration_requests for each row execute function public.ugc_character_v4_phase_events();

create or replace function public.ugc_character_generation_valid(g jsonb,v text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(g->>'promptVersion'='4' and g->>'contractVersion'='4' and g->>'revision'='face-back-front-v1'
  and g->>'slot'=v and g->>'builder'='characterViewPrompt' and g->>'providerModel'='higgsfield-ai/soul/v2/image-to-image'
  and coalesce(g->>'promptSha256','') ~ '^[a-f0-9]{64}$' and g->>'batchSize'='1' and g->>'enhancePrompt'='true'
  and coalesce(g->'reference'->>'assetId','') ~ '^[a-fA-F0-9-]{36}$' and coalesce(g->'reference'->>'sha256','') ~ '^[a-f0-9]{64}$'
  and length(g->'reference'->>'storageKey') between 1 and 512 and length(g->'reference'->>'etag') between 1 and 512
  and coalesce(g->>'soulId','') ~ '^[a-fA-F0-9-]{36}$' and (g->>'seed')::integer between 1 and 1000000
  and g->>'resolution'='1080p' and g->>'aspectRatio'=case when v='face' then '1:1' else '2:3' end
  and g->>'outputRole'=case v when 'front' then 'front_source' when 'back' then 'back_reference' when 'face' then 'face_reference' end
  and case v when 'face' then g->'reference'->>'kind'='original' and g->'upstream'='{}'::jsonb
   when 'back' then g->'reference'->>'kind'='original' and coalesce(g->'upstream'->'face'->>'sha256','') ~ '^[a-f0-9]{64}$'
   when 'front' then g->'reference'->>'kind'='back_reference' and g->'reference'->>'assetId'=g->'upstream'->'back'->>'assetId'
    and g->'reference'->>'sha256'=g->'upstream'->'back'->>'sha256' and coalesce(g->'upstream'->'face'->>'sha256','') ~ '^[a-f0-9]{64}$'
   else false end,false);
$$;
create or replace function public.ugc_character_validation_valid(p jsonb,v text,h text) returns boolean
language sql immutable set search_path='' as $$
 select public.ugc_character_validation_valid_pre_v4(p,v,h) and
  (coalesce(p->>'contractVersion','')<>'4' or coalesce(p->'observations'->>'neutralBackground'='true',false));
$$;
create or replace function public.ugc_character_front_transform_valid(a jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case when a->'generation'->>'contractVersion'='4' then
  public.ugc_character_generation_valid(a->'generation','front') and a->>'strategyRevision'='face-back-front-v1'
  and a->'characterValidation'->>'contractVersion'='4' and a->'sourceValidation'->>'contractVersion'='4'
  and a->'frontSource'->>'kind'='front_source' and a->'frontSource'->>'sha256'=a->'sourceValidation'->>'sha256'
  and public.ugc_character_front_transform_valid_pre_v4(a||jsonb_build_object('generation',a->'generation'||
   '{"promptVersion":3,"contractVersion":3,"revision":"soul2-image-to-image-v1"}'::jsonb))
 else public.ugc_character_front_transform_valid_pre_v4(a) end;
$$;
-- A valid historical Face/Back may be preserved by an explicit Front-only
-- request. V4 Back must bind the same Face selected for the new Front.
create or replace function public.ugc_character_v4_upstream_valid(g jsonb,a jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(case g->>'slot' when 'face' then true else
  public.ugc_character_validation_valid(a->'face'->'characterValidation','face',a->'face'->>'sha256')
  and a->'face'->'characterValidation'->'observations'->>'neutralBackground'='true'
  and g->'upstream'->'face'->>'assetId'=a->'face'->>'id' and g->'upstream'->'face'->>'sha256'=a->'face'->>'sha256'
  and case g->>'slot' when 'back' then true when 'front' then
   public.ugc_character_validation_valid(a->'back'->'characterValidation','back',a->'back'->>'sha256')
   and g->'reference'->>'assetId'=a->'back'->>'id' and g->'reference'->>'sha256'=a->'back'->>'sha256'
   and g->'reference'->>'storageKey'=a->'back'->>'storageKey' and g->'reference'->>'etag'=a->'back'->>'etag'
   and g->'upstream'->'back'->>'assetId'=a->'back'->>'id' and g->'upstream'->'back'->>'sha256'=a->'back'->>'sha256'
   and (coalesce(a->'back'->'generation'->>'contractVersion','')<>'4' or
    (a->'back'->'generation'->'upstream'->'face'->>'assetId'=a->'face'->>'id' and a->'back'->'generation'->'upstream'->'face'->>'sha256'=a->'face'->>'sha256'))
   else false end end,false);
$$;
create or replace function public.ugc_character_v4_inputs_valid(a jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(public.ugc_character_validation_valid(a->'face'->'characterValidation','face',a->'face'->>'sha256')
  and a->'face'->'characterValidation'->'observations'->>'neutralBackground'='true'
  and public.ugc_character_validation_valid(a->'back'->'characterValidation','back',a->'back'->>'sha256')
  and public.ugc_character_validation_valid(a->'front'->'characterValidation','front',a->'front'->>'sha256')
  and public.ugc_character_front_transform_valid(a->'front')
  and public.ugc_character_generation_valid(a->'front'->'generation','front')
  and public.ugc_character_v4_upstream_valid(a->'front'->'generation',a),false);
$$;
create or replace function public.ugc_character_effective_assets(p_job_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a jsonb; r public.ugc_reference_reviews; q public.ugc_reference_regeneration_requests; v text;
begin
 select document->'assets' into a from public.ugc_character_sheets where job_id=p_job_id;
 select * into r from public.ugc_reference_reviews where job_id=p_job_id and reference_type='character';
 for q in select * from public.ugc_reference_regeneration_requests where review_id=r.id and state='completed' order by requested_version loop
  a:=jsonb_set(a,array[q.view],q.replacement_asset);
 end loop;
 foreach v in array array['face','back','front'] loop
  if not public.ugc_character_validation_valid(a->v->'characterValidation',v,a->v->>'sha256')
   and public.ugc_character_validation_valid(r.character_validations->v,v,a->v->>'sha256') then
   a:=jsonb_set(a,array[v,'characterValidation'],r.character_validations->v);
  end if;
 end loop;
 return a;
end; $$;
create or replace function public.ugc_character_slots_valid(p_job_id uuid,p_sheet jsonb default null) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare r public.ugc_reference_reviews; a jsonb; s jsonb; v4 boolean;
begin
 if not public.ugc_character_slots_valid_pre_v4(p_job_id,p_sheet) then return false; end if;
 select * into r from public.ugc_reference_reviews where job_id=p_job_id and reference_type='character';
 a:=public.ugc_character_effective_assets(p_job_id);
 s:=coalesce(p_sheet,case when r.composed_version>1 then r.composed_asset else a->'sheet' end);
 v4:=coalesce(s->>'strategyRevision'='face-back-front-v1',false) or exists(
  select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and checkpoint->>'strategyRevision'='face-back-front-v1');
 if v4 then
  if exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed') then return false; end if;
  return public.ugc_character_v4_inputs_valid(a) and s->>'strategyRevision'='face-back-front-v1';
 end if;
 return true;
end; $$;

-- Explicit owner requests create the complete dependency batch atomically.
create or replace function public.ugc_request_reference_regeneration(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid,p_reference_type text,
 p_view text,p_expected_version integer,p_sheet_id uuid,p_request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.ugc_reference_reviews; q public.ugc_reference_regeneration_requests; j public.ugc_generation_jobs;
 views text[]; v text; a jsonb; cp jsonb; archived jsonb; request_key uuid;
begin
 if p_reference_type<>'character' then return public.ugc_request_reference_regeneration_m66_validation(p_owner_user_id,p_project_id,p_job_id,p_reference_type,p_view,p_expected_version,p_sheet_id,p_request_id); end if;
 r:=public.ugc_ensure_reference_review(p_owner_user_id,p_project_id,p_job_id,'character',p_sheet_id);
 if r.id is null or p_view is null or p_view not in ('face','back','front','sheet') or p_request_id is null then return false; end if;
 if exists(select 1 from public.ugc_generation_job_events where job_id=p_job_id and event_type='reference_regeneration_requested'
  and metadata->>'requestId'=p_request_id::text and metadata->>'view'=p_view and metadata->>'reviewId'=r.id::text) then return true; end if;
 if r.version is distinct from p_expected_version or r.version>=1000000 then return false; end if;
 if exists(select 1 from public.ugc_reference_reviews where job_id=p_job_id and execution_state='running') then return false; end if;
 views:=case p_view when 'face' then array['face','back','front'] when 'back' then array['back','front'] when 'front' then array['front'] else array[]::text[] end;
 a:=public.ugc_character_effective_assets(p_job_id);
 if p_view='sheet' then
  if r.version<>r.composed_version or exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed')
    or not public.ugc_character_slots_valid(p_job_id) then return false; end if;
 else
  -- Pending V4 local repairs use resume, retaining their paid receipts/budget.
  -- Only known historical outcomes can be explicitly superseded.
  for q in select * from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed' for update loop
   if not q.view=any(views) or q.checkpoint->>'strategyRevision'='face-back-front-v1'
    or q.checkpoint->'generation'->>'revision'='face-back-front-v1'
    or q.checkpoint<>'{}'::jsonb and (q.checkpoint->>'state' is null or q.checkpoint->>'state' not in ('completed','rejected'))
    or q.checkpoint->>'state'='completed' and coalesce(q.checkpoint->>'providerId','') !~ '^[a-fA-F0-9-]{36}$'
    or coalesce(jsonb_array_length(q.checkpoint->'previousAttempts'),0)>=5 then return false; end if;
  end loop;
  foreach v in array views loop
   if a->v is null then return false; end if;
  end loop;
 end if;
 update public.ugc_reference_reviews set version=version+1,approved_at=null,approved_by=null,approved_version=null where id=r.id returning * into r;
 foreach v in array views loop
  select * into q from public.ugc_reference_regeneration_requests where review_id=r.id and view=v and state<>'completed';
  request_key:=case when v=p_view then p_request_id else gen_random_uuid() end;
  cp:=jsonb_build_object('key',request_key,'manualRequestId',request_key,'strategyRevision','face-back-front-v1','state','rejected',
   'startedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'polls',0);
  if found then
   if q.checkpoint<>'{}'::jsonb then
    archived:=(q.checkpoint-'previousAttempts')||jsonb_build_object('requestedVersion',q.requested_version);
    cp:=cp||jsonb_build_object('previousAttempts',coalesce(q.checkpoint->'previousAttempts','[]'::jsonb)||jsonb_build_array(archived));
   end if;
   update public.ugc_reference_regeneration_requests set requested_version=r.version,state='regenerating',checkpoint=cp where id=q.id;
  else
   insert into public.ugc_reference_regeneration_requests(id,review_id,view,requested_version,previous_asset_id,requested_by,checkpoint)
    values(request_key,r.id,v,r.version,(a->v->>'id')::uuid,p_owner_user_id,cp);
  end if;
 end loop;
 select * into j from public.ugc_generation_jobs where id=p_job_id;
 insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
  values(j.id,j.status,'character_reference','reference_regeneration_requested',case when p_view='sheet' then 'Local Character Sheet rebuild requested. No provider generation.'
   else 'Character V4 dependency regeneration requested. Previous assets retained; approval required after completion.' end,
   jsonb_build_object('view',p_view,'requestId',p_request_id,'reviewId',r.id,'version',r.version));
 return true;
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
 if new.document->>'strategyRevision'='face-back-front-v1' and new.status='completed' and not public.ugc_character_v4_inputs_valid(new.document->'assets') then
  raise exception 'Character V4 requires validated Face, Back and local Front dependencies.' using errcode='23514'; end if;
 if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
  foreach v in array array['front','back','face'] loop
   a:=new.document->'assets'->v;
   if not public.ugc_character_validation_valid(a->'characterValidation',v,a->>'sha256') or v='front' and not public.ugc_character_front_transform_valid(a)
    or new.document->'assets'->'sheet'->'characterInputs'->>v is distinct from a->>'sha256' then raise exception 'Character sheet requires three validated slots.' using errcode='23514'; end if;
  end loop;
 end if;
 return new;
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
    'Saving character reference','Character generation stopped safely','Validating Character Sheet') then return false; end if;
  select * into s from public.ugc_character_sheets where job_id=j.id for update;
  if not found or s.status<>'preparing' or s.document->>'strategyRevision' is distinct from 'face-back-front-v1' then return false; end if;
  if (p_document-array['operations','assets']) is distinct from (s.document-array['operations','assets']) then return false; end if;
  for item in select * from jsonb_each(p_document->'operations') loop
    if item.key in ('front','back','face') and item.value->>'state'='intent'
      and (not public.ugc_character_generation_valid(item.value->'generation',item.key) or not public.ugc_character_v4_upstream_valid(item.value->'generation',s.document->'assets')) then return false; end if;
    if item.key in ('front','back','face') and item.value->>'state'='intent' and
      (select count(*) from jsonb_array_elements(coalesce(item.value->'previousAttempts','[]'::jsonb)) prior
        where prior->'generation'->>'revision'='face-back-front-v1')>=2 then return false; end if;
  end loop;
  for item in select * from jsonb_each(s.document->'assets') loop
    if p_document->'assets'->item.key is distinct from item.value then return false; end if;
  end loop;
  for item in select * from jsonb_each(s.document->'operations') loop
    incoming:=p_document->'operations'->item.key;
    if coalesce(item.key in ('front','back','face') and (item.value->'validation'->>'state'='rejected' and item.value->'sourceValidation'->>'state' is distinct from 'passed' or item.value->>'state'='rejected')
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

create or replace function public.ugc_guard_regeneration_request() returns trigger
language plpgsql set search_path='' as $$
declare manual boolean;
begin
 if tg_op='DELETE' then raise exception 'Reference replacement history is retained.' using errcode='23514'; end if;
 manual:=coalesce(old.state<>'completed' and (old.checkpoint->>'state' in ('completed','rejected') or old.checkpoint='{}'::jsonb)
  and new.state='regenerating' and new.requested_version>old.requested_version
  and new.checkpoint->>'state'='rejected' and new.checkpoint->>'manualRequestId'=new.checkpoint->>'key'
  and (old.checkpoint='{}'::jsonb and new.checkpoint->'previousAttempts' is null or new.checkpoint->'previousAttempts'=coalesce(old.checkpoint->'previousAttempts','[]'::jsonb)||
    jsonb_build_array((old.checkpoint-'previousAttempts')||jsonb_build_object('requestedVersion',old.requested_version)))
  and exists(select 1 from public.ugc_reference_reviews where id=new.review_id and reference_type='character' and execution_state='idle'
    and version=new.requested_version),false);
 if (to_jsonb(new)-case when manual then array['state','replacement_asset','checkpoint','updated_at','requested_version'] else array['state','replacement_asset','checkpoint','updated_at'] end) is distinct from
  (to_jsonb(old)-case when manual then array['state','replacement_asset','checkpoint','updated_at','requested_version'] else array['state','replacement_asset','checkpoint','updated_at'] end)
  or old.state='completed' or (new.replacement_asset is distinct from old.replacement_asset and new.state<>'completed')
  or not ((old.state='regeneration_requested' and new.state in ('regenerating','failed')) or (old.state='regenerating' and new.state in ('regenerating','failed','completed')) or (old.state='failed' and new.state='regenerating')) then
  raise exception 'Invalid reference replacement transition.' using errcode='23514'; end if;
 if not manual and not coalesce((old.checkpoint->'validation'->>'state'='rejected' and old.checkpoint->'sourceValidation'->>'state' is distinct from 'passed' or old.checkpoint->>'state'='rejected') and coalesce(jsonb_array_length(old.checkpoint->'previousAttempts'),0)<5
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

create or replace function public.ugc_update_reference_regeneration(p_review_id uuid,p_token uuid,p_action text,
 p_request_id uuid default null,p_checkpoint jsonb default null,p_asset jsonb default null,p_phase text default null,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.ugc_reference_reviews; j public.ugc_generation_jobs; v text; saved boolean; a jsonb;
begin
 select j0.* into j from public.ugc_generation_jobs j0 join public.ugc_reference_reviews r0 on r0.job_id=j0.id where r0.id=p_review_id for update of j0;
 if not found then return false; end if;
 select * into r from public.ugc_reference_reviews where id=p_review_id for update;
 if r.reference_type='character' then
  a:=public.ugc_character_effective_assets(j.id);
  if p_action='validating_sheet' then
   if not public.ugc_update_reference_regeneration_m66_storage(p_review_id,p_token,'heartbeat') then return false; end if;
   update public.ugc_reference_reviews set execution_phase='sheet_validating' where id=r.id;
   perform public.ugc_regeneration_event(r.id,null,'sheet_validating'); return true;
  end if;
  if p_action='checkpoint' and p_checkpoint->>'state'='intent' then
   select view into v from public.ugc_reference_regeneration_requests where id=p_request_id and review_id=r.id;
   if not public.ugc_character_generation_valid(p_checkpoint->'generation',v) or not public.ugc_character_v4_upstream_valid(p_checkpoint->'generation',a)
    or exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed' and
     (v='back' and view='face' or v='front' and view in ('face','back'))) then return false; end if;
   if (select count(*) from jsonb_array_elements(coalesce(p_checkpoint->'previousAttempts','[]'::jsonb)) prior
    where prior->'generation'->>'revision'='face-back-front-v1')>=2 then return false; end if;
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
   if p_asset->>'strategyRevision' is distinct from 'face-back-front-v1' or p_asset->'characterValidation'->>'contractVersion' is distinct from '4' or not public.ugc_character_validation_valid(p_asset->'characterValidation',v,p_asset->>'sha256')
    or v='front' and not public.ugc_character_front_transform_valid(p_asset) then return false; end if;
   if exists(select 1 from public.ugc_reference_regeneration_requests where id=p_request_id and checkpoint->'generation' is not null
    and checkpoint->'generation' is distinct from p_asset->'generation') then return false; end if;
  elsif p_action='complete' and not public.ugc_character_slots_valid(j.id,p_asset) then return false;
  end if;
 end if;
 saved:=public.ugc_update_reference_regeneration_m66_storage(p_review_id,p_token,p_action,p_request_id,p_checkpoint,p_asset,p_phase,p_error);
 if saved and r.reference_type='character' and p_action='checkpoint' and (p_checkpoint->'validation'->>'state'='intent' or p_checkpoint->>'workPhase' in ('preparing_source','sending_i2i','checking_original_face','validating_source','cropping_front','validating_crop')) then
  select view into v from public.ugc_reference_regeneration_requests where id=p_request_id and review_id=r.id;
  update public.ugc_reference_reviews set execution_phase=v||'_'||case when p_checkpoint->>'workPhase' in ('preparing_source','sending_i2i','checking_original_face','validating_source','cropping_front','validating_crop') then p_checkpoint->>'workPhase' else 'validating' end where id=r.id;
 end if;
 return saved;
end; $$;

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
    when 'sheet_rebuild_complete' then 'Reference sheet rebuilt.' when 'sheet_validating' then 'Validating Character Sheet' when 'ready_for_review' then 'Reference ready for review. Approval is required.'
    when 'regeneration_failed' then 'Reference regeneration stopped safely. Previous references remain available.' end;
  if r.reference_type='character' and p_phase in ('regeneration_started','downloading') then
    message:=case q.checkpoint->>'workPhase'
     when 'preparing_source' then 'Preparing the private image-to-image reference.'
     when 'sending_i2i' then 'Sending the image-to-image request.'
     when 'checking_original_face' then 'Checking original Character image for Face reuse.'
     when 'validating_source' then 'Validating the single-view source.'
     when 'cropping_front' then 'Creating headless Front locally.'
     when 'validating_crop' then 'Validating the cropped Front.' else message end;
  end if;
  if r.reference_type='character' then
   if p_phase='sheet_rebuild_started' then message:='Building Character Sheet'; end if;
   if p_phase='ready_for_review' then message:='Ready for review'; end if;
  end if;
  if message is null or r.id is null then raise exception 'Invalid regeneration phase.'; end if;
  event:=r.reference_type||'_reference.'||case when p_phase in ('regeneration_started','generating','provider_ready','downloading','ready') then q.view||'_' else '' end||p_phase;
  if r.reference_type='character' and p_phase='sheet_validating' then event:='character_reference.slot_validation'; end if;
  if event is null then raise exception 'Missing regeneration request.'; end if;
  if not exists(select 1 from public.ugc_generation_job_events where job_id=j.id and event_type=event
    and metadata->>'reviewId'=r.id::text and metadata->>'version'=r.version::text
    and metadata->>'requestId' is not distinct from p_request_id::text
    and (r.reference_type<>'character' or metadata->>'workPhase' is not distinct from q.checkpoint->>'workPhase')) then
    insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
      values(j.id,j.status,r.reference_type||'_reference',event,message,jsonb_build_object('reviewId',r.id,'requestId',p_request_id,'version',r.version,'view',q.view)||case when r.reference_type='character' then jsonb_build_object('workPhase',q.checkpoint->>'workPhase') else '{}'::jsonb end);
  end if;
end; $$;

-- All helpers stay internal. Only existing service RPC entry points are callable.
revoke all on function public.ugc_character_front_transform_valid_pre_v4(jsonb),
 public.ugc_character_validation_valid_pre_v4(jsonb,text,text),public.ugc_character_slots_valid_pre_v4(uuid,jsonb),
 public.ugc_character_generation_valid(jsonb,text),public.ugc_character_front_transform_valid(jsonb),
 public.ugc_character_validation_valid(jsonb,text,text),public.ugc_character_slots_valid(uuid,jsonb),
 public.ugc_character_v4_upstream_valid(jsonb,jsonb),public.ugc_character_v4_inputs_valid(jsonb),
 public.ugc_character_effective_assets(uuid),public.ugc_character_v4_event(uuid,text,text,text,text),
 public.ugc_character_v4_phase_events(),public.ugc_checkpoint_character_sheet_m5(uuid,uuid,jsonb,text)
 from public,anon,authenticated,service_role;
revoke all on function public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid),
 public.ugc_update_reference_regeneration(uuid,uuid,text,uuid,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid),
 public.ugc_update_reference_regeneration(uuid,uuid,text,uuid,jsonb,jsonb,text,text) to service_role;
-- Keep exact dependency failures in the existing allowlisted diagnostics.
do $$ begin
 if to_regprocedure('public.ugc_regeneration_diagnostic_valid_pre_v4(jsonb)') is null then
  alter function public.ugc_regeneration_diagnostic_valid(jsonb) rename to ugc_regeneration_diagnostic_valid_pre_v4;
 end if;
 if to_regprocedure('public.ugc_resume_character_output_pre_v4(uuid)') is null then
  alter function public.ugc_resume_character_output(uuid) rename to ugc_resume_character_output_pre_v4;
 end if;
end; $$;
create or replace function public.ugc_regeneration_diagnostic_valid(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select public.ugc_regeneration_diagnostic_valid_pre_v4(case when p->>'code' in ('CHARACTER_FACE_DEPENDENCY_INVALID','CHARACTER_BACK_DEPENDENCY_INVALID')
  then p||'{"code":"CHARACTER_SLOT_VALIDATION_REQUIRED"}'::jsonb else p end);
$$;
create or replace function public.ugc_resume_character_output(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_character_sheets;
begin
 select * into j from public.ugc_generation_jobs where id=p_job_id for update;
 select * into s from public.ugc_character_sheets where job_id=p_job_id for update;
 if s.document->>'strategyRevision' is distinct from 'face-back-front-v1' or s.document->'operations'->'front'->'sourceValidation'->>'state' is distinct from 'passed' then
  return public.ugc_resume_character_output_pre_v4(p_job_id);
 end if;
 -- Repair local Front only. Do not archive/rotate its paid provider request.
 if j.status<>'failed' or j.resume_stage<>'character_reference' or j.error_code is distinct from 'CHARACTER_OUTPUT_INVALID'
  or j.attempt_count>=j.max_attempts or j.cancellation_requested_at is not null or j.pause_reason is not null or s.status<>'preparing'
  or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft')
  or not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false)
  or exists(select 1 from jsonb_each(s.document->'operations') where value->>'state' in ('intent','failed')
    or value->'validation'->>'state' in ('intent','unavailable')) then return false; end if;
 update public.ugc_generation_jobs set status='queued',stage='character_reference',resume_stage='character_reference',
  failed_at=null,error_code=null,safe_error_message=null,retry_eligible=false,next_retry_at=clock_timestamp()+interval '5 seconds' where id=j.id;
 return true;
end; $$;
revoke all on function public.ugc_regeneration_diagnostic_valid_pre_v4(jsonb),public.ugc_regeneration_diagnostic_valid(jsonb),
 public.ugc_resume_character_output_pre_v4(uuid) from public,anon,authenticated,service_role;
revoke all on function public.ugc_resume_character_output(uuid) from public,anon,authenticated;
grant execute on function public.ugc_resume_character_output(uuid) to service_role;
create or replace function public.ugc_character_progress_events() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb:='{}'::jsonb; view_name text;
begin
  if tg_op='INSERT' then
    perform public.ugc_append_character_progress(new.job_id,'character_reference.started');
  else previous:=old.document; end if;
  if new.document->'operations'->'identity'->>'state'='completed'
    and previous->'operations'->'identity'->>'state' is distinct from 'completed' then
    perform public.ugc_append_character_progress(new.job_id,'character_reference.soul_id_ready');
  end if;
  -- V4 view events come from real per-operation phases, including original Face reuse.
  if new.document->>'strategyRevision' is distinct from 'face-back-front-v1' then
  foreach view_name in array array['front','back','face'] loop
    if new.document->'operations'->view_name is not null and previous->'operations'->view_name is null then
      perform public.ugc_append_character_progress(new.job_id,'character_reference.'||view_name||'_generating',view_name);
    end if;
    if new.document->'assets'->view_name is not null and previous->'assets'->view_name is null then
      perform public.ugc_append_character_progress(new.job_id,'character_reference.'||view_name||'_ready',view_name);
    end if;
  end loop;
  end if;
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
    perform public.ugc_append_character_progress(new.job_id,'character_reference.complete');
  end if;
  return new;
end; $$;
commit;
