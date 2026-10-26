// Offline request/presentation checks only. No provider adapter, environment,
// database, worker, storage, generation or existing-candidate mutation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { v5Generation, v5ProviderPayload, type V5Review } from "../lib/character-v5/contract";
import { v5ManualReviewProgress } from "../lib/character-v5/progress";
import { buildUgcProgress } from "../lib/ugc-jobs/progress";
import { shouldPollUgcProgress, type UgcJobRow } from "../lib/ugc-jobs/contract";
import type { ReferenceReviewGroup } from "../lib/reference-review/contract";

let checks = 0;
const check = (value: boolean, message: string) => { assert(value, message); checks++; };
const soulId = "11111111-1111-4111-8111-111111111111";
const input = "https://private.example.invalid/original";
const face = v5Generation("face", soulId);
assert.deepEqual(v5ProviderPayload(face, input), {
  prompt: "regenerate this image but place the character in a gray background with only the character face in it",
  image_url: input, batch_size: 1, resolution: "720p", aspect_ratio: "4:3", enhance_prompt: true,
  custom_reference_id: null, custom_reference_strength: 1, seed: 362102,
}); checks++;
check(face.soulId === null && !face.soulIdUsed && face.promptRevision === 2 && face.seed === 362102, "new Face intent records actual Playground settings");
assert.deepEqual(v5Generation("face", null), face); checks++;
for (const slot of ["back", "front_source"] as const) {
  for (const identity of [soulId, null]) {
    const saved = v5Generation(slot, identity); const payload = v5ProviderPayload(saved, input);
    assert.deepEqual(payload, { prompt: slot === "back" ? "Regenerate this character as one full-body back view on a neutral gray background. Show only one character." :
      "Regenerate this character as one full-body front view on a neutral gray background. Show only one character.",
    image_url: input, batch_size: 1, resolution: "720p", aspect_ratio: "4:3", enhance_prompt: true,
    ...(identity ? { custom_reference_id: identity, custom_reference_strength: 1 } : {}) }); checks++;
    check(saved.seed === null && saved.soulIdUsed === !!identity, "other views preserve identity and seed omission");
  }
}
const manual: V5Review = { id: soulId, candidateId: soulId, version: 4, slot: "face", state: "review", accepted: [], approvedAt: null,
  errorPhase: null, errorCode: null, cropTop: 2000, soulIdUsed: true, workPhase: "generating", heartbeatAt: null, leaseExpiresAt: null,
  reconciliationRequired: false, canRetrySaving: false, savingIncomplete: false, recoveryState: "stored", persistenceState: "ready", elapsedMs: 100, runningSince: null };
check(v5ManualReviewProgress(manual)?.title === "Waiting for Face review", "review copy supersedes worker copy");
for (const state of ["queued", "running", "failed", "approved"] as const) check(v5ManualReviewProgress({ ...manual, state }) === null, `${state} is not a manual review pause`);
check(v5ManualReviewProgress({ ...manual, state: "ready", slot: "sheet" })?.title === "Waiting for Character Sheet approval", "sheet approval remains manual");
check(v5ManualReviewProgress({ ...manual, persistenceState: "storage_missing" })?.title === "Face image needs attention", "missing storage is not review-ready");
const stamp = "2026-10-26T00:00:00.000Z";
const row: UgcJobRow = { id: soulId, owner_user_id: soulId, project_id: soulId, idempotency_key: "fixture", status: "queued", stage: "character_reference", resume_stage: "character_reference",
  attempt_count: 1, max_attempts: 3, retry_eligible: false, next_retry_at: null, worker_id: null, claim_token: null, claimed_at: null, lease_expires_at: null,
  heartbeat_at: null, cancellation_requested_at: null, error_code: null, safe_error_message: null, provider: null, provider_job_id: null,
  pause_reason: "CHARACTER_REFERENCE_NOT_IMPLEMENTED", validation_completed_at: stamp, analysis_version: 1, analysis_model: null,
  input_snapshot: {}, metadata: {}, created_at: stamp, updated_at: stamp, started_at: stamp, completed_at: null, failed_at: null, cancelled_at: null };
// Reproduce the defect: final sheet still invalidated, execution idle, Face in review.
const group: ReferenceReviewGroup = { type: "character", name: "Character", version: 4, canApprove: false, approvedAt: null, approvedVersion: null,
  sheetInvalidated: true, state: "pending_generation", assets: [], execution: { state: "idle", phase: "generating",
    heartbeatAt: null, leaseExpiresAt: null, elapsedMs: 100, runningSince: null, error: null, canRetry: false } };
const progress = buildUgcProgress(row, { referenceReview: { characterV5: manual, groups: [group], available: true, actionsAvailable: true,
  locationEligible: false, blocked: true, regenerating: false } }, Date.parse(stamp));
check(progress.stageLabel === "Waiting for Face review" && progress.message.includes("Back starts only after Face acceptance"), "saved review state owns progress DTO");
check(progress.characterSteps.find(step => step.id === "face")?.state === "paused" && progress.worker.state === "inactive", "review is paused, not stalled work");
check(!shouldPollUgcProgress(progress), "manual review does not restart worker polling");
const ui = readFileSync("components/creation/ugc-progress-preview.tsx", "utf8");
check(ui.includes('const stalled = !manualReview') && ui.indexOf("manualReview ? manualReview.title") < ui.indexOf('stalled ? "Waiting for generation worker"'), "client prioritizes manual review over legacy sheet invalidation");
const sql = readFileSync("supabase/migrations/20261025005500_ugc_character_v5_persistence.sql", "utf8");
check(sql.includes("if c.state in ('review','rejecting','intent','submitted') then return null") && sql.includes("next_slot='back' and not(w.accepted ? 'face')"), "manual decisions and accepted Face gate remain enforced");
check(sql.includes("set state='rejected'") && sql.includes("insert into public.ugc_character_v5_candidates(workflow_id,slot,model)"), "after explicit rejection regeneration allocates a fresh candidate");
console.info(JSON.stringify({ checks, providerCalls: 0, workerRuns: 0, databaseMutations: 0 }));
