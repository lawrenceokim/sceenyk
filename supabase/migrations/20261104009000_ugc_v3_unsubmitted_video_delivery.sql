-- Provider-free refresh of delivery credentials for the SAME definitely unsubmitted run.
-- Manual after 089. No backfill, new execution, authority renewal or provider call.
begin;
do $$ declare t text; c text; begin
 for t,c in select * from (values
  ('ugc_v3_projects','project_id'),('ugc_v3_projects','owner_user_id'),('projects','id'),('projects','deleted_at'),
  ('ugc_v3_runs','id'),('ugc_v3_runs','project_id'),('ugc_v3_runs','package_id'),('ugc_v3_runs','authorization_id'),
  ('ugc_v3_runs','intent'),('ugc_v3_runs','state'),('ugc_v3_runs','observation'),('ugc_v3_runs','result'),
  ('ugc_v3_tasks','id'),('ugc_v3_tasks','project_id'),('ugc_v3_tasks','kind'),('ugc_v3_tasks','input'),
  ('ugc_v3_tasks','status'),('ugc_v3_tasks','provider_started'),('ugc_v3_tasks','lease_until'),('ugc_v3_tasks','lease_token'),
  ('ugc_v3_tasks','error_code'),('ugc_v3_tasks','available_at'),('ugc_v3_tasks','output'),
  ('ugc_v3_packages','id'),('ugc_v3_packages','project_id'),('ugc_v3_packages','package_hash'),('ugc_v3_packages','version'),
  ('ugc_v3_run_authorizations','id'),('ugc_v3_run_authorizations','project_id'),('ugc_v3_run_authorizations','package_id'),('ugc_v3_run_authorizations','document'),
  ('ugc_v3_runtime_events','project_id'),('ugc_v3_runtime_events','entity_id'),('ugc_v3_runtime_events','kind'),('ugc_v3_runtime_events','document')) v(t,c)
 loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=c)
   then raise exception 'Verify unsubmitted video prerequisite %.%',t,c; end if;
 end loop;
 if to_regprocedure('public.ugc_v3_runtime_current(uuid)') is null or to_regprocedure('public.ugc_package_digest(text,jsonb)') is null
  then raise exception 'Verify V3 currentness and canonical hashing prerequisites'; end if;
end $$;

create or replace function public.ugc_v3_refresh_video_delivery(p_owner uuid,p_project uuid,p_run uuid,p_previous_hash text,p_intent jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.ugc_v3_runs; t public.ugc_v3_tasks; a public.ugc_v3_run_authorizations; p public.ugc_v3_packages; begin
 perform 1 from public.ugc_v3_projects where project_id=p_project and owner_user_id=p_owner for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found then raise exception 'FRESH_V3_PROJECT_REQUIRED'; end if;
 -- Match checkpoint lock order (task, then run). A claimed or previously started task refuses refresh.
 select * into t from public.ugc_v3_tasks where project_id=p_project and kind='video' and input->>'runId'=p_run::text for update;
 if t.id is null or t.provider_started or t.status not in ('queued','reconciliation_required') or t.lease_until>now()
  then raise exception 'V3_UNSUBMITTED_REQUEST_REQUIRED'; end if;
 select * into r from public.ugc_v3_runs where id=p_run and project_id=p_project for update;
 if r.id is null or r.state<>'queued' or r.observation is not null or r.result is not null
  then raise exception 'V3_UNSUBMITTED_REQUEST_REQUIRED'; end if;
 if r.intent->>'hash' is distinct from p_previous_hash then raise exception 'V3_REVIEW_SNAPSHOT_CHANGED'; end if;
 select * into p from public.ugc_v3_packages where id=r.package_id and project_id=p_project;
 select * into a from public.ugc_v3_run_authorizations where id=r.authorization_id and project_id=p_project and package_id=r.package_id;
 if p.id is null or a.id is null or not public.ugc_v3_runtime_current(r.package_id)
  or r.package_id is distinct from (select id from public.ugc_v3_packages where project_id=p_project order by version desc limit 1)
  or a.document is distinct from r.intent->'authorization' or (a.document->>'expiresAt')::timestamptz is null or (a.document->>'expiresAt')::timestamptz<=now()
  or a.document->>'packageHash' is distinct from p.package_hash then raise exception 'V3_AUTHORIZATION_INVALID'; end if;
 -- Only signed image delivery, its expiry and the corresponding hashes may change.
 if (p_intent-array['body','bodyHash','deliveryExpiresAt','hash']) is distinct from (r.intent-array['body','bodyHash','deliveryExpiresAt','hash'])
  or ((p_intent->'body')-'image_urls') is distinct from ((r.intent->'body')-'image_urls')
  or jsonb_typeof(p_intent->'body'->'image_urls') is distinct from 'array'
  or jsonb_array_length(p_intent->'body'->'image_urls') is distinct from jsonb_array_length(r.intent->'body'->'image_urls')
  or exists(select 1 from jsonb_array_elements_text(p_intent->'body'->'image_urls') with ordinality n(url,ord)
   where n.url !~ '^https://' or split_part(n.url,'?',1) is distinct from split_part(r.intent->'body'->'image_urls'->>(n.ord::integer-1),'?',1))
  or (p_intent->>'deliveryExpiresAt')::timestamptz is null or (p_intent->>'deliveryExpiresAt')::timestamptz<=now()
  or p_intent->>'bodyHash' is distinct from encode(sha256(convert_to(public.ugc_package_canonical(p_intent->'body'),'UTF8')),'hex')
  or p_intent->>'hash' is distinct from public.ugc_package_digest('sceenyk-v3-paid-intent',p_intent-'hash')
  then raise exception 'V3_DELIVERY_BINDING_INVALID'; end if;
 -- Retain the complete old intent as private audit evidence. The DTO exposes no events or URLs.
 insert into public.ugc_v3_runtime_events(project_id,entity_id,kind,document) values(p_project,p_run,'video_delivery_refreshed',
  jsonb_build_object('previousIntent',r.intent,'intentHash',p_intent->>'hash','bodyHash',p_intent->>'bodyHash','deliveryExpiresAt',p_intent->>'deliveryExpiresAt'));
 update public.ugc_v3_runs set intent=p_intent where id=r.id;
 update public.ugc_v3_tasks set status='queued',error_code=null,output=null,lease_token=null,lease_until=null,available_at=now() where id=t.id;
 return true;
end $$;
revoke all on function public.ugc_v3_refresh_video_delivery(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ugc_v3_refresh_video_delivery(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
