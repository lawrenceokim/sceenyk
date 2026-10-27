-- M9 only. Manual after 067/prerequisites. No backfill or workflow execution.
begin;
do $$ declare r record; t text; begin
 for r in select * from (values
  ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),('ugc_generation_jobs','project_id','uuid'),
  ('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text'),('projects','title','text'),
  ('projects','prompt','text'),('projects','creation_type','text'),('projects','ugc_type','text'),('projects','visual_style','text'),
  ('projects','tone','text'),('projects','duration','text'),('projects','aspect_ratio','text'),
  ('ugc_storyboards','id','uuid'),('ugc_storyboards','job_id','uuid'),('ugc_storyboards','owner_user_id','uuid'),('ugc_storyboards','project_id','uuid'),
  ('ugc_storyboards','revision','integer'),('ugc_storyboards','version','integer'),('ugc_storyboards','state','text'),
  ('ugc_storyboards','input','jsonb'),('ugc_storyboards','document','jsonb'),('ugc_storyboards','approved_at','timestamp with time zone'),
  ('ugc_character_v5_workflows','id','uuid'),('ugc_character_v5_workflows','job_id','uuid'),('ugc_character_v5_workflows','approved_at','timestamp with time zone'),
  ('ugc_reference_reviews','id','uuid'),('ugc_reference_reviews','job_id','uuid'),('ugc_reference_reviews','reference_type','text'),
  ('ugc_reference_reviews','approved_at','timestamp with time zone'),
  ('ugc_locations','id','uuid'),('ugc_locations','job_id','uuid'),('ugc_locations','revision','integer'),
  ('ugc_locations','approved_at','timestamp with time zone')
 ) v(table_name,column_name,data_type) loop
  if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name
   and c.column_name=r.column_name and c.data_type=r.data_type) then raise exception 'Package prerequisite: %.%',r.table_name,r.column_name; end if;
 end loop;
 if to_regprocedure('public.ugc_storyboard_recover_dialogue(uuid,uuid,uuid,uuid,integer,integer,jsonb)') is null
  or to_regprocedure('public.ugc_storyboard_input(uuid)') is null or to_regprocedure('public.ugc_storyboard_lock(uuid)') is null
  or to_regprocedure('public.ugc_storyboard_valid(jsonb,jsonb)') is null or to_regprocedure('public.ugc_reject_event_mutation()') is null
 then raise exception 'Apply 067 and prerequisites first.'; end if;
 foreach t in array array['ugc_generation_packages','ugc_generation_package_events'] loop
  if to_regclass('public.'||t) is not null and obj_description(to_regclass('public.'||t),'pg_class')
   is distinct from 'sceenyk-ugc-package-v1-068' then raise exception 'Inspect existing package relation: %',t; end if;
 end loop;
end; $$;

