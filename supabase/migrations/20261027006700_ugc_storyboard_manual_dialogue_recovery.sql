-- Manual after 066. Defines one scoped provider-free recovery command only.
-- No backfill, live recovery, worker claim, upstream mutation or new table.
begin;
do $$ declare r record; begin
 if to_regprocedure('public.ugc_storyboard_lock(uuid)') is null
  or to_regprocedure('public.ugc_storyboard_input(uuid)') is null
  or to_regprocedure('public.ugc_storyboard_valid(jsonb,jsonb)') is null
  or obj_description(to_regclass('public.ugc_storyboards'),'pg_class') is distinct from 'sceenyk-ugc-storyboard-v1-066'
 then raise exception 'Apply 066 and prerequisites first.'; end if;
 if to_regprocedure('public.ugc_storyboard_recover_dialogue(uuid,uuid,uuid,uuid,integer,integer,jsonb)') is not null
  and obj_description(to_regprocedure('public.ugc_storyboard_recover_dialogue(uuid,uuid,uuid,uuid,integer,integer,jsonb)'),'pg_proc')
   is distinct from 'sceenyk-ugc-storyboard-manual-dialogue-v1-067' then raise exception 'Inspect existing manual recovery function before applying 067.'; end if;
 for r in select * from (values
  ('ugc_storyboards','id','uuid'),('ugc_storyboards','job_id','uuid'),('ugc_storyboards','project_id','uuid'),
  ('ugc_storyboards','owner_user_id','uuid'),('ugc_storyboards','revision','integer'),('ugc_storyboards','version','integer'),
  ('ugc_storyboards','state','text'),('ugc_storyboards','phase','text'),('ugc_storyboards','error_code','text'),
  ('ugc_storyboards','input','jsonb'),('ugc_storyboards','document','jsonb'),('ugc_storyboards','requests','jsonb'),
  ('ugc_storyboards','claim_token','uuid'),('ugc_storyboards','lease_expires_at','timestamp with time zone'),
  ('ugc_storyboards','heartbeat_at','timestamp with time zone'),('ugc_storyboards','worker_id','uuid'),
  ('ugc_storyboards','approved_at','timestamp with time zone'),('ugc_storyboards','updated_at','timestamp with time zone'),
  ('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text'),
  ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),('ugc_generation_jobs','project_id','uuid')
 ) v(table_name,column_name,data_type) loop
  if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name
   and c.column_name=r.column_name and c.data_type=r.data_type) then raise exception 'Manual storyboard recovery prerequisite: %.%',r.table_name,r.column_name; end if;
 end loop;
end; $$;

create or replace function public.ugc_storyboard_recover_dialogue(p_owner uuid,p_project uuid,p_job uuid,p_storyboard uuid,p_version integer,p_request_index integer,p_document jsonb)
returns public.ugc_storyboards language plpgsql security definer set search_path='' as $$
declare b public.ugc_storyboards; source_request jsonb; begin
 perform public.ugc_storyboard_lock(p_job);
 if p_owner is null or p_request_index is null or p_request_index not between 0 and 1
  or not exists(select 1 from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project)
  or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 select * into b from public.ugc_storyboards where id=p_storyboard and job_id=p_job and project_id=p_project and owner_user_id=p_owner for update;
 if not found or b.version is distinct from p_version or b.state<>'failed' or b.error_code is distinct from 'STORYBOARD_OUTPUT_INVALID'
  or b.claim_token is not null and b.lease_expires_at>clock_timestamp()
  or exists(select 1 from public.ugc_storyboards where job_id=p_job and revision>b.revision)
  or public.ugc_storyboard_input(p_job) is distinct from b.input then return null; end if;
 source_request:=b.requests->p_request_index;
 if jsonb_typeof(source_request->'output') is distinct from 'string'
  or source_request->'receipt'->>'status' is distinct from 'completed'
  or source_request->'receipt'->>'refused'='true'
  or not public.ugc_storyboard_valid(p_document,b.input) then return null; end if;
 -- Strict schema and dialogue-only diff are enforced by the owner service.
 -- SQL independently enforces access/current versions and all timing/bindings.
 -- Preserve the original requests/output/receipts, input, attempts and model.
 update public.ugc_storyboards set document=p_document,state='review',phase='review',error_code=null,
  approved_at=null,worker_id=null,claim_token=null,lease_expires_at=null,heartbeat_at=null,
  version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 return b; -- Existing audit trigger records the transition. No job is queued.
end; $$;
comment on function public.ugc_storyboard_recover_dialogue(uuid,uuid,uuid,uuid,integer,integer,jsonb) is 'sceenyk-ugc-storyboard-manual-dialogue-v1-067';
revoke all on function public.ugc_storyboard_recover_dialogue(uuid,uuid,uuid,uuid,integer,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ugc_storyboard_recover_dialogue(uuid,uuid,uuid,uuid,integer,integer,jsonb) to service_role;
commit;
