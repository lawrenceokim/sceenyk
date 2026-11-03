-- Fix the local snapshot's decimal-rate representation only. No row mutation,
-- repricing, table/trigger change, financial authority or provider operation.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_local_quote_guard()') is null then raise exception 'Apply 086 first'; end if;
 for t,c in select * from (values
  ('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','document'),('ugc_v3_packages','package_hash'),
  ('ugc_v3_quotes','package_id'),('ugc_v3_quotes','project_id'),('ugc_v3_quotes','document')) v(t,c) loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c)
   then raise exception 'Verify pricing precision prerequisite %.%',t,c; end if;
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
   -- Match TypeScript's frozen four-place truncation for saved envelopes, or
   -- round the configured 4..10-place decimal to the existing micro-USD rate.
   -- CASE prevents missing/malformed decimals from bypassing validation or casts.
   or (case when s->>'estimatedUsdPerSecond' is null or s->>'estimatedUsdPerSecond' !~ '^[0-9]+\.[0-9]{4,10}$' then true
      else s->>'estimatedUsdPerSecond' is distinct from to_char(trunc(rate::numeric/1000000,4),'FM999999999990.0000')
       and round((s->>'estimatedUsdPerSecond')::numeric*1000000) is distinct from rate::numeric end)
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
-- CREATE OR REPLACE retains the existing trigger identity and execute grants.
commit;
