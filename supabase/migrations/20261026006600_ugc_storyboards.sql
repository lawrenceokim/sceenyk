-- Milestone 8. Manual after corrected 065 and prerequisites. No data backfill/execution.
begin;
do $$ declare r record; relation_name text; begin
 for r in select * from (values
  ('ugc_generation_jobs','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),('ugc_generation_jobs','project_id','uuid'),
  ('ugc_generation_jobs','status','text'),('ugc_generation_jobs','stage','text'),('ugc_generation_jobs','cancellation_requested_at','timestamp with time zone'),
  ('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text'),
  ('ugc_locations','revision','integer'),('ugc_locations','version','integer'),('ugc_locations','plan','jsonb'),
  ('ugc_locations','dependencies','jsonb'),('ugc_locations','scene','jsonb'),('ugc_locations','accepted_candidate_id','uuid'),
  ('ugc_locations','state','text'),('ugc_locations','approved_at','timestamp with time zone'),
  ('ugc_location_candidates','artifact','jsonb'),('ugc_location_candidates','state','text'),
  ('ugc_character_v5_workflows','sheet','jsonb'),('ugc_character_v5_workflows','version','integer'),
  ('ugc_reference_reviews','composed_asset','jsonb'),('ugc_reference_reviews','composed_version','integer'),
  ('ugc_character_sheets','document','jsonb'),('ugc_product_sheets','document','jsonb')
 ) v(table_name,column_name,data_type) loop
  if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name
   and c.column_name=r.column_name and c.data_type=r.data_type) then raise exception 'Storyboard prerequisite: %.%',r.table_name,r.column_name; end if;
 end loop;
 if to_regprocedure('public.ugc_location_scene(uuid)') is null or to_regprocedure('public.ugc_location_dependencies(uuid)') is null
  or to_regprocedure('public.ugc_location_cleanup_claim(uuid,uuid,uuid,uuid,integer)') is null then raise exception 'Apply corrected 065 and prerequisites first.'; end if;
 foreach relation_name in array array['ugc_storyboards','ugc_storyboard_events'] loop
  if to_regclass('public.'||relation_name) is not null and obj_description(to_regclass('public.'||relation_name),'pg_class')
   is distinct from 'sceenyk-ugc-storyboard-v1-066' then raise exception 'Inspect existing storyboard relation: %',relation_name; end if;
 end loop;
end; $$;

create table if not exists public.ugc_storyboards (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.ugc_generation_jobs(id) on delete restrict,
 owner_user_id uuid not null references public.app_users(id) on delete restrict, project_id uuid not null,
 revision integer not null check(revision>0), version integer not null default 1 check(version>0),
 state text not null default 'queued' check(state in ('queued','running','review','approved','failed','deleting','deleted')),
 phase text not null default 'preparing' check(phase in ('preparing','generating','repairing','saving','review','approved','failed','deleting','deleted')),
 input jsonb not null check(jsonb_typeof(input)='object'), document jsonb,
 model text, requests jsonb not null default '[]' check(jsonb_typeof(requests)='array' and jsonb_array_length(requests)<=2),
 attempts integer not null default 0 check(attempts between 0 and 3), error_code text, approved_at timestamptz,
 worker_id uuid, claim_token uuid, heartbeat_at timestamptz, lease_expires_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(job_id,revision), foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id) on delete restrict,
 check((state='approved')=(approved_at is not null)),
 check(state not in ('review','approved') or document is not null), check(state<>'deleted' or (document is null and requests='[]'))
);
create unique index if not exists ugc_storyboards_one_live on public.ugc_storyboards(job_id) where state<>'deleted';
create table if not exists public.ugc_storyboard_events (
 id bigint generated always as identity primary key, storyboard_id uuid not null references public.ugc_storyboards(id) on delete restrict,
 version integer not null, state text not null, phase text not null, created_at timestamptz not null default clock_timestamp()
);
comment on table public.ugc_storyboards is 'sceenyk-ugc-storyboard-v1-066';
comment on table public.ugc_storyboard_events is 'sceenyk-ugc-storyboard-v1-066';
alter table public.ugc_storyboards enable row level security;
alter table public.ugc_storyboard_events enable row level security;
revoke all on public.ugc_storyboards,public.ugc_storyboard_events from public,anon,authenticated,service_role;
grant select on public.ugc_storyboards,public.ugc_storyboard_events to service_role;

