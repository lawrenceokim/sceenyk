-- Ready composition -> canonical render -> independently verified receipt.
-- Previously applied migrations and settlement logic remain preserved.
begin;
alter table public.composition_plans add constraint composition_plans_owner_project_unique unique(job_id,owner_user_id,project_id);

create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid not null unique,
  owner_user_id uuid not null,
  project_id uuid not null,
  composition_plan_id uuid not null unique,
  composition_digest text not null,
  render_version text not null default 'final-mp4-v1' check(render_version='final-mp4-v1'),
  status text not null default 'pending' check(status in ('pending','dispatched','rendering','uploading','verifying','completed','failed')),
  worker_attempts integer not null default 0 check(worker_attempts between 0 and 100),
  lease_id uuid,
  lease_expires_at timestamptz,
  output_asset_id uuid,
  error_code text check(error_code in ('SOURCE_UNAVAILABLE','RENDER_FAILED','RENDER_TIMEOUT','RESOURCE_LIMIT','INVALID_OUTPUT','DURATION_MISMATCH','RENDER_UNAVAILABLE')),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,generation_job_id,owner_user_id,project_id),
  foreign key(generation_job_id,owner_user_id,project_id) references public.generation_jobs(id,owner_user_id,project_id),
  foreign key(composition_plan_id,owner_user_id,project_id) references public.composition_plans(job_id,owner_user_id,project_id),
  check(composition_plan_id=generation_job_id),
  check((lease_id is null)=(lease_expires_at is null)),
  check((status='completed')=(completed_at is not null)),
  check((status='failed')=(failed_at is not null)),
  check((status='completed')=(output_asset_id is not null))
);
create table public.final_video_assets (
  id uuid primary key,
  render_job_id uuid not null unique,
  generation_job_id uuid not null unique,
  owner_user_id uuid not null,
  project_id uuid not null,
  storage_key text not null unique,
  mime_type text not null check(mime_type='video/mp4'),
  size_bytes bigint not null check(size_bytes between 1 and 52428800),
  verified_etag text not null check(char_length(verified_etag) between 1 and 200),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  duration_ms integer not null check(duration_ms between 1 and 600000),
  width integer not null check(width in (360,480,640)),
  height integer not null check(height in (360,480,640)),
  fps integer not null check(fps=24),
  video_codec text not null check(video_codec='h264'),
  audio_codec text not null check(audio_codec='aac'),
  render_duration_ms integer not null check(render_duration_ms>=0),
  observed_rss_bytes bigint not null check(observed_rss_bytes>=0),
  verified_at timestamptz not null default now(),
  foreign key(render_job_id,generation_job_id,owner_user_id,project_id) references public.render_jobs(id,generation_job_id,owner_user_id,project_id),
  check(id=render_job_id),
  check(storage_key='users/'||owner_user_id::text||'/generations/'||generation_job_id::text||'/result.mp4')
);
alter table public.render_jobs add foreign key(output_asset_id) references public.final_video_assets(id);
create trigger final_video_assets_immutable before update or delete on public.final_video_assets for each row execute function public.immutable_accounting_record();
create index render_jobs_recovery_idx on public.render_jobs(status,lease_expires_at,updated_at);

