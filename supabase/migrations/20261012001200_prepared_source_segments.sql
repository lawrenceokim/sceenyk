-- Private source derivatives. Existing plans, paid tasks and accounting are intact.
begin;
alter table public.project_assets add constraint project_assets_id_project_owner_unique unique(id,project_id,owner_user_id);
create table public.prepared_segments (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null, project_id uuid not null, source_asset_id uuid not null,
 created_job_id uuid not null, created_scene_id uuid not null,
 source_etag text not null, source_size_bytes bigint not null check(source_size_bytes>0 and source_size_bytes<=104857600),
 start_ms bigint not null check(start_ms>=0), end_ms bigint not null,
 requested_duration_ms bigint not null check(requested_duration_ms between 1 and 30000),
 normalization_key text not null check(normalization_key ~ '^[a-f0-9]{64}$'),
 normalization jsonb not null check(jsonb_typeof(normalization)='object'),
 status text not null default 'pending' check(status in ('pending','processing','completed','failed')),
 attempts integer not null default 0 check(attempts between 0 and 3), lease_id uuid, lease_expires_at timestamptz,
 storage_key text not null unique, mime_type text not null default 'video/mp4' check(mime_type='video/mp4'),
 verified_etag text, source_duration_ms bigint, duration_ms bigint, size_bytes bigint check(size_bytes between 1 and 20971520),
 width integer check(width between 2 and 1280), height integer check(height between 2 and 1280), fps numeric,
 source_width integer, source_height integer, source_rotation integer, source_has_audio boolean,
 processing_mode text check(processing_mode in ('copy','transcode')),
 error_code text check(error_code ~ '^[A-Z_]{1,60}$'),
 created_at timestamptz not null default now(), completed_at timestamptz,
 unique(source_asset_id,source_etag,start_ms,end_ms,normalization_key),
 unique(id,owner_user_id,project_id,source_asset_id),
 foreign key(created_scene_id,created_job_id,owner_user_id,project_id) references public.scene_executions(id,job_id,owner_user_id,project_id),
 foreign key(source_asset_id,project_id,owner_user_id) references public.project_assets(id,project_id,owner_user_id),
 check(end_ms>start_ms and abs(end_ms-start_ms-requested_duration_ms)<=1),
 check(status<>'completed' or (verified_etag is not null and size_bytes is not null and duration_ms is not null and abs(duration_ms-requested_duration_ms)<=43 and source_duration_ms>=end_ms-1 and width is not null and height is not null and fps=24 and completed_at is not null))
);
alter table public.scene_executions add column preparation_required boolean not null default false;
alter table public.scene_executions add column prepared_asset_id uuid;
alter table public.scene_executions add column source_start_ms bigint;
alter table public.scene_executions add column source_end_ms bigint;
alter table public.scene_executions add column requested_duration_ms bigint;
alter table public.scene_executions add column source_overlays jsonb not null default '{}' check(jsonb_typeof(source_overlays)='object');
alter table public.scene_executions add foreign key(prepared_asset_id,owner_user_id,project_id,input_asset_id) references public.prepared_segments(id,owner_user_id,project_id,source_asset_id);

