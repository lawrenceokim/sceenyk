import type { ProductionPlan, PlanMedia } from "./plan";
import type { GenerationSnapshot } from "@/lib/generation/types";

export type AnalysisFailure = "TIMEOUT" | "RATE_LIMIT" | "PROVIDER_UNAVAILABLE" | "INVALID_OUTPUT" | "UNSUPPORTED_MEDIA" | "MEDIA_UNAVAILABLE" | "PROVIDER_REJECTED" | "UNCERTAIN_ATTEMPT" | "CONFIGURATION_MISSING";
export class AnalysisError extends Error {
  constructor(public readonly code: AnalysisFailure, public readonly operation?: "upload" | "generate" | "file_processing" | "media_read") { super(code); this.name = "AnalysisError"; }
}
export type ProviderUsage = {
  inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  thinkingTokens: number | null; cachedTokens: number | null;
  inputDetails: { modality: string; tokenCount: number }[];
  outputDetails: { modality: string; tokenCount: number }[];
  media: { assetId: string; sizeBytes: number; mimeType: string; durationSeconds: number | null }[];
  estimatedCost: null;
};
export type AnalysisMedia = PlanMedia & { read: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>> };
export type AnalysisRequest = { input: GenerationSnapshot; media: AnalysisMedia[]; retry: boolean; model: string; onMediaReady?: () => Promise<void> };
export type AnalysisResponse = {
  plan: ProductionPlan | null; usage: ProviderUsage; model: string;
  responseId: string | null; failure: AnalysisFailure | null;
};
