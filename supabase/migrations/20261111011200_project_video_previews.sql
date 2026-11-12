-- Projects-page derivatives only. No generation, approval, wallet or payment writes.
begin;

do $$
begin
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='projects'
    and column_name in ('id','owner_user_id','deleted_at')) <> 3 then
    raise exception 'Verified projects ownership/deletion columns are required';
  end if;
end $$;

create table if not exists public.project_video_previews (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  project_id uuid not null,
  version text not null check(version ~ '^[a-f0-9]{64}$'),
  state text not null default 'queued' check(state in ('queued','processing','ready','failed')),
  attempts integer not null default 0 check(attempts between 0 and 3),
  lease_token uuid, lease_until timestamptz,
  retry_after timestamptz not null default now(),
  etag text, size_bytes integer check(size_bytes between 1 and 2097152),
  created_at timestamptz not null default now(),
  unique(owner_user_id, project_id, version),
  foreign key(project_id, owner_user_id) references public.projects(id, owner_user_id) on delete cascade,
  check((state='processing')=(lease_token is not null and lease_until is not null)),
  check(state<>'ready' or (etag is not null and size_bytes is not null))
);
create index if not exists project_video_previews_queue on public.project_video_previews(retry_after,created_at) where state in ('queued','processing');
alter table public.project_video_previews enable row level security;
revoke all on public.project_video_previews from public, anon, authenticated, service_role;

-- Only trusted application code resolves approval and supplies the version hash.
create or replace function public.project_video_preview_request(p_owner uuid,p_project uuid,p_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.project_video_previews;
begin
  if not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and deleted_at is null) then return null; end if;
  insert into public.project_video_previews(owner_user_id,project_id,version) values(p_owner,p_project,p_version)
    on conflict(owner_user_id,project_id,version) do nothing;
  select * into item from public.project_video_previews where owner_user_id=p_owner and project_id=p_project and version=p_version;
  return to_jsonb(item);
end $$;

create or replace function public.project_video_preview_claim()
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.project_video_previews;
begin
  -- Expired third attempts become terminal instead of remaining queued forever.
  update public.project_video_previews set state='failed',lease_token=null,lease_until=null
    where state='processing' and lease_until<now() and attempts>=3;
  select v.* into item from public.project_video_previews v join public.projects p on p.id=v.project_id and p.owner_user_id=v.owner_user_id
    where p.deleted_at is null and v.attempts<3 and v.retry_after<=now()
    and (v.state='queued' or v.state='processing' and v.lease_until<now())
    order by v.created_at for update of v skip locked limit 1;
  if not found then return null; end if;
  update public.project_video_previews set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes'
    where id=item.id returning * into item;
  return to_jsonb(item);
end $$;

create or replace function public.project_video_preview_finish(p_id uuid,p_token uuid,p_etag text,p_size integer,p_obsolete boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.project_video_previews set
    state=case when p_etag is not null then 'ready' when p_obsolete or attempts>=3 then 'failed' else 'queued' end,
    etag=p_etag,size_bytes=p_size,lease_token=null,lease_until=null,retry_after=now()+interval '1 minute'
    where id=p_id and state='processing' and lease_token=p_token and lease_until>now();
  return found;
end $$;

revoke all on function public.project_video_preview_request(uuid,uuid,text), public.project_video_preview_claim(),
  public.project_video_preview_finish(uuid,uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.project_video_preview_request(uuid,uuid,text), public.project_video_preview_claim(),
  public.project_video_preview_finish(uuid,uuid,text,integer,boolean) to service_role;
commit;
