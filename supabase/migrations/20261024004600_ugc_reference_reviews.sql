-- Manual only after 045. Human review/request infrastructure; no asset edits,
-- automatic approvals, job resumes, provider calls or historical data backfill.
begin;
do $$
declare required record; relation_name text;
begin
  for required in select * from (values
    ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),('ugc_generation_jobs','project_id','uuid'),
    ('ugc_generation_jobs','status','text'),('ugc_generation_jobs','stage','text'),('ugc_generation_jobs','resume_stage','text'),
    ('ugc_generation_jobs','pause_reason','text'),('ugc_generation_jobs','attempt_count','integer'),('ugc_generation_jobs','product_attempt_count','integer'),
    ('ugc_generation_jobs','cancellation_requested_at','timestamp with time zone'),('ugc_generation_jobs','worker_id','uuid'),
    ('ugc_generation_jobs','claim_token','uuid'),('ugc_generation_jobs','lease_expires_at','timestamp with time zone'),
    ('ugc_character_sheets','id','uuid'),('ugc_character_sheets','job_id','uuid'),('ugc_character_sheets','owner_user_id','uuid'),
    ('ugc_character_sheets','project_id','uuid'),('ugc_character_sheets','status','text'),('ugc_character_sheets','sheet_version','integer'),
    ('ugc_character_sheets','document','jsonb'),('ugc_product_sheets','id','uuid'),('ugc_product_sheets','job_id','uuid'),
    ('ugc_product_sheets','owner_user_id','uuid'),('ugc_product_sheets','project_id','uuid'),('ugc_product_sheets','status','text'),
    ('ugc_product_sheets','sheet_version','integer'),('ugc_product_sheets','document','jsonb'),
    ('ugc_generation_job_events','job_id','uuid'),('ugc_generation_job_events','status','text'),('ugc_generation_job_events','stage','text'),
    ('ugc_generation_job_events','event_type','text'),('ugc_generation_job_events','safe_message','text'),('ugc_generation_job_events','metadata','jsonb'),
    ('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text'),('app_users','id','uuid')
  ) v(table_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=required.table_name
      and c.column_name=required.column_name and c.data_type=required.data_type) then
      raise exception 'Reference review prerequisite missing or incompatible: %.%',required.table_name,required.column_name;
    end if;
  end loop;
  if to_regprocedure('public.ugc_resume_product_sheet(uuid)') is null or to_regprocedure('public.ugc_prepare_product_sheet(uuid,uuid,text,jsonb)') is null then
    raise exception 'Apply 045 and prerequisites first.'; end if;
  foreach relation_name in array array['ugc_reference_reviews','ugc_reference_regeneration_requests'] loop
    if to_regclass('public.'||relation_name) is not null and obj_description(to_regclass('public.'||relation_name),'pg_class')
      is distinct from 'sceenyk-reference-review-v1-046' then raise exception 'Inspect existing reference review relation: %',relation_name; end if;
  end loop;
end; $$;

