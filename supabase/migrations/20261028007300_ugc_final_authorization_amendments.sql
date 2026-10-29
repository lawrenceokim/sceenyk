-- Manual after 072/prerequisites. No data repair, retry, provider call or reset.
begin;
do $$ declare item record; begin
 for item in select * from (values ('ugc_final_executions','configuration'),('ugc_final_executions','configuration_hash'),
  ('ugc_final_executions','profile'),('ugc_final_executions','paid_requests'),('ugc_final_operations','input'),
  ('ugc_final_operations','attempt'),('ugc_final_operations','receipt'),('ugc_final_operations','output'),
  ('ugc_generation_packages','document'),('app_users','id')) x(t,c) loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=item.t and column_name=item.c)
   then raise exception 'Missing amendment prerequisite %.%',item.t,item.c; end if;
 end loop;
 if to_regprocedure('public.ugc_final_checkpoint(uuid,uuid,text,jsonb)') is null then raise exception 'Apply 072 first'; end if;
 if to_regclass('public.ugc_final_authorization_amendments') is not null and
  obj_description(to_regclass('public.ugc_final_authorization_amendments'),'pg_class') is distinct from 'sceenyk-ugc-final-amendments-v1-073'
  then raise exception 'Inspect existing amendment relation before applying 073'; end if;
end $$;
alter table public.ugc_final_executions add column if not exists dispatch_mode text not null default 'initial'
 check(dispatch_mode in ('initial','retry','recover','resume'));
create table if not exists public.ugc_final_authorization_amendments (
 id uuid primary key, execution_id uuid not null references public.ugc_final_executions(id),
 owner_user_id uuid not null references public.app_users(id), project_id uuid not null,
 original_authorization_id uuid not null, original_configuration_hash text not null check(original_configuration_hash~'^[a-f0-9]{64}$'),
 package_hash text not null check(package_hash~'^[a-f0-9]{64}$'), profile_id text not null,
 failed_operation_id uuid not null unique references public.ugc_final_operations(id),
 stage text not null check(stage='voice_design'), reason text not null check(reason='provider_permission_corrected'),
 additional_requests integer not null check(additional_requests=1),
 additional_cost_microusd bigint not null default 0 check(additional_cost_microusd between 0 and 1000000000),
 operator_user_id uuid not null references public.app_users(id), operator_approved boolean not null check(operator_approved),
 configuration_corrected boolean not null check(configuration_corrected), reviewed_http_status integer not null check(reviewed_http_status=403),
 quote jsonb not null, quote_hash text not null check(quote_hash~'^[a-f0-9]{64}$'), created_at timestamptz not null default clock_timestamp(),
 foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id)
);
comment on table public.ugc_final_authorization_amendments is 'sceenyk-ugc-final-amendments-v1-073';
alter table public.ugc_final_authorization_amendments enable row level security;
revoke all on public.ugc_final_authorization_amendments from public,anon,authenticated,service_role;
grant select on public.ugc_final_authorization_amendments to service_role;
drop trigger if exists ugc_final_amendments_immutable on public.ugc_final_authorization_amendments;
create trigger ugc_final_amendments_immutable before update or delete on public.ugc_final_authorization_amendments
 for each row execute function public.ugc_reject_event_mutation();

alter table public.ugc_final_operations add column if not exists logical_key text;
alter table public.ugc_final_operations add column if not exists supersedes_operation_id uuid references public.ugc_final_operations(id);
alter table public.ugc_final_operations add column if not exists amendment_id uuid references public.ugc_final_authorization_amendments(id);
do $$ begin
 if exists(select 1 from pg_constraint where conrelid='public.ugc_final_operations'::regclass and conname='ugc_final_operations_attempt_check') then
  alter table public.ugc_final_operations drop constraint ugc_final_operations_attempt_check;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.ugc_final_operations'::regclass and conname='ugc_final_attempt_authority_073') then
  alter table public.ugc_final_operations add constraint ugc_final_attempt_authority_073 check(
   (attempt=1 and supersedes_operation_id is null and amendment_id is null and (logical_key is null or logical_key=operation_key)) or
   (attempt between 2 and 64 and supersedes_operation_id is not null and amendment_id is not null and logical_key is not null));
 end if;
end $$;
create unique index if not exists ugc_final_logical_attempt_073 on public.ugc_final_operations(execution_id,coalesce(logical_key,operation_key),attempt);
create unique index if not exists ugc_final_one_replacement_073 on public.ugc_final_operations(supersedes_operation_id) where supersedes_operation_id is not null;
create unique index if not exists ugc_final_amendment_consumed_073 on public.ugc_final_operations(amendment_id) where amendment_id is not null;

