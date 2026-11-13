-- After 114. Recovery of a completed existing request only; no funding writes.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.video_policy_109_generation_project_access(uuid,uuid)') is null
   or to_regprocedure('public.ugc_v3_worker_resume_known(uuid,uuid,uuid,uuid)') is null then raise exception 'Apply through 114 first.'; end if;
 for t,c in select * from (values ('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','error_code'),
   ('ugc_v3_runs','observation'),('ugc_v3_runs','error_code'),('ugc_v3_runs','result'),('ugc_v3_runtime_events','document')) v(t,c) loop
   if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c)
     then raise exception 'Verify completed recovery prerequisite %.%',t,c; end if;
 end loop;
end $$;
create or replace function public.ugc_v3_worker_resume_known(p_owner uuid,p_project uuid,p_run uuid,p_request uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; r public.ugc_v3_runs; completed_failure boolean;
begin
 -- Same ownership/project lock as normal actions. Never trust a client receipt.
 perform 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id
   where v.project_id=p_project and v.owner_user_id=p_owner and p.deleted_at is null for update of v,p;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 select * into t from public.ugc_v3_tasks where project_id=p_project and kind='video' and input->>'runId'=p_run::text for update;
 if not found or not t.provider_started or t.lease_until>now() or p_request is null then return false; end if;
 select * into r from public.ugc_v3_runs where id=p_run and project_id=p_project for update;
 if not found or r.result is not null or r.observation is not null and
   (r.observation->>'requestId' is distinct from p_request::text or r.observation->>'status' in ('failed','nsfw','canceled')) then return false; end if;
 -- 115: a local validation failure is not permission to buy a replacement.
 -- Preserve started=true, immutable intent/authority, receipts and settled credit.
 completed_failure:=t.status='failed' and r.state='failed' and r.observation->>'status'='completed'
   and r.observation->>'requestId'=p_request::text and r.error_code='V3_VIDEO_TECHNICAL_VALIDATION_FAILED'
   and t.error_code='V3_VIDEO_TECHNICAL_VALIDATION_FAILED';
 if not coalesce(completed_failure,false) and (t.status<>'reconciliation_required'
   or r.state not in ('submitting','provider_processing','reconciliation_required')) then return false; end if;
 update public.ugc_v3_tasks set status='queued',error_code=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
 update public.ugc_v3_runs set state=case when observation is null then state else 'provider_processing' end,error_code=null where id=r.id;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,p_run,'known_request_resumed',
   jsonb_build_object('requestId',p_request,'completedResultOnly',coalesce(completed_failure,false),'previousError',r.error_code));
 return true;
end $$;
revoke all on function public.ugc_v3_worker_resume_known(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ugc_v3_worker_resume_known(uuid,uuid,uuid,uuid) to service_role;

-- Operator recovery claims exactly one completed request; never discovers or
-- leases unrelated work and never changes provider_started or financial state.
create or replace function public.ugc_v3_completed_video_claim(p_owner uuid,p_project uuid,p_run uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; r public.ugc_v3_runs;
begin
 perform 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id
   where v.project_id=p_project and v.owner_user_id=p_owner and p.deleted_at is null for update of v,p;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 select * into t from public.ugc_v3_tasks where project_id=p_project and kind='video' and input->>'runId'=p_run::text for update;
 if not found or not t.provider_started or t.lease_until>now() or t.status not in ('failed','queued','reconciliation_required') then return null; end if;
 select * into r from public.ugc_v3_runs where id=p_run and project_id=p_project for update;
 if not found or r.result is not null or p_request is null or r.observation->>'requestId' is distinct from p_request::text
   or r.observation->>'status' is distinct from 'completed'
   or r.state not in ('failed','provider_processing','reconciliation_required')
   or r.state='failed' and (r.error_code is distinct from 'V3_VIDEO_TECHNICAL_VALIDATION_FAILED'
     or t.error_code is distinct from 'V3_VIDEO_TECHNICAL_VALIDATION_FAILED') then return null; end if;
 update public.ugc_v3_tasks set status='running',error_code=null,lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes'
   where id=t.id returning * into t;
 update public.ugc_v3_runs set state='provider_processing',error_code=null where id=r.id;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,p_run,'completed_recovery_claim',
   jsonb_build_object('requestId',p_request,'previousError',r.error_code));
 return to_jsonb(t);
end $$;
revoke all on function public.ugc_v3_completed_video_claim(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ugc_v3_completed_video_claim(uuid,uuid,uuid,uuid) to service_role;
commit;
