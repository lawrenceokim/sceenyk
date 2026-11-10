-- Private acquired-template library. No payment/provider/accounting mutations.
begin;

do $$
declare required record;
begin
  for required in select * from (values
    ('marketplace_listings','id','uuid'), ('marketplace_listings','creator_name','text'),
    ('marketplace_listings','description','text'), ('marketplace_listings','template_snapshot','jsonb'),
    ('marketplace_listings','status','text'), ('marketplace_listings','rights_confirmed_at','timestamp with time zone'),
    ('marketplace_listings','preview_key','text'), ('marketplace_listings','preview_etag','text'), ('marketplace_listings','preview_size','integer'),
    ('marketplace_purchases','id','uuid'), ('marketplace_purchases','buyer_user_id','uuid'),
    ('marketplace_purchases','listing_id','uuid'), ('marketplace_purchases','status','text'),
    ('marketplace_purchases','amount_minor','integer'), ('marketplace_purchases','completed_at','timestamp with time zone'),
    ('marketplace_purchases','paypal_capture_id','text'),
    ('marketplace_entitlements','purchase_id','uuid'), ('marketplace_entitlements','buyer_user_id','uuid'),
    ('marketplace_entitlements','listing_id','uuid'), ('marketplace_entitlements','listing_title','text'),
    ('marketplace_entitlements','template_snapshot','jsonb'), ('marketplace_entitlements','created_at','timestamp with time zone'),
    ('marketplace_adoptions','project_id','uuid'), ('marketplace_adoptions','adopter_user_id','uuid'),
    ('marketplace_adoptions','listing_id','uuid'), ('marketplace_adoptions','purchase_id','uuid'),
    ('marketplace_adoptions','listing_title','text'), ('marketplace_adoptions','created_at','timestamp with time zone'),
    ('projects','id','uuid'), ('projects','owner_user_id','uuid'), ('projects','deleted_at','timestamp with time zone'),
    ('projects','title','text'), ('projects','category','text'), ('projects','prompt','text'),
    ('projects','aspect_ratio','text'), ('projects','duration','text'), ('projects','visual_style','text'),
    ('projects','tone','text'), ('projects','creation_type','text'), ('projects','ugc_type','text'), ('projects','video_resolution','text')
  ) as prerequisites(relation_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.relation_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Purchases prerequisite missing or incompatible: %.%',required.relation_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.marketplace_redeem_purchase(uuid,uuid)') is null
    or to_regprocedure('public.marketplace_purchase_financial_status(uuid,uuid)') is null then
    raise exception 'Existing Marketplace redemption and financial-status functions are required.';
  end if;
end $$;

-- A replaceable pointer only; original immutable payment/adoption history stays intact.
create table if not exists public.marketplace_acquisition_projects (
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  project_id uuid not null unique,
  primary key(owner_user_id,listing_id),
  foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict
);
alter table public.marketplace_acquisition_projects enable row level security;
revoke all on public.marketplace_acquisition_projects from public,anon,authenticated,service_role;
grant select on public.marketplace_acquisition_projects to service_role;

-- No grant on this view. All access goes through owner-filtered service RPCs.
create or replace view public.marketplace_acquisitions as
select e.purchase_id as id,e.buyer_user_id as owner_user_id,e.listing_id,e.listing_title as title,
  e.template_snapshot,p.amount_minor,coalesce(p.completed_at,e.created_at) as acquired_at,'paid'::text as kind
from public.marketplace_entitlements e join public.marketplace_purchases p
  on p.id=e.purchase_id and p.buyer_user_id=e.buyer_user_id and p.listing_id=e.listing_id
where p.status='completed' and p.paypal_capture_id is not null
union all
select a.project_id,a.adopter_user_id,a.listing_id,a.listing_title,l.template_snapshot,0,a.created_at,'free'::text
from (select distinct on(adopter_user_id,listing_id) * from public.marketplace_adoptions
  where purchase_id is null order by adopter_user_id,listing_id,created_at,project_id) a
join public.marketplace_listings l on l.id=a.listing_id;
revoke all on public.marketplace_acquisitions from public,anon,authenticated,service_role;

create or replace function public.marketplace_acquisition_detail(p_owner uuid,p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'listingId',a.listing_id,'title',a.title,'description',l.description,
    'creatorName',l.creator_name,'kind',a.kind,'amountMinor',a.amount_minor,'acquiredAt',a.acquired_at,
    'financialStatus',case when a.kind='free' then 'free' else
      public.marketplace_purchase_financial_status(p_owner,a.id)->>'financialStatus' end,
    'listingAvailable',l.status='published',
    'previewUrl',case when l.preview_key is not null and l.rights_confirmed_at is not null then '/api/purchases/'||a.id::text||'/preview' end,
    -- Explicit shared fields only, independent of future private snapshot extensions.
    'template',jsonb_strip_nulls(jsonb_build_object('version',a.template_snapshot->'version',
      'category',a.template_snapshot->'category','instructions',a.template_snapshot->'instructions',
      'creationType',a.template_snapshot->'creationType','ugcType',a.template_snapshot->'ugcType',
      'settings',jsonb_strip_nulls(jsonb_build_object(
        'aspectRatio',a.template_snapshot->'settings'->'aspectRatio','duration',a.template_snapshot->'settings'->'duration',
        'visualStyle',a.template_snapshot->'settings'->'visualStyle','tone',a.template_snapshot->'settings'->'tone',
        'resolution',a.template_snapshot->'settings'->'resolution')))))
  from public.marketplace_acquisitions a join public.marketplace_listings l on l.id=a.listing_id
  where a.owner_user_id=p_owner and a.id=p_id;
