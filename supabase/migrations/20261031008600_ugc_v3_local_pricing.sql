-- Local approximate V3 pricing. Existing immutable packages/remote quotes remain historical.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_package_commit(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is null then raise exception 'Apply 085 first'; end if;
 for t,c in select * from (values
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),('projects','id'),('projects','deleted_at'),
 ('ugc_v3_sources','project_id'),('ugc_v3_sources','revision'),('ugc_v3_sources','input'),
 ('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','version'),('ugc_v3_packages','source_revision'),('ugc_v3_packages','document'),('ugc_v3_packages','package_hash'),
 ('ugc_v3_quotes','id'),('ugc_v3_quotes','project_id'),('ugc_v3_quotes','package_id'),('ugc_v3_quotes','document'),
 ('ugc_v3_run_authorizations','package_id'),('ugc_v3_run_authorizations','quote_id'),('ugc_v3_run_authorizations','document'),('ugc_v3_runs','package_id'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','status'),('ugc_v3_tasks','request_key'),('ugc_v3_tasks','created_at'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','error_code'),('ugc_v3_tasks','provider_started'),
 ('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify local pricing prerequisite %.%',t,c; end if;
 end loop;
end $$;

create or replace function public.ugc_v3_local_quote_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.ugc_v3_packages; seg jsonb; plan jsonb; s jsonb; total bigint:=0; rate bigint; cost bigint; ms integer; begin
 if new.document->>'pricingSource' is distinct from 'manual_provider_estimate' then return new; end if;
 select * into p from public.ugc_v3_packages where id=new.package_id and project_id=new.project_id;
 if p.id is null or p.document->'pricing'->>'source' is distinct from 'manual_provider_estimate'
  or p.document->'pricing'->>'status' is distinct from 'estimated' or p.document->'pricing'->'expiresAt' is distinct from 'null'::jsonb
  or new.document->'expiresAt' is distinct from 'null'::jsonb or new.document->>'deliveryExpiresAt' is null
  or new.document->>'packageHash' is distinct from p.package_hash or new.document->>'projectId' is distinct from new.project_id::text
  or jsonb_array_length(new.document->'segments') is distinct from jsonb_array_length(p.document->'segments') then raise exception 'V3_LOCAL_PRICING_SNAPSHOT_INVALID'; end if;
 for plan in select value from jsonb_array_elements(p.document->'segments') loop
  s:=plan->'estimate'->'pricing';
  select value into seg from jsonb_array_elements(new.document->'segments') where value->>'segmentId'=plan->>'id';
  rate:=(s->>'rateMicrousdPerSecond')::bigint;ms:=(s->>'durationMs')::integer;cost:=(s->>'estimatedCostMicrousd')::bigint;
  if seg is null or s is null or rate is null or cost is null or ms is null or rate<=0 or cost<0 or ms not between 4000 and 30000 or ms%1000<>0
   or cost<>ms/1000*rate or s->>'provider' is distinct from 'higgsfield'
   or s->>'mode' is distinct from (p.document->'source'->>'mode')||'-to-video'
   or s->>'pricingSource' is distinct from 'manual_provider_estimate' or plan->'estimate'->>'source' is distinct from 'manual_provider_estimate'
   or s->>'pricingVersion' is distinct from p.document->'pricing'->>'pricingVersion'
   or s->>'configurationDate' is distinct from p.document->'pricing'->>'configurationDate'
   or s->>'estimatedUsdPerSecond' is distinct from to_char(rate::numeric/1000000,'FM999999999990.0000')
   or s->>'estimatedUsd' is distinct from to_char(cost::numeric/1000000,'FM999999999990.000000')
   or s->>'durationMs' is distinct from plan->>'durationMs' or s->>'model' is distinct from seg->>'model'
   or seg->>'fingerprint' is distinct from plan->>'fingerprint' or seg->>'estimatedCostMicrousd' is distinct from cost::text
   or plan->'estimate'->>'estimatedCostMicrousd' is distinct from cost::text
   or plan->'estimate'->>'evidenceHash' is distinct from public.ugc_package_digest('sceenyk-v3-manual-pricing',s)
   or seg->>'estimateResponseHash' is distinct from plan->'estimate'->>'evidenceHash'
   or seg->>'bodyHash' is distinct from encode(sha256(convert_to(public.ugc_package_canonical(seg->'body'),'UTF8')),'hex')
   then raise exception 'V3_LOCAL_PRICING_SNAPSHOT_INVALID'; end if;
  total:=total+cost;
 end loop;
 if total::text is distinct from p.document->'pricing'->>'totalMicrousd' or total::text is distinct from new.document->>'totalMicrousd'
  or (select count(distinct x->>'segmentUuid') from jsonb_array_elements(new.document->'segments') x)<>jsonb_array_length(p.document->'segments')
  then raise exception 'V3_LOCAL_PRICING_SNAPSHOT_INVALID'; end if;
 return new;
end $$;
drop trigger if exists ugc_v3_local_quote on public.ugc_v3_quotes;
create trigger ugc_v3_local_quote before insert on public.ugc_v3_quotes for each row execute function public.ugc_v3_local_quote_guard();

create or replace function public.ugc_v3_local_authorization_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.ugc_v3_quotes; begin
 select * into q from public.ugc_v3_quotes where id=new.quote_id and package_id=new.package_id;
 if q.document->>'pricingSource'='manual_provider_estimate' and
  ((new.document->>'expiresAt')::timestamptz is null or (new.document->>'approvedAt')::timestamptz is null
   or (new.document->>'expiresAt')::timestamptz>(new.document->>'approvedAt')::timestamptz+interval '24 hours') then raise exception 'V3_AUTHORIZATION_INVALID'; end if;
 return new;
end $$;
drop trigger if exists ugc_v3_local_authorization on public.ugc_v3_run_authorizations;
create trigger ugc_v3_local_authorization before insert on public.ugc_v3_run_authorizations for each row execute function public.ugc_v3_local_authorization_guard();

create or replace function public.ugc_v3_local_package_begin(p_owner uuid,p_project uuid,p_input jsonb,p_bindings jsonb,p_retry_task uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.ugc_v3_packages; t public.ugc_v3_tasks; next_id uuid:=gen_random_uuid(); n integer; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 select * into p from public.ugc_v3_packages where project_id=p_project order by version desc limit 1;
 select * into t from public.ugc_v3_tasks where project_id=p_project and kind='package' order by created_at desc,id desc limit 1;
 if p.id is not null and public.ugc_v3_runtime_current(p.id) and ((p.document->'source')-'package')=(p_input-'package')
  and p.document->'pricing'->>'source' is distinct from 'manual_provider_estimate' and t.status='done' then
  select coalesce(max(version),0)+1 into n from public.ugc_v3_packages where project_id=p_project;
  insert into public.ugc_v3_tasks(project_id,kind,request_key,input) values(p_project,'package','local-pricing:'||p.id,
   jsonb_build_object('packageId',next_id,'packageVersion',n,'sourceRevision',p.source_revision,'replacesPackageId',p.id))
   on conflict(project_id,request_key) do nothing;
  select id into next_id from public.ugc_v3_tasks where project_id=p_project and request_key='local-pricing:'||p.id;
  return next_id;
 end if;
 if p.id is not null and public.ugc_v3_runtime_current(p.id) and ((p.document->'source')-'package')=(p_input-'package')
  and p.document->'pricing'->>'source'='manual_provider_estimate' then
  select * into t from public.ugc_v3_tasks where project_id=p_project and kind='package' and input->>'packageId'=p.id::text order by created_at desc limit 1;
  if t.status='done' and exists(select 1 from public.ugc_v3_quotes where package_id=p.id and document->>'pricingSource'='manual_provider_estimate') then return t.id; end if;
 end if;
 return public.ugc_v3_package_begin(p_owner,p_project,p_input,p_bindings,p_retry_task);
end $$;

-- A targeted provider-free claim for an immutable pricing successor. No creative regeneration/task discovery.
create or replace function public.ugc_v3_local_price_repair(p_owner uuid,p_project uuid,p_package uuid,p_pricing_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.ugc_v3_packages; t public.ugc_v3_tasks; replacement uuid:=gen_random_uuid(); n integer; key text; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found or p_pricing_version !~ '^[a-z0-9-]{1,100}$' then raise exception 'V3_LOCAL_PRICING_REPAIR_INVALID'; end if;
 select * into p from public.ugc_v3_packages where id=p_package and project_id=p_project;
 if p.id is null then raise exception 'PACKAGE_STALE'; end if;
 key:='local-price-repair:'||p.id||':'||p_pricing_version;
 select * into t from public.ugc_v3_tasks where project_id=p_project and request_key=key for update;
 if t.status='done' then return to_jsonb(t); end if;
 if not public.ugc_v3_runtime_current(p.id) then raise exception 'PACKAGE_STALE'; end if;
 if exists(select 1 from public.ugc_v3_runs where package_id=p.id) or exists(select 1 from public.ugc_v3_run_authorizations where package_id=p.id)
  then raise exception 'V3_AUTHORIZED_PACKAGE_PRESERVED'; end if;
 if exists(select 1 from public.ugc_v3_tasks where project_id=p_project and status in ('queued','running','reconciliation_required') and id is distinct from t.id)
  then raise exception 'V3_PACKAGE_BUILD_IN_PROGRESS'; end if;
 if t.id is null then
  select coalesce(max(version),0)+1 into n from public.ugc_v3_packages where project_id=p_project;
  insert into public.ugc_v3_tasks(project_id,kind,request_key,input) values(p_project,'package',key,jsonb_build_object('packageId',replacement,'packageVersion',n,'sourceRevision',p.source_revision)) returning * into t;
  insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,p.id,'local_pricing_repair',jsonb_build_object('replacementPackageId',replacement,'taskId',t.id,'pricingVersion',p_pricing_version));
 elsif t.lease_until>now() then raise exception 'V3_PACKAGE_BUILD_IN_PROGRESS'; end if;
 update public.ugc_v3_tasks set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes',error_code=null where id=t.id returning * into t;
 return to_jsonb(t);
end $$;
revoke all on function public.ugc_v3_local_quote_guard(),public.ugc_v3_local_authorization_guard(),public.ugc_v3_local_package_begin(uuid,uuid,jsonb,jsonb,uuid),public.ugc_v3_local_price_repair(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_local_package_begin(uuid,uuid,jsonb,jsonb,uuid),public.ugc_v3_local_price_repair(uuid,uuid,uuid,text) to service_role;
commit;
