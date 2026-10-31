-- Manual after 082. Location-only stages; no new tables, backfill, model or financial changes.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_record_reference_diagnostic(uuid,uuid,jsonb)') is null then raise exception 'Apply 082 first'; end if;
 for t,c in select * from (values
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','output'),('ugc_v3_tasks','status'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','request_key'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','available_at'),('ugc_v3_tasks','error_code'),('ugc_v3_tasks','created_at'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),('ugc_v3_artifacts','version'),
 ('ugc_v3_sources','project_id'),('ugc_v3_sources','revision'),('ugc_v3_sources','input'),('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','source_revision'),('ugc_v3_runs','state'),('ugc_v3_runs','package_id'),
 ('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document'),
 ('projects','id'),('projects','deleted_at'),('projects','title'),('projects','prompt'),('projects','aspect_ratio'),('projects','duration'),('projects','visual_style'),('projects','tone'),('projects','category'),('projects','ugc_type'),
 ('project_assets','project_id'),('project_assets','studio_role'),('project_assets','upload_status'),('project_assets','removed_from_draft'),('project_assets','reference_name')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify Location prerequisite %.%',t,c; end if;
 end loop;
end $$;

-- Scoped decimal-number canonicalization; existing integer-only package/Character/Product recipes are untouched.
create or replace function public.ugc_v3_location_decimal_identity(d jsonb) returns jsonb
language plpgsql immutable security definer set search_path='' as $$
begin
 if jsonb_typeof(d)='number' then return to_jsonb(trim_scale((d#>>'{}')::numeric)::text);
 elsif jsonb_typeof(d)='array' then return coalesce((select jsonb_agg(public.ugc_v3_location_decimal_identity(value) order by ord) from jsonb_array_elements(d) with ordinality a(value,ord)),'[]'::jsonb);
 elsif jsonb_typeof(d)='object' then return coalesce((select jsonb_object_agg(key,public.ugc_v3_location_decimal_identity(value)) from jsonb_each(d)),'{}'::jsonb);
 else return d; end if;
end $$;

create or replace function public.ugc_v3_location_input_current(p_project uuid,d jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare brief jsonb; ids jsonb:='[]'; bindings jsonb:='[]'; k text; ref public.ugc_v3_artifacts; kinds text[]:=array['character']; begin
 select jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,
 'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type) into brief from public.projects p where p.id=p_project and p.deleted_at is null;
 if brief is null or d->'generationContext' is distinct from public.ugc_v3_generation_context(p_project)
  or d->>'briefHash' is distinct from public.ugc_package_digest('sceenyk-v3-brief',brief) then return false; end if;
 if exists(select 1 from public.ugc_v3_tasks where project_id=p_project and kind in ('character','product') and status in ('queued','running','reconciliation_required')) then return false; end if;
 if d->'names' is distinct from jsonb_build_object(
  'character',coalesce((select reference_name from public.project_assets where project_id=p_project and studio_role='character' and upload_status='uploaded' and not removed_from_draft limit 1),''),
  'product',coalesce((select reference_name from public.project_assets where project_id=p_project and studio_role='product' and upload_status='uploaded' and not removed_from_draft limit 1),'')) then return false; end if;
 if exists(select 1 from public.project_assets where project_id=p_project and studio_role='product' and upload_status='uploaded' and not removed_from_draft) then kinds:=array_append(kinds,'product'); end if;
 foreach k in array kinds loop
  select * into ref from public.ugc_v3_artifacts where project_id=p_project and kind=k order by version desc limit 1;
  if not found or ref.approved_at is null or ref.rejected_at is not null or not public.ugc_v3_artifact_current(ref.id) then return false; end if;
  ids:=ids||jsonb_build_array(ref.id::text);
  bindings:=bindings||jsonb_build_array(jsonb_build_object('id',ref.id,'version',ref.version,'sha256',ref.document->'asset'->>'sha256','role',ref.kind));
 end loop;
 return d->'references' is not distinct from ids and d->'referenceBindings' is not distinct from bindings;
end $$;

create or replace function public.ugc_v3_location_action(p_owner uuid,p_project uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; previous public.ugc_v3_tasks; d jsonb; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 if p_action='enqueue' then
  d:=p_payload->'input';
  if d->'locationDirector'->>'version' is distinct from 'ai-location-director-v1' or d->>'provider' is distinct from 'openai'
   or coalesce(d->>'directorModel','') !~ '^[a-zA-Z0-9._:-]{1,200}$' or coalesce(d->>'model','') !~ '^[a-zA-Z0-9._:-]{1,200}$'
   or not public.ugc_v3_location_input_current(p_project,d) then raise exception 'V3_LOCATION_INPUT_MISMATCH'; end if;
  select * into previous from public.ugc_v3_tasks where project_id=p_project and kind='location' order by created_at desc,id desc limit 1 for update;
  -- A delayed duplicate is bound to the prior task/artifact and cannot create another run.
  if found and previous.request_key=p_payload->>'requestKey' then return public.ugc_v3_runtime_read(p_owner,p_project); end if;
  if previous.id is not null then
   if d->>'previousTask' is distinct from previous.id::text then return public.ugc_v3_runtime_read(p_owner,p_project); end if;
   if previous.status in ('queued','running') or previous.lease_until>now() then return public.ugc_v3_runtime_read(p_owner,p_project); end if;
   if previous.status='reconciliation_required' or exists(select 1 from jsonb_array_elements(coalesce(previous.output->'requests','[]')) r where r->>'status'='intent') then raise exception 'V3_LOCATION_OUTCOME_UNKNOWN'; end if;
   if previous.provider_started and previous.output is null then raise exception 'V3_LOCATION_OUTCOME_UNKNOWN'; end if;
  elsif d->>'previousTask' is not null then raise exception 'V3_LOCATION_REQUEST_CHANGED'; end if;
  if exists(select 1 from public.ugc_v3_artifacts a where a.project_id=p_project and a.kind='location' and a.approved_at is null and a.rejected_at is null
   and not exists(select 1 from public.ugc_v3_artifacts n where n.project_id=p_project and n.kind='location' and n.version>a.version)) then raise exception 'REVIEW_EXISTING_REFERENCE_FIRST'; end if;
  perform public.ugc_v3_runtime_action(p_owner,p_project,'enqueue',jsonb_build_object('kind','location','input',d,'requestKey',p_payload->>'requestKey'));
 elsif p_action in ('recover','continue') then
  select * into t from public.ugc_v3_tasks where id=(p_payload->>'id')::uuid and project_id=p_project and kind='location' and input->'locationDirector'->>'version'='ai-location-director-v1' for update;
  if not found then raise exception 'V3_LOCATION_REQUEST_CHANGED'; end if;
  if t.status in ('queued','running','done') then return public.ugc_v3_runtime_read(p_owner,p_project); end if;
  if p_action='continue' and t.error_code is distinct from 'V3_LOCATION_CONTINUE_REQUIRED' then raise exception 'V3_LOCATION_CONTINUE_UNAVAILABLE'; end if;
  if t.lease_until>now() or not public.ugc_v3_location_input_current(p_project,t.input) then raise exception 'V3_CREATIVE_INPUT_STALE'; end if;
  if exists(select 1 from public.ugc_v3_tasks n where n.project_id=p_project and n.kind='location' and n.created_at>t.created_at) then raise exception 'V3_LOCATION_REQUEST_CHANGED'; end if;
  if p_action='continue' and exists(select 1 from jsonb_array_elements(coalesce(t.output->'requests','[]')) r where r->>'status' in ('intent','rejected')) then raise exception 'V3_LOCATION_OUTCOME_UNKNOWN'; end if;
  update public.ugc_v3_tasks set output=jsonb_set(output,'{recoveryOnly}',to_jsonb(p_action='recover')),
   status='queued',error_code=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
  insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,t.id,'location_'||p_action,jsonb_build_object('newProviderRequest',p_action='continue'));
 else raise exception 'V3_LOCATION_ACTION_INVALID'; end if;
 return public.ugc_v3_runtime_read(p_owner,p_project);
end $$;

create or replace function public.ugc_v3_location_checkpoint(p_task uuid,p_token uuid,p_action text,p_document jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; s jsonb; req jsonb; key text; next_phase text; idx integer; pid uuid; begin
 select project_id into pid from public.ugc_v3_tasks where id=p_task;
 perform 1 from public.ugc_v3_projects where project_id=pid for update;
 perform 1 from public.projects where id=pid and deleted_at is null for update;
 select * into t from public.ugc_v3_tasks where id=p_task and lease_token=p_token and status='running' and lease_until>now()
  and kind='location' and input->'locationDirector'->>'version'='ai-location-director-v1' for update;
 if not found then return false; end if;
 s:=coalesce(t.output,jsonb_build_object('schema','ai-location-director-v1','phase','plan','requests','[]'::jsonb,'blueprint',null,'blueprintHash',null,'quality',null,'sheetId',null,'recoveryOnly',false,'errorCode',null));
 key:=p_document->>'key';
 if p_action in ('intent','advance') and not public.ugc_v3_location_input_current(t.project_id,t.input) then raise exception 'V3_CREATIVE_INPUT_STALE'; end if;
 if p_action='intent' then
  if key is distinct from s->>'phase' or key not in ('plan','sheet','check','repair','recheck') or s->>'recoveryOnly'='true' then raise exception 'V3_LOCATION_PROVIDER_FORBIDDEN'; end if;
  if exists(select 1 from jsonb_array_elements(s->'requests') r where r->>'key'=key) then return false; end if;
  if jsonb_array_length(s->'requests')>=5 then raise exception 'V3_LOCATION_REQUEST_LIMIT'; end if;
  req:=jsonb_build_object('key',key,'id',(p_document->>'id')::uuid,'status','intent','httpStatus',null,'requestId',null,'responseId',null,'responseHash',null);
  s:=jsonb_set(s,'{requests}',(s->'requests')||jsonb_build_array(req));
  update public.ugc_v3_tasks set provider_started=true,output=s where id=t.id;
 elsif p_action='receipt' then
  select ord::integer-1,r into idx,req from jsonb_array_elements(s->'requests') with ordinality a(r,ord) where r->>'key'=key;
  if req is null or p_document->>'status' not in ('saved','rejected') then raise exception 'V3_LOCATION_RECEIPT_INVALID'; end if;
  if req->>'status'<>'intent' then return req->>'responseHash' is not distinct from p_document->>'responseHash'; end if;
  req:=req||jsonb_build_object('status',p_document->>'status','responseHash',p_document->>'responseHash',
   'httpStatus',case when (p_document->>'httpStatus')::integer between 100 and 599 then p_document->'httpStatus' else 'null'::jsonb end,
   'requestId',case when p_document->>'requestId' ~ '^[a-zA-Z0-9_-]{1,200}$' then p_document->>'requestId' else null end,
   'responseId',case when p_document->>'responseId' ~ '^[a-zA-Z0-9_-]{1,200}$' then p_document->>'responseId' else null end,'usage',p_document->'usage');
  update public.ugc_v3_tasks set output=jsonb_set(s,array['requests',idx::text],req) where id=t.id;
 elsif p_action='advance' then
  next_phase:=p_document->>'phase';
  if not ((s->>'phase'='plan' and next_phase='sheet') or (s->>'phase'='sheet' and next_phase='check') or
   (s->>'phase'='check' and next_phase in ('repair','publish')) or (s->>'phase'='repair' and next_phase='recheck') or (s->>'phase'='recheck' and next_phase='publish'))
   or not exists(select 1 from jsonb_array_elements(s->'requests') r where r->>'key'=s->>'phase' and r->>'status'='saved') then raise exception 'V3_LOCATION_STAGE_INVALID'; end if;
  s:=s||(p_document-'requests'-'recoveryOnly'-'schema')||jsonb_build_object('errorCode',null);
  update public.ugc_v3_tasks set output=s,status='queued',error_code=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
 elsif p_action='failure' then
  if p_document->>'code' !~ '^[A-Z0-9_]{1,100}$' then raise exception 'V3_LOCATION_DIAGNOSTIC_INVALID'; end if;
  update public.ugc_v3_tasks set output=s||jsonb_build_object('errorCode',p_document->>'code')||case when jsonb_typeof(p_document->'quality')='object' then jsonb_build_object('quality',p_document->'quality') else '{}'::jsonb end,status=case when p_document->>'unknown'='true' then 'reconciliation_required' else 'failed' end,
   error_code=p_document->>'code',lease_token=null,lease_until=null where id=t.id;
 else raise exception 'V3_LOCATION_ACTION_INVALID'; end if;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(t.project_id,t.id,'location_'||p_action,
  case when p_action='advance' then jsonb_build_object('phase',p_document->>'phase','blueprintHash',p_document->>'blueprintHash') else p_document-'usage' end);
 return true;
end $$;

-- Applies only to new Location Director artifacts. Other reference pipelines/functions stay intact.
create or replace function public.ugc_v3_location_artifact_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare q jsonb; panel jsonb; flag jsonb; k text; begin
 if new.kind<>'location' or new.document->'input'->'locationDirector'->>'version' is distinct from 'ai-location-director-v1' then return new; end if;
 if tg_op='UPDATE' and new.approved_at is not distinct from old.approved_at then return new; end if;
 if not public.ugc_v3_location_input_current(new.project_id,new.document->'input') then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
 if new.document->>'blueprintHash' is distinct from public.ugc_package_digest('sceenyk-v3-location-blueprint',public.ugc_v3_location_decimal_identity(new.document->'blueprint'))
  or new.document->'blueprint'->>'feasible' is distinct from 'true'
  or new.document->'blueprint' is distinct from new.document->'location'->'blueprint'
  or new.document->>'blueprintHash' is distinct from new.document->'location'->>'blueprintHash'
  or new.document->'location'->>'phase' is distinct from 'complete'
  or new.document->'quality' is distinct from new.document->'location'->'quality'
  or new.document->'asset'->>'width' is distinct from '1024' or new.document->'asset'->>'height' is distinct from '1024'
  or new.document->'asset'->>'mimeType' is distinct from 'image/png' then raise exception 'V3_LOCATION_UNSUITABLE'; end if;
 q:=new.document->'quality';
 if q->>'equalGrid' is distinct from 'true' or q->>'sameEnvironment' is distinct from 'true' or q->>'blueprintFit' is distinct from 'true' or q->>'noUnrelatedObjects' is distinct from 'true'
  or (select count(*) from jsonb_object_keys(q->'panels'))<>4 then raise exception 'V3_LOCATION_QUALITY_FAILED'; end if;
 foreach k in array array['aerial','eyeLevel','elevated','pov'] loop
  panel:=q->'panels'->k;
  if panel is null or jsonb_array_length(panel->'issues') is distinct from 0 or
   (select count(*) from jsonb_object_keys(panel))<>8 then raise exception 'V3_LOCATION_QUALITY_FAILED'; end if;
  if not (panel ?& array['correctView','architecture','layout','lighting','style','empty','space','issues']) then raise exception 'V3_LOCATION_QUALITY_FAILED'; end if;
  for flag in select value from jsonb_each(panel-'issues') loop
   if flag is distinct from 'true'::jsonb then raise exception 'V3_LOCATION_QUALITY_FAILED'; end if;
  end loop;
 end loop;
 return new;
end $$;
drop trigger if exists ugc_v3_location_artifact_validation on public.ugc_v3_artifacts;
create trigger ugc_v3_location_artifact_validation before insert or update of approved_at on public.ugc_v3_artifacts for each row execute function public.ugc_v3_location_artifact_guard();

-- Only downstream work containing a new Location Director reference gets the additional binding check.
-- Existing currentness functions and Character/Product pipelines are deliberately not rewritten.
create or replace function public.ugc_v3_location_dependency_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb; loc public.ugc_v3_artifacts; begin
 if tg_table_name='ugc_v3_artifacts' then
  if new.kind<>'storyboard' then return new; end if;
  for loc in select a.* from public.ugc_v3_artifacts a where a.project_id=new.project_id and a.kind='location'
   and coalesce(new.document->'input'->'references','[]') ? a.id::text loop
   if loc.document->'input'->'locationDirector'->>'version'='ai-location-director-v1' and not public.ugc_v3_location_input_current(loc.project_id,loc.document->'input') then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
  end loop;
  return new;
 elsif tg_table_name='ugc_v3_sources' then d:=new.input;
 elsif tg_table_name='ugc_v3_runs' then
  if new.state<>'submitting' or old.state<>'queued' then return new; end if;
  select s.input into d from public.ugc_v3_packages p join public.ugc_v3_sources s on s.project_id=p.project_id and s.revision=p.source_revision where p.id=new.package_id;
 else return new; end if;
 for loc in select a.* from public.ugc_v3_artifacts a where a.kind='location' and exists(select 1 from jsonb_array_elements(coalesce(d->'references','[]')) r where r->>'role'='location' and r->>'id'=a.id::text) loop
  if loc.document->'input'->'locationDirector'->>'version'='ai-location-director-v1' and not public.ugc_v3_location_input_current(loc.project_id,loc.document->'input') then raise exception 'REFERENCE_STALE_REGENERATE'; end if;
 end loop;
 return new;
end $$;
drop trigger if exists ugc_v3_location_storyboard_binding on public.ugc_v3_artifacts;
create trigger ugc_v3_location_storyboard_binding before insert or update of approved_at on public.ugc_v3_artifacts for each row execute function public.ugc_v3_location_dependency_guard();
drop trigger if exists ugc_v3_location_source_binding on public.ugc_v3_sources;
create trigger ugc_v3_location_source_binding before insert on public.ugc_v3_sources for each row execute function public.ugc_v3_location_dependency_guard();
drop trigger if exists ugc_v3_location_video_binding on public.ugc_v3_runs;
create trigger ugc_v3_location_video_binding before update of state on public.ugc_v3_runs for each row execute function public.ugc_v3_location_dependency_guard();
revoke all on function public.ugc_v3_location_dependency_guard() from public,anon,authenticated,service_role;
revoke all on function public.ugc_v3_location_input_current(uuid,jsonb),public.ugc_v3_location_action(uuid,uuid,text,jsonb),public.ugc_v3_location_checkpoint(uuid,uuid,text,jsonb),public.ugc_v3_location_artifact_guard() from public,anon,authenticated,service_role;
revoke all on function public.ugc_v3_location_decimal_identity(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_location_input_current(uuid,jsonb),public.ugc_v3_location_action(uuid,uuid,text,jsonb),public.ugc_v3_location_checkpoint(uuid,uuid,text,jsonb) to service_role;
commit;
