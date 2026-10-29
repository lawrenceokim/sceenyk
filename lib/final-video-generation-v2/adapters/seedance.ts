import "server-only";
import type { SegmentCapabilities, SegmentCostEstimate, SegmentCostInput, SegmentPlanningIssue,
  SegmentAdapterRequirements, VideoGenerationPlanningProvider } from "../capabilities";

// Public documentation only, reviewed 2026-10-29. No provider client, env access,
// request translation/submission, account lookup or registration in V1's registry.
export const seedanceV2Evidence = {
  modelId: "bytedance/seedance-2.5/reference-to-video",
  schemaUrl: "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.5/reference-to-video",
  apiUrl: "https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api",
  pricingUrl: "https://fal.ai/models/bytedance/seedance-2.5/reference-to-video",
  guideUrl: "https://fal.ai/learn/devs/how-to-use-seedance-2-5",
  verifiedOn: "2026-10-29",
} as const;

// Actual output dimensions published in the model's pricing documentation.
// 1080p is an API enum but its dimensions are not published here: never infer them.
const dimensions: Record<string, Record<string, readonly [number, number]>> = {
  "480p": { "21:9": [992, 432], "16:9": [864, 496], "4:3": [752, 560], "1:1": [640, 640], "3:4": [560, 752], "9:16": [496, 864] },
  "720p": { "21:9": [1470, 630], "16:9": [1280, 720], "4:3": [1112, 834], "1:1": [960, 960], "3:4": [834, 1112], "9:16": [720, 1280] },
};

export class SeedanceSegmentPlanningProvider implements VideoGenerationPlanningProvider {
  readonly version = "ugc-final-v2-foundation" as const;
  getCapabilities(): SegmentCapabilities {
    return { version: "video-segment-capabilities-v2", providerId: "seedance-reference", adapterVersion: "seedance-segments-foundation-v1",
      contractVersion: `${seedanceV2Evidence.modelId}@${seedanceV2Evidence.verifiedOn}`, verifiedOn: seedanceV2Evidence.verifiedOn,
      sources: [seedanceV2Evidence.schemaUrl, seedanceV2Evidence.apiUrl],
      maxContinuousDurationMs: 30_000, supportedDurationsMs: Array.from({ length: 27 }, (_, index) => (index + 4) * 1000),
      supportsAudioReference: "supported", supportsMultipleImageReferences: "supported", supportsMultiShotPrompting: "supported",
      // generate_audio promises native lip-synced speech. The API does NOT
      // explicitly promise that it follows an exact supplied speech master.
      supportsNativeLipSynchronization: "supported", supportsSpeechAudioDrivenLipSynchronization: "unverified",
      supportsExactShotTiming: "unverified", supportsExactAudioPreservation: "unverified",
      supportedAspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], supportedResolutions: ["480p", "720p", "1080p"],
      // The schema prompt example explicitly includes a scene cut. Other
      // structured transition types have not been confirmed by this contract.
      supportedTransitions: ["none", "cut"],
      referenceLimits: { maxTotalFiles: 50, images: { maxCount: 30, maxBytesPerFile: 30_000_000,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/gif", "image/heic", "image/heif"] },
        audio: { maxCount: 10, maxBytesPerFile: 15_000_000, mimeTypes: ["audio/mpeg", "audio/wav"],
          minDurationMs: 1800, maxDurationMs: 30_200, maxCombinedDurationMs: 30_200 } }, maxPromptCharacters: null };
  }
  validateRequirements(input: SegmentAdapterRequirements): SegmentPlanningIssue[] {
    const cap = this.getCapabilities(), issues: SegmentPlanningIssue[] = [];
    const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
    if (!cap.supportedDurationsMs.includes(input.durationMs)) add("ADAPTER_DURATION_UNSUPPORTED", "durationMs", "Reference workflow requires an explicit whole-second duration from 4 through 30; auto is not exact");
    if (!cap.supportedAspectRatios.includes(input.aspectRatio)) add("ADAPTER_RATIO_UNSUPPORTED", "aspectRatio", "Explicit API-supported aspect ratio required");
    if (!cap.supportedResolutions.includes(input.resolution)) add("ADAPTER_RESOLUTION_UNSUPPORTED", "resolution", "Resolution is outside the current API enum");
    if (!Number.isSafeInteger(input.imageCount) || input.imageCount < 0 || input.imageCount > 30) add("ADAPTER_IMAGE_LIMIT", "imageCount", "At most 30 image references");
    if (!Number.isSafeInteger(input.audioCount) || input.audioCount < 0 || input.audioCount > 10) add("ADAPTER_AUDIO_LIMIT", "audioCount", "At most 10 audio references");
    if (input.imageCount + input.audioCount > 50) add("ADAPTER_TOTAL_REFERENCE_LIMIT", "references", "At most 50 total multimodal files");
    return issues;
  }
  estimateCost(input: SegmentCostInput): SegmentCostEstimate {
    const base = { currency: "USD" as const, pricingVersion: "seedance-token-pricing-2026-10-29", sourceUrl: seedanceV2Evidence.pricingUrl };
    const unavailable = (reason: string): SegmentCostEstimate => ({ ...base, status: "unavailable", estimatedCostMicrousd: null,
      reason, billableTokenNumerator: null, billableTokenDenominator: null });
    if (!this.getCapabilities().supportedDurationsMs.includes(input.durationMs)) return unavailable("DURATION_UNSUPPORTED");
    const size = dimensions[input.resolution]?.[input.aspectRatio];
    if (!size) return unavailable("OUTPUT_DIMENSIONS_UNCONFIRMED");
    const videos = input.referenceVideoDurationsMs ?? [];
    if (videos.length > 10 || videos.some(ms => !Number.isSafeInteger(ms) || ms < 1800 || ms > 30_200) ||
      videos.reduce((sum, ms) => sum + ms, 0) > 30_200) return unavailable("REFERENCE_VIDEO_DURATION_UNSUPPORTED");
    const inputMs = videos.reduce((sum, ms) => sum + ms, 0);
    const tokenNumerator = BigInt(size[0]) * BigInt(size[1]) * BigInt(input.durationMs + inputMs) * BigInt(24);
    const tokenDenominator = 1_024_000;
    // $0.0214 / 1000 tokens at 480p/720p. Video references add their seconds,
    // then apply x0.6. Images/audio and generate_audio do not change this rate.
    const numerator = tokenNumerator * BigInt(21_400) * BigInt(videos.length ? 3 : 1);
    const denominator = BigInt(tokenDenominator) * BigInt(1000) * BigInt(videos.length ? 5 : 1);
    const micro = Number((numerator + denominator - BigInt(1)) / denominator);
    if (!Number.isSafeInteger(micro) || micro < 0) return unavailable("COST_OVERFLOW");
    return { ...base, status: "estimated", estimatedCostMicrousd: micro, reason: null,
      billableTokenNumerator: tokenNumerator.toString(), billableTokenDenominator: tokenDenominator };
  }
}
