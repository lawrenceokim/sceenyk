import type { VideoGenerationPackage, VideoGenerationRequirements } from "./contract";
import type { VideoGenerationPlanningProvider } from "@/lib/final-video-generation-v2/capabilities";

export type CapabilitySupport = "supported" | "unsupported" | "unverified";
export type VideoGenerationCapabilities = {
  configurationVersion: string; referenceImages: CapabilitySupport; maxReferenceImages: number | null;
  characterReference: CapabilitySupport; productReference: CapabilitySupport; locationReference: CapabilitySupport;
  audio: CapabilitySupport; dialogue: CapabilitySupport; narration: CapabilitySupport; consistentVoice: CapabilitySupport;
  duration: { minMs: number; maxMs: number; incrementsMs: number | null } | null;
  aspectRatios: string[] | null; resolutions: string[] | null; formats: string[] | null;
  sceneGeneration: CapabilitySupport; seed: CapabilitySupport; asynchronousJobs: CapabilitySupport;
};
export type VideoGenerationCompatibility = { support: CapabilitySupport; issues: { requirement: keyof VideoGenerationRequirements | "recovery" | "seed"; scene?: number; code: string }[] };
export type VideoExecutionContext = { operationId: string; idempotencyKey: string; packageHash: string; signal: AbortSignal };
// Contract only. No adapter, registry, provider selection, SDK or matching is
// implemented in M9. M10 owns all capability validation and network execution.
export interface VideoGenerationProvider<Payload, Result> {
  // Optional, separate V2 profile. Existing V1 adapters/executions do not opt in.
  readonly segmentPlanning?: VideoGenerationPlanningProvider;
  readonly id: string;
  readonly adapterVersion: string;
  getCapabilities(): VideoGenerationCapabilities;
  validatePackage(requirements: VideoGenerationRequirements): VideoGenerationCompatibility;
  translatePackage(packageData: VideoGenerationPackage, media: ReadonlyMap<string, string>): Payload;
  submit(payload: Payload, context: VideoExecutionContext): Promise<{ jobId: string }>;
  getStatus(jobId: string, context: VideoExecutionContext): Promise<{ status: "pending" | "processing" | "completed" | "failed"; result?: Result }>;
}
