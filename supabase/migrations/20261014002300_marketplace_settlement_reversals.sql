-- Sandbox holding policy, immutable proportional adjustments, no AI-credit writes.
begin;
do $$ begin
  if to_regclass('public.creator_earnings_ledger') is null then raise exception 'Apply migrations through 022 first.'; end if;
end $$;

create table public.creator_earning_settlement_contexts (
  purchase_id uuid primary key references public.marketplace_purchases(id) on delete restrict,
  earning_id uuid not null unique references public.creator_earnings_ledger(id) on delete restrict,
  policy_version text not null check(char_length(policy_version) between 1 and 100),
  hold_seconds integer not null check(hold_seconds between 60 and 86400),
  eligible_at timestamptz not null,
  assigned_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  next_check_at timestamptz not null default now(),
  last_checked_at timestamptz,
  capture_status text
);
create table public.marketplace_payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.marketplace_purchases(id) on delete restrict,
  capture_id text not null check(capture_id ~ '^[A-Z0-9]{10,32}$'),
  reference_key text not null check(char_length(reference_key) between 1 and 150),
  reason text not null check(reason in ('refund','capture_reversed')),
  source_state text not null check(source_state in ('pending','available')),
  currency text not null check(currency='USD'),
  gross_minor integer not null check(gross_minor>0),
  fee_minor integer not null check(fee_minor>=0),
  net_minor integer not null check(net_minor>=0 and net_minor=gross_minor-fee_minor),
  cumulative_gross_minor integer not null check(cumulative_gross_minor>0),
  created_at timestamptz not null default now(),
  unique(purchase_id,cumulative_gross_minor), unique(purchase_id,reference_key)
);
create index marketplace_adjustment_purchase on public.marketplace_payment_adjustments(purchase_id,created_at);
create trigger marketplace_adjustment_guard before update or delete on public.marketplace_payment_adjustments
  for each row execute function public.marketplace_financial_guard();
create function public.marketplace_settlement_context_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Settlement policy is immutable.'; end if;
  if (new.purchase_id,new.earning_id,new.policy_version,new.hold_seconds,new.eligible_at,new.assigned_at)
    is distinct from (old.purchase_id,old.earning_id,old.policy_version,old.hold_seconds,old.eligible_at,old.assigned_at)
    then raise exception 'Settlement policy is immutable.'; end if;
  return new;
end $$;
create trigger marketplace_settlement_context_guard before update or delete on public.creator_earning_settlement_contexts
  for each row execute function public.marketplace_settlement_context_guard();

