-- Manual after 083. ChatGPT prompt -> one image -> user review; discard unapproved V3 history.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_location_checkpoint(uuid,uuid,text,jsonb)') is null then raise exception 'Apply 083 first'; end if;
 for t,c in select * from (values
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),('projects','id'),('projects','deleted_at'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','status'),('ugc_v3_tasks','request_key'),('ugc_v3_tasks','input'),('ugc_v3_tasks','output'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','available_at'),('ugc_v3_tasks','error_code'),('ugc_v3_tasks','created_at'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','version'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),('ugc_v3_artifacts','task_id'),
 ('ugc_v3_reference_deletions','id'),('ugc_v3_reference_deletions','project_id'),('ugc_v3_reference_deletions','kind'),('ugc_v3_reference_deletions','artifact_version'),('ugc_v3_reference_deletions','source_task_id'),('ugc_v3_reference_deletions','asset'),('ugc_v3_reference_deletions','mode'),('ugc_v3_reference_deletions','replacement_task_id'),('ugc_v3_reference_deletions','state'),('ugc_v3_reference_deletions','lease_token'),('ugc_v3_reference_deletions','lease_until'),('ugc_v3_reference_deletions','error_code'),('ugc_v3_reference_deletions','completed_at'),
 ('ugc_v3_runtime_events','id'),('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document'),
 ('ugc_v3_sources','project_id'),('ugc_v3_sources','revision'),('ugc_v3_sources','input'),('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','source_revision'),('ugc_v3_runs','package_id'),('ugc_v3_runs','state')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify simple Location prerequisite %.%',t,c; end if;
 end loop;
end $$;
alter table public.ugc_v3_reference_deletions drop constraint if exists ugc_v3_reference_deletions_kind_check;
alter table public.ugc_v3_reference_deletions add constraint ugc_v3_reference_deletions_kind_check check(kind in ('character','product','location'));

create or replace function public.ugc_v3_location_action(p_owner uuid,p_project uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; previous public.ugc_v3_tasks; d jsonb; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 if p_action='enqueue' then
  d:=p_payload->'input';
  if d->'locationDirector'->>'version' is distinct from 'location-prompt-v2' or d->>'provider' is distinct from 'openai'
   or coalesce(d->>'directorModel','') !~ '^[a-zA-Z0-9._:-]{1,200}$' or coalesce(d->>'model','') !~ '^[a-zA-Z0-9._:-]{1,200}$'
   or not public.ugc_v3_location_input_current(p_project,d) then raise exception 'V3_LOCATION_INPUT_MISMATCH'; end if;
  select * into previous from public.ugc_v3_tasks where project_id=p_project and kind='location' order by created_at desc,id desc limit 1 for update;
  if found and previous.request_key=p_payload->>'requestKey' then return public.ugc_v3_runtime_read(p_owner,p_project); end if;
  if previous.id is not null then
   if d->>'previousTask' is distinct from previous.id::text or previous.status in ('queued','running') or previous.status<>'done' and previous.lease_until>now() then return public.ugc_v3_runtime_read(p_owner,p_project); end if;
   if exists(select 1 from jsonb_array_elements(coalesce(previous.output->'requests','[]')) r where r->>'key' in ('plan','sheet','repair') and r->>'status'='intent')
    or previous.status='reconciliation_required' and previous.output is null then raise exception 'V3_LOCATION_OUTCOME_UNKNOWN'; end if;
  elsif d->>'previousTask' is not null then raise exception 'V3_LOCATION_REQUEST_CHANGED'; end if;
  if exists(select 1 from public.ugc_v3_artifacts a where a.project_id=p_project and a.kind='location' and a.approved_at is null and a.rejected_at is null
   and a.version>coalesce((select max(artifact_version) from public.ugc_v3_reference_deletions where project_id=p_project and kind='location' and state='completed'),0)
   and not exists(select 1 from public.ugc_v3_artifacts n where n.project_id=p_project and n.kind='location' and n.version>a.version)) then raise exception 'REVIEW_EXISTING_REFERENCE_FIRST'; end if;
  perform public.ugc_v3_runtime_action(p_owner,p_project,'enqueue',jsonb_build_object('kind','location','input',d,'requestKey',p_payload->>'requestKey'));
 elsif p_action in ('recover','continue') then
  select * into t from public.ugc_v3_tasks where id=(p_payload->>'id')::uuid and project_id=p_project and kind='location' and input->'locationDirector'->>'version' in ('ai-location-director-v1','location-prompt-v2') for update;
  if not found then raise exception 'V3_LOCATION_REQUEST_CHANGED'; end if;
  if t.status in ('queued','running','done') then return public.ugc_v3_runtime_read(p_owner,p_project); end if;
  if t.lease_until>now() then raise exception 'V3_LOCATION_REQUEST_CHANGED'; end if;
  if exists(select 1 from public.ugc_v3_tasks n where n.project_id=p_project and n.kind='location' and n.created_at>t.created_at) then raise exception 'V3_LOCATION_REQUEST_CHANGED'; end if;
  -- Recovery may publish a saved stale image for the user to see. It cannot submit a request.
  if p_action='continue' then
   if t.error_code is distinct from 'V3_LOCATION_CONTINUE_REQUIRED' or t.output->>'phase' is distinct from 'sheet' then raise exception 'V3_LOCATION_CONTINUE_UNAVAILABLE'; end if;
   if not public.ugc_v3_location_input_current(p_project,t.input) then raise exception 'V3_CREATIVE_INPUT_STALE'; end if;
   if exists(select 1 from jsonb_array_elements(coalesce(t.output->'requests','[]')) r where r->>'key' in ('plan','sheet','repair') and r->>'status' in ('intent','rejected')) then raise exception 'V3_LOCATION_OUTCOME_UNKNOWN'; end if;
  end if;
  update public.ugc_v3_tasks set output=jsonb_set(output,'{recoveryOnly}',to_jsonb(p_action='recover')),status='queued',error_code=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
  insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,t.id,'location_'||p_action,jsonb_build_object('newProviderRequest',p_action='continue'));
 else raise exception 'V3_LOCATION_ACTION_INVALID'; end if;
 return public.ugc_v3_runtime_read(p_owner,p_project);
end $$;

create or replace function public.ugc_v3_location_checkpoint(p_task uuid,p_token uuid,p_action text,p_document jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; s jsonb; req jsonb; key text; idx integer; pid uuid; begin
 select project_id into pid from public.ugc_v3_tasks where id=p_task;
 perform 1 from public.ugc_v3_projects where project_id=pid for update;
 perform 1 from public.projects where id=pid and deleted_at is null for update;
 select * into t from public.ugc_v3_tasks where id=p_task and lease_token=p_token and status='running' and lease_until>now()
  and kind='location' and input->'locationDirector'->>'version' in ('ai-location-director-v1','location-prompt-v2') for update;
 if not found then return false; end if;
 s:=coalesce(t.output,jsonb_build_object('schema',t.input->'locationDirector'->>'version','phase','plan','requests','[]'::jsonb,'instruction',null,'instructionHash',null,'sheetId',null,'recoveryOnly',false,'errorCode',null));
 key:=p_document->>'key';
 if p_action in ('intent','advance') and not public.ugc_v3_location_input_current(t.project_id,t.input) then raise exception 'V3_CREATIVE_INPUT_STALE'; end if;
 if p_action='intent' then
  if key is distinct from s->>'phase' or key not in ('plan','sheet') or s->>'recoveryOnly'='true' or t.input->>'referenceCleanupHold'='true' then raise exception 'V3_LOCATION_PROVIDER_FORBIDDEN'; end if;
  if exists(select 1 from jsonb_array_elements(s->'requests') r where r->>'key'=key) then return false; end if;
  if (select count(*) from jsonb_array_elements(s->'requests') r where r->>'key' in ('plan','sheet'))>=2 then raise exception 'V3_LOCATION_REQUEST_LIMIT'; end if;
  req:=jsonb_build_object('key',key,'id',(p_document->>'id')::uuid,'status','intent','httpStatus',null,'requestId',null,'responseId',null,'responseHash',null);
  update public.ugc_v3_tasks set provider_started=true,output=jsonb_set(s,'{requests}',(s->'requests')||jsonb_build_array(req)) where id=t.id;
 elsif p_action='receipt' then
  select ord::integer-1,r into idx,req from jsonb_array_elements(s->'requests') with ordinality a(r,ord) where r->>'key'=key;
  if req is null or p_document->>'status' not in ('saved','rejected') then raise exception 'V3_LOCATION_RECEIPT_INVALID'; end if;
  if req->>'status'<>'intent' then return true; end if;
  req:=req||jsonb_build_object('status',p_document->>'status','responseHash',p_document->>'responseHash',
   'httpStatus',case when (p_document->>'httpStatus')::integer between 100 and 599 then p_document->'httpStatus' else 'null'::jsonb end,
   'requestId',case when p_document->>'requestId' ~ '^[a-zA-Z0-9_-]{1,200}$' then p_document->>'requestId' else null end,
   'responseId',case when p_document->>'responseId' ~ '^[a-zA-Z0-9_-]{1,200}$' then p_document->>'responseId' else null end,'usage',p_document->'usage');
  update public.ugc_v3_tasks set output=jsonb_set(s,array['requests',idx::text],req) where id=t.id;
 elsif p_action='advance' then
  if s->>'phase' is distinct from 'plan' or p_document->>'phase' is distinct from 'sheet'
   or not exists(select 1 from jsonb_array_elements(s->'requests') r where r->>'key'='plan' and r->>'status'='saved')
   or coalesce(length(p_document->'instruction'->>'name'),0) not between 1 and 200
   or coalesce(length(p_document->'instruction'->>'prompt'),0) not between 1 and 24000
   or p_document->>'instructionHash' is distinct from public.ugc_package_digest('sceenyk-v3-location-instruction',p_document->'instruction') then raise exception 'V3_LOCATION_INSTRUCTION_INVALID'; end if;
  update public.ugc_v3_tasks set output=s||jsonb_build_object('phase','sheet','instruction',p_document->'instruction','instructionHash',p_document->>'instructionHash','errorCode',null),
   status='queued',error_code=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
 elsif p_action='failure' then
  if p_document->>'code' !~ '^[A-Z0-9_]{1,100}$' then raise exception 'V3_LOCATION_DIAGNOSTIC_INVALID'; end if;
  update public.ugc_v3_tasks set output=s||jsonb_build_object('errorCode',p_document->>'code'),status=case when p_document->>'unknown'='true' then 'reconciliation_required' else 'failed' end,
   error_code=p_document->>'code',lease_token=null,lease_until=null where id=t.id;
 else raise exception 'V3_LOCATION_ACTION_INVALID'; end if;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(t.project_id,t.id,'location_'||p_action,
  case when p_action='advance' then jsonb_build_object('phase','sheet','instructionHash',p_document->>'instructionHash') else p_document-'usage' end);
 return true;
end $$;

-- Only technical/provenance validation: the owner, never AI, decides visual acceptance.
create or replace function public.ugc_v3_location_artifact_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind<>'location' or coalesce(new.document->'input'->'locationDirector'->>'version','') not in ('ai-location-director-v1','location-prompt-v2') then return new; end if;
 if tg_op='UPDATE' then
  if new.approved_at is not distinct from old.approved_at then return new; end if;
  if not public.ugc_v3_location_input_current(new.project_id,new.document->'input') then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
 end if;
 if new.document->'asset'->>'id' is distinct from new.id::text or new.document->'asset'->>'mimeType' is distinct from 'image/png'
  or coalesce((new.document->'asset'->>'width')::integer,0)<=0 or coalesce((new.document->'asset'->>'height')::integer,0)<=0 then raise exception 'V3_LOCATION_IMAGE_INVALID'; end if;
 return new;
end $$;

create or replace function public.ugc_v3_location_dependency_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb; loc public.ugc_v3_artifacts; begin
 if tg_table_name='ugc_v3_artifacts' then
  if new.kind<>'storyboard' then return new; end if;
  for loc in select a.* from public.ugc_v3_artifacts a where a.project_id=new.project_id and a.kind='location' and coalesce(new.document->'input'->'references','[]') ? a.id::text loop
   if loc.document->'input'->'locationDirector'->>'version' in ('ai-location-director-v1','location-prompt-v2') and not public.ugc_v3_location_input_current(loc.project_id,loc.document->'input') then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
  end loop; return new;
 elsif tg_table_name='ugc_v3_sources' then d:=new.input;
 elsif tg_table_name='ugc_v3_runs' then
  if new.state<>'submitting' or old.state<>'queued' then return new; end if;
  select s.input into d from public.ugc_v3_packages p join public.ugc_v3_sources s on s.project_id=p.project_id and s.revision=p.source_revision where p.id=new.package_id;
 else return new; end if;
 for loc in select a.* from public.ugc_v3_artifacts a where a.kind='location' and exists(select 1 from jsonb_array_elements(coalesce(d->'references','[]')) r where r->>'role'='location' and r->>'id'=a.id::text) loop
  if loc.document->'input'->'locationDirector'->>'version' in ('ai-location-director-v1','location-prompt-v2') and not public.ugc_v3_location_input_current(loc.project_id,loc.document->'input') then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
 end loop; return new;
end $$;

create or replace function public.ugc_v3_discard_reference_prepare(p_owner uuid,p_project uuid,p_id uuid,p_version integer,p_current boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.ugc_v3_artifacts; op public.ugc_v3_reference_deletions; token uuid:=gen_random_uuid(); begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 select * into op from public.ugc_v3_reference_deletions where id=p_id and project_id=p_project for update;
 if found then
  if op.artifact_version<>p_version or op.mode<>'reject' then raise exception 'V3_REFERENCE_CLEANUP_PENDING'; end if;
  if op.state='completed' then return to_jsonb(op); end if;
  if op.lease_until>now() then raise exception 'V3_REFERENCE_CLEANUP_IN_PROGRESS'; end if;
 end if;
 select * into a from public.ugc_v3_artifacts where id=p_id and project_id=p_project and version=p_version and kind in ('character','product','location') for update;
 if not found then raise exception 'V3_REFERENCE_CHANGED_RECONFIRM'; end if;
 if a.approved_at is not null then raise exception 'V3_APPROVED_REFERENCE_PRESERVED'; end if;
 if not exists(select 1 from public.ugc_v3_tasks source_task where source_task.id=a.task_id and source_task.project_id=p_project and source_task.kind=a.kind) then raise exception 'V3_REFERENCE_DELETE_SCOPE'; end if;
 if not p_current and a.rejected_at is null and op.id is null
  and not exists(select 1 from public.ugc_v3_artifacts n where n.project_id=p_project and n.kind=a.kind and n.version>a.version)
  and a.version>coalesce((select max(artifact_version) from public.ugc_v3_reference_deletions where project_id=p_project and kind=a.kind and state='completed'),0) then raise exception 'V3_CURRENT_REVIEW_REFERENCE_PRESERVED'; end if;
 if exists(select 1 from public.ugc_v3_reference_deletions where project_id=p_project and kind=a.kind and state='prepared' and id<>p_id) then raise exception 'V3_REFERENCE_CLEANUP_PENDING'; end if;
 if exists(select 1 from public.ugc_v3_tasks t where t.project_id=p_project and t.kind<>'delete' and t.status in ('queued','running','reconciliation_required') and coalesce(t.input->'references','[]') ? a.id::text) then raise exception 'V3_CREATIVE_REQUEST_ALREADY_ACTIVE'; end if;
 if a.document->'asset'->>'id' is distinct from a.id::text or a.document->'asset'->>'mimeType' is distinct from 'image/png' then raise exception 'V3_REFERENCE_DELETE_SCOPE'; end if;
 insert into public.ugc_v3_reference_deletions(id,project_id,kind,artifact_version,source_task_id,asset,mode,lease_token,lease_until)
 values(p_id,p_project,a.kind,p_version,a.task_id,a.document->'asset','reject',token,now()+interval '3 minutes')
 on conflict(id) do update set lease_token=token,lease_until=now()+interval '3 minutes',error_code=null;
 return(select to_jsonb(d) from public.ugc_v3_reference_deletions d where id=p_id);
end $$;

create or replace function public.ugc_v3_discard_reference_finish(p_owner uuid,p_project uuid,p_id uuid,p_token uuid,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$
declare op public.ugc_v3_reference_deletions; a public.ugc_v3_artifacts; t public.ugc_v3_tasks; receipts jsonb; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 select * into op from public.ugc_v3_reference_deletions where id=p_id and project_id=p_project for update;
 if not found or op.mode<>'reject' then raise exception 'V3_REFERENCE_CHANGED_RECONFIRM'; end if;
 if op.state='completed' then return true; end if;
 if op.lease_token is distinct from p_token or op.lease_until<=now() then raise exception 'V3_REFERENCE_CLEANUP_IN_PROGRESS'; end if;
 if p_error is not null then
  update public.ugc_v3_reference_deletions set error_code=p_error,lease_token=null,lease_until=null where id=p_id;return false;
 end if;
 select * into a from public.ugc_v3_artifacts where id=p_id and project_id=p_project and version=op.artifact_version and task_id=op.source_task_id and document->'asset'=op.asset for update;
 if not found or a.approved_at is not null then raise exception 'V3_APPROVED_REFERENCE_PRESERVED'; end if;
 select * into t from public.ugc_v3_tasks where id=op.source_task_id and project_id=p_project;
 select coalesce(jsonb_agg(jsonb_build_object('key',r->>'key','id',r->>'id','status',r->>'status','httpStatus',r->'httpStatus','requestId',r->>'requestId','responseId',r->>'responseId','usage',r->'usage')),'[]') into receipts
 from jsonb_array_elements(coalesce(a.document->'location'->'requests','[]')) r;
 delete from public.ugc_v3_artifacts where id=p_id and project_id=p_project;
 delete from public.ugc_v3_runtime_events where project_id=p_project and (entity_id in (p_id,op.source_task_id) or kind='review_artifact' and document->>'id'=p_id::text or kind='enqueue' and document->>'requestKey'=t.request_key);
 delete from public.ugc_v3_tasks where id=op.source_task_id and project_id=p_project;
 update public.ugc_v3_tasks set status='done',error_code=null,lease_token=null,lease_until=null where project_id=p_project and kind='delete'
  and input->'referenceCleanup'->>'id'=p_id::text and status in ('queued','failed');
 -- Minimal request audit only: no image, raw response, prompt, storage key or source snapshot.
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,p_id,'reference_discarded',
  jsonb_build_object('kind',op.kind,'version',op.artifact_version,'taskId',t.id,'providerStarted',t.provider_started,
   'model',case when t.input->>'model' ~ '^[a-zA-Z0-9._:-]{1,200}$' and t.input->>'model' not like 'sk-%' then t.input->>'model' else null end,
   'requestId',a.document->>'requestId','httpStatus',a.document->'httpStatus','requests',receipts));
 update public.ugc_v3_reference_deletions set state='completed',asset=null,source_task_id=null,lease_token=null,lease_until=null,error_code=null,completed_at=now() where id=p_id;
 return true;
end $$;

create or replace function public.ugc_v3_queue_reference_cleanup(p_owner uuid,p_project uuid,p_retry boolean default false) returns integer
language plpgsql security definer set search_path='' as $$
declare a public.ugc_v3_artifacts; n integer:=0; inserted integer; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 if p_retry then
  update public.ugc_v3_tasks set status='queued',error_code=null,available_at=now(),lease_token=null,lease_until=null
  where project_id=p_project and kind='delete' and input ? 'referenceCleanup' and status='failed' and (lease_until is null or lease_until<now());
 end if;
 -- One oldest disposable image per role. A failed cleanup does not cause endless automatic retries.
 for a in select distinct on (x.kind) x.* from public.ugc_v3_artifacts x where x.project_id=p_project and x.kind in ('character','product','location') and x.approved_at is null
  and (x.rejected_at is not null or exists(select 1 from public.ugc_v3_artifacts newer where newer.project_id=p_project and newer.kind=x.kind and newer.version>x.version)
   or exists(select 1 from public.ugc_v3_reference_deletions d where d.id=x.id and d.state='prepared' and d.mode='reject')
   or x.version<=coalesce((select max(artifact_version) from public.ugc_v3_reference_deletions where project_id=p_project and kind=x.kind and state='completed'),0))
  and not exists(select 1 from public.ugc_v3_reference_deletions d where d.id=x.id and d.state='prepared' and d.mode='regenerate')
  order by x.kind,x.version loop
  insert into public.ugc_v3_tasks(project_id,kind,request_key,input) values(p_project,'delete','reference-cleanup:'||a.id,
   jsonb_build_object('referenceCleanup',jsonb_build_object('id',a.id,'kind',a.kind,'version',a.version))) on conflict(project_id,request_key) do nothing;
  get diagnostics inserted=row_count;n:=n+inserted;
 end loop;
 return n;
end $$;
create or replace function public.ugc_v3_reference_retention_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; begin
 if new.kind not in ('character','product','location') then return new; end if;
 if tg_op='UPDATE' and (new.approved_at is not null or new.rejected_at is null) then return new; end if;
 select owner_user_id into owner_id from public.ugc_v3_projects where project_id=new.project_id;
 perform public.ugc_v3_queue_reference_cleanup(owner_id,new.project_id,false);return new;
end $$;
drop trigger if exists ugc_v3_reference_retention on public.ugc_v3_artifacts;
create trigger ugc_v3_reference_retention after insert or update of rejected_at on public.ugc_v3_artifacts for each row execute function public.ugc_v3_reference_retention_trigger();
create or replace function public.ugc_v3_location_version_floor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='location' then new.version:=greatest(new.version,coalesce((select max(artifact_version)+1 from public.ugc_v3_reference_deletions where project_id=new.project_id and kind='location' and state='completed'),1));end if;
 return new;
end $$;
drop trigger if exists ugc_v3_location_version_floor on public.ugc_v3_artifacts;
create trigger ugc_v3_location_version_floor before insert on public.ugc_v3_artifacts for each row execute function public.ugc_v3_location_version_floor();

-- An old worker's generic image path cannot submit a v2 task without its per-step intent.
create or replace function public.ugc_v3_simple_location_intent_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='location' and new.input->'locationDirector'->>'version'='location-prompt-v2' and new.provider_started
  and not exists(select 1 from jsonb_array_elements(coalesce(new.output->'requests','[]')) r where r->>'key' in ('plan','sheet') and r->>'status'='intent')
  then raise exception 'V3_LOCATION_WORKER_RESTART_REQUIRED'; end if;
 return new;
end $$;
drop trigger if exists ugc_v3_simple_location_intent on public.ugc_v3_tasks;
create trigger ugc_v3_simple_location_intent before update of provider_started on public.ugc_v3_tasks for each row execute function public.ugc_v3_simple_location_intent_guard();
revoke all on function public.ugc_v3_simple_location_intent_guard() from public,anon,authenticated,service_role;

create or replace function public.ugc_v3_runtime_read(p_owner uuid,p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner) then return null;end if;
 return public.ugc_v3_read(p_owner,p_project)||jsonb_build_object('referenceCleanupPolicy',true,
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by created_at) from public.ugc_v3_tasks t where project_id=p_project),'[]'),
 'artifacts',coalesce((select jsonb_agg(to_jsonb(a) order by version,created_at) from public.ugc_v3_artifacts a where project_id=p_project),'[]'),
 'quotes',coalesce((select jsonb_agg(to_jsonb(q) order by created_at) from public.ugc_v3_quotes q where project_id=p_project),'[]'),
 'runtimeAuthorizations',coalesce((select jsonb_agg(to_jsonb(a) order by created_at) from public.ugc_v3_run_authorizations a where project_id=p_project),'[]'),
 'runs',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('current',public.ugc_v3_runtime_current(package_id)) order by created_at) from public.ugc_v3_runs r where project_id=p_project),'[]'),
 'referenceDeletions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'artifact_version',artifact_version,'state',state,'mode',mode,'errorCode',error_code)) from public.ugc_v3_reference_deletions where project_id=p_project),'[]'),
 'referenceDiagnostics',coalesce((select jsonb_agg(document) from (select distinct on (entity_id) document from public.ugc_v3_runtime_events where project_id=p_project and kind='reference_diagnostic' order by entity_id,id desc) latest),'[]'));
end $$;
revoke all on function public.ugc_v3_discard_reference_prepare(uuid,uuid,uuid,integer,boolean),public.ugc_v3_discard_reference_finish(uuid,uuid,uuid,uuid,text),public.ugc_v3_queue_reference_cleanup(uuid,uuid,boolean),public.ugc_v3_reference_retention_trigger(),public.ugc_v3_location_version_floor() from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_discard_reference_prepare(uuid,uuid,uuid,integer,boolean),public.ugc_v3_discard_reference_finish(uuid,uuid,uuid,uuid,text),public.ugc_v3_queue_reference_cleanup(uuid,uuid,boolean) to service_role;
commit;
