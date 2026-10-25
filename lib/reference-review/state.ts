import "server-only";
import { v5Review } from "@/lib/character-v5/contract";
import { v5RecoveryState, type V5RecoveryState } from "@/lib/character-v5/recovery-state";
import { createDatabaseClient } from "@/lib/db/server";
import { characterSheetDocumentSchema, characterAssetTypes, operationSchema } from "@/lib/character-sheet/contract";
import { productSheetDocumentSchema, productAssetTypes } from "@/lib/product-sheet/contract";
import type { UgcJobRow } from "@/lib/ugc-jobs/contract";
import { rejectedCharacterCandidates } from "./rejected";
import { requiresFreshCharacterRequest, characterGenerationRevision } from "@/lib/character-sheet/generation-contract";
import { characterV4InputsValid } from "@/lib/character-sheet/dependencies";
import { characterValidationSchema, hasCharacterValidation, type CharacterValidation } from "@/lib/character-sheet/validation-contract";
import { referenceTypes, referenceViews, referenceViewLabels, referenceReplacementAssetSchema, type ReferenceType, type ReferenceView,
  type ReferenceReviewRow, type ReferenceRegenerationRow, type ReferenceReviewSnapshot, type ReferenceReviewGroup } from "./contract";

export type GeneratedReviewAsset = { id: string; storageKey: string; etag: string; sizeBytes: number; mimeType: string; sha256: string;
  strategyRevision?: typeof characterGenerationRevision; faceOrigin?: "original" | "provider";
  frontSource?: import("@/lib/character-sheet/generation-contract").CharacterInputReference; originalReference?: import("@/lib/character-sheet/generation-contract").CharacterInputReference; characterValidation?: CharacterValidation; characterInputs?: { front: string; back: string; face: string };
  generation?: import("@/lib/character-sheet/generation-contract").CharacterGeneration; frontCrop?: import("zod").infer<typeof import("@/lib/character-sheet/generation-contract").frontCropSchema>;
  sourceValidation?: CharacterValidation };
