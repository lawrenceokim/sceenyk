// All data/RPC execution below is inside isolated in-memory PostgreSQL fixtures.
// No connected DB, provider, storage, worker or historical record is accessed.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite(); let checks = 0;
const scalar = async (sql, values = []) => (await pg.query(sql, values)).rows[0].value;
try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  const migration = "20261026006200_ugc_character_v5_front_framing.sql";
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file < migration).sort();
  for (const file of files) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  const preserved = async () => (await pg.query("select oid,prosrc,proacl from pg_proc where pronamespace='public'::regnamespace and proname <> 'ugc_character_v5_checkpoint' order by oid")).rows;
  const before = await preserved(); const sql = fs.readFileSync(`supabase/migrations/${migration}`, "utf8");
  await pg.exec(sql); await pg.exec(sql);
  assert.deepEqual(await preserved(), before); checks++;
  for (const signature of ["ugc_character_v5_action(uuid,uuid,uuid,integer,text,text,integer)", "ugc_character_v5_checkpoint(uuid,uuid,uuid,text,jsonb)"]) {
    assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE') and not has_function_privilege('authenticated',$1,'EXECUTE') and not has_function_privilege('anon',$1,'EXECUTE') value", [`public.${signature}`]), true); checks++;
  }
  const owner = randomUUID();
  await pg.query("insert into public.app_users(id,clerk_user_id) values($1,'isolated-front-fixture')", [owner]);
  const artifact = (workflow, project, job, id) => ({ id, storageKey: `ugc/${owner}/${project}/${job}/character-v5/${workflow}/candidates/${id}.png`,
    etag: `etag-${id}`, sha256: "a".repeat(64), sizeBytes: 1024, width: 720, height: 1080, mimeType: "image/png" });
  const generation = { promptVersion: 5, contractVersion: 5, revision: "simple-manual-review-v1", model: "higgsfield-ai/soul/v2/image-to-image",
    slot: "front_source", promptRevision: 4, frontPreparation: "provider-final-v1", batchSize: 1, resolution: "720p", aspectRatio: "2:3",
    frontFraming: { shouldersExpectedInFrame: true, shoesExpectedInFrame: true, torsoAndLegsExpectedInFrame: true, emptyGrayMarginRequired: true, headAndFaceAllowed: false, backgroundOrFloorShadowAllowed: false },
    enhancePrompt: false, soulId: null, soulIdUsed: false, prompt: "fixture" };
  async function scenario(withBack) {
    const project = randomUUID(); const job = randomUUID(); const workflow = randomUUID(); const candidate = randomUUID();
    const face = artifact(workflow, project, job, randomUUID());
    const back = artifact(workflow, project, job, randomUUID()); const front = artifact(workflow, project, job, candidate);
    await pg.query("insert into public.projects(id,owner_user_id,title,category,aspect_ratio,duration,visual_style,tone,creation_type,ugc_type) values($1,$2,'Front fixture','transformation','9:16','10','Original','Professional','ugc','advertisement')", [project, owner]);
    await pg.query("insert into public.ugc_generation_jobs(id,owner_user_id,project_id,idempotency_key,status,stage,resume_stage,input_snapshot,pause_reason,validation_completed_at,analysis_version,analysis_model) values($1,$2,$3,$4,'queued','character_reference','character_reference','{}','CHARACTER_REFERENCE_NOT_IMPLEMENTED',clock_timestamp(),1,'isolated-fixture')", [job, owner, project, randomUUID()]);
    await pg.query("insert into public.ugc_character_v5_workflows(id,job_id,owner_user_id,project_id,slot,state,accepted) values($1,$2,$3,$4,'front_source','review',$5)", [workflow, job, owner, project, JSON.stringify({ face, ...(withBack ? { back } : {}) })]);
    const source = { id: face.id, storageKey: face.storageKey, sha256: face.sha256, etag: face.etag, kind: "accepted_face" };
    await pg.query("insert into public.ugc_character_v5_candidates(id,workflow_id,slot,state,artifact,generation,input_asset) values($1,$2,'front_source','review',$3,$4,$5)", [candidate, workflow, JSON.stringify(front), JSON.stringify(generation), JSON.stringify(source)]);
    await pg.query("update public.ugc_character_v5_workflows set candidate_id=$2 where id=$1", [workflow, candidate]);
    return { project, job, workflow, candidate, face, back, front, source };
  }
  const action = (s, version, name, slot = null, crop = null, actor = owner) => scalar("select public.ugc_character_v5_action($1,$2,$3,$4,$5,$6,$7) value", [actor, s.project, s.job, version, name, slot, crop]);
  for (const withBack of [true, false]) {
    const s = await scenario(withBack);
    assert.equal(await action(s, 1, "accept", null, null, randomUUID()), null); checks++;
    assert.equal(await action(s, 99, "accept"), null); checks++;
    assert.equal(await action(s, 1, "crop", "front", 2000), null); checks++;
    const accepted = await action(s, 1, "accept");
    assert.equal(accepted.slot, withBack ? "sheet" : "back"); checks++;
    assert.deepEqual(accepted.accepted.front, s.front); checks++;
    assert.deepEqual(accepted.accepted.front_source, s.front); checks++;
    assert.equal(await scalar("select count(*)::int value from public.ugc_character_v5_candidates where workflow_id=$1 and slot='front'", [s.workflow]), 0); checks++;
    if (!withBack) {
      await pg.query("update public.ugc_character_v5_candidates set state='review',artifact=$2 where id=$1", [accepted.candidate_id, JSON.stringify(s.back)]);
      await pg.query("update public.ugc_character_v5_workflows set state='review' where id=$1", [s.workflow]);
      const afterBack = await action(s, accepted.version, "accept");
      assert.equal(afterBack.slot, "sheet"); checks++;
      assert.deepEqual(afterBack.accepted.front, s.front); checks++;
    }
  }
  const independent = await scenario(false);
  await pg.query("update public.ugc_character_v5_candidates set state='failed',artifact=null where id=$1", [independent.candidate]);
  await pg.query("update public.ugc_character_v5_workflows set state='failed',slot='back' where id=$1", [independent.workflow]);
  const queued = await action(independent, 1, "regenerate", "front_source");
  assert.equal(queued.slot, "front_source"); checks++;
  assert.equal(queued.accepted.back, undefined); checks++;
  // New submission intent must bind its reference to the exact accepted Face.
  const token = randomUUID();
  await pg.query("update public.ugc_character_v5_workflows set state='running',claim_token=$2,lease_expires_at=clock_timestamp()+interval '90 seconds' where id=$1", [independent.workflow, token]);
  const payload = { plannedKey: artifact(independent.workflow, independent.project, independent.job, queued.candidate_id).storageKey,
    generation, inputAsset: independent.source };
  const intent = data => scalar("select public.ugc_character_v5_checkpoint($1,$2,$3,'intent',$4) value", [independent.workflow, token, queued.candidate_id, JSON.stringify(data)]);
  assert.equal(await intent({ ...payload, inputAsset: { ...independent.source, kind: "accepted_back" } }), null); checks++;
  assert.equal(await intent({ ...payload, inputAsset: { ...independent.source, storageKey: "private/original.png" } }), null); checks++;
  assert.equal(await intent({ ...payload, generation: { ...generation, enhancePrompt: true } }), null); checks++;
  for (const invalid of [{ aspectRatio: '4:3' }, { batchSize: 4 }, { frontFraming: null }, { frontFraming: { ...generation.frontFraming, shoesExpectedInFrame: false } }]) {
    assert.equal(await intent({ ...payload, generation: { ...generation, ...invalid } }), null); checks++;
  }
  assert.equal(await intent({ ...payload, inputAsset: { ...independent.source, kind: 'original_upload' } }), null); checks++;
  const submitted = await intent(payload);
  assert.equal(submitted.state, "intent"); checks++;
  assert.equal(submitted.input_asset.id, independent.face.id); checks++;
  // Unknown intent must remain fenced against another generation.
  await pg.query("update public.ugc_character_v5_workflows set state='failed',claim_token=null,lease_expires_at=null where id=$1", [independent.workflow]);
  assert.equal(await action(independent, queued.version, "regenerate", "front_source"), null); checks++;
  const absentFace = await scenario(false);
  await pg.query("update public.ugc_character_v5_candidates set state='failed',artifact=null where id=$1", [absentFace.candidate]);
  await pg.query("update public.ugc_character_v5_workflows set state='failed',accepted='{}' where id=$1", [absentFace.workflow]);
  assert.equal(await action(absentFace, 1, "regenerate", "front_source"), null); checks++;
  const fresh = await scenario(false);
  await pg.query("update public.ugc_character_v5_candidates set state='failed',artifact=null where id=$1", [fresh.candidate]);
  await pg.query("insert into public.ugc_character_v5_candidates(id,workflow_id,slot,state,artifact) values($1,$2,'face','review',$3)", [fresh.face.id, fresh.workflow, JSON.stringify(fresh.face)]);
  await pg.query("update public.ugc_character_v5_workflows set slot='face',state='review',candidate_id=$2,accepted='{}' where id=$1", [fresh.workflow, fresh.face.id]);
  const afterFace = await action(fresh, 1, "accept");
  assert.equal(afterFace.slot, "front_source"); checks++;
  assert.equal(afterFace.accepted.back, undefined); checks++;
  console.info(JSON.stringify({ checks, migrations: files.length + 1, rerun062: true, isolatedFixturesOnly: true, providerCalls: 0, connectedDatabaseCalls: 0 }));
} catch (error) { console.error("Front final schema fixture failed:", error.message, error.code ?? "", error.where ?? ""); process.exitCode = 1; }
finally { await pg.close(); }
