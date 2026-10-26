import { z } from "zod";

export const locationPlanSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  environment: z.string().trim().min(1).max(2000),
  lighting: z.string().trim().min(1).max(600),
  visualStyle: z.string().trim().min(1).max(400),
  cameraFraming: z.string().trim().min(1).max(600),
  imagePrompt: z.string().trim().min(1).max(4000),
});
export type LocationPlan = z.infer<typeof locationPlanSchema>;
export const locationArtifactSchema = z.strictObject({
  id: z.uuid(), storageKey: z.string().min(1).max(512), etag: z.string().min(1).max(512),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  width: z.number().int().min(256).max(4096), height: z.number().int().min(256).max(4096),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), mimeType: z.literal("image/png"),
});
export type LocationArtifact = z.infer<typeof locationArtifactSchema>;
export type LocationState = "idle" | "queued_plan" | "running_plan" | "plan_review" | "queued_image" | "running_image" | "image_review" | "approved" | "rejecting" | "failed";
export type LocationRow = {
  id: string; job_id: string; owner_user_id: string; project_id: string; location_index: number;
  version: number; state: LocationState; phase: "preparing" | "generating" | "saving" | "recovering" | "review" | "approved" | "deleting" | "failed";
  dependencies: Record<string, unknown>; scene: Record<string, unknown>; plan: LocationPlan | null;
  plan_intent: Record<string, unknown> | null; plan_receipt: Record<string, unknown> | null;
  candidate_id: string | null; accepted_candidate_id: string | null; approved_at: string | null;
  error_code: string | null; worker_id: string | null; claim_token: string | null;
  heartbeat_at: string | null; lease_expires_at: string | null; created_at: string; updated_at: string;
  revision: number; requested_at: string | null; image_settings: Record<string, unknown> | null; next_location_id: string | null;
  diagnostic?: import("./errors").LocationDiagnostic | null;
  recovery_only?: boolean; explicit_generation_at?: string | null;
};
export type LocationCandidate = {
  id: string; location_id: string; state: "pending" | "submitted" | "review" | "accepted" | "rejecting" | "deleted";
  plan: LocationPlan; settings: Record<string, unknown>; intent: Record<string, unknown> | null;
  receipt: Record<string, unknown> | null; artifact: LocationArtifact | null;
  rejected_at: string | null; deleted_at: string | null; created_at: string;
  deletion_proof: Record<string, unknown> | null;
  output_proof?: LocationOutputProof | null;
};
export const locationOutputProofSchema = locationArtifactSchema.omit({ storageKey: true, etag: true });
export type LocationOutputProof = z.infer<typeof locationOutputProofSchema>;
export type LocationReview = {
  id: string; version: number; state: LocationState; phase: LocationRow["phase"];
  candidateId: string | null; imageAvailable: boolean;
  approvedAt: string | null; error: string | null; dependenciesCurrent: boolean;
  heartbeatAt: string | null; leaseExpiresAt: string | null; updatedAt: string;
  canRetrySaving: boolean; canResume: boolean; canGenerate: boolean; requested: boolean;
  canDelete: boolean; canRetryDelete: boolean; providerCompleted: boolean; diagnostic?: import("./errors").LocationDiagnostic | null;
};
export const locationScopeSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid() });
export const locationActionSchema = locationScopeSchema.extend({
  version: z.number().int().nonnegative(), action: z.enum(["generate", "accept", "reject", "retry_saving", "retry_delete", "resume"]),
  locationId: z.uuid().optional(),
}).refine(value => value.version === 0 ? !value.locationId && value.action === "generate" : !!value.locationId);
export const locationMessages: Record<LocationRow["phase"], string> = {
  preparing: "Preparing location", generating: "Generating location", saving: "Saving location",
  recovering: "Recovering saved location",
  review: "Waiting for review", approved: "Location approved", deleting: "Removing rejected location", failed: "Location stopped safely",
};
export function locationErrorMessage(code: string | null | undefined, providerCompleted = false) {
  if (code === "LOCATION_DATABASE_FAILED") return "The location database operation could not finish. Check the required migration and refresh status before retrying.";
  if (code === "LOCATION_OUTPUT_UNAVAILABLE") return "The completed image is missing from R2 and local recovery storage. Reject and Delete this unavailable result, then use Generate Location when ready.";
  if (code === "LOCATION_DELETE_FAILED") return "Location deletion failed. Retry deletion; no new generation will start.";
  if (code === "LOCATION_RECONCILIATION_REQUIRED" && !providerCompleted) return "The previous request has an unknown outcome. Retry saving checks existing stored output only; it never generates another image.";
  if (code === "LOCATION_RECOVERY_FAILED") return "Stored output could not be checked or saved. Retry saving reuses existing bytes and never generates an image.";
  if (["LOCATION_R2_WRITE_FAILED", "LOCATION_STORAGE_FAILED", "LOCATION_RECONCILIATION_REQUIRED"].includes(code ?? "")) {
    return "The image provider completed, but saving did not finish. Retry saving reuses existing R2 or local recovery bytes without another generation.";
  }
  if (code === "LOCATION_LOCAL_RECOVERY_FAILED") return "The local recovery file could not be saved. Check local disk access before continuing.";
  if (code === "LOCATION_IMAGE_INVALID" || code === "LOCATION_DIMENSIONS_INVALID") return "The image failed technical file checks. Reject and Delete the result before explicitly generating another image.";
  if (code === "LOCATION_CONFIG_INVALID") return "Location configuration is unavailable. Check server configuration, then resume the saved preparation.";
  return "The location operation stopped safely. Saved references are preserved; check status and retry the affected operation.";
}
