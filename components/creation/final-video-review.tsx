"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FinalAvailability } from "@/lib/final-video-generation/contract";

export function FinalVideoReview({ projectId, jobId, packageId, value, checkStatus, onSaved }: {
  projectId: string; jobId: string; packageId?: string; value?: FinalAvailability;
  checkStatus: () => void; onSaved: (value: FinalAvailability) => void;
}) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef<string | null>(null); const review = value?.review;
  const retryId = useRef<{ quote: string; id: string } | null>(null);
  const [confirmedRetry, setConfirmedRetry] = useState<string | null>(null);
  const [confirmedResume, setConfirmedResume] = useState<number | null>(null);
  const retry = review?.retry;
  async function act(action: "generate" | "approve" | "reject" | "recover" | "retry_stage" | "resume") {
    if (action === "retry_stage" && (!retry?.available || confirmedRetry !== retry.quoteVersion)) return;
    if (action === "resume" && confirmedResume !== review?.version) return;
    setBusy(true); setMessage(null);
    if (action === "generate") requestId.current ??= crypto.randomUUID();
    if (action === "retry_stage" && retry && retryId.current?.quote !== retry.quoteVersion) retryId.current = { quote: retry.quoteVersion, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/ugc/final-video", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, jobId, action, version: review?.version ?? 0,
          ...(review ? { executionId: review.id } : {}),
          ...(action === "generate" ? { packageId, requestId: requestId.current, authorizationVersion: value?.authorization?.version, acceptedCost: true } : {}),
          ...(action === "resume" ? { acceptedCost: true } : {}),
          ...(action === "retry_stage" && retry ? { amendmentId: retryId.current?.id, operationId: retry.operationId, quoteVersion: retry.quoteVersion,
            operatorApproved: true, configurationCorrected: true, reviewedHttpStatus: retry.reviewedHttpStatus, reason: retry.reason,
            additionalRequests: 1, additionalCostMicrousd: retry.additionalCostMicrousd } : {}) }) });
      const body = await response.json();
      if (!response.ok || !body.ok || !body.finalVideo) throw new Error(typeof body.message === "string" ? body.message : "Video action unavailable.");
      onSaved(body.finalVideo); if (action === "generate") requestId.current = null;
      if (action === "retry_stage") { retryId.current = null; setConfirmedRetry(null); } checkStatus();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check status before continuing."); }
    finally { setBusy(false); }
  }
  const preview = review ? `/api/ugc/final-video/preview?${new URLSearchParams({ projectId, jobId, executionId: review.id })}` : "";
  const canGenerate = !!packageId && !!value?.eligible && !!value.authorization && (!review || review.state === "deleted");
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-card p-4">
    <div><h3 className="text-sm font-semibold text-foreground">Final Video</h3>
      <p className="mt-1 text-sm text-muted-foreground" role="status" aria-live="polite">{review?.label ?? "Generate your final video from the approved package."}</p></div>
    {review && !review.current && review.state !== "deleted" && <p className="text-sm text-destructive">The approved package changed. This result cannot be approved as current.</p>}
    {review && ["review", "approved"].includes(review.state) && <>
      <video key={`${review.id}:${review.revision}`} className="max-h-[60dvh] w-full rounded-md bg-black object-contain" controls playsInline preload="metadata" src={preview} aria-label="Private final video preview" />
      <p className="text-xs text-muted-foreground">{((review.durationMs ?? 0) / 1000).toFixed(2)}s · {review.aspectRatio} · {review.width} × {review.height}</p>
    </>}
    {review?.error && <div className="space-y-1 break-words text-sm text-destructive" role="alert">
      <p>Generation stopped safely. Existing saved outputs are preserved.</p>
      {review.localError && <p>{review.localError}</p>}
      {review.failure && <>
        <p>{review.failure.sceneNumber ? `Scene ${review.failure.sceneNumber} ` : ""}{review.failure.stage === "design" ? "Voice Design" : review.failure.stage.replaceAll("_", " ")} failed.</p>
        <p>Provider: {review.failure.provider} · Model: {review.failure.model}</p>
        <p>Provider status: {review.failure.httpStatus ?? "Not retained"}{review.failure.providerCode ? ` · ${review.failure.providerCode}` : ""}</p>
        <p>Reason: {review.failure.message}</p>
      </>}
      {(review.error === "FINAL_PROVIDER_REJECTED" || review.error === "FINAL_PROVIDER_RATE_LIMIT") && <p>Saved-work recovery cannot retry this rejected request. Inspect provider diagnostics before authorizing a replacement.</p>}
    </div>}
    {review?.effectiveAuthorization && <p className="text-xs text-muted-foreground">
      Request authorization: {review.effectiveAuthorization.originalRequests} original + {review.effectiveAuthorization.amendedRequests} amendment = {review.effectiveAuthorization.effectiveRequests}.
      {" "}{review.effectiveAuthorization.consumedRequests} consumed · {review.effectiveAuthorization.remainingRequests} remaining.
      {" "}Effective USD authorization: ${(review.effectiveAuthorization.effectiveCostMicrousd / 1000000).toFixed(2)}.
    </p>}
    {!!review?.attempts?.length && <div className="space-y-1 text-xs text-muted-foreground">
      {review.attempts.map(attempt => <p key={`${attempt.stage}:${attempt.attempt}`}>{attempt.stage} · Attempt {attempt.attempt} — {attempt.state === "ready" ? "Completed" : attempt.state === "failed" ? "Rejected" : review.state === "reconciling" ? "Awaiting reconciliation" : attempt.state === "intent" ? "Pending" : "Running"}
        {attempt.httpStatus ? ` (${attempt.httpStatus})` : ""}</p>)}
      {review.amendments?.map(amendment => <div key={amendment.id} className="break-words">
        <p>Replacement authorized — Amendment {amendment.id}. {amendment.reason === "provider_labels_corrected" ? "Label correction" : "Permission correction"} reviewed by operator ({amendment.reviewed_http_status}).</p>
        {!review.attempts?.some(attempt => attempt.amendmentId === amendment.id) && <p>{amendment.stage === "voice_binding" ? "Voice binding" : "Voice Design"} · Attempt {amendment.replacesAttempt + 1} — Pending</p>}
      </div>)}
    </div>}
    {review?.speechRecovery && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p>Scene {review.speechRecovery.sceneNumber ?? ""} speech window: {review.speechRecovery.windowMs} ms.
        {review.speechRecovery.alignmentEndMs !== null && ` Saved alignment ends at ${review.speechRecovery.alignmentEndMs} ms.`}</p>
      {review.speechRecovery.requiresTtsReview ? <>
        {review.speechRecovery.fittingFailure && <p>Decoded speech: {review.speechRecovery.fittingFailure.decodedDurationMs} ms.
          Required tempo: {(review.speechRecovery.fittingFailure.requiredTempoPermille / 1000).toFixed(3)}× · Maximum: {(review.speechRecovery.fittingFailure.maximumTempoPermille / 1000).toFixed(3)}×.</p>}
        <p>The saved speech exceeds the local fitting limit. A replacement TTS request needs a separate reviewed stage retry and enough authorization for the remaining lip-sync. No replacement is authorized by recovery.</p>
        <Button size="sm" disabled>Retry failed stage</Button>
      </> : <p>{review.speechRecovery.savedResponse ? "The successful speech response is saved. " : "Recovery requires saved speech. "}
        Recover saved work preserves the original audio and attempts pitch-preserving local correction, limited to {review.speechRecovery.maximumAccelerationPercent}% acceleration.
        It makes no new ElevenLabs request and stops before a new lip-sync request. Resume authorized processing confirms that remaining provider work separately.</p>}
    </div>}
    {retry && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="font-medium">Retry failed stage: {retry.stage === "voice_binding" ? "Voice binding" : "Voice Design"} · Original attempt {retry.originalAttempt}</p>
      <p>Reason: {retry.reason === "provider_labels_corrected" ? "provider labels corrected" : "provider permission corrected"}. Preserved work: {retry.preservedWork.join(", ") || "None verified"}.</p>
      {retry.stage === "voice_binding" && <p>The saved successful Voice Design preview and scene video will be reused. Only Create Voice / binding is replaced; Voice Design will not run again.</p>}
      <p>Additional request authorization: +{retry.additionalRequests}. Resulting budget: {retry.authorization.originalRequests} original + {retry.authorization.amendedRequests + 1} amendment = {retry.effectiveRequestsAfter}.</p>
      <p>{retry.authorization.consumedRequests} intents already consumed · {retry.effectiveRequestsAfter - retry.authorization.consumedRequests} remaining before the replacement.</p>
      <p>Replacement estimate: {retry.replacementCredits} ElevenLabs credits · {retry.replacementCostMicrousd === null ? "USD unavailable" : `$${(retry.replacementCostMicrousd / 1000000).toFixed(6)} immediate USD`}.</p>
      <p>Sunk/known estimate: ${(retry.sunkKnownCostMicrousd / 1000000).toFixed(6)} · Remaining pipeline: ${(retry.remainingPipelineCostMicrousd / 1000000).toFixed(6)}.</p>
      <p>Projected total: {retry.projectedTotalCostMicrousd === null ? "Unavailable" : `$${(retry.projectedTotalCostMicrousd / 1000000).toFixed(6)}`} · Additional USD authority: ${(retry.additionalCostMicrousd / 1000000).toFixed(6)} · Effective USD ceiling: ${(retry.effectiveCostAfterMicrousd / 1000000).toFixed(2)}.</p>
      {retry.configuredIncludedCredits !== null && <p>Included credits: {retry.projectedIncludedCredits} conservatively reserved/projected of {retry.configuredIncludedCredits} configured.</p>}
      {!retry.available && <p className="text-xs text-destructive">Retry blocked: {retry.blockers.join(", ")}. Check setup and status.</p>}
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" disabled={!retry.available || busy}
        checked={confirmedRetry === retry.quoteVersion} onChange={event => setConfirmedRetry(event.target.checked ? retry.quoteVersion : null)} />
        {retry.stage === "voice_binding" ? "I reviewed the HTTP 400 invalid_labels rejection and the corrected binding adapter" : "I reviewed the rejected HTTP 403 permission failure and corrected the key permissions"}, and approve this amendment and one replacement request. Successful outputs will be reused; processing continues within the displayed budgets.
      </label>
      <Button size="sm" disabled={busy || !value?.enabled || !retry.available || confirmedRetry !== retry.quoteVersion} onClick={() => void act("retry_stage")}>Retry failed stage</Button>
    </div>}
    {canGenerate && value?.authorization && <p className="text-xs text-muted-foreground">Operator-funded development generation. Authorized estimated budget: ${(value.authorization.maxEstimatedCostMicrousd / 1_000_000).toFixed(2)} · Voice language: {value.authorization.language}. Generate Final Video confirms this funding authorization.</p>}
    {!value?.available && <p className="text-sm text-muted-foreground">Final video generation requires local setup.</p>}
    {value?.available && !value.enabled && <p className="text-sm text-muted-foreground">Final video generation is not enabled for this local session.</p>}
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    <div className="flex flex-wrap gap-2">
      {canGenerate && <Button size="sm" disabled={busy} onClick={() => void act("generate")}>{busy ? "Starting…" : "Generate Final Video"}</Button>}
      {review?.canApprove && <Button size="sm" disabled={busy} onClick={() => void act("approve")}>Approve Final Video</Button>}
      {review?.canReject && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("reject")}>Reject and Delete Final Video</Button>}
      {review?.canRecover && value?.enabled && <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Recovery retrieves existing provider results and retries storage or local processing. It stops before any new provider request.</p>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("recover")}>Recover saved work</Button>
      </div>}
      {review?.canResume && value?.enabled && <div className="space-y-2">
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmedResume === review.version}
          onChange={event => setConfirmedResume(event.target.checked ? review.version : null)} />
          I approve resuming unfinished provider requests within the existing effective authorization. Successful outputs will be reused.
        </label>
        <Button size="sm" disabled={busy || confirmedResume !== review.version} onClick={() => void act("resume")}>Resume authorized processing</Button>
      </div>}
      <Button size="sm" variant="outline" disabled={busy} onClick={checkStatus}>Check status</Button>
    </div>
  </section>;
}
