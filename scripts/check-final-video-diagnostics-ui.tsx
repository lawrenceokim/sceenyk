// Static rendering only; no browser, actions, provider calls or private env.
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { FinalVideoReview } from "../components/creation/final-video-review";
import type { FinalAvailability, FinalReview } from "../lib/final-video-generation/contract";

globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_DIAGNOSTICS_UI"); };
let checks = 0;
const check = (value: unknown) => { assert.ok(value); checks++; };
const review: FinalReview = { id: "fixture", version: 1, revision: 1, state: "failed", phase: "scene_failed", label: "Final video stopped safely",
  current: true, error: "FINAL_PROVIDER_REJECTED", durationMs: null, width: null, height: null, aspectRatio: "16:9",
  canApprove: false, canReject: false, canRecover: false, updatedAt: "fixture", heartbeatAt: null, leaseExpiresAt: null,
  failure: { sceneNumber: 2, stage: "video", provider: "fal.ai", model: "fixture-model", httpStatus: 422, providerRequestId: null,
    providerCode: "fixture_validation", message: "A fixture field is invalid." } };
function render(snapshot: FinalReview, raw = false) {
  const value: FinalAvailability = { enabled: true, eligible: true, available: true, authorization: null, review: snapshot };
  const markup = renderToStaticMarkup(<FinalVideoReview projectId="fixture" jobId="fixture" value={value} checkStatus={() => { throw new Error("NO_ACTION"); }} onSaved={() => { throw new Error("NO_ACTION"); }} />);
  return raw ? markup : markup.replace(/<[^>]+>/g, "");
}
const rejected = render(review);
check(rejected.includes("Scene 2 video failed.")); check(rejected.includes("Provider: fal.ai"));
check(rejected.includes("Provider status: 422")); check(rejected.includes("A fixture field is invalid."));
check(rejected.includes("Saved-work recovery cannot retry this rejected request.")); check(!rejected.includes("Recover saved work"));
const legacy = render({ ...review, failure: { ...review.failure!, httpStatus: null, providerCode: null, message: "Original response was not retained." } });
check(legacy.includes("Provider status: Not retained")); check(legacy.includes("Original response was not retained."));
const recoverable = render({ ...review, state: "reconciling", phase: "reconciliation_required", error: "FINAL_RECOVERY_REQUIRED", canRecover: true, failure: undefined });
check(recoverable.includes("Recover saved work")); check(recoverable.includes("It stops before any new provider request"));
check(!recoverable.includes("without submitting another paid request"));
const authorization = { originalRequests: 8, amendedRequests: 0, effectiveRequests: 8, originalCostMicrousd: 7000000, amendedCostMicrousd: 0,
  effectiveCostMicrousd: 7000000, consumedRequests: 2, remainingRequests: 6 };
const retryReady: FinalReview = { ...review, effectiveAuthorization: authorization,
  retry: { available: true, blockers: [], operationId: "fixture-op", stage: "voice_design", originalAttempt: 1, reason: "provider_permission_corrected",
    reviewedHttpStatus: 403, additionalRequests: 1, additionalCostMicrousd: 0, replacementCostMicrousd: 0, replacementCredits: 119, sunkKnownCostMicrousd: 2311200,
    remainingPipelineCostMicrousd: 2451200, projectedTotalCostMicrousd: 4762400, requiredNewRequests: 7, authorization,
    effectiveRequestsAfter: 9, effectiveCostAfterMicrousd: 7000000, projectedIncludedCredits: 260, configuredIncludedCredits: 9981,
    preservedWork: ["scene-1 video"], quoteVersion: "a".repeat(64) } };
const retryMarkup = render(retryReady, true), retryText = render(retryReady);
check(retryText.includes("Retry failed stage: Voice Design")); check(retryText.includes("8 original + 1 amendment = 9"));
check(retryText.includes("119 ElevenLabs credits")); check(retryText.includes("scene-1 video"));
check(retryText.includes("I reviewed the rejected HTTP 403 permission failure"));
check(/disabled=""[^>]*>Retry failed stage<\/button>/.test(retryMarkup));
const resumed = render({ ...review, error: "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST", canResume: true, failure: undefined });
check(resumed.includes("Resume authorized processing")); check(resumed.includes("I approve resuming unfinished provider requests"));
const amendmentPending = render({ ...review, state: "queued", error: null, failure: undefined,
  effectiveAuthorization: { ...authorization, amendedRequests: 1, effectiveRequests: 9, remainingRequests: 7 },
  attempts: [{ stage: "Voice Design", attempt: 1, state: "failed", httpStatus: null, amendmentId: null }],
  amendments: [{ id: "fixture-amendment", stage: "voice_design", reason: "provider_permission_corrected", additional_requests: 1,
    created_at: "fixture", reviewed_http_status: 403, replacesAttempt: 1 }] });
