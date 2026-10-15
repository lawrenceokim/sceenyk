-- Internal Sandbox status inspection only. No payout creation or money override.
-- Apply after 025; historical migrations and financial transitions are unchanged.
begin;
do $$ begin
  if to_regclass('public.internal_user_roles') is null or to_regclass('public.creator_withdrawals') is null then
    raise exception 'Apply the existing identity/withdrawal/role migrations first.';
  end if;
end $$;

create table public.payout_support_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  withdrawal_id uuid references public.creator_withdrawals(id) on delete restrict,
  actor_user_id uuid references public.app_users(id) on delete restrict,
  actor_role text check(actor_role in ('user','support','admin')),
  source text not null check(source in ('support','worker','webhook')),
  action text not null check(action in ('queue_view','detail_view','check_started','check_finished')),
  submission boolean not null default false,
  prior_status text check(prior_status in ('pending','eligible','processing','paid','failed')),
  observed_status text check(observed_status ~ '^[A-Z_]{1,80}$'),
  resulting_status text check(resulting_status in ('pending','eligible','processing','paid','failed')),
  outcome text not null check(outcome in ('viewed','not_found','started','paid','processing','definitive_failure','needs_review','provider_unavailable','not_submitted','denied')),
  reason text not null check(reason in ('viewed','not_found','check_started','provider_success','provider_processing','provider_failure','provider_returned','unknown_provider_state','provider_item_missing','provider_identity_mismatch','provider_unavailable','provider_reference_missing','not_submitted','terminal_conflict','role_revoked')),
  created_at timestamptz not null default now(),
  unique(attempt_id,action),
  check((source='support')=(actor_user_id is not null)),
  check((source='support')=(actor_role is not null)),
  check(not submission or source='worker')
);
create index payout_support_event_history on public.payout_support_events(withdrawal_id,created_at desc,id);
create index payout_support_latest_check on public.payout_support_events(withdrawal_id,created_at desc,id) where action='check_finished';
create index creator_withdrawal_support_queue on public.creator_withdrawals(status,requested_at desc,id);
create trigger payout_support_history_guard before update or delete on public.payout_support_events
  for each row execute function public.marketplace_financial_guard();
create trigger payout_support_truncate_guard before truncate on public.payout_support_events
  for each statement execute function public.marketplace_financial_guard();
alter table public.payout_support_events enable row level security;
revoke all on public.payout_support_events from public,anon,authenticated,service_role;
grant select on public.payout_support_events to service_role;

create function public.payout_support_actor(p_actor uuid) returns text language plpgsql security definer set search_path='' as $$
declare r text;
begin
  select role into r from public.internal_user_roles where user_id=p_actor for share;
  if r is null or r not in ('support','admin') then raise insufficient_privilege using message='Internal access denied.'; end if;
  return r;
end $$;

create function public.payout_support_review(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    (w.status='processing' and (w.paypal_batch_id is null or w.paypal_batch_id !~ '^[A-Z0-9]{5,64}$'))
    or (w.status='paid' and w.provider_status='RETURNED') or w.provider_status='REFUNDED'
    or exists(select 1 from public.creator_money_events where withdrawal_id=w.id and kind='provider_returned')
    or (w.provider_status is not null and w.provider_status not in ('SUCCESS','PENDING','PROCESSING','ONHOLD','UNCLAIMED','FAILED','DENIED','BLOCKED','CANCELED','RETURNED','REFUNDED','BATCH_PENDING','BATCH_PROCESSING'))
    or (select outcome in ('needs_review','provider_unavailable') from public.payout_support_events where withdrawal_id=w.id and action='check_finished' order by created_at desc,id desc limit 1),false)
  from public.creator_withdrawals w where w.id=p_id;
