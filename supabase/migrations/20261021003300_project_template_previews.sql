-- Project-derived template drafts and separately reviewed preview derivatives.
-- Existing source uniqueness, RLS, immutable published snapshots and money rules remain.
begin;
do $$
declare required record;
begin
  for required in select * from (values
    ('projects','id','uuid'), ('projects','owner_user_id','uuid'), ('projects','creation_type','text'), ('projects','ugc_type','text'),
    ('project_assets','id','uuid'), ('project_assets','project_id','uuid'), ('project_assets','owner_user_id','uuid'),
    ('project_assets','removed_from_draft','boolean'), ('project_assets','upload_status','text'), ('project_assets','media_type','text'),
    ('marketplace_listings','source_project_id','uuid'), ('marketplace_listings','creator_user_id','uuid'),
    ('marketplace_listings','template_snapshot','jsonb'), ('marketplace_listings','fallback_color','text')
  ) as prerequisites(relation_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.relation_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Template prerequisite missing or incompatible: %.%',required.relation_name,required.column_name;
    end if;
  end loop;
end $$;

alter table public.marketplace_listings
  add column if not exists preview_source_asset_id uuid references public.project_assets(id) on delete restrict,
  add column if not exists preview_key text,
  add column if not exists preview_etag text,
  add column if not exists preview_size integer;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.marketplace_listings'::regclass and conname='marketplace_preview_derivative_check') then
    alter table public.marketplace_listings add constraint marketplace_preview_derivative_check check (
      (preview_key is null and preview_etag is null and preview_size is null) or
      (preview_key is not null and preview_key ~ ('^marketplace-previews/' || id::text || '/[a-f0-9-]{36}\.webp$')
        and preview_etag is not null and preview_size is not null and preview_size between 1 and 524288));
  end if;
end $$;

-- Add only the new non-private enums to newly created immutable snapshots.
-- Fail closed if the verified prerequisite function has drifted.
do $$ declare definition text; begin
  definition=pg_get_functiondef('public.marketplace_create(uuid,uuid,uuid,text,text,text,text[],text,boolean,boolean)'::regprocedure);
  if position('''creationType''' in definition)=0 then
    if position('''settings'',jsonb_build_object' in definition)=0 then raise exception 'Inspect marketplace_create before extending its snapshot.'; end if;
    definition=replace(definition,'''settings'',jsonb_build_object','''creationType'',project.creation_type,''ugcType'',project.ugc_type,''settings'',jsonb_build_object');
    execute definition;
  end if;
end $$;

create or replace function public.marketplace_initialize_template(p_owner_user_id uuid,p_project_id uuid,p_listing_id uuid,
  p_title text,p_description text,p_instructions text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; source_id uuid;
begin
  -- marketplace_create takes the project row lock and enforces one listing per source.
  result=public.marketplace_create_priced(p_owner_user_id,p_listing_id,p_project_id,p_title,p_description,
    (select category from public.projects where id=p_project_id and owner_user_id=p_owner_user_id and status='draft'),
    '{}'::text[],p_instructions,false,false,'free',0);
  if result->>'code'='SAVED' then
    select id into source_id from public.project_assets where project_id=p_project_id and owner_user_id=p_owner_user_id
      and upload_status='uploaded' and not removed_from_draft and media_type in ('image','video') order by created_at,id limit 1;
    update public.marketplace_listings set preview_source_asset_id=source_id where id=p_listing_id and creator_user_id=p_owner_user_id;
  end if;
  return result;
end $$;

create or replace function public.marketplace_template_preview(p_listing_id uuid,p_owner_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('key',l.preview_key,'etag',l.preview_etag,'size',l.preview_size)
  from public.marketplace_listings l where l.id=p_listing_id and l.preview_key is not null
    and ((l.status='published' and l.rights_confirmed_at is not null) or l.creator_user_id=p_owner_user_id);
$$;
create or replace function public.marketplace_project_templates(p_owner_user_id uuid,p_project_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(source_project_id::text,id::text),'{}'::jsonb)
    from public.marketplace_listings where creator_user_id=p_owner_user_id and source_project_id=any(p_project_ids);
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
  ) a on true where l.id=p_listing_id and l.creator_user_id=p_owner_user_id;
$$;

-- The preview and ordinary metadata commit together. Only trusted server-created
-- derivative identities reach this service-only RPC, never arbitrary browser keys.
-- Draft instructions remain reviewable until the first publish. Published
-- snapshots, and every saved purchase/adoption snapshot, stay immutable.
create or replace function public.marketplace_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_table_name='marketplace_adoptions' then raise exception 'Adoption provenance is immutable.'; end if;
  if (new.id,new.creator_user_id,new.source_project_id,new.creator_name,new.created_at)
    is distinct from (old.id,old.creator_user_id,old.source_project_id,old.creator_name,old.created_at) then
    raise exception 'Listing identity is immutable.';
  end if;
  if new.template_snapshot is distinct from old.template_snapshot and (
    old.status<>'draft' or old.published_at is not null or
    (new.template_snapshot-'instructions') is distinct from (old.template_snapshot-'instructions') or
    not public.marketplace_safe_text(new.template_snapshot->>'instructions') or
    char_length(btrim(new.template_snapshot->>'instructions')) not between 1 and 4000) then
    raise exception 'Published template snapshots and creative settings are immutable.';
  end if;
  new.updated_at=now(); return new;
end $$;

create or replace function public.marketplace_update_template(p_owner_user_id uuid,p_listing_id uuid,p_title text,p_description text,
  p_category text,p_tags text[],p_status text,p_rights_confirmed boolean,p_adoption_type text,p_price_minor integer,
  p_instructions text,p_preview_key text,p_preview_etag text,p_preview_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; source_id uuid; listing public.marketplace_listings;
begin
  if p_preview_key is not null and not p_rights_confirmed then return jsonb_build_object('code','INVALID_INPUT'); end if;
  select * into listing from public.marketplace_listings where id=p_listing_id and creator_user_id=p_owner_user_id for update;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  if p_instructions is not null and p_instructions is distinct from (listing.template_snapshot->>'instructions') then
    if listing.status<>'draft' or listing.published_at is not null or not public.marketplace_safe_text(p_instructions)
      or char_length(btrim(p_instructions)) not between 1 and 4000 then return jsonb_build_object('code','INVALID_INPUT'); end if;
    update public.marketplace_listings set template_snapshot=jsonb_set(template_snapshot,'{instructions}',to_jsonb(btrim(p_instructions))) where id=p_listing_id;
  end if;
  result=public.marketplace_update_priced(p_owner_user_id,p_listing_id,p_title,p_description,p_category,p_tags,p_status,
    p_rights_confirmed,p_adoption_type,p_price_minor);
  if result->>'code'<>'SAVED' then raise exception 'Template update rejected; all changes rolled back.'; end if;
  if result->>'code'='SAVED' and p_preview_key is not null then
    select (public.marketplace_template_source(p_listing_id,p_owner_user_id)->>'assetId')::uuid into source_id;
    if source_id is null then raise exception 'A verified owned preview source is required.'; end if;
    update public.marketplace_listings set preview_key=p_preview_key,preview_etag=p_preview_etag,preview_size=p_preview_size,
      preview_source_asset_id=coalesce(preview_source_asset_id,source_id) where id=p_listing_id and creator_user_id=p_owner_user_id;
  end if;
  return result;
end $$;

create or replace function public.marketplace_listing_json(l public.marketplace_listings) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'category',l.category,'tags',l.tags,
    'creatorName',l.creator_name,'template',case when l.adoption_type='paid' then jsonb_set(l.template_snapshot,'{instructions}',to_jsonb('Unlock this template to view reusable instructions.'::text)) else l.template_snapshot end,
    'adoptionType',l.adoption_type,'priceMinor',l.price_minor,'currency',l.currency,'status',l.status,
    'createdAt',l.created_at,'publishedAt',l.published_at,'fallbackColor',l.fallback_color,
    'previewUrl',case when l.preview_key is not null then '/api/marketplace/listings/'||l.id::text||'/preview' end);
$$;

-- Preserve legacy adoption defaults while carrying the new source enum snapshot.
do $$ declare signature text; definition text; begin
  foreach signature in array array['public.marketplace_adopt(uuid,uuid,uuid)','public.marketplace_redeem_purchase(uuid,uuid)'] loop
    if to_regprocedure(signature) is null then raise exception 'Missing adoption prerequisite: %',signature; end if;
    definition=pg_get_functiondef(signature::regprocedure);
    -- Existing immutable purchase snapshots and accounting are untouched.
    if position('creation_type,ugc_type' in definition)=0 then
      if position('aspect_ratio,duration,visual_style,tone)' in definition)=0 or
        (position('listing.template_snapshot->''settings''->>''tone'');' in definition)=0 and
         position('e.template_snapshot->''settings''->>''tone'');' in definition)=0) then
        raise exception 'Inspect adoption snapshot insert before extending: %',signature;
      end if;
      definition=replace(definition,'aspect_ratio,duration,visual_style,tone)', 'aspect_ratio,duration,visual_style,tone,creation_type,ugc_type)');
      definition=replace(definition,'listing.template_snapshot->''settings''->>''tone'');', 'listing.template_snapshot->''settings''->>''tone'',coalesce(listing.template_snapshot->>''creationType'',''freestyle''),coalesce(listing.template_snapshot->>''ugcType'',''advertisement''));');
      definition=replace(definition,'e.template_snapshot->''settings''->>''tone'');', 'e.template_snapshot->''settings''->>''tone'',coalesce(e.template_snapshot->>''creationType'',''freestyle''),coalesce(e.template_snapshot->>''ugcType'',''advertisement''));');
      execute definition;
    end if;
  end loop;
end $$;

do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
    and proname in ('marketplace_initialize_template','marketplace_template_preview','marketplace_template_source','marketplace_update_template','marketplace_project_templates') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
revoke all on function public.marketplace_listing_json(public.marketplace_listings) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
