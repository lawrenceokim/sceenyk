-- Persistent state only. No dispatch, provider, credit or result implementation.
begin;
do $$
begin
  if to_regclass('public.generation_jobs') is not null then
    raise exception 'Inspect existing generation_jobs before applying this migration.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.projects'::regclass and conname = 'projects_id_owner_unique')
    or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_assets' and column_name = 'verified_etag' and data_type = 'text') then
    raise exception 'Apply the owned project/assets migrations first.';
  end if;
end;
$$;

-- Mirrors lib/generation/contract.ts and validation.ts; checked in integration.
create function public.valid_generation_snapshot(s jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare a jsonb; settings jsonb;
begin
  if s is null or jsonb_typeof(s) <> 'object' then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(s) k) is distinct from array['assetIds','category','prompt','settings','version'] then return false; end if;
  settings := s->'settings';
  if jsonb_typeof(settings) <> 'object' then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(settings) k) is distinct from array['aspectRatio','duration','tone','visualStyle'] then return false; end if;
  if s->'version' <> '1'::jsonb or jsonb_typeof(s->'prompt') <> 'string'
    or char_length(btrim(s->>'prompt')) not between 1 and 10000
    or jsonb_typeof(s->'category') <> 'string'
    or s->>'category' not in ('transformation','product-ad','cinematic','storytelling','gaming','social')
    or jsonb_typeof(settings->'aspectRatio') <> 'string' or settings->>'aspectRatio' not in ('9:16','16:9','1:1')
    or jsonb_typeof(settings->'duration') <> 'string' or settings->>'duration' not in ('10','15','30')
    or jsonb_typeof(settings->'visualStyle') <> 'string' or settings->>'visualStyle' not in ('Original','Cartoon','Cinematic','Anime','Realistic')
    or jsonb_typeof(settings->'tone') <> 'string' or settings->>'tone' not in ('Funny','Dramatic','Professional','Energetic','Storytelling')
    or jsonb_typeof(s->'assetIds') <> 'array' then return false; end if;
  if jsonb_array_length(s->'assetIds') > 256 then return false; end if;
  for a in select value from jsonb_array_elements(s->'assetIds') loop
    if jsonb_typeof(a) <> 'string' or (a#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  end loop;
  return (select count(*) = count(distinct value) from jsonb_array_elements(s->'assetIds'));
end;
$$;

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  project_id uuid not null,
  request_id uuid not null,
  input_snapshot jsonb not null check (public.valid_generation_snapshot(input_snapshot) is true),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  current_stage text check (current_stage in ('preparing','analyzing','planning','generating','voice','rendering')),
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_jobs_owned_project_fkey foreign key (project_id, owner_user_id) references public.projects(id, owner_user_id) on delete restrict,
  constraint generation_jobs_request_unique unique (project_id, request_id),
  constraint generation_jobs_state check (
    (status = 'queued' and current_stage is null and started_at is null and completed_at is null and failed_at is null and error_code is null and error_message is null)
    or (status = 'processing' and current_stage is not null and started_at is not null and completed_at is null and failed_at is null and error_code is null and error_message is null)
    or (status = 'completed' and current_stage is null and started_at is not null and completed_at is not null and failed_at is null and error_code is null and error_message is null)
    or (status = 'failed' and completed_at is null and failed_at is not null and (current_stage is null or started_at is not null)
      and error_code is not null and error_message is not null and error_code = 'PROCESSING_FAILED' and error_message = 'This generation couldn’t be completed. Your saved project is still available.')
  )
);
create index generation_jobs_owner_project_created_idx on public.generation_jobs(owner_user_id, project_id, created_at desc, id desc);

create function public.guard_generation_job() returns trigger language plpgsql set search_path = '' as $$
declare stages text[] := array['preparing','analyzing','planning','generating','voice','rendering'];
begin
  if tg_op = 'INSERT' then
    if new.status <> 'queued' or new.current_stage is not null or new.started_at is not null or new.completed_at is not null or new.failed_at is not null or new.error_code is not null or new.error_message is not null then
      raise exception 'Generation must start queued.' using errcode = '23514';
    end if;
    if public.valid_generation_snapshot(new.input_snapshot) is not true then raise exception 'Invalid generation snapshot.' using errcode = '23514'; end if;
    if exists (
      select 1 from jsonb_array_elements_text(new.input_snapshot->'assetIds') a(id)
      where not exists (select 1 from public.project_assets p where p.id = a.id::uuid and p.owner_user_id = new.owner_user_id and p.project_id = new.project_id and p.upload_status = 'uploaded' and p.verified_etag is not null)
    ) then raise exception 'Invalid generation asset references.' using errcode = '23514'; end if;
    new.created_at := now(); new.updated_at := now(); return new;
  end if;
  if row(new.id,new.owner_user_id,new.project_id,new.request_id,new.input_snapshot,new.created_at) is distinct from row(old.id,old.owner_user_id,old.project_id,old.request_id,old.input_snapshot,old.created_at) then
    raise exception 'Generation identity and snapshot are immutable.' using errcode = '23514';
  end if;
  if not ((old.status = 'queued' and new.status in ('processing','failed'))
    or (old.status = 'processing' and new.status in ('completed','failed'))
    or (old.status = 'processing' and new.status = 'processing' and array_position(stages,new.current_stage) > array_position(stages,old.current_stage))) then
    raise exception 'Invalid generation transition.' using errcode = '23514';
  end if;
  if old.status = 'queued' and new.status = 'processing' and new.current_stage is distinct from 'preparing' then
    raise exception 'Processing must start preparing.' using errcode = '23514';
  end if;
  new.started_at := case when old.status = 'queued' and new.status = 'processing' then now() else old.started_at end;
  new.completed_at := case when new.status = 'completed' then now() else null end;
  new.failed_at := case when new.status = 'failed' then now() else null end;
  if new.status in ('completed','queued') then new.current_stage := null; end if;
  if new.status = 'failed' then new.current_stage := old.current_stage; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger generation_jobs_guard before insert or update on public.generation_jobs for each row execute function public.guard_generation_job();
alter table public.generation_jobs enable row level security;
revoke all on table public.generation_jobs from public, anon, authenticated, service_role;
grant select, insert on table public.generation_jobs to service_role;
grant update (status, current_stage, error_code, error_message) on public.generation_jobs to service_role;
revoke all on function public.valid_generation_snapshot(jsonb), public.guard_generation_job() from public, anon, authenticated;
grant execute on function public.valid_generation_snapshot(jsonb), public.guard_generation_job() to service_role;
commit;
