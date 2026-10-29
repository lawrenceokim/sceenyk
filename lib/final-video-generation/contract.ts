import { z } from "zod";
import type { VideoGenerationPackage } from "@/lib/video-generation-package/contract";
import type { CompositionCapabilities } from "./composition";
import type { FinalPricing } from "./adapters/pricing";
import type { ProviderFailure, StageFailure } from "./diagnostics";
import type { AuthorizationAmendment, EffectiveAuthorization, RetryReview } from "./retry";
import type { SpeechFitProof, SpeechFitFailure } from "@/lib/speech-timing/plan";

export const finalPhases = ["queued", "capability_check", "video_generating", "video_reconciling", "video_saving",
  "voice_preparing", "voice_generating", "voice_saving", "lip_syncing", "lip_sync_saving", "scene_ready",
  "combining", "finalizing", "review", "approved", "reconciliation_required", "scene_failed", "deleting", "deleted"] as const;
export type FinalPhase = typeof finalPhases[number];
export const phaseLabels: Record<FinalPhase, string> = {
  queued: "Preparing final video", capability_check: "Preparing final video", video_generating: "Generating scenes",
  video_reconciling: "Recovering scene result", video_saving: "Saving scenes", voice_preparing: "Adding voice",
  voice_generating: "Adding voice", voice_saving: "Saving voice", lip_syncing: "Synchronizing dialogue",
  lip_sync_saving: "Saving synchronized scene", scene_ready: "Generating scenes", combining: "Combining scenes",
  finalizing: "Finalizing video", review: "Final video ready", approved: "Complete", reconciliation_required: "Recovering final video",
  scene_failed: "Final video stopped safely", deleting: "Deleting final video", deleted: "Final video deleted",
};
export type StageKind = "video" | "design" | "binding" | "voice" | "lip_sync" | "composition";
export type CharacterVoiceProfile = {
  schemaVersion: 1; id: string; version: 1; characterBinding: string; characterVersion: number;
  description: string; language: string; accent: null; tone: string; pace: "slow" | "natural" | "energetic";
  energy: null; deliveryStyle: string[]; source: "designed"; packageHash: string;
};
export const assetSchema = z.strictObject({ key: z.string().min(1).max(1000), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  etag: z.string().min(1), sizeBytes: z.number().int().positive().max(256 * 1024 * 1024),
  mimeType: z.enum(["video/mp4", "audio/mpeg", "audio/wav"]), durationMs: z.number().int().positive().max(120_000),
  width: z.number().int().nonnegative(), height: z.number().int().nonnegative(), hasAudio: z.boolean(),
  sampleRate: z.number().int().nonnegative(), channels: z.number().int().nonnegative() });
export type FinalAsset = z.infer<typeof assetSchema>;
export type ResponseProof = { key: string; etag: string; sha256: string; sizeBytes: number };
export type ProviderReceipt = { requestId?: string; result?: unknown; usage?: Record<string, unknown>; recovery?: ResponseProof;
  speechFit?: SpeechFitProof;
  speechFitFailure?: SpeechFitFailure;
  failure?: ProviderFailure; request?: { method: string; endpoint: string; payloadSha256: string; payload: unknown } };
