-- Independent estimates in the existing 069 service-only checkpoint contract.
-- Manual application after 070; no package, authorization or data rewrite.
-- Uses existing tables/columns and preserves lease/recovery/completion rules.
begin;
create or replace function public.ugc_final_checkpoint(p_execution uuid,p_token uuid,p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.ugc_final_executions; o public.ugc_final_operations; s public.ugc_final_scenes; cost bigint; created boolean:=false; provider_cfg jsonb; begin
 select * into e from public.ugc_final_executions where id=p_execution for update;
 if e.id is null or e.state<>'running' or e.claim_token is distinct from p_token or e.lease_expires_at<=clock_timestamp() then return null; end if;
 if p_operation='intent' then
  select * into o from public.ugc_final_operations where execution_id=e.id and operation_key=p_payload->>'key' for update;
  if o.id is null then
   if not public.ugc_final_current(e.id) then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_PACKAGE_CHANGED'); end if;
   if p_payload->>'fingerprint' !~ '^[a-f0-9]{64}$' then return null; end if;
   if p_payload->>'sceneId' is not null and not exists(select 1 from public.ugc_final_scenes where execution_id=e.id and scene_id=p_payload->>'sceneId') then return null; end if;
   cost:=0;
   if p_payload->>'kind'<>'composition' then
    -- Service-only caller supplies request-derived pricing evidence, never a
    -- spending ceiling. Persist it with the immutable operation intent.
    provider_cfg:=p_payload->'costEstimate';
    if not coalesce(e.configuration->'pricing'->>'valid'='true'
     and e.configuration->'pricing'->>'version'='provider-pricing-2026-10-28-v1'
     and provider_cfg->>'pricingVersion'=e.configuration->'pricing'->>'version'
     and provider_cfg->>'source' in ('verified_provider_pricing','configured_provider_pricing')
     and jsonb_typeof(provider_cfg->'estimatedCostMicrousd')='number'
     and jsonb_typeof(provider_cfg->'rateMicrousd')='number'
     and jsonb_typeof(provider_cfg->'billableQuantity')='number'
     and provider_cfg->>'provider'=p_payload->>'provider' and provider_cfg->>'model'=p_payload->>'model'
     and provider_cfg->>'kind'=p_payload->>'kind' and provider_cfg->>'operationKey'=p_payload->>'key',false)
     then return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE'); end if;
    if (provider_cfg->>'rateMicrousd')::numeric<0 or (provider_cfg->>'billableQuantity')::numeric<0
     or (provider_cfg->>'estimatedCostMicrousd')::numeric<>ceil((provider_cfg->>'rateMicrousd')::numeric*(provider_cfg->>'billableQuantity')::numeric)
     or (provider_cfg->>'estimatedCostMicrousd')::numeric not between 0 and 1000000000
     or ((provider_cfg->>'estimatedCostMicrousd')::numeric=0 and p_payload->>'kind'<>'binding')
     then return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE'); end if;
    cost:=(provider_cfg->>'estimatedCostMicrousd')::bigint;
    if (e.configuration->'ceilings'->>(p_payload->>'kind')) is null
     or cost>(e.configuration->'ceilings'->>(p_payload->>'kind'))::bigint
     then return jsonb_build_object('execution',to_jsonb(e),'blocked','STAGE_AUTHORIZATION_CEILING_EXCEEDED'); end if;
    if e.paid_requests >= (e.configuration->>'maxRequests')::integer or e.estimated_cost_microusd+cost>(e.configuration->>'maxEstimatedCostMicrousd')::bigint then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_BUDGET_EXHAUSTED'); end if;
    provider_cfg:=e.configuration->'providers'->(p_payload->>'kind');
    if provider_cfg->>'id' is distinct from p_payload->>'provider' or provider_cfg->>'model' is distinct from p_payload->>'model' then return null; end if;
    update public.ugc_final_executions set paid_requests=paid_requests+1,estimated_cost_microusd=estimated_cost_microusd+cost where id=e.id;
   end if;
   insert into public.ugc_final_operations(execution_id,owner_user_id,project_id,operation_key,fingerprint,kind,scene_id,provider,model,input,estimated_cost_microusd)
    values(e.id,e.owner_user_id,e.project_id,p_payload->>'key',p_payload->>'fingerprint',p_payload->>'kind',p_payload->>'sceneId',p_payload->>'provider',p_payload->>'model',p_payload->'input'||case when p_payload->>'kind'='composition' then '{}'::jsonb else jsonb_build_object('costEstimate',p_payload->'costEstimate') end,cost) returning * into o;
   created:=true;
  end if;
 elsif p_operation in ('receipt','output','operation_failed') then
  select * into o from public.ugc_final_operations where id=(p_payload->>'operationId')::uuid and execution_id=e.id for update;
  if o.id is null then return null; end if;
  if o.state<>'ready' then
   if p_operation='receipt' then
    if o.request_id is not null and p_payload->'receipt'->>'requestId' is not null and o.request_id<>p_payload->'receipt'->>'requestId' then return null; end if;
    update public.ugc_final_operations set receipt=coalesce(receipt,'{}')||p_payload->'receipt',request_id=coalesce(request_id,p_payload->'receipt'->>'requestId'),
     state=case when p_payload->'receipt'->'result' is not null then 'result' else 'submitted' end,updated_at=clock_timestamp() where id=o.id returning * into o;
   elsif p_operation='output' then
    if o.kind<>'binding' and not public.ugc_final_asset_valid(p_payload->'asset',e) then return null; end if;
    update public.ugc_final_operations set output=nullif(p_payload->'asset','null'),state='ready',updated_at=clock_timestamp() where id=o.id returning * into o;
   else update public.ugc_final_operations set state='failed',error_code=p_payload->>'code',updated_at=clock_timestamp() where id=o.id returning * into o;
   end if;
  end if;
 elsif p_operation='profile' then
  if e.profile is null then return null; end if;
  if not exists(select 1 from public.ugc_character_voice_profiles where id=e.profile->>'id' and owner_user_id=e.owner_user_id and project_id=e.project_id) then
   if not exists(select 1 from public.ugc_final_operations where execution_id=e.id and kind='binding' and state='ready' and receipt=p_payload->'binding') then return null; end if;
   insert into public.ugc_character_voice_profiles(id,owner_user_id,project_id,profile,provider_binding)
    values(e.profile->>'id',e.owner_user_id,e.project_id,e.profile,p_payload->'binding') on conflict(id) do nothing;
  end if;
  select provider_binding into provider_cfg from public.ugc_character_voice_profiles where id=e.profile->>'id' and owner_user_id=e.owner_user_id and project_id=e.project_id;
  update public.ugc_final_executions set profile_binding=provider_cfg where id=e.id;
 elsif p_operation='scene' then
  select * into s from public.ugc_final_scenes where execution_id=e.id and scene_id=p_payload->>'sceneId' for update;
  if s.execution_id is null or not public.ugc_final_scene_valid(e.id,s.scene_id,p_payload->'manifest',p_payload->'asset') then return null; end if;
  if not exists(select 1 from public.ugc_final_operations where execution_id=e.id and scene_id=s.scene_id and kind='video' and state='ready') then return null; end if;
  update public.ugc_final_scenes set phase='scene_ready',output=p_payload->'asset',manifest=p_payload->'manifest',updated_at=clock_timestamp()
   where execution_id=e.id and scene_id=s.scene_id;
 elsif p_operation='review' then
  if not public.ugc_final_result_valid(e.id,p_payload->'asset',p_payload->>'fingerprint') then return null; end if;
  update public.ugc_final_executions set state='review',phase='review',final_asset=p_payload->'asset',final_fingerprint=p_payload->>'fingerprint' where id=e.id;
 elsif p_operation='phase' then
  if p_payload->>'phase' not in ('capability_check','video_generating','video_reconciling','video_saving','voice_preparing','voice_generating','voice_saving','lip_syncing','lip_sync_saving','scene_ready','combining','finalizing','deleting') then return null; end if;
  update public.ugc_final_executions set phase=p_payload->>'phase' where id=e.id;
  if p_payload->>'sceneId' is not null then update public.ugc_final_scenes set phase=p_payload->>'phase' where execution_id=e.id and scene_id=p_payload->>'sceneId' and phase<>'scene_ready'; end if;
 elsif p_operation='release' then
  update public.ugc_final_executions set state='queued' where id=e.id;
 elsif p_operation='fail' then
  update public.ugc_final_executions set state=case when p_payload->>'code' in ('FINAL_UNCERTAIN_PROVIDER_OUTCOME','FINAL_RECOVERY_REQUIRED') then 'reconciling' else 'failed' end,
   error_code=p_payload->>'code',phase=case when phase='deleting' then 'deleting' when p_payload->>'code' in ('FINAL_UNCERTAIN_PROVIDER_OUTCOME','FINAL_RECOVERY_REQUIRED') then 'reconciliation_required' else 'scene_failed' end where id=e.id;
 elsif p_operation='deleted' and e.phase='deleting' then
  update public.ugc_final_executions set state='deleted',phase='deleted',final_asset=null where id=e.id;
 elsif p_operation<>'heartbeat' then return null;
 end if;
 update public.ugc_final_executions set version=version+1,updated_at=clock_timestamp(),
  heartbeat_at=case when state='running' then clock_timestamp() else null end,
  lease_expires_at=case when state='running' then clock_timestamp()+interval '90 seconds' else null end,
  claim_token=case when state='running' then claim_token else null end,worker_id=case when state='running' then worker_id else null end where id=e.id returning * into e;
 return jsonb_build_object('execution',to_jsonb(e),'operation',case when o.id is null then null else to_jsonb(o) end,'created',created);
end $$;

revoke all on function public.ugc_final_checkpoint(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ugc_final_checkpoint(uuid,uuid,text,jsonb) to service_role;
commit;
