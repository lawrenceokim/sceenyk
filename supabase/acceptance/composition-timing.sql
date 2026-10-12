-- Run the WHOLE file in Supabase SQL Editor after migration 015.
-- Read-only against public application data. All writes/functions are in this
-- session's pg_temp schema and are rolled back. No providers or R2 writes.
-- Uses the deployed planner's exact function definitions and existing measured
-- media. Counterfactual windows test conflicts without modifying real plans.
begin;
set local statement_timeout='30s';

create temporary table generation_jobs (like public.generation_jobs including all) on commit drop;
create temporary table generation_plans (like public.generation_plans including all) on commit drop;
create temporary table generation_reservations (like public.generation_reservations including all) on commit drop;
create temporary table scene_executions (like public.scene_executions including all) on commit drop;
create temporary table project_assets (like public.project_assets including all) on commit drop;
create temporary table prepared_segments (like public.prepared_segments including all) on commit drop;
create temporary table narration_segments (like public.narration_segments including all) on commit drop;
create temporary table narration_assets (like public.narration_assets including all) on commit drop;
create temporary table scene_assets (like public.scene_assets including all) on commit drop;
create temporary table composition_asset_checks (like public.composition_asset_checks including all) on commit drop;
create temporary table composition_plans (like public.composition_plans including all) on commit drop;
create temporary table composition_acceptance_results(scenario text,status text,total_ms integer,issues jsonb,passed boolean) on commit drop;

insert into pg_temp.generation_jobs select * from public.generation_jobs where id in ('aa88b9ac-9542-4138-93b6-e5861a96e1df','59a5c925-722a-418b-abb2-9f56f8f89983');
insert into pg_temp.generation_plans select * from public.generation_plans where job_id in (select id from pg_temp.generation_jobs);
insert into pg_temp.generation_reservations select * from public.generation_reservations where job_id in (select id from pg_temp.generation_jobs);
insert into pg_temp.scene_executions select * from public.scene_executions where job_id in (select id from pg_temp.generation_jobs);
insert into pg_temp.project_assets select a.* from public.project_assets a where exists(select 1 from pg_temp.generation_jobs j where a.project_id=j.project_id and a.owner_user_id=j.owner_user_id);
insert into pg_temp.prepared_segments select a.* from public.prepared_segments a where a.id in (select prepared_asset_id from pg_temp.scene_executions);
insert into pg_temp.narration_segments select * from public.narration_segments where job_id in (select id from pg_temp.generation_jobs);
insert into pg_temp.narration_assets select * from public.narration_assets where job_id in (select id from pg_temp.generation_jobs);
insert into pg_temp.scene_assets select * from public.scene_assets where job_id in (select id from pg_temp.generation_jobs);

do $$
declare signature text; definition text;
begin
  -- No manually reimplemented planner: copy the currently deployed functions,
  -- changing only their schema references to the private temporary fixtures.
  foreach signature in array array[
    'public.composition_asset_ref(uuid,text)',
    'public.claim_composition_generation(uuid,text,jsonb)',
    'public.record_composition_asset_check(uuid,text,uuid,text,integer,text)',
    'public.finish_composition_generation(uuid,text)'
  ] loop
    definition:=replace(pg_get_functiondef(signature::regprocedure),'public.','pg_temp.');
    execute definition;
  end loop;
end;
$$;

