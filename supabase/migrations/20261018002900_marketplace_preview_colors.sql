-- Presentation metadata only. Requires listing/paid-adoption migrations 020–028.
-- Safe to rerun: existing assignments and immutable snapshots are preserved.
begin;

do $$
begin
  if to_regclass('public.marketplace_listings') is null
    or to_regprocedure('public.marketplace_listing_json(public.marketplace_listings)') is null then
    raise exception 'Verified Marketplace schema is required before migration 029.';
  end if;
end;
$$;

create or replace function public.marketplace_random_preview_color() returns text
language sql volatile set search_path='' as $$
  select (array['#59516d','#48596d','#54626a','#675765','#596257','#66616f'])[1 + floor(random() * 6)::integer];
$$;
revoke all on function public.marketplace_random_preview_color() from public, anon, authenticated;
grant execute on function public.marketplace_random_preview_color() to service_role;

alter table public.marketplace_listings add column if not exists fallback_color text;
update public.marketplace_listings set fallback_color=public.marketplace_random_preview_color() where fallback_color is null;
alter table public.marketplace_listings alter column fallback_color set default public.marketplace_random_preview_color();
alter table public.marketplace_listings alter column fallback_color set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_listings'::regclass and conname='marketplace_fallback_color_palette') then
    alter table public.marketplace_listings add constraint marketplace_fallback_color_palette
      check (fallback_color in ('#59516d','#48596d','#54626a','#675765','#596257','#66616f'));
  end if;
end;
$$;

create or replace function public.marketplace_preview_color_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.fallback_color is distinct from old.fallback_color then
    raise exception 'A template preview color is assigned once.';
  end if;
  return new;
end;
$$;
revoke all on function public.marketplace_preview_color_guard() from public, anon, authenticated;
drop trigger if exists marketplace_preview_color_immutable on public.marketplace_listings;
create trigger marketplace_preview_color_immutable before update on public.marketplace_listings
  for each row execute function public.marketplace_preview_color_guard();

-- Preserve the existing public paid-instructions mask. Owned JSON continues
-- to substitute the owner's full configuration through its existing function.
create or replace function public.marketplace_listing_json(l public.marketplace_listings) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'category',l.category,'tags',l.tags,
    'creatorName',l.creator_name,'template',case when l.adoption_type='paid' then jsonb_set(l.template_snapshot,'{instructions}',to_jsonb('Unlock this template to view reusable instructions.'::text)) else l.template_snapshot end,
    'adoptionType',l.adoption_type,'priceMinor',l.price_minor,'currency',l.currency,'status',l.status,
    'createdAt',l.created_at,'publishedAt',l.published_at,'fallbackColor',l.fallback_color);
$$;
revoke all on function public.marketplace_listing_json(public.marketplace_listings) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
