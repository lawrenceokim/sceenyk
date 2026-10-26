import { z } from "zod";
import { characterImageModel } from "@/lib/character-sheet/generation-contract";

export const characterV5 = {
  promptVersion: 5,
  contractVersion: 5,
  revision: "simple-manual-review-v1",
  model: characterImageModel,
} as const;
export const v5Slots = [
  "face",
  "back",
  "front_source",
  "front",
  "sheet",
] as const;
export type V5Slot = (typeof v5Slots)[number];
export const v5Prompts = {
  face: "regenerate this image but place the character in a gray background with only the character face in it",
  back: "Regenerate this character as one full-body back view on a plain neutral gray background. Show only one character. The camera must be directly behind the character. The character must face completely away from the camera in a perfectly straight rear view. Do not show any part of the face or side profile. Show the back of the head, back of the neck, full outfit, full body, arms, legs, and shoes. Keep the same outfit, hairstyle silhouette, body shape, and proportions. There should be No shadow on the gray background.",
  front_source:
    "Regenerate this image but place the character on a plain neutral gray background with no shadow on the background or floor. Show only one character facing directly forward. Show the character from the shoulders down to the shoes, with the full outfit, full torso, full legs, and full footwear completely visible inside the frame. Do not show the head or face. Do not crop the shoulders. Do not crop the legs. Do not crop the shoes. Keep some empty gray space around the body so the shoulders and shoes are fully inside the image. NEVER REVEAL THE HEAD AND FACE.",
} as const;
export const v5FrontFraming = {
  shouldersExpectedInFrame: true,
  shoesExpectedInFrame: true,
  torsoAndLegsExpectedInFrame: true,
  emptyGrayMarginRequired: true,
  headAndFaceAllowed: false,
  backgroundOrFloorShadowAllowed: false,
} as const;
export const v5FrontReviewHelp =
  "Inspect the final Front source and Accept or Reject it. Reject if shoulders are cropped. Reject if legs are cropped. Reject if shoes/footwear are cropped. Reject if the figure is tightly zoomed. Reject if the head/face is visible. Reject if there is any shadow on the background or floor. Require one front-facing character, the full torso and outfit, and empty neutral gray space around the shoulders and shoes. Reject if the outfit/body consistency is wrong.";
export const v5ArtifactSchema = z.strictObject({
  id: z.uuid(),
  storageKey: z.string().min(1).max(512),
  etag: z.string().min(1).max(512),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  width: z.number().int().min(128).max(4096),
  height: z.number().int().min(128).max(4096),
  mimeType: z.literal("image/png"),
});
export type V5Artifact = z.infer<typeof v5ArtifactSchema>;
export type V5Workflow = {
  id: string;
  job_id: string;
  owner_user_id: string;
  project_id: string;
  version: number;
  slot: V5Slot;
  state: "queued" | "running" | "review" | "ready" | "approved" | "failed";
  candidate_id: string | null;
  accepted: Partial<Record<V5Slot, V5Artifact>>;
  sheet: V5Artifact | null;
  soul_id: string | null;
  crop_top: number;
  error_phase: V5Phase | null;
  error_code: string | null;
  claim_token: string | null;
  lease_expires_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  work_phase: "preparing" | "generating" | "local_crop" | "sheet_composition";
  processing_elapsed_ms: number;
  processing_updated_at: string | null;
};
export type V5Candidate = {
  id: string;
  workflow_id: string;
  slot: V5Slot;
  state:
    | "queued"
    | "intent"
    | "submitted"
    | "review"
    | "accepted"
    | "rejecting"
    | "rejected"
    | "failed";
  request_id: string | null;
  status_url: string | null;
  artifact: V5Artifact | null;
  planned_key: string | null;
  generation:
    | V5ProviderGeneration
    | {
        promptVersion: 5;
        contractVersion: 5;
        revision: "simple-manual-review-v1";
        model: "sharp";
        slot: "front" | "sheet";
        cropTop?: number;
        concealment?: "gray-mask-v1";
        inputs: Record<string, { id: string; sha256: string; etag: string }>;
      }
    | null;
  input_asset: {
    id: string;
    sha256: string;
    etag: string;
    storageKey?: string;
    kind?: "original" | "accepted_face" | "accepted_back" | "original_upload";
  } | null;
  provider_terminal: boolean;
  output_proof: V5OutputProof | null;
  created_at: string;
  updated_at: string;
};
export const v5OutputProofSchema = v5ArtifactSchema.omit({
  storageKey: true,
  etag: true,
});
export type V5OutputProof = z.infer<typeof v5OutputProofSchema>;
export const v5Phases = [
  "input_read",
  "input_sign",
  "provider_submit",
  "provider_status",
  "output_download",
  "output_decode",
  "r2_put",
  "r2_verify",
  "metadata_persistence",
  "candidate_insertion",
  "preview_sign",
  "preview_read",
  "candidate_delete",
  "local_crop",
  "sheet_composition",
  "other",
  "provider_output_download",
  "image_decode",
  "r2_write",
  "candidate_readback",
  "preview_signing",
] as const;
export type V5Phase = (typeof v5Phases)[number];
export class CharacterV5Error extends Error {
  constructor(
    readonly phase: V5Phase,
    readonly code = "CHARACTER_V5_TECHNICAL_FAILURE",
    readonly database?: import("./database-diagnostics").V5DatabaseDiagnostic,
    readonly storage?: import("./storage-diagnostics").V5StorageDiagnostic,
  ) {
    super(code);
  }
}
export function v5Generation(
  slot: "face" | "back" | "front_source",
  soulId: string | null,
) {
  // All new V5 views use their single explicit image input, without Soul ID.
  soulId = null;
  return {
    ...characterV5,
    slot,
    prompt: v5Prompts[slot],
    resolution: "720p" as const,
    aspectRatio: slot === "front_source" ? ("2:3" as const) : ("4:3" as const),
    batchSize: 1 as const,
    enhancePrompt: slot === "face",
    soulId,
    soulIdUsed: !!soulId,
    promptRevision: slot === "back" ? 4 : slot === "front_source" ? 4 : 2,
    referenceStrength: slot === "face" || soulId ? 1 : null,
    seed: slot === "face" ? 362102 : null,
    ...(slot === "front_source"
      ? {
          frontPreparation: "provider-final-v1" as const,
          frontFraming: v5FrontFraming,
        }
      : {}),
  };
}
export function v5HasFrontMask(generation: V5Candidate["generation"]) {
  return (
    !!generation &&
    "concealment" in generation &&
    generation.concealment === "gray-mask-v1"
  );
}
export function v5IsFinalFront(generation: V5Candidate["generation"]) {
  return (
    !!generation &&
    "frontPreparation" in generation &&
    generation.frontPreparation === "provider-final-v1"
  );
}
// Older saved V5 intents predate these extra provenance fields.
type V5ProviderGeneration = Omit<
  ReturnType<typeof v5Generation>,
  "promptRevision" | "referenceStrength" | "seed" | "frontFraming"