export type Operation = {
  id: string; execution_id: string; owner_user_id: string; project_id: string; fingerprint: string; kind: StageKind;
  scene_id: string | null; operation_key: string; input: Record<string, unknown>; provider: string; model: string; state: "intent" | "submitted" | "result" | "ready" | "failed";
  request_id: string | null; receipt: ProviderReceipt | null; output: FinalAsset | null;
  attempt: number; estimated_cost_microusd: number; error_code: string | null; created_at: string; updated_at: string;
  logical_key?: string | null; supersedes_operation_id?: string | null; amendment_id?: string | null;
};
export type FinalConfiguration = {
  version: "ugc-final-v1"; funding: "operator_funded"; authorizationId: string; language: string;
  maxRequests: number; maxEstimatedCostMicrousd: number; ceilings: Record<Exclude<StageKind, "composition">, number>;
  providers: Record<Exclude<StageKind, "composition">, { id: string; model: string; version: string }>;
  composition: CompositionCapabilities;
  pricing?: FinalPricing;
  output: { height: 720; fps: 25; format: "mp4"; toleranceMs: 50; audioSampleRate: 48000 };
};
export type FinalExecution = {
  id: string; owner_user_id: string; project_id: string; job_id: string; package_id: string; package_hash: string;
  package_version: number; version: number; revision: number; request_id: string; configuration: FinalConfiguration;
  configuration_hash: string; profile: CharacterVoiceProfile | null; profile_binding: Record<string, unknown> | null;
  state: "queued" | "running" | "review" | "approved" | "failed" | "reconciling" | "deleting" | "deleted";
  phase: FinalPhase; error_code: string | null; final_asset: FinalAsset | null; final_fingerprint: string | null;
  paid_requests: number; estimated_cost_microusd: number; approved_at: string | null;
  claim_token: string | null; worker_id: string | null; lease_expires_at: string | null; heartbeat_at: string | null;
  created_at: string; updated_at: string;
  dispatch_mode?: "initial" | "retry" | "recover" | "resume";
};
export type FinalScene = { execution_id: string; scene_id: string; scene_number: number; scene_hash: string;
  phase: FinalPhase; output: FinalAsset | null; manifest: Record<string, unknown> | null; updated_at: string };
export type FinalReview = {
  id: string; version: number; revision: number; state: FinalExecution["state"]; phase: FinalPhase; label: string;
  current: boolean; error: string | null; durationMs: number | null; width: number | null; height: number | null;
  aspectRatio: string; canApprove: boolean; canReject: boolean; canRecover: boolean; updatedAt: string;
  heartbeatAt: string | null; leaseExpiresAt: string | null;
  failure?: StageFailure; localError?: string; recoveryMaySubmitRequests?: boolean;
  retry?: RetryReview; effectiveAuthorization?: EffectiveAuthorization;
  amendments?: (Pick<AuthorizationAmendment, "id" | "stage" | "reason" | "additional_requests" | "created_at" | "reviewed_http_status"> & { replacesAttempt: number })[];
  attempts?: { stage: string; attempt: number; state: Operation["state"]; httpStatus: number | null; amendmentId: string | null }[];
  canResume?: boolean;
  speechRecovery?: { sceneNumber: number | null; windowMs: number; alignmentEndMs: number | null;
    savedResponse: boolean; maximumAccelerationPercent: number; requiresTtsReview: boolean; fittingFailure?: SpeechFitFailure };
};
export type FinalAvailability = { review?: FinalReview; enabled: boolean; eligible: boolean; available: boolean;
  authorization: { version: string; maxRequests: number; maxEstimatedCostMicrousd: number; language: string } | null };
export const finalActionSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid(),
  action: z.enum(["generate", "approve", "reject", "recover", "retry_stage", "resume"]), executionId: z.uuid().optional(),
  packageId: z.uuid().optional(), version: z.number().int().nonnegative(), requestId: z.uuid().optional(),
  authorizationVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(), acceptedCost: z.literal(true).optional(),
  amendmentId: z.uuid().optional(), operationId: z.uuid().optional(), quoteVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  configurationCorrected: z.literal(true).optional(), operatorApproved: z.literal(true).optional(), reviewedHttpStatus: z.union([z.literal(403), z.literal(400)]).optional(),
  reason: z.enum(["provider_permission_corrected", "provider_labels_corrected"]).optional(), additionalRequests: z.literal(1).optional(),
  additionalCostMicrousd: z.number().int().min(0).max(1_000_000_000).optional() });
export class FinalVideoError extends Error {
  constructor(readonly code: string, readonly status = 409, readonly providerFailure?: ProviderFailure) { super(code); }
}
export type Scene = VideoGenerationPackage["scenes"][number];
