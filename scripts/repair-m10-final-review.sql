-- Privileged, one-time repair AFTER migration 075. No media/package/provider writes.
-- The owner requested reopening this specific falsely stale approval for final review.
begin;
-- Block concurrent writes before temporarily bypassing only terminal-state guards.
lock table public.ugc_generation_jobs,public.ugc_final_executions in share row exclusive mode;
do $$ declare e public.ugc_final_executions; j public.ugc_generation_jobs; begin
 select * into e from public.ugc_final_executions where id='62e93717-9e00-486e-b968-a85f272b831d' for update;
 select * into j from public.ugc_generation_jobs where id=e.job_id for update;
 perform public.ugc_storyboard_lock(e.job_id);
 perform 1 from public.ugc_generation_packages where id=e.package_id for share;
 perform 1 from public.ugc_storyboards where job_id=e.job_id order by revision for share;
 if e.id is null or e.package_id<>'1fe9e8ab-88a6-4700-ac70-e1175d36ba17'
  or e.package_hash<>'d58ec93b8c77f8fce63c5f40d20c53975b4dfc1f7b30c70c7e31e7697ededde7'
  or e.package_version<>2 or e.final_asset->>'sha256'<>'c70bee36f62802f49a33f8b237cd6cbe35579a6d87419c1c922495f3e65d382e'
  or e.paid_requests<>12 or e.claim_token is not null or j.claim_token is not null or j.cancellation_requested_at is not null
  or (select count(*) from pg_trigger where (tgrelid='public.ugc_final_executions'::regclass and tgname='ugc_final_guard'
   or tgrelid='public.ugc_generation_jobs'::regclass and tgname='ugc_jobs_identity') and tgenabled='O')<>2
  then raise exception 'Repair identity changed; stop and inspect'; end if;
 if e.state='review' and j.status='awaiting_confirmation' and j.completed_at is null and exists(
  select 1 from public.ugc_final_approval_attempts where execution_id=e.id and outcome='reopened'
   and error_code='FINAL_POST_APPROVAL_FALSE_STALENESS') then return; end if;
 if e.state<>'approved' or e.version<>727 or e.approved_at is distinct from '2026-10-29T05:01:20.094078+00:00'::timestamptz
  or j.status<>'completed' or j.completed_at is distinct from '2026-10-29T05:01:20.097943+00:00'::timestamptz
  or not public.ugc_final_current(e.id) or not public.ugc_final_result_valid(e.id,e.final_asset,e.final_fingerprint)
  then raise exception 'Expected reviewed false-staleness state not proven; stop'; end if;
 insert into public.ugc_final_approval_attempts(execution_id,expected_version,observed_version,package_id,package_hash,package_version,
  final_asset,final_fingerprint,outcome,error_code,diagnostic)
 values(e.id,726,e.version,e.package_id,e.package_hash,e.package_version,e.final_asset,e.final_fingerprint,'reopened',
  'FINAL_POST_APPROVAL_FALSE_STALENESS',jsonb_build_object('previousApprovedAt',e.approved_at,'previousCompletedAt',j.completed_at,
   'previousJobStatus',j.status,'previousJobStage',j.stage,'reason','Owner requested review after false post-approval currentness warning'));
 alter table public.ugc_final_executions disable trigger ugc_final_guard;
 alter table public.ugc_generation_jobs disable trigger ugc_jobs_identity;
 update public.ugc_final_executions set state='review',phase='review',approved_at=null,version=version+1,updated_at=clock_timestamp() where id=e.id;
 update public.ugc_generation_jobs set status='awaiting_confirmation',stage='awaiting_confirmation',resume_stage='finalizing',
  completed_at=null,updated_at=clock_timestamp() where id=j.id;
 alter table public.ugc_final_executions enable trigger ugc_final_guard;
 alter table public.ugc_generation_jobs enable trigger ugc_jobs_identity;
 if not public.ugc_final_current(e.id) or not public.ugc_final_result_valid(e.id,e.final_asset,e.final_fingerprint)
  or exists(select 1 from public.ugc_final_executions x where x.id=e.id and
   (x.final_asset,x.final_fingerprint,x.package_id,x.package_hash,x.package_version,x.configuration,x.paid_requests,x.estimated_cost_microusd)
   is distinct from (e.final_asset,e.final_fingerprint,e.package_id,e.package_hash,e.package_version,e.configuration,e.paid_requests,e.estimated_cost_microusd))
  then raise exception 'Repair invariant failed'; end if;
end $$;
commit;
