-- Custom USD purchases. Preserve 017 purchases, grants, ledger and free usage.
begin;

do $$
declare item record;
begin
  for item in select * from (values
    ('credit_purchases','id'),('credit_purchases','owner_user_id'),('credit_purchases','pack_id'),
    ('credit_purchases','pack_name'),('credit_purchases','amount_minor'),('credit_purchases','currency'),
    ('credit_purchases','credits'),('credit_purchases','status'),('credit_purchases','created_at'),
    ('generation_accounts','owner_user_id')) as required(table_name,column_name)
  loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=item.table_name and c.column_name=item.column_name) then
      raise exception 'Missing custom-credit prerequisite %.%. Verify existing migrations first.',item.table_name,item.column_name;
    end if;
  end loop;
  if to_regprocedure('public.fulfil_paypal_purchase(uuid,text,text,integer,text)') is null
    or to_regprocedure('public.guard_credit_purchase()') is null then
    raise exception 'Apply existing payment/accounting migrations before 101.';
  end if;
end $$;

-- Null identifies historical fixed-pack terms; never backfill/reprice them.
alter table public.credit_purchases add column if not exists pricing_snapshot jsonb;

create or replace function public.guard_credit_purchase_pricing() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.pricing_snapshot is distinct from old.pricing_snapshot then
    raise exception 'Purchase pricing is immutable.' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists credit_purchases_pricing_guard on public.credit_purchases;
create trigger credit_purchases_pricing_guard before update on public.credit_purchases
  for each row execute function public.guard_credit_purchase_pricing();

create or replace function public.prepare_custom_credit_purchase(
  p_owner_user_id uuid,p_amount_minor integer,p_paypal_basis_points integer,
  p_paypal_fixed_minor integer,p_commission_basis_points integer,p_pricing_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p public.credit_purchases;
  snapshot jsonb;
  product text;
  paypal_fee integer;
  commission integer;
  net integer;
begin
  if p_amount_minor is null or p_amount_minor not between 1 and 100000
    or p_paypal_basis_points is null or p_paypal_basis_points not between 0 and 10000
    or p_commission_basis_points is null or p_commission_basis_points not between 0 and 10000
    or p_paypal_basis_points+p_commission_basis_points>=10000
    or p_paypal_fixed_minor is null or p_paypal_fixed_minor not between 0 and 100000
    or p_pricing_version is null or p_pricing_version !~ '^credit-usd-v1:[a-f0-9]{64}$' then
    raise exception 'Invalid custom-credit terms.' using errcode='23514';
  end if;
  paypal_fee := ((p_amount_minor::bigint*p_paypal_basis_points+5000)/10000)::integer+p_paypal_fixed_minor;
  commission := ((p_amount_minor::bigint*p_commission_basis_points+5000)/10000)::integer;
  net := p_amount_minor-paypal_fee-commission;
  -- 100 credits/USD = one credit per net USD cent, after fee rounding.
  if net<1 then raise exception 'Payment cannot buy one credit.' using errcode='23514'; end if;
  snapshot := jsonb_build_object('version',p_pricing_version,'paypalBasisPoints',p_paypal_basis_points,
    'paypalFixedMinor',p_paypal_fixed_minor,'commissionBasisPoints',p_commission_basis_points,
    'amountMinor',p_amount_minor,'paypalFeeMinor',paypal_fee,'commissionMinor',commission,
    'generationMinor',net,'credits',net);
  product := 'custom-usd-v1:'||md5(snapshot::text);

  -- Match existing account serialization without reversing fulfilment's locks.
  perform 1 from public.generation_accounts where owner_user_id=p_owner_user_id for update;
  if not found then raise exception 'Account unavailable.'; end if;
  select * into p from public.credit_purchases where owner_user_id=p_owner_user_id and pack_id=product
    and status in ('pending','approved') order by created_at desc limit 1;
  if found then
    if p.pricing_snapshot is distinct from snapshot or p.amount_minor<>p_amount_minor or p.credits<>net then
      raise exception 'Purchase terms conflict.' using errcode='23514';
    end if;
    return to_jsonb(p);
  end if;
  if (select count(*) from public.credit_purchases where owner_user_id=p_owner_user_id
    and created_at>now()-interval '1 hour')>=20 then raise exception 'Purchase request limit reached.'; end if;
  insert into public.credit_purchases(owner_user_id,pack_id,pack_name,amount_minor,currency,credits,pricing_snapshot)
    values(p_owner_user_id,product,'Custom credit purchase',p_amount_minor,'USD',net,snapshot) returning * into p;
  return to_jsonb(p);
end $$;

revoke all on function public.guard_credit_purchase_pricing() from public,anon,authenticated,service_role;
revoke all on function public.prepare_custom_credit_purchase(uuid,integer,integer,integer,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_custom_credit_purchase(uuid,integer,integer,integer,integer,text) to service_role;
-- Existing RLS, direct-write denial, immutable purchases/ledger, capture uniqueness
-- and fulfil_paypal_purchase remain unchanged. No new grant or balance update here.
commit;
