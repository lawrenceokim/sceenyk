import { packageDigest } from "@/lib/video-generation-package/builder";
import type { VideoGenerationPackage } from "@/lib/video-generation-package/contract";
import type { FinalExecution, Operation } from "./contract";
import type { finalPreflight } from "./preflight";

export type AuthorizationAmendment = {
  id: string; execution_id: string; owner_user_id: string; project_id: string; original_authorization_id: string;
  original_configuration_hash: string; package_hash: string; profile_id: string; failed_operation_id: string;
  stage: "voice_design" | "voice_binding"; reason: "provider_permission_corrected" | "provider_labels_corrected"; additional_requests: 1; additional_cost_microusd: number;
  operator_user_id: string; operator_approved: true; configuration_corrected: true; reviewed_http_status: 403 | 400;
  quote: Record<string, unknown>; quote_hash: string; created_at: string;
};
export type EffectiveAuthorization = { originalRequests: number; amendedRequests: number; effectiveRequests: number;
  originalCostMicrousd: number; amendedCostMicrousd: number; effectiveCostMicrousd: number; consumedRequests: number; remainingRequests: number };
export function effectiveAuthorization(run: FinalExecution, amendments: readonly AuthorizationAmendment[]): EffectiveAuthorization {
  const scoped = amendments.filter(a => a.execution_id === run.id && a.original_configuration_hash === run.configuration_hash &&
    a.original_authorization_id === run.configuration.authorizationId && a.package_hash === run.package_hash && a.operator_approved);
  const amendedRequests = scoped.reduce((sum, a) => sum + a.additional_requests, 0);
  const amendedCostMicrousd = scoped.reduce((sum, a) => sum + a.additional_cost_microusd, 0);
  return { originalRequests: run.configuration.maxRequests, amendedRequests, effectiveRequests: run.configuration.maxRequests + amendedRequests,
    originalCostMicrousd: run.configuration.maxEstimatedCostMicrousd, amendedCostMicrousd,
    effectiveCostMicrousd: run.configuration.maxEstimatedCostMicrousd + amendedCostMicrousd,
    consumedRequests: run.paid_requests, remainingRequests: run.configuration.maxRequests + amendedRequests - run.paid_requests };
}
export const logicalKey = (operation: Operation) => operation.logical_key ?? operation.operation_key;
export function latestOperations(operations: readonly Operation[]) {
  const latest = new Map<string, Operation>();
  for (const op of operations) if (!latest.has(logicalKey(op)) || latest.get(logicalKey(op))!.attempt < op.attempt) latest.set(logicalKey(op), op);
  return latest;
}
export function knownOperationCost(operation: Operation) {
  const actual = operation.receipt?.usage?.actualCostMicrousd;
  return Math.max(operation.estimated_cost_microusd, typeof actual === "number" && Number.isSafeInteger(actual) && actual >= 0 ? actual : 0);
}
export function reservedCredits(operations: readonly Pick<Operation, "input" | "receipt">[]) {
  return operations.reduce((sum, op) => {
    const estimate = (op.input.costEstimate as { estimatedCredits?: unknown } | undefined)?.estimatedCredits;
    const actual = op.receipt?.usage?.actualCredits;
    return sum + Math.max(typeof estimate === "number" && Number.isSafeInteger(estimate) && estimate >= 0 ? estimate : 0,
      typeof actual === "number" && Number.isFinite(actual) && actual >= 0 ? actual : 0);
  }, 0);
}
export type RetryReview = {
  available: boolean; blockers: string[]; operationId: string; stage: "voice_design" | "voice_binding"; originalAttempt: number;
  reason: "provider_permission_corrected" | "provider_labels_corrected"; reviewedHttpStatus: 403 | 400; additionalRequests: 1; additionalCostMicrousd: number;
  replacementCostMicrousd: number | null; replacementCredits: number; sunkKnownCostMicrousd: number;
  remainingPipelineCostMicrousd: number; projectedTotalCostMicrousd: number | null; requiredNewRequests: number;
  authorization: EffectiveAuthorization; effectiveRequestsAfter: number; effectiveCostAfterMicrousd: number;
  projectedIncludedCredits: number; configuredIncludedCredits: number | null; preservedWork: string[]; quoteVersion: string;
};
type Plan = ReturnType<typeof finalPreflight>;
export function retryReview(run: FinalExecution, doc: VideoGenerationPackage, operations: readonly Operation[], amendments: readonly AuthorizationAmendment[],
  plan: Plan, options: { current: boolean; operator: boolean; sharedReservedCredits: number; additionalCostMicrousd?: number }) {
  const latest = latestOperations(operations);
  const failed = [latest.get("voice:design"), latest.get("voice:binding")].find(op => op?.state === "failed" && op.error_code === "FINAL_PROVIDER_REJECTED");
  if (!failed || !["design", "binding"].includes(failed.kind)) return null;
  const binding = failed.kind === "binding", reviewedHttpStatus = binding ? 400 : 403;
  const replacement = plan.breakdown.find(item => item.operationKey === logicalKey(failed));
  if (!replacement) return null;
  const remaining = plan.breakdown.filter(item => !latest.has(item.operationKey));
  // Package digests intentionally accept integer numbers only. Keep monetary
  // authority in micro-USD and serialize fractional billing quantities as text.
  const quotedCost = (item: Plan["breakdown"][number]) => ({ operationKey: item.operationKey, kind: item.kind, provider: item.provider,
    model: item.model, pricingVersion: item.pricingVersion, pricingUnit: item.pricingUnit, pricingRule: item.pricingRule, source: item.source,
    billableQuantity: item.billableQuantity === null ? null : String(item.billableQuantity), estimatedCredits: item.estimatedCredits ?? null,
    estimatedCostMicrousd: item.estimatedCostMicrousd });
  const auth = effectiveAuthorization(run, amendments), blockers: string[] = [];
  const sunk = operations.filter(op => op.kind !== "composition").reduce((sum, op) => sum + knownOperationCost(op), 0);
  const remainingCost = remaining.reduce((sum, item) => sum + (item.estimatedCostMicrousd ?? 0), 0);
  const projected = replacement.estimatedCostMicrousd === null || remaining.some(item => item.estimatedCostMicrousd === null) ? null : sunk + replacement.estimatedCostMicrousd + remainingCost;
  // A proposal only: the operator must explicitly approve any added USD limit.
  const additionalCostMicrousd = options.additionalCostMicrousd ?? Math.max(0, (projected ?? 0) - auth.effectiveCostMicrousd);
  const requiredNewRequests = 1 + remaining.length;
  const configuredIncludedCredits = run.configuration.pricing?.elevenLabsIncludedCredits?.remainingCredits ?? null;
  const sharedReservedCredits = Math.ceil(options.sharedReservedCredits);
  const projectedCredits = sharedReservedCredits + (replacement.estimatedCredits ?? 0) + remaining.reduce((sum, item) => sum + (item.estimatedCredits ?? 0), 0);
  if (!options.operator) blockers.push("FINAL_OPERATOR_SETUP_REQUIRED");
  if (!Number.isSafeInteger(additionalCostMicrousd) || additionalCostMicrousd < 0) blockers.push("FINAL_INVALID_AUTHORIZATION_AMENDMENT");
  if (binding && additionalCostMicrousd !== 0) blockers.push("FINAL_INVALID_AUTHORIZATION_AMENDMENT");
  if (!options.current || doc.packageHash !== run.package_hash) blockers.push("FINAL_PACKAGE_CHANGED");
  if (run.state !== "failed" || run.claim_token) blockers.push("FINAL_RETRY_NOT_STOPPED");
  if (failed.receipt?.failure && (failed.receipt.failure.httpStatus !== reviewedHttpStatus || failed.receipt.failure.method !== "POST") ||
    binding && failed.receipt?.failure?.providerCode !== "invalid_labels") blockers.push("FINAL_FAILURE_CATEGORY_NOT_RETRYABLE");
  if (!run.profile || run.profile_binding || (binding ? failed.input.profileId : (failed.input.profile as { id?: string } | undefined)?.id) !== run.profile?.id) blockers.push("FINAL_PROFILE_CHANGED");
  const identity = run.configuration.providers[binding ? "binding" : "design"];
  if (failed.provider !== identity.id || failed.model !== identity.model) blockers.push("FINAL_PROVIDER_CHANGED");
  if (binding) {
    const design = latest.get("voice:design"), previewRef = (design?.receipt?.result as { previewRef?: unknown } | undefined)?.previewRef;
    const sentId = (failed.receipt?.request?.payload as { generated_voice_id?: unknown } | undefined)?.generated_voice_id;
    if (design?.state !== "ready" || !design.output || typeof previewRef !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(previewRef) ||
      failed.input.previewFingerprint !== design.fingerprint || sentId !== previewRef ||
      (design.input.profile as { id?: string } | undefined)?.id !== run.profile?.id) blockers.push("FINAL_SAVED_VOICE_DESIGN_REQUIRED");
  }
  if ([...latest.values()].some(op => op.id !== failed.id && op.kind !== "composition" && op.state !== "ready")) blockers.push("FINAL_OTHER_OPERATION_UNRESOLVED");
  if (!operations.some(op => op.kind === "video" && op.state === "ready" && op.output)) blockers.push("FINAL_UPSTREAM_OUTPUT_REQUIRED");
  if (amendments.some(a => a.failed_operation_id === failed.id)) blockers.push("FINAL_RETRY_ALREADY_AUTHORIZED");
  if (plan.diagnostics.length || projected === null) blockers.push("FINAL_RETRY_PREFLIGHT_FAILED");
  if (run.paid_requests + requiredNewRequests > auth.effectiveRequests + 1 || auth.effectiveRequests + 1 > 64) blockers.push("FINAL_BUDGET_INSUFFICIENT");
  if (projected !== null && (projected > auth.effectiveCostMicrousd + additionalCostMicrousd || auth.effectiveCostMicrousd + additionalCostMicrousd > 1_000_000_000)) blockers.push("FINAL_BUDGET_INSUFFICIENT");
  if (configuredIncludedCredits !== null && projectedCredits > configuredIncludedCredits) blockers.push("ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED");
  const databaseQuote = { executionId: run.id, version: run.version, configurationHash: run.configuration_hash, packageHash: run.package_hash,
    profileId: run.profile?.id, failedOperationId: failed.id, consumedRequests: run.paid_requests, sunkKnownCostMicrousd: sunk,
    replacementEstimate: quotedCost(replacement), remainingEstimates: remaining.map(quotedCost), projectedTotalCostMicrousd: projected,
    projectedRequests: run.paid_requests + requiredNewRequests, sharedReservedCredits,
    additionalCostMicrousd, operationStamps: operations.map(op => ({ id: op.id, state: op.state, fingerprint: op.fingerprint, updatedAt: op.updated_at })).sort((a, b) => a.id.localeCompare(b.id)) };
  // Match the exact JSON crossing PostgREST; omit optional undefined fields.
  const persistedQuote = JSON.parse(JSON.stringify(databaseQuote)) as typeof databaseQuote;
  const quoteVersion = packageDigest("sceenyk-final-retry-quote", persistedQuote);
  const review: RetryReview = { available: !blockers.length, blockers, operationId: failed.id, stage: binding ? "voice_binding" : "voice_design", originalAttempt: failed.attempt,
    reason: binding ? "provider_labels_corrected" : "provider_permission_corrected", reviewedHttpStatus, additionalRequests: 1, additionalCostMicrousd,
    replacementCostMicrousd: replacement.estimatedCostMicrousd, replacementCredits: replacement.estimatedCredits ?? 0, sunkKnownCostMicrousd: sunk,
    remainingPipelineCostMicrousd: remainingCost, projectedTotalCostMicrousd: projected, requiredNewRequests,
    authorization: auth, effectiveRequestsAfter: auth.effectiveRequests + 1, effectiveCostAfterMicrousd: auth.effectiveCostMicrousd + additionalCostMicrousd,
    projectedIncludedCredits: projectedCredits, configuredIncludedCredits,
    preservedWork: operations.filter(op => op.state === "ready" && op.output).map(op => `${op.scene_id ?? "Shared"} ${op.kind}`), quoteVersion };
  return { review, databaseQuote: persistedQuote };
}
