-- Manual after 079. Atomic V3 Character/Product supersession + enqueue; never deletes media.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_retire_reference_task(uuid,uuid,uuid)') is null then raise exception 'Apply 079 first'; end if;
 for t,c in select * from (values
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','status'),('ugc_v3_tasks','request_key'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','created_at'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','version'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),
 ('projects','id'),('projects','title'),('projects','prompt'),('projects','aspect_ratio'),('projects','duration'),('projects','visual_style'),('projects','tone'),('projects','category'),('projects','ugc_type'),('projects','deleted_at'),
 ('project_assets','id'),('project_assets','owner_user_id'),('project_assets','project_id'),('project_assets','studio_role'),('project_assets','reference_name'),('project_assets','upload_status'),('project_assets','removed_from_draft'),('project_assets','verified_etag'),('project_assets','size_bytes'),('project_assets','mime_type')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify V3 regeneration prerequisite %.%',t,c; end if;
 end loop;
end $$;
create or replace function public.ugc_v3_regenerate_reference(p_owner uuid,p_project uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text:=p_payload->>'kind'; d jsonb:=p_payload->'input'; prior public.ugc_v3_artifacts; last_task public.ugc_v3_tasks; brief jsonb;
begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 if k is null or k not in ('character','product') or jsonb_typeof(d) is distinct from 'object'
   or coalesce(p_payload->>'requestKey','')='' then raise exception 'INVALID_REFERENCE_REQUEST'; end if;
 -- Same request, including a delayed duplicate after completion, returns its current state.
 if exists(select 1 from public.ugc_v3_tasks where project_id=p_project and request_key=p_payload->>'requestKey') then
  return public.ugc_v3_runtime_read(p_owner,p_project);
 end if;
 if exists(select 1 from public.ugc_v3_tasks where project_id=p_project and kind=k and status in ('queued','running','reconciliation_required')) then
  raise exception 'V3_CREATIVE_REQUEST_ALREADY_ACTIVE';
 end if;
 select * into last_task from public.ugc_v3_tasks where project_id=p_project and kind=k order by created_at desc,id desc limit 1;
 if last_task.status='failed' and last_task.provider_started then
  raise exception 'V3_REFERENCE_OUTCOME_REQUIRES_REVIEW';
 end if;
 select * into prior from public.ugc_v3_artifacts where project_id=p_project and kind=k order by version desc limit 1;
 -- Another request completed since the caller read its snapshot. Do not generate an accidental extra version.
 if prior.id::text is distinct from d->>'previous' then return public.ugc_v3_runtime_read(p_owner,p_project); end if;
 select jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,
  'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type) into brief from public.projects p where p.id=p_project;
 if d->'generationContext' is distinct from public.ugc_v3_generation_context(p_project)
  or d->>'briefHash' is distinct from public.ugc_package_digest('sceenyk-v3-brief',brief) then raise exception 'V3_CREATIVE_INPUT_STALE'; end if;
 if d->>'provider' is distinct from 'openai' or coalesce(d->>'model','')=''
  or jsonb_typeof(d->'referencePrompt'->'version') is distinct from 'number' or (d->'referencePrompt'->>'version')::integer<2
  or coalesce(d->'referencePrompt'->>'prompt','')=''
  or d->'referencePrompt'->>'hash' is distinct from public.ugc_package_digest('sceenyk-v3-reference-sheet-prompt',d->'referencePrompt'->'prompt')
  then raise exception 'V3_REFERENCE_PROMPT_OUTDATED_REGENERATE'; end if;
 -- Serialize source/name edits with the exact uploaded version being frozen.
 perform 1 from public.project_assets a where a.project_id=p_project and a.owner_user_id=p_owner and a.id::text=d->>'originalId'
  and a.studio_role=k and a.upload_status='uploaded' and not a.removed_from_draft
  and d->'referenceSubject'->>'role'=k and d->'referenceSubject'->>'originalId'=a.id::text
  and d->'referenceSubject'->>'name'=coalesce(a.reference_name,'')
  and d->'referenceSource'->>'id'=a.id::text and d->'referenceSource'->>'etag'=a.verified_etag
  and d->'referenceSource'->>'sizeBytes'=a.size_bytes::text and d->'referenceSource'->>'mimeType'=a.mime_type for update;
 if not found then raise exception 'V3_REFERENCE_SOURCE_STALE'; end if;
 -- These calls share this transaction/project lock. An enqueue failure rolls the review change back.
 if prior.id is not null and prior.approved_at is null and prior.rejected_at is null then
  perform public.ugc_v3_runtime_action(p_owner,p_project,'review_artifact',jsonb_build_object('id',prior.id,'decision','reject'));
 end if;
 return public.ugc_v3_runtime_action(p_owner,p_project,'enqueue',p_payload);
end $$;
revoke all on function public.ugc_v3_regenerate_reference(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_regenerate_reference(uuid,uuid,jsonb) to service_role;
commit;
