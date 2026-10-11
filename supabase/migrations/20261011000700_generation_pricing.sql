-- Commercial quotes only. Preserve 006 admission/settlement and all history.
begin;
do $$
begin
  if to_regclass('public.generation_quotes') is not null then
    raise exception 'Inspect existing pricing schema before applying migration 007.';
  end if;
  if to_regprocedure('public.admit_generation(uuid,uuid,uuid,jsonb,bigint)') is null
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='generation_accounts' and column_name='credit_available' and data_type='bigint')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='generation_reservations' and column_name='amount' and data_type='bigint') then
    raise exception 'Apply accounting migration 006 first.';
  end if;
end;
$$;

create table public.generation_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.generation_accounts(owner_user_id) on delete restrict,
  project_id uuid not null,
  request_id uuid not null,
  input_snapshot jsonb not null check (public.valid_generation_snapshot(input_snapshot)),
  eligible_free boolean not null,
  required_credits bigint check (required_credits between 0 and 9007199254740991),
  available_credits bigint not null check (available_credits between 0 and 9007199254740991),
  free_remaining integer not null check (free_remaining between 0 and 2),
  pricing_version text not null check (char_length(pricing_version) between 1 and 160),
  pricing_mode text not null check (pricing_mode in ('unconfigured','test')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '5 minutes'),
  unique(id,owner_user_id),
  foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict,
  check (expires_at > created_at),
  check ((eligible_free and required_credits=0 and free_remaining>0 and (input_snapshot->'settings'->>'duration')::integer<=10)
    or (not eligible_free and (required_credits is null or required_credits>0))),
  check (pricing_mode <> 'unconfigured' or required_credits is null or eligible_free)
);
create index generation_quotes_owner_created_idx on public.generation_quotes(owner_user_id,created_at desc);

-- A new immutable association, rather than rewriting historic jobs/reservations.
-- Cost, rules version and normalized workload remain in the immutable quote.
create table public.generation_pricing_records (
  job_id uuid primary key,
  owner_user_id uuid not null,
  quote_id uuid not null unique,
  created_at timestamptz not null default now(),
  foreign key(job_id,owner_user_id) references public.generation_reservations(job_id,owner_user_id) on delete restrict,
  foreign key(quote_id,owner_user_id) references public.generation_quotes(id,owner_user_id) on delete restrict
);
create trigger generation_quotes_immutable before update or delete on public.generation_quotes
  for each row execute function public.immutable_accounting_record();
create trigger generation_pricing_records_immutable before update or delete on public.generation_pricing_records
  for each row execute function public.immutable_accounting_record();

