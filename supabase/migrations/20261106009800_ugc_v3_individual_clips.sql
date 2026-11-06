-- Product Phase 2 M5. Apply manually after 097. No table/data/pricing/backfill change.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_validate_connected_story(jsonb,integer)') is null then raise exception 'Apply 097 before 098'; end if;
 for t,c in select * from (values
 ('projects','id'),('projects','duration'),('projects','studio_mode'),('projects','deleted_at'),
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('ugc_v3_artifacts','version'),('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),
 ('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','document'),('ugc_v3_packages','package_hash'),
 ('ugc_v3_sources','project_id'),('ugc_v3_sources','revision'),('ugc_v3_sources','input'),
 ('ugc_v3_quotes','id'),('ugc_v3_quotes','package_id'),('ugc_v3_quotes','document'),
 ('ugc_v3_runs','id'),('ugc_v3_runs','project_id'),('ugc_v3_runs','package_id'),('ugc_v3_runs','segment_key'),('ugc_v3_runs','intent'),('ugc_v3_runs','authorization_id'),('ugc_v3_runs','result'),('ugc_v3_runs','state'),('ugc_v3_runs','observation'),('ugc_v3_runs','created_at'),
 ('ugc_v3_run_authorizations','id'),('ugc_v3_run_authorizations','project_id'),('ugc_v3_run_authorizations','package_id'),('ugc_v3_run_authorizations','document'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','lease_until'),
 ('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify M5 prerequisite %.%',t,c; end if;
 end loop;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='ugc_v3_runs_active_segment') then raise exception 'Verify active-segment uniqueness before 098'; end if;
end $$;

create or replace function public.ugc_v3_clip_source_valid(p_project uuid,d jsonb,total integer) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.ugc_v3_validate_connected_story(d->'storyboardContent',total) and
  (d->>'direction')::jsonb->>'promptCompiler'='connected-clip-compiler-v1' and exists(
   select 1 from public.ugc_v3_artifacts a where a.id=(d->'storyboard'->>'id')::uuid and a.project_id=p_project
    and a.kind='storyboard' and a.approved_at is not null and a.rejected_at is null
    and a.document->'storyboard'=d->'storyboardContent'
    and (d->'storyboard'->>'version')::integer=a.version
    and d->'storyboard'->>'hash'=public.ugc_package_digest('sceenyk-v3-storyboard',a.document->'storyboard')),false)
$$;
create or replace function public.ugc_v3_clip_package_valid(d jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare c jsonb; s jsonb; n integer:=0; begin
 if d->'source'->'storyboardContent'->>'version' is distinct from 'director-storyboard-connected-v1'
  or jsonb_typeof(d->'segments') is distinct from 'array'
  or jsonb_array_length(d->'segments') is distinct from jsonb_array_length(d->'source'->'storyboardContent'->'clips') then return false; end if;
 for c in select value from jsonb_array_elements(d->'source'->'storyboardContent'->'clips') loop
  s:=d->'segments'->n; n:=n+1;
  if s->'startMs' is distinct from c->'startMs' or s->'endMs' is distinct from c->'endMs'
   or s->'durationMs' is distinct from c->'durationMs' or (s->>'durationMs')::integer>30000 then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;

create or replace function public.ugc_v3_connected_story_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare total integer; mode text; source jsonb; begin
 -- Serialize admission/publication/review against mode and duration saves.
 select duration::integer*1000,studio_mode into total,mode from public.projects where id=new.project_id for update;
 if tg_table_name='ugc_v3_sources' then
  if total>30000 or (new.input->'storyboardContent'->>'durationMs')::integer>30000 then
   if mode<>'pro' or not public.ugc_v3_clip_source_valid(new.project_id,new.input,total) then raise exception 'V3_CLIP_PLAN_INVALID'; end if;
  end if;
 elsif tg_table_name='ugc_v3_packages' then
  if total>30000 or (new.document->'source'->'storyboardContent'->>'durationMs')::integer>30000 then
   if mode<>'pro' or not public.ugc_v3_clip_source_valid(new.project_id,new.document->'source',total)
    or not public.ugc_v3_clip_package_valid(new.document) then raise exception 'V3_CLIP_PLAN_INVALID'; end if;
  end if;
 elsif tg_table_name='ugc_v3_runs' then
  select document->'source'->'storyboardContent' into source from public.ugc_v3_packages where id=new.package_id;
  if total>30000 or (source->>'durationMs')::integer>30000 then
   if mode<>'pro' or source->>'version' is distinct from 'director-storyboard-connected-v1'
    or not exists(select 1 from public.ugc_v3_packages p,jsonb_array_elements(p.document->'segments') s
     where p.id=new.package_id and p.project_id=new.project_id and public.ugc_v3_clip_package_valid(p.document)
      and s->>'id'=new.segment_key and (s->>'durationMs')::integer between 4000 and 30000
      and (new.intent->'body'->>'duration')::numeric*1000=(s->>'durationMs')::integer
      and new.intent->'authorization'->'clipAttempt'->>'storyboardId'=p.document->'source'->'storyboard'->>'id')
    then raise exception 'V3_CLIP_PLAN_INVALID'; end if;
  end if;
 elsif tg_table_name='ugc_v3_tasks' then
  if new.kind='storyboard' and total=20000 and mode<>'pro' then raise exception 'V3_PRO_DURATION_REQUIRED'; end if;
  if new.kind='storyboard' and total>30000 then
   if mode<>'pro' then raise exception 'V3_PRO_DURATION_REQUIRED'; end if;
   if new.input->>'directorVersion' is distinct from 'connected-story-director-v1'
    or new.input->'clipBoundaries' is distinct from public.ugc_v3_story_clip_boundaries(total) then raise exception 'V3_CLIP_PLAN_INVALID'; end if;
  elsif new.kind='join' and total>30000 then raise exception 'V3_CLIP_MERGE_NOT_IMPLEMENTED';
  elsif new.kind in ('package','video') and total>30000 then
   if new.kind='package' then
    if mode<>'pro' or not exists(select 1 from public.ugc_v3_sources s where s.project_id=new.project_id
     and s.revision=(new.input->>'sourceRevision')::integer and public.ugc_v3_clip_source_valid(new.project_id,s.input,total)) then raise exception 'V3_CLIP_PLAN_INVALID'; end if;
   elsif mode<>'pro' or not exists(select 1 from public.ugc_v3_runs r join public.ugc_v3_packages p on p.id=r.package_id
    where r.id=(new.input->>'runId')::uuid and r.project_id=new.project_id and public.ugc_v3_clip_package_valid(p.document)) then raise exception 'V3_CLIP_PLAN_INVALID'; end if;
  end if;
 elsif tg_table_name='ugc_v3_artifacts' and new.kind='storyboard' then
  if tg_op='UPDATE' and old.document->'storyboard'->>'version'='director-storyboard-connected-v1'
   and new.document is distinct from old.document then raise exception 'V3_CONNECTED_STORY_IMMUTABLE'; end if;
  -- Rejection remains possible for stale plans; approval revalidates the exact
  -- frozen boundaries and the current project under the same row lock.
  if tg_op='INSERT' or new.approved_at is distinct from old.approved_at then
   source:=new.document->'storyboard';
   if total>30000 or source->>'version'='director-storyboard-connected-v1' then
    if mode<>'pro' then raise exception 'V3_PRO_DURATION_REQUIRED'; end if;
    if new.document->'input'->'clipBoundaries' is distinct from public.ugc_v3_story_clip_boundaries(total)
     or not public.ugc_v3_validate_connected_story(source,total) then raise exception 'V3_CLIP_PLAN_INVALID'; end if;
   end if;
  end if;
 end if;
 return new;
end $$;

-- Protect newly published packages as well as existing source/task/run owners.
drop trigger if exists z_v3_connected_story_package on public.ugc_v3_packages;
create trigger z_v3_connected_story_package before insert on public.ugc_v3_packages for each row execute function public.ugc_v3_connected_story_guard();

-- Preserve every historical guard. Only connected stories scope the old
-- package-wide authorization exclusion to the selected active segment.
do $$ declare definition text; old_text text:=$p$or exists(select 1 from public.ugc_v3_runs where package_id=target and state<>'deleted')$p$;
 new_text text:=$p$or exists(select 1 from public.ugc_v3_runs where package_id=target and state<>'deleted'
    and (pkg.document->'source'->'storyboardContent'->>'version' is distinct from 'director-storyboard-connected-v1' or segment_key=d->>'segmentId'))$p$;
begin
 select pg_get_functiondef('public.ugc_v3_runtime_action(uuid,uuid,text,jsonb)'::regprocedure) into definition;
 if strpos(definition,new_text)>0 then null;
 elsif (length(definition)-length(replace(definition,old_text,'')))/length(old_text)=1 then execute replace(definition,old_text,new_text);
 else raise exception 'Inspect authorization contract before 098'; end if;
end $$;

-- A connected grant binds the latest immutable attempt and reserves money under
-- the project lock. Consumed grants and deleted outputs never restore capacity.
create or replace function public.ugc_v3_clip_authority_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare pkg public.ugc_v3_packages; previous public.ugc_v3_runs; clip jsonb; spent bigint; reserved bigint; begin
 select * into pkg from public.ugc_v3_packages where id=new.package_id and project_id=new.project_id;
 if pkg.document->'source'->'storyboardContent'->>'version' is distinct from 'director-storyboard-connected-v1' then return new; end if;
 perform 1 from public.ugc_v3_projects where project_id=new.project_id for update;
 perform 1 from public.projects where id=new.project_id and studio_mode='pro' and deleted_at is null for update;
 if not found then raise exception 'V3_PRO_DURATION_REQUIRED'; end if;
 select value into clip from jsonb_array_elements(pkg.document->'source'->'storyboardContent'->'clips')
  where value->>'number'=new.document->'clipAttempt'->>'number';
 select * into previous from public.ugc_v3_runs where package_id=new.package_id and segment_key=new.document->>'segmentId' order by created_at desc,id desc limit 1;
 if clip is null or new.document->'clipAttempt'->>'storyboardId' is distinct from pkg.document->'source'->'storyboard'->>'id'
  or new.document->'clipAttempt'->>'clipId' is distinct from clip->>'id'
  or new.document->'clipAttempt'->>'previousRunId' is distinct from previous.id::text
  or previous.id is not null and previous.state<>'deleted'
  or not exists(select 1 from jsonb_array_elements(pkg.document->'segments') with ordinality s(value,n)
   where s.value->>'id'=new.document->>'segmentId' and s.n=(clip->>'number')::integer)
  then raise exception 'V3_CLIP_ATTEMPT_CHANGED'; end if;
 if exists(select 1 from public.ugc_v3_run_authorizations a where a.package_id=new.package_id
  and a.document->>'segmentId'=new.document->>'segmentId' and (a.document->>'expiresAt')::timestamptz>now()
  and not exists(select 1 from public.ugc_v3_runs r where r.authorization_id=a.id)) then raise exception 'V3_CLIP_AUTHORIZATION_EXISTS'; end if;
 select coalesce(sum((intent->>'estimatedCostMicrousd')::bigint),0) into spent from public.ugc_v3_runs where package_id=new.package_id;
 select coalesce(sum((a.document->>'maxEstimatedCostMicrousd')::bigint),0) into reserved from public.ugc_v3_run_authorizations a
  where a.package_id=new.package_id and (a.document->>'expiresAt')::timestamptz>now()
   and not exists(select 1 from public.ugc_v3_runs r where r.authorization_id=a.id);
 if coalesce((new.document->>'maxEstimatedCostMicrousd')::bigint,-1)<0
  or coalesce((new.document->>'packageMaxEstimatedCostMicrousd')::bigint,-1)<spent+reserved+(new.document->>'maxEstimatedCostMicrousd')::bigint
  then raise exception 'V3_PACKAGE_AUTHORIZATION_INSUFFICIENT'; end if;
 return new;
end $$;
drop trigger if exists z_v3_clip_authority on public.ugc_v3_run_authorizations;
create trigger z_v3_clip_authority before insert on public.ugc_v3_run_authorizations for each row execute function public.ugc_v3_clip_authority_guard();

-- Only terminal observations or the existing transport's durable known-rejected
-- HTTP evidence release a failed attempt. A timeout/unknown outcome never does.
create or replace function public.ugc_v3_clip_retryable(p_owner uuid,p_project uuid,p_run uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ugc_v3_runs r join public.ugc_v3_projects v on v.project_id=r.project_id
  where r.id=p_run and r.project_id=p_project and v.owner_user_id=p_owner and r.state='failed' and r.result is null
   and not exists(select 1 from public.ugc_v3_tasks t where t.project_id=p_project and t.input->>'runId'=r.id::text and t.lease_until>now())
   and (r.observation->>'status' in ('failed','nsfw','canceled') or r.observation is null and exists(
    select 1 from public.ugc_v3_tasks t join public.ugc_v3_runtime_events e on e.entity_id=t.id and e.project_id=t.project_id
     where t.project_id=p_project and t.kind='video' and t.input->>'runId'=r.id::text and e.kind='failed'
      and e.document->>'outcome'='rejected' and e.document->>'httpStatus' in ('400','401','403','404','413','415','422','423','429'))))
$$;

create or replace function public.ugc_v3_clip_authorize(p_owner uuid,p_project uuid,p_documents jsonb,p_previous uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare d jsonb; pkg public.ugc_v3_packages; previous public.ugc_v3_runs; number_of_clips integer; begin
 perform 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id
  where v.project_id=p_project and v.owner_user_id=p_owner and p.deleted_at is null and p.studio_mode='pro' for update of v,p;
 if not found then raise exception 'V3_PROJECT_NOT_OWNED'; end if;
 if jsonb_typeof(p_documents) is distinct from 'array' or jsonb_array_length(p_documents)=0 then raise exception 'V3_AUTHORIZATION_INVALID'; end if;
 select * into pkg from public.ugc_v3_packages where id=(p_documents->0->>'packageId')::uuid and project_id=p_project;
 if pkg.id is null or not public.ugc_v3_runtime_current(pkg.id) or not public.ugc_v3_clip_package_valid(pkg.document) then raise exception 'PACKAGE_STALE'; end if;
 number_of_clips:=jsonb_array_length(pkg.document->'segments');
 if p_previous is null then
  -- A retry may arrive after admission; consumed grants are never renewed here.
  if jsonb_array_length(p_documents)=1 and number_of_clips>1 then
   if exists(select 1 from public.ugc_v3_runs where package_id=pkg.id and segment_key=p_documents->0->>'segmentId')
    or not exists(select 1 from public.ugc_v3_run_authorizations where package_id=pkg.id and document->>'segmentId'=p_documents->0->>'segmentId') then raise exception 'V3_CLIP_ATTEMPT_APPROVAL_REQUIRED'; end if;
  else
   if exists(select 1 from public.ugc_v3_runs where package_id=pkg.id) then raise exception 'V3_CLIP_ATTEMPT_APPROVAL_REQUIRED'; end if;
   if jsonb_array_length(p_documents)<>number_of_clips or (select count(distinct x->>'segmentId') from jsonb_array_elements(p_documents) x)<>number_of_clips then raise exception 'V3_CLIP_PLAN_INVALID'; end if;
  end if;
 else
  if jsonb_array_length(p_documents)<>1 then raise exception 'V3_CLIP_SELECTION_REQUIRED'; end if;
  select * into previous from public.ugc_v3_runs where id=p_previous and project_id=p_project and package_id=pkg.id for update;
  if previous.id is null or previous.intent->>'segmentId' is distinct from p_documents->0->>'segmentId'
   or exists(select 1 from public.ugc_v3_runs r where r.package_id=pkg.id and r.segment_key=previous.segment_key and r.created_at>previous.created_at)
   then raise exception 'V3_CLIP_ATTEMPT_CHANGED'; end if;
  if previous.state='failed' and public.ugc_v3_clip_retryable(p_owner,p_project,p_previous)
   and not exists(select 1 from public.ugc_v3_tasks where project_id=p_project and input->>'runId'=p_previous::text and lease_until>now()) then
   update public.ugc_v3_runs set state='deleted' where id=p_previous;
  elsif previous.state<>'deleted' then raise exception 'V3_CLIP_DELETE_OR_RECOVER_FIRST'; end if;
 end if;
 for d in select value from jsonb_array_elements(p_documents) loop
  if d->>'packageId' is distinct from pkg.id::text or d->'clipAttempt'->>'previousRunId' is distinct from p_previous::text then raise exception 'V3_CLIP_ATTEMPT_CHANGED'; end if;
  perform public.ugc_v3_runtime_action(p_owner,p_project,'authorize',jsonb_build_object('document',d));
 end loop;
 -- Freeze actual saved grants, including idempotently reused ones.
 select jsonb_agg(a.document order by a.document->'clipAttempt'->>'number') into p_documents
  from public.ugc_v3_run_authorizations a where a.package_id=pkg.id and (a.document->>'expiresAt')::timestamptz>now()
   and a.document->'clipAttempt'->>'previousRunId' is not distinct from p_previous::text
   and exists(select 1 from jsonb_array_elements(p_documents) requested(doc) where requested.doc->>'segmentId'=a.document->>'segmentId')
   and not exists(select 1 from public.ugc_v3_runs r where r.authorization_id=a.id);
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,pkg.id,'clip_spending_approval',
  jsonb_build_object('packageHash',pkg.package_hash,'previousRunId',p_previous,'authorizations',p_documents));
 return true;
end $$;

-- Capture the ordered private merge inputs after owner review. This function
-- creates no task and performs no FFmpeg or provider work.
create or replace function public.ugc_v3_clip_manifest(p_owner uuid,p_project uuid,p_package uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare pkg public.ugc_v3_packages; s jsonb; r public.ugc_v3_runs; clips jsonb:='[]'; manifest jsonb; n integer:=0; fingerprint text; begin
 perform 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id
  where v.project_id=p_project and v.owner_user_id=p_owner and p.deleted_at is null for update of v,p;
 if not found then raise exception 'V3_PROJECT_NOT_OWNED'; end if;
 select * into pkg from public.ugc_v3_packages where id=p_package and project_id=p_project;
 if pkg.id is null or not public.ugc_v3_runtime_current(pkg.id) or not public.ugc_v3_clip_package_valid(pkg.document) then raise exception 'PACKAGE_STALE'; end if;
 for s in select value from jsonb_array_elements(pkg.document->'segments') loop
  select * into r from public.ugc_v3_runs where package_id=pkg.id and segment_key=s->>'id' and state='approved';
  if r.id is null or r.result is null then return false; end if;
  clips:=clips||jsonb_build_array(jsonb_build_object('clipId',pkg.document->'source'->'storyboardContent'->'clips'->n->>'id',
   'number',n+1,'segmentId',s->>'id','runId',r.id,'startMs',s->'startMs','endMs',s->'endMs','durationMs',s->'durationMs','asset',r.result));
  n:=n+1;
 end loop;
 manifest:=jsonb_build_object('schema','v3-clip-merge-preparation-v1','packageId',pkg.id,'packageHash',pkg.package_hash,
  'storyboard',pkg.document->'source'->'storyboard','resolution',pkg.document->'source'->>'resolution',
  'aspectRatio',pkg.document->'source'->'storyboardContent'->>'aspectRatio','clips',clips);
 fingerprint:=public.ugc_package_digest('sceenyk-v3-clip-merge-preparation',manifest);
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document)
  select p_project,pkg.id,'clips_ready_for_merging',manifest||jsonb_build_object('hash',fingerprint)
   where not exists(select 1 from public.ugc_v3_runtime_events where project_id=p_project and entity_id=pkg.id and kind='clips_ready_for_merging' and document->>'hash'=fingerprint);
 return true;
end $$;
-- Approval and merge preparation commit together, including after a server crash.
create or replace function public.ugc_v3_clip_review_manifest() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; begin
 if exists(select 1 from public.ugc_v3_packages where id=new.package_id and document->'source'->'storyboardContent'->>'version'='director-storyboard-connected-v1') then
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=new.project_id;
  perform public.ugc_v3_clip_manifest(owner_id,new.project_id,new.package_id);
 end if;
 return new;
end $$;
drop trigger if exists z_v3_clip_review_manifest on public.ugc_v3_runs;
create trigger z_v3_clip_review_manifest after update of state on public.ugc_v3_runs for each row when (new.state='approved' and old.state is distinct from new.state) execute function public.ugc_v3_clip_review_manifest();
revoke all on function public.ugc_v3_clip_review_manifest() from public,anon,authenticated,service_role;

create or replace function public.ugc_v3_clip_setup() returns boolean language sql stable security definer set search_path='' as $$ select true $$;
revoke all on function public.ugc_v3_clip_authority_guard(),public.ugc_v3_clip_source_valid(uuid,jsonb,integer),public.ugc_v3_clip_package_valid(jsonb),public.ugc_v3_clip_authorize(uuid,uuid,jsonb,uuid),public.ugc_v3_clip_manifest(uuid,uuid,uuid),public.ugc_v3_clip_retryable(uuid,uuid,uuid),public.ugc_v3_clip_setup() from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_clip_authorize(uuid,uuid,jsonb,uuid),public.ugc_v3_clip_manifest(uuid,uuid,uuid),public.ugc_v3_clip_retryable(uuid,uuid,uuid),public.ugc_v3_clip_setup() to service_role;
commit;