$$;

create or replace function public.marketplace_acquisition_library(p_owner uuid,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; total integer;
begin
  if p_owner is null or p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid purchases query.'; end if;
  select count(*) into total from public.marketplace_acquisitions where owner_user_id=p_owner;
  select coalesce(jsonb_agg(public.marketplace_acquisition_detail(p_owner,a.id) order by a.acquired_at desc,a.id desc),'[]'::jsonb)
    into items from (select id,acquired_at from public.marketplace_acquisitions where owner_user_id=p_owner
      order by acquired_at desc,id desc limit 12 offset(p_page-1)*12) a;
  return jsonb_build_object('items',items,'total',total,'page',p_page,'pageSize',12);
end $$;

create or replace function public.marketplace_acquisition_preview(p_owner uuid,p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('listingId',l.id,'key',l.preview_key,'etag',l.preview_etag,'size',l.preview_size)
  from public.marketplace_acquisitions a join public.marketplace_listings l on l.id=a.listing_id
  where a.owner_user_id=p_owner and a.id=p_id and l.rights_confirmed_at is not null and l.preview_key is not null;
$$;

create or replace function public.marketplace_open_acquisition(p_owner uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare acquired record; target uuid; redeemed jsonb;
begin
  select * into acquired from public.marketplace_acquisitions where owner_user_id=p_owner and id=p_id;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  -- Serializes repeated/multi-tab opens, including replacement after soft deletion.
  perform pg_advisory_xact_lock(hashtextextended('marketplace-version:'||p_owner::text||':'||acquired.listing_id::text,0));
  select p.id into target from public.marketplace_acquisition_projects m join public.projects p
    on p.id=m.project_id and p.owner_user_id=m.owner_user_id
    where m.owner_user_id=p_owner and m.listing_id=acquired.listing_id and p.deleted_at is null for share of p;
  if target is null then
    select p.id into target from public.marketplace_adoptions a join public.projects p
      on p.id=a.project_id and p.owner_user_id=a.adopter_user_id
      where a.adopter_user_id=p_owner and a.listing_id=acquired.listing_id and p.deleted_at is null
      order by a.created_at desc,a.project_id desc limit 1 for share of p;
  end if;
  if target is null and acquired.kind='paid' and not exists(
    select 1 from public.marketplace_adoptions where purchase_id=acquired.id and adopter_user_id=p_owner) then
    -- Existing verified-entitlement redemption, with no PayPal or credit action.
    redeemed=public.marketplace_redeem_purchase(p_owner,acquired.id);
    if redeemed->>'code'<>'ADOPTED' then return jsonb_build_object('code','NOT_FOUND'); end if;
    target=(redeemed->>'projectId')::uuid;
  end if;
  if target is null then
    -- Same permitted settings-only project creation as Marketplace adoption.
    -- A replacement gets no source media, approvals, free-use assignment or generation authority.
    target=gen_random_uuid();
    insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type,video_resolution)
    values(target,p_owner,acquired.title,acquired.template_snapshot->>'category',acquired.template_snapshot->>'instructions',
      acquired.template_snapshot->'settings'->>'aspectRatio',acquired.template_snapshot->'settings'->>'duration',
      acquired.template_snapshot->'settings'->>'visualStyle',acquired.template_snapshot->'settings'->>'tone',
      coalesce(acquired.template_snapshot->>'creationType','freestyle'),coalesce(acquired.template_snapshot->>'ugcType','advertisement'),
      coalesce(acquired.template_snapshot->'settings'->>'resolution','480p'));
  end if;
  insert into public.marketplace_acquisition_projects(owner_user_id,listing_id,project_id) values(p_owner,acquired.listing_id,target)
    on conflict(owner_user_id,listing_id) do update set project_id=excluded.project_id;
  return jsonb_build_object('code','ADOPTED','projectId',target);
end $$;

create or replace function public.marketplace_origin(p_owner_user_id uuid,p_project_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select origin from (
    select jsonb_build_object('listingId',a.listing_id,'title',a.listing_title) as origin,0 as priority
      from public.marketplace_adoptions a join public.projects p on p.id=a.project_id and p.owner_user_id=a.adopter_user_id
      where a.project_id=p_project_id and a.adopter_user_id=p_owner_user_id
    union all
    select jsonb_build_object('listingId',m.listing_id,'title',l.title),1 from public.marketplace_acquisition_projects m
      join public.marketplace_listings l on l.id=m.listing_id
      where m.project_id=p_project_id and m.owner_user_id=p_owner_user_id
  ) origins order by priority limit 1;
$$;

do $$ declare signature text; begin
  foreach signature in array array['public.marketplace_acquisition_detail(uuid,uuid)',
    'public.marketplace_acquisition_library(uuid,integer)','public.marketplace_acquisition_preview(uuid,uuid)',
    'public.marketplace_open_acquisition(uuid,uuid)','public.marketplace_origin(uuid,uuid)'] loop
    execute format('revoke all on function %s from public,anon,authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
