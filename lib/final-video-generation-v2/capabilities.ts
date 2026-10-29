import { z } from "zod";

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const support = z.enum(["supported", "unsupported", "unverified"]);
export const capabilityNames = ["supportsAudioReference", "supportsMultipleImageReferences", "supportsMultiShotPrompting",
  "supportsNativeLipSynchronization", "supportsSpeechAudioDrivenLipSynchronization", "supportsExactShotTiming",
  "supportsExactAudioPreservation"] as const;
export type SegmentCapabilityName = typeof capabilityNames[number];
const fileLimits = z.strictObject({ maxCount: z.number().int().nonnegative(), maxBytesPerFile: positive, mimeTypes: z.array(z.string().min(1)) });
export const segmentCapabilitiesSchema = z.strictObject({
  version: z.literal("video-segment-capabilities-v2"), providerId: z.string().min(1), adapterVersion: z.string().min(1),
  contractVersion: z.string().min(1), verifiedOn: z.iso.date(), sources: z.array(z.url()).min(1),
  maxContinuousDurationMs: positive, supportedDurationsMs: z.array(positive).min(1).max(1000),
  supportsAudioReference: support, supportsMultipleImageReferences: support, supportsMultiShotPrompting: support,
  supportsNativeLipSynchronization: support, supportsSpeechAudioDrivenLipSynchronization: support,
  supportsExactShotTiming: support, supportsExactAudioPreservation: support,
  supportedAspectRatios: z.array(z.string().min(1)).min(1), supportedResolutions: z.array(z.string().min(1)).min(1),
  supportedTransitions: z.array(z.string().min(1)).min(1),
  referenceLimits: z.strictObject({ maxTotalFiles: positive, images: fileLimits,
    audio: fileLimits.extend({ minDurationMs: positive, maxDurationMs: positive, maxCombinedDurationMs: positive }) }),
  // null means the public contract does not specify a bound, not unlimited.
  maxPromptCharacters: positive.nullable(),
});
export type SegmentCapabilities = z.infer<typeof segmentCapabilitiesSchema>;
export type SegmentPlanningIssue = { code: string; path: string; message: string; sceneNumber?: number };
export type SegmentCostInput = { durationMs: number; aspectRatio: string; resolution: string; referenceVideoDurationsMs?: readonly number[] };
export type SegmentCostEstimate = {
  status: "estimated" | "unavailable"; currency: "USD"; estimatedCostMicrousd: number | null;
  pricingVersion: string; sourceUrl: string; reason: string | null;
  // Rational units keep cost receipts compatible with the integer-only canonical hash recipe.
  billableTokenNumerator: string | null; billableTokenDenominator: number | null;
};
export type SegmentAdapterRequirements = SegmentCostInput & { imageCount: number; audioCount: number; promptCharacters: number };

// Planning only: no credentials, network methods, paid authority or execution handle.
export interface VideoGenerationPlanningProvider {
  readonly version: "ugc-final-v2-foundation";
  getCapabilities(): SegmentCapabilities;
  validateRequirements(input: SegmentAdapterRequirements): SegmentPlanningIssue[];
  estimateCost(input: SegmentCostInput): SegmentCostEstimate;
}
