import { z } from "zod";
import { storyboardSchema, storyboardSceneSchema } from "@/lib/storyboard/schema";
import { ugcNarrationSchema } from "@/lib/ugc-jobs/input-contract";

const version = z.number().int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const asset = z.object({ id: z.uuid(), storageKey: z.string().min(1).max(1000), etag: z.string().min(1), sha256: hash,
  sizeBytes: version.max(100 * 1024 * 1024), mimeType: z.literal("image/png"), width: version, height: version }).passthrough();
const approval = z.strictObject({ id: z.uuid(), version, approvedAt: z.iso.datetime({ offset: true }) });
export const packageInputSchema = z.strictObject({
  ownerId: z.uuid(), projectId: z.uuid(), jobId: z.uuid(),
  storyboard: approval.extend({ revision: version, document: storyboardSchema }),
  approvals: z.strictObject({ character: approval, product: approval,
    location: approval.extend({ revision: version, candidateId: z.uuid() }) }),
  source: z.object({
    scene: z.object({ projectTitle: z.string().min(1).max(120), creationType: z.literal("ugc"),
      sceneDescription: z.string().min(1), ugcType: z.string().min(1), narration: ugcNarrationSchema,
      character: z.object({ name: z.string().min(1).max(80) }).passthrough(), product: z.object({ name: z.string().min(1).max(80) }).passthrough(),
      settings: z.object({ duration: z.enum(["5", "10", "30"]), aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
        visualStyle: z.string().min(1), tone: z.string().min(1) }).passthrough(),
    }).passthrough(),
    dependencies: z.object({ character: version, product: version, locationId: z.uuid(), locationVersion: version, locationCandidateId: z.uuid() }).passthrough(),
    character: asset, product: asset, location: asset, locationPlan: z.record(z.string(), z.unknown()), wardrobe: z.unknown(),
  }).passthrough(),
});
export type PackageInput = z.infer<typeof packageInputSchema>;
const voice = storyboardSchema.shape.voice;
const binding = z.strictObject({ character: z.literal("character"), product: z.literal("product"), location: z.literal("location") });
export const packageSceneSchema = storyboardSceneSchema.omit({ characterAssetId: true, productAssetId: true, locationAssetId: true, speech: true, generationPrompt: true }).extend({
  id: z.string().regex(/^scene-[1-9]\d?$/), durationMs: version.max(30_000), bindings: binding, voice,
  speech: z.array(storyboardSceneSchema.shape.speech.element.omit({ characterAssetId: true }).extend({ characterBinding: z.literal("character") })).max(8),
  generationPrompt: z.string().min(1).max(64_000),
});
const reference = z.strictObject({ id: z.uuid(), approvalId: z.uuid(), approvalVersion: version,
  approvedAt: z.iso.datetime({ offset: true }), name: z.string().min(1).max(120), sha256: hash, mimeType: z.literal("image/png"),
  sizeBytes: version, width: version, height: version });
