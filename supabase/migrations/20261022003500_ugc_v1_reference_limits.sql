-- UGC V1: one active image per Character/Product slot. Preserve legacy extras,
-- storage, ownership, history and Freestyle. No data backfill or deletion.
begin;

do $$
declare required record;
begin
  for required in select * from (values
    ('projects','id','uuid'), ('projects','owner_user_id','uuid'), ('projects','status','text'),
    ('project_assets','id','uuid'), ('project_assets','project_id','uuid'),
    ('project_assets','owner_user_id','uuid'), ('project_assets','studio_role','text'),
    ('project_assets','reference_id','uuid'), ('project_assets','removed_from_draft','boolean'),
    ('project_assets','upload_request_id','uuid'), ('project_assets','upload_status','text')
  ) as prerequisites(relation_name,column_name,data_type)
  loop
    if not exists (select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.relation_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'UGC V1 prerequisite missing or incompatible: %.%', required.relation_name, required.column_name;
    end if;
  end loop;
end;
$$;

create or replace function public.guard_ugc_v1_reference_limit() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.studio_role='freestyle' or new.removed_from_draft then return new; end if;
  if tg_op='UPDATE' then
    -- Allow ordinary unchanged historical rows; detaching always remains possible.
    if old.studio_role=new.studio_role and old.project_id=new.project_id
      and old.owner_user_id=new.owner_user_id and old.reference_id is not distinct from new.reference_id
      and not old.removed_from_draft and old.upload_status=new.upload_status then return new; end if;
  end if;

  -- Run before the existing visibility/FK guards acquire shared project locks.
  -- Under the application's READ COMMITTED transactions this serializes slot
  -- checks across concurrent inserts/finalizations, including different roles.
  perform 1 from public.projects where id=new.project_id and owner_user_id=new.owner_user_id
    and status='draft' for update;
  if not found then raise exception 'Project is unavailable.' using errcode='23503'; end if;

  if exists(select 1 from public.project_assets a where a.project_id=new.project_id
    and a.owner_user_id=new.owner_user_id and a.studio_role=new.studio_role
    and not a.removed_from_draft and a.id<>new.id
    -- Same-request insert races still reach the existing idempotency constraint.
    and (tg_op<>'INSERT' or a.upload_request_id<>new.upload_request_id)) then
    if new.studio_role='character' then
      raise exception 'UGC V1 supports one character. Remove extra characters to continue.'
        using errcode='23514', constraint='project_assets_ugc_v1_limit';
    else
      raise exception 'UGC V1 supports one product / prop. Remove extra products / props to continue.'
        using errcode='23514', constraint='project_assets_ugc_v1_limit';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_ugc_v1_reference_limit() from public,anon,authenticated;
grant execute on function public.guard_ugc_v1_reference_limit() to service_role;
drop trigger if exists a_ugc_v1_reference_limit on public.project_assets;
create trigger a_ugc_v1_reference_limit before insert or update on public.project_assets
  for each row execute function public.guard_ugc_v1_reference_limit();
commit;
