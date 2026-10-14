-- USD Sandbox only. No AI-credit writes, payouts or automatic settlement.
begin;

do $$ begin
  if to_regclass('public.marketplace_adoptions') is null or to_regclass('public.credit_purchases') is null then
    raise exception 'Apply migrations through 020 first.';
  end if;
  if to_regclass('public.marketplace_purchases') is not null then raise exception 'Inspect existing schema before applying 021.'; end if;
end $$;

alter table public.marketplace_listings drop constraint marketplace_listings_adoption_type_check;
alter table public.marketplace_listings add column price_minor integer not null default 0,
  add column currency text not null default 'USD' check(currency='USD'),
  add constraint marketplace_adoption_price check (
    (adoption_type='free' and price_minor=0) or (adoption_type='paid' and price_minor between 1 and 100000));

create table public.marketplace_purchases (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  buyer_user_id uuid not null references public.app_users(id) on delete restrict,
  creator_user_id uuid not null references public.app_users(id) on delete restrict,
  environment text not null default 'sandbox' check(environment='sandbox'),
  listing_title text not null,
  template_snapshot jsonb not null,
  amount_minor integer not null check(amount_minor between 1 and 100000),
  platform_fee_minor integer not null check(platform_fee_minor>=0),
  creator_net_minor integer not null check(creator_net_minor>=0),
  fee_bps integer not null check(fee_bps between 0 and 10000),
  pricing_version text not null check(char_length(pricing_version) between 1 and 100),
  currency text not null check(currency='USD'),
  paypal_order_id text unique check(paypal_order_id ~ '^[A-Z0-9]{10,32}$'),
  paypal_capture_id text unique check(paypal_capture_id ~ '^[A-Z0-9]{10,32}$'),
  capture_request_id uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check(status in ('pending','approved','completed','failed')),
  completed_at timestamptz, failed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(buyer_user_id,listing_id),
  unique(id,buyer_user_id,listing_id),
  check(buyer_user_id<>creator_user_id),
  check(platform_fee_minor=(amount_minor::bigint*fee_bps/10000)::integer and creator_net_minor=amount_minor-platform_fee_minor),
  check((status='completed' and completed_at is not null and paypal_order_id is not null and paypal_capture_id is not null)
    or(status<>'completed' and completed_at is null and paypal_capture_id is null))
);
create index marketplace_purchase_buyer on public.marketplace_purchases(buyer_user_id,created_at desc);

create table public.marketplace_entitlements (
  purchase_id uuid primary key,
  buyer_user_id uuid not null,
  listing_id uuid not null,
  listing_title text not null,
  template_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(buyer_user_id,listing_id), unique(purchase_id,buyer_user_id,listing_id),
  foreign key(purchase_id,buyer_user_id,listing_id) references public.marketplace_purchases(id,buyer_user_id,listing_id) on delete restrict
);
alter table public.marketplace_adoptions add column purchase_id uuid unique,
  add foreign key(purchase_id,adopter_user_id,listing_id) references public.marketplace_entitlements(purchase_id,buyer_user_id,listing_id) on delete restrict;
-- Free client request keys and paid purchase keys are separate namespaces.
alter table public.marketplace_adoptions drop constraint marketplace_adoptions_adopter_user_id_request_id_key;
create unique index marketplace_free_adoption_request on public.marketplace_adoptions(adopter_user_id,request_id) where purchase_id is null;

-- Append-only events. A future availability/reversal appends another event;
-- the original pending sale and its amounts must never be rewritten/deleted.
create table public.creator_earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references public.app_users(id) on delete restrict,
  marketplace_purchase_id uuid not null references public.marketplace_purchases(id) on delete restrict,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  listing_title text not null,
  gross_minor integer not null check(gross_minor>0),
  platform_fee_minor integer not null check(platform_fee_minor>=0),
  net_minor integer not null check(net_minor>=0 and net_minor=gross_minor-platform_fee_minor),
  currency text not null check(currency='USD'),
  state text not null check(state in ('pending','available','reversed')),
  available_at timestamptz,
  created_at timestamptz not null default now(),
  unique(marketplace_purchase_id,state),
  check((state='available')=(available_at is not null))
);
create index creator_earnings_owner on public.creator_earnings_ledger(creator_user_id,created_at desc);

