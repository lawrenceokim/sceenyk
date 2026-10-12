-- Generalize visual provider metadata without replacing scenes/plans/accounting.
begin;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.scene_executions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%provider%' and pg_get_constraintdef(oid) like '%runway%' loop
 execute format('alter table public.scene_executions drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.scene_executions alter column provider_task_id type text using provider_task_id::text;
alter table public.scene_executions alter column provider_cost_usd drop expression;
alter table public.scene_executions add constraint visual_provider_supported check(provider in ('runway','fal'));
alter table public.scene_executions add constraint visual_operation_provider check((operation='reuse' and provider is null and model is null and provider_task_id is null) or (operation<>'reuse' and provider in ('runway','fal') and model is not null));
alter table public.scene_executions add constraint visual_request_id_valid check(provider_task_id is null or provider_task_id ~ '^[a-zA-Z0-9_-]{1,200}$');
alter table public.scene_executions add column estimated_cost_usd numeric check(estimated_cost_usd>=0);
alter table public.scene_executions add column pricing_snapshot jsonb not null default '{}' check(jsonb_typeof(pricing_snapshot)='object');
alter table public.scene_executions add column provider_usage jsonb not null default '{}' check(jsonb_typeof(provider_usage)='object');
create or replace function public.prepare_visual_scenes(p_job_id uuid,p_run_id text,p_scenes jsonb) returns boolean
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
    values(j.id,j.owner_user_id,j.project_id,(s->>'scene_order')::integer,s->>'operation',case when s->>'operation'<>'reuse' then 'fal' end,s->>'model',s->>'prompt',(s->>'duration_seconds')::numeric,s->>'resolution',(s->>'input_asset_id')::uuid,(s->>'source_start')::numeric,(s->>'source_end')::numeric,(s->>'estimated_credits')::numeric,s->>'error_code',case when s->>'operation'='reuse' then 'completed' else 'pending' end,case when s->>'operation'='reuse' then now() end);
    update public.scene_executions set estimated_cost_usd=(s->>'estimated_cost_usd')::numeric,pricing_snapshot=coalesce(s->'pricing_snapshot','{}'::jsonb) where job_id=j.id and scene_order=(s->>'scene_order')::integer;
  end loop;
  return true;
end;
$$;

create or replace function public.record_visual_status(p_scene_id uuid,p_run_id text,p_status text,p_credits numeric,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.scene_executions;
begin
  select x.* into s from public.scene_executions x join public.generation_jobs j on j.id=x.job_id where x.id=p_scene_id and j.visual_run_id=p_run_id and j.status='processing' for update of x;
  if not found then return false; end if;
  if s.status in ('completed','failed','skipped') then return true; end if;
  if p_status not in ('pending','processing','failed') then return false; end if;
  if p_status='processing' and s.provider_task_id is null then return false; end if;
  update public.scene_executions set status=p_status,provider_credits=case when provider='runway' then coalesce(p_credits,provider_credits) else provider_credits end,provider_cost_usd=case when provider='runway' then coalesce(p_credits,provider_credits)*0.01 else provider_cost_usd end,cost_measured_at=case when p_credits is not null then now() else cost_measured_at end,error_code=p_error,updated_at=now() where id=s.id;
  return true;
end;
$$;


-- New paid submissions are fal-only. Historical Runway rows remain intact.
create or replace function public.begin_visual_submission(p_scene_id uuid,p_run_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.scene_executions s set submission_started_at=now(),submission_attempts=submission_attempts+1,error_code=null,updated_at=now()
 from public.generation_jobs j where s.id=p_scene_id and j.id=s.job_id and j.visual_run_id=p_run_id and j.status='processing' and s.provider='fal'
 and s.status='pending' and (s.error_code is null or s.error_code='RATE_LIMIT') and s.submission_started_at is null and s.provider_task_id is null and s.submission_attempts<3;
 return found;
end; $$;
drop function public.record_visual_task(uuid,text,uuid,numeric);
create function public.record_visual_task(p_scene_id uuid,p_run_id text,p_task_id text,p_estimated_credits numeric) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.scene_executions;
begin
 select x.* into s from public.scene_executions x join public.generation_jobs j on j.id=x.job_id where x.id=p_scene_id and j.visual_run_id=p_run_id and j.status='processing' and x.provider='fal' for update of x;
 if not found or s.submission_started_at is null then return false; end if;
 if s.provider_task_id is not null then return s.provider_task_id=p_task_id; end if;
 update public.scene_executions set provider_task_id=p_task_id,status='submitted',updated_at=now() where id=s.id;
 return true;
end; $$;
create function public.record_visual_usage(p_scene_id uuid,p_run_id text,p_usage jsonb,p_estimated_usd numeric) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_usage) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_usage) k where k not in ('outputDuration','width','height','fps','numFrames','nativeAudio','costBasis')) or p_estimated_usd<0 then return false; end if;
 update public.scene_executions s set provider_usage=p_usage,estimated_cost_usd=coalesce(p_estimated_usd,estimated_cost_usd),cost_measured_at=now(),updated_at=now()
 from public.generation_jobs j where s.id=p_scene_id and j.id=s.job_id and j.visual_run_id=p_run_id and j.status='processing' and s.provider='fal' and s.provider_task_id is not null;
 return found;
end; $$;
revoke all on function public.record_visual_task(uuid,text,text,numeric),public.record_visual_usage(uuid,text,jsonb,numeric) from public,anon,authenticated,service_role;
grant execute on function public.record_visual_task(uuid,text,text,numeric),public.record_visual_usage(uuid,text,jsonb,numeric) to service_role;
commit;
