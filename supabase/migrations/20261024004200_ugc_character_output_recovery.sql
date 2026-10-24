-- Manual only after 041. Defines an explicit local-operator recovery RPC;
-- applies no job changes, retries, provider calls or data backfills itself.
begin;
do $$
declare required record;
begin
  for required in select * from (values
    ('ugc_generation_jobs','id'),('ugc_generation_jobs','owner_user_id'),('ugc_generation_jobs','project_id'),
    ('ugc_generation_jobs','status'),('ugc_generation_jobs','stage'),('ugc_generation_jobs','resume_stage'),
    ('ugc_generation_jobs','error_code'),('ugc_generation_jobs','safe_error_message'),('ugc_generation_jobs','input_snapshot'),
    ('ugc_generation_jobs','attempt_count'),('ugc_generation_jobs','max_attempts'),('ugc_generation_jobs','failed_at'),
    ('ugc_generation_jobs','retry_eligible'),('ugc_generation_jobs','next_retry_at'),('ugc_generation_jobs','pause_reason'),
    ('ugc_generation_jobs','cancellation_requested_at'),('ugc_generation_jobs','analysis_version'),('ugc_generation_jobs','analysis_model'),
    ('ugc_character_sheets','job_id'),('ugc_character_sheets','status'),('ugc_character_sheets','owner_user_id'),
    ('ugc_character_sheets','project_id'),('ugc_character_sheets','source_asset_id'),('ugc_character_sheets','sheet_version'),
    ('ugc_character_sheets','document'),('ugc_reference_analyses','job_id'),('ugc_reference_analyses','state'),
    ('ugc_reference_analyses','analysis_type'),('ugc_reference_analyses','source_asset_id'),('ugc_reference_analyses','requested_model'),
    ('ugc_reference_analyses','analysis_version'),('ugc_reference_analyses','owner_user_id'),('ugc_reference_analyses','project_id'),
    ('projects','id'),('projects','owner_user_id'),('projects','status')
  ) v(table_name,column_name) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name) then
      raise exception 'Character recovery prerequisite missing: %.%',required.table_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.ugc_finish_character_sheet(uuid,uuid)') is null
    or to_regprocedure('public.ugc_snapshot_matches_records(uuid,uuid,jsonb,boolean)') is null then
    raise exception 'Apply 041 and its prerequisites first.';
  end if;
end; $$;

create or replace function public.ugc_resume_character_output(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; s public.ugc_character_sheets; op record; known_view boolean:=false;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id for update;
  if not found or j.status<>'failed' or j.resume_stage<>'character_reference'
    or j.error_code is distinct from 'CHARACTER_OUTPUT_INVALID' or j.attempt_count>=j.max_attempts
    or j.cancellation_requested_at is not null or j.pause_reason is not null
    or j.input_snapshot->>'schemaVersion' is distinct from '3' or j.analysis_version is distinct from 1 then return false; end if;
  if not exists(select 1 from public.projects p where p.id=j.project_id and p.owner_user_id=j.owner_user_id and p.status='draft')
    or not public.ugc_snapshot_matches_records(j.owner_user_id,j.project_id,j.input_snapshot,false) then return false; end if;
  select * into s from public.ugc_character_sheets where job_id=j.id and owner_user_id=j.owner_user_id
    and project_id=j.project_id for update;
  if not found or s.status<>'preparing' or s.sheet_version<>1
    or s.source_asset_id::text is distinct from j.input_snapshot->'character'->>'assetId'
    or s.document->'operations'->'identity'->>'state' is distinct from 'completed'
    or coalesce(s.document->'operations'->'identity'->>'providerId','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
    or jsonb_typeof(s.document->'operations') is distinct from 'object' then return false; end if;
  if (select count(*) from public.ugc_reference_analyses a where a.job_id=j.id and a.owner_user_id=j.owner_user_id
    and a.project_id=j.project_id and a.state='completed' and a.analysis_version=j.analysis_version
    and a.requested_model=j.analysis_model and a.source_asset_id::text=j.input_snapshot->a.analysis_type->>'assetId')<>2 then return false; end if;
  for op in select * from jsonb_each(s.document->'operations') loop
    if op.key='identity' then continue; end if;
    -- Unknown intents, rejected/terminal operations and unexpected roles do not
    -- qualify. Every submitted view must have the SAME known request to resume.
    if op.key not in ('front','back','face') or op.value->>'state' is null or op.value->>'state' not in ('accepted','completed')
      or coalesce(op.value->>'providerId','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
      or op.value->>'statusUrl' is distinct from 'https://api.higgsfield.ai/requests/'||(op.value->>'providerId')||'/status' then return false; end if;
    known_view:=true;
  end loop;
  if not known_view then return false; end if;
  update public.ugc_generation_jobs set status='queued',stage='character_reference',resume_stage='character_reference',
    failed_at=null,error_code=null,safe_error_message=null,retry_eligible=false,next_retry_at=clock_timestamp()+interval '5 seconds'
    where id=j.id;
  -- Existing append-only trigger emits retry_scheduled. Provider IDs, successful
  -- assets, wardrobe, snapshots and the three-claim attempt budget stay intact.
  return true;
end; $$;
revoke all on function public.ugc_resume_character_output(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ugc_resume_character_output(uuid) to service_role;
commit;
