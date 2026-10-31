-- V3 only. Atomic package admission/commit and truthful local progress; manual after 084.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_queue_reference_cleanup(uuid,uuid,boolean)') is null then raise exception 'Apply 084 first'; end if;
 for t,c in select * from (values
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),('projects','id'),('projects','deleted_at'),
 ('project_assets','project_id'),('project_assets','studio_role'),('project_assets','upload_status'),('project_assets','removed_from_draft'),
 ('ugc_v3_sources','project_id'),('ugc_v3_sources','revision'),('ugc_v3_sources','input'),('ugc_v3_sources','project_input_hash'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','status'),('ugc_v3_tasks','input'),('ugc_v3_tasks','output'),('ugc_v3_tasks','request_key'),('ugc_v3_tasks','error_code'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','available_at'),('ugc_v3_tasks','created_at'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','version'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),
 ('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','version'),('ugc_v3_packages','source_revision'),
 ('ugc_v3_quotes','id'),('ugc_v3_quotes','project_id'),('ugc_v3_quotes','package_id'),('ugc_v3_quotes','document'),
 ('ugc_v3_reference_deletions','id'),('ugc_v3_reference_deletions','project_id'),('ugc_v3_reference_deletions','state'),
 ('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify package prerequisite %.%',t,c; end if;
 end loop;
end $$;

create or replace function public.ugc_v3_package_begin(p_owner uuid,p_project uuid,p_input jsonb,p_bindings jsonb,p_retry_task uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare src public.ugc_v3_sources; t public.ugc_v3_tasks; r jsonb; k text; package_id uuid:=gen_random_uuid(); n integer; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 -- Revalidate even when reusing an existing source/task; no rejected, superseded or pending-cleanup asset can bind.
 for k in select unnest(case when exists(select 1 from public.project_assets where project_id=p_project and studio_role='product' and upload_status='uploaded' and not removed_from_draft)
   then array['character','product','location'] else array['character','location'] end) loop
  if (select count(*) from jsonb_array_elements(p_input->'references') x where x->>'role'=k)<>1 then raise exception 'APPROVE_CURRENT_REFERENCES_FIRST'; end if;
 end loop;
 for r in select value from jsonb_array_elements(p_input->'references') loop
  if not exists(select 1 from public.ugc_v3_artifacts a where a.id=(r->>'id')::uuid and a.project_id=p_project and a.kind=r->>'role'
    and a.version=(r->>'version')::integer and a.approved_at is not null and a.rejected_at is null and public.ugc_v3_artifact_current(a.id))
    then raise exception 'APPROVE_CURRENT_REFERENCES_FIRST'; end if;
 end loop;
 if not exists(select 1 from public.ugc_v3_artifacts a where a.id=(p_input->'storyboard'->>'id')::uuid and a.project_id=p_project
   and a.kind='storyboard' and a.approved_at is not null and a.rejected_at is null and public.ugc_v3_artifact_current(a.id)) then raise exception 'STORYBOARD_STALE_REGENERATE'; end if;
 select * into src from public.ugc_v3_sources where project_id=p_project order by revision desc limit 1;
 select * into t from public.ugc_v3_tasks where project_id=p_project and kind='package' order by created_at desc,id desc limit 1 for update;
 if src.revision is not null and src.input-'package'=p_input-'package' and src.project_input_hash=public.ugc_v3_brief_hash(p_project)
   and (t.input->>'sourceRevision')::integer=src.revision then
  if t.status in ('queued','running') then return t.id; end if;
  if t.status in ('failed','reconciliation_required') and t.error_code is distinct from 'V3_PACKAGE_SAVED_ESTIMATE_EXPIRED' then
   update public.ugc_v3_tasks set status='queued',error_code=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
   return t.id;
  end if;
  if exists(select 1 from public.ugc_v3_quotes q where q.project_id=p_project and q.package_id=(t.input->>'packageId')::uuid and (q.document->>'expiresAt')::timestamptz>now())
    or p_retry_task is distinct from t.id then return t.id; end if;
 elsif t.status in ('queued','running') then raise exception 'V3_PACKAGE_BUILD_IN_PROGRESS';
 end if;
 -- Existing source admission and enqueue validations run inside this same locked transaction.
 perform public.ugc_v3_runtime_action(p_owner,p_project,'source',jsonb_build_object('input',p_input,'privateBindings',p_bindings));
 select * into src from public.ugc_v3_sources where project_id=p_project order by revision desc limit 1;
 select coalesce(max(version),0)+1 into n from public.ugc_v3_packages where project_id=p_project;
 insert into public.ugc_v3_tasks(project_id,kind,request_key,input) values(p_project,'package','package:'||src.revision,
   jsonb_build_object('sourceRevision',src.revision,'packageId',package_id,'packageVersion',n)) returning id into package_id;
 return package_id;
end $$;

create or replace function public.ugc_v3_package_checkpoint(p_task uuid,p_token uuid,p_details jsonb,p_failed boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; d jsonb; begin
 select * into t from public.ugc_v3_tasks where id=p_task and kind='package' and status='running' and lease_token=p_token and lease_until>now() for update;
 if not found then return false; end if;
 if p_details->>'stage' not in ('validation','planning','delivery','payload','estimate','persistence','ready')
   or p_details->>'estimateStatus' not in ('not_requested','requested','available','unavailable')
   or p_details->>'packageId' is distinct from t.input->>'packageId'
   or p_details->>'code' is not null and p_details->>'code' !~ '^[A-Z0-9_]{1,100}$'
   or p_details->>'segmentId' is not null and p_details->>'segmentId' !~ '^segment-[0-9]+-[a-f0-9]{16}$'
   or p_details->>'httpStatus' is not null and (p_details->>'httpStatus')::integer not between 100 and 599 then raise exception 'V3_PACKAGE_DIAGNOSTIC_INVALID'; end if;
 d:=jsonb_build_object('stage',p_details->>'stage','code',p_details->>'code','httpStatus',p_details->'httpStatus','packageId',t.input->>'packageId',
  'segmentId',p_details->>'segmentId','estimateStatus',p_details->>'estimateStatus','recoverable',coalesce((p_details->>'recoverable')::boolean,false));
 update public.ugc_v3_tasks set output=jsonb_build_object('packageBuild',d),status=case when p_failed then 'failed' else status end,
  error_code=case when p_failed then d->>'code' else null end,lease_token=case when p_failed then null else lease_token end,
  lease_until=case when p_failed then null else lease_until end where id=t.id;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(t.project_id,t.id,'package_stage',d);
 return true;
end $$;

create or replace function public.ugc_v3_package_commit(p_owner uuid,p_project uuid,p_task uuid,p_token uuid,p_document jsonb,p_quote jsonb,p_state jsonb,p_details jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; r jsonb; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 select * into t from public.ugc_v3_tasks where id=p_task and project_id=p_project and kind='package' and status='running' and lease_token=p_token and lease_until>now() for update;
 if not found then return false; end if;
 if p_document->>'id' is distinct from t.input->>'packageId' or p_document->>'sourceRevision' is distinct from t.input->>'sourceRevision' then raise exception 'PACKAGE_STALE'; end if;
 for r in select value from jsonb_array_elements(p_document->'source'->'references') loop
  if not exists(select 1 from public.ugc_v3_artifacts a where a.id=(r->>'id')::uuid and a.project_id=p_project and a.approved_at is not null
    and a.rejected_at is null and public.ugc_v3_artifact_current(a.id)) then raise exception 'APPROVED_INPUT_STALE'; end if;
 end loop;
 if not exists(select 1 from public.ugc_v3_artifacts a where a.id=(p_document->'source'->'storyboard'->>'id')::uuid and a.project_id=p_project
   and a.kind='storyboard' and a.approved_at is not null and a.rejected_at is null and public.ugc_v3_artifact_current(a.id)) then raise exception 'STORYBOARD_STALE_REGENERATE'; end if;
 perform public.ugc_v3_write(p_owner,p_project,'package',jsonb_build_object('document',p_document,'state',p_state,'eventId',p_task));
 if p_quote is not null and not exists(select 1 from public.ugc_v3_quotes where id=(p_quote->>'id')::uuid and project_id=p_project and document=p_quote) then
  perform public.ugc_v3_runtime_action(p_owner,p_project,'quote',jsonb_build_object('document',p_quote));
 end if;
 perform public.ugc_v3_package_checkpoint(p_task,p_token,p_details,false);
 update public.ugc_v3_tasks set status='done',error_code=null,lease_token=null,lease_until=null where id=p_task;
 return true;
end $$;

-- Regenerating an approved sheet preserves its historical version. Only unwanted candidates are deleted.
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
 if exists(select 1 from public.ugc_v3_reference_deletions where project_id=p_project and kind=a.kind and state='prepared') then raise exception 'V3_REFERENCE_CLEANUP_PENDING'; end if;
 perform public.ugc_v3_reference_input_current(p_owner,p_project,a.kind,p_input);
 return public.ugc_v3_runtime_action(p_owner,p_project,'enqueue',jsonb_build_object('kind',a.kind,'requestKey','approved-reference-replacement:'||p_id,'input',p_input));
end $$;
create or replace function public.ugc_v3_preserve_approved_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.ugc_v3_artifacts where id=new.id and project_id=new.project_id and approved_at is not null) then raise exception 'V3_APPROVED_REFERENCE_PRESERVED'; end if;
 return new;
end $$;
drop trigger if exists ugc_v3_preserve_approved_reference on public.ugc_v3_reference_deletions;
create trigger ugc_v3_preserve_approved_reference before insert or update on public.ugc_v3_reference_deletions for each row execute function public.ugc_v3_preserve_approved_reference();

create or replace function public.ugc_v3_reconcile_reference_cleanup(p_owner uuid,p_project uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 update public.ugc_v3_tasks t set status='done',error_code=null,lease_token=null,lease_until=null where t.project_id=p_project and t.kind='delete'
  and t.status<>'done' and (t.lease_until is null or t.lease_until<now())
  and exists(select 1 from public.ugc_v3_reference_deletions d where d.project_id=p_project and d.id::text=t.input->'referenceCleanup'->>'id' and d.state='completed');
 get diagnostics n=row_count; return n;
end $$;
revoke all on function public.ugc_v3_package_begin(uuid,uuid,jsonb,jsonb,uuid),public.ugc_v3_package_checkpoint(uuid,uuid,jsonb,boolean),public.ugc_v3_package_commit(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb),public.ugc_v3_reconcile_reference_cleanup(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_package_begin(uuid,uuid,jsonb,jsonb,uuid),public.ugc_v3_package_checkpoint(uuid,uuid,jsonb,boolean),public.ugc_v3_package_commit(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb),public.ugc_v3_reconcile_reference_cleanup(uuid,uuid) to service_role;
revoke all on function public.ugc_v3_regenerate_approved_reference(uuid,uuid,uuid,integer,jsonb),public.ugc_v3_preserve_approved_reference() from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_regenerate_approved_reference(uuid,uuid,uuid,integer,jsonb) to service_role;
commit;
