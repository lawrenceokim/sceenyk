begin;

-- One public extension per existing identity, with independent write grants.
-- No Clerk/account, project or financial data is copied into this record.
create table public.marketplace_creator_profiles (
  owner_user_id uuid primary key references public.app_users(id) on delete restrict,
  creator_slug text not null unique check (creator_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(creator_slug) between 1 and 64),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80 and public.marketplace_safe_text(display_name)),
  bio text not null default '' check (char_length(bio)<=500 and public.marketplace_safe_text(bio)),
  avatar_key text,
  avatar_etag text,
  avatar_size integer,
  creator_since timestamptz not null default now(),
  check ((avatar_key is null and avatar_etag is null and avatar_size is null) or
    (avatar_key is not null and avatar_etag is not null and avatar_size is not null and char_length(avatar_etag) between 1 and 100 and avatar_size between 1 and 524288
     and avatar_key ~ ('^marketplace/avatars/'||owner_user_id::text||'/[a-f0-9-]{36}\.webp$')))
);
alter table public.marketplace_creator_profiles enable row level security;
revoke all on public.marketplace_creator_profiles from public,anon,authenticated,service_role;
grant select on public.marketplace_creator_profiles to service_role;

create function public.creator_profile_immutable() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.owner_user_id,new.creator_slug,new.creator_since) is distinct from (old.owner_user_id,old.creator_slug,old.creator_since) then
    raise exception 'Public creator identity is stable.';
  end if;
  return new;
end;
$$;
create trigger creator_profile_immutable before update on public.marketplace_creator_profiles for each row execute function public.creator_profile_immutable();

create function public.creator_profile_json(p public.marketplace_creator_profiles) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('slug',p.creator_slug,'displayName',p.display_name,'bio',p.bio,'creatorSince',p.creator_since,
    'avatarUrl',case when p.avatar_key is not null then '/api/marketplace/creators/'||p.creator_slug||'/avatar' end);
$$;

