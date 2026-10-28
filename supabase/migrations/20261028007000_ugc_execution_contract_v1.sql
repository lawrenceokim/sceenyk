-- Manual after 069. Schema-2 execution contracts; no provider/job/data repair.
begin;
do $$ declare r record; begin
 for r in select * from (values
  ('ugc_storyboards','id','uuid'),('ugc_storyboards','job_id','uuid'),('ugc_storyboards','owner_user_id','uuid'),('ugc_storyboards','project_id','uuid'),
  ('ugc_storyboards','revision','integer'),('ugc_storyboards','version','integer'),('ugc_storyboards','state','text'),('ugc_storyboards','phase','text'),
  ('ugc_storyboards','input','jsonb'),('ugc_storyboards','document','jsonb'),('ugc_storyboards','approved_at','timestamp with time zone'),
  ('ugc_storyboards','requests','jsonb'),('ugc_storyboards','claim_token','uuid'),('ugc_storyboards','lease_expires_at','timestamp with time zone'),
  ('ugc_generation_packages','input','jsonb'),('ugc_generation_packages','document','jsonb'),('ugc_generation_packages','state','text'),
  ('ugc_final_executions','package_id','uuid'),('ugc_generation_jobs','id','uuid'),('app_users','id','uuid'),('ugc_generation_jobs','owner_user_id','uuid'),('ugc_generation_jobs','project_id','uuid'),
  ('projects','id','uuid'),('projects','owner_user_id','uuid'),('projects','status','text')
 ) v(t,c,typ) loop
  if not exists(select 1 from information_schema.columns x where x.table_schema='public' and x.table_name=r.t and x.column_name=r.c and x.data_type=r.typ)
   then raise exception '070 prerequisite: %.%',r.t,r.c; end if;
 end loop;
 if to_regprocedure('public.ugc_final_current(uuid)') is null or to_regprocedure('public.ugc_package_valid(jsonb,jsonb,integer,text)') is null
  or to_regprocedure('public.ugc_storyboard_valid(jsonb,jsonb)') is null or to_regprocedure('public.ugc_storyboard_lock(uuid)') is null
  or to_regprocedure('public.ugc_storyboard_input(uuid)') is null or to_regprocedure('public.ugc_package_input(uuid)') is null
  or to_regprocedure('public.ugc_package_digest(text,jsonb)') is null or to_regprocedure('public.ugc_reject_event_mutation()') is null
  or to_regprocedure('public.ugc_storyboard_checkpoint(uuid,uuid,text,jsonb)') is null
  or to_regprocedure('public.ugc_package_action(uuid,uuid,uuid,integer,text,jsonb)') is null
  then raise exception 'Apply 069 and prerequisites first'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_storyboards'
  and column_name in ('repair_source_id','repair_request_id') and data_type<>'uuid') then raise exception 'Inspect existing repair column types'; end if;
 if to_regclass('public.ugc_storyboard_versions') is not null and obj_description(to_regclass('public.ugc_storyboard_versions'),'pg_class') is distinct from 'sceenyk-execution-history-070'
  then raise exception 'Inspect existing storyboard version relation'; end if;
end $$;

-- Snapshot the exact installed legacy readers once; never replace them on rerun.
do $$ declare name text; signature text; copy_name text; definition text; begin
 foreach name in array array['ugc_storyboard_valid','ugc_package_valid','ugc_final_current'] loop
  signature:=case name when 'ugc_storyboard_valid' then '(jsonb,jsonb)' when 'ugc_package_valid' then '(jsonb,jsonb,integer,text)' else '(uuid)' end;
  copy_name:=name||'_legacy_070';
  if to_regprocedure('public.'||copy_name||signature) is null then
   select pg_get_functiondef(to_regprocedure('public.'||name||signature)) into definition;
   definition:=replace(definition,'FUNCTION public.'||name||'(','FUNCTION public.'||copy_name||'(');
   execute definition;
   execute format('comment on function public.%I%s is %L',copy_name,signature,'sceenyk-legacy-reader-070');
  elsif obj_description(to_regprocedure('public.'||copy_name||signature),'pg_proc') is distinct from 'sceenyk-legacy-reader-070' then
   raise exception 'Inspect existing legacy helper: %',copy_name;
  end if;
 end loop;
