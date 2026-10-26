-- Read-only: run in Supabase SQL Editor and return the single JSON result.
-- No workflow RPC, provider, job claim, DDL, DML or asset operation.
select jsonb_build_object(
 'functions',coalesce((select jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
  'body',p.prosrc,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'config',p.proconfig,
  'acl',p.proacl,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
  'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
   'ugc_location_checkpoint_pre_auto','ugc_location_checkpoint','ugc_location_action_pre_auto','ugc_location_action',
   'ugc_location_claim','ugc_location_audit','ugc_location_action_pre_delete','ugc_location_checkpoint_pre_recovery',
   'ugc_location_recovery_claim','ugc_location_cleanup_claim')),'[]'::jsonb),
 'location_columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type) order by table_name,ordinal_position)
  from information_schema.columns where table_schema='public' and table_name in ('ugc_locations','ugc_location_candidates','ugc_location_events')),
 'constraints',(select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) order by c.conrelid,c.conname)
  from pg_constraint c where c.conrelid in ('public.ugc_locations'::regclass,'public.ugc_location_candidates'::regclass,'public.ugc_location_events'::regclass)),
 'table_access',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,
   'anon_read',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_read',has_table_privilege('authenticated',c.oid,'SELECT'),
   'service_read',has_table_privilege('service_role',c.oid,'SELECT'),'service_update',has_table_privilege('service_role',c.oid,'UPDATE')) order by c.relname)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('ugc_locations','ugc_location_candidates','ugc_location_events')),
 'counts',jsonb_build_object('locations',(select count(*) from public.ugc_locations),
  'candidates',(select count(*) from public.ugc_location_candidates),'projects',(select count(*) from public.projects),
  'generation_jobs',(select count(*) from public.ugc_generation_jobs),'character_sheets',(select count(*) from public.ugc_character_sheets),
  'product_sheets',(select count(*) from public.ugc_product_sheets)),
 'location_records',(select jsonb_agg(jsonb_build_object('id',id,'job',job_id,'revision',revision,'version',version,'state',state,'candidate',candidate_id,'approved',approved_at) order by created_at)
  from public.ugc_locations)
) as location_065_catalog;
