-- Existing V3 queue, multi-owner discovery and restart-safe video processing.
-- Manual after 090. No new table, backfill, authority or provider request.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_refresh_video_delivery(uuid,uuid,uuid,text,jsonb)') is null then raise exception 'Apply V3 migration 090 first'; end if;
 for t,c in select * from (values
  ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),('projects','id'),('projects','deleted_at'),
  ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),
  ('ugc_v3_tasks','status'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','lease_token'),('ugc_v3_tasks','lease_until'),
  ('ugc_v3_tasks','output'),('ugc_v3_tasks','error_code'),('ugc_v3_tasks','created_at'),('ugc_v3_tasks','available_at'),
  ('ugc_v3_runs','id'),('ugc_v3_runs','project_id'),('ugc_v3_runs','state'),('ugc_v3_runs','observation'),('ugc_v3_runs','result'),
  ('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document')) v(t,c)
 loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c)
   then raise exception 'Verify background V3 prerequisite %.%',t,c; end if;
 end loop;
end $$;

create or replace function public.ugc_v3_background_setup() returns boolean
language sql stable security definer set search_path='' as $$ select true $$;

create or replace function public.ugc_v3_worker_projects(p_owner uuid,p_after uuid,p_limit integer,p_submit boolean)
returns table(project_id uuid,owner_user_id uuid) language sql stable security definer set search_path='' as $$
 select v.project_id,v.owner_user_id from public.ugc_v3_projects v join public.projects p on p.id=v.project_id and p.deleted_at is null
 where (p_owner is null or v.owner_user_id=p_owner) and (p_after is null or v.project_id>p_after)
 and exists(select 1 from public.ugc_v3_tasks t where t.project_id=v.project_id and (
   t.status='queued' and t.available_at<=now() and (p_submit or t.kind<>'video' or t.provider_started or t.error_code is distinct from 'PAID_V3_EXECUTION_DISABLED')
   or t.status='running' and t.lease_until<now()
   or t.kind='video' and t.provider_started and t.status='reconciliation_required' and t.available_at<=now()))
 order by v.project_id limit greatest(1,least(coalesce(p_limit,32),100));
$$;

create or replace function public.ugc_v3_worker_claim(p_project uuid,p_submit boolean) returns jsonb
language plpgsql security definer set search_path='' as $$ declare t public.ugc_v3_tasks; begin
 if not exists(select 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id where v.project_id=p_project and p.deleted_at is null) then return null; end if;
 -- Persist an idempotent pause, without repeatedly claiming/logging an unsent request while OFF.
 if not p_submit then
  update public.ugc_v3_tasks set error_code='PAID_V3_EXECUTION_DISABLED' where project_id=p_project and kind='video'
   and status='queued' and not provider_started and error_code is distinct from 'PAID_V3_EXECUTION_DISABLED';
 end if;
 select * into t from public.ugc_v3_tasks where project_id=p_project
  and (status='queued' and available_at<=now() or status='running' and lease_until<now())
  and (p_submit or kind<>'video' or provider_started)
  order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.ugc_v3_tasks set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes'
  where id=t.id returning * into t;
 return to_jsonb(t);
end $$;

create or replace function public.ugc_v3_video_stage(p_task uuid,p_token uuid,p_stage text) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks; stages text[]:=array['V3_FINAL_VIDEO_JOB_CLAIMED','HIGGSFIELD_SUBMITTING','HIGGSFIELD_REQUEST_ACCEPTED',
 'HIGGSFIELD_PROCESSING','HIGGSFIELD_RESULT_RECEIVED','V3_FINAL_VIDEO_SAVING','V3_FINAL_VIDEO_SAVED','V3_FINAL_VIDEO_READY_FOR_REVIEW']; begin
 select * into t from public.ugc_v3_tasks where id=p_task and lease_token=p_token and lease_until>now()
  and kind='video' and (status='running' or status='done' and p_stage='V3_FINAL_VIDEO_READY_FOR_REVIEW') for update;
 if not found then raise exception 'V3_LEASE_LOST'; end if;
 if array_position(stages,p_stage) is null then raise exception 'INVALID_VIDEO_STAGE'; end if;
 if coalesce(array_position(stages,t.output->>'stage'),0)>=array_position(stages,p_stage) then return false; end if;
 update public.ugc_v3_tasks set output=jsonb_set(coalesce(output,'{}'::jsonb),'{stage}',to_jsonb(p_stage)) where id=t.id;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(t.project_id,t.id,'video_stage',jsonb_build_object('stage',p_stage));
 return true;
end $$;

-- Trusted worker must supply the known request identity from SQL or this run's immutable local receipt.
-- Even an invalid receipt cannot allow another POST: provider_started is NEVER reset.
create or replace function public.ugc_v3_worker_resume_known(p_owner uuid,p_project uuid,p_run uuid,p_request uuid) returns boolean
language plpgsql security definer set search_path='' as $$ declare t public.ugc_v3_tasks; r public.ugc_v3_runs; begin
 if not exists(select 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id
  where v.project_id=p_project and v.owner_user_id=p_owner and p.deleted_at is null) then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 select * into t from public.ugc_v3_tasks where project_id=p_project and kind='video' and input->>'runId'=p_run::text for update;
 if not found or not t.provider_started or t.status<>'reconciliation_required' or t.lease_until>now() or p_request is null then return false; end if;
 select * into r from public.ugc_v3_runs where id=p_run and project_id=p_project for update;
 if not found or r.result is not null or r.state not in ('submitting','provider_processing','reconciliation_required')
  or r.observation is not null and (r.observation->>'requestId' is distinct from p_request::text or r.observation->>'status' in ('failed','nsfw','canceled')) then return false; end if;
 update public.ugc_v3_tasks set status='queued',error_code=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
 update public.ugc_v3_runs set state=case when observation is null then state else 'provider_processing' end,error_code=null where id=r.id;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,p_run,'known_request_resumed',jsonb_build_object('requestId',p_request));
 return true;
end $$;

revoke all on function public.ugc_v3_background_setup(),public.ugc_v3_worker_projects(uuid,uuid,integer,boolean),public.ugc_v3_worker_claim(uuid,boolean),
 public.ugc_v3_video_stage(uuid,uuid,text),public.ugc_v3_worker_resume_known(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ugc_v3_background_setup(),public.ugc_v3_worker_projects(uuid,uuid,integer,boolean),public.ugc_v3_worker_claim(uuid,boolean),
 public.ugc_v3_video_stage(uuid,uuid,text),public.ugc_v3_worker_resume_known(uuid,uuid,uuid,uuid) to service_role;
commit;
