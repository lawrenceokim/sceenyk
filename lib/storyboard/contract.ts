import { z } from "zod";

import type { Storyboard } from "./schema";
import { inspectStoryboard, validateStoryboard } from "./validation";
import { normalizeStoryboardOutput } from "./normalization";
import { StoryboardValidationError, type StoryboardValidationReport } from "./validation-diagnostics";
export { storyboardSchema, storyboardSceneSchema } from "./schema";
export type { Storyboard, StoryboardScene } from "./schema";
export { validateStoryboard } from "./validation";
export const storyboardPromptVersion = "ugc-storyboard-v1";
export const storyboardMaxRequests = 2;

export type StoryboardBinding = { character: string; product: string; location: string;
  durationMs: number; aspectRatio: string; visualStyle: string; tone: string };

export type StoryboardState = "queued" | "running" | "review" | "approved" | "failed" | "deleting" | "deleted";
export type StoryboardRow = {
  id: string; job_id: string; project_id: string; owner_user_id: string; revision: number; version: number;
  state: StoryboardState; phase: "preparing" | "generating" | "repairing" | "saving" | "review" | "approved" | "failed" | "deleting" | "deleted";
  input: StoryboardInput; document: Storyboard | null; model: string | null;
  requests: { model: string; promptVersion: string; contractVersion: number; maxOutputTokens: number; output?: string; receipt?: Record<string, unknown> }[];
  error_code: string | null; approved_at: string | null; claim_token: string | null; lease_expires_at: string | null;
  heartbeat_at: string | null; attempts: number; created_at: string; updated_at: string;
};
export type StoryboardAsset = { id: string; storageKey: string; etag: string; sha256: string; sizeBytes: number; mimeType: string };
export type StoryboardInput = {
  scene: Record<string, unknown> & { sceneDescription: string; character: { name: string }; product: { name: string };
    settings: { duration: string; aspectRatio: string; visualStyle: string; tone: string } };
  dependencies: Record<string, unknown>;
  character: StoryboardAsset; product: StoryboardAsset; location: StoryboardAsset;
  locationPlan: Record<string, unknown>; wardrobe: unknown;
};
export function storyboardBinding(input: StoryboardInput): StoryboardBinding {
  return { character: input.character.id, product: input.product.id, location: input.location.id,
    durationMs: Number(input.scene.settings.duration) * 1000, ...input.scene.settings };
}
// Derive the complete prompt from the same editable scene data on every save.
// This keeps voice/actions/camera edits and downstream instructions consistent.
// Additional directions are editable; the full prompt is read-only in Studio.
export function prepareStoryboard(value: unknown, input: StoryboardInput): Storyboard {
  const normalized = normalizeStoryboardOutput(value, storyboardBinding(input));
  const parsed = normalized.document;
  const scenes = parsed.scenes.map(scene => {
    const details = Object.fromEntries(Object.entries(scene).filter(([key]) => key !== "generationPrompt"));
    return { ...scene, generationPrompt:
      `Create scene ${scene.number} of the same UGC story. Use exactly one character, one product and the approved location. ` +
      `Character ${JSON.stringify(input.scene.character.name)}: asset:${input.character.id}. ` +
      `Product ${JSON.stringify(input.scene.product.name)}: asset:${input.product.id}. Location: asset:${input.location.id}. ` +
      "Preserve the exact approved identity, outfit, product appearance and environment. No additional people, speaking characters, products or unsupported claims. " +
      `Video settings: ${JSON.stringify({ durationMs: parsed.durationMs, aspectRatio: parsed.aspectRatio, visualStyle: parsed.visualStyle,
        tone: parsed.tone, videoType: input.scene.ugcType, narration: input.scene.narration })}. ` +
      `Stable voice: ${JSON.stringify(parsed.voice)}. Continuity: ${JSON.stringify(parsed.continuity)}. ` +
      `Scene instructions (all timestamps absolute milliseconds): ${JSON.stringify(details)}. ` +
      "Carry out only the timed actions with physically plausible grip, scale and movement. Keep speech within its assigned interval using the same Character voice. End at the exact scene boundary without overlap." };
  });
  const result = inspectStoryboard({ ...parsed, scenes }, storyboardBinding(input));
  if (!result.document || result.issues.length) throw new StoryboardValidationError({ validatorVersion: 2, valid: false, issues: result.issues, normalizations: normalized.normalizations });
  return result.document;
}
export function inspectPreparedStoryboard(value: unknown, input: StoryboardInput): { document: Storyboard | null; report: StoryboardValidationReport } {
  let normalizations: StoryboardValidationReport["normalizations"] = [];
  try {
    const normalized = normalizeStoryboardOutput(value, storyboardBinding(input));
    normalizations = normalized.normalizations;
    const document = prepareStoryboard(normalized.document, input);
    return { document, report: { validatorVersion: 2, valid: true, issues: [], normalizations: normalized.normalizations } };
  } catch (error) {
    if (error instanceof StoryboardValidationError) return { document: null, report: { ...error.report,
      normalizations: normalizations.length ? normalizations : error.report.normalizations } };
    throw error;
  }
}
// Last synchronous gate immediately before a generated/recovered draft is saved.
// Recounts speech/actions, total duration and all overlap/binding/field rules on
// the final canonical document. No creative repair or preferred-target bypass.
export function finalizeStoryboard(value: unknown, input: StoryboardInput): Storyboard {
  return validateStoryboard(prepareStoryboard(value, input), storyboardBinding(input));
}
export type StoryboardReview = { id: string; version: number; state: StoryboardState; phase: StoryboardRow["phase"];
  document: Storyboard | null; current: boolean; error: string | null; heartbeatAt: string | null; leaseExpiresAt: string | null;
  canRetry: boolean; canDelete: boolean; approvedAt: string | null;
  createdAt: string; updatedAt: string; attempts: number; requestCount: number;
  recovery?: import("./recovery-contract").StoryboardRecoveryInfo;
  manualRecoveries?: { requestIndex: number; document: Storyboard }[];
  execution?: "queued" | "queued_delayed" | "processing" | "stalled" | "paused" | "failed" | "approved" | "deleted" | "deleting" };
