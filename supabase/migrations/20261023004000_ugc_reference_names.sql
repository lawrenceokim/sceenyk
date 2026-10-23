-- Focused prerequisite between M4 and M5. Apply manually after 039.
-- No media rename/backfill, job rewrite, analysis replay or financial change.
begin;
do $$
declare required record;
begin
  for required in select * from (values
    ('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text'),
    ('projects','title','text'),('projects','prompt','text'),('projects','creation_type','text'),
    ('projects','ugc_type','text'),('projects','duration','text'),('projects','aspect_ratio','text'),
    ('projects','visual_style','text'),('projects','tone','text'),
    ('project_assets','id','uuid'),('project_assets','project_id','uuid'),('project_assets','owner_user_id','uuid'),
    ('project_assets','studio_role','text'),('project_assets','reference_id','uuid'),
    ('project_assets','removed_from_draft','boolean'),('project_assets','upload_status','text'),
    ('project_assets','media_type','text'),('project_assets','storage_provider','text'),
    ('project_assets','mime_type','text'),('project_assets','size_bytes','bigint'),('project_assets','verified_etag','text')
  ) v(table_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Reference name prerequisite missing or incompatible: %.%',required.table_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.ugc_finish_references(uuid,uuid)') is null
    or to_regprocedure('public.ugc_normalize_input_text(text)') is null
    or to_regprocedure('public.ugc_snapshot_matches_records(uuid,uuid,jsonb,boolean)') is null then
    raise exception 'Apply UGC migrations through 039 first.';
  end if;
end; $$;

alter table public.project_assets add column if not exists reference_name text;
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='project_assets'
    and column_name='reference_name' and data_type='text') then
    raise exception 'Inspect incompatible reference_name column before continuing.';
  end if;
end; $$;
alter table public.project_assets drop constraint if exists project_assets_reference_name_check;
alter table public.project_assets add constraint project_assets_reference_name_check check(reference_name is null or (
  studio_role in ('character','product') and not removed_from_draft and upload_status='uploaded' and media_type='image'
  and char_length(reference_name) between 1 and 80));

create or replace function public.ugc_normalize_reference_name() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.removed_from_draft or new.studio_role not in ('character','product') then new.reference_name:=null;
  else new.reference_name:=nullif(public.ugc_normalize_input_text(new.reference_name),''); end if;
  return new;
end; $$;
drop trigger if exists ugc_reference_name_normalization on public.project_assets;
create trigger ugc_reference_name_normalization before insert or update on public.project_assets
  for each row execute function public.ugc_normalize_reference_name();

-- Only the authenticated existing Save service calls this with its derived owner.
-- The entire supplied name batch is checked/locked before any name changes.
create or replace function public.ugc_save_reference_names(p_owner_user_id uuid,p_project_id uuid,p_names jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare item jsonb; asset_id uuid;
begin
  if p_names is null or jsonb_typeof(p_names) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_names)>256 then return false; end if;
  if (select count(*)<>count(distinct value->>'assetId') from jsonb_array_elements(p_names)) then return false; end if;
  perform 1 from public.projects where id=p_project_id and owner_user_id=p_owner_user_id and status='draft' for update;
  if not found then return false; end if;
  for item in select value from jsonb_array_elements(p_names) order by value->>'assetId' loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if (select array_agg(k order by k) from jsonb_object_keys(item) k) is distinct from array['assetId','name'] then return false; end if;
    if jsonb_typeof(item->'assetId') is distinct from 'string' or jsonb_typeof(item->'name') is distinct from 'string' then return false; end if;
    if char_length(public.ugc_normalize_input_text(item->>'name'))>80 then return false; end if;
    asset_id:=(item->>'assetId')::uuid;
    perform 1 from public.project_assets where id=asset_id and project_id=p_project_id and owner_user_id=p_owner_user_id
      and studio_role in ('character','product') and not removed_from_draft and upload_status='uploaded' and media_type='image' for update;
    if not found then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_names) loop
    update public.project_assets set reference_name=nullif(public.ugc_normalize_input_text(item->>'name'),'')
      where id=(item->>'assetId')::uuid and project_id=p_project_id and owner_user_id=p_owner_user_id;
  end loop;
  return true;
exception when invalid_text_representation then return false;
end; $$;