create function public.ensure_render_job(p_job_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs; c public.composition_plans; result uuid;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then return null; end if;
  select id into result from public.render_jobs where generation_job_id=j.id;
  if found then return result; end if;
  select * into c from public.composition_plans where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id;
  if not found or c.status<>'ready' or c.plan->>'status'<>'ready' or jsonb_array_length(c.plan->'issues')<>0 or
    j.status<>'processing' or j.current_stage<>'voice' or j.composition_ready_at is null or j.accounting_version<>1 or
    not exists(select 1 from public.generation_reservations where job_id=j.id and owner_user_id=j.owner_user_id and state='reserved') then return null; end if;
  insert into public.render_jobs(generation_job_id,owner_user_id,project_id,composition_plan_id,composition_digest)
    values(j.id,j.owner_user_id,j.project_id,c.job_id,c.input_digest) returning id into result;
  update public.generation_jobs set current_stage='rendering' where id=j.id;
  return result;
end;
$$;

-- A short DB lease and heartbeat serialize worker processes/restarts. Only the
-- current lease can publish a receipt or permanently fail. Expiry is not failure.
create function public.claim_render_job(p_render_id uuid,p_lease_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare r public.render_jobs;
begin
  select * into r from public.render_jobs where id=p_render_id for update;
  if not found or p_lease_id is null then return 'invalid'; end if;
  if r.status in ('completed','failed') then return r.status; end if;
  if not exists(select 1 from public.generation_jobs j join public.composition_plans c on c.job_id=j.id
    join public.generation_reservations a on a.job_id=j.id and a.owner_user_id=j.owner_user_id
    where j.id=r.generation_job_id and j.owner_user_id=r.owner_user_id and j.project_id=r.project_id and j.status='processing' and j.current_stage='rendering'
      and c.status='ready' and c.input_digest=r.composition_digest and a.state='reserved') then return 'invalid'; end if;
  if r.lease_expires_at>now() then return 'busy'; end if;
  if r.worker_attempts>=100 then return 'reconciliation_required'; end if;
  update public.render_jobs set status='dispatched',worker_attempts=worker_attempts+1,lease_id=p_lease_id,
    lease_expires_at=now()+interval '2 minutes',started_at=coalesce(started_at,now()),error_code=null,updated_at=now() where id=r.id;
  return 'claimed';
end;
$$;
create function public.advance_render_job(p_render_id uuid,p_lease_id uuid,p_status text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('dispatched','rendering','uploading','verifying') then return false; end if;
  update public.render_jobs set status=case when array_position(array['dispatched','rendering','uploading','verifying'],p_status)>=array_position(array['dispatched','rendering','uploading','verifying'],status) then p_status else status end,lease_expires_at=now()+interval '2 minutes',updated_at=now()
    where id=p_render_id and lease_id=p_lease_id and lease_expires_at>now() and status not in ('completed','failed');
  return found;
end;
$$;
create function public.release_render_lease(p_render_id uuid,p_lease_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.render_jobs set status='pending',lease_id=null,lease_expires_at=null,error_code='RENDER_UNAVAILABLE',updated_at=now()
    where id=p_render_id and lease_id=p_lease_id and status not in ('completed','failed');
  return found;
end;
$$;
create function public.complete_render_job(p_render_id uuid,p_lease_id uuid,p_metadata jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.render_jobs; c public.composition_plans; j public.generation_jobs; expected_width integer; expected_height integer; total integer;
begin
  select g.* into j from public.generation_jobs g join public.render_jobs a on a.generation_job_id=g.id where a.id=p_render_id for update of g;
  if not found then return false; end if;
  select * into r from public.render_jobs where id=p_render_id for update;
  if not found then return false; end if;
  if r.status='completed' then return exists(select 1 from public.final_video_assets where id=r.output_asset_id); end if;
  if r.status<>'verifying' or r.lease_id is distinct from p_lease_id or r.lease_expires_at<=now() or j.status<>'processing' or j.current_stage<>'rendering' then return false; end if;
  select * into c from public.composition_plans where job_id=r.composition_plan_id and status='ready' and input_digest=r.composition_digest;
  if not found or not exists(select 1 from public.generation_reservations where job_id=r.generation_job_id and owner_user_id=r.owner_user_id and state='reserved') then return false; end if;
  expected_width:=case c.plan->>'aspect_ratio' when '16:9' then 640 when '9:16' then 360 else 480 end;
  expected_height:=case c.plan->>'aspect_ratio' when '16:9' then 360 when '9:16' then 640 else 480 end;
  total:=(c.plan->>'total_duration_ms')::integer;
  if jsonb_typeof(p_metadata)<>'object' or (select count(*) from jsonb_object_keys(p_metadata))<>11 or
    (p_metadata->>'width')::integer is distinct from expected_width or (p_metadata->>'height')::integer is distinct from expected_height or
    (p_metadata->>'fps')::integer is distinct from 24 or p_metadata->>'videoCodec' is distinct from 'h264' or p_metadata->>'audioCodec' is distinct from 'aac' or
    abs((p_metadata->>'durationMs')::integer-total)>85 then return false; end if;
  insert into public.final_video_assets(id,render_job_id,generation_job_id,owner_user_id,project_id,storage_key,mime_type,size_bytes,verified_etag,sha256,duration_ms,width,height,fps,video_codec,audio_codec,render_duration_ms,observed_rss_bytes)
    values(r.id,r.id,r.generation_job_id,r.owner_user_id,r.project_id,'users/'||r.owner_user_id::text||'/generations/'||r.generation_job_id::text||'/result.mp4','video/mp4',
      (p_metadata->>'sizeBytes')::bigint,p_metadata->>'etag',p_metadata->>'sha256',(p_metadata->>'durationMs')::integer,expected_width,expected_height,24,'h264','aac',(p_metadata->>'renderDurationMs')::integer,(p_metadata->>'observedRssBytes')::bigint);
  update public.render_jobs set status='completed',output_asset_id=r.id,completed_at=now(),lease_id=null,lease_expires_at=null,updated_at=now() where id=r.id;
  return true;
end;
$$;

-- Tighten the old settlement entry as well: an HTTP 'done' or MIME/length-only
-- assertion can no longer complete a composition generation.
alter function public.complete_generation_with_result(uuid,text,text,text,bigint,text) rename to complete_generation_with_result_before_rendering;
revoke all on function public.complete_generation_with_result_before_rendering(uuid,text,text,text,bigint,text) from public,anon,authenticated,service_role;
create function public.complete_generation_with_result(p_job_id uuid,p_run_id text,p_storage_key text,p_mime_type text,p_size_bytes bigint,p_etag text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.final_video_assets a join public.render_jobs r on r.id=a.render_job_id where a.generation_job_id=p_job_id and r.status='completed'
    and a.storage_key=p_storage_key and a.mime_type=p_mime_type and a.size_bytes=p_size_bytes and a.verified_etag=p_etag) then return false; end if;
  return public.complete_generation_with_result_before_rendering(p_job_id,p_run_id,p_storage_key,p_mime_type,p_size_bytes,p_etag);
end;
$$;
create function public.finalize_render_generation(p_render_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.final_video_assets; j public.generation_jobs;
begin
  -- Preserve global lock order: generation before render. Worker publication
  -- only locks its render row and cannot settle accounting itself.
  select g.* into j from public.generation_jobs g join public.render_jobs r on r.generation_job_id=g.id where r.id=p_render_id for update of g;
  if not found then return false; end if;
  select a1.* into a from public.final_video_assets a1 join public.render_jobs r on r.output_asset_id=a1.id where r.id=p_render_id and r.status='completed' and a1.owner_user_id=j.owner_user_id and a1.project_id=j.project_id;
  if not found then return false; end if;
  return public.complete_generation_with_result(j.id,j.worker_run_id,a.storage_key,a.mime_type,a.size_bytes,a.verified_etag);
end;
$$;
create function public.fail_render_job(p_render_id uuid,p_lease_id uuid,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.render_jobs; j public.generation_jobs;
begin
  select g.* into j from public.generation_jobs g join public.render_jobs a on a.generation_job_id=g.id where a.id=p_render_id for update of g;
  if not found then return false; end if;
  select * into r from public.render_jobs where id=p_render_id for update;
  if r.status='failed' then return true; end if;
  if r.status='completed' or r.lease_id is distinct from p_lease_id or r.lease_expires_at<=now() or
    p_error not in ('SOURCE_UNAVAILABLE','RENDER_FAILED','RENDER_TIMEOUT','RESOURCE_LIMIT','INVALID_OUTPUT','DURATION_MISMATCH') or
    exists(select 1 from public.final_video_assets where render_job_id=r.id) or j.status<>'processing' then return false; end if;
  update public.render_jobs set status='failed',error_code=p_error,failed_at=now(),lease_id=null,lease_expires_at=null,updated_at=now() where id=r.id;
  update public.generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' where id=j.id;
  return true;
end;
$$;

create function public.render_dispatch_candidates() returns table(job_id uuid)
language sql security definer set search_path='' as $$
  select j.id from public.generation_jobs j join public.composition_plans c on c.job_id=j.id
  left join public.render_jobs r on r.generation_job_id=j.id
  where j.status='processing' and j.composition_ready_at is not null and c.status='ready'
    and exists(select 1 from public.generation_reservations a where a.job_id=j.id and a.state='reserved')
    and (r.id is null or r.status='completed' or r.status not in ('completed','failed') and (r.lease_expires_at is null or r.lease_expires_at<=now()))
  order by j.created_at limit 25;
$$;

create function public.guard_final_render_generation() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='failed' and old.status<>'failed' and exists(select 1 from public.final_video_assets where generation_job_id=new.id) then
    raise exception 'Verified output cannot be restored as a failure.' using errcode='23514';
  end if;
  if new.status='completed' and old.status<>'completed' and new.composition_ready_at is not null and not exists(select 1 from public.final_video_assets a join public.render_jobs r on r.output_asset_id=a.id where a.generation_job_id=new.id and r.status='completed') then
    raise exception 'Completion requires verified rendered output.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger generation_jobs_final_render_guard before update on public.generation_jobs for each row execute function public.guard_final_render_generation();
revoke all on function public.guard_final_render_generation() from public,anon,authenticated,service_role;

alter table public.render_jobs enable row level security;
alter table public.final_video_assets enable row level security;
revoke all on public.render_jobs,public.final_video_assets from public,anon,authenticated,service_role;
grant select on public.render_jobs,public.final_video_assets to service_role;
revoke all on function public.ensure_render_job(uuid),public.claim_render_job(uuid,uuid),public.advance_render_job(uuid,uuid,text),public.release_render_lease(uuid,uuid),public.complete_render_job(uuid,uuid,jsonb),public.finalize_render_generation(uuid),public.fail_render_job(uuid,uuid,text),public.render_dispatch_candidates(),public.complete_generation_with_result(uuid,text,text,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.ensure_render_job(uuid),public.claim_render_job(uuid,uuid),public.advance_render_job(uuid,uuid,text),public.release_render_lease(uuid,uuid),public.complete_render_job(uuid,uuid,jsonb),public.finalize_render_generation(uuid),public.fail_render_job(uuid,uuid,text),public.render_dispatch_candidates(),public.complete_generation_with_result(uuid,text,text,text,bigint,text) to service_role;
commit;
