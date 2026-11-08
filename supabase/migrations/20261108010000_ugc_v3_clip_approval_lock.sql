-- Manual after 099. No provider calls or rewriting creative/approval/media rows.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.ugc_v3_merge_setup()') is null then raise exception 'Apply 099 before 100'; end if;
 for t,c in select * from (values
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('projects','id'),('projects','title'),('projects','prompt'),('projects','aspect_ratio'),('projects','duration'),('projects','visual_style'),
 ('projects','tone'),('projects','category'),('projects','ugc_type'),('projects','creation_type'),('projects','studio_mode'),('projects','video_resolution'),
 ('project_assets','id'),('project_assets','project_id'),('project_assets','owner_user_id'),('project_assets','upload_status'),('project_assets','studio_role'),
 ('project_assets','verified_etag'),('project_assets','storage_key'),('project_assets','removed_from_draft'),('project_assets','size_bytes'),('project_assets','mime_type'),
 ('ugc_v3_sources','project_id'),('ugc_v3_sources','revision'),('ugc_v3_sources','input'),('ugc_v3_sources','input_hash'),('ugc_v3_sources','private_bindings'),('ugc_v3_sources','project_input_hash'),
 ('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','document'),('ugc_v3_packages','package_hash'),('ugc_v3_packages','source_revision'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','version'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','task_id'),
 ('ugc_v3_runs','id'),('ugc_v3_runs','project_id'),('ugc_v3_runs','package_id'),('ugc_v3_runs','state'),('ugc_v3_runs','completed_at'),('ugc_v3_runs','created_at'),('ugc_v3_runs','intent'),('ugc_v3_runs','result'),('ugc_v3_runs','authorization_id'),('ugc_v3_runs','segment_key'),
 ('ugc_v3_quotes','id'),('ugc_v3_quotes','project_id'),('ugc_v3_quotes','package_id'),('ugc_v3_quotes','document'),
 ('ugc_v3_run_authorizations','id'),('ugc_v3_run_authorizations','project_id'),('ugc_v3_run_authorizations','package_id'),('ugc_v3_run_authorizations','document'),('ugc_v3_run_authorizations','created_at'),
 ('ugc_v3_authorizations','id'),('ugc_v3_authorizations','project_id'),('ugc_v3_authorizations','package_id'),('ugc_v3_authorizations','document'),('ugc_v3_authorizations','authorization_hash'),
 ('ugc_v3_runtime_events','id'),('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','created_at'),('ugc_v3_runtime_events','document'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','created_at'),
 ('ugc_v3_reference_deletions','id'),('ugc_v3_reference_deletions','project_id')) v(t,c)
 loop if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c)
 then raise exception 'Verify creative lock prerequisite %.%',t,c; end if; end loop;
end $$;

create table if not exists public.ugc_v3_creative_locks (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.ugc_v3_projects(project_id),
 owner_user_id uuid not null, revision integer not null check(revision>0), package_id uuid references public.ugc_v3_packages(id),
 first_run_id uuid references public.ugc_v3_runs(id), state text not null check(state in ('locked','needs_review')),
 document jsonb not null, snapshot_hash text generated always as (public.ugc_package_digest('sceenyk-v3-creative-lock-v1',document)) stored,
 captured_at timestamptz not null default now(), origin text not null check(origin in ('first_clip','historical_recovery')),
 unique(project_id,revision), foreign key(project_id,owner_user_id) references public.ugc_v3_projects(project_id,owner_user_id)
);
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_v3_creative_locks' and column_name='snapshot_hash' and is_generated='ALWAYS')
 then raise exception 'Verify 100 snapshot_hash generated-column contract before continuing'; end if;
end $$;
alter table public.ugc_v3_creative_locks enable row level security;
revoke all on public.ugc_v3_creative_locks from public,anon,authenticated,service_role;
grant select on public.ugc_v3_creative_locks to service_role;
create or replace function public.ugc_v3_lock_immutable() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'V3_CREATIVE_LOCK_IMMUTABLE'; end $$;
drop trigger if exists ugc_v3_lock_immutable on public.ugc_v3_creative_locks;
create trigger ugc_v3_lock_immutable before update or delete on public.ugc_v3_creative_locks for each row execute function public.ugc_v3_lock_immutable();