do $$
declare scenario text; job uuid; run_id text; claim text; result text; s pg_temp.scene_executions; a jsonb; track text; measured_ms integer; p jsonb; successful boolean;
begin
  if not exists(select 1 from public.composition_plans where job_id='aa88b9ac-9542-4138-93b6-e5861a96e1df' and status='ready') then
    raise exception 'Complete positive deployed composition acceptance first.';
  end if;
  foreach scenario in array array['actual_timeline','narration_overflow','visual_shortfall','fal_trim'] loop
    job:=case when scenario='fal_trim' then '59a5c925-722a-418b-abb2-9f56f8f89983'::uuid else 'aa88b9ac-9542-4138-93b6-e5861a96e1df'::uuid end;
    truncate pg_temp.composition_plans,pg_temp.composition_asset_checks;
    update pg_temp.generation_jobs set composition_run_id=null,composition_started_at=null,composition_pending_at=null,composition_ready_at=null,composition_configuration=null;
    update pg_temp.generation_plans t set plan=o.plan from public.generation_plans o where o.job_id=t.job_id;
    update pg_temp.scene_executions t set duration_seconds=o.duration_seconds from public.scene_executions o where o.id=t.id;
    if scenario in ('narration_overflow','visual_shortfall') then
      update pg_temp.generation_plans set plan=jsonb_set(jsonb_set(plan,'{scenePlan,0,durationSeconds}',case when scenario='narration_overflow' then '1.2'::jsonb else '6'::jsonb end),'{scenePlan,1,durationSeconds}',case when scenario='narration_overflow' then '8.8'::jsonb else '4'::jsonb end) where job_id=job;
      update pg_temp.scene_executions set duration_seconds=case when scenario='narration_overflow' then case when scene_order=1 then 1.2 else 8.8 end else case when scene_order=1 then 6 else 4 end end where job_id=job;
    elsif scenario='fal_trim' then
      -- Historical visual-only generation: a temporary voice-stage handoff
      -- isolates its existing fal visual timing; no hosted readiness is forged.
      update pg_temp.generation_jobs set current_stage='voice',audio_ready_at=now() where id=job;
    end if;
    run_id:='temporary-acceptance-'||scenario;
    claim:=pg_temp.claim_composition_generation(job,run_id,'{"schema_version":1,"narration_offset_ms":400,"technical_tolerance_ms":0}'::jsonb);
    if claim<>'claimed' then raise exception 'Temporary fixture could not claim: %',scenario; end if;
    for s in select * from pg_temp.scene_executions where job_id=job order by scene_order loop
      foreach track in array array['visual','narration'] loop
        a:=pg_temp.composition_asset_ref(s.id,track); if a is null then continue; end if;
        measured_ms:=(a->>'duration_ms')::integer;
        if a->>'kind'='scene_asset' then
          -- Independently FFprobed real private R2 object, SHA256
          -- 7ef483cb2e46b00e81a58d5d5e5bc7f0e5e1f3157cb92e00cc71debeb3308834.
          if a->>'id'<>'c866887f-b308-4475-8d01-723c0a2417f7' then raise exception 'Unmeasured fixture visual.'; end if;
          measured_ms:=5042;
        end if;
        if not pg_temp.record_composition_asset_check(job,run_id,s.id,track,measured_ms,null) then raise exception 'Temporary media check failed.'; end if;
      end loop;
    end loop;
    result:=pg_temp.finish_composition_generation(job,run_id);
    select plan into p from pg_temp.composition_plans where job_id=job;
    successful:=case scenario
      when 'actual_timeline' then result='ready' and (p->>'total_duration_ms')::integer=10000 and (p->'scenes'->0->'narration'->>'start_ms')::integer=400 and (p->'scenes'->0->'narration'->>'end_ms')::integer=1680 and p->'scenes'->1->'narration'='null'::jsonb
      when 'narration_overflow' then result='conflict' and p->'issues' @> '[{"code":"NARRATION_TOO_LONG","scene_order":1}]'::jsonb
      when 'visual_shortfall' then result='conflict' and p->'issues' @> '[{"code":"VISUAL_TOO_SHORT","scene_order":1}]'::jsonb
      when 'fal_trim' then exists(select 1 from jsonb_array_elements(p->'scenes') e where e->'visual'->>'asset_id'='c866887f-b308-4475-8d01-723c0a2417f7' and (e->'visual'->>'actual_duration_ms')::integer=5042 and (e->'visual'->>'input_start_ms')::integer=0 and (e->'visual'->>'input_end_ms')::integer=5000 and not exists(select 1 from jsonb_array_elements(p->'issues') i where (i->>'scene_order')::integer=(e->>'scene_order')::integer and i->>'code'='VISUAL_TOO_SHORT'))
    end;
    successful:=successful and exists(select 1 from pg_temp.generation_reservations where job_id=job and state='reserved');
    if successful is not true then raise exception 'Timing acceptance failed: %',scenario; end if;
    insert into pg_temp.composition_acceptance_results values(scenario,result,(p->>'total_duration_ms')::integer,p->'issues',successful);
    raise notice 'Composition acceptance PASS: %, status=%, total_ms=%, hold=reserved',scenario,result,p->>'total_duration_ms';
  end loop;
end;
$$;
select scenario,status,total_ms,issues,passed from pg_temp.composition_acceptance_results order by scenario;
rollback;
