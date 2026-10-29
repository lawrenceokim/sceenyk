// Pure pricing/preflight checks. No private env, SQL, workers, media or HTTP.
import assert from "node:assert/strict";
import fs from "node:fs";
import { finalPricing, estimateProviderCost, voiceDesignPreviewText } from "../lib/final-video-generation/adapters/pricing";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { finalProviders, adapterIdentities } from "../lib/final-video-generation/adapters/registry";
import { compositionProfile } from "../lib/final-video-generation/composition";
import { recordProviderUsage } from "../lib/final-video-generation/usage";
import type { FinalConfiguration } from "../lib/final-video-generation/contract";
import { buildVideoGenerationPackage } from "../lib/video-generation-package/builder";
import { canonicalInput, fixturePricingRaw, id } from "./final-video-fixture";

globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_PRICING_CHECKS"); };
let checks = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const config: FinalConfiguration = { version: "ugc-final-v1", funding: "operator_funded", authorizationId: id(80), language: "en",
  maxRequests: 8, maxEstimatedCostMicrousd: 7000000, ceilings: { video: 6250000, design: 200000, binding: 10000, voice: 100000, lip_sync: 200000 },
  providers: adapterIdentities, pricing: finalPricing(fixturePricingRaw), composition: compositionProfile,
  output: { height: 720, fps: 25, format: "mp4", toleranceMs: 50, audioSampleRate: 48000 } };
const input = structuredClone(canonicalInput);
input.storyboard.document.scenes[0].speech = [{ ...input.storyboard.document.scenes[1].speech[0], startMs: 1200, endMs: 2400, text: "My mug." }];
const doc = buildVideoGenerationPackage(input, 2), before = structuredClone(doc), providers = finalProviders();
const plan = finalPreflight(doc, config, providers);
equal(plan.issues, []); equal(plan.requests, 8); equal(plan.estimatedCostMicrousd, 4772160);
equal(plan.breakdown.map(i => i.estimatedCostMicrousd), [2311200, 2311200, 8000, 0, 560, 1200, 70000, 70000]);
equal(doc, before);
// Changing spending permission must not change expected provider cost.
const largerCaps = { ...config, ceilings: { video: 9999999, design: 9999999, binding: 9999999, voice: 9999999, lip_sync: 9999999 } };
equal(finalPreflight(doc, largerCaps, providers).estimatedCostMicrousd, plan.estimatedCostMicrousd);
equal(finalPreflight(doc, { ...config, maxRequests: 7 }, providers).issues, ["EXECUTION_BUDGET_INSUFFICIENT"]);
equal(finalPreflight(doc, { ...config, maxEstimatedCostMicrousd: 4772159 }, providers).issues, ["EXECUTION_BUDGET_INSUFFICIENT"]);
equal(finalPreflight(doc, { ...config, ceilings: { ...config.ceilings, voice: 1000 } }, providers).issues, ["STAGE_AUTHORIZATION_CEILING_EXCEEDED"]);
// A fixed audition makes credits independently known. Missing USD/credit still
// blocks with no fake zero total, ceiling fallback or guessed USD conversion.
const missing = finalPreflight(doc, { ...config, pricing: finalPricing() }, providers);
equal(missing.issues, ["COST_ESTIMATE_UNAVAILABLE", "COST_ESTIMATE_UNAVAILABLE", "COST_ESTIMATE_UNAVAILABLE"]); equal(missing.estimatedCostMicrousd, null);
equal(missing.knownSubtotalMicrousd, 4762400); equal(missing.breakdown[2].source, "unavailable");
equal(missing.breakdown[2].billableQuantity, 119); equal(missing.breakdown[2].estimatedCredits, 119);
equal(missing.breakdown[2].unavailableReason, "ELEVENLABS_BILLING_CONFIGURATION_REQUIRED");
equal(missing.designPreviewText, voiceDesignPreviewText(["My mug.", "My morning mug."]));
equal([...voiceDesignPreviewText(["A".repeat(1200)])!].length, 1000);
equal(voiceDesignPreviewText([]), undefined);
equal(finalPreflight(doc, { ...config, pricing: undefined }, providers).breakdown.every(i => i.estimatedCostMicrousd === null), true);
equal(estimateProviderCost("design", { ...config, pricing: finalPricing(JSON.stringify({ voiceDesignPreviewText: "a".repeat(100) })) }, {}).unavailableReason,
  "ELEVENLABS_BILLING_CONFIGURATION_REQUIRED");
