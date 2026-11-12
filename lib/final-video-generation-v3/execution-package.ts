import "server-only";
import { randomUUID } from "node:crypto";
import { paidIntentSchema, runtimeAuthorizationSchema, quoteSchema, type RuntimeAuthorization, type RuntimeQuote } from "./runtime-contract";
import { v3Digest, v3BodyHash as exactBodyHash } from "./identity";
import { readFrozenPackage, packageCost, type FrozenPackage } from "./package";
import { HiggsfieldVideoGenerationProvider } from "./adapters/higgsfield";
import { pricingConfiguration, suggestedAuthorizationMicrousd } from "./pricing/higgsfield-pricing";
import { videoResolutionSchema } from "@/lib/projects/video-resolution";

export function createRuntimeAuthorization(doc: FrozenPackage, quote: RuntimeQuote, segmentUuid: string, approval: {
  operatorId: string; approved: boolean; maximumMicrousd: number; packageMaximumMicrousd?: number; now: string;
  clipAttempt?: RuntimeAuthorization["clipAttempt"];
}): RuntimeAuthorization {
  const cost = packageCost(doc, new HiggsfieldVideoGenerationProvider(), approval.now);
  if (cost.code) throw new Error(cost.code);
  const segment = quote.segments.find(s => s.segmentUuid === segmentUuid);
  const manual = doc.pricing.source === "manual_provider_estimate" && quote.pricingSource === "manual_provider_estimate";
  if (!approval.approved || !segment || quote.packageId !== doc.id || quote.packageHash !== doc.hash ||
    (!manual && (!quote.expiresAt || Date.parse(quote.expiresAt) <= Date.parse(approval.now))) || segment.estimatedCostMicrousd > approval.maximumMicrousd ||
    quote.totalMicrousd > (approval.packageMaximumMicrousd ?? approval.maximumMicrousd)) throw new Error("V3_AUTHORIZATION_INVALID");
  const plan = doc.segments.find(s => s.id === segment.segmentId);
  if (!plan || plan.fingerprint !== segment.fingerprint || segment.body.resolution !== doc.source.resolution) throw new Error("V3_SEGMENT_BINDING_INVALID");
  if (manual && (quote.expiresAt !== null || quote.totalMicrousd !== doc.pricing.totalMicrousd || segment.estimatedCostMicrousd !== plan.estimate.estimatedCostMicrousd)) throw new Error("V3_LOCAL_PRICING_SNAPSHOT_INVALID");
  const body = { schema: "v3-paid-authorization-v1" as const, id: randomUUID(), projectId: doc.source.scope.projectId,
    packageId: doc.id, packageVersion: doc.version, packageHash: doc.hash, quoteId: quote.id, segmentUuid, segmentId: plan.id,
    segmentVersion: 1 as const, segmentHash: plan.fingerprint, provider: "higgsfield" as const, model: segment.model,
    resolution: doc.source.resolution, durationMs: plan.durationMs, generateAudio: true as const, maxRequests: 1 as const,
    maxEstimatedCostMicrousd: approval.maximumMicrousd, operatorId: approval.operatorId, approvedAt: approval.now,
    expiresAt: manual ? new Date(Date.parse(approval.now) + pricingConfiguration.authorizationLifetimeMs).toISOString() : quote.expiresAt! };
  const content = { ...body, packageMaxEstimatedCostMicrousd: approval.packageMaximumMicrousd ?? approval.maximumMicrousd,
    ...(approval.clipAttempt ? { clipAttempt: approval.clipAttempt } : {}) };
  return runtimeAuthorizationSchema.parse({ ...content, hash: v3Digest("runtime-authorization", content) });
}
export type ReferenceDelivery = { body: Record<string, unknown>; expiresAt: string };
export function createPaidIntent(doc: FrozenPackage, quote: RuntimeQuote, authorization: RuntimeAuthorization, now: string, delivery?: ReferenceDelivery) {
  const report = runtimePreflight(doc, quote, authorization, { current: true, transportEnabled: false, now, validityIssues: [], deliveryReady: !!delivery });
  if (!report.eligibleForPaidSubmission) throw new Error(report.issues.join(","));
  const segment = quote.segments.find(s => s.segmentUuid === authorization.segmentUuid)!;
  if (delivery) {
    const { image_urls: originalUrls, ...original } = segment.body, { image_urls: urls, ...refreshed } = delivery.body;
    if (v3Digest("delivery-content", original) !== v3Digest("delivery-content", refreshed) || !Array.isArray(urls) ||
      !Array.isArray(originalUrls) || urls.length !== originalUrls.length || urls.some(u => typeof u !== "string" || new URL(u).protocol !== "https:") ||
      !Number.isFinite(Date.parse(delivery.expiresAt)) || Date.parse(delivery.expiresAt) <= Date.parse(now)) throw new Error("V3_DELIVERY_BINDING_INVALID");
  }
  const body = { schema: "v3-paid-intent-v1" as const, id: randomUUID(), executionId: randomUUID(), projectId: doc.source.scope.projectId,
    packageId: doc.id, packageVersion: doc.version, packageHash: doc.hash, segmentUuid: segment.segmentUuid, segmentId: segment.segmentId,
    segmentVersion: 1 as const, segmentHash: segment.fingerprint, provider: "higgsfield" as const, model: segment.model,
    requestFingerprint: segment.fingerprint, body: delivery?.body ?? segment.body, bodyHash: delivery ? exactBodyHash(delivery.body) : segment.bodyHash, estimatedCostMicrousd: segment.estimatedCostMicrousd,
    authorization, idempotencyKey: randomUUID(), attempt: 1 as const, createdAt: now, deliveryExpiresAt: delivery?.expiresAt ?? quote.deliveryExpiresAt ?? quote.expiresAt };
  return paidIntentSchema.parse({ ...body, hash: v3Digest("paid-intent", body) });
}
export function runtimePreflight(value: unknown, quoteValue: unknown, authorizationValue: unknown, options: {
  current: boolean; transportEnabled: boolean; now: string; validityIssues: string[]; existingIntent?: boolean; deliveryReady?: boolean;
}) {
  const doc = readFrozenPackage(value), quote = quoteSchema.safeParse(quoteValue), a = runtimeAuthorizationSchema.safeParse(authorizationValue), issues = [...options.validityIssues];
  const manual = doc.pricing.source === "manual_provider_estimate";
  const cost = packageCost(doc, new HiggsfieldVideoGenerationProvider(), options.now);
  if (quote.success && (quote.data.segments.length !== doc.segments.length || quote.data.totalMicrousd !== doc.pricing.totalMicrousd ||
    quote.data.totalMicrousd !== quote.data.segments.reduce((n, s) => n + s.estimatedCostMicrousd, 0) || quote.data.segments.some((s, i) =>
      s.segmentId !== doc.segments[i]?.id || s.fingerprint !== doc.segments[i]?.fingerprint || s.bodyHash !== exactBodyHash(s.body) || s.body.resolution !== doc.source.resolution ||
      s.estimatedCostMicrousd !== doc.segments[i]?.estimate.estimatedCostMicrousd || manual && (s.model !== doc.segments[i]?.estimate.pricing?.model || s.estimateResponseHash !== doc.segments[i]?.estimate.evidenceHash)))) issues.push("V3_QUOTE_BINDING_INVALID");
  if (!options.current) issues.push("PACKAGE_STALE");
  if (!quote.success || quote.data.packageId !== doc.id || quote.data.packageHash !== doc.hash || Date.parse(quote.data.observedAt) > Date.parse(options.now) ||
    (manual ? quote.data.pricingSource !== "manual_provider_estimate" || quote.data.expiresAt !== null || cost.code !== null
      : !quote.data.expiresAt || Date.parse(quote.data.expiresAt) <= Date.parse(options.now))) issues.push(manual ? "V3_LOCAL_PRICING_SNAPSHOT_INVALID" : "COST_ESTIMATE_UNAVAILABLE");
  if (manual && quote.success && !options.deliveryReady && (!quote.data.deliveryExpiresAt || Date.parse(quote.data.deliveryExpiresAt) <= Date.parse(options.now))) issues.push("V3_REFERENCE_DELIVERY_EXPIRED");
  if (!a.success) issues.push("V3_AUTHORIZATION_REQUIRED");
  if (a.success) {
    const { hash, ...content } = a.data;
    const segment = quote.success ? quote.data.segments.find(s => s.segmentUuid === a.data.segmentUuid) : null;
    const planned = doc.segments.find(s => s.id === a.data.segmentId);
    if (hash !== v3Digest("runtime-authorization", content) || a.data.packageId !== doc.id || a.data.packageHash !== doc.hash || a.data.packageVersion !== doc.version ||
      a.data.projectId !== doc.source.scope.projectId || !segment || a.data.segmentHash !== segment.fingerprint || a.data.model !== segment.model ||
      !planned || a.data.segmentId !== segment.segmentId || a.data.durationMs !== planned.durationMs || a.data.segmentHash !== planned.fingerprint || a.data.resolution !== doc.source.resolution ||
      segment.bodyHash !== exactBodyHash(segment.body) || a.data.quoteId !== (quote.success ? quote.data.id : null) ||
      a.data.maxEstimatedCostMicrousd < segment.estimatedCostMicrousd) issues.push("V3_AUTHORIZATION_BINDING_INVALID");
    if (Date.parse(a.data.approvedAt) > Date.parse(options.now) || Date.parse(a.data.expiresAt) <= Date.parse(options.now) ||
      quote.success && quote.data.expiresAt !== null && Date.parse(a.data.expiresAt) > Date.parse(quote.data.expiresAt)) issues.push("V3_AUTHORIZATION_EXPIRED");
  }
  if (options.existingIntent) issues.push("EXISTING_INTENT_RECONCILE_OR_REUSE");
  if (cost.code === "V3_RESOLUTION_PRICING_NOT_CONFIGURED") issues.push(cost.code);
  if (!videoResolutionSchema.safeParse(doc.source.resolution).success || !doc.source.generateAudio || doc.source.mode !== "reference") issues.push("V3_TEST_PROFILE_INVALID");
  const eligible = issues.length === 0;
  return { projectId: doc.source.scope.projectId, packageId: doc.id, packageHash: doc.hash, segmentCount: doc.segments.length,
    provider: "higgsfield", durationMs: doc.source.storyboardContent.durationMs, resolution: doc.source.resolution,
    aspectRatio: doc.source.storyboardContent.aspectRatio, generateAudio: doc.source.generateAudio,
    capabilitySnapshotHash: doc.capabilityHash, qualityObservations: ["dialogue", "speech_timing", "lip_audio_sync", "character_product_location_and_shot_continuity"],
    segments: doc.segments.map(s => ({ id: s.id, segmentUuid: quote.success ? quote.data.segments.find(q => q.segmentId === s.id)?.segmentUuid : null,
      model: quote.success ? quote.data.segments.find(q => q.segmentId === s.id)?.model : null,
      durationMs: s.durationMs, sceneNumbers: s.includedSceneNumbers, fingerprint: s.fingerprint, estimatedCostMicrousd: s.estimate.estimatedCostMicrousd,
      promptCharacters: s.compiledPrompt.length, promptHash: v3Digest("director-prompt", s.compiledPrompt) })), references: doc.source.references.map(r => ({ id: r.id, role: r.role, version: r.version, sha256: r.sha256 })),
    estimatedCostMicrousd: quote.success ? quote.data.totalMicrousd : null, authorizedMaximumMicrousd: a.success ? a.data.maxEstimatedCostMicrousd : null,
    pricingSource: doc.pricing.source ?? "historical_account_estimate", pricingVersion: doc.pricing.pricingVersion ?? null,
    suggestedMaximumMicrousd: manual && doc.pricing.totalMicrousd !== null ? suggestedAuthorizationMicrousd(doc.pricing.totalMicrousd) : null,
    suggestedAuthorizationBufferPercent: pricingConfiguration.authorizationBufferBasisPoints / 100,
    transportEnabled: options.transportEnabled, currentness: options.current ? "current" : "stale", duplicateProtection: "unique_package_segment_and_authorization",
    quoteId: quote.success ? quote.data.id : null, estimateExpiresAt: quote.success ? quote.data.expiresAt : null, authorizationState: a.success ? "bound" : "missing",
    // Requested Phase 3 distinction: eligibility evaluates every prerequisite except the separate transport switch.
    eligibleForPaidSubmission: eligible, canSubmit: eligible && options.transportEnabled, issues: [...new Set(issues)] };
}