end $$;

create or replace function public.ugc_execution_keys(v jsonb,keys text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and v ?& keys and not exists(select 1 from jsonb_object_keys(v) k where not(k=any(keys))),false);
$$;
create or replace function public.ugc_execution_v1_valid(d jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare s jsonb; t jsonb; line jsonb; cue jsonb; n integer:=0; finish integer:=0; overlap integer:=0; total integer; dur integer; td integer; role text; speech_finish integer:=0;
begin
 total:=(d->>'durationMs')::integer;
 if d->'schemaVersion' is distinct from '2'::jsonb or jsonb_typeof(d->'durationMs') is distinct from 'number'
  or jsonb_typeof(d->'voice'->'description') is distinct from 'string' or length(d->'voice'->>'description') not between 20 and 700 or total not in (5000,10000,30000) or jsonb_typeof(d->'scenes') is distinct from 'array'
  or jsonb_array_length(d->'scenes') not between 1 and 10 then return false; end if;
 for s in select value from jsonb_array_elements(d->'scenes') loop
  n:=n+1; dur:=(s->>'endMs')::integer-(s->>'startMs')::integer; t:=s->'transition'; td:=(t->>'durationMs')::integer;
  if jsonb_typeof(s->'number') is distinct from 'number' or jsonb_typeof(s->'startMs') is distinct from 'number' or jsonb_typeof(s->'endMs') is distinct from 'number'
   or (s->>'number')::integer is distinct from n or (s->>'startMs')::integer is distinct from finish-overlap or dur not between 4000 and 30000 or dur%1000<>0
   or (s->>'endMs')::integer>total or not public.ugc_execution_keys(t,array['type','durationMs'])
   or jsonb_typeof(t->'type') is distinct from 'string' or t->>'type' not in ('none','cut','crossfade','fade_in','fade_out') or td not between 0 and 2000
   or jsonb_typeof(t->'durationMs')<>'number' or t->>'durationMs' !~ '^[0-9]+$'
   or (t->>'type' in ('none','cut') and td<>0) or (t->>'type' not in ('none','cut') and (td=0 or td%40<>0 or td>=dur))
   or overlap>=dur or jsonb_typeof(s->'transitionNote') is distinct from 'string' then return false; end if;
  if not public.ugc_execution_keys(s->'audio',array['background','effects','music']) then return false; end if;
  foreach role in array array['background','effects','music'] loop
   cue:=s->'audio'->role;
   if not public.ugc_execution_keys(cue,array['requirement','description','assetId']) or jsonb_typeof(cue->'requirement') is distinct from 'string' or cue->>'requirement' not in ('none','optional')
    or cue->'assetId' is distinct from 'null'::jsonb or jsonb_typeof(cue->'description') is distinct from 'string' or length(cue->>'description')>2000 then return false; end if;
  end loop;
  if jsonb_typeof(s->'speech') is distinct from 'array' then return false; end if;
  for line in select value from jsonb_array_elements(s->'speech') loop
   if jsonb_typeof(line->'startMs') is distinct from 'number' or jsonb_typeof(line->'endMs') is distinct from 'number'
    or jsonb_typeof(line->'speaker') is distinct from 'string' or line->>'speaker' not in ('character','narration')
    or not public.ugc_execution_keys(line->'delivery',array['pace','energy','tone','emphasis','style'])
    or exists(select 1 from jsonb_each(line->'delivery') entry where jsonb_typeof(entry.value) is distinct from 'string')
    or line->'delivery'->>'pace' not in ('slow','natural','energetic') or line->'delivery'->>'energy' not in ('calm','balanced','lively')
    or line->'delivery'->>'tone' not in ('neutral','warm','confident') or line->'delivery'->>'emphasis' not in ('none','light')
    or line->'delivery'->>'style' not in ('natural','conversational','expressive') or jsonb_typeof(line->'deliveryNote') is distinct from 'string'
    or (line->>'startMs')::integer<speech_finish then return false; end if;
   if line->>'speaker'='character' and dur>10000 then return false; end if;
   speech_finish:=(line->>'endMs')::integer;
  end loop;
  finish:=(s->>'endMs')::integer; overlap:=case when t->>'type'='crossfade' then td else 0 end;
 end loop;
 return coalesce(finish=total and overlap=0,false);
exception when others then return false;
end $$;

alter table public.ugc_storyboards add column if not exists repair_source_id uuid references public.ugc_storyboards(id);
alter table public.ugc_storyboards add column if not exists repair_request_id uuid;
create unique index if not exists ugc_storyboard_repair_request on public.ugc_storyboards(owner_user_id,repair_request_id) where repair_request_id is not null;
drop index if exists public.ugc_storyboards_one_live;
create unique index ugc_storyboards_one_live on public.ugc_storyboards(job_id) where state not in ('deleted','approved');
create table if not exists public.ugc_storyboard_versions (
 storyboard_id uuid not null references public.ugc_storyboards(id), version integer not null,
 owner_user_id uuid not null references public.app_users(id), project_id uuid not null, job_id uuid not null references public.ugc_generation_jobs(id),
 document jsonb not null, state text not null, approved_at timestamptz, captured_at timestamptz not null default clock_timestamp(),
 primary key(storyboard_id,version), foreign key(project_id,owner_user_id) references public.projects(id,owner_user_id)
);
comment on table public.ugc_storyboard_versions is 'sceenyk-execution-history-070';
alter table public.ugc_storyboard_versions enable row level security;
revoke all on public.ugc_storyboard_versions from public,anon,authenticated,service_role;
grant select on public.ugc_storyboard_versions to service_role;
drop trigger if exists ugc_storyboard_versions_immutable on public.ugc_storyboard_versions;
create trigger ugc_storyboard_versions_immutable before update or delete on public.ugc_storyboard_versions for each row execute function public.ugc_reject_event_mutation();
insert into public.ugc_storyboard_versions(storyboard_id,version,owner_user_id,project_id,job_id,document,state,approved_at)
 select id,version,owner_user_id,project_id,job_id,document,state,approved_at from public.ugc_storyboards where document is not null on conflict do nothing;

create or replace function public.ugc_storyboard_execution_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.repair_source_id,new.repair_request_id) is distinct from (old.repair_source_id,old.repair_request_id) then raise exception 'Immutable repair provenance'; end if;
  if old.state='approved' and new.state not in ('approved','deleting','deleted') then raise exception 'Fork approved Storyboard before editing'; end if;
  if old.state='approved' and new.state='approved' and new.document is distinct from old.document then raise exception 'Immutable approved Storyboard'; end if;
  if old.document is not null then
   insert into public.ugc_storyboard_versions(storyboard_id,version,owner_user_id,project_id,job_id,document,state,approved_at)
    values(old.id,old.version,old.owner_user_id,old.project_id,old.job_id,old.document,old.state,old.approved_at) on conflict do nothing;
  end if;
 end if;
 if new.state='approved' and not public.ugc_execution_v1_valid(new.document) then raise exception 'Canonical execution contract required before approval'; end if;
 return new;