-- New enqueue requires named v3 inputs. Existing v2 snapshots retain their
-- original shape, and frozen v3 names do not track later Project name edits.
create or replace function public.ugc_snapshot_matches_records(p_owner uuid,p_project uuid,p_snapshot jsonb,p_match_brief boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.projects; c public.project_assets; r public.project_assets; expected jsonb;
  character_ref jsonb; product_ref jsonb; named boolean; role text; label text;
begin
  if p_snapshot is null or p_snapshot->'schemaVersion' is null or p_snapshot->'schemaVersion' not in ('2'::jsonb,'3'::jsonb)
    or p_snapshot->>'readiness' is distinct from 'validated' or p_snapshot->>'projectId' is distinct from p_project::text then return false; end if;
  named:=p_snapshot->'schemaVersion'='3'::jsonb;
  if p_match_brief and not named then return false; end if;
  if named then
    foreach role in array array['character','product'] loop
      if jsonb_typeof(p_snapshot->role->'name') is distinct from 'string' then return false; end if;
      label:=p_snapshot->role->>'name';
      if char_length(label) not between 1 and 80 or label<>public.ugc_normalize_input_text(label) then return false; end if;
    end loop;
  end if;
  select * into p from public.projects where id=p_project and owner_user_id=p_owner and status='draft' for share;
  if not found then return false; end if;
  select * into c from public.project_assets where id=(p_snapshot->'character'->>'assetId')::uuid
    and project_id=p_project and owner_user_id=p_owner and studio_role='character' and not removed_from_draft
    and upload_status='uploaded' and media_type='image' and storage_provider='r2' and verified_etag is not null for share;
  if not found then return false; end if;
  select * into r from public.project_assets where id=(p_snapshot->'product'->>'assetId')::uuid
    and project_id=p_project and owner_user_id=p_owner and studio_role='product' and not removed_from_draft
    and upload_status='uploaded' and media_type='image' and storage_provider='r2' and verified_etag is not null for share;
  if not found or c.id=r.id then return false; end if;
  if p_match_brief then
    if p.creation_type<>'ugc' or char_length(public.ugc_normalize_input_text(p.title))=0 or char_length(public.ugc_normalize_input_text(p.prompt))=0
      or c.reference_name is null or r.reference_name is null then return false; end if;
    if (select count(*) from public.project_assets where project_id=p_project and owner_user_id=p_owner
        and studio_role='character' and not removed_from_draft)<>1 or
      (select count(*) from public.project_assets where project_id=p_project and owner_user_id=p_owner
        and studio_role='product' and not removed_from_draft)<>1 then return false; end if;
    expected:=jsonb_build_object('schemaVersion',3,'readiness','validated','projectId',p_project,'projectTitle',public.ugc_normalize_input_text(p.title),
      'creationType',p.creation_type,'ugcType',p.ugc_type,'sceneDescription',public.ugc_normalize_input_text(p.prompt),
      'settings',jsonb_build_object('duration',p.duration,'aspectRatio',p.aspect_ratio,'visualStyle',p.visual_style,'tone',p.tone),
      'narration',jsonb_build_object('mode','prompt'));
  else
    expected:=p_snapshot-'character'-'product';
  end if;
  character_ref:=jsonb_build_object('assetId',c.id,'referenceId',c.reference_id,'mimeType',c.mime_type,'sizeBytes',c.size_bytes,'etag',c.verified_etag);
  product_ref:=jsonb_build_object('assetId',r.id,'referenceId',r.reference_id,'mimeType',r.mime_type,'sizeBytes',r.size_bytes,'etag',r.verified_etag);
  if named then
    character_ref:=character_ref||jsonb_build_object('name',case when p_match_brief then c.reference_name else p_snapshot->'character'->>'name' end);
    product_ref:=product_ref||jsonb_build_object('name',case when p_match_brief then r.reference_name else p_snapshot->'product'->>'name' end);
  end if;
  expected:=expected||jsonb_build_object('character',character_ref,'product',product_ref);
  return coalesce(expected=p_snapshot,false);
exception when invalid_text_representation then return false;
end; $$;

-- Keep existing browser denial/RLS and narrow media update grants unchanged.
-- No direct service UPDATE privilege is added for the new name column.
revoke all on function public.ugc_normalize_reference_name(),public.ugc_save_reference_names(uuid,uuid,jsonb),
  public.ugc_snapshot_matches_records(uuid,uuid,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ugc_save_reference_names(uuid,uuid,jsonb) to service_role;
commit;
