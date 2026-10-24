import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createDatabaseClient } from "@/lib/db/server";
import { characterReferenceAnalysisSchema, parseReferenceAnalysis, referencePromptVersion } from "@/lib/reference-analysis/contract";
import { loadReferenceImage, ReferenceMediaError } from "@/lib/reference-analysis/media";
import { signR2CharacterSource } from "@/lib/storage/r2";
import { ugcGenerationSnapshotSchema } from "@/lib/ugc-jobs/input-contract";
import type { UgcStageHandler } from "@/lib/ugc-jobs/runner";
import { characterSheetDocumentSchema, characterSheetPromptVersion, characterViews,
  characterDiagnosticSchema, type CharacterSheetDocument, type CharacterOperation } from "./contract";
import { createCharacterSheetProvider } from "./factory";
import { composeCharacterSheet, loadStoredCharacterAsset, normalizeCharacterImage, saveCharacterAsset } from "./media";
import { buildWardrobe } from "./prompts";
import { CharacterSheetError, type ProviderReceipt, type ProviderStatus } from "./provider";
import { characterOutputError } from "./diagnostics";
import type { CharacterView, CharacterDiagnostic } from "./contract";

// Imported by the portable runner; no HTTP browser request waits for provider work.
export const generateCharacterSheet: UgcStageHandler = async ({ job, signal }) => {
  const parsed = ugcGenerationSnapshotSchema.safeParse(job.input_snapshot);
  if (!parsed.success || parsed.data.schemaVersion !== 3 || !job.claim_token || job.analysis_version !== 1) {
    return { kind: "fail", code: "INPUT_VALIDATION_FAILED" };
  }
  const snapshot = parsed.data;
  const claimToken = job.claim_token;
  const db = createDatabaseClient();
  let currentDocument: CharacterSheetDocument | undefined;
  let activeView: CharacterView | undefined;
  try {
    const analysisResult = await db.from("ugc_reference_analyses").select("*").eq("job_id", job.id)
      .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id)
      .eq("source_asset_id", snapshot.character.assetId).eq("analysis_type", "character").eq("state", "completed").maybeSingle();
    const row = analysisResult.data;
    if (analysisResult.error || !row || row.analysis_version !== 1 || row.prompt_version !== referencePromptVersion ||
      row.requested_model !== job.analysis_model || row.provider !== "openai") return { kind: "fail", code: "REFERENCE_OUTPUT_INVALID" };
    const analysis = characterReferenceAnalysisSchema.parse(parseReferenceAnalysis("character", row.analysis));
    const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const existing = await db.from("ugc_character_sheets").select("*").eq("job_id", job.id)
      .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
    if (existing.error) throw new CharacterSheetError("CHARACTER_STORAGE_FAILED", true);
    // Resolve provider only after checking reuse. Changing configuration cannot
    // regenerate a successfully committed sheet.
    if (existing.data?.status === "completed") {
      const document = characterSheetDocumentSchema.parse(existing.data.document);
      if (document.snapshotSha256 !== fingerprint || document.analysisId !== row.id || existing.data.source_asset_id !== snapshot.character.assetId ||
        existing.data.character_name !== snapshot.character.name || !document.assets.sheet) throw characterOutputError("CHARACTER_OUTPUT_CHECKPOINT_INVALID", "checkpoint_validation");
      for (const view of [...characterViews, "sheet"] as const) {
        const saved = await loadStoredCharacterAsset(existing.data, view, signal);
        if (!saved || saved.asset.sha256 !== document.assets[view]?.sha256) throw new CharacterSheetError("CHARACTER_STORAGE_FAILED", true);
      }
      return { kind: "character_ready" };
    }
    const provider = createCharacterSheetProvider();
    if (existing.data && existing.data.provider_model !== provider.model) throw new CharacterSheetError("CHARACTER_CONFIG_INVALID", true);
    const initial: CharacterSheetDocument = {
      schemaVersion: 1, promptVersion: characterSheetPromptVersion, snapshotSha256: fingerprint,
      analysisId: row.id, analysisVersion: 1, wardrobe: buildWardrobe(snapshot, analysis),
      seed: parseInt(fingerprint.slice(0, 8), 16) % 1_000_000 + 1, operations: {}, assets: {},
      provenance: { identity: "source-image-via-soul-id-v2", observations: "saved-analysis-supports-original-image",
        generated: "wardrobe-and-unseen-body-rear-footwear-details-are-generated-continuity", layout: "gray-three-column-contain-v1" },
    };
    const prepared = await db.rpc("ugc_prepare_character_sheet", { p_job_id: job.id, p_claim_token: job.claim_token,
      p_model: provider.model, p_document: initial });
    if (prepared.error || !prepared.data) throw new CharacterSheetError("CHARACTER_STORAGE_FAILED", true);
    const sheet = prepared.data;
    const document = characterSheetDocumentSchema.parse(sheet.document);
    currentDocument = document;
    if (document.snapshotSha256 !== fingerprint || document.analysisId !== row.id) throw characterOutputError("CHARACTER_OUTPUT_CHECKPOINT_INVALID", "checkpoint_validation");
    const checkpoint = async (message: string) => {
      signal.throwIfAborted();
      characterSheetDocumentSchema.parse(document);
      const result = await db.rpc("ugc_checkpoint_character_sheet", { p_job_id: job.id, p_claim_token: claimToken,
        p_document: document, p_message: message });
      if (result.error || !result.data) throw new CharacterSheetError("RECONCILIATION_REQUIRED");
    };
    const runOperation = async (kind: "identity" | typeof characterViews[number], submit: (key: string) => Promise<ProviderReceipt>,
      poll: (operation: CharacterOperation) => Promise<ProviderStatus>): Promise<ProviderStatus> => {
      let operation = document.operations[kind];
      if (operation?.state === "intent") throw new CharacterSheetError("RECONCILIATION_REQUIRED");
      if (operation?.state === "failed") throw new CharacterSheetError("CHARACTER_PROVIDER_FAILED");
      if (!operation || operation.state === "rejected") {
        operation = { key: operation?.key ?? randomUUID(), state: "intent", startedAt: new Date().toISOString(), polls: 0 };
        document.operations[kind] = operation;
        await checkpoint(kind === "identity" ? "Preparing character" : "Generating character views");
        try {
          // Never repeat when this receipt's persistence is lost. Durable intent
          // survives crash/cancellation/unknown transport outcomes.
          const receipt = await submit(operation.key);
          operation.providerId = receipt.id; operation.statusUrl = receipt.statusUrl; operation.state = "accepted";
          if (receipt.responseMetadata) operation.submissionMetadata = receipt.responseMetadata;
          operation.nextPollAt = new Date(Date.now() + 2_000).toISOString();
          await checkpoint("Generating character views");
        } catch (error) {
          if (error instanceof CharacterSheetError) {
            if (error.diagnostic) operation.diagnostic = error.diagnostic;
            if (error.definitelyRejected) operation.state = "rejected";
            if (error.diagnostic || error.definitelyRejected) {
              try { await checkpoint("Character generation stopped safely"); }
              catch { throw new CharacterSheetError("RECONCILIATION_REQUIRED", false, false, error.diagnostic); }
            }
          }
          throw error;
        }
      }
      if (!operation.providerId) throw new CharacterSheetError("RECONCILIATION_REQUIRED");
      while (true) {
        signal.throwIfAborted();
        if (operation.state !== "completed" && (Date.now() - Date.parse(operation.startedAt) > 30 * 60_000 || operation.polls >= 240)) {
          throw new CharacterSheetError("CHARACTER_TIMEOUT");
        }
        await waitUntil(operation.nextPollAt, signal);
        let status: ProviderStatus;
        try { status = await poll(operation); }
        catch (error) {
          if (error instanceof CharacterSheetError && error.diagnostic) operation.diagnostic = error.diagnostic;
          if (operation.state !== "completed" && error instanceof CharacterSheetError && error.retryable && !["CHARACTER_AUTH_FAILED", "CHARACTER_RATE_LIMITED"].includes(error.code)) {
            operation.polls += 1;
            operation.nextPollAt = new Date(Date.now() + Math.min(60_000, 5_000 * 2 ** Math.min(operation.polls, 4))).toISOString();
            await checkpoint("Generating character views"); continue;
          }
          if (error instanceof CharacterSheetError && error.diagnostic) {
            try { await checkpoint("Character generation stopped safely"); }
            catch { throw new CharacterSheetError("RECONCILIATION_REQUIRED", false, false, error.diagnostic); }
          }
          throw error;
        }
        operation.polls += 1;
        if (status.outputMetadata) operation.outputMetadata = status.outputMetadata;
        if (operation.state === "completed" && status.state !== "completed") throw characterOutputError("CHARACTER_OUTPUT_STATUS_REGRESSED", "view_status");
        if (status.state === "failed") {
          if (status.diagnostic) operation.diagnostic = status.diagnostic;
          operation.state = "failed"; await checkpoint("Character generation stopped safely");
          throw new CharacterSheetError("CHARACTER_PROVIDER_FAILED", false, false, status.diagnostic);
        }
        if (status.state === "completed") {
          operation.state = "completed"; operation.elapsedMs = Date.now() - Date.parse(operation.startedAt);
          await checkpoint("Generating character views"); return status;
        }
        operation.nextPollAt = new Date(Date.now() + Math.min(10_000, 2_000 * 1.5 ** Math.min(operation.polls, 5))).toISOString();
        await checkpoint("Generating character views");
      }
    };
    if (document.operations.identity?.state !== "completed") {
      let sourceUrl: string | undefined;
      if (!document.operations.identity || document.operations.identity.state === "rejected") {
        // Original image remains canonical. Decode checks happen before training.
        await loadReferenceImage(job, snapshot, "character", signal);
        const source = await db.from("project_assets").select("storage_key").eq("id", snapshot.character.assetId)
          .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).eq("verified_etag", snapshot.character.etag).maybeSingle();
        if (source.error || !source.data) throw new CharacterSheetError("CHARACTER_STORAGE_FAILED", true);
        sourceUrl = await signR2CharacterSource(source.data.storage_key, snapshot.character.etag);
      }
      await runOperation("identity", () => provider.createIdentity(snapshot.character.name, sourceUrl!, signal),
        op => provider.identityStatus(op.providerId!, signal));
    }
    const identityId = document.operations.identity?.providerId;
    if (!identityId) throw new CharacterSheetError("RECONCILIATION_REQUIRED");
    const images: Buffer[] = [];
    for (const view of characterViews) {
      activeView = view;
      let stored = await loadStoredCharacterAsset(sheet, view, signal);
      if (!stored) {
        const output = await runOperation(view, key => provider.submitView({ view, name: snapshot.character.name,
          identityId, wardrobe: document.wardrobe, analysis, seed: document.seed, key }, signal),
        op => provider.viewStatus(op.providerId!, op.statusUrl!, signal, view));
        const missing = { front: "CHARACTER_FRONT_OUTPUT_MISSING", back: "CHARACTER_BACK_OUTPUT_MISSING", face: "CHARACTER_FACE_OUTPUT_MISSING" } as const;
        if (!output.imageUrl) throw characterOutputError(missing[view], "view_status", { view });
        if (output.outputMetadata?.expiresAt && Date.parse(output.outputMetadata.expiresAt) <= Date.now()) {
          throw characterOutputError("CHARACTER_OUTPUT_URL_EXPIRED", "output_download", { view,
            ...(output.outputMetadata.outputHost ? { outputHost: output.outputMetadata.outputHost } : {}) });
        }
        const download = await provider.downloadImage(output.imageUrl, signal);
        const operation = document.operations[view]!;
        operation.media = download.media;
        await checkpoint("Generating character views");
        const bytes = await normalizeCharacterImage(download.bytes);
        operation.media = { ...download.media, decode: "succeeded" };
        await checkpoint("Saving character reference");
        stored = await saveCharacterAsset(sheet, view, bytes, signal);
      }
      if (document.assets[view] && stored.asset.sha256 !== document.assets[view]?.sha256) throw characterOutputError("CHARACTER_OUTPUT_INTEGRITY_FAILED", "output_storage", { view });
      document.assets[view] = stored.asset; images.push(stored.bytes);
      await checkpoint("Saving character reference");
    }
    activeView = undefined;
    let final = await loadStoredCharacterAsset(sheet, "sheet", signal);
    if (!final) {
      await checkpoint("Building character sheet");
      final = await saveCharacterAsset(sheet, "sheet", await composeCharacterSheet(images), signal);
    }
    document.assets.sheet = final.asset;
    await checkpoint("Saving character reference");
    return { kind: "character_ready" };
  } catch (error) {
    if (error instanceof ReferenceMediaError) return { kind: "fail", code: error.code === "REFERENCE_ASSET_UNAVAILABLE" ? "CHARACTER_STORAGE_FAILED" : error.code, retryable: error.code === "REFERENCE_ASSET_UNAVAILABLE" };
    const safe = error instanceof CharacterSheetError ? error : characterOutputError("CHARACTER_UNEXPECTED_OUTPUT_FAILURE", "checkpoint_validation");
    let safeDiagnostic: CharacterDiagnostic | undefined = safe.diagnostic;
    if (safeDiagnostic && activeView && !safeDiagnostic.view) safeDiagnostic = { ...safeDiagnostic, view: activeView };
    const operation = activeView ? currentDocument?.operations[activeView] : undefined;
    if (safeDiagnostic && operation) {
      const media = safeDiagnostic.media ?? operation.media;
      if (media) safeDiagnostic = { ...safeDiagnostic, media: { ...media,
        decode: safeDiagnostic.operation === "output_decode" ? "failed" : media.decode } };
      operation.diagnostic = safeDiagnostic;
      if (safeDiagnostic.media) operation.media = safeDiagnostic.media;
      // Best-effort fenced diagnostics only; never replace the original failure
      // or submit work when the lease/checkpoint is unavailable.
      try {
        const persisted = characterSheetDocumentSchema.safeParse(currentDocument);
        if (persisted.success && !signal.aborted) await db.rpc("ugc_checkpoint_character_sheet", {
          p_job_id: job.id, p_claim_token: claimToken, p_document: persisted.data, p_message: "Character generation stopped safely",
        });
      } catch { /* Safe local log remains available if checkpointing is offline. */ }
    }
    const diagnostic = characterDiagnosticSchema.safeParse(safeDiagnostic);
    console.error("UGC_CHARACTER_STAGE_FAILED", { jobId: job.id, stage: "character_reference",
      code: diagnostic.success ? diagnostic.data.reason ?? safe.code : safe.code, jobCode: safe.code,
      ...(diagnostic.success ? { diagnostic: diagnostic.data } : {}) });
    return { kind: "fail", code: safe.code, retryable: safe.retryable };
  }
};
async function waitUntil(at: string | undefined, signal: AbortSignal) {
  const milliseconds = at ? Math.max(0, Math.min(60_000, Date.parse(at) - Date.now())) : 0;
  if (!milliseconds) { signal.throwIfAborted(); return; }
  await new Promise<void>((resolve, reject) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(); };
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new Error("ABORTED")); };
    const timer = setTimeout(finish, milliseconds); signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
