-- Manual after 091. Direct owner review; no invented quality results or paid work.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_background_setup()') is null or to_regprocedure('public.ugc_v3_studio_guard()') is null
  then raise exception 'Apply V3 migrations through 091 first'; end if;
 for t,c in select * from (values
  ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),('projects','id'),('projects','deleted_at'),
  ('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','package_hash'),
  ('ugc_v3_runs','id'),('ugc_v3_runs','project_id'),('ugc_v3_runs','package_id'),('ugc_v3_runs','intent'),
  ('ugc_v3_runs','state'),('ugc_v3_runs','result'),('ugc_v3_runs','completed_at'),
  ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','document'),
  ('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),
  ('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document')) v(t,c)
 loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c)
   then raise exception 'Verify direct video approval prerequisite %.%',t,c; end if;
 end loop;
end $$;

-- Joined video currentness is checked against its package and approved segments
-- by both video approval RPCs. artifact_current intentionally covers references only.
drop trigger if exists ugc_v3_studio_approval on public.ugc_v3_artifacts;
create trigger ugc_v3_studio_approval before update of approved_at on public.ugc_v3_artifacts
 for each row when (new.kind <> 'joined') execute function public.ugc_v3_studio_guard();

create or replace function public.ugc_v3_approve_video(p_owner uuid,p_project uuid,p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.ugc_v3_runs; a public.ugc_v3_artifacts; pkg public.ugc_v3_packages;
begin
 -- Same project lock as runtime actions serializes approval, deletion and source changes.
 perform 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id
  where v.project_id=p_project and v.owner_user_id=p_owner and p.deleted_at is null for update of v,p;
 if not found then raise exception 'V3_PROJECT_NOT_OWNED'; end if;
 select * into r from public.ugc_v3_runs where id=p_id and project_id=p_project for update;
 if found then
  if r.state not in ('awaiting_review','approved') or r.result is null or r.result='null'::jsonb
   then raise exception 'VIDEO_REVIEW_UNAVAILABLE'; end if;
  select * into pkg from public.ugc_v3_packages where id=r.package_id and project_id=p_project;
  if not found or not public.ugc_v3_runtime_current(pkg.id) or r.intent->>'packageHash' is distinct from pkg.package_hash
   then raise exception 'CURRENT_REVIEW_REQUIRED'; end if;
  if r.state='approved' then return true; end if;
  -- quality remains unchanged: this records the user's overall decision only.
  update public.ugc_v3_runs set state='approved',completed_at=now() where id=r.id;
 else
  select * into a from public.ugc_v3_artifacts where id=p_id and project_id=p_project and kind='joined' for update;
  if not found or a.rejected_at is not null or a.document->'asset' is null or a.document->'asset'='null'::jsonb
   then raise exception 'JOINED_REVIEW_UNAVAILABLE'; end if;
  select * into pkg from public.ugc_v3_packages where id=(a.document->>'packageId')::uuid and project_id=p_project;
  if not found or not public.ugc_v3_runtime_current(pkg.id) or a.document->>'packageHash' is distinct from pkg.package_hash
   or jsonb_typeof(a.document->'segments') is distinct from 'array' then raise exception 'JOINED_APPROVAL_INVALID'; end if;
  if jsonb_array_length(a.document->'segments')=0 or exists(
   select 1 from jsonb_array_elements(a.document->'segments') s where not exists(
    select 1 from public.ugc_v3_runs segment where segment.id=(s->>'runId')::uuid and segment.project_id=p_project
     and segment.package_id=pkg.id and segment.state='approved' and segment.result->>'sha256'=s->>'assetHash'))
   then raise exception 'JOINED_APPROVAL_INVALID'; end if;
  if a.approved_at is not null then return true; end if;
  update public.ugc_v3_artifacts set approved_at=now() where id=a.id;
 end if;
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document)
  values(p_project,p_id,'approve',jsonb_build_object('reviewMode','direct','decision','approve','reviewerId',p_owner,'individualChecksRecorded',false));
 return true;
end $$;
revoke all on function public.ugc_v3_approve_video(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ugc_v3_approve_video(uuid,uuid,uuid) to service_role;
commit;
