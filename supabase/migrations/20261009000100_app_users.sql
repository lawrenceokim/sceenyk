-- Pending application to the new DEVELOPMENT project selected by the user.
-- Inspect the remote public schema first; this migration refuses populated
-- schemas rather than guessing whether an existing user/profile table fits.
begin;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ) then
    raise exception 'Inspect existing public tables before applying the initial Sceenyk identity migration.';
  end if;
end;
$$;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique check (length(clerk_user_id) > 0),
  email text,
  first_name text,
  last_name text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.set_app_user_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_app_user_updated_at() from public, anon, authenticated;
grant execute on function public.set_app_user_updated_at() to service_role;

create trigger app_users_updated_at
before update on public.app_users
for each row execute function public.set_app_user_updated_at();

alter table public.app_users enable row level security;
-- No browser/Supabase Auth policies: all access is through the authenticated
-- Clerk server boundary. The privileged server role bypasses RLS.
revoke all on table public.app_users from public, anon, authenticated, service_role;
grant select, insert, update on table public.app_users to service_role;

commit;
