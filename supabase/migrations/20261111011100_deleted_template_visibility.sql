-- A creator's deleted template is a retained tombstone, visible only through
-- an existing buyer's private acquisition. Apply after Purchases migration 110.
begin;

do $$
declare required record;
begin
  for required in select * from (values
    ('marketplace_listings','id','uuid'), ('marketplace_listings','creator_user_id','uuid'),
    ('marketplace_listings','source_project_id','uuid'), ('marketplace_listings','deleted_at','timestamp with time zone'),
    ('marketplace_listings','status','text'), ('marketplace_listings','preview_key','text'),
    ('marketplace_listings','preview_etag','text'), ('marketplace_listings','preview_size','integer'),
    ('marketplace_listings','preview_source_asset_id','uuid'),
    ('projects','id','uuid'), ('projects','owner_user_id','uuid'), ('projects','status','text'),
    ('projects','deleted_at','timestamp with time zone'), ('projects','creation_type','text'), ('projects','ugc_type','text'),
    ('project_assets','id','uuid'), ('project_assets','project_id','uuid'),
    ('project_assets','owner_user_id','uuid'), ('project_assets','upload_status','text'),
    ('project_assets','media_type','text'), ('project_assets','removed_from_draft','boolean')
  ) as prerequisites(relation_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.relation_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Deleted-template prerequisite missing or incompatible: %.%',required.relation_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.marketplace_acquisition_detail(uuid,uuid)') is null
    or to_regprocedure('public.marketplace_owned_json(public.marketplace_listings)') is null
    or to_regprocedure('public.marketplace_create(uuid,uuid,uuid,text,text,text,text[],text,boolean,boolean)') is null
    or to_regprocedure('public.marketplace_template_preview(uuid,uuid)') is null
    or to_regprocedure('public.marketplace_template_source(uuid,uuid)') is null
    or to_regprocedure('public.marketplace_project_templates(uuid,uuid[])') is null then
    raise exception 'Marketplace and Purchases service functions are required.';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.marketplace_listings'::regclass
    and conname='marketplace_deleted_template_archived' and contype='c') then
    raise exception 'The deleted-template archival constraint is required.';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.marketplace_listings'::regclass
    and conname='marketplace_listings_creator_user_id_source_project_id_key' and contype='u')
    and to_regclass('public.marketplace_active_source_unique') is null then
    raise exception 'Inspect active source uniqueness before migration 111.';
  end if;
end $$;

-- Retain every deleted listing for purchase, adoption and accounting FKs.
-- A still-owned original project can publish a fresh listing after deletion.
alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_creator_user_id_source_project_id_key;
create unique index if not exists marketplace_active_source_unique
  on public.marketplace_listings(creator_user_id,source_project_id) where deleted_at is null;

