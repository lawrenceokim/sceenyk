import "server-only";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@/lib/db/server";
import { readReviewAsset } from "@/lib/reference-review/media";
import { finalizeStoryboard, inspectPreparedStoryboard, storyboardMaxRequests, storyboardPromptVersion, type StoryboardRow } from "./contract";
import { requestStoryboard, storyboardConfig } from "./provider";
import { removeStoryboardResponses, stageStoryboardResponse, stageStoryboardMetadata, stageStoryboardRawResponse, stageStoryboardDiagnostic, readStoryboardRecovery } from "./spool";
import { compositeRecord, parseWorkerClaim, type LocalExecutionResult } from "@/lib/ugc-jobs/claim-contract";
import { workerDatabaseDiagnostic } from "@/lib/ugc-jobs/database-diagnostics";
import { recoverStoryboardRequest } from "./recovery";
import { canCreateStoryboardRequest, canValidateStoryboardResponse, recoveryOnly, providerMetaSchema, type StoryboardDiagnostic, type StoryboardProviderMeta } from "./recovery-contract";
import { storyboardProviderDiagnostic, StoryboardProviderFailure } from "./diagnostics";
import { StoryboardValidationError } from "./validation-diagnostics";
import { storyboardCorrection, type StoryboardCorrection } from "./correction";

