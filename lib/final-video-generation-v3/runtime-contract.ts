import { z } from "zod";
import { digestSchema } from "./contract";

export const privateAssetSchema = z.strictObject({ id: z.uuid(), storageKey: z.string().min(1), etag: z.string().min(1), sha256: digestSchema,
  sizeBytes: z.number().int().positive().safe(), mimeType: z.enum(["image/png", "video/mp4"]),
  width: z.number().int().positive(), height: z.number().int().positive(), durationMs: z.number().int().nonnegative(), hasAudio: z.boolean() });
export type PrivateAsset = z.infer<typeof privateAssetSchema>;
export const privateBindingSchema = privateAssetSchema.extend({ verifiedReadback: z.literal(true) })
  .transform(({ verifiedReadback: _proof, ...asset }) => { void _proof; return asset; });
export const qualitySchema = z.strictObject({ characterContinuity: z.enum(["not_checked", "pass", "fail"]),
  productContinuity: z.enum(["not_checked", "pass", "fail", "not_applicable"]), locationContinuity: z.enum(["not_checked", "pass", "fail"]),
  dialoguePresence: z.enum(["not_checked", "pass", "fail", "not_applicable"]), speechTiming: z.enum(["not_checked", "pass", "fail", "not_applicable"]),
  lipAudioSync: z.enum(["not_checked", "pass", "fail", "not_applicable"]), visualQuality: z.enum(["not_checked", "pass", "fail"]),
  notes: z.string().max(4000) });
export type Quality = z.infer<typeof qualitySchema>;
export const uncheckedQuality: Quality = { characterContinuity: "not_checked", productContinuity: "not_checked", locationContinuity: "not_checked",
  dialoguePresence: "not_checked", speechTiming: "not_checked", lipAudioSync: "not_checked", visualQuality: "not_checked", notes: "" };
export const quoteSchema = z.strictObject({ id: z.uuid(), packageId: z.uuid(), packageHash: digestSchema, projectId: z.uuid(),
  validityEvidence: z.unknown().nullable().default(null),
  currency: z.literal("USD"), observedAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }),
  segments: z.array(z.strictObject({ segmentUuid: z.uuid(), segmentId: z.string().min(1), segmentVersion: z.literal(1), fingerprint: digestSchema,
    model: z.string().min(1), body: z.record(z.string(), z.unknown()), bodyHash: digestSchema, estimatedCostMicrousd: z.number().int().nonnegative().safe(),
    estimateResponseHash: digestSchema })).min(1), totalMicrousd: z.number().int().nonnegative().safe() });
export type RuntimeQuote = z.infer<typeof quoteSchema>;
export const runtimeAuthorizationSchema = z.strictObject({ schema: z.literal("v3-paid-authorization-v1"), id: z.uuid(), projectId: z.uuid(),
  packageId: z.uuid(), packageVersion: z.number().int().positive(), packageHash: digestSchema, quoteId: z.uuid(), segmentUuid: z.uuid(),
  segmentId: z.string().min(1), segmentVersion: z.literal(1), segmentHash: digestSchema, provider: z.literal("higgsfield"), model: z.string().min(1),
  resolution: z.literal("480p"), durationMs: z.number().int().positive(), generateAudio: z.literal(true),
  maxRequests: z.literal(1), maxEstimatedCostMicrousd: z.number().int().nonnegative().safe(), operatorId: z.uuid(),
  packageMaxEstimatedCostMicrousd: z.number().int().nonnegative().safe(),
  approvedAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }), hash: digestSchema });
export type RuntimeAuthorization = z.infer<typeof runtimeAuthorizationSchema>;
export const paidIntentSchema = z.strictObject({ schema: z.literal("v3-paid-intent-v1"), id: z.uuid(), executionId: z.uuid(), projectId: z.uuid(),
  packageId: z.uuid(), packageVersion: z.number().int().positive(), packageHash: digestSchema, segmentUuid: z.uuid(), segmentId: z.string().min(1),
  segmentVersion: z.literal(1), segmentHash: digestSchema, provider: z.literal("higgsfield"), model: z.string().min(1),
  requestFingerprint: digestSchema, body: z.record(z.string(), z.unknown()), bodyHash: digestSchema, estimatedCostMicrousd: z.number().int().nonnegative().safe(),
  authorization: runtimeAuthorizationSchema, idempotencyKey: z.uuid(), attempt: z.literal(1), createdAt: z.iso.datetime({ offset: true }),
  deliveryExpiresAt: z.iso.datetime({ offset: true }), hash: digestSchema });
export type PaidIntent = z.infer<typeof paidIntentSchema>;
export const observationSchema = z.strictObject({ requestId: z.uuid(), status: z.enum(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]),
  statusUrl: z.string(), cancelUrl: z.string().nullable(), expiresAt: z.string().nullable(), resultUrl: z.string().nullable(),
  correlationId: z.string().nullable(), receiptHash: digestSchema, actualCostMicrousd: z.number().int().nonnegative().safe().nullable() });
export type ProviderObservation = z.infer<typeof observationSchema>;
export const runSchema = z.object({ id: z.uuid(), project_id: z.uuid(), package_id: z.uuid(), segment_uuid: z.uuid(),
  intent: paidIntentSchema, state: z.enum(["queued", "submitting", "provider_processing", "reconciliation_required", "result_saved", "awaiting_review", "approved", "failed", "deleting", "deleted"]),
  observation: observationSchema.nullable(), result: privateAssetSchema.nullable(), quality: qualitySchema.nullable(), error_code: z.string().nullable(),
  completed_at: z.string().nullable() });
export type Run = z.infer<typeof runSchema>;
export const taskSchema = z.object({ id: z.uuid(), project_id: z.uuid(), kind: z.enum(["character", "product", "location", "storyboard", "package", "video", "delete", "join"]),
  input: z.record(z.string(), z.unknown()), status: z.enum(["queued", "running", "done", "failed", "reconciliation_required"]),
  lease_token: z.uuid().nullable(), lease_until: z.string().nullable(), provider_started: z.boolean(), output: z.unknown().nullable(), error_code: z.string().nullable(), created_at: z.string() });
export type Task = z.infer<typeof taskSchema>;
export const artifactSchema = z.object({ id: z.uuid(), kind: z.enum(["character", "product", "location", "storyboard", "joined"]),
  version: z.number().int().positive(), document: z.record(z.string(), z.unknown()), approved_at: z.string().nullable(), rejected_at: z.string().nullable() });
export type Artifact = z.infer<typeof artifactSchema>;
