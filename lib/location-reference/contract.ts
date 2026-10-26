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
export type LocationState = "queued_plan" | "running_plan" | "plan_review" | "queued_image" | "running_image" | "image_review" | "approved" | "rejecting" | "failed";
export type LocationRow = {
  id: string; job_id: string; owner_user_id: string; project_id: string; location_index: number;
  version: number; state: LocationState; phase: "preparing" | "generating" | "saving" | "review" | "approved" | "deleting" | "failed";
  dependencies: Record<string, unknown>; scene: Record<string, unknown>; plan: LocationPlan | null;
  plan_intent: Record<string, unknown> | null; plan_receipt: Record<string, unknown> | null;
  candidate_id: string | null; accepted_candidate_id: string | null; approved_at: string | null;
  error_code: string | null; worker_id: string | null; claim_token: string | null;
  heartbeat_at: string | null; lease_expires_at: string | null; created_at: string; updated_at: string;
};
export type LocationCandidate = {
  id: string; location_id: string; state: "pending" | "submitted" | "review" | "accepted" | "rejecting" | "deleted";
  plan: LocationPlan; settings: Record<string, unknown>; intent: Record<string, unknown> | null;
  receipt: Record<string, unknown> | null; artifact: LocationArtifact | null;
  rejected_at: string | null; deleted_at: string | null; created_at: string;
  deletion_proof: Record<string, unknown> | null;
};
export type LocationReview = {
  id: string; version: number; state: LocationState; phase: LocationRow["phase"];
  plan: LocationPlan | null; candidateId: string | null; imageAvailable: boolean;
  approvedAt: string | null; error: string | null; dependenciesCurrent: boolean;
  heartbeatAt: string | null; leaseExpiresAt: string | null; updatedAt: string;
  canRetrySaving: boolean; canResume: boolean;
};
export const locationScopeSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid() });
export const locationActionSchema = locationScopeSchema.extend({
  version: z.number().int().positive(), action: z.enum(["generate", "accept", "reject", "retry_saving", "resume"]),
  plan: locationPlanSchema.optional(),
});
export const locationMessages: Record<LocationRow["phase"], string> = {
  preparing: "Preparing location", generating: "Generating location", saving: "Saving location",
  review: "Waiting for review", approved: "Location approved", deleting: "Removing rejected location", failed: "Location stopped safely",
};
