-- USD creator money only. Historical sales and migrations remain unchanged.
begin;
do $$ begin
  if to_regclass('public.marketplace_payment_adjustments') is null then raise exception 'Apply through 023 first.'; end if;
end $$;

create table public.creator_payout_destinations (
  creator_user_id uuid primary key references public.app_users(id) on delete restrict,
  paypal_email text not null check(length(paypal_email)<=254 and paypal_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  updated_at timestamptz not null default now()
);
-- Keep provider refund references that must be re-read before payout. A capture
-- read alone can omit a pending refund and must never silently clear its block.
create table public.creator_payout_refund_checks (
  refund_id text primary key,
  purchase_id uuid not null references public.marketplace_purchases(id) on delete restrict,
  pending boolean not null,
  checked_at timestamptz not null default now()
);
create function public.creator_payout_refund_observe(p_purchase uuid,p_refund text,p_pending boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.app_users u join public.marketplace_purchases p on p.creator_user_id=u.id where p.id=p_purchase for update of u;
  if not found then raise exception 'Refund purchase unavailable.'; end if;
  if p_refund is null or p_refund !~ '^[A-Z0-9]{10,32}$' or p_pending is null then raise exception 'Invalid verified refund.'; end if;
  insert into public.creator_payout_refund_checks(refund_id,purchase_id,pending) values(p_refund,p_purchase,p_pending)
    on conflict(refund_id) do update set pending=excluded.pending,checked_at=now() where creator_payout_refund_checks.purchase_id=excluded.purchase_id;
  if not found then raise exception 'Refund purchase mismatch.'; end if;
  return true;
end $$;
create function public.creator_payout_refund_candidates(p_purchase uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(refund_id),'[]'::jsonb) from public.creator_payout_refund_checks where purchase_id=p_purchase and pending;
$$;
create table public.creator_withdrawals (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references public.app_users(id) on delete restrict,
  request_id uuid not null,
  currency text not null default 'USD' check(currency='USD'),
  requested_minor integer not null check(requested_minor>=500),
  reserved_minor integer not null check(reserved_minor>=0 and reserved_minor<=requested_minor),
  destination_snapshot text not null check(length(destination_snapshot)<=254 and destination_snapshot ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status text not null check(status in ('pending','eligible','processing','paid','failed')),
  requested_at timestamptz not null default now(),
  hold_until timestamptz not null default (now()+interval '168 hours'),
  eligible_at timestamptz, processing_at timestamptz, paid_at timestamptz, failed_at timestamptz,
  submitted_minor integer check(submitted_minor>=500 and submitted_minor<=requested_minor),
  paypal_batch_id text unique, paypal_item_id text unique, provider_status text,
  failure_code text, next_check_at timestamptz not null default now(),
  unique(creator_user_id,request_id),
  check(hold_until=requested_at+interval '168 hours'),
  check(status not in ('processing','paid') or processing_at is not null),
  check((status='paid')=(paid_at is not null)),
  check((status='failed')=(failed_at is not null))
);
create index creator_withdrawal_owner on public.creator_withdrawals(creator_user_id,requested_at desc,id);
create index creator_withdrawal_due on public.creator_withdrawals(next_check_at) where status in ('pending','eligible','processing');
create table public.creator_money_lots (
  purchase_id uuid primary key references public.marketplace_purchases(id) on delete restrict,
  earning_id uuid not null unique references public.creator_earnings_ledger(id) on delete restrict,
  creator_user_id uuid not null references public.app_users(id) on delete restrict,
  original_minor integer not null check(original_minor>=0),
  available_minor integer not null check(available_minor>=0),
  reversed_minor integer not null default 0 check(reversed_minor>=0 and reversed_minor<=original_minor),
  offset_minor integer not null default 0 check(offset_minor>=0),
  created_at timestamptz not null default now()
);
create index creator_lot_owner on public.creator_money_lots(creator_user_id,created_at,purchase_id);
create table public.creator_withdrawal_allocations (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.creator_withdrawals(id) on delete restrict,
  purchase_id uuid not null references public.creator_money_lots(purchase_id) on delete restrict,
  amount_minor integer not null check(amount_minor>0),
  remaining_minor integer not null check(remaining_minor>=0 and remaining_minor<=amount_minor),
  unique(withdrawal_id,purchase_id)
);
create index creator_allocation_lot on public.creator_withdrawal_allocations(purchase_id,withdrawal_id);
create table public.creator_money_events (
  id bigint generated always as identity primary key,
  creator_user_id uuid not null references public.app_users(id) on delete restrict,
  withdrawal_id uuid references public.creator_withdrawals(id) on delete restrict,
  purchase_id uuid references public.creator_money_lots(purchase_id) on delete restrict,
  adjustment_id uuid references public.marketplace_payment_adjustments(id) on delete restrict,
  kind text not null check(kind in ('available','requested','pending','reserved','eligible','processing','reversal','released','paid','failed','deficit','offset','provider_returned')),
  amount_minor integer not null check(amount_minor>=0),
  created_at timestamptz not null default now()
);
create index creator_money_event_owner on public.creator_money_events(creator_user_id,id);
create unique index creator_money_terminal_event on public.creator_money_events(withdrawal_id,kind) where kind in ('paid','failed','requested','pending','eligible','processing','provider_returned');
create trigger creator_money_history_guard before update or delete on public.creator_money_events for each row execute function public.marketplace_financial_guard();

create function public.creator_money_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Money allocation history is immutable.'; end if;
  if tg_table_name='creator_money_lots' then
    if (new.purchase_id,new.earning_id,new.creator_user_id,new.original_minor,new.created_at) is distinct from
      (old.purchase_id,old.earning_id,old.creator_user_id,old.original_minor,old.created_at) then raise exception 'Earning lot identity is immutable.'; end if;
  elsif (new.id,new.withdrawal_id,new.purchase_id,new.amount_minor) is distinct from (old.id,old.withdrawal_id,old.purchase_id,old.amount_minor) then
    raise exception 'Original allocation is immutable.';
  end if;
  return new;
end $$;
create trigger creator_money_lot_identity before update or delete on public.creator_money_lots for each row execute function public.creator_money_identity_guard();
create trigger creator_money_allocation_identity before update or delete on public.creator_withdrawal_allocations for each row execute function public.creator_money_identity_guard();
create function public.creator_money_consistent(p_creator uuid) returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.creator_money_lots l where l.creator_user_id=p_creator and
    l.original_minor-l.reversed_minor<>l.available_minor+l.offset_minor+coalesce((select sum(a.remaining_minor) from public.creator_withdrawal_allocations a where a.purchase_id=l.purchase_id),0));
$$;

create function public.creator_payout_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Withdrawal history is immutable.'; end if;
  if (new.id,new.creator_user_id,new.request_id,new.currency,new.requested_minor,new.destination_snapshot,new.requested_at,new.hold_until)
    is distinct from (old.id,old.creator_user_id,old.request_id,old.currency,old.requested_minor,old.destination_snapshot,old.requested_at,old.hold_until)
    or (old.submitted_minor is not null and new.submitted_minor is distinct from old.submitted_minor)
    or (old.paypal_batch_id is not null and new.paypal_batch_id is distinct from old.paypal_batch_id)
    or (old.paypal_item_id is not null and new.paypal_item_id is distinct from old.paypal_item_id)
    then raise exception 'Withdrawal instruction is immutable.'; end if;
  return new;
end $$;
create trigger creator_payout_identity_guard before update or delete on public.creator_withdrawals for each row execute function public.creator_payout_identity_guard();

create function public.creator_money_deficit(p_creator uuid) returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(case when kind='deficit' then amount_minor when kind='offset' then -amount_minor else 0 end),0)::bigint
  from public.creator_money_events where creator_user_id=p_creator;
$$;
-- All callers hold the same app-user row lock, including sale/reversal triggers.
create function public.creator_money_offset(p_creator uuid) returns void language plpgsql security definer set search_path='' as $$
declare debt bigint; l record; n integer;
begin
  debt=public.creator_money_deficit(p_creator);
  for l in select * from public.creator_money_lots where creator_user_id=p_creator and available_minor>0 order by created_at,purchase_id for update loop
    exit when debt<=0;
    n=least(debt,l.available_minor)::integer;
    update public.creator_money_lots set available_minor=available_minor-n,offset_minor=offset_minor+n where purchase_id=l.purchase_id;
    insert into public.creator_money_events(creator_user_id,purchase_id,kind,amount_minor) values(p_creator,l.purchase_id,'offset',n);
    debt=debt-n;
  end loop;
end $$;
create function public.creator_payout_release(p_id uuid,p_code text) returns void language plpgsql security definer set search_path='' as $$
declare w public.creator_withdrawals; a record;
begin
  select * into w from public.creator_withdrawals where id=p_id for update;
  if w.status in ('paid','failed') then return; end if;
  for a in select * from public.creator_withdrawal_allocations where withdrawal_id=w.id and remaining_minor>0 for update loop
    update public.creator_money_lots set available_minor=available_minor+a.remaining_minor where purchase_id=a.purchase_id;
    insert into public.creator_money_events(creator_user_id,withdrawal_id,purchase_id,kind,amount_minor) values(w.creator_user_id,w.id,a.purchase_id,'released',a.remaining_minor);
    update public.creator_withdrawal_allocations set remaining_minor=0 where id=a.id;
  end loop;
  -- Failed processing retains the attempted instruction and timestamps for audit.
  update public.creator_withdrawals set status='failed',reserved_minor=0,failed_at=now(),failure_code=p_code where id=w.id;
  insert into public.creator_money_events(creator_user_id,withdrawal_id,kind,amount_minor) values(w.creator_user_id,w.id,'failed',0);
  perform public.creator_money_offset(w.creator_user_id);
end $$;
create function public.creator_money_available_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.creator_earnings_ledger; r integer;
begin
  if new.state<>'available' then return new; end if;
  perform 1 from public.app_users where id=new.creator_user_id for update;
  select * into e from public.creator_earnings_ledger where marketplace_purchase_id=new.marketplace_purchase_id and state='pending';
  select coalesce(sum(net_minor),0)::integer into r from public.marketplace_payment_adjustments where purchase_id=e.marketplace_purchase_id;
  insert into public.creator_money_lots(purchase_id,earning_id,creator_user_id,original_minor,available_minor,reversed_minor,created_at)
    values(e.marketplace_purchase_id,e.id,e.creator_user_id,e.net_minor,e.net_minor-r,r,e.created_at) on conflict do nothing;
  if found then
    insert into public.creator_money_events(creator_user_id,purchase_id,kind,amount_minor) values(e.creator_user_id,e.marketplace_purchase_id,'available',e.net_minor-r);
    perform public.creator_money_offset(e.creator_user_id);
  end if;
  return new;
end $$;
create trigger creator_money_available after insert on public.creator_earnings_ledger for each row execute function public.creator_money_available_trigger();
insert into public.creator_money_lots(purchase_id,earning_id,creator_user_id,original_minor,available_minor,reversed_minor,created_at)
  select marketplace_purchase_id,id,creator_user_id,net_minor,net_minor-reversed_net,reversed_net,created_at from public.creator_earning_balances where effective_state in ('available','reversed')
  and exists(select 1 from public.creator_earnings_ledger v where v.marketplace_purchase_id=creator_earning_balances.marketplace_purchase_id and v.state='available');
insert into public.creator_money_events(creator_user_id,purchase_id,kind,amount_minor)
  select creator_user_id,purchase_id,'available',available_minor from public.creator_money_lots;

create function public.creator_money_reversal_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.creator_money_lots; a record; n integer; rest integer; current_reserved integer;
begin
  select * into l from public.creator_money_lots where purchase_id=new.purchase_id;
  if not found or new.net_minor=0 then return new; end if;
  perform 1 from public.app_users where id=l.creator_user_id for update;
  select * into l from public.creator_money_lots where purchase_id=new.purchase_id for update;
  rest=new.net_minor;
  -- First adjust pending reservations for this exact lot, FIFO. Processing/paid
  -- allocations stay tied to the frozen instruction and create debt on success.
  for a in select q.*,w.status,w.requested_at from public.creator_withdrawal_allocations q join public.creator_withdrawals w on w.id=q.withdrawal_id
    where q.purchase_id=l.purchase_id and q.remaining_minor>0 and w.status<>'failed'
    order by case when w.status in ('pending','eligible') then 0 else 1 end,w.requested_at,w.id,q.id for update of q,w loop
    exit when rest=0;
    n=least(rest,a.remaining_minor); rest=rest-n;
    update public.creator_withdrawal_allocations set remaining_minor=remaining_minor-n where id=a.id;
    insert into public.creator_money_events(creator_user_id,withdrawal_id,purchase_id,adjustment_id,kind,amount_minor) values(l.creator_user_id,a.withdrawal_id,l.purchase_id,new.id,'reversal',n);
    if a.status in ('pending','eligible') then
      update public.creator_withdrawals set reserved_minor=reserved_minor-n,status='pending',eligible_at=null where id=a.withdrawal_id returning reserved_minor into current_reserved;
      if current_reserved<500 then perform public.creator_payout_release(a.withdrawal_id,'REFUND_BELOW_MINIMUM'); end if;
    elsif a.status='paid' then
      insert into public.creator_money_events(creator_user_id,withdrawal_id,purchase_id,adjustment_id,kind,amount_minor) values(l.creator_user_id,a.withdrawal_id,l.purchase_id,new.id,'deficit',n);
    end if;
  end loop;
  -- Re-read after a below-minimum release may have returned valid money.
  select * into l from public.creator_money_lots where purchase_id=new.purchase_id;
  n=least(rest,l.available_minor); rest=rest-n;
  if n>0 then
    update public.creator_money_lots set available_minor=available_minor-n where purchase_id=l.purchase_id;
    insert into public.creator_money_events(creator_user_id,purchase_id,adjustment_id,kind,amount_minor) values(l.creator_user_id,l.purchase_id,new.id,'reversal',n);
  end if;
  if rest>0 then
    if rest>l.offset_minor then raise exception 'Reversal allocation inconsistent.'; end if;
    update public.creator_money_lots set offset_minor=offset_minor-rest where purchase_id=l.purchase_id;
    insert into public.creator_money_events(creator_user_id,purchase_id,adjustment_id,kind,amount_minor) values(l.creator_user_id,l.purchase_id,new.id,'deficit',rest);
  end if;
  update public.creator_money_lots set reversed_minor=reversed_minor+new.net_minor where purchase_id=l.purchase_id;
  perform public.creator_money_offset(l.creator_user_id);
  return new;
end $$;
create trigger creator_money_reversal after insert on public.marketplace_payment_adjustments for each row execute function public.creator_money_reversal_trigger();

create function public.creator_payout_destination(p_creator uuid,p_email text) returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.app_users where id=p_creator for update;
  if not found or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid payout destination.'; end if;
  insert into public.creator_payout_destinations(creator_user_id,paypal_email) values(p_creator,p_email)
    on conflict(creator_user_id) do update set paypal_email=excluded.paypal_email,updated_at=now();
  return true;
end $$;
create function public.creator_payout_request(p_creator uuid,p_request uuid,p_amount integer) returns uuid language plpgsql security definer set search_path='' as $$
declare w public.creator_withdrawals; email text; available bigint; l record; rest integer; n integer;
begin
  perform 1 from public.app_users where id=p_creator for update;
  if not found or p_request is null or p_amount is null or p_amount<500 then raise exception 'Invalid withdrawal.'; end if;
  select * into w from public.creator_withdrawals where creator_user_id=p_creator and request_id=p_request;
  if found then
    if w.requested_minor<>p_amount then raise exception 'Withdrawal request conflict.'; end if;
    return w.id;
  end if;
  perform public.creator_money_offset(p_creator);
  if public.creator_money_deficit(p_creator)>0 then raise exception 'Creator deficit blocks withdrawal.'; end if;
  if not public.creator_money_consistent(p_creator) then raise exception 'Creator accounting inconsistent.'; end if;
  select paypal_email into email from public.creator_payout_destinations where creator_user_id=p_creator;
  select coalesce(sum(available_minor),0) into available from public.creator_money_lots where creator_user_id=p_creator;
  if email is null or p_amount>available then raise exception 'Destination or available earnings invalid.'; end if;
  insert into public.creator_withdrawals(creator_user_id,request_id,requested_minor,reserved_minor,destination_snapshot,status)
    values(p_creator,p_request,p_amount,p_amount,email,'pending') returning * into w;
  insert into public.creator_money_events(creator_user_id,withdrawal_id,kind,amount_minor) values(p_creator,w.id,'requested',p_amount),(p_creator,w.id,'pending',p_amount);
  rest=p_amount;
  for l in select * from public.creator_money_lots where creator_user_id=p_creator and available_minor>0 order by created_at,purchase_id for update loop
    exit when rest=0; n=least(rest,l.available_minor); rest=rest-n;
    update public.creator_money_lots set available_minor=available_minor-n where purchase_id=l.purchase_id;
    insert into public.creator_withdrawal_allocations(withdrawal_id,purchase_id,amount_minor,remaining_minor) values(w.id,l.purchase_id,n,n);
    insert into public.creator_money_events(creator_user_id,withdrawal_id,purchase_id,kind,amount_minor) values(p_creator,w.id,l.purchase_id,'reserved',n);
  end loop;
  if rest<>0 then raise exception 'Withdrawal allocation inconsistent.'; end if;
  return w.id;
end $$;

-- Trusted eligibility checks use fresh provider observations for every backing lot.
create function public.creator_payout_eligible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare w public.creator_withdrawals; total bigint;
begin
  select * into w from public.creator_withdrawals where id=p_id;
  if not found then return false; end if;
  perform 1 from public.app_users where id=w.creator_user_id for update;
  select * into w from public.creator_withdrawals where id=p_id for update;
  if w.status not in ('pending','eligible') or w.hold_until>now() or w.reserved_minor<500 or public.creator_money_deficit(w.creator_user_id)>0
    or not public.creator_money_consistent(w.creator_user_id) then return false; end if;
  select coalesce(sum(a.remaining_minor),0) into total from public.creator_withdrawal_allocations a where a.withdrawal_id=w.id;
  if total<>w.reserved_minor or exists(
    select 1 from public.creator_withdrawal_allocations a join public.creator_money_lots l on l.purchase_id=a.purchase_id
    left join public.creator_earning_settlement_contexts c on c.purchase_id=l.purchase_id
    where a.withdrawal_id=w.id and a.remaining_minor>0 and (l.creator_user_id<>w.creator_user_id or c.last_checked_at is null or c.last_checked_at<now()-interval '2 minutes'
      or c.capture_status not in ('COMPLETED','PARTIALLY_REFUNDED') or c.capture_status is null
      or exists(select 1 from public.creator_payout_refund_checks r where r.purchase_id=l.purchase_id and r.pending))) then return false; end if;
  update public.creator_withdrawals set status='eligible',eligible_at=coalesce(eligible_at,now()) where id=w.id;
  insert into public.creator_money_events(creator_user_id,withdrawal_id,kind,amount_minor) values(w.creator_user_id,w.id,'eligible',w.reserved_minor) on conflict do nothing;
  return true;
end $$;
create function public.creator_payout_claim(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.creator_withdrawals;
begin
  if not public.creator_payout_eligible(p_id) then return null; end if;
  select * into w from public.creator_withdrawals where id=p_id for update;
  update public.creator_withdrawals set status='processing',processing_at=now(),submitted_minor=reserved_minor,next_check_at=now()+interval '5 minutes' where id=p_id returning * into w;
  insert into public.creator_money_events(creator_user_id,withdrawal_id,kind,amount_minor) values(w.creator_user_id,w.id,'processing',w.submitted_minor);
  return to_jsonb(w);
end $$;

create function public.creator_payout_observe(p_id uuid,p_batch text,p_item text,p_status text,p_failure_code text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare w public.creator_withdrawals; a record; debt integer;
begin
  select * into w from public.creator_withdrawals where id=p_id;
  if not found then return false; end if;
  perform 1 from public.app_users where id=w.creator_user_id for update;
  select * into w from public.creator_withdrawals where id=p_id for update;
  if w.status='paid' and p_status in ('REFUNDED','RETURNED') and w.paypal_batch_id=p_batch and w.paypal_item_id=p_item then
    update public.creator_withdrawals set provider_status=p_status where id=w.id;
    insert into public.creator_money_events(creator_user_id,withdrawal_id,kind,amount_minor) values(w.creator_user_id,w.id,'provider_returned',w.submitted_minor) on conflict do nothing;
    return true; -- Preserve paid history; no unapproved automatic re-credit/send.
  end if;
  if w.status<>'processing' then return false; end if;
  if (w.paypal_batch_id is not null and w.paypal_batch_id is distinct from p_batch) or
    (w.paypal_item_id is not null and w.paypal_item_id is distinct from p_item) or p_status is null or length(p_status)>80 then raise exception 'Provider payout mismatch.'; end if;
  update public.creator_withdrawals set paypal_batch_id=p_batch,paypal_item_id=p_item,provider_status=p_status,next_check_at=now()+interval '5 minutes' where id=w.id;
  if p_status='SUCCESS' then
    if p_batch is null or p_item is null then raise exception 'Completed provider item required.'; end if;
    update public.creator_withdrawals set status='paid',paid_at=now(),reserved_minor=0 where id=w.id;
    insert into public.creator_money_events(creator_user_id,withdrawal_id,kind,amount_minor) values(w.creator_user_id,w.id,'paid',w.submitted_minor);
    for a in select * from public.creator_withdrawal_allocations where withdrawal_id=w.id loop
      select coalesce(sum(amount_minor),0)::integer into debt from public.creator_money_events where withdrawal_id=w.id and purchase_id=a.purchase_id and kind='reversal'
        and id>(select id from public.creator_money_events where withdrawal_id=w.id and kind='processing');
      if debt>0 then insert into public.creator_money_events(creator_user_id,withdrawal_id,purchase_id,kind,amount_minor) values(w.creator_user_id,w.id,a.purchase_id,'deficit',debt); end if;
    end loop;
    perform public.creator_money_offset(w.creator_user_id);
  elsif p_status in ('FAILED','DENIED','BLOCKED','CANCELED','RETURNED') then
    perform public.creator_payout_release(w.id,case when p_batch is null and p_status='DENIED' and p_failure_code in ('AUTHORIZATION_ERROR','NOT_AUTHORIZED','INSUFFICIENT_FUNDS') then p_failure_code else 'PAYPAL_'||p_status end);
  end if;
  return true;
end $$;
create function public.creator_payout_candidates() returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(id),'[]'::jsonb) from (select id from public.creator_withdrawals where status in ('pending','eligible','processing')
    and next_check_at<=now() and (status='processing' or hold_until<=now()) order by next_check_at,id limit 5) rows;
$$;
create function public.creator_payout_defer(p_id uuid) returns boolean language sql security definer set search_path='' as $$
  update public.creator_withdrawals set next_check_at=now()+interval '5 minutes' where id=p_id and status in ('pending','eligible','processing') returning true;
$$;
create function public.creator_payout_account(p_creator uuid,p_page integer) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('currency','USD','email',(select paypal_email from public.creator_payout_destinations where creator_user_id=p_creator),
    'available',coalesce((select sum(available_minor) from public.creator_money_lots where creator_user_id=p_creator),0),
    'deficit',public.creator_money_deficit(p_creator),
    'pending',coalesce((select sum(reserved_minor) from public.creator_withdrawals where creator_user_id=p_creator and status in ('pending','eligible','processing')),0),
    'paid',coalesce((select sum(submitted_minor) from public.creator_withdrawals where creator_user_id=p_creator and status='paid'),0),
    'total',(select count(*) from public.creator_withdrawals where creator_user_id=p_creator),
    'history',coalesce((select jsonb_agg(item order by requested_at desc,id) from (
      select id,requested_at,jsonb_build_object('id',id,'requested',requested_minor,'amount',coalesce(submitted_minor,reserved_minor),'status',status,
        'requestedAt',requested_at,'holdUntil',hold_until,'paidAt',paid_at,'failureCode',failure_code,'reviewRequired',coalesce(provider_status in ('REFUNDED','RETURNED') and status='paid',false)) item
      from public.creator_withdrawals where creator_user_id=p_creator order by requested_at desc,id limit 12 offset (greatest(1,least(p_page,100000))-1)*12
    ) rows),'[]'::jsonb));
$$;

-- Versioned transition: only new purchase intents use 10% and available-on-sale.
-- Existing intents retain every frozen financial field.
alter function public.marketplace_prepare_purchase(uuid,uuid,integer,text) rename to marketplace_prepare_purchase_pre_withdrawals;
create function public.marketplace_prepare_purchase(p_buyer_user_id uuid,p_listing_id uuid,p_fee_bps integer,p_pricing_version text) returns jsonb language sql security definer set search_path='' as $$
  select public.marketplace_prepare_purchase_pre_withdrawals(p_buyer_user_id,p_listing_id,1000,'marketplace-withdrawal-v1');
$$;
alter table public.creator_earning_settlement_contexts drop constraint creator_earning_settlement_contexts_hold_seconds_check;
alter table public.creator_earning_settlement_contexts add check(hold_seconds between 60 and 86400 or (hold_seconds=0 and policy_version='marketplace-withdrawal-v1'));
alter function public.marketplace_ensure_settlement(uuid,text,integer) rename to marketplace_ensure_settlement_pre_withdrawals;
create function public.marketplace_ensure_settlement(p_purchase_id uuid,p_policy_version text,p_hold_seconds integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.marketplace_purchases; e public.creator_earnings_ledger; c public.creator_earning_settlement_contexts;
begin
  select * into p from public.marketplace_purchases where id=p_purchase_id;
  perform 1 from public.app_users where id=p.creator_user_id for update;
  if p.pricing_version<>'marketplace-withdrawal-v1' then return public.marketplace_ensure_settlement_pre_withdrawals(p_purchase_id,p_policy_version,p_hold_seconds); end if;
  select * into p from public.marketplace_purchases where id=p_purchase_id and status='completed' for update;
  if not found then raise exception 'Completed purchase required.'; end if;
  select * into e from public.creator_earnings_ledger where marketplace_purchase_id=p.id and state='pending';
  insert into public.creator_earning_settlement_contexts(purchase_id,earning_id,policy_version,hold_seconds,eligible_at)
    values(p.id,e.id,'marketplace-withdrawal-v1',0,e.created_at) on conflict do nothing;
  select * into c from public.creator_earning_settlement_contexts where purchase_id=p.id;
  return to_jsonb(c);
end $$;
alter function public.marketplace_fulfil_purchase(uuid,text,text,integer,text) rename to marketplace_fulfil_purchase_pre_withdrawals;
create function public.marketplace_fulfil_purchase(p_purchase_id uuid,p_order_id text,p_capture_id text,p_amount_minor integer,p_currency text,p_can_available boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare p public.marketplace_purchases; result boolean;
begin
  select * into p from public.marketplace_purchases where id=p_purchase_id;
  perform 1 from public.app_users where id=p.creator_user_id for update;
  result=public.marketplace_fulfil_purchase_pre_withdrawals(p_purchase_id,p_order_id,p_capture_id,p_amount_minor,p_currency);
  if result and p.pricing_version='marketplace-withdrawal-v1' then
    perform public.marketplace_ensure_settlement(p.id,'marketplace-withdrawal-v1',0);
    if p_can_available and not exists(select 1 from public.creator_earnings_ledger where marketplace_purchase_id=p.id and state in ('available','reversed')) then
      insert into public.creator_earnings_ledger(creator_user_id,marketplace_purchase_id,listing_id,listing_title,gross_minor,platform_fee_minor,net_minor,currency,state,available_at)
        values(p.creator_user_id,p.id,p.listing_id,p.listing_title,p.amount_minor,p.platform_fee_minor,p.creator_net_minor,p.currency,'available',now());
    end if;
  end if;
  return result;
end $$;
alter function public.marketplace_apply_financial_observation(uuid,text,text,integer,text,text,integer,boolean,text,text) rename to marketplace_apply_financial_observation_pre_withdrawals;
create function public.marketplace_apply_financial_observation(p_purchase_id uuid,p_order_id text,p_capture_id text,p_amount_minor integer,p_currency text,p_capture_status text,p_refunded_minor integer,p_can_settle boolean,p_reason text,p_reference_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.marketplace_purchases; result jsonb;
begin
  select * into p from public.marketplace_purchases where id=p_purchase_id;
  perform 1 from public.app_users where id=p.creator_user_id for update;
  result=public.marketplace_apply_financial_observation_pre_withdrawals(p_purchase_id,p_order_id,p_capture_id,p_amount_minor,p_currency,p_capture_status,p_refunded_minor,p_can_settle,p_reason,p_reference_key);
  -- A pending refund/unknown capture must block dispatch even before money reverses.
  if not p_can_settle then update public.creator_earning_settlement_contexts set capture_status='BLOCKED' where purchase_id=p.id; end if;
  return result;
end $$;

do $$ declare t text; f record; begin
  foreach t in array array['creator_payout_destinations','creator_payout_refund_checks','creator_withdrawals','creator_money_lots','creator_withdrawal_allocations','creator_money_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
  for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and
    (proname like 'creator_payout_%' or proname like 'creator_money_%' or proname like 'marketplace_%_pre_withdrawals' or proname in ('marketplace_prepare_purchase','marketplace_ensure_settlement','marketplace_fulfil_purchase','marketplace_apply_financial_observation')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname in ('creator_payout_refund_observe','creator_payout_refund_candidates','creator_payout_destination','creator_payout_request','creator_payout_eligible','creator_payout_claim','creator_payout_observe','creator_payout_candidates','creator_payout_defer','creator_payout_account','marketplace_prepare_purchase','marketplace_ensure_settlement','marketplace_fulfil_purchase','marketplace_apply_financial_observation') then
      execute format('grant execute on function %s to service_role',f.signature);
    end if;
  end loop;
end $$;
commit;