// Only LocalJobRunner calls this executor. No browser, Render or Inngest owner.
export async function runStoryboard(claim: StoryboardRow, shutdown: AbortSignal): Promise<LocalExecutionResult> {
  if (!parseWorkerClaim("storyboard", claim)) return { ok: true };
  const db = createDatabaseClient(); let row = claim; let lost = false;
  let phase: StoryboardDiagnostic["phase"] = "claim_validation"; let failedPhase: string | undefined; let databaseError: unknown;
  let metadata: StoryboardProviderMeta | undefined;
  let index = Math.max(0, row.requests.length - 1);
  const recovering = recoveryOnly(row.attempts);
  const abort = new AbortController();
  const signal = AbortSignal.any([shutdown, abort.signal, AbortSignal.timeout(420_000)]);
  let pending: Promise<unknown> = Promise.resolve();
  async function checkpoint(operation: string, payload: Record<string, unknown> = {}) {
    const task = pending.then(async () => {
      if (lost) throw new Error("STORYBOARD_LEASE_LOST");
      let result;
      try { result = await db.rpc("ugc_storyboard_checkpoint", { p_storyboard: row.id, p_token: claim.claim_token!,
        p_operation: operation, p_payload: payload }); }
      catch (error) { failedPhase = `checkpoint_${operation}`; databaseError = error; lost = true; abort.abort(); throw new Error("STORYBOARD_DATABASE_FAILED"); }
      const committed = compositeRecord(result.data);
      if (result.error || committed?.id !== row.id || committed?.job_id !== row.job_id || committed?.project_id !== row.project_id) {
        failedPhase = `checkpoint_${operation}`; databaseError = result.error;
        lost = true; abort.abort(); throw new Error(result.error ? "STORYBOARD_DATABASE_FAILED" : "STORYBOARD_LEASE_LOST");
      }
      row = committed as unknown as StoryboardRow; return row;
    });
    pending = task.catch(() => {}); return task;
  }
  const heartbeat = setInterval(() => { void checkpoint("heartbeat").catch(() => {}); }, 20_000);
  let failureCode = "STORYBOARD_FAILED";
  async function stop(code: string, error?: unknown): Promise<LocalExecutionResult> {
    const providerDiagnostic = { ...(error instanceof StoryboardProviderFailure ? error.diagnostic :
      storyboardProviderDiagnostic(error, databaseError ? "database" : phase, metadata)),
      ...(error instanceof StoryboardValidationError ? { validation: { ...error.report, requestIndex: index } } : {}) };
    if (row.requests.length) await stageStoryboardDiagnostic(row, index, providerDiagnostic).catch(() => {});
    let failureSaved = false;
    if (!lost) { try { await checkpoint("fail", { code }); failureSaved = true; } catch {} }
    const diagnostic = databaseError ? workerDatabaseDiagnostic(databaseError, "storyboard_checkpoint") : undefined;
    const status = error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
    console.error("UGC_STORYBOARD_TECHNICAL_FAILURE", JSON.stringify({ phase: failedPhase ?? phase, code,
      category: diagnostic?.category ?? (lost ? "lease" : phase === "provider" ? "provider" : phase === "configuration" ? "configuration" :
        phase === "asset_read" || phase === "local_recovery" ? "storage" : phase === "validation" ? "validation" : "contract"),
      ...(diagnostic?.code ? { databaseCode: diagnostic.code } : {}),
      ...(typeof status === "number" && status >= 400 && status <= 599 ? { httpStatus: status } : {}),
      providerDiagnostic,
      projectId: claim.project_id, jobId: claim.job_id, storyboardId: claim.id, revision: claim.revision,
      attempt: row.attempts, maxAttempts: 3, requests: row.requests.length, maxRequests: storyboardMaxRequests,
      retryState: failureSaved ? "manual_retry_required" : "lease_recovery_fenced", failureSaved }));
    return { ok: false, category: lost ? "lease_lost" : "failed", failureSaved };
  }
  try {
    if (row.state === "deleting") {
      phase = "deleting";
      failureCode = "STORYBOARD_STORAGE_FAILED";
      await removeStoryboardResponses(row);
      await checkpoint("deleted"); return { ok: true };
    }
    let repair: StoryboardCorrection | undefined;
    if (row.requests.some(request => !(request.promptVersion === storyboardPromptVersion && request.contractVersion === 2 || request.promptVersion === "ugc-storyboard-v1" && request.contractVersion === 1))) {
      return await stop("STORYBOARD_CONFIG_INVALID");
    }
    // Retry/restart is a separate local-only path, before configuration, asset
    // reads or paid adapters. Try newest first, then other saved candidates.
    // An invalid earlier response cannot hide a valid corrected response.
    if (recovering) {
      let validationError: StoryboardValidationError | undefined;
      let validationMetadata: StoryboardProviderMeta | undefined;
      let recoveryError: unknown;
      let invalidIndex = index;
      for (index = row.requests.length - 1; index >= 0; index--) {
        phase = "local_recovery";
        let stored;
        try { stored = await recoverStoryboardRequest(row, index); }
        catch (error) { recoveryError = error; continue; }
        if (!stored) continue;
        metadata = (await readStoryboardRecovery(row, index).catch(() => ({ metadata: null }))).metadata ?? undefined;
        if (metadata) metadata = providerMetaSchema.parse({ ...metadata, providerStatus: stored.receipt.status });
        if (row.requests[index].output === undefined) await checkpoint("response", { ...stored, index });
        phase = "validation";
        if (!canValidateStoryboardResponse(stored.receipt)) continue;
        const result = inspectPreparedStoryboard(stored.output, row.input);
        if (!result.document) {
          if (!validationError) { validationError = new StoryboardValidationError(result.report); invalidIndex = index; validationMetadata = metadata; }
          continue;
        }
        failureCode = "STORYBOARD_INPUT_CHANGED";
        await checkpoint("ready", { document: finalizeStoryboard(result.document, row.input) }); return { ok: true };
      }
      index = invalidIndex;
      if (validationError) { phase = "validation"; metadata = validationMetadata; return await stop("STORYBOARD_OUTPUT_INVALID", validationError); }
      phase = "local_recovery";
      return await stop(recoveryError ? "STORYBOARD_STORAGE_FAILED" : "STORYBOARD_RECONCILIATION_REQUIRED", recoveryError);
    }
    // Re-read all persisted receipts in order. At most initial + one corrective call.
    for (index = 0; index < storyboardMaxRequests; index++) {
      let request = row.requests[index];
      if (request && request.output === undefined) {
        phase = "local_recovery";
        failureCode = "STORYBOARD_STORAGE_FAILED";
        metadata = (await readStoryboardRecovery(row, index)).metadata ?? undefined;
        const stored = await recoverStoryboardRequest(row, index);
        if (!stored) return await stop("STORYBOARD_RECONCILIATION_REQUIRED");
        if (metadata) metadata = providerMetaSchema.parse({ ...metadata, providerStatus: stored.receipt.status });
        await checkpoint("response", { ...stored, index }); request = row.requests[index];
      }
      if (!request) {
        if (row.requests.some(existing => existing.contractVersion !== 2)) return await stop("STORYBOARD_CONFIG_INVALID");
        // Explicit saved-work retries and lease recoveries have attempts >1.
        // They can neither create an initial request nor pay for a repair.
        if (!canCreateStoryboardRequest(row.attempts, recovering, !!row.requests[index])) return await stop("STORYBOARD_RECONCILIATION_REQUIRED");
        phase = "configuration";
        failureCode = "STORYBOARD_CONFIG_INVALID";
        const config = storyboardConfig(row.model ?? undefined);
        metadata = { clientRequestId: randomUUID(), model: config.model, stored: config.storeResponses,
          requestId: null, responseId: null, providerStatus: "unknown", httpStatus: null };
        phase = "asset_read";
        failureCode = "STORYBOARD_ASSET_UNAVAILABLE";
        const assets = [row.input.character, row.input.product, row.input.location];
        // Conditional private reads verify frozen ETag/size/hash before vision input.
        const images = await Promise.all(assets.map(asset => readReviewAsset(asset, signal)));
        signal.throwIfAborted();
        await stageStoryboardMetadata(row, index, "intent", metadata);
        await checkpoint("intent", { provider: "openai", model: config.model, promptVersion: storyboardPromptVersion,
          contractVersion: 2, maxOutputTokens: config.maxOutputTokens });
        failureCode = "STORYBOARD_RECONCILIATION_REQUIRED";
        phase = "provider";
        const result = await requestStoryboard(row.input, config.model, images, signal, {
          metadata,
          saveMetadata: async (kind, value) => { metadata = value; await stageStoryboardMetadata(row, index, kind, value); },
          saveRawResponse: async value => stageStoryboardRawResponse(row, index, value),
          saveResponse: async value => {
            // No heartbeat/DB/validation gate precedes durable completed output.
            await stageStoryboardResponse(row, index, value);
            metadata = providerMetaSchema.parse({ ...metadata, responseId: value.receipt.responseId, providerStatus: value.receipt.status });
          },
        }, repair);
        failureCode = "STORYBOARD_STORAGE_FAILED";
        phase = "local_recovery";
        await checkpoint("heartbeat");
        signal.throwIfAborted();
        // Crash between provider completion and SQL save can recover local output.
        await stageStoryboardResponse(row, index, result);
        await checkpoint("response", { ...result, index }); request = row.requests[index];
      }
      if (!request || request.output === undefined) throw new Error("STORYBOARD_RECONCILIATION_REQUIRED");
      try {
        phase = "validation";
        if (!canValidateStoryboardResponse(request.receipt)) return await stop("STORYBOARD_OUTPUT_INVALID");
        const doc = finalizeStoryboard(request.output, row.input);
        failureCode = "STORYBOARD_INPUT_CHANGED";
        await checkpoint("ready", { document: doc }); return { ok: true };
      } catch (error) {
        if (lost) throw error;
        // Refusal/incomplete output is terminal, never repaired with more paid work.
        if (recovering || !request.output || request.receipt?.refused || request.receipt?.status !== "completed" || index === 1) {
          return await stop("STORYBOARD_OUTPUT_INVALID", error);
        }
        repair = storyboardCorrection(request.output, row.input, error);
      }
    }
    return await stop("STORYBOARD_OUTPUT_INVALID");
  } catch (error) {
    // No provider bodies, scene content, private keys or credentials in logs/DTOs.
    return await stop(databaseError ? "STORYBOARD_DATABASE_FAILED" : lost ? "STORYBOARD_LEASE_LOST" : failureCode, error);
  } finally { clearInterval(heartbeat); abort.abort(); await pending; }
}