for (const raw of ["{", "null", '{"elevenLabsMicrousdPerCredit":0}', '{"elevenLabsMicrousdPerCredit":"80"}',
  '{"voiceDesignPreviewText":"short"}', '{"unknown":80}']) equal(finalPricing(raw).valid, false);
equal(estimateProviderCost("video", config, { durationMs: 5000, aspectRatio: "9:16" }).estimatedCostMicrousd, 2311200);
equal(estimateProviderCost("video", config, { durationMs: 10000, aspectRatio: "16:9" }).estimatedCostMicrousd, 4622400);
equal(estimateProviderCost("video", config, { durationMs: 5000, aspectRatio: "1:1" }).estimatedCostMicrousd, 1300050);
equal(estimateProviderCost("video", config, { durationMs: 4500, aspectRatio: "9:16" }).estimatedCostMicrousd, null);
for (const [durationMs, cost] of [[4000, 70000], [5000, 70000], [5001, 140000], [10000, 140000]])
  equal(estimateProviderCost("lip_sync", config, { durationMs }).estimatedCostMicrousd, cost);
equal(estimateProviderCost("voice", config, { text: "A 😀!" }).billableQuantity, 4);
equal(estimateProviderCost("voice", config, { text: "A 😀!" }).estimatedCostMicrousd, 320);
equal(estimateProviderCost("binding", config, {}).estimatedCostMicrousd, 0);
for (const kind of ["video", "voice", "design", "binding", "lip_sync"] as const) {
  const changed = { ...config, providers: { ...config.providers, [kind]: { ...config.providers[kind], model: "unverified-model" } } };
  equal(estimateProviderCost(kind, changed, { text: "Hi", durationMs: 5000, aspectRatio: "9:16" }).estimatedCostMicrousd, null);
}
const usage = { requestId: "fixture", usage: { providerCharacterCost: "22", actualCostMicrousd: null } };
equal(recordProviderUsage(usage, "voice", config.pricing).usage?.actualCostMicrousd, 1760);
equal(recordProviderUsage(usage, "voice", finalPricing()).usage?.actualCostMicrousd, null);
equal(recordProviderUsage({}, "video", config.pricing).usage?.actualCostMicrousd, null);
equal(recordProviderUsage({ usage: { providerCharacterCost: "bad" } }, "design", config.pricing).usage?.actualCostMicrousd, null);
// Included-credit billing is explicit and separate from USD permission. These
// are synthetic allowance snapshots, not a global "ElevenLabs is free" rule.
const included = (remainingCredits: number) => finalPricing(JSON.stringify({ elevenLabsIncludedCredits: { allowanceId: id(90), remainingCredits } }));
const includedConfig = { ...config, pricing: included(9981) };
const free = finalPreflight(doc, includedConfig, providers);
equal(free.issues, []); equal(free.estimatedUsdCost, 4.7624); equal(free.estimatedCostMicrousd, 4762400);
equal(free.elevenLabs, { estimatedCredits: 141, configuredIncludedCredits: 9981, remainingIncludedCreditsAfterRun: 9840, billingMode: "included_credits", estimatedUsdCost: 0 });
equal(free.breakdown.filter(row => row.provider === "elevenlabs").map(row => [row.estimatedCredits, row.estimatedUsdCost]), [[119, 0], [0, 0], [7, 0], [15, 0]]);
equal(free.falEstimatedCostMicrousd, 4762400); equal(free.requests, 8); equal(doc, before);
equal(finalPreflight(doc, { ...config, pricing: included(141) }, providers).issues, []);
const tooFew = finalPreflight(doc, { ...config, pricing: included(140) }, providers);
equal(tooFew.issues, ["ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED"]); equal(tooFew.estimatedUsdCost, null);
equal(tooFew.elevenLabs.estimatedUsdCost, null);
equal(finalPreflight(doc, { ...includedConfig, maxEstimatedCostMicrousd: 4762399 }, providers).issues, ["EXECUTION_BUDGET_INSUFFICIENT"]);
equal(finalPreflight(doc, { ...includedConfig, maxRequests: 7 }, providers).issues, ["EXECUTION_BUDGET_INSUFFICIENT"]);
equal(estimateProviderCost("voice", includedConfig, { text: "A 😀!" }).estimatedCredits, 4);
equal(estimateProviderCost("voice", includedConfig, { text: "A 😀!" }).estimatedUsdCost, 0);
equal(estimateProviderCost("design", { ...config, pricing: included(0) }, { text: "a".repeat(100) }).estimatedCredits, 100);
equal(estimateProviderCost("design", { ...config, pricing: included(0) }, { text: "a".repeat(100) }).estimatedUsdCost, null);
equal(finalPricing(JSON.stringify({ elevenLabsIncludedCredits: { allowanceId: id(90), remainingCredits: -1 } })).valid, false);
equal(finalPricing(JSON.stringify({ elevenLabsIncludedCredits: { allowanceId: id(90), remainingCredits: "9981" } })).valid, false);
equal(finalPricing(JSON.stringify({ elevenLabsIncludedCredits: { remainingCredits: 9981 } })).valid, false);
equal(finalPricing(JSON.stringify({ elevenLabsIncludedCredits: { allowanceId: id(90), remainingCredits: 9981 }, elevenLabsMicrousdPerCredit: 80 })).valid, false);
equal(recordProviderUsage(usage, "voice", includedConfig.pricing, 22).usage?.actualCredits, 22);
equal(recordProviderUsage(usage, "voice", includedConfig.pricing, 22).usage?.actualCostMicrousd, 0);
equal(recordProviderUsage(usage, "voice", includedConfig.pricing, 21).usage?.actualCostMicrousd, null);
equal(recordProviderUsage({}, "voice", includedConfig.pricing, 22).usage?.actualCostMicrousd, null);
// Replacing the mode with a reviewed paid rate restores nonzero USD costing.
equal(finalPreflight(doc, config, providers).estimatedCostMicrousd, 4772160);
// Migration review is static only in this task. Verify the new function keeps
// the established recovery/completion branches and service-only privilege.
const sql = fs.readFileSync("supabase/migrations/20261028007100_ugc_final_provider_costs.sql", "utf8");
equal(sql.includes("cost:=case when p_payload->>'kind'='composition' then 0 else (e.configuration->'ceilings'"), false);
for (const marker of ["COST_ESTIMATE_UNAVAILABLE", "STAGE_AUTHORIZATION_CEILING_EXCEEDED", "FINAL_BUDGET_EXHAUSTED",
  "p_operation='profile'", "p_operation='scene'", "p_operation='review'", "p_operation='release'", "from public,anon,authenticated;"])
  equal(sql.includes(marker), true);
const includedSql = fs.readFileSync("supabase/migrations/20261028007200_ugc_final_included_credits.sql", "utf8");
for (const marker of ["pg_advisory_xact_lock", "reserved_credits+credit_quantity>credit_limit", "ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED",
  "ELEVENLABS_ALLOWANCE_SNAPSHOT_CONFLICT", "creditAllowanceEnforced", "from public,anon,authenticated;"])
  equal(includedSql.includes(marker), true);
equal((includedSql.match(/create or replace function /g) ?? []).length, 1);
equal((includedSql.match(/end \$\$;/g) ?? []).length, 1);
equal((includedSql.match(/^commit;$/gm) ?? []).length, 1);
const originalRecovery = sql.slice(sql.indexOf(" elsif p_operation in ('receipt'"));
const includedRecovery = includedSql.slice(includedSql.indexOf(" elsif p_operation in ('receipt'"));
equal(includedRecovery.replace(",'creditAllowanceEnforced',true", ""), originalRecovery);
console.info(`Final provider pricing/preflight checks passed: ${checks}; network/SQL/media/worker/provider execution: none`);
