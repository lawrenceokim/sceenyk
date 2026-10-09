-- Minimal owned creative briefs only. Apply to the DEVELOPMENT project after
-- 20261009000100_app_users.sql. No media, generation or accounting tables.
begin;

do $$
begin
  if to_regclass('public.projects') is not null then
    raise exception 'Inspect the existing projects relation before applying this migration.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users'
      and column_name = 'id' and data_type = 'uuid' and is_nullable = 'NO'
  ) then
    raise exception 'The verified app_users UUID identity migration is required first.';
  end if;
end;
$$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 120 and char_length(title) <= 120),
  category text not null check (category in ('transformation', 'product-ad', 'cinematic', 'storytelling', 'gaming', 'social')),
  prompt text not null default '' check (char_length(prompt) <= 10000),
  aspect_ratio text not null check (aspect_ratio in ('9:16', '16:9', '1:1')),
  duration text not null check (duration in ('10', '15', '30')),
  visual_style text not null check (visual_style in ('Original', 'Cartoon', 'Cinematic', 'Anime', 'Realistic')),
  tone text not null check (tone in ('Funny', 'Dramatic', 'Professional', 'Energetic', 'Storytelling')),
  status text not null default 'draft' check (status = 'draft'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_updated_at_idx
on public.projects (owner_user_id, updated_at desc, id desc);

create function public.set_project_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_project_updated_at() from public, anon, authenticated;
grant execute on function public.set_project_updated_at() to service_role;
create trigger projects_updated_at
before update on public.projects
for each row execute function public.set_project_updated_at();

alter table public.projects enable row level security;
-- Clerk is the only identity source. No browser/Supabase Auth policies.
-- The privileged server bypasses RLS, so services MUST filter by verified owner.
revoke all on table public.projects from public, anon, authenticated, service_role;
grant select, insert on table public.projects to service_role;
grant update (title, category, prompt, aspect_ratio, duration, visual_style, tone)
on public.projects to service_role;

commit;
