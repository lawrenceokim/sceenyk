-- Product Phase 2 M2. Manual after 094. No backfill/provider/worker execution.
begin;
do $$ declare t text; c text; begin
 if to_regprocedure('public.studio_mode_read(uuid,uuid)') is null then raise exception 'Apply 094 first'; end if;
 for t,c in select * from (values
 ('projects','studio_mode'),('projects','owner_user_id'),('projects','deleted_at'),
 ('project_assets','id'),('project_assets','project_id'),('project_assets','owner_user_id'),('project_assets','studio_role'),('project_assets','reference_id'),('project_assets','reference_name'),('project_assets','created_at'),('project_assets','upload_status'),('project_assets','removed_from_draft'),
 ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),
 ('ugc_v3_artifacts','id'),('ugc_v3_artifacts','project_id'),('ugc_v3_artifacts','kind'),('ugc_v3_artifacts','version'),('ugc_v3_artifacts','task_id'),('ugc_v3_artifacts','document'),('ugc_v3_artifacts','approved_at'),('ugc_v3_artifacts','rejected_at'),
 ('ugc_v3_reference_deletions','id'),('ugc_v3_reference_deletions','project_id'),('ugc_v3_reference_deletions','kind'),('ugc_v3_reference_deletions','artifact_version'),('ugc_v3_reference_deletions','state'),
 ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),('ugc_v3_tasks','provider_started'),
 ('ugc_v3_sources','project_id'),('ugc_v3_sources','input')) v(t,c) loop
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c) then raise exception 'Verify M2 prerequisite %.%',t,c; end if;
 end loop;
end $$;

-- Completed old receipts deliberately keep NULL: their global floor predates
-- multiple characters. New receipts retain the exact source identity forever.
alter table public.ugc_v3_reference_deletions add column if not exists subject_id uuid;
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ugc_v3_reference_deletions' and column_name='subject_id' and udt_name='uuid' and is_nullable='YES') then raise exception 'Verify M2 receipt subject_id type/nullability'; end if;
end $$;
create or replace function public.ugc_v3_subject(d jsonb) returns text language sql immutable set search_path='' as $$
 select coalesce(d->'original'->>'id',d->>'originalId')
$$;
create or replace function public.ugc_v3_same_subject(k text,a jsonb,b jsonb) returns boolean language sql immutable set search_path='' as $$
 select k<>'character' or public.ugc_v3_subject(a) is not distinct from public.ugc_v3_subject(b)
$$;
create or replace function public.ugc_v3_subject_floor(p_project uuid,k text,subject text) returns integer language sql stable security definer set search_path='' as $$
 select coalesce(max(artifact_version),0) from public.ugc_v3_reference_deletions where project_id=p_project and kind=k and state='completed'
 and (k<>'character' or subject_id is null or subject_id::text=subject)
$$;
create or replace function public.ugc_v3_character_receipt_subject() returns trigger language plpgsql security definer set search_path='' as $$
declare subject text; begin
 if new.kind='character' then
  select public.ugc_v3_subject(document) into subject from public.ugc_v3_artifacts where id=new.id and project_id=new.project_id;
  if subject is not null then
   if new.subject_id is not null and new.subject_id::text<>subject then raise exception 'V3_REFERENCE_DELETE_SCOPE'; end if;
   new.subject_id:=subject::uuid;
  elsif tg_op='UPDATE' then new.subject_id:=old.subject_id;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists a_v3_character_receipt_subject on public.ugc_v3_reference_deletions;
create trigger a_v3_character_receipt_subject before insert or update on public.ugc_v3_reference_deletions for each row execute function public.ugc_v3_character_receipt_subject();

