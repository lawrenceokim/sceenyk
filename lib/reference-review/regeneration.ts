import "server-only";
import { createHash } from "node:crypto";
import { createDatabaseClient } from "@/lib/db/server";
import { characterSheetDocumentSchema, operationSchema, type CharacterOperation, type CharacterView } from "@/lib/character-sheet/contract";
import { createCharacterSheetProvider } from "@/lib/character-sheet/factory";
import { composeCharacterSheet, normalizeCharacterImage } from "@/lib/character-sheet/media";
import { CharacterSheetError } from "@/lib/character-sheet/provider";
import { productOperationSchema, productSheetDocumentSchema, type ProductView } from "@/lib/product-sheet/contract";
import { createProductSheetProvider } from "@/lib/product-sheet/factory";
import { composeProductSheet, normalizeProductImage } from "@/lib/product-sheet/media";
import { ProductSheetError } from "@/lib/product-sheet/provider";
import { characterReferenceAnalysisSchema, parseReferenceAnalysis, referencePromptVersion } from "@/lib/reference-analysis/contract";
import { loadReferenceImage } from "@/lib/reference-analysis/media";
import { ugcGenerationSnapshotSchema } from "@/lib/ugc-jobs/input-contract";
import { referenceViews, type ReferenceReviewRow, type ReferenceRegenerationRow, type ReferenceView } from "./contract";
import { effectiveReferenceAssets, parseReviewSheet } from "./state";
import { loadReplacement, readReviewAsset, saveReplacement } from "./media";
import { UgcWorkerDatabaseError } from "@/lib/ugc-jobs/database-diagnostics";
import { regenerationDiagnostic, type RegenerationPhase } from "./diagnostics";

type Mutation = { p_action: string; p_request_id?: string; p_checkpoint?: unknown; p_asset?: unknown; p_phase?: string; p_error?: string };