-- Read-only current context. Approval helper already verifies current reference
-- versions, composed versions and no outstanding upstream replacement requests.
create or replace function public.ugc_storyboard_input(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.ugc_generation_jobs; l public.ugc_locations; c public.ugc_location_candidates;
 scene jsonb; deps jsonb; character_asset jsonb; product_asset jsonb; wardrobe jsonb;
begin
 select * into j from public.ugc_generation_jobs where id=p_job;
 if not found or j.status not in ('queued','failed') or j.stage<>'location_reference' or j.cancellation_requested_at is not null then return null; end if;
 deps:=public.ugc_location_dependencies(j.id); scene:=public.ugc_location_scene(j.id);
 if deps is null or scene is null or scene->'settings'->>'duration' not in ('5','10','30') then return null; end if;
 if coalesce(length(btrim(scene->'character'->>'name')),0) not between 1 and 80
  or coalesce(length(btrim(scene->'product'->>'name')),0) not between 1 and 80 then return null; end if;
 select * into l from public.ugc_locations where job_id=j.id and owner_user_id=j.owner_user_id and project_id=j.project_id
  and location_index=1 order by revision desc limit 1;
 if not found or l.state<>'approved' or l.dependencies is distinct from deps or not public.ugc_location_scene_matches(l.scene,scene) then return null; end if;
 select * into c from public.ugc_location_candidates where id=l.accepted_candidate_id and location_id=l.id and state='accepted';
 if not found or c.artifact is null then return null; end if;
 select sheet into character_asset from public.ugc_character_v5_workflows where job_id=j.id and state='approved' and approved_at is not null;
 if character_asset is null then
  select case when r.composed_version>1 then r.composed_asset else s.document->'assets'->'sheet' end,s.document->'wardrobe'
   into character_asset,wardrobe from public.ugc_reference_reviews r join public.ugc_character_sheets s on s.id=r.character_sheet_id
   where r.job_id=j.id and r.reference_type='character';
 end if;
 select case when r.composed_version>1 then r.composed_asset else s.document->'assets'->'sheet' end into product_asset
  from public.ugc_reference_reviews r join public.ugc_product_sheets s on s.id=r.product_sheet_id where r.job_id=j.id and r.reference_type='product';
 if character_asset->>'id' is null or product_asset->>'id' is null or c.artifact->>'id' is null then return null; end if;
 return jsonb_build_object('scene',scene,'dependencies',deps||jsonb_build_object('locationId',l.id,'locationVersion',l.version,'locationCandidateId',c.id),
  'character',character_asset,'product',product_asset,'location',c.artifact,'locationPlan',l.plan,'wardrobe',wardrobe);
end; $$;

-- Consistent lock order shared by commands/claim/checkpoint. Never mutate upstream.
create or replace function public.ugc_storyboard_lock(p_job uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; begin
 select * into j from public.ugc_generation_jobs where id=p_job for update;
 perform 1 from public.projects where id=j.project_id and owner_user_id=j.owner_user_id for update;
 perform 1 from public.ugc_character_v5_workflows where job_id=j.id for share;
 perform 1 from public.ugc_reference_reviews where job_id=j.id order by reference_type for share;
 perform 1 from public.ugc_locations where job_id=j.id order by revision for share;
end; $$;

-- Defense in depth for timing/bindings. The server also applies the complete
-- strict Zod schema, speech pace/character budget and sequential action checks.
create or replace function public.ugc_storyboard_valid(d jsonb,i jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb; a jsonb; v jsonb; n integer:=0; finish integer:=0; previous integer; seconds numeric; rate numeric; total integer; k text;
begin
 total:=(i->'scene'->'settings'->>'duration')::integer*1000;
 if total not in (5000,10000,30000) or d->>'schemaVersion' is distinct from '1' or (d->>'durationMs')::integer is distinct from total
  or d->>'aspectRatio' is distinct from i->'scene'->'settings'->>'aspectRatio'
  or d->>'visualStyle' is distinct from i->'scene'->'settings'->>'visualStyle' or d->>'tone' is distinct from i->'scene'->'settings'->>'tone'
  or d->'voice'->>'characterAssetId' is distinct from i->'character'->>'id'
  or jsonb_typeof(d->'scenes') is distinct from 'array' or jsonb_array_length(d->'scenes') not between 1 and 10 then return false; end if;
 rate:=case d->'voice'->>'pace' when 'slow' then 1.8 when 'natural' then 2.3 when 'energetic' then 2.7 else 0 end;
 if rate=0 then return false; end if;
 for s in select value from jsonb_array_elements(d->'scenes') loop
  n:=n+1;
  if (s->>'number')::integer is distinct from n or (s->>'startMs')::integer is distinct from finish
   or (s->>'endMs')::integer<=finish or (s->>'endMs')::integer>total
   or s->>'characterAssetId' is distinct from i->'character'->>'id' or s->>'productAssetId' is distinct from i->'product'->>'id'
   or s->>'locationAssetId' is distinct from i->'location'->>'id' then return false; end if;
  foreach k in array array['purpose','description','productInteraction','productPosition','transition','generationPrompt'] loop
   if jsonb_typeof(s->k) is distinct from 'string' or length(btrim(s->>k))=0 then return false; end if;
  end loop;
  foreach k in array array['character','product','location'] loop
   if position('asset:'||(i->k->>'id') in (s->>'generationPrompt'))=0 then return false; end if;
  end loop;
  if jsonb_typeof(s->'camera') is distinct from 'object' or not(s->'camera' ?& array['angle','shot','framing','movement','zoom','focus'])
   or jsonb_typeof(s->'lighting') is distinct from 'object' or not(s->'lighting' ?& array['direction','intensity','colors','atmosphere'])
   or jsonb_typeof(s->'audio') is distinct from 'object' or not(s->'audio' ?& array['background','effects','music'])
   or jsonb_typeof(s->'actions') is distinct from 'array' or jsonb_array_length(s->'actions') not between 1 and 8
   or jsonb_typeof(s->'speech') is distinct from 'array' or jsonb_array_length(s->'speech')>8 then return false; end if;
  previous:=finish;
  for a in select value from jsonb_array_elements(s->'actions') loop
   if (a->>'startMs')::integer<previous or (a->>'endMs')::integer-(a->>'startMs')::integer<700
    or (a->>'endMs')::integer>(s->>'endMs')::integer or not(a ?& array['movement','gesture','expression']) then return false; end if;
   previous:=(a->>'endMs')::integer;
  end loop;
  previous:=finish;
  for v in select value from jsonb_array_elements(s->'speech') loop
   seconds:=((v->>'endMs')::numeric-(v->>'startMs')::numeric)/1000;
   if seconds<=0 or (v->>'startMs')::integer<previous or (v->>'endMs')::integer>(s->>'endMs')::integer
    or v->>'characterAssetId' is distinct from i->'character'->>'id' or v->>'speaker' not in ('character','narration')
    or length(btrim(coalesce(v->>'text','')))=0 or cardinality(regexp_split_to_array(btrim(v->>'text'),'\s+'))>floor(seconds*rate)
    or length(regexp_replace(v->>'text','\s','','g'))>floor(seconds*16) then return false; end if;
   previous:=(v->>'endMs')::integer;
  end loop;
  finish:=(s->>'endMs')::integer;
 end loop;
 return coalesce(finish=total,false);
exception when others then return false;
end; $$;

create or replace function public.ugc_storyboard_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id,new.job_id,new.owner_user_id,new.project_id,new.revision,new.input,new.created_at)
  is distinct from (old.id,old.job_id,old.owner_user_id,old.project_id,old.revision,old.input,old.created_at) then raise exception 'Immutable storyboard provenance.'; end if;
 if tg_op='INSERT' or (new.state,new.phase,new.version) is distinct from (old.state,old.phase,old.version) then
  insert into public.ugc_storyboard_events(storyboard_id,version,state,phase) values(new.id,new.version,new.state,new.phase);
 end if;
 return new;
end; $$;
drop trigger if exists ugc_storyboard_audit on public.ugc_storyboards;
create trigger ugc_storyboard_audit after insert or update on public.ugc_storyboards for each row execute function public.ugc_storyboard_audit();

create or replace function public.ugc_storyboard_action(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_action text,p_payload jsonb default '{}')
returns public.ugc_storyboards language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; b public.ugc_storyboards; current_input jsonb; begin
 perform public.ugc_storyboard_lock(p_job);
 select * into j from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project;
 if not found or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 select * into b from public.ugc_storyboards where job_id=p_job order by revision desc limit 1 for update;
 if (b.id is null and p_version<>0) or (b.id is not null and (b.version<>p_version or b.id::text is distinct from p_payload->>'storyboardId')) then return null; end if;
 if b.claim_token is not null and b.lease_expires_at>clock_timestamp() then return null; end if;
 current_input:=public.ugc_storyboard_input(p_job);
 if p_action='generate' and (b.id is null or b.state='deleted') and current_input is not null then
  insert into public.ugc_storyboards(job_id,owner_user_id,project_id,revision,input)
   values(p_job,p_owner,p_project,coalesce(b.revision,0)+1,current_input) returning * into b;
 elsif p_action='reject' and b.state in ('queued','running','review','approved','failed') then
  update public.ugc_storyboards set state='deleting',phase='deleting',document=null,requests='[]',approved_at=null,error_code=null,
   claim_token=null,lease_expires_at=null,version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 elsif p_action='retry' and b.state='deleting' and b.error_code is not null then
  update public.ugc_storyboards set error_code=null,claim_token=null,lease_expires_at=null,
   version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 elsif p_action='retry' and b.state='failed' and b.attempts<3 and current_input=b.input then
  -- Never clears paid intents. The worker must recover output or stop uncertain.
  update public.ugc_storyboards set state='queued',phase='preparing',error_code=null,claim_token=null,lease_expires_at=null,
   version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 elsif p_action in ('save','accept') and b.state in ('review','approved') and current_input=b.input then
  if not public.ugc_storyboard_valid(case when p_action='save' then p_payload->'document' else b.document end,b.input) then return null; end if;
  update public.ugc_storyboards set document=case when p_action='save' then p_payload->'document' else document end,
   state=case when p_action='accept' then 'approved' else 'review' end,phase=case when p_action='accept' then 'approved' else 'review' end,
   approved_at=case when p_action='accept' then clock_timestamp() else null end,version=version+1,updated_at=clock_timestamp()
   where id=b.id returning * into b;
 else return null; end if;
 return b; -- Parent remains paused; no package/credit/provider operation.
end; $$;

create or replace function public.ugc_storyboard_claim(p_worker uuid) returns public.ugc_storyboards
language plpgsql security definer set search_path='' as $$
declare candidate record; b public.ugc_storyboards; j public.ugc_generation_jobs; begin
 if p_worker is null then return null; end if;
 for candidate in select id,job_id from public.ugc_storyboards where state in ('queued','running','deleting') and error_code is null
  and (claim_token is null or lease_expires_at<=clock_timestamp()) order by created_at loop
  select * into j from public.ugc_generation_jobs where id=candidate.job_id for update skip locked;
  if not found then continue; end if;
  perform public.ugc_storyboard_lock(j.id);
  select * into b from public.ugc_storyboards where id=candidate.id for update skip locked;
  if not found or b.state not in ('queued','running','deleting') or b.error_code is not null or b.claim_token is not null and b.lease_expires_at>clock_timestamp() then continue; end if;
  if b.state<>'deleting' and (b.attempts>=3 or public.ugc_storyboard_input(j.id) is distinct from b.input) then
   update public.ugc_storyboards set state='failed',phase='failed',error_code=case when b.attempts>=3 then 'STORYBOARD_RECOVERY_EXHAUSTED' else 'STORYBOARD_INPUT_CHANGED' end,
    claim_token=null,lease_expires_at=null,version=version+1,updated_at=clock_timestamp() where id=b.id;
   continue;
  end if;
  update public.ugc_storyboards set state=case when state='deleting' then 'deleting' else 'running' end,
   attempts=case when state='deleting' then attempts else attempts+1 end,worker_id=p_worker,claim_token=gen_random_uuid(),
   heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where id=b.id returning * into b;
  return b;
 end loop;
 return null;
end; $$;

create or replace function public.ugc_storyboard_checkpoint(p_storyboard uuid,p_token uuid,p_operation text,p_payload jsonb default '{}')
returns public.ugc_storyboards language plpgsql security definer set search_path='' as $$
declare b public.ugc_storyboards; job uuid; count_requests integer; begin
 select job_id into job from public.ugc_storyboards where id=p_storyboard;
 perform public.ugc_storyboard_lock(job);
 select * into b from public.ugc_storyboards where id=p_storyboard for update;
 if not found or p_token is null or b.claim_token is distinct from p_token or b.lease_expires_at<=clock_timestamp()
  or b.state not in ('running','deleting') then return null; end if;
 -- Save paid responses/failures even if inputs changed mid-request. Ready/intent
 -- still require current approvals; no output can be approved with stale inputs.
 if p_operation in ('intent','ready') and public.ugc_storyboard_input(b.job_id) is distinct from b.input then return null; end if;
 count_requests:=jsonb_array_length(b.requests);
 if p_operation='heartbeat' then null;
 elsif p_operation='intent' and b.state='running' and count_requests<2 then
  if coalesce(p_payload->>'model','') !~ '^[a-zA-Z0-9._:-]{1,200}$' or (b.model is not null and b.model<>p_payload->>'model')
   or p_payload->>'provider' is distinct from 'openai' or p_payload->>'promptVersion' is distinct from 'ugc-storyboard-v1'
   or p_payload->>'contractVersion' is distinct from '1' or p_payload->>'maxOutputTokens' is distinct from '14000'
   or (count_requests>0 and not(b.requests->(count_requests-1) ? 'output')) then return null; end if;
  b.model:=p_payload->>'model'; b.requests:=b.requests||jsonb_build_array(jsonb_build_object('model',b.model,'provider','openai',
   'promptVersion','ugc-storyboard-v1','contractVersion',1,'maxOutputTokens',14000));
  b.phase:=case when count_requests=0 then 'generating' else 'repairing' end;
 elsif p_operation='response' and b.state='running' and count_requests>0 then
  if b.requests->(count_requests-1) ? 'output' or (p_payload->>'index')::integer is distinct from count_requests-1
   or jsonb_typeof(p_payload->'output') is distinct from 'string' or octet_length(p_payload->>'output')>250000 then return null; end if;
  b.requests:=jsonb_set(b.requests,array[(count_requests-1)::text],(b.requests->(count_requests-1))||jsonb_build_object('output',p_payload->'output','receipt',p_payload->'receipt'));
  b.phase:='saving';
 elsif p_operation='ready' and b.state='running' then
  if not public.ugc_storyboard_valid(p_payload->'document',b.input) then return null; end if;
  b.document:=p_payload->'document'; b.state:='review'; b.phase:='review'; b.error_code:=null;
 elsif p_operation='deleted' and b.state='deleting' then b.state:='deleted'; b.phase:='deleted'; b.error_code:=null;
 elsif p_operation='fail' then
  if b.state<>'deleting' then b.state:='failed'; b.phase:='failed'; end if;
  b.error_code:=case when p_payload->>'code' in ('STORYBOARD_CONFIG_INVALID','STORYBOARD_RECONCILIATION_REQUIRED','STORYBOARD_OUTPUT_INVALID',
   'STORYBOARD_INPUT_CHANGED','STORYBOARD_STORAGE_FAILED','STORYBOARD_ASSET_UNAVAILABLE') then p_payload->>'code' else 'STORYBOARD_FAILED' end;
 else return null; end if;
 update public.ugc_storyboards set state=b.state,phase=b.phase,document=b.document,model=b.model,requests=b.requests,error_code=b.error_code,
  version=version+case when p_operation='heartbeat' then 0 else 1 end,updated_at=case when p_operation='heartbeat' then updated_at else clock_timestamp() end,
  heartbeat_at=clock_timestamp(),lease_expires_at=case when b.state='running' or b.state='deleting' and p_operation<>'fail' then clock_timestamp()+interval '90 seconds' else null end,
  claim_token=case when b.state='running' or b.state='deleting' and p_operation<>'fail' then p_token else null end
  where id=b.id returning * into b;
 return b;
end; $$;

-- Helpers are private; browser roles cannot execute any storyboard function.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('ugc_storyboard_input','ugc_storyboard_lock','ugc_storyboard_valid','ugc_storyboard_audit',
   'ugc_storyboard_action','ugc_storyboard_claim','ugc_storyboard_checkpoint') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('ugc_storyboard_input','ugc_storyboard_action','ugc_storyboard_claim','ugc_storyboard_checkpoint') then
   execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end; $$;
commit;