create function public.issue_generation_quote(p_owner_user_id uuid,p_project_id uuid,p_request_id uuid,p_snapshot jsonb,p_credit_cost bigint,p_pricing_version text,p_pricing_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.generation_accounts; q public.generation_quotes; is_free boolean;
begin
  if not exists (select 1 from public.projects where id=p_project_id and owner_user_id=p_owner_user_id) then return jsonb_build_object('code','NOT_FOUND'); end if;
  if public.valid_generation_snapshot(p_snapshot) is not true or p_request_id is null then return jsonb_build_object('code','INVALID_INPUT'); end if;
  if p_pricing_version is null or char_length(p_pricing_version) not between 1 and 160
    or p_pricing_mode is null or p_pricing_mode not in ('unconfigured','test')
    or (p_credit_cost is not null and (p_credit_cost<1 or p_credit_cost>9007199254740991))
    or (p_pricing_mode='unconfigured' and p_credit_cost is not null) then return jsonb_build_object('code','INVALID_COST'); end if;
  if exists (select 1 from jsonb_array_elements_text(p_snapshot->'assetIds') s(id) where not exists (
    select 1 from public.project_assets x where x.id=s.id::uuid and x.owner_user_id=p_owner_user_id and x.project_id=p_project_id and x.upload_status='uploaded' and x.verified_etag is not null
  )) then return jsonb_build_object('code','INVALID_ASSETS'); end if;
  select * into a from public.generation_accounts where owner_user_id=p_owner_user_id;
  if not found then raise exception 'Accounting account missing.' using errcode='23514'; end if;
  is_free := (p_snapshot->'settings'->>'duration')::integer<=10 and a.free_total-a.free_reserved-a.free_consumed>0;
  insert into public.generation_quotes(owner_user_id,project_id,request_id,input_snapshot,eligible_free,required_credits,available_credits,free_remaining,pricing_version,pricing_mode)
    values(p_owner_user_id,p_project_id,p_request_id,p_snapshot,is_free,case when is_free then 0 else p_credit_cost end,a.credit_available,a.free_total-a.free_reserved-a.free_consumed,p_pricing_version,p_pricing_mode) returning * into q;
  return jsonb_build_object('code','QUOTED','quote',to_jsonb(q));
end;
$$;

create function public.confirm_generation_quote(p_owner_user_id uuid,p_quote_id uuid,p_current_pricing_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.generation_quotes; a public.generation_accounts; j public.generation_jobs; admitted jsonb; is_free boolean;
begin
  select * into q from public.generation_quotes where id=p_quote_id and owner_user_id=p_owner_user_id;
  if not found or not exists (select 1 from public.projects where id=q.project_id and owner_user_id=p_owner_user_id) then return jsonb_build_object('code','NOT_FOUND'); end if;
  select * into a from public.generation_accounts where owner_user_id=p_owner_user_id for update;
  if not found then raise exception 'Accounting account missing.' using errcode='23514'; end if;
  -- Retry recovery precedes expiry/version/eligibility checks: never reprice a
  -- committed generation, including after terminal restoration or config changes.
  select * into j from public.generation_jobs where project_id=q.project_id and request_id=q.request_id;
  if found then
    if j.owner_user_id<>p_owner_user_id or j.input_snapshot<>q.input_snapshot or not exists (
      select 1 from public.generation_pricing_records r where r.job_id=j.id and r.quote_id=q.id and r.owner_user_id=p_owner_user_id
    ) then return jsonb_build_object('code','CONFLICT'); end if;
    return jsonb_build_object('code','ACCEPTED','job_id',j.id);
  end if;
  if q.expires_at<=clock_timestamp() or q.pricing_version is distinct from p_current_pricing_version then return jsonb_build_object('code','QUOTE_STALE'); end if;
  is_free := (q.input_snapshot->'settings'->>'duration')::integer<=10 and a.free_total-a.free_reserved-a.free_consumed>0;
  -- Never turn a previously displayed free decision into a paid hold.
  if q.eligible_free is distinct from is_free then return jsonb_build_object('code','QUOTE_STALE'); end if;
  admitted := public.admit_generation(p_owner_user_id,q.project_id,q.request_id,q.input_snapshot,q.required_credits);
  if admitted->>'code'='ACCEPTED' then
    insert into public.generation_pricing_records(job_id,owner_user_id,quote_id) values((admitted->>'job_id')::uuid,p_owner_user_id,q.id);
  end if;
  return admitted;
end;
$$;

-- All new admissions require quote provenance, even from a privileged caller.
-- Existing in-flight 006 jobs are untouched and still settle normally.
create function public.require_generation_pricing_record() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists (select 1 from public.generation_pricing_records where job_id=new.id and owner_user_id=new.owner_user_id) then
    raise exception 'Generation requires confirmed pricing quote.' using errcode='23514';
  end if;
  return null;
end;
$$;
create constraint trigger generation_jobs_pricing_required after insert on public.generation_jobs
  deferrable initially deferred for each row execute function public.require_generation_pricing_record();

alter table public.generation_quotes enable row level security;
alter table public.generation_pricing_records enable row level security;
revoke all on public.generation_quotes,public.generation_pricing_records from public,anon,authenticated,service_role;
grant select on public.generation_quotes,public.generation_pricing_records to service_role;
revoke all on function public.admit_generation(uuid,uuid,uuid,jsonb,bigint) from public,anon,authenticated,service_role;
revoke all on function public.require_generation_pricing_record() from public,anon,authenticated,service_role;
revoke all on function public.issue_generation_quote(uuid,uuid,uuid,jsonb,bigint,text,text),public.confirm_generation_quote(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.issue_generation_quote(uuid,uuid,uuid,jsonb,bigint,text,text),public.confirm_generation_quote(uuid,uuid,text) to service_role;
commit;
