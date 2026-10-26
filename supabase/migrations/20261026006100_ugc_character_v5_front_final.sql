-- Final provider-prepared Front from accepted Face. Apply manually after 060.
-- No backfill, job retry, data migration or Product function change.
begin;
create or replace function public.ugc_character_v5_action(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_action text,p_slot text default null,p_crop_top integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; w public.ugc_character_v5_workflows; c public.ugc_character_v5_candidates; next_slot text; new_id uuid; a jsonb; final_front boolean; current_final boolean;
begin
 if p_action='crop' or p_crop_top is not null then return null; end if;
 select * into j from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project for update;
 if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null
  or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 select * into w from public.ugc_character_v5_workflows where job_id=j.id and owner_user_id=p_owner and project_id=p_project for update;
 if not found or w.version<>p_version or w.state in ('queued','running') then return null; end if;
 select * into c from public.ugc_character_v5_candidates where id=w.candidate_id and workflow_id=w.id for update;
 current_final:=c.slot='front_source' and c.generation->>'frontPreparation'='provider-final-v1'
  and c.input_asset->>'kind'='accepted_face' and c.input_asset->>'id'=w.accepted->'face'->>'id'
  and c.input_asset->>'sha256'=w.accepted->'face'->>'sha256'
  and c.input_asset->>'etag'=w.accepted->'face'->>'etag'
  and c.input_asset->>'storageKey'=w.accepted->'face'->>'storageKey';
 final_front:=exists(select 1 from public.ugc_character_v5_candidates s where s.workflow_id=w.id
  and s.id::text=w.accepted->'front_source'->>'id' and s.state='accepted'
  and s.generation->>'frontPreparation'='provider-final-v1' and s.input_asset->>'kind'='accepted_face'
  and s.input_asset->>'id'=w.accepted->'face'->>'id' and s.input_asset->>'sha256'=w.accepted->'face'->>'sha256'
  and w.accepted->'front'->>'id'=s.id::text);
 if p_action='accept' then
  if w.state<>'review' or c.state<>'review' or c.slot<>w.slot or not public.ugc_character_v5_asset_valid(w.id,c.artifact) then return null; end if;
  if w.slot='sheet' then return null; end if;
  if w.slot='back' and not(w.accepted ? 'face') or w.slot='front_source' and (not(w.accepted ? 'face') or not coalesce(current_final,false))
   or w.slot='front' and not(w.accepted ?& array['face','back','front_source']) then return null; end if;
  a:=w.accepted;
  if w.slot='face' then a:=a-array['back','front_source','front'];
  elsif w.slot='back' and not final_front then a:=a-array['front_source','front'];
  elsif w.slot='front_source' then a:=a-'front'; end if;
  a:=jsonb_set(a,array[w.slot],c.artifact);
  if w.slot='front_source' and current_final then a:=jsonb_set(a,array['front'],c.artifact); end if;
  update public.ugc_character_v5_candidates set state='accepted',status_url=null,updated_at=clock_timestamp() where id=c.id;
  perform public.ugc_character_v5_event(w.id,'accepted');
  next_slot:=case w.slot when 'face' then 'front_source'
   when 'back' then case when final_front then 'sheet' else 'front_source' end
   when 'front_source' then case when a ? 'back' then 'sheet' else 'back' end
   when 'front' then 'sheet' end;
 elsif p_action='reject' then
  if c.state not in ('review','rejecting') or w.state not in ('review','failed') then return null; end if;
  if exists(select 1 from jsonb_each(w.accepted) e where e.value->>'storageKey'=c.artifact->>'storageKey') or w.sheet->>'storageKey'=c.artifact->>'storageKey' then return null; end if;
  update public.ugc_character_v5_candidates set state='rejecting',updated_at=clock_timestamp() where id=c.id;
  update public.ugc_character_v5_workflows set state='failed',error_phase='candidate_delete',error_code='CHARACTER_CANDIDATE_DELETE_PENDING',
   version=version+1,updated_at=clock_timestamp() where id=w.id returning * into w;
  return to_jsonb(w);
 elsif p_action='regenerate' then
  if c.state in ('review','rejecting','intent','submitted') then return null; end if;
  next_slot:=p_slot;
  if next_slot is null or next_slot not in ('face','back','front_source','sheet') then return null; end if;
  if next_slot='back' and not(w.accepted ? 'face') or next_slot='front_source' and not(w.accepted ? 'face')
   or next_slot='sheet' and not(w.accepted ?& array['face','back','front_source','front']) then return null; end if;
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
  work_phase='preparing',error_phase=null,error_code=null,version=version+1,updated_at=clock_timestamp() where id=w.id returning * into w;
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
   or p_payload->'generation'->>'enhancePrompt' is distinct from
    case when w.slot='back' and p_payload->'generation'->>'promptRevision' in ('2','3','4')
      or w.slot='front_source' and p_payload->'generation'->>'promptRevision' in ('2','3') then 'false' else 'true' end) then return null; end if;
  if w.slot in ('front','sheet') and (p_payload->'generation'->>'model' is distinct from 'sharp'
   or p_payload->'generation'->>'revision' is distinct from w.revision or p_payload->'generation'->>'slot' is distinct from w.slot
   or p_payload->'generation'->>'promptVersion' is distinct from '5' or p_payload->'generation'->>'contractVersion' is distinct from '5') then return null; end if;
  if w.slot='front_source' and p_payload->'generation'->>'promptRevision'='3' and (
   p_payload->'generation'->>'frontPreparation' is distinct from 'provider-final-v1'
   or not(w.accepted ? 'face') or p_payload->'inputAsset'->>'kind' is distinct from 'accepted_face'
   or p_payload->'inputAsset'->>'id' is distinct from w.accepted->'face'->>'id'
   or p_payload->'inputAsset'->>'storageKey' is distinct from w.accepted->'face'->>'storageKey'
   or p_payload->'inputAsset'->>'sha256' is distinct from w.accepted->'face'->>'sha256'
   or p_payload->'inputAsset'->>'etag' is distinct from w.accepted->'face'->>'etag'
   or p_payload->'generation'->'soulId' is distinct from 'null'::jsonb
   or p_payload->'generation'->>'soulIdUsed' is distinct from 'false') then return null; end if;
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
   or ((p_payload->'artifact')-array['storageKey','etag']) is distinct from c.output_proof then return null; end if;
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


-- CREATE OR REPLACE retains existing service-only grants.
commit;