> &
  Partial<
    Pick<
      ReturnType<typeof v5Generation>,
      "promptRevision" | "referenceStrength" | "seed" | "frontFraming"
    >
  > & { concealment?: "gray-mask-v1" };
// The saved intent and wire payload share one static configuration. Null seed
// records deliberate omission, not a claim about the provider's chosen seed.
export function v5ProviderPayload(
  generation: ReturnType<typeof v5Generation>,
  imageUrl: string,
) {
  return {
    prompt: generation.prompt,
    image_url: imageUrl,
    batch_size: generation.batchSize,
    resolution: generation.resolution,
    aspect_ratio: generation.aspectRatio,
    enhance_prompt: generation.enhancePrompt,
    ...(generation.slot === "face"
      ? {
          custom_reference_id: null,
          custom_reference_strength: generation.referenceStrength,
        }
      : generation.soulId
        ? {
            custom_reference_id: generation.soulId,
            custom_reference_strength: generation.referenceStrength,
          }
        : {}),
    ...(generation.seed !== null ? { seed: generation.seed } : {}),
  };
}
export type V5Review = {
  id: string;
  version: number;
  slot: V5Slot;
  state: V5Workflow["state"];
  candidateId: string | null;
  accepted: V5Slot[];
  approvedAt: string | null;
  errorPhase: V5Phase | null;
  errorCode: string | null;
  cropTop: number;
  soulIdUsed: boolean;
  workPhase: V5Workflow["work_phase"];
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  reconciliationRequired: boolean;
  canRetrySaving: boolean;
  savingIncomplete: boolean;
  recoveryState: import("./recovery-state").V5RecoveryState;
  persistenceState:
    | "storage_failed"
    | "saving_incomplete"
    | "storage_missing"
    | "ready"
    | "pending";
  elapsedMs: number;
  runningSince: string | null;
  backCandidateAvailable?: boolean;
  backDiagnostics?: V5BackReviewDiagnostic;
  frontDiagnostics?: V5FrontReviewDiagnostic;
  frontReady?: boolean;
  legacyFront?: boolean;
};
export type V5BackReviewDiagnostic = {
  candidateId: string;
  objectKey: string | null;
  hash: string | null;
  providerRequestId: string | null;
  inputSource: V5Candidate["input_asset"];
  generation: V5Candidate["generation"];
};
export type V5FrontReviewDiagnostic = V5BackReviewDiagnostic & {
  candidateDimensions: { width: number; height: number } | null;
  framingContract: typeof v5FrontFraming | null;
};
export const v5BackReviewWarnings = [
  "partial face visible",
  "sideways pose",
  "background shadow",
  "multiple characters",
] as const;
export const v5ActionSchema = z.strictObject({
  projectId: z.uuid(),
  jobId: z.uuid(),
  version: z.number().int().nonnegative(),
  action: z.enum([
    "start",
    "accept",
    "reject",
    "regenerate",
    "approve",
    "retry_saving",
  ]),
  slot: z.enum(v5Slots).optional(),
});
export function v5Review(
  workflow: V5Workflow,
  reconciliationRequired = false,
  canRetrySaving = false,
  savingIncomplete = false,
  recoveryState: V5Review["recoveryState"] = "not_needed",
  soulIdUsed = !!workflow.soul_id,
): V5Review {
  return {
    id: workflow.id,
    version: workflow.version,
    slot: workflow.slot,
    state: workflow.state,
    candidateId: workflow.candidate_id,
    accepted: v5Slots.filter((slot) => !!workflow.accepted[slot]),
    approvedAt: workflow.approved_at,
    errorPhase: workflow.error_phase,
    errorCode: workflow.error_code,
    cropTop: workflow.crop_top,
    soulIdUsed,
    workPhase: workflow.work_phase,
    heartbeatAt: workflow.state === "running" ? workflow.updated_at : null,
    leaseExpiresAt: workflow.lease_expires_at,
    reconciliationRequired,
    elapsedMs: workflow.processing_elapsed_ms,
    runningSince: workflow.processing_updated_at,
    canRetrySaving,
    savingIncomplete,
    recoveryState,
    persistenceState:
      recoveryState === "storage_missing"
        ? "storage_missing"
        : savingIncomplete
          ? workflow.error_phase === "r2_write" && recoveryState !== "stored"
            ? "storage_failed"
            : "saving_incomplete"
          : ["review", "ready", "approved"].includes(workflow.state)
            ? recoveryState === "unknown"
              ? "pending"
              : "ready"
            : "pending",
  };
}