check(amendmentPending.includes("Replacement authorized — Amendment fixture-amendment"));
check(amendmentPending.includes("Attempt 2 — Pending")); check(amendmentPending.includes("8 original + 1 amendment = 9"));
const uncertain = render({ ...review, state: "reconciling", error: "FINAL_UNCERTAIN_PROVIDER_OUTCOME", failure: undefined,
  attempts: [{ stage: "Voice Design", attempt: 2, state: "submitted", httpStatus: null, amendmentId: "fixture-amendment" }] });
check(uncertain.includes("Attempt 2 — Awaiting reconciliation"));
const bindingAuthorization = { ...authorization, amendedRequests: 3, effectiveRequests: 11, consumedRequests: 6, remainingRequests: 5 };
const bindingReview: FinalReview = { ...retryReady, effectiveAuthorization: bindingAuthorization,
  attempts: [{ stage: "Voice Design", attempt: 4, state: "ready", httpStatus: null, amendmentId: "design-four" },
    { stage: "Voice binding", attempt: 1, state: "failed", httpStatus: 400, amendmentId: null }],
  retry: { ...retryReady.retry!, stage: "voice_binding", reason: "provider_labels_corrected", reviewedHttpStatus: 400,
    authorization: bindingAuthorization, effectiveRequestsAfter: 12, replacementCredits: 0, requiredNewRequests: 6,
    projectedIncludedCredits: 498, preservedWork: ["scene-1 video", "Shared design"] } };
const bindingText = render(bindingReview);
check(bindingText.includes("Retry failed stage: Voice binding")); check(bindingText.includes("8 original + 4 amendment = 12"));
check(bindingText.includes("0 ElevenLabs credits")); check(bindingText.includes("HTTP 400 invalid_labels"));
check(bindingText.includes("Voice Design will not run again")); check(bindingText.includes("Attempt 4 — Completed"));
check(bindingText.includes("Voice binding · Attempt 1 — Rejected (400)")); check(!bindingText.includes("HTTP 403 permission"));
check(!bindingText.includes("Recover saved work"));
const bindingPending = render({ ...bindingReview, retry: undefined, state: "queued", error: null,
  amendments: [{ id: "binding-replacement", stage: "voice_binding", reason: "provider_labels_corrected", additional_requests: 1,
    created_at: "fixture", reviewed_http_status: 400, replacesAttempt: 1 }] });
check(bindingPending.includes("Voice binding · Attempt 2 — Pending")); check(bindingPending.includes("Label correction reviewed by operator (400)"));
check(render({ ...review, failure: undefined, error: "FINAL_VOICE_LABEL_VALUE_LIMIT:language", localError: 'Voice binding blocked locally: label "language" exceeds 50 characters.' })
  .includes("label &quot;language&quot; exceeds 50 characters"));
const speechRecovery = { ...review, failure: undefined, error: "FINAL_SPEECH_TIMING", canRecover: true,
  effectiveAuthorization: { ...bindingAuthorization, amendedRequests: 4, effectiveRequests: 12, consumedRequests: 11, remainingRequests: 1 },
  speechRecovery: { sceneNumber: 2, windowMs: 1400, alignmentEndMs: 1440, savedResponse: true, maximumAccelerationPercent: 8, requiresTtsReview: false } };
const speechText = render(speechRecovery);
check(speechText.includes("Scene 2 speech window: 1400 ms")); check(speechText.includes("limited to 8% acceleration"));
check(speechText.includes("no new ElevenLabs request")); check(speechText.includes("stops before a new lip-sync request"));
check(speechText.includes("Recover saved work")); check(speechText.includes("11 consumed · 1 remaining"));
const speechBlocked = render({ ...speechRecovery, canRecover: false, error: "FINAL_SPEECH_RETRY_REQUIRED",
  speechRecovery: { ...speechRecovery.speechRecovery, requiresTtsReview: true } }, true);
check(!speechBlocked.includes(">Recover saved work</button>")); check(/disabled=""[^>]*>Retry failed stage<\/button>/.test(speechBlocked));
console.info(`Final-video diagnostic UI static checks passed: ${checks}; actions/network/browser: none`);