$$;
create function public.payout_support_summary(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',w.id,'creatorId',w.creator_user_id,'creatorName',coalesce(nullif(trim(concat_ws(' ',u.first_name,u.last_name)),''),'Creator'),
    'requested',w.requested_minor,'reserved',w.reserved_minor,'submitted',w.submitted_minor,'currency',w.currency,'status',w.status,
    'requestedAt',w.requested_at,'holdUntil',w.hold_until,'processingAt',w.processing_at,'paidAt',w.paid_at,
    'ageMinutes',greatest(0,floor(extract(epoch from(now()-w.requested_at))/60)),
    'providerStatus',w.provider_status,'lastAttemptAt',(select max(created_at) from public.payout_support_events where withdrawal_id=w.id and action='check_started'),
    'lastCheckedAt',e.created_at,'lastOutcome',e.outcome,
    'submissionAcknowledgedAt',(select min(created_at) from public.payout_support_events where withdrawal_id=w.id and action='check_finished' and submission),
    'reviewRequired',public.payout_support_review(w.id))
  from public.creator_withdrawals w join public.app_users u on u.id=w.creator_user_id
  left join lateral(select created_at,outcome from public.payout_support_events where withdrawal_id=w.id and action='check_finished' order by created_at desc,id desc limit 1)e on true
  where w.id=p_id;
$$;

create function public.payout_support_queue(p_actor uuid,p_query text,p_status text,p_page integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; result jsonb;
begin
  r=public.payout_support_actor(p_actor);
  if p_query is null or length(p_query)>120 or p_page is null or p_page not between 1 and 100000
    or p_status is null or p_status not in ('all','pending','eligible','processing','paid','failed','review') then raise exception 'Invalid support query.'; end if;
  insert into public.payout_support_events(attempt_id,actor_user_id,actor_role,source,action,outcome,reason)
    values(gen_random_uuid(),p_actor,r,'support','queue_view','viewed','viewed');
  with matches as materialized (
    select w.id,w.requested_at
    from public.creator_withdrawals w join public.app_users u on u.id=w.creator_user_id
    where (p_status in ('all','review') or w.status=p_status)
      and (p_query='' or position(lower(p_query) in lower(concat_ws(' ',w.id::text,w.paypal_batch_id,w.paypal_item_id,u.first_name,u.last_name)))>0)
      and (p_status<>'review' or public.payout_support_review(w.id))
  ) select jsonb_build_object('total',(select count(*) from matches),'page',p_page,'pageSize',12,
    'items',coalesce((select jsonb_agg(public.payout_support_summary(id) order by requested_at desc,id) from(select * from matches order by requested_at desc,id limit 12 offset(p_page-1)*12)page),'[]'::jsonb)) into result;
  return result;
end $$;

create function public.payout_support_detail(p_actor uuid,p_id uuid,p_history_page integer,p_audit_page integer,p_allocation_page integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; w public.creator_withdrawals; history jsonb; audits jsonb; allocations jsonb;
begin
  r=public.payout_support_actor(p_actor);
  if p_id is null or p_history_page is null or p_audit_page is null or p_allocation_page is null
    or p_history_page not between 1 and 100000 or p_audit_page not between 1 and 100000 or p_allocation_page not between 1 and 100000 then raise exception 'Invalid support detail.'; end if;
  select * into w from public.creator_withdrawals where id=p_id;
  if w.id is not null then
    perform 1 from public.app_users where id=w.creator_user_id for share;
    select * into w from public.creator_withdrawals where id=p_id for share;
  end if;
  insert into public.payout_support_events(attempt_id,withdrawal_id,actor_user_id,actor_role,source,action,prior_status,resulting_status,outcome,reason)
    values(gen_random_uuid(),w.id,p_actor,r,'support','detail_view',w.status,w.status,case when w.id is null then 'not_found' else 'viewed' end,case when w.id is null then 'not_found' else 'viewed' end);
  if w.id is null then return jsonb_build_object('found',false); end if;
  with events as materialized(
    select e.id::text id,e.created_at at,e.kind,e.amount_minor amount,e.purchase_id purchase,null::integer gross,null::integer fee
      from public.creator_money_events e where e.withdrawal_id=w.id
    union all
    select a.id::text,a.created_at,a.reason,a.net_minor,a.purchase_id,a.gross_minor,a.fee_minor
      from public.marketplace_payment_adjustments a where exists(select 1 from public.creator_withdrawal_allocations x where x.withdrawal_id=w.id and x.purchase_id=a.purchase_id)
  ) select jsonb_build_object('total',(select count(*) from events),'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'at',at,'kind',kind,'amount',amount,'purchaseId',purchase,'gross',gross,'fee',fee) order by at desc,id) from(select * from events order by at desc,id limit 25 offset(p_history_page-1)*25)page),'[]'::jsonb)) into history;
  with events as materialized(select e.*,coalesce(nullif(trim(concat_ws(' ',u.first_name,u.last_name)),''),'Internal operator') actor_name
    from public.payout_support_events e left join public.app_users u on u.id=e.actor_user_id where e.withdrawal_id=w.id)
  select jsonb_build_object('total',(select count(*) from events),'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'at',created_at,'actorId',actor_user_id,'actorName',actor_name,'source',source,'action',action,'attemptId',attempt_id,'priorStatus',prior_status,'observedStatus',observed_status,'resultingStatus',resulting_status,'outcome',outcome,'reason',reason) order by created_at desc,id)
    from(select * from events order by created_at desc,id limit 25 offset(p_audit_page-1)*25)page),'[]'::jsonb)) into audits;
  select jsonb_build_object('total',(select count(*) from public.creator_withdrawal_allocations where withdrawal_id=w.id),
    'originalTotal',(select coalesce(sum(amount_minor),0) from public.creator_withdrawal_allocations where withdrawal_id=w.id),
    'remainingTotal',(select coalesce(sum(remaining_minor),0) from public.creator_withdrawal_allocations where withdrawal_id=w.id),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'purchaseId',a.purchase_id,'original',a.amount_minor,'remaining',a.remaining_minor,'lotReversed',l.reversed_minor,'lotAvailable',l.available_minor,'lotOffset',l.offset_minor) order by a.id)
      from(select * from public.creator_withdrawal_allocations where withdrawal_id=w.id order by id limit 25 offset(p_allocation_page-1)*25)a join public.creator_money_lots l on l.purchase_id=a.purchase_id),'[]'::jsonb)) into allocations;
  return jsonb_build_object('found',true,'withdrawal',public.payout_support_summary(w.id),
    'creatorBalance',jsonb_build_object('available',(select coalesce(sum(available_minor),0) from public.creator_money_lots where creator_user_id=w.creator_user_id),
      'pending',(select coalesce(sum(reserved_minor),0) from public.creator_withdrawals where creator_user_id=w.creator_user_id and status in ('pending','eligible','processing')),
      'paid',(select coalesce(sum(submitted_minor),0) from public.creator_withdrawals where creator_user_id=w.creator_user_id and status='paid'),
      'deficit',public.creator_money_deficit(w.creator_user_id)),
    'destination',left(split_part(w.destination_snapshot,'@',1),1)||'***@'||left(split_part(w.destination_snapshot,'@',2),1)||'***',
    'batchId',w.paypal_batch_id,'itemId',w.paypal_item_id,'failureCode',w.failure_code,
    'history',history,'audit',audits,'allocations',allocations);
