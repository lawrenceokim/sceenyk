-- Free reusable briefs only. Requires existing identity/projects through 019.
-- Apply once to development; previous migrations and private media are preserved.
begin;

do $$
begin
  if to_regclass('public.marketplace_listings') is not null then
    raise exception 'Inspect existing Marketplace schema before applying 020.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_id_owner_unique') then
    raise exception 'Verified project ownership constraint is required.';
  end if;
end;
$$;

-- Explicit public text must not contain media capabilities or known secret forms.
-- Rights/review confirmation remains necessary for the meaning of authored text.
create function public.marketplace_safe_text(v text) returns boolean
language sql immutable set search_path='' as $$
  select v is not null and v !~* '(https?://|www\.|users/|x-amz-|sb_secret_|sk_live_|sk_test_|bearer[[:space:]]|user_[a-z0-9]{10}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})';
$$;

create table public.marketplace_listings (
  id uuid primary key,
  creator_user_id uuid not null references public.app_users(id) on delete restrict,
  source_project_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 120 and char_length(title)<=120 and public.marketplace_safe_text(title)),
  description text not null check (char_length(btrim(description)) between 1 and 2000 and char_length(description)<=2000 and public.marketplace_safe_text(description)),
  category text not null check (category in ('transformation','product-ad','cinematic','storytelling','gaming','social')),
  tags text[] not null default '{}' check (cardinality(tags)<=8 and char_length(array_to_string(tags,','))<=247 and public.marketplace_safe_text(array_to_string(tags,','))),
  creator_name text not null,
  template_snapshot jsonb not null,
  adoption_type text not null default 'free' check (adoption_type='free'),
  status text not null check (status in ('draft','published','unpublished','archived')),
  rights_confirmed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (to_tsvector('simple', title || ' ' || description)) stored,
  unique (creator_user_id,source_project_id),
  foreign key (source_project_id,creator_user_id) references public.projects(id,owner_user_id) on delete restrict,
  check (status<>'published' or (rights_confirmed_at is not null and published_at is not null))
);
create index marketplace_published_newest on public.marketplace_listings(created_at desc,id desc) where status='published';
create index marketplace_published_category on public.marketplace_listings(category,created_at desc,id desc) where status='published';
create index marketplace_search on public.marketplace_listings using gin(search_document) where status='published';
create index marketplace_creator on public.marketplace_listings(creator_user_id,created_at desc,id desc);

create table public.marketplace_adoptions (
  project_id uuid primary key,
  adopter_user_id uuid not null references public.app_users(id) on delete restrict,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  request_id uuid not null,
  listing_title text not null,
  template_version integer not null check (template_version=1),
  created_at timestamptz not null default now(),
  unique (adopter_user_id,request_id),
  foreign key (project_id,adopter_user_id) references public.projects(id,owner_user_id) on delete restrict
);

create function public.marketplace_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_table_name='marketplace_adoptions' then raise exception 'Adoption provenance is immutable.'; end if;
  if (new.id,new.creator_user_id,new.source_project_id,new.template_snapshot,new.creator_name,new.adoption_type,new.created_at)
    is distinct from (old.id,old.creator_user_id,old.source_project_id,old.template_snapshot,old.creator_name,old.adoption_type,old.created_at) then
    raise exception 'Listing identity and template snapshot are immutable.';
  end if;
  new.updated_at=now();
  return new;
end;
$$;
create trigger marketplace_listing_immutable before update on public.marketplace_listings for each row execute function public.marketplace_immutable();
create trigger marketplace_adoption_immutable before update or delete on public.marketplace_adoptions for each row execute function public.marketplace_immutable();

create function public.marketplace_listing_json(l public.marketplace_listings) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'category',l.category,'tags',l.tags,
    'creatorName',l.creator_name,'template',l.template_snapshot,'adoptionType',l.adoption_type,'status',l.status,
    'createdAt',l.created_at,'publishedAt',l.published_at);
$$;

