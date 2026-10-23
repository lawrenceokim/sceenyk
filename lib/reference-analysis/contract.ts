import { z } from "zod";

export const referenceAnalysisVersion = 1;
export const referencePromptVersion = "reference-analysis-v1";
export const referenceRoles = ["character", "product"] as const;
export type ReferenceRole = (typeof referenceRoles)[number];

// All properties are required for strict Responses output. Unknown is explicit,
// never a model-invented hidden view or personal-attribute slot.
const observation = z.strictObject({
  description: z.string().min(1).max(800).nullable(),
  certainty: z.enum(["observed", "uncertain", "unknown"]),
});
const common = {
  schemaVersion: z.literal(referenceAnalysisVersion),
  subjectVisible: z.boolean(),
  imageQuality: observation,
  occlusions: observation,
  limitations: observation,
};
export const characterReferenceAnalysisSchema = z.strictObject({
  ...common, analysisType: z.literal("character"),
  visibleAppearance: observation,
  visualPresentation: observation,
  hair: observation,
  facialFeatures: observation,
  skinAppearance: observation,
  clothing: observation,
  accessories: observation,
  colors: observation,
  distinguishingVisualTraits: observation,
  framingAndPose: observation,
});
export const productReferenceAnalysisSchema = z.strictObject({
  ...common, analysisType: z.literal("product"),
  category: observation,
  shape: observation,
  colors: observation,
  materialAndFinish: observation,
  proportions: observation,
  designFeatures: observation,
  visibleTextAndLogos: observation,
  orientationAndView: observation,
  visibleParts: observation,
  consistencyDetails: observation,
  unseenGeometry: observation,
});
export const combinedReferenceAnalysisSchema = z.strictObject({
  schemaVersion: z.literal(referenceAnalysisVersion),
  character: characterReferenceAnalysisSchema,
  product: productReferenceAnalysisSchema,
});
export type CharacterReferenceAnalysis = z.infer<typeof characterReferenceAnalysisSchema>;
export type ProductReferenceAnalysis = z.infer<typeof productReferenceAnalysisSchema>;
export type CombinedReferenceAnalysis = z.infer<typeof combinedReferenceAnalysisSchema>;
export type ReferenceAnalysis = CharacterReferenceAnalysis | ProductReferenceAnalysis;

export function parseReferenceAnalysis(role: ReferenceRole, value: unknown): ReferenceAnalysis {
  const parsed = (role === "character" ? characterReferenceAnalysisSchema : productReferenceAnalysisSchema).parse(value);
  if (!parsed.subjectVisible) throw new Error("REFERENCE_SUBJECT_NOT_VISIBLE");
  for (const field of Object.values(parsed)) {
    if (typeof field === "object" && field && "certainty" in field &&
      ((field.certainty === "unknown") !== (field.description === null))) throw new Error("REFERENCE_UNCERTAINTY_INVALID");
  }
  if (parsed.analysisType === "product" && parsed.unseenGeometry.certainty !== "unknown") throw new Error("REFERENCE_UNSEEN_GEOMETRY");
  return parsed;
}

export const referenceFailureCodes = [
  "REFERENCE_CONFIG_INVALID", "REFERENCE_ASSET_UNAVAILABLE", "REFERENCE_IMAGE_UNSUPPORTED",
  "REFERENCE_AUTH_FAILED", "REFERENCE_RATE_LIMITED", "REFERENCE_TIMEOUT",
  "REFERENCE_PROVIDER_FAILED", "REFERENCE_OUTPUT_INVALID", "REFERENCE_REFUSED",
  "RECONCILIATION_REQUIRED",
] as const;
export type ReferenceFailureCode = (typeof referenceFailureCodes)[number];
export const referenceUsageSchema = z.strictObject({
  responseId: z.string().max(200).nullable(),
  model: z.string().min(1).max(200),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative(),
});
export type ReferenceUsage = z.infer<typeof referenceUsageSchema>;
export type ReferenceAnalysisRow = {
  id: string; owner_user_id: string; project_id: string; job_id: string;
  source_asset_id: string; analysis_type: ReferenceRole; analysis_version: number;
  prompt_version: string; provider: "openai"; requested_model: string;
  state: "submitted" | "completed" | "rejected" | "uncertain";
  submission_claim_token: string; submission_attempt: number;
  analysis: ReferenceAnalysis | null; usage: ReferenceUsage | null;
  error_code: ReferenceFailureCode | null; created_at: string; updated_at: string;
};
