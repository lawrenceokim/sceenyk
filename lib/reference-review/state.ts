import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { characterSheetDocumentSchema, characterAssetTypes } from "@/lib/character-sheet/contract";
import { productSheetDocumentSchema, productAssetTypes } from "@/lib/product-sheet/contract";
import type { UgcJobRow } from "@/lib/ugc-jobs/contract";
import { referenceTypes, referenceViews, referenceViewLabels, referenceReplacementAssetSchema, type ReferenceType, type ReferenceView,
  type ReferenceReviewRow, type ReferenceRegenerationRow, type ReferenceReviewSnapshot, type ReferenceReviewGroup } from "./contract";

export type GeneratedReviewAsset = { id: string; storageKey: string; etag: string; sizeBytes: number; mimeType: string; sha256: string };
export type ReviewSheetInput = { id: string; sheet_version: number; status: string; document: unknown; character_name?: string; product_name?: string };
export type ReviewSheets = { character: ReviewSheetInput | null; product: ReviewSheetInput | null };
export function parseReviewSheet(job: Pick<UgcJobRow, "id" | "owner_user_id" | "project_id">, type: ReferenceType, row: ReviewSheetInput | null) {
  if (!row) return null;
  const parsed = type === "character" ? characterSheetDocumentSchema.safeParse(row.document) : productSheetDocumentSchema.safeParse(row.document);
  if (!parsed.success) return null;
  const assets: Partial<Record<ReferenceView, GeneratedReviewAsset>> = {};
  const types: Readonly<Record<string, string>> = type === "character" ? characterAssetTypes : productAssetTypes;
  for (const [view, asset] of Object.entries(parsed.data.assets)) {
    const expectedType = types[view];
    const key = `ugc/${job.owner_user_id}/${job.project_id}/${job.id}/${type}-v1/${row.id}/${expectedType}.png`;
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
  if (review.composed_version > 1) assets.sheet = read(review.composed_asset, "sheet", review.composed_version);
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
  const groups = referenceTypes.map(type => projectGroup(job, type, sheets[type], reviews.find(row => row.reference_type === type), requests.data ?? [], mutable));
  const approved = (type: ReferenceType) => groups.some(group => group.type === type && group.state === "approved");
  const regeneration = groups.some(group => group.sheetInvalidated);
  return { groups, actionsAvailable: mutable, available: groups.some(group => group.assets.some(asset => asset.view !== "original" && asset.available)),
    locationEligible: approved("character") && approved("product"),
    regenerating: groups.some(group => group.state === "regenerating"),
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
  const complete = !!parsed && row?.status === "completed" && ([...referenceViews[type], "sheet"] as ReferenceView[]).every(view => !!effective?.[view]);
  const approved = !!pinned && !sheetInvalidated && complete && !!review.approved_at && review.approved_version === version && review.approved_by === job.owner_user_id;
  const failed = job.status === "failed" && job.resume_stage === `${type}_reference` && !complete;
  const state = pending.some(request => request.state === "regenerating") ? "regenerating" :
    pending.some(request => request.state === "failed") ? "failed" : pending.length || sheetInvalidated ? "regeneration_requested" :
    approved ? "approved" : complete ? "ready_for_review" : failed ? "failed" : "pending_generation";
  const assets = (["original", ...referenceViews[type], "sheet"] as ReferenceView[]).map(view => {
    const request = pending.find(item => item.view === view);
    return { view, label: view === "sheet" ? type === "character" ? "Character Sheet" : "Product Sheet" : referenceViewLabels[view],
      available: view === "original" ? !!parsed : !!effective?.[view],
      state: request?.state === "regeneration_requested" || request?.state === "regenerating" || request?.state === "failed" ? request.state : "ready" as const,
      stale: !!request || view === "sheet" && sheetInvalidated };
  });
  return { type, name: row?.character_name ?? row?.product_name ?? (type === "character" ? "Character" : "Product / Prop"), version,
    state, canApprove: mutable && state === "ready_for_review", approvedAt: approved ? review.approved_at : null,
    approvedVersion: approved ? review.approved_version : null, sheetInvalidated, assets };
}
