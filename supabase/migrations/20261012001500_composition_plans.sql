-- Authoritative integer-ms editing contract. No rendering or settlement.
begin;
alter table public.generation_jobs add column composition_run_id text;
alter table public.generation_jobs add column composition_started_at timestamptz;
alter table public.generation_jobs add column composition_pending_at timestamptz;
alter table public.generation_jobs add column composition_ready_at timestamptz;
alter table public.generation_jobs add column composition_configuration jsonb;
alter table public.generation_jobs add constraint generation_jobs_id_owner_project_unique unique(id,owner_user_id,project_id);

create table public.composition_asset_checks (
  asset_kind text not null check(asset_kind in ('scene_asset','prepared_segment','project_asset','narration_asset')),
  asset_id uuid not null, owner_user_id uuid not null, project_id uuid not null,
  verified_etag text not null check(char_length(verified_etag)>0),
  duration_ms integer check(duration_ms between 1 and 600000),
  issue text check(issue in ('VISUAL_UNAVAILABLE','NARRATION_UNAVAILABLE','DURATION_UNAVAILABLE')),
  checked_at timestamptz not null default now(), primary key(asset_kind,asset_id),
  foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id)
);
create table public.composition_plans (
  job_id uuid primary key, owner_user_id uuid not null, project_id uuid not null,
  schema_version integer not null check(schema_version=1), input_digest text not null check(input_digest ~ '^[a-f0-9]{32}$'),
  status text not null check(status in ('ready','conflict')), plan jsonb not null check(jsonb_typeof(plan)='object'),
  created_at timestamptz not null default now(),
  foreign key(job_id,owner_user_id,project_id) references public.generation_jobs(id,owner_user_id,project_id)
);
create trigger composition_checks_immutable before update or delete on public.composition_asset_checks for each row execute function public.immutable_accounting_record();
create trigger composition_plans_immutable before update or delete on public.composition_plans for each row execute function public.immutable_accounting_record();
alter table public.composition_asset_checks enable row level security;
alter table public.composition_plans enable row level security;
revoke all on public.composition_asset_checks,public.composition_plans from public,anon,authenticated,service_role;
grant select on public.composition_asset_checks,public.composition_plans to service_role;

