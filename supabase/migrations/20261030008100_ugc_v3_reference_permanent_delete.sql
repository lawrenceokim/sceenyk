-- Manual after 080. Confirmed V3 reference deletion, with a held replacement before storage I/O.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_regenerate_reference(uuid,uuid,jsonb)') is null then raise exception 'Apply 080 first'; end if;
 for t,c in select * from (values
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','version'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','task_id'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),('ugc_v3_artifacts','created_at'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','request_key'),('ugc_v3_tasks','input'),('ugc_v3_tasks','status'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','available_at'),('ugc_v3_tasks','created_at'),
 ('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document'),
 ('ugc_v3_runs','project_id'),('ugc_v3_runs','state'),('ugc_v3_runs','package_id'),('ugc_v3_runs','created_at'),
 ('ugc_v3_quotes','project_id'),('ugc_v3_quotes','created_at'),('ugc_v3_run_authorizations','project_id'),('ugc_v3_run_authorizations','created_at'),
 ('projects','id'),('projects','deleted_at'),('projects','title'),('projects','prompt'),('projects','aspect_ratio'),('projects','duration'),('projects','visual_style'),('projects','tone'),('projects','category'),('projects','ugc_type'),
 ('project_assets','id'),('project_assets','owner_user_id'),('project_assets','project_id'),('project_assets','studio_role'),('project_assets','reference_name'),('project_assets','upload_status'),('project_assets','removed_from_draft'),('project_assets','verified_etag'),('project_assets','size_bytes'),('project_assets','mime_type')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify V3 reference cleanup prerequisite %.%',t,c; end if;
 end loop;
end $$;

-- A durable storage/DB coordination record, not another generated-reference history table.
create table if not exists public.ugc_v3_reference_deletions (
 id uuid primary key, project_id uuid not null references public.ugc_v3_projects(project_id),
 kind text not null check(kind in ('character','product')), artifact_version integer not null check(artifact_version>0),
 source_task_id uuid, asset jsonb, mode text not null check(mode in ('regenerate','reject')),
 replacement_task_id uuid, state text not null default 'prepared' check(state in ('prepared','completed')),
 lease_token uuid, lease_until timestamptz, error_code text, completed_at timestamptz,
 check(state<>'completed' or (asset is null and source_task_id is null))
);
create unique index if not exists ugc_v3_reference_deletion_pending on public.ugc_v3_reference_deletions(project_id,kind) where state='prepared';
alter table public.ugc_v3_reference_deletions enable row level security;
revoke all on public.ugc_v3_reference_deletions from public,anon,authenticated,service_role;
grant select on public.ugc_v3_reference_deletions to service_role;

