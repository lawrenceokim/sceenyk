import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { ugcGenerationSnapshotSchema } from "@/lib/ugc-jobs/input-contract";
import { UgcWorkerDatabaseError } from "@/lib/ugc-jobs/database-diagnostics";
import { characterSheetMatchesViews, composeCharacterSheet } from "@/lib/character-sheet/media";
import { CharacterSheetError } from "@/lib/character-sheet/provider";
import { parseReferenceRegenerationClaim } from "./claim";
import { effectiveReferenceAssets, parseReviewSheet } from "./state";
import { loadReplacement, readReviewAsset, saveRecoveredCharacterSheet } from "./media";
import { ReferenceRegenerationError, regenerationDiagnostic, type RegenerationPhase } from "./diagnostics";
import { hasCharacterValidation } from "@/lib/character-sheet/validation-contract";

// Deliberate, one-job local storage recovery. No provider factories, analysis,
// Soul ID operations, stage handlers, general claims or worker loop are used.
export async function recoverStoredCharacterSheet(jobId: string, shutdown: AbortSignal) {
  z.uuid().parse(jobId);
  const db = createDatabaseClient();
  const leased = await db.rpc("ugc_claim_character_sheet_recovery", { p_job_id: jobId, p_worker_id: randomUUID() });
  if (leased.error) throw new UgcWorkerDatabaseError(leased.error, "regeneration_claim", leased.status);
  const review = parseReferenceRegenerationClaim(leased.data);
  if (!review) {
    const existing = await db.from("ugc_reference_reviews").select("*")
      .eq("job_id", jobId).eq("reference_type", "character").maybeSingle();
    if (!existing.error && existing.data && existing.data.version > 1 && existing.data.version === existing.data.composed_version && existing.data.composed_sheet_version === 2) {
      const job = await db.from("ugc_generation_jobs").select("*").eq("id", jobId).eq("owner_user_id", existing.data.owner_user_id).eq("project_id", existing.data.project_id).single();
      const base = await db.from("ugc_character_sheets").select("*").eq("id", existing.data.character_sheet_id!).eq("job_id", jobId).single();
      const requests = await db.from("ugc_reference_regeneration_requests").select("*").eq("review_id", existing.data.id);
      const parsed = !job.error && job.data && !base.error ? parseReviewSheet(job.data, "character", base.data) : null;
      const assets = parsed && !requests.error ? effectiveReferenceAssets(parsed.assets, existing.data, requests.data ?? []) : null;
      if (!assets || !(["front", "back", "face"] as const).every(view => hasCharacterValidation(assets[view], view) && assets.sheet?.characterInputs?.[view] === assets[view]?.sha256)) {
        throw new ReferenceRegenerationError("CHARACTER_SLOT_VALIDATION_REQUIRED");
      }
      return { jobId, state: existing.data.approved_at ? "approved" : "ready_for_review", characterApproved: !!existing.data.approved_at,
        sheetVersion: 2, alreadyReady: true, providerRequests: 0 };
    }
    throw new ReferenceRegenerationError("CHARACTER_SHEET_RECOVERY_FAILED");
  }
  const controller = new AbortController();
  const signal = AbortSignal.any([shutdown, controller.signal]);
  let pending: Promise<unknown> = Promise.resolve();
  let backgroundFailure: unknown;
  let current: RegenerationPhase = "recovery_front_validating";
  const update = (action: string, phase?: string, asset?: unknown, error?: string, diagnostic?: unknown) => {
    const result = pending.then(async () => {
      signal.throwIfAborted();
      let response;
      try { response = await db.rpc("ugc_update_reference_regeneration", { p_review_id: review.id, p_token: review.execution_token!,
        p_action: action, p_phase: phase ?? null, p_asset: asset ?? null, p_error: error ?? null, p_checkpoint: diagnostic ?? null }); }
      catch (failure) { controller.abort(); throw new UgcWorkerDatabaseError(failure, "regeneration_checkpoint"); }
      if (response.error) { controller.abort(); throw new UgcWorkerDatabaseError(response.error, "regeneration_checkpoint", response.status); }
      if (!response.data) { controller.abort(); throw new ReferenceRegenerationError("REGENERATION_LEASE_LOST"); }
    });
    pending = result.catch(() => {}); return result;
  };
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  const beat = () => { heartbeat = setTimeout(() => {
    void update("heartbeat").then(() => { if (!signal.aborted) beat(); }).catch(error => { backgroundFailure = error; controller.abort(); });
  }, 20_000); };
  const progress = async (phase: RegenerationPhase) => { current = phase; await update("recovery_progress", phase); };
  beat();
  try {
    const jobRead = await db.from("ugc_generation_jobs").select("*").eq("id", jobId).eq("owner_user_id", review.owner_user_id).eq("project_id", review.project_id).single();
    if (jobRead.error) throw new UgcWorkerDatabaseError(jobRead.error, "regeneration_read", jobRead.status);
    const job = jobRead.data;
    const snapshot = ugcGenerationSnapshotSchema.parse(job.input_snapshot);
    if (snapshot.schemaVersion !== 3) throw new ReferenceRegenerationError("REGENERATION_SNAPSHOT_INVALID");
    const baseRead = await db.from("ugc_character_sheets").select("*").eq("id", review.character_sheet_id!).eq("job_id", jobId)
      .eq("owner_user_id", review.owner_user_id).eq("project_id", review.project_id).single();
    if (baseRead.error) throw new UgcWorkerDatabaseError(baseRead.error, "regeneration_read", baseRead.status);
    const parsed = parseReviewSheet(job, "character", baseRead.data);
    if (!parsed || baseRead.data.status !== "completed" || baseRead.data.source_asset_id !== snapshot.character.assetId ||
      parsed.document.snapshotSha256 !== createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")) throw new ReferenceRegenerationError("REGENERATION_SHEET_INVALID");
    const requests = await db.from("ugc_reference_regeneration_requests").select("*").eq("review_id", review.id);
    if (requests.error) throw new UgcWorkerDatabaseError(requests.error, "regeneration_read", requests.status);
    if (requests.data.some(request => request.state !== "completed") || !requests.data.some(request => request.view === "front" && request.replacement_asset)) {
      throw new ReferenceRegenerationError("RECONCILIATION_REQUIRED");
    }
    const assets = effectiveReferenceAssets(parsed.assets, review, requests.data);
    const views: Buffer[] = [];
    for (const [view, phase] of [["front", "recovery_front_validating"], ["back", "recovery_back_loading"], ["face", "recovery_face_loading"]] as const) {
      await progress(phase);
      const asset = assets[view];
      if (!asset) throw new ReferenceRegenerationError("REFERENCE_ASSET_INVALID");
      if (!hasCharacterValidation(asset, view)) throw new ReferenceRegenerationError("CHARACTER_SLOT_VALIDATION_REQUIRED");
      const bytes = await readReviewAsset(asset, signal);
      const decoder = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
      const metadata = await decoder.metadata();
      if (metadata.format !== "png" || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height ||
        Math.min(metadata.width, metadata.height) < 256) throw new ReferenceRegenerationError("REFERENCE_ASSET_DECODE_FAILED");
      await decoder.stats(); views.push(bytes);
    }
    const inputs = views as [Buffer, Buffer, Buffer];
    await progress("recovery_sheet_validating");
    let sheet: Awaited<ReturnType<typeof loadReplacement>> = null;
    try {
      sheet = await loadReplacement(review, review.version, "sheet", signal);
      if (sheet && !await characterSheetMatchesViews(sheet.bytes, inputs)) sheet = null;
    } catch (error) {
      if (error instanceof ReferenceRegenerationError && ["REFERENCE_ASSET_INVALID", "REFERENCE_ASSET_DECODE_FAILED", "REFERENCE_ASSET_SIZE_INVALID", "REFERENCE_ASSET_INTEGRITY_FAILED", "REFERENCE_STORAGE_NOT_FOUND"].includes(error.code)) sheet = null;
      else throw error;
    }
    if (!sheet) {
      await progress("recovery_sheet_rebuilding");
      const bytes = await composeCharacterSheet(inputs);
      await progress("recovery_sheet_saving");
      // Never overwrite an invalid historical object at the old fixed key.
      sheet = await saveRecoveredCharacterSheet(review, bytes, signal);
    } else await progress("recovery_sheet_saving");
    sheet.asset.characterInputs = { front: assets.front!.sha256, back: assets.back!.sha256, face: assets.face!.sha256 };
    await update("complete", undefined, sheet.asset);
    return { jobId, state: "ready_for_review", characterApproved: false, sheetVersion: 2, providerRequests: 0 };
  } catch (error) {
    const failure = backgroundFailure ?? error;
    if (failure instanceof UgcWorkerDatabaseError) controller.abort();
    const composition = (current as RegenerationPhase) === "recovery_sheet_rebuilding" || failure instanceof CharacterSheetError && failure.code === "CHARACTER_COMPOSITION_FAILED";
    const code = composition ? "CHARACTER_SHEET_COMPOSITION_FAILED" : "CHARACTER_SHEET_RECOVERY_FAILED";
    const diagnostic = regenerationDiagnostic(failure, current);
    if (!signal.aborted) {
      try { await update("fail", undefined, undefined, code, diagnostic); } catch { /* Fences preserve prior stored work. */ }
    }
    console.error("UGC_CHARACTER_SHEET_RECOVERY_STOPPED", { code, diagnostic });
    throw new ReferenceRegenerationError(code);
  } finally { clearTimeout(heartbeat); controller.abort(); await pending; }
}
