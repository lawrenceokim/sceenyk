-- Read-only, owner-run Supabase SQL Editor verification AFTER manual 076 through 100 in order.
-- No jobs, claims, quotes, authorizations or provider requests are created.
with expected(name) as (values
 ('ugc_v3_projects'),('ugc_v3_sources'),('ugc_v3_packages'),('ugc_v3_authorizations'),('ugc_v3_events'),
 ('ugc_v3_tasks'),('ugc_v3_artifacts'),('ugc_v3_quotes'),('ugc_v3_run_authorizations'),('ugc_v3_runs'),('ugc_v3_runtime_events'),('ugc_v3_reference_deletions'),('ugc_v3_creative_locks'))
select e.name, c.oid is not null as installed, coalesce(c.relrowsecurity,false) as rls_enabled,
 coalesce(has_table_privilege('authenticated',c.oid,'SELECT'),false) as browser_can_read_should_be_false,
 coalesce(has_table_privilege('service_role',c.oid,'SELECT'),false) as server_can_read,
 coalesce(has_table_privilege('service_role',c.oid,'INSERT'),false) as direct_insert_should_be_false
from expected e left join pg_class c on c.oid=to_regclass('public.'||e.name) order by e.name;

with expected(signature) as (values
 ('public.ugc_v3_clip_lock_setup()'),('public.ugc_v3_recover_clip_lock(uuid,uuid)'),
 ('public.ugc_v3_clip_retryable(uuid,uuid,uuid)'),('public.ugc_v3_clip_setup()'),('public.ugc_v3_clip_authorize(uuid,uuid,jsonb,uuid)'),('public.ugc_v3_clip_manifest(uuid,uuid,uuid)'),
 ('public.ugc_v3_create_project(uuid,uuid,jsonb)'),('public.ugc_v3_read(uuid,uuid)'),('public.ugc_v3_write(uuid,uuid,text,jsonb)'),
 ('public.ugc_v3_runtime_read(uuid,uuid)'),('public.ugc_v3_runtime_action(uuid,uuid,text,jsonb)'),
 ('public.ugc_v3_local_package_begin(uuid,uuid,jsonb,jsonb,uuid)'),('public.ugc_v3_local_price_repair(uuid,uuid,uuid,text)'),
 ('public.ugc_v3_package_begin(uuid,uuid,jsonb,jsonb,uuid)'),('public.ugc_v3_package_checkpoint(uuid,uuid,jsonb,boolean)'),
 ('public.ugc_v3_package_commit(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'),('public.ugc_v3_reconcile_reference_cleanup(uuid,uuid)'),
 ('public.ugc_v3_regenerate_approved_reference(uuid,uuid,uuid,integer,jsonb)'),
 ('public.ugc_v3_location_action(uuid,uuid,text,jsonb)'),('public.ugc_v3_location_checkpoint(uuid,uuid,text,jsonb)'),('public.ugc_v3_location_input_current(uuid,jsonb)'),
 ('public.ugc_v3_discard_reference_prepare(uuid,uuid,uuid,integer,boolean)'),('public.ugc_v3_discard_reference_finish(uuid,uuid,uuid,uuid,text)'),('public.ugc_v3_queue_reference_cleanup(uuid,uuid,boolean)'),
 ('public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb)'),('public.ugc_v3_reference_delete_finish(uuid,uuid,uuid,uuid,text)'),
 ('public.ugc_v3_recover_reference_task(uuid,uuid,uuid)'),('public.ugc_v3_replace_unusable_reference_task(uuid,uuid,uuid,jsonb)'),('public.ugc_v3_record_reference_diagnostic(uuid,uuid,jsonb)'),
 ('public.ugc_v3_regenerate_reference(uuid,uuid,jsonb)'),('public.ugc_v3_retire_reference_task(uuid,uuid,uuid)'),('public.ugc_v3_generation_context(uuid)'),('public.ugc_v3_artifact_current(uuid)'),('public.ugc_v3_runtime_current(uuid)'),
 ('public.ugc_v3_merge_setup()'),('public.ugc_v3_merge_begin(uuid,uuid,uuid,text,text)'),('public.ugc_v3_merge_manifest(uuid,uuid,uuid)'),('public.ugc_v3_merge_stage(uuid,uuid,text)'),
 ('public.ugc_v3_task_claim(uuid)'),('public.ugc_v3_task_checkpoint(uuid,uuid,text,jsonb)'))
