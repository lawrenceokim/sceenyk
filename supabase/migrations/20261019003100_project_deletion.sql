-- Logical project deletion preserves existing media/workflow/financial FKs.
-- Apply once the preceding authored migrations are present. Safe to rerun.
begin;

do $$
declare required record;
begin
  for required in select * from (values
    ('projects','id'),('projects','owner_user_id'),('projects','status'),
    ('generation_jobs','project_id'),('generation_jobs','owner_user_id'),('generation_jobs','status')
  ) v(table_name,column_name) loop
    if not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=required.table_name and c.column_name=required.column_name) then
      raise exception 'Required project deletion schema is missing: %.%', required.table_name, required.column_name;
    end if;
  end loop;
end;
$$;

alter table public.projects add column if not exists deleted_at timestamptz;
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check check(status in ('draft','deleted'));
alter table public.projects drop constraint if exists projects_deletion_state_check;
alter table public.projects add constraint projects_deletion_state_check check((status='draft')=(deleted_at is null));
create index if not exists projects_owned_visible_updated on public.projects(owner_user_id,updated_at desc,id desc) where status='draft';

create or replace function public.guard_deleted_project_update() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.deleted_at is not null then
    raise exception 'Deleted project is unavailable.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_deleted_project_update() from public,anon,authenticated;
drop trigger if exists projects_deleted_update_guard on public.projects;
create trigger projects_deleted_update_guard before update on public.projects for each row execute function public.guard_deleted_project_update();

-- The FK catalog supplies verified child/owner column names, including existing
-- project_id/owner_user_id and source_project_id/creator_user_id pairs.
create or replace function public.guard_visible_project_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare project_id uuid; owner_id uuid; deleted timestamptz;
begin
  project_id := (to_jsonb(new)->>tg_argv[0])::uuid;
  owner_id := (to_jsonb(new)->>tg_argv[1])::uuid;
  select p.deleted_at into deleted from public.projects p
    where p.id=project_id and p.owner_user_id=owner_id for share;
  if not found or deleted is not null then
    raise exception 'Project is unavailable.' using errcode='23503';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_visible_project_reference() from public,anon,authenticated;
do $$
declare fk record;
begin
  for fk in
    select c.conrelid::regclass child,
      max(a.attname::text) filter(where referenced.attname='id') project_column,
      max(a.attname::text) filter(where referenced.attname='owner_user_id') owner_column
    from pg_constraint c
    join unnest(c.conkey,c.confkey) keys(child_key,parent_key) on true
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=keys.child_key
    join pg_attribute referenced on referenced.attrelid=c.confrelid and referenced.attnum=keys.parent_key
    where c.contype='f' and c.confrelid='public.projects'::regclass
    group by c.oid,c.conrelid
  loop
    if fk.project_column is null or fk.owner_column is null then
      raise exception 'Inspect unexpected project foreign key on % before applying deletion.', fk.child;
    end if;
    execute format('drop trigger if exists projects_visible_reference_guard on %s',fk.child);
    execute format('create trigger projects_visible_reference_guard before insert on %s for each row execute function public.guard_visible_project_reference(%L,%L)',fk.child,fk.project_column,fk.owner_column);
  end loop;
end;
$$;

create or replace function public.delete_owned_project(p_owner_user_id uuid,p_project_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare project public.projects;
begin
  select * into project from public.projects where id=p_project_id and owner_user_id=p_owner_user_id for update;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  if project.deleted_at is not null then return jsonb_build_object('code','DELETED'); end if;
  if exists(select 1 from public.generation_jobs where project_id=p_project_id and owner_user_id=p_owner_user_id and status in ('queued','processing')) then
    return jsonb_build_object('code','ACTIVE_GENERATION');
  end if;
  update public.projects set status='deleted',deleted_at=clock_timestamp() where id=p_project_id and owner_user_id=p_owner_user_id;
  return jsonb_build_object('code','DELETED');
end;
$$;
revoke all on function public.delete_owned_project(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_owned_project(uuid,uuid) to service_role;
-- Keep the original column-level update grants; no raw delete/marker write.
revoke delete on public.projects from public,anon,authenticated,service_role;
commit;