create table if not exists public.ugc_generation_packages (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.ugc_generation_jobs(id) on delete restrict,
 owner_user_id uuid not null references public.app_users(id) on delete restrict, project_id uuid not null,
 revision integer not null check(revision>0), version integer not null default 1 check(version>0), request_id uuid not null,
 input jsonb not null check(jsonb_typeof(input)='object'), input_fingerprint text not null check(input_fingerprint ~ '^[a-f0-9]{64}$'),
 document jsonb, package_hash text check(package_hash ~ '^[a-f0-9]{64}$'), validation_receipt jsonb,
 state text not null default 'queued' check(state in ('queued','running','review','approved','failed','deleted')),
 phase text not null default 'checking' check(phase in ('checking','building','validating','saving','review','approved','failed','deleted')),
 error_code text, stale_at timestamptz, approved_at timestamptz, approved_by uuid references public.app_users(id) on delete restrict,
 was_approved boolean not null default false, attempts integer not null default 0 check(attempts between 0 and 3),
 worker_id uuid, claim_token uuid, heartbeat_at timestamptz, lease_expires_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(job_id,revision), unique(owner_user_id,request_id),
 foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict,
 check((document is null)=(package_hash is null)), check((document is null)=(validation_receipt is null)),
 check(state not in ('review','approved') or document is not null),
 check(state<>'approved' or (was_approved and approved_at is not null and approved_by=owner_user_id)),
 check(not was_approved or (document is not null and approved_at is not null and approved_by=owner_user_id))
);
create unique index if not exists ugc_generation_packages_input on public.ugc_generation_packages(job_id,input_fingerprint) where state<>'deleted' and stale_at is null;
create table if not exists public.ugc_generation_package_events (
 id bigint generated always as identity primary key, package_id uuid not null references public.ugc_generation_packages(id) on delete restrict,
 version integer not null, state text not null, phase text not null, error_code text, created_at timestamptz not null default clock_timestamp()
);
comment on table public.ugc_generation_packages is 'sceenyk-ugc-package-v1-068';
comment on table public.ugc_generation_package_events is 'sceenyk-ugc-package-v1-068';
alter table public.ugc_generation_packages enable row level security;
alter table public.ugc_generation_package_events enable row level security;
revoke all on public.ugc_generation_packages,public.ugc_generation_package_events from public,anon,authenticated,service_role;
grant select on public.ugc_generation_packages,public.ugc_generation_package_events to service_role;
drop trigger if exists ugc_package_events_append_only on public.ugc_generation_package_events;
create trigger ugc_package_events_append_only before update or delete on public.ugc_generation_package_events
 for each row execute function public.ugc_reject_event_mutation();

-- Deliberate canonical recipe, shared with the pure TS builder. No extension.
create or replace function public.ugc_package_canonical(v jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare result text; begin
 case jsonb_typeof(v)
 when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.ugc_package_canonical(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(v);
 when 'array' then select '['||coalesce(string_agg(public.ugc_package_canonical(value),',' order by ord),'')||']' into result from jsonb_array_elements(v) with ordinality a(value,ord);
 when 'number' then
  if v::text !~ '^-?[0-9]+$' or abs((v::text)::numeric)>9007199254740991 then raise exception 'Noncanonical package number'; end if;
  result:=((v::text)::bigint)::text;
 when 'string' then result:=v::text;
 when 'boolean' then result:=v::text;
 when 'null' then result:='null';
 else raise exception 'Noncanonical package value'; end case;
 return result;
end; $$;
create or replace function public.ugc_package_digest(domain text,v jsonb) returns text
language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(domain||E':v1\n'||public.ugc_package_canonical(v),'UTF8')),'hex');
$$;
create or replace function public.ugc_package_input(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.ugc_generation_jobs; b public.ugc_storyboards; src jsonb; assets jsonb:='{}'; role text; a jsonb;
 ca record; pa record; la record;
begin
 select * into j from public.ugc_generation_jobs where id=p_job;
 if not found then return null; end if;
 src:=public.ugc_storyboard_input(p_job);
 if src is null then return null; end if;
 select * into b from public.ugc_storyboards where job_id=p_job and owner_user_id=j.owner_user_id and project_id=j.project_id order by revision desc limit 1;
 if not found or b.state<>'approved' or b.approved_at is null or b.input is distinct from src or not public.ugc_storyboard_valid(b.document,src) then return null; end if;
 select id,approved_at into ca from public.ugc_character_v5_workflows where job_id=p_job;
 if ca.id is null then select id,approved_at into ca from public.ugc_reference_reviews where job_id=p_job and reference_type='character'; end if;
 select id,approved_at into pa from public.ugc_reference_reviews where job_id=p_job and reference_type='product';
 select id,revision,approved_at into la from public.ugc_locations where id=(src->'dependencies'->>'locationId')::uuid and job_id=p_job;
 if ca.approved_at is null or pa.approved_at is null or la.approved_at is null then return null; end if;
 foreach role in array array['character','product','location'] loop
  a:=src->role;
  if left(a->>'storageKey',length('ugc/'||j.owner_user_id||'/'||j.project_id||'/'||j.id||'/'))
    is distinct from 'ugc/'||j.owner_user_id||'/'||j.project_id||'/'||j.id||'/' then return null; end if;
  select jsonb_object_agg(key,value) into a from jsonb_each(a) where key in ('id','storageKey','etag','sha256','sizeBytes','mimeType','width','height');
  assets:=assets||jsonb_build_object(role,a);
 end loop;
 src:=src||assets;
 return jsonb_build_object('ownerId',j.owner_user_id,'projectId',j.project_id,'jobId',j.id,'source',src,
  'storyboard',jsonb_build_object('id',b.id,'revision',b.revision,'version',b.version,'approvedAt',b.approved_at,'document',b.document),
  'approvals',jsonb_build_object('character',jsonb_build_object('id',ca.id,'version',src->'dependencies'->'character','approvedAt',ca.approved_at),
   'product',jsonb_build_object('id',pa.id,'version',src->'dependencies'->'product','approvedAt',pa.approved_at),
   'location',jsonb_build_object('id',la.id,'revision',la.revision,'version',src->'dependencies'->'locationVersion',
    'candidateId',src->'dependencies'->'locationCandidateId','approvedAt',la.approved_at)));
end; $$;

-- Immutable input and successful payload; deletion is an audited tombstone,
-- preserving approved history. No upstream object or media is deleted.
create or replace function public.ugc_package_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.id,new.job_id,new.owner_user_id,new.project_id,new.revision,new.request_id,new.input,new.input_fingerprint,new.created_at)
  is distinct from (old.id,old.job_id,old.owner_user_id,old.project_id,old.revision,old.request_id,old.input,old.input_fingerprint,old.created_at)
  or (old.document is not null and (new.document,new.package_hash,new.validation_receipt) is distinct from (old.document,old.package_hash,old.validation_receipt))
  or (old.was_approved and (not new.was_approved or (new.approved_at,new.approved_by) is distinct from (old.approved_at,old.approved_by)))
  or (old.stale_at is not null and new.stale_at is distinct from old.stale_at)
 then raise exception 'Immutable package history' using errcode='23514'; end if;
 return new;
