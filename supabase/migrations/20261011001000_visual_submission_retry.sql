-- Only an explicit 429 rejection proves that no task was accepted. An unknown
-- network/5xx outcome must never free a paid submission slot.
begin;
alter table public.scene_executions add column submission_attempts integer not null default 0 check(submission_attempts between 0 and 3);
create or replace function public.begin_visual_submission(p_scene_id uuid,p_run_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.scene_executions s set submission_started_at=now(),submission_attempts=submission_attempts+1,error_code=null,updated_at=now()
  from public.generation_jobs j where s.id=p_scene_id and j.id=s.job_id and j.visual_run_id=p_run_id and j.status='processing'
    and s.status='pending' and (s.error_code is null or s.error_code='RATE_LIMIT') and s.submission_started_at is null and s.provider_task_id is null and s.submission_attempts<3;
  return found;
end;
$$;
create function public.retry_rejected_visual_submission(p_scene_id uuid,p_run_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.scene_executions s set submission_started_at=null,error_code='RATE_LIMIT',updated_at=now()
  from public.generation_jobs j where s.id=p_scene_id and j.id=s.job_id and j.visual_run_id=p_run_id and j.status='processing'
    and s.status='pending' and s.provider_task_id is null and s.submission_started_at is not null;
  return found;
end;
$$;
revoke all on function public.retry_rejected_visual_submission(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.retry_rejected_visual_submission(uuid,text) to service_role;
commit;
