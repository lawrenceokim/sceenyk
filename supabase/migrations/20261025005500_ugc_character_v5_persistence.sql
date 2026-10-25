-- Manual 055 after 054. Fix the verified undefined-column bug (42703).
-- No data repair/backfill, job resume, provider call, R2 write/delete or execution.
begin;
do $$ begin
 if to_regprocedure('public.ugc_character_v5_start(uuid,uuid,uuid,uuid,uuid)') is null
  or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_generation_jobs' and column_name='retry_eligible' and data_type='boolean') then
  raise exception 'Apply 054 and the existing retry_eligible job schema first.';
 end if;
end; $$;
alter table public.ugc_character_v5_candidates add column if not exists output_proof jsonb;
create unique index if not exists ugc_character_v5_provider_request_once
 on public.ugc_character_v5_candidates(workflow_id,slot,request_id) where request_id is not null;
-- A technical fingerprint is committed before R2 PUT. No bytes or URLs here.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.ugc_character_v5_candidates'::regclass and conname='ugc_character_v5_output_proof_shape') then
  alter table public.ugc_character_v5_candidates add constraint ugc_character_v5_output_proof_shape
   check(output_proof is null or jsonb_typeof(output_proof)='object' and octet_length(output_proof::text)<=4096);
 end if;
end; $$;
alter table public.ugc_character_v5_workflows drop constraint if exists ugc_character_v5_workflows_error_phase_check;
alter table public.ugc_character_v5_workflows add constraint ugc_character_v5_workflows_error_phase_check check(error_phase in
 ('input_read','input_sign','provider_submit','provider_status','output_download','output_decode','r2_put','r2_verify','metadata_persistence',
 'candidate_insertion','preview_sign','preview_read','candidate_delete','local_crop','sheet_composition','other',
 'provider_output_download','image_decode','r2_write','candidate_readback','preview_signing'));

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
  error_code=null,safe_error_message=null,failed_at=null,retry_eligible=false where id=j.id;
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
   error_code=null,safe_error_message=null,failed_at=null,retry_eligible=false where id=j.id;
  perform public.ugc_reconcile_reference_gate(j.id);
  return to_jsonb(w);
 else return null;
 end if;
 insert into public.ugc_character_v5_candidates(workflow_id,slot,model) values(w.id,next_slot,
  case when next_slot in ('front','sheet') then 'sharp' else 'higgsfield-ai/soul/v2/image-to-image' end) returning id into new_id;
 update public.ugc_character_v5_workflows set slot=next_slot,state='queued',candidate_id=new_id,accepted=a,sheet=null,approved_at=null,
  crop_top=coalesce(p_crop_top,crop_top),work_phase='preparing',error_phase=null,error_code=null,version=version+1,updated_at=clock_timestamp() where id=w.id returning * into w;
 update public.ugc_generation_jobs set status='queued',stage='character_reference',resume_stage='character_reference',pause_reason='CHARACTER_REFERENCE_NOT_IMPLEMENTED',
  error_code=null,safe_error_message=null,failed_at=null,retry_eligible=false where id=j.id;
 perform public.ugc_character_v5_event(w.id,'preparing');
 return to_jsonb(w);
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
 elsif p_operation='output' then
  if c.state not in ('intent','submitted') or not public.ugc_character_v5_asset_valid(w.id,
    (p_payload->'proof')||jsonb_build_object('storageKey',expected_key,'etag','pending'))
    or p_payload->'proof'->>'id' is distinct from c.id::text
    or c.output_proof is not null and c.output_proof is distinct from p_payload->'proof' then return null; end if;
  update public.ugc_character_v5_candidates set output_proof=p_payload->'proof',updated_at=clock_timestamp() where id=c.id;
 elsif p_operation='ready' then
  if c.state not in ('intent','submitted') or not public.ugc_character_v5_asset_valid(w.id,p_payload->'artifact')
   or p_payload->'artifact'->>'storageKey' is distinct from expected_key or p_payload->'artifact'->>'id' is distinct from c.id::text or c.output_proof is null
   or (p_payload->'artifact'-array['storageKey','etag']) is distinct from c.output_proof then return null; end if;
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
 update public.ugc_character_v5_candidates set state='rejected',artifact=null,output_proof=null,planned_key=null,status_url=null,generation=null,input_asset=null,updated_at=clock_timestamp() where id=c.id;
 update public.ugc_character_v5_workflows set state='failed',error_phase=null,error_code='CHARACTER_CANDIDATE_REJECTED',version=version+1,updated_at=clock_timestamp() where id=w.id;
 perform public.ugc_character_v5_event(w.id,'rejected'); return true;
end; $$;

-- Provider-free, explicit recovery of the SAME preallocated candidate only.
create or replace function public.ugc_character_v5_preview_failure(p_owner uuid,p_job uuid,p_version integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.ugc_character_v5_workflows w set error_phase='preview_read',error_code='CHARACTER_PREVIEW_READ_FAILED'
 where w.job_id=p_job and w.owner_user_id=p_owner and w.version=p_version;
 return found;
end; $$;

create or replace function public.ugc_character_v5_recovery_claim(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_candidate uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; w public.ugc_character_v5_workflows; c public.ugc_character_v5_candidates; expected_key text;
begin
 select * into j from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project for update;
 if not found or j.status<>'queued' or j.stage<>'character_reference' or j.cancellation_requested_at is not null
  or j.pause_reason is distinct from 'CHARACTER_REFERENCE_NOT_IMPLEMENTED'
  or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 select * into w from public.ugc_character_v5_workflows where job_id=j.id and owner_user_id=p_owner and project_id=p_project for update;
 if not found or w.version<>p_version or w.candidate_id is distinct from p_candidate or w.state not in ('queued','failed','running')
  or w.state='running' and w.lease_expires_at>clock_timestamp() then return null; end if;
 select * into c from public.ugc_character_v5_candidates where id=p_candidate and workflow_id=w.id for update;
 if not found or c.slot<>w.slot or c.state not in ('intent','submitted','failed') or c.output_proof is null then return null; end if;
 expected_key:='ugc/'||p_owner||'/'||p_project||'/'||p_job||'/character-v5/'||w.id||'/candidates/'||c.id||'.png';
 if c.planned_key is distinct from expected_key or c.output_proof->>'id' is distinct from c.id::text
  or not public.ugc_character_v5_asset_valid(w.id,c.output_proof||jsonb_build_object('storageKey',expected_key,'etag','pending'))
  or exists(select 1 from jsonb_each(w.accepted) e where e.value->>'id'=c.id::text) or w.sheet->>'id'=c.id::text then return null; end if;
 update public.ugc_character_v5_candidates set state=case when request_id is null then 'intent' else 'submitted' end,updated_at=clock_timestamp() where id=c.id;
 update public.ugc_character_v5_workflows set processing_elapsed_ms=processing_elapsed_ms+case when state='running' and processing_updated_at is not null then
  greatest(0,extract(epoch from (least(clock_timestamp(),lease_expires_at)-processing_updated_at))*1000)::bigint else 0 end,
  processing_updated_at=clock_timestamp(),state='running',claim_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '90 seconds',
  error_phase=null,error_code=null,updated_at=clock_timestamp() where id=w.id returning * into w;
 return to_jsonb(w);
end; $$;
revoke all on function public.ugc_character_v5_recovery_claim(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.ugc_character_v5_recovery_claim(uuid,uuid,uuid,integer,uuid) to service_role;
-- CREATE OR REPLACE retains the existing service-only grants on corrected RPCs.
commit;
