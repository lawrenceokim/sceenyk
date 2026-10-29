import "server-only";
import { z } from "zod";
import { digestSchema } from "./contract";
import type { FrozenPackage } from "./package";
import { freezeDocument, v3Digest } from "./identity";

export const executionStates = ["planned", "package_ready", "awaiting_authorization", "authorized", "queued", "submitting",
  "provider_processing", "result_saved", "awaiting_review", "approved", "failed", "reconciliation_required"] as const;
const assessment = z.enum(["not_checked", "pass", "fail", "not_applicable"]);
export const validationSchema = z.strictObject({ dialogueProduced: assessment, approximateTiming: assessment, lipAudioSync: assessment,
  characterContinuity: assessment, productContinuity: assessment, shotContinuity: assessment });
export const privateResultSchema = z.strictObject({ id: z.uuid(), sha256: digestSchema, storageKey: z.string().min(1).max(1000),
  sizeBytes: z.number().int().positive().safe(), mimeType: z.literal("video/mp4"), durationMs: z.number().int().positive(),
  width: z.number().int().positive(), height: z.number().int().positive(), hasAudio: z.boolean(),
  verifiedAt: z.iso.datetime({ offset: true }), verifiedReadback: z.literal(true), providerRequestId: z.uuid().nullable(),
  actualCostMicrousd: z.number().int().nonnegative().safe().nullable(), receiptHash: digestSchema.nullable() });
const attemptSchema = z.strictObject({ id: z.uuid(), idempotencyKey: z.uuid(), fingerprint: digestSchema,
  state: z.enum(executionStates), providerRequestId: z.uuid().nullable(), requestBodyHash: digestSchema.nullable(),
  result: privateResultSchema.nullable(), review: z.enum(["pending", "approved", "rejected"]), validation: validationSchema,
  failureCode: z.string().regex(/^[A-Z0-9_]{1,80}$/).nullable() });
export const executionSchema = z.strictObject({ packageId: z.uuid(), packageHash: digestSchema, revision: z.number().int().nonnegative(),
  state: z.enum(executionStates), segments: z.array(z.strictObject({ id: z.string().min(1), fingerprint: digestSchema,
    attempts: z.array(attemptSchema) })).min(1), finalCandidate: privateResultSchema.nullable(),
  finalReview: z.enum(["pending", "approved", "rejected"]) });
export type Execution = z.infer<typeof executionSchema>;
export type Validation = z.infer<typeof validationSchema>;
export const uncheckedValidation: Validation = { dialogueProduced: "not_checked", approximateTiming: "not_checked", lipAudioSync: "not_checked",
  characterContinuity: "not_checked", productContinuity: "not_checked", shotContinuity: "not_checked" };