end; $$;
drop trigger if exists ugc_package_guard on public.ugc_generation_packages;
create trigger ugc_package_guard before update on public.ugc_generation_packages for each row execute function public.ugc_package_guard();
create or replace function public.ugc_package_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or (new.version,new.state,new.phase,new.error_code) is distinct from (old.version,old.state,old.phase,old.error_code) then
  insert into public.ugc_generation_package_events(package_id,version,state,phase,error_code) values(new.id,new.version,new.state,new.phase,new.error_code);
 end if; return new;
end; $$;
drop trigger if exists ugc_package_audit on public.ugc_generation_packages;
create trigger ugc_package_audit after insert or update on public.ugc_generation_packages for each row execute function public.ugc_package_audit();
create or replace function public.ugc_package_project_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.title,new.prompt,new.creation_type,new.ugc_type,new.visual_style,new.tone,new.duration,new.aspect_ratio,new.status)
  is distinct from (old.title,old.prompt,old.creation_type,old.ugc_type,old.visual_style,old.tone,old.duration,old.aspect_ratio,old.status) then
  update public.ugc_generation_packages set stale_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
   where project_id=new.id and owner_user_id=new.owner_user_id and stale_at is null and state<>'deleted';
 end if; return new;
end; $$;
drop trigger if exists ugc_package_project_changed on public.projects;
create trigger ugc_package_project_changed after update of title,prompt,creation_type,ugc_type,visual_style,tone,duration,aspect_ratio,status on public.projects
 for each row execute function public.ugc_package_project_changed();

