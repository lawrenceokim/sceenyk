// Focused offline configuration regression checks. No env loading/worker/SQL.
import assert from "node:assert/strict";
import { finalConfiguration, parseFinalAuthorization } from "../lib/final-video-generation/config";
import { finalConfigurationDiagnostic } from "../lib/final-video-generation/configuration-diagnostics";
import { FinalVideoError } from "../lib/final-video-generation/contract";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { finalProviders } from "../lib/final-video-generation/adapters/registry";
import { buildVideoGenerationPackage } from "../lib/video-generation-package/builder";
import { canonicalInput as input, fixturePricingRaw } from "./final-video-fixture";

globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_FUNDING_CHECKS"); };
let checks = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const valid = { authorizationId: "00000000-0000-4000-8000-000000000080", language: "en", maxRequests: 8,
  maxEstimatedCostMicrousd: 7000000, ceilings: { video: 6250000, voice: 100000, design: 100000, binding: 100000, lip_sync: 1000000 } };
const values = { UGC_FINAL_VIDEO_ENABLED: "1", UGC_FINAL_OPERATOR_FUNDED: "1", SCEENYK_LOCAL_JOBS_ONLY: "1", UGC_FINAL_AUTHORIZATION: JSON.stringify(valid), UGC_FINAL_PRICING: fixturePricingRaw };
const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
function diagnostic(work: () => unknown) {
  try { work(); assert.fail("Expected a configuration rejection"); }
  catch (error) { const result = finalConfigurationDiagnostic(error); assert.ok(result); checks++; return result; }
}
try {
  Object.assign(process.env, values);
  const canonical = finalConfiguration(); equal(canonical.value.funding, "operator_funded");
  equal(canonical.value.maxRequests, 8); equal(canonical.value.maxEstimatedCostMicrousd, 7000000);
  const { lip_sync, ...otherCeilings } = valid.ceilings;
  const alias = { ...valid, ceilings: { ...otherCeilings, lipsync: lip_sync } };
  process.env.UGC_FINAL_AUTHORIZATION = JSON.stringify(alias);
  equal(finalConfiguration(), canonical); // Same amount, canonical shape AND hash.
  const doc = buildVideoGenerationPackage(input, 1), providers = finalProviders();
  const canonicalPlan = finalPreflight(doc, canonical.value, providers);
  equal(finalPreflight(doc, finalConfiguration().value, providers), canonicalPlan);
  equal(canonicalPlan.requests, 6); equal(canonicalPlan.estimatedCostMicrousd, 4701600); equal(canonicalPlan.issues, []);
  equal(finalPreflight(doc, { ...canonical.value, maxRequests: 1 }, providers).issues, ["EXECUTION_BUDGET_INSUFFICIENT"]);
  equal(finalPreflight(doc, { ...canonical.value, maxEstimatedCostMicrousd: 1 }, providers).issues, ["EXECUTION_BUDGET_INSUFFICIENT"]);
  equal(JSON.parse(process.env.UGC_FINAL_AUTHORIZATION), alias); // Does not rewrite env.
  equal(diagnostic(() => parseFinalAuthorization(undefined)).reason, "authorization_missing");
  equal(diagnostic(() => parseFinalAuthorization(" ")).reason, "authorization_missing");
  equal(diagnostic(() => parseFinalAuthorization("{")).reason, "authorization_invalid_json");
  for (const value of [null, [], {}, { ...valid, extra: "private-probe-must-never-appear" },
    { ...valid, authorizationId: "private-probe-must-never-appear" }, { ...valid, maxRequests: 0 },
    { ...valid, maxRequests: 65 }, { ...valid, maxRequests: "8" }, { ...valid, maxEstimatedCostMicrousd: 0 },
    { ...valid, maxEstimatedCostMicrousd: 1_000_000_001 }, { ...valid, maxEstimatedCostMicrousd: 0.5 },
    { ...valid, ceilings: { ...valid.ceilings, lip_sync: 0 } }, { ...valid, ceilings: { ...valid.ceilings, lip_sync: "100" } },
    { ...valid, ceilings: { ...otherCeilings, lipsync: -1 } },
    { ...valid, ceilings: { ...valid.ceilings, lipsync: lip_sync } },
    { ...valid, ceilings: { ...valid.ceilings, lipsync: 2 * lip_sync } },
    { ...valid, ceilings: { ...otherCeilings } }]) {
    const result = diagnostic(() => parseFinalAuthorization(JSON.stringify(value)));
    equal(result.reason, "authorization_invalid"); equal(JSON.stringify(result).includes("private-probe"), false);
  }
  for (const field of ["video", "voice", "design", "binding", "lip_sync"] as const) {
    const ceilings: Partial<typeof valid.ceilings> = { ...valid.ceilings }; delete ceilings[field];
    const result = diagnostic(() => parseFinalAuthorization(JSON.stringify({ ...valid, ceilings })));
    assert.ok("issues" in result && result.issues?.some(issue => issue.field === `ceilings.${field}`)); checks++;
  }
  for (const [key, value, reason] of [
    ["UGC_FINAL_VIDEO_ENABLED", "0", "final_video_disabled"], ["UGC_FINAL_OPERATOR_FUNDED", "0", "operator_funding_disabled"],
    ["SCEENYK_LOCAL_JOBS_ONLY", "0", "local_execution_required"],
  ]) {
    Object.assign(process.env, values, { [key]: value }); equal(diagnostic(finalConfiguration).reason, reason);
  }
  equal(finalConfigurationDiagnostic(new FinalVideoError("FINAL_CONFIGURATION_CHANGED"))?.reason, "authorization_stale");
  equal(finalConfigurationDiagnostic(new FinalVideoError("FINAL_PROVIDER_CONFIGURATION"))?.reason, "provider_funding_unavailable");
  equal(finalConfigurationDiagnostic(new Error("private-probe")), null);
  console.info(`M10 funding configuration checks passed: ${checks}; network/RPC/worker/provider execution: none`);
} finally {
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
