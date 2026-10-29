-- V3 Phase 2 only. Manual migration; no data backfill, paid transport or V1/V2 mutation.
begin;
do $$ begin
  if to_regprocedure('public.ugc_package_digest(text,jsonb)') is null then raise exception 'Migration 068 canonical hashing required'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='owner_user_id' and data_type='uuid')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='project_assets' and column_name='verified_etag')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='creation_type')
  then raise exception 'Verify owned project and private asset schema before migration 076'; end if;
end $$;

create table if not exists public.ugc_v3_projects (
  project_id uuid primary key, owner_user_id uuid not null, logical_job_id uuid not null unique,
  workflow text not null default 'final-video-v3' check(workflow='final-video-v3'),
  created_at timestamptz not null default now(),
  unique(project_id,owner_user_id),
  foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict
);
create table if not exists public.ugc_v3_sources (
  project_id uuid not null references public.ugc_v3_projects(project_id), revision integer not null check(revision>0),
  input jsonb not null, input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  private_bindings jsonb not null, project_input_hash text not null, operator_id uuid not null references public.app_users(id),
  created_at timestamptz not null default now(), primary key(project_id,revision)
);
create table if not exists public.ugc_v3_packages (
  id uuid primary key, project_id uuid not null, version integer not null check(version>0), source_revision integer not null,
  document jsonb not null, package_hash text not null unique check(package_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(), unique(project_id,version), unique(id,project_id),
  foreign key(project_id,source_revision) references public.ugc_v3_sources(project_id,revision)
);
create table if not exists public.ugc_v3_authorizations (
  id uuid primary key, project_id uuid not null, package_id uuid not null,
  document jsonb not null, authorization_hash text not null unique check(authorization_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key(package_id,project_id) references public.ugc_v3_packages(id,project_id)
);
create table if not exists public.ugc_v3_events (
  package_id uuid not null references public.ugc_v3_packages(id), revision integer not null check(revision>=0),
  event_id uuid not null unique, event jsonb not null, state jsonb not null,
  state_hash text not null check(state_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
  primary key(package_id,revision)
);

create or replace function public.ugc_v3_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'V3 records are append-only'; end $$;
create or replace function public.ugc_v3_brief_hash(p_project uuid) returns text language sql stable set search_path='' as $$
  select public.ugc_package_digest('sceenyk-v3-project-brief',jsonb_build_object('prompt',p.prompt,'category',p.category,
    'aspectRatio',p.aspect_ratio,'duration',p.duration,'visualStyle',p.visual_style,'tone',p.tone,
    'creationType',p.creation_type,'ugcType',p.ugc_type)) from public.projects p where p.id=p_project and p.deleted_at is null;
$$;
do $$ declare t text; begin
  foreach t in array array['ugc_v3_projects','ugc_v3_sources','ugc_v3_packages','ugc_v3_authorizations','ugc_v3_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on table public.%I to service_role',t);
    if not exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgname=t||'_immutable') then
      execute format('create trigger %I before update or delete on public.%I for each row execute function public.ugc_v3_immutable()',t||'_immutable',t);
    end if;
  end loop;
end $$;

create or replace function public.ugc_v3_create_project(p_owner uuid,p_project uuid,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ugc_v3_projects;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project::text,76));
  select * into r from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner;
  if found then return to_jsonb(r); end if;
  if exists(select 1 from public.projects where id=p_project) then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
  insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type)
  values(p_project,p_owner,p_fields->>'title',p_fields->>'category',p_fields->>'prompt',p_fields->'settings'->>'aspectRatio',
    p_fields->'settings'->>'duration',p_fields->'settings'->>'visualStyle',p_fields->'settings'->>'tone','ugc',p_fields->>'ugcType');
  insert into public.ugc_v3_projects(project_id,owner_user_id,logical_job_id) values(p_project,p_owner,gen_random_uuid()) returning * into r;
  return to_jsonb(r);
end $$;