create function public.creator_profile_save(p_owner uuid,p_name text,p_bio text,p_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare profile public.marketplace_creator_profiles; candidate text; base text; suffix integer:=1;
begin
  if p_owner is null or p_name is null or char_length(btrim(p_name)) not between 1 and 80 or not public.marketplace_safe_text(p_name)
    or p_bio is null or char_length(p_bio)>500 or not public.marketplace_safe_text(p_bio)
    or (p_slug is not null and (char_length(p_slug)>64 or not public.marketplace_safe_text(p_slug))) then return jsonb_build_object('code','INVALID_INPUT'); end if;
  -- Serialize repeat setup/name edits for this creator; no slug or caller ID is authority.
  perform 1 from public.app_users where id=p_owner for update;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  select * into profile from public.marketplace_creator_profiles where owner_user_id=p_owner;
  if found then
    if p_slug is not null and p_slug<>profile.creator_slug then return jsonb_build_object('code','SLUG_FIXED'); end if;
    update public.marketplace_creator_profiles set display_name=btrim(p_name),bio=btrim(p_bio) where owner_user_id=p_owner returning * into profile;
  else
    base=trim(both '-' from left(regexp_replace(lower(coalesce(nullif(p_slug,''),p_name)),'[^a-z0-9]+','-','g'),40));
    if base='' then base='creator'; end if;
    if base in ('admin','support','settings','api','new','edit','marketplace','creators') then
      if p_slug is null then base='creator-'||base; else return jsonb_build_object('code','SLUG_UNAVAILABLE'); end if;
    end if;
    loop
      candidate=base||case when suffix=1 then '' else '-'||suffix::text end;
      begin
        insert into public.marketplace_creator_profiles(owner_user_id,creator_slug,display_name,bio) values(p_owner,candidate,btrim(p_name),btrim(p_bio)) returning * into profile;
        exit;
      exception when unique_violation then
        suffix=suffix+1;
        if suffix>1000 then return jsonb_build_object('code','SLUG_UNAVAILABLE'); end if;
      end;
    end loop;
  end if;
  return jsonb_build_object('code','SAVED','profile',public.creator_profile_json(profile));
end;
$$;

-- Existing published names were already explicitly reviewed for publication.
-- No account names/avatar/email or unpublished-only creators are backfilled.
do $$
declare listing record;
begin
  for listing in select distinct on (creator_user_id) creator_user_id,creator_name from public.marketplace_listings where status='published' order by creator_user_id,created_at,id loop
    perform public.creator_profile_save(listing.creator_user_id,listing.creator_name,'',null);
  end loop;
end;
$$;
create function public.creator_profile_on_publish() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and not exists(select 1 from public.marketplace_creator_profiles where owner_user_id=new.creator_user_id) then
    if (public.creator_profile_save(new.creator_user_id,new.creator_name,'',null)->>'code')<>'SAVED' then raise exception 'Creator profile unavailable.'; end if;
  end if;
  return new;
end;
$$;
create trigger creator_profile_on_publish after insert or update of status on public.marketplace_listings for each row execute function public.creator_profile_on_publish();

create function public.creator_profile_owned(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select public.creator_profile_json(p) from public.marketplace_creator_profiles p where owner_user_id=p_owner;
$$;
create function public.creator_profile_avatar_save(p_owner uuid,p_key text,p_etag text,p_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare profile public.marketplace_creator_profiles;
begin
  update public.marketplace_creator_profiles set avatar_key=p_key,avatar_etag=p_etag,avatar_size=p_size where owner_user_id=p_owner returning * into profile;
  if not found then return null; end if;
  return public.creator_profile_json(profile);
end;
$$;
create function public.creator_profile_avatar(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('key',avatar_key,'etag',avatar_etag,'size',avatar_size) from public.marketplace_creator_profiles where creator_slug=p_slug and avatar_key is not null;
$$;

-- New projections only: old strict DTO callers keep working during migration-first rollout.
-- Frozen listing and money history and all existing RPCs remain untouched.
create function public.creator_profile_listing_json(l public.marketplace_listings) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'category',l.category,'tags',l.tags,
    'creatorName',coalesce(p.display_name,l.creator_name),'creatorSlug',p.creator_slug,
    'creatorAvatar',case when p.avatar_key is not null then '/api/marketplace/creators/'||p.creator_slug||'/avatar' end,
    'template',case when l.adoption_type='paid' then jsonb_set(l.template_snapshot,'{instructions}',to_jsonb('Unlock this template to view reusable instructions.'::text)) else l.template_snapshot end,
    'adoptionType',l.adoption_type,'priceMinor',l.price_minor,'currency',l.currency,'status',l.status,'createdAt',l.created_at,'publishedAt',l.published_at)
    from (select 1) seed left join public.marketplace_creator_profiles p on p.owner_user_id=l.creator_user_id;
$$;
create function public.creator_profile_listing_identities(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_ids is null or cardinality(p_ids)>12 then raise exception 'Invalid listing identity query.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'creatorName',coalesce(p.display_name,l.creator_name),'creatorSlug',p.creator_slug,
    'creatorAvatar',case when p.avatar_key is not null then '/api/marketplace/creators/'||p.creator_slug||'/avatar' end)),'[]'::jsonb)
    into result from public.marketplace_listings l left join public.marketplace_creator_profiles p on p.owner_user_id=l.creator_user_id where l.id=any(p_ids);
  return result;
end;
$$;
create function public.creator_storefront(p_slug text,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare profile public.marketplace_creator_profiles; total integer; adoptions bigint; items jsonb;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug)>64 or p_page is null or p_page not between 1 and 100000 then return null; end if;
  select * into profile from public.marketplace_creator_profiles where creator_slug=p_slug;
  if not found then return null; end if;
  select count(*) into total from public.marketplace_listings where creator_user_id=profile.owner_user_id and status='published';
  select count(*) into adoptions from public.marketplace_adoptions a join public.marketplace_listings l on l.id=a.listing_id where l.creator_user_id=profile.owner_user_id and l.status='published';
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into items from (
    select public.creator_profile_listing_json(l) item,l.created_at,l.id from public.marketplace_listings l where l.creator_user_id=profile.owner_user_id and l.status='published'
      order by l.created_at desc,l.id desc limit 12 offset (p_page-1)*12
  ) listings;
  return jsonb_build_object('profile',public.creator_profile_json(profile),'adoptionCount',adoptions,'items',items,'total',total,'page',p_page,'pageSize',12);
end;
$$;

do $$
declare f record;
begin
  for f in select oid::regprocedure signature,proname from pg_catalog.pg_proc where pronamespace='public'::regnamespace and proname like 'creator_profile_%' or (pronamespace='public'::regnamespace and proname='creator_storefront') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname in ('creator_profile_save','creator_profile_owned','creator_profile_avatar_save','creator_profile_avatar','creator_profile_listing_identities','creator_storefront') then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end;
$$;
commit;
