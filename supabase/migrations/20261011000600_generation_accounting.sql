-- Accounting foundation only. No tariffs, purchases, providers or rendering.
begin;

do $$
begin
  if to_regclass('public.generation_accounts') is not null then
    raise exception 'Inspect existing accounting schema before applying migration 006.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='generation_jobs' and column_name='worker_run_id' and data_type='text')
    or to_regprocedure('public.claim_generation_job(uuid,text)') is null then
    raise exception 'Apply generation dispatch migration 005 first.';
  end if;
end;
$$;

-- Avoid stranding previously admitted unaccounted work. The current worker
-- finishes in about a minute; apply between jobs. Lock prevents a concurrent
-- old-build INSERT slipping between this check and the new admission guard.
lock table public.generation_jobs in share row exclusive mode;
do $$
begin
  if exists (select 1 from public.generation_jobs where status in ('queued','processing')) then
    raise exception 'Wait for existing generation jobs to finish before applying accounting migration 006.';
  end if;
end;
$$;

create table public.generation_accounts (
  owner_user_id uuid primary key references public.app_users(id) on delete restrict,
  free_total integer not null default 2 check (free_total = 2),
  free_reserved integer not null default 0 check (free_reserved >= 0),
  free_consumed integer not null default 0 check (free_consumed >= 0),
  credit_available bigint not null default 0 check (credit_available >= 0),
  credit_reserved bigint not null default 0 check (credit_reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (free_reserved + free_consumed <= free_total),
  check (credit_available + credit_reserved <= 9007199254740991)
);

create function public.initialize_generation_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.generation_accounts(owner_user_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger app_users_generation_account after insert on public.app_users
for each row execute function public.initialize_generation_account();
insert into public.generation_accounts(owner_user_id) select id from public.app_users on conflict do nothing;

-- Existing jobs are historical, not retroactively charged. New jobs must use
-- transactional admission. No old job identity, snapshot or status is changed.
alter table public.generation_jobs
  add column accounting_version smallint not null default 0 check (accounting_version in (0,1)),
  add constraint generation_jobs_id_owner_unique unique(id,owner_user_id);
alter table public.generation_jobs alter column accounting_version set default 1;

create table public.generation_reservations (
  job_id uuid primary key,
  owner_user_id uuid not null references public.generation_accounts(owner_user_id) on delete restrict,
  kind text not null check (kind in ('free','credits')),
  amount bigint not null check (amount between 1 and 9007199254740991),
  state text not null default 'reserved' check (state in ('reserved','consumed','released')),
  reason text not null default 'generation_admission' check (reason in ('generation_admission','stored_result_verified','generation_failed')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique(job_id,owner_user_id),
  foreign key(job_id,owner_user_id) references public.generation_jobs(id,owner_user_id) on delete restrict,
  check (kind <> 'free' or amount = 1),
  check ((state='reserved' and reason='generation_admission' and settled_at is null)
    or (state='consumed' and reason='stored_result_verified' and settled_at is not null)
    or (state='released' and reason='generation_failed' and settled_at is not null))
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.generation_accounts(owner_user_id) on delete restrict,
  job_id uuid not null,
  amount bigint not null check (amount between 1 and 9007199254740991),
  type text not null check (type in ('reservation','consumption','release')),
  direction text not null check (direction in ('hold','debit','restore')),
  available_delta bigint not null,
  reserved_delta bigint not null,
  reason text not null,
  reference_key text not null unique,
  created_at timestamptz not null default now(),
  foreign key(job_id,owner_user_id) references public.generation_reservations(job_id,owner_user_id) on delete restrict,
  unique(job_id,type),
  check (reference_key = job_id::text || ':' || type),
  check ((type='reservation' and direction='hold' and available_delta=-amount and reserved_delta=amount and reason='generation_admission')
    or (type='consumption' and direction='debit' and available_delta=0 and reserved_delta=-amount and reason='stored_result_verified')
    or (type='release' and direction='restore' and available_delta=amount and reserved_delta=-amount and reason='generation_failed'))
);
create index credit_ledger_owner_created_idx on public.credit_ledger(owner_user_id,created_at desc,id desc);

-- Accounting evidence only; no output production/upload/read feature.
create table public.generation_result_receipts (
  job_id uuid primary key,
  owner_user_id uuid not null,
  worker_run_id text not null check (char_length(worker_run_id) between 1 and 200),
  storage_provider text not null default 'r2' check (storage_provider='r2'),
  storage_key text not null unique,
  mime_type text not null check (mime_type in ('video/mp4','video/webm')),
  size_bytes bigint not null check (size_bytes between 1 and 9007199254740991),
  verified_etag text not null check (char_length(verified_etag) between 1 and 200),
  verified_at timestamptz not null default now(),
  foreign key(job_id,owner_user_id) references public.generation_reservations(job_id,owner_user_id) on delete restrict,
  check (storage_key = 'users/' || owner_user_id::text || '/generations/' || job_id::text || '/result.' || case when mime_type='video/mp4' then 'mp4' else 'webm' end)
);

create function public.immutable_accounting_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Accounting history is immutable.' using errcode='23514';
end;
$$;
create trigger credit_ledger_immutable before update or delete on public.credit_ledger for each row execute function public.immutable_accounting_record();
create trigger generation_result_receipts_immutable before update or delete on public.generation_result_receipts for each row execute function public.immutable_accounting_record();

create function public.guard_generation_reservation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='DELETE' then raise exception 'Reservation cannot be deleted.' using errcode='23514'; end if;
  if row(new.job_id,new.owner_user_id,new.kind,new.amount,new.created_at) is distinct from row(old.job_id,old.owner_user_id,old.kind,old.amount,old.created_at)
    or old.state <> 'reserved' or new.state not in ('consumed','released') then
    raise exception 'Invalid reservation transition.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger generation_reservations_guard before update or delete on public.generation_reservations for each row execute function public.guard_generation_reservation();

create function public.require_generation_reservation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.accounting_version=1 and not exists (select 1 from public.generation_reservations r where r.job_id=new.id and r.owner_user_id=new.owner_user_id) then
    raise exception 'Generation requires transactional reservation.' using errcode='23514';
  end if;
  return null;
end;
$$;
create constraint trigger generation_jobs_reservation_required after insert on public.generation_jobs
deferrable initially deferred for each row execute function public.require_generation_reservation();

create function public.guard_generation_accounting() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.accounting_version is distinct from old.accounting_version then
    raise exception 'Accounting version is immutable.' using errcode='23514';
  end if;
  if (new.status='processing' and old.status='queued') or new.dispatch_attempts > old.dispatch_attempts
    or (new.status='completed' and old.status <> 'completed') then
    if new.accounting_version <> 1 or not exists (select 1 from public.generation_reservations r where r.job_id=new.id and r.owner_user_id=new.owner_user_id and r.state='reserved') then
      raise exception 'Execution requires reserved capacity.' using errcode='23514';
    end if;
  end if;
  if new.status='completed' and old.status <> 'completed' and not exists (
    select 1 from public.generation_result_receipts r where r.job_id=new.id and r.owner_user_id=new.owner_user_id and r.worker_run_id=new.worker_run_id
  ) then raise exception 'Completion requires verified stored result.' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger generation_jobs_accounting_guard before update on public.generation_jobs for each row execute function public.guard_generation_accounting();

create function public.settle_generation_reservation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.generation_reservations; outcome text;
begin
  if new.accounting_version=0 then return null; end if;
  select * into r from public.generation_reservations where job_id=new.id for update;
  if not found or r.state <> 'reserved' then raise exception 'Missing active reservation.' using errcode='23514'; end if;
  outcome := case when new.status='completed' then 'consumption' else 'release' end;
  if r.kind='free' then
    update public.generation_accounts set free_reserved=free_reserved-1,
      free_consumed=free_consumed + case when new.status='completed' then 1 else 0 end, updated_at=now()
      where owner_user_id=r.owner_user_id and free_reserved >= 1;
  else
    update public.generation_accounts set credit_reserved=credit_reserved-r.amount,
      credit_available=credit_available + case when new.status='failed' then r.amount else 0 end, updated_at=now()
      where owner_user_id=r.owner_user_id and credit_reserved >= r.amount;
  end if;
  if not found then raise exception 'Accounting balance integrity failure.' using errcode='23514'; end if;
  if r.kind='credits' then
    insert into public.credit_ledger(owner_user_id,job_id,amount,type,direction,available_delta,reserved_delta,reason,reference_key)
      values(r.owner_user_id,r.job_id,r.amount,outcome,case when new.status='completed' then 'debit' else 'restore' end,
        case when new.status='failed' then r.amount else 0 end,-r.amount,
        case when new.status='completed' then 'stored_result_verified' else 'generation_failed' end,r.job_id::text || ':' || outcome);
  end if;
  update public.generation_reservations set state=case when new.status='completed' then 'consumed' else 'released' end,
    reason=case when new.status='completed' then 'stored_result_verified' else 'generation_failed' end,settled_at=now() where job_id=r.job_id;
  return null;
end;
$$;
create trigger generation_jobs_accounting_settlement after update of status on public.generation_jobs for each row
when (old.status is distinct from new.status and new.status in ('completed','failed')) execute function public.settle_generation_reservation();

create function public.admit_generation(p_owner_user_id uuid,p_project_id uuid,p_request_id uuid,p_snapshot jsonb,p_credit_cost bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.generation_accounts; j public.generation_jobs; k text; cost bigint;
begin
  if not exists (select 1 from public.projects p join public.app_users u on u.id=p.owner_user_id where p.id=p_project_id and p.owner_user_id=p_owner_user_id and char_length(u.clerk_user_id)>0) then return jsonb_build_object('code','NOT_FOUND'); end if;
  if public.valid_generation_snapshot(p_snapshot) is not true or p_request_id is null then return jsonb_build_object('code','INVALID_INPUT'); end if;
  select * into a from public.generation_accounts where owner_user_id=p_owner_user_id for update;
  if not found then raise exception 'Accounting account missing.' using errcode='23514'; end if;
  -- Do not lock an existing job while holding its account lock: settlement
  -- locks job then account. This MVCC read avoids the opposite lock order.
  select * into j from public.generation_jobs where project_id=p_project_id and request_id=p_request_id;
  if found then
    if j.owner_user_id <> p_owner_user_id or j.input_snapshot <> p_snapshot then return jsonb_build_object('code','CONFLICT'); end if;
    return jsonb_build_object('code','ACCEPTED','job_id',j.id);
  end if;
  if exists (select 1 from jsonb_array_elements_text(p_snapshot->'assetIds') s(id) where not exists (
    select 1 from public.project_assets x where x.id=s.id::uuid and x.owner_user_id=p_owner_user_id and x.project_id=p_project_id and x.upload_status='uploaded' and x.verified_etag is not null
  )) then return jsonb_build_object('code','INVALID_ASSETS'); end if;
  if (p_snapshot->'settings'->>'duration')::integer <= 10 and a.free_total-a.free_reserved-a.free_consumed > 0 then
    k := 'free'; cost := 1;
  else
    if p_credit_cost is null then return jsonb_build_object('code','PAID_ACCESS_UNAVAILABLE'); end if;
    if p_credit_cost < 1 or p_credit_cost > 9007199254740991 then return jsonb_build_object('code','INVALID_COST'); end if;
    if a.credit_available < p_credit_cost then return jsonb_build_object('code','INSUFFICIENT_CREDITS'); end if;
    k := 'credits'; cost := p_credit_cost;
  end if;
  insert into public.generation_jobs(owner_user_id,project_id,request_id,input_snapshot)
    values(p_owner_user_id,p_project_id,p_request_id,p_snapshot) returning * into j;
  insert into public.generation_reservations(job_id,owner_user_id,kind,amount) values(j.id,p_owner_user_id,k,cost);
  if k='free' then
    update public.generation_accounts set free_reserved=free_reserved+1,updated_at=now() where owner_user_id=p_owner_user_id;
  else
    update public.generation_accounts set credit_available=credit_available-cost,credit_reserved=credit_reserved+cost,updated_at=now() where owner_user_id=p_owner_user_id;
    insert into public.credit_ledger(owner_user_id,job_id,amount,type,direction,available_delta,reserved_delta,reason,reference_key)
      values(p_owner_user_id,j.id,cost,'reservation','hold',-cost,cost,'generation_admission',j.id::text || ':reservation');
  end if;
  return jsonb_build_object('code','ACCEPTED','job_id',j.id);
end;
$$;

-- Server-only assertion of independently verified storage metadata. The
-- application settlement adapter verifies R2 before calling this function.
create function public.complete_generation_with_result(p_job_id uuid,p_run_id text,p_storage_key text,p_mime_type text,p_size_bytes bigint,p_etag text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found or j.accounting_version <> 1 or j.worker_run_id is distinct from p_run_id then return false; end if;
  if j.status='completed' then
    return exists (select 1 from public.generation_result_receipts r where r.job_id=j.id and r.worker_run_id=p_run_id and r.storage_key=p_storage_key and r.mime_type=p_mime_type and r.size_bytes=p_size_bytes and r.verified_etag=p_etag);
  end if;
  if j.status <> 'processing' or j.current_stage <> 'rendering' then return false; end if;
  insert into public.generation_result_receipts(job_id,owner_user_id,worker_run_id,storage_key,mime_type,size_bytes,verified_etag)
    values(j.id,j.owner_user_id,p_run_id,p_storage_key,p_mime_type,p_size_bytes,p_etag);
  update public.generation_jobs set status='completed',current_stage=null where id=j.id;
  return true;
end;
$$;

-- Retain 005's authoritative checks/claim identity, adding the reservation gate.
alter function public.claim_generation_job(uuid,text) rename to claim_generation_job_before_accounting;
revoke all on function public.claim_generation_job_before_accounting(uuid,text) from public,anon,authenticated,service_role;
create function public.claim_generation_job(p_job_id uuid,p_run_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs;
begin
  if p_run_id is null or char_length(p_run_id) not between 1 and 200 then return 'invalid'; end if;
  select * into j from public.generation_jobs where id=p_job_id for update;
  if not found then return 'missing'; end if;
  if j.status in ('completed','failed') then return 'terminal'; end if;
  if j.accounting_version=0 and j.status='queued' then
    update public.generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' where id=j.id;
    return 'invalid';
  end if;
  if j.accounting_version=1 and not exists (select 1 from public.generation_reservations r where r.job_id=j.id and r.owner_user_id=j.owner_user_id and r.state='reserved') then return 'invalid'; end if;
  return public.claim_generation_job_before_accounting(p_job_id,p_run_id);
end;
$$;

create or replace function public.reserve_generation_dispatch(p_job_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare attempt integer;
begin
  update public.generation_jobs j set dispatch_attempts=dispatch_attempts+1,last_dispatch_at=now(),dispatch_status='pending',dispatch_error=null
  where j.id=p_job_id and j.accounting_version=1 and j.status='queued' and j.worker_run_id is null
    and (j.last_dispatch_at is null or j.last_dispatch_at <= now()-interval '2 minutes')
    and exists (select 1 from public.generation_reservations r where r.job_id=j.id and r.owner_user_id=j.owner_user_id and r.state='reserved')
  returning dispatch_attempts into attempt;
  return coalesce(attempt,0);
end;
$$;
create or replace function public.generation_dispatch_candidates() returns table(job_id uuid)
language sql security definer set search_path = '' as $$
  select j.id from public.generation_jobs j where j.accounting_version=1 and j.status='queued' and j.worker_run_id is null
    and (j.last_dispatch_at is null or j.last_dispatch_at <= now()-interval '2 minutes')
    and exists (select 1 from public.generation_reservations r where r.job_id=j.id and r.owner_user_id=j.owner_user_id and r.state='reserved')
  order by j.last_dispatch_at nulls first,j.created_at,j.id limit 25;
$$;

alter table public.generation_accounts enable row level security;
alter table public.generation_reservations enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.generation_result_receipts enable row level security;
revoke all on public.generation_accounts,public.generation_reservations,public.credit_ledger,public.generation_result_receipts from public,anon,authenticated,service_role;
grant select on public.generation_accounts,public.generation_reservations,public.credit_ledger,public.generation_result_receipts to service_role;
revoke insert on public.generation_jobs from service_role;
revoke insert(owner_user_id,project_id,request_id,input_snapshot) on public.generation_jobs from service_role;
revoke all on function public.initialize_generation_account(),public.immutable_accounting_record(),public.guard_generation_reservation(),public.require_generation_reservation(),public.guard_generation_accounting(),public.settle_generation_reservation() from public,anon,authenticated,service_role;
revoke all on function public.admit_generation(uuid,uuid,uuid,jsonb,bigint),public.complete_generation_with_result(uuid,text,text,text,bigint,text),public.claim_generation_job(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.admit_generation(uuid,uuid,uuid,jsonb,bigint),public.complete_generation_with_result(uuid,text,text,text,bigint,text),public.claim_generation_job(uuid,text) to service_role;
commit;