export function storyboardExecution(review: Pick<StoryboardReview, "state" | "error" | "createdAt" | "updatedAt" | "heartbeatAt" | "leaseExpiresAt" | "current">, now: number, enabled: boolean): NonNullable<StoryboardReview["execution"]> {
  if (review.error || review.state === "failed") return "failed";
  if (review.state === "deleted") return "deleted";
  if (review.state === "approved") return review.current ? "approved" : "paused";
  if (review.state === "review" || (!enabled || !review.current) && review.state === "queued") return "paused";
  if (review.state === "queued") return now - Date.parse(review.updatedAt || review.createdAt) >= 90_000 ? "queued_delayed" : "queued";
  if (review.state === "deleting" && !review.leaseExpiresAt && now - Date.parse(review.updatedAt) < 90_000) return "deleting";
  if (!review.leaseExpiresAt || Date.parse(review.leaseExpiresAt) <= now || !review.heartbeatAt || now - Date.parse(review.heartbeatAt) >= 90_000) return "stalled";
  return review.state === "deleting" ? "deleting" : "processing";
}
export function storyboardStatusLabel(review: StoryboardReview) {
  if (review.execution === "queued") return "Storyboard queued";
  if (review.execution === "queued_delayed") return "Storyboard queued — worker has not claimed it";
  if (review.execution === "stalled") return "Storyboard worker stopped responding";
  if (review.execution === "failed") return "Storyboard stopped safely";
  if (review.execution === "paused" && review.state === "queued") return "Storyboard paused before processing";
  return storyboardMessages[review.phase];
}
export function storyboardQueueMessage(review: StoryboardReview) {
  if (review.execution === "queued_delayed") return "This storyboard has been queued for over 90 seconds without a worker claim. Check local worker diagnostics and migration setup, then Check status. Keep this existing storyboard; do not generate a replacement.";
  if (review.execution === "stalled") return "The worker lease or heartbeat expired. Check local worker diagnostics before restarting. Saved request intents and responses are preserved; an unknown paid request will not be repeated.";
  if (review.execution === "queued") return review.requestCount > 0 ? "Saved storyboard work is queued. Existing paid-request intents and responses are retained." : "Queued for the local worker. No storyboard request has started.";
  if (review.execution === "paused" && review.state === "queued") return "Storyboard processing is paused. Check saved inputs, reference approvals and the server enablement flag; keep the existing request.";
  return null;
}
export const storyboardScopeSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid() });
export const storyboardActionSchema = storyboardScopeSchema.extend({
  storyboardId: z.uuid().optional(), version: z.number().int().nonnegative(),
  action: z.enum(["generate", "save", "accept", "reject", "retry", "recover"]), document: z.unknown().optional(),
  requestIndex: z.number().int().min(0).max(1).optional(),
}).refine(value => value.version === 0 ? value.action === "generate" && !value.storyboardId : !!value.storyboardId);
export const storyboardMessages: Record<StoryboardRow["phase"], string> = {
  preparing: "Preparing storyboard", generating: "Generating storyboard", repairing: "Correcting storyboard details",
  saving: "Saving storyboard", review: "Storyboard ready for review", approved: "Storyboard approved — paused before generation package",
  failed: "Storyboard stopped safely", deleting: "Deleting storyboard", deleted: "Storyboard deleted",
};
export function storyboardErrorMessage(code: string | null) {
  if (code === "STORYBOARD_RECONCILIATION_REQUIRED") return "The previous request has an unknown outcome. Retry checks saved responses only. It never repeats an uncertain request. Reject and Delete before explicitly generating another storyboard.";
  if (code === "STORYBOARD_INPUT_CHANGED") return "Project inputs or reference approvals changed. Review this storyboard, then Reject and Delete to generate it from current approvals.";
  if (code === "STORYBOARD_CONFIG_INVALID") return "Storyboard configuration is unavailable. Check server setup, then retry.";
  if (code === "STORYBOARD_OUTPUT_INVALID") return "The saved response did not pass storyboard validation. Review the field-level errors before deciding what to do. The original responses are preserved.";
  return "Storyboard work stopped safely. Check status and server setup. Saved references are preserved.";
}