end $$;
drop trigger if exists ugc_storyboard_execution_guard on public.ugc_storyboards;
create trigger ugc_storyboard_execution_guard before insert or update on public.ugc_storyboards for each row execute function public.ugc_storyboard_execution_guard();
create or replace function public.ugc_storyboard_version_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.document is not null then
  insert into public.ugc_storyboard_versions(storyboard_id,version,owner_user_id,project_id,job_id,document,state,approved_at)
   values(new.id,new.version,new.owner_user_id,new.project_id,new.job_id,new.document,new.state,new.approved_at) on conflict do nothing;
 end if;
 return new;
end $$;
drop trigger if exists ugc_storyboard_version_capture on public.ugc_storyboards;
create trigger ugc_storyboard_version_capture after insert or update on public.ugc_storyboards for each row execute function public.ugc_storyboard_version_capture();

create or replace function public.ugc_storyboard_repair_execution(p_owner uuid,p_project uuid,p_job uuid,p_storyboard uuid,p_version integer,p_request uuid,p_document jsonb)
returns public.ugc_storyboards language plpgsql security definer set search_path='' as $$
declare source public.ugc_storyboards; latest public.ugc_storyboards; current_input jsonb; begin
 perform public.ugc_storyboard_lock(p_job);
 if p_request is null or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 select * into source from public.ugc_storyboards where id=p_storyboard and owner_user_id=p_owner and project_id=p_project and job_id=p_job for update;
 if source.id is null or source.version is distinct from p_version or source.state<>'approved' or source.claim_token is not null then return null; end if;
 current_input:=public.ugc_storyboard_input(p_job);
 if current_input is distinct from source.input or not public.ugc_execution_v1_valid(p_document) or not public.ugc_storyboard_valid(p_document,source.input) then return null; end if;
 select * into latest from public.ugc_storyboards where owner_user_id=p_owner and repair_request_id=p_request;
 if latest.id is not null then
  if latest.repair_source_id=source.id and latest.job_id=p_job and latest.project_id=p_project and latest.document=p_document then return latest; end if; return null;
 end if;
 select * into latest from public.ugc_storyboards where job_id=p_job order by revision desc limit 1 for update;
 if latest.id<>source.id then
  if latest.repair_source_id=source.id and latest.state='review' and latest.document=p_document and latest.input=current_input then return latest; end if; return null;
 end if;
 insert into public.ugc_storyboards(job_id,owner_user_id,project_id,revision,input,document,state,phase,repair_source_id,repair_request_id)
  values(p_job,p_owner,p_project,source.revision+1,source.input,p_document,'review','review',source.id,p_request) returning * into latest;
 return latest;
