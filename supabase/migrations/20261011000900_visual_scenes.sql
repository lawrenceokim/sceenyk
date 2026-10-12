-- Visual intermediates only. Existing plans, accounting and final receipts stay intact.
begin;
alter table public.generation_jobs add column visual_execution_version integer not null default 0 check(visual_execution_version in (0,1));
alter table public.generation_jobs alter column visual_execution_version set default 1;
alter table public.generation_jobs add column visual_run_id text;
alter table public.generation_jobs add column visuals_started_at timestamptz;
alter table public.generation_jobs add column visuals_ready_at timestamptz;
alter table public.generation_jobs add column visuals_pending_at timestamptz;

create table public.scene_executions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_plans(job_id),
  owner_user_id uuid not null,
  project_id uuid not null,
  scene_order integer not null check(scene_order between 1 and 20),
  operation text not null check(operation in ('reuse','text_to_video','image_to_video','video_to_video')),
  status text not null default 'pending' check(status in ('pending','submitted','processing','completed','failed','skipped')),
  provider text check(provider='runway'), model text,
  prompt text not null check(char_length(prompt) between 1 and 4000),
  duration_seconds numeric not null check(duration_seconds>0 and duration_seconds<=30),
  resolution text,
  input_asset_id uuid references public.project_assets(id), source_start numeric, source_end numeric,
  provider_task_id uuid unique, submission_started_at timestamptz,
  estimated_credits numeric check(estimated_credits>=0),
  provider_credits numeric check(provider_credits>=0),
  provider_cost_usd numeric generated always as(provider_credits*0.01) stored,
  cost_measured_at timestamptz,
  error_code text check(error_code ~ '^[A-Z_]{1,60}$'),
  output_asset_id uuid unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  unique(job_id,scene_order), unique(id,job_id,owner_user_id,project_id),
  foreign key(job_id,owner_user_id) references public.generation_jobs(id,owner_user_id),
  foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id),
  check((operation='reuse' and provider is null and model is null and provider_task_id is null) or (operation<>'reuse' and provider='runway' and model is not null)),
  check(status not in ('submitted','processing') or provider_task_id is not null),
  check(status<>'completed' or operation='reuse' or output_asset_id is not null)
);
create table public.scene_assets (
  id uuid primary key,
  scene_execution_id uuid not null unique,
  job_id uuid not null, owner_user_id uuid not null, project_id uuid not null,
  storage_key text not null unique,
  mime_type text not null check(mime_type='video/mp4'),
  size_bytes bigint not null check(size_bytes>0 and size_bytes<=104857600),
  verified_etag text not null check(char_length(verified_etag)>0),
  created_at timestamptz not null default now(),
  foreign key(scene_execution_id,job_id,owner_user_id,project_id) references public.scene_executions(id,job_id,owner_user_id,project_id)
);
alter table public.scene_executions add foreign key(output_asset_id) references public.scene_assets(id);
create index scene_executions_job_status on public.scene_executions(job_id,status);
create trigger scene_assets_immutable before update or delete on public.scene_assets for each row execute function public.immutable_accounting_record();

create function public.guard_visual_job() returns trigger language plpgsql set search_path='' as $$
begin
  if new.visual_execution_version<>old.visual_execution_version then raise exception 'Visual eligibility is immutable.'; end if;
  if old.visual_run_id is not null and new.visual_run_id is distinct from old.visual_run_id then raise exception 'Visual claim is immutable.'; end if;
  if old.visuals_started_at is not null and new.visuals_started_at is distinct from old.visuals_started_at then raise exception 'Visual start is immutable.'; end if;
  if old.visuals_ready_at is not null and new.visuals_ready_at is distinct from old.visuals_ready_at then raise exception 'Visual readiness is immutable.'; end if;
  if new.visuals_ready_at is not null and (not exists(select 1 from public.scene_executions where job_id=new.id) or exists(select 1 from public.scene_executions where job_id=new.id and status not in ('completed','skipped'))) then raise exception 'Visual scenes are incomplete.'; end if;
  return new;
end;
$$;
create trigger generation_visual_guard before update on public.generation_jobs for each row execute function public.guard_visual_job();

