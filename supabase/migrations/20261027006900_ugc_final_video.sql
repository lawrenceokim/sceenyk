-- Manual after 068. Local operator-funded M10 only; no financial table changes.
begin;
do $$ declare r record; t text; begin
 for r in select * from (values
  ('ugc_generation_packages','id','uuid'),('ugc_generation_packages','input','jsonb'),('ugc_generation_packages','document','jsonb'),
  ('ugc_generation_packages','state','text'),('ugc_generation_packages','stale_at','timestamp with time zone'),
  ('ugc_generation_packages','package_hash','text'),('ugc_generation_packages','owner_user_id','uuid'),
  ('ugc_generation_packages','project_id','uuid'),('ugc_generation_packages','job_id','uuid'),('ugc_generation_packages','revision','integer'),
  ('ugc_generation_packages','input_fingerprint','text'),('app_users','id','uuid'),
  ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','status','text'),('ugc_generation_jobs','stage','text'),
  ('ugc_generation_jobs','owner_user_id','uuid'),('ugc_generation_jobs','project_id','uuid'),('ugc_generation_jobs','resume_stage','text'),
  ('ugc_generation_jobs','completed_at','timestamp with time zone'),('ugc_generation_jobs','cancellation_requested_at','timestamp with time zone'),
  ('ugc_generation_jobs','failed_at','timestamp with time zone'),('ugc_generation_jobs','cancelled_at','timestamp with time zone'),
  ('ugc_generation_jobs','error_code','text'),('ugc_generation_jobs','safe_error_message','text'),('ugc_generation_jobs','pause_reason','text'),
  ('ugc_generation_jobs','retry_eligible','boolean'),('ugc_generation_jobs','next_retry_at','timestamp with time zone'),
  ('ugc_generation_jobs','worker_id','uuid'),('ugc_generation_jobs','claim_token','uuid'),
  ('ugc_generation_jobs','claimed_at','timestamp with time zone'),('ugc_generation_jobs','lease_expires_at','timestamp with time zone'),
  ('ugc_generation_jobs','heartbeat_at','timestamp with time zone'),('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text')
 ) v(table_name,column_name,data_type) loop
  if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name
   and c.column_name=r.column_name and c.data_type=r.data_type) then raise exception 'M10 prerequisite: %.%',r.table_name,r.column_name; end if;
 end loop;
 if to_regprocedure('public.ugc_package_input(uuid)') is null or to_regprocedure('public.ugc_package_valid(jsonb,jsonb,integer,text)') is null
  or to_regprocedure('public.ugc_storyboard_lock(uuid)') is null or to_regprocedure('public.ugc_package_digest(text,jsonb)') is null
  or to_regprocedure('public.ugc_reject_event_mutation()') is null then raise exception 'Apply 068 and prerequisites first'; end if;
 foreach t in array array['ugc_final_executions','ugc_final_scenes','ugc_final_operations','ugc_character_voice_profiles','ugc_final_events'] loop
  if to_regclass('public.'||t) is not null and obj_description(to_regclass('public.'||t),'pg_class') is distinct from 'sceenyk-ugc-final-v1-069'
   then raise exception 'Inspect existing M10 relation: %',t; end if;
 end loop;
end $$;

