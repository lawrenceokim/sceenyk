-- Manual, after unchanged 076. V3-only runtime. No enrollment/backfill or legacy mutation.
begin;
do $$ begin if to_regclass('public.ugc_v3_projects') is null then raise exception 'Apply 076 first'; end if; end $$;
-- Existing executions are untouched; new V3 projects cannot enter a legacy queue.
create or replace function public.ugc_v3_reject_legacy_enrollment() returns trigger language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from public.ugc_v3_projects where project_id=new.project_id) then raise exception 'V3_PROJECT_REQUIRES_V3_WORKFLOW'; end if; return new; end $$;
do $$ declare t text; begin foreach t in array array['generation_jobs','ugc_generation_jobs'] loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='project_id' and data_type='uuid') then
  raise exception 'Verify legacy project ownership column before 077'; end if;
 if not exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgname='ugc_v3_isolation') then
  execute format('create trigger ugc_v3_isolation before insert on public.%I for each row execute function public.ugc_v3_reject_legacy_enrollment()',t);
 end if;
end loop; end $$;
revoke all on function public.ugc_v3_reject_legacy_enrollment() from public,anon,authenticated,service_role;
create table if not exists public.ugc_v3_tasks (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.ugc_v3_projects(project_id),
 kind text not null check(kind in ('character','product','location','storyboard','package','video','delete','join')),
 request_key text not null, input jsonb not null, status text not null default 'queued' check(status in ('queued','running','done','failed','reconciliation_required')),
 provider_started boolean not null default false, lease_token uuid, lease_until timestamptz, output jsonb, error_code text,
 available_at timestamptz not null default now(), poll_count integer not null default 0,
 created_at timestamptz not null default now(), unique(project_id,request_key)
);
create table if not exists public.ugc_v3_artifacts (
 id uuid primary key, project_id uuid not null references public.ugc_v3_projects(project_id), task_id uuid not null unique references public.ugc_v3_tasks(id),
 kind text not null check(kind in ('character','product','location','storyboard','joined')), version integer not null check(version>0),
 document jsonb not null, approved_at timestamptz, rejected_at timestamptz, created_at timestamptz not null default now(),
 unique(project_id,kind,version), check(approved_at is null or rejected_at is null)
);
create table if not exists public.ugc_v3_quotes (
 id uuid primary key, project_id uuid not null references public.ugc_v3_projects(project_id), package_id uuid not null unique references public.ugc_v3_packages(id),
 document jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.ugc_v3_run_authorizations (
 id uuid primary key, project_id uuid not null references public.ugc_v3_projects(project_id), package_id uuid not null references public.ugc_v3_packages(id),
 quote_id uuid not null references public.ugc_v3_quotes(id), segment_uuid uuid not null, document jsonb not null,
 created_at timestamptz not null default now(), unique(package_id,segment_uuid)
);
create table if not exists public.ugc_v3_runs (
 id uuid primary key, project_id uuid not null references public.ugc_v3_projects(project_id), package_id uuid not null references public.ugc_v3_packages(id),
 segment_uuid uuid not null, segment_key text not null, authorization_id uuid not null unique references public.ugc_v3_run_authorizations(id),
 intent jsonb not null, state text not null check(state in ('queued','submitting','provider_processing','reconciliation_required','result_saved','awaiting_review','approved','failed','deleting','deleted')),
 observation jsonb, result jsonb, quality jsonb, error_code text, completed_at timestamptz, created_at timestamptz not null default now(),
 unique(package_id,segment_key)
);
create table if not exists public.ugc_v3_runtime_events (
 id bigint generated always as identity primary key, project_id uuid not null references public.ugc_v3_projects(project_id),
 entity_id uuid not null, kind text not null, document jsonb not null, created_at timestamptz not null default now()
);
do $$ declare t text; begin foreach t in array array['ugc_v3_tasks','ugc_v3_artifacts','ugc_v3_quotes','ugc_v3_run_authorizations','ugc_v3_runs','ugc_v3_runtime_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on table public.%I to service_role',t);
end loop; end $$;
create or replace function public.ugc_v3_runtime_current(p_package uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ugc_v3_packages p join public.ugc_v3_sources s on s.project_id=p.project_id and s.revision=p.source_revision
 where p.id=p_package and s.revision=(select max(x.revision) from public.ugc_v3_sources x where x.project_id=p.project_id)
 and s.project_input_hash=public.ugc_v3_brief_hash(p.project_id)
 and not exists(select 1 from public.ugc_v3_tasks t where t.project_id=p.project_id and t.kind in ('character','product','location','storyboard') and t.created_at>s.created_at)
 and not exists(select 1 from public.ugc_v3_artifacts latest where latest.project_id=p.project_id and latest.kind in ('character','product','location')
   and not exists(select 1 from public.ugc_v3_artifacts n where n.project_id=latest.project_id and n.kind=latest.kind and n.version>latest.version)
   and not exists(select 1 from jsonb_array_elements(s.input->'references') r where r->>'id'=latest.id::text))
 and not exists(select 1 from jsonb_array_elements(s.input->'references') r where not exists(
   select 1 from public.ugc_v3_artifacts a where a.project_id=p.project_id and a.id=(r->>'id')::uuid and a.approved_at is not null and a.rejected_at is null
   and a.version=(r->>'version')::integer and a.document->'asset'->>'sha256'=r->>'sha256'
   and not exists(select 1 from public.ugc_v3_artifacts newer where newer.project_id=a.project_id and newer.kind=a.kind and newer.version>a.version)))
 and exists(select 1 from public.ugc_v3_artifacts b where b.id=(s.input->'storyboard'->>'id')::uuid and b.project_id=p.project_id and b.approved_at is not null and b.rejected_at is null
   and b.version=(s.input->'storyboard'->>'version')::integer
   and b.document->'input'->'references' is not distinct from (select jsonb_agg(r->>'id' order by ord) from jsonb_array_elements(s.input->'references') with ordinality a(r,ord))
   and not exists(select 1 from public.ugc_v3_artifacts n where n.project_id=b.project_id and n.kind='storyboard' and n.version>b.version)))
$$;
create or replace function public.ugc_v3_runtime_read(p_owner uuid,p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner) then return null; end if;
 return public.ugc_v3_read(p_owner,p_project)||jsonb_build_object(
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by created_at) from public.ugc_v3_tasks t where project_id=p_project),'[]'),
 'artifacts',coalesce((select jsonb_agg(to_jsonb(a) order by version,created_at) from public.ugc_v3_artifacts a where project_id=p_project),'[]'),
 'quotes',coalesce((select jsonb_agg(to_jsonb(q) order by created_at) from public.ugc_v3_quotes q where project_id=p_project),'[]'),
 'runtimeAuthorizations',coalesce((select jsonb_agg(to_jsonb(a) order by created_at) from public.ugc_v3_run_authorizations a where project_id=p_project),'[]'),
 'runs',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('current',public.ugc_v3_runtime_current(package_id)) order by created_at) from public.ugc_v3_runs r where project_id=p_project),'[]'));
