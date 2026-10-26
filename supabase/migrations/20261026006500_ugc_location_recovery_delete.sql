-- Manual after 064. No backfill, live recovery, object deletion or generation.
begin;
do $$ declare r record; begin
 for r in select * from (values ('ugc_locations','revision','integer'),('ugc_locations','next_location_id','uuid'),
  ('ugc_locations','scene','jsonb'),('ugc_locations','dependencies','jsonb'),('ugc_location_candidates','receipt','jsonb'),
  ('ugc_location_candidates','intent','jsonb'),('ugc_location_candidates','artifact','jsonb')) v(table_name,column_name,data_type) loop
  if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name
   and c.column_name=r.column_name and c.data_type=r.data_type) then raise exception 'Apply 064/prerequisites: %.%',r.table_name,r.column_name; end if;
 end loop;
 if to_regprocedure('public.ugc_location_action_pre_delete(uuid,uuid,uuid,integer,text,jsonb)') is null then
  alter function public.ugc_location_action(uuid,uuid,uuid,integer,text,jsonb) rename to ugc_location_action_pre_delete;
 end if;
 if to_regprocedure('public.ugc_location_checkpoint_pre_recovery(uuid,uuid,text,jsonb)') is null then
  alter function public.ugc_location_checkpoint(uuid,uuid,text,jsonb) rename to ugc_location_checkpoint_pre_recovery;
 end if;
end; $$;
alter table public.ugc_locations add column if not exists diagnostic jsonb;
alter table public.ugc_locations add column if not exists recovery_only boolean not null default false;
alter table public.ugc_locations add column if not exists explicit_generation_at timestamptz;
alter table public.ugc_location_candidates add column if not exists output_proof jsonb;
alter table public.ugc_location_events add column if not exists error_code text;
alter table public.ugc_location_events add column if not exists diagnostic jsonb;
alter table public.ugc_locations drop constraint if exists ugc_locations_state_check;
alter table public.ugc_locations add constraint ugc_locations_state_check check(state in
 ('idle','queued_plan','running_plan','plan_review','queued_image','running_image','image_review','approved','rejecting','failed'));
alter table public.ugc_locations drop constraint if exists ugc_locations_phase_check;
alter table public.ugc_locations add constraint ugc_locations_phase_check check(phase in ('preparing','generating','saving','recovering','review','approved','deleting','failed'));
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.ugc_location_candidates'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%artifact IS NOT NULL%' loop
  execute format('alter table public.ugc_location_candidates drop constraint %I',c.conname);
 end loop;
end; $$;
alter table public.ugc_location_candidates add constraint ugc_location_review_artifact check(state not in ('review','accepted') or artifact is not null);

-- Keep each safe failure diagnostic in append-only history across later retries.
create or replace function public.ugc_location_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.id,new.job_id,new.owner_user_id,new.project_id,new.location_index,new.revision,new.dependencies,new.scene,new.created_at)
   is distinct from (old.id,old.job_id,old.owner_user_id,old.project_id,old.location_index,old.revision,old.dependencies,old.scene,old.created_at)
   or old.state='approved' then raise exception 'Immutable Location identity/approval.'; end if;
 end if;
 if tg_op='INSERT' or (new.state,new.phase,new.version,new.error_code,new.diagnostic) is distinct from
  (old.state,old.phase,old.version,old.error_code,old.diagnostic) then
  insert into public.ugc_location_events(location_id,version,state,phase,error_code,diagnostic)
   values(new.id,new.version,new.state,new.phase,new.error_code,new.diagnostic);
 end if;
 return new;
end; $$;

