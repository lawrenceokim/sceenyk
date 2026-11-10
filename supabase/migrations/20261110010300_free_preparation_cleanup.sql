-- Preparation usage must outlive disposable reference tasks. Reject/discard
-- cleanup intentionally deletes their image-bearing task/input/output records.
begin;
do $$
declare budget_task smallint; source_id smallint; fk record;
begin
  select attnum into budget_task from pg_attribute
    where attrelid=to_regclass('public.generation_free_preparations') and attname='task_id' and not attisdropped;
  select attnum into source_id from pg_attribute
    where attrelid=to_regclass('public.ugc_v3_tasks') and attname='id' and not attisdropped;
  if budget_task is null or source_id is null or not exists (
    select 1 from pg_trigger where tgrelid=to_regclass('public.generation_free_preparations')
      and tgname='generation_free_preparation_history' and tgenabled='O'
      and tgfoid=to_regprocedure('public.generation_free_history_guard()')) then
    raise exception 'Verify migration 102 preparation history before migration 103.';
  end if;
  -- Drop only the verified task FK. Keep the task UUID primary key as an
  -- immutable usage tombstone, the account FK, history trigger, RLS and grants.
  for fk in select * from pg_constraint where conrelid=to_regclass('public.generation_free_preparations')
    and contype='f' and budget_task=any(conkey)
  loop
    if fk.conkey is distinct from array[budget_task] or fk.confrelid is distinct from to_regclass('public.ugc_v3_tasks')
      or fk.confkey is distinct from array[source_id] or fk.confdeltype<>'r' then
      raise exception 'Inspect unexpected preparation task constraint before migration 103.';
    end if;
    execute format('alter table public.generation_free_preparations drop constraint %I',fk.conname);
  end loop;
end $$;
comment on column public.generation_free_preparations.task_id is
  'Immutable provider-start task UUID; retained after reference cleanup deletes the disposable task. Not a live-task foreign key.';
commit;
