-- Character V5: additive manual-review workflow. Apply manually after 053.
-- Definitions only: no backfill, live job changes, provider work or R2 deletion.
begin;
do $$ begin
 if to_regprocedure('public.ugc_character_slots_valid(uuid,jsonb)') is null
  or to_regprocedure('public.ugc_character_v4_inputs_valid(jsonb)') is null
  or to_regprocedure('public.ugc_prepare_product_sheet_m6(uuid,uuid,text,jsonb)') is null
  or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_reference_reviews' and column_name='execution_state') then
  raise exception 'Apply 053 and prerequisites first.';
 end if;
 if to_regprocedure('public.ugc_reference_group_approved_pre_v5(uuid,text)') is null then
  alter function public.ugc_reference_group_approved(uuid,text) rename to ugc_reference_group_approved_pre_v5;
 end if;
 if to_regprocedure('public.ugc_approve_reference_pre_v5(uuid,uuid,uuid,text,integer,uuid)') is null then
  alter function public.ugc_approve_reference(uuid,uuid,uuid,text,integer,uuid) rename to ugc_approve_reference_pre_v5;
 end if;
 if to_regprocedure('public.ugc_request_reference_regeneration_pre_v5(uuid,uuid,uuid,text,text,integer,uuid,uuid)') is null then
  alter function public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid) rename to ugc_request_reference_regeneration_pre_v5;
 end if;
end; $$;

-- Cleanup tombstones fence only proven historical rejected/superseded candidates.
-- A deleted tombstone retains an opaque key hash, never an image pointer.
create table if not exists public.ugc_character_asset_purges (
 object_hash text primary key check(object_hash ~ '^[a-f0-9]{64}$'), job_id uuid not null references public.ugc_generation_jobs(id),
 owner_user_id uuid not null references public.app_users(id), project_id uuid not null references public.projects(id),
 storage_key text, etag text, sha256 text, size_bytes bigint, state text not null check(state in ('deleting','deleted')),
 created_at timestamptz not null default clock_timestamp(), deleted_at timestamptz,
 check(state<>'deleted' or (storage_key is null and etag is null and sha256 is null))
);
alter table public.ugc_character_asset_purges enable row level security;
revoke all on public.ugc_character_asset_purges from public,anon,authenticated;
grant select on public.ugc_character_asset_purges to service_role;