-- Remove the old cleanup -> paid replacement transition, even for old clients/workers.
do $$ declare body text; old_fragment text; begin
 select prosrc into body from pg_proc where oid='public.ugc_location_checkpoint_pre_auto(uuid,uuid,text,jsonb)'::regprocedure;
 -- SQL Editor/Windows pastes can retain CRLF inside multiline SQL literals.
 -- Normalize BOTH operands; retain the exact-content safety guard below.
 body:=replace(replace(body,E'\r\n',E'\n'),E'\r',E'\n');
 old_fragment:='  if l.next_location_id is null and j.status=''queued'' and j.cancellation_requested_at is null and public.ugc_location_dependencies(j.id)=l.dependencies then
   insert into public.ugc_location_candidates(location_id,plan,settings) values(l.id,c.plan,c.settings) returning * into c;
   l.candidate_id:=c.id; l.state:=''queued_image''; l.phase:=''generating'';
  end if;';
 old_fragment:=replace(replace(old_fragment,E'\r\n',E'\n'),E'\r',E'\n');
 if strpos(body,old_fragment)>0 then body:=replace(body,old_fragment,'  -- 065: cleanup never queues or submits paid work.');
 elsif strpos(body,'065: cleanup never')=0 then raise exception 'Unexpected Location cleanup implementation.'; end if;
 body:=replace(body,'if l.state<>''rejecting'' and p_operation<>''fail'' and (','if l.state<>''rejecting'' and not l.recovery_only and p_operation<>''fail'' and (');
 execute 'create or replace function public.ugc_location_checkpoint_pre_auto(p_location uuid,p_token uuid,p_operation text,p_payload jsonb default ''{}'') returns public.ugc_locations language plpgsql security definer set search_path='''' as '||quote_literal(body);
end; $$;

-- Failed deletion requires an explicit safe retry; legacy automatic replacement
-- roots wait for a new Generate Location click unless paid work already occurred.
do $$ declare body text; marker text:='065: delete retry and legacy replacement gates'; begin
 select prosrc into body from pg_proc where oid='public.ugc_location_claim(uuid)'::regprocedure;
 if strpos(body,marker)=0 then
  if strpos(body,'and (q.state<>''queued_plan'' or q.requested_at is not null)')=0 then raise exception 'Unexpected Location claim implementation.'; end if;
  body:=replace(body,'and (q.state<>''queued_plan'' or q.requested_at is not null)',
   'and (q.state<>''queued_plan'' or q.requested_at is not null)
   -- '||marker||'
   and (q.state<>''rejecting'' or q.error_code is null)
   and (q.explicit_generation_at is not null or not exists(select 1 from public.ugc_locations old_root where old_root.next_location_id=q.id)
    or exists(select 1 from public.ugc_location_candidates paid where paid.id=q.candidate_id and paid.intent is not null))');
  execute 'create or replace function public.ugc_location_claim(p_worker uuid) returns public.ugc_locations language plpgsql security definer set search_path='''' as '||quote_literal(body);
 end if;
end; $$;

create or replace function public.ugc_location_action(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_action text,p_payload jsonb default '{}')
returns public.ugc_locations language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations; c public.ugc_location_candidates; scene jsonb; dependencies jsonb; s jsonb; same_context boolean;
begin
 select * into j from public.ugc_generation_jobs where id=p_job and project_id=p_project and owner_user_id=p_owner for update;
 if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null then return null; end if;
 perform 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft' for update;
 if not found then return null; end if;
 select * into l from public.ugc_locations where job_id=p_job and location_index=1 order by revision desc limit 1 for update;
 if l.id is not null and (l.id::text is distinct from p_payload->>'locationId' or l.version is distinct from p_version) then return null; end if;
 if p_action in ('reject','retry_delete') then
  if l.id is null or l.accepted_candidate_id is not null or l.approved_at is not null or l.state='approved' then return null; end if;
  if p_action='retry_delete' then
   if l.state<>'rejecting' or l.error_code is null or l.claim_token is not null then return null; end if;
  elsif l.state not in ('image_review','failed') or l.claim_token is not null then return null;
  end if;
  select * into c from public.ugc_location_candidates where id=l.candidate_id and location_id=l.id for update;
  if not found or c.state in ('accepted','deleted') then return null; end if;
  update public.ugc_location_candidates set state='rejecting',rejected_at=coalesce(rejected_at,clock_timestamp()) where id=c.id;
  update public.ugc_locations set state='rejecting',phase='deleting',error_code=null,diagnostic=null,recovery_only=false,
   version=version+1,updated_at=clock_timestamp() where id=l.id returning * into l;
  return l; -- No plan/candidate/root insertion and no generation queue.
 end if;
 if p_action='retry_saving' then return null; end if; -- Dedicated storage-only recovery claim below.
 if p_action='generate' and l.state='idle' then
  scene:=public.ugc_location_scene(p_job); dependencies:=public.ugc_location_dependencies(p_job); s:=p_payload->'settings';
  if scene is null or dependencies is null or not public.ugc_location_settings_valid(s,scene) or j.stage<>'location_reference' then return null; end if;
  same_context:=dependencies=l.dependencies and public.ugc_location_scene_matches(l.scene,scene);
  if same_context and public.ugc_location_plan_valid(l.plan) then
   insert into public.ugc_location_candidates(location_id,plan,settings) values(l.id,l.plan,s) returning * into c;
   update public.ugc_locations set state='queued_image',phase='generating',candidate_id=c.id,error_code=null,diagnostic=null,
    requested_at=clock_timestamp(),image_settings=s,explicit_generation_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
    where id=l.id returning * into l;
   return l;
  end if;
  insert into public.ugc_locations(job_id,owner_user_id,project_id,revision,dependencies,scene,requested_at,image_settings,explicit_generation_at)
   values(p_job,p_owner,p_project,l.revision+1,dependencies,scene,clock_timestamp(),s,clock_timestamp()) returning * into l;
  return l;
 end if;
 l:=public.ugc_location_action_pre_delete(p_owner,p_project,p_job,p_version,p_action,p_payload);
 if l.id is not null and p_action='generate' and l.state<>'approved' then
  update public.ugc_locations set explicit_generation_at=clock_timestamp() where id=l.id returning * into l;
 end if;
 return l;
