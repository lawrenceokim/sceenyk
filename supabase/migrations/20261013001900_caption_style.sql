-- Persist a controlled appearance selection beside the existing enabled choice.
-- No caption timing, renderer, provider or accounting mutation.
begin;
alter table public.caption_preferences add column if not exists style jsonb not null default
  '{"schema_version":1,"preset":"default","position":"bottom","size":"normal","alignment":"center","contrast":"default"}'::jsonb;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='caption_preferences_style_contract' and conrelid='public.caption_preferences'::regclass) then
    alter table public.caption_preferences add constraint caption_preferences_style_contract check (
      jsonb_typeof(style)='object' and
      style ?& array['schema_version','preset','position','size','alignment','contrast'] and
      style - 'schema_version' - 'preset' - 'position' - 'size' - 'alignment' - 'contrast'='{}'::jsonb and
      style->'schema_version'='1'::jsonb and
      jsonb_typeof(style->'preset')='string' and
      jsonb_typeof(style->'position')='string' and
      jsonb_typeof(style->'size')='string' and
      jsonb_typeof(style->'alignment')='string' and
      jsonb_typeof(style->'contrast')='string' and
      style->>'preset' in ('default','clean','bold') and
      style->>'position' in ('bottom','top') and
      style->>'size' in ('normal','large') and
      style->>'alignment' in ('center','left') and
      style->>'contrast' in ('default','high','shadow')
    );
  end if;
end $$;

create or replace function public.set_caption_style(p_owner_user_id uuid,p_job_id uuid,p_project_id uuid,p_style jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_style is null or jsonb_typeof(p_style)<>'object' or
    not (p_style ?& array['schema_version','preset','position','size','alignment','contrast']) or
    p_style - 'schema_version' - 'preset' - 'position' - 'size' - 'alignment' - 'contrast'<>'{}'::jsonb or
    p_style->'schema_version' is distinct from '1'::jsonb or
    jsonb_typeof(p_style->'preset') is distinct from 'string' or
    jsonb_typeof(p_style->'position') is distinct from 'string' or
    jsonb_typeof(p_style->'size') is distinct from 'string' or
    jsonb_typeof(p_style->'alignment') is distinct from 'string' or
    jsonb_typeof(p_style->'contrast') is distinct from 'string' or
    coalesce(p_style->>'preset','') not in ('default','clean','bold') or
    coalesce(p_style->>'position','') not in ('bottom','top') or
    coalesce(p_style->>'size','') not in ('normal','large') or
    coalesce(p_style->>'alignment','') not in ('center','left') or
    coalesce(p_style->>'contrast','') not in ('default','high','shadow') or
    not exists(select 1 from public.caption_tracks t join public.generation_jobs j
      on j.id=t.job_id and j.owner_user_id=t.owner_user_id and j.project_id=t.project_id
      join public.projects p on p.id=j.project_id and p.owner_user_id=j.owner_user_id
      where t.job_id=p_job_id and t.project_id=p_project_id and t.owner_user_id=p_owner_user_id
        and t.track->>'status'='ready') then return false; end if;
  insert into public.caption_preferences(job_id,owner_user_id,project_id,style)
    values(p_job_id,p_owner_user_id,p_project_id,p_style)
    on conflict(job_id) do update set style=excluded.style
      where public.caption_preferences.style is distinct from excluded.style;
  return true;
end;
$$;
revoke all on function public.set_caption_style(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_caption_style(uuid,uuid,uuid,jsonb) to service_role;
commit;
