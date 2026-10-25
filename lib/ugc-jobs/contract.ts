import { productFailureCodes } from "@/lib/product-sheet/contract";
import type { ReferenceReviewSnapshot } from "@/lib/reference-review/contract";

// Shared UGC progress/state vocabulary. SQL migrations mirror this graph.
export const ugcJobStatuses = ["queued", "running", "awaiting_confirmation", "completed", "failed", "cancelled"] as const;
export type UgcJobStatus = (typeof ugcJobStatuses)[number];
export const ugcJobStages = [
  "queued", "validate_inputs", "analyze_references", "character_reference",
  "product_reference", "location_reference", "build_storyboard", "build_generation_package", "cost_review",
  "awaiting_confirmation", "video_generation", "finalizing", "complete", "failed", "cancelled",
] as const;
export type UgcJobStage = (typeof ugcJobStages)[number];
export const ugcNextStage: Partial<Record<UgcJobStage, UgcJobStage>> = {
  queued: "validate_inputs",
  validate_inputs: "analyze_references",
  analyze_references: "character_reference",
  character_reference: "product_reference",
  product_reference: "location_reference",
  location_reference: "build_storyboard",
  build_storyboard: "build_generation_package",
  build_generation_package: "cost_review",
  cost_review: "awaiting_confirmation",
  awaiting_confirmation: "video_generation",
  video_generation: "finalizing",
  finalizing: "complete",
};
export const ugcStageMessages: Record<UgcJobStage, string> = {
  queued: "Waiting for the local worker.",
  validate_inputs: "Preparing inputs.",
  analyze_references: "Analyzing references.",
  character_reference: "Preparing character.",
  product_reference: "Preparing product.",
  location_reference: "Location generation has not started yet.",
  build_storyboard: "Building storyboard.",
  build_generation_package: "Preparing generation.",
  cost_review: "Preparing generation cost review.",
  awaiting_confirmation: "Waiting for generation cost confirmation.",
  video_generation: "Generating video.",
  finalizing: "Finalizing video.",
  complete: "Complete.",
  failed: "This job stopped safely.",
  cancelled: "This job was cancelled.",
};
export const ugcJobErrorCodes = [
  "STAGE_NOT_IMPLEMENTED", "WORKER_INTERRUPTED", "WORKER_ERROR", "LEASE_EXPIRED",
  "ATTEMPTS_EXHAUSTED", "PROJECT_UNAVAILABLE", "RECONCILIATION_REQUIRED",
  "INPUT_VALIDATION_FAILED",
  "REFERENCE_CONFIG_INVALID", "REFERENCE_ASSET_UNAVAILABLE", "REFERENCE_IMAGE_UNSUPPORTED",
  "REFERENCE_AUTH_FAILED", "REFERENCE_RATE_LIMITED", "REFERENCE_TIMEOUT",
  "REFERENCE_PROVIDER_FAILED", "REFERENCE_OUTPUT_INVALID", "REFERENCE_REFUSED",
  "CHARACTER_CONFIG_INVALID", "CHARACTER_AUTH_FAILED", "CHARACTER_RATE_LIMITED",
  "CHARACTER_PROVIDER_FAILED", "CHARACTER_TIMEOUT", "CHARACTER_OUTPUT_INVALID",
  "CHARACTER_STORAGE_FAILED", "CHARACTER_COMPOSITION_FAILED",
  ...productFailureCodes,
] as const;
export type UgcJobErrorCode = (typeof ugcJobErrorCodes)[number];
export const ugcAutomaticRetryStages: readonly UgcJobStage[] = ["validate_inputs"];
export const ugcLeaseSeconds = 90;
export const ugcHeartbeatMilliseconds = 20_000;
export const ugcPollMilliseconds = 5_000;

export function isUgcTransitionAllowed(from: { status: UgcJobStatus; stage: UgcJobStage }, to: { status: UgcJobStatus; stage: UgcJobStage }) {
  if (from.status === "completed" || from.status === "failed" || from.status === "cancelled") return false;
  if (to.status === "cancelled") return to.stage === "cancelled";
  if (to.status === "failed") return to.stage === "failed";
  if (ugcNextStage[from.stage] !== to.stage) return false;
  if (from.status === "queued") return to.status === "running" && to.stage === "validate_inputs";
  if (from.status === "awaiting_confirmation") return to.status === "running" && to.stage === "video_generation";
  if (from.status !== "running") return false;
  return to.status === (to.stage === "awaiting_confirmation" ? "awaiting_confirmation" : to.stage === "complete" ? "completed" : "running");
}