create or replace function public.marketplace_owned_listing(p_owner_user_id uuid,p_listing_id uuid,p_project_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select public.marketplace_owned_json(l)
  from public.marketplace_listings l where l.creator_user_id=p_owner_user_id and l.deleted_at is null
    and ((p_listing_id is not null and l.id=p_listing_id) or (p_listing_id is null and l.source_project_id=p_project_id));
$$;

create or replace function public.marketplace_project_templates(p_owner_user_id uuid,p_project_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(source_project_id::text,id::text),'{}'::jsonb)
    from public.marketplace_listings where creator_user_id=p_owner_user_id and source_project_id=any(p_project_ids)
      and deleted_at is null;
$$;

create or replace function public.marketplace_template_source(p_listing_id uuid,p_owner_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('projectId',l.source_project_id,'assetId',a.id,'kind',a.media_type)
  from public.marketplace_listings l join lateral (
    select asset.id,asset.media_type from public.project_assets asset
    where asset.project_id=l.source_project_id and asset.owner_user_id=l.creator_user_id and asset.upload_status='uploaded'
      and asset.media_type in ('image','video') and
      ((l.preview_source_asset_id is not null and asset.id=l.preview_source_asset_id) or
       (l.preview_source_asset_id is null and not asset.removed_from_draft)) order by asset.created_at,asset.id limit 1
  ) a on true where l.id=p_listing_id and l.creator_user_id=p_owner_user_id and l.deleted_at is null;
$$;

create or replace function public.marketplace_template_preview(p_listing_id uuid,p_owner_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('key',l.preview_key,'etag',l.preview_etag,'size',l.preview_size)
  from public.marketplace_listings l where l.id=p_listing_id and l.preview_key is not null and l.deleted_at is null
    and ((l.status='published' and l.rights_confirmed_at is not null) or l.creator_user_id=p_owner_user_id);
$$;

-- Preserve the existing project row lock, public text guard and snapshot fields.
-- Only nondeleted listings count as an existing template for that source.
create or replace function public.marketplace_create(p_owner_user_id uuid,p_listing_id uuid,p_project_id uuid,p_title text,p_description text,
  p_category text,p_tags text[],p_instructions text,p_publish boolean,p_rights_confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare project public.projects; existing uuid; display_name text; snapshot jsonb;
begin
  if p_owner_user_id is null or p_listing_id is null or p_project_id is null or p_publish is null or p_rights_confirmed is null then return jsonb_build_object('code','INVALID_INPUT'); end if;
  select * into project from public.projects where id=p_project_id and owner_user_id=p_owner_user_id for update;
  if not found or project.status<>'draft' or project.deleted_at is not null then return jsonb_build_object('code','NOT_FOUND'); end if;
  select id into existing from public.marketplace_listings where creator_user_id=p_owner_user_id and source_project_id=p_project_id and deleted_at is null;
  if found then return jsonb_build_object('code','EXISTS','listingId',existing); end if;
  if p_instructions is null or char_length(btrim(p_instructions)) not between 1 and 4000 or char_length(p_instructions)>4000 or not public.marketplace_safe_text(p_instructions)
    or (p_publish and not p_rights_confirmed) or p_tags is null or exists(select 1 from unnest(p_tags) t where t is null or t !~ '^[a-z0-9][a-z0-9 -]{0,29}$') then
    return jsonb_build_object('code','INVALID_INPUT');
  end if;
  select left(btrim(concat_ws(' ',first_name,last_name)),80) into display_name from public.app_users where id=p_owner_user_id;
  if coalesce(display_name,'')='' or not public.marketplace_safe_text(display_name) then display_name='Sceenyk creator'; end if;
  snapshot=jsonb_build_object('version',1,'category',project.category,'instructions',btrim(p_instructions),
    'creationType',project.creation_type,'ugcType',project.ugc_type,
    'settings',jsonb_build_object('aspectRatio',project.aspect_ratio,'duration',project.duration,'visualStyle',project.visual_style,'tone',project.tone));
  insert into public.marketplace_listings(id,creator_user_id,source_project_id,title,description,category,tags,creator_name,template_snapshot,status,rights_confirmed_at,published_at)
  values(p_listing_id,p_owner_user_id,p_project_id,btrim(p_title),btrim(p_description),p_category,p_tags,display_name,snapshot,
    case when p_publish then 'published' else 'draft' end,case when p_rights_confirmed then now() end,case when p_publish then now() end);
  return jsonb_build_object('code','SAVED','listingId',p_listing_id);
end $$;

-- An adopted project's source link resolves the buyer's saved acquisition,
-- including after the creator removes the public listing.
create or replace function public.marketplace_origin(p_owner_user_id uuid,p_project_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select origin from (
    select jsonb_build_object('listingId',a.listing_id,'title',a.listing_title,'acquisitionId',c.id) as origin,0 as priority
      from public.marketplace_adoptions a join public.projects p on p.id=a.project_id and p.owner_user_id=a.adopter_user_id
      join lateral (select id from public.marketplace_acquisitions c where c.owner_user_id=a.adopter_user_id
        and c.listing_id=a.listing_id and ((a.purchase_id is null and c.kind='free') or c.id=a.purchase_id)
        order by acquired_at,id limit 1) c on true
      where a.project_id=p_project_id and a.adopter_user_id=p_owner_user_id
    union all
    select jsonb_build_object('listingId',m.listing_id,'title',l.title,'acquisitionId',c.id),1
      from public.marketplace_acquisition_projects m join public.marketplace_listings l on l.id=m.listing_id
      join lateral (select id from public.marketplace_acquisitions c where c.owner_user_id=m.owner_user_id
        and c.listing_id=m.listing_id order by (c.kind='paid') desc,acquired_at,id limit 1) c on true
      where m.project_id=p_project_id and m.owner_user_id=p_owner_user_id
  ) origins order by priority limit 1;
$$;

do $$ declare signature text; begin
  foreach signature in array array[
    'public.marketplace_owned_listing(uuid,uuid,uuid)',
    'public.marketplace_project_templates(uuid,uuid[])',
    'public.marketplace_template_source(uuid,uuid)',
    'public.marketplace_template_preview(uuid,uuid)',
    'public.marketplace_create(uuid,uuid,uuid,text,text,text,text[],text,boolean,boolean)',
    'public.marketplace_origin(uuid,uuid)'
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
