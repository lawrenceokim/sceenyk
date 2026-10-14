-- A reviewed checkout may remain open before its first provider request.
-- Start the bounded unknown-create retry window at that request, not review.
begin;
alter table public.marketplace_purchases add column paypal_create_started_at timestamptz;

create function public.marketplace_create_attempt_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.paypal_create_started_at is not null and new.paypal_create_started_at is distinct from old.paypal_create_started_at then
    raise exception 'PayPal create-attempt identity is immutable.';
  end if;
  return new;
end $$;
create trigger marketplace_create_attempt_guard before update on public.marketplace_purchases
  for each row execute function public.marketplace_create_attempt_guard();

create function public.marketplace_begin_order(p_purchase_id uuid,p_buyer_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.marketplace_purchases;
begin
  select * into p from public.marketplace_purchases where id=p_purchase_id and buyer_user_id=p_buyer_user_id for update;
  if not found or p.status<>'pending' or p.paypal_order_id is not null then raise exception 'Purchase create unavailable.'; end if;
  if p.paypal_create_started_at is null then
    update public.marketplace_purchases set paypal_create_started_at=now() where id=p.id returning * into p;
  end if;
  return to_jsonb(p);
end $$;
revoke all on function public.marketplace_create_attempt_guard(),public.marketplace_begin_order(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.marketplace_begin_order(uuid,uuid) to service_role;
commit;