-- Frozen policy is assigned once to the original sale, including pre-023 sales.
create function public.marketplace_ensure_settlement(p_purchase_id uuid,p_policy_version text,p_hold_seconds integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.marketplace_purchases; e public.creator_earnings_ledger; c public.creator_earning_settlement_contexts;
begin
  if p_policy_version is null or p_hold_seconds is null or p_hold_seconds not between 60 and 86400
    or p_policy_version<>'sandbox-settlement-v1:'||p_hold_seconds::text then raise exception 'Invalid Sandbox policy.'; end if;
  select * into p from public.marketplace_purchases where id=p_purchase_id and status='completed' and environment='sandbox' for update;
  if not found then raise exception 'Completed Sandbox purchase required.'; end if;
  select * into e from public.creator_earnings_ledger where marketplace_purchase_id=p.id and state='pending';
  if not found or (e.creator_user_id,e.listing_id,e.gross_minor,e.platform_fee_minor,e.net_minor,e.currency)
    is distinct from (p.creator_user_id,p.listing_id,p.amount_minor,p.platform_fee_minor,p.creator_net_minor,p.currency) then raise exception 'Sale mismatch.'; end if;
  insert into public.creator_earning_settlement_contexts(purchase_id,earning_id,policy_version,hold_seconds,eligible_at)
    values(p.id,e.id,p_policy_version,p_hold_seconds,e.created_at+make_interval(secs=>p_hold_seconds)) on conflict(purchase_id) do nothing;
  select * into c from public.creator_earning_settlement_contexts where purchase_id=p.id;
  return to_jsonb(c);
end $$;

-- Stamp before network work; failed provider reads cannot starve other purchases.
create function public.marketplace_begin_financial_check(p_purchase_id uuid,p_policy_version text,p_hold_seconds integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
  c=public.marketplace_ensure_settlement(p_purchase_id,p_policy_version,p_hold_seconds);
  update public.creator_earning_settlement_contexts set last_attempt_at=now(),next_check_at=now()+interval '1 minute' where purchase_id=p_purchase_id;
  return c;
end $$;
create function public.marketplace_financial_candidates() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(id),'[]'::jsonb) from (
    select p.id from public.marketplace_purchases p left join public.creator_earning_settlement_contexts c on c.purchase_id=p.id
    where p.status='completed' and p.environment='sandbox'
      and not exists(select 1 from public.creator_earnings_ledger e where e.marketplace_purchase_id=p.id and e.state='reversed')
      and (c.next_check_at is null or c.next_check_at<=now())
    order by c.last_attempt_at nulls first,p.created_at,p.id limit 5
  ) candidates;
$$;

-- Trusted provider observation only. Purchase row lock serializes settlement,
-- concurrent refunds, webhook retries and scheduled reconciliation together.
create function public.marketplace_apply_financial_observation(
  p_purchase_id uuid,p_order_id text,p_capture_id text,p_amount_minor integer,p_currency text,
  p_capture_status text,p_refunded_minor integer,p_can_settle boolean,p_reason text,p_reference_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.marketplace_purchases; c public.creator_earning_settlement_contexts;
  prior_gross integer; prior_fee integer; prior_net integer; target_fee integer; target_net integer;
  available boolean; reversed boolean; applied integer=0;
begin
  select * into p from public.marketplace_purchases where id=p_purchase_id and status='completed' and environment='sandbox' for update;
  if not found or (p.paypal_order_id,p.paypal_capture_id,p.amount_minor,p.currency) is distinct from (p_order_id,p_capture_id,p_amount_minor,p_currency)
    or p_refunded_minor is null or p_refunded_minor not between 0 and p.amount_minor
    or p_capture_status is null or char_length(p_capture_status)>40 or p_can_settle is null
    or p_reason is null or p_reason not in ('refund','capture_reversed')
    or p_reference_key is null or char_length(p_reference_key) not between 1 and 150
    or (p_reason='capture_reversed' and p_refunded_minor<>p.amount_minor) then raise exception 'Invalid verified financial observation.'; end if;
  select * into c from public.creator_earning_settlement_contexts where purchase_id=p.id;
  if not found then raise exception 'Frozen settlement policy required.'; end if;
  select exists(select 1 from public.creator_earnings_ledger where marketplace_purchase_id=p.id and state='available'),
    exists(select 1 from public.creator_earnings_ledger where marketplace_purchase_id=p.id and state='reversed') into available,reversed;
  select coalesce(sum(gross_minor),0),coalesce(sum(fee_minor),0),coalesce(sum(net_minor),0)
    into prior_gross,prior_fee,prior_net from public.marketplace_payment_adjustments where purchase_id=p.id;
  if p_refunded_minor>prior_gross and not reversed then
    -- Cumulative half-up fee rounding; creator receives the exact remainder.
    -- Delta rounding never accumulates; a full refund matches original cents.
    target_fee=((2*p.platform_fee_minor::bigint*p_refunded_minor+p.amount_minor)/(2*p.amount_minor))::integer;
    target_net=p_refunded_minor-target_fee;
    insert into public.marketplace_payment_adjustments(purchase_id,capture_id,reference_key,reason,source_state,currency,gross_minor,fee_minor,net_minor,cumulative_gross_minor)
      values(p.id,p_capture_id,p_reference_key,p_reason,case when available then 'available' else 'pending' end,p.currency,
        p_refunded_minor-prior_gross,target_fee-prior_fee,target_net-prior_net,p_refunded_minor);
    applied=p_refunded_minor-prior_gross; prior_gross=p_refunded_minor; prior_fee=target_fee; prior_net=target_net;
  end if;
  if prior_gross=p.amount_minor and not reversed then
    insert into public.creator_earnings_ledger(creator_user_id,marketplace_purchase_id,listing_id,listing_title,gross_minor,platform_fee_minor,net_minor,currency,state)
      values(p.creator_user_id,p.id,p.listing_id,p.listing_title,p.amount_minor,p.platform_fee_minor,p.creator_net_minor,p.currency,'reversed') on conflict do nothing;
    reversed=true;
  end if;
  if not available and not reversed and p_can_settle and p_capture_status in ('COMPLETED','PARTIALLY_REFUNDED') and c.eligible_at<=now() then
    -- Amounts on the availability event record what became available then.
    insert into public.creator_earnings_ledger(creator_user_id,marketplace_purchase_id,listing_id,listing_title,gross_minor,platform_fee_minor,net_minor,currency,state,available_at)
      values(p.creator_user_id,p.id,p.listing_id,p.listing_title,p.amount_minor-prior_gross,p.platform_fee_minor-prior_fee,p.creator_net_minor-prior_net,p.currency,'available',now()) on conflict do nothing;
    available=true;
  end if;
  update public.creator_earning_settlement_contexts set last_checked_at=now(),capture_status=p_capture_status where purchase_id=p.id;
  return jsonb_build_object('adjustedGross',applied,'state',case when reversed then 'reversed' when available then 'available' else 'pending' end);
end $$;

-- Service-only projection: sale amounts never change; adjustments are summed.
create view public.creator_earning_balances with (security_invoker=true) as
select e.*,c.eligible_at,c.policy_version,
  case when r.id is not null then 'reversed' when v.id is not null then 'available' else 'pending' end as effective_state,
  case when r.id is not null then e.gross_minor else coalesce(a.gross,0) end as reversed_gross,
  case when r.id is not null then e.platform_fee_minor else coalesce(a.fee,0) end as reversed_fee,
  case when r.id is not null then e.net_minor else coalesce(a.net,0) end as reversed_net
from public.creator_earnings_ledger e
left join public.creator_earning_settlement_contexts c on c.purchase_id=e.marketplace_purchase_id
left join public.creator_earnings_ledger v on v.marketplace_purchase_id=e.marketplace_purchase_id and v.state='available'
left join public.creator_earnings_ledger r on r.marketplace_purchase_id=e.marketplace_purchase_id and r.state='reversed'
left join (select purchase_id,sum(gross_minor)::integer gross,sum(fee_minor)::integer fee,sum(net_minor)::integer net from public.marketplace_payment_adjustments group by purchase_id) a on a.purchase_id=e.marketplace_purchase_id
where e.state='pending';

create or replace function public.marketplace_creator_earnings(p_creator_user_id uuid,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_creator_user_id is null or p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid earnings query.'; end if;
  with sales as (select * from public.creator_earning_balances where creator_user_id=p_creator_user_id)
  select jsonb_build_object('currency','USD','pending',coalesce(sum(net_minor-reversed_net) filter(where effective_state='pending'),0),
    'available',coalesce(sum(net_minor-reversed_net) filter(where effective_state='available'),0),
    'lifetime',coalesce(sum(net_minor-reversed_net),0),'lifetimeGross',coalesce(sum(gross_minor),0),
    'reversedGross',coalesce(sum(reversed_gross),0),'reversedFee',coalesce(sum(reversed_fee),0),'reversedNet',coalesce(sum(reversed_net),0),
    'total',count(*),'page',p_page,'pageSize',12,'sales',coalesce((select jsonb_agg(item order by created_at desc,id desc) from (
      select jsonb_build_object('listingId',listing_id,'title',listing_title,'createdAt',created_at,'gross',gross_minor,'fee',platform_fee_minor,'net',net_minor,'state',effective_state,
        'remainingNet',net_minor-reversed_net,'reversedGross',reversed_gross,'reversedFee',reversed_fee,'reversedNet',reversed_net,'eligibleAt',eligible_at,
        'history',coalesce((select jsonb_agg(event order by at,event_id) from (
          select x.created_at at,x.id event_id,jsonb_build_object('kind',case when x.state='pending' then 'sale' else x.state end,'at',x.created_at,'gross',x.gross_minor,'fee',x.platform_fee_minor,'net',x.net_minor) event
          from public.creator_earnings_ledger x where x.marketplace_purchase_id=sales.marketplace_purchase_id and x.state<>'reversed'
          union all
          select x.created_at,x.id,jsonb_build_object('kind',x.reason,'at',x.created_at,'gross',x.gross_minor,'fee',x.fee_minor,'net',x.net_minor)
          from public.marketplace_payment_adjustments x where x.purchase_id=sales.marketplace_purchase_id
        ) events),'[]'::jsonb)) item,created_at,id
      from sales order by created_at desc,id desc limit 12 offset (p_page-1)*12) rows),'[]'::jsonb)) into result from sales;
  return result;
end $$;
create function public.marketplace_purchase_financial_status(p_buyer_user_id uuid,p_purchase_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('refundedMinor',coalesce(e.reversed_gross,0),'financialStatus',
    case when e.effective_state='reversed' then 'refunded' when e.reversed_gross>0 then 'partially_refunded' else p.status end)
  from public.marketplace_purchases p left join public.creator_earning_balances e on e.marketplace_purchase_id=p.id
  where p.id=p_purchase_id and p.buyer_user_id=p_buyer_user_id;
$$;
create or replace function public.marketplace_owned_json(l public.marketplace_listings) returns jsonb
language sql stable set search_path='' as $$
  select public.marketplace_listing_json(l)||jsonb_build_object('template',l.template_snapshot,'sourceProjectId',l.source_project_id,'rightsConfirmed',l.rights_confirmed_at is not null,
    'adoptionCount',(select count(*) from public.marketplace_adoptions where listing_id=l.id),
    'paidSalesCount',(select count(*) from public.marketplace_purchases where listing_id=l.id and status='completed'),
    'creatorEarningsMinor',(select coalesce(sum(net_minor-reversed_net),0) from public.creator_earning_balances where listing_id=l.id));
$$;
alter table public.creator_earning_settlement_contexts enable row level security;
alter table public.marketplace_payment_adjustments enable row level security;
revoke all on public.creator_earning_settlement_contexts,public.marketplace_payment_adjustments,public.creator_earning_balances from public,anon,authenticated,service_role;
grant select on public.creator_earning_settlement_contexts,public.marketplace_payment_adjustments,public.creator_earning_balances to service_role;
revoke all on function public.marketplace_settlement_context_guard() from public,anon,authenticated,service_role;
revoke all on function public.marketplace_ensure_settlement(uuid,text,integer),public.marketplace_begin_financial_check(uuid,text,integer),public.marketplace_financial_candidates(),
  public.marketplace_apply_financial_observation(uuid,text,text,integer,text,text,integer,boolean,text,text),public.marketplace_purchase_financial_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_ensure_settlement(uuid,text,integer),public.marketplace_begin_financial_check(uuid,text,integer),public.marketplace_financial_candidates(),
  public.marketplace_apply_financial_observation(uuid,text,text,integer,text,text,integer,boolean,text,text),public.marketplace_purchase_financial_status(uuid,uuid) to service_role;
commit;
