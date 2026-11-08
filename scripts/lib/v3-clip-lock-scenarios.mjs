import assert from 'node:assert/strict';
import fs from 'node:fs';
import { typescriptLoader } from './load-typescript.mjs';

// Only called by the disposable PGlite harness. No external database/provider I/O.
export async function clipLockChecks(h, phase, project, doc) {
 const {pg,owner,call,post,read,load,equal,ok}=h;
 const locks=async()=>(await pg.query('select * from public.ugc_v3_creative_locks where project_id=$1 order by revision',[project])).rows;
 const fingerprint=async()=>(await pg.query(`select
  (select jsonb_agg(to_jsonb(r) order by id) from public.ugc_v3_runs r where project_id=$1) runs,
  (select jsonb_agg(document order by id) from public.ugc_v3_packages where project_id=$1) packages,
  (select jsonb_agg(document order by id) from public.ugc_v3_quotes where project_id=$1) quotes,
  (select jsonb_agg(document order by id) from public.ugc_v3_artifacts where project_id=$1) artifacts,
  (select jsonb_agg(document order by id) from public.ugc_v3_run_authorizations where project_id=$1) grants`,[project])).rows[0];
 const blocked=async(sql,args=[project],pattern=/V3_CREATIVE_INPUTS_LOCKED/)=>{await assert.rejects(()=>pg.query(sql,args),pattern);ok(true);};
 if(phase==='before') {
  equal(await locks(),[]);
  // Approved package/estimate grants remain immutable but do not lock the draft.
  await pg.exec('begin');
  try {
   await pg.query("update public.projects set prompt=prompt||' pre-lock edit' where id=$1",[project]);
   await pg.query("update public.project_assets set reference_name='Pre-lock name' where project_id=$1 and studio_role='character'",[project]);
   equal(await call('ugc_v3_runtime_current',[doc.id]),false);
   equal(await locks(),[]);
  } finally { await pg.exec('rollback'); }
  equal(await call('ugc_v3_runtime_current',[doc.id]),true);
  return;
 }
 const first=(await locks()).at(-1);ok(first);equal(first.state,'locked');equal(first.package_id,doc.id);
 equal(first.document.package.hash,doc.hash);equal(first.document.source.input,doc.source);
 equal(first.document.quote.packageHash,doc.hash);equal(first.document.brief.id,project);
 equal(first.snapshot_hash,load('lib/final-video-generation-v3/identity.ts').v3Digest('creative-lock-v1',first.document));
 if(phase==='first') {
  equal(first.origin,'first_clip');equal(first.document.approvedRuns.length,1);
  ok(first.document.approvedRuns[0].completedAt);equal(first.first_run_id,first.document.approvedRuns[0].id);
  const unchanged=await fingerprint();
  for(const [signature,server] of [['ugc_v3_recover_clip_lock(uuid,uuid)',true],['ugc_v3_clip_lock_setup()',true],['ugc_v3_capture_clip_lock(uuid,uuid,boolean)',false],['ugc_v3_runtime_read_before_clip_lock(uuid,uuid)',false]]) {
   equal((await pg.query("select has_function_privilege('authenticated',$1,'EXECUTE') browser,has_function_privilege('service_role',$1,'EXECUTE') server",['public.'+signature])).rows[0],{browser:false,server});
  }
  equal((await pg.query("select has_table_privilege('authenticated','public.ugc_v3_creative_locks','SELECT') browser,has_table_privilege('service_role','public.ugc_v3_creative_locks','INSERT') insert",[])).rows[0],{browser:false,insert:false});
  await blocked("update public.projects set prompt=prompt||' forbidden' where id=$1");
  await blocked("update public.project_assets set removed_from_draft=true where project_id=$1");
  const media=typescriptLoader({'@/lib/auth/ensure-app-user':{ensureAppUser:async()=>({id:owner})},
   '@/lib/db/server':{createDatabaseClient:()=>h.db},'@/lib/storage/server':{}})('lib/media/server.ts');
  await assert.rejects(()=>media.removeOwnedStudioReference({projectId:project,assetId:first.document.originals[0].id}),
   error=>error instanceof media.MediaAccessError && error.code==='CONFLICT' && error.message.includes('locked'));ok(true);
  await blocked("update public.ugc_v3_sources set created_at=now() where project_id=$1");
  await blocked("update public.ugc_v3_packages set document=document where project_id=$1");
  await blocked("update public.ugc_v3_quotes set document=document where project_id=$1");
  await blocked("update public.ugc_v3_run_authorizations set document=document where project_id=$1");
  await blocked("insert into public.ugc_v3_authorizations(id,project_id,package_id,document,authorization_hash) values(gen_random_uuid(),$1,$2,'{}',repeat('1',64))",[project,doc.id]);
  await blocked("update public.ugc_v3_artifacts set approved_at=null where project_id=$1 and kind='storyboard'");
  await blocked("delete from public.ugc_v3_runs where project_id=$1 and state='approved'",[project],/V3_APPROVED_CLIP_PRESERVED/);
  await blocked("delete from public.ugc_v3_creative_locks where project_id=$1",[project],/V3_CREATIVE_LOCK_IMMUTABLE/);
  await blocked("update public.ugc_v3_creative_locks set document='{}' where project_id=$1",[project],/V3_CREATIVE_LOCK_IMMUTABLE/);
  for(const action of [{action:'storyboard'},{action:'reference',kind:'location'},{action:'build_package'}]) {
   const result=await post(project,action);equal(result.status,409);equal(result.body.code,'V3_CREATIVE_INPUTS_LOCKED');
  }
  equal(await fingerprint(),unchanged);
  const packageReader=load('lib/final-video-generation-v3/package.ts');
  const tampered=JSON.parse(JSON.stringify(doc));tampered.source.direction+=' tampered';
  packageReader.pinApprovedPackage(tampered,doc.hash);
  assert.throws(()=>packageReader.readFrozenPackage(tampered),/PACKAGE_INTEGRITY_INVALID/);ok(true);
  await pg.exec('begin');
  try {
   // Old admission implementations becoming unavailable cannot invalidate the
   // new immutable evidence path; unlocked projects still use those owners.
   for(const signature of ['ugc_v3_runtime_current_before_clip_lock(uuid)','ugc_v3_artifact_current_before_clip_lock(uuid)','ugc_v3_location_input_current_before_clip_lock(uuid,jsonb)','ugc_v3_clip_package_valid_before_clip_lock(jsonb)']) {
    const name=signature.slice(0,signature.indexOf('('));
    await pg.exec(`alter function public.${signature} rename to ${name}_future_fixture`);
   }
   equal(await call('ugc_v3_runtime_current',[doc.id]),true);
   for(const ref of first.document.references)equal(await call('ugc_v3_artifact_current',[ref.id]),true);
   equal(await call('ugc_v3_clip_package_valid',[doc]),true);
   equal(await call('ugc_v3_location_input_current',[project,first.document.references.find(r=>r.kind==='location').document.input]),true);
  } finally { await pg.exec('rollback'); }
  // Current compiler/pricing/creative validators must not reinterpret accepted inputs.
  const compiler=load('lib/final-video-generation-v3/compiler.ts'), connected=load('lib/final-video-generation-v3/connected-story.ts'), pricing=load('lib/final-video-generation-v3/pricing/higgsfield-pricing.ts');
  const originals=[compiler.compileDirectorInstructions,connected.validateConnectedStory,pricing.validateManualSnapshot];
  const fail=()=>{throw Error('FUTURE_VALIDATOR_MUST_NOT_RUN');};
  compiler.compileDirectorInstructions=connected.validateConnectedStory=pricing.validateManualSnapshot=fail;
  try { const dto=await read(project);equal(dto.creativeLock.state,'locked');equal(dto.packageStale,false);ok(dto.runs.every(r=>r.current)); }
  finally { [compiler.compileDirectorInstructions,connected.validateConnectedStory,pricing.validateManualSnapshot]=originals; }
  equal((await read(project)).creativeLock, (await read(project)).creativeLock);
  return;
 }
 const unchanged=await fingerprint(), posts=h.getVideoPosts(), calls=h.calls.length;
 const schema=fs.readFileSync('supabase/migrations/20261108010000_ugc_v3_clip_approval_lock.sql','utf8');
 await pg.exec(schema);await pg.exec(schema);equal(await locks(),[first]);equal(await fingerprint(),unchanged);
 // Emulate a pre-100 installation, entirely inside rollback-only fixture transactions.
 // Historical edits must not replace the original package-bound brief or approvals.
 await pg.exec('begin');
 try {
  await pg.exec('alter table public.ugc_v3_creative_locks disable trigger ugc_v3_lock_immutable');
  await pg.query('delete from public.ugc_v3_creative_locks where project_id=$1',[project]);
  await pg.exec('alter table public.ugc_v3_creative_locks enable trigger ugc_v3_lock_immutable');
  await pg.query("update public.projects set prompt=prompt||' later historical edit' where id=$1",[project]);
  equal((await read(project)).creativeLock.state,'setup_required');
  const id=await call('ugc_v3_recover_clip_lock',[owner,project]);
  equal(await call('ugc_v3_recover_clip_lock',[owner,project]),id);
  const recovered=(await locks()).at(-1);equal(recovered.state,'locked');equal(recovered.origin,'historical_recovery');
  equal(recovered.document.brief,first.document.brief);equal(recovered.document.package,first.document.package);
  equal(await fingerprint(),unchanged);equal((await read(project)).creativeLock.state,'locked');
 } finally { await pg.exec('rollback'); }
 // Missing genuine evidence is recorded, never synthesized. Repair only accepts
 // the original evidence once restored by an administrator; rows stay append-only.
 await pg.exec('begin');
 try {
  await pg.exec('alter table public.ugc_v3_creative_locks disable trigger ugc_v3_lock_immutable');
  await pg.query('delete from public.ugc_v3_creative_locks where project_id=$1',[project]);
  await pg.exec('alter table public.ugc_v3_creative_locks enable trigger ugc_v3_lock_immutable');
  const board=first.document.storyboard;
  await pg.query('update public.ugc_v3_artifacts set approved_at=null where id=$1',[board.id]);
  await call('ugc_v3_recover_clip_lock',[owner,project]);
  equal((await locks()).at(-1).state,'needs_review');equal((await read(project)).creativeLock.state,'needs_review');
  equal(await call('ugc_v3_runtime_current',[doc.id]),false);
  await pg.exec('savepoint locked_edit');
  await blocked("update public.projects set prompt=prompt||' forbidden' where id=$1");
  await pg.exec('rollback to savepoint locked_edit');
  // Disposable administrator repair restores the exact real evidence, never a
  // guessed approval. Production repair is manual and must be audited separately.
  await pg.exec('alter table public.ugc_v3_artifacts disable trigger user');
  await pg.query('update public.ugc_v3_artifacts set approved_at=$2 where id=$1',[board.id,board.approved_at]);
  await pg.exec('alter table public.ugc_v3_artifacts enable trigger user');
  await call('ugc_v3_recover_clip_lock',[owner,project]);
  equal((await locks()).map(l=>l.state),['needs_review','locked']);
  equal((await read(project)).creativeLock.state,'locked');equal(await fingerprint(),unchanged);
 } finally { await pg.exec('rollback'); }
 equal(await locks(),[first]);equal(await fingerprint(),unchanged);equal(h.getVideoPosts(),posts);equal(h.calls.length,calls);
 equal((await read(project)).creativeLock.state,'locked');
}