// Internal trusted-server shape. Never send the full row to a browser.
export type UgcJobRow = {
  id: string; owner_user_id: string; project_id: string; idempotency_key: string;
  status: UgcJobStatus; stage: UgcJobStage; resume_stage: UgcJobStage;
  attempt_count: number; max_attempts: number; retry_eligible: boolean; next_retry_at: string | null;
  worker_id: string | null; claim_token: string | null; claimed_at: string | null;
  lease_expires_at: string | null; heartbeat_at: string | null; cancellation_requested_at: string | null;
  error_code: UgcJobErrorCode | null; safe_error_message: string | null;
  provider: string | null; provider_job_id: string | null;
  pause_reason: "REFERENCE_ANALYSIS_NOT_IMPLEMENTED" | "CHARACTER_REFERENCE_NOT_IMPLEMENTED" | "PRODUCT_REFERENCE_NOT_IMPLEMENTED" | "LOCATION_REFERENCE_NOT_IMPLEMENTED" | null;
  product_attempt_count?: number;
  validation_completed_at: string | null;
  analysis_version: number | null; analysis_model: string | null;
  input_snapshot: Record<string, unknown>; metadata: Record<string, unknown>;
  created_at: string; updated_at: string; started_at: string | null;
  completed_at: string | null; failed_at: string | null; cancelled_at: string | null;
  // Absent before manual 044; null on historical jobs whose active time is unknown.
  processing_elapsed_ms?: number | null; processing_updated_at?: string | null;
};
export type UgcJobEventRow = {
  id: number; job_id: string; status: UgcJobStatus; stage: UgcJobStage;
  event_type: string; safe_message: string; metadata: { attempt?: number; resumeStage?: UgcJobStage; view?: "front" | "back" | "face" | "primary" | "angle" | "detail"; version?: number | string };
  created_at: string;
};
export type UgcJobProgress = {
  id: string; status: UgcJobStatus; stage: UgcJobStage; message: string;
  createdAt: string; updatedAt: string; startedAt: string | null; completedAt: string | null;
  failedAt: string | null; cancelledAt: string | null; cancellationRequested: boolean;
  paused: boolean;
  failure: { code: UgcJobErrorCode; message: string } | null;
  currentStage: UgcJobStage; stageLabel: string;
  steps: UgcProgressStep[]; characterSteps: UgcProgressStep[]; productSteps: UgcProgressStep[];
  events: UgcProgressEvent[];
  worker: { heartbeatAt: string | null; leaseExpiresAt: string | null; state: "healthy" | "stalled" | "inactive" };
  serverNow: string;
  timing: { elapsedMs: number | null; runningSince: string | null; pausedAt: string | null; scope?: "workflow" | "regeneration" };
  referenceReview?: ReferenceReviewSnapshot;
};
export type UgcProgressStep = { id: string; label: string; state: "waiting" | "active" | "completed" | "failed" | "paused" };
export type UgcProgressEvent = {
  id: number; jobId: string; stage: UgcJobStage; type: string; message: string; at: string;
  view?: "front" | "back" | "face" | "primary" | "angle" | "detail";
  referenceVersion?: number;
};
export const ugcProgressPollMilliseconds = 2_500;
export const ugcWorkerStaleMilliseconds = 90_000;
export function isUgcJobActive(status: UgcJobStatus) {
  return status === "queued" || status === "running" || status === "awaiting_confirmation";
}
// A paused job still occupies its request; it must not enable another enqueue.
// Polling is a separate decision from that non-terminal admission guard.
export function shouldPollUgcProgress(job: Pick<UgcJobProgress, "status" | "paused" | "referenceReview">) {
  if (job.status === "cancelled" || job.status === "completed") return false;
  if (job.referenceReview?.regenerating) return true;
  return (job.status === "queued" || job.status === "running") && !job.paused;
}
