-- Optional manual catalog verification in the Supabase SQL editor. SELECTs only.
-- Does not claim, resume, update or read images/provider URLs/credentials.
select c.relname as relation, c.relrowsecurity as rls_enabled,
  has_table_privilege('service_role',c.oid,'SELECT') as service_can_read,
  has_table_privilege('service_role',c.oid,'UPDATE') as service_can_update
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('ugc_product_sheets','ugc_reference_reviews','ugc_reference_regeneration_requests');

select tablename,indexname,indexdef from pg_indexes where schemaname='public'
  and tablename in ('ugc_product_sheets','ugc_reference_reviews','ugc_reference_regeneration_requests') order by tablename,indexname;

select c.relname as relation,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid
where not t.tgisinternal and c.oid in ('public.ugc_reference_reviews'::regclass,'public.ugc_reference_regeneration_requests'::regclass)
order by c.relname,t.tgname;

select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.prorettype::regtype as returns,
  p.prosecdef as security_definer,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
  ('ugc_prepare_product_sheet','ugc_approve_reference','ugc_request_reference_regeneration','ugc_claim_reference_regeneration',
   'ugc_claim_reference_regeneration_m66','ugc_update_reference_regeneration','ugc_resume_reference_regeneration','ugc_guard_reference_review',
   'ugc_guard_regeneration_request','ugc_reference_claim_gate','ugc_regeneration_diagnostic_valid') order by p.proname;

select table_name,column_name,data_type from information_schema.columns where table_schema='public'
  and table_name in ('ugc_product_sheets','ugc_reference_reviews','ugc_reference_regeneration_requests') order by table_name,ordinal_position;
