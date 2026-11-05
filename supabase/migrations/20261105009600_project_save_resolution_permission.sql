-- Manual after 095. Repair the missing grant for the column added by 093.
-- No creative data, generation behavior, RLS policy or function is changed.
begin;

do $$ begin
  if to_regprocedure('public.ugc_v3_character_cast(uuid)') is null then
    raise exception 'Apply 095 after 094 before the project Save permission repair';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='projects' and column_name='video_resolution' and data_type='text' and is_nullable='NO') then
    raise exception 'Verify projects.video_resolution from migration 093 before applying 096';
  end if;
end $$;

-- Match the existing column-scoped server grants in 002 and 032. No table-wide
-- UPDATE, browser access, ownership/status mutation or studio_mode grant.
grant update (video_resolution) on public.projects to service_role;

commit;
