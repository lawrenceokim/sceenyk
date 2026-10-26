-- Milestone 7. Apply manually after 062/prerequisites. No backfill or execution.
begin;
do $$
declare required record; relation_name text;
begin
 for required in select * from (values
  ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),('ugc_generation_jobs','project_id','uuid'),
  ('ugc_generation_jobs','status','text'),('ugc_generation_jobs','stage','text'),('ugc_generation_jobs','pause_reason','text'),
  ('ugc_generation_jobs','input_snapshot','jsonb'),('ugc_generation_jobs','cancellation_requested_at','timestamp with time zone'),
  ('ugc_character_v5_workflows','job_id','uuid'),('ugc_character_v5_workflows','version','integer'),
  ('ugc_reference_reviews','job_id','uuid'),('ugc_reference_reviews','reference_type','text'),('ugc_reference_reviews','version','integer'),
  ('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text'),('app_users','id','uuid')
 ) v(table_name,column_name,data_type) loop
  if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=required.table_name
   and c.column_name=required.column_name and c.data_type=required.data_type) then
   raise exception 'Location prerequisite missing or incompatible: %.%',required.table_name,required.column_name; end if;
 end loop;
 if to_regprocedure('public.ugc_location_references_approved(uuid)') is null or
   to_regprocedure('public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)') is null then raise exception 'Apply 062 and prerequisites first.'; end if;
 foreach relation_name in array array['ugc_locations','ugc_location_candidates','ugc_location_events'] loop
  if to_regclass('public.'||relation_name) is not null and obj_description(to_regclass('public.'||relation_name),'pg_class')
   is distinct from 'sceenyk-ugc-location-v1-063' then raise exception 'Inspect existing Location relation: %',relation_name; end if;
 end loop;
end; $$;

create table if not exists public.ugc_locations (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.ugc_generation_jobs(id) on delete restrict,
 owner_user_id uuid not null references public.app_users(id) on delete restrict, project_id uuid not null,
 location_index integer not null default 1 check(location_index=1), -- Widen in a future multi-location migration.
 version integer not null default 1 check(version>0),
 state text not null default 'queued_plan' check(state in ('queued_plan','running_plan','plan_review','queued_image','running_image','image_review','approved','rejecting','failed')),
 phase text not null default 'preparing' check(phase in ('preparing','generating','saving','review','approved','deleting','failed')),
 dependencies jsonb not null, scene jsonb not null, plan jsonb, plan_intent jsonb, plan_receipt jsonb,
 candidate_id uuid, accepted_candidate_id uuid, approved_at timestamptz, error_code text,
 worker_id uuid, claim_token uuid, heartbeat_at timestamptz, lease_expires_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(job_id,location_index), foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict,
 check(jsonb_typeof(dependencies)='object' and jsonb_typeof(scene)='object'),
 check((state='approved')=(approved_at is not null and accepted_candidate_id is not null))
);
create table if not exists public.ugc_location_candidates (
 id uuid primary key default gen_random_uuid(), location_id uuid not null references public.ugc_locations(id) on delete restrict,
 state text not null default 'pending' check(state in ('pending','submitted','review','accepted','rejecting','deleted')),
 plan jsonb not null, settings jsonb not null, intent jsonb, receipt jsonb, artifact jsonb,
 rejected_at timestamptz, deleted_at timestamptz, deletion_proof jsonb, created_at timestamptz not null default clock_timestamp(),
 check(jsonb_typeof(plan)='object' and jsonb_typeof(settings)='object'),
 check(state not in ('review','accepted','rejecting') or artifact is not null),
 check(state<>'deleted' or (artifact is null and deleted_at is not null))
);
create table if not exists public.ugc_location_events (
 id bigint generated always as identity primary key, location_id uuid not null references public.ugc_locations(id) on delete restrict,
 version integer not null, state text not null, phase text not null, created_at timestamptz not null default clock_timestamp()
);
comment on table public.ugc_locations is 'sceenyk-ugc-location-v1-063';
comment on table public.ugc_location_candidates is 'sceenyk-ugc-location-v1-063';
comment on table public.ugc_location_events is 'sceenyk-ugc-location-v1-063';
alter table public.ugc_locations enable row level security;
alter table public.ugc_location_candidates enable row level security;
alter table public.ugc_location_events enable row level security;
revoke all on public.ugc_locations,public.ugc_location_candidates,public.ugc_location_events from public,anon,authenticated,service_role;
grant select on public.ugc_locations,public.ugc_location_candidates,public.ugc_location_events to service_role;

