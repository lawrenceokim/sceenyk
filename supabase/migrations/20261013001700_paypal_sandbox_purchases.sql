-- Sandbox purchases only. Preserve existing accounting history and free rules.
begin;

do $$
begin
  if to_regclass('public.generation_accounts') is null
    or to_regclass('public.credit_ledger') is null
    or to_regprocedure('public.immutable_accounting_record()') is null then
    raise exception 'Apply existing accounting migrations before 017.';
  end if;
end $$;

create table public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.generation_accounts(owner_user_id) on delete restrict,
  environment text not null default 'sandbox' check(environment='sandbox'),
  pack_id text not null check(char_length(pack_id) between 1 and 80),
  pack_name text not null check(char_length(pack_name) between 1 and 100),
  amount_minor integer not null check(amount_minor between 1 and 100000),
  currency text not null check(currency='USD'),
  credits bigint not null check(credits between 1 and 1000000),
  paypal_order_id text unique check(paypal_order_id ~ '^[A-Z0-9]{10,32}$'),
  paypal_capture_id text unique check(paypal_capture_id ~ '^[A-Z0-9]{10,32}$'),
  capture_request_id uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check(status in ('pending','approved','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(id,owner_user_id),
  check((status='completed' and completed_at is not null and paypal_order_id is not null and paypal_capture_id is not null)
    or(status<>'completed' and completed_at is null and paypal_capture_id is null))
);
create index credit_purchases_owner_created_idx on public.credit_purchases(owner_user_id,created_at desc);

-- Remove only the three legacy movement checks. Other checks/unique constraints,
-- immutability trigger, generation foreign key and historical rows are preserved.
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid='public.credit_ledger'::regclass and contype='c'
    and pg_get_constraintdef(oid) ~ '(reference_key|type|direction|available_delta|reserved_delta)'
  loop execute format('alter table public.credit_ledger drop constraint %I',c.conname); end loop;
end $$;
alter table public.credit_ledger alter column job_id drop not null;
alter table public.credit_ledger
  add column purchase_id uuid unique,
  add column paypal_order_id text unique,
  add column paypal_capture_id text unique,
  add foreign key(purchase_id,owner_user_id) references public.credit_purchases(id,owner_user_id) on delete restrict,
  add constraint credit_ledger_movement_check check (
    (type='purchase' and direction='credit' and job_id is null and purchase_id is not null
      and paypal_order_id is not null and paypal_capture_id is not null
      and reason='purchase' and available_delta=amount and reserved_delta=0
      and reference_key='paypal:sandbox:'||paypal_order_id||':'||paypal_capture_id)
    or
    (job_id is not null and purchase_id is null and paypal_order_id is null and paypal_capture_id is null
      and reference_key=job_id::text||':'||type and (
        (type='reservation' and direction='hold' and available_delta=-amount and reserved_delta=amount and reason='generation_admission')
        or(type='consumption' and direction='debit' and available_delta=0 and reserved_delta=-amount and reason='stored_result_verified')
        or(type='release' and direction='restore' and available_delta=amount and reserved_delta=-amount and reason='generation_failed')))
  );

create function public.guard_credit_purchase() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Purchase history is permanent.' using errcode='23514'; end if;
  if old.status='completed' or
    (new.id,new.owner_user_id,new.environment,new.pack_id,new.pack_name,new.amount_minor,new.currency,new.credits,new.capture_request_id,new.created_at)
      is distinct from
    (old.id,old.owner_user_id,old.environment,old.pack_id,old.pack_name,old.amount_minor,old.currency,old.credits,old.capture_request_id,old.created_at)
    or (old.paypal_order_id is not null and new.paypal_order_id is distinct from old.paypal_order_id) then
    raise exception 'Purchase identity and completed history are immutable.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger credit_purchases_guard before update or delete on public.credit_purchases
  for each row execute function public.guard_credit_purchase();

create function public.prepare_credit_purchase(p_owner_user_id uuid,p_pack_id text,p_pack_name text,p_amount_minor integer,p_currency text,p_credits bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.credit_purchases;
begin
  -- Same account lock as generation admission; do not lock purchases in this
  -- direction (fulfilment locks purchase, then account).
  perform 1 from public.generation_accounts where owner_user_id=p_owner_user_id for update;
  if not found then raise exception 'Account unavailable.'; end if;
  select * into p from public.credit_purchases where owner_user_id=p_owner_user_id and pack_id=p_pack_id
    and status in ('pending','approved') order by created_at desc limit 1;
  if found then return to_jsonb(p); end if;
  if (select count(*) from public.credit_purchases where owner_user_id=p_owner_user_id and created_at>now()-interval '1 hour')>=20 then
    raise exception 'Purchase request limit reached.';
  end if;
  insert into public.credit_purchases(owner_user_id,pack_id,pack_name,amount_minor,currency,credits)
    values(p_owner_user_id,p_pack_id,p_pack_name,p_amount_minor,p_currency,p_credits) returning * into p;
  return to_jsonb(p);
end $$;

create function public.attach_paypal_order(p_purchase_id uuid,p_owner_user_id uuid,p_order_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare p public.credit_purchases;
begin
  select * into p from public.credit_purchases where id=p_purchase_id and owner_user_id=p_owner_user_id for update;
  if not found then return false; end if;
  if p.paypal_order_id is not null then return p.paypal_order_id=p_order_id; end if;
  if p.status<>'pending' then return false; end if;
  update public.credit_purchases set paypal_order_id=p_order_id,updated_at=now() where id=p.id;
  return true;
end $$;

create function public.set_credit_purchase_state(p_owner_user_id uuid,p_order_id text,p_status text)
returns boolean language plpgsql security definer set search_path='' as $$
declare p public.credit_purchases;
begin
  if p_status not in ('approved','failed','cancelled') then return false; end if;
  select * into p from public.credit_purchases where owner_user_id=p_owner_user_id and paypal_order_id=p_order_id for update;
  if not found then return false; end if;
  if p.status='completed' then return true; end if;
  if p.status=p_status then return true; end if;
  if p.status in ('failed','cancelled') and p_status='approved' then return false; end if;
  update public.credit_purchases set status=p_status,updated_at=now() where id=p.id;
  return true;
end $$;

create function public.fulfil_paypal_purchase(p_owner_user_id uuid,p_order_id text,p_capture_id text,p_amount_minor integer,p_currency text)
returns boolean language plpgsql security definer set search_path='' as $$
declare p public.credit_purchases;
begin
  select * into p from public.credit_purchases where paypal_order_id=p_order_id and owner_user_id=p_owner_user_id for update;
  if not found or p.environment<>'sandbox' or p.amount_minor is distinct from p_amount_minor or p.currency is distinct from p_currency
    or p_capture_id is null or p_capture_id !~ '^[A-Z0-9]{10,32}$' then return false; end if;
  if p.status='completed' then return p.paypal_capture_id=p_capture_id; end if;
  -- A cancellation/failed browser callback can race an actual capture. Only
  -- trusted PayPal COMPLETED proof may override it through this RPC.
  perform 1 from public.generation_accounts where owner_user_id=p.owner_user_id for update;
  insert into public.credit_ledger(owner_user_id,job_id,purchase_id,paypal_order_id,paypal_capture_id,
    amount,type,direction,available_delta,reserved_delta,reason,reference_key)
    values(p.owner_user_id,null,p.id,p_order_id,p_capture_id,p.credits,'purchase','credit',p.credits,0,'purchase',
      'paypal:sandbox:'||p_order_id||':'||p_capture_id);
  update public.generation_accounts set credit_available=credit_available+p.credits,updated_at=now() where owner_user_id=p.owner_user_id;
  update public.credit_purchases set status='completed',paypal_capture_id=p_capture_id,completed_at=now(),updated_at=now() where id=p.id;
  return true;
end $$;

alter table public.credit_purchases enable row level security;
revoke all on public.credit_purchases from public,anon,authenticated,service_role;
grant select on public.credit_purchases to service_role;
revoke all on function public.guard_credit_purchase() from public,anon,authenticated,service_role;
revoke all on function public.prepare_credit_purchase(uuid,text,text,integer,text,bigint),public.attach_paypal_order(uuid,uuid,text),
  public.set_credit_purchase_state(uuid,text,text),public.fulfil_paypal_purchase(uuid,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_credit_purchase(uuid,text,text,integer,text,bigint),public.attach_paypal_order(uuid,uuid,text),
  public.set_credit_purchase_state(uuid,text,text),public.fulfil_paypal_purchase(uuid,text,text,integer,text) to service_role;

commit;
