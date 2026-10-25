-- Correct JSON operator precedence in 055. No data/backfill or new field.
-- Apply manually after 055. Product and approval rules stay unchanged.
begin;
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

-- CREATE OR REPLACE preserves the service-only checkpoint ACL.
commit;
