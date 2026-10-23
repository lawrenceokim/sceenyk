-- Current selections 5/10/30; retain all historical 15-second rows/snapshots.
begin;
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects'
    and column_name='duration' and data_type='text') or
    to_regprocedure('public.valid_generation_snapshot(jsonb)') is null then
    raise exception 'Apply project and generation prerequisites before duration compatibility.';
  end if;
end; $$;
alter table public.projects drop constraint if exists projects_duration_check;
alter table public.projects add constraint projects_duration_check check(duration in ('5','10','15','30'));

-- Preserve the legacy snapshot contract, adding only the new shared choice.
-- This does not change quotes, reservations, tariffs or provider capabilities.
create or replace function public.valid_generation_snapshot(s jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare a jsonb; settings jsonb;
begin
  if s is null or jsonb_typeof(s)<>'object' then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(s) k) is distinct from array['assetIds','category','prompt','settings','version'] then return false; end if;
  settings:=s->'settings';
  if jsonb_typeof(settings)<>'object' then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(settings) k) is distinct from array['aspectRatio','duration','tone','visualStyle'] then return false; end if;
  if s->'version'<>'1'::jsonb or jsonb_typeof(s->'prompt')<>'string'
    or char_length(btrim(s->>'prompt')) not between 1 and 10000
    or jsonb_typeof(s->'category')<>'string'
    or s->>'category' not in ('transformation','product-ad','cinematic','storytelling','gaming','social')
    or jsonb_typeof(settings->'aspectRatio')<>'string' or settings->>'aspectRatio' not in ('9:16','16:9','1:1')
    or jsonb_typeof(settings->'duration')<>'string' or settings->>'duration' not in ('5','10','15','30')
    or jsonb_typeof(settings->'visualStyle')<>'string' or settings->>'visualStyle' not in ('Original','Cartoon','Cinematic','Anime','Realistic')
    or jsonb_typeof(settings->'tone')<>'string' or settings->>'tone' not in ('Funny','Dramatic','Professional','Energetic','Storytelling')
    or jsonb_typeof(s->'assetIds')<>'array' then return false; end if;
  if jsonb_array_length(s->'assetIds')>256 then return false; end if;
  for a in select value from jsonb_array_elements(s->'assetIds') loop
    if jsonb_typeof(a)<>'string' or (a#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  end loop;
  return (select count(*)=count(distinct value) from jsonb_array_elements(s->'assetIds'));
end;
$$;
revoke all on function public.valid_generation_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.valid_generation_snapshot(jsonb) to service_role;
commit;