-- Return required sheets in stable source creation order, then optional Product.
create or replace function public.ugc_v3_reference_ids(p_project uuid,with_location boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare source record; ref public.ugc_v3_artifacts; ids jsonb:='[]'; begin
 for source in select id from public.project_assets where project_id=p_project and studio_role='character' and upload_status='uploaded' and not removed_from_draft order by created_at,id loop
  select * into ref from public.ugc_v3_artifacts where project_id=p_project and kind='character' and public.ugc_v3_subject(document)=source.id::text order by version desc limit 1;
  if not found or ref.approved_at is null or not public.ugc_v3_artifact_current(ref.id) then return null; end if;
  ids:=ids||jsonb_build_array(ref.id::text);
 end loop;
 if jsonb_array_length(ids)=0 then return null; end if;
 if exists(select 1 from public.project_assets where project_id=p_project and studio_role='product' and upload_status='uploaded' and not removed_from_draft) then
  select * into ref from public.ugc_v3_artifacts where project_id=p_project and kind='product' order by version desc limit 1;
  if not found or ref.approved_at is null or not public.ugc_v3_artifact_current(ref.id) then return null; end if;
  ids:=ids||jsonb_build_array(ref.id::text);
 end if;
 if with_location then
  select * into ref from public.ugc_v3_artifacts where project_id=p_project and kind='location' order by version desc limit 1;
  if not found or ref.approved_at is null or not public.ugc_v3_artifact_current(ref.id) then return null; end if;
  ids:=ids||jsonb_build_array(ref.id::text);
 end if;
 return ids;
end $$;
create or replace function public.ugc_v3_character_cast(p_project uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('characterId',a.id,'name',coalesce(a.reference_name,''),'referenceId',r.id) order by a.created_at,a.id),'[]'::jsonb)
 from public.project_assets a left join lateral (select id from public.ugc_v3_artifacts where project_id=p_project and kind='character' and public.ugc_v3_subject(document)=a.id::text
 and version>public.ugc_v3_subject_floor(p_project,'character',a.id::text) order by version desc limit 1) r on true
 where a.project_id=p_project and a.studio_role='character' and a.upload_status='uploaded' and not a.removed_from_draft
$$;