// Portable execution service. The local adapter uses the existing review intents,
// event history and storage owners, while the parent job remains at its pause.
export async function runReferenceRegeneration(review: ReferenceReviewRow, shutdown: AbortSignal) {
  const db = createDatabaseClient();
  const controller = new AbortController();
  const signal = AbortSignal.any([shutdown, controller.signal]);
  if (!review.execution_token) throw new Error("REGENERATION_CLAIM_REQUIRED");
  let currentPhase: RegenerationPhase = "job_read";
  let diagnosticView: string | undefined;
  let backgroundFailure: unknown;
  const token = review.execution_token;
  let writes: Promise<unknown> = Promise.resolve();
  const update = (mutation: Mutation) => {
    const result = writes.then(async () => {
      signal.throwIfAborted();
      let response;
      try { response = await db.rpc("ugc_update_reference_regeneration", { p_review_id: review.id, p_token: token, ...mutation }); }
      catch (error) { controller.abort(); throw new UgcWorkerDatabaseError(error, "regeneration_checkpoint"); }
      if (response.error) { controller.abort(); throw new UgcWorkerDatabaseError(response.error, "regeneration_checkpoint", response.status); }
      if (!response.data) { controller.abort(); throw new Error("REGENERATION_LEASE_LOST"); }
    });
    writes = result.catch(() => {});
    return result;
  };
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  const beat = () => { heartbeat = setTimeout(() => {
    void update({ p_action: "heartbeat" }).then(() => { if (!signal.aborted) beat(); })
      .catch(error => { backgroundFailure = error; controller.abort(); });
  }, 20_000); };
  beat();
  let activeRequest: ReferenceRegenerationRow | undefined;
  try {
    const result = await db.from("ugc_generation_jobs").select("*").eq("id", review.job_id)
      .eq("owner_user_id", review.owner_user_id).eq("project_id", review.project_id).single();
    if (result.error) throw new UgcWorkerDatabaseError(result.error, "regeneration_read", result.status);
    if (!result.data) throw new Error("REGENERATION_INPUT_INVALID");
    const job = result.data;
    currentPhase = "snapshot_validation";
    const snapshot = ugcGenerationSnapshotSchema.parse(job.input_snapshot);
    if (snapshot.schemaVersion !== 3 || job.analysis_version !== 1) throw new Error("REGENERATION_INPUT_INVALID");
    const character = review.reference_type === "character";
    currentPhase = "sheet_read";
    const baseResult = character ? await db.from("ugc_character_sheets").select("*").eq("id", review.character_sheet_id!).single() :
      await db.from("ugc_product_sheets").select("*").eq("id", review.product_sheet_id!).single();
    const base = baseResult.data;
    if (baseResult.error) throw new UgcWorkerDatabaseError(baseResult.error, "regeneration_read", baseResult.status);
    currentPhase = "base_validation";
    if (!base || base.status !== "completed" || base.owner_user_id !== job.owner_user_id ||
      base.project_id !== job.project_id || base.job_id !== job.id || base.sheet_version !== review.sheet_version ||
      base.source_asset_id !== snapshot[review.reference_type].assetId) throw new Error("REGENERATION_INPUT_INVALID");
    const parsed = parseReviewSheet(job, review.reference_type, base);
    if (!parsed || parsed.document.snapshotSha256 !== createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")) throw new Error("REGENERATION_INPUT_INVALID");
    currentPhase = "requests_read";
    const requestResult = await db.from("ugc_reference_regeneration_requests").select("*").eq("review_id", review.id).order("requested_version");
    if (requestResult.error) throw new UgcWorkerDatabaseError(requestResult.error, "regeneration_read", requestResult.status);
    const requests = requestResult.data ?? [];
    for (const request of requests.filter(item => item.state !== "completed")) {
      activeRequest = request;
      diagnosticView = request.view; currentPhase = "request_validation";
      if (!(referenceViews[review.reference_type] as readonly string[]).includes(request.view) || request.requested_version > review.version ||
        request.requested_by !== review.owner_user_id) throw new Error("REGENERATION_INPUT_INVALID");
      const view = request.view as ReferenceView;
      // Recover a successful immutable PUT even when its SQL commit was lost.
      currentPhase = "replacement_lookup";
      let stored = await loadReplacement(review, request.requested_version, view, signal);
      const phase = (checkpoint: unknown, name: string) => update({ p_action: "checkpoint", p_request_id: request.id, p_checkpoint: checkpoint, p_phase: name });
      if (!stored) {
        if (character) {
          currentPhase = "identity_reuse";
          const document = characterSheetDocumentSchema.parse(base.document);
          const identity = document.operations.identity;
          if (identity?.state !== "completed" || !identity.providerId) throw new Error("IDENTITY_UNAVAILABLE");
          currentPhase = "analysis_read";
          const analysisResult = await db.from("ugc_reference_analyses").select("*").eq("id", document.analysisId)
            .eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id)
            .eq("analysis_type", "character").eq("source_asset_id", snapshot.character.assetId).eq("state", "completed").single();
          const analysisRow = analysisResult.data;
          if (analysisResult.error) throw new UgcWorkerDatabaseError(analysisResult.error, "regeneration_read", analysisResult.status);
          currentPhase = "analysis_validation";
          if (!analysisRow || analysisRow.analysis_version !== 1 || analysisRow.prompt_version !== referencePromptVersion ||
            analysisRow.requested_model !== job.analysis_model || analysisRow.provider !== "openai") throw new Error("REGENERATION_INPUT_INVALID");
          const analysis = characterReferenceAnalysisSchema.parse(parseReferenceAnalysis("character", analysisRow.analysis));
          currentPhase = "provider_configuration";
          const provider = createCharacterSheetProvider();
          if (provider.model !== base.provider_model) throw new Error("REGENERATION_INPUT_INVALID");
          currentPhase = "checkpoint_validation";
          let op: CharacterOperation | undefined = Object.keys(request.checkpoint ?? {}).length ? operationSchema.parse(request.checkpoint) : undefined;
          if (op?.state === "intent" || op?.state === "failed") throw new Error("RECONCILIATION_REQUIRED");
          if (!op || op.state === "rejected") {
            op = { key: request.id, state: "intent", startedAt: new Date().toISOString(), polls: 0 };
            await phase(op, "regeneration_started");
            try {
              currentPhase = "provider_submit";
              const receipt = await provider.submitView({ view: view as CharacterView, name: snapshot.character.name, identityId: identity.providerId,
                wardrobe: document.wardrobe, analysis, seed: parseInt(request.id.replaceAll("-", "").slice(0, 8), 16) % 1_000_000 + 1, key: op.key }, signal);
              op = { ...op, state: "accepted", providerId: receipt.id, statusUrl: receipt.statusUrl,
                ...(receipt.responseMetadata ? { submissionMetadata: receipt.responseMetadata } : {}) };
              await phase(op, "generating");
            } catch (error) {
              if (error instanceof CharacterSheetError && error.definitelyRejected) await phase({ ...op, state: "rejected", diagnostic: error.diagnostic }, "regeneration_started");
              throw error;
            }
          }
          if (!op.providerId || !op.statusUrl) throw new Error("RECONCILIATION_REQUIRED");
          let imageUrl: string | undefined;
          while (!imageUrl) {
            signal.throwIfAborted();
            if (op.polls >= 240) throw new Error("RECONCILIATION_REQUIRED");
            await waitUntil(op.nextPollAt, signal);
            currentPhase = "provider_poll";
            const status = await provider.viewStatus(op.providerId, op.statusUrl, signal, view as CharacterView);
            if (op.state === "completed" && status.state !== "completed") throw new Error("RECONCILIATION_REQUIRED");
            op.polls += 1;
            if (status.outputMetadata) op.outputMetadata = status.outputMetadata;
            if (status.state === "failed") {
              op.state = "failed"; if (status.diagnostic) op.diagnostic = status.diagnostic;
              await phase(op, "generating"); throw new Error("RECONCILIATION_REQUIRED");
            }
            if (status.state === "completed") {
              if (!status.imageUrl || status.outputMetadata?.expiresAt && Date.parse(status.outputMetadata.expiresAt) <= Date.now()) throw new Error("RECONCILIATION_REQUIRED");
              imageUrl = status.imageUrl; op.state = "completed"; await phase(op, "provider_ready");
            } else {
              op.nextPollAt = new Date(Date.now() + 5_000).toISOString(); await phase(op, "generating");
            }
          }
          await phase(op, "downloading");
          currentPhase = "output_download";
          const download = await provider.downloadImage(imageUrl, signal);
          currentPhase = "output_decode";
          const bytes = await normalizeCharacterImage(download.bytes);
          op.media = { ...download.media, decode: "succeeded" };
          await phase(op, "downloading");
          currentPhase = "view_storage";
          stored = await saveReplacement(review, request.requested_version, view, bytes, signal);
        } else {
          currentPhase = "base_validation";
          const document = productSheetDocumentSchema.parse(base.document);
          currentPhase = "provider_configuration";
          const provider = createProductSheetProvider();
          if (provider.model !== base.provider_model) throw new Error("REGENERATION_INPUT_INVALID");
          currentPhase = "checkpoint_validation";
          const prior = Object.keys(request.checkpoint ?? {}).length ? productOperationSchema.parse(request.checkpoint) : undefined;
          if (prior && prior.state !== "rejected") throw new Error("RECONCILIATION_REQUIRED");
          currentPhase = "output_download";
          const original = await loadReferenceImage(job, snapshot, "product", signal);
          let op = productOperationSchema.parse({ key: request.id, state: "intent", startedAt: new Date().toISOString() });
          await phase(op, "regeneration_started");
          // Synchronous edit has no poll/retrieve API. Unknown intent/received
          // outcomes require reconciliation unless a durable object exists.
          await phase(op, "generating");
          let output;
          currentPhase = "provider_submit";
          try { output = await provider.editView({ view: view as ProductView, original, prompt: document.instructions[view as ProductView], key: op.key }, signal); }
          catch (error) {
            if (error instanceof ProductSheetError && error.definitelyRejected) await phase({ ...op, state: "rejected", diagnostic: error.diagnostic }, "regeneration_started");
            throw error;
          }
          op = { ...op, state: "received", receivedAt: new Date().toISOString(), requestId: output.requestId, usage: output.usage,
            output: { sizeBytes: output.bytes.length, decode: "not_attempted" } };
          await phase(op, "provider_ready");
          currentPhase = "output_decode";
          const bytes = await normalizeProductImage(output.bytes);
          op.output = { sizeBytes: bytes.length, decode: "succeeded" }; await phase(op, "downloading");
          currentPhase = "view_storage";
          stored = await saveReplacement(review, request.requested_version, view, bytes, signal);
        }
      } else {
        await phase(request.checkpoint ?? {}, "regeneration_started");
      }
      currentPhase = "view_publication";
      await update({ p_action: "view_ready", p_request_id: request.id, p_asset: stored.asset });
      request.state = "completed"; request.replacement_asset = stored.asset;
    }
    activeRequest = undefined;
    diagnosticView = undefined;
    currentPhase = "database_checkpoint";
    await update({ p_action: "composing" });
    currentPhase = "sheet_lookup";
    let sheet = await loadReplacement(review, review.version, "sheet", signal);
    if (!sheet) {
      const assets = effectiveReferenceAssets(parsed.assets, review, requests);
      const images: Buffer[] = [];
      for (const view of referenceViews[review.reference_type]) {
        currentPhase = "sheet_inputs_read"; diagnosticView = view;
        const asset = assets[view]; if (!asset) throw new Error("REGENERATION_INPUT_INVALID");
        images.push(await readReviewAsset(asset, signal));
      }
      currentPhase = "sheet_composition"; diagnosticView = undefined;
      if (images.length !== 3) throw new Error("REGENERATION_INPUT_INVALID");
      const bytes = character ? await composeCharacterSheet(images as [Buffer, Buffer, Buffer]) : await composeProductSheet(images);
      currentPhase = "sheet_storage";
      sheet = await saveReplacement(review, review.version, "sheet", bytes, signal);
    }
    currentPhase = "sheet_publication";
    await update({ p_action: "complete", p_asset: sheet.asset });
  } catch (error) {
    if (shutdown.aborted) return;
    const failure = backgroundFailure ?? error;
    const diagnostic = regenerationDiagnostic(failure, backgroundFailure ? "heartbeat" : currentPhase, diagnosticView);
    // Database availability/ownership is uncertain: preserve the leased state
    // and paid checkpoints for expiry recovery, never write a business failure.
    if (failure instanceof UgcWorkerDatabaseError) controller.abort();
    if (!signal.aborted) {
      const code = ["RECONCILIATION_REQUIRED", "IDENTITY_UNAVAILABLE"].includes(diagnostic.code) ? diagnostic.code : "REGENERATION_FAILED";
      try { await update({ p_action: "fail", ...(activeRequest ? { p_request_id: activeRequest.id } : {}), p_error: code, p_checkpoint: diagnostic }); }
      catch (persistenceError) {
        console.error("UGC_REFERENCE_REGENERATION_DIAGNOSTIC_NOT_SAVED", {
          code: persistenceError instanceof UgcWorkerDatabaseError ? "REGENERATION_DATABASE_FAILED" : "REGENERATION_LEASE_LOST",
        });
        if (persistenceError instanceof UgcWorkerDatabaseError) backgroundFailure = persistenceError;
      }
    }
    console.error("UGC_REFERENCE_REGENERATION_STOPPED", diagnostic);
    if (failure instanceof UgcWorkerDatabaseError) throw failure;
    if (backgroundFailure instanceof UgcWorkerDatabaseError) throw backgroundFailure;
  } finally {
    clearTimeout(heartbeat); controller.abort(); await writes;
  }
}

async function waitUntil(at: string | undefined, signal: AbortSignal) {
  const milliseconds = at ? Math.max(0, Math.min(60_000, Date.parse(at) - Date.now())) : 0;
  signal.throwIfAborted(); if (!milliseconds) return;
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new Error("ABORTED")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  });
}
