-- Manual after 063/prerequisites. No backfill, paid work or remote execution.
begin;
do $$ declare r record; begin
 for r in select * from (values
  ('ugc_locations','scene','jsonb'),('ugc_locations','dependencies','jsonb'),('ugc_locations','version','integer'),
  ('projects','prompt','text'),('projects','title','text'),('projects','creation_type','text'),('projects','ugc_type','text'),
  ('projects','visual_style','text'),('projects','tone','text'),('projects','duration','text'),('projects','aspect_ratio','text'),
  ('project_assets','reference_name','text'),('project_assets','studio_role','text'),('project_assets','removed_from_draft','boolean'),
  ('project_assets','verified_etag','text'),('project_assets','owner_user_id','uuid'),('project_assets','project_id','uuid'),
  ('ugc_reference_analyses','source_asset_id','uuid'),('ugc_reference_analyses','analysis','jsonb')
 ) v(table_name,column_name,data_type) loop
  if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name
   and c.column_name=r.column_name and c.data_type=r.data_type) then raise exception 'Location auto-plan prerequisite: %.%',r.table_name,r.column_name; end if;
 end loop;
 if to_regprocedure('public.ugc_location_action_pre_auto(uuid,uuid,uuid,integer,text,jsonb)') is null then
  alter function public.ugc_location_action(uuid,uuid,uuid,integer,text,jsonb) rename to ugc_location_action_pre_auto;
 end if;
 if to_regprocedure('public.ugc_location_checkpoint_pre_auto(uuid,uuid,text,jsonb)') is null then
  alter function public.ugc_location_checkpoint(uuid,uuid,text,jsonb) rename to ugc_location_checkpoint_pre_auto;
 end if;
end; $$;

alter table public.ugc_locations add column if not exists revision integer not null default 1 check(revision>0);
alter table public.ugc_locations add column if not exists requested_at timestamptz;
alter table public.ugc_locations add column if not exists image_settings jsonb;
alter table public.ugc_locations add column if not exists next_location_id uuid references public.ugc_locations(id) on delete restrict;
alter table public.ugc_locations drop constraint if exists ugc_locations_job_id_location_index_key;
create unique index if not exists ugc_locations_revision on public.ugc_locations(job_id,location_index,revision);

