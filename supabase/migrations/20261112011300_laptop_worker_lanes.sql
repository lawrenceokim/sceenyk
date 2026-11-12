-- Optional outgoing-only laptop workers. Existing application claims are unchanged.
begin;
do $$ declare c text; begin
 if to_regprocedure('public.ugc_v3_worker_claim(uuid,boolean)') is null
   or to_regprocedure('public.project_video_preview_claim()') is null then
   raise exception 'Apply V3 background processing and preview migrations through 112 first';
 end if;
 foreach c in array array['id','project_id','kind','status','available_at','lease_until','lease_token','provider_started','created_at','error_code'] loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_v3_tasks' and column_name=c) then
   raise exception 'Missing verified ugc_v3_tasks column %',c;
  end if;
 end loop;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_v3_projects' and column_name='project_id')
   or (select count(*) from information_schema.columns where table_schema='public' and table_name='projects' and column_name in ('id','deleted_at'))<>2 then
   raise exception 'Missing verified project registry/deletion columns';
 end if;
end $$;

create or replace function public.laptop_v3_worker_claim(p_project uuid,p_submit boolean,p_lane text,p_openai boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.ugc_v3_tasks;
begin
 if p_lane is null or p_lane not in ('ugc','media') or p_submit is null or p_openai is null then raise exception 'LAPTOP_WORKER_LANE_INVALID'; end if;
 if not exists(select 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id
   where v.project_id=p_project and p.deleted_at is null) then return null; end if;
 if p_lane='ugc' and not p_submit then
  update public.ugc_v3_tasks set error_code='PAID_V3_EXECUTION_DISABLED'
   where project_id=p_project and kind='video' and status='queued' and not provider_started
   and error_code is distinct from 'PAID_V3_EXECUTION_DISABLED';
 end if;
 -- Keep the existing 15-minute task lease and paid/recovery gate; only partition join work.
 select * into t from public.ugc_v3_tasks where project_id=p_project
  and (status='queued' and available_at<=now() or status='running' and lease_until<now())
  and ((p_lane='media' and kind='join') or (p_lane='ugc' and kind<>'join'))
  and (p_openai or kind not in ('character','product','location','storyboard') or provider_started)
  and (p_submit or kind<>'video' or provider_started)
  order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.ugc_v3_tasks set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes'
  where id=t.id returning * into t;
 return to_jsonb(t);
end $$;
revoke all on function public.laptop_v3_worker_claim(uuid,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.laptop_v3_worker_claim(uuid,boolean,text,boolean) to service_role;
commit;