create table if not exists public.ugc_reference_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  project_id uuid not null,
  job_id uuid not null references public.ugc_generation_jobs(id) on delete restrict,
  reference_type text not null check(reference_type in ('character','product')),
  character_sheet_id uuid references public.ugc_character_sheets(id) on delete restrict,
  product_sheet_id uuid references public.ugc_product_sheets(id) on delete restrict,
  sheet_version integer not null check(sheet_version=1),
  version integer not null default 1 check(version between 1 and 1000000),
  composed_version integer not null default 1 check(composed_version between 1 and version),
  composed_asset jsonb check(composed_asset is null or jsonb_typeof(composed_asset)='object'),
  approved_at timestamptz, approved_by uuid references public.app_users(id) on delete restrict, approved_version integer,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  unique(job_id,reference_type),
  foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict,
  check((reference_type='character' and character_sheet_id is not null and product_sheet_id is null) or
    (reference_type='product' and product_sheet_id is not null and character_sheet_id is null)),
  check((approved_at is null and approved_by is null and approved_version is null) or
    (approved_at is not null and approved_by is not null and approved_version is not null and approved_by=owner_user_id and approved_version=version and version=composed_version)),
  check(composed_version=1 or composed_asset is not null)
);
comment on table public.ugc_reference_reviews is 'sceenyk-reference-review-v1-046';
create table if not exists public.ugc_reference_regeneration_requests (
  id uuid primary key,
  review_id uuid not null references public.ugc_reference_reviews(id) on delete restrict,
  view text not null check(view in ('front','back','face','primary','angle','detail')),
  requested_version integer not null check(requested_version between 2 and 1000000),
  previous_asset_id uuid not null,
  requested_by uuid not null references public.app_users(id) on delete restrict,
  state text not null default 'regeneration_requested' check(state in ('regeneration_requested','regenerating','completed','failed')),
  replacement_asset jsonb check(replacement_asset is null or jsonb_typeof(replacement_asset)='object'),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  unique(review_id,view,requested_version),
  check(state<>'completed' or replacement_asset is not null)
);
comment on table public.ugc_reference_regeneration_requests is 'sceenyk-reference-review-v1-046';
create unique index if not exists ugc_reference_pending_view on public.ugc_reference_regeneration_requests(review_id,view) where state<>'completed';
alter table public.ugc_reference_reviews enable row level security;
alter table public.ugc_reference_regeneration_requests enable row level security;
revoke all on table public.ugc_reference_reviews,public.ugc_reference_regeneration_requests from public,anon,authenticated,service_role;
grant select on table public.ugc_reference_reviews,public.ugc_reference_regeneration_requests to service_role;

create or replace function public.ugc_guard_reference_review() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Reference review history is retained.' using errcode='23514'; end if;
  if (to_jsonb(new)-array['version','composed_version','composed_asset','approved_at','approved_by','approved_version','updated_at']) is distinct from
    (to_jsonb(old)-array['version','composed_version','composed_asset','approved_at','approved_by','approved_version','updated_at'])
    or new.version<old.version or new.version>old.version+1 or new.composed_version<old.composed_version
    or (new.composed_asset is distinct from old.composed_asset and new.composed_version=old.composed_version) then
    raise exception 'Immutable reference review identity/version history.' using errcode='23514'; end if;
  new.updated_at:=clock_timestamp(); return new;
end; $$;
drop trigger if exists ugc_reference_review_identity on public.ugc_reference_reviews;
create trigger ugc_reference_review_identity before update or delete on public.ugc_reference_reviews for each row execute function public.ugc_guard_reference_review();
create or replace function public.ugc_guard_regeneration_request() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Reference replacement history is retained.' using errcode='23514'; end if;
  if (to_jsonb(new)-array['state','replacement_asset','updated_at']) is distinct from (to_jsonb(old)-array['state','replacement_asset','updated_at']) or old.state='completed'
    or (new.replacement_asset is distinct from old.replacement_asset and new.state<>'completed')
    or not ((old.state='regeneration_requested' and new.state in ('regenerating','failed')) or
      (old.state='regenerating' and new.state in ('failed','completed')) or (old.state='failed' and new.state='regenerating')) then
    raise exception 'Invalid reference replacement transition.' using errcode='23514'; end if;
  new.updated_at:=clock_timestamp(); return new;
end; $$;
drop trigger if exists ugc_reference_request_identity on public.ugc_reference_regeneration_requests;
create trigger ugc_reference_request_identity before update or delete on public.ugc_reference_regeneration_requests for each row execute function public.ugc_guard_regeneration_request();

alter table public.ugc_generation_job_events drop constraint if exists ugc_generation_job_events_event_type_check;
alter table public.ugc_generation_job_events add constraint ugc_generation_job_events_event_type_check check(event_type in (
  'enqueued','claimed','stage_changed','failed','completed','cancelled','cancellation_requested','retry_scheduled','released',
  'inputs_validated','development_paused','development_resumed','reference_analyzed','character_progress','character_ready',
  'character_reference.started','character_reference.soul_id_ready','character_reference.front_generating','character_reference.front_ready',
  'character_reference.back_generating','character_reference.back_ready','character_reference.face_generating','character_reference.face_ready',
  'character_reference.composing','character_reference.complete','product_reference.started','product_reference.primary_generating',
  'product_reference.primary_ready','product_reference.angle_generating','product_reference.angle_ready',
  'product_reference.detail_generating','product_reference.detail_ready','product_reference.composing','product_reference.complete',
  'reference_approved','reference_regeneration_requested'));

