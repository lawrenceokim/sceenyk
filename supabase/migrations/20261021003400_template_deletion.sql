-- Owner-authoritative Template deletion. Keep listing identity/snapshots and
-- financial/adoption references; archive it and remove it from owned galleries.
begin;
do $$
declare required record;
begin
  for required in select * from (values
    ('marketplace_listings','id','uuid'), ('marketplace_listings','creator_user_id','uuid'),
    ('marketplace_listings','status','text'), ('marketplace_listings','created_at','timestamp with time zone')
  ) as prerequisites(relation_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.relation_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Template deletion prerequisite missing or incompatible: %.%',required.relation_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.marketplace_owned_json(public.marketplace_listings)') is null then
    raise exception 'Owned listing serializer is required before Template deletion.';
  end if;
end $$;

alter table public.marketplace_listings add column if not exists deleted_at timestamptz;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.marketplace_listings'::regclass and conname='marketplace_deleted_template_archived') then
    alter table public.marketplace_listings add constraint marketplace_deleted_template_archived check (deleted_at is null or status='archived');
  end if;
end $$;

create or replace function public.delete_owned_template(p_owner_user_id uuid,p_listing_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare listing public.marketplace_listings;
begin
  select * into listing from public.marketplace_listings where id=p_listing_id and creator_user_id=p_owner_user_id for update;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  if listing.deleted_at is null then
    update public.marketplace_listings set status='archived',deleted_at=clock_timestamp()
      where id=p_listing_id and creator_user_id=p_owner_user_id;
  end if;
  return jsonb_build_object('code','DELETED','listingId',p_listing_id);
end $$;

-- Filter before counting/pagination, so a deleted card cannot return on refresh
-- or leave holes in the owned library/management galleries. Ordinary archived
-- listings remain visible, retaining their existing behavior.
create or replace function public.marketplace_owned(p_owner_user_id uuid,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer;
begin
  if p_owner_user_id is null or p_page is null or p_page<1 or p_page>100000 then raise exception 'Invalid owner query.'; end if;
  select count(*) into total from public.marketplace_listings where creator_user_id=p_owner_user_id and deleted_at is null;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into result from (
    select public.marketplace_owned_json(l) as item,l.created_at,l.id
    from public.marketplace_listings l where l.creator_user_id=p_owner_user_id and l.deleted_at is null
      order by l.created_at desc,l.id desc limit 12 offset (p_page-1)*12
  ) rows;
  return jsonb_build_object('items',result,'total',total,'page',p_page,'pageSize',12);
end $$;

revoke all on function public.delete_owned_template(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_owned_template(uuid,uuid) to service_role;
revoke all on function public.marketplace_owned(uuid,integer) from public,anon,authenticated;
grant execute on function public.marketplace_owned(uuid,integer) to service_role;
-- No new table grants, raw delete, cascade, storage removal or history mutation.
notify pgrst,'reload schema';
commit;
