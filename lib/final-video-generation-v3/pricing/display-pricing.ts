import "server-only";
import type { FrozenPackage } from "../package";
import { calculateManualEstimate, getEstimatedRate } from "./higgsfield-pricing";

// Read-only presentation values. Frozen estimates remain authoritative for execution/authorization.
export function currentDisplayPricing(doc: FrozenPackage) {
  const segments = doc.segments.map(segment => {
    const saved = segment.estimate.pricing;
    const estimate = saved && getEstimatedRate(saved.provider, saved.model, saved.mode, doc.source.resolution)
      ? calculateManualEstimate(saved.provider, saved.model, saved.mode, segment.durationMs, doc.source.resolution).estimatedCostMicrousd
      : segment.estimate.estimatedCostMicrousd;
    return { id: segment.id, estimatedCostMicrousd: estimate };
  });
  return { segments, totalMicrousd: segments.every(s => s.estimatedCostMicrousd !== null)
    ? segments.reduce((sum, s) => sum + s.estimatedCostMicrousd!, 0) : null };
}
