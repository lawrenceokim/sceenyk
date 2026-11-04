-- Manual after 092. Output resolution only: no task, media, price or approval backfill.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_approve_video(uuid,uuid,uuid)') is null then raise exception 'Apply 092 first'; end if;
 for t,c in select * from (values
  ('projects','id'),('projects','owner_user_id'),('projects','title'),('projects','category'),('projects','prompt'),
  ('projects','aspect_ratio'),('projects','duration'),('projects','visual_style'),('projects','tone'),('projects','creation_type'),('projects','ugc_type'),('projects','deleted_at'),
  ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),('ugc_v3_projects','logical_job_id'),
  ('ugc_v3_packages','document'),('ugc_v3_packages','project_id'),('ugc_v3_packages','package_hash'),
  ('ugc_v3_quotes','document'),('ugc_v3_run_authorizations','document')) v(t,c) loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c)
   then raise exception 'Verify resolution prerequisite %.%',t,c; end if;
 end loop;
end $$;
alter table public.projects add column if not exists video_resolution text not null default '480p';
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects'
   and column_name='video_resolution' and data_type='text' and is_nullable='NO') then raise exception 'Verify projects.video_resolution contract'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_video_resolution_check') then
  alter table public.projects add constraint projects_video_resolution_check check(video_resolution in ('480p','720p','1080p'));
 end if;
end $$;

-- Keep every existing 480p source hash byte-for-byte compatible. Reference and
-- Storyboard creative hashes are unchanged; only frozen output work becomes stale.
create or replace function public.ugc_v3_brief_hash(p_project uuid) returns text language sql stable set search_path='' as $$
 select public.ugc_package_digest('sceenyk-v3-project-brief',jsonb_build_object('prompt',p.prompt,'category',p.category,
  'aspectRatio',p.aspect_ratio,'duration',p.duration,'visualStyle',p.visual_style,'tone',p.tone,
  'creationType',p.creation_type,'ugcType',p.ugc_type)||case when p.video_resolution='480p' then '{}'::jsonb else jsonb_build_object('videoResolution',p.video_resolution) end)
 from public.projects p where p.id=p_project and p.deleted_at is null;
$$;
create or replace function public.ugc_v3_create_project(p_owner uuid,p_project uuid,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ugc_v3_projects; output_resolution text:=coalesce(p_fields->'settings'->>'resolution','480p'); begin
 if output_resolution not in ('480p','720p','1080p') then raise exception 'V3_RESOLUTION_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,76));
 select * into r from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner;
 if found then return to_jsonb(r); end if;
 if exists(select 1 from public.projects where id=p_project) then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type,video_resolution)
 values(p_project,p_owner,p_fields->>'title',p_fields->>'category',p_fields->>'prompt',p_fields->'settings'->>'aspectRatio',
  p_fields->'settings'->>'duration',p_fields->'settings'->>'visualStyle',p_fields->'settings'->>'tone','ugc',p_fields->>'ugcType',output_resolution);
 insert into public.ugc_v3_projects(project_id,owner_user_id,logical_job_id) values(p_project,p_owner,gen_random_uuid()) returning * into r;
 return to_jsonb(r);
end $$;

-- Narrow, verified substitutions retain all current lease, cleanup, hash,
-- idempotency, pricing, owner and review guards and their original function ACLs.
-- Refuse an unexpected installed definition instead of weakening it silently.
do $$ declare signature text; old_guard text; new_guard text; definition text; begin
 for signature,old_guard,new_guard in select * from (values
 ('public.ugc_v3_runtime_action(uuid,uuid,text,jsonb)',
  $a$d:=p_payload->'input';$a$,
  $a$d:=p_payload->'input';
  if d->>'resolution' is null or d->>'resolution' not in ('480p','720p','1080p') or d->>'resolution' is distinct from
   (select video_resolution from public.projects where id=p_project and owner_user_id=p_owner and deleted_at is null) then raise exception 'V3_RESOLUTION_BINDING_INVALID'; end if;$a$),
 ('public.ugc_v3_write(uuid,uuid,text,jsonb)',
  $a$d:=p_payload->'input';$a$,
  $a$d:=p_payload->'input';
  if d->>'resolution' is null or d->>'resolution' not in ('480p','720p','1080p') or d->>'resolution' is distinct from
   (select video_resolution from public.projects where id=p_project and owner_user_id=p_owner and deleted_at is null) then raise exception 'V3_RESOLUTION_BINDING_INVALID'; end if;$a$),
 ('public.ugc_v3_runtime_action(uuid,uuid,text,jsonb)',
  $a$d->>'resolution' is distinct from '480p'$a$,
  $a$(d->>'resolution' is null or d->>'resolution' not in ('480p','720p','1080p') or d->>'resolution' is distinct from pkg.document->'source'->>'resolution' or d->>'resolution' is distinct from seg->'body'->>'resolution'
   or (pkg.document->'pricing'->>'source'='manual_provider_estimate' and exists(select 1 from jsonb_array_elements(pkg.document->'segments') plan
    where coalesce(plan->'estimate'->'pricing'->>'resolution','480p') is distinct from pkg.document->'source'->>'resolution')))$a$),
 ('public.ugc_v3_write(uuid,uuid,text,jsonb)',
  $a$d->>'resolution' is distinct from '480p'$a$,
  $a$(d->>'resolution' is null or d->>'resolution' not in ('480p','720p','1080p'))$a$),
 ('public.ugc_v3_runtime_action(uuid,uuid,text,jsonb)',
  $a$if pkg.id is null or auth.id is null or seg is null or not public.ugc_v3_runtime_current(target)$a$,
  $a$if d->'body'->>'resolution' is distinct from pkg.document->'source'->>'resolution'
   or auth.document->>'resolution' is distinct from pkg.document->'source'->>'resolution'
   or pkg.id is null or auth.id is null or seg is null or not public.ugc_v3_runtime_current(target)$a$),
 ('public.ugc_v3_local_quote_guard()',
  $a$if seg is null or s is null or rate is null$a$,
  $a$if seg->'body'->>'resolution' is distinct from p.document->'source'->>'resolution'
   or coalesce(s->>'resolution','480p') is distinct from p.document->'source'->>'resolution'
   or seg is null or s is null or rate is null$a$)
 ) v(signature,old_guard,new_guard) loop
  if to_regprocedure(signature) is null then raise exception 'Verify resolution function %',signature; end if;
  select pg_get_functiondef(to_regprocedure(signature)) into definition;
  if position(new_guard in definition)>0 then continue; end if;
  if position(old_guard in definition)=0 or (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard)<>1
   then raise exception 'Unexpected resolution guard in %',signature; end if;
  execute replace(definition,old_guard,new_guard);
 end loop;
end $$;
commit;
