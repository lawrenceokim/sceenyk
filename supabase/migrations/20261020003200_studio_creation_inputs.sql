-- Additive inputs on existing owned projects/private media. Older projects stay Freestyle.
begin;

do $$
declare required record;
begin
  for required in select * from (values
    ('projects', 'id', 'uuid'), ('projects', 'owner_user_id', 'uuid'), ('projects', 'status', 'text'),
    ('project_assets', 'id', 'uuid'), ('project_assets', 'project_id', 'uuid'),
    ('project_assets', 'owner_user_id', 'uuid'), ('project_assets', 'media_type', 'text')
  ) as prerequisites(relation_name, column_name, data_type)
  loop
    if not exists (select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = required.relation_name
        and c.column_name = required.column_name and c.data_type = required.data_type) then
      raise exception 'Studio prerequisite missing or incompatible: %.%', required.relation_name, required.column_name;
    end if;
  end loop;
end;
$$;

alter table public.projects
  add column if not exists creation_type text not null default 'freestyle',
  add column if not exists ugc_type text not null default 'advertisement';
alter table public.project_assets
  add column if not exists studio_role text not null default 'freestyle',
  add column if not exists reference_id uuid,
  add column if not exists removed_from_draft boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.projects'::regclass and conname = 'projects_creation_type_check') then
    alter table public.projects add constraint projects_creation_type_check check (creation_type in ('ugc', 'freestyle'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.projects'::regclass and conname = 'projects_ugc_type_check') then
    alter table public.projects add constraint projects_ugc_type_check check (ugc_type in ('advertisement', 'explanation', 'unboxing'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.project_assets'::regclass and conname = 'project_assets_studio_reference_check') then
    alter table public.project_assets add constraint project_assets_studio_reference_check check (
      (studio_role = 'freestyle' and reference_id is null and not removed_from_draft)
      or (studio_role in ('character', 'product') and reference_id is not null and media_type = 'image')
    );
  end if;
end;
$$;

-- Preserve existing RLS, ownership FK, deletion guards and restricted upload grants.
-- Reference role/group are inserted once; updates can only detach a UGC image.
grant update (creation_type, ugc_type) on public.projects to service_role;
grant update (removed_from_draft) on public.project_assets to service_role;
commit;