export type ReviewSheetInput = { id: string; sheet_version: number; status: string; document: unknown; character_name?: string; product_name?: string };
export type ReviewSheets = { character: ReviewSheetInput | null; product: ReviewSheetInput | null };
export function parseReviewSheet(job: Pick<UgcJobRow, "id" | "owner_user_id" | "project_id">, type: ReferenceType, row: ReviewSheetInput | null) {
  if (!row) return null;
  const parsed = type === "character" ? characterSheetDocumentSchema.safeParse(row.document) : productSheetDocumentSchema.safeParse(row.document);
  if (!parsed.success || parsed.data.schemaVersion !== row.sheet_version) return null;
  const assets: Partial<Record<ReferenceView, GeneratedReviewAsset>> = {};
  const types: Readonly<Record<string, string>> = type === "character" ? characterAssetTypes : productAssetTypes;
  for (const [view, asset] of Object.entries(parsed.data.assets)) {
    const expectedType = types[view];
    const key = `ugc/${job.owner_user_id}/${job.project_id}/${job.id}/${type}-v${row.sheet_version}/${row.id}/${expectedType}.png`;
    if (!expectedType || asset.storageKey !== key || asset.type !== expectedType) return null;
    assets[view as ReferenceView] = asset;
  }
  return { row, assets, document: parsed.data };
}
export function effectiveReferenceAssets(base: Partial<Record<ReferenceView, GeneratedReviewAsset>>, review: ReferenceReviewRow, requests: ReferenceRegenerationRow[]) {
  const assets = { ...base };
  const types: Readonly<Record<string, string>> = review.reference_type === "character" ? characterAssetTypes : productAssetTypes;
  const replacements = requests.filter(request => request.review_id === review.id && request.state === "completed")
    .sort((left, right) => left.requested_version - right.requested_version);
  const read = (value: unknown, view: string, version: number) => {
    const parsed = referenceReplacementAssetSchema.safeParse(value);
    const key = `ugc/${review.owner_user_id}/${review.project_id}/${review.job_id}/reference-review-v1/${review.id}/v${version}/${types[view]}.png`;
    if (!parsed.success || !types[view] || parsed.data.type !== types[view] || parsed.data.storageKey !== key) throw new Error("REFERENCE_REPLACEMENT_INVALID");
    return parsed.data;
  };
  for (const request of replacements) {
    if (request.requested_version > review.version) throw new Error("REFERENCE_REPLACEMENT_INVALID");
    assets[request.view as ReferenceView] = read(request.replacement_asset, request.view, request.requested_version);
  }
  if (review.composed_version > 1) {
    const recovered = referenceReplacementAssetSchema.safeParse(review.composed_asset);
    const recoveryKey = recovered.success ? `ugc/${review.owner_user_id}/${review.project_id}/${review.job_id}/reference-review-v1/${review.id}/v${review.composed_version}/character_sheet_recovered/${recovered.data.id}.png` : "";
    assets.sheet = review.reference_type === "character" && recovered.success && recovered.data.type === "character_sheet" && recovered.data.storageKey === recoveryKey ?
      recovered.data : read(review.composed_asset, "sheet", review.composed_version);
  }
  if (review.reference_type === "character") for (const view of ["front", "back", "face"] as const) {
    const asset = assets[view];
    const proof = review.character_validations?.[view];
    if (asset && !hasCharacterValidation(asset, view) && hasCharacterValidation({ sha256: asset.sha256, characterValidation: proof }, view)) {
      assets[view] = { ...asset, characterValidation: proof as CharacterValidation };
    }
  }
  return assets;
}
export async function readReferenceReviewState(job: UgcJobRow, sheets: ReviewSheets): Promise<ReferenceReviewSnapshot> {
  const db = createDatabaseClient();
  const roots = await db.from("ugc_reference_reviews").select("*").eq("job_id", job.id)
    .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id);
  const setupMissing = !!roots.error && ["PGRST205", "42P01"].includes(roots.error.code);
  if (roots.error && !setupMissing) throw new Error("REFERENCE_REVIEW_UNAVAILABLE");
  const reviews = roots.data ?? [];
  const requests = reviews.length ? await db.from("ugc_reference_regeneration_requests").select("*")
    .in("review_id", reviews.map(row => row.id)) : { data: [], error: null };
  if (requests.error) throw new Error("REFERENCE_REVIEW_UNAVAILABLE");
  const mutable = !setupMissing && !["running", "completed", "cancelled", "awaiting_confirmation"].includes(job.status);
  const manual = await db.from("ugc_character_v5_workflows").select("*").eq("job_id", job.id)
    .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
  if (manual.error && !["PGRST205", "42P01"].includes(manual.error.code)) throw new Error("REFERENCE_REVIEW_UNAVAILABLE");
  let reconciliationRequired = false;
  let canRetrySaving = false;
  let savingIncomplete = false;
  let recoveryState: V5RecoveryState = "not_needed";
  if (manual.data?.candidate_id && (!["queued", "running"].includes(manual.data.state) || manual.data.state === "running" && Date.parse(manual.data.lease_expires_at ?? "") <= Date.now())) {
    const candidate = await db.from("ugc_character_v5_candidates").select("*").eq("id", manual.data.candidate_id).eq("workflow_id", manual.data.id).single();
    if (candidate.error || !candidate.data) throw new Error("REFERENCE_REVIEW_UNAVAILABLE");
    reconciliationRequired = candidate.data.state === "intent";
    recoveryState = await v5RecoveryState(manual.data, candidate.data);
    canRetrySaving = ["intent", "submitted", "failed"].includes(candidate.data.state) && ["stored", "provider_result", "unknown"].includes(recoveryState);
    savingIncomplete = !["review", "accepted", "rejected", "rejecting"].includes(candidate.data.state) && !!candidate.data.output_proof;
  }
  const groups = referenceTypes.map(type => projectGroup(job, type, sheets[type], reviews.find(row => row.reference_type === type), requests.data ?? [], mutable));
  const historicalCharacter = manual.data && sheets.character ? { ...groups.find(group => group.type === "character")!, canApprove: false } : undefined;
  if (manual.data) {
    const group = groups.find(group => group.type === "character")!;
    group.state = ["storage_missing", "unknown"].includes(recoveryState) ? "failed" : manual.data.state === "approved" ? "approved" : manual.data.state === "ready" ? "ready_for_review" :
      manual.data.state === "failed" ? "failed" : "pending_generation";
    group.sheetInvalidated = ["storage_missing", "unknown"].includes(recoveryState) || !["ready", "approved"].includes(manual.data.state);
    group.canApprove = false; group.providerDecisionRequired = false;
    group.approvedAt = manual.data.approved_at; group.approvedVersion = manual.data.state === "approved" ? manual.data.version : null;
    const workflow = manual.data;
    group.characterV4 = false; group.faceReused = false; group.validationFailure = undefined; group.rejectedOutputs = undefined;
    group.needsFreshRequestViews = undefined;
    group.execution = { state: workflow.state === "running" ? Date.parse(workflow.lease_expires_at ?? "") > Date.now() ? "running" : "stalled" :
      workflow.state === "queued" ? "waiting" : workflow.state === "failed" ? "failed" : "idle", phase: workflow.work_phase,
      heartbeatAt: workflow.state === "running" ? workflow.updated_at : null, leaseExpiresAt: workflow.lease_expires_at,
      elapsedMs: workflow.processing_elapsed_ms, runningSince: workflow.processing_updated_at,
      error: reconciliationRequired ? "RECONCILIATION_REQUIRED" : null, canRetry: false };
    group.version = manual.data.version;
  }
  // Tombstones suppress purged historical previews without rewriting receipts.
  const purges = await db.from("ugc_character_asset_purges").select("object_hash").eq("job_id", job.id)
    .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id);
  if (purges.error && !["PGRST205", "42P01"].includes(purges.error.code)) throw new Error("REFERENCE_REVIEW_UNAVAILABLE");
  const purged = new Set(purges.data?.map(row => row.object_hash));
  for (const group of groups) if (group.type === "character" && group.rejectedOutputs) group.rejectedOutputs = group.rejectedOutputs.filter(output => !purged.has(output.id));
  if (historicalCharacter?.rejectedOutputs) historicalCharacter.rejectedOutputs = historicalCharacter.rejectedOutputs.filter(output => !purged.has(output.id));
  const approved = (type: ReferenceType) => groups.some(group => group.type === type && group.state === "approved");
  const regeneration = groups.some(group => group.sheetInvalidated);
  return { groups, ...(manual.data ? { characterV5: v5Review(manual.data, reconciliationRequired, canRetrySaving, savingIncomplete, recoveryState) } : {}),
    ...(historicalCharacter ? { historicalCharacter } : {}),
    actionsAvailable: mutable, available: !!manual.data || groups.some(group => group.assets.some(asset => asset.view !== "original" && asset.available)) ||
      job.resume_stage === "character_reference" && job.status === "failed",
    locationEligible: approved("character") && approved("product"),
    regenerating: !["cancelled", "completed"].includes(job.status) && (!!manual.data && ["queued", "running"].includes(manual.data.state) || groups.some(group => group.execution?.state === "running")),
    blocked: regeneration || job.stage === "product_reference" && !approved("character") || job.stage === "location_reference",
  };
}
function projectGroup(job: UgcJobRow, type: ReferenceType, row: ReviewSheetInput | null, review: ReferenceReviewRow | undefined,
  requests: ReferenceRegenerationRow[], mutable: boolean): ReferenceReviewGroup {
  const parsed = parseReviewSheet(job, type, row);
  const pinned = !!row && !!review && (type === "character" ? review.character_sheet_id : review.product_sheet_id) === row.id && review.sheet_version === row.sheet_version;
  const version = pinned ? review.version : 1;
  const pending = pinned ? requests.filter(request => request.review_id === review.id && request.state !== "completed") : [];
  const sheetInvalidated = !!pinned && (review.version !== review.composed_version || pending.length > 0);
  const effective = parsed && pinned ? effectiveReferenceAssets(parsed.assets, review, requests) : parsed?.assets;
  const v4 = type === "character" && (effective?.sheet?.strategyRevision === characterGenerationRevision || requests.some(request => request.review_id === review?.id &&
    operationSchema.safeParse(request.checkpoint).data?.strategyRevision === characterGenerationRevision));
  const validated = type !== "character" || (["front", "back", "face"] as const).every(view => hasCharacterValidation(effective?.[view], view)) &&
    (["front", "back", "face"] as const).every(view => effective?.sheet?.characterInputs?.[view] === effective?.[view]?.sha256) &&
    (!v4 || !!effective && characterV4InputsValid(effective));
  const complete = !!parsed && validated && row?.status === "completed" && ([...referenceViews[type], "sheet"] as ReferenceView[]).every(view => !!effective?.[view]);
  const approved = !!pinned && !sheetInvalidated && complete && !!review.approved_at && review.approved_version === version && review.approved_by === job.owner_user_id;
  const failed = job.status === "failed" && job.resume_stage === `${type}_reference` && !complete;
  const leased = !!pinned && review.execution_state === "running";
  const healthy = leased && !!review.heartbeat_at && !!review.lease_expires_at && Date.now() - Date.parse(review.heartbeat_at) < 90_000 && Date.parse(review.lease_expires_at) > Date.now();
  const executionFailed = !!pinned && review.execution_state === "failed";
  const state = executionFailed ? "failed" : leased ? "regenerating" : pending.some(request => request.state === "regenerating") ? "regenerating" :
    pending.some(request => request.state === "failed") ? "failed" : pending.length || sheetInvalidated ? "regeneration_requested" :
    approved ? "approved" : complete ? "ready_for_review" : failed ? "failed" : "pending_generation";
  const cardViews = type === "character" ? ["face", "back", "front"] as const : referenceViews.product;
  const assets = (["original", ...cardViews, "sheet"] as ReferenceView[]).map(view => {
    const request = pending.find(item => item.view === view);
    const receipt = characterValidationSchema.safeParse(pinned ? review.character_validations?.[view] : undefined);
    const rejected = receipt.success && receipt.data.sha256 === effective?.[view]?.sha256 && receipt.data.state === "rejected" && !hasCharacterValidation(effective?.[view], view as "front" | "back" | "face");
    return { view, label: view === "sheet" ? type === "character" ? "Character Sheet" : "Product Sheet" : referenceViewLabels[view],
      available: view === "original" ? !!parsed : !!effective?.[view],
      publishedVersion: !pinned || view === "original" ? 1 : view === "sheet" ? review.composed_version :
        Math.max(1, ...requests.filter(item => item.review_id === review.id && item.view === view && item.state === "completed").map(item => item.requested_version)),
      state: rejected && !request ? "failed" as const : request?.state === "regeneration_requested" || request?.state === "regenerating" || request?.state === "failed" ? request.state : "ready" as const,
      validationRequired: type === "character" && view !== "original" && (view === "sheet" ? !validated || sheetInvalidated : !!request || !hasCharacterValidation(effective?.[view], view as "front" | "back" | "face")),
      stale: !!request || view === "sheet" && sheetInvalidated };
  });
  const rejectedRequest = type === "character" ? pending.map(request => ({ view: request.view, op: operationSchema.safeParse(request.checkpoint) }))
    .find(item => item.op.success && item.op.data.validation?.state === "rejected") : undefined;
  const rejectedPreserved = type === "character" && pinned ? Object.entries(review.character_validations ?? {}).map(([view, value]) => ({ view, proof: characterValidationSchema.safeParse(value) }))
    .find(item => item.proof.success && item.proof.data.state === "rejected" && item.proof.data.sha256 === effective?.[item.view as ReferenceView]?.sha256 && !hasCharacterValidation(effective?.[item.view as ReferenceView], item.view as "front" | "back" | "face")) : undefined;
  const validationFailure = rejectedRequest?.op.success ? { view: rejectedRequest.view, reasons: rejectedRequest.op.data.validation!.reasons,
    retried: (rejectedRequest.op.data.previousAttempts?.length ?? 0) > 0, previousPreserved: true } : rejectedPreserved?.proof.success ?
    { view: rejectedPreserved.view, reasons: rejectedPreserved.proof.data.reasons, retried: false, previousPreserved: true } : undefined;
  const baseDocument = type === "character" ? characterSheetDocumentSchema.safeParse(row?.document) : null;
  const providerDecisionRequired = type === "character" && (requests.some(request => request.review_id === review?.id &&
    operationSchema.safeParse(request.checkpoint).data?.generation?.revision === characterGenerationRevision && operationSchema.safeParse(request.checkpoint).data?.diagnostic?.reason === "CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED") ||
    !!baseDocument?.success && Object.values(baseDocument.data.operations).some(op => op.generation?.revision === characterGenerationRevision && op.diagnostic?.reason === "CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED"));
  return { type, name: row?.character_name ?? row?.product_name ?? (type === "character" ? "Character" : "Product / Prop"), version,
    state, canApprove: mutable && state === "ready_for_review", approvedAt: approved ? review.approved_at : null,
    approvedVersion: approved ? review.approved_version : null, sheetInvalidated, assets,
    sheetVersion: pinned && review.composed_version > 1 ? review.composed_sheet_version ?? 1 : row?.sheet_version,
    ...(validationFailure ? { validationFailure } : {}),
    ...(type === "character" ? { providerDecisionRequired, characterV4: v4, faceReused: effective?.face?.faceOrigin === "original", frontSourceAvailable: !!effective?.front?.frontSource && !!effective.front.sourceValidation || !!baseDocument?.success &&
      !!baseDocument.data.operations.front?.frontSource && baseDocument.data.operations.front.sourceValidation?.state === "passed" || pending.some(request => request.view === "front" &&
      !!operationSchema.safeParse(request.checkpoint).data?.frontSource && operationSchema.safeParse(request.checkpoint).data?.sourceValidation?.state === "passed"),
      needsFreshRequestViews: pending.filter(request => requiresFreshCharacterRequest(request.checkpoint)).map(request => request.view as ReferenceView),
      rejectedOutputs: rejectedCharacterCandidates(job, row, review, requests).map(({ id, view, reasons, stage }) => ({ id, view, reasons, stage })) } : {}),
    ...(pinned && review.execution_state ? { execution: {
      state: executionFailed ? "failed" : leased ? healthy ? "running" : "stalled" : sheetInvalidated ? "waiting" : "idle",
      phase: review.execution_phase ?? null, heartbeatAt: review.heartbeat_at ?? null, leaseExpiresAt: review.lease_expires_at ?? null,
      elapsedMs: review.processing_elapsed_ms ?? 0, runningSince: leased ? review.processing_updated_at ?? null : null,
      error: review.execution_error ?? null, canRetry: mutable && executionFailed && !providerDecisionRequired && (review.execution_attempts ?? 0) < 3,
    } as const } : {}) };
}
