import assert from "node:assert/strict";
import { currentDisplayPricing } from "../lib/final-video-generation-v3/pricing/display-pricing";
import { HiggsfieldVideoGenerationProvider } from "../lib/final-video-generation-v3/adapters/higgsfield";
import { buildFrozenPackage, readFrozenPackage } from "../lib/final-video-generation-v3/package";
import { v3Digest } from "../lib/final-video-generation-v3/identity";
import { v3Context, v3Id, v3Input } from "./final-video-v3-fixture";

let requests = 0;
globalThis.fetch = async () => { requests++; throw new Error("NETWORK_FORBIDDEN"); };
const provider = new HiggsfieldVideoGenerationProvider();
for (const durations of [[10000], [20000], [30000], [10000, 30000], [30000, 30000]]) {
  const input = v3Input(durations), context = v3Context(input, provider);
  const saved = JSON.parse(JSON.stringify(buildFrozenPackage(input, provider, context, { id: v3Id(100), version: 1, sourceRevision: 1 })));
  // A real frozen historical price, with all arithmetic/evidence/hash bindings intact.
  saved.pricing.pricingVersion = "seedance-2026-10-31"; saved.pricing.configurationDate = "2026-10-31";
  for (const segment of saved.segments) {
    const cost = segment.durationMs / 1000 * 564100, pricing = segment.estimate.pricing;
    Object.assign(pricing, { rateMicrousdPerSecond: 564100, estimatedUsdPerSecond: "0.5641", estimatedCostMicrousd: cost,
      estimatedUsd: (cost / 1000000).toFixed(6), pricingVersion: saved.pricing.pricingVersion, configurationDate: saved.pricing.configurationDate });
    Object.assign(segment.estimate, { estimatedCostMicrousd: cost, pricingVersion: pricing.pricingVersion, evidenceHash: v3Digest("manual-pricing", pricing) });
  }
  saved.pricing.totalMicrousd = saved.segments.reduce((sum: number, s: { estimate: { estimatedCostMicrousd: number } }) => sum + s.estimate.estimatedCostMicrousd, 0);
  const { hash: _hash, ...body } = saved; void _hash; saved.hash = v3Digest("frozen-package", body);
  const doc = readFrozenPackage(saved), before = JSON.stringify(doc), display = currentDisplayPricing(doc);
  assert.equal(display.totalMicrousd, durations.reduce((sum, ms) => sum + ms / 1000 * 205667, 0));
  for (const [index, segment] of display.segments.entries()) {
    assert.equal((segment.estimatedCostMicrousd! / 1000000).toFixed(2), ({ 10000: "2.06", 20000: "4.11", 30000: "6.17" } as Record<number, string>)[durations[index]]);
  }
  assert.equal(JSON.stringify(doc), before);
  assert.equal(readFrozenPackage(doc).hash, saved.hash);
  // Unknown/historical pricing remains readable without attributing another model's price.
  const unsupported = structuredClone(doc);
  for (const segment of unsupported.segments) segment.estimate.pricing!.model = "historical-unconfigured-model";
  assert.equal(currentDisplayPricing(unsupported).totalMicrousd, doc.pricing.totalMicrousd);
}
assert.equal(requests, 0);
console.info("Current display pricing passed for historical 10s/20s/30s, segments and joined totals; frozen records unchanged; zero network calls.");
