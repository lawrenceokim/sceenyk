import { z } from "zod";
import { characterValidationSchema, characterInputHashesSchema } from "@/lib/character-sheet/validation-contract";
import { characterGenerationSchema, characterGenerationRevision, frontCropSchema, characterInputReferenceSchema } from "@/lib/character-sheet/generation-contract";

export const referenceTypes = ["character", "product"] as const;
export type ReferenceType = typeof referenceTypes[number];
export const referenceReplacementAssetSchema = z.strictObject({
  strategyRevision: z.literal(characterGenerationRevision).optional(), faceOrigin: z.enum(["original", "provider"]).optional(),
  id: z.uuid(), type: z.string().max(80), storageKey: z.string().max(512), etag: z.string().min(1).max(512),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024), width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096), sha256: z.string().regex(/^[a-f0-9]{64}$/), mimeType: z.literal("image/png"),
  characterValidation: characterValidationSchema.optional(), characterInputs: characterInputHashesSchema.optional(),
  frontSource: characterInputReferenceSchema.optional(), originalReference: characterInputReferenceSchema.optional(),
  generation: characterGenerationSchema.optional(), frontCrop: frontCropSchema.optional(), sourceValidation: characterValidationSchema.optional(),
});
export const referenceViews = {
  character: ["front", "back", "face"], product: ["primary", "angle", "detail"],
} as const;
export const referenceViewSchema = z.enum(["original", "front", "back", "face", "primary", "angle", "detail", "sheet"]);
export type ReferenceView = z.infer<typeof referenceViewSchema>;
export const referenceReviewStates = ["pending_generation", "ready_for_review", "approved", "regeneration_requested", "regenerating", "failed"] as const;
export type ReferenceReviewState = typeof referenceReviewStates[number];
export const reviewScopeSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid() });
export const reviewActionSchema = reviewScopeSchema.extend({ type: z.enum(referenceTypes), version: z.number().int().min(1).max(1_000_000) });
export const regenerationActionSchema = reviewActionSchema.extend({ view: referenceViewSchema, requestId: z.uuid() });
export const previewActionSchema = reviewActionSchema.extend({ view: referenceViewSchema });
export const referencePreviewRequestSchema = previewActionSchema.extend({ rejectedId: z.string().regex(/^[a-f0-9]{64}$/).optional(), frontSource: z.literal(true).optional() });
export type ReferenceReviewAsset = { view: ReferenceView; label: string; available: boolean; state: "ready" | "regeneration_requested" | "regenerating" | "failed"; stale: boolean; publishedVersion?: number; validationRequired?: boolean };
export type ReferenceReviewGroup = {
  type: ReferenceType; name: string; version: number; state: ReferenceReviewState; canApprove: boolean;
  approvedAt: string | null; approvedVersion: number | null; sheetInvalidated: boolean;
  assets: ReferenceReviewAsset[];
  execution?: { state: "waiting" | "running" | "stalled" | "failed" | "idle"; phase: string | null;
    heartbeatAt: string | null; leaseExpiresAt: string | null; elapsedMs: number; runningSince: string | null;
    error: "REGENERATION_FAILED" | "RECONCILIATION_REQUIRED" | "IDENTITY_UNAVAILABLE" | "ATTEMPTS_EXHAUSTED" |
      "CHARACTER_SHEET_RECOVERY_FAILED" | "CHARACTER_SHEET_COMPOSITION_FAILED" | null;
    canRetry: boolean };
  sheetVersion?: number;
  validationFailure?: { view: string; reasons: string[]; retried: boolean; previousPreserved: boolean };
  rejectedOutputs?: { id: string; view: ReferenceView; reasons: string[]; stage: "provider" | "reference" }[];
  providerDecisionRequired?: boolean;
  needsFreshRequestViews?: ReferenceView[];
  frontSourceAvailable?: boolean;
  characterV4?: boolean;
  faceReused?: boolean;
};
export type ReferenceReviewSnapshot = {
  characterV5?: import("@/lib/character-v5/contract").V5Review;
  historicalCharacter?: ReferenceReviewGroup;
  groups: ReferenceReviewGroup[]; available: boolean; actionsAvailable: boolean; locationEligible: boolean;
  blocked: boolean; regenerating: boolean;
};
export type ReferenceReviewRow = {
  id: string; owner_user_id: string; project_id: string; job_id: string; reference_type: ReferenceType;
  character_sheet_id: string | null; product_sheet_id: string | null; sheet_version: number;
  version: number; composed_version: number; approved_at: string | null; approved_by: string | null; approved_version: number | null;
  composed_asset: unknown | null;
  execution_state?: "idle" | "running" | "failed"; execution_attempts?: number; execution_token?: string | null;
  execution_worker_id?: string | null; heartbeat_at?: string | null; lease_expires_at?: string | null;
  processing_elapsed_ms?: number; processing_updated_at?: string | null; execution_phase?: string | null;
  execution_error?: NonNullable<ReferenceReviewGroup["execution"]>["error"]; composed_sheet_version?: number;
  execution_diagnostic?: unknown | null;
  character_validations?: Record<string, unknown>;
  created_at: string; updated_at: string;
};
export type ReferenceRegenerationRow = {
  id: string; review_id: string; view: string; requested_version: number; previous_asset_id: string;
  requested_by: string; state: "regeneration_requested" | "regenerating" | "completed" | "failed";
  replacement_asset: unknown | null;
  checkpoint?: unknown;
  created_at: string; updated_at: string;
};
export const referenceViewLabels: Record<ReferenceView, string> = {
  original: "Original", front: "Front", back: "Back", face: "Face", primary: "Primary", angle: "Angled", detail: "Detail", sheet: "Sheet",
};