end $$;

create or replace function public.ugc_storyboard_valid_canonical_070(d jsonb,i jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb; a jsonb; v jsonb; n integer:=0; finish integer:=0; previous integer; seconds numeric; rate numeric; total integer; k text; overlap integer:=0;
begin
 total:=(i->'scene'->'settings'->>'duration')::integer*1000;
 if total not in (5000,10000,30000) or d->>'schemaVersion' is distinct from '2' or not public.ugc_execution_v1_valid(d) or (d->>'durationMs')::integer is distinct from total
  or d->>'aspectRatio' is distinct from i->'scene'->'settings'->>'aspectRatio'
  or d->>'visualStyle' is distinct from i->'scene'->'settings'->>'visualStyle' or d->>'tone' is distinct from i->'scene'->'settings'->>'tone'
  or d->'voice'->>'characterAssetId' is distinct from i->'character'->>'id'
  or jsonb_typeof(d->'scenes') is distinct from 'array' or jsonb_array_length(d->'scenes') not between 1 and 10 then return false; end if;
 rate:=case d->'voice'->>'pace' when 'slow' then 1.8 when 'natural' then 2.3 when 'energetic' then 2.7 else 0 end;
 if rate=0 then return false; end if;
 for s in select value from jsonb_array_elements(d->'scenes') loop
  n:=n+1;
  if (s->>'number')::integer is distinct from n or (s->>'startMs')::integer is distinct from finish-overlap
   or (s->>'endMs')::integer<=(s->>'startMs')::integer or (s->>'endMs')::integer>total
   or s->>'characterAssetId' is distinct from i->'character'->>'id' or s->>'productAssetId' is distinct from i->'product'->>'id'
   or s->>'locationAssetId' is distinct from i->'location'->>'id' then return false; end if;
  foreach k in array array['purpose','description','productInteraction','productPosition','generationPrompt'] loop
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
  previous:=(s->>'startMs')::integer;
  for a in select value from jsonb_array_elements(s->'actions') loop
   if jsonb_typeof(a->'startMs') is distinct from 'number' or jsonb_typeof(a->'endMs') is distinct from 'number'
    or (a->>'startMs')::integer<previous or (a->>'endMs')::integer-(a->>'startMs')::integer<700
    or (a->>'endMs')::integer>(s->>'endMs')::integer or not(a ?& array['movement','gesture','expression']) then return false; end if;
   previous:=(a->>'endMs')::integer;
  end loop;
  previous:=(s->>'startMs')::integer;
  for v in select value from jsonb_array_elements(s->'speech') loop
   seconds:=((v->>'endMs')::numeric-(v->>'startMs')::numeric)/1000;
   rate:=case v->'delivery'->>'pace' when 'slow' then 1.8 when 'natural' then 2.3 when 'energetic' then 2.7 else 0 end;
   if seconds<=0 or (v->>'startMs')::integer<previous or (v->>'endMs')::integer>(s->>'endMs')::integer
    or v->>'characterAssetId' is distinct from i->'character'->>'id' or v->>'speaker' not in ('character','narration')
    or length(btrim(coalesce(v->>'text','')))=0 or cardinality(regexp_split_to_array(btrim(v->>'text'),'\s+'))>floor(seconds*rate)
    or length(regexp_replace(v->>'text','\s','','g'))>floor(seconds*16) then return false; end if;
   previous:=(v->>'endMs')::integer;
  end loop;
  finish:=(s->>'endMs')::integer; overlap:=case when s->'transition'->>'type'='crossfade' then (s->'transition'->>'durationMs')::integer else 0 end;
 end loop;
 return coalesce(finish=total,false);
exception when others then return false;
end; $$;

create or replace function public.ugc_package_valid_canonical_070(d jsonb,i jsonb,rev integer,fp text) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb; original jsonb; role text; k text; n integer:=0; finish integer:=0; expected jsonb; begin
 if d->>'executionVersion' is distinct from 'ugc-execution-v1' or not public.ugc_execution_v1_valid(i->'storyboard'->'document') or fp is distinct from public.ugc_package_digest('sceenyk-package-input',jsonb_build_object('compilerVersion',2,'input',i)) or not public.ugc_storyboard_valid(i->'storyboard'->'document',i->'source')
  or d->>'schemaVersion' is distinct from '2' or d->>'compilerVersion' is distinct from '2'
  or d->>'promptVersion' is distinct from '2' or d->>'fingerprintVersion' is distinct from '1'
  or (d->>'packageVersion')::integer is distinct from rev or d->>'inputFingerprint' is distinct from fp
  or d->'project'->>'id' is distinct from i->>'projectId' or d->'project'->>'ownerId' is distinct from i->>'ownerId'
  or d->'project'->>'jobId' is distinct from i->>'jobId'
  or d->'timeline'->>'totalDurationMs' is distinct from i->'storyboard'->'document'->>'durationMs'
  or d->'output'->>'durationMs' is distinct from i->'storyboard'->'document'->>'durationMs'
  or d->'output'->>'aspectRatio' is distinct from i->'storyboard'->'document'->>'aspectRatio'
  or d->'voice' is distinct from i->'storyboard'->'document'->'voice'
  or d->'continuity' is distinct from i->'storyboard'->'document'->'continuity'
  or d->'storyboard' is distinct from ((i->'storyboard')-'document')||jsonb_build_object('schemaVersion',2,'documentHash',public.ugc_package_digest('sceenyk-storyboard',i->'storyboard'->'document'))
  or d->>'packageHash' is distinct from public.ugc_package_digest('sceenyk-video-package',d-array['packageVersion','packageHash'])
  or jsonb_typeof(d->'scenes') is distinct from 'array' then return false; end if;
 foreach role in array array['character','product','location'] loop
  foreach k in array array['id','sha256','mimeType','sizeBytes','width','height'] loop
   if d->'approvedReferences'->role->k is distinct from i->'source'->role->k then return false; end if;
  end loop;
  if d->'approvedReferences'->role->'approvalVersion' is distinct from i->'approvals'->role->'version'
   or d->'approvedReferences'->role->'approvalId' is distinct from i->'approvals'->role->'id' then return false; end if;
 end loop;
 if jsonb_array_length(d->'scenes') is distinct from jsonb_array_length(i->'storyboard'->'document'->'scenes') then return false; end if;
 for s in select value from jsonb_array_elements(d->'scenes') loop
  original:=i->'storyboard'->'document'->'scenes'->n; n:=n+1;
  if (s->>'number')::integer is distinct from n
   or s->'startMs' is distinct from original->'startMs' or s->'endMs' is distinct from original->'endMs'
   or (s->>'durationMs')::integer is distinct from (original->>'endMs')::integer-(original->>'startMs')::integer
   or s->'bindings' is distinct from '{"character":"character","product":"product","location":"location"}'::jsonb
   or s->'voice' is distinct from d->'voice' or coalesce(length(btrim(s->>'generationPrompt')),0)=0
   or (s-array['id','durationMs','bindings','voice','generationPrompt','speech']) is distinct from
    (original-array['characterAssetId','productAssetId','locationAssetId','generationPrompt','speech']) then return false; end if;
  select coalesce(jsonb_agg((value-'characterAssetId')||'{"characterBinding":"character"}'::jsonb order by ord),'[]') into expected
   from jsonb_array_elements(original->'speech') with ordinality a(value,ord);
  if s->'speech' is distinct from expected then return false; end if;
  finish:=(s->>'endMs')::integer;
 end loop;
 return coalesce(finish=(d->'timeline'->>'totalDurationMs')::integer,false);
exception when others then return false; end; $$;


create or replace function public.ugc_storyboard_valid(d jsonb,i jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when d->>'schemaVersion'='2' then public.ugc_storyboard_valid_canonical_070(d,i) else public.ugc_storyboard_valid_legacy_070(d,i) end;
$$;
create or replace function public.ugc_package_valid(d jsonb,i jsonb,rev integer,fp text) returns boolean language sql immutable set search_path='' as $$
 select case when d->>'schemaVersion'='2' then public.ugc_package_valid_canonical_070(d,i,rev,fp) else public.ugc_package_valid_legacy_070(d,i,rev,fp) end;
$$;


create or replace function public.ugc_package_action(p_owner uuid,p_project uuid,p_job uuid,p_version integer,p_action text,p_payload jsonb default '{}')
returns public.ugc_generation_packages language plpgsql security definer set search_path='' as $$
declare j public.ugc_generation_jobs; b public.ugc_generation_packages; current_input jsonb; fp text; begin
 perform public.ugc_storyboard_lock(p_job);
 select * into j from public.ugc_generation_jobs where id=p_job and owner_user_id=p_owner and project_id=p_project;
 if not found or not exists(select 1 from public.projects where id=p_project and owner_user_id=p_owner and status='draft') then return null; end if;
 perform 1 from public.ugc_storyboards where job_id=p_job for share;
 current_input:=public.ugc_package_input(p_job);
 if p_action='prepare' then
  if current_input is null or current_input is distinct from p_payload->'input' then return null; end if;
  fp:=public.ugc_package_digest('sceenyk-package-input',jsonb_build_object('compilerVersion',(current_input->'storyboard'->'document'->>'schemaVersion')::integer,'input',current_input));
  if fp is distinct from p_payload->>'fingerprint' or coalesce(p_payload->>'requestId','')='' then return null; end if;
  select * into b from public.ugc_generation_packages where owner_user_id=p_owner and request_id=(p_payload->>'requestId')::uuid;
  if found then if b.job_id=p_job and b.project_id=p_project and b.input_fingerprint=fp then return b; else return null; end if; end if;
  select * into b from public.ugc_generation_packages where job_id=p_job and input_fingerprint=fp and state<>'deleted' and stale_at is null for update;
  if found then return b; end if;
  select * into b from public.ugc_generation_packages where job_id=p_job order by revision desc limit 1 for update;
  if (b.id is null and p_version<>0) or (b.id is not null and (b.version<>p_version or b.id::text is distinct from p_payload->>'packageId')) then return null; end if;
  -- An explicitly rebuilt stale version keeps its original lifecycle/approval
  -- history. The partial unique index excludes permanently stale snapshots.
  insert into public.ugc_generation_packages(job_id,owner_user_id,project_id,revision,request_id,input,input_fingerprint)
   values(p_job,p_owner,p_project,coalesce(b.revision,0)+1,(p_payload->>'requestId')::uuid,current_input,fp) returning * into b;
  return b;
 end if;
 select * into b from public.ugc_generation_packages where id=(p_payload->>'packageId')::uuid and job_id=p_job and owner_user_id=p_owner and project_id=p_project for update;
 if not found or b.revision<>(select max(revision) from public.ugc_generation_packages where job_id=p_job) then return null; end if;
 if p_action='reject' and b.state='deleted' then return b; end if;
 if p_action='approve' and b.state='approved' and b.stale_at is null and b.input=current_input then return b; end if;
 if b.version<>p_version or (b.claim_token is not null and b.lease_expires_at>clock_timestamp()) then return null; end if;
 if p_action='reject' and b.state<>'deleted' then
  update public.ugc_generation_packages set state='deleted',phase='deleted',error_code=null,claim_token=null,lease_expires_at=null,
   version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 elsif p_action='approve' and b.state='review' and b.stale_at is null and b.input=current_input then
  if not public.ugc_package_valid(b.document,b.input,b.revision,b.input_fingerprint) then return null; end if;
  update public.ugc_generation_packages set state='approved',phase='approved',was_approved=true,approved_at=clock_timestamp(),approved_by=p_owner,
   version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 elsif p_action='retry' and b.state='failed' and b.attempts<3 and b.stale_at is null and b.input=current_input then
  update public.ugc_generation_packages set state='queued',phase='checking',error_code=null,claim_token=null,lease_expires_at=null,
   version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 else return null; end if;
 return b; -- No upstream transition, provider, dispatch or financial operation.
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
   or p_payload->>'provider' is distinct from 'openai' or p_payload->>'promptVersion' is distinct from 'ugc-storyboard-v2-execution'
   or p_payload->>'contractVersion' is distinct from '2' or p_payload->>'maxOutputTokens' is distinct from '14000'
   or (count_requests>0 and (b.requests->(count_requests-1)->>'contractVersion' is distinct from '2' or not(b.requests->(count_requests-1) ? 'output'))) then return null; end if;
  b.model:=p_payload->>'model'; b.requests:=b.requests||jsonb_build_array(jsonb_build_object('model',b.model,'provider','openai',
   'promptVersion','ugc-storyboard-v2-execution','contractVersion',2,'maxOutputTokens',14000));
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

create or replace function public.ugc_final_current(p_execution uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.ugc_final_current_legacy_070(p_execution) and coalesce((select p.document->>'schemaVersion'='2' and public.ugc_execution_v1_valid(p.input->'storyboard'->'document')
  from public.ugc_final_executions e join public.ugc_generation_packages p on p.id=e.package_id where e.id=p_execution),false);
$$;
create or replace function public.ugc_package_execution_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if (tg_op='INSERT' or new.state='approved' and old.state is distinct from 'approved') and not public.ugc_execution_v1_valid(new.input->'storyboard'->'document') then
  raise exception 'Canonical executable Storyboard required for a new package/approval'; end if;
 return new;
end $$;
drop trigger if exists ugc_package_execution_guard on public.ugc_generation_packages;
create trigger ugc_package_execution_guard before insert or update on public.ugc_generation_packages for each row execute function public.ugc_package_execution_guard();
create or replace function public.ugc_final_execution_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.ugc_generation_packages p where p.id=new.package_id and p.document->>'schemaVersion'='2' and public.ugc_execution_v1_valid(p.input->'storyboard'->'document')) then
  raise exception 'Canonical executable package required for final admission'; end if;
 return new;
end $$;
drop trigger if exists ugc_final_execution_guard on public.ugc_final_executions;
create trigger ugc_final_execution_guard before insert on public.ugc_final_executions for each row execute function public.ugc_final_execution_guard();
-- All newly introduced helpers/history are private. Existing RPC grants remain.
do $$ declare f record; begin
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and
  proname in ('ugc_execution_keys','ugc_execution_v1_valid','ugc_storyboard_valid_legacy_070','ugc_package_valid_legacy_070','ugc_final_current_legacy_070',
  'ugc_storyboard_valid_canonical_070','ugc_package_valid_canonical_070','ugc_storyboard_execution_guard','ugc_storyboard_version_capture',
  'ugc_package_execution_guard','ugc_final_execution_guard','ugc_storyboard_repair_execution') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname='ugc_storyboard_repair_execution' then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end $$;
commit;
