import { z } from "zod";

export const characterSheetVersion = 1;
export const characterSheetPromptVersion = "character-sheet-v1";
export const characterAssetTypes = {
  front: "character_front_reference", back: "character_back_reference",
  face: "character_face_reference", sheet: "character_sheet",
} as const;
export const characterViews = ["front", "back", "face"] as const;
export type CharacterView = typeof characterViews[number];
export const wardrobeSchema = z.strictObject({
  version: z.literal(1), style: z.string().max(100), top: z.string().max(800),
  bottom: z.string().max(800), footwear: z.string().max(800), accessories: z.string().max(800),
  colors: z.array(z.string().max(100)).max(8), notes: z.string().max(1000),
  creativeDirection: z.string().max(10_000), visualStyle: z.string().max(100),
  tone: z.string().max(100), ugcType: z.string().max(100),
});
export type Wardrobe = z.infer<typeof wardrobeSchema>;
export const characterProviderOperations = ["identity_create", "identity_status", "view_submit", "view_status", "output_download",
  "output_decode", "output_storage", "sheet_composition", "checkpoint_validation"] as const;
export type CharacterProviderOperation = typeof characterProviderOperations[number];
export const characterOutputReasons = [
  "CHARACTER_FRONT_OUTPUT_MISSING", "CHARACTER_BACK_OUTPUT_MISSING", "CHARACTER_FACE_OUTPUT_MISSING",
  "CHARACTER_OUTPUT_URL_INVALID", "CHARACTER_OUTPUT_HOST_REJECTED", "CHARACTER_OUTPUT_DOWNLOAD_FAILED",
  "CHARACTER_OUTPUT_MIME_INVALID", "CHARACTER_OUTPUT_EMPTY", "CHARACTER_OUTPUT_TOO_LARGE",
  "CHARACTER_OUTPUT_DECODE_FAILED", "CHARACTER_OUTPUT_DIMENSIONS_INVALID", "CHARACTER_OUTPUT_ANIMATED",
  "CHARACTER_OUTPUT_STORAGE_FAILED", "CHARACTER_OUTPUT_INTEGRITY_FAILED", "CHARACTER_SHEET_COMPOSITION_FAILED",
  "CHARACTER_PROVIDER_SCHEMA_INVALID", "CHARACTER_PROVIDER_RESPONSE_ID_MISMATCH", "CHARACTER_OUTPUT_STATUS_REGRESSED",
  "CHARACTER_OUTPUT_CHECKPOINT_INVALID", "CHARACTER_UNEXPECTED_OUTPUT_FAILURE",
  "CHARACTER_OUTPUT_URL_EXPIRED", "CHARACTER_PROVIDER_STATUS_NOT_FOUND",
] as const;
export type CharacterOutputReason = typeof characterOutputReasons[number];
const outputHostSchema = z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/);
export const characterOutputMetadataSchema = z.strictObject({
  httpStatus: z.number().int().min(100).max(599).optional(),
  providerRequestId: z.uuid().optional(),
  fields: z.array(z.enum(["id", "request_id", "status", "images", "output", "outputs", "result", "results", "data", "url", "image_url",
    "error", "status_url", "cancel_url", "expires_at", "expires_after"])).max(16),
  otherFieldCount: z.number().int().min(0).max(10_000),
  imagesArray: z.boolean(), imageCount: z.number().int().min(0).max(1000).nullable(),
  outputsArray: z.boolean(), outputCount: z.number().int().min(0).max(1000).nullable(),
  imageUrlPresent: z.boolean(), outputHost: outputHostSchema.optional(),
  providerStatus: z.enum(["not_ready", "queued", "in_progress", "completed", "failed", "nsfw", "canceled"]).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export type CharacterOutputMetadata = z.infer<typeof characterOutputMetadataSchema>;
export const characterMediaMetadataSchema = z.strictObject({
  httpStatus: z.number().int().min(100).max(599).nullable(),
  contentType: z.string().max(80).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/).nullable(),
  sizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  decode: z.enum(["not_attempted", "succeeded", "failed"]),
});
export type CharacterMediaMetadata = z.infer<typeof characterMediaMetadataSchema>;
export const characterDiagnosticSchema = z.strictObject({
  operation: z.enum(characterProviderOperations), httpStatus: z.number().int().min(100).max(599).nullable(),
  category: z.enum(["invalid_credentials", "access_denied", "model_unavailable", "account_restricted", "balance_restricted",
    "input_image_unavailable", "rate_limited", "provider_unavailable", "request_rejected", "transport_error", "invalid_response", "invalid_media"]),
  providerCode: z.enum(["INVALID_CREDENTIALS", "INSUFFICIENT_BALANCE", "ACCOUNT_RESTRICTED", "VERIFICATION_REQUIRED",
    "MODEL_UNAVAILABLE", "MODEL_NOT_FOUND", "INPUT_IMAGE_UNREACHABLE", "IMAGE_DOWNLOAD_FAILED",
    "ACCOUNT_QUEUE_FULL", "ADMISSION_CONTROL_UNAVAILABLE"]).optional(),
  providerRequestId: z.uuid().optional(), correlationId: z.uuid().optional(),
  reason: z.enum(characterOutputReasons).optional(), view: z.enum(["front", "back", "face", "sheet"]).optional(),
  outputHost: outputHostSchema.optional(), responseMetadata: characterOutputMetadataSchema.optional(),
  media: characterMediaMetadataSchema.optional(),
});
export type CharacterDiagnostic = z.infer<typeof characterDiagnosticSchema>;
export const operationSchema = z.strictObject({
  key: z.uuid(), state: z.enum(["intent", "accepted", "rejected", "completed", "failed"]),
  providerId: z.uuid().optional(), statusUrl: z.url().max(1000).optional(),
  startedAt: z.iso.datetime(), nextPollAt: z.iso.datetime().optional(), polls: z.number().int().min(0).max(500),
  elapsedMs: z.number().int().nonnegative().optional(),
  diagnostic: characterDiagnosticSchema.optional(),
  submissionMetadata: characterOutputMetadataSchema.optional(),
  outputMetadata: characterOutputMetadataSchema.optional(), media: characterMediaMetadataSchema.optional(),
});
export type CharacterOperation = z.infer<typeof operationSchema>;
export const characterAssetSchema = z.strictObject({
  id: z.uuid(), type: z.enum(Object.values(characterAssetTypes)), storageKey: z.string().max(512),
  etag: z.string().min(1).max(512), sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), mimeType: z.literal("image/png"),
});
export type CharacterAsset = z.infer<typeof characterAssetSchema>;
export const characterSheetDocumentSchema = z.strictObject({
  schemaVersion: z.literal(characterSheetVersion), promptVersion: z.literal(characterSheetPromptVersion),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/), analysisId: z.uuid(), analysisVersion: z.literal(1),
  wardrobe: wardrobeSchema, seed: z.number().int().min(1).max(1_000_000),
  operations: z.partialRecord(z.enum(["identity", ...characterViews]), operationSchema),
  assets: z.partialRecord(z.enum(["front", "back", "face", "sheet"]), characterAssetSchema),
  provenance: z.strictObject({
    identity: z.literal("source-image-via-soul-id-v2"),
    observations: z.literal("saved-analysis-supports-original-image"),
    generated: z.literal("wardrobe-and-unseen-body-rear-footwear-details-are-generated-continuity"),
    layout: z.literal("gray-three-column-contain-v1"),
  }),
});
export type CharacterSheetDocument = z.infer<typeof characterSheetDocumentSchema>;
export type CharacterSheetRow = {
  id: string; owner_user_id: string; project_id: string; job_id: string;
  source_asset_id: string; character_name: string; asset_type: "character_sheet";
  sheet_version: number; provider: "higgsfield"; provider_model: string;
  status: "preparing" | "completed"; document: unknown;
  created_at: string; updated_at: string;
};
