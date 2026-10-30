import "server-only";
import { randomUUID } from "node:crypto";
import { paidIntentSchema, runtimeAuthorizationSchema, quoteSchema, type RuntimeAuthorization, type RuntimeQuote } from "./runtime-contract";
import { v3Digest, v3BodyHash as exactBodyHash } from "./identity";
import { readFrozenPackage, type FrozenPackage } from "./package";

export function createRuntimeAuthorization(doc: FrozenPackage, quote: RuntimeQuote, segmentUuid: string, approval: {
  operatorId: string; approved: boolean; maximumMicrousd: number; packageMaximumMicrousd?: number; now: string;
}): RuntimeAuthorization {
  const segment = quote.segments.find(s => s.segmentUuid === segmentUuid);
  if (!approval.approved || !segment || quote.packageId !== doc.id || quote.packageHash !== doc.hash ||
    Date.parse(quote.expiresAt) <= Date.parse(approval.now) || segment.estimatedCostMicrousd > approval.maximumMicrousd ||
    quote.totalMicrousd > (approval.packageMaximumMicrousd ?? approval.maximumMicrousd)) throw new Error("V3_AUTHORIZATION_INVALID");
  const plan = doc.segments.find(s => s.id === segment.segmentId);
  if (!plan || plan.fingerprint !== segment.fingerprint) throw new Error("V3_SEGMENT_BINDING_INVALID");
  const body = { schema: "v3-paid-authorization-v1" as const, id: randomUUID(), projectId: doc.source.scope.projectId,
    packageId: doc.id, packageVersion: doc.version, packageHash: doc.hash, quoteId: quote.id, segmentUuid, segmentId: plan.id,
    segmentVersion: 1 as const, segmentHash: plan.fingerprint, provider: "higgsfield" as const, model: segment.model,
    resolution: "480p" as const, durationMs: plan.durationMs, generateAudio: true as const, maxRequests: 1 as const,
    maxEstimatedCostMicrousd: approval.maximumMicrousd, operatorId: approval.operatorId, approvedAt: approval.now, expiresAt: quote.expiresAt };
  const content = { ...body, packageMaxEstimatedCostMicrousd: approval.packageMaximumMicrousd ?? approval.maximumMicrousd };
  return runtimeAuthorizationSchema.parse({ ...content, hash: v3Digest("runtime-authorization", content) });
}
export function createPaidIntent(doc: FrozenPackage, quote: RuntimeQuote, authorization: RuntimeAuthorization, now: string) {
  const report = runtimePreflight(doc, quote, authorization, { current: true, transportEnabled: false, now, validityIssues: [] });
  if (!report.eligibleForPaidSubmission) throw new Error(report.issues.join(","));
  const segment = quote.segments.find(s => s.segmentUuid === authorization.segmentUuid)!;
  const body = { schema: "v3-paid-intent-v1" as const, id: randomUUID(), executionId: randomUUID(), projectId: doc.source.scope.projectId,
    packageId: doc.id, packageVersion: doc.version, packageHash: doc.hash, segmentUuid: segment.segmentUuid, segmentId: segment.segmentId,
    segmentVersion: 1 as const, segmentHash: segment.fingerprint, provider: "higgsfield" as const, model: segment.model,
    requestFingerprint: segment.fingerprint, body: segment.body, bodyHash: segment.bodyHash, estimatedCostMicrousd: segment.estimatedCostMicrousd,
    authorization, idempotencyKey: randomUUID(), attempt: 1 as const, createdAt: now, deliveryExpiresAt: quote.expiresAt };
  return paidIntentSchema.parse({ ...body, hash: v3Digest("paid-intent", body) });
}
export function runtimePreflight(value: unknown, quoteValue: unknown, authorizationValue: unknown, options: {
  current: boolean; transportEnabled: boolean; now: string; validityIssues: string[]; existingIntent?: boolean;
}) {
  const doc = readFrozenPackage(value), quote = quoteSchema.safeParse(quoteValue), a = runtimeAuthorizationSchema.safeParse(authorizationValue), issues = [...options.validityIssues];
  if (quote.success && (quote.data.segments.length !== doc.segments.length || quote.data.totalMicrousd !== doc.pricing.totalMicrousd ||
    quote.data.totalMicrousd !== quote.data.segments.reduce((n, s) => n + s.estimatedCostMicrousd, 0) || quote.data.segments.some((s, i) =>
      s.segmentId !== doc.segments[i]?.id || s.fingerprint !== doc.segments[i]?.fingerprint || s.bodyHash !== exactBodyHash(s.body)))) issues.push("V3_QUOTE_BINDING_INVALID");
  if (!options.current) issues.push("PACKAGE_STALE");
  if (!quote.success || quote.data.packageId !== doc.id || quote.data.packageHash !== doc.hash || Date.parse(quote.data.observedAt) > Date.parse(options.now) ||
    Date.parse(quote.data.expiresAt) <= Date.parse(options.now)) issues.push("COST_ESTIMATE_UNAVAILABLE");
  if (!a.success) issues.push("V3_AUTHORIZATION_REQUIRED");
  if (a.success) {
    const { hash, ...content } = a.data;
    const segment = quote.success ? quote.data.segments.find(s => s.segmentUuid === a.data.segmentUuid) : null;
    const planned = doc.segments.find(s => s.id === a.data.segmentId);
    if (hash !== v3Digest("runtime-authorization", content) || a.data.packageId !== doc.id || a.data.packageHash !== doc.hash || a.data.packageVersion !== doc.version ||
      a.data.projectId !== doc.source.scope.projectId || !segment || a.data.segmentHash !== segment.fingerprint || a.data.model !== segment.model ||
      !planned || a.data.segmentId !== segment.segmentId || a.data.durationMs !== planned.durationMs || a.data.segmentHash !== planned.fingerprint ||
      segment.bodyHash !== exactBodyHash(segment.body) || a.data.quoteId !== (quote.success ? quote.data.id : null) ||
      a.data.maxEstimatedCostMicrousd < segment.estimatedCostMicrousd) issues.push("V3_AUTHORIZATION_BINDING_INVALID");
    if (Date.parse(a.data.approvedAt) > Date.parse(options.now) || Date.parse(a.data.expiresAt) <= Date.parse(options.now) ||
      quote.success && Date.parse(a.data.expiresAt) > Date.parse(quote.data.expiresAt)) issues.push("V3_AUTHORIZATION_EXPIRED");
  }
  if (options.existingIntent) issues.push("EXISTING_INTENT_RECONCILE_OR_REUSE");
  if (doc.source.resolution !== "480p" || !doc.source.generateAudio || doc.source.mode !== "reference") issues.push("V3_TEST_PROFILE_INVALID");
  const eligible = issues.length === 0;
  return { projectId: doc.source.scope.projectId, packageId: doc.id, packageHash: doc.hash, segmentCount: doc.segments.length,
    provider: "higgsfield", durationMs: doc.source.storyboardContent.durationMs, resolution: doc.source.resolution,
    aspectRatio: doc.source.storyboardContent.aspectRatio, generateAudio: doc.source.generateAudio,
    capabilitySnapshotHash: doc.capabilityHash, qualityObservations: ["dialogue", "speech_timing", "lip_audio_sync", "character_product_location_and_shot_continuity"],
    segments: doc.segments.map(s => ({ id: s.id, segmentUuid: quote.success ? quote.data.segments.find(q => q.segmentId === s.id)?.segmentUuid : null,
      model: quote.success ? quote.data.segments.find(q => q.segmentId === s.id)?.model : null,
      durationMs: s.durationMs, sceneNumbers: s.includedSceneNumbers, fingerprint: s.fingerprint,
      promptCharacters: s.compiledPrompt.length, promptHash: v3Digest("director-prompt", s.compiledPrompt) })), references: doc.source.references.map(r => ({ id: r.id, role: r.role, version: r.version, sha256: r.sha256 })),
    estimatedCostMicrousd: quote.success ? quote.data.totalMicrousd : null, authorizedMaximumMicrousd: a.success ? a.data.maxEstimatedCostMicrousd : null,
    transportEnabled: options.transportEnabled, currentness: options.current ? "current" : "stale", duplicateProtection: "unique_package_segment_and_authorization",
    quoteId: quote.success ? quote.data.id : null, estimateExpiresAt: quote.success ? quote.data.expiresAt : null, authorizationState: a.success ? "bound" : "missing",
    // Requested Phase 3 distinction: eligibility evaluates every prerequisite except the separate transport switch.
    eligibleForPaidSubmission: eligible, canSubmit: eligible && options.transportEnabled, issues: [...new Set(issues)] };
}
