-- Authentication nonces only: no request bodies, secrets, ownership or media.
begin;
create table public.media_worker_request_nonces (
 nonce uuid primary key,
 expires_at timestamptz not null
);
create index media_worker_request_nonces_expiry on public.media_worker_request_nonces(expires_at);
alter table public.media_worker_request_nonces enable row level security;

create function public.register_media_worker_request(p_nonce uuid, p_timestamp_ms bigint) returns text
language plpgsql security definer set search_path='' as $$
declare
 v_now timestamptz := clock_timestamp();
 v_sent timestamptz;
begin
 if p_nonce is null or p_timestamp_ms is null or p_timestamp_ms < 1000000000000 or p_timestamp_ms > 9999999999999 then
  return 'unauthorized';
 end if;
 v_sent := to_timestamp(p_timestamp_ms::double precision / 1000);
 -- Recheck freshness using the persistence authority's clock. Even after
 -- cleanup, the original expired signed request can never be registered again.
 if v_sent < v_now - interval '5 minutes' or v_sent > v_now + interval '5 minutes' then
  return 'unauthorized';
 end if;

 -- Indexed, bounded, traffic-driven cleanup needs no scheduler or Render shell.
 -- SKIP LOCKED avoids cleanup contention between independent workers.
 delete from public.media_worker_request_nonces where nonce in (
  select nonce from public.media_worker_request_nonces
  where expires_at < v_now order by expires_at limit 1000 for update skip locked
 );
 -- A permitted timestamp can be five minutes in the future, so a request can
 -- remain valid for ten minutes after acceptance. Retain for eleven minutes.
 insert into public.media_worker_request_nonces(nonce,expires_at)
 values(p_nonce,v_now + interval '11 minutes') on conflict(nonce) do nothing;
 if found then return 'accepted'; end if;
 return 'replay';
end; $$;

revoke all on public.media_worker_request_nonces from public,anon,authenticated,service_role;
revoke all on function public.register_media_worker_request(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.register_media_worker_request(uuid,bigint) to service_role;
commit;