create or replace function public.ugc_character_cleanup_claim(p_owner uuid,p_project uuid,p_job uuid,p_proof jsonb,p_object_hash text,p_etag text,p_size bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_character_sheets; r public.ugc_reference_reviews; q public.ugc_reference_regeneration_requests;
 op jsonb; root_op jsonb; prefix text; key text; rejected jsonb; current_version integer; view_name text; prior public.ugc_character_asset_purges;
begin
 select * into j from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project for update;
 if not found or j.status='running' or j.cancellation_requested_at is not null then return false; end if;
 perform 1 from public.ugc_reference_reviews where job_id=j.id for update;
 if exists(select 1 from public.ugc_reference_reviews where job_id=j.id and execution_state='running') then return false; end if;
 if exists(select 1 from public.ugc_character_v5_workflows where job_id=j.id and state='running') then return false; end if;
 view_name:=p_proof->>'view';
 if view_name not in ('face','back','front') or p_proof->>'stage' not in ('provider','reference') or p_size not between 1 and 20971520 or coalesce(p_etag,'')='' then return false; end if;
 if p_proof->>'requestId' is not null then
  select * into r from public.ugc_reference_reviews where job_id=j.id and reference_type='character';
  if not found or r.owner_user_id<>p_owner or r.project_id<>p_project then return false; end if;
  select * into q from public.ugc_reference_regeneration_requests where id=(p_proof->>'requestId')::uuid and review_id=r.id;
  if not found or q.view<>view_name then return false; end if;
  root_op:=q.checkpoint; current_version:=q.requested_version;
  prefix:='ugc/'||p_owner||'/'||p_project||'/'||p_job||'/reference-review-v1/'||r.id||'/v'||coalesce(p_proof->>'version',q.requested_version::text);
  -- Current request candidates stay available to their active review.
  if q.requested_version>=r.version and root_op->>'key'=p_proof->>'operationKey' then return false; end if;
 else
  select * into s from public.ugc_character_sheets where job_id=j.id and owner_user_id=p_owner and project_id=p_project;
  if not found or s.id::text is distinct from p_proof->>'sheetId' then return false; end if;
  root_op:=s.document->'operations'->view_name; current_version:=s.sheet_version;
  prefix:='ugc/'||p_owner||'/'||p_project||'/'||p_job||'/character-v'||s.sheet_version||'/'||s.id;
  if root_op->>'key'=p_proof->>'operationKey' then return false; end if;
 end if;
 select value into op from jsonb_array_elements(jsonb_build_array(root_op)||coalesce(root_op->'previousAttempts','[]'::jsonb))
  where value->>'key'=p_proof->>'operationKey' limit 1;
 if op is null or coalesce(op->>'requestedVersion',current_version::text) is distinct from p_proof->>'version' then return false; end if;
 rejected:=case when op->'validation'->>'state'='rejected' then op->'validation' when op->'sourceValidation'->>'state'='rejected' then op->'sourceValidation' end;
 if rejected is null and op->'diagnostic'->>'reason' is distinct from 'CHARACTER_FRONT_CROP_INVALID' then return false; end if;
 if p_proof->>'stage'='reference' then
  if view_name<>'front' or rejected->>'stage' is distinct from 'canonical' then return false; end if;
  rejected:=op->'validation';
 else rejected:=coalesce(op->'sourceValidation',op->'validation'); end if;
 if rejected->>'sha256' is distinct from p_proof->>'sha256' or coalesce(p_proof->>'sha256','') !~ '^[a-f0-9]{64}$' then return false; end if;
 key:=prefix||'/candidates/'||view_name||'/'||(p_proof->>'operationKey')||case p_proof->>'stage' when 'reference' then '-reference' else '' end||'.png';
 if key is distinct from p_proof->>'storageKey' or p_object_hash is distinct from encode(sha256(convert_to(key,'UTF8')),'hex') then return false; end if;
 -- Search all historical/current references as well as canonical project assets.
 if exists(select 1 from public.project_assets where storage_key=key)
  or exists(select 1 from public.ugc_character_sheets where jsonb_path_exists(document,'$.**.storageKey ? (@ == $key)',jsonb_build_object('key',key)))
  or exists(select 1 from public.ugc_product_sheets where jsonb_path_exists(document,'$.**.storageKey ? (@ == $key)',jsonb_build_object('key',key)))
  or exists(select 1 from public.ugc_reference_reviews where jsonb_path_exists(coalesce(composed_asset,'{}'::jsonb),'$.**.storageKey ? (@ == $key)',jsonb_build_object('key',key)))
  or exists(select 1 from public.ugc_reference_regeneration_requests where jsonb_path_exists(coalesce(replacement_asset,'{}'::jsonb)||coalesce(checkpoint,'{}'::jsonb),'$.**.storageKey ? (@ == $key)',jsonb_build_object('key',key)))
  or exists(select 1 from public.ugc_character_v5_workflows where jsonb_path_exists(accepted||jsonb_build_object('sheet',sheet),'$.**.storageKey ? (@ == $key)',jsonb_build_object('key',key)))
  or exists(select 1 from public.ugc_character_v5_candidates where state<>'rejected' and artifact->>'storageKey'=key) then return false; end if;
 select * into prior from public.ugc_character_asset_purges where object_hash=p_object_hash for update;
 if found then return prior.state='deleting' and prior.storage_key=key and prior.etag=p_etag and prior.sha256=p_proof->>'sha256'; end if;
 insert into public.ugc_character_asset_purges(object_hash,job_id,owner_user_id,project_id,storage_key,etag,sha256,size_bytes,state)
 values(p_object_hash,j.id,p_owner,p_project,key,p_etag,p_proof->>'sha256',p_size,'deleting'); return true;
end; $$;

create or replace function public.ugc_character_cleanup_finish(p_hash text,p_etag text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.ugc_character_asset_purges set state='deleted',storage_key=null,etag=null,sha256=null,deleted_at=clock_timestamp()
  where object_hash=p_hash and state='deleting' and etag=p_etag;
 return found;
end; $$;

create table if not exists public.ugc_character_v5_workflows (
 id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.ugc_generation_jobs(id),
 owner_user_id uuid not null references public.app_users(id), project_id uuid not null references public.projects(id),
 version integer not null default 1 check(version>0), prompt_version integer not null default 5 check(prompt_version=5),
 contract_version integer not null default 5 check(contract_version=5), revision text not null default 'simple-manual-review-v1' check(revision='simple-manual-review-v1'),
 slot text not null default 'face' check(slot in ('face','back','front_source','front','sheet')),
 state text not null default 'queued' check(state in ('queued','running','review','ready','approved','failed')),
 work_phase text not null default 'preparing' check(work_phase in ('preparing','generating','local_crop','sheet_composition')),
 candidate_id uuid, accepted jsonb not null default '{}'::jsonb check(jsonb_typeof(accepted)='object'), sheet jsonb,
 soul_id uuid, crop_top integer not null default 2000 check(crop_top between 500 and 6000),
 error_phase text check(error_phase in ('input_read','input_sign','provider_submit','provider_status','output_download','output_decode',
  'r2_put','r2_verify','metadata_persistence','candidate_insertion','preview_sign','preview_read','candidate_delete','local_crop','sheet_composition','other')),
 error_code text check(error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$'),
 claim_token uuid, lease_expires_at timestamptz, approved_at timestamptz,
 processing_elapsed_ms bigint not null default 0 check(processing_elapsed_ms>=0), processing_updated_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.ugc_character_v5_candidates (
 id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.ugc_character_v5_workflows(id),
 slot text not null check(slot in ('face','back','front_source','front','sheet')),
 state text not null default 'queued' check(state in ('queued','intent','submitted','review','accepted','rejecting','rejected','failed')),
 request_id uuid, status_url text, artifact jsonb, planned_key text, generation jsonb, input_asset jsonb, provider_terminal boolean not null default false,
 model text not null default 'higgsfield-ai/soul/v2/image-to-image', prompt_version integer not null default 5 check(prompt_version=5),
 contract_version integer not null default 5 check(contract_version=5), revision text not null default 'simple-manual-review-v1' check(revision='simple-manual-review-v1'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check(state<>'rejected' or (artifact is null and planned_key is null and status_url is null and generation is null and input_asset is null))
);
create index if not exists ugc_character_v5_candidates_workflow on public.ugc_character_v5_candidates(workflow_id,created_at);
create unique index if not exists ugc_character_v5_one_pending_candidate on public.ugc_character_v5_candidates(workflow_id)
 where state in ('queued','intent','submitted','review','rejecting');
create index if not exists ugc_character_v5_queued on public.ugc_character_v5_workflows(updated_at) where state in ('queued','running');
comment on table public.ugc_character_v5_workflows is 'sceenyk-character-v5-manual-review-054';
comment on table public.ugc_character_v5_candidates is 'sceenyk-character-v5-private-candidates-054';
alter table public.ugc_character_v5_workflows enable row level security;
alter table public.ugc_character_v5_candidates enable row level security;
revoke all on public.ugc_character_v5_workflows,public.ugc_character_v5_candidates from public,anon,authenticated;
-- All writes use fenced service-only RPCs. SELECT supports scoped DTOs and recovery.
grant select on public.ugc_character_v5_workflows,public.ugc_character_v5_candidates to service_role;

create or replace function public.ugc_character_v5_event(p_workflow uuid,p_phase text) returns void
language plpgsql security definer set search_path='' as $$
declare w public.ugc_character_v5_workflows; message text;
begin
 select * into w from public.ugc_character_v5_workflows where id=p_workflow;
 message:=case p_phase when 'preparing' then 'Preparing '||case w.slot when 'front_source' then 'Front source' else initcap(w.slot) end
  when 'generating' then 'Generating '||case w.slot when 'front_source' then 'Front source' else initcap(w.slot) end
  when 'review' then case w.slot when 'front_source' then 'Front source' else initcap(w.slot) end||' ready for your review'
  when 'accepted' then case w.slot when 'front_source' then 'Front source' else initcap(w.slot) end||' accepted'
  when 'rejected' then case w.slot when 'front_source' then 'Front source' else initcap(w.slot) end||' rejected; candidate image deleted'
  when 'local_crop' then 'Creating headless Front' when 'sheet_composition' then 'Building Character Sheet'
  when 'ready' then 'Character Sheet ready for approval' when 'approved' then 'Character Reference approved'
  when 'failed' then 'Character technical step needs attention' end;
 if message is null then return; end if;
 insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
 select j.id,j.status,'character_reference','character_v5.'||p_phase,message,
  jsonb_build_object('version',w.version,'view',w.slot,'phase',p_phase,'promptVersion',5,'contractVersion',5,'revision',w.revision,
   'errorPhase',w.error_phase,'errorCode',w.error_code,'soulIdUsed',w.soul_id is not null)
 from public.ugc_generation_jobs j where j.id=w.job_id;
end; $$;

create or replace function public.ugc_character_v5_asset_valid(p_workflow uuid,p_asset jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p_asset)='object' and p_asset->>'id' ~ '^[a-f0-9-]{36}$'
  and p_asset->>'storageKey' ~ ('/character-v5/'||p_workflow::text||'/candidates/[a-f0-9-]{36}\.png$')
  and p_asset->>'etag'<>'' and p_asset->>'sha256' ~ '^[a-f0-9]{64}$' and p_asset->>'mimeType'='image/png'
  and (p_asset->>'sizeBytes')::bigint between 1 and 20971520
  and (p_asset->>'width')::integer between 128 and 4096 and (p_asset->>'height')::integer between 128 and 4096,false);
$$;

create or replace function public.ugc_character_v5_start(p_owner uuid,p_project uuid,p_job uuid,p_token uuid default null,p_soul_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; w public.ugc_character_v5_workflows; c uuid;
begin
 select * into j from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project for update;
 if not found or j.cancellation_requested_at is not null or j.input_snapshot->>'schemaVersion'<>'3'
  or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft')
  or j.analysis_version is distinct from 1 then return null; end if;
 if j.status='running' then
  if j.stage<>'character_reference' or p_token is null or j.claim_token is distinct from p_token or j.lease_expires_at<=clock_timestamp() then return null; end if;
 elsif j.status not in ('queued','failed') or j.resume_stage not in ('character_reference','product_reference','location_reference') then return null;
 end if;
 -- Serialize against legacy review claims. Existing checkpoints remain untouched.
 perform 1 from public.ugc_reference_reviews where job_id=j.id for update;
 if exists(select 1 from public.ugc_reference_reviews where job_id=j.id and execution_state='running') then return null; end if;
 select * into w from public.ugc_character_v5_workflows where job_id=j.id for update;
 if not found then
  insert into public.ugc_character_v5_workflows(job_id,owner_user_id,project_id,soul_id) values(j.id,p_owner,p_project,p_soul_id) returning * into w;
  insert into public.ugc_character_v5_candidates(workflow_id,slot) values(w.id,'face') returning id into c;
  update public.ugc_character_v5_workflows set candidate_id=c where id=w.id returning * into w;
  perform public.ugc_character_v5_event(w.id,'preparing');
 end if;
 update public.ugc_generation_jobs set status='queued',stage=case when w.state='approved' then 'product_reference' else 'character_reference' end,
  resume_stage=case when w.state='approved' then 'product_reference' else 'character_reference' end,
  pause_reason=case when w.state='approved' then 'PRODUCT_REFERENCE_NOT_IMPLEMENTED' else 'CHARACTER_REFERENCE_NOT_IMPLEMENTED' end,
  worker_id=null,claim_token=null,lease_expires_at=null,next_retry_at=null,
  error_code=null,safe_error_message=null,failed_at=null,retryable=false where id=j.id;
 if w.state='approved' then perform public.ugc_reconcile_reference_gate(j.id); end if;
 return to_jsonb(w);
end; $$;

create or replace function public.ugc_character_v5_action(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_action text,p_slot text default null,p_crop_top integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; w public.ugc_character_v5_workflows; c public.ugc_character_v5_candidates; next_slot text; new_id uuid; a jsonb;
begin
 select * into j from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project for update;
 if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null
  or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 select * into w from public.ugc_character_v5_workflows where job_id=j.id and owner_user_id=p_owner and project_id=p_project for update;
 if not found or w.version<>p_version or w.state in ('queued','running') then return null; end if;
 select * into c from public.ugc_character_v5_candidates where id=w.candidate_id and workflow_id=w.id for update;
 if p_action='accept' then
  if w.state<>'review' or c.state<>'review' or c.slot<>w.slot or not public.ugc_character_v5_asset_valid(w.id,c.artifact) then return null; end if;
  if w.slot='sheet' then return null; end if;
  if w.slot='back' and not(w.accepted ? 'face') or w.slot='front_source' and not(w.accepted ?& array['face','back'])
   or w.slot='front' and not(w.accepted ?& array['face','back','front_source']) then return null; end if;
  a:=w.accepted;
  if w.slot='face' then a:=a-array['back','front_source','front'];
  elsif w.slot='back' then a:=a-array['front_source','front'];
  elsif w.slot='front_source' then a:=a-'front'; end if;
  a:=jsonb_set(a,array[w.slot],c.artifact);
  update public.ugc_character_v5_candidates set state='accepted',status_url=null,updated_at=clock_timestamp() where id=c.id;
  perform public.ugc_character_v5_event(w.id,'accepted');
  next_slot:=case w.slot when 'face' then 'back' when 'back' then 'front_source' when 'front_source' then 'front' when 'front' then 'sheet' end;
 elsif p_action='reject' then
  if c.state not in ('review','rejecting') or w.state not in ('review','failed') then return null; end if;
  if exists(select 1 from jsonb_each(w.accepted) e where e.value->>'storageKey'=c.artifact->>'storageKey') or w.sheet->>'storageKey'=c.artifact->>'storageKey' then return null; end if;
  update public.ugc_character_v5_candidates set state='rejecting',updated_at=clock_timestamp() where id=c.id;
  update public.ugc_character_v5_workflows set state='failed',error_phase='candidate_delete',error_code='CHARACTER_CANDIDATE_DELETE_PENDING',
   version=version+1,updated_at=clock_timestamp() where id=w.id returning * into w;
  return to_jsonb(w);
 elsif p_action in ('regenerate','crop') then
  if c.state in ('review','rejecting','intent','submitted') then return null; end if;
  next_slot:=case when p_action='crop' then 'front' else p_slot end;
  if next_slot not in ('face','back','front_source','front','sheet') then return null; end if;
  if next_slot='back' and not(w.accepted ? 'face') or next_slot='front_source' and not(w.accepted ?& array['face','back'])
   or next_slot='front' and not(w.accepted ?& array['face','back','front_source']) or next_slot='sheet' and not(w.accepted ?& array['face','back','front']) then return null; end if;
  if p_crop_top is not null and (p_crop_top<500 or p_crop_top>6000) then return null; end if;
  -- Received provider work is recovered by status/download, never submitted again.
  if c.state='failed' and c.request_id is not null and not c.provider_terminal and next_slot=c.slot then
   update public.ugc_character_v5_candidates set state='submitted',updated_at=clock_timestamp() where id=c.id;
   update public.ugc_character_v5_workflows set state='queued',version=version+1,error_phase=null,error_code=null,
    updated_at=clock_timestamp() where id=w.id returning * into w;
   return to_jsonb(w);
  end if;
  a:=w.accepted;
 elsif p_action='approve' then
  if w.state<>'ready' or not(w.accepted ?& array['face','back','front_source','front']) or not public.ugc_character_v5_asset_valid(w.id,w.sheet) then return null; end if;
  update public.ugc_character_v5_workflows set state='approved',approved_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=w.id returning * into w;
  perform public.ugc_character_v5_event(w.id,'approved');
  update public.ugc_generation_jobs set status='queued',stage='product_reference',resume_stage='product_reference',pause_reason='PRODUCT_REFERENCE_NOT_IMPLEMENTED',
   error_code=null,retryable=false where id=j.id;
  perform public.ugc_reconcile_reference_gate(j.id);
  return to_jsonb(w);
 else return null;
 end if;
 insert into public.ugc_character_v5_candidates(workflow_id,slot,model) values(w.id,next_slot,
  case when next_slot in ('front','sheet') then 'sharp' else 'higgsfield-ai/soul/v2/image-to-image' end) returning id into new_id;
 update public.ugc_character_v5_workflows set slot=next_slot,state='queued',candidate_id=new_id,accepted=a,sheet=null,approved_at=null,
  crop_top=coalesce(p_crop_top,crop_top),work_phase='preparing',error_phase=null,error_code=null,version=version+1,updated_at=clock_timestamp() where id=w.id returning * into w;
 update public.ugc_generation_jobs set status='queued',stage='character_reference',resume_stage='character_reference',pause_reason='CHARACTER_REFERENCE_NOT_IMPLEMENTED' where id=j.id;
 perform public.ugc_character_v5_event(w.id,'preparing');
 return to_jsonb(w);
end; $$;

create or replace function public.ugc_character_v5_finish_rejection(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_candidate uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.ugc_character_v5_workflows; c public.ugc_character_v5_candidates;
begin
 perform 1 from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project and status in ('queued','failed') and cancellation_requested_at is null for update;
 if not found then return false; end if;
 select * into w from public.ugc_character_v5_workflows where job_id=p_job and owner_user_id=p_owner and project_id=p_project for update;
 if not found or w.version<>p_version or w.candidate_id is distinct from p_candidate then return false; end if;
 select * into c from public.ugc_character_v5_candidates where id=p_candidate and workflow_id=w.id for update;
 if not found or c.state<>'rejecting' then return false; end if;
 update public.ugc_character_v5_candidates set state='rejected',artifact=null,planned_key=null,status_url=null,generation=null,input_asset=null,updated_at=clock_timestamp() where id=c.id;
 update public.ugc_character_v5_workflows set state='failed',error_phase=null,error_code='CHARACTER_CANDIDATE_REJECTED',version=version+1,updated_at=clock_timestamp() where id=w.id;
 perform public.ugc_character_v5_event(w.id,'rejected'); return true;
end; $$;

create or replace function public.ugc_character_v5_claim(p_worker uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.ugc_character_v5_workflows; candidate record; j public.ugc_generation_jobs;
begin
 if p_worker is null then return null; end if;
 -- Every mutation uses job -> workflow lock order. Skip busy jobs rather than
 -- holding a workflow while another transaction owns its parent job.
 for candidate in select id,job_id from public.ugc_character_v5_workflows
  where state='queued' or state='running' and lease_expires_at<clock_timestamp() order by updated_at loop
  select * into j from public.ugc_generation_jobs where id=candidate.job_id for update skip locked;
  if not found or j.status<>'queued' or j.stage<>'character_reference' or j.pause_reason is distinct from 'CHARACTER_REFERENCE_NOT_IMPLEMENTED'
   or j.cancellation_requested_at is not null or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then continue; end if;
  select * into w from public.ugc_character_v5_workflows where id=candidate.id and owner_user_id=j.owner_user_id and project_id=j.project_id for update skip locked;
  if not found or not(w.state='queued' or w.state='running' and w.lease_expires_at<clock_timestamp()) then continue; end if;
  update public.ugc_character_v5_workflows set processing_elapsed_ms=processing_elapsed_ms+case when state='running' and processing_updated_at is not null then
   greatest(0,extract(epoch from (least(clock_timestamp(),lease_expires_at)-processing_updated_at))*1000)::bigint else 0 end,
   processing_updated_at=clock_timestamp(),state='running',work_phase=case slot when 'front' then 'local_crop' when 'sheet' then 'sheet_composition' else 'preparing' end,
   claim_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where id=w.id returning * into w;
  perform public.ugc_character_v5_event(w.id,case w.slot when 'front' then 'local_crop' when 'sheet' then 'sheet_composition' else 'preparing' end);
  return to_jsonb(w);
 end loop;
 return null;
end; $$;

create or replace function public.ugc_character_v5_checkpoint(p_workflow uuid,p_token uuid,p_candidate uuid,p_operation text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.ugc_character_v5_workflows; c public.ugc_character_v5_candidates; expected_key text;
begin
 -- Keep the same job -> workflow lock order as every user decision.
 perform 1 from public.ugc_generation_jobs where id=(select job_id from public.ugc_character_v5_workflows where id=p_workflow) for update;
 select * into w from public.ugc_character_v5_workflows where id=p_workflow for update;
 if not found or w.state<>'running' or p_token is null or w.claim_token is distinct from p_token or w.lease_expires_at<=clock_timestamp()
  or w.candidate_id is distinct from p_candidate then return null; end if;
 if not exists(select 1 from public.ugc_generation_jobs j join public.projects p on p.id=j.project_id and p.owner_user_id=j.owner_user_id
  where j.id=w.job_id and j.owner_user_id=w.owner_user_id and j.project_id=w.project_id and j.status='queued'
   and j.stage='character_reference' and j.cancellation_requested_at is null and p.status='draft') then return null; end if;
 select * into c from public.ugc_character_v5_candidates where id=p_candidate and workflow_id=w.id for update;
 if not found or c.slot<>w.slot then return null; end if;
 update public.ugc_character_v5_workflows set processing_elapsed_ms=processing_elapsed_ms+
  case when processing_updated_at is not null then greatest(0,extract(epoch from (least(clock_timestamp(),lease_expires_at)-processing_updated_at))*1000)::bigint else 0 end,
  processing_updated_at=clock_timestamp() where id=w.id;
 expected_key:='ugc/'||w.owner_user_id||'/'||w.project_id||'/'||w.job_id||'/character-v5/'||w.id||'/candidates/'||c.id||'.png';
 if p_operation='heartbeat' then
  if c.state='submitted' then update public.ugc_character_v5_workflows set work_phase='generating' where id=w.id; end if;
 elsif p_operation='intent' then
  if c.state<>'queued' or p_payload->>'plannedKey' is distinct from expected_key then return null; end if;
  if w.slot in ('face','back','front_source') and (p_payload->'generation'->>'revision' is distinct from w.revision
   or p_payload->'generation'->>'promptVersion' is distinct from '5' or p_payload->'generation'->>'contractVersion' is distinct from '5'
   or p_payload->'generation'->>'model' is distinct from 'higgsfield-ai/soul/v2/image-to-image'
   or p_payload->'generation'->>'slot' is distinct from w.slot or p_payload->'generation'->>'batchSize' is distinct from '1'
   or p_payload->'generation'->>'resolution' is distinct from '720p' or p_payload->'generation'->>'aspectRatio' is distinct from '4:3'
   or p_payload->'generation'->>'enhancePrompt' is distinct from 'true') then return null; end if;
  if w.slot in ('front','sheet') and (p_payload->'generation'->>'model' is distinct from 'sharp'
   or p_payload->'generation'->>'revision' is distinct from w.revision or p_payload->'generation'->>'slot' is distinct from w.slot
   or p_payload->'generation'->>'promptVersion' is distinct from '5' or p_payload->'generation'->>'contractVersion' is distinct from '5') then return null; end if;
  update public.ugc_character_v5_candidates set state='intent',planned_key=expected_key,generation=p_payload->'generation',input_asset=p_payload->'inputAsset',updated_at=clock_timestamp() where id=c.id;
 elsif p_operation='submitted' then
  if c.state<>'intent' or p_payload->>'requestId' !~ '^[a-f0-9-]{36}$'
   or p_payload->>'statusUrl' is distinct from 'https://api.higgsfield.ai/requests/'||(p_payload->>'requestId')||'/status' then return null; end if;
  update public.ugc_character_v5_candidates set state='submitted',request_id=(p_payload->>'requestId')::uuid,status_url=p_payload->>'statusUrl',updated_at=clock_timestamp() where id=c.id;
  update public.ugc_character_v5_workflows set work_phase='generating' where id=w.id;
  perform public.ugc_character_v5_event(w.id,'generating');
 elsif p_operation='ready' then
  if c.state not in ('intent','submitted') or not public.ugc_character_v5_asset_valid(w.id,p_payload->'artifact')
   or p_payload->'artifact'->>'storageKey' is distinct from expected_key or p_payload->'artifact'->>'id' is distinct from c.id::text then return null; end if;
  if w.slot='sheet' and not(w.accepted ?& array['face','back','front_source','front']) then return null; end if;
  update public.ugc_character_v5_candidates set state=case when w.slot='sheet' then 'accepted' else 'review' end,
   artifact=p_payload->'artifact',status_url=null,updated_at=clock_timestamp() where id=c.id;
  update public.ugc_character_v5_workflows set state=case when slot='sheet' then 'ready' else 'review' end,
   sheet=case when slot='sheet' then p_payload->'artifact' else null end,claim_token=null,lease_expires_at=null,processing_updated_at=null,error_phase=null,error_code=null,
   version=version+1,updated_at=clock_timestamp() where id=w.id;
  perform public.ugc_character_v5_event(w.id,case w.slot when 'sheet' then 'ready' else 'review' end);
  return to_jsonb(c);
 elsif p_operation='fail' then
  -- An uncertain paid intent remains an intent; an explicit failure cannot make it safe to replay.
  update public.ugc_character_v5_candidates set state=case when state='intent' and slot in ('face','back','front_source') and not coalesce((p_payload->>'providerTerminal')::boolean,false) then state else 'failed' end,
   provider_terminal=coalesce((p_payload->>'providerTerminal')::boolean,false),
   updated_at=clock_timestamp() where id=c.id;
  update public.ugc_character_v5_workflows set state='failed',claim_token=null,lease_expires_at=null,processing_updated_at=null,
   error_phase=p_payload->>'phase',error_code=p_payload->>'code',version=version+1,updated_at=clock_timestamp() where id=w.id;
  perform public.ugc_character_v5_event(w.id,'failed'); return to_jsonb(c);
 else return null;
 end if;
 update public.ugc_character_v5_workflows set lease_expires_at=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where id=w.id;
 select * into c from public.ugc_character_v5_candidates where id=c.id; return to_jsonb(c);
end; $$;

create or replace function public.ugc_reference_group_approved(p_job_id uuid,p_reference_type text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare w public.ugc_character_v5_workflows;
begin
 if p_reference_type='character' then
  select * into w from public.ugc_character_v5_workflows where job_id=p_job_id;
  if found then return w.state='approved' and w.approved_at is not null and w.accepted ?& array['face','back','front_source','front']
   and public.ugc_character_v5_asset_valid(w.id,w.sheet); end if;
 end if;
 return public.ugc_reference_group_approved_pre_v5(p_job_id,p_reference_type);
end; $$;

-- Product rendering, prompts, model, views and approval remain unchanged. Its
-- Character dependency can now be an approved V5 workflow instead of a V1-V4 row.
create or replace function public.ugc_character_v5_preview_failure(p_owner uuid,p_job uuid,p_version integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.ugc_character_v5_workflows w set error_phase='preview_read',error_code='CHARACTER_OUTPUT_STORAGE_FAILED'
 where w.job_id=p_job and w.owner_user_id=p_owner and w.version=p_version;
 return found;
end; $$;

-- Preserve every historical event constraint while admitting the fixed V5 events.
do $$ declare expression text; begin
 select pg_get_expr(conbin,conrelid) into expression from pg_constraint where conrelid='public.ugc_generation_job_events'::regclass and conname='ugc_generation_job_events_event_type_check';
 if expression not like '%character_v5.%' then
  alter table public.ugc_generation_job_events drop constraint ugc_generation_job_events_event_type_check;
  execute 'alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_event_type_check check (('||expression||') or event_type in (''character_v5.preparing'',''character_v5.generating'',''character_v5.review'',''character_v5.accepted'',''character_v5.rejected'',''character_v5.local_crop'',''character_v5.sheet_composition'',''character_v5.ready'',''character_v5.approved'',''character_v5.failed''))';
 end if;
end; $$;

create or replace function public.ugc_prepare_product_sheet_m6(p_job_id uuid,p_claim_token uuid,p_model text,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_product_sheets;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'product_reference' or p_claim_token is null or j.claim_token is distinct from p_claim_token
    or j.lease_expires_at<=clock_timestamp() or j.cancellation_requested_at is not null or j.input_snapshot->>'schemaVersion'<>'3'
    or j.analysis_version is distinct from 1 or p_model is distinct from 'gpt-image-2.5-sunburst' then return null; end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then return null; end if;
  if not exists(select 1 from public.ugc_character_sheets c where c.id=(p_document->>'characterSheetId')::uuid and c.job_id=j.id
    and c.owner_user_id=j.owner_user_id and c.project_id=j.project_id and c.status='completed' and c.document->'assets' ? 'sheet')
    and not exists(select 1 from public.ugc_character_v5_workflows w where w.id=(p_document->>'characterSheetId')::uuid and w.job_id=j.id
      and w.owner_user_id=j.owner_user_id and w.project_id=j.project_id and w.state='approved' and w.sheet is not null)
    or not exists(select 1 from public.ugc_reference_analyses a where a.id=(p_document->>'analysisId')::uuid and a.job_id=j.id
      and a.owner_user_id=j.owner_user_id and a.project_id=j.project_id and a.source_asset_id=(j.input_snapshot->'product'->>'assetId')::uuid
      and a.analysis_type='product' and a.state='completed' and a.analysis_version=j.analysis_version and a.requested_model=j.analysis_model)
    or j.lease_expires_at<=clock_timestamp() then return null; end if;
  select * into s from public.ugc_product_sheets where job_id=j.id;
  if found then
    if s.provider_model<>p_model or (s.document-array['instructions','operations','assets','provenance']) is distinct from
      (p_document-array['instructions','operations','assets','provenance']) then return null; end if;
    return to_jsonb(s);
  end if;
  if p_document->'operations' is distinct from '{}'::jsonb or p_document->'assets' is distinct from '{}'::jsonb then return null; end if;
  insert into public.ugc_product_sheets(owner_user_id,project_id,job_id,source_asset_id,product_name,provider_model,document)
    values(j.owner_user_id,j.project_id,j.id,(j.input_snapshot->'product'->>'assetId')::uuid,j.input_snapshot->'product'->>'name',p_model,p_document) returning * into s;
  perform public.ugc_append_product_progress(j.id,'product_reference.started');
  return to_jsonb(s);
end; $$;

create or replace function public.ugc_resume_product_sheet_m6(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'queued' or j.stage<>'product_reference' or j.pause_reason is distinct from 'PRODUCT_REFERENCE_NOT_IMPLEMENTED'
    or j.product_attempt_count>=3 or j.cancellation_requested_at is not null or j.input_snapshot->>'schemaVersion'<>'3'
    or j.analysis_version is distinct from 1 then return false; end if;
  if not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false)
    or not exists(select 1 from public.ugc_character_sheets where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id
      and status='completed' and document->'assets' ?& array['front','back','face','sheet'])
      and not exists(select 1 from public.ugc_character_v5_workflows w where w.job_id=j.id and w.owner_user_id=j.owner_user_id
        and w.project_id=j.project_id and w.state='approved' and w.sheet is not null)
    or (select count(*) from public.ugc_reference_analyses a where a.job_id=j.id and a.owner_user_id=j.owner_user_id
      and a.project_id=j.project_id and a.state='completed' and a.analysis_version=1 and a.requested_model=j.analysis_model
      and a.source_asset_id=(j.input_snapshot->a.analysis_type->>'assetId')::uuid)<>2 then return false; end if;
  update public.ugc_generation_jobs set pause_reason=null where id=j.id;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(j.id,j.status,j.stage,'development_resumed','Product generation enabled for the local worker.',jsonb_build_object('resumeStage',j.resume_stage));
  return true;
end; $$;

create or replace function public.ugc_resume_product_sheet(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.ugc_generation_jobs where id=p_job_id for update;
  if not public.ugc_reference_group_approved(p_job_id,'character') or exists(select 1 from public.ugc_reference_reviews r where r.job_id=p_job_id
    and (r.reference_type<>'character' or not exists(select 1 from public.ugc_character_v5_workflows w where w.job_id=p_job_id))
    and (r.version<>r.composed_version or exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed'))) then return false; end if;
  return public.ugc_resume_product_sheet_m6(p_job_id);
end; $$;

create or replace function public.ugc_reconcile_reference_gate(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; target text; pause text;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'queued' or j.stage not in ('character_reference','product_reference','location_reference')
    or j.cancellation_requested_at is not null or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft')
    or not exists(select 1 from public.ugc_character_sheets where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id and status='completed')
    and not exists(select 1 from public.ugc_character_v5_workflows where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id) then return false; end if;
  if not public.ugc_reference_group_approved(j.id,'character') then target:='character_reference'; pause:='CHARACTER_REFERENCE_NOT_IMPLEMENTED';
  elsif not public.ugc_reference_group_approved(j.id,'product') then target:='product_reference'; pause:='PRODUCT_REFERENCE_NOT_IMPLEMENTED';
  else target:='location_reference'; pause:='LOCATION_REFERENCE_NOT_IMPLEMENTED'; end if;
  if j.stage is distinct from target or j.pause_reason is distinct from pause then
    update public.ugc_generation_jobs set stage=target,resume_stage=target,pause_reason=pause,next_retry_at=null where id=j.id;
  end if;
  return true;
end; $$;

create or replace function public.ugc_claim_reference_regeneration_m66(p_worker_id uuid,p_product_enabled boolean default false) returns public.ugc_reference_reviews
language plpgsql security definer set search_path='' as $$
declare candidate record; j public.ugc_generation_jobs; r public.ugc_reference_reviews; now_at timestamptz:=clock_timestamp();
begin
  if p_worker_id is null then return null; end if;
  for candidate in select id,job_id from public.ugc_reference_reviews
    where version<>composed_version and execution_state in ('idle','running')
    and reference_type='product' and p_product_enabled order by created_at loop
    -- Match every existing mutation's job -> review lock order, without waiting.
    select * into j from public.ugc_generation_jobs where id=candidate.job_id for update skip locked;
    if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null
      or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then continue; end if;
    if exists(select 1 from public.ugc_reference_reviews where job_id=j.id and execution_state='running' and lease_expires_at>now_at) then continue; end if;
    select * into r from public.ugc_reference_reviews where id=candidate.id for update skip locked;
    if not found or r.version=r.composed_version or r.execution_state='failed' or
      (r.execution_state='running' and r.lease_expires_at>now_at) then continue; end if;
    if r.execution_attempts>=3 then
      update public.ugc_reference_reviews set execution_state='failed',execution_error='ATTEMPTS_EXHAUSTED',
        processing_elapsed_ms=processing_elapsed_ms+case when processing_updated_at is not null then
          greatest(0,extract(epoch from (least(now_at,lease_expires_at)-processing_updated_at))*1000)::bigint else 0 end,
        execution_token=null,execution_worker_id=null,lease_expires_at=null,processing_updated_at=null where id=r.id;
      perform public.ugc_regeneration_event(r.id,null,'regeneration_failed'); continue;
    end if;
    update public.ugc_reference_reviews set execution_state='running',execution_attempts=execution_attempts+1,
      execution_token=gen_random_uuid(),execution_worker_id=p_worker_id,heartbeat_at=now_at,lease_expires_at=now_at+interval '90 seconds',
      processing_elapsed_ms=processing_elapsed_ms+case when processing_updated_at is not null then
        greatest(0,extract(epoch from (least(now_at,lease_expires_at)-processing_updated_at))*1000)::bigint else 0 end,
      processing_updated_at=now_at,execution_error=null where id=r.id returning * into r;
    return r;
  end loop;
  return null;
end; $$;

create or replace function public.ugc_reference_claim_gate() returns trigger
language plpgsql security definer set search_path='' as $$
declare blocked boolean; character_ready boolean; product_ready boolean;
begin
  if new.status='running' and (old.status<>'running' or new.stage is distinct from old.stage) and new.stage in ('character_reference','product_reference') then
    blocked:=exists(select 1 from public.ugc_reference_reviews r where r.job_id=new.id and (r.reference_type<>'character' or not exists(select 1 from public.ugc_character_v5_workflows w where w.job_id=new.id)) and (r.version<>r.composed_version
      or exists(select 1 from public.ugc_reference_regeneration_requests q where q.review_id=r.id and q.state<>'completed')));
    if new.stage='product_reference' and not public.ugc_reference_group_approved(new.id,'character') then blocked:=true; end if;
    if blocked then
      new.status:='queued'; new.resume_stage:=new.stage;
      new.pause_reason:=case new.stage when 'product_reference' then 'PRODUCT_REFERENCE_NOT_IMPLEMENTED' else 'CHARACTER_REFERENCE_NOT_IMPLEMENTED' end;
      new.worker_id:=null; new.claim_token:=null; new.lease_expires_at:=null;
      new.attempt_count:=old.attempt_count; new.product_attempt_count:=old.product_attempt_count;
    end if;
  end if;
  if new.stage is distinct from old.stage and new.stage in ('build_storyboard','build_generation_package','cost_review','awaiting_confirmation','video_generation','finalizing','complete')
    and not public.ugc_location_references_approved(new.id) then raise exception 'Current Character and Product approval is required.' using errcode='23514'; end if;
  if new.stage='location_reference' then
    if new.status<>'queued' or new.pause_reason is distinct from 'LOCATION_REFERENCE_NOT_IMPLEMENTED' then
      raise exception 'Location generation is not implemented.' using errcode='23514'; end if;
    character_ready:=public.ugc_reference_group_approved(new.id,'character');
    product_ready:=public.ugc_reference_group_approved(new.id,'product');
    if not character_ready or not product_ready then
      new.stage:=case when not character_ready then 'character_reference' else 'product_reference' end;
      new.resume_stage:=new.stage;
      new.pause_reason:=case when not character_ready then 'CHARACTER_REFERENCE_NOT_IMPLEMENTED' else 'PRODUCT_REFERENCE_NOT_IMPLEMENTED' end;
    end if;
  end if;
  return new;
end; $$;

create or replace function public.ugc_approve_reference(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid,p_reference_type text,p_expected_version integer,p_sheet_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_reference_type='character' then return false; end if;
 return public.ugc_approve_reference_pre_v5(p_owner_user_id,p_project_id,p_job_id,p_reference_type,p_expected_version,p_sheet_id);
end; $$;
create or replace function public.ugc_request_reference_regeneration(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid,p_reference_type text,p_view text,p_expected_version integer,p_sheet_id uuid,p_request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_reference_type='character' then return false; end if;
 return public.ugc_request_reference_regeneration_pre_v5(p_owner_user_id,p_project_id,p_job_id,p_reference_type,p_view,p_expected_version,p_sheet_id,p_request_id);
end; $$;

-- Definer helpers have no browser or direct service entry point. Expose only
-- narrowly scoped, fenced RPCs; table writes remain revoked.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and (p.proname like 'ugc_character_v5_%' or p.proname like 'ugc_character_cleanup_%'
    or p.proname in ('ugc_reference_group_approved_pre_v5','ugc_approve_reference_pre_v5','ugc_request_reference_regeneration_pre_v5')) loop
  execute 'revoke all on function '||fn.signature||' from public,anon,authenticated,service_role';
 end loop;
end; $$;
grant execute on function public.ugc_character_v5_start(uuid,uuid,uuid,uuid,uuid),
 public.ugc_character_v5_action(uuid,uuid,uuid,integer,text,text,integer),
 public.ugc_character_v5_finish_rejection(uuid,uuid,uuid,integer,uuid),public.ugc_character_v5_claim(uuid),
 public.ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb),public.ugc_character_v5_preview_failure(uuid,uuid,integer),
 public.ugc_character_cleanup_claim(uuid,uuid,uuid,jsonb,text,text,bigint),public.ugc_character_cleanup_finish(text,text)
 to service_role;
revoke all on function public.ugc_approve_reference(uuid,uuid,uuid,text,integer,uuid),
 public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid),public.ugc_reference_group_approved(uuid,text)
 from public,anon,authenticated;
grant execute on function public.ugc_approve_reference(uuid,uuid,uuid,text,integer,uuid),
 public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid),public.ugc_reference_group_approved(uuid,text) to service_role;
create or replace function public.ugc_location_references_approved(p_job_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.ugc_reference_group_approved(p_job_id,'character') and public.ugc_reference_group_approved(p_job_id,'product');
$$;
revoke all on function public.ugc_location_references_approved(uuid) from public,anon,authenticated;
grant execute on function public.ugc_location_references_approved(uuid) to service_role;
commit;