-- Fixed v1 evidence reader. It uses stored records/hashes, not current creative validators.
create or replace function public.ugc_v3_lock_evidence(p_project uuid,p_package uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pkg public.ugc_v3_packages; src public.ugc_v3_sources; q public.ugc_v3_quotes; a public.ugc_v3_artifacts;
 ref jsonb; refs jsonb:='[]'; originals jsonb:='[]'; original public.project_assets; board public.ugc_v3_artifacts;
 brief jsonb; d jsonb; runs jsonb; segment jsonb; quoted jsonb; i integer; planned_end bigint:=0; begin
 select * into pkg from public.ugc_v3_packages where id=p_package and project_id=p_project;
 if pkg.id is null or jsonb_typeof(pkg.document) is distinct from 'object' then return jsonb_build_object('error','V3_LOCK_PACKAGE_DAMAGED'); end if;
 if pkg.id is null or pkg.package_hash is distinct from public.ugc_package_digest('sceenyk-v3-frozen-package',pkg.document-'hash')
 or pkg.document->>'hash' is distinct from pkg.package_hash then return jsonb_build_object('error','V3_LOCK_PACKAGE_DAMAGED'); end if;
 select * into src from public.ugc_v3_sources where project_id=p_project and revision=pkg.source_revision;
 if src.revision is null or src.input is distinct from pkg.document->'source'
 or src.input_hash is distinct from pkg.document->>'inputHash'
 or src.input_hash is distinct from public.ugc_package_digest('sceenyk-v3-input',src.input) then return jsonb_build_object('error','V3_LOCK_SOURCE_DAMAGED'); end if;
 if jsonb_typeof(src.input->'references') is distinct from 'array'
 or not exists(select 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id::text=src.input->'scope'->>'ownerId')
 then return jsonb_build_object('error','V3_LOCK_SOURCE_DAMAGED'); end if;
 select * into board from public.ugc_v3_artifacts where id=(src.input->'storyboard'->>'id')::uuid and project_id=p_project and kind='storyboard';
 if board.id is null or board.approved_at is null or board.rejected_at is not null
 or board.version is distinct from (src.input->'storyboard'->>'version')::integer
 or board.document->'storyboard' is distinct from src.input->'storyboardContent'
 or src.input->'storyboard'->>'hash' is distinct from public.ugc_package_digest('sceenyk-v3-storyboard',board.document->'storyboard')
 then return jsonb_build_object('error','V3_LOCK_STORYBOARD_EVIDENCE_REQUIRED'); end if;
 brief:=board.document->'input'->'brief';
 if brief is null or brief='null'::jsonb then
  select jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,
   'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type,'creation_type',p.creation_type,'video_resolution',p.video_resolution)
   into brief from public.projects p where p.id=p_project;
 end if;
 if jsonb_typeof(brief) is distinct from 'object' then return jsonb_build_object('error','V3_LOCK_BRIEF_EVIDENCE_REQUIRED'); end if;
 if brief->>'id' is distinct from p_project::text or board.document->'input'->>'briefHash' is distinct from
  public.ugc_package_digest('sceenyk-v3-brief',brief-array['creation_type','video_resolution'])
 then return jsonb_build_object('error','V3_LOCK_BRIEF_EVIDENCE_REQUIRED'); end if;
 -- Output settings are also explicitly frozen in the package (old brief evidence may omit them).
 brief:=brief||jsonb_build_object('creation_type','ugc','video_resolution',src.input->>'resolution');
 for ref in select value from jsonb_array_elements(src.input->'references') loop
  select * into a from public.ugc_v3_artifacts where id=(ref->>'id')::uuid and project_id=p_project and kind=ref->>'role';
  if a.id is null or a.approved_at is null or a.rejected_at is not null or a.version is distinct from (ref->>'version')::integer
   or a.document->'asset'->>'sha256' is distinct from ref->>'sha256'
   or a.document->'asset'->'sizeBytes' is distinct from ref->'sizeBytes'
   or src.private_bindings->(ref->>'id') is distinct from a.document->'asset'||'{"verifiedReadback":true}'::jsonb
  then return jsonb_build_object('error','V3_LOCK_REFERENCE_EVIDENCE_REQUIRED'); end if;
  refs:=refs||jsonb_build_array(to_jsonb(a));
  if a.kind in ('character','product') then
   select * into original from public.project_assets where id=(a.document->'original'->>'id')::uuid and project_id=p_project;
   if original.id is null or original.upload_status<>'uploaded' or original.studio_role<>a.kind or original.owner_user_id::text is distinct from src.input->'scope'->>'ownerId'
   then return jsonb_build_object('error','V3_LOCK_ORIGINAL_EVIDENCE_REQUIRED'); end if;
   originals:=originals||jsonb_build_array(to_jsonb(original));
  end if;
 end loop;
 if jsonb_array_length(refs)<2 or not exists(select 1 from jsonb_array_elements(refs) x where x->>'kind'='character')
  or not exists(select 1 from jsonb_array_elements(refs) x where x->>'kind'='location') then return jsonb_build_object('error','V3_LOCK_REFERENCE_EVIDENCE_REQUIRED'); end if;
 select * into q from public.ugc_v3_quotes where package_id=p_package and project_id=p_project;
 if q.id is null or q.document->>'packageHash' is distinct from pkg.package_hash
 or pkg.document->'pricing'->>'status' is distinct from 'estimated'
 or coalesce(pkg.document->'pricing'->>'totalMicrousd','') !~ '^[0-9]+$'
 or q.document->'totalMicrousd' is distinct from pkg.document->'pricing'->'totalMicrousd'
 then return jsonb_build_object('error','V3_LOCK_ESTIMATE_EVIDENCE_REQUIRED'); end if;
 -- Stable v1 structure and exact saved HTTP body bindings, without recompiling
 -- prompts or applying today's pricing/creative admission rules to old evidence.
 if pkg.document->>'schema' is distinct from 'generation-package-v3.2'
 or pkg.document->>'id' is distinct from pkg.id::text or src.input->'scope'->>'projectId' is distinct from p_project::text
 or q.document->>'id' is distinct from q.id::text or q.document->>'projectId' is distinct from p_project::text
 or q.document->>'packageId' is distinct from p_package::text
 or jsonb_typeof(pkg.document->'segments') is distinct from 'array' or jsonb_typeof(q.document->'segments') is distinct from 'array'
 then return jsonb_build_object('error','V3_LOCK_ESTIMATE_EVIDENCE_REQUIRED'); end if;
 if jsonb_array_length(pkg.document->'segments')<1 or jsonb_array_length(pkg.document->'segments')<>jsonb_array_length(q.document->'segments')
 then return jsonb_build_object('error','V3_LOCK_ESTIMATE_EVIDENCE_REQUIRED'); end if;
 i:=0;
 for segment in select value from jsonb_array_elements(pkg.document->'segments') loop
  quoted:=q.document->'segments'->i; i:=i+1;
  if jsonb_typeof(quoted->'body') is distinct from 'object' or segment->>'id' is null or segment->>'fingerprint' is null
   or segment->'startMs' is distinct from to_jsonb(planned_end)
   or coalesce(segment->>'durationMs','') !~ '^[1-9][0-9]*$'
   or (segment->>'endMs')::bigint is distinct from planned_end+(segment->>'durationMs')::bigint
   or quoted->>'segmentId' is distinct from segment->>'id' or quoted->>'fingerprint' is distinct from segment->>'fingerprint'
   or quoted->'estimatedCostMicrousd' is distinct from segment->'estimate'->'estimatedCostMicrousd'
   or quoted->'body'->>'resolution' is distinct from src.input->>'resolution'
   or quoted->>'bodyHash' is distinct from encode(sha256(convert_to(public.ugc_package_canonical(quoted->'body'),'UTF8')),'hex')
  then return jsonb_build_object('error','V3_LOCK_ESTIMATE_EVIDENCE_REQUIRED'); end if;
  planned_end:=(segment->>'endMs')::bigint;
 end loop;
 if to_jsonb(planned_end) is distinct from src.input->'storyboardContent'->'durationMs'
 or (select sum((x->>'estimatedCostMicrousd')::bigint) from jsonb_array_elements(q.document->'segments') x) is distinct from (q.document->>'totalMicrousd')::bigint
 then return jsonb_build_object('error','V3_LOCK_ESTIMATE_EVIDENCE_REQUIRED'); end if;
 select jsonb_agg(jsonb_build_object('id',r.id,'intent',r.intent,'result',r.result,'completedAt',r.completed_at) order by r.completed_at nulls last,r.created_at,r.id)
 into runs from public.ugc_v3_runs r where r.project_id=p_project and r.state='approved';
 if runs is null or exists(select 1 from public.ugc_v3_runs r where r.project_id=p_project and r.state='approved' and
  (r.package_id<>p_package or r.intent->>'packageHash' is distinct from pkg.package_hash or r.result is null
   or r.intent->'authorization'->>'quoteId' is distinct from q.id::text
   or not exists(select 1 from public.ugc_v3_run_authorizations auth where auth.id=r.authorization_id and auth.document=r.intent->'authorization')))
 then return jsonb_build_object('error','V3_LOCK_APPROVAL_EVIDENCE_CONFLICT'); end if;
 d:=jsonb_build_object('schema','v3-creative-lock-v1','projectId',p_project,'brief',brief,'source',to_jsonb(src),
  'package',pkg.document,'quote',q.document,'references',refs,'storyboard',to_jsonb(board),'originals',originals,
  'approvedRuns',runs,'authorizations',(select coalesce(jsonb_agg(document order by created_at,id),'[]'::jsonb) from public.ugc_v3_run_authorizations where package_id=p_package),
  'approvalEvents',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]'::jsonb) from public.ugc_v3_runtime_events e
   where e.project_id=p_project and e.kind='approve' and exists(select 1 from public.ugc_v3_runs r where r.id=e.entity_id and r.package_id=p_package)));
 return d;
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('error','V3_LOCK_EVIDENCE_INVALID');
end $$;