create or replace function public.ugc_v3_reference_input_current(p_owner uuid,p_project uuid,k text,d jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare brief jsonb; begin
 select jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,
 'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type) into brief from public.projects p where p.id=p_project and p.deleted_at is null;
 if d->'generationContext' is distinct from public.ugc_v3_generation_context(p_project)
 or d->>'briefHash' is distinct from public.ugc_package_digest('sceenyk-v3-brief',brief) then raise exception 'V3_CREATIVE_INPUT_STALE'; end if;
 if d->>'provider' is distinct from 'openai' or coalesce(d->>'model','')=''
 or jsonb_typeof(d->'referencePrompt'->'version') is distinct from 'number' or (d->'referencePrompt'->>'version')::integer<2
 or coalesce(d->'referencePrompt'->>'prompt','')=''
 or d->'referencePrompt'->>'hash' is distinct from public.ugc_package_digest('sceenyk-v3-reference-sheet-prompt',d->'referencePrompt'->'prompt') then raise exception 'V3_REFERENCE_PROMPT_OUTDATED_REGENERATE'; end if;
 perform 1 from public.project_assets a where a.project_id=p_project and a.owner_user_id=p_owner and a.id::text=d->>'originalId'
 and a.studio_role=k and a.upload_status='uploaded' and not a.removed_from_draft
 and d->'referenceSubject'->>'role'=k and d->'referenceSubject'->>'originalId'=a.id::text and d->'referenceSubject'->>'name'=coalesce(a.reference_name,'')
 and d->'referenceSource'->>'id'=a.id::text and d->'referenceSource'->>'etag'=a.verified_etag
 and d->'referenceSource'->>'sizeBytes'=a.size_bytes::text and d->'referenceSource'->>'mimeType'=a.mime_type for update;
 if not found then raise exception 'V3_REFERENCE_SOURCE_STALE'; end if;
end $$;

-- Old clients may generate an empty slot, but cannot bypass confirmation to replace an image.
create or replace function public.ugc_v3_regenerate_reference(p_owner uuid,p_project uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text:=p_payload->>'kind'; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if k is null or k not in ('character','product') then raise exception 'INVALID_REFERENCE_REQUEST'; end if;
 if exists(select 1 from public.ugc_v3_reference_deletions where project_id=p_project and kind=k and state='prepared') then raise exception 'V3_REFERENCE_CLEANUP_PENDING'; end if;
 if exists(select 1 from public.ugc_v3_artifacts a where a.project_id=p_project and a.kind=k and a.version>
  coalesce((select max(artifact_version) from public.ugc_v3_reference_deletions where project_id=p_project and kind=k and state='completed'),0)) then raise exception 'V3_REFERENCE_CONFIRMATION_REQUIRED'; end if;
 perform public.ugc_v3_reference_input_current(p_owner,p_project,k,p_payload->'input');
 return public.ugc_v3_runtime_action(p_owner,p_project,'enqueue',p_payload);
end $$;

create or replace function public.ugc_v3_reference_delete_prepare(p_owner uuid,p_project uuid,p_kind text,p_id uuid,p_version integer,p_mode text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.ugc_v3_artifacts; op public.ugc_v3_reference_deletions; replacement uuid; token uuid:=gen_random_uuid(); begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 if p_kind is null or p_kind not in ('character','product') or p_mode is null or p_mode not in ('regenerate','reject') then raise exception 'INVALID_REFERENCE_REQUEST'; end if;
 select * into op from public.ugc_v3_reference_deletions where id=p_id and project_id=p_project for update;
 if found then
  if op.kind<>p_kind or op.artifact_version<>p_version or op.mode<>p_mode then raise exception 'V3_REFERENCE_CHANGED_RECONFIRM'; end if;
  if op.state='completed' then return to_jsonb(op); end if;
  if op.lease_until>now() then raise exception 'V3_REFERENCE_CLEANUP_IN_PROGRESS'; end if;
 end if;
 select * into a from public.ugc_v3_artifacts where id=p_id and project_id=p_project and kind=p_kind and version=p_version for update;
 if not found or exists(select 1 from public.ugc_v3_artifacts n where n.project_id=p_project and n.kind=p_kind and n.version>a.version) then raise exception 'V3_REFERENCE_CHANGED_RECONFIRM'; end if;
 if exists(select 1 from public.ugc_v3_runs where project_id=p_project and state not in ('approved','failed','deleted'))
 or exists(select 1 from public.ugc_v3_tasks t where t.project_id=p_project and t.status in ('queued','running','reconciliation_required')
 and t.id is distinct from op.replacement_task_id and (t.kind=p_kind or coalesce(t.input->'references','[]') ? p_id::text)) then raise exception 'V3_CREATIVE_REQUEST_ALREADY_ACTIVE'; end if;
 if a.document->'asset'->>'id' is distinct from a.id::text or a.document->'asset'->>'mimeType' is distinct from 'image/png' then raise exception 'V3_REFERENCE_DELETE_SCOPE'; end if;
 if p_mode='regenerate' then
  if p_input->>'previous' is distinct from p_id::text then raise exception 'V3_REFERENCE_CHANGED_RECONFIRM'; end if;
  perform public.ugc_v3_reference_input_current(p_owner,p_project,p_kind,p_input);
  if op.id is null then
   perform public.ugc_v3_runtime_action(p_owner,p_project,'enqueue',jsonb_build_object('kind',p_kind,'requestKey','reference-replacement:'||p_id,
    'input',p_input||jsonb_build_object('referenceCleanupHold',true)));
   select id into replacement from public.ugc_v3_tasks where project_id=p_project and request_key='reference-replacement:'||p_id;
   update public.ugc_v3_tasks set available_at='infinity' where id=replacement;
  else
   replacement:=op.replacement_task_id;
   update public.ugc_v3_tasks set input=p_input||jsonb_build_object('referenceCleanupHold',true) where id=replacement and status='queued' and not provider_started;
   if not found then raise exception 'V3_REFERENCE_REPLACEMENT_UNSAFE'; end if;
  end if;
 end if;
 insert into public.ugc_v3_reference_deletions(id,project_id,kind,artifact_version,source_task_id,asset,mode,replacement_task_id,lease_token,lease_until)
 values(p_id,p_project,p_kind,p_version,a.task_id,a.document->'asset',p_mode,replacement,token,now()+interval '3 minutes')
 on conflict(id) do update set lease_token=token,lease_until=now()+interval '3 minutes',error_code=null;
 return (select to_jsonb(d) from public.ugc_v3_reference_deletions d where id=p_id);
end $$;

create or replace function public.ugc_v3_reference_delete_finish(p_owner uuid,p_project uuid,p_id uuid,p_token uuid,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$
declare op public.ugc_v3_reference_deletions; t public.ugc_v3_tasks; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 select * into op from public.ugc_v3_reference_deletions where id=p_id and project_id=p_project for update;
 if not found then raise exception 'V3_REFERENCE_CHANGED_RECONFIRM'; end if;
 if op.state='completed' then return true; end if;
 if op.lease_token is distinct from p_token or op.lease_until<=now() then raise exception 'V3_REFERENCE_CLEANUP_IN_PROGRESS'; end if;
 if p_error is not null then
  update public.ugc_v3_reference_deletions set error_code=p_error,lease_token=null,lease_until=null where id=p_id; return false;
 end if;
 if not exists(select 1 from public.ugc_v3_artifacts where id=p_id and project_id=p_project and version=op.artifact_version
  and document->'asset'=op.asset and task_id=op.source_task_id) then raise exception 'V3_REFERENCE_CHANGED_RECONFIRM'; end if;
 if op.replacement_task_id is not null then
  select * into t from public.ugc_v3_tasks where id=op.replacement_task_id and project_id=p_project and status='queued' and not provider_started for update;
  if not found then raise exception 'V3_REFERENCE_REPLACEMENT_UNSAFE'; end if;
  perform public.ugc_v3_reference_input_current(p_owner,p_project,op.kind,t.input);
 end if;
 delete from public.ugc_v3_artifacts where id=p_id and project_id=p_project;
 delete from public.ugc_v3_runtime_events where project_id=p_project and (entity_id in (p_id,op.source_task_id)
  or (kind='review_artifact' and document->>'id'=p_id::text)
  or (kind='enqueue' and document->>'requestKey'=(select request_key from public.ugc_v3_tasks where id=op.source_task_id)));
 delete from public.ugc_v3_tasks where id=op.source_task_id and project_id=p_project;
 if op.replacement_task_id is not null then
  update public.ugc_v3_tasks set input=input-'referenceCleanupHold',available_at=now() where id=op.replacement_task_id;
 end if;
 -- Retain only minimal identifiers for idempotency/monotonic versioning; no image, prompt or source metadata.
 update public.ugc_v3_reference_deletions set state='completed',asset=null,source_task_id=null,lease_token=null,lease_until=null,error_code=null,completed_at=now() where id=p_id;
 return true;
end $$;

create or replace function public.ugc_v3_reference_cleanup_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='ugc_v3_tasks' then
  if new.provider_started and new.input->>'referenceCleanupHold'='true' then raise exception 'V3_REFERENCE_CLEANUP_PENDING'; end if;
  if exists(select 1 from public.ugc_v3_reference_deletions d where d.project_id=new.project_id and d.state='prepared'
   and new.id is distinct from d.replacement_task_id and (new.kind=d.kind or coalesce(new.input->'references','[]') ? d.id::text)) then raise exception 'V3_REFERENCE_CLEANUP_PENDING'; end if;
 elsif tg_op='INSERT' then
  if new.kind in ('character','product') then
   new.version:=greatest(new.version,coalesce((select max(artifact_version)+1 from public.ugc_v3_reference_deletions where project_id=new.project_id and kind=new.kind and state='completed'),1));
  end if;
 elsif new.approved_at is not null and exists(select 1 from public.ugc_v3_reference_deletions where id=new.id and state='prepared') then raise exception 'V3_REFERENCE_CLEANUP_PENDING';
 end if;
 return new;
end $$;
drop trigger if exists ugc_v3_reference_cleanup_approval on public.ugc_v3_artifacts;
create trigger ugc_v3_reference_cleanup_approval before update of approved_at on public.ugc_v3_artifacts for each row execute function public.ugc_v3_reference_cleanup_guard();
drop trigger if exists ugc_v3_reference_cleanup_version on public.ugc_v3_artifacts;
create trigger ugc_v3_reference_cleanup_version before insert on public.ugc_v3_artifacts for each row execute function public.ugc_v3_reference_cleanup_guard();
drop trigger if exists ugc_v3_reference_cleanup_intent on public.ugc_v3_tasks;
create trigger ugc_v3_reference_cleanup_intent before update of provider_started on public.ugc_v3_tasks for each row execute function public.ugc_v3_reference_cleanup_guard();
drop trigger if exists ugc_v3_reference_cleanup_enqueue on public.ugc_v3_tasks;
create trigger ugc_v3_reference_cleanup_enqueue before insert on public.ugc_v3_tasks for each row execute function public.ugc_v3_reference_cleanup_guard();
revoke all on function public.ugc_v3_reference_input_current(uuid,uuid,text,jsonb),public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb),public.ugc_v3_reference_delete_finish(uuid,uuid,uuid,uuid,text),public.ugc_v3_reference_cleanup_guard() from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb),public.ugc_v3_reference_delete_finish(uuid,uuid,uuid,uuid,text) to service_role;

-- Minimal completed-operation floors prevent an older history image becoming active after Reject.
create or replace function public.ugc_v3_runtime_read(p_owner uuid,p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner) then return null; end if;
 return public.ugc_v3_read(p_owner,p_project)||jsonb_build_object(
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by created_at) from public.ugc_v3_tasks t where project_id=p_project),'[]'),
 'artifacts',coalesce((select jsonb_agg(to_jsonb(a) order by version,created_at) from public.ugc_v3_artifacts a where project_id=p_project),'[]'),
 'quotes',coalesce((select jsonb_agg(to_jsonb(q) order by created_at) from public.ugc_v3_quotes q where project_id=p_project),'[]'),
 'runtimeAuthorizations',coalesce((select jsonb_agg(to_jsonb(a) order by created_at) from public.ugc_v3_run_authorizations a where project_id=p_project),'[]'),
 'runs',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('current',public.ugc_v3_runtime_current(package_id)) order by created_at) from public.ugc_v3_runs r where project_id=p_project),'[]'),
 'referenceDeletions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'artifact_version',artifact_version,'state',state)) from public.ugc_v3_reference_deletions where project_id=p_project),'[]'));
end $$;
create or replace function public.ugc_v3_artifact_current(p_artifact uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.ugc_v3_artifacts; ref public.ugc_v3_artifacts; kinds text[]; k text; ids jsonb:='[]'; brief jsonb; begin
 select * into a from public.ugc_v3_artifacts where id=p_artifact;
 if not found or a.kind='joined' or a.rejected_at is not null or
 exists(select 1 from public.ugc_v3_reference_deletions where id=a.id and state='prepared') or
 a.version<=coalesce((select max(artifact_version) from public.ugc_v3_reference_deletions where project_id=a.project_id and kind=a.kind and state='completed'),0) or
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
commit;
