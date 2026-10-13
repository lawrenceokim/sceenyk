-- Structured captions only. No provider, render or accounting transitions.
begin;
create table public.caption_tracks (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique,
  owner_user_id uuid not null, project_id uuid not null,
  input_digest text not null check(input_digest ~ '^[a-f0-9]{32}$'),
  track jsonb not null check(jsonb_typeof(track)='object'),
  created_at timestamptz not null default now(),
  foreign key(job_id,owner_user_id,project_id) references public.generation_jobs(id,owner_user_id,project_id)
);
create table public.caption_preferences (
  job_id uuid primary key, owner_user_id uuid not null, project_id uuid not null,
  enabled boolean not null default true,
  foreign key(job_id,owner_user_id,project_id) references public.generation_jobs(id,owner_user_id,project_id)
);
create trigger caption_tracks_immutable before update or delete on public.caption_tracks
  for each row execute function public.immutable_accounting_record();
alter table public.caption_tracks enable row level security;
alter table public.caption_preferences enable row level security;
revoke all on public.caption_tracks,public.caption_preferences from public,anon,authenticated,service_role;
grant select on public.caption_tracks,public.caption_preferences to service_role;

-- Only persisted, completed owned speech linked by the immutable composition
-- is supplied to the application. No object keys or provider metadata.
create function public.caption_source(p_job_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('plan',c.plan,'narration',coalesce((
    select jsonb_agg(jsonb_build_object('id',n.id,'scene_execution_id',n.scene_execution_id,
      'scene_order',n.scene_order,'output_asset_id',n.output_asset_id,
      'actual_duration_ms',n.actual_duration_ms,'text',n.text) order by n.scene_order)
    from public.narration_segments n join public.narration_assets a on a.id=n.output_asset_id
    where n.job_id=c.job_id and n.owner_user_id=c.owner_user_id and n.project_id=c.project_id
      and a.job_id=c.job_id and a.owner_user_id=c.owner_user_id and a.project_id=c.project_id
      and a.narration_segment_id=n.id and a.duration_ms=n.actual_duration_ms and n.status='completed'
  ),'[]'::jsonb)) from public.composition_plans c where c.job_id=p_job_id and c.status='ready';
$$;

create function public.persist_caption_track(p_job_id uuid,p_track jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.composition_plans; source jsonb; item jsonb; scene jsonb; speech jsonb;
  previous_end integer:=0; cue_count integer:=0; expected_order integer:=1;
  start_ms integer; end_ms integer; duration_ms integer; saved_id uuid; digest text; joined_text text;
  word text; line_length integer; line_count integer;
begin
  -- A job lock makes simultaneous deliveries return one immutable track.
  perform 1 from public.generation_jobs where id=p_job_id for update;
  select * into c from public.composition_plans where job_id=p_job_id and status='ready';
  if not found then return null; end if;
  source:=public.caption_source(p_job_id);
  digest:=md5(source::text || (p_track->'configuration')::text);
  select id into saved_id from public.caption_tracks where job_id=p_job_id and input_digest=digest;
  if found then return saved_id; end if;
  if p_track is null or jsonb_typeof(p_track)<>'object' or
    (select count(*) from jsonb_object_keys(p_track))<>10 or
    p_track->>'schema_version' is distinct from '1' or p_track->>'composition_version' is distinct from '1' or
    p_track->>'generation_job_id' is distinct from p_job_id::text or
    p_track->>'alignment' is distinct from 'estimated_phrase' or
    coalesce(p_track->>'status','') not in ('ready','timing_issue') or
    p_track->'total_duration_ms' is distinct from c.plan->'total_duration_ms' or
    p_track->'aspect_ratio' is distinct from c.plan->'aspect_ratio' or
    jsonb_typeof(p_track->'cues') is distinct from 'array' or jsonb_array_length(p_track->'cues')>2000 or
    jsonb_typeof(p_track->'configuration') is distinct from 'object' or
    p_track->'configuration'->>'schema_version' is distinct from '1' or
    (select count(*) from jsonb_object_keys(p_track->'configuration'))<>6 or
    exists(select 1 from jsonb_each(p_track->'configuration') where value::text !~ '^[0-9]{1,6}$') or
    not (p_track->'configuration' ?& array['schema_version','preferred_words','line_characters','min_duration_ms','max_duration_ms','max_lines']) or
    (p_track->'configuration'->>'min_duration_ms')::integer<1 or
    (p_track->'configuration'->>'max_duration_ms')::integer<(p_track->'configuration'->>'min_duration_ms')::integer or
    (select count(distinct value->>'id') from jsonb_array_elements(p_track->'cues'))<>jsonb_array_length(p_track->'cues') then raise exception 'Invalid caption contract.'; end if;
  if p_track->>'status'='timing_issue' then
    if coalesce(p_track->>'issue','') not in ('SOURCE_MISMATCH','READABILITY_LIMIT','TIMING_LIMIT') or jsonb_array_length(p_track->'cues')<>0 then raise exception 'Invalid caption issue.'; end if;
  else
    if p_track->'issue' is distinct from 'null'::jsonb then raise exception 'Invalid caption readiness.'; end if;
    for item in select value from jsonb_array_elements(p_track->'cues') loop
      if (select count(*) from jsonb_object_keys(item))<>9 or
        item->>'generation_job_id' is distinct from p_job_id::text or
        item->>'text' is null or btrim(item->>'text')='' or char_length(item->>'text')>4000 or
        item->>'text' ~ '[[:cntrl:]]|https?://' or
        coalesce(item->>'start_ms','') !~ '^[0-9]{1,6}$' or coalesce(item->>'end_ms','') !~ '^[0-9]{1,6}$' or
        item->>'cue_order' is distinct from expected_order::text then raise exception 'Invalid caption cue.'; end if;
      start_ms:=(item->>'start_ms')::integer; end_ms:=(item->>'end_ms')::integer; duration_ms:=end_ms-start_ms;
      if item->>'id' !~ '^s[0-9]+-c[0-9]+$' or jsonb_typeof(item->'text')<>'string' or
        item->>'text'<>btrim(regexp_replace(item->>'text','\s+',' ','g')) then raise exception 'Invalid caption text.'; end if;
      line_count:=1; line_length:=0;
      for word in select regexp_split_to_table(item->>'text',' ') loop
        if char_length(word)>(p_track->'configuration'->>'line_characters')::integer then raise exception 'Unreadable caption token.'; end if;
        if line_length>0 and line_length+1+char_length(word)>(p_track->'configuration'->>'line_characters')::integer then
          line_count:=line_count+1; line_length:=char_length(word);
        else line_length:=line_length+case when line_length>0 then 1 else 0 end+char_length(word); end if;
      end loop;
      if line_count>(p_track->'configuration'->>'max_lines')::integer then raise exception 'Unreadable caption cue.'; end if;
      select value into scene from jsonb_array_elements(c.plan->'scenes') where value->>'scene_execution_id'=item->>'scene_id';
      select value into speech from jsonb_array_elements(source->'narration') where value->>'id'=item->>'narration_id';
      if scene is null or speech is null or scene->'narration'='null'::jsonb or
        item->>'scene_order' is distinct from scene->>'scene_order' or
        speech->>'scene_execution_id' is distinct from item->>'scene_id' or
        speech->>'output_asset_id' is distinct from scene->'narration'->>'asset_id' or
        speech->'actual_duration_ms' is distinct from scene->'narration'->'actual_duration_ms' or
        start_ms<previous_end or end_ms<=start_ms or
        start_ms<(scene->'narration'->>'start_ms')::integer or end_ms>(scene->'narration'->>'end_ms')::integer or
        end_ms>(c.plan->>'total_duration_ms')::integer or
        duration_ms<(p_track->'configuration'->>'min_duration_ms')::integer or
        duration_ms>(p_track->'configuration'->>'max_duration_ms')::integer then raise exception 'Invalid caption timing or ownership.'; end if;
      previous_end:=end_ms; expected_order:=expected_order+1;
    end loop;
    for scene in select value from jsonb_array_elements(c.plan->'scenes') loop
      select count(*),string_agg(value->>'text',' ' order by (value->>'cue_order')::integer),
        min((value->>'start_ms')::integer),max((value->>'end_ms')::integer),sum((value->>'end_ms')::integer-(value->>'start_ms')::integer)
        into cue_count,joined_text,start_ms,end_ms,duration_ms
        from jsonb_array_elements(p_track->'cues') where value->>'scene_id'=scene->>'scene_execution_id';
      if scene->'narration'='null'::jsonb then
        if cue_count<>0 then raise exception 'Silent scene captions.'; end if;
      else
        select value into speech from jsonb_array_elements(source->'narration') where value->>'scene_execution_id'=scene->>'scene_execution_id';
        if speech is null or cue_count=0 or
          joined_text is distinct from btrim(regexp_replace(speech->>'text','\s+',' ','g')) or
          start_ms<>(scene->'narration'->>'start_ms')::integer or end_ms<>(scene->'narration'->>'end_ms')::integer or
          duration_ms<>end_ms-start_ms then raise exception 'Incomplete caption source.'; end if;
      end if;
    end loop;
  end if;
  insert into public.caption_tracks(job_id,owner_user_id,project_id,input_digest,track)
    values(p_job_id,c.owner_user_id,c.project_id,digest,p_track) returning id into saved_id;
  return saved_id;
end;
$$;

create function public.set_caption_preference(p_owner_user_id uuid,p_job_id uuid,p_project_id uuid,p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_enabled is null or not exists(select 1 from public.generation_jobs j join public.projects p on p.id=j.project_id and p.owner_user_id=j.owner_user_id
    where j.id=p_job_id and j.project_id=p_project_id and j.owner_user_id=p_owner_user_id) then return false; end if;
  insert into public.caption_preferences(job_id,owner_user_id,project_id,enabled) values(p_job_id,p_owner_user_id,p_project_id,p_enabled)
    on conflict(job_id) do update set enabled=excluded.enabled;
  return true;
end;
$$;
create function public.caption_dispatch_candidates() returns table(job_id uuid)
language sql security definer set search_path='' as $$
  select c.job_id from public.composition_plans c where c.status='ready'
    and not exists(select 1 from public.caption_tracks t where t.job_id=c.job_id) order by c.created_at limit 20;
$$;
revoke all on function public.caption_source(uuid),public.persist_caption_track(uuid,jsonb),public.set_caption_preference(uuid,uuid,uuid,boolean),public.caption_dispatch_candidates() from public,anon,authenticated;
grant execute on function public.caption_source(uuid),public.persist_caption_track(uuid,jsonb),public.set_caption_preference(uuid,uuid,uuid,boolean),public.caption_dispatch_candidates() to service_role;
commit;