-- SQL defense in depth; the server additionally rebuilds and compares every
-- canonical field/hash before save and approval. No browser supplies a document.
create or replace function public.ugc_package_valid(d jsonb,i jsonb,rev integer,fp text) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb; original jsonb; role text; k text; n integer:=0; finish integer:=0; expected jsonb; begin
 if not public.ugc_storyboard_valid(i->'storyboard'->'document',i->'source')
  or d->>'schemaVersion' is distinct from '1' or d->>'compilerVersion' is distinct from '1'
  or d->>'promptVersion' is distinct from '1' or d->>'fingerprintVersion' is distinct from '1'
  or (d->>'packageVersion')::integer is distinct from rev or d->>'inputFingerprint' is distinct from fp
  or d->'project'->>'id' is distinct from i->>'projectId' or d->'project'->>'ownerId' is distinct from i->>'ownerId'
  or d->'project'->>'jobId' is distinct from i->>'jobId'
  or d->'timeline'->>'totalDurationMs' is distinct from i->'storyboard'->'document'->>'durationMs'
  or d->'output'->>'durationMs' is distinct from i->'storyboard'->'document'->>'durationMs'
  or d->'output'->>'aspectRatio' is distinct from i->'storyboard'->'document'->>'aspectRatio'
  or d->'voice' is distinct from i->'storyboard'->'document'->'voice'
  or d->'continuity' is distinct from i->'storyboard'->'document'->'continuity'
  or d->'storyboard' is distinct from ((i->'storyboard')-'document')||jsonb_build_object('schemaVersion',1,'documentHash',public.ugc_package_digest('sceenyk-storyboard',i->'storyboard'->'document'))
  or d->>'packageHash' is distinct from public.ugc_package_digest('sceenyk-video-package',d-array['packageVersion','packageHash'])
  or jsonb_typeof(d->'scenes') is distinct from 'array' then return false; end if;
 foreach role in array array['character','product','location'] loop
  foreach k in array array['id','sha256','mimeType','sizeBytes','width','height'] loop
   if d->'approvedReferences'->role->k is distinct from i->'source'->role->k then return false; end if;
  end loop;
  if d->'approvedReferences'->role->'approvalVersion' is distinct from i->'approvals'->role->'version'
   or d->'approvedReferences'->role->'approvalId' is distinct from i->'approvals'->role->'id' then return false; end if;
 end loop;
 if jsonb_array_length(d->'scenes') is distinct from jsonb_array_length(i->'storyboard'->'document'->'scenes') then return false; end if;
 for s in select value from jsonb_array_elements(d->'scenes') loop
  original:=i->'storyboard'->'document'->'scenes'->n; n:=n+1;
  if (s->>'number')::integer is distinct from n or (s->>'startMs')::integer is distinct from finish
   or s->'startMs' is distinct from original->'startMs' or s->'endMs' is distinct from original->'endMs'
   or (s->>'durationMs')::integer is distinct from (original->>'endMs')::integer-(original->>'startMs')::integer
   or s->'bindings' is distinct from '{"character":"character","product":"product","location":"location"}'::jsonb
   or s->'voice' is distinct from d->'voice' or coalesce(length(btrim(s->>'generationPrompt')),0)=0
   or (s-array['id','durationMs','bindings','voice','generationPrompt','speech']) is distinct from
    (original-array['characterAssetId','productAssetId','locationAssetId','generationPrompt','speech']) then return false; end if;
  select coalesce(jsonb_agg((value-'characterAssetId')||'{"characterBinding":"character"}'::jsonb order by ord),'[]') into expected
   from jsonb_array_elements(original->'speech') with ordinality a(value,ord);
  if s->'speech' is distinct from expected then return false; end if;
  finish:=(s->>'endMs')::integer;
 end loop;
 return coalesce(finish=(d->'timeline'->>'totalDurationMs')::integer,false);
exception when others then return false; end; $$;