create or replace function public.ugc_final_operation_guard_073() returns trigger language plpgsql set search_path='' as $$
declare previous public.ugc_final_operations; amendment public.ugc_final_authorization_amendments; begin
 if tg_op='DELETE' then raise exception 'Final operation history is immutable'; end if;
 if tg_op='UPDATE' then
  if old.state in ('ready','failed') then raise exception 'Terminal final operation is immutable'; end if;
  if row(new.id,new.execution_id,new.owner_user_id,new.project_id,new.operation_key,new.fingerprint,new.kind,new.scene_id,new.provider,new.model,new.input,
   new.attempt,new.estimated_cost_microusd,new.created_at,new.logical_key,new.supersedes_operation_id,new.amendment_id)
   is distinct from row(old.id,old.execution_id,old.owner_user_id,old.project_id,old.operation_key,old.fingerprint,old.kind,old.scene_id,old.provider,old.model,old.input,
   old.attempt,old.estimated_cost_microusd,old.created_at,old.logical_key,old.supersedes_operation_id,old.amendment_id)
   then raise exception 'Final operation identity is immutable'; end if;
 elsif new.attempt>1 then
  select * into previous from public.ugc_final_operations where id=new.supersedes_operation_id;
  select * into amendment from public.ugc_final_authorization_amendments where id=new.amendment_id;
  if previous.id is null or amendment.id is null or previous.state<>'failed' or previous.error_code<>'FINAL_PROVIDER_REJECTED'
   or previous.kind<>'design' or new.kind<>'design' or new.attempt<>previous.attempt+1
   or new.logical_key<>coalesce(previous.logical_key,previous.operation_key) or new.logical_key<>'voice:design'
   or new.operation_key<>new.logical_key||':attempt:'||new.attempt or new.fingerprint=previous.fingerprint
   or row(new.execution_id,new.owner_user_id,new.project_id,new.provider,new.model,new.scene_id)
    is distinct from row(previous.execution_id,previous.owner_user_id,previous.project_id,previous.provider,previous.model,previous.scene_id)
   or new.input-'costEstimate' is distinct from previous.input-'costEstimate'
   or amendment.execution_id<>new.execution_id or amendment.failed_operation_id<>previous.id
   then raise exception 'Invalid stage replacement authority'; end if;
 end if;
 return new;
end $$;
drop trigger if exists ugc_final_operation_guard_073 on public.ugc_final_operations;
create trigger ugc_final_operation_guard_073 before insert or update or delete on public.ugc_final_operations
 for each row execute function public.ugc_final_operation_guard_073();

