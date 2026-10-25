-- Optional SQL-editor verification before/after manual 055. SELECTs only.
-- No job mutation, worker/provider calls, credentials, images or signed URLs.
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
 and table_name in ('ugc_character_v5_workflows','ugc_character_v5_candidates','ugc_character_asset_purges','ugc_generation_jobs')
 and (table_name<>'ugc_generation_jobs' or column_name in ('id','owner_user_id','project_id','retry_eligible','retryable'))
order by table_name,ordinal_position;

select c.relname as relation,k.conname,k.contype,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('ugc_character_v5_workflows','ugc_character_v5_candidates','ugc_character_asset_purges')
order by c.relname,k.conname;
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
 and tablename in ('ugc_character_v5_workflows','ugc_character_v5_candidates','ugc_character_asset_purges') order by tablename,indexname;

select c.relname,c.relrowsecurity,has_table_privilege('service_role',c.oid,'SELECT') as service_read,
 has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE') as service_direct_write,
 has_table_privilege('anon',c.oid,'SELECT') as anon_read,has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_read
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in ('ugc_character_v5_workflows','ugc_character_v5_candidates','ugc_character_asset_purges');
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public'
 and tablename in ('ugc_character_v5_workflows','ugc_character_v5_candidates','ugc_character_asset_purges');

select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef as security_definer,
 p.proconfig,has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 case when p.proname in ('ugc_character_v5_start','ugc_character_v5_action') then
  position('retryable=' in p.prosrc)>0 end as contains_invalid_retryable_assignment
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ugc_character_v5_%' order by p.proname;
