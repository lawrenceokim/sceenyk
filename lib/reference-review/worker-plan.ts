import "server-only";
import { referenceViews, type ReferenceReviewRow, type ReferenceRegenerationRow } from "./contract";
import { effectiveReferenceAssets, type GeneratedReviewAsset } from "./state";
import type { ReferenceView } from "./contract";

// Read-only plan shared with the Milestone 6.6 execution contract.
// No provider imports, job transitions, writes, claim, retry, or dispatch here.
export function referenceReplacementPlan(review: ReferenceReviewRow, assets: Record<string, GeneratedReviewAsset | undefined>, requests: ReferenceRegenerationRow[]) {
  const pending = requests.filter(request => request.review_id === review.id && request.state !== "completed");
  const effective = effectiveReferenceAssets(assets as Partial<Record<ReferenceView, GeneratedReviewAsset>>, review, requests);
  const replacing = new Set(pending.map(request => request.view));
  return { schemaVersion: 1 as const, referenceType: review.reference_type, targetVersion: review.version,
    regenerate: pending.map(request => ({ requestId: request.id, view: request.view, previousAssetId: request.previous_asset_id })),
    preserve: Object.fromEntries(referenceViews[review.reference_type].filter(view => !replacing.has(view)).map(view => [view, effective[view]])),
    recompose: review.composed_version !== review.version,
    // Replacements use fresh immutable keys, never overwrite base assets.
    storagePrefix: `ugc/${review.owner_user_id}/${review.project_id}/${review.job_id}/reference-review-v1/${review.id}/v${review.version}`,
  };
}