create function public.claim_visual_generation(p_job_id uuid,p_run_id text) returns text
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs;
begin
  if p_run_id is null or char_length(p_run_id) not between 1 and 200 then return 'invalid'; end if;
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.visual_execution_version<>1 or j.production_plan_ready_at is null then return 'invalid'; end if;
  if j.status<>'processing' or j.visuals_ready_at is not null then return 'terminal'; end if;
  if not exists(select 1 from public.generation_reservations where job_id=j.id and owner_user_id=j.owner_user_id and state='reserved') then return 'invalid'; end if;
  if j.visual_run_id is not null then return case when j.visual_run_id=p_run_id then 'resumed' else 'duplicate' end; end if;
  if j.current_stage<>'planning' then return 'invalid'; end if;
  update public.generation_jobs set current_stage='generating' where id=j.id;
  update public.generation_jobs set visual_run_id=p_run_id,visuals_started_at=now() where id=j.id;
  return 'claimed';
end;
$$;

create function public.prepare_visual_scenes(p_job_id uuid,p_run_id text,p_scenes jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs; p jsonb; s jsonb; original jsonb;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.visual_run_id is distinct from p_run_id or j.status<>'processing' then return false; end if;
  if exists(select 1 from public.scene_executions where job_id=j.id) then return true; end if;
  select plan into p from public.generation_plans where job_id=j.id and owner_user_id=j.owner_user_id;
  if jsonb_typeof(p_scenes) is distinct from 'array' or jsonb_array_length(p_scenes)<>jsonb_array_length(p->'scenePlan') then return false; end if;
  for s in select value from jsonb_array_elements(p_scenes) loop
    original := p->'scenePlan'->((s->>'scene_order')::integer-1);
    if original is null or (original->>'order')::integer<>(s->>'scene_order')::integer or
      (original->>'durationSeconds')::numeric<>(s->>'duration_seconds')::numeric or
      original->>'assetId' is distinct from s->>'input_asset_id' or
      original->>'startTime' is distinct from s->>'source_start' or original->>'endTime' is distinct from s->>'source_end' or
      coalesce(original->>'transformationInstruction',original->>'description') is distinct from s->>'prompt' or
      (original->>'source'='original' and s->>'operation'<>'reuse') or
      (original->>'source'='generated' and s->>'operation'<>'text_to_video') or
      (original->>'source'='transformed' and s->>'operation' not in ('image_to_video','video_to_video')) then raise exception 'Scene does not match immutable plan.'; end if;
    if s->>'input_asset_id' is not null and not exists(select 1 from public.project_assets a where a.id=(s->>'input_asset_id')::uuid and a.owner_user_id=j.owner_user_id and a.project_id=j.project_id and a.upload_status='uploaded' and a.verified_etag is not null and j.input_snapshot->'assetIds' ? a.id::text) then raise exception 'Invalid scene input.'; end if;
    insert into public.scene_executions(job_id,owner_user_id,project_id,scene_order,operation,provider,model,prompt,duration_seconds,resolution,input_asset_id,source_start,source_end,estimated_credits,error_code,status,completed_at)
    values(j.id,j.owner_user_id,j.project_id,(s->>'scene_order')::integer,s->>'operation',case when s->>'operation'<>'reuse' then 'runway' end,s->>'model',s->>'prompt',(s->>'duration_seconds')::numeric,s->>'resolution',(s->>'input_asset_id')::uuid,(s->>'source_start')::numeric,(s->>'source_end')::numeric,(s->>'estimated_credits')::numeric,s->>'error_code',case when s->>'operation'='reuse' then 'completed' else 'pending' end,case when s->>'operation'='reuse' then now() end);
  end loop;
  return true;
end;
$$;

-- Exactly one submission slot. No provider idempotency claim is assumed.
create function public.begin_visual_submission(p_scene_id uuid,p_run_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.scene_executions s set submission_started_at=now(),updated_at=now()
  from public.generation_jobs j where s.id=p_scene_id and j.id=s.job_id and j.visual_run_id=p_run_id and j.status='processing'
    and s.status='pending' and s.error_code is null and s.submission_started_at is null and s.provider_task_id is null;
  return found;
end;
$$;

create function public.record_visual_task(p_scene_id uuid,p_run_id text,p_task_id uuid,p_estimated_credits numeric) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.scene_executions;
begin
  select x.* into s from public.scene_executions x join public.generation_jobs j on j.id=x.job_id where x.id=p_scene_id and j.visual_run_id=p_run_id and j.status='processing' for update of x;
  if not found or s.submission_started_at is null then return false; end if;
  if s.provider_task_id is not null then return s.provider_task_id=p_task_id; end if;
  update public.scene_executions set provider_task_id=p_task_id,status='submitted',estimated_credits=coalesce(p_estimated_credits,estimated_credits),updated_at=now() where id=s.id;
  return true;
end;
$$;

create function public.record_visual_status(p_scene_id uuid,p_run_id text,p_status text,p_credits numeric,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.scene_executions;
begin
  select x.* into s from public.scene_executions x join public.generation_jobs j on j.id=x.job_id where x.id=p_scene_id and j.visual_run_id=p_run_id and j.status='processing' for update of x;
  if not found then return false; end if;
  if s.status in ('completed','failed','skipped') then return true; end if;
  if p_status not in ('pending','processing','failed') then return false; end if;
  if p_status='processing' and s.provider_task_id is null then return false; end if;
  update public.scene_executions set status=p_status,provider_credits=coalesce(p_credits,provider_credits),cost_measured_at=case when p_credits is not null then now() else cost_measured_at end,error_code=p_error,updated_at=now() where id=s.id;
  return true;
end;
$$;

create function public.complete_visual_scene(p_scene_id uuid,p_run_id text,p_size_bytes bigint,p_etag text) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.scene_executions; key text;
begin
  select x.* into s from public.scene_executions x join public.generation_jobs j on j.id=x.job_id where x.id=p_scene_id and j.visual_run_id=p_run_id and j.status='processing' for update of x;
  if not found or s.provider_task_id is null then return false; end if;
  if s.status='completed' then return true; end if;
  if s.status not in ('submitted','processing') then return false; end if;
  key := 'users/'||s.owner_user_id||'/projects/'||s.project_id||'/generations/'||s.job_id||'/scenes/'||s.id||'.mp4';
  insert into public.scene_assets(id,scene_execution_id,job_id,owner_user_id,project_id,storage_key,mime_type,size_bytes,verified_etag)
    values(s.id,s.id,s.job_id,s.owner_user_id,s.project_id,key,'video/mp4',p_size_bytes,p_etag) on conflict(id) do nothing;
  update public.scene_executions set status='completed',output_asset_id=s.id,error_code=null,completed_at=now(),updated_at=now() where id=s.id;
  return true;
end;
$$;

create function public.finish_visual_generation(p_job_id uuid,p_run_id text) returns text
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.visual_run_id is distinct from p_run_id then return 'invalid'; end if;
  if j.visuals_ready_at is not null then return 'visuals_ready'; end if;
  if j.status<>'processing' then return 'terminal'; end if;
  if not exists(select 1 from public.scene_executions where job_id=j.id) then return 'pending'; end if;
  if not exists(select 1 from public.scene_executions where job_id=j.id and status not in ('completed','skipped')) then
    update public.generation_jobs set visuals_ready_at=now(),visuals_pending_at=null where id=j.id;
    return 'visuals_ready';
  end if;
  -- Partial usable output, unsupported requirements or uncertain tasks keep the
  -- reservation. Only definitive total stage failure releases it via existing trigger.
  if not exists(select 1 from public.scene_executions where job_id=j.id and status<>'failed') then
    update public.generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' where id=j.id;
    return 'visuals_failed';
  end if;
  update public.generation_jobs set visuals_pending_at=now() where id=j.id;
  return 'visuals_pending';
end;
$$;

create function public.visual_dispatch_candidates() returns table(job_id uuid)
language sql security definer set search_path='' as $$
  select id from public.generation_jobs where status='processing' and current_stage='planning' and visual_execution_version=1 and production_plan_ready_at is not null and visual_run_id is null order by production_plan_ready_at,id limit 25;
$$;

alter table public.scene_executions enable row level security;
alter table public.scene_assets enable row level security;
revoke all on public.scene_executions,public.scene_assets from public,anon,authenticated,service_role;
grant select on public.scene_executions,public.scene_assets to service_role;
revoke all on function public.guard_visual_job(), public.claim_visual_generation(uuid,text),public.prepare_visual_scenes(uuid,text,jsonb),public.begin_visual_submission(uuid,text),public.record_visual_task(uuid,text,uuid,numeric),public.record_visual_status(uuid,text,text,numeric,text),public.complete_visual_scene(uuid,text,bigint,text),public.finish_visual_generation(uuid,text),public.visual_dispatch_candidates() from public,anon,authenticated,service_role;
grant execute on function public.claim_visual_generation(uuid,text),public.prepare_visual_scenes(uuid,text,jsonb),public.begin_visual_submission(uuid,text),public.record_visual_task(uuid,text,uuid,numeric),public.record_visual_status(uuid,text,text,numeric,text),public.complete_visual_scene(uuid,text,bigint,text),public.finish_visual_generation(uuid,text),public.visual_dispatch_candidates() to service_role;
commit;
