import { z } from "zod";

export const productSheetVersion = 1;
export const productSheetPromptVersion = "product-sheet-v1";
export const productViews = ["primary", "angle", "detail"] as const;
export type ProductView = typeof productViews[number];
export const productAssetTypes = {
  primary: "product_primary_reference", angle: "product_angle_reference",
  detail: "product_detail_reference", sheet: "product_sheet",
} as const;
export const productFailureCodes = [
  "PRODUCT_CONFIG_INVALID", "PRODUCT_SOURCE_UNAVAILABLE", "PRODUCT_ANALYSIS_INVALID", "PRODUCT_CHARACTER_NOT_READY",
  "PRODUCT_PRIMARY_GENERATION_FAILED", "PRODUCT_ANGLE_GENERATION_FAILED", "PRODUCT_DETAIL_GENERATION_FAILED",
  "PRODUCT_PRIMARY_OUTPUT_MISSING", "PRODUCT_ANGLE_OUTPUT_MISSING", "PRODUCT_DETAIL_OUTPUT_MISSING",
  "PRODUCT_OUTPUT_EMPTY", "PRODUCT_OUTPUT_TOO_LARGE", "PRODUCT_OUTPUT_FORMAT_UNSUPPORTED",
  "PRODUCT_OUTPUT_DECODE_FAILED", "PRODUCT_OUTPUT_DIMENSIONS_INVALID", "PRODUCT_OUTPUT_STORAGE_FAILED",
  "PRODUCT_OUTPUT_INTEGRITY_FAILED", "PRODUCT_CHECKPOINT_INVALID", "PRODUCT_SHEET_COMPOSITION_FAILED",
] as const;
export type ProductFailureCode = typeof productFailureCodes[number];
export const productUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(), latencyMs: z.number().int().nonnegative(),
});
export const productDiagnosticSchema = z.strictObject({
  code: z.enum([...productFailureCodes, "RECONCILIATION_REQUIRED"]),
  httpStatus: z.number().int().min(100).max(599).optional(),
  requestId: z.string().max(200).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  decode: z.enum(["not_attempted", "succeeded", "failed"]).optional(),
});
export type ProductDiagnostic = z.infer<typeof productDiagnosticSchema>;
export const productOperationSchema = z.strictObject({
  key: z.uuid(), state: z.enum(["intent", "rejected", "received", "completed"]),
  startedAt: z.iso.datetime(), receivedAt: z.iso.datetime().optional(),
  requestId: z.string().max(200).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  usage: productUsageSchema.optional(), diagnostic: productDiagnosticSchema.optional(),
  output: z.strictObject({ sizeBytes: z.number().int().nonnegative(), decode: z.enum(["not_attempted", "succeeded"]) }).optional(),
});
export const productAssetSchema = z.strictObject({
  id: z.uuid(), type: z.enum(Object.values(productAssetTypes)), storageKey: z.string().max(512),
  etag: z.string().min(1).max(512), sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  width: z.number().int().min(256).max(4096), height: z.number().int().min(256).max(4096),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), mimeType: z.literal("image/png"),
});
export type ProductAsset = z.infer<typeof productAssetSchema>;
export const productSheetDocumentSchema = z.strictObject({
  schemaVersion: z.literal(productSheetVersion), promptVersion: z.literal(productSheetPromptVersion),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/), analysisId: z.uuid(), analysisVersion: z.literal(1),
  characterSheetId: z.uuid(),
  instructions: z.strictObject({ primary: z.string().min(1).max(32000), angle: z.string().min(1).max(32000), detail: z.string().min(1).max(32000) }),
  operations: z.partialRecord(z.enum(productViews), productOperationSchema),
  assets: z.partialRecord(z.enum([...productViews, "sheet"]), productAssetSchema),
  provenance: z.strictObject({
    factualSource: z.literal("original-private-product-image"),
    observations: z.literal("saved-analysis-observed-details-subordinate-to-source-image"),
    generated: z.literal("all-outputs-ai-generated-unseen-surfaces-are-inferred-continuity-never-observations"),
    views: z.strictObject({ primary: z.literal("source-conditioned-generated-view"),
      angle: z.literal("source-conditioned-generated-view-with-possible-inferred-geometry"),
      detail: z.literal("source-conditioned-generated-closeup-not-new-factual-evidence") }),
    layout: z.literal("gray-three-column-contain-v1"),
  }),
});
export type ProductSheetDocument = z.infer<typeof productSheetDocumentSchema>;
export type ProductSheetRow = {
  id: string; owner_user_id: string; project_id: string; job_id: string; source_asset_id: string;
  product_name: string; provider: "openai"; provider_model: string; sheet_version: number;
  status: "preparing" | "completed"; document: unknown; created_at: string; updated_at: string;
};