-- Database-owned saved inputs. Replaced/detached source images must first obtain
-- their own Character/Product approval workflow; never silently reuse old approvals.
create or replace function public.ugc_location_scene(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.ugc_generation_jobs; p public.projects; c public.project_assets; d public.project_assets; observations jsonb;
begin
 select * into j from public.ugc_generation_jobs where id=p_job;
 if not found then return null; end if;
 select * into p from public.projects where id=j.project_id and owner_user_id=j.owner_user_id and status='draft';
 if not found or p.creation_type<>'ugc' or length(btrim(p.prompt))=0 then return null; end if;
 select * into c from public.project_assets where id=(j.input_snapshot->'character'->>'assetId')::uuid
  and owner_user_id=j.owner_user_id and project_id=j.project_id and studio_role='character' and not removed_from_draft and upload_status='uploaded';
 if not found or c.verified_etag is distinct from j.input_snapshot->'character'->>'etag' then return null; end if;
 select * into d from public.project_assets where id=(j.input_snapshot->'product'->>'assetId')::uuid
  and owner_user_id=j.owner_user_id and project_id=j.project_id and studio_role='product' and not removed_from_draft and upload_status='uploaded';
 if not found or d.verified_etag is distinct from j.input_snapshot->'product'->>'etag' then return null; end if;
 select jsonb_object_agg(analysis_type,analysis) into observations from public.ugc_reference_analyses
  where job_id=j.id and project_id=j.project_id and owner_user_id=j.owner_user_id and state='completed'
   and ((analysis_type='character' and source_asset_id=c.id) or (analysis_type='product' and source_asset_id=d.id));
 return j.input_snapshot || jsonb_build_object('projectTitle',p.title,'creationType',p.creation_type,'ugcType',p.ugc_type,
  'sceneDescription',p.prompt,'settings',jsonb_build_object('visualStyle',p.visual_style,'tone',p.tone,'duration',p.duration,'aspectRatio',p.aspect_ratio),
  'character',(j.input_snapshot->'character')||jsonb_build_object('name',coalesce(nullif(btrim(c.reference_name),''),j.input_snapshot->'character'->>'name')),
  'product',(j.input_snapshot->'product')||jsonb_build_object('name',coalesce(nullif(btrim(d.reference_name),''),j.input_snapshot->'product'->>'name')),
  'referenceDetails',coalesce(observations,'{}'::jsonb));
end; $$;
create or replace function public.ugc_location_scene_matches(p_saved jsonb,p_current jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_saved=p_current or (not (p_saved ? 'referenceDetails') and p_saved=p_current-'referenceDetails'),false);
$$;
create or replace function public.ugc_location_settings_valid(s jsonb,scene jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(s->>'provider'='openai' and s->>'model' in ('gpt-image-2.5-sunburst','gpt-image-2.5-flare')
  and s->>'size'=(case scene->'settings'->>'aspectRatio' when '9:16' then '864x1536' when '16:9' then '1536x864' when '1:1' then '1024x1024' end)
  and s->>'n'='1' and s->>'quality'='medium' and s->>'output_format'='png' and s->>'background'='opaque',false);
$$;

create or replace function public.ugc_location_claim(p_worker uuid) returns public.ugc_locations
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations; candidate record;
begin
 if p_worker is null then return null; end if;
 -- No automatic root creation. Legacy unrequested plans wait for Generate Location.
 for candidate in select q.id,q.job_id from public.ugc_locations q
  where q.state in ('queued_plan','queued_image','running_plan','running_image','rejecting')
   and (q.state<>'queued_plan' or q.requested_at is not null)
   and (q.claim_token is null or q.lease_expires_at<=clock_timestamp())
   and not exists(select 1 from public.ugc_locations prior where prior.next_location_id=q.id and prior.state='rejecting')
  order by q.created_at loop
  select * into j from public.ugc_generation_jobs where id=candidate.job_id for update skip locked;
  if not found then continue; end if;
  select * into l from public.ugc_locations where id=candidate.id for update skip locked;
  if not found or l.state not in ('queued_plan','queued_image','running_plan','running_image','rejecting')
   or (l.claim_token is not null and l.lease_expires_at>clock_timestamp()) then continue; end if;
  if l.state<>'rejecting' and (j.status in ('cancelled','completed') or j.cancellation_requested_at is not null
   or public.ugc_location_dependencies(j.id) is distinct from l.dependencies) then
   update public.ugc_locations set state='failed',phase='failed',error_code='LOCATION_DEPENDENCIES_CHANGED',claim_token=null,
    lease_expires_at=null,updated_at=clock_timestamp() where id=l.id; continue;
  end if;
  update public.ugc_locations set state=case l.state when 'queued_plan' then 'running_plan' when 'queued_image' then 'running_image' else l.state end,
   worker_id=p_worker,claim_token=gen_random_uuid(),heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds',
   updated_at=clock_timestamp() where id=l.id returning * into l;
  return l;
 end loop;
 return null;
end; $$;

create or replace function public.ugc_location_action(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_action text,p_payload jsonb default '{}')
returns public.ugc_locations language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations; next_root public.ugc_locations;
 scene jsonb; dependencies jsonb; same_context boolean; s jsonb; safe_resume boolean;
begin
 select * into j from public.ugc_generation_jobs where id=p_job and project_id=p_project and owner_user_id=p_owner for update;
 if not found or j.status not in ('queued','failed') or j.cancellation_requested_at is not null then return null; end if;
 perform 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft' for update;
 if not found then return null; end if;
 select * into l from public.ugc_locations where job_id=j.id and location_index=1 order by revision desc limit 1 for update;
 if (l.id is null and p_version<>0) or (l.id is not null and (l.version<>p_version or l.id::text is distinct from p_payload->>'locationId'
  or l.owner_user_id<>p_owner or l.project_id<>p_project)) then return null; end if;
 scene:=public.ugc_location_scene(j.id); dependencies:=public.ugc_location_dependencies(j.id); s:=p_payload->'settings';
 same_context:=dependencies is not null and dependencies=l.dependencies and public.ugc_location_scene_matches(l.scene,scene);
 safe_resume:=l.state='failed' and ((l.candidate_id is null and l.plan_intent is null) or exists(
  select 1 from public.ugc_location_candidates where id=l.candidate_id and location_id=l.id and state='pending' and intent is null));
 if p_action='generate' then
  if scene is null or dependencies is null or j.stage<>'location_reference' or not public.ugc_location_settings_valid(s,scene) then return null; end if;
  if l.id is not null then
   -- A duplicate delivery cannot enqueue another paid plan/image.
   if l.state in ('running_plan','queued_image','running_image','rejecting') or (l.state='queued_plan' and l.requested_at is not null) then return l; end if;
   if (l.state not in ('queued_plan','plan_review','approved') and not safe_resume) or (l.state='approved' and same_context) then return null; end if;
   if same_context and l.state<>'approved' and public.ugc_location_plan_valid(l.plan) then
    l:=public.ugc_location_action_pre_auto(p_owner,p_project,p_job,p_version,'generate',jsonb_build_object('plan',l.plan,'settings',s));
    if l.id is null then return null; end if;
    update public.ugc_locations set requested_at=clock_timestamp(),image_settings=s where id=l.id returning * into l;
    return l;
   end if;
   if same_context and l.plan_intent is null and l.state='queued_plan' then
    update public.ugc_locations set requested_at=clock_timestamp(),image_settings=s,version=version+1,updated_at=clock_timestamp() where id=l.id returning * into l;
    return l;
   end if;
  end if;
  insert into public.ugc_locations(job_id,owner_user_id,project_id,revision,dependencies,scene,requested_at,image_settings)
   values(j.id,p_owner,p_project,coalesce(l.revision,0)+1,dependencies,scene,clock_timestamp(),s) returning * into l;
  return l;
 elsif p_action='reject' then
  if l.state is distinct from 'image_review' then return null; end if;
  -- A changed saved scene or approved reference version requires a fresh plan.
  if scene is not null and dependencies is not null and not same_context and not public.ugc_location_settings_valid(s,scene) then return null; end if;
  l:=public.ugc_location_action_pre_auto(p_owner,p_project,p_job,p_version,'reject','{}');
  if l.id is null then raise exception 'Location changed during rejection.'; end if;
  if scene is not null and dependencies is not null and not same_context then
   insert into public.ugc_locations(job_id,owner_user_id,project_id,revision,dependencies,scene,requested_at,image_settings)
    values(j.id,p_owner,p_project,l.revision+1,dependencies,scene,clock_timestamp(),s) returning * into next_root;
   update public.ugc_locations set next_location_id=next_root.id where id=l.id;
   return next_root;
  end if;
  return l;
 elsif p_action='accept' then
  if not same_context then return null; end if;
 elsif p_action='resume' and safe_resume then
  if not same_context then return public.ugc_location_action(p_owner,p_project,p_job,p_version,'generate',p_payload); end if;
  if l.candidate_id is null then
   if not public.ugc_location_settings_valid(s,l.scene) then return null; end if;
   l:=public.ugc_location_action_pre_auto(p_owner,p_project,p_job,p_version,'resume','{}');
   if l.id is null then return null; end if;
   update public.ugc_locations set requested_at=coalesce(requested_at,clock_timestamp()),image_settings=coalesce(image_settings,s) where id=l.id returning * into l;
   return l;
  end if;
 elsif p_action not in ('retry_saving','resume') then return null;
 end if;
 return public.ugc_location_action_pre_auto(p_owner,p_project,p_job,p_version,p_action,'{}');
end; $$;

do $$ declare body text;
 old_fragment text:='where job_id=j.id and location_index=1 for update;';
 new_fragment text:='where job_id=j.id and location_index=1 order by revision desc limit 1 for update;';
begin
 select prosrc into body from pg_proc where oid='public.ugc_location_action_pre_auto(uuid,uuid,uuid,integer,text,jsonb)'::regprocedure;
 if strpos(body,new_fragment)=0 then
  if strpos(body,old_fragment)=0 then raise exception 'Unexpected Location action; inspect before migration.'; end if;
  body:=replace(body,old_fragment,new_fragment);
  execute 'create or replace function public.ugc_location_action_pre_auto(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_action text,p_payload jsonb default ''{}'') returns public.ugc_locations language plpgsql security definer set search_path='''' as '||quote_literal(body);
 end if;
end; $$;

-- Retain the existing intent/storage/recovery guards. Only suppress the old
-- same-root regeneration when an explicitly requested new revision waits on cleanup.
do $$ declare body text; old_fragment text:='if j.status=''queued'' and j.cancellation_requested_at is null and public.ugc_location_dependencies(j.id)=l.dependencies then';
 new_fragment text:='if l.next_location_id is null and j.status=''queued'' and j.cancellation_requested_at is null and public.ugc_location_dependencies(j.id)=l.dependencies then';
begin
 select prosrc into body from pg_proc where oid='public.ugc_location_checkpoint_pre_auto(uuid,uuid,text,jsonb)'::regprocedure;
 if strpos(body,new_fragment)=0 then
  if strpos(body,old_fragment)=0 then raise exception 'Unexpected Location checkpoint; inspect before migration.'; end if;
  body:=replace(body,old_fragment,new_fragment);
  execute 'create or replace function public.ugc_location_checkpoint_pre_auto(p_location uuid,p_token uuid,p_operation text,p_payload jsonb default ''{}'') returns public.ugc_locations language plpgsql security definer set search_path='''' as '||quote_literal(body);
 end if;
end; $$;
create or replace function public.ugc_location_checkpoint(p_location uuid,p_token uuid,p_operation text,p_payload jsonb default '{}')
returns public.ugc_locations language plpgsql security definer set search_path='' as $$
declare l public.ugc_locations; c public.ugc_location_candidates;
begin
 select * into l from public.ugc_locations where id=p_location;
 if p_operation='plan_ready' and l.requested_at is not null and not public.ugc_location_settings_valid(l.image_settings,l.scene) then return null; end if;
 l:=public.ugc_location_checkpoint_pre_auto(p_location,p_token,p_operation,p_payload);
 if l.id is null then return null; end if;
 if p_operation='plan_ready' and l.state='plan_review' and l.requested_at is not null then
  insert into public.ugc_location_candidates(location_id,plan,settings) values(l.id,l.plan,l.image_settings) returning * into c;
  update public.ugc_locations set state='queued_image',phase='generating',candidate_id=c.id,version=version+1,updated_at=clock_timestamp()
   where id=l.id returning * into l;
 end if;
 return l;
end; $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('ugc_location_scene','ugc_location_scene_matches','ugc_location_settings_valid',
   'ugc_location_claim','ugc_location_action','ugc_location_action_pre_auto','ugc_location_checkpoint','ugc_location_checkpoint_pre_auto') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname not like '%_pre_auto' then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end; $$;
commit;