create function public.marketplace_financial_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name<>'marketplace_purchases' or tg_op='DELETE' then raise exception 'Financial history is immutable.'; end if;
  if old.status='completed' or
    (new.id,new.listing_id,new.buyer_user_id,new.creator_user_id,new.environment,new.listing_title,new.template_snapshot,
     new.amount_minor,new.platform_fee_minor,new.creator_net_minor,new.fee_bps,new.pricing_version,new.currency,new.capture_request_id,new.created_at)
    is distinct from
    (old.id,old.listing_id,old.buyer_user_id,old.creator_user_id,old.environment,old.listing_title,old.template_snapshot,
     old.amount_minor,old.platform_fee_minor,old.creator_net_minor,old.fee_bps,old.pricing_version,old.currency,old.capture_request_id,old.created_at)
    or(old.paypal_order_id is not null and new.paypal_order_id is distinct from old.paypal_order_id) then
    raise exception 'Purchase identity and completed history are immutable.';
  end if;
  new.updated_at=now(); return new;
end $$;
create trigger marketplace_purchase_guard before update or delete on public.marketplace_purchases for each row execute function public.marketplace_financial_guard();
create trigger marketplace_entitlement_guard before update or delete on public.marketplace_entitlements for each row execute function public.marketplace_financial_guard();
create trigger creator_earnings_guard before update or delete on public.creator_earnings_ledger for each row execute function public.marketplace_financial_guard();

