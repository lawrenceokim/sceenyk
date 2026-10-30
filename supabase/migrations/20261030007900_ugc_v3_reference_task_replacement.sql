-- Manual after 078. Provider-free retirement of outdated, never-submitted V3 reference work.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_generation_context(uuid)') is null then raise exception 'Apply 078 first'; end if;
 for t,c in select * from (values
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','status'),('ugc_v3_tasks','input'),
 ('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','output'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','error_code'),
 ('ugc_v3_artifacts','task_id'),('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document'),
 ('projects','id'),('projects','title'),('projects','prompt'),('projects','aspect_ratio'),('projects','duration'),('projects','visual_style'),('projects','tone'),('projects','category'),('projects','ugc_type'),('projects','deleted_at'),
 ('project_assets','id'),('project_assets','project_id'),('project_assets','studio_role'),('project_assets','upload_status'),('project_assets','removed_from_draft'),('project_assets','reference_name')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify V3 replacement prerequisite %.%',t,c; end if;
 end loop;
end $$;
create or replace function public.ugc_v3_retire_reference_task(p_owner uuid,p_project uuid,p_task uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; brief jsonb; original_current boolean; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 select * into t from public.ugc_v3_tasks where id=p_task and project_id=p_project for update;
 if not found or t.kind not in ('character','product','location') then raise exception 'V3_REFERENCE_REPLACEMENT_UNAVAILABLE'; end if;
 if t.status='failed' and t.error_code='V3_REFERENCE_REQUEST_SUPERSEDED' then return true; end if;
 if t.provider_started or t.output is not null or exists(select 1 from public.ugc_v3_artifacts where task_id=t.id)
   or not (t.status='queued' or t.status='running' and t.lease_until<now()) then raise exception 'V3_REFERENCE_REPLACEMENT_UNSAFE'; end if;
 select jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,
 'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type) into brief from public.projects p where p.id=p_project;
 original_current:=t.kind='location' or exists(select 1 from public.project_assets a where a.project_id=p_project
   and a.id::text=t.input->>'originalId' and a.studio_role=t.kind and a.upload_status='uploaded' and not a.removed_from_draft
   and (not(t.input ? 'referenceSubject') or coalesce(a.reference_name,'')=t.input->'referenceSubject'->>'name'));
 if t.input->'generationContext' is not distinct from public.ugc_v3_generation_context(p_project)
   and t.input->>'briefHash' is not distinct from public.ugc_package_digest('sceenyk-v3-brief',brief)
   and coalesce(t.input->>'provider','openai')='openai' and original_current then raise exception 'V3_REFERENCE_REQUEST_STILL_CURRENT'; end if;
 update public.ugc_v3_tasks set status='failed',error_code='V3_REFERENCE_REQUEST_SUPERSEDED',lease_token=null,lease_until=null where id=t.id;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document)
 values(p_project,t.id,'reference_request_superseded',jsonb_build_object('providerStarted',false,'reason','saved_reference_inputs_changed'));
 return true;
end $$;
revoke all on function public.ugc_v3_retire_reference_task(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_retire_reference_task(uuid,uuid,uuid) to service_role;
commit;