create or replace function public.ugc_location_dependencies(p_job uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when public.ugc_location_references_approved(p_job) then jsonb_build_object(
  'character',coalesce((select version from public.ugc_character_v5_workflows where job_id=p_job),
   (select version from public.ugc_reference_reviews where job_id=p_job and reference_type='character')),
  'product',(select version from public.ugc_reference_reviews where job_id=p_job and reference_type='product')) end;
$$;
create or replace function public.ugc_location_plan_valid(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object' and p ?& array['name','environment','lighting','visualStyle','cameraFraming','imagePrompt']
 and not exists(select 1 from jsonb_object_keys(p) k where k not in ('name','environment','lighting','visualStyle','cameraFraming','imagePrompt'))
 and not exists(select 1 from jsonb_each(p) e where jsonb_typeof(e.value)<>'string' or length(btrim(e.value#>>'{}'))=0)
 and length(p->>'name')<=120 and length(p->>'environment')<=2000 and length(p->>'lighting')<=600
 and length(p->>'visualStyle')<=400 and length(p->>'cameraFraming')<=600 and length(p->>'imagePrompt')<=4000,false);
$$;
create or replace function public.ugc_location_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.id,new.job_id,new.owner_user_id,new.project_id,new.location_index,new.dependencies,new.scene,new.created_at)
   is distinct from (old.id,old.job_id,old.owner_user_id,old.project_id,old.location_index,old.dependencies,old.scene,old.created_at)
   or old.state='approved' then raise exception 'Immutable Location identity/approval.'; end if;
 end if;
 if tg_op='INSERT' or (new.state,new.phase,new.version) is distinct from (old.state,old.phase,old.version) then
  insert into public.ugc_location_events(location_id,version,state,phase) values(new.id,new.version,new.state,new.phase);
 end if;
 return new;
end; $$;
drop trigger if exists ugc_location_audit on public.ugc_locations;
create trigger ugc_location_audit after insert or update on public.ugc_locations for each row execute function public.ugc_location_audit();

-- Called only by the opted-in local worker. Parent stays at its existing safe pause.
create or replace function public.ugc_location_claim(p_worker uuid) returns public.ugc_locations
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations; candidate record;
begin
 if p_worker is null then return null; end if;
 for j in select * from public.ugc_generation_jobs where status='queued' and stage='location_reference'
  and pause_reason='LOCATION_REFERENCE_NOT_IMPLEMENTED' and cancellation_requested_at is null
  and public.ugc_location_references_approved(id) for update skip locked loop
  insert into public.ugc_locations(job_id,owner_user_id,project_id,dependencies,scene)
   values(j.id,j.owner_user_id,j.project_id,public.ugc_location_dependencies(j.id),j.input_snapshot)
   on conflict(job_id,location_index) do nothing;
 end loop;
 for candidate in select id,job_id from public.ugc_locations where state in ('queued_plan','queued_image','running_plan','running_image','rejecting')
  and (claim_token is null or lease_expires_at<=clock_timestamp()) order by created_at loop
  select * into j from public.ugc_generation_jobs where id=candidate.job_id for update skip locked;
  if not found then continue; end if;
  select * into l from public.ugc_locations where id=candidate.id for update skip locked;
  if not found or l.state not in ('queued_plan','queued_image','running_plan','running_image','rejecting')
   or (l.claim_token is not null and l.lease_expires_at>clock_timestamp()) then continue; end if;
  -- Cleanup is allowed even after cancellation/dependency change; no paid operation is.
  if l.state<>'rejecting' and (j.status in ('cancelled','completed') or j.cancellation_requested_at is not null or
   public.ugc_location_dependencies(j.id) is distinct from l.dependencies) then
   update public.ugc_locations set state='failed',phase='failed',error_code='LOCATION_DEPENDENCIES_CHANGED',claim_token=null,
    lease_expires_at=null,updated_at=clock_timestamp() where id=l.id; continue;
  end if;
  update public.ugc_locations set state=case l.state when 'queued_plan' then 'running_plan' when 'queued_image' then 'running_image' else l.state end,
   worker_id=p_worker,claim_token=gen_random_uuid(),heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds',
   updated_at=clock_timestamp() where id=l.id returning * into l;
  return l;
 end loop;
 return null;
end; $$;

create or replace function public.ugc_location_action(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_action text,p_payload jsonb default '{}')
returns public.ugc_locations language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations; c public.ugc_location_candidates; s jsonb;
begin
 select * into j from public.ugc_generation_jobs where id=p_job and project_id=p_project and owner_user_id=p_owner for update;
 if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null or not exists(
  select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 select * into l from public.ugc_locations where job_id=j.id and location_index=1 for update;
 if not found or l.version<>p_version or l.owner_user_id<>p_owner or l.project_id<>p_project then return null; end if;
 if p_action<>'reject' and public.ugc_location_dependencies(j.id) is distinct from l.dependencies then return null; end if;
 select * into c from public.ugc_location_candidates where id=l.candidate_id and location_id=l.id for update;
 if p_action='generate' and l.state='plan_review' then
  if not public.ugc_location_plan_valid(p_payload->'plan') then return null; end if;
  s:=p_payload->'settings';
  if s->>'provider' is distinct from 'openai' or not coalesce(s->>'model' in ('gpt-image-2.5-sunburst','gpt-image-2.5-flare'),false)
   or s->>'size' is distinct from (case l.scene->'settings'->>'aspectRatio' when '9:16' then '864x1536' when '16:9' then '1536x864' when '1:1' then '1024x1024' else 'unsupported' end)
   or s->>'quality' is distinct from 'medium'
   or s->>'n' is distinct from '1' or s->>'output_format' is distinct from 'png' or s->>'background' is distinct from 'opaque' then return null; end if;
  insert into public.ugc_location_candidates(location_id,plan,settings) values(l.id,p_payload->'plan',s) returning * into c;
  update public.ugc_locations set state='queued_image',phase='generating',plan=c.plan,candidate_id=c.id,error_code=null,
   version=version+1,updated_at=clock_timestamp() where id=l.id returning * into l;
 elsif p_action='accept' and l.state='image_review' and c.state='review' and c.artifact is not null then
  update public.ugc_location_candidates set state='accepted' where id=c.id;
  update public.ugc_locations set state='approved',phase='approved',accepted_candidate_id=c.id,approved_at=clock_timestamp(),
   version=version+1,updated_at=clock_timestamp() where id=l.id returning * into l;
 elsif p_action='reject' and l.state='image_review' and c.state='review' then
  update public.ugc_location_candidates set state='rejecting',rejected_at=clock_timestamp() where id=c.id;
  update public.ugc_locations set state='rejecting',phase='deleting',version=version+1,updated_at=clock_timestamp() where id=l.id returning * into l;
 elsif p_action='retry_saving' and l.state='failed' and c.state='submitted' and c.intent is not null then
  -- This never clears the intent and therefore can never send another image request.
  update public.ugc_locations set state='queued_image',phase='saving',error_code=null,version=version+1,
   claim_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=l.id returning * into l;
 elsif p_action='resume' and l.state='failed' and ((l.plan_intent is null and l.candidate_id is null) or (c.state='pending' and c.intent is null)) then
  -- No request was submitted. The owner may explicitly resume after setup repair.
  update public.ugc_locations set state=case when candidate_id is null then 'queued_plan' else 'queued_image' end,
   phase=case when candidate_id is null then 'preparing' else 'generating' end,error_code=null,version=version+1,
   claim_token=null,lease_expires_at=null,updated_at=clock_timestamp() where id=l.id returning * into l;
 else return null;
 end if;
 return l;
end; $$;

create or replace function public.ugc_location_checkpoint(p_location uuid,p_token uuid,p_operation text,p_payload jsonb default '{}')
returns public.ugc_locations language plpgsql security definer set search_path='' as $$
declare l public.ugc_locations; j public.ugc_generation_jobs; c public.ugc_location_candidates; a jsonb; expected_key text;
begin
 select * into l from public.ugc_locations where id=p_location;
 if not found then return null; end if;
 select * into j from public.ugc_generation_jobs where id=l.job_id for update;
 select * into l from public.ugc_locations where id=p_location for update;
 if l.claim_token is distinct from p_token or p_token is null or l.lease_expires_at<=clock_timestamp()
  or l.state not in ('running_plan','running_image','rejecting') then return null; end if;
 if l.state<>'rejecting' and p_operation<>'fail' and (j.status in ('cancelled','completed') or j.cancellation_requested_at is not null
  or public.ugc_location_dependencies(j.id) is distinct from l.dependencies) then return null; end if;
 select * into c from public.ugc_location_candidates where id=l.candidate_id and location_id=l.id for update;
 if p_operation='heartbeat' then null;
 elsif p_operation='plan_intent' and l.state='running_plan' and l.plan_intent is null then
  if p_payload->>'provider' is distinct from 'openai' or coalesce(p_payload->>'model','') !~ '^[a-zA-Z0-9._:-]{1,200}$' then return null; end if;
  l.plan_intent:=p_payload;
 elsif p_operation='plan_ready' and l.state='running_plan' and l.plan_intent is not null then
  if not public.ugc_location_plan_valid(p_payload->'plan') then return null; end if;
  l.plan:=p_payload->'plan'; l.plan_receipt:=p_payload->'receipt'; l.state:='plan_review'; l.phase:='review';
 elsif p_operation='image_intent' and l.state='running_image' and c.state='pending' and c.intent is null then
  if coalesce(p_payload->>'prompt','')='' or length(p_payload->>'prompt')>16000 then return null; end if;
  update public.ugc_location_candidates set state='submitted',intent=p_payload where id=c.id;
 elsif p_operation='saving' and l.state='running_image' and c.state='submitted' then
  l.phase:='saving';
  update public.ugc_location_candidates set receipt=coalesce(receipt,p_payload->'receipt') where id=c.id;
 elsif p_operation='image_ready' and l.state='running_image' and c.state='submitted' and c.intent is not null then
  a:=p_payload->'artifact';
  expected_key:='ugc/'||l.owner_user_id||'/'||l.project_id||'/'||l.job_id||'/location-v1/'||l.id||'/candidates/'||c.id||'.png';
  if a->>'storageKey' is distinct from expected_key or a->>'id' is distinct from c.id::text or coalesce(a->>'etag','')=''
   or a->>'mimeType' is distinct from 'image/png' or coalesce(a->>'sha256','') !~ '^[a-f0-9]{64}$'
   or not coalesce((a->>'sizeBytes')::bigint between 1 and 20971520,false)
   or not coalesce((a->>'width')::integer between 256 and 4096,false) or not coalesce((a->>'height')::integer between 256 and 4096,false)
   or a->>'width' is distinct from split_part(c.settings->>'size','x',1)
   or a->>'height' is distinct from split_part(c.settings->>'size','x',2) then return null; end if;
  update public.ugc_location_candidates set state='review',artifact=a where id=c.id;
  l.state:='image_review'; l.phase:='review'; l.error_code:=null;
 elsif p_operation='deleted' and l.state='rejecting' and c.state='rejecting' then
  if l.accepted_candidate_id=c.id then return null; end if;
  update public.ugc_location_candidates set state='deleted',deletion_proof=jsonb_build_object('sha256',artifact->>'sha256','sizeBytes',artifact->'sizeBytes'),
   artifact=null,deleted_at=clock_timestamp() where id=c.id;
  l.state:='plan_review'; l.phase:='review'; l.candidate_id:=null; l.error_code:=null;
  -- The owner's Reject and Regenerate action authorizes exactly one replacement.
  -- Cleanup retries cannot repeat it: this transition is atomic and state-fenced.
  if j.status='queued' and j.cancellation_requested_at is null and public.ugc_location_dependencies(j.id)=l.dependencies then
   insert into public.ugc_location_candidates(location_id,plan,settings) values(l.id,c.plan,c.settings) returning * into c;
   l.candidate_id:=c.id; l.state:='queued_image'; l.phase:='generating';
  end if;
 elsif p_operation='fail' then
  -- Rejection remains fenced and recoverable by a later cleanup claim.
  if l.state<>'rejecting' then l.state:='failed'; l.phase:='failed'; end if;
  l.error_code:=case p_payload->>'code' when 'LOCATION_CONFIG_INVALID' then 'LOCATION_CONFIG_INVALID'
   when 'LOCATION_RECONCILIATION_REQUIRED' then 'LOCATION_RECONCILIATION_REQUIRED'
   when 'LOCATION_STORAGE_FAILED' then 'LOCATION_STORAGE_FAILED' else 'LOCATION_FAILED' end;
 else return null;
 end if;
 if p_operation<>'heartbeat' then l.version:=l.version+1; end if;
 if l.state in ('running_plan','running_image','rejecting') and p_operation<>'fail' then
  l.heartbeat_at:=clock_timestamp(); l.lease_expires_at:=clock_timestamp()+interval '90 seconds';
 else l.claim_token:=null; l.lease_expires_at:=null; l.worker_id:=null; end if;
 update public.ugc_locations set state=l.state,phase=l.phase,plan=l.plan,plan_intent=l.plan_intent,plan_receipt=l.plan_receipt,
  candidate_id=l.candidate_id,version=l.version,error_code=l.error_code,worker_id=l.worker_id,claim_token=l.claim_token,
  heartbeat_at=l.heartbeat_at,lease_expires_at=l.lease_expires_at,updated_at=clock_timestamp() where id=l.id returning * into l;
 return l;
end; $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('ugc_location_dependencies','ugc_location_plan_valid','ugc_location_audit','ugc_location_claim','ugc_location_action','ugc_location_checkpoint') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.signature::text not like '%ugc_location_audit(%' then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end; $$;
commit;