create table if not exists public.ugc_final_executions (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.app_users(id), project_id uuid not null,
 job_id uuid not null references public.ugc_generation_jobs(id), package_id uuid not null references public.ugc_generation_packages(id),
 package_hash text not null check(package_hash ~ '^[a-f0-9]{64}$'), package_version integer not null,
 version integer not null default 1, revision integer not null default 1, request_id uuid not null,
 configuration jsonb not null, configuration_hash text not null check(configuration_hash ~ '^[a-f0-9]{64}$'),
 profile jsonb, profile_binding jsonb,
 state text not null default 'queued' check(state in ('queued','running','review','approved','failed','reconciling','deleting','deleted')),
 phase text not null default 'queued', error_code text, final_asset jsonb, final_fingerprint text, approved_at timestamptz,
 paid_requests integer not null default 0 check(paid_requests between 0 and 64), estimated_cost_microusd bigint not null default 0,
 claim_token uuid, worker_id uuid, lease_expires_at timestamptz, heartbeat_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(owner_user_id,request_id), foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id),
 check((state='approved')=(approved_at is not null)), check(version>0 and revision>0),
 check(state<>'running' or claim_token is not null), check((claim_token is null)=(lease_expires_at is null))
);
create unique index if not exists ugc_final_one_package on public.ugc_final_executions(package_id,configuration_hash);
create unique index if not exists ugc_final_one_active_job on public.ugc_final_executions(job_id) where state not in ('deleted','approved');
create table if not exists public.ugc_final_scenes (
 execution_id uuid not null references public.ugc_final_executions(id), scene_id text not null, scene_number integer not null,
 scene_hash text not null, phase text not null default 'queued', output jsonb, manifest jsonb,
 updated_at timestamptz not null default clock_timestamp(), primary key(execution_id,scene_id), unique(execution_id,scene_number)
);
create table if not exists public.ugc_final_operations (
 id uuid primary key default gen_random_uuid(), execution_id uuid not null references public.ugc_final_executions(id),
 owner_user_id uuid not null references public.app_users(id), project_id uuid not null, operation_key text not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'), kind text not null check(kind in ('video','design','binding','voice','lip_sync','composition')),
 scene_id text, provider text not null, model text not null, input jsonb not null,
 state text not null default 'intent' check(state in ('intent','submitted','result','ready','failed')),
 request_id text, receipt jsonb, output jsonb, attempt integer not null default 1 check(attempt=1),
 estimated_cost_microusd bigint not null default 0 check(estimated_cost_microusd>=0), error_code text,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(execution_id,operation_key), unique(execution_id,fingerprint),
 foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id)
);
create table if not exists public.ugc_character_voice_profiles (
 id text primary key check(id ~ '^[a-f0-9]{64}$'), owner_user_id uuid not null references public.app_users(id),
 project_id uuid not null, profile jsonb not null, provider_binding jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id)
);
create table if not exists public.ugc_final_events (
 id bigint generated always as identity primary key, execution_id uuid not null references public.ugc_final_executions(id),
 version integer not null, state text not null, phase text not null, error_code text,
 created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['ugc_final_executions','ugc_final_scenes','ugc_final_operations','ugc_character_voice_profiles','ugc_final_events'] loop
  execute format('comment on table public.%I is %L',t,'sceenyk-ugc-final-v1-069');
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to service_role',t);
 end loop;
end $$;
drop trigger if exists ugc_final_events_immutable on public.ugc_final_events;
create trigger ugc_final_events_immutable before update or delete on public.ugc_final_events for each row execute function public.ugc_reject_event_mutation();
drop trigger if exists ugc_voice_profiles_immutable on public.ugc_character_voice_profiles;
create trigger ugc_voice_profiles_immutable before update or delete on public.ugc_character_voice_profiles for each row execute function public.ugc_reject_event_mutation();

create or replace function public.ugc_final_current(p_execution uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select p.state='approved' and p.stale_at is null and p.package_hash=e.package_hash and p.revision=e.package_version
  and p.owner_user_id=e.owner_user_id and p.project_id=e.project_id and p.job_id=e.job_id
  and public.ugc_package_input(e.job_id)=p.input and public.ugc_package_valid(p.document,p.input,p.revision,p.input_fingerprint)
  and j.cancellation_requested_at is null and j.status<>'cancelled'
  from public.ugc_final_executions e join public.ugc_generation_packages p on p.id=e.package_id
   join public.ugc_generation_jobs j on j.id=e.job_id where e.id=p_execution),false);
$$;
create or replace function public.ugc_final_asset_valid(a jsonb,e public.ugc_final_executions) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(a)='object' and a->>'sha256' ~ '^[a-f0-9]{64}$' and length(a->>'etag')>0
  and a->>'key' like ('ugc/'||e.owner_user_id||'/'||e.project_id||'/'||e.job_id||'/final-video-v1/'||e.id||'/%')
  and a->>'key' !~ '(\.\.|[?])' and (a->>'sizeBytes')::bigint between 1 and 268435456
  and (a->>'durationMs')::integer between 1 and 120000 and a->>'mimeType' in ('video/mp4','audio/mpeg','audio/wav')
  and jsonb_typeof(a->'hasAudio')='boolean' and (a->>'width')::integer>=0 and (a->>'height')::integer>=0
  and (a->>'sampleRate')::integer>=0 and (a->>'channels')::integer>=0,false);