create function public.marketplace_prepare_purchase(p_buyer_user_id uuid,p_listing_id uuid,p_fee_bps integer,p_pricing_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.marketplace_listings; p public.marketplace_purchases;
begin
  if p_buyer_user_id is null or p_listing_id is null or p_fee_bps is null or p_fee_bps not between 0 and 10000 then raise exception 'Invalid purchase.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('marketplace-buy:'||p_buyer_user_id::text||':'||p_listing_id::text,0));
  select * into p from public.marketplace_purchases where buyer_user_id=p_buyer_user_id and listing_id=p_listing_id;
  if found then return to_jsonb(p); end if;
  select * into l from public.marketplace_listings where id=p_listing_id and status='published' and adoption_type='paid' for share;
  if not found or l.creator_user_id=p_buyer_user_id then raise exception 'Paid listing unavailable.'; end if;
  if(select count(*) from public.marketplace_purchases where buyer_user_id=p_buyer_user_id and created_at>now()-interval '1 hour')>=20 then raise exception 'Purchase request limit reached.'; end if;
  insert into public.marketplace_purchases(listing_id,buyer_user_id,creator_user_id,listing_title,template_snapshot,amount_minor,platform_fee_minor,creator_net_minor,fee_bps,pricing_version,currency)
  values(l.id,p_buyer_user_id,l.creator_user_id,l.title,l.template_snapshot,l.price_minor,(l.price_minor::bigint*p_fee_bps/10000)::integer,
    l.price_minor-(l.price_minor::bigint*p_fee_bps/10000)::integer,p_fee_bps,p_pricing_version,l.currency) returning * into p;
  return to_jsonb(p);
end $$;

create function public.marketplace_attach_order(p_purchase_id uuid,p_buyer_user_id uuid,p_order_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.marketplace_purchases;
begin
  select * into p from public.marketplace_purchases where id=p_purchase_id and buyer_user_id=p_buyer_user_id for update;
  if not found then return false; end if;
  if p.paypal_order_id is not null then return p.paypal_order_id=p_order_id; end if;
  if p.status<>'pending' or exists(select 1 from public.credit_purchases where paypal_order_id=p_order_id) then return false; end if;
  update public.marketplace_purchases set paypal_order_id=p_order_id where id=p.id; return true;
end $$;

create function public.marketplace_purchase_state(p_purchase_id uuid,p_status text) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.marketplace_purchases;
begin
  if p_status is null or p_status not in ('approved','failed') then return false; end if;
  select * into p from public.marketplace_purchases where id=p_purchase_id for update;
  if not found then return false; end if;
  if p.status='completed' or p.status=p_status then return true; end if;
  if p.status='failed' then return false; end if;
  update public.marketplace_purchases set status=p_status,failed_at=case when p_status='failed' then now() end where id=p.id; return true;
end $$;

-- Only the trusted PayPal verifier calls this. No browser completion endpoint
-- accepts financial proof. All three durable effects commit together.
create function public.marketplace_fulfil_purchase(p_purchase_id uuid,p_order_id text,p_capture_id text,p_amount_minor integer,p_currency text) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.marketplace_purchases;
begin
  select * into p from public.marketplace_purchases where id=p_purchase_id and paypal_order_id=p_order_id for update;
  if not found or p.environment<>'sandbox' or p.amount_minor is distinct from p_amount_minor or p.currency is distinct from p_currency
    or p_capture_id is null or p_capture_id !~ '^[A-Z0-9]{10,32}$'
    or exists(select 1 from public.credit_purchases where paypal_order_id=p_order_id or paypal_capture_id=p_capture_id) then return false; end if;
  if p.status='completed' then return p.paypal_capture_id=p_capture_id; end if;
  insert into public.creator_earnings_ledger(creator_user_id,marketplace_purchase_id,listing_id,listing_title,gross_minor,platform_fee_minor,net_minor,currency,state)
    values(p.creator_user_id,p.id,p.listing_id,p.listing_title,p.amount_minor,p.platform_fee_minor,p.creator_net_minor,p.currency,'pending');
  insert into public.marketplace_entitlements(purchase_id,buyer_user_id,listing_id,listing_title,template_snapshot)
    values(p.id,p.buyer_user_id,p.listing_id,p.listing_title,p.template_snapshot);
  update public.marketplace_purchases set status='completed',paypal_capture_id=p_capture_id,completed_at=now() where id=p.id;
  return true;
end $$;

create function public.marketplace_redeem_purchase(p_buyer_user_id uuid,p_purchase_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.marketplace_entitlements; previous uuid; project_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('marketplace-redeem:'||coalesce(p_purchase_id::text,''),0));
  select * into e from public.marketplace_entitlements where purchase_id=p_purchase_id and buyer_user_id=p_buyer_user_id;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  select a.project_id into previous from public.marketplace_adoptions a where purchase_id=e.purchase_id;
  if found then return jsonb_build_object('code','ADOPTED','projectId',previous); end if;
  project_id=gen_random_uuid();
  insert into public.projects(id,owner_user_id,title,category,prompt,aspect_ratio,duration,visual_style,tone)
    values(project_id,e.buyer_user_id,e.listing_title,e.template_snapshot->>'category',e.template_snapshot->>'instructions',
      e.template_snapshot->'settings'->>'aspectRatio',e.template_snapshot->'settings'->>'duration',e.template_snapshot->'settings'->>'visualStyle',e.template_snapshot->'settings'->>'tone');
  insert into public.marketplace_adoptions(project_id,adopter_user_id,listing_id,request_id,listing_title,template_version,purchase_id)
    values(project_id,e.buyer_user_id,e.listing_id,e.purchase_id,e.listing_title,1,e.purchase_id);
  return jsonb_build_object('code','ADOPTED','projectId',project_id);
end $$;

-- Effective state is projected from immutable events; no settlement/reversal
-- mutation API is exposed in this unit.
create function public.marketplace_creator_earnings(p_creator_user_id uuid,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_creator_user_id is null or p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid earnings query.'; end if;
  with sales as (
    select e.*,case when exists(select 1 from public.creator_earnings_ledger x where x.marketplace_purchase_id=e.marketplace_purchase_id and x.state='reversed') then 'reversed'
      when exists(select 1 from public.creator_earnings_ledger x where x.marketplace_purchase_id=e.marketplace_purchase_id and x.state='available') then 'available' else 'pending' end as effective_state
    from public.creator_earnings_ledger e where e.creator_user_id=p_creator_user_id and e.state='pending'
  ) select jsonb_build_object('currency','USD','pending',coalesce(sum(net_minor) filter(where effective_state='pending'),0),
    'available',coalesce(sum(net_minor) filter(where effective_state='available'),0),'lifetime',coalesce(sum(net_minor) filter(where effective_state<>'reversed'),0),
    'total',count(*),'page',p_page,'pageSize',12,'sales',coalesce((select jsonb_agg(item order by created_at desc,id desc) from (
      select jsonb_build_object('listingId',listing_id,'title',listing_title,'createdAt',created_at,'gross',gross_minor,'fee',platform_fee_minor,'net',net_minor,'state',effective_state) as item,created_at,id
      from sales order by created_at desc,id desc limit 12 offset (p_page-1)*12) rows),'[]'::jsonb)) into result from sales;
  return result;
end $$;

alter table public.marketplace_purchases enable row level security;
alter table public.marketplace_entitlements enable row level security;
alter table public.creator_earnings_ledger enable row level security;
revoke all on public.marketplace_purchases,public.marketplace_entitlements,public.creator_earnings_ledger from public,anon,authenticated,service_role;
grant select on public.marketplace_purchases,public.marketplace_entitlements,public.creator_earnings_ledger to service_role;

create or replace function public.marketplace_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_table_name='marketplace_adoptions' then raise exception 'Adoption provenance is immutable.'; end if;
  if (new.id,new.creator_user_id,new.source_project_id,new.template_snapshot,new.creator_name,new.created_at)
    is distinct from (old.id,old.creator_user_id,old.source_project_id,old.template_snapshot,old.creator_name,old.created_at) then
    raise exception 'Listing identity and template snapshot are immutable.';
  end if;
  new.updated_at=now();
  return new;
end;
$$;
create or replace function public.marketplace_listing_json(l public.marketplace_listings) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'category',l.category,'tags',l.tags,
    'creatorName',l.creator_name,'template',case when l.adoption_type='paid' then jsonb_set(l.template_snapshot,'{instructions}',to_jsonb('Unlock this template to view reusable instructions.'::text)) else l.template_snapshot end,'adoptionType',l.adoption_type,'priceMinor',l.price_minor,'currency',l.currency,'status',l.status,
    'createdAt',l.created_at,'publishedAt',l.published_at);
$$;
create or replace function public.marketplace_adopt(p_owner_user_id uuid,p_listing_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.marketplace_adoptions; listing public.marketplace_listings; project_id uuid;
begin
  if p_owner_user_id is null or p_listing_id is null or p_request_id is null or not exists(select 1 from public.app_users where id=p_owner_user_id) then return jsonb_build_object('code','INVALID_INPUT'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text||':'||p_request_id::text,0));
  select * into previous from public.marketplace_adoptions where adopter_user_id=p_owner_user_id and request_id=p_request_id and purchase_id is null;
  if found then
    if previous.listing_id<>p_listing_id then return jsonb_build_object('code','CONFLICT'); end if;
    return jsonb_build_object('code','ADOPTED','projectId',previous.project_id);
  end if;
  select * into listing from public.marketplace_listings where id=p_listing_id and status='published' for share;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  if listing.adoption_type<>'free' then return jsonb_build_object('code','PAYMENT_REQUIRED'); end if;
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
create function public.marketplace_owned_json(l public.marketplace_listings) returns jsonb
language sql stable set search_path='' as $$
  select public.marketplace_listing_json(l)||jsonb_build_object('template',l.template_snapshot,'sourceProjectId',l.source_project_id,'rightsConfirmed',l.rights_confirmed_at is not null,
    'adoptionCount',(select count(*) from public.marketplace_adoptions where listing_id=l.id),
    'paidSalesCount',(select count(*) from public.marketplace_purchases where listing_id=l.id and status='completed'),
    'creatorEarningsMinor',(select coalesce(sum(net_minor),0) from public.creator_earnings_ledger e where e.listing_id=l.id and e.state='pending'
      and not exists(select 1 from public.creator_earnings_ledger r where r.marketplace_purchase_id=e.marketplace_purchase_id and r.state='reversed')));
$$;

create or replace function public.marketplace_owned(p_owner_user_id uuid,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer;
begin
  if p_owner_user_id is null or p_page is null or p_page<1 or p_page>100000 then raise exception 'Invalid owner query.'; end if;
  select count(*) into total from public.marketplace_listings where creator_user_id=p_owner_user_id;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into result from (
    select public.marketplace_owned_json(l) as item,l.created_at,l.id
    from public.marketplace_listings l where l.creator_user_id=p_owner_user_id order by l.created_at desc,l.id desc limit 12 offset (p_page-1)*12
  ) rows;
  return jsonb_build_object('items',result,'total',total,'page',p_page,'pageSize',12);
end;
$$;
create or replace function public.marketplace_owned_listing(p_owner_user_id uuid,p_listing_id uuid,p_project_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select public.marketplace_owned_json(l)
  from public.marketplace_listings l where l.creator_user_id=p_owner_user_id
    and ((p_listing_id is not null and l.id=p_listing_id) or (p_listing_id is null and l.source_project_id=p_project_id));
$$;
-- Old free-client signatures remain compatible; configuration is transactional.
create function public.marketplace_create_priced(p_owner_user_id uuid,p_listing_id uuid,p_project_id uuid,p_title text,p_description text,
  p_category text,p_tags text[],p_instructions text,p_publish boolean,p_rights_confirmed boolean,p_adoption_type text,p_price_minor integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_adoption_type is null or p_price_minor is null or not ((p_adoption_type='free' and p_price_minor=0) or (p_adoption_type='paid' and p_price_minor between 1 and 100000)) then return jsonb_build_object('code','INVALID_INPUT'); end if;
  result=public.marketplace_create(p_owner_user_id,p_listing_id,p_project_id,p_title,p_description,p_category,p_tags,p_instructions,p_publish,p_rights_confirmed);
  if result->>'code'='SAVED' then update public.marketplace_listings set adoption_type=p_adoption_type,price_minor=p_price_minor where id=p_listing_id; end if;
  return result;
end $$;
create function public.marketplace_update_priced(p_owner_user_id uuid,p_listing_id uuid,p_title text,p_description text,
  p_category text,p_tags text[],p_status text,p_rights_confirmed boolean,p_adoption_type text,p_price_minor integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_adoption_type is null or p_price_minor is null or not ((p_adoption_type='free' and p_price_minor=0) or (p_adoption_type='paid' and p_price_minor between 1 and 100000)) then return jsonb_build_object('code','INVALID_INPUT'); end if;
  result=public.marketplace_update(p_owner_user_id,p_listing_id,p_title,p_description,p_category,p_tags,p_status,p_rights_confirmed);
  if result->>'code'='SAVED' then update public.marketplace_listings set adoption_type=p_adoption_type,price_minor=p_price_minor where id=p_listing_id; end if;
  return result;
end $$;
create function public.marketplace_paid_project(p_buyer_user_id uuid,p_purchase_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('projectId',(select a.project_id from public.marketplace_adoptions a where a.purchase_id=p_purchase_id and a.adopter_user_id=p_buyer_user_id));
$$;

do $$ declare f record; begin
  for f in select oid::regprocedure as signature,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'marketplace_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname not in ('marketplace_immutable','marketplace_listing_json','marketplace_owned_json','marketplace_safe_text','marketplace_financial_guard') then
      execute format('grant execute on function %s to service_role',f.signature);
    end if;
  end loop;
end $$;
commit;