end; $$;

create or replace function public.ugc_location_recovery_claim(p_owner uuid,p_project uuid,p_job uuid,p_location uuid,p_version integer)
returns public.ugc_locations language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations; c public.ugc_location_candidates;
begin
 select * into j from public.ugc_generation_jobs where id=p_job and project_id=p_project and owner_user_id=p_owner for update;
 if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null or not exists(
  select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 select * into l from public.ugc_locations where job_id=p_job and location_index=1 order by revision desc limit 1 for update;
 if not found or l.id is distinct from p_location or l.version is distinct from p_version or l.owner_user_id<>p_owner or l.project_id<>p_project
  or l.state not in ('failed','queued_image','running_image') or (l.claim_token is not null and l.lease_expires_at>clock_timestamp())
  or l.accepted_candidate_id is not null then return null; end if;
 select * into c from public.ugc_location_candidates where id=l.candidate_id and location_id=l.id for update;
 if not found or c.state<>'submitted' or c.intent is null then return null; end if;
 update public.ugc_locations set state='running_image',phase='recovering',recovery_only=true,version=version+1,worker_id=null,
  claim_token=gen_random_uuid(),heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds',error_code=null,diagnostic=null,
  updated_at=clock_timestamp() where id=l.id returning * into l;
 return l;
end; $$;

create or replace function public.ugc_location_cleanup_claim(p_owner uuid,p_project uuid,p_job uuid,p_location uuid,p_version integer)
returns public.ugc_locations language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations;
begin
 select * into j from public.ugc_generation_jobs where id=p_job and project_id=p_project and owner_user_id=p_owner for update;
 if not found or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 select * into l from public.ugc_locations where id=p_location and job_id=p_job and owner_user_id=p_owner and project_id=p_project for update;
 if not found or l.version is distinct from p_version or l.state<>'rejecting' or l.error_code is not null
  or (l.claim_token is not null and l.lease_expires_at>clock_timestamp()) or l.accepted_candidate_id is not null then return null; end if;
 perform 1 from public.ugc_location_candidates where id=l.candidate_id and location_id=l.id and state='rejecting';
 if not found then return null; end if;
 update public.ugc_locations set recovery_only=true,version=version+1,worker_id=null,
  claim_token=gen_random_uuid(),heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds',
  updated_at=clock_timestamp() where id=l.id returning * into l;
 return l;
end; $$;

create or replace function public.ugc_location_checkpoint(p_location uuid,p_token uuid,p_operation text,p_payload jsonb default '{}')
returns public.ugc_locations language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations; c public.ugc_location_candidates; proof jsonb; diag jsonb; code text;
begin
 select * into l from public.ugc_locations where id=p_location;
 if not found then return null; end if;
 select * into j from public.ugc_generation_jobs where id=l.job_id for update;
 select * into l from public.ugc_locations where id=p_location for update;
 if p_token is null or l.claim_token is distinct from p_token or l.lease_expires_at<=clock_timestamp()
  or l.state not in ('running_plan','running_image','rejecting') then return null; end if;
 if l.recovery_only and p_operation in ('plan_intent','plan_ready','image_intent') then return null; end if;
 if p_operation='recovering' then
  if l.state<>'running_image' then return null; end if;
  perform 1 from public.ugc_location_candidates where id=l.candidate_id and location_id=l.id and state='submitted' and intent is not null;
  if not found then return null; end if;
  update public.ugc_locations set phase='recovering',recovery_only=true,updated_at=clock_timestamp() where id=l.id returning * into l;
  return l;
 end if;
 if p_operation='saving' and p_payload ? 'outputProof' then
  select * into c from public.ugc_location_candidates where id=l.candidate_id and location_id=l.id for update;
  proof:=p_payload->'outputProof';
  if c.state is distinct from 'submitted' or c.intent is null or proof->>'id' is distinct from c.id::text
   or coalesce(proof->>'sha256','') !~ '^[a-f0-9]{64}$' or proof->>'mimeType' is distinct from 'image/png'
   or not coalesce((proof->>'sizeBytes')::bigint between 1 and 20971520,false)
   or proof->>'width' is distinct from split_part(c.settings->>'size','x',1) or proof->>'height' is distinct from split_part(c.settings->>'size','x',2)
   or (c.output_proof is not null and c.output_proof is distinct from proof) then return null; end if;
  update public.ugc_location_candidates set output_proof=proof where id=c.id;
 end if;
 if p_operation='image_ready' then
  select * into c from public.ugc_location_candidates where id=l.candidate_id and location_id=l.id;
  if c.output_proof is not null and c.output_proof is distinct from ((p_payload->'artifact')-array['storageKey','etag']) then return null; end if;
 end if;
 l:=public.ugc_location_checkpoint_pre_recovery(p_location,p_token,p_operation,p_payload);
 if l.id is null then return null; end if;
 if p_operation='deleted' then
  update public.ugc_locations set state='idle',phase='preparing',candidate_id=null,error_code=null,diagnostic=null,recovery_only=false,
   version=version+1,updated_at=clock_timestamp() where id=l.id returning * into l;
 elsif p_operation='fail' then
  code:=case when p_payload->>'code' in ('LOCATION_CONFIG_INVALID','LOCATION_RECONCILIATION_REQUIRED','LOCATION_STORAGE_FAILED',
   'LOCATION_OUTPUT_UNAVAILABLE','LOCATION_RECOVERY_FAILED','LOCATION_R2_WRITE_FAILED','LOCATION_DELETE_FAILED','LOCATION_LOCAL_RECOVERY_FAILED',
   'LOCATION_IMAGE_INVALID','LOCATION_DIMENSIONS_INVALID','LOCATION_RECOVERY_CHANGED','LOCATION_STORAGE_CHANGED') then p_payload->>'code' else 'LOCATION_FAILED' end;
  diag:=jsonb_build_object('phase',case when p_payload->'diagnostic'->>'phase' ~ '^[a-z_]{1,64}$' then p_payload->'diagnostic'->>'phase' else 'unknown' end,'code',code);
  if p_payload->'diagnostic'->>'databaseCode' ~ '^(PGRST[0-9]{3}|[A-Z0-9]{5})$' then diag:=diag||jsonb_build_object('databaseCode',p_payload->'diagnostic'->>'databaseCode'); end if;
  if p_payload->'diagnostic'->>'causeCode' ~ '^(E[A-Z_]{2,40}|UND_ERR_[A-Z_]+|TimeoutError|AbortError)$' then diag:=diag||jsonb_build_object('causeCode',p_payload->'diagnostic'->>'causeCode'); end if;
  if p_payload->'diagnostic'->>'httpStatus' ~ '^[45][0-9]{2}$' then diag:=diag||jsonb_build_object('httpStatus',(p_payload->'diagnostic'->>'httpStatus')::integer); end if;
  update public.ugc_locations set error_code=code,diagnostic=diag,recovery_only=false where id=l.id returning * into l;
 elsif p_operation='image_ready' then
  update public.ugc_locations set diagnostic=null,recovery_only=false where id=l.id returning * into l;
 end if;
 return l;
end; $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('ugc_location_action','ugc_location_action_pre_delete','ugc_location_recovery_claim','ugc_location_cleanup_claim',
   'ugc_location_checkpoint','ugc_location_checkpoint_pre_recovery','ugc_location_checkpoint_pre_auto','ugc_location_claim','ugc_location_audit') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('ugc_location_action','ugc_location_checkpoint','ugc_location_claim','ugc_location_recovery_claim','ugc_location_cleanup_claim') then
   execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end; $$;
commit;