export const packageRequirementsSchema = z.strictObject({ referenceImages: z.literal(true), referenceImageCount: z.literal(3),
  characterReference: z.literal(true), productReference: z.literal(true), locationReference: z.literal(true),
  dialogue: z.boolean(), narration: z.boolean(), consistentVoice: z.boolean(),
  durationMs: version.max(30_000), sceneCount: version.max(10), sceneDurationsMs: z.array(version.max(30_000)).min(1).max(10),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]), resolution: z.null(), outputKind: z.literal("video"), outputFormat: z.null(),
  audioInstructions: z.array(storyboardSceneSchema.shape.audio.extend({ sceneNumber: version.max(10) })).min(1).max(10),
});
export const videoGenerationPackageSchema = z.strictObject({
  schemaVersion: z.literal(1), compilerVersion: z.literal(1), promptVersion: z.literal(1), fingerprintVersion: z.literal(1),
  packageVersion: version, inputFingerprint: hash, packageHash: hash,
  project: z.strictObject({ id: z.uuid(), ownerId: z.uuid(), jobId: z.uuid(), title: z.string().min(1).max(120),
    creativeDirection: z.string().min(1), creationType: z.literal("ugc"), videoType: z.string().min(1),
    visualStyle: z.string().min(1), tone: z.string().min(1), narration: ugcNarrationSchema }),
  approvedReferences: z.strictObject({ character: reference, product: reference, location: reference.extend({ revision: version, candidateId: z.uuid() }) }),
  storyboard: approval.extend({ revision: version, schemaVersion: z.literal(1), documentHash: hash }),
  timeline: z.strictObject({ totalDurationMs: version.max(30_000), unit: z.literal("milliseconds") }),
  output: z.strictObject({ kind: z.literal("video"), aspectRatio: z.enum(["9:16", "16:9", "1:1"]), durationMs: version.max(30_000),
    resolution: z.null(), frameRate: z.null(), format: z.null(), seed: z.null() }),
  voice, continuity: storyboardSchema.shape.continuity,
  requirements: packageRequirementsSchema, scenes: z.array(packageSceneSchema).min(1).max(10),
});
export type VideoGenerationPackage = z.infer<typeof videoGenerationPackageSchema>;
export type VideoGenerationRequirements = z.infer<typeof packageRequirementsSchema>;
export const packageStates = ["queued", "running", "review", "approved", "failed", "deleted"] as const;
export type PackageState = typeof packageStates[number];
export const packagePhases = ["checking", "building", "validating", "saving", "review", "approved", "failed", "deleted"] as const;
export type PackagePhase = typeof packagePhases[number];
export type PackageRow = {
  id: string; owner_user_id: string; project_id: string; job_id: string; revision: number; version: number;
  request_id: string; input: PackageInput; input_fingerprint: string; document: VideoGenerationPackage | null;
  package_hash: string | null; state: PackageState; phase: PackagePhase; error_code: string | null;
  validation_receipt: { validatorVersion: number; inputFingerprint: string; packageHash: string; validatedAt: string;
    assetSha256: { character: string; product: string; location: string } } | null;
  approved_at: string | null; approved_by: string | null; was_approved: boolean;
  worker_id: string | null; claim_token: string | null; lease_expires_at: string | null; heartbeat_at: string | null;
  attempts: number; created_at: string; updated_at: string;
  stale_at: string | null;
};
// Safe owner projection. Never serialize PackageRow/input/storage descriptors.
export type PackageSummary = Pick<VideoGenerationPackage, "packageVersion" | "timeline" | "output" | "scenes" | "voice" | "requirements"> & {
  title: string; visualStyle: string; tone: string; videoType: string;
  character: string; product: string; location: string; storyboardVersion: number; storyboardRevision: number;
  referenceVersions: { character: number; product: number; location: number };
};
export type PackageReview = {
  id: string; version: number; revision: number; state: PackageState; phase: PackagePhase; current: boolean;
  summary: PackageSummary | null; error: string | null; approvedAt: string | null;
  canApprove: boolean; canDelete: boolean; canRetry: boolean; attempts: number;
  heartbeatAt: string | null; leaseExpiresAt: string | null; updatedAt: string;
};
export const packageActionSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid(),
  action: z.enum(["prepare", "approve", "reject", "retry"]), packageId: z.uuid().optional(), version: z.number().int().nonnegative(),
  requestId: z.uuid().optional() }).refine(value => value.action === "prepare" ? !!value.requestId : !!value.packageId && value.version > 0);
export const packageMessages: Record<PackagePhase, string> = { checking: "Checking approved assets", building: "Building scene packages",
  validating: "Validating timing and bindings", saving: "Saving package", review: "Waiting for review",
  approved: "Generation package approved", failed: "Generation package stopped safely", deleted: "Generation package deleted" };
export function packageStatusLabel(review: PackageReview) {
  return !review.current && review.state !== "deleted" ? "Generation package is stale" :
    review.state === "queued" ? "Generation package queued" : packageMessages[review.phase];
}
export function packageErrorMessage(code: string | null) {
  if (code === "PACKAGE_INPUT_CHANGED") return "Approved references, Storyboard or project settings changed. Prepare a new package from current approvals.";
  if (code === "PACKAGE_ASSET_UNAVAILABLE") return "An approved reference image is unavailable or failed its integrity check. Restore the exact approved asset before retrying.";
  if (code === "PACKAGE_INVALID") return "Package validation failed. Check the approved Storyboard timing, required scene details and reference bindings.";
  if (code === "PACKAGE_RECOVERY_EXHAUSTED") return "Package recovery reached its attempt limit. Reject and Delete before explicitly preparing again.";
  return "Package preparation stopped safely. Check status and local worker setup. No provider request was made.";
}