create or replace function public.ugc_v3_artifact_current(p_artifact uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.ugc_v3_artifacts; ids jsonb; brief jsonb; begin
 select * into a from public.ugc_v3_artifacts where id=p_artifact;
 if not found or a.kind='joined' or a.rejected_at is not null
 or exists(select 1 from public.ugc_v3_reference_deletions where id=a.id and state='prepared')
 or a.version<=public.ugc_v3_subject_floor(a.project_id,a.kind,public.ugc_v3_subject(a.document))
 or exists(select 1 from public.ugc_v3_artifacts n where n.project_id=a.project_id and n.kind=a.kind and public.ugc_v3_same_subject(n.kind,n.document,a.document) and n.version>a.version) then return false; end if;
 if a.kind in ('character','product') then
  if a.document->'input'->'generationContext'->>'visualStyle' is null or a.document->'input'->'generationContext'->>'visualStyle' is distinct from public.ugc_v3_generation_context(a.project_id)->>'visualStyle' then return false; end if;
  return exists(select 1 from public.project_assets pa where pa.project_id=a.project_id and pa.id::text=public.ugc_v3_subject(a.document)
   and pa.studio_role=a.kind and pa.upload_status='uploaded' and not pa.removed_from_draft);
 end if;
 if a.document->'input'->'generationContext' is distinct from public.ugc_v3_generation_context(a.project_id) then return false; end if;
 if a.document->'input' ? 'cast' then
  if a.document->'input'->'cast' is distinct from public.ugc_v3_character_cast(a.project_id) then return false; end if;
 elsif (select count(*) from public.project_assets where project_id=a.project_id and studio_role='character' and upload_status='uploaded' and not removed_from_draft)>1 then return false;
 end if;
 if a.kind='storyboard' then
  select jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,
   'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type) into brief from public.projects p where p.id=a.project_id and p.deleted_at is null;
  if a.document->'input'->>'briefHash' is distinct from public.ugc_package_digest('sceenyk-v3-brief',brief) then return false; end if;
 end if;
 ids:=public.ugc_v3_reference_ids(a.project_id,a.kind='storyboard');
 return ids is not null and a.document->'input'->'references' is not distinct from ids;
end $$;

create or replace function public.ugc_v3_location_input_current(p_project uuid,d jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare brief jsonb; ids jsonb; bindings jsonb; names jsonb; begin
 select jsonb_build_object('id',p.id,'title',p.title,'prompt',p.prompt,'aspect_ratio',p.aspect_ratio,'duration',p.duration,
  'visual_style',p.visual_style,'tone',p.tone,'category',p.category,'ugc_type',p.ugc_type) into brief from public.projects p where p.id=p_project and p.deleted_at is null;
 if brief is null or d->'generationContext' is distinct from public.ugc_v3_generation_context(p_project)
 or d->>'briefHash' is distinct from public.ugc_package_digest('sceenyk-v3-brief',brief) then return false; end if;
 if exists(select 1 from public.ugc_v3_tasks where project_id=p_project and kind in ('character','product') and status in ('queued','running','reconciliation_required')) then return false; end if;
 names:=jsonb_build_object('character',coalesce((select reference_name from public.project_assets where project_id=p_project and studio_role='character' and upload_status='uploaded' and not removed_from_draft order by created_at,id limit 1),''),
  'product',coalesce((select reference_name from public.project_assets where project_id=p_project and studio_role='product' and upload_status='uploaded' and not removed_from_draft limit 1),''));
 if jsonb_array_length(public.ugc_v3_character_cast(p_project))>1 then
  names:=names||jsonb_build_object('characters',(select jsonb_agg(jsonb_build_object('id',a.id,'name',coalesce(a.reference_name,'')) order by a.created_at,a.id) from public.project_assets a where a.project_id=p_project and a.studio_role='character' and a.upload_status='uploaded' and not a.removed_from_draft));
  if d->'cast' is distinct from public.ugc_v3_character_cast(p_project) then return false; end if;
 end if;
 if d->'names' is distinct from names then return false; end if;
 ids:=public.ugc_v3_reference_ids(p_project,false);
 if ids is null then return false; end if;
 select jsonb_agg(jsonb_build_object('id',a.id,'version',a.version,'sha256',a.document->'asset'->>'sha256','role',a.kind) order by ord) into bindings
 from jsonb_array_elements_text(ids) with ordinality r(id,ord) join public.ugc_v3_artifacts a on a.id::text=r.id;
 return d->'references' is not distinct from ids and d->'referenceBindings' is not distinct from bindings;
end $$;

create or replace function public.ugc_v3_source_cast_current(p_project uuid,d jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare cast_doc jsonb:=d->'storyboardContent'->'cast'; c jsonb; begin
 if cast_doc is null then return jsonb_array_length(public.ugc_v3_character_cast(p_project))<=1; end if;
 if cast_doc is distinct from public.ugc_v3_character_cast(p_project)
 or not exists(select 1 from public.ugc_v3_artifacts where id::text=d->'storyboard'->>'id' and project_id=p_project and document->'storyboard'->'cast'=cast_doc) then return false; end if;
 if (select count(*) from jsonb_array_elements(d->'references') r where r->>'role'='character')<>jsonb_array_length(cast_doc) then return false; end if;
 for c in select value from jsonb_array_elements(cast_doc) loop
  if not exists(select 1 from jsonb_array_elements(d->'references') r where r->>'id'=c->>'referenceId' and r->>'characterId'=c->>'characterId' and r->>'name'=c->>'name' and r->>'role'='character') then return false; end if;
 end loop;
 return true;
end $$;
create or replace function public.ugc_v3_cast_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare task_input jsonb; scene jsonb; line jsonb; begin
 if tg_table_name='ugc_v3_sources' then
  if not public.ugc_v3_source_cast_current(new.project_id,new.input) then raise exception 'V3_CHARACTER_BINDINGS_CHANGED'; end if;
 elsif tg_table_name='ugc_v3_artifacts' then
  if new.kind='character' then
   select input into task_input from public.ugc_v3_tasks where id=new.task_id and project_id=new.project_id and kind='character';
   if task_input->>'originalId' is not null and public.ugc_v3_subject(new.document) is distinct from task_input->>'originalId' then raise exception 'V3_CHARACTER_BINDINGS_CHANGED'; end if;
  elsif new.kind='storyboard' and new.document->'input' ? 'cast' then
   if new.document->'storyboard'->'cast' is distinct from new.document->'input'->'cast' then raise exception 'V3_CHARACTER_BINDINGS_CHANGED'; end if;
   for scene in select value from jsonb_array_elements(new.document->'storyboard'->'scenes') loop
    if exists(select 1 from jsonb_array_elements_text(scene->'characterIds') id where not exists(select 1 from jsonb_array_elements(new.document->'input'->'cast') c where c->>'characterId'=id)) then raise exception 'V3_CHARACTER_BINDINGS_INVALID'; end if;
    for line in select value from jsonb_array_elements(scene->'speech') loop
     if (line->>'speaker'='narration' and line->>'characterId' is not null) or (line->>'speaker'='character' and (line->>'characterId' is null or not (scene->'characterIds' ? (line->>'characterId')))) then raise exception 'V3_CHARACTER_SPEAKER_INVALID'; end if;
    end loop;
   end loop;
  end if;
 elsif tg_table_name='ugc_v3_tasks' and new.provider_started and not old.provider_started and new.kind in ('character','location','storyboard') then
  if new.kind='character' and new.input ? 'characterSlot' and (new.input->>'characterSlot' is distinct from new.input->>'originalId' or nullif(btrim(new.input->'referenceSubject'->>'name'),'') is null) then raise exception 'V3_CHARACTER_BINDINGS_INVALID'; end if;
  if (select count(*) from public.project_assets where project_id=new.project_id and studio_role='character' and upload_status='uploaded' and not removed_from_draft)>1
   and not exists(select 1 from public.projects where id=new.project_id and studio_mode='pro') then raise exception 'V3_PRO_CHARACTERS_RETAINED'; end if;
 end if;
 return new;
end $$;
drop trigger if exists a_v3_cast_source on public.ugc_v3_sources;
create trigger a_v3_cast_source before insert on public.ugc_v3_sources for each row execute function public.ugc_v3_cast_guard();
drop trigger if exists a_v3_cast_artifact on public.ugc_v3_artifacts;
create trigger a_v3_cast_artifact before insert or update of document on public.ugc_v3_artifacts for each row execute function public.ugc_v3_cast_guard();
drop trigger if exists a_v3_cast_intent on public.ugc_v3_tasks;
create trigger a_v3_cast_intent before update of provider_started on public.ugc_v3_tasks for each row execute function public.ugc_v3_cast_guard();

-- Apply exact, audited subject predicates to the existing coordinators, keeping
-- their complete owner/lease/receipt/confirmation/authorization behavior intact.
-- Reruns accept only the exact replacement, never an unknown source contract.
create or replace function pg_temp.cast_patch(signature text,before_text text,after_text text) returns void language plpgsql as $$
declare definition text; begin
 if to_regprocedure(signature) is null then raise exception 'Missing M2 function %',signature; end if;
 select pg_get_functiondef(to_regprocedure(signature)) into definition;
 if position(after_text in definition)>0 then return; end if;
 if position(before_text in definition)=0 then raise exception 'Inspect M2 function before patch: %',signature; end if;
 execute replace(definition,before_text,after_text);
end $$;

select pg_temp.cast_patch('public.guard_ugc_v1_reference_limit()',
 '  if exists(select 1 from public.project_assets a where a.project_id=new.project_id',
 $patch$  if new.studio_role='character' and exists(select 1 from public.projects p join public.ugc_v3_projects v on v.project_id=p.id and v.owner_user_id=p.owner_user_id where p.id=new.project_id and p.owner_user_id=new.owner_user_id and p.studio_mode='pro') then
    if exists(select 1 from public.project_assets a where a.project_id=new.project_id and a.studio_role='character' and not a.removed_from_draft and a.reference_id=new.reference_id and a.id<>new.id and a.upload_request_id<>new.upload_request_id) then raise exception 'V3_CHARACTER_SOURCE_DUPLICATE' using errcode='23514'; end if;
    return new;
  end if;
  if exists(select 1 from public.project_assets a where a.project_id=new.project_id$patch$);

select pg_temp.cast_patch('public.ugc_v3_runtime_action(uuid,uuid,text,jsonb)',
 'and t.kind=p_payload->>''kind'' and t.status',
 'and t.kind=p_payload->>''kind'' and public.ugc_v3_same_subject(t.kind,t.input,p_payload->''input'') and t.status');
select pg_temp.cast_patch('public.ugc_v3_package_begin(uuid,uuid,jsonb,jsonb,uuid)',
 '(select count(*) from jsonb_array_elements(p_input->''references'') x where x->>''role''=k)<>1',
 '(select count(*) from jsonb_array_elements(p_input->''references'') x where x->>''role''=k)<>(case when k=''character'' then (select count(*) from public.project_assets where project_id=p_project and studio_role=''character'' and upload_status=''uploaded'' and not removed_from_draft) else 1 end)');
select pg_temp.cast_patch('public.ugc_v3_runtime_current(uuid)',
 'latest.kind in (''character'',''product'',''location'')',
 'latest.kind in (''character'',''product'',''location'') and (latest.kind<>''character'' or exists(select 1 from public.project_assets source where source.project_id=p.project_id and source.id::text=public.ugc_v3_subject(latest.document) and source.studio_role=''character'' and source.upload_status=''uploaded'' and not source.removed_from_draft))');
select pg_temp.cast_patch('public.ugc_v3_runtime_current(uuid)',
 'n.kind=latest.kind and n.version>latest.version',
 'n.kind=latest.kind and public.ugc_v3_same_subject(n.kind,n.document,latest.document) and n.version>latest.version');
select pg_temp.cast_patch('public.ugc_v3_runtime_current(uuid)',
 'newer.kind=a.kind and newer.version>a.version',
 'newer.kind=a.kind and public.ugc_v3_same_subject(newer.kind,newer.document,a.document) and newer.version>a.version');
select pg_temp.cast_patch('public.ugc_v3_runtime_current(uuid)',
 's.project_input_hash=public.ugc_v3_brief_hash(p.project_id)',
 's.project_input_hash=public.ugc_v3_brief_hash(p.project_id) and public.ugc_v3_source_cast_current(p.project_id,s.input)');

select pg_temp.cast_patch('public.ugc_v3_regenerate_reference(uuid,uuid,jsonb)',
 'project_id=p_project and kind=k and state=''prepared''',
 'project_id=p_project and kind=k and (k<>''character'' or subject_id is null or subject_id::text=p_payload->''input''->>''originalId'') and state=''prepared''');
select pg_temp.cast_patch('public.ugc_v3_regenerate_reference(uuid,uuid,jsonb)',
 'a.project_id=p_project and a.kind=k and a.version>',
 'a.project_id=p_project and a.kind=k and public.ugc_v3_same_subject(k,a.document,p_payload->''input'') and a.version>');
select pg_temp.cast_patch('public.ugc_v3_regenerate_reference(uuid,uuid,jsonb)',
 'project_id=p_project and kind=k and state=''completed''',
 'project_id=p_project and kind=k and (k<>''character'' or subject_id is null or subject_id::text=p_payload->''input''->>''originalId'') and state=''completed''');

select pg_temp.cast_patch('public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb)',
 'if p_mode=''regenerate'' then',
 'if p_mode=''regenerate'' then
  if p_input ? ''characterSlot'' and (p_input->>''characterSlot'' is distinct from public.ugc_v3_subject(a.document) or public.ugc_v3_subject(p_input) is distinct from public.ugc_v3_subject(a.document)) then raise exception ''V3_REFERENCE_SOURCE_STALE''; end if;');
select pg_temp.cast_patch('public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb)',
 'n.kind=p_kind and n.version>a.version',
 'n.kind=p_kind and public.ugc_v3_same_subject(n.kind,n.document,a.document) and n.version>a.version');
select pg_temp.cast_patch('public.ugc_v3_reference_delete_prepare(uuid,uuid,text,uuid,integer,text,jsonb)',
 '(t.kind=p_kind or coalesce(t.input->''references'',''[]'') ? p_id::text)',
 '(t.kind=p_kind and public.ugc_v3_same_subject(t.kind,t.input,a.document) or coalesce(t.input->''references'',''[]'') ? p_id::text)');
select pg_temp.cast_patch('public.ugc_v3_preserve_approved_reference()',
 'n.kind=a.kind and n.version>a.version',
 'n.kind=a.kind and public.ugc_v3_same_subject(n.kind,n.document,a.document) and n.version>a.version');
select pg_temp.cast_patch('public.ugc_v3_reference_cleanup_guard()',
 '(new.kind=d.kind or coalesce(new.input->''references'',''[]'') ? d.id::text)',
 '(new.kind=d.kind and (new.kind<>''character'' or d.subject_id is null or d.subject_id::text=public.ugc_v3_subject(new.input)) or coalesce(new.input->''references'',''[]'') ? d.id::text)');
select pg_temp.cast_patch('public.ugc_v3_discard_reference_prepare(uuid,uuid,uuid,integer,boolean)',
 'n.kind=a.kind and n.version>a.version',
 'n.kind=a.kind and public.ugc_v3_same_subject(n.kind,n.document,a.document) and n.version>a.version');
select pg_temp.cast_patch('public.ugc_v3_discard_reference_prepare(uuid,uuid,uuid,integer,boolean)',
 'coalesce((select max(artifact_version) from public.ugc_v3_reference_deletions where project_id=p_project and kind=a.kind and state=''completed''),0)',
 'public.ugc_v3_subject_floor(p_project,a.kind,public.ugc_v3_subject(a.document))');
select pg_temp.cast_patch('public.ugc_v3_discard_reference_prepare(uuid,uuid,uuid,integer,boolean)',
 'project_id=p_project and kind=a.kind and state=''prepared'' and id<>p_id',
 'project_id=p_project and kind=a.kind and (a.kind<>''character'' or subject_id is null or subject_id::text=public.ugc_v3_subject(a.document)) and state=''prepared'' and id<>p_id');
select pg_temp.cast_patch('public.ugc_v3_queue_reference_cleanup(uuid,uuid,boolean)',
 'newer.kind=x.kind and newer.version>x.version',
 'newer.kind=x.kind and public.ugc_v3_same_subject(newer.kind,newer.document,x.document) and newer.version>x.version');
select pg_temp.cast_patch('public.ugc_v3_queue_reference_cleanup(uuid,uuid,boolean)',
 'coalesce((select max(artifact_version) from public.ugc_v3_reference_deletions where project_id=p_project and kind=x.kind and state=''completed''),0)',
 'public.ugc_v3_subject_floor(p_project,x.kind,public.ugc_v3_subject(x.document))');
select pg_temp.cast_patch('public.ugc_v3_replace_unusable_reference_task(uuid,uuid,uuid,jsonb)',
 'project_id=p_project and kind=t.kind order by created_at desc,id desc limit 1',
 'project_id=p_project and kind=t.kind and public.ugc_v3_same_subject(kind,input,t.input) order by created_at desc,id desc limit 1');
select pg_temp.cast_patch('public.ugc_v3_runtime_read(uuid,uuid)',
 'return public.ugc_v3_read(p_owner,p_project)||jsonb_build_object(',
 'return jsonb_set(public.ugc_v3_read(p_owner,p_project),''{project,studio_mode}'',to_jsonb((select studio_mode from public.projects where id=p_project)),true)||jsonb_build_object(');
select pg_temp.cast_patch('public.ugc_v3_runtime_read(uuid,uuid)',
 '''artifact_version'',artifact_version,''state'',state',
 '''artifact_version'',artifact_version,''subjectId'',subject_id,''state'',state');

revoke all on function public.ugc_v3_subject(jsonb),public.ugc_v3_same_subject(text,jsonb,jsonb),public.ugc_v3_subject_floor(uuid,text,text),public.ugc_v3_character_receipt_subject(),public.ugc_v3_reference_ids(uuid,boolean),public.ugc_v3_character_cast(uuid),public.ugc_v3_source_cast_current(uuid,jsonb),public.ugc_v3_cast_guard() from public,anon,authenticated,service_role;
grant execute on function public.ugc_v3_subject(jsonb),public.ugc_v3_same_subject(text,jsonb,jsonb),public.ugc_v3_subject_floor(uuid,text,text),public.ugc_v3_reference_ids(uuid,boolean),public.ugc_v3_character_cast(uuid),public.ugc_v3_source_cast_current(uuid,jsonb) to service_role;
-- Existing function/table ACLs, RLS, trigger identities and historical rows remain.
commit;
