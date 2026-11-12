-- Product Phase 2 M4. Manual after 096. Planning only; no historical rewrites.
begin;
do $$ declare t text; c text; duration_contract text; begin
 if to_regprocedure('public.studio_mode_read(uuid,uuid)') is null
 or to_regprocedure('public.ugc_v3_source_cast_current(uuid,jsonb)') is null
 or to_regprocedure('public.ugc_v3_location_input_current(uuid,jsonb)') is null then raise exception 'Apply 094-096 before 097'; end if;
 for t,c in select * from (values
 ('projects','id'),('projects','owner_user_id'),('projects','studio_mode'),('projects','duration'),('projects','creation_type'),('projects','title'),('projects','prompt'),('projects','aspect_ratio'),('projects','visual_style'),('projects','tone'),('projects','category'),('projects','ugc_type'),('projects','deleted_at'),
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','provider_started'),
 ('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),
 ('ugc_v3_sources','project_id'),('ugc_v3_sources','input'),('ugc_v3_runs','project_id'),('ugc_v3_runs','package_id'),('ugc_v3_runs','intent'),
 ('ugc_v3_packages','id'),('ugc_v3_packages','document')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify M4 prerequisite %.%',t,c; end if;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_duration_check' and contype='c') then raise exception 'Inspect projects_duration_check before 097'; end if;
 select pg_get_constraintdef(oid) into duration_contract from pg_constraint where conrelid='public.projects'::regclass and conname='projects_duration_check';
 if duration_contract not in (
  $contract$CHECK ((duration = ANY (ARRAY['5'::text, '10'::text, '15'::text, '30'::text])))$contract$,
  $contract$CHECK ((duration = ANY (ARRAY['5'::text, '10'::text, '15'::text, '20'::text, '30'::text, '40'::text, '50'::text, '60'::text, '70'::text, '80'::text, '90'::text, '100'::text, '110'::text, '120'::text])))$contract$) then raise exception 'Inspect unknown projects duration contract before 097'; end if;
end $$;
alter table public.projects drop constraint projects_duration_check;
alter table public.projects add constraint projects_duration_check check(duration in ('5','10','15','20','30','40','50','60','70','80','90','100','110','120'));

-- Alphabetically follows studio_mode_inherit. Unchanged Pro values remain
-- saveable after a confirmed Basic switch; only new selections need Pro.
create or replace function public.ugc_v3_duration_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.duration in ('20','40','50','60','70','80','90','100','110','120') then
  if new.creation_type<>'ugc' then raise exception 'V3_PRO_DURATION_REQUIRED'; end if;
  if tg_op='INSERT' then
   if new.studio_mode<>'pro' then raise exception 'V3_PRO_DURATION_REQUIRED'; end if;
  elsif new.duration is distinct from old.duration and new.studio_mode<>'pro' then raise exception 'V3_PRO_DURATION_REQUIRED';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists z_v3_duration_guard on public.projects;
create trigger z_v3_duration_guard before insert or update of duration,creation_type on public.projects for each row execute function public.ugc_v3_duration_guard();

-- V3's atomic create inserts projects before its registry row. Validate registry
-- ownership at transaction end without enrolling historical projects.
create or replace function public.ugc_v3_duration_enrollment_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.duration in ('20','40','50','60','70','80','90','100','110','120') and not exists(
  select 1 from public.ugc_v3_projects where project_id=new.id and owner_user_id=new.owner_user_id) then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 return new;
end $$;
drop trigger if exists z_v3_duration_enrollment on public.projects;
create constraint trigger z_v3_duration_enrollment after insert or update on public.projects deferrable initially deferred for each row execute function public.ugc_v3_duration_enrollment_guard();

create or replace function public.ugc_v3_story_clip_boundaries(total integer) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='[]'; start_ms integer:=0; n integer:=1; end_ms integer; begin
 if total not in (10000,20000,30000,40000,50000,60000,70000,80000,90000,100000,110000,120000) then raise exception 'V3_PRO_DURATION_INVALID'; end if;
 while start_ms<total loop
  end_ms:=least(total,start_ms+30000);
  result:=result||jsonb_build_array(jsonb_build_object('id','clip-'||n,'number',n,'startMs',start_ms,'endMs',end_ms,'durationMs',end_ms-start_ms));
  n:=n+1; start_ms:=end_ms;
 end loop;
 return result;
end $$;

create or replace function public.ugc_v3_validate_connected_story(d jsonb,total integer) returns boolean language plpgsql immutable set search_path='' as $$
declare bounds jsonb; b jsonb; clip jsonb; shot jsonb; timed_window jsonb; n integer:=0; shot_number integer:=0; end_ms integer:=0; last_state text; seen text[]:='{}'; begin
 if total is null or total<=30000 or d->>'version' is distinct from 'director-storyboard-connected-v1' or (d->>'durationMs')::integer is distinct from total then return false; end if;
 bounds:=public.ugc_v3_story_clip_boundaries(total);
 if jsonb_typeof(d->'clips') is distinct from 'array' or jsonb_typeof(d->'scenes') is distinct from 'array' or jsonb_array_length(d->'clips')<>jsonb_array_length(bounds) then return false; end if;
 for b in select value from jsonb_array_elements(bounds) loop
  clip:=d->'clips'->n;
  if (clip - array['purpose','continuityIn','continuityOut','audioContinuity']) is distinct from b
   or nullif(btrim(clip->>'purpose'),'') is null or nullif(btrim(clip->>'continuityIn'),'') is null
   or nullif(btrim(clip->>'continuityOut'),'') is null or nullif(btrim(clip->>'audioContinuity'),'') is null
   or (n>0 and clip->>'continuityIn' is distinct from last_state) then return false; end if;
  last_state:=clip->>'continuityOut'; n:=n+1;
 end loop;
 for shot in select value from jsonb_array_elements(d->'scenes') loop
  shot_number:=shot_number+1;
  select value into b from jsonb_array_elements(bounds) where value->>'id'=shot->>'clipId';
  if b is null or jsonb_typeof(shot->'startMs') is distinct from 'number' or jsonb_typeof(shot->'endMs') is distinct from 'number' or nullif(shot->>'id','') is null or shot->>'id'=any(seen) or (shot->>'number')::integer is distinct from shot_number
   or (shot->>'startMs')::integer is distinct from end_ms or (shot->>'endMs')::integer<=end_ms
   or (shot->>'startMs')::integer<(b->>'startMs')::integer or (shot->>'endMs')::integer>(b->>'endMs')::integer
   or (shot->>'startMs')::integer%1000<>0 or (shot->>'endMs')::integer%1000<>0
   or (shot->>'localStartMs')::integer is distinct from (shot->>'startMs')::integer-(b->>'startMs')::integer
   or (shot->>'localEndMs')::integer is distinct from (shot->>'endMs')::integer-(b->>'startMs')::integer then return false; end if;
  seen:=array_append(seen,shot->>'id');
  for timed_window in select value from jsonb_array_elements(coalesce(shot->'actions','[]')) union all select value from jsonb_array_elements(coalesce(shot->'speech','[]')) loop
   if jsonb_typeof(timed_window->'startMs') is distinct from 'number' or jsonb_typeof(timed_window->'endMs') is distinct from 'number' or (timed_window->>'startMs')::integer<(shot->>'startMs')::integer or (timed_window->>'endMs')::integer>(shot->>'endMs')::integer
    or (timed_window->>'endMs')::integer<=(timed_window->>'startMs')::integer then return false; end if;
  end loop;
  end_ms:=(shot->>'endMs')::integer;
 end loop;
 return coalesce(end_ms=total,false);
exception when others then return false;
end $$;

create or replace function public.ugc_v3_connected_story_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare total integer; mode text; source jsonb; begin
 -- Serialize admission/publication/review against mode and duration saves.
 select duration::integer*1000,studio_mode into total,mode from public.projects where id=new.project_id for update;
 if tg_table_name='ugc_v3_sources' then
  if (new.input->'storyboardContent'->>'durationMs')::integer>30000 then raise exception 'V3_MULTI_CLIP_PLANNING_ONLY'; end if;
 elsif tg_table_name='ugc_v3_runs' then
  select document->'source'->'storyboardContent' into source from public.ugc_v3_packages where id=new.package_id;
  if total>30000 or (source->>'durationMs')::integer>30000 then raise exception 'V3_MULTI_CLIP_PLANNING_ONLY'; end if;
 elsif tg_table_name='ugc_v3_tasks' then
  if new.kind='storyboard' and total=20000 and mode<>'pro' then raise exception 'V3_PRO_DURATION_REQUIRED'; end if;
  if new.kind='storyboard' and total>30000 then
   if mode<>'pro' then raise exception 'V3_PRO_DURATION_REQUIRED'; end if;
   if new.input->>'directorVersion' is distinct from 'connected-story-director-v1'
    or new.input->'clipBoundaries' is distinct from public.ugc_v3_story_clip_boundaries(total) then raise exception 'V3_CLIP_PLAN_INVALID'; end if;
  elsif new.kind in ('package','video','join') and total>30000 then raise exception 'V3_MULTI_CLIP_PLANNING_ONLY';
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
drop trigger if exists z_v3_connected_story_task on public.ugc_v3_tasks;
create trigger z_v3_connected_story_task before insert or update of provider_started on public.ugc_v3_tasks for each row execute function public.ugc_v3_connected_story_guard();
drop trigger if exists z_v3_connected_story_artifact on public.ugc_v3_artifacts;
create trigger z_v3_connected_story_artifact before insert or update of approved_at,document on public.ugc_v3_artifacts for each row execute function public.ugc_v3_connected_story_guard();
drop trigger if exists z_v3_connected_story_source on public.ugc_v3_sources;
create trigger z_v3_connected_story_source before insert on public.ugc_v3_sources for each row execute function public.ugc_v3_connected_story_guard();
drop trigger if exists z_v3_connected_story_run on public.ugc_v3_runs;
create trigger z_v3_connected_story_run before insert on public.ugc_v3_runs for each row execute function public.ugc_v3_connected_story_guard();

-- Reuse an already approved Location after a duration-only edit. Validate its
-- original hash and every other input; never rewrite the saved sheet or plan.
create or replace function public.ugc_v3_location_brief_current(p_project uuid,d jsonb,brief jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select d->>'briefHash'=public.ugc_package_digest('sceenyk-v3-brief',brief) or (
  d->>'briefHash'=public.ugc_package_digest('sceenyk-v3-brief',(d->'brief')-array['creation_type','video_resolution'])
  and ((d->'brief')-array['duration','creation_type','video_resolution'])=(brief-'duration')
  and exists(select 1 from public.ugc_v3_artifacts where project_id=p_project and kind='location' and document->'input'=d and approved_at is not null and rejected_at is null))
$$;
do $$ declare definition text; old_text text:=$patch$d->>'briefHash' is distinct from public.ugc_package_digest('sceenyk-v3-brief',brief)$patch$;
 new_text text:='not coalesce(public.ugc_v3_location_brief_current(p_project,d,brief),false)'; begin
 select pg_get_functiondef('public.ugc_v3_location_input_current(uuid,jsonb)'::regprocedure) into definition;
 if strpos(definition,new_text)>0 then null;
 elsif strpos(definition,old_text)>0 then execute replace(definition,old_text,new_text);
 else raise exception 'Inspect Location currentness contract before 097'; end if;
end $$;

revoke all on function public.ugc_v3_duration_guard(),public.ugc_v3_duration_enrollment_guard(),public.ugc_v3_connected_story_guard() from public,anon,authenticated,service_role;
revoke all on function public.ugc_v3_story_clip_boundaries(integer),public.ugc_v3_validate_connected_story(jsonb,integer),public.ugc_v3_location_brief_current(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ugc_v3_story_clip_boundaries(integer),public.ugc_v3_validate_connected_story(jsonb,integer),public.ugc_v3_location_brief_current(uuid,jsonb,jsonb) to service_role;
-- Existing table grants/RLS/realtime/financial/paid-request uniqueness stay intact.
commit;