create or replace function public.ugc_v3_read(p_owner uuid,p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.ugc_v3_projects;
begin
  select * into r from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner;
  if not found then return null; end if;
  return jsonb_build_object('project',to_jsonb(r),
    'source',(select to_jsonb(s)||jsonb_build_object('current',s.project_input_hash is not distinct from public.ugc_v3_brief_hash(p_project))
      from public.ugc_v3_sources s where project_id=p_project order by revision desc limit 1),
    'packages',coalesce((select jsonb_agg(to_jsonb(p) order by version) from public.ugc_v3_packages p where project_id=p_project),'[]'::jsonb),
    'authorizations',coalesce((select jsonb_agg(to_jsonb(a) order by created_at,id) from public.ugc_v3_authorizations a where project_id=p_project),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.package_id,e.revision) from public.ugc_v3_events e
      join public.ugc_v3_packages p on p.id=e.package_id where p.project_id=p_project),'[]'::jsonb));
end $$;

create or replace function public.ugc_v3_write(p_owner uuid,p_project uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ugc_v3_projects; src public.ugc_v3_sources; pkg public.ugc_v3_packages;
  d jsonb; ref jsonb; binding jsonb; state jsonb; previous public.ugc_v3_events; revision integer; target_id uuid;
begin
  select * into r from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
  if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
  select s.* into src from public.ugc_v3_sources s where s.project_id=p_project order by s.revision desc limit 1;
  if p_action='source' then
    d:=p_payload->'input'; revision:=coalesce(src.revision,0)+1;
    if (p_payload->>'expectedRevision')::integer is distinct from revision-1 then raise exception 'SOURCE_VERSION_CONFLICT'; end if;
    if d->>'workflow' is distinct from 'final-video-v3' or d->'provenance'->>'projectWorkflow' is distinct from 'final-video-v3'
      or d->'scope'->>'projectId' is distinct from p_project::text or d->'scope'->>'ownerId' is distinct from p_owner::text
      or d->'scope'->>'jobId' is distinct from r.logical_job_id::text or p_payload->>'operatorId' is distinct from p_owner::text
      or p_payload->>'operatorApproved' is distinct from 'true'
    then raise exception 'V3_SOURCE_SCOPE_INVALID'; end if;
    if not exists(select 1 from public.project_assets a where a.id=(d->'provenance'->>'originalImageId')::uuid
      and a.project_id=p_project and a.owner_user_id=p_owner and a.upload_status='uploaded' and a.verified_etag is not null
      and a.media_type='image' and a.created_at>=r.created_at) then raise exception 'FRESH_PRIVATE_ORIGINAL_REQUIRED'; end if;
    if jsonb_array_length(d->'references')<3 then raise exception 'APPROVED_REFERENCES_REQUIRED'; end if;
    for ref in select value from jsonb_array_elements(d->'references') loop
      binding:=p_payload->'privateBindings'->(ref->>'id');
      if ref->>'projectId' is distinct from p_project::text or ref->>'originWorkflow' is distinct from 'final-video-v3'
        or ref->>'approvalId' is null or binding->>'verifiedReadback' is distinct from 'true'
        or binding->>'sha256' is distinct from ref->>'sha256'
        or binding->>'storageKey' is null or binding->>'storageKey' not like 'users/'||p_owner::text||'/projects/'||p_project::text||'/v3/%'
        or binding->>'storageKey' ~ '(\.\.|[?:\\])'
      then raise exception 'PRIVATE_APPROVED_REFERENCE_REQUIRED'; end if;
    end loop;
    if public.ugc_v3_brief_hash(p_project) is null then raise exception 'PROJECT_UNAVAILABLE'; end if;
    insert into public.ugc_v3_sources(project_id,revision,input,input_hash,private_bindings,project_input_hash,operator_id)
      values(p_project,revision,d,public.ugc_package_digest('sceenyk-v3-input',d),p_payload->'privateBindings',public.ugc_v3_brief_hash(p_project),p_owner);
  elsif p_action='package' then
    d:=p_payload->'document'; target_id:=(d->>'id')::uuid;
    select * into pkg from public.ugc_v3_packages where ugc_v3_packages.id=target_id;
    if found then
      if pkg.project_id<>p_project or pkg.document<>d then raise exception 'PACKAGE_IMMUTABLE'; end if;
      return public.ugc_v3_read(p_owner,p_project);
    end if;
    select coalesce(max(version),0)+1 into revision from public.ugc_v3_packages where project_id=p_project;
    if src.revision is null or src.project_input_hash is distinct from public.ugc_v3_brief_hash(p_project)
      or (d->>'sourceRevision')::integer is distinct from src.revision or d->'source' is distinct from src.input
      or d->>'inputHash' is distinct from src.input_hash or (d->>'version')::integer is distinct from revision
      or d->>'schema' is distinct from 'generation-package-v3.2'
      or d->>'hash' is distinct from public.ugc_package_digest('sceenyk-v3-frozen-package',d-'hash')
      or d->>'capabilityHash' is distinct from public.ugc_package_digest('sceenyk-v3-capabilities',d->'capabilitySnapshot')
    then raise exception 'PACKAGE_STALE_OR_INVALID'; end if;
    insert into public.ugc_v3_packages(id,project_id,version,source_revision,document,package_hash) values(target_id,p_project,revision,src.revision,d,d->>'hash');
    state:=p_payload->'state';
    if state->>'packageId' is distinct from target_id::text or state->>'packageHash' is distinct from d->>'hash' or state->>'state' is distinct from 'package_ready'
      or state->>'revision' is distinct from '0' or state->>'finalReview' is distinct from 'pending' or state->'finalCandidate' is distinct from 'null'::jsonb
      or jsonb_array_length(state->'segments') is distinct from jsonb_array_length(d->'segments')
    then raise exception 'INITIAL_STATE_INVALID'; end if;
    for ref in select value from jsonb_array_elements(state->'segments') loop
      if ref->'attempts' is distinct from '[]'::jsonb or not exists(select 1 from jsonb_array_elements(d->'segments') s
        where s->>'id'=ref->>'id' and s->>'fingerprint'=ref->>'fingerprint') then raise exception 'INITIAL_STATE_INVALID'; end if;
    end loop;
    insert into public.ugc_v3_events(package_id,revision,event_id,event,state,state_hash)
      values(target_id,0,(p_payload->>'eventId')::uuid,'{"type":"package_ready"}',state,public.ugc_package_digest('sceenyk-v3-execution-state',state));
  elsif p_action='authorization' then
    d:=p_payload->'document'; target_id:=(d->>'packageId')::uuid;
    if exists(select 1 from public.ugc_v3_authorizations a where a.id=(d->>'id')::uuid and a.project_id=p_project and a.document=d)
      then return public.ugc_v3_read(p_owner,p_project); end if;
    select * into pkg from public.ugc_v3_packages where ugc_v3_packages.id=target_id and project_id=p_project;
    if not found or pkg.source_revision is distinct from src.revision or src.project_input_hash is distinct from public.ugc_v3_brief_hash(p_project)
      or d->>'projectId' is distinct from p_project::text
      or d->>'packageHash' is distinct from pkg.package_hash or (d->>'packageVersion')::integer is distinct from pkg.version
      or d->>'workflow' is distinct from 'final-video-v3' or d->>'resolution' is distinct from '480p'
      or d->'operatorApproval'->>'operatorId' is distinct from p_owner::text
      or d->'operatorApproval'->>'decision' is distinct from 'approve_exact_package'
      or (d->'operatorApproval'->>'approvedAt')::timestamptz>now() or (d->'operatorApproval'->>'expiresAt')::timestamptz<=now()
      or (d->>'segmentCount')::integer is distinct from jsonb_array_length(pkg.document->'segments')
      or (d->>'maxRequests')::integer is distinct from jsonb_array_length(pkg.document->'segments')
      or d->>'durationMs' is distinct from pkg.document->'source'->'storyboardContent'->>'durationMs'
      or d->>'resolution' is distinct from pkg.document->'source'->>'resolution'
      or d->>'profileId' is distinct from pkg.document->'source'->>'profileId'
      or d->>'providerId' is distinct from pkg.document->'capabilitySnapshot'->>'providerId'
      or d->>'hash' is distinct from public.ugc_package_digest('sceenyk-v3-authorization',d-'hash')
      or pkg.document->'pricing'->>'status' is distinct from 'estimated'
      or (pkg.document->'pricing'->>'expiresAt')::timestamptz<=now()
      or coalesce((d->>'maxEstimatedCostMicrousd')::bigint,-1)<coalesce((pkg.document->'pricing'->>'totalMicrousd')::bigint,9223372036854775807)
    then raise exception 'AUTHORIZATION_PACKAGE_INVALID'; end if;
    insert into public.ugc_v3_authorizations(id,project_id,package_id,document,authorization_hash)
      values((d->>'id')::uuid,p_project,target_id,d,d->>'hash');
    -- Approval and its state checkpoint commit together, including after a process restart.
    perform public.ugc_v3_write(p_owner,p_project,'event',jsonb_build_object('packageId',target_id,
      'expectedRevision',p_payload->'expectedRevision','eventId',p_payload->'eventId','event',jsonb_build_object('type','authorize'),
      'state',p_payload->'state','authorizationId',d->>'id'));
  elsif p_action='event' then
    target_id:=(p_payload->>'packageId')::uuid;
    select * into pkg from public.ugc_v3_packages where ugc_v3_packages.id=target_id and project_id=p_project;
    if not found or pkg.source_revision is distinct from src.revision or src.project_input_hash is distinct from public.ugc_v3_brief_hash(p_project)
      then raise exception 'PACKAGE_STALE'; end if;
    select e.* into previous from public.ugc_v3_events e where e.package_id=target_id order by e.revision desc limit 1;
    if exists(select 1 from public.ugc_v3_events e where e.event_id=(p_payload->>'eventId')::uuid and e.package_id=target_id
      and e.event=p_payload->'event' and e.state=p_payload->'state') then return public.ugc_v3_read(p_owner,p_project); end if;
    if previous.revision is distinct from (p_payload->>'expectedRevision')::integer then raise exception 'EXECUTION_VERSION_CONFLICT'; end if;
    d:=p_payload->'event'; state:=p_payload->'state';
    -- Constant database fence. No flag/authorization can enable a paid transition.
    if d->>'type' not in ('await_authorization','authorize') then raise exception 'PAID_V3_EXECUTION_DISABLED'; end if;
    if d->>'type'='await_authorization' and (previous.state->>'state'<>'package_ready' or state->>'state'<>'awaiting_authorization')
      or d->>'type'='authorize' and (previous.state->>'state' not in ('package_ready','awaiting_authorization') or state->>'state'<>'authorized'
        or not exists(select 1 from public.ugc_v3_authorizations a where package_id=target_id and a.document->>'id'=p_payload->>'authorizationId'
          and (a.document->'operatorApproval'->>'expiresAt')::timestamptz>now()))
      or state-array['state','revision'] is distinct from previous.state-array['state','revision']
      or (state->>'revision')::integer is distinct from previous.revision+1
    then raise exception 'STATE_TRANSITION_INVALID'; end if;
    insert into public.ugc_v3_events(package_id,revision,event_id,event,state,state_hash)
      values(target_id,previous.revision+1,(p_payload->>'eventId')::uuid,d,state,public.ugc_package_digest('sceenyk-v3-execution-state',state));
  else raise exception 'PAID_V3_EXECUTION_DISABLED'; end if;
  return public.ugc_v3_read(p_owner,p_project);
end $$;

revoke all on function public.ugc_v3_immutable() from public,anon,authenticated,service_role;
revoke all on function public.ugc_v3_brief_hash(uuid) from public,anon,authenticated;
grant execute on function public.ugc_v3_brief_hash(uuid) to service_role;
revoke all on function public.ugc_v3_create_project(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.ugc_v3_read(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ugc_v3_write(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ugc_v3_create_project(uuid,uuid,jsonb) to service_role;
grant execute on function public.ugc_v3_read(uuid,uuid) to service_role;
grant execute on function public.ugc_v3_write(uuid,uuid,text,jsonb) to service_role;
commit;