end $$;

create or replace function public.ugc_v3_runtime_action(p_owner uuid,p_project uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.ugc_v3_tasks; artifact public.ugc_v3_artifacts; pkg public.ugc_v3_packages; quote public.ugc_v3_quotes;
 auth public.ugc_v3_run_authorizations; run public.ugc_v3_runs; d jsonb; seg jsonb; target uuid; version_number integer;
begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 if p_action='source' then
  d:=p_payload->'input';
  if exists(select 1 from public.ugc_v3_tasks where project_id=p_project and kind in ('character','product','location','storyboard') and status in ('queued','running','reconciliation_required'))
    then raise exception 'V3_CREATIVE_REQUEST_STILL_ACTIVE'; end if;
  if d->>'workflow' is distinct from 'final-video-v3' or d->'scope'->>'projectId' is distinct from p_project::text
   or d->'scope'->>'ownerId' is distinct from p_owner::text or d->'scope'->>'jobId' is distinct from
     (select logical_job_id::text from public.ugc_v3_projects where project_id=p_project)
   or not exists(select 1 from public.project_assets a join public.ugc_v3_projects v on v.project_id=a.project_id where a.project_id=p_project
     and a.id=(d->'provenance'->>'originalImageId')::uuid and a.upload_status='uploaded' and a.created_at>=v.created_at)
   then raise exception 'FRESH_V3_SOURCE_REQUIRED'; end if;
  for seg in select value from jsonb_array_elements(d->'references') loop
   if not exists(select 1 from public.ugc_v3_artifacts a where a.id=(seg->>'id')::uuid and a.project_id=p_project and a.approved_at is not null
    and a.rejected_at is null and a.document->'asset'->>'sha256'=seg->>'sha256') then raise exception 'APPROVED_V3_REFERENCES_REQUIRED'; end if;
  end loop;
  if not exists(select 1 from public.ugc_v3_artifacts a where a.id=(d->'storyboard'->>'id')::uuid and a.project_id=p_project and a.kind='storyboard'
    and a.approved_at is not null and a.rejected_at is null) then raise exception 'APPROVED_V3_STORYBOARD_REQUIRED'; end if;
  select coalesce(max(revision),0)+1 into version_number from public.ugc_v3_sources where project_id=p_project;
  insert into public.ugc_v3_sources(project_id,revision,input,input_hash,private_bindings,project_input_hash,operator_id)
    values(p_project,version_number,d,public.ugc_package_digest('sceenyk-v3-input',d),p_payload->'privateBindings',public.ugc_v3_brief_hash(p_project),p_owner);
 elsif p_action='enqueue' then
  if p_payload->>'kind' not in ('character','product','location','storyboard','package','join') then raise exception 'INVALID_TASK'; end if;
  if p_payload->>'kind' in ('character','product','location','storyboard') and exists(select 1 from public.ugc_v3_tasks t where t.project_id=p_project
   and t.kind=p_payload->>'kind' and t.status in ('queued','running','reconciliation_required') and t.request_key<>p_payload->>'requestKey')
   then raise exception 'V3_CREATIVE_REQUEST_ALREADY_ACTIVE'; end if;
  insert into public.ugc_v3_tasks(project_id,kind,request_key,input) values(p_project,p_payload->>'kind',p_payload->>'requestKey',p_payload->'input')
  on conflict(project_id,request_key) do nothing;
 elsif p_action='review_artifact' then
  select * into artifact from public.ugc_v3_artifacts where id=(p_payload->>'id')::uuid and project_id=p_project for update;
  if not found or artifact.approved_at is not null or artifact.rejected_at is not null then raise exception 'ARTIFACT_REVIEW_UNAVAILABLE'; end if;
  if artifact.kind='joined' then raise exception 'JOINED_REVIEW_REQUIRES_FINAL_VALIDATION'; end if;
  if p_payload->>'decision'='approve' then update public.ugc_v3_artifacts set approved_at=now() where id=artifact.id;
  elsif p_payload->>'decision'='reject' then update public.ugc_v3_artifacts set rejected_at=now() where id=artifact.id;
  else raise exception 'INVALID_REVIEW'; end if;
 elsif p_action='quote' then
  d:=p_payload->'document'; target:=(d->>'packageId')::uuid;
  select * into pkg from public.ugc_v3_packages where id=target and project_id=p_project;
  if not found or not public.ugc_v3_runtime_current(target) or d->>'packageHash' is distinct from pkg.package_hash or d->>'currency' is distinct from 'USD'
   or (d->>'expiresAt')::timestamptz<=now() or d->>'totalMicrousd' is distinct from pkg.document->'pricing'->>'totalMicrousd'
   then raise exception 'QUOTE_STALE_OR_INVALID'; end if;
  for seg in select value from jsonb_array_elements(d->'segments') loop
   if seg->>'bodyHash' is distinct from encode(sha256(convert_to(public.ugc_package_canonical(seg->'body'),'UTF8')),'hex')
    or not exists(select 1 from jsonb_array_elements(pkg.document->'segments') plan where plan->>'id'=seg->>'segmentId' and plan->>'fingerprint'=seg->>'fingerprint')
    then raise exception 'QUOTE_BODY_BINDING_INVALID'; end if;
  end loop;
  insert into public.ugc_v3_quotes(id,project_id,package_id,document) values((d->>'id')::uuid,p_project,target,d);
 elsif p_action='authorize' then
  d:=p_payload->'document'; target:=(d->>'packageId')::uuid;
  select * into pkg from public.ugc_v3_packages where id=target and project_id=p_project;
  select * into quote from public.ugc_v3_quotes where id=(d->>'quoteId')::uuid and package_id=target and project_id=p_project;
  select value into seg from jsonb_array_elements(quote.document->'segments') where value->>'segmentUuid'=d->>'segmentUuid';
  if pkg.id is null or quote.id is null or seg is null or not public.ugc_v3_runtime_current(target)
   or d->>'schema' is distinct from 'v3-paid-authorization-v1' or d->>'projectId' is distinct from p_project::text
   or d->>'packageHash' is distinct from pkg.package_hash or (d->>'packageVersion')::integer is distinct from pkg.version
   or d->>'segmentId' is distinct from seg->>'segmentId' or d->>'segmentHash' is distinct from seg->>'fingerprint'
   or d->>'model' is distinct from seg->>'model' or d->>'resolution' is distinct from '480p' or d->>'generateAudio' is distinct from 'true'
   or d->>'durationMs' is distinct from (select plan->>'durationMs' from jsonb_array_elements(pkg.document->'segments') plan where plan->>'id'=seg->>'segmentId')
   or d->>'provider' is distinct from 'higgsfield' or d->>'segmentVersion' is distinct from '1'
   or d->>'maxRequests' is distinct from '1' or d->>'operatorId' is distinct from p_owner::text
   or (d->>'approvedAt')::timestamptz>now() or (d->>'expiresAt')::timestamptz> (quote.document->>'expiresAt')::timestamptz
   or (d->>'expiresAt')::timestamptz<=now() or coalesce((d->>'maxEstimatedCostMicrousd')::bigint,-1)<(seg->>'estimatedCostMicrousd')::bigint
   or coalesce((d->>'packageMaxEstimatedCostMicrousd')::bigint,-1)<(quote.document->>'totalMicrousd')::bigint
   or exists(select 1 from public.ugc_v3_run_authorizations a where a.package_id=target and a.document->>'packageMaxEstimatedCostMicrousd' is distinct from d->>'packageMaxEstimatedCostMicrousd')
   or coalesce((select sum((a.document->>'maxEstimatedCostMicrousd')::bigint) from public.ugc_v3_run_authorizations a where a.package_id=target),0)
     +(d->>'maxEstimatedCostMicrousd')::bigint > (d->>'packageMaxEstimatedCostMicrousd')::bigint
   or d->>'hash' is distinct from public.ugc_package_digest('sceenyk-v3-runtime-authorization',d-'hash') then raise exception 'V3_AUTHORIZATION_INVALID'; end if;
  insert into public.ugc_v3_run_authorizations(id,project_id,package_id,quote_id,segment_uuid,document)
   values((d->>'id')::uuid,p_project,target,quote.id,(d->>'segmentUuid')::uuid,d);
 elsif p_action='generate' then
  d:=p_payload->'intent'; target:=(d->>'packageId')::uuid;
  select * into run from public.ugc_v3_runs where package_id=target and segment_key=d->>'segmentId' and project_id=p_project;
  if found then return to_jsonb(run); end if;
  if exists(select 1 from public.ugc_v3_runs where project_id=p_project and package_id<>target and state not in ('approved','failed','deleted'))
    then raise exception 'V3_PRIOR_OUTCOME_REQUIRES_RECONCILIATION'; end if;
  select * into pkg from public.ugc_v3_packages where id=target and project_id=p_project;
  select * into auth from public.ugc_v3_run_authorizations where id=(d->'authorization'->>'id')::uuid and package_id=target and project_id=p_project;
  select * into quote from public.ugc_v3_quotes where id=auth.quote_id and project_id=p_project;
  select value into seg from jsonb_array_elements(quote.document->'segments') where value->>'segmentUuid'=d->>'segmentUuid';
  if pkg.id is null or auth.id is null or seg is null or not public.ugc_v3_runtime_current(target)
   or (auth.document->>'expiresAt')::timestamptz<=now() or (quote.document->>'expiresAt')::timestamptz<=now()
   or d->'authorization' is distinct from auth.document or d->>'packageHash' is distinct from pkg.package_hash
   or d->>'projectId' is distinct from p_project::text or d->>'attempt' is distinct from '1'
   or d->>'segmentUuid' is distinct from auth.segment_uuid::text or d->>'packageVersion' is distinct from pkg.version::text
   or d->>'bodyHash' is distinct from encode(sha256(convert_to(public.ugc_package_canonical(d->'body'),'UTF8')),'hex')
   or d->>'requestFingerprint' is distinct from seg->>'fingerprint' or d->>'segmentHash' is distinct from seg->>'fingerprint'
   or d->>'bodyHash' is distinct from seg->>'bodyHash' or d->'body' is distinct from seg->'body'
   or d->>'estimatedCostMicrousd' is distinct from seg->>'estimatedCostMicrousd'
   or d->>'model' is distinct from seg->>'model' or d->>'hash' is distinct from public.ugc_package_digest('sceenyk-v3-paid-intent',d-'hash')
   then raise exception 'PAID_INTENT_INVALID_OR_STALE'; end if;
  insert into public.ugc_v3_runs(id,project_id,package_id,segment_uuid,segment_key,authorization_id,intent,state)
   values((d->>'executionId')::uuid,p_project,target,(d->>'segmentUuid')::uuid,d->>'segmentId',auth.id,d,'queued') returning * into run;
  insert into public.ugc_v3_tasks(project_id,kind,request_key,input) values(p_project,'video','video:'||run.id,jsonb_build_object('runId',run.id));
  return to_jsonb(run);
 elsif p_action='recover' then
  select * into run from public.ugc_v3_runs where id=(p_payload->>'id')::uuid and project_id=p_project for update;
  if not found or run.state in ('approved','deleted','failed') then raise exception 'RECOVERY_UNAVAILABLE'; end if;
  if run.result is not null and run.state<>'deleting' then return to_jsonb(run); end if;
  update public.ugc_v3_tasks set status='queued',lease_token=null,lease_until=null where project_id=p_project and input->>'runId'=run.id::text
   and (lease_until is null or lease_until<now());
 elsif p_action='recover_task' then
  update public.ugc_v3_tasks set status='queued',lease_token=null,lease_until=null where id=(p_payload->>'id')::uuid and project_id=p_project
   and kind in ('character','product','location','storyboard','join') and status in ('failed','reconciliation_required') and (lease_until is null or lease_until<now());
 elsif p_action='recover_delete' then
  update public.ugc_v3_tasks set status='queued',lease_token=null,lease_until=null where project_id=p_project and kind='delete'
   and input->>'artifactId'=p_payload->>'id' and (lease_until is null or lease_until<now());
 elsif p_action in ('approve_joined','reject_joined') then
  select * into artifact from public.ugc_v3_artifacts where id=(p_payload->>'id')::uuid and project_id=p_project and kind='joined' for update;
  if not found or artifact.approved_at is not null or artifact.rejected_at is not null then raise exception 'JOINED_REVIEW_UNAVAILABLE'; end if;
  if p_action='approve_joined' then
   if not public.ugc_v3_runtime_current((artifact.document->>'packageId')::uuid)
    or p_payload->'quality'->>'characterContinuity' is distinct from 'pass' or p_payload->'quality'->>'locationContinuity' is distinct from 'pass'
    or p_payload->'quality'->>'visualQuality' is distinct from 'pass'
    or exists(select 1 from jsonb_each_text(p_payload->'quality') where value in ('fail','not_checked'))
    or exists(select 1 from jsonb_array_elements(artifact.document->'segments') s where not exists(select 1 from public.ugc_v3_runs r
      where r.id=(s->>'runId')::uuid and r.state='approved' and r.project_id=p_project and r.result->>'sha256'=s->>'assetHash'))
     then raise exception 'JOINED_APPROVAL_INVALID'; end if;
   update public.ugc_v3_artifacts set approved_at=now() where id=artifact.id;
  else
   update public.ugc_v3_artifacts set rejected_at=now() where id=artifact.id;
   insert into public.ugc_v3_tasks(project_id,kind,request_key,input) values(p_project,'delete','delete:'||artifact.id,jsonb_build_object('artifactId',artifact.id)) on conflict do nothing;
  end if;
 elsif p_action in ('approve','reject_delete') then
  select * into run from public.ugc_v3_runs where id=(p_payload->>'id')::uuid and project_id=p_project for update;
  if not found or run.state<>'awaiting_review' or run.result is null then raise exception 'VIDEO_REVIEW_UNAVAILABLE'; end if;
  if p_action='approve' then
   if not public.ugc_v3_runtime_current(run.package_id)
    or p_payload->'quality'->>'characterContinuity' is distinct from 'pass' or p_payload->'quality'->>'locationContinuity' is distinct from 'pass'
    or p_payload->'quality'->>'visualQuality' is distinct from 'pass'
    or exists(select 1 from jsonb_each_text(p_payload->'quality') where value='fail' or value='not_checked')
    or exists(select 1 from public.ugc_v3_packages p,jsonb_array_elements(p.document->'source'->'references') ref where p.id=run.package_id and ref->>'role'='product')
      and p_payload->'quality'->>'productContinuity' is distinct from 'pass'
    or exists(select 1 from public.ugc_v3_packages p,jsonb_array_elements(p.document->'source'->'storyboardContent'->'scenes') scene,
       jsonb_array_elements(scene->'speech') speech where p.id=run.package_id and length(speech->>'text')>0)
      and (p_payload->'quality'->>'dialoguePresence' is distinct from 'pass' or p_payload->'quality'->>'speechTiming' is distinct from 'pass')
    or exists(select 1 from public.ugc_v3_packages p,jsonb_array_elements(p.document->'source'->'storyboardContent'->'scenes') scene,
       jsonb_array_elements(scene->'speech') speech where p.id=run.package_id and speech->>'speaker'='character' and length(speech->>'text')>0)
      and p_payload->'quality'->>'lipAudioSync' is distinct from 'pass'
    then raise exception 'CURRENT_REVIEW_REQUIRED'; end if;
   update public.ugc_v3_runs set state='approved',quality=p_payload->'quality',completed_at=now() where id=run.id;
  else
   update public.ugc_v3_runs set state='deleting',quality=p_payload->'quality' where id=run.id;
   insert into public.ugc_v3_tasks(project_id,kind,request_key,input) values(p_project,'delete','delete:'||run.id,jsonb_build_object('runId',run.id)) on conflict do nothing;
  end if;
 else raise exception 'V3_ACTION_INVALID'; end if;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,coalesce(target,p_project),p_action,p_payload-'intent'-'document');
 return public.ugc_v3_runtime_read(p_owner,p_project);
