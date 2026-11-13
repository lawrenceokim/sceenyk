-- After 115. One bounded retry of derivatives exhausted by an older processor.
-- Stop the old Media worker before installation; restart with matching source.
begin;
do $$ begin
 if to_regprocedure('public.project_video_preview_request(uuid,uuid,text)') is null then
   raise exception 'Apply migration 112 first; install this migration after 115.';
 end if;
end $$;

-- Existing rows retain revision 1. New rows use the native-metadata reader.
alter table public.project_video_previews add column if not exists processor_revision smallint not null default 1
 check(processor_revision in (1,2));
alter table public.project_video_previews alter column processor_revision set default 2;

create or replace function public.project_video_preview_request(p_owner uuid,p_project uuid,p_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.project_video_previews;
begin
 perform 1 from public.projects where id=p_project and owner_user_id=p_owner and deleted_at is null for update;
 if not found then return null; end if;
 insert into public.project_video_previews(owner_user_id,project_id,version) values(p_owner,p_project,p_version)
   on conflict(owner_user_id,project_id,version) do nothing;
 -- Only a terminal old-revision failure gets one new three-attempt allowance.
 -- Ready assets, active leases, backoff and new-revision failures are unchanged.
 update public.project_video_previews set state='queued',attempts=0,lease_token=null,lease_until=null,
   retry_after=now(),processor_revision=2
   where owner_user_id=p_owner and project_id=p_project and version=p_version
     and state='failed' and processor_revision=1;
 select * into item from public.project_video_previews where owner_user_id=p_owner and project_id=p_project and version=p_version;
 return to_jsonb(item);
end $$;
revoke all on function public.project_video_preview_request(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.project_video_preview_request(uuid,uuid,text) to service_role;
commit;