create or replace function public.ugc_package_action(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_action text,p_payload jsonb default '{}')
returns public.ugc_generation_packages language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; b public.ugc_generation_packages; current_input jsonb; fp text; begin
 perform public.ugc_storyboard_lock(p_job);
 select * into j from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project;
 if not found or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 perform 1 from public.ugc_storyboards where job_id=p_job for share;
 current_input:=public.ugc_package_input(p_job);
 if p_action='prepare' then
  if current_input is null or current_input is distinct from p_payload->'input' then return null; end if;
  fp:=public.ugc_package_digest('sceenyk-package-input',jsonb_build_object('compilerVersion',1,'input',current_input));
  if fp is distinct from p_payload->>'fingerprint' or coalesce(p_payload->>'requestId','')='' then return null; end if;
  select * into b from public.ugc_generation_packages where owner_user_id=p_owner and request_id=(p_payload->>'requestId')::uuid;
  if found then if b.job_id=p_job and b.project_id=p_project and b.input_fingerprint=fp then return b; else return null; end if; end if;
  select * into b from public.ugc_generation_packages where job_id=p_job and input_fingerprint=fp and state<>'deleted' and stale_at is null for update;
  if found then return b; end if;
  select * into b from public.ugc_generation_packages where job_id=p_job order by revision desc limit 1 for update;
  if (b.id is null and p_version<>0) or (b.id is not null and (b.version<>p_version or b.id::text is distinct from p_payload->>'packageId')) then return null; end if;
  -- An explicitly rebuilt stale version keeps its original lifecycle/approval
  -- history. The partial unique index excludes permanently stale snapshots.
  insert into public.ugc_generation_packages(job_id,owner_user_id,project_id,revision,request_id,input,input_fingerprint)
   values(p_job,p_owner,p_project,coalesce(b.revision,0)+1,(p_payload->>'requestId')::uuid,current_input,fp) returning * into b;
  return b;
 end if;
 select * into b from public.ugc_generation_packages where id=(p_payload->>'packageId')::uuid and job_id=p_job and owner_user_id=p_owner and project_id=p_project for update;
 if not found or b.revision<>(select max(revision) from public.ugc_generation_packages where job_id=p_job) then return null; end if;
 if p_action='reject' and b.state='deleted' then return b; end if;
 if p_action='approve' and b.state='approved' and b.stale_at is null and b.input=current_input then return b; end if;
 if b.version<>p_version or (b.claim_token is not null and b.lease_expires_at>clock_timestamp()) then return null; end if;
 if p_action='reject' and b.state<>'deleted' then
  update public.ugc_generation_packages set state='deleted',phase='deleted',error_code=null,claim_token=null,lease_expires_at=null,
   version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 elsif p_action='approve' and b.state='review' and b.stale_at is null and b.input=current_input then
  if not public.ugc_package_valid(b.document,b.input,b.revision,b.input_fingerprint) then return null; end if;
  update public.ugc_generation_packages set state='approved',phase='approved',was_approved=true,approved_at=clock_timestamp(),approved_by=p_owner,
   version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 elsif p_action='retry' and b.state='failed' and b.attempts<3 and b.stale_at is null and b.input=current_input then
  update public.ugc_generation_packages set state='queued',phase='checking',error_code=null,claim_token=null,lease_expires_at=null,
   version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 else return null; end if;
 return b; -- No upstream transition, provider, dispatch or financial operation.
end; $$;