end $$;

create function public.payout_support_check_begin(p_id uuid,p_attempt uuid,p_source text,p_actor uuid default null,p_submission boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; w public.creator_withdrawals; previous public.payout_support_events;
begin
  if p_source is null or p_source not in ('support','worker','webhook') or p_attempt is null or p_id is null or p_submission is null or (p_submission and p_source<>'worker') then raise exception 'Invalid payout check.'; end if;
  if p_source='support' then r=public.payout_support_actor(p_actor); elsif p_actor is not null then raise exception 'Invalid system actor.'; end if;
  select * into w from public.creator_withdrawals where id=p_id;
  insert into public.payout_support_events(attempt_id,withdrawal_id,actor_user_id,actor_role,source,action,submission,prior_status,resulting_status,outcome,reason)
    values(p_attempt,w.id,p_actor,r,p_source,'check_started',p_submission,w.status,w.status,case when w.id is null then 'not_found' else 'started' end,case when w.id is null then 'not_found' else 'check_started' end)
    on conflict(attempt_id,action) do nothing;
  select * into previous from public.payout_support_events where attempt_id=p_attempt and action='check_started';
  if (previous.withdrawal_id,previous.actor_user_id,previous.source,previous.submission) is distinct from (w.id,p_actor,p_source,p_submission) then raise exception 'Payout check identity mismatch.'; end if;
  return jsonb_build_object('found',w.id is not null,'withdrawal',case when w.id is not null then to_jsonb(w) else null end);
end $$;

create function public.payout_support_check_finish(p_attempt uuid,p_actor uuid,p_batch text,p_item text,p_status text,p_outcome text,p_reason text,p_apply boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare started public.payout_support_events; finished public.payout_support_events; w public.creator_withdrawals; before_status text; r text; result_outcome text; result_reason text;
begin
  select * into started from public.payout_support_events where attempt_id=p_attempt and action='check_started';
  if started.id is null or started.withdrawal_id is null or started.actor_user_id is distinct from p_actor then raise exception 'Payout check unavailable.'; end if;
  if started.source='support' then
    select role into r from public.internal_user_roles where user_id=p_actor for share;
    if r is null or r not in ('support','admin') then
      insert into public.payout_support_events(attempt_id,withdrawal_id,actor_user_id,actor_role,source,action,prior_status,resulting_status,outcome,reason)
        select p_attempt,started.withdrawal_id,p_actor,coalesce(r,'user'),'support','check_finished',w2.status,w2.status,'denied','role_revoked' from public.creator_withdrawals w2 where w2.id=started.withdrawal_id
        on conflict(attempt_id,action) do nothing;
      return jsonb_build_object('denied',true);
    end if;
  end if;
  if p_apply is null or p_outcome is null or p_outcome not in ('paid','processing','definitive_failure','needs_review','provider_unavailable','not_submitted') or p_reason is null
    or (p_status is not null and p_status !~ '^[A-Z_]{1,80}$') then raise exception 'Invalid provider observation.'; end if;
  -- Match the established lock order in worker/webhook/refund accounting.
  select * into w from public.creator_withdrawals where id=started.withdrawal_id;
  perform 1 from public.app_users where id=w.creator_user_id for update;
  select * into w from public.creator_withdrawals where id=started.withdrawal_id for update;
  select * into finished from public.payout_support_events where attempt_id=p_attempt and action='check_finished';
  if finished.id is not null then return jsonb_build_object('denied',false,'status',w.status,'outcome',finished.outcome,'reason',finished.reason); end if;
  before_status=w.status;
  if p_apply then
    -- Human checks can NEVER attach/discover/edit a reference or claim a send.
    if started.source='support' and (w.paypal_batch_id is null or p_batch is distinct from w.paypal_batch_id) then raise exception 'An existing provider reference is required.'; end if;
    if p_batch is null or p_status is null then raise exception 'Verified provider reference required.'; end if;
    perform public.creator_payout_observe(w.id,p_batch,p_item,p_status);
    select * into w from public.creator_withdrawals where id=w.id;
  end if;
  result_outcome=p_outcome; result_reason=p_reason;
  if p_status='SUCCESS' and w.status='paid' then result_outcome='paid';result_reason='provider_success';
  elsif p_status in ('FAILED','DENIED','BLOCKED','CANCELED','RETURNED') and w.status='failed' then result_outcome='definitive_failure';result_reason='provider_failure';
  elsif (w.status='failed' and p_status in ('SUCCESS','PENDING','PROCESSING','ONHOLD','UNCLAIMED')) or (w.status='paid' and p_status is not null and p_status<>'SUCCESS') then result_outcome='needs_review';result_reason='terminal_conflict'; end if;
  if w.status='paid' and (w.provider_status in ('REFUNDED','RETURNED') or exists(select 1 from public.creator_money_events where withdrawal_id=w.id and kind='provider_returned')) then result_outcome='needs_review';result_reason='provider_returned';end if;
  insert into public.payout_support_events(attempt_id,withdrawal_id,actor_user_id,actor_role,source,action,submission,prior_status,observed_status,resulting_status,outcome,reason)
    values(p_attempt,w.id,started.actor_user_id,case when started.source='support' then r else null end,started.source,'check_finished',started.submission,before_status,p_status,w.status,result_outcome,result_reason);
  return jsonb_build_object('denied',false,'status',w.status,'outcome',result_outcome,'reason',result_reason);
end $$;

do $$ declare f record; begin
  for f in select p.proname,p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'payout_support_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname in ('payout_support_queue','payout_support_detail','payout_support_check_begin','payout_support_check_finish') then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end $$;
commit;