select e.signature,p.oid is not null as installed,p.prosecdef as security_definer,p.proconfig,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as browser_execute_should_be_false,
 coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false) as server_execute
from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature) order by e.signature;

select conrelid::regclass as relation,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in (to_regclass('public.ugc_v3_runs'),to_regclass('public.ugc_v3_run_authorizations'),to_regclass('public.ugc_v3_tasks'))
 and contype in ('p','u','f') order by conrelid::regclass::text,conname;

select tgrelid::regclass as relation,tgname,pg_get_triggerdef(oid) as definition
from pg_trigger where not tgisinternal and tgname in ('ugc_v3_isolation','ugc_v3_studio_approval','ugc_v3_studio_source','ugc_v3_studio_intent',
 'z_v3_connected_story_task','z_v3_connected_story_artifact','z_v3_connected_story_source','z_v3_connected_story_run','z_v3_connected_story_package','z_v3_clip_authority','z_v3_clip_review_manifest','z_v3_merge_task','z_v3_merge_artifact',
 'ugc_v3_reference_cleanup_approval','ugc_v3_reference_cleanup_version','ugc_v3_reference_cleanup_intent','ugc_v3_reference_cleanup_enqueue',
 'ugc_v3_location_artifact_validation','ugc_v3_location_storyboard_binding','ugc_v3_location_source_binding','ugc_v3_location_video_binding',
 'ugc_v3_location_version_floor','ugc_v3_reference_retention','ugc_v3_simple_location_intent','ugc_v3_preserve_approved_reference','ugc_v3_local_quote','ugc_v3_local_authorization') order by tgrelid;

select indexname,indexdef from pg_indexes where schemaname='public' and indexname in ('ugc_v3_reference_deletion_pending','ugc_v3_runs_active_segment');

-- Lock rows are private evidence. needs_review is actionable; never repair it
-- by inventing approval timestamps or changing accepted package/media data.
select state,origin,count(*) from public.ugc_v3_creative_locks group by state,origin;
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_v3_creative_locks'
 and column_name='snapshot_hash' and is_generated='ALWAYS') as lock_generated_hash,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.ugc_v3_creative_locks') and tgname='ugc_v3_lock_immutable' and tgenabled='O') as lock_immutable,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.ugc_v3_runs') and tgname='a_v3_first_clip_lock' and tgenabled='O') as first_clip_capture,
 (select count(*)=11 from pg_trigger where tgname='a_v3_creative_lock' and tgenabled='O' and not tgisinternal) as creative_fences;

-- Every count below must be zero. These are observational queries, never repairs.
-- M5/M6 installed-body audit: all flags should be true. Setup-marker RPCs alone
-- cannot establish installed trigger bodies/grants through PostgREST.
select
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.ugc_v3_run_authorizations') and tgname='z_v3_clip_authority' and tgenabled='O'
  and tgfoid=to_regprocedure('public.ugc_v3_clip_authority_guard()')) as m5_authority_guard,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.ugc_v3_runs') and tgname='z_v3_clip_review_manifest' and tgenabled='O'
  and tgfoid=to_regprocedure('public.ugc_v3_clip_review_manifest()')) as m5_manifest_guard,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.ugc_v3_tasks') and tgname='z_v3_merge_task' and tgenabled='O'
  and tgfoid=to_regprocedure('public.ugc_v3_merge_task_guard()')) as m6_task_guard,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.ugc_v3_artifacts') and tgname='z_v3_merge_artifact' and tgenabled='O'
  and tgfoid=to_regprocedure('public.ugc_v3_merge_artifact_guard()')) as m6_output_guard,
 exists(select 1 from pg_proc where oid=to_regprocedure('public.ugc_v3_connected_story_guard()')
  and strpos(prosrc,'V3_CLIP_MERGE_NOT_IMPLEMENTED')=0 and strpos(prosrc,'manifestHash')>0 and strpos(prosrc,'ugc_v3_clip_package_valid')>0) as m6_join_admission,
 exists(select 1 from pg_proc where oid=to_regprocedure('public.ugc_v3_approve_video(uuid,uuid,uuid)')
  and strpos(prosrc,'ugc_v3_merge_document_valid')>0) as m6_final_approval;

