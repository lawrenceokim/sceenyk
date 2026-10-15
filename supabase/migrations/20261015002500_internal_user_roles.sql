-- Applied through the trusted SQL Editor before application integration.
-- Role assignment/revocation is database-administrator-only, never self-service.
begin;

create table public.internal_user_roles (
  user_id uuid primary key
    references public.app_users(id) on delete restrict,
  role text not null default 'user'
    check (role in ('user', 'support', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger internal_user_roles_updated_at
before update on public.internal_user_roles
for each row execute function public.set_app_user_updated_at();

alter table public.internal_user_roles enable row level security;

revoke all on public.internal_user_roles
  from public, anon, authenticated, service_role;

grant select on public.internal_user_roles to service_role;

commit;