$$;
-- Audit is AFTER because the event foreign key must see the inserted execution.
create or replace function public.ugc_final_event() returns trigger language plpgsql set search_path='' as $$
begin
 insert into public.ugc_final_events(execution_id,version,state,phase,error_code) values(new.id,new.version,new.state,new.phase,new.error_code); return new;
end $$;
create or replace function public.ugc_final_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.id,new.owner_user_id,new.project_id,new.job_id,new.package_id,new.package_hash,new.package_version,new.configuration,new.configuration_hash,new.profile,new.created_at)
  is distinct from row(old.id,old.owner_user_id,old.project_id,old.job_id,old.package_id,old.package_hash,old.package_version,old.configuration,old.configuration_hash,old.profile,old.created_at)
  then raise exception 'Immutable final execution identity'; end if;
 if old.state='approved' then raise exception 'Approved final is immutable'; end if;
 if old.profile_binding is not null and new.profile_binding is distinct from old.profile_binding then raise exception 'Voice binding is immutable'; end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;
drop trigger if exists ugc_final_guard on public.ugc_final_executions;
create trigger ugc_final_guard before update on public.ugc_final_executions for each row execute function public.ugc_final_guard();
drop trigger if exists ugc_final_event on public.ugc_final_executions;
create trigger ugc_final_event after insert or update on public.ugc_final_executions for each row execute function public.ugc_final_event();