-- Resolve references from persisted execution rows, never caller-supplied IDs.
-- Shared prepared segments/reuse uploads are scoped to the owning project;
-- generated visual and narration outputs are additionally scoped to this job.
create function public.composition_asset_ref(p_scene_id uuid,p_track text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.scene_executions; a record;
begin
  select * into s from public.scene_executions where id=p_scene_id;
  if not found then return null; end if;
  if p_track='narration' then
    select 'narration_asset'::text kind,n.id,n.storage_key,n.verified_etag,n.size_bytes,n.mime_type,n.duration_ms,false is_static into a
    from public.narration_assets n join public.narration_segments t on t.id=n.narration_segment_id
    where t.scene_execution_id=s.id and t.status='completed' and t.output_asset_id=n.id and n.job_id=s.job_id and n.owner_user_id=s.owner_user_id and n.project_id=s.project_id;
  elsif p_track='visual' and s.operation='reuse' and s.prepared_asset_id is not null then
    select 'prepared_segment'::text kind,n.id,n.storage_key,n.verified_etag,n.size_bytes,n.mime_type,n.duration_ms,false is_static into a from public.prepared_segments n
    where n.id=s.prepared_asset_id and n.status='completed' and n.source_asset_id=s.input_asset_id and n.owner_user_id=s.owner_user_id and n.project_id=s.project_id and s.status in ('completed','skipped');
  elsif p_track='visual' and s.operation='reuse' and not s.preparation_required then
    select 'project_asset'::text kind,n.id,n.storage_key,n.verified_etag,n.size_bytes,n.mime_type,null::integer duration_ms,(n.media_type='image') is_static into a from public.project_assets n
    where n.id=s.input_asset_id and n.upload_status='uploaded' and n.media_type in ('image','video') and n.owner_user_id=s.owner_user_id and n.project_id=s.project_id and s.status in ('completed','skipped');
  elsif p_track='visual' and s.operation<>'reuse' then
    select 'scene_asset'::text kind,n.id,n.storage_key,n.verified_etag,n.size_bytes,n.mime_type,null::integer duration_ms,false is_static into a from public.scene_assets n
    where n.id=s.output_asset_id and n.scene_execution_id=s.id and n.job_id=s.job_id and n.owner_user_id=s.owner_user_id and n.project_id=s.project_id and s.status='completed';
  else return null;
  end if;
  if not found or a.verified_etag is null then return null; end if;
  return to_jsonb(a);
end;
$$;

create function public.claim_composition_generation(p_job_id uuid,p_run_id text,p_configuration jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs;
begin
  if p_run_id is null or char_length(p_run_id) not between 1 and 200 or p_configuration is null or
    p_configuration->>'schema_version' is distinct from '1' or p_configuration->>'technical_tolerance_ms' is distinct from '0' or
    coalesce(p_configuration->>'narration_offset_ms','') !~ '^[0-9]{1,4}$' or (p_configuration->>'narration_offset_ms')::integer>1000 or
    (select count(*) from jsonb_object_keys(p_configuration))<>3 then return 'invalid'; end if;
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.audio_ready_at is null or j.visuals_ready_at is null then return 'invalid'; end if;
  if exists(select 1 from public.composition_plans where job_id=j.id) then return 'terminal'; end if;
  if j.status<>'processing' or j.current_stage<>'voice' or not exists(select 1 from public.generation_reservations where job_id=j.id and owner_user_id=j.owner_user_id and state='reserved') then return 'invalid'; end if;
  if j.composition_run_id is not null then return case when j.composition_run_id=p_run_id then 'resumed' else 'duplicate' end; end if;
  update public.generation_jobs set composition_run_id=p_run_id,composition_started_at=now(),composition_configuration=p_configuration where id=j.id;
  return 'claimed';
end;
$$;

create function public.record_composition_asset_check(p_job_id uuid,p_run_id text,p_scene_id uuid,p_track text,p_duration_ms integer,p_issue text) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs; a jsonb;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.composition_run_id is distinct from p_run_id or j.composition_run_id is null or j.status<>'processing' or j.audio_ready_at is null or
    exists(select 1 from public.composition_plans where job_id=j.id) or
    not exists(select 1 from public.scene_executions where id=p_scene_id and job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id) or
    not exists(select 1 from public.generation_reservations where job_id=j.id and state='reserved') then return false; end if;
  a:=public.composition_asset_ref(p_scene_id,p_track);
  if a is null or p_track not in ('visual','narration') then return false; end if;
  if p_issue is not null and p_issue not in ('VISUAL_UNAVAILABLE','NARRATION_UNAVAILABLE','DURATION_UNAVAILABLE') then return false; end if;
  if p_issue is null and ((not (a->>'is_static')::boolean and (p_duration_ms is null or p_duration_ms not between 1 and 600000)) or
    ((a->>'is_static')::boolean and p_duration_ms is not null) or
    (a->>'duration_ms' is not null and (a->>'duration_ms')::integer is distinct from p_duration_ms)) then return false; end if;
  insert into public.composition_asset_checks(asset_kind,asset_id,owner_user_id,project_id,verified_etag,duration_ms,issue)
    values(a->>'kind',(a->>'id')::uuid,j.owner_user_id,j.project_id,a->>'verified_etag',p_duration_ms,p_issue)
    on conflict(asset_kind,asset_id) do nothing;
  return true;
end;
$$;

-- This is the planner: SQL constructs the entire contract from immutable rows.
-- The caller cannot submit a timeline, readiness flag, asset IDs or issue list.
create function public.finish_composition_generation(p_job_id uuid,p_run_id text) returns text
language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs; production jsonb; original jsonb; s public.scene_executions; a jsonb; c public.composition_asset_checks;
  scenes jsonb:='[]'; issues jsonb:='[]'; entry jsonb; visual jsonb; narration jsonb; before_count integer;
  cursor_ms integer:=0; duration_ms integer; offset_ms integer; speech_ms integer; input_start_ms integer; transition text; plan jsonb;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then return 'invalid'; end if;
  if exists(select 1 from public.composition_plans where job_id=j.id) then return 'reused'; end if;
  if j.composition_run_id is null or j.composition_run_id is distinct from p_run_id or j.status<>'processing' or j.audio_ready_at is null or
    not exists(select 1 from public.generation_reservations where job_id=j.id and owner_user_id=j.owner_user_id and state='reserved') then return 'invalid'; end if;
  select p.plan into production from public.generation_plans p where p.job_id=j.id and p.owner_user_id=j.owner_user_id;
  if production is null then return 'invalid'; end if;
  offset_ms:=(j.composition_configuration->>'narration_offset_ms')::integer;
  for s in select * from public.scene_executions where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id order by scene_order loop
    before_count:=jsonb_array_length(issues); original:=production->'scenePlan'->(s.scene_order-1);
    -- Seconds exist only at this legacy production-plan compatibility boundary.
    duration_ms:=round(s.duration_seconds*1000)::integer;
    if duration_ms<=0 or original is null or (original->>'order')::integer is distinct from s.scene_order or round((original->>'durationSeconds')::numeric*1000)::integer is distinct from duration_ms or s.scene_order<>jsonb_array_length(scenes)+1 then
      issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code','PLAN_MISMATCH'));
    end if;
    visual:=null; narration:=null; a:=public.composition_asset_ref(s.id,'visual');
    input_start_ms:=case when a->>'kind'='project_asset' and not (a->>'is_static')::boolean then coalesce(s.source_start_ms,round(s.source_start*1000),0)::integer else 0 end;
    if input_start_ms<0 then issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code','PLAN_MISMATCH')); end if;
    if a is null then issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code','VISUAL_UNAVAILABLE'));
    else
      select * into c from public.composition_asset_checks where asset_kind=a->>'kind' and asset_id=(a->>'id')::uuid and owner_user_id=j.owner_user_id and project_id=j.project_id and verified_etag=a->>'verified_etag';
      if not found then issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code','ASSET_UNCHECKED'));
      elsif c.issue is not null then issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code',c.issue));
      elsif not (a->>'is_static')::boolean and (c.duration_ms is null or c.duration_ms<input_start_ms+duration_ms or
        (a->>'kind'='project_asset' and coalesce(s.source_end_ms,round(s.source_end*1000),0)<input_start_ms+duration_ms)) then
        issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code',case when c.duration_ms is null then 'DURATION_UNAVAILABLE' else 'VISUAL_TOO_SHORT' end));
      end if;
      visual:=jsonb_build_object('asset_kind',a->>'kind','asset_id',a->>'id','media_type',case when (a->>'is_static')::boolean then 'image' else 'video' end,'actual_duration_ms',c.duration_ms,'input_start_ms',input_start_ms,'input_end_ms',input_start_ms+duration_ms);
    end if;
    if original->>'narration' is not null then
      a:=public.composition_asset_ref(s.id,'narration');
      if a is null then issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code','NARRATION_UNAVAILABLE'));
      else
        select * into c from public.composition_asset_checks where asset_kind=a->>'kind' and asset_id=(a->>'id')::uuid and owner_user_id=j.owner_user_id and project_id=j.project_id and verified_etag=a->>'verified_etag';
        if not found then issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code','ASSET_UNCHECKED'));
        elsif c.issue is not null then issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code',c.issue)); end if;
        speech_ms:=(a->>'duration_ms')::integer;
        if offset_ms+speech_ms>duration_ms then issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code','NARRATION_TOO_LONG')); end if;
        narration:=jsonb_build_object('asset_id',a->>'id','start_offset_ms',offset_ms,'actual_duration_ms',speech_ms,'start_ms',cursor_ms+offset_ms,'end_ms',cursor_ms+offset_ms+speech_ms,'trailing_silence_ms',greatest(0,duration_ms-offset_ms-speech_ms));
      end if;
    end if;
    transition:=lower(btrim(coalesce(nullif(original->>'transition',''),'cut')));
    if transition not in ('none','cut','hard cut','direct cut') then
      issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',s.scene_order,'code','UNSUPPORTED_TRANSITION'));
    end if;
    entry:=jsonb_build_object('scene_execution_id',s.id,'scene_order',s.scene_order,'start_ms',cursor_ms,'end_ms',cursor_ms+duration_ms,'duration_ms',duration_ms,'visual',visual,'narration',narration,
      'transition',jsonb_build_object('type',case when transition='none' then 'none' else 'cut' end,'duration_ms',0),'timing_status',case when jsonb_array_length(issues)=before_count then 'valid' else 'conflict' end);
    scenes:=scenes||jsonb_build_array(entry); cursor_ms:=cursor_ms+duration_ms;
  end loop;
  if cursor_ms<>(production->>'targetDuration')::integer*1000 or cursor_ms<>(j.input_snapshot->'settings'->>'duration')::integer*1000 or production->>'aspectRatio' is distinct from j.input_snapshot->'settings'->>'aspectRatio' or jsonb_array_length(scenes)<>jsonb_array_length(production->'scenePlan') then
    issues:=issues||jsonb_build_array(jsonb_build_object('scene_order',0,'code','TOTAL_MISMATCH')); end if;
  plan:=jsonb_build_object('schema_version',1,'generation_job_id',j.id,'aspect_ratio',production->>'aspectRatio','configuration',j.composition_configuration,'total_duration_ms',cursor_ms,'status',case when jsonb_array_length(issues)=0 then 'ready' else 'conflict' end,'issues',issues,'scenes',scenes);
  insert into public.composition_plans(job_id,owner_user_id,project_id,schema_version,input_digest,status,plan)
    values(j.id,j.owner_user_id,j.project_id,1,md5(jsonb_build_object('production',production,'composition',plan)::text),plan->>'status',plan);
  update public.generation_jobs set composition_ready_at=case when jsonb_array_length(issues)=0 then now() end,composition_pending_at=case when jsonb_array_length(issues)>0 then now() end where id=j.id;
  return plan->>'status';
end;
$$;

create function public.guard_composition_job() returns trigger language plpgsql set search_path='' as $$
begin
  if (old.composition_run_id is not null and new.composition_run_id is distinct from old.composition_run_id) or
    (old.composition_started_at is not null and new.composition_started_at is distinct from old.composition_started_at) or
    (old.composition_configuration is not null and new.composition_configuration is distinct from old.composition_configuration) or
    (old.composition_ready_at is not null and new.composition_ready_at is distinct from old.composition_ready_at) or
    (old.composition_pending_at is not null and new.composition_pending_at is distinct from old.composition_pending_at) then raise exception 'Composition provenance is immutable.'; end if;
  if new.composition_ready_at is not null and not exists(select 1 from public.composition_plans where job_id=new.id and status='ready') then raise exception 'Composition is not ready.'; end if;
  if new.current_stage='rendering' and old.current_stage is distinct from 'rendering' and
    (new.audio_ready_at is not null or new.composition_run_id is not null) and
    (new.composition_ready_at is null or not exists(select 1 from public.composition_plans where job_id=new.id and status='ready')) then
    raise exception 'Validated composition is required before rendering.';
  end if;
  return new;
end;
$$;
create trigger generation_composition_guard before update on public.generation_jobs for each row execute function public.guard_composition_job();
create function public.composition_dispatch_candidates() returns table(job_id uuid)
language sql security definer set search_path='' as $$
  select j.id from public.generation_jobs j where j.status='processing' and j.current_stage='voice' and j.audio_ready_at is not null and j.composition_run_id is null
    and exists(select 1 from public.generation_reservations r where r.job_id=j.id and r.state='reserved') order by j.created_at limit 50;
$$;
revoke all on function public.composition_asset_ref(uuid,text),public.claim_composition_generation(uuid,text,jsonb),public.record_composition_asset_check(uuid,text,uuid,text,integer,text),public.finish_composition_generation(uuid,text),public.guard_composition_job(),public.composition_dispatch_candidates() from public,anon,authenticated;
grant execute on function public.composition_asset_ref(uuid,text),public.claim_composition_generation(uuid,text,jsonb),public.record_composition_asset_check(uuid,text,uuid,text,integer,text),public.finish_composition_generation(uuid,text),public.guard_composition_job(),public.composition_dispatch_candidates() to service_role;
commit;