select (select count(*) from public.ugc_v3_projects v join public.ugc_final_executions f on f.project_id=v.project_id) as legacy_final_attachments,
 (select count(*) from public.ugc_v3_projects v join public.ugc_generation_jobs j on j.project_id=v.project_id) as legacy_ugc_jobs,
 (select count(*) from public.ugc_v3_projects v join public.generation_jobs j on j.project_id=v.project_id) as legacy_general_jobs;

-- Stage 2 (102): read-only catalog inspection. Run after 101/102 and deploy
-- matching app/workers; these reads never create holds, jobs or provider work.
select to_regclass('public.generation_free_runs') as free_run_holds,
       to_regclass('public.generation_free_preparations') as free_preparation_budget;
select to_regprocedure('public.generation_free_access(uuid)') as access_rpc,
       to_regprocedure('public.generation_free_submit(uuid,uuid,uuid)') as admission_rpc,
       to_regprocedure('public.generation_free_transport(uuid,uuid,text)') as transport_rpc;
select c.relname,c.relrowsecurity,t.tgname,t.tgenabled
from pg_class c left join pg_trigger t on t.tgrelid=c.oid and not t.tgisinternal
where c.oid in (to_regclass('public.generation_free_runs'),to_regclass('public.generation_free_preparations'))
   or t.tgname like 'z_generation_free_%'
order by c.relname,t.tgname;
select p.oid::regprocedure as function_signature,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'generation_free_%'
order by p.proname;

-- Stage 2 cleanup repair (103): usage persists after disposable tasks are deleted.
select to_regclass('public.generation_free_preparations') is not null and not exists (
  select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.conrelid=to_regclass('public.generation_free_preparations') and c.contype='f' and a.attname='task_id'
) as preparation_cleanup_compatible;
select c.conname,pg_get_constraintdef(c.oid) as definition
from pg_constraint c where c.conrelid=to_regclass('public.generation_free_preparations') order by c.conname;

-- Project-based Stage 2 (104): read-only; no initialization/queue/dispatch RPCs.
select to_regclass('public.free_ai_accounts') as project_accounts,
       to_regclass('public.free_ai_projects') as project_entitlements,
       to_regclass('public.free_ai_operations') as project_exposure,
       to_regprocedure('public.generation_project_access(uuid,uuid)') as access_rpc,
       to_regprocedure('public.free_ai_dispatch(uuid,uuid,text)') as dispatch_rpc;
select * from public.free_ai_project_policy;
select kind,phase,provider,model,max_cost_microusd from public.free_ai_operation_prices order by kind,phase,model;
select c.relname,c.relrowsecurity,
       has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE') as service_write,
       has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as browser_write
from pg_class c where c.oid in (to_regclass('public.free_ai_accounts'),to_regclass('public.free_ai_projects'),
  to_regclass('public.free_ai_operations'),to_regclass('public.free_ai_project_policy'),to_regclass('public.free_ai_operation_prices'));

-- 105: Higgsfield-only forward budget; OpenAI history is not rewritten.
select exists(select 1 from pg_constraint where conrelid=to_regclass('public.free_ai_operations')
  and conname='free_ai_operations_funding_check') as higgsfield_only_setup;
select singleton,max_cost_microusd from public.free_ai_project_policy;
select provider,state,count(*) as operations,sum(max_cost_microusd) as recorded_microusd
from public.free_ai_operations group by provider,state order by provider,state;
-- Only the Higgsfield rows count against the video cap. Old OpenAI amounts
-- remain historical metadata; new zeroes mean no Higgsfield reservation.

-- 114: read-only setup evidence. Do not call account initialization or dispatch.
select to_regprocedure('public.laptop_v3_worker_claim(uuid,boolean,text,boolean)') as docker_lane,
       to_regprocedure('public.video_policy_109_generation_project_access(uuid,uuid)') as preserved_109_access,
       position('''policyVersion'',114' in pg_get_functiondef(to_regprocedure('public.generation_project_access(uuid,uuid)')))>0 as attempt_funding_114;
select pg_get_constraintdef(oid) as paid_quote_cost_bound from pg_constraint
where conrelid=to_regclass('public.generation_paid_quotes') and conname='generation_paid_quotes_cost_microusd_check';
select conname,confrelid::regclass as paid_attempt_project_owner from pg_constraint
where conrelid=to_regclass('public.generation_paid_reservations') and contype='f'
  and conkey=array[(select attnum from pg_attribute where attrelid=to_regclass('public.generation_paid_reservations') and attname='project_id')];
select singleton,user_cap_microusd,global_cap_microusd from public.generation_paid_policy;