create or replace function public.ugc_v3_lock_valid(p_lock uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare l public.ugc_v3_creative_locks; x jsonb; a public.ugc_v3_artifacts; begin
 select * into l from public.ugc_v3_creative_locks where id=p_lock;
 -- The generated hash is computed once on capture; immutable rows cannot be
 -- edited. Reads validate live bindings without repeatedly canonicalizing the large snapshot.
 if l.id is null or l.state<>'locked'
 or not exists(select 1 from public.ugc_v3_packages where id=l.package_id and project_id=l.project_id and document=l.document->'package')
 or not exists(select 1 from public.ugc_v3_sources where project_id=l.project_id and revision=(l.document->'source'->>'revision')::integer
   and input=l.document->'source'->'input' and private_bindings=l.document->'source'->'private_bindings' and input_hash=l.document->'source'->>'input_hash')
 or not exists(select 1 from public.ugc_v3_quotes where package_id=l.package_id and document=l.document->'quote') then return false; end if;
 for x in select value from jsonb_array_elements(l.document->'references') union all select l.document->'storyboard' loop
  select * into a from public.ugc_v3_artifacts where id=(x->>'id')::uuid and project_id=l.project_id;
  if a.id is null or a.document is distinct from x->'document' or a.version is distinct from (x->>'version')::integer
   or a.approved_at is distinct from (x->>'approved_at')::timestamptz or a.rejected_at is not null then return false; end if;
 end loop;
 for x in select value from jsonb_array_elements(l.document->'approvedRuns') loop
  if not exists(select 1 from public.ugc_v3_runs where id=(x->>'id')::uuid and project_id=l.project_id and package_id=l.package_id
   and state='approved' and intent=x->'intent' and result=x->'result') then return false; end if;
 end loop;
 for x in select value from jsonb_array_elements(l.document->'originals') loop
  if not exists(select 1 from public.project_assets original_row where original_row.id=(x->>'id')::uuid and original_row.project_id=l.project_id
   and original_row.owner_user_id=l.owner_user_id and original_row.upload_status='uploaded' and original_row.storage_key=x->>'storage_key'
   and original_row.verified_etag=x->>'verified_etag' and original_row.size_bytes=(x->>'size_bytes')::bigint and original_row.mime_type=x->>'mime_type') then return false; end if;
 end loop;
 return true;
end $$;

create or replace function public.ugc_v3_capture_clip_lock(p_owner uuid,p_project uuid,p_recovery boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.ugc_v3_creative_locks; r public.ugc_v3_runs; d jsonb; lock_id uuid; n integer; begin
 perform 1 from public.ugc_v3_projects v join public.projects p on p.id=v.project_id where v.project_id=p_project and v.owner_user_id=p_owner for update of p,v;
 if not found then raise exception 'V3_PROJECT_NOT_OWNED'; end if;
 select * into l from public.ugc_v3_creative_locks where project_id=p_project order by revision desc limit 1;
 if l.state='locked' then return l.id; end if;
 select run.* into r from public.ugc_v3_runs run join public.ugc_v3_packages p on p.id=run.package_id join public.projects project on project.id=run.project_id
 where run.project_id=p_project and run.state='approved' and (project.studio_mode='pro' or p.document->'source'->'storyboardContent'->>'version'='director-storyboard-connected-v1')
 order by run.completed_at nulls last,run.created_at,run.id limit 1;
 if r.id is null then return null; end if;
 if not p_recovery and exists(select 1 from public.project_assets where project_id=p_project and studio_role in ('character','product') and upload_status='pending' and not removed_from_draft)
  then raise exception 'V3_CREATIVE_CHANGES_PENDING'; end if;
 d:=public.ugc_v3_lock_evidence(p_project,r.package_id);
 if d ? 'error' and not p_recovery then raise exception 'V3_CREATIVE_LOCK_EVIDENCE_REQUIRED'; end if;
 if l.id is not null and (d ? 'error') then return l.id; end if;
 select coalesce(max(revision),0)+1 into n from public.ugc_v3_creative_locks where project_id=p_project;
 insert into public.ugc_v3_creative_locks(project_id,owner_user_id,revision,package_id,first_run_id,state,document,origin)
 values(p_project,p_owner,n,r.package_id,r.id,case when d ? 'error' then 'needs_review' else 'locked' end,d,
 case when p_recovery then 'historical_recovery' else 'first_clip' end) returning id into lock_id;
 return lock_id;
end $$;
create or replace function public.ugc_v3_recover_clip_lock(p_owner uuid,p_project uuid) returns uuid
language sql security definer set search_path='' as $$ select public.ugc_v3_capture_clip_lock(p_owner,p_project,true) $$;

-- Preserve the pre-lock implementation for Basic/unlocked projects. Rerunnable.
do $$ begin
 if to_regprocedure('public.ugc_v3_runtime_current_before_clip_lock(uuid)') is null then alter function public.ugc_v3_runtime_current(uuid) rename to ugc_v3_runtime_current_before_clip_lock; end if;
 if to_regprocedure('public.ugc_v3_artifact_current_before_clip_lock(uuid)') is null then alter function public.ugc_v3_artifact_current(uuid) rename to ugc_v3_artifact_current_before_clip_lock; end if;
 if to_regprocedure('public.ugc_v3_runtime_read_before_clip_lock(uuid,uuid)') is null then alter function public.ugc_v3_runtime_read(uuid,uuid) rename to ugc_v3_runtime_read_before_clip_lock; end if;
 if to_regprocedure('public.ugc_v3_location_input_current_before_clip_lock(uuid,jsonb)') is null then alter function public.ugc_v3_location_input_current(uuid,jsonb) rename to ugc_v3_location_input_current_before_clip_lock; end if;
 if to_regprocedure('public.ugc_v3_clip_package_valid_before_clip_lock(jsonb)') is null then alter function public.ugc_v3_clip_package_valid(jsonb) rename to ugc_v3_clip_package_valid_before_clip_lock; end if;
end $$;
create or replace function public.ugc_v3_location_input_current(p_project uuid,d jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare l public.ugc_v3_creative_locks; begin
 select * into l from public.ugc_v3_creative_locks where project_id=p_project order by revision desc limit 1;
 if l.id is not null then return public.ugc_v3_lock_valid(l.id) and exists(select 1 from jsonb_array_elements(l.document->'references') x where x->>'kind'='location' and x->'document'->'input'=d); end if;
 return public.ugc_v3_location_input_current_before_clip_lock(p_project,d);
end $$;
create or replace function public.ugc_v3_clip_package_valid(d jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare l public.ugc_v3_creative_locks; begin
 select * into l from public.ugc_v3_creative_locks where package_id=(d->>'id')::uuid order by revision desc limit 1;
 if l.id is not null then return public.ugc_v3_lock_valid(l.id) and l.document->'package'=d; end if;
 return public.ugc_v3_clip_package_valid_before_clip_lock(d);
end $$;
create or replace function public.ugc_v3_runtime_current(p_package uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare l public.ugc_v3_creative_locks; begin
 select lock.* into l from public.ugc_v3_creative_locks lock join public.ugc_v3_packages p on p.project_id=lock.project_id where p.id=p_package order by lock.revision desc limit 1;
 if l.id is not null then return l.package_id=p_package and public.ugc_v3_lock_valid(l.id); end if;
 return public.ugc_v3_runtime_current_before_clip_lock(p_package);
end $$;
create or replace function public.ugc_v3_artifact_current(p_artifact uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare l public.ugc_v3_creative_locks; begin
 select lock.* into l from public.ugc_v3_creative_locks lock join public.ugc_v3_artifacts a on a.project_id=lock.project_id where a.id=p_artifact order by lock.revision desc limit 1;
 if l.id is not null then return public.ugc_v3_lock_valid(l.id) and (l.document->'storyboard'->>'id'=p_artifact::text or exists(select 1 from jsonb_array_elements(l.document->'references') x where x->>'id'=p_artifact::text)); end if;
 return public.ugc_v3_artifact_current_before_clip_lock(p_artifact);
end $$;
create or replace function public.ugc_v3_runtime_read(p_owner uuid,p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb; l public.ugc_v3_creative_locks; begin
 data:=public.ugc_v3_runtime_read_before_clip_lock(p_owner,p_project); if data is null then return null; end if;
 select * into l from public.ugc_v3_creative_locks where project_id=p_project and owner_user_id=p_owner order by revision desc limit 1;
 if l.id is not null then
  data:=data||jsonb_build_object('creativeLock',to_jsonb(l)||jsonb_build_object('valid',public.ugc_v3_lock_valid(l.id)));
  if l.state='locked' then data:=data||jsonb_build_object('source',l.document->'source'||jsonb_build_object('current',public.ugc_v3_lock_valid(l.id))); end if;
 end if;
 return data;
end $$;

-- Database fences cover direct writes and all existing service RPCs.
create or replace function public.ugc_v3_creative_lock_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare target_project uuid; l public.ugc_v3_creative_locks; begin
 if tg_table_name='projects' then target_project:=old.id; elsif tg_op in ('UPDATE','DELETE') then target_project:=old.project_id; else target_project:=new.project_id; end if;
 perform 1 from public.projects where id=target_project for update;
 select * into l from public.ugc_v3_creative_locks where project_id=target_project order by revision desc limit 1;
 if l.id is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_table_name<>'projects' then
  if tg_op='UPDATE' and new.project_id is distinct from old.project_id then raise exception 'V3_CREATIVE_INPUTS_LOCKED'; end if;
 end if;
 if tg_table_name='projects' then
  if (to_jsonb(new)-array['updated_at','deleted_at','status','studio_mode']) is distinct from (to_jsonb(old)-array['updated_at','deleted_at','status','studio_mode']) then raise exception 'V3_CREATIVE_INPUTS_LOCKED'; end if;
 elsif tg_table_name='ugc_v3_runs' then
  if old.state='approved' and (tg_op='DELETE' or new.intent is distinct from old.intent or new.result is distinct from old.result or new.state<>old.state or new.package_id<>old.package_id
   or new.project_id<>old.project_id or new.authorization_id<>old.authorization_id or new.segment_key<>old.segment_key or new.completed_at is distinct from old.completed_at) then raise exception 'V3_APPROVED_CLIP_PRESERVED'; end if;
 elsif tg_table_name='ugc_v3_tasks' then
  if new.kind in ('character','product','location','storyboard','package') and not (new.input ? 'referenceCleanup')
   and (tg_op='INSERT' or new.provider_started and not old.provider_started) then raise exception 'V3_CREATIVE_INPUTS_LOCKED'; end if;
 elsif tg_table_name='ugc_v3_artifacts' then
  if coalesce(new.kind,old.kind)<>'joined' then
   -- Already accepted provider responses may still be saved as unapproved history.
   if tg_op='INSERT' and new.approved_at is null and exists(select 1 from public.ugc_v3_tasks where id=new.task_id and provider_started and created_at<=l.captured_at) then return new; end if;
   raise exception 'V3_CREATIVE_INPUTS_LOCKED';
  end if;
 elsif tg_table_name='ugc_v3_reference_deletions' then
  if l.state<>'locked' or exists(select 1 from jsonb_array_elements(l.document->'references') x where x->>'id'=coalesce(new.id,old.id)::text) then raise exception 'V3_CREATIVE_INPUTS_LOCKED'; end if;
 else raise exception 'V3_CREATIVE_INPUTS_LOCKED'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin foreach t in array array['projects','project_assets','ugc_v3_sources','ugc_v3_packages','ugc_v3_artifacts','ugc_v3_reference_deletions','ugc_v3_tasks','ugc_v3_runs','ugc_v3_quotes','ugc_v3_run_authorizations','ugc_v3_authorizations'] loop
 execute format('drop trigger if exists a_v3_creative_lock on public.%I',t);
 if t='projects' then execute 'create trigger a_v3_creative_lock before update on public.projects for each row execute function public.ugc_v3_creative_lock_guard()';
 elsif t='ugc_v3_runs' then execute 'create trigger a_v3_creative_lock before update or delete on public.ugc_v3_runs for each row execute function public.ugc_v3_creative_lock_guard()';
 elsif t='ugc_v3_run_authorizations' then execute 'create trigger a_v3_creative_lock before update or delete on public.ugc_v3_run_authorizations for each row execute function public.ugc_v3_creative_lock_guard()';
 elsif t='ugc_v3_tasks' then execute 'create trigger a_v3_creative_lock before insert or update of provider_started on public.ugc_v3_tasks for each row execute function public.ugc_v3_creative_lock_guard()';
 else execute format('create trigger a_v3_creative_lock before insert or update or delete on public.%I for each row execute function public.ugc_v3_creative_lock_guard()',t); end if;
end loop; end $$;
create or replace function public.ugc_v3_first_clip_lock() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; begin
 select owner_user_id into owner_id from public.ugc_v3_projects where project_id=new.project_id;
 perform public.ugc_v3_capture_clip_lock(owner_id,new.project_id,false);
 return new;
end $$;
drop trigger if exists a_v3_first_clip_lock on public.ugc_v3_runs;
create trigger a_v3_first_clip_lock after update of state on public.ugc_v3_runs for each row when(new.state='approved' and old.state is distinct from new.state) execute function public.ugc_v3_first_clip_lock();

-- Backfill only lock/evidence rows from real approved runs; missing evidence is explicit.
do $$ declare p record; begin for p in select distinct v.owner_user_id,r.project_id from public.ugc_v3_runs r join public.ugc_v3_projects v on v.project_id=r.project_id
 where r.state='approved' loop perform public.ugc_v3_capture_clip_lock(p.owner_user_id,p.project_id,true); end loop; end $$;
create or replace function public.ugc_v3_clip_lock_setup() returns boolean language sql stable security definer set search_path='' as $$select true$$;
revoke all on function public.ugc_v3_lock_evidence(uuid,uuid),public.ugc_v3_lock_valid(uuid),public.ugc_v3_capture_clip_lock(uuid,uuid,boolean),public.ugc_v3_lock_immutable(),public.ugc_v3_creative_lock_guard(),public.ugc_v3_first_clip_lock(),public.ugc_v3_runtime_current_before_clip_lock(uuid),public.ugc_v3_artifact_current_before_clip_lock(uuid),public.ugc_v3_runtime_read_before_clip_lock(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ugc_v3_location_input_current_before_clip_lock(uuid,jsonb),public.ugc_v3_clip_package_valid_before_clip_lock(jsonb),public.ugc_v3_clip_package_valid(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ugc_v3_location_input_current(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ugc_v3_location_input_current(uuid,jsonb) to service_role;
revoke all on function public.ugc_v3_runtime_current(uuid),public.ugc_v3_artifact_current(uuid),public.ugc_v3_runtime_read(uuid,uuid),public.ugc_v3_recover_clip_lock(uuid,uuid),public.ugc_v3_clip_lock_setup() from public,anon,authenticated;
grant execute on function public.ugc_v3_runtime_current(uuid),public.ugc_v3_artifact_current(uuid),public.ugc_v3_runtime_read(uuid,uuid),public.ugc_v3_recover_clip_lock(uuid,uuid),public.ugc_v3_clip_lock_setup() to service_role;
commit;
