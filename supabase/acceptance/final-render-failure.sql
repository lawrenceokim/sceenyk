-- Run the WHOLE file after migration016. Only pg_temp is written; ROLLBACK
-- removes all fixtures. No provider/R2 requests and no real job is failed.
-- Exact deployed failure/accounting functions execute on temporary table copies.
begin;
set local statement_timeout='30s';
create temporary table generation_jobs (like public.generation_jobs including all) on commit drop;
create temporary table render_jobs (like public.render_jobs including all) on commit drop;
create temporary table final_video_assets (like public.final_video_assets including all) on commit drop;
create temporary table generation_accounts (like public.generation_accounts including all) on commit drop;
create temporary table generation_reservations (like public.generation_reservations including all) on commit drop;
create temporary table generation_result_receipts (like public.generation_result_receipts including all) on commit drop;
create temporary table credit_ledger (like public.credit_ledger including all) on commit drop;
create temporary table render_failure_results(scenario text,state text,passed boolean) on commit drop;
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.fail_render_job(uuid,uuid,text)',
    'public.guard_generation_job()',
    'public.guard_generation_accounting()',
    'public.guard_generation_reservation()',
    'public.settle_generation_reservation()',
    'public.guard_final_render_generation()'
  ] loop
    execute replace(pg_get_functiondef(signature::regprocedure),'public.','pg_temp.');
  end loop;
end;
$$;
create trigger generation_jobs_guard before update on pg_temp.generation_jobs for each row execute function pg_temp.guard_generation_job();
create trigger generation_jobs_accounting_guard before update on pg_temp.generation_jobs for each row execute function pg_temp.guard_generation_accounting();
create trigger generation_jobs_final_render_guard before update on pg_temp.generation_jobs for each row execute function pg_temp.guard_final_render_generation();
create trigger generation_jobs_accounting_settlement after update of status on pg_temp.generation_jobs for each row
when (old.status is distinct from new.status and new.status in ('completed','failed')) execute function pg_temp.settle_generation_reservation();
create trigger generation_reservations_guard before update on pg_temp.generation_reservations for each row execute function pg_temp.guard_generation_reservation();
do $$
declare
  job uuid:=coalesce(nullif(current_setting('sceenyk.acceptance_job',true),''),'aa88b9ac-9542-4138-93b6-e5861a96e1df')::uuid;
  original public.generation_jobs; original_hold public.generation_reservations;
  owner uuid; render uuid; lease uuid; scenario text; successful boolean; before_duplicate jsonb;
begin
  select * into original from public.generation_jobs where id=job and composition_ready_at is not null;
  if not found then raise exception 'Existing ready composition required.'; end if;
  owner:=original.owner_user_id;
  select * into original_hold from public.generation_reservations where job_id=job;
  if not found then raise exception 'Original reservation required.'; end if;
  foreach scenario in array array['free_failure','credits_failure'] loop
    truncate pg_temp.generation_jobs,pg_temp.render_jobs,pg_temp.final_video_assets,pg_temp.generation_accounts,pg_temp.generation_reservations,pg_temp.generation_result_receipts,pg_temp.credit_ledger;
    -- Prepare only local copies before guarded lifecycle begins.
    original.status:='processing';original.current_stage:='rendering';original.completed_at:=null;original.failed_at:=null;original.error_code:=null;original.error_message:=null;
    original_hold.state:='reserved';original_hold.reason:='generation_admission';original_hold.settled_at:=null;
    original_hold.kind:=case when scenario='free_failure' then 'free' else 'credits' end;
    original_hold.amount:=case when scenario='free_failure' then 1 else 10 end;
    insert into pg_temp.generation_jobs select original.*;
    insert into pg_temp.generation_reservations select original_hold.*;
    insert into pg_temp.generation_accounts(owner_user_id,free_reserved,free_consumed,credit_available,credit_reserved)
      values(owner,case when scenario='free_failure' then 1 else 0 end,0,case when scenario='credits_failure' then 90 else 0 end,case when scenario='credits_failure' then 10 else 0 end);
    render:=gen_random_uuid();lease:=gen_random_uuid();
    insert into pg_temp.render_jobs(id,generation_job_id,owner_user_id,project_id,composition_plan_id,composition_digest,status,worker_attempts,lease_id,lease_expires_at,started_at)
      values(render,job,owner,original.project_id,job,'temporary-failure-fixture','dispatched',1,lease,now()+interval '2 minutes',now());
    if not pg_temp.fail_render_job(render,lease,'RENDER_FAILED') then raise exception 'Failure fixture did not settle.'; end if;
    select jsonb_build_object('account',to_jsonb(a),'hold',to_jsonb(h),'job',to_jsonb(j),'render',to_jsonb(r),'ledger',(select jsonb_agg(l order by id) from pg_temp.credit_ledger l))
      into before_duplicate from pg_temp.generation_accounts a,pg_temp.generation_reservations h,pg_temp.generation_jobs j,pg_temp.render_jobs r;
    if not pg_temp.fail_render_job(render,lease,'RENDER_FAILED') then raise exception 'Duplicate failure not idempotent.'; end if;
    select before_duplicate=jsonb_build_object('account',to_jsonb(a),'hold',to_jsonb(h),'job',to_jsonb(j),'render',to_jsonb(r),'ledger',(select jsonb_agg(l order by id) from pg_temp.credit_ledger l))
      and h.state='released' and j.status='failed' and r.status='failed' and a.free_reserved=0 and a.free_consumed=0 and a.credit_reserved=0
      and a.credit_available=case when scenario='credits_failure' then 100 else 0 end
      and (select count(*) from pg_temp.credit_ledger)=case when scenario='credits_failure' then 1 else 0 end
      and not exists(select 1 from pg_temp.final_video_assets) and not exists(select 1 from pg_temp.generation_result_receipts)
      into successful from pg_temp.generation_accounts a,pg_temp.generation_reservations h,pg_temp.generation_jobs j,pg_temp.render_jobs r;
    if successful is not true then raise exception 'Render restoration acceptance failed: %',scenario; end if;
    insert into pg_temp.render_failure_results values(scenario,'released',true);
    raise notice 'Render restoration PASS: %, duplicate unchanged',scenario;
  end loop;
end;
$$;
select scenario,state,passed from pg_temp.render_failure_results order by scenario;
rollback;
