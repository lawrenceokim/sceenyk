-- Manual after 076/077. Canonical Studio context/currentness only; no data rewrite or provider activation.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_runtime_current(uuid)') is null then raise exception 'Apply 077 first'; end if;
 -- Verify every column used below before installing any trigger.
 for t,c in select * from (values
 ('projects','id'),('projects','title'),('projects','prompt'),('projects','visual_style'),('projects','creation_type'),('projects','ugc_type'),('projects','tone'),('projects','category'),('projects','aspect_ratio'),('projects','duration'),('projects','deleted_at'),
 ('project_assets','id'),('project_assets','project_id'),('project_assets','studio_role'),('project_assets','upload_status'),('project_assets','removed_from_draft'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','version'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),
 ('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','created_at'),
 ('ugc_v3_sources','project_id'),('ugc_v3_sources','revision'),('ugc_v3_sources','input'),('ugc_v3_sources','project_input_hash'),('ugc_v3_sources','created_at'),
 ('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','source_revision')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify V3 Studio prerequisite %.%',t,c; end if;
 end loop;
end $$;
create or replace function public.ugc_v3_generation_context(p_project uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',1,'visualStyle',p.visual_style,'creationType',p.creation_type,'type',p.ugc_type,
 'instructions',p.prompt,'tone',p.tone,'category',p.category) from public.projects p where p.id=p_project and p.deleted_at is null;
$$;
create or replace function public.ugc_v3_artifact_current(p_artifact uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.ugc_v3_artifacts; ref public.ugc_v3_artifacts; kinds text[]; k text; ids jsonb:='[]'; brief jsonb; begin
 select * into a from public.ugc_v3_artifacts where id=p_artifact;
 if not found or a.kind='joined' or a.rejected_at is not null or
 a.document->'input'->'generationContext' is distinct from public.ugc_v3_generation_context(a.project_id) or
 exists(select 1 from public.ugc_v3_artifacts n where n.project_id=a.project_id and n.kind=a.kind and n.version>a.version) then return false; end if;
 if a.kind in ('character','product') then
 return exists(select 1 from public.project_assets pa where pa.project_id=a.project_id and pa.id::text=a.document->'original'->>'id'
   and pa.studio_role=a.kind and pa.upload_status='uploaded' and not pa.removed_from_draft);
 end if;
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
-- Existing packages retain their hashes/versions; currentness derives from saved context and active Sources.
create or replace function public.ugc_v3_runtime_current(p_package uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ugc_v3_packages p join public.ugc_v3_sources s on s.project_id=p.project_id and s.revision=p.source_revision
 where p.id=p_package and s.revision=(select max(x.revision) from public.ugc_v3_sources x where x.project_id=p.project_id)
 and s.project_input_hash=public.ugc_v3_brief_hash(p.project_id)
 and not exists(select 1 from public.ugc_v3_tasks t where t.project_id=p.project_id and t.kind in ('character','product','location','storyboard') and t.created_at>s.created_at)
 and not exists(select 1 from public.ugc_v3_artifacts latest where latest.project_id=p.project_id and latest.kind in ('character','product','location') and (latest.kind<>'product' or exists(select 1 from public.project_assets pa where pa.project_id=p.project_id and pa.studio_role='product' and pa.upload_status='uploaded' and not pa.removed_from_draft))
   and not exists(select 1 from public.ugc_v3_artifacts n where n.project_id=latest.project_id and n.kind=latest.kind and n.version>latest.version)
   and not exists(select 1 from jsonb_array_elements(s.input->'references') r where r->>'id'=latest.id::text))
 and not exists(select 1 from jsonb_array_elements(s.input->'references') r where not exists(
   select 1 from public.ugc_v3_artifacts a where a.project_id=p.project_id and a.id=(r->>'id')::uuid and a.approved_at is not null and a.rejected_at is null
   and public.ugc_v3_artifact_current(a.id) and a.version=(r->>'version')::integer and a.document->'asset'->>'sha256'=r->>'sha256'
   and not exists(select 1 from public.ugc_v3_artifacts newer where newer.project_id=a.project_id and newer.kind=a.kind and newer.version>a.version)))
 and exists(select 1 from public.ugc_v3_artifacts b where b.id=(s.input->'storyboard'->>'id')::uuid and b.project_id=p.project_id and b.approved_at is not null and b.rejected_at is null
   and public.ugc_v3_artifact_current(b.id) and b.version=(s.input->'storyboard'->>'version')::integer
   and b.document->'input'->'references' is not distinct from (select jsonb_agg(r->>'id' order by ord) from jsonb_array_elements(s.input->'references') with ordinality a(r,ord))
   and not exists(select 1 from public.ugc_v3_artifacts n where n.project_id=b.project_id and n.kind='storyboard' and n.version>b.version)))
$$;

create or replace function public.ugc_v3_studio_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; begin
 -- Serialize with normal Properties saves. Never touches historical V1/V2 rows.
 perform 1 from public.projects where id=new.project_id for update;
 if tg_table_name='ugc_v3_artifacts' then
  if new.approved_at is not null and not public.ugc_v3_artifact_current(new.id) then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
 elsif tg_table_name='ugc_v3_sources' then
  for r in select value from jsonb_array_elements(new.input->'references') loop
   if not public.ugc_v3_artifact_current((r->>'id')::uuid) then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
  end loop;
  if not public.ugc_v3_artifact_current((new.input->'storyboard'->>'id')::uuid) then raise exception 'STORYBOARD_STALE_REGENERATE'; end if;
 elsif tg_table_name='ugc_v3_tasks' and new.provider_started and not old.provider_started and new.kind in ('character','product','location','storyboard') then
  if new.input->'generationContext' is distinct from public.ugc_v3_generation_context(new.project_id) then raise exception 'V3_CREATIVE_INPUT_STALE'; end if;
  if new.kind in ('character','product') and not exists(select 1 from public.project_assets pa where pa.project_id=new.project_id
   and pa.id::text=new.input->>'originalId' and pa.studio_role=new.kind and pa.upload_status='uploaded' and not pa.removed_from_draft) then raise exception 'CURRENT_STUDIO_REFERENCE_REQUIRED'; end if;
  for r in select value from jsonb_array_elements(coalesce(new.input->'references','[]')) loop
   if not public.ugc_v3_artifact_current((r#>>'{}')::uuid) then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
  end loop;
 end if;
 return new;
end $$;
drop trigger if exists ugc_v3_studio_approval on public.ugc_v3_artifacts;
create trigger ugc_v3_studio_approval before update of approved_at on public.ugc_v3_artifacts for each row execute function public.ugc_v3_studio_guard();
drop trigger if exists ugc_v3_studio_source on public.ugc_v3_sources;
create trigger ugc_v3_studio_source before insert on public.ugc_v3_sources for each row execute function public.ugc_v3_studio_guard();
drop trigger if exists ugc_v3_studio_intent on public.ugc_v3_tasks;
create trigger ugc_v3_studio_intent before update of provider_started on public.ugc_v3_tasks for each row execute function public.ugc_v3_studio_guard();
revoke all on function public.ugc_v3_generation_context(uuid),public.ugc_v3_artifact_current(uuid),public.ugc_v3_studio_guard() from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_generation_context(uuid),public.ugc_v3_artifact_current(uuid) to service_role;
commit;