export const executionEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("await_authorization") }), z.strictObject({ type: z.literal("authorize") }),
  z.strictObject({ type: z.literal("generate"), segmentId: z.string(), attemptId: z.uuid(), idempotencyKey: z.uuid() }),
  z.strictObject({ type: z.literal("submitting"), segmentId: z.string(), requestBodyHash: digestSchema }),
  z.strictObject({ type: z.literal("accepted"), segmentId: z.string(), providerRequestId: z.uuid() }),
  z.strictObject({ type: z.literal("unknown_outcome"), segmentId: z.string() }),
  z.strictObject({ type: z.literal("definitive_failure"), segmentId: z.string(), code: z.string().regex(/^[A-Z0-9_]{1,80}$/), reconciled: z.boolean() }),
  z.strictObject({ type: z.literal("save_result"), segmentId: z.string(), result: privateResultSchema }),
  z.strictObject({ type: z.literal("review_segment"), segmentId: z.string(), decision: z.enum(["approved", "rejected"]), validation: validationSchema }),
  z.strictObject({ type: z.literal("joined_candidate"), result: privateResultSchema }),
  z.strictObject({ type: z.literal("review_final"), decision: z.enum(["approved", "rejected"]), validation: validationSchema }),
]);
export type ExecutionEvent = z.infer<typeof executionEventSchema>;
export function initialExecution(doc: FrozenPackage): Execution {
  return freezeDocument({ packageId: doc.id, packageHash: doc.hash, revision: 0, state: "package_ready",
    segments: doc.segments.map(s => ({ id: s.id, fingerprint: s.fingerprint, attempts: [] })), finalCandidate: null, finalReview: "pending" });
}
function reviewed(validation: Validation, doc: FrozenPackage, sceneNumbers?: number[]) {
  const speech = doc.source.storyboardContent.scenes.filter(s => !sceneNumbers || sceneNumbers.includes(s.number)).flatMap(s => s.speech).filter(s => s.text.trim());
  const required: (keyof Validation)[] = ["approximateTiming", "characterContinuity", "productContinuity", "shotContinuity"];
  if (speech.length) required.push("dialogueProduced");
  if (speech.some(s => s.speaker === "character")) required.push("lipAudioSync");
  return required.every(k => validation[k] === "pass") && !Object.values(validation).includes("fail");
}
function assertPrivate(doc: FrozenPackage, value: z.infer<typeof privateResultSchema>) {
  const prefix = `users/${doc.source.scope.ownerId}/projects/${doc.source.scope.projectId}/v3/`;
  if (!value.storageKey.startsWith(prefix) || /\.\.|[?#:\\]/.test(value.storageKey) || value.hasAudio !== doc.source.generateAudio)
    throw new Error("PRIVATE_RESULT_INVALID");
}
// Pure state machine for future transport/review integration and offline fixtures.
// Persisted paid transitions are additionally prohibited by migration 076.
export function reduceExecution(doc: FrozenPackage, original: Execution, raw: unknown): Execution {
  const state = structuredClone(executionSchema.parse(original)), event = executionEventSchema.parse(raw);
  if (state.packageId !== doc.id || state.packageHash !== doc.hash || state.segments.length !== doc.segments.length ||
    state.segments.some((s, i) => s.fingerprint !== doc.segments[i].fingerprint || s.id !== doc.segments[i].id)) throw new Error("EXECUTION_PACKAGE_MISMATCH");
  if (state.finalReview !== "pending") throw new Error("FINAL_REVIEW_IMMUTABLE");
  const segment = "segmentId" in event ? state.segments.find(s => s.id === event.segmentId) : undefined;
  if ("segmentId" in event && !segment) throw new Error("SEGMENT_NOT_FOUND");
  const last = segment?.attempts.at(-1);
  switch (event.type) {
    case "await_authorization":
      if (state.state !== "package_ready") throw new Error("INVALID_TRANSITION");
      state.state = "awaiting_authorization"; break;
    case "authorize":
      if (!["package_ready", "awaiting_authorization"].includes(state.state)) throw new Error("INVALID_TRANSITION");
      state.state = "authorized"; break;
    case "generate": {
      if (!last && state.state !== "authorized" && !state.segments.some(s => s.attempts.length) ||
        last && (last.state !== "failed" || last.result !== null)) throw new Error("RECONCILE_OR_REUSE_BEFORE_RETRY");
      if (state.segments.flatMap(s => s.attempts).some(a => a.id === event.attemptId || a.idempotencyKey === event.idempotencyKey)) throw new Error("DUPLICATE_REQUEST_INTENT");
      segment!.attempts.push({ id: event.attemptId, idempotencyKey: event.idempotencyKey, fingerprint: segment!.fingerprint, state: "queued",
        providerRequestId: null, requestBodyHash: null, result: null, review: "pending", validation: { ...uncheckedValidation }, failureCode: null });
      state.state = "queued"; break;
    }
    case "submitting":
      if (!last || last.state !== "queued") throw new Error("INVALID_TRANSITION");
      last.requestBodyHash = event.requestBodyHash; last.state = "submitting"; state.state = "submitting"; break;
    case "accepted":
      if (!last || !["submitting", "reconciliation_required"].includes(last.state) || last.providerRequestId && last.providerRequestId !== event.providerRequestId)
        throw new Error("INVALID_TRANSITION");
      last.providerRequestId = event.providerRequestId; last.state = "provider_processing"; state.state = "provider_processing"; break;
    case "unknown_outcome":
      if (!last || !["submitting", "provider_processing"].includes(last.state)) throw new Error("INVALID_TRANSITION");
      last.state = "reconciliation_required"; state.state = "reconciliation_required"; break;
    case "definitive_failure":
      if (!last || !["submitting", "provider_processing", "reconciliation_required"].includes(last.state) || last.result ||
        last.state === "reconciliation_required" && !event.reconciled) throw new Error("RECONCILIATION_REQUIRED");
      last.state = "failed"; last.failureCode = event.code; state.state = "failed"; break;
    case "save_result":
      if (!last || !["provider_processing", "reconciliation_required"].includes(last.state) || last.result ||
        event.result.providerRequestId !== last.providerRequestId) throw new Error("RESULT_BINDING_INVALID");
      assertPrivate(doc, event.result);
      if (event.result.durationMs !== doc.segments.find(s => s.id === segment!.id)!.durationMs) throw new Error("RESULT_DURATION_INVALID");
      last.result = event.result; last.state = "awaiting_review"; state.state = "awaiting_review";
      if (state.segments.length === 1) state.finalCandidate = event.result;
      break;
    case "review_segment":
      if (state.segments.length === 1 || !last?.result || last.review !== "pending") throw new Error("SEGMENT_REVIEW_UNAVAILABLE");
      if (event.decision === "approved" && !reviewed(event.validation, doc, doc.segments.find(s => s.id === segment!.id)!.includedSceneNumbers))
        throw new Error("VALIDATION_REQUIRED");
      last.review = event.decision; last.validation = event.validation; last.state = event.decision === "approved" ? "approved" : "awaiting_review"; break;
    case "joined_candidate":
      if (state.segments.length < 2 || !canJoin(state) || state.finalCandidate) throw new Error("JOIN_NOT_READY");
      assertPrivate(doc, event.result);
      if (event.result.providerRequestId !== null) throw new Error("LOCAL_JOIN_PROVIDER_ID_INVALID");
      if (event.result.durationMs !== doc.source.storyboardContent.durationMs) throw new Error("RESULT_DURATION_INVALID");
      state.finalCandidate = event.result; state.state = "awaiting_review"; break;
    case "review_final":
      if (!state.finalCandidate) throw new Error("FINAL_CANDIDATE_MISSING");
      if (event.decision === "approved" && !reviewed(event.validation, doc)) throw new Error("VALIDATION_REQUIRED");
      state.finalReview = event.decision; state.state = event.decision === "approved" ? "approved" : "awaiting_review"; break;
  }
  state.revision++;
  return freezeDocument(executionSchema.parse(state));
}
export function canJoin(state: Execution) {
  return state.segments.length > 1 && state.segments.every(s => s.attempts.at(-1)?.review === "approved" && !!s.attempts.at(-1)?.result);
}
export function recoveryAction(state: Execution, segmentId: string) {
  const segment = state.segments.find(s => s.id === segmentId);
  if (!segment) throw new Error("SEGMENT_NOT_FOUND");
  const last = segment.attempts.at(-1);
  if (last?.result) return "reuse_saved_result";
  if (last && ["submitting", "provider_processing", "reconciliation_required"].includes(last.state)) return "reconcile_original_request";
  if (last?.state === "failed") return "explicit_authorized_retry_only";
  if (last?.state === "queued") return "resume_same_intent";
  return "explicit_generate_only";
}
export const executionHash = (state: Execution) => v3Digest("execution-state", executionSchema.parse(state));