-- Preserve already-created/completed scenes exactly. New video reuse must wait
-- for its segment, rather than reporting the entire original as ready.
alter function public.prepare_visual_scenes(uuid,text,jsonb) rename to prepare_visual_scenes_before_segments;
create function public.prepare_visual_scenes(p_job_id uuid,p_run_id text,p_scenes jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare existed boolean; result boolean;
begin
 perform 1 from public.generation_jobs where id=p_job_id for update;
 existed := exists(select 1 from public.scene_executions where job_id=p_job_id);
 result := public.prepare_visual_scenes_before_segments(p_job_id,p_run_id,p_scenes);
 if result and not existed then
  update public.scene_executions s set preparation_required=true,
   source_start_ms=round(s.source_start*1000),source_end_ms=round(s.source_end*1000),requested_duration_ms=round(s.duration_seconds*1000),
   status=case when s.operation='reuse' then 'pending' else s.status end,
   completed_at=case when s.operation='reuse' then null else s.completed_at end
  from public.project_assets a where s.job_id=p_job_id and a.id=s.input_asset_id and a.media_type='video' and s.operation in ('reuse','video_to_video');
 end if;
 return result;
end; $$;
revoke all on function public.prepare_visual_scenes_before_segments(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.reserve_source_segment(p_scene_id uuid,p_run_id text,p_normalization_key text,p_normalization jsonb,p_overlays jsonb,p_lease_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.scene_executions; a public.project_assets; r public.prepared_segments; new_id uuid;
begin
 select x.* into s from public.scene_executions x join public.generation_jobs j on j.id=x.job_id
 where x.id=p_scene_id and j.visual_run_id=p_run_id and j.status='processing' and j.current_stage='generating'
 and exists(select 1 from public.generation_reservations q where q.job_id=j.id and q.state='reserved') for update of x;
 if not found or not s.preparation_required or s.status in ('completed','failed','skipped') or s.provider_task_id is not null then return jsonb_build_object('state','unavailable'); end if;
 if s.source_start_ms is null or s.source_end_ms is null or s.source_start_ms<0 or s.source_end_ms<=s.source_start_ms or s.requested_duration_ms not between 1 and 30000 or abs(s.source_end_ms-s.source_start_ms-s.requested_duration_ms)>1 then
  update public.scene_executions set status='failed',error_code='INVALID_SOURCE_TIMING',updated_at=now() where id=s.id;
  return jsonb_build_object('state','failed');
 end if;
 select * into a from public.project_assets where id=s.input_asset_id and owner_user_id=s.owner_user_id and project_id=s.project_id and media_type='video' and upload_status='uploaded' and verified_etag is not null;
 if not found or not exists(select 1 from public.generation_jobs where id=s.job_id and input_snapshot->'assetIds' ? a.id::text) then return jsonb_build_object('state','unavailable'); end if;
 if p_normalization_key is null or p_normalization_key !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_normalization) is distinct from 'object' or jsonb_typeof(p_overlays) is distinct from 'object' or p_lease_id is null then return jsonb_build_object('state','unavailable'); end if;
 new_id:=gen_random_uuid();
 insert into public.prepared_segments(id,owner_user_id,project_id,source_asset_id,created_job_id,created_scene_id,source_etag,source_size_bytes,start_ms,end_ms,requested_duration_ms,normalization_key,normalization,storage_key)
 values(new_id,s.owner_user_id,s.project_id,a.id,s.job_id,s.id,a.verified_etag,a.size_bytes,s.source_start_ms,s.source_end_ms,s.requested_duration_ms,p_normalization_key,p_normalization,'users/'||s.owner_user_id||'/projects/'||s.project_id||'/prepared/'||new_id||'.mp4')
 on conflict(source_asset_id,source_etag,start_ms,end_ms,normalization_key) do nothing;
 select * into r from public.prepared_segments where source_asset_id=a.id and source_etag=a.verified_etag and start_ms=s.source_start_ms and end_ms=s.source_end_ms and normalization_key=p_normalization_key for update;
 if r.normalization is distinct from p_normalization then return jsonb_build_object('state','unavailable'); end if;
 update public.scene_executions set prepared_asset_id=r.id,source_overlays=p_overlays,updated_at=now() where id=s.id;
 if r.status='completed' then
  update public.scene_executions set error_code=null where id=s.id and (error_code like 'PREPARATION%' or error_code like 'PROCESSOR%');
  if s.operation='reuse' then update public.scene_executions set status='completed',error_code=null,completed_at=now(),updated_at=now() where id=s.id; end if;
  return jsonb_build_object('state','completed','segment_id',r.id);
 end if;
 if r.status='failed' then
  update public.scene_executions set status='failed',error_code=r.error_code,updated_at=now() where id=s.id;
  return jsonb_build_object('state','failed','segment_id',r.id);
 end if;
 if r.status='processing' and r.lease_expires_at>now() then return jsonb_build_object('state','busy','segment_id',r.id); end if;
 if r.attempts>=3 then return jsonb_build_object('state','exhausted','segment_id',r.id); end if;
 update public.prepared_segments set status='processing',attempts=attempts+1,lease_id=p_lease_id,lease_expires_at=now()+interval '5 minutes',error_code=null where id=r.id;
 return jsonb_build_object('state','claimed','segment_id',r.id);
end; $$;

create function public.complete_source_segment(p_scene_id uuid,p_run_id text,p_segment_id uuid,p_lease_id uuid,p_metadata jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.prepared_segments; s public.scene_executions;
begin
 select x.* into s from public.scene_executions x join public.generation_jobs j on j.id=x.job_id where x.id=p_scene_id and j.visual_run_id=p_run_id and j.status='processing' and x.prepared_asset_id=p_segment_id for update of x;
 if not found then return false; end if;
 select * into r from public.prepared_segments where id=p_segment_id for update;
 if r.status='completed' then return true; end if;
 if r.status<>'processing' or r.lease_id is distinct from p_lease_id or r.lease_expires_at<=now() or jsonb_typeof(p_metadata) is distinct from 'object' then return false; end if;
 update public.prepared_segments set status='completed',verified_etag=p_metadata->>'etag',size_bytes=(p_metadata->>'sizeBytes')::bigint,
 source_duration_ms=(p_metadata->>'sourceDurationMs')::bigint,duration_ms=(p_metadata->>'durationMs')::bigint,
 width=(p_metadata->>'width')::integer,height=(p_metadata->>'height')::integer,fps=(p_metadata->>'fps')::numeric,
 source_width=(p_metadata->>'sourceWidth')::integer,source_height=(p_metadata->>'sourceHeight')::integer,source_rotation=(p_metadata->>'sourceRotation')::integer,
 source_has_audio=(p_metadata->>'sourceHasAudio')::boolean,processing_mode=p_metadata->>'mode',completed_at=now(),lease_id=null,lease_expires_at=null,error_code=null where id=r.id;
 if s.operation='reuse' then update public.scene_executions set status='completed',completed_at=now(),error_code=null,updated_at=now() where id=s.id; end if;
 update public.scene_executions set error_code=null where id=s.id and (error_code like 'PREPARATION%' or error_code like 'PROCESSOR%');
 return true;
end; $$;

create function public.fail_source_segment(p_scene_id uuid,p_run_id text,p_segment_id uuid,p_lease_id uuid,p_error text,p_permanent boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_error is null or p_error !~ '^[A-Z_]{1,60}$' then return false; end if;
 update public.prepared_segments r set status=case when p_permanent then 'failed' else 'pending' end,error_code=p_error,lease_id=null,lease_expires_at=null
 from public.scene_executions s join public.generation_jobs j on j.id=s.job_id
 where r.id=p_segment_id and s.id=p_scene_id and s.prepared_asset_id=r.id and j.visual_run_id=p_run_id and j.status='processing' and r.status='processing' and r.lease_id=p_lease_id;
 if not found then return false; end if;
 update public.scene_executions set status=case when p_permanent then 'failed' else 'pending' end,error_code=p_error,updated_at=now() where id=p_scene_id and provider_task_id is null and status not in ('completed','failed','skipped');
 return true;
end; $$;

create or replace function public.begin_visual_submission(p_scene_id uuid,p_run_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.scene_executions s set submission_started_at=now(),submission_attempts=submission_attempts+1,error_code=null,updated_at=now()
 from public.generation_jobs j where s.id=p_scene_id and j.id=s.job_id and j.visual_run_id=p_run_id and j.status='processing' and s.provider='fal'
 and s.status='pending' and (s.error_code is null or s.error_code='RATE_LIMIT') and s.submission_started_at is null and s.provider_task_id is null and s.submission_attempts<3
 and (not s.preparation_required or exists(select 1 from public.prepared_segments r where r.id=s.prepared_asset_id and r.status='completed'));
 return found;
end; $$;

create function public.guard_prepared_segment() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='completed' or new.id is distinct from old.id or new.owner_user_id is distinct from old.owner_user_id or new.project_id is distinct from old.project_id or new.source_asset_id is distinct from old.source_asset_id or new.start_ms is distinct from old.start_ms or new.end_ms is distinct from old.end_ms or new.normalization is distinct from old.normalization or new.storage_key is distinct from old.storage_key then raise exception 'Prepared identity/output is immutable.'; end if;
 return new;
end; $$;
create trigger prepared_segments_immutable before update on public.prepared_segments for each row execute function public.guard_prepared_segment();
create trigger prepared_segments_no_delete before delete on public.prepared_segments for each row execute function public.immutable_accounting_record();
alter table public.prepared_segments enable row level security;
revoke all on public.prepared_segments from public,anon,authenticated,service_role;
grant select on public.prepared_segments to service_role;
revoke all on function public.prepare_visual_scenes(uuid,text,jsonb),public.reserve_source_segment(uuid,text,text,jsonb,jsonb,uuid),public.complete_source_segment(uuid,text,uuid,uuid,jsonb),public.fail_source_segment(uuid,text,uuid,uuid,text,boolean),public.guard_prepared_segment() from public,anon,authenticated,service_role;
grant execute on function public.prepare_visual_scenes(uuid,text,jsonb),public.reserve_source_segment(uuid,text,text,jsonb,jsonb,uuid),public.complete_source_segment(uuid,text,uuid,uuid,jsonb),public.fail_source_segment(uuid,text,uuid,uuid,text,boolean) to service_role;
commit;
