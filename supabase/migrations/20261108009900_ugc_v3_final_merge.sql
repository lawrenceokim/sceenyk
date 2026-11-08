-- Manual after 098. Local merging only; no tables, columns, paid authority or backfill.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_clip_setup()') is null or to_regprocedure('public.ugc_v3_approve_video(uuid,uuid,uuid)') is null
  then raise exception 'Apply V3 migrations through 098 before 099'; end if;
 for t,c in select * from (values
 ('projects','id'),('projects','studio_mode'),('projects','deleted_at'),
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','document'),('ugc_v3_packages','package_hash'),
 ('ugc_v3_runs','id'),('ugc_v3_runs','package_id'),('ugc_v3_runs','project_id'),('ugc_v3_runs','segment_key'),('ugc_v3_runs','state'),('ugc_v3_runs','result'),('ugc_v3_runs','intent'),('ugc_v3_runs','created_at'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','request_key'),('ugc_v3_tasks','status'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','available_at'),('ugc_v3_tasks','error_code'),('ugc_v3_tasks','output'),('ugc_v3_tasks','created_at'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','task_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at')) v(t,c) loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c)
   then raise exception 'Verify merge prerequisite %.%',t,c; end if;
 end loop;
end $$;

create or replace function public.ugc_v3_merge_manifest(p_owner uuid,p_project uuid,p_package uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pkg public.ugc_v3_packages; s jsonb; r public.ugc_v3_runs; clips jsonb:='[]'; manifest jsonb; n integer:=0; begin
 perform 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id
  where v.project_id=p_project and v.owner_user_id=p_owner and p.deleted_at is null and p.studio_mode='pro' for update of v,p;
 if not found then raise exception 'V3_PROJECT_NOT_OWNED'; end if;
 select * into pkg from public.ugc_v3_packages where id=p_package and project_id=p_project;
 if pkg.id is null or not public.ugc_v3_runtime_current(pkg.id) or not public.ugc_v3_clip_package_valid(pkg.document)
  or jsonb_array_length(pkg.document->'segments')<2 then raise exception 'PACKAGE_STALE'; end if;
 for s in select value from jsonb_array_elements(pkg.document->'segments') loop
  select * into r from public.ugc_v3_runs where package_id=pkg.id and segment_key=s->>'id' order by created_at desc,id desc limit 1;
  if r.id is null or r.state<>'approved' or r.result is null or r.result='null'::jsonb
   or r.intent->>'packageHash' is distinct from pkg.package_hash or r.intent->>'segmentHash' is distinct from s->>'fingerprint'
   then raise exception 'V3_MERGE_REQUIRES_APPROVED_CLIPS'; end if;
  if r.result->>'id' is distinct from r.id::text or r.result->>'mimeType' is distinct from 'video/mp4'
   or r.result->>'hasAudio' is distinct from 'true' or coalesce(r.result->>'sha256','') !~ '^[a-f0-9]{64}$'
   or coalesce(r.result->>'etag','')='' or coalesce((r.result->>'sizeBytes')::bigint,0)<=0
   or r.result->>'storageKey' is distinct from 'users/'||p_owner||'/projects/'||p_project||'/v3/'||r.id||'.mp4'
   or abs(coalesce((r.result->>'durationMs')::integer,0)-(s->>'durationMs')::integer)>250
   or least(coalesce((r.result->>'width')::integer,0),coalesce((r.result->>'height')::integer,0))<>replace(pkg.document->'source'->>'resolution','p','')::integer
   or abs(coalesce((r.result->>'width')::numeric,0)/nullif((r.result->>'height')::numeric,0)
    -split_part(pkg.document->'source'->'storyboardContent'->>'aspectRatio',':',1)::numeric/split_part(pkg.document->'source'->'storyboardContent'->>'aspectRatio',':',2)::numeric)>0.01
   then raise exception 'V3_MERGE_SOURCE_INVALID'; end if;
  clips:=clips||jsonb_build_array(jsonb_build_object('clipId',pkg.document->'source'->'storyboardContent'->'clips'->n->>'id',
   'number',n+1,'segmentId',s->>'id','runId',r.id,'startMs',s->'startMs','endMs',s->'endMs','durationMs',s->'durationMs','asset',r.result));
  n:=n+1;
 end loop;
 manifest:=jsonb_build_object('schema','v3-clip-merge-preparation-v1','packageId',pkg.id,'packageHash',pkg.package_hash,
  'storyboard',pkg.document->'source'->'storyboard','resolution',pkg.document->'source'->>'resolution',
  'aspectRatio',pkg.document->'source'->'storyboardContent'->>'aspectRatio','clips',clips);
 return manifest||jsonb_build_object('hash',public.ugc_package_digest('sceenyk-v3-clip-merge-preparation',manifest));
end $$;

create or replace function public.ugc_v3_merge_begin(p_owner uuid,p_project uuid,p_package uuid,p_hash text,p_manifest text) returns uuid
language plpgsql security definer set search_path='' as $$
declare m jsonb; t public.ugc_v3_tasks; a public.ugc_v3_artifacts; attempt integer; begin
 m:=public.ugc_v3_merge_manifest(p_owner,p_project,p_package);
 if m->>'packageHash' is distinct from p_hash or m->>'hash' is distinct from p_manifest then raise exception 'V3_MERGE_INPUTS_CHANGED'; end if;
 select * into t from public.ugc_v3_tasks where project_id=p_project and kind='join' and input->>'manifestHash'=p_manifest order by created_at desc,id desc limit 1;
 if found then
  select * into a from public.ugc_v3_artifacts where task_id=t.id and project_id=p_project;
  if a.id is null or a.rejected_at is null then
   if t.status in ('failed','reconciliation_required') and (t.lease_until is null or t.lease_until<=now()) then
    update public.ugc_v3_tasks set status='queued',error_code=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
   end if;
   return t.id;
  end if;
  if not exists(select 1 from public.ugc_v3_tasks where project_id=p_project and kind='delete' and input->>'artifactId'=a.id::text and status='done')
   then raise exception 'V3_MERGE_DELETE_PENDING'; end if;
 end if;
 select count(*)+1 into attempt from public.ugc_v3_tasks where project_id=p_project and kind='join' and input->>'manifestHash'=p_manifest;
 insert into public.ugc_v3_tasks(project_id,kind,request_key,input) values(p_project,'join','merge:'||p_manifest||':'||attempt,
  jsonb_build_object('packageId',p_package,'packageHash',p_hash,'manifestHash',p_manifest,'manifest',m)) returning * into t;
 return t.id;
end $$;

-- Validate even when a trusted caller accidentally uses the historical enqueue path.
create or replace function public.ugc_v3_merge_task_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb; owner_id uuid; begin
 if new.kind<>'join' or not exists(select 1 from public.ugc_v3_packages where id=(new.input->>'packageId')::uuid and project_id=new.project_id
  and document->'source'->'storyboardContent'->>'version'='director-storyboard-connected-v1') then return new; end if;
 select owner_user_id into owner_id from public.ugc_v3_projects where project_id=new.project_id;
 m:=public.ugc_v3_merge_manifest(owner_id,new.project_id,(new.input->>'packageId')::uuid);
 if new.input->'manifest' is distinct from m or new.input->>'manifestHash' is distinct from m->>'hash'
  or new.input->>'packageHash' is distinct from m->>'packageHash' then raise exception 'V3_MERGE_INPUTS_CHANGED'; end if;
 if exists(select 1 from public.ugc_v3_tasks t left join public.ugc_v3_artifacts a on a.task_id=t.id
  where t.project_id=new.project_id and t.kind='join' and t.input->>'manifestHash'=m->>'hash' and t.request_key<>new.request_key
   and (a.id is null or a.rejected_at is null or not exists(select 1 from public.ugc_v3_tasks d where d.project_id=new.project_id and d.kind='delete' and d.input->>'artifactId'=a.id::text and d.status='done')))
  then raise exception 'V3_MERGE_ALREADY_EXISTS'; end if;
 return new;
end $$;
drop trigger if exists z_v3_merge_task on public.ugc_v3_tasks;
create trigger z_v3_merge_task before insert on public.ugc_v3_tasks for each row when (new.kind='join') execute function public.ugc_v3_merge_task_guard();

-- Replace only M5's deliberate M6 admission stop; every clip/planning branch stays intact.
do $$ declare definition text; old_text text:=$p$elsif new.kind='join' and total>30000 then raise exception 'V3_CLIP_MERGE_NOT_IMPLEMENTED';$p$;
 new_text text:=$p$elsif new.kind='join' and total>30000 then
   if new.input->>'manifestHash' is null then raise exception 'V3_MERGE_INPUTS_CHANGED'; end if;$p$;
begin
 select pg_get_functiondef('public.ugc_v3_connected_story_guard()'::regprocedure) into definition;
 if strpos(definition,new_text)>0 then null;
 elsif (length(definition)-length(replace(definition,old_text,'')))/length(old_text)=1 then execute replace(definition,old_text,new_text);
 else raise exception 'Inspect M5 join admission before 099'; end if;
end $$;

create or replace function public.ugc_v3_merge_document_valid(p_project uuid,d jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare m jsonb; owner_id uuid; expected jsonb; begin
 select owner_user_id into owner_id from public.ugc_v3_projects where project_id=p_project;
 m:=public.ugc_v3_merge_manifest(owner_id,p_project,(d->>'packageId')::uuid);
 select jsonb_agg(jsonb_build_object('runId',c->'runId','assetHash',c->'asset'->'sha256','segmentId',c->'segmentId') order by ord)
  into expected from jsonb_array_elements(m->'clips') with ordinality clips(c,ord);
 return coalesce(d->>'manifestHash'=m->>'hash' and d->>'packageHash'=m->>'packageHash' and d->'segments'=expected,false);
end $$;

create or replace function public.ugc_v3_merge_artifact_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; owner_id uuid; total integer; begin
 if new.kind<>'joined' or not exists(select 1 from public.ugc_v3_packages where id=(new.document->>'packageId')::uuid and project_id=new.project_id
  and document->'source'->'storyboardContent'->>'version'='director-storyboard-connected-v1') then return new; end if;
 if tg_op='UPDATE' and new.document is distinct from old.document then raise exception 'V3_MERGE_IMMUTABLE'; end if;
 -- Stale unwanted output must remain deletable; approval/publication must be current.
 if tg_op='INSERT' or new.approved_at is distinct from old.approved_at then
  if not public.ugc_v3_merge_document_valid(new.project_id,new.document) then raise exception 'V3_MERGE_INPUTS_CHANGED'; end if;
  select * into t from public.ugc_v3_tasks where id=new.task_id and project_id=new.project_id and kind='join';
  select owner_user_id into owner_id from public.ugc_v3_projects where project_id=new.project_id;
  select sum((c->'asset'->>'durationMs')::integer) into total from jsonb_array_elements(t.input->'manifest'->'clips') c;
  if t.id is null or t.input->>'manifestHash' is distinct from new.document->>'manifestHash' or new.id<>t.id
   or new.document->'asset'->>'id' is distinct from t.id::text
   or new.document->'asset'->>'storageKey' is distinct from 'users/'||owner_id||'/projects/'||new.project_id||'/v3/'||t.id||'.mp4'
   or new.document->'asset'->>'mimeType' is distinct from 'video/mp4' or new.document->'asset'->>'hasAudio' is distinct from 'true'
   or coalesce(new.document->'asset'->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(new.document->'asset'->>'etag','')=''
   or coalesce((new.document->'asset'->>'sizeBytes')::bigint,0)<=0
   or least(coalesce((new.document->'asset'->>'width')::integer,0),coalesce((new.document->'asset'->>'height')::integer,0))<>replace(t.input->'manifest'->>'resolution','p','')::integer
   or abs(coalesce((new.document->'asset'->>'width')::numeric,0)/nullif((new.document->'asset'->>'height')::numeric,0)
    -split_part(t.input->'manifest'->>'aspectRatio',':',1)::numeric/split_part(t.input->'manifest'->>'aspectRatio',':',2)::numeric)>0.01
   or abs(coalesce((new.document->'asset'->>'durationMs')::integer,0)-total)>greatest(250,jsonb_array_length(t.input->'manifest'->'clips')*50)
   then raise exception 'V3_MERGE_OUTPUT_INVALID'; end if;
 end if;
 return new;
end $$;
drop trigger if exists z_v3_merge_artifact on public.ugc_v3_artifacts;
create trigger z_v3_merge_artifact before insert or update of document,approved_at on public.ugc_v3_artifacts for each row when (new.kind='joined') execute function public.ugc_v3_merge_artifact_guard();

-- Cover the direct approval RPC's idempotent early return as well as new approvals.
do $$ declare definition text; old_text text:=$p$if a.approved_at is not null then return true; end if;$p$;
 new_text text:=$p$if pkg.document->'source'->'storyboardContent'->>'version'='director-storyboard-connected-v1'
   and not public.ugc_v3_merge_document_valid(p_project,a.document) then raise exception 'V3_MERGE_INPUTS_CHANGED'; end if;
  if a.approved_at is not null then return true; end if;$p$;
begin
 select pg_get_functiondef('public.ugc_v3_approve_video(uuid,uuid,uuid)'::regprocedure) into definition;
 if strpos(definition,new_text)>0 then null;
 elsif (length(definition)-length(replace(definition,old_text,'')))/length(old_text)=1 then execute replace(definition,old_text,new_text);
 else raise exception 'Inspect direct final approval before 099'; end if;
end $$;

create or replace function public.ugc_v3_merge_stage(p_task uuid,p_token uuid,p_stage text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
 if p_stage not in ('validating','merging','saving') then raise exception 'INVALID_MERGE_STAGE'; end if;
 update public.ugc_v3_tasks set output=jsonb_build_object('mergeStage',p_stage) where id=p_task and lease_token=p_token
  and kind='join' and status='running' and lease_until>now();
 if not found then raise exception 'V3_LEASE_LOST'; end if;
 return true;
end $$;
create or replace function public.ugc_v3_merge_setup() returns boolean language sql stable security definer set search_path='' as $$ select true $$;
revoke all on function public.ugc_v3_merge_manifest(uuid,uuid,uuid),public.ugc_v3_merge_begin(uuid,uuid,uuid,text,text),public.ugc_v3_merge_document_valid(uuid,jsonb),
 public.ugc_v3_merge_task_guard(),public.ugc_v3_merge_artifact_guard(),public.ugc_v3_merge_stage(uuid,uuid,text),public.ugc_v3_merge_setup() from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_merge_manifest(uuid,uuid,uuid),public.ugc_v3_merge_begin(uuid,uuid,uuid,text,text),public.ugc_v3_merge_stage(uuid,uuid,text),public.ugc_v3_merge_setup() to service_role;
commit;
