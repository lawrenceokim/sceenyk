import { z } from "zod";
import { packageSceneSchema } from "@/lib/video-generation-package/contract";
import { transitionSchema, voiceDeliverySchema, audioCueSchema } from "@/lib/execution-v1/contract";

export const V3_WORKFLOW = "final-video-v3" as const;
export const V3_TEST_RESOLUTION = "480p" as const;
const positive = z.number().int().positive();
const ms = z.number().int().nonnegative().max(600_000);
const text = z.string().trim().min(1).max(2000);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const scopeSchema = z.strictObject({ ownerId: z.uuid(), projectId: z.uuid(), jobId: z.uuid() });
const approval = z.strictObject({ id: z.uuid(), version: positive, hash: digestSchema, approvedAt: z.iso.datetime({ offset: true }) });
export const referenceSchema = z.strictObject({ id: z.uuid(), projectId: z.uuid(), originWorkflow: z.literal(V3_WORKFLOW),
  role: z.enum(["character", "product", "location", "motion", "sound", "start_frame", "end_frame"]),
  kind: z.enum(["image", "audio", "video"]), name: text, version: positive,
  approvalId: z.uuid(), approvalVersion: positive, sha256: digestSchema, sizeBytes: positive,
  mimeType: z.string().min(1), durationMs: ms.nullable() });
export const directorSceneSchema = packageSceneSchema.omit({ voice: true, bindings: true, generationPrompt: true, durationMs: true }).extend({
  id: z.string().min(1).max(120), number: positive.max(100), startMs: ms, endMs: ms,
  actions: z.array(packageSceneSchema.shape.actions.element.extend({ startMs: ms, endMs: ms })).min(1).max(8),
  speech: z.array(packageSceneSchema.shape.speech.element.omit({ characterBinding: true }).extend({ startMs: ms, endMs: ms,
    delivery: voiceDeliverySchema, deliveryNote: z.string().max(2000) })).max(8),
  transition: transitionSchema, transitionNote: z.string().max(2000),
  audio: z.strictObject({ background: audioCueSchema, effects: audioCueSchema, music: audioCueSchema }),
});
export const directorStoryboardSchema = z.strictObject({ version: z.literal("director-storyboard-v3"), title: text, concept: text,
  durationMs: positive.max(600_000), aspectRatio: text, visualStyle: text, tone: text, voiceIntent: text,
  continuity: z.strictObject({ identity: text, appearance: text, outfit: text, product: text, location: text }),
  scenes: z.array(directorSceneSchema).min(1).max(100) });
export const planningInputSchema = z.strictObject({ workflow: z.literal(V3_WORKFLOW), profileId: text, scope: scopeSchema,
  // This evidence must later come from trusted owner/database reads, never a browser assertion.
  provenance: z.strictObject({ projectWorkflow: z.literal(V3_WORKFLOW), originalImageId: z.uuid(), originalImageHash: digestSchema }),
  package: approval, storyboard: approval,
  direction: z.string().trim().min(1).max(64_000), storyboardContent: directorStoryboardSchema,
  mode: z.enum(["text", "image", "reference"]).default("reference"),
  resolution: z.string().min(1).default(V3_TEST_RESOLUTION), format: z.string().min(1).default("mp4"),
  generateAudio: z.boolean().default(true), references: z.array(referenceSchema).max(100),
  requiredCapabilities: z.array(z.string().min(1).max(120)).max(20).default([]) });
export type PlanningInput = z.infer<typeof planningInputSchema>;
export type DirectorStoryboard = z.infer<typeof directorStoryboardSchema>;
export type DirectorScene = z.infer<typeof directorSceneSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type Issue = { code: string; path: string; message: string; sceneNumber?: number };
export const supportSchema = z.enum(["supported", "unsupported", "unverified"]);
export const featureNames = ["nativeAudio", "nativeDialogue", "nativeLipSync", "nativeAmbience", "nativeSoundEffects", "nativeMusic", "multiShotPrompting", "imageReferences", "audioReferences", "videoReferences"] as const;
const fileLimit = z.strictObject({ maxCount: z.number().int().nonnegative().nullable(), maxBytes: positive.nullable(),
  mimeTypes: z.array(z.string()).nullable(), maxDurationMs: positive.nullable(), maxCombinedDurationMs: positive.nullable() });
export const capabilitiesSchema = z.strictObject({ version: z.literal("video-capabilities-v3"), providerId: text, profileId: text,
  adapterVersion: text, contractVersion: text, verifiedOn: z.iso.date(), sources: z.array(z.url()).min(1),
  modes: z.array(z.enum(["text", "image", "reference"])).min(1), maxContinuousDurationMs: positive,
  supportedDurationsMs: z.array(positive).min(1).max(1000), supportedResolutions: z.array(text).min(1),
  supportedAspectRatios: z.array(text).min(1), supportedFormats: z.array(text).min(1),
  features: z.strictObject({ nativeAudio: supportSchema, nativeDialogue: supportSchema, nativeLipSync: supportSchema,
    nativeAmbience: supportSchema, nativeSoundEffects: supportSchema, nativeMusic: supportSchema,
    multiShotPrompting: supportSchema, imageReferences: supportSchema, audioReferences: supportSchema, videoReferences: supportSchema }),
  transitions: z.record(z.string(), supportSchema), maxPromptCharacters: positive.nullable(),
  referenceLimits: z.strictObject({ total: positive.nullable(), image: fileLimit, audio: fileLimit, video: fileLimit }) });