create or replace function public.ugc_final_effective_authorization(p_execution uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('originalRequests',(e.configuration->>'maxRequests')::integer,'amendedRequests',coalesce(sum(a.additional_requests),0),
  'effectiveRequests',(e.configuration->>'maxRequests')::integer+coalesce(sum(a.additional_requests),0),
  'originalCostMicrousd',(e.configuration->>'maxEstimatedCostMicrousd')::bigint,'amendedCostMicrousd',coalesce(sum(a.additional_cost_microusd),0),
  'effectiveCostMicrousd',(e.configuration->>'maxEstimatedCostMicrousd')::bigint+coalesce(sum(a.additional_cost_microusd),0),
  'consumedRequests',e.paid_requests,'remainingRequests',(e.configuration->>'maxRequests')::integer+coalesce(sum(a.additional_requests),0)-e.paid_requests)
 from public.ugc_final_executions e left join public.ugc_final_authorization_amendments a on a.execution_id=e.id
  and a.original_configuration_hash=e.configuration_hash and a.original_authorization_id::text=e.configuration->>'authorizationId'
  and a.package_hash=e.package_hash and a.operator_approved where e.id=p_execution group by e.id;
$$;
create or replace function public.ugc_final_planned_keys_073(p_execution uuid) returns table(operation_key text,kind text)
language plpgsql stable security definer set search_path='' as $$
declare doc jsonb; scene jsonb; line jsonb; i integer; begin
 select p.document into doc from public.ugc_final_executions e join public.ugc_generation_packages p on p.id=e.package_id where e.id=p_execution;
 if exists(select 1 from jsonb_array_elements(doc->'scenes') s,jsonb_array_elements(s->'speech') l where length(btrim(l->>'text'))>0) then
  operation_key:='voice:design';kind:='design';return next;operation_key:='voice:binding';kind:='binding';return next;
 end if;
 for scene in select value from jsonb_array_elements(doc->'scenes') loop
  operation_key:='video:'||(scene->>'id');kind:='video';return next;i:=0;
  for line in select value from jsonb_array_elements(scene->'speech') where length(btrim(value->>'text'))>0 loop
   operation_key:='voice:'||(scene->>'id')||':'||i;kind:='voice';return next;i:=i+1;
  end loop;
  if exists(select 1 from jsonb_array_elements(scene->'speech') l where l->>'speaker'='character' and length(btrim(l->>'text'))>0) then
   operation_key:='sync:'||(scene->>'id');kind:='lip_sync';return next;
  end if;
 end loop;
end $$;

create or replace function public.ugc_final_retry_stage(p_owner uuid,p_execution uuid,p_payload jsonb) returns public.ugc_final_executions
language plpgsql security definer set search_path='' as $$
declare e public.ugc_final_executions; o public.ugc_final_operations; a public.ugc_final_authorization_amendments;
 q jsonb; item jsonb; auth jsonb; sunk bigint; remaining_cost bigint:=0; missing_count integer; credits numeric:=0;
 remaining_credits numeric:=0; allowance jsonb; existing_amendment public.ugc_final_authorization_amendments; begin
 select * into e from public.ugc_final_executions where id=p_execution and owner_user_id=p_owner;
 if e.id is null then return null; end if;
 perform public.ugc_storyboard_lock(e.job_id);
 select * into e from public.ugc_final_executions where id=p_execution and owner_user_id=p_owner for update;
 select * into existing_amendment from public.ugc_final_authorization_amendments where id=(p_payload->>'amendmentId')::uuid;
 if existing_amendment.id is not null then
  if existing_amendment.execution_id=e.id and existing_amendment.owner_user_id=p_owner
   and existing_amendment.failed_operation_id=(p_payload->>'operationId')::uuid and existing_amendment.quote_hash=p_payload->>'quoteHash' then return e; end if;
  raise exception 'FINAL_AMENDMENT_CONFLICT';
 end if;
 if e.state<>'failed' or e.claim_token is not null or e.version is distinct from (p_payload->>'version')::integer
  or not public.ugc_final_current(e.id) or not exists(select 1 from public.projects where id=e.project_id and owner_user_id=p_owner and status='draft')
  then raise exception 'FINAL_RETRY_SCOPE_CHANGED'; end if;
 select * into o from public.ugc_final_operations where id=(p_payload->>'operationId')::uuid and execution_id=e.id for update;
 if o.id is null or o.state<>'failed' or o.error_code<>'FINAL_PROVIDER_REJECTED' or o.kind<>'design'
  or coalesce(o.logical_key,o.operation_key)<>'voice:design' or e.profile_binding is not null
  or o.input->'profile' is distinct from e.profile or (o.receipt->'failure'->>'httpStatus' is not null and o.receipt->'failure'->>'httpStatus'<>'403')
  or (o.receipt->'failure'->>'method' is not null and o.receipt->'failure'->>'method'<>'POST')
  or exists(select 1 from public.ugc_final_operations x where x.execution_id=e.id and coalesce(x.logical_key,x.operation_key)='voice:design' and x.attempt>o.attempt)
  or exists(select 1 from public.ugc_final_authorization_amendments where failed_operation_id=o.id)
  then raise exception 'FINAL_RETRY_NOT_ELIGIBLE'; end if;
 if not coalesce(p_payload->>'operatorApproved'='true' and p_payload->>'configurationCorrected'='true'
  and p_payload->>'reviewedHttpStatus'='403' and p_payload->>'reason'='provider_permission_corrected'
  and p_payload->>'additionalRequests'='1',false) then raise exception 'FINAL_OPERATOR_REVIEW_REQUIRED'; end if;
 q:=p_payload->'quote';
 if not coalesce(public.ugc_package_digest('sceenyk-final-retry-quote',q)=p_payload->>'quoteHash'
  and q->>'configurationHash'=e.configuration_hash and q->>'packageHash'=e.package_hash and q->>'profileId'=e.profile->>'id'
  and (q->>'version')::integer=e.version and q->>'executionId'=e.id::text and q->>'failedOperationId'=o.id::text
  and (q->>'consumedRequests')::integer=e.paid_requests and jsonb_typeof(q->'remainingEstimates')='array'
  and (q->>'additionalCostMicrousd')::numeric between 0 and 1000000000,false) then raise exception 'FINAL_RETRY_QUOTE_CHANGED'; end if;
 if exists(select 1 from public.ugc_final_operations x where x.execution_id=e.id and x.kind<>'composition' and x.id<>o.id
  and x.state<>'ready' and not exists(select 1 from public.ugc_final_operations next_op where next_op.supersedes_operation_id=x.id))
  then raise exception 'FINAL_OTHER_OPERATION_UNRESOLVED'; end if;
 if not exists(select 1 from public.ugc_final_operations where execution_id=e.id and kind='video' and state='ready')
  or exists(select 1 from public.ugc_final_operations x where x.execution_id=e.id and x.state='ready' and x.output is not null and
   not exists(select 1 from jsonb_array_elements(p_payload->'verifiedOutputs') proof where proof->>'operationId'=x.id::text
    and proof->>'sha256'=x.output->>'sha256' and proof->>'etag'=x.output->>'etag' and proof->'sizeBytes'=x.output->'sizeBytes'))
  then raise exception 'FINAL_UPSTREAM_INTEGRITY_REQUIRED'; end if;
 if (select count(*) from public.ugc_final_operations where execution_id=e.id)<>jsonb_array_length(q->'operationStamps') or
  exists(select 1 from public.ugc_final_operations x where x.execution_id=e.id and not exists(select 1 from jsonb_array_elements(q->'operationStamps') stamp
   where stamp->>'id'=x.id::text and stamp->>'fingerprint'=x.fingerprint and stamp->>'state'=x.state and (stamp->>'updatedAt')::timestamptz=x.updated_at))
  then raise exception 'FINAL_RETRY_QUOTE_CHANGED'; end if;
 select coalesce(sum(greatest(estimated_cost_microusd,case when jsonb_typeof(receipt->'usage'->'actualCostMicrousd')='number'
  then (receipt->'usage'->>'actualCostMicrousd')::bigint else 0 end)),0) into sunk from public.ugc_final_operations where execution_id=e.id and kind<>'composition';
 if sunk<>(q->>'sunkKnownCostMicrousd')::bigint then raise exception 'FINAL_RETRY_QUOTE_CHANGED'; end if;
 select count(*) into missing_count from public.ugc_final_planned_keys_073(e.id) planned where not exists(
  select 1 from public.ugc_final_operations x where x.execution_id=e.id and coalesce(x.logical_key,x.operation_key)=planned.operation_key);
 if missing_count<>jsonb_array_length(q->'remainingEstimates') or
  (select count(distinct value->>'operationKey') from jsonb_array_elements(q->'remainingEstimates'))<>missing_count
  then raise exception 'FINAL_RETRY_QUOTE_CHANGED'; end if;
 for item in select value from jsonb_array_elements(q->'remainingEstimates') loop
  if not exists(select 1 from public.ugc_final_planned_keys_073(e.id) planned where planned.operation_key=item->>'operationKey' and planned.kind=item->>'kind')
   or exists(select 1 from public.ugc_final_operations x where x.execution_id=e.id and coalesce(x.logical_key,x.operation_key)=item->>'operationKey')
   or jsonb_typeof(item->'estimatedCostMicrousd') is distinct from 'number' or (item->>'estimatedCostMicrousd')::numeric<0
   or item->>'pricingVersion' is distinct from e.configuration->'pricing'->>'version'
   or (item->>'estimatedCostMicrousd')::numeric>(e.configuration->'ceilings'->>(item->>'kind'))::numeric then raise exception 'COST_ESTIMATE_UNAVAILABLE'; end if;
  remaining_cost:=remaining_cost+(item->>'estimatedCostMicrousd')::bigint;
  remaining_credits:=remaining_credits+coalesce((item->>'estimatedCredits')::numeric,0);
 end loop;
 item:=q->'replacementEstimate';
 if not coalesce(item->>'kind'='design' and item->>'operationKey'='voice:design'
  and item->>'provider'=o.provider and item->>'model'=o.model and item->>'pricingVersion'=e.configuration->'pricing'->>'version'
  and jsonb_typeof(item->'estimatedCostMicrousd')='number' and (item->>'estimatedCostMicrousd')::numeric>=0
  and (item->>'estimatedCostMicrousd')::numeric<=(e.configuration->'ceilings'->>'design')::numeric
  and (item->>'estimatedCredits')::integer=length(o.input->>'previewText'),false) then raise exception 'COST_ESTIMATE_UNAVAILABLE'; end if;
 auth:=public.ugc_final_effective_authorization(e.id);
 if (q->>'projectedRequests')::integer<>e.paid_requests+1+missing_count or e.paid_requests+1+missing_count>(auth->>'effectiveRequests')::integer+1
  or (auth->>'effectiveRequests')::integer+1>64 then raise exception 'FINAL_BUDGET_INSUFFICIENT'; end if;
 if sunk+(item->>'estimatedCostMicrousd')::bigint+remaining_cost is distinct from (q->>'projectedTotalCostMicrousd')::bigint
  or sunk+(item->>'estimatedCostMicrousd')::bigint+remaining_cost>(auth->>'effectiveCostMicrousd')::bigint+(q->>'additionalCostMicrousd')::bigint
  or (auth->>'effectiveCostMicrousd')::bigint+(q->>'additionalCostMicrousd')::bigint>1000000000 then raise exception 'FINAL_BUDGET_INSUFFICIENT'; end if;
 allowance:=e.configuration->'pricing'->'elevenLabsIncludedCredits';
 if allowance is not null and allowance<>'null'::jsonb then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ugc-elevenlabs-included:'||(allowance->>'allowanceId'),0));
  select coalesce(sum(greatest((x.input->'costEstimate'->>'estimatedCredits')::numeric,coalesce((x.receipt->'usage'->>'actualCredits')::numeric,0))),0)
   into credits from public.ugc_final_operations x where x.input->'costEstimate'->>'includedCreditAllowanceId'=allowance->>'allowanceId';
  if ceil(credits) is distinct from (q->>'sharedReservedCredits')::numeric then raise exception 'FINAL_RETRY_QUOTE_CHANGED'; end if;
  if credits+(item->>'estimatedCredits')::numeric+remaining_credits>(allowance->>'remainingCredits')::numeric then raise exception 'ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED'; end if;
 end if;
 insert into public.ugc_final_authorization_amendments(id,execution_id,owner_user_id,project_id,original_authorization_id,original_configuration_hash,
  package_hash,profile_id,failed_operation_id,stage,reason,additional_requests,additional_cost_microusd,operator_user_id,operator_approved,
  configuration_corrected,reviewed_http_status,quote,quote_hash) values((p_payload->>'amendmentId')::uuid,e.id,p_owner,e.project_id,
  (e.configuration->>'authorizationId')::uuid,e.configuration_hash,e.package_hash,e.profile->>'id',o.id,'voice_design','provider_permission_corrected',1,
  (q->>'additionalCostMicrousd')::bigint,p_owner,true,true,403,q,p_payload->>'quoteHash');
 update public.ugc_final_executions set state='queued',dispatch_mode='retry',error_code=null,version=version+1 where id=e.id returning * into e;
 return e;
end $$;

create or replace function public.ugc_final_checkpoint(p_execution uuid,p_token uuid,p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.ugc_final_executions; o public.ugc_final_operations; s public.ugc_final_scenes; cost bigint; created boolean:=false; provider_cfg jsonb; allowance jsonb; reserved_credits numeric; credit_limit bigint; credit_quantity bigint; auth jsonb; amendment public.ugc_final_authorization_amendments;
 previous public.ugc_final_operations; physical_key text; next_attempt integer:=1; new_fingerprint text; begin
 select * into e from public.ugc_final_executions where id=p_execution for update;
 if e.id is null or e.state<>'running' or e.claim_token is distinct from p_token or e.lease_expires_at<=clock_timestamp() then return null; end if;
 if p_operation='intent' then
  auth:=public.ugc_final_effective_authorization(e.id);
  physical_key:=p_payload->>'key';new_fingerprint:=p_payload->>'fingerprint';
  select * into o from public.ugc_final_operations where execution_id=e.id and coalesce(logical_key,operation_key)=physical_key order by attempt desc limit 1 for update;
  if o.id is not null and o.state='failed' and o.kind='design' then
   select * into amendment from public.ugc_final_authorization_amendments a where a.execution_id=e.id and a.failed_operation_id=o.id
    and a.original_configuration_hash=e.configuration_hash and a.package_hash=e.package_hash
    and not exists(select 1 from public.ugc_final_operations x where x.amendment_id=a.id);
   if amendment.id is not null then
    if e.dispatch_mode='recover' then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST');end if;
    if e.dispatch_mode not in ('retry','resume') then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_RETRY_NOT_ELIGIBLE');end if;
    previous:=o;next_attempt:=o.attempt+1;physical_key:=(p_payload->>'key')||':attempt:'||next_attempt;
    if p_payload->'input' is distinct from previous.input-'costEstimate' then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_RETRY_INPUT_CHANGED');end if;
    new_fingerprint:=public.ugc_package_digest('sceenyk-final-retry-operation',jsonb_build_object('originalFingerprint',o.fingerprint,
     'originalOperationId',o.id,'amendmentId',amendment.id,'attempt',next_attempt,'configurationHash',e.configuration_hash,'packageHash',e.package_hash,'input',p_payload->'input'));
    o:=null;
   end if;
  end if;
  if o.id is null then
   if p_payload->>'kind'<>'composition' and e.dispatch_mode='recover' then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST');end if;
   if p_payload->>'kind'<>'composition' and not exists(select 1 from public.ugc_final_planned_keys_073(e.id) k where k.operation_key=p_payload->>'key' and k.kind=p_payload->>'kind')
    then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_OPERATION_SCOPE');end if;
   if p_payload->>'kind'<>'composition' and next_attempt=1 and (select count(*) from public.ugc_final_operations where execution_id=e.id and kind<>'composition' and attempt=1)>=(e.configuration->>'maxRequests')::integer
    then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_BUDGET_EXHAUSTED');end if;
   if not public.ugc_final_current(e.id) then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_PACKAGE_CHANGED'); end if;
   if p_payload->>'fingerprint' !~ '^[a-f0-9]{64}$' then return null; end if;
   if p_payload->>'sceneId' is not null and not exists(select 1 from public.ugc_final_scenes where execution_id=e.id and scene_id=p_payload->>'sceneId') then return null; end if;
   cost:=0;
   if p_payload->>'kind'<>'composition' then
    -- Service-only caller supplies request-derived pricing evidence, never a
    -- spending ceiling. Persist it with the immutable operation intent.
    provider_cfg:=p_payload->'costEstimate';
    if not coalesce(e.configuration->'pricing'->>'valid'='true'
     and e.configuration->'pricing'->>'version'='provider-pricing-2026-10-28-v2'
     and provider_cfg->>'pricingVersion'=e.configuration->'pricing'->>'version'
     and provider_cfg->>'source' in ('verified_provider_pricing','configured_provider_pricing','configured_included_credits')
     and jsonb_typeof(provider_cfg->'estimatedCostMicrousd')='number'
     and jsonb_typeof(provider_cfg->'rateMicrousd')='number'
     and jsonb_typeof(provider_cfg->'billableQuantity')='number'
     and provider_cfg->>'provider'=p_payload->>'provider' and provider_cfg->>'model'=p_payload->>'model'
     and provider_cfg->>'kind'=p_payload->>'kind' and provider_cfg->>'operationKey'=p_payload->>'key',false)
     then return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE'); end if;
    if (provider_cfg->>'rateMicrousd')::numeric<0 or (provider_cfg->>'billableQuantity')::numeric<0
     or (provider_cfg->>'estimatedCostMicrousd')::numeric<>ceil((provider_cfg->>'rateMicrousd')::numeric*(provider_cfg->>'billableQuantity')::numeric)
     or (provider_cfg->>'estimatedCostMicrousd')::numeric not between 0 and 1000000000
     or ((provider_cfg->>'estimatedCostMicrousd')::numeric=0 and p_payload->>'kind'<>'binding' and provider_cfg->>'source'<>'configured_included_credits')
     then return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE'); end if;
    if p_payload->>'provider'='elevenlabs' then
     if not coalesce(jsonb_typeof(provider_cfg->'estimatedCredits')='number'
      and (provider_cfg->>'estimatedCredits')::numeric between 0 and 1000000000
      and (provider_cfg->>'estimatedCredits')::numeric=trunc((provider_cfg->>'estimatedCredits')::numeric),false)
      then return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE'); end if;
     credit_quantity:=(provider_cfg->>'estimatedCredits')::bigint;
     if (p_payload->>'kind'='binding' and credit_quantity<>0)
      or (p_payload->>'kind' in ('voice','design') and (credit_quantity<=0 or credit_quantity::numeric<>(provider_cfg->>'billableQuantity')::numeric))
      then return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE'); end if;
     allowance:=e.configuration->'pricing'->'elevenLabsIncludedCredits';
     if allowance is not null and allowance<>'null'::jsonb then
      if not coalesce(allowance->>'allowanceId'~'^[a-fA-F0-9-]{36}$'
       and jsonb_typeof(allowance->'remainingCredits')='number'
       and (allowance->>'remainingCredits')::numeric between 0 and 1000000000
       and (allowance->>'remainingCredits')::numeric=trunc((allowance->>'remainingCredits')::numeric),false)
       then return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE'); end if;
      credit_limit:=(allowance->>'remainingCredits')::bigint;
      if p_payload->>'kind'<>'binding' and not coalesce(provider_cfg->>'source'='configured_included_credits'
       and provider_cfg->>'includedCreditAllowanceId'=allowance->>'allowanceId'
       and (provider_cfg->>'includedCreditLimit')::numeric=credit_limit
       and (provider_cfg->>'rateMicrousd')::numeric=0,false)
       then return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE'); end if;
      -- Serialize all runs sharing this account allowance snapshot. Existing
      -- intents bypass this branch on recovery; unknown/failed intents stay held.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ugc-elevenlabs-included:'||(allowance->>'allowanceId'),0));
      if exists(select 1 from public.ugc_final_operations reserved
       where reserved.input->'costEstimate'->>'includedCreditAllowanceId'=allowance->>'allowanceId'
        and (reserved.input->'costEstimate'->>'includedCreditLimit')::numeric<>credit_limit)
       then return jsonb_build_object('execution',to_jsonb(e),'blocked','ELEVENLABS_ALLOWANCE_SNAPSHOT_CONFLICT'); end if;
      select coalesce(sum(greatest((reserved.input->'costEstimate'->>'estimatedCredits')::numeric,
       coalesce((reserved.receipt->'usage'->>'actualCredits')::numeric,0))),0) into reserved_credits
       from public.ugc_final_operations reserved
       where reserved.input->'costEstimate'->>'includedCreditAllowanceId'=allowance->>'allowanceId';
      if reserved_credits+credit_quantity>credit_limit then
       return jsonb_build_object('execution',to_jsonb(e),'blocked','ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED'); end if;
     elsif provider_cfg->>'source'='configured_included_credits' then
      return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE');
     end if;
    elsif provider_cfg->>'source'='configured_included_credits' then
     return jsonb_build_object('execution',to_jsonb(e),'blocked','COST_ESTIMATE_UNAVAILABLE');
    end if;
    cost:=(provider_cfg->>'estimatedCostMicrousd')::bigint;
    if (e.configuration->'ceilings'->>(p_payload->>'kind')) is null
     or cost>(e.configuration->'ceilings'->>(p_payload->>'kind'))::bigint
     then return jsonb_build_object('execution',to_jsonb(e),'blocked','STAGE_AUTHORIZATION_CEILING_EXCEEDED'); end if;
    if e.paid_requests >= (auth->>'effectiveRequests')::integer or greatest(e.estimated_cost_microusd,(select coalesce(sum(greatest(estimated_cost_microusd,case when jsonb_typeof(receipt->'usage'->'actualCostMicrousd')='number' then (receipt->'usage'->>'actualCostMicrousd')::bigint else 0 end)),0) from public.ugc_final_operations where execution_id=e.id and kind<>'composition'))+cost>(auth->>'effectiveCostMicrousd')::bigint then return jsonb_build_object('execution',to_jsonb(e),'blocked','FINAL_BUDGET_EXHAUSTED'); end if;
    provider_cfg:=e.configuration->'providers'->(p_payload->>'kind');
    if provider_cfg->>'id' is distinct from p_payload->>'provider' or provider_cfg->>'model' is distinct from p_payload->>'model' then return null; end if;
    update public.ugc_final_executions set paid_requests=paid_requests+1,estimated_cost_microusd=estimated_cost_microusd+cost where id=e.id;
   end if;
   insert into public.ugc_final_operations(execution_id,owner_user_id,project_id,operation_key,fingerprint,kind,scene_id,provider,model,input,estimated_cost_microusd,attempt,logical_key,supersedes_operation_id,amendment_id)
    values(e.id,e.owner_user_id,e.project_id,physical_key,new_fingerprint,p_payload->>'kind',p_payload->>'sceneId',p_payload->>'provider',p_payload->>'model',p_payload->'input'||case when p_payload->>'kind'='composition' then '{}'::jsonb else jsonb_build_object('costEstimate',p_payload->'costEstimate') end,cost,next_attempt,case when next_attempt>1 then p_payload->>'key' else null end,previous.id,amendment.id) returning * into o;
   created:=true;
  end if;
 elsif p_operation in ('receipt','output','operation_failed') then
  select * into o from public.ugc_final_operations where id=(p_payload->>'operationId')::uuid and execution_id=e.id for update;
  if o.id is null then return null; end if;
  if o.state not in ('ready','failed') then
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
 return jsonb_build_object('execution',to_jsonb(e),'operation',case when o.id is null then null else to_jsonb(o) end,'created',created,'creditAllowanceEnforced',true,'amendmentsEnforced',true,'effectiveAuthorization',public.ugc_final_effective_authorization(e.id));
end $$;

create or replace function public.ugc_final_action(p_owner uuid,p_project uuid,p_job uuid,p_action text,p_payload jsonb)
returns public.ugc_final_executions language plpgsql security definer set search_path='' as $$
declare e public.ugc_final_executions; p public.ugc_generation_packages; s jsonb; cfg jsonb; begin
 perform public.ugc_storyboard_lock(p_job);
 if not exists(select 1 from public.ugc_generation_jobs j join public.projects pr on pr.id=j.project_id
  where j.id=p_job and j.owner_user_id=p_owner and j.project_id=p_project and pr.owner_user_id=p_owner and pr.status='draft') then return null; end if;
 if p_action='generate' then
  select * into p from public.ugc_generation_packages where id=(p_payload->>'packageId')::uuid and job_id=p_job and owner_user_id=p_owner and project_id=p_project for update;
  cfg:=p_payload->'configuration';
  if p.id is null or p.state<>'approved' or p.stale_at is not null or public.ugc_package_input(p_job) is distinct from p.input
   or not public.ugc_package_valid(p.document,p.input,p.revision,p.input_fingerprint) then return null; end if;
  if not coalesce(jsonb_typeof(cfg)='object' and cfg->>'funding'='operator_funded' and cfg->>'version'='ugc-final-v1'
   and cfg ?& array['maxRequests','maxEstimatedCostMicrousd','ceilings','providers','authorizationId','language','output']
   and (cfg->>'maxRequests')::integer between 1 and 64 and (cfg->>'maxEstimatedCostMicrousd')::bigint between 1 and 1000000000
   and p_payload->>'acceptedCost'='true' and public.ugc_package_digest('sceenyk-final-config',cfg)=p_payload->>'configurationHash',false) then return null; end if;
  select * into e from public.ugc_final_executions where package_id=p.id and configuration_hash=p_payload->>'configurationHash' for update;
  if e.id is not null then
   if e.state='deleted' then
    update public.ugc_final_executions set state='queued',phase='queued',dispatch_mode='initial',revision=revision+1,version=version+1,
     final_asset=null,final_fingerprint=null,error_code=null where id=e.id returning * into e;
   end if;
   return e;
  end if;
  if exists(select 1 from public.ugc_final_executions where job_id=p_job and state not in ('deleted','approved')) then return null; end if;
  insert into public.ugc_final_executions(owner_user_id,project_id,job_id,package_id,package_hash,package_version,request_id,
   configuration,configuration_hash,profile) values(p_owner,p_project,p_job,p.id,p.package_hash,p.revision,(p_payload->>'requestId')::uuid,
    cfg,p_payload->>'configurationHash',nullif(p_payload->'profile','null')) returning * into e;
  for s in select value from jsonb_array_elements(p.document->'scenes') loop
   insert into public.ugc_final_scenes(execution_id,scene_id,scene_number,scene_hash) values(e.id,s->>'id',(s->>'number')::integer,public.ugc_package_digest('sceenyk-final-scene',s));
  end loop;
  return e;
 end if;
 select * into e from public.ugc_final_executions where id=(p_payload->>'executionId')::uuid and owner_user_id=p_owner and project_id=p_project and job_id=p_job for update;
 if e.id is null then return null; end if;
 if p_action='approve' and e.state='approved' then return e; end if;
 if e.version is distinct from (p_payload->>'version')::integer or e.claim_token is not null then return null; end if;
 if p_action='approve' and e.state='review' and public.ugc_final_result_valid(e.id,e.final_asset,e.final_fingerprint) then
  update public.ugc_final_executions set state='approved',phase='approved',approved_at=clock_timestamp(),version=version+1 where id=e.id returning * into e;
  update public.ugc_generation_jobs set status='completed',stage='complete',resume_stage='finalizing',completed_at=clock_timestamp(),
   failed_at=null,cancelled_at=null,error_code=null,safe_error_message=null,pause_reason=null,retry_eligible=false,next_retry_at=null,
   worker_id=null,claim_token=null,claimed_at=null,lease_expires_at=null,heartbeat_at=null
   where id=e.job_id and status not in ('completed','cancelled');
 elsif p_action='reject' and e.state='review' then
  update public.ugc_final_executions set state='deleting',phase='deleting',version=version+1 where id=e.id returning * into e;
 elsif p_action='recover' and e.state in ('failed','reconciling') and coalesce(e.error_code,'') not in ('FINAL_PROVIDER_REJECTED','FINAL_PROVIDER_RATE_LIMIT') then
  update public.ugc_final_executions set state=case when phase='deleting' then 'deleting' else 'queued' end,dispatch_mode='recover',error_code=null,version=version+1 where id=e.id returning * into e;
 elsif p_action='resume' and e.state='failed' and e.error_code='FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST' and p_payload->>'acceptedCost'='true' and public.ugc_final_current(e.id) then
  update public.ugc_final_executions set state='queued',dispatch_mode='resume',error_code=null,version=version+1 where id=e.id returning * into e;
 else return null; end if;
 return e;
end $$;

revoke all on function public.ugc_final_operation_guard_073(),public.ugc_final_planned_keys_073(uuid),public.ugc_final_effective_authorization(uuid),public.ugc_final_retry_stage(uuid,uuid,jsonb),public.ugc_final_checkpoint(uuid,uuid,text,jsonb),public.ugc_final_action(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ugc_final_effective_authorization(uuid),public.ugc_final_retry_stage(uuid,uuid,jsonb),public.ugc_final_checkpoint(uuid,uuid,text,jsonb),public.ugc_final_action(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
