import "server-only";
import { createHash } from "node:crypto";
import { createDatabaseClient } from "@/lib/db/server";
import { characterSheetDocumentSchema, operationSchema, type CharacterOperation, type CharacterView } from "@/lib/character-sheet/contract";
import { createCharacterSheetProvider } from "@/lib/character-sheet/factory";
import { characterSheetMatchesViews, composeCharacterSheet, normalizeCharacterImage } from "@/lib/character-sheet/media";
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
import { loadReplacement, readReviewAsset, saveReplacement, saveRecoveredCharacterSheet } from "./media";
import { UgcWorkerDatabaseError } from "@/lib/ugc-jobs/database-diagnostics";
import { regenerationDiagnostic, type RegenerationPhase } from "./diagnostics";
import { hasCharacterValidation, retryCharacterOperation, validateCharacterContent, canonicalCharacterImage, characterRetryAllowed, characterProviderRetryAllowed } from "@/lib/character-sheet/content-validation";
import { originalCharacterReference, characterInputUrl, originalFace, loadCharacterReference } from "@/lib/character-sheet/input-reference";
import { characterPromptGeneration } from "@/lib/character-sheet/prompts";
import { characterOutputError } from "@/lib/character-sheet/diagnostics";
import { requiresFreshCharacterRequest, characterGenerationOrder, characterGenerationRevision } from "@/lib/character-sheet/generation-contract";
import { characterUpstream, backCharacterReference, characterV4InputsValid } from "@/lib/character-sheet/dependencies";
import type { CharacterValidation } from "@/lib/character-sheet/validation-contract";

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
    const heldLegacyViews: string[] = [];
    const orderedRequests = requests.filter(item => item.state !== "completed");
    if (character) orderedRequests.sort((a, b) => characterGenerationOrder.indexOf(a.view as CharacterView) - characterGenerationOrder.indexOf(b.view as CharacterView));
    for (const request of orderedRequests) {
      if (character && requiresFreshCharacterRequest(request.checkpoint)) {
        heldLegacyViews.push(request.view);
        continue; // A new request for Back must never retry an old Front implicitly.
      }
      activeRequest = request;
      diagnosticView = request.view; currentPhase = "request_validation";
      if (!(referenceViews[review.reference_type] as readonly string[]).includes(request.view) || request.requested_version > review.version ||
        request.requested_by !== review.owner_user_id) throw new Error("REGENERATION_INPUT_INVALID");
      const view = request.view as ReferenceView;
      // Recover a successful immutable PUT even when its SQL commit was lost.
      currentPhase = "replacement_lookup";
      let stored = await loadReplacement(review, request.requested_version, view, signal);
      const phase = async (checkpoint: unknown, name: string) => {
        await update({ p_action: "checkpoint", p_request_id: request.id, p_checkpoint: checkpoint, p_phase: name });
        request.checkpoint = checkpoint;
      };
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
          let currentProvider: ReturnType<typeof createCharacterSheetProvider> | undefined;
          const provider = () => currentProvider ??= createCharacterSheetProvider();
          // Base metadata stays historical; only explicitly requested work uses V4.
          while (!stored) {
            try {
              currentPhase = "checkpoint_validation";
              let op: CharacterOperation | undefined = Object.keys(request.checkpoint ?? {}).length ? operationSchema.parse(request.checkpoint) : undefined;
              if (op?.state === "intent" || op?.state === "failed") throw new Error("RECONCILIATION_REQUIRED");
              const effective = effectiveReferenceAssets(parsed.assets, review, requests);
              if (requests.some(item => item.review_id === review.id && item.state !== "completed" &&
                characterGenerationOrder.indexOf(item.view as CharacterView) < characterGenerationOrder.indexOf(view as CharacterView))) throw new Error("RECONCILIATION_REQUIRED");
              currentPhase = "output_validation";
              const upstream = characterUpstream(view as CharacterView, effective);
              if (view !== "face") await readReviewAsset(effective.face!, signal);
              const original = view !== "front" ? await originalCharacterReference(job, snapshot, signal) : undefined;
              if (view === "face" && !op?.generation) {
                op ??= { key: request.id, strategyRevision: characterGenerationRevision, state: "rejected", startedAt: new Date().toISOString(), polls: 0 };
                op.workPhase = "checking_original_face";
                await phase(op, "regeneration_started");
                const proof = await originalFace({ ...original!, operation: op, model: job.analysis_model!, signal,
                  historyPrefix: `ugc/${review.owner_user_id}/${review.project_id}/${review.job_id}/reference-review-v1/${review.id}/v${request.requested_version}`,
                  checkpoint: async () => { await phase(op!, "downloading"); request.checkpoint = op; } });
                if (proof) { stored = await saveReplacement(review, request.requested_version, view, original!.bytes, signal); stored.asset.characterValidation = proof; stored.asset.originalReference = original!.reference; stored.asset.faceOrigin = "original"; break; }
              }
              const reference = view === "front" ? backCharacterReference(effective.back!) : original!.reference;
              let seed = parseInt((op?.key ?? request.id).replaceAll("-", "").slice(0, 8), 16) % 1_000_000 + 1;
              const contentRetry = !!op && characterProviderRetryAllowed(op);
              if (!op || op.state === "rejected" || contentRetry) {
                if (op && !characterRetryAllowed(op)) throw characterOutputError("CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED", "output_validation", { view: view as CharacterView });
                op = contentRetry || op?.state === "rejected" && !!op.generation ? retryCharacterOperation(op!) : { ...op, key: op?.key ?? request.id, state: "intent", startedAt: new Date().toISOString(), polls: 0 };
                seed = parseInt(op.key.replaceAll("-", "").slice(0, 8), 16) % 1_000_000 + 1;
                op.strategyRevision = characterGenerationRevision;
                op.retryCount = (op.previousAttempts ?? []).filter(attempt => attempt.generation?.revision === characterGenerationRevision).length;
                op.generation = characterPromptGeneration(view as CharacterView, snapshot.character.name, document.wardrobe, analysis, reference, identity.providerId, seed, upstream);
                op.workPhase = "preparing_source";
                await phase(op, "regeneration_started");
                try {
                  currentPhase = "provider_submit";
                  const imageUrl = await characterInputUrl(job, reference, view === "front" ? effective.back?.characterValidation : undefined, signal);
                  op.workPhase = "sending_i2i"; await phase(op, "regeneration_started");
                  const receipt = await provider().submitView({ view: view as CharacterView, name: snapshot.character.name, identityId: identity.providerId,
                    wardrobe: document.wardrobe, analysis, seed, imageUrl, key: op.key, generation: op.generation }, signal);
                  delete op.workPhase;
                  op = { ...op, state: "accepted", providerId: receipt.id, statusUrl: receipt.statusUrl,
                    ...(receipt.responseMetadata ? { submissionMetadata: receipt.responseMetadata } : {}) };
                  await phase(op, "generating");
                } catch (error) {
                  if (error instanceof CharacterSheetError && error.definitelyRejected) await phase({ ...op, state: "rejected", diagnostic: error.diagnostic }, "regeneration_started");
                  throw error;
                }
              }
              let bytes: Buffer;
              if (view === "front" && op.frontSource && op.sourceValidation?.state === "passed") {
                bytes = await loadCharacterReference(job, op.frontSource, op.sourceValidation, signal);
              } else {
                if (!op.providerId || !op.statusUrl) throw new Error("RECONCILIATION_REQUIRED");
                let imageUrl: string | undefined;
                while (!imageUrl) {
                  signal.throwIfAborted();
                  if (op.polls >= 240) throw new Error("RECONCILIATION_REQUIRED");
                  await waitUntil(op.nextPollAt, signal);
                  currentPhase = "provider_poll";
                  const status = await provider().viewStatus(op.providerId, op.statusUrl, signal, view as CharacterView);
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
                const download = await provider().downloadImage(imageUrl, signal);
                currentPhase = "output_decode";
                bytes = await normalizeCharacterImage(download.bytes);
                op.media = { ...download.media, decode: "succeeded" };
                await phase(op, "downloading");
                }
              currentPhase = "output_validation";
              const canonical = await canonicalCharacterImage({ bytes, view: view as CharacterView, operation: op, model: job.analysis_model!, signal,
                historyPrefix: `ugc/${review.owner_user_id}/${review.project_id}/${review.job_id}/reference-review-v1/${review.id}/v${request.requested_version}`,
                checkpoint: async () => { await phase(op, "downloading"); request.checkpoint = op; } });
              currentPhase = "view_storage";
              stored = await saveReplacement(review, request.requested_version, view, canonical.bytes, signal);
              stored.asset.characterValidation = canonical.validation;
              stored.asset.generation = op.generation;
              stored.asset.frontCrop = op.frontCrop;
              stored.asset.sourceValidation = op.sourceValidation; stored.asset.frontSource = op.frontSource;
              if (view === "face") { op.faceOrigin = "provider"; stored.asset.faceOrigin = "provider"; }
            } catch (error) {
              const checkpoint = operationSchema.safeParse(request.checkpoint);
              let failure = error;
              if (error instanceof CharacterSheetError && error.diagnostic?.reason === "CHARACTER_SLOT_CONTENT_REJECTED" &&
                checkpoint.success && characterProviderRetryAllowed(checkpoint.data)) continue;
              if (error instanceof CharacterSheetError && error.diagnostic?.reason === "CHARACTER_SLOT_CONTENT_REJECTED" && checkpoint.data?.sourceValidation?.state !== "passed") failure = characterOutputError("CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED", "output_validation", { view: view as CharacterView });
              if (checkpoint.success && failure instanceof CharacterSheetError && failure.diagnostic) {
                checkpoint.data.diagnostic = failure.diagnostic;
                await phase(checkpoint.data, "downloading"); request.checkpoint = checkpoint.data;
              }
              throw failure;
            }
          }
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
      if (character) {
        const op = operationSchema.safeParse(request.checkpoint);
        if (op.success) stored.asset.characterValidation ??= op.data.validation;
        if (op.success) { stored.asset.generation ??= op.data.generation; stored.asset.frontCrop ??= op.data.frontCrop; stored.asset.sourceValidation ??= op.data.sourceValidation; stored.asset.frontSource ??= op.data.frontSource; stored.asset.originalReference ??= op.data.originalReference; }
        if (op.success) stored.asset.faceOrigin ??= op.data.faceOrigin;
        stored.asset.strategyRevision = characterGenerationRevision;
        if (!hasCharacterValidation(stored.asset, view as CharacterView)) throw new CharacterSheetError("CHARACTER_OUTPUT_INVALID", false, false,
          { operation: "output_validation", category: "invalid_media", httpStatus: null, view: view as CharacterView, reason: "CHARACTER_SLOT_VALIDATION_REQUIRED" });
      }
      currentPhase = "view_publication";
      await update({ p_action: "view_ready", p_request_id: request.id, p_asset: stored.asset });
      request.state = "completed"; request.replacement_asset = stored.asset;
    }
    activeRequest = undefined;
    diagnosticView = undefined;
    if (heldLegacyViews.length) {
      currentPhase = "checkpoint_validation";
      throw characterOutputError("CHARACTER_PROMPT_PROVENANCE_REQUIRED", "checkpoint_validation");
    }
    // Inspect preserved historical views too. Their source objects are immutable;
    // the review root holds hash-bound receipts without rewriting those files.
    if (character) {
      const assets = effectiveReferenceAssets(parsed.assets, review, requests);
      for (const view of ["front", "back", "face"] as const) {
        const asset = assets[view];
        if (!asset) throw new Error("REGENERATION_INPUT_INVALID");
        if (hasCharacterValidation(asset, view)) continue;
        currentPhase = "output_validation"; diagnosticView = view;
        const op: CharacterOperation = { key: createHash("sha256").update(`${review.id}:${review.version}:${view}`).digest("hex").slice(0, 32),
          state: "completed", startedAt: new Date().toISOString(), polls: 0,
          ...(review.character_validations?.[view] ? { validation: review.character_validations[view] as CharacterValidation } : {}) };
        // Stable candidate identity is internal only; it is never a provider key.
        const bytes = await readReviewAsset(asset, signal);
        await validateCharacterContent({ bytes, view, operation: op, model: job.analysis_model!, signal,
          historyPrefix: `ugc/${review.owner_user_id}/${review.project_id}/${review.job_id}/reference-review-v1/${review.id}/v${review.version}`,
          checkpoint: async () => {
            await update({ p_action: "character_validation", p_checkpoint: op.validation });
            review.character_validations = { ...review.character_validations, [view]: op.validation! };
          } });
      }
      if (requests.some(request => operationSchema.safeParse(request.checkpoint).data?.strategyRevision === characterGenerationRevision) &&
        !characterV4InputsValid(effectiveReferenceAssets(parsed.assets, review, requests))) throw characterOutputError("CHARACTER_SLOT_VALIDATION_REQUIRED", "output_validation");
    }
    currentPhase = "database_checkpoint";
    await update({ p_action: "composing" });
    currentPhase = "sheet_lookup";
    let sheet = await loadReplacement(review, review.version, "sheet", signal);
    if (!sheet || character) {
      const assets = effectiveReferenceAssets(parsed.assets, review, requests);
      const images: Buffer[] = [];
      for (const view of referenceViews[review.reference_type]) {
        currentPhase = "sheet_inputs_read"; diagnosticView = view;
        const asset = assets[view]; if (!asset) throw new Error("REGENERATION_INPUT_INVALID");
        images.push(await readReviewAsset(asset, signal));
      }
      currentPhase = "sheet_composition"; diagnosticView = undefined;
      if (images.length !== 3) throw new Error("REGENERATION_INPUT_INVALID");
      if (character) {
        if (!sheet || !await characterSheetMatchesViews(sheet.bytes, images as [Buffer, Buffer, Buffer])) {
          const bytes = await composeCharacterSheet(images as [Buffer, Buffer, Buffer]);
          currentPhase = "sheet_storage";
          sheet = await saveRecoveredCharacterSheet(review, bytes, signal);
        }
        sheet.asset.characterInputs = { front: assets.front!.sha256, back: assets.back!.sha256, face: assets.face!.sha256 };
        if (characterV4InputsValid(assets)) sheet.asset.strategyRevision = characterGenerationRevision;
        await update({ p_action: "validating_sheet" });
        if (!await characterSheetMatchesViews(sheet.bytes, images as [Buffer, Buffer, Buffer])) throw characterOutputError("CHARACTER_SHEET_COMPOSITION_FAILED", "sheet_composition");
      } else {
        const bytes = await composeProductSheet(images);
        currentPhase = "sheet_storage";
        sheet = await saveReplacement(review, review.version, "sheet", bytes, signal);
      }
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
      const code = ["CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED", "CHARACTER_PROMPT_PROVENANCE_REQUIRED"].includes(diagnostic.code) ? "RECONCILIATION_REQUIRED" :
        ["RECONCILIATION_REQUIRED", "IDENTITY_UNAVAILABLE"].includes(diagnostic.code) ? diagnostic.code : "REGENERATION_FAILED";
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
