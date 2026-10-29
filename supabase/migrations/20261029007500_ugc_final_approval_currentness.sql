-- Manual after 074. Lifecycle state is not creative input; approved bytes/hashes stay immutable.
begin;
do $$ begin
 if to_regprocedure('public.ugc_final_retry_stage(uuid,uuid,jsonb)') is null
  or to_regprocedure('public.ugc_storyboard_input(uuid)') is null
  or to_regclass('public.ugc_final_executions') is null then raise exception 'Apply 074 and prerequisites first'; end if;
end $$;

-- Read current creative bindings after generation and completion too. Cancellation still fails closed.
create or replace function public.ugc_storyboard_creative_input_075(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations; c public.ugc_location_candidates;
 scene jsonb; deps jsonb; character_asset jsonb; product_asset jsonb; wardrobe jsonb;
begin
 select * into j from public.ugc_generation_jobs where id=p_job;
 if not found or j.status='cancelled' or j.cancellation_requested_at is not null then return null; end if;
 deps:=public.ugc_location_dependencies(j.id); scene:=public.ugc_location_scene(j.id);
 if deps is null or scene is null or scene->'settings'->>'duration' not in ('5','10','30') then return null; end if;
 if coalesce(length(btrim(scene->'character'->>'name')),0) not between 1 and 80
  or coalesce(length(btrim(scene->'product'->>'name')),0) not between 1 and 80 then return null; end if;
 select * into l from public.ugc_locations where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id
  and location_index=1 order by revision desc limit 1;
 if not found or l.state<>'approved' or l.dependencies is distinct from deps or not public.ugc_location_scene_matches(l.scene,scene) then return null; end if;
 select * into c from public.ugc_location_candidates where id=l.accepted_candidate_id and location_id=l.id and state='accepted';
 if not found or c.artifact is null then return null; end if;
 select sheet into character_asset from public.ugc_character_v5_workflows where job_id=j.id and state='approved' and approved_at is not null;
 if character_asset is null then
  select case when r.composed_version>1 then r.composed_asset else s.document->'assets'->'sheet' end,s.document->'wardrobe'
   into character_asset,wardrobe from public.ugc_reference_reviews r join public.ugc_character_sheets s on s.id=r.character_sheet_id
   where r.job_id=j.id and r.reference_type='character';
 end if;
 select case when r.composed_version>1 then r.composed_asset else s.document->'assets'->'sheet' end into product_asset
  from public.ugc_reference_reviews r join public.ugc_product_sheets s on s.id=r.product_sheet_id where r.job_id=j.id and r.reference_type='product';
 if character_asset->>'id' is null or product_asset->>'id' is null or c.artifact->>'id' is null then return null; end if;
 return jsonb_build_object('scene',scene,'dependencies',deps||jsonb_build_object('locationId',l.id,'locationVersion',l.version,'locationCandidateId',c.id),
  'character',character_asset,'product',product_asset,'location',c.artifact,'locationPlan',l.plan,'wardrobe',wardrobe);
end; $$;

-- Mutation/worker eligibility keeps the original lifecycle-gated Storyboard resolver.
create or replace function public.ugc_package_input(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.ugc_generation_jobs; b public.ugc_storyboards; src jsonb; assets jsonb:='{}'; role text; a jsonb;
 ca record; pa record; la record;
begin
 select * into j from public.ugc_generation_jobs where id=p_job;
 if not found then return null; end if;
 src:=public.ugc_storyboard_creative_input_075(p_job);
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
revoke all on function public.ugc_storyboard_creative_input_075(uuid) from public,anon,authenticated,service_role;

create table if not exists public.ugc_final_approval_attempts (
 id bigint generated always as identity primary key,
 execution_id uuid not null references public.ugc_final_executions(id) on delete restrict,
 expected_version integer not null, observed_version integer not null,
 package_id uuid not null, package_hash text not null, package_version integer not null,
 final_asset jsonb, final_fingerprint text,
 outcome text not null check(outcome in ('approved','failed','reopened')),
 error_code text check(error_code is null or error_code ~ '^FINAL_[A-Z0-9_]{1,100}$'),
 diagnostic jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.ugc_final_approval_attempts enable row level security;
revoke all on public.ugc_final_approval_attempts from public,anon,authenticated,service_role;
revoke all on sequence public.ugc_final_approval_attempts_id_seq from public,anon,authenticated,service_role;
grant select on public.ugc_final_approval_attempts to service_role;
drop trigger if exists ugc_final_approval_append_only on public.ugc_final_approval_attempts;
create trigger ugc_final_approval_append_only before update or delete on public.ugc_final_approval_attempts
 for each row execute function public.ugc_reject_event_mutation();

create or replace function public.ugc_final_record_approval_failure(p_owner uuid,p_execution uuid,p_version integer,p_code text)
returns void language plpgsql security definer set search_path='' as $$
declare e public.ugc_final_executions; begin
 select * into e from public.ugc_final_executions where id=p_execution and owner_user_id=p_owner;
 if e.id is null or p_code !~ '^FINAL_[A-Z0-9_]{1,100}$' then return; end if;
 insert into public.ugc_final_approval_attempts(execution_id,expected_version,observed_version,package_id,package_hash,package_version,
  final_asset,final_fingerprint,outcome,error_code)
 values(e.id,p_version,e.version,e.package_id,e.package_hash,e.package_version,e.final_asset,e.final_fingerprint,'failed',p_code);
end $$;

-- Keep the non-approval action, retry, funding and recovery behavior verbatim.
do $$ begin
 if to_regprocedure('public.ugc_final_action_before_075(uuid,uuid,uuid,text,jsonb)') is null then
  alter function public.ugc_final_action(uuid,uuid,uuid,text,jsonb) rename to ugc_final_action_before_075;
 end if;
end $$;
create or replace function public.ugc_final_action(p_owner uuid,p_project uuid,p_job uuid,p_action text,p_payload jsonb)
returns public.ugc_final_executions language plpgsql security definer set search_path='' as $$
declare e public.ugc_final_executions; reason text; begin
 if p_action<>'approve' then return public.ugc_final_action_before_075(p_owner,p_project,p_job,p_action,p_payload); end if;
 perform public.ugc_storyboard_lock(p_job);
 if not exists(select 1 from public.ugc_generation_jobs j join public.projects pr on pr.id=j.project_id
  where j.id=p_job and j.owner_user_id=p_owner and j.project_id=p_project and pr.owner_user_id=p_owner and pr.status='draft') then return null; end if;
 select * into e from public.ugc_final_executions where id=(p_payload->>'executionId')::uuid
  and owner_user_id=p_owner and project_id=p_project and job_id=p_job for update;
 if e.id is null then return null; end if;
 perform 1 from public.ugc_generation_packages where id=e.package_id for share;
 perform 1 from public.ugc_storyboards where job_id=p_job order by revision for share;
 reason:=case
  when not public.ugc_final_current(e.id) then 'FINAL_PACKAGE_CHANGED'
  when e.state not in ('review','approved') or e.claim_token is not null then 'FINAL_NOT_READY'
  when e.state<>'approved' and e.version is distinct from (p_payload->>'version')::integer then 'FINAL_CONFLICT'
  when p_payload->'verifiedAsset' is distinct from e.final_asset or p_payload->>'verifiedFingerprint' is distinct from e.final_fingerprint
   then 'FINAL_ASSET_CHANGED'
  when not public.ugc_final_result_valid(e.id,e.final_asset,e.final_fingerprint) then 'FINAL_VIDEO_VALIDATION_FAILED'
  when exists(select 1 from public.ugc_generation_jobs where id=p_job and (status='cancelled' or cancellation_requested_at is not null
   or status='completed' and e.state<>'approved')) then 'FINAL_CONFLICT'
 end;
 if reason is not null then
  perform public.ugc_final_record_approval_failure(p_owner,e.id,coalesce((p_payload->>'version')::integer,0),reason); return null;
 end if;
 if e.state='approved' then return e; end if;
 -- A subtransaction rolls back approval AND completion if any final invariant/trigger fails.
 begin
  update public.ugc_final_executions set state='approved',phase='approved',approved_at=clock_timestamp(),version=version+1
   where id=e.id returning * into e;
  if not public.ugc_final_current(e.id) or not public.ugc_final_result_valid(e.id,e.final_asset,e.final_fingerprint) then
   raise exception 'FINAL_APPROVAL_VALIDATION_FAILED'; end if;
  update public.ugc_generation_jobs set status='completed',stage='complete',resume_stage='finalizing',completed_at=clock_timestamp(),
   failed_at=null,cancelled_at=null,error_code=null,safe_error_message=null,pause_reason=null,retry_eligible=false,next_retry_at=null,
   worker_id=null,claim_token=null,claimed_at=null,lease_expires_at=null,heartbeat_at=null
   where id=e.job_id and status not in ('completed','cancelled');
  if not found or not public.ugc_final_current(e.id) or not public.ugc_final_result_valid(e.id,e.final_asset,e.final_fingerprint) then
   raise exception 'FINAL_APPROVAL_VALIDATION_FAILED'; end if;
  insert into public.ugc_final_approval_attempts(execution_id,expected_version,observed_version,package_id,package_hash,package_version,
   final_asset,final_fingerprint,outcome)
  values(e.id,(p_payload->>'version')::integer,e.version,e.package_id,e.package_hash,e.package_version,e.final_asset,e.final_fingerprint,'approved');
 exception when others then
  insert into public.ugc_final_approval_attempts(execution_id,expected_version,observed_version,package_id,package_hash,package_version,
   final_asset,final_fingerprint,outcome,error_code,diagnostic)
  select x.id,coalesce((p_payload->>'version')::integer,0),x.version,x.package_id,x.package_hash,x.package_version,
   x.final_asset,x.final_fingerprint,'failed','FINAL_APPROVAL_VALIDATION_FAILED',jsonb_build_object('sqlState',SQLSTATE)
   from public.ugc_final_executions x where x.id=e.id;
  return null;
 end;
 return e;
end $$;
revoke all on function public.ugc_final_action_before_075(uuid,uuid,uuid,text,jsonb),
 public.ugc_final_record_approval_failure(uuid,uuid,integer,text),public.ugc_final_action(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ugc_final_record_approval_failure(uuid,uuid,integer,text),public.ugc_final_action(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
