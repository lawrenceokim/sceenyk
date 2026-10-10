-- Metadata only; private media bytes live in R2. Requires both prior migrations.
begin;
do $$
begin
  if to_regclass('public.project_assets') is not null then
    raise exception 'Inspect existing project_assets before applying this migration.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'owner_user_id' and data_type = 'uuid' and is_nullable = 'NO') then
    raise exception 'The owned projects migration must be applied first.';
  end if;
end;
$$;
-- The composite FK prevents a project and asset from having different owners.
alter table public.projects add constraint projects_id_owner_unique unique (id, owner_user_id);
create table public.project_assets (
  id uuid primary key,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  project_id uuid not null,
  upload_request_id uuid not null,
  storage_provider text not null default 'r2' check (storage_provider = 'r2'),
  storage_key text not null unique,
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 255),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp','image/gif','image/avif','image/bmp','image/heic','image/heif','video/mp4','video/webm','video/quicktime','video/ogg','audio/mpeg','audio/wav','audio/mp4','audio/ogg','audio/aac','audio/flac','audio/webm')),
  size_bytes bigint not null check (size_bytes between 1 and 5368709120),
  media_type text not null check (media_type in ('image','video','audio') and split_part(mime_type, '/', 1) = media_type),
  upload_status text not null default 'pending' check (upload_status in ('pending','uploaded','rejected')),
  verified_etag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_assets_owned_project_fkey foreign key (project_id, owner_user_id) references public.projects(id, owner_user_id) on delete restrict,
  constraint project_assets_request_unique unique (project_id, upload_request_id),
  constraint project_assets_verified check ((upload_status = 'uploaded') = (verified_etag is not null)),
  constraint project_assets_namespace check (storage_key like 'users/' || owner_user_id::text || '/projects/' || project_id::text || '/' || id::text || '/%' and storage_key !~ '\.\.' and storage_key !~ '[[:cntrl:]]')
);
create index project_assets_owner_project_created_idx on public.project_assets(owner_user_id, project_id, created_at, id);
create trigger project_assets_updated_at before update on public.project_assets for each row execute function public.set_project_updated_at();
alter table public.project_assets enable row level security;
revoke all on table public.project_assets from public, anon, authenticated, service_role;
grant select, insert on table public.project_assets to service_role;
grant update (upload_status, verified_etag) on public.project_assets to service_role;
commit;