export type VideoCapabilities = z.infer<typeof capabilitiesSchema>;
export type CostEstimate = { status: "estimated" | "unavailable"; estimatedCostMicrousd: number | null;
  source: "account_estimate" | "unavailable"; sourceUrl: string; pricingVersion: string; reason: string | null;
  evidenceHash: string | null; actualProviderCostMicrousd: null; providerReceipt: null };
export const costEstimateSchema = z.strictObject({ status: z.enum(["estimated", "unavailable"]), estimatedCostMicrousd: z.number().int().nonnegative().nullable(),
  source: z.enum(["account_estimate", "unavailable"]), sourceUrl: z.url(), pricingVersion: text, reason: z.string().nullable(),
  evidenceHash: digestSchema.nullable(), actualProviderCostMicrousd: z.null(), providerReceipt: z.null() })
  .refine(value => value.status === "estimated" ? value.source === "account_estimate" && value.estimatedCostMicrousd !== null && value.evidenceHash !== null && value.reason === null
    : value.source === "unavailable" && value.estimatedCostMicrousd === null);
export const estimateEvidenceSchema = z.strictObject({ source: z.literal("authenticated_provider_estimate"),
  providerId: text, profileId: text, commandFingerprint: digestSchema, accountScope: text,
  usd: z.string().regex(/^\d+(?:\.\d+)?$/), responseHash: digestSchema,
  observedAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }) });
export type EstimateEvidence = z.infer<typeof estimateEvidenceSchema>;
export type CompiledDirection = { version: "director-compiler-v3"; startMs: number; endMs: number; durationMs: number;
  sceneNumbers: number[]; scenes: DirectorScene[]; prompt: string;
  creative: Pick<DirectorStoryboard, "concept" | "visualStyle" | "tone" | "voiceIntent" | "continuity"> & { direction: string };
  shotChanges: { fromSceneNumber: number; toSceneNumber: number | null; atMs: number; localAtMs: number;
    transition: DirectorScene["transition"]; owner: "generation" | "join" }[];
  shots: { sceneNumber: number; startMs: number; endMs: number; localStartMs: number; localEndMs: number }[];
  dialogue: { sceneNumber: number; index: number; text: string; startMs: number; endMs: number; localStartMs: number; localEndMs: number }[] };
export type VideoCommand = { workflow: typeof V3_WORKFLOW; profileId: string; scope: PlanningInput["scope"];
  package: PlanningInput["package"]; storyboard: PlanningInput["storyboard"]; provenance: PlanningInput["provenance"];
  capabilityHash: string; mode: PlanningInput["mode"]; aspectRatio: string; resolution: string; format: string;
  generateAudio: boolean; references: Reference[]; direction: CompiledDirection };
export type GenerationSegment = { id: string; version: 1; startMs: number; endMs: number; durationMs: number;
  includedSceneNumbers: number[]; command: VideoCommand; capabilityHash: string; fingerprint: string;
  estimate: CostEstimate; executionStatus: "not_started"; actualProviderCostMicrousd: null; providerReceipt: null };
export type SegmentPlan = { workflow: typeof V3_WORKFLOW; version: 1; paidExecutionEnabled: false;
  scope: PlanningInput["scope"]; package: PlanningInput["package"]; storyboard: PlanningInput["storyboard"];
  inputFingerprint: string; capabilitySnapshot: VideoCapabilities; capabilityHash: string; fingerprint: string;
  requiredCapabilities: string[];
  authorizationSnapshot: PlanningContext["authorization"];
  composition: "direct_final_review" | "review_segments_then_join"; segments: GenerationSegment[]; readinessIssues: Issue[] };
export type PlanningResult = { ok: true; plan: SegmentPlan } | { ok: false; issues: Issue[] };
export const planningContextSchema = z.strictObject({ current: planningInputSchema.pick({ workflow: true, profileId: true, scope: true,
  provenance: true, package: true, storyboard: true, references: true }), now: z.iso.datetime({ offset: true }), accountScope: text,
  estimateEvidence: z.array(estimateEvidenceSchema), authorization: z.strictObject({ id: z.uuid(), version: positive,
    projectId: z.uuid(), packageHash: digestSchema, inputFingerprint: digestSchema, capabilityHash: digestSchema,
    maxRequests: z.number().int().nonnegative(), maxCostMicrousd: z.number().int().nonnegative(),
    consumedRequests: z.number().int().nonnegative(), committedCostMicrousd: z.number().int().nonnegative() }) });
export type PlanningContext = z.infer<typeof planningContextSchema>;

export interface VideoGenerationProvider {
  capabilities(): VideoCapabilities;
  estimateCost(command: VideoCommand, evidence: readonly EstimateEvidence[], accountScope: string, now: string): CostEstimate;
  // Additional payload fields stay opaque to core and belong to the adapter.
  prepareRequest(segment: GenerationSegment, media: ReadonlyMap<string, string>): {
    executable: false; providerId: string; profileId: string; commandFingerprint: string;
  };
}
export type PreparedOperation<T> = { workflow: typeof V3_WORKFLOW; executable: false; providerId: string; body: T };
export interface ImageGenerationProvider<T = unknown> {
  prepareReference(input: { instruction: string; identityInstructions: string; referenceUrls: readonly string[] }): PreparedOperation<T>;
}
export interface CreativeDirectorProvider<T = unknown> {
  prepareStoryboard(input: { instruction: string; durationMs: number; referenceUrls: readonly string[] }): PreparedOperation<T>;
  parseStoryboard(value: unknown): DirectorStoryboard;
}
