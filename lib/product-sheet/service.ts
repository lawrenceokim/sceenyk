import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createDatabaseClient } from "@/lib/db/server";
import { ugcGenerationSnapshotSchema } from "@/lib/ugc-jobs/input-contract";
import type { UgcStageHandler } from "@/lib/ugc-jobs/runner";
import { productReferenceAnalysisSchema, parseReferenceAnalysis, referencePromptVersion } from "@/lib/reference-analysis/contract";
import { loadReferenceImage, ReferenceMediaError } from "@/lib/reference-analysis/media";
import { characterSheetDocumentSchema } from "@/lib/character-sheet/contract";
import { productSheetDocumentSchema, productSheetPromptVersion, productDiagnosticSchema,
  productViews, type ProductSheetDocument, type ProductSheetRow, type ProductView } from "./contract";
import { ProductSheetError } from "./provider";
import { createProductSheetProvider } from "./factory";
import { productViewInstructions } from "./prompts";
import { composeProductSheet, loadStoredProductAsset, normalizeProductImage, saveProductAsset } from "./media";

export const generateProductSheet: UgcStageHandler = async ({ job, signal }) => {
  const parsed = ugcGenerationSnapshotSchema.safeParse(job.input_snapshot);
  if (!parsed.success || parsed.data.schemaVersion !== 3 || !job.claim_token || job.analysis_version !== 1) return { kind: "fail", code: "INPUT_VALIDATION_FAILED" };
  const snapshot = parsed.data;
  const claimToken = job.claim_token;
  const db = createDatabaseClient();
  let document: ProductSheetDocument | undefined;
  let activeView: ProductView | undefined;
  const checkpoint = async (composing = false) => {
    signal.throwIfAborted();
    const result = await db.rpc("ugc_checkpoint_product_sheet", { p_job_id: job.id, p_claim_token: claimToken,
      p_document: productSheetDocumentSchema.parse(document), p_composing: composing });
    if (result.error || !result.data) throw new ProductSheetError("RECONCILIATION_REQUIRED");
  };
  try {
    const character = await db.from("ugc_character_sheets").select("id,document,status,source_asset_id,character_name")
      .eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
    const parsedCharacter = characterSheetDocumentSchema.safeParse(character.data?.document);
    const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    if (character.error || !character.data || character.data.status !== "completed" || !parsedCharacter.success ||
      !parsedCharacter.data.assets.sheet || parsedCharacter.data.snapshotSha256 !== fingerprint ||
      character.data.source_asset_id !== snapshot.character.assetId || character.data.character_name !== snapshot.character.name) {
      throw new ProductSheetError("PRODUCT_CHARACTER_NOT_READY");
    }
    const result = await db.from("ugc_reference_analyses").select("*").eq("job_id", job.id)
      .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).eq("source_asset_id", snapshot.product.assetId)
      .eq("analysis_type", "product").eq("state", "completed").maybeSingle();
    const analysisRow = result.data;
    if (result.error || !analysisRow || analysisRow.analysis_version !== 1 || analysisRow.prompt_version !== referencePromptVersion ||
      analysisRow.requested_model !== job.analysis_model || analysisRow.provider !== "openai") throw new ProductSheetError("PRODUCT_ANALYSIS_INVALID");
    let analysis;
    try { analysis = productReferenceAnalysisSchema.parse(parseReferenceAnalysis("product", analysisRow.analysis)); }
    catch { throw new ProductSheetError("PRODUCT_ANALYSIS_INVALID"); }
    const existing = await db.from("ugc_product_sheets").select("*").eq("job_id", job.id)
      .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
    if (existing.error) throw new ProductSheetError("PRODUCT_OUTPUT_STORAGE_FAILED", true);
    if (existing.data) {
      document = productSheetDocumentSchema.parse(existing.data.document);
      if (document.snapshotSha256 !== fingerprint || document.analysisId !== analysisRow.id || document.characterSheetId !== character.data.id ||
        existing.data.source_asset_id !== snapshot.product.assetId || existing.data.product_name !== snapshot.product.name) throw new ProductSheetError("PRODUCT_CHECKPOINT_INVALID");
      if (existing.data.status === "completed") {
        for (const view of [...productViews, "sheet"] as const) {
          const saved = await loadStoredProductAsset(existing.data, view, signal);
          if (!saved || saved.asset.sha256 !== document.assets[view]?.sha256) throw new ProductSheetError("PRODUCT_OUTPUT_INTEGRITY_FAILED");
        }
        return { kind: "product_ready" };
      }
    }
    const provider = createProductSheetProvider();
    if (existing.data && existing.data.provider_model !== provider.model) throw new ProductSheetError("PRODUCT_CONFIG_INVALID", true);
    const initial: ProductSheetDocument = { schemaVersion: 1, promptVersion: productSheetPromptVersion, snapshotSha256: fingerprint,
      analysisId: analysisRow.id, analysisVersion: 1, characterSheetId: character.data.id,
      instructions: productViewInstructions(snapshot, analysis), operations: {}, assets: {},
      provenance: { factualSource: "original-private-product-image", observations: "saved-analysis-observed-details-subordinate-to-source-image",
        generated: "all-outputs-ai-generated-unseen-surfaces-are-inferred-continuity-never-observations",
        views: { primary: "source-conditioned-generated-view", angle: "source-conditioned-generated-view-with-possible-inferred-geometry",
          detail: "source-conditioned-generated-closeup-not-new-factual-evidence" }, layout: "gray-three-column-contain-v1" } };
    const prepared = await db.rpc("ugc_prepare_product_sheet", { p_job_id: job.id, p_claim_token: job.claim_token,
      p_model: provider.model, p_document: initial });
    if (prepared.error || !prepared.data) throw new ProductSheetError("PRODUCT_CHECKPOINT_INVALID");
    const sheet = prepared.data as ProductSheetRow;
    document = productSheetDocumentSchema.parse(sheet.document);
    if (document.snapshotSha256 !== fingerprint || document.analysisId !== analysisRow.id || document.characterSheetId !== character.data.id) throw new ProductSheetError("PRODUCT_CHECKPOINT_INVALID");
    const images: Buffer[] = [];
    let original: Buffer | undefined;
    for (const view of productViews) {
      activeView = view;
      let stored = await loadStoredProductAsset(sheet, view, signal);
      if (!stored) {
        // A committed asset disappearing is an integrity incident, never consent
        // for another generation. Uncertain/received intents cannot be replayed.
        if (document.assets[view]) throw new ProductSheetError("PRODUCT_OUTPUT_INTEGRITY_FAILED");
        const prior = document.operations[view];
        if (prior && prior.state !== "rejected") throw new ProductSheetError("RECONCILIATION_REQUIRED");
        original ??= await loadReferenceImage(job, snapshot, "product", signal);
        const operation = { key: randomUUID(), state: "intent" as const, startedAt: new Date().toISOString() };
        document.operations[view] = operation;
        await checkpoint(); // Durable paid-work intent BEFORE dispatch.
        const output = await provider.editView({ view, original, prompt: document.instructions[view], key: operation.key }, signal);
        document.operations[view] = { ...operation, state: "received", receivedAt: new Date().toISOString(),
          ...(output.requestId ? { requestId: output.requestId } : {}), usage: output.usage,
          output: { sizeBytes: output.bytes.length, decode: "not_attempted" } };
        await checkpoint(); // Preserve request/usage before decode/storage.
        const bytes = await normalizeProductImage(output.bytes);
        document.operations[view]!.output = { sizeBytes: bytes.length, decode: "succeeded" };
        await checkpoint();
        stored = await saveProductAsset(sheet, view, bytes, signal);
      }
      const operation = document.operations[view];
      if (!operation) throw new ProductSheetError("PRODUCT_CHECKPOINT_INVALID");
      if (document.assets[view] && stored.asset.sha256 !== document.assets[view]?.sha256) throw new ProductSheetError("PRODUCT_OUTPUT_INTEGRITY_FAILED");
      document.operations[view] = { ...operation, state: "completed", diagnostic: undefined,
        output: { sizeBytes: stored.asset.sizeBytes, decode: "succeeded" } };
      document.assets[view] = stored.asset;
      images.push(stored.bytes);
      await checkpoint(); // Each successful view survives later failure.
    }
    activeView = undefined;
    let final = await loadStoredProductAsset(sheet, "sheet", signal);
    if (!final) {
      if (document.assets.sheet) throw new ProductSheetError("PRODUCT_OUTPUT_INTEGRITY_FAILED");
      await checkpoint(true);
      final = await saveProductAsset(sheet, "sheet", await composeProductSheet(images), signal);
    }
    if (document.assets.sheet && document.assets.sheet.sha256 !== final.asset.sha256) throw new ProductSheetError("PRODUCT_OUTPUT_INTEGRITY_FAILED");
    document.assets.sheet = final.asset;
    await checkpoint();
    return { kind: "product_ready" };
  } catch (error) {
    const safe = error instanceof ProductSheetError ? error : error instanceof ReferenceMediaError ?
      new ProductSheetError("PRODUCT_SOURCE_UNAVAILABLE", true) : new ProductSheetError("PRODUCT_CHECKPOINT_INVALID");
    const operation = activeView && document?.operations[activeView];
    if (operation) {
      operation.diagnostic = { ...(operation.output ? { sizeBytes: operation.output.sizeBytes, decode: operation.output.decode } : {}),
        ...(operation.requestId ? { requestId: operation.requestId } : {}), ...safe.diagnostic };
      if (safe.diagnostic.requestId) operation.requestId = safe.diagnostic.requestId;
      if (safe.definitelyRejected) operation.state = "rejected";
      try { if (!signal.aborted) await checkpoint(); } catch { /* Never resubmit when checkpoint ownership is uncertain. */ }
    }
    const diagnostic = productDiagnosticSchema.safeParse(operation ? operation.diagnostic : safe.diagnostic);
    console.error("UGC_PRODUCT_STAGE_FAILED", { code: safe.code, ...(activeView ? { view: activeView } : {}),
      ...(diagnostic.success ? { diagnostic: diagnostic.data } : {}) });
    return { kind: "fail", code: safe.code, retryable: safe.retryable };
  }
};