create or replace function public.ugc_review_sheet(p_job_id uuid,p_reference_type text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sheet jsonb;
begin
  if p_reference_type='character' then select to_jsonb(s) into sheet from public.ugc_character_sheets s where job_id=p_job_id;
  elsif p_reference_type='product' then select to_jsonb(s) into sheet from public.ugc_product_sheets s where job_id=p_job_id;
  else return null; end if;
  return sheet;
end; $$;

-- Called only while holding the job lock. Missing historical review rows do not
-- change assets or imply approval; the first explicit action creates its root.
create or replace function public.ugc_ensure_reference_review(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid,p_reference_type text,p_sheet_id uuid)
returns public.ugc_reference_reviews language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; r public.ugc_reference_reviews; sheet jsonb;
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id and owner_user_id=p_owner_user_id and project_id=p_project_id for update;
  if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null or not exists(
    select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return null; end if;
  sheet:=public.ugc_review_sheet(j.id,p_reference_type);
  if sheet is null or (sheet->>'id')::uuid is distinct from p_sheet_id or (sheet->>'owner_user_id')::uuid is distinct from j.owner_user_id
    or (sheet->>'project_id')::uuid is distinct from j.project_id or sheet->>'sheet_version' is distinct from '1' then return null; end if;
  insert into public.ugc_reference_reviews(owner_user_id,project_id,job_id,reference_type,character_sheet_id,product_sheet_id,sheet_version)
    values(j.owner_user_id,j.project_id,j.id,p_reference_type,case when p_reference_type='character' then p_sheet_id end,
      case when p_reference_type='product' then p_sheet_id end,1) on conflict(job_id,reference_type) do nothing;
  select * into r from public.ugc_reference_reviews where job_id=j.id and reference_type=p_reference_type for update;
  if r.owner_user_id is distinct from j.owner_user_id or r.project_id is distinct from j.project_id or
    coalesce(r.character_sheet_id,r.product_sheet_id) is distinct from p_sheet_id then return null; end if;
  return r;
end; $$;

create or replace function public.ugc_reference_group_approved(p_job_id uuid,p_reference_type text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare r public.ugc_reference_reviews; j public.ugc_generation_jobs; sheet jsonb; views text[];
begin
  select * into j from public.ugc_generation_jobs where id=p_job_id;
  if not found or not exists(select 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft') then return false; end if;
  select * into r from public.ugc_reference_reviews where job_id=j.id and reference_type=p_reference_type
    and owner_user_id=j.owner_user_id and project_id=j.project_id;
  if not found or r.approved_at is null or r.approved_by is distinct from j.owner_user_id or r.approved_version is distinct from r.version
    or r.version<>r.composed_version or exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed') then return false; end if;
  sheet:=public.ugc_review_sheet(j.id,p_reference_type);
  views:=case p_reference_type when 'character' then array['front','back','face','sheet'] when 'product' then array['primary','angle','detail','sheet'] end;
  return coalesce(sheet->>'status'='completed' and (sheet->>'id')::uuid=coalesce(r.character_sheet_id,r.product_sheet_id)
    and (sheet->>'sheet_version')::integer=r.sheet_version and sheet->'document'->'assets' ?& views,false);
end; $$;
create or replace function public.ugc_location_references_approved(p_job_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.ugc_reference_group_approved(p_job_id,'character') and public.ugc_reference_group_approved(p_job_id,'product');
$$;

create or replace function public.ugc_approve_reference(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid,p_reference_type text,p_expected_version integer,p_sheet_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.ugc_reference_reviews; j public.ugc_generation_jobs; sheet jsonb; views text[];
begin
  r:=public.ugc_ensure_reference_review(p_owner_user_id,p_project_id,p_job_id,p_reference_type,p_sheet_id);
  if r.id is null or r.version is distinct from p_expected_version or r.version<>r.composed_version
    or exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed') then return false; end if;
  sheet:=public.ugc_review_sheet(p_job_id,p_reference_type);
  views:=case p_reference_type when 'character' then array['front','back','face','sheet'] when 'product' then array['primary','angle','detail','sheet'] end;
  if sheet->>'status' is distinct from 'completed' or not coalesce(sheet->'document'->'assets' ?& views,false) then return false; end if;
  if r.approved_at is not null and r.approved_version=r.version then return true; end if;
  update public.ugc_reference_reviews set approved_at=clock_timestamp(),approved_by=p_owner_user_id,approved_version=r.version where id=r.id;
  select * into j from public.ugc_generation_jobs where id=p_job_id;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(j.id,j.status,j.stage,'reference_approved',case when p_reference_type='character' then 'Character reference approved.' else 'Product reference approved.' end,
      jsonb_build_object('referenceType',p_reference_type,'approvedVersion',r.version,'approvedBy',p_owner_user_id));
  return true;
end; $$;

create or replace function public.ugc_request_reference_regeneration(p_owner_user_id uuid,p_project_id uuid,p_job_id uuid,p_reference_type text,
  p_view text,p_expected_version integer,p_sheet_id uuid,p_request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.ugc_reference_reviews; j public.ugc_generation_jobs; sheet jsonb; asset jsonb; existing public.ugc_reference_regeneration_requests;
begin
  r:=public.ugc_ensure_reference_review(p_owner_user_id,p_project_id,p_job_id,p_reference_type,p_sheet_id);
  if r.id is null or p_request_id is null or p_view is null or not ((p_reference_type='character' and p_view in ('front','back','face')) or
    (p_reference_type='product' and p_view in ('primary','angle','detail'))) then return false; end if;
  select * into existing from public.ugc_reference_regeneration_requests where id=p_request_id;
  if found then return existing.review_id=r.id and existing.view=p_view and existing.requested_by=p_owner_user_id; end if;
  if r.version is distinct from p_expected_version or r.version>=1000000 then return false; end if;
  if exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and view=p_view and state<>'completed') then return true; end if;
  sheet:=public.ugc_review_sheet(p_job_id,p_reference_type);
  if not coalesce(sheet->'document'->'assets' ? p_view,false) then return false; end if;
  select replacement_asset into asset from public.ugc_reference_regeneration_requests where review_id=r.id and view=p_view and state='completed'
    order by requested_version desc limit 1;
  asset:=coalesce(asset,sheet->'document'->'assets'->p_view);
  update public.ugc_reference_reviews set version=version+1,approved_at=null,approved_by=null,approved_version=null where id=r.id returning * into r;
  insert into public.ugc_reference_regeneration_requests(id,review_id,view,requested_version,previous_asset_id,requested_by)
    values(p_request_id,r.id,p_view,r.version,(asset->>'id')::uuid,p_owner_user_id);
  select * into j from public.ugc_generation_jobs where id=p_job_id;
  insert into public.ugc_generation_job_events(job_id,status,stage,event_type,safe_message,metadata)
    values(j.id,j.status,j.stage,'reference_regeneration_requested',case when p_reference_type='character' then 'Character view regeneration requested. Character Sheet needs rebuilding.'
      else 'Product view regeneration requested. Product Sheet needs rebuilding.' end,
      jsonb_build_object('referenceType',p_reference_type,'view',p_view,'requestedVersion',r.version));
  return true;
end; $$;

-- Fence both old and future entry points. Reviews share the job lock with claims
-- and reject mutations during active work, so approval/request vs claim is atomic.
create or replace function public.ugc_reference_claim_gate() returns trigger
language plpgsql security definer set search_path='' as $$
declare blocked boolean;
begin
  if new.status='running' and (old.status<>'running' or new.stage is distinct from old.stage) and new.stage in ('character_reference','product_reference') then
    blocked:=exists(select 1 from public.ugc_reference_reviews r where r.job_id=new.id and (r.version<>r.composed_version or exists(
      select 1 from public.ugc_reference_regeneration_requests q where q.review_id=r.id and q.state<>'completed')));
    if new.stage='product_reference' then blocked:=blocked or not public.ugc_reference_group_approved(new.id,'character'); end if;
    if blocked then
      new.status:='queued'; new.resume_stage:=new.stage;
      new.pause_reason:=case new.stage when 'product_reference' then 'PRODUCT_REFERENCE_NOT_IMPLEMENTED' else 'CHARACTER_REFERENCE_NOT_IMPLEMENTED' end;
      new.worker_id:=null; new.claim_token:=null; new.lease_expires_at:=null;
      new.attempt_count:=old.attempt_count; new.product_attempt_count:=old.product_attempt_count;
    end if;
  end if;
  if new.stage is distinct from old.stage and new.stage in ('build_storyboard','build_generation_package','cost_review','awaiting_confirmation','video_generation','finalizing','complete')
    and not public.ugc_location_references_approved(new.id) then
    raise exception 'Character and Product approval is required before downstream work.' using errcode='23514'; end if;
  if new.stage='location_reference' and (new.status<>'queued' or new.pause_reason is distinct from 'LOCATION_REFERENCE_NOT_IMPLEMENTED') then
    raise exception 'Location generation is not implemented.' using errcode='23514'; end if;
  return new;
end; $$;
drop trigger if exists a_ugc_reference_claim_gate on public.ugc_generation_jobs;
create trigger a_ugc_reference_claim_gate before update on public.ugc_generation_jobs for each row execute function public.ugc_reference_claim_gate();

do $$ begin
  if to_regprocedure('public.ugc_resume_product_sheet_m6(uuid)') is null then
    alter function public.ugc_resume_product_sheet(uuid) rename to ugc_resume_product_sheet_m6; end if;
  if to_regprocedure('public.ugc_prepare_product_sheet_m6(uuid,uuid,text,jsonb)') is null then
    alter function public.ugc_prepare_product_sheet(uuid,uuid,text,jsonb) rename to ugc_prepare_product_sheet_m6; end if;
end; $$;
create or replace function public.ugc_resume_product_sheet(p_job_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.ugc_generation_jobs where id=p_job_id for update;
  if not public.ugc_reference_group_approved(p_job_id,'character') or exists(select 1 from public.ugc_reference_reviews r where r.job_id=p_job_id
    and (r.version<>r.composed_version or exists(select 1 from public.ugc_reference_regeneration_requests where review_id=r.id and state<>'completed'))) then return false; end if;
  return public.ugc_resume_product_sheet_m6(p_job_id);
end; $$;
create or replace function public.ugc_prepare_product_sheet(p_job_id uuid,p_claim_token uuid,p_model text,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.ugc_generation_jobs where id=p_job_id for update;
  if not public.ugc_reference_group_approved(p_job_id,'character') then return null; end if;
  return public.ugc_prepare_product_sheet_m6(p_job_id,p_claim_token,p_model,p_document);
end; $$;

revoke all on function public.ugc_guard_reference_review(),public.ugc_guard_regeneration_request(),public.ugc_review_sheet(uuid,text),
  public.ugc_ensure_reference_review(uuid,uuid,uuid,text,uuid),public.ugc_reference_claim_gate(),public.ugc_resume_product_sheet_m6(uuid),
  public.ugc_prepare_product_sheet_m6(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ugc_approve_reference(uuid,uuid,uuid,text,integer,uuid),
  public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid),public.ugc_reference_group_approved(uuid,text),
  public.ugc_location_references_approved(uuid),public.ugc_resume_product_sheet(uuid),public.ugc_prepare_product_sheet(uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.ugc_approve_reference(uuid,uuid,uuid,text,integer,uuid),
  public.ugc_request_reference_regeneration(uuid,uuid,uuid,text,text,integer,uuid,uuid),public.ugc_reference_group_approved(uuid,text),
  public.ugc_location_references_approved(uuid),public.ugc_resume_product_sheet(uuid),public.ugc_prepare_product_sheet(uuid,uuid,text,jsonb) to service_role;
commit;
