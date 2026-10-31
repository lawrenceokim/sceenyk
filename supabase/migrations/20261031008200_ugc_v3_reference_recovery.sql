-- Manual after 081. Provider-free recovery of the same intent, or an explicitly requested new attempt.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb)') is null then raise exception 'Apply 081 first'; end if;
 for t,c in select * from (values
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','status'),('ugc_v3_tasks','input'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','error_code'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','created_at'),('ugc_v3_tasks','available_at'),
 ('ugc_v3_runtime_events','id'),('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document'),
 ('projects','id'),('projects','deleted_at'),('project_assets','id'),('project_assets','project_id'),('project_assets','studio_role'),('project_assets','upload_status'),('project_assets','removed_from_draft')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify V3 recovery prerequisite %.%',t,c; end if;
 end loop;
end $$;
create or replace function public.ugc_v3_recover_reference_task(p_owner uuid,p_project uuid,p_task uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 select * into t from public.ugc_v3_tasks where id=p_task and project_id=p_project and kind in ('character','product','location') for update;
 if not found then raise exception 'V3_REFERENCE_RECOVERY_UNAVAILABLE'; end if;
 if t.input->>'recoveryOnly'='true' and t.status in ('queued','running') then return public.ugc_v3_runtime_read(p_owner,p_project); end if;
 if t.status not in ('failed','reconciliation_required') or t.lease_until>now() or t.input->>'referenceCleanupHold'='true' then raise exception 'V3_REFERENCE_RECOVERY_UNAVAILABLE'; end if;
 if t.input->'generationContext' is distinct from public.ugc_v3_generation_context(p_project) then raise exception 'V3_CREATIVE_INPUT_STALE'; end if;
 if t.kind in ('character','product') and not exists(select 1 from public.project_assets a where a.project_id=p_project and a.id::text=t.input->>'originalId'
  and a.studio_role=t.kind and a.upload_status='uploaded' and not a.removed_from_draft) then raise exception 'CURRENT_STUDIO_REFERENCE_REQUIRED'; end if;
 -- Preserve task ID/request key/provider_started/creative snapshot and the original failure in an event.
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,t.id,'reference_recovery_requested',jsonb_build_object('originalErrorCode',t.error_code,'providerStarted',t.provider_started,'newProviderRequest',false));
 update public.ugc_v3_tasks set input=input||jsonb_build_object('recoveryOnly',true),status='queued',error_code=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
 return public.ugc_v3_runtime_read(p_owner,p_project);
end $$;

create or replace function public.ugc_v3_replace_unusable_reference_task(p_owner uuid,p_project uuid,p_task uuid,p_payload jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 select * into t from public.ugc_v3_tasks where id=p_task and project_id=p_project and kind in ('character','product') for update;
 if not found then raise exception 'V3_REFERENCE_REQUEST_CHANGED'; end if;
 if t.id is distinct from (select id from public.ugc_v3_tasks where project_id=p_project and kind=t.kind order by created_at desc,id desc limit 1) then return false; end if;
 if t.status not in ('failed','reconciliation_required') or t.lease_until>now() or t.input->>'referenceCleanupHold'='true' then raise exception 'V3_REFERENCE_OUTCOME_REQUIRES_REVIEW'; end if;
 if p_payload->>'kind' is distinct from t.kind or p_payload->'input'->>'previousTask' is distinct from t.id::text then raise exception 'V3_REFERENCE_REQUEST_CHANGED'; end if;
 perform public.ugc_v3_reference_input_current(p_owner,p_project,t.kind,p_payload->'input');
 -- The server verifies unusable/outdated local output first. This is explicit new generation, never Recover.
 update public.ugc_v3_tasks set status='failed',lease_token=null,lease_until=null where id=t.id;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,t.id,'reference_new_attempt_requested',
  jsonb_build_object('originalStatus',t.status,'originalErrorCode',t.error_code,'providerStarted',t.provider_started,'providerOutcomeUnknown',t.provider_started,'newProviderRequest',true));
 if p_payload->>'enqueue'='true' then
  perform public.ugc_v3_regenerate_reference(p_owner,p_project,p_payload);
 end if;
 return true;
end $$;
revoke all on function public.ugc_v3_recover_reference_task(uuid,uuid,uuid),public.ugc_v3_replace_unusable_reference_task(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_recover_reference_task(uuid,uuid,uuid),public.ugc_v3_replace_unusable_reference_task(uuid,uuid,uuid,jsonb) to service_role;

-- Retain failure evidence even if the local disk cannot persist a response/diagnostic file.
create or replace function public.ugc_v3_record_reference_diagnostic(p_task uuid,p_token uuid,p_document jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; d jsonb; begin
 select * into t from public.ugc_v3_tasks where id=p_task and lease_token=p_token and status='running' and lease_until>now() and kind in ('character','product','location') for update;
 if not found then return false; end if;
 d:=jsonb_build_object('taskId',t.id,
  'stage',case when p_document->>'stage' ~ '^[a-z_]{1,50}$' then p_document->>'stage' else 'unknown' end,
  'httpStatus',case when jsonb_typeof(p_document->'httpStatus')='number' and (p_document->>'httpStatus')::numeric between 100 and 599 then p_document->'httpStatus' else 'null'::jsonb end,
  'requestId',case when p_document->>'requestId' ~ '^[a-zA-Z0-9_-]{1,200}$' then p_document->>'requestId' else null end,
  'errorCode',case when p_document->>'errorCode' ~ '^[A-Z0-9_]{1,100}$' then p_document->>'errorCode' else null end,
  'providerCode',case when p_document->>'providerCode' ~ '^[a-zA-Z0-9_-]{1,100}$' then p_document->>'providerCode' else null end);
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(t.project_id,t.id,'reference_diagnostic',d);
 return true;
end $$;
revoke all on function public.ugc_v3_record_reference_diagnostic(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_record_reference_diagnostic(uuid,uuid,jsonb) to service_role;

create or replace function public.ugc_v3_runtime_read(p_owner uuid,p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner) then return null; end if;
 return public.ugc_v3_read(p_owner,p_project)||jsonb_build_object(
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by created_at) from public.ugc_v3_tasks t where project_id=p_project),'[]'),
 'artifacts',coalesce((select jsonb_agg(to_jsonb(a) order by version,created_at) from public.ugc_v3_artifacts a where project_id=p_project),'[]'),
 'quotes',coalesce((select jsonb_agg(to_jsonb(q) order by created_at) from public.ugc_v3_quotes q where project_id=p_project),'[]'),
 'runtimeAuthorizations',coalesce((select jsonb_agg(to_jsonb(a) order by created_at) from public.ugc_v3_run_authorizations a where project_id=p_project),'[]'),
 'runs',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('current',public.ugc_v3_runtime_current(package_id)) order by created_at) from public.ugc_v3_runs r where project_id=p_project),'[]'),
 'referenceDeletions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'artifact_version',artifact_version,'state',state)) from public.ugc_v3_reference_deletions where project_id=p_project),'[]'),
 'referenceDiagnostics',coalesce((select jsonb_agg(document) from (select distinct on (entity_id) document from public.ugc_v3_runtime_events
  where project_id=p_project and kind='reference_diagnostic' order by entity_id,id desc) latest),'[]'));
end $$;
commit;
