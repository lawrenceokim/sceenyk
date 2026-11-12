-- Manual after 087. V3 sheet currentness and explicitly confirmed sheet cleanup only.
-- No data backfill, provider/task execution, or V1/V2 changes. Transactional/rerunnable.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_video_setup()') is null then raise exception 'Apply 087 first'; end if;
 if to_regprocedure('public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb)') is null
 or to_regprocedure('public.ugc_v3_preserve_approved_reference()') is null then raise exception 'Verify V3 reference cleanup setup first'; end if;
 for t,c in select * from (values
 ('projects','id'),('projects','deleted_at'),('projects','title'),('projects','prompt'),('projects','aspect_ratio'),('projects','duration'),('projects','visual_style'),('projects','tone'),('projects','category'),('projects','ugc_type'),
 ('project_assets','id'),('project_assets','project_id'),('project_assets','studio_role'),('project_assets','upload_status'),('project_assets','removed_from_draft'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','version'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','task_id'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),
 ('ugc_v3_reference_deletions','id'),('ugc_v3_reference_deletions','project_id'),('ugc_v3_reference_deletions','kind'),('ugc_v3_reference_deletions','artifact_version'),('ugc_v3_reference_deletions','state'),('ugc_v3_reference_deletions','mode'),('ugc_v3_reference_deletions','asset'),('ugc_v3_reference_deletions','source_task_id'),
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify sheet dependency prerequisite %.%',t,c; end if;
 end loop;
end $$;

create or replace function public.ugc_v3_artifact_current(p_artifact uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.ugc_v3_artifacts; ref public.ugc_v3_artifacts; kinds text[]; k text; ids jsonb:='[]'; brief jsonb; begin
 select * into a from public.ugc_v3_artifacts where id=p_artifact;
 if not found or a.kind='joined' or a.rejected_at is not null or
 exists(select 1 from public.ugc_v3_reference_deletions where id=a.id and state='prepared') or
 a.version<=coalesce((select max(artifact_version) from public.ugc_v3_reference_deletions where project_id=a.project_id and kind=a.kind and state='completed'),0) or
 exists(select 1 from public.ugc_v3_artifacts n where n.project_id=a.project_id and n.kind=a.kind and n.version>a.version) then return false; end if;
 if a.kind in ('character','product') then
  -- Keep the complete generation snapshot unchanged, but only Style and the
  -- original subject determine whether this generated sheet is still current.
  if a.document->'input'->'generationContext'->>'visualStyle' is null or
   a.document->'input'->'generationContext'->>'visualStyle' is distinct from public.ugc_v3_generation_context(a.project_id)->>'visualStyle' then return false; end if;
  return exists(select 1 from public.project_assets pa where pa.project_id=a.project_id and pa.id::text=a.document->'original'->>'id'
   and pa.studio_role=a.kind and pa.upload_status='uploaded' and not pa.removed_from_draft);
 end if;
 -- Location and all later dependencies retain their original complete-context rules.
 if a.document->'input'->'generationContext' is distinct from public.ugc_v3_generation_context(a.project_id) then return false; end if;
 kinds:=array['character'];
 if exists(select 1 from public.project_assets pa where pa.project_id=a.project_id and pa.studio_role='product' and pa.upload_status='uploaded' and not pa.removed_from_draft) then kinds:=array_append(kinds,'product'); end if;
 if a.kind='storyboard' then
  kinds:=array_append(kinds,'location');
  select jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,
   'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type) into brief from public.projects p where p.id=a.project_id and p.deleted_at is null;
  if a.document->'input'->>'briefHash' is distinct from public.ugc_package_digest('sceenyk-v3-brief',brief) then return false; end if;
 end if;
 foreach k in array kinds loop
  select * into ref from public.ugc_v3_artifacts where project_id=a.project_id and kind=k order by version desc limit 1;
  if not found or ref.approved_at is null or not public.ugc_v3_artifact_current(ref.id) then return false; end if;
  ids:=ids||jsonb_build_array(ref.id::text);
 end loop;
 return a.document->'input'->'references' is not distinct from ids;
end $$;

create or replace function public.ugc_v3_preserve_approved_reference() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.ugc_v3_artifacts; begin
 select * into a from public.ugc_v3_artifacts where id=new.id and project_id=new.project_id and approved_at is not null;
 if not found then return new; end if;
 -- Existing discard/background-cleanup RPCs still refuse approved history.
 -- Only the exact latest Character/Product target may enter the confirmed,
 -- held-replacement coordinator. A current approval cannot be casually rejected.
 if a.kind not in ('character','product') or new.kind is distinct from a.kind or new.artifact_version is distinct from a.version
 or new.asset is distinct from a.document->'asset' or new.source_task_id is distinct from a.task_id
 or exists(select 1 from public.ugc_v3_artifacts n where n.project_id=a.project_id and n.kind=a.kind and n.version>a.version)
 or (new.mode is distinct from 'regenerate' and public.ugc_v3_artifact_current(a.id)) then raise exception 'V3_APPROVED_REFERENCE_PRESERVED'; end if;
 return new;
end $$;

-- Old clients must not preserve stale approved sheets through the retired
-- history-preserving RPC. The current server uses permanent deletion for all
-- confirmed Character/Product replacements.
create or replace function public.ugc_v3_regenerate_approved_reference(p_owner uuid,p_project uuid,p_id uuid,p_version integer,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.ugc_v3_artifacts; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 select * into a from public.ugc_v3_artifacts where id=p_id and project_id=p_project and version=p_version and kind in ('character','product')
  and approved_at is not null and rejected_at is null for update;
 if not found or exists(select 1 from public.ugc_v3_artifacts n where n.project_id=p_project and n.kind=a.kind and n.version>a.version)
   or p_input->>'previous' is distinct from p_id::text then raise exception 'V3_REFERENCE_CHANGED_RECONFIRM'; end if;
 if not public.ugc_v3_artifact_current(a.id) then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
 if exists(select 1 from public.ugc_v3_reference_deletions where project_id=p_project and kind=a.kind and state='prepared') then raise exception 'V3_REFERENCE_CLEANUP_PENDING'; end if;
 perform public.ugc_v3_reference_input_current(p_owner,p_project,a.kind,p_input);
 return public.ugc_v3_runtime_action(p_owner,p_project,'enqueue',jsonb_build_object('kind',a.kind,'requestKey','approved-reference-replacement:'||p_id,'input',p_input));
end $$;
revoke all on function public.ugc_v3_artifact_current(uuid),public.ugc_v3_preserve_approved_reference(),public.ugc_v3_regenerate_approved_reference(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_artifact_current(uuid),public.ugc_v3_regenerate_approved_reference(uuid,uuid,uuid,integer,jsonb) to service_role;
commit;
