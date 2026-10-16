begin;

create table public.creation_preferences (
  owner_user_id uuid primary key references public.app_users(id) on delete restrict,
  aspect_ratio text not null check (aspect_ratio in ('9:16','16:9','1:1')),
  category text not null check (category in ('transformation','product-ad','cinematic','storytelling','gaming','social')),
  updated_at timestamptz not null default now()
);
alter table public.creation_preferences enable row level security;
revoke all on public.creation_preferences from public,anon,authenticated,service_role;
grant select on public.creation_preferences to service_role;

create function public.creation_preferences_read(p_owner uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('aspectRatio',aspect_ratio,'category',category)
  from public.creation_preferences where owner_user_id=p_owner;
$$;

create function public.creation_preferences_save(p_owner uuid,p_aspect_ratio text,p_category text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  insert into public.creation_preferences(owner_user_id,aspect_ratio,category)
    values(p_owner,p_aspect_ratio,p_category)
    on conflict(owner_user_id) do update set aspect_ratio=excluded.aspect_ratio,category=excluded.category,updated_at=now();
  return public.creation_preferences_read(p_owner);
end;
$$;
revoke all on function public.creation_preferences_read(uuid),public.creation_preferences_save(uuid,text,text) from public,anon,authenticated;
grant execute on function public.creation_preferences_read(uuid),public.creation_preferences_save(uuid,text,text) to service_role;

commit;