end $$;

create or replace function public.ugc_v3_task_claim(p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; begin
 select * into t from public.ugc_v3_tasks where project_id=p_project and (status='queued' and available_at<=now() or status='running' and lease_until<now()) order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.ugc_v3_tasks set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes' where id=t.id returning * into t;
 return to_jsonb(t);
end $$;
create or replace function public.ugc_v3_task_checkpoint(p_task uuid,p_token uuid,p_action text,p_payload jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; r public.ugc_v3_runs; n integer; current_brief jsonb; begin
 select * into t from public.ugc_v3_tasks where id=p_task and lease_token=p_token and status='running' and lease_until>now() for update;
 if not found then return false; end if;
 if p_action='intent' then
  if t.provider_started then raise exception 'PROVIDER_INTENT_ALREADY_EXISTS'; end if;
  if t.kind in ('character','product','location','storyboard') then
   select jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,
     'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type) into current_brief from public.projects p where p.id=t.project_id and p.deleted_at is null;
   if t.input->>'briefHash' is distinct from public.ugc_package_digest('sceenyk-v3-brief',current_brief) then raise exception 'V3_CREATIVE_INPUT_STALE'; end if;
  end if;
  update public.ugc_v3_tasks set provider_started=true where id=t.id;
  if t.kind='video' then
   select * into r from public.ugc_v3_runs where id=(t.input->>'runId')::uuid and project_id=t.project_id for update;
   if r.state<>'queued' or not public.ugc_v3_runtime_current(r.package_id)
     or (r.intent->'authorization'->>'expiresAt')::timestamptz<=now() then raise exception 'SUBMISSION_STALE_OR_ALREADY_STARTED'; end if;
   update public.ugc_v3_runs set state='submitting' where id=r.id;
  end if;
 elsif p_action='artifact' then
  if t.kind not in ('character','product','location','storyboard','join') then raise exception 'INVALID_ARTIFACT_TASK'; end if;
  perform 1 from public.ugc_v3_projects where project_id=t.project_id for update;
  select coalesce(max(version),0)+1 into n from public.ugc_v3_artifacts where project_id=t.project_id and kind=case when t.kind='join' then 'joined' else t.kind end;
  insert into public.ugc_v3_artifacts(id,project_id,task_id,kind,version,document) values((p_payload->>'id')::uuid,t.project_id,t.id,
    case when t.kind='join' then 'joined' else t.kind end,n,p_payload->'document');
  update public.ugc_v3_tasks set status='done',output=p_payload where id=t.id;
 elsif p_action='observation' then
  select * into r from public.ugc_v3_runs where id=(t.input->>'runId')::uuid and project_id=t.project_id for update;
  if r.id is null or r.state not in ('submitting','provider_processing','reconciliation_required') or
   r.observation is not null and r.observation->>'requestId' is distinct from p_payload->>'requestId' then raise exception 'PROVIDER_RECEIPT_MISMATCH'; end if;
  update public.ugc_v3_runs set observation=p_payload,state=case when p_payload->>'status' in ('failed','nsfw','canceled') then 'failed' else 'provider_processing' end where id=r.id;
 elsif p_action='result' then
  select * into r from public.ugc_v3_runs where id=(t.input->>'runId')::uuid and project_id=t.project_id for update;
  if r.observation->>'status' is distinct from 'completed' or r.result is not null or p_payload->>'id' is distinct from r.id::text
   or p_payload->>'mimeType' is distinct from 'video/mp4' or p_payload->>'hasAudio' is distinct from 'true'
   or p_payload->>'storageKey' is distinct from 'users/'||(select owner_user_id::text from public.ugc_v3_projects where project_id=t.project_id)||'/projects/'||t.project_id||'/v3/'||r.id||'.mp4'
   then raise exception 'PRIVATE_RESULT_BINDING_INVALID'; end if;
  update public.ugc_v3_runs set result=p_payload,state='awaiting_review',error_code=null where id=r.id;
  update public.ugc_v3_tasks set status='done',output=p_payload where id=t.id;
 elsif p_action='deleted' then
  update public.ugc_v3_runs set state='deleted' where id=(t.input->>'runId')::uuid and project_id=t.project_id and state='deleting';
  update public.ugc_v3_tasks set status='done' where id=t.id;
 elsif p_action in ('done','pending','failed','unknown') then
  update public.ugc_v3_tasks set status=case p_action when 'done' then 'done' when 'pending' then 'queued' when 'unknown' then 'reconciliation_required' else 'failed' end,
   error_code=p_payload->>'code',lease_token=null,lease_until=null,
   available_at=case when p_action='pending' then now()+make_interval(secs=>least(10.0,2.0*power(1.5,poll_count))) else available_at end,
   poll_count=case when p_action='pending' then poll_count+1 else poll_count end where id=t.id;
  if p_action='pending' and t.created_at<now()-interval '60 minutes' then
   update public.ugc_v3_tasks set status='reconciliation_required',error_code='V3_POLL_DEADLINE_REACHED' where id=t.id;
  end if;
  if t.kind='video' and p_action in ('unknown','failed') then update public.ugc_v3_runs set state=case p_action when 'unknown' then 'reconciliation_required' else 'failed' end,
   error_code=p_payload->>'code' where id=(t.input->>'runId')::uuid and result is null; end if;
 else raise exception 'INVALID_CHECKPOINT'; end if;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(t.project_id,t.id,p_action,jsonb_build_object('code',p_payload->>'code',
   'httpStatus',p_payload->'httpStatus','correlationId',p_payload->'correlationId','outcome',p_payload->'outcome'));
 return true;
end $$;
do $$ declare f regprocedure; begin for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
 ('ugc_v3_runtime_current','ugc_v3_runtime_read','ugc_v3_runtime_action','ugc_v3_task_claim','ugc_v3_task_checkpoint') loop
 execute format('revoke all on function %s from public,anon,authenticated',f);
 execute format('grant execute on function %s to service_role',f);
end loop; end $$;
commit;