create or replace function public.ugc_package_claim(p_worker uuid) returns public.ugc_generation_packages
language plpgsql security definer set search_path='' as $$
declare candidate record; b public.ugc_generation_packages; begin
 if p_worker is null then return null; end if;
 for candidate in select id,job_id from public.ugc_generation_packages where state in ('queued','running') and error_code is null
  and (claim_token is null or lease_expires_at<=clock_timestamp()) order by created_at loop
  perform 1 from public.ugc_generation_jobs where id=candidate.job_id for update skip locked;
  if not found then continue; end if;
  perform public.ugc_storyboard_lock(candidate.job_id);
  perform 1 from public.ugc_storyboards where job_id=candidate.job_id for share;
  select * into b from public.ugc_generation_packages where id=candidate.id for update skip locked;
  if not found or b.state not in ('queued','running') or b.error_code is not null or b.claim_token is not null and b.lease_expires_at>clock_timestamp() then continue; end if;
  if b.attempts>=3 or b.stale_at is not null or public.ugc_package_input(b.job_id) is distinct from b.input then
   update public.ugc_generation_packages set state='failed',phase='failed',error_code=case when b.attempts>=3 then 'PACKAGE_RECOVERY_EXHAUSTED' else 'PACKAGE_INPUT_CHANGED' end,
    claim_token=null,lease_expires_at=null,version=version+1,updated_at=clock_timestamp() where id=b.id; continue;
  end if;
  update public.ugc_generation_packages set state='running',phase='checking',attempts=attempts+1,worker_id=p_worker,claim_token=gen_random_uuid(),
   heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where id=b.id returning * into b;
  return b;
 end loop; return null;
end; $$;
create or replace function public.ugc_package_checkpoint(p_package uuid,p_token uuid,p_operation text,p_payload jsonb default '{}')
returns public.ugc_generation_packages language plpgsql security definer set search_path='' as $$
declare b public.ugc_generation_packages; job uuid; begin
 select job_id into job from public.ugc_generation_packages where id=p_package;
 if not found then return null; end if;
 perform public.ugc_storyboard_lock(job);
 perform 1 from public.ugc_storyboards where job_id=job for share;
 select * into b from public.ugc_generation_packages where id=p_package for update;
 if not found or p_token is null or b.claim_token is distinct from p_token or b.lease_expires_at<=clock_timestamp() or b.state<>'running' then return null; end if;
 if p_operation not in ('heartbeat','fail') and (b.stale_at is not null or public.ugc_package_input(job) is distinct from b.input) then return null; end if;
 if p_operation='heartbeat' then null;
 elsif p_operation='phase' and p_payload->>'phase' in ('building','validating','saving') then b.phase:=p_payload->>'phase';
 elsif p_operation='ready' and b.document is null then
  if not public.ugc_package_valid(p_payload->'document',b.input,b.revision,b.input_fingerprint) then return null; end if;
  b.document:=p_payload->'document'; b.package_hash:=b.document->>'packageHash'; b.state:='review'; b.phase:='review';
  b.validation_receipt:=jsonb_build_object('validatorVersion',1,'inputFingerprint',b.input_fingerprint,'packageHash',b.package_hash,
   'validatedAt',clock_timestamp(),'assetSha256',jsonb_build_object('character',b.input->'source'->'character'->'sha256',
    'product',b.input->'source'->'product'->'sha256','location',b.input->'source'->'location'->'sha256'));
 elsif p_operation='fail' then
  b.state:='failed'; b.phase:='failed'; b.error_code:=case when p_payload->>'code' in ('PACKAGE_INPUT_CHANGED','PACKAGE_ASSET_UNAVAILABLE','PACKAGE_INVALID') then p_payload->>'code' else 'PACKAGE_FAILED' end;
 else return null; end if;
 update public.ugc_generation_packages set state=b.state,phase=b.phase,error_code=b.error_code,document=b.document,package_hash=b.package_hash,validation_receipt=b.validation_receipt,
  version=version+case when p_operation='heartbeat' then 0 else 1 end,updated_at=case when p_operation='heartbeat' then updated_at else clock_timestamp() end,
  heartbeat_at=clock_timestamp(),claim_token=case when b.state='running' then p_token else null end,
  lease_expires_at=case when b.state='running' then clock_timestamp()+interval '90 seconds' else null end where id=b.id returning * into b;
 return b;
end; $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('ugc_package_canonical','ugc_package_digest','ugc_package_input','ugc_package_guard','ugc_package_audit',
   'ugc_package_project_changed','ugc_package_valid','ugc_package_action','ugc_package_claim','ugc_package_checkpoint') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('ugc_package_input','ugc_package_action','ugc_package_claim','ugc_package_checkpoint') then
   execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end; $$;
commit;
