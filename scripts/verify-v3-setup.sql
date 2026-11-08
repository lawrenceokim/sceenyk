-- Read-only, owner-run Supabase SQL Editor verification AFTER manual 076 through 098 in order.
-- No jobs, claims, quotes, authorizations or provider requests are created.
with expected(name) as (values
 ('ugc_v3_projects'),('ugc_v3_sources'),('ugc_v3_packages'),('ugc_v3_authorizations'),('ugc_v3_events'),
 ('ugc_v3_tasks'),('ugc_v3_artifacts'),('ugc_v3_quotes'),('ugc_v3_run_authorizations'),('ugc_v3_runs'),('ugc_v3_runtime_events'),('ugc_v3_reference_deletions'))
select e.name, c.oid is not null as installed, coalesce(c.relrowsecurity,false) as rls_enabled,
 coalesce(has_table_privilege('authenticated',c.oid,'SELECT'),false) as browser_can_read_should_be_false,
 coalesce(has_table_privilege('service_role',c.oid,'SELECT'),false) as server_can_read,
 coalesce(has_table_privilege('service_role',c.oid,'INSERT'),false) as direct_insert_should_be_false
from expected e left join pg_class c on c.oid=to_regclass('public.'||e.name) order by e.name;

with expected(signature) as (values
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