create function public.marketplace_browse(p_query text,p_category text,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer;
begin
  if p_query is null or char_length(p_query)>80 or p_page is null or p_page<1 or p_page>100000 or
    (p_category is not null and p_category not in ('transformation','product-ad','cinematic','storytelling','gaming','social')) then
    raise exception 'Invalid Marketplace query.';
  end if;
  select count(*) into total from public.marketplace_listings l where l.status='published'
    and (p_category is null or l.category=p_category)
    and (btrim(p_query)='' or l.search_document @@ plainto_tsquery('simple',p_query)
      or to_tsvector('simple',array_to_string(l.tags,' ')) @@ plainto_tsquery('simple',p_query));
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into result from (
    select public.marketplace_listing_json(l) as item,l.created_at,l.id from public.marketplace_listings l where l.status='published'
      and (p_category is null or l.category=p_category)
      and (btrim(p_query)='' or l.search_document @@ plainto_tsquery('simple',p_query)
        or to_tsvector('simple',array_to_string(l.tags,' ')) @@ plainto_tsquery('simple',p_query))
      order by l.created_at desc,l.id desc limit 12 offset (p_page-1)*12
  ) rows;
  return jsonb_build_object('items',result,'total',total,'page',p_page,'pageSize',12);
end;
$$;

create function public.marketplace_detail(p_listing_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select public.marketplace_listing_json(l) from public.marketplace_listings l where l.id=p_listing_id and l.status='published';
$$;

create function public.marketplace_owned(p_owner_user_id uuid,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer;
begin
  if p_owner_user_id is null or p_page is null or p_page<1 or p_page>100000 then raise exception 'Invalid owner query.'; end if;
  select count(*) into total from public.marketplace_listings where creator_user_id=p_owner_user_id;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into result from (
    select public.marketplace_listing_json(l)||jsonb_build_object('sourceProjectId',l.source_project_id,'rightsConfirmed',l.rights_confirmed_at is not null) as item,l.created_at,l.id
    from public.marketplace_listings l where l.creator_user_id=p_owner_user_id order by l.created_at desc,l.id desc limit 12 offset (p_page-1)*12
  ) rows;
  return jsonb_build_object('items',result,'total',total,'page',p_page,'pageSize',12);
end;
$$;

create function public.marketplace_owned_listing(p_owner_user_id uuid,p_listing_id uuid,p_project_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select public.marketplace_listing_json(l)||jsonb_build_object('sourceProjectId',l.source_project_id,'rightsConfirmed',l.rights_confirmed_at is not null)
  from public.marketplace_listings l where l.creator_user_id=p_owner_user_id
    and ((p_listing_id is not null and l.id=p_listing_id) or (p_listing_id is null and l.source_project_id=p_project_id));
$$;

create function public.marketplace_create(p_owner_user_id uuid,p_listing_id uuid,p_project_id uuid,p_title text,p_description text,
  p_category text,p_tags text[],p_instructions text,p_publish boolean,p_rights_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare project public.projects; existing uuid; display_name text; snapshot jsonb;
begin
  if p_owner_user_id is null or p_listing_id is null or p_project_id is null or p_publish is null or p_rights_confirmed is null then return jsonb_build_object('code','INVALID_INPUT'); end if;
  select * into project from public.projects where id=p_project_id and owner_user_id=p_owner_user_id for update;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  select id into existing from public.marketplace_listings where creator_user_id=p_owner_user_id and source_project_id=p_project_id;
  if found then return jsonb_build_object('code','EXISTS','listingId',existing); end if;
  if p_instructions is null or char_length(btrim(p_instructions)) not between 1 and 4000 or char_length(p_instructions)>4000 or not public.marketplace_safe_text(p_instructions)
    or (p_publish and not p_rights_confirmed) or p_tags is null or exists(select 1 from unnest(p_tags) t where t is null or t !~ '^[a-z0-9][a-z0-9 -]{0,29}$') then
    return jsonb_build_object('code','INVALID_INPUT');
  end if;
  select left(btrim(concat_ws(' ',first_name,last_name)),80) into display_name from public.app_users where id=p_owner_user_id;
  if coalesce(display_name,'')='' or not public.marketplace_safe_text(display_name) then display_name='Sceenyk creator'; end if;
  snapshot=jsonb_build_object('version',1,'category',project.category,'instructions',btrim(p_instructions),
    'settings',jsonb_build_object('aspectRatio',project.aspect_ratio,'duration',project.duration,'visualStyle',project.visual_style,'tone',project.tone));
  insert into public.marketplace_listings(id,creator_user_id,source_project_id,title,description,category,tags,creator_name,template_snapshot,status,rights_confirmed_at,published_at)
  values(p_listing_id,p_owner_user_id,p_project_id,btrim(p_title),btrim(p_description),p_category,p_tags,display_name,snapshot,
    case when p_publish then 'published' else 'draft' end,case when p_rights_confirmed then now() end,case when p_publish then now() end);
  return jsonb_build_object('code','SAVED','listingId',p_listing_id);
end;
$$;

create function public.marketplace_update(p_owner_user_id uuid,p_listing_id uuid,p_title text,p_description text,p_category text,p_tags text[],p_status text,p_rights_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare listing public.marketplace_listings;
begin
  select * into listing from public.marketplace_listings where id=p_listing_id and creator_user_id=p_owner_user_id for update;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  if p_status is null or p_status not in ('draft','published','unpublished','archived') or listing.status='archived'
    or (p_status='draft' and listing.status<>'draft') or (p_status='unpublished' and listing.status='draft')
    or p_rights_confirmed is null or (p_status='published' and listing.rights_confirmed_at is null and not p_rights_confirmed)
    or p_tags is null or exists(select 1 from unnest(p_tags) t where t is null or t !~ '^[a-z0-9][a-z0-9 -]{0,29}$') then
    return jsonb_build_object('code','INVALID_INPUT');
  end if;
  update public.marketplace_listings set title=btrim(p_title),description=btrim(p_description),category=p_category,tags=p_tags,status=p_status,
    rights_confirmed_at=coalesce(rights_confirmed_at,case when p_rights_confirmed then now() end),
    published_at=coalesce(published_at,case when p_status='published' then now() end) where id=p_listing_id;
  return jsonb_build_object('code','SAVED','listingId',p_listing_id);
end;
$$;

create function public.marketplace_adopt(p_owner_user_id uuid,p_listing_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.marketplace_adoptions; listing public.marketplace_listings; project_id uuid;
begin
  if p_owner_user_id is null or p_listing_id is null or p_request_id is null or not exists(select 1 from public.app_users where id=p_owner_user_id) then return jsonb_build_object('code','INVALID_INPUT'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text||':'||p_request_id::text,0));
  select * into previous from public.marketplace_adoptions where adopter_user_id=p_owner_user_id and request_id=p_request_id;
  if found then
    if previous.listing_id<>p_listing_id then return jsonb_build_object('code','CONFLICT'); end if;
    return jsonb_build_object('code','ADOPTED','projectId',previous.project_id);
  end if;
  select * into listing from public.marketplace_listings where id=p_listing_id and status='published' for share;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  project_id=gen_random_uuid();
  insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone)
    values(project_id,p_owner_user_id,listing.title,listing.template_snapshot->>'category',listing.template_snapshot->>'instructions',
      listing.template_snapshot->'settings'->>'aspectRatio',listing.template_snapshot->'settings'->>'duration',
      listing.template_snapshot->'settings'->>'visualStyle',listing.template_snapshot->'settings'->>'tone');
  insert into public.marketplace_adoptions(project_id,adopter_user_id,listing_id,request_id,listing_title,template_version)
    values(project_id,p_owner_user_id,p_listing_id,p_request_id,listing.title,1);
  return jsonb_build_object('code','ADOPTED','projectId',project_id);
end;
$$;

create function public.marketplace_origin(p_owner_user_id uuid,p_project_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('listingId',a.listing_id,'title',a.listing_title) from public.marketplace_adoptions a
    join public.projects p on p.id=a.project_id and p.owner_user_id=a.adopter_user_id
    where a.project_id=p_project_id and a.adopter_user_id=p_owner_user_id;
$$;

alter table public.marketplace_listings enable row level security;
alter table public.marketplace_adoptions enable row level security;
revoke all on public.marketplace_listings,public.marketplace_adoptions from public,anon,authenticated,service_role;
grant select on public.marketplace_listings,public.marketplace_adoptions to service_role;
-- No new function is callable by browser database roles; private definer helpers
-- are usable only from these checked service entry points.
do $$
declare f record;
begin
  for f in select oid::regprocedure as signature,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'marketplace_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname not in ('marketplace_immutable','marketplace_listing_json','marketplace_safe_text') then
      execute format('grant execute on function %s to service_role',f.signature);
    end if;
  end loop;
end;
$$;
commit;
