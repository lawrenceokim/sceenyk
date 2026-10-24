-- Manual only after 041/042. Observability only: no job updates, retries,
-- provider submissions, backfill, new table or new workflow stage.
begin;

do $$
declare required record;
begin
  for required in select * from (values
    ('ugc_generation_jobs','id'),('ugc_generation_jobs','status'),('ugc_generation_jobs','stage'),
    ('ugc_generation_jobs','attempt_count'),('ugc_generation_jobs','resume_stage'),
    ('ugc_generation_jobs','lease_expires_at'),
    ('ugc_generation_job_events','job_id'),('ugc_generation_job_events','status'),
    ('ugc_generation_job_events','stage'),('ugc_generation_job_events','event_type'),
    ('ugc_generation_job_events','safe_message'),('ugc_generation_job_events','metadata'),
    ('ugc_character_sheets','job_id'),('ugc_character_sheets','status'),('ugc_character_sheets','document')
  ) v(table_name,column_name) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name) then
      raise exception 'Live progress prerequisite missing: %.%',required.table_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.ugc_checkpoint_character_sheet(uuid,uuid,jsonb,text)') is null
    or to_regprocedure('public.ugc_finish_character_sheet(uuid,uuid)') is null
    or to_regprocedure('public.ugc_resume_character_output(uuid)') is null then
    raise exception 'Apply 041/042 and their prerequisites before 043.';
  end if;
end; $$;

alter table public.ugc_generation_job_events drop constraint if exists ugc_generation_job_events_event_type_check;
alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_event_type_check check(event_type in (
  'enqueued','claimed','stage_changed','failed','completed','cancelled','cancellation_requested','retry_scheduled','released',
  'inputs_validated','development_paused','development_resumed','reference_analyzed','character_progress','character_ready',
  'character_reference.started','character_reference.soul_id_ready',
  'character_reference.front_generating','character_reference.front_ready',
  'character_reference.back_generating','character_reference.back_ready',
  'character_reference.face_generating','character_reference.face_ready',
  'character_reference.composing','character_reference.complete'));

-- Internal-only fixed-copy append helper. Never accepts a user/provider message
-- or arbitrary metadata. Job lock and current lease fence the append; already
-- reached milestones are not repeated on poll/checkpoint/recovery.
create or replace function public.ugc_append_character_progress(p_job_id uuid,p_event text,p_view text default null) returns void
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; message text;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'running' or j.stage<>'character_reference'
    or j.lease_expires_at<=clock_timestamp() then return; end if;
  message:=case p_event
    when 'character_reference.started' then 'Creating character reference.'
    when 'character_reference.soul_id_ready' then 'Soul identity prepared.'
    when 'character_reference.front_generating' then 'Generating the front view.'
    when 'character_reference.front_ready' then 'Front view saved.'
    when 'character_reference.back_generating' then 'Generating the back view.'
    when 'character_reference.back_ready' then 'Back view saved.'
    when 'character_reference.face_generating' then 'Generating the face reference.'
    when 'character_reference.face_ready' then 'Face reference saved.'
    when 'character_reference.composing' then 'Building the character sheet.'
    when 'character_reference.complete' then 'Character reference complete.' end;
  if message is null or (p_view is not null and p_view not in ('front','back','face')) then
    raise exception 'Unsupported character progress event.' using errcode='23514'; end if;
  if not exists(select 1 from public.ugc_generation_job_events where job_id=j.id and event_type=p_event) then
    insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
      values(j.id,j.status,j.stage,p_event,message,
        jsonb_build_object('attempt',j.attempt_count,'resumeStage',j.resume_stage)||
        case when p_view is null then '{}'::jsonb else jsonb_build_object('view',p_view) end);
  end if;
end; $$;

-- These facts commit in the SAME transaction as the existing claim-fenced
-- checkpoint. Ready means a private normalized asset was saved, not merely
-- that the provider reported completion. Existing diagnostics stay untouched.
create or replace function public.ugc_character_progress_events() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb:='{}'::jsonb; view_name text;
begin
  if tg_op='INSERT' then
    perform public.ugc_append_character_progress(new.job_id,'character_reference.started');
  else previous:=old.document; end if;
  if new.document->'operations'->'identity'->>'state'='completed'
    and previous->'operations'->'identity'->>'state' is distinct from 'completed' then
    perform public.ugc_append_character_progress(new.job_id,'character_reference.soul_id_ready');
  end if;
  foreach view_name in array array['front','back','face'] loop
    if new.document->'operations'->view_name is not null and previous->'operations'->view_name is null then
      perform public.ugc_append_character_progress(new.job_id,'character_reference.'||view_name||'_generating',view_name);
    end if;
    if new.document->'assets'->view_name is not null and previous->'assets'->view_name is null then
      perform public.ugc_append_character_progress(new.job_id,'character_reference.'||view_name||'_ready',view_name);
    end if;
  end loop;
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
    perform public.ugc_append_character_progress(new.job_id,'character_reference.complete');
  end if;
  return new;
end; $$;
drop trigger if exists ugc_character_live_progress on public.ugc_character_sheets;
create trigger ugc_character_live_progress after insert or update on public.ugc_character_sheets
  for each row execute function public.ugc_character_progress_events();

-- Retain the exact M5 checkpoint validator/diagnostics and add a composing event
-- only when its real existing "Building character sheet" checkpoint succeeds.
do $$ begin
  if to_regprocedure('public.ugc_checkpoint_character_sheet_m5(uuid,uuid,jsonb,text)') is null then
    alter function public.ugc_checkpoint_character_sheet(uuid,uuid,jsonb,text) rename to ugc_checkpoint_character_sheet_m5;
  end if;
end; $$;
create or replace function public.ugc_checkpoint_character_sheet(p_job_id uuid,p_claim_token uuid,p_document jsonb,p_message text) returns boolean
language plpgsql security definer set search_path='' as $$
declare saved boolean;
begin
  saved:=public.ugc_checkpoint_character_sheet_m5(p_job_id,p_claim_token,p_document,p_message);
  if saved and p_message='Building character sheet' then
    perform public.ugc_append_character_progress(p_job_id,'character_reference.composing');
  end if;
  return saved;
end; $$;
revoke all on function public.ugc_append_character_progress(uuid,text,text),public.ugc_character_progress_events(),
  public.ugc_checkpoint_character_sheet_m5(uuid,uuid,jsonb,text),public.ugc_checkpoint_character_sheet(uuid,uuid,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.ugc_checkpoint_character_sheet(uuid,uuid,jsonb,text) to service_role;

-- No changes to existing RLS, history immutability, job/snapshot identity,
-- execution/claim/cancellation/recovery gates or hosted/local-only guards.
commit;
