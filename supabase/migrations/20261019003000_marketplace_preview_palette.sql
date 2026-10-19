-- Follow-up to APPLIED migration 029; do not reapply or edit 029.
-- Presentation metadata only. Preserve unique valid assignments and all other
-- listing fields while repairing missing/invalid/duplicate color assignments.
begin;

lock table public.marketplace_listings in share row exclusive mode;

create or replace function public.marketplace_preview_palette() returns text[]
language sql immutable set search_path='' as $$
  select array[
    '#77618f','#637ca0','#8a6ba0','#527f80','#a06f83','#9c825c','#728b72','#627c8a',
    '#796e9e','#587b95','#8d749d','#6a8c82','#a08191','#9a8a73','#858959','#6d8b94',
    '#746b8a','#7a83a0','#8f819e','#557e87','#8d6f7b','#9c7e64','#7e966c','#789194',
    '#7b719b','#6b7eaa','#92768e','#608b86','#9b746d','#a08a7d','#8b966f','#6e8393'
  ]::text[];
$$;
revoke all on function public.marketplace_preview_palette() from public, anon, authenticated;
grant execute on function public.marketplace_preview_palette() to service_role;

alter table public.marketplace_listings drop constraint if exists marketplace_fallback_color_palette;
alter table public.marketplace_listings add constraint marketplace_fallback_color_palette
  check (fallback_color = any(public.marketplace_preview_palette() || array['#59516d','#48596d','#54626a','#675765','#596257','#66616f'])) not valid;

create or replace function public.marketplace_random_preview_color() returns text
language plpgsql volatile security definer set search_path='' as $$
declare palette text[]=public.marketplace_preview_palette(); chosen text;
begin
  -- Serialize just color allocation. Prefer unused colors, then least-used;
  -- avoid the three newest hue families when unused colors allow it.
  perform pg_advisory_xact_lock(hashtextextended('marketplace-preview-color-allocation',0));
  select candidate.color into chosen
  from unnest(palette) with ordinality candidate(color,position)
  order by (select count(*) from public.marketplace_listings l where l.fallback_color=candidate.color), exists (
    select 1 from (
      select fallback_color from public.marketplace_listings
      where fallback_color=any(palette) order by created_at desc,id desc limit 3
    ) recent where (array_position(palette,recent.fallback_color)-1)%8=(candidate.position-1)%8
  ),random()
  limit 1;
  return chosen;
end;
$$;
revoke all on function public.marketplace_random_preview_color() from public, anon, authenticated;
grant execute on function public.marketplace_random_preview_color() to service_role;

-- The normal listing guard still validates immutable fields during repair.
-- This transaction-only trigger restores updated_at after that guard runs,
-- because a preview-color repair must not change the listing's authored date.
create function public.marketplace_preview_backfill_timestamp() returns trigger
language plpgsql set search_path='' as $$
begin new.updated_at=old.updated_at; return new; end;
$$;
revoke all on function public.marketplace_preview_backfill_timestamp() from public, anon, authenticated;
create trigger zz_marketplace_preview_backfill_timestamp before update of fallback_color on public.marketplace_listings
  for each row execute function public.marketplace_preview_backfill_timestamp();

-- Only the presentation color guard is temporarily relaxed under the write
-- lock; ownership/template/financial guards stay enabled throughout.
alter table public.marketplace_listings disable trigger marketplace_preview_color_immutable;
do $$
declare item record;
begin
  for item in
    select id from (
      select id,fallback_color,row_number() over (
        partition by fallback_color order by (status='published') desc,created_at,id
      ) as color_rank from public.marketplace_listings
    ) ranked
    where fallback_color is null
      or not (fallback_color=any(public.marketplace_preview_palette() || array['#59516d','#48596d','#54626a','#675765','#596257','#66616f']))
      -- Repair legacy duplicates once. Valid new assignments are never rotated
      -- by a rerun, including after the finite palette is eventually exhausted.
      or (color_rank>1 and fallback_color=any(array['#59516d','#48596d','#54626a','#675765','#596257','#66616f']))
    order by id
  loop
    update public.marketplace_listings set fallback_color=public.marketplace_random_preview_color() where id=item.id;
  end loop;
end;
$$;
alter table public.marketplace_listings enable trigger marketplace_preview_color_immutable;
drop trigger zz_marketplace_preview_backfill_timestamp on public.marketplace_listings;
drop function public.marketplace_preview_backfill_timestamp();
alter table public.marketplace_listings alter column fallback_color set not null;
alter table public.marketplace_listings validate constraint marketplace_fallback_color_palette;

notify pgrst, 'reload schema';
commit;
