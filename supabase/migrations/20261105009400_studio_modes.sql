-- Product Phase 2 M1. Manual after 093; metadata only, no generation changes.
begin;

do $$
declare required record;
begin
  for required in select * from (values
    ('projects','id','uuid'), ('projects','owner_user_id','uuid'),
    ('projects','status','text'), ('projects','deleted_at','timestamp with time zone'),
    ('creation_preferences','owner_user_id','uuid'), ('creation_preferences','aspect_ratio','text'),
    ('creation_preferences','category','text'), ('creation_preferences','updated_at','timestamp with time zone')
  ) as prerequisites(relation_name,column_name,data_type)
  loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.relation_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Studio mode prerequisite missing or incompatible: %.%', required.relation_name,required.column_name;
    end if;
  end loop;
end $$;

-- Fast defaults give all existing projects Basic without rewriting creative data.
alter table public.projects add column if not exists studio_mode text not null default 'basic';
alter table public.creation_preferences add column if not exists studio_mode text not null default 'basic';
do $$
declare relation_name text;
begin
  foreach relation_name in array array['projects','creation_preferences'] loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=relation_name and c.column_name='studio_mode' and c.data_type='text' and c.is_nullable='NO') then
      raise exception 'Inspect existing %.studio_mode before applying 094',relation_name;
    end if;
    if not exists(select 1 from pg_constraint where conrelid=('public.'||relation_name)::regclass
      and conname=relation_name||'_studio_mode_check') then
      execute format('alter table public.%I add constraint %I check (studio_mode in (''basic'',''pro''))',
        relation_name,relation_name||'_studio_mode_check');
    end if;
  end loop;
end $$;

-- All existing creation paths (including atomic V3 creation) inherit the current
-- owner preference without adding product mode to their brief or hash recipes.
create or replace function public.studio_mode_inherit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.studio_mode := coalesce((select studio_mode from public.creation_preferences where owner_user_id=new.owner_user_id),'basic');
  return new;
end $$;
revoke all on function public.studio_mode_inherit() from public,anon,authenticated,service_role;
do $$ begin
  if not exists(select 1 from pg_trigger where tgrelid='public.projects'::regclass and tgname='studio_mode_inherit') then
    create trigger studio_mode_inherit before insert on public.projects for each row execute function public.studio_mode_inherit();
  end if;
end $$;

create or replace function public.studio_mode_read(p_owner uuid,p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare project_mode text;
begin
  if p_project is not null then
    select studio_mode into project_mode from public.projects
      where id=p_project and owner_user_id=p_owner and status='draft' and deleted_at is null;
    if not found then return null; end if;
  end if;
  return jsonb_build_object('preferredMode',coalesce((select studio_mode from public.creation_preferences where owner_user_id=p_owner),'basic'),
    'projectMode',project_mode);
end $$;

create or replace function public.studio_mode_save(p_owner uuid,p_project uuid,p_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_mode is null or p_mode not in ('basic','pro') then raise exception 'INVALID_STUDIO_MODE'; end if;
  if p_project is not null then
    perform 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft' and deleted_at is null for update;
    if not found then return null; end if;
  end if;
  insert into public.creation_preferences(owner_user_id,aspect_ratio,category,studio_mode)
    values(p_owner,'16:9','cinematic',p_mode)
    on conflict(owner_user_id) do update set studio_mode=excluded.studio_mode,updated_at=now();
  if p_project is not null then
    -- UPDATE OF creative-column triggers are not fired. Existing updated_at
    -- bookkeeping remains intact; approvals, hashes and saved bytes are untouched.
    update public.projects set studio_mode=p_mode where id=p_project and owner_user_id=p_owner;
  end if;
  return public.studio_mode_read(p_owner,p_project);
end $$;
revoke all on function public.studio_mode_read(uuid,uuid),public.studio_mode_save(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.studio_mode_read(uuid,uuid),public.studio_mode_save(uuid,uuid,text) to service_role;
-- Keep existing table ACLs/RLS, functions, named triggers and generation contracts.
commit;