create or replace function public.ugc_final_scene_valid(p_execution uuid,p_scene text,m jsonb,a jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare e public.ugc_final_executions; d jsonb; line jsonb; v public.ugc_final_operations; o public.ugc_final_operations;
 g public.ugc_final_operations; sync_op public.ugc_final_operations; composed public.ugc_final_operations; n integer:=0; mouths integer:=0; i integer:=0;
 guide_hashes jsonb:='[]'; guide_windows jsonb:='[]'; audio_hashes jsonb:='[]'; begin
 select * into e from public.ugc_final_executions where id=p_execution;
 select s.value into d from public.ugc_generation_packages p,jsonb_array_elements(p.document->'scenes') s where p.id=e.package_id and s.value->>'id'=p_scene;
 if d is null or jsonb_typeof(m->'voiceOperations') is distinct from 'array' or not public.ugc_final_asset_valid(a,e) or a->>'mimeType'<>'video/mp4'
  or abs((a->>'durationMs')::integer-(d->>'durationMs')::integer)>50 then return false; end if;
 select * into v from public.ugc_final_operations where id=(m->>'videoOperation')::uuid and execution_id=e.id and scene_id=p_scene and kind='video' and state='ready';
 if v.id is null or v.input->'scene' is distinct from d or not public.ugc_final_asset_valid(v.output,e) then return false; end if;
 for line in select value from jsonb_array_elements(d->'speech') where length(btrim(value->>'text'))>0 loop
  select x.* into o from jsonb_array_elements_text(m->'voiceOperations') ids
   join public.ugc_final_operations x on x.id=ids.value::uuid
   where x.execution_id=e.id and x.scene_id=p_scene and x.kind='voice' and x.state='ready' and (x.input->>'segmentIndex')::integer=i;
  if o.id is null or o.input->>'text' is distinct from line->>'text' or o.input->'startMs' is distinct from line->'startMs'
   or o.input->'endMs' is distinct from line->'endMs' or o.input->>'delivery' is distinct from line->>'delivery'
   or o.input->>'profileId' is distinct from e.profile->>'id' or not public.ugc_final_asset_valid(o.output,e)
   or (o.output->>'durationMs')::integer>((line->>'endMs')::integer-(line->>'startMs')::integer+50) then return false; end if;
  n:=n+1; i:=i+1; audio_hashes:=audio_hashes||jsonb_build_array(o.output->>'sha256');
  if line->>'speaker'='character' then
   mouths:=mouths+1; guide_hashes:=guide_hashes||jsonb_build_array(o.output->>'sha256');
   guide_windows:=guide_windows||jsonb_build_array(jsonb_build_array((line->>'startMs')::integer-(d->>'startMs')::integer,(line->>'endMs')::integer-(line->>'startMs')::integer));
  end if;
 end loop;
 if jsonb_array_length(m->'voiceOperations')<>n or (n>0 and (e.profile_binding is null or m->>'profileId' is distinct from e.profile->>'id' or a->>'hasAudio'<>'true')) then return false; end if;
 if mouths>0 then
  select * into g from public.ugc_final_operations where execution_id=e.id and operation_key='guide:'||p_scene and kind='composition' and state='ready';
  select * into sync_op from public.ugc_final_operations where id=(m->>'syncOperation')::uuid and execution_id=e.id and scene_id=p_scene and kind='lip_sync' and state='ready';
  if g.id is null or sync_op.id is null or g.input->'hashes' is distinct from guide_hashes or g.input->'windows' is distinct from guide_windows
   or sync_op.input->>'videoHash' is distinct from v.output->>'sha256' or sync_op.input->>'audioGuideHash' is distinct from g.output->>'sha256'
   or sync_op.input->>'profileId' is distinct from e.profile->>'id' or not public.ugc_final_asset_valid(sync_op.output,e) then return false; end if;
 elsif m->>'syncOperation' is not null then return false; end if;
 select * into composed from public.ugc_final_operations where execution_id=e.id and scene_id=p_scene and operation_key='scene:'||p_scene and kind='composition' and state='ready';
 if composed.id is null or composed.output is distinct from a or composed.input->'audioHashes' is distinct from audio_hashes
  or composed.input->>'videoHash' is distinct from v.output->>'sha256' or composed.input->>'syncId' is distinct from m->>'syncOperation'
  or composed.input->'durationMs' is distinct from d->'durationMs' then return false; end if;
 return true;
exception when others then return false;
end $$;

create or replace function public.ugc_final_result_valid(p_execution uuid,a jsonb,f text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare e public.ugc_final_executions; d jsonb; hashes jsonb; expected text; o public.ugc_final_operations; w integer; h integer; begin
 select * into e from public.ugc_final_executions where id=p_execution;
 select document into d from public.ugc_generation_packages where id=e.package_id;
 if not public.ugc_final_current(e.id) or not public.ugc_final_asset_valid(a,e) or a->>'mimeType' is distinct from 'video/mp4'
  or abs((a->>'durationMs')::integer-(d->'timeline'->>'totalDurationMs')::integer)>50
  or (select count(*) from public.ugc_final_scenes where execution_id=e.id)<>jsonb_array_length(d->'scenes')
  or exists(select 1 from jsonb_array_elements(d->'scenes') ds left join public.ugc_final_scenes s on s.execution_id=e.id and s.scene_id=ds.value->>'id'
    where s.execution_id is null or s.scene_number<>(ds.value->>'number')::integer or s.scene_hash<>public.ugc_package_digest('sceenyk-final-scene',ds.value)
     or s.phase<>'scene_ready' or not public.ugc_final_scene_valid(e.id,s.scene_id,s.manifest,s.output)) then return false; end if;
 w:=case when d->'output'->>'aspectRatio'='16:9' then 1280 else 720 end;
 h:=case when d->'output'->>'aspectRatio'='9:16' then 1280 else 720 end;
 if (a->>'width')::integer is distinct from w or (a->>'height')::integer is distinct from h
  or ((d->'requirements'->>'dialogue'='true' or d->'requirements'->>'narration'='true') and a->>'hasAudio' is distinct from 'true') then return false; end if;
 select jsonb_agg(output->>'sha256' order by scene_number) into hashes from public.ugc_final_scenes where execution_id=e.id;
 expected:=public.ugc_package_digest('sceenyk-final-composition',jsonb_build_object('packageHash',e.package_hash,'packageVersion',e.package_version,
   'sceneHashes',hashes,'configurationHash',e.configuration_hash,'revision',e.revision));
 select * into o from public.ugc_final_operations where execution_id=e.id and operation_key='final:'||e.revision and kind='composition' and state='ready';
 return coalesce(f=expected and o.output=a and o.input->>'fingerprint'=expected and o.input->'sceneHashes'=hashes,false);
exception when others then return false;
end $$;

create or replace function public.ugc_final_action(p_owner uuid,p_project uuid,p_job uuid,p_action text,p_payload jsonb)
returns public.ugc_final_executions language plpgsql security definer set search_path='' as $$
declare e public.ugc_final_executions; p public.ugc_generation_packages; s jsonb; cfg jsonb; begin
 perform public.ugc_storyboard_lock(p_job);
 if not exists(select 1 from public.ugc_generation_jobs j join public.projects pr on pr.id=j.project_id
  where j.id=p_job and j.owner_user_id=p_owner and j.project_id=p_project and pr.owner_user_id=p_owner and pr.status='draft') then return null; end if;
 if p_action='generate' then
  select * into p from public.ugc_generation_packages where id=(p_payload->>'packageId')::uuid and job_id=p_job and owner_user_id=p_owner and project_id=p_project for update;
  cfg:=p_payload->'configuration';
  if p.id is null or p.state<>'approved' or p.stale_at is not null or public.ugc_package_input(p_job) is distinct from p.input
   or not public.ugc_package_valid(p.document,p.input,p.revision,p.input_fingerprint) then return null; end if;
  if not coalesce(jsonb_typeof(cfg)='object' and cfg->>'funding'='operator_funded' and cfg->>'version'='ugc-final-v1'
   and cfg ?& array['maxRequests','maxEstimatedCostMicrousd','ceilings','providers','authorizationId','language','output']
   and (cfg->>'maxRequests')::integer between 1 and 64 and (cfg->>'maxEstimatedCostMicrousd')::bigint between 1 and 1000000000
   and p_payload->>'acceptedCost'='true' and public.ugc_package_digest('sceenyk-final-config',cfg)=p_payload->>'configurationHash',false) then return null; end if;
  select * into e from public.ugc_final_executions where package_id=p.id and configuration_hash=p_payload->>'configurationHash' for update;
  if e.id is not null then
   if e.state='deleted' then
    update public.ugc_final_executions set state='queued',phase='queued',revision=revision+1,version=version+1,
     final_asset=null,final_fingerprint=null,error_code=null where id=e.id returning * into e;
   end if;
   return e;
  end if;
  if exists(select 1 from public.ugc_final_executions where job_id=p_job and state not in ('deleted','approved')) then return null; end if;
  insert into public.ugc_final_executions(owner_user_id,project_id,job_id,package_id,package_hash,package_version,request_id,
   configuration,configuration_hash,profile) values(p_owner,p_project,p_job,p.id,p.package_hash,p.revision,(p_payload->>'requestId')::uuid,
    cfg,p_payload->>'configurationHash',nullif(p_payload->'profile','null')) returning * into e;
  for s in select value from jsonb_array_elements(p.document->'scenes') loop
   insert into public.ugc_final_scenes(execution_id,scene_id,scene_number,scene_hash) values(e.id,s->>'id',(s->>'number')::integer,public.ugc_package_digest('sceenyk-final-scene',s));
  end loop;
  return e;
 end if;
 select * into e from public.ugc_final_executions where id=(p_payload->>'executionId')::uuid and owner_user_id=p_owner and project_id=p_project and job_id=p_job for update;
 if e.id is null then return null; end if;
 if p_action='approve' and e.state='approved' then return e; end if;
 if e.version is distinct from (p_payload->>'version')::integer or e.claim_token is not null then return null; end if;
 if p_action='approve' and e.state='review' and public.ugc_final_result_valid(e.id,e.final_asset,e.final_fingerprint) then
  update public.ugc_final_executions set state='approved',phase='approved',approved_at=clock_timestamp(),version=version+1 where id=e.id returning * into e;
  update public.ugc_generation_jobs set status='completed',stage='complete',resume_stage='finalizing',completed_at=clock_timestamp(),
   failed_at=null,cancelled_at=null,error_code=null,safe_error_message=null,pause_reason=null,retry_eligible=false,next_retry_at=null,
   worker_id=null,claim_token=null,claimed_at=null,lease_expires_at=null,heartbeat_at=null
   where id=e.job_id and status not in ('completed','cancelled');
 elsif p_action='reject' and e.state='review' then
  update public.ugc_final_executions set state='deleting',phase='deleting',version=version+1 where id=e.id returning * into e;
 elsif p_action='recover' and e.state in ('failed','reconciling') then
  update public.ugc_final_executions set state=case when phase='deleting' then 'deleting' else 'queued' end,error_code=null,version=version+1 where id=e.id returning * into e;
 else return null; end if;
 return e;
end $$;

create or replace function public.ugc_final_claim(p_worker uuid) returns public.ugc_final_executions
language plpgsql security definer set search_path='' as $$
declare e public.ugc_final_executions; begin
 select * into e from public.ugc_final_executions where state in ('queued','deleting') or
  (state='running' and lease_expires_at<=clock_timestamp()) order by updated_at,id for update skip locked limit 1;
 if e.id is null then return null; end if;
 update public.ugc_final_executions set state='running',claim_token=gen_random_uuid(),worker_id=p_worker,
  heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds',version=version+1
  where id=e.id returning * into e; return e;
end $$;

create or replace function public.ugc_final_checkpoint(p_execution uuid,p_token uuid,p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.ugc_final_executions; o public.ugc_final_operations; s public.ugc_final_scenes; cost bigint; created boolean:=false; provider_cfg jsonb; begin
 select * into e from public.ugc_final_executions where id=p_execution for update;
 if e.id is null or e.state<>'running' or e.claim_token is distinct from p_token or e.lease_expires_at<=clock_timestamp() then return null; end if;
 if p_operation='intent' then
  select * into o from public.ugc_final_operations where execution_id=e.id and operation_key=p_payload->>'key' for update;
  if o.id is null then
   if not public.ugc_final_current(e.id) then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_PACKAGE_CHANGED'); end if;
   if p_payload->>'fingerprint' !~ '^[a-f0-9]{64}$' then return null; end if;
   if p_payload->>'sceneId' is not null and not exists(select 1 from public.ugc_final_scenes where execution_id=e.id and scene_id=p_payload->>'sceneId') then return null; end if;
   cost:=case when p_payload->>'kind'='composition' then 0 else (e.configuration->'ceilings'->>(p_payload->>'kind'))::bigint end;
   if cost is null or cost<0 or (p_payload->>'kind'<>'composition' and cost=0) then return null; end if;
   if p_payload->>'kind'<>'composition' then
    if e.paid_requests >= (e.configuration->>'maxRequests')::integer or e.estimated_cost_microusd+cost>(e.configuration->>'maxEstimatedCostMicrousd')::bigint then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_BUDGET_EXHAUSTED'); end if;
    provider_cfg:=e.configuration->'providers'->(p_payload->>'kind');
    if provider_cfg->>'id' is distinct from p_payload->>'provider' or provider_cfg->>'model' is distinct from p_payload->>'model' then return null; end if;
    update public.ugc_final_executions set paid_requests=paid_requests+1,estimated_cost_microusd=estimated_cost_microusd+cost where id=e.id;
   end if;
   insert into public.ugc_final_operations(execution_id,owner_user_id,project_id,operation_key,fingerprint,kind,scene_id,provider,model,input,estimated_cost_microusd)
    values(e.id,e.owner_user_id,e.project_id,p_payload->>'key',p_payload->>'fingerprint',p_payload->>'kind',p_payload->>'sceneId',p_payload->>'provider',p_payload->>'model',p_payload->'input',cost) returning * into o;
   created:=true;
  end if;
 elsif p_operation in ('receipt','output','operation_failed') then
  select * into o from public.ugc_final_operations where id=(p_payload->>'operationId')::uuid and execution_id=e.id for update;
  if o.id is null then return null; end if;
  if o.state<>'ready' then
   if p_operation='receipt' then
    if o.request_id is not null and p_payload->'receipt'->>'requestId' is not null and o.request_id<>p_payload->'receipt'->>'requestId' then return null; end if;
    update public.ugc_final_operations set receipt=coalesce(receipt,'{}')||p_payload->'receipt',request_id=coalesce(request_id,p_payload->'receipt'->>'requestId'),
     state=case when p_payload->'receipt'->'result' is not null then 'result' else 'submitted' end,updated_at=clock_timestamp() where id=o.id returning * into o;
   elsif p_operation='output' then
    if o.kind<>'binding' and not public.ugc_final_asset_valid(p_payload->'asset',e) then return null; end if;
    update public.ugc_final_operations set output=nullif(p_payload->'asset','null'),state='ready',updated_at=clock_timestamp() where id=o.id returning * into o;
   else update public.ugc_final_operations set state='failed',error_code=p_payload->>'code',updated_at=clock_timestamp() where id=o.id returning * into o;
   end if;
  end if;
 elsif p_operation='profile' then
  if e.profile is null then return null; end if;
  if not exists(select 1 from public.ugc_character_voice_profiles where id=e.profile->>'id' and owner_user_id=e.owner_user_id and project_id=e.project_id) then
   if not exists(select 1 from public.ugc_final_operations where execution_id=e.id and kind='binding' and state='ready' and receipt=p_payload->'binding') then return null; end if;
   insert into public.ugc_character_voice_profiles(id,owner_user_id,project_id,profile,provider_binding)
    values(e.profile->>'id',e.owner_user_id,e.project_id,e.profile,p_payload->'binding') on conflict(id) do nothing;
  end if;
  select provider_binding into provider_cfg from public.ugc_character_voice_profiles where id=e.profile->>'id' and owner_user_id=e.owner_user_id and project_id=e.project_id;
  update public.ugc_final_executions set profile_binding=provider_cfg where id=e.id;
 elsif p_operation='scene' then
  select * into s from public.ugc_final_scenes where execution_id=e.id and scene_id=p_payload->>'sceneId' for update;
  if s.execution_id is null or not public.ugc_final_scene_valid(e.id,s.scene_id,p_payload->'manifest',p_payload->'asset') then return null; end if;
  if not exists(select 1 from public.ugc_final_operations where execution_id=e.id and scene_id=s.scene_id and kind='video' and state='ready') then return null; end if;
  update public.ugc_final_scenes set phase='scene_ready',output=p_payload->'asset',manifest=p_payload->'manifest',updated_at=clock_timestamp()
   where execution_id=e.id and scene_id=s.scene_id;
 elsif p_operation='review' then
  if not public.ugc_final_result_valid(e.id,p_payload->'asset',p_payload->>'fingerprint') then return null; end if;
  update public.ugc_final_executions set state='review',phase='review',final_asset=p_payload->'asset',final_fingerprint=p_payload->>'fingerprint' where id=e.id;
 elsif p_operation='phase' then
  if p_payload->>'phase' not in ('capability_check','video_generating','video_reconciling','video_saving','voice_preparing','voice_generating','voice_saving','lip_syncing','lip_sync_saving','scene_ready','combining','finalizing','deleting') then return null; end if;
  update public.ugc_final_executions set phase=p_payload->>'phase' where id=e.id;
  if p_payload->>'sceneId' is not null then update public.ugc_final_scenes set phase=p_payload->>'phase' where execution_id=e.id and scene_id=p_payload->>'sceneId' and phase<>'scene_ready'; end if;
 elsif p_operation='release' then
  update public.ugc_final_executions set state='queued' where id=e.id;
 elsif p_operation='fail' then
  update public.ugc_final_executions set state=case when p_payload->>'code' in ('FINAL_UNCERTAIN_PROVIDER_OUTCOME','FINAL_RECOVERY_REQUIRED') then 'reconciling' else 'failed' end,
   error_code=p_payload->>'code',phase=case when phase='deleting' then 'deleting' when p_payload->>'code' in ('FINAL_UNCERTAIN_PROVIDER_OUTCOME','FINAL_RECOVERY_REQUIRED') then 'reconciliation_required' else 'scene_failed' end where id=e.id;
 elsif p_operation='deleted' and e.phase='deleting' then
  update public.ugc_final_executions set state='deleted',phase='deleted',final_asset=null where id=e.id;
 elsif p_operation<>'heartbeat' then return null;
 end if;
 update public.ugc_final_executions set version=version+1,updated_at=clock_timestamp(),
  heartbeat_at=case when state='running' then clock_timestamp() else null end,
  lease_expires_at=case when state='running' then clock_timestamp()+interval '90 seconds' else null end,
  claim_token=case when state='running' then claim_token else null end,worker_id=case when state='running' then worker_id else null end where id=e.id returning * into e;
 return jsonb_build_object('execution',to_jsonb(e),'operation',case when o.id is null then null else to_jsonb(o) end,'created',created);
end $$;

revoke all on function public.ugc_final_current(uuid), public.ugc_final_asset_valid(jsonb,public.ugc_final_executions),
 public.ugc_final_result_valid(uuid,jsonb,text),public.ugc_final_scene_valid(uuid,text,jsonb,jsonb),public.ugc_final_guard(),public.ugc_final_event(),public.ugc_final_action(uuid,uuid,uuid,text,jsonb),
 public.ugc_final_claim(uuid),public.ugc_final_checkpoint(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ugc_final_current(uuid),public.ugc_final_action(uuid,uuid,uuid,text,jsonb),public.ugc_final_claim(uuid),public.ugc_final_checkpoint(uuid,uuid,text,jsonb) to service_role;
commit;
