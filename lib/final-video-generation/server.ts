import "server-only";
import { isDeepStrictEqual } from "node:util";
import { createDatabaseClient } from "@/lib/db/server";
import { ownedReferenceReview, ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { readGenerationPackage } from "@/lib/video-generation-package/server";
import { validateVideoGenerationPackage } from "@/lib/video-generation-package/builder";
import { finalConfiguration } from "./config";
import { finalProviders, assertFinalProviderConfiguration } from "./adapters/registry";
import { finalPreflight } from "./preflight";
import { finalActionSchema, FinalVideoError, phaseLabels, type FinalAvailability, type FinalExecution, type FinalReview } from "./contract";
import { packageDigest } from "@/lib/video-generation-package/builder";
import { readPrivateAsset } from "./storage";
import { FinalPreflightError, type CapabilityIssue } from "./capabilities";
import { providerRejectionBlocksRecovery, summarizeOperationFailure, voiceLabelValidationMessage } from "./diagnostics";
import { effectiveAuthorization, latestOperations, knownOperationCost, reservedCredits, retryReview } from "./retry";
import { assertFinalOperator, isFinalOperator } from "./operator";
import { verifyPackageMedia } from "@/lib/video-generation-package/media";
import type { Operation, FinalConfiguration } from "./contract";

type Scope = { id: string; project_id: string; owner_user_id: string };
const missing = (code: string) => ["PGRST202", "PGRST205", "42P01", "42883"].includes(code);
const consentVersion = (hash: string, packageId: string, packageHash: string, owner: string) =>
  packageDigest("sceenyk-final-consent", { configurationHash: hash, packageId, packageHash, owner });
export function finalReview(row: FinalExecution, current: boolean): FinalReview {
  const leased = !!row.claim_token && Date.parse(row.lease_expires_at ?? "") > Date.now();
  const ratio = row.final_asset ? row.final_asset.width === row.final_asset.height ? "1:1" : row.final_asset.width > row.final_asset.height ? "16:9" : "9:16" : "";
  return { id: row.id, version: row.version, revision: row.revision, state: row.state, phase: row.phase,
    label: phaseLabels[row.phase], current, error: row.error_code, localError: voiceLabelValidationMessage(row.error_code) ?? undefined,
    durationMs: row.final_asset?.durationMs ?? null, width: row.final_asset?.width ?? null, height: row.final_asset?.height ?? null,
    aspectRatio: ratio,
    canApprove: current && row.state === "review" && !leased, canReject: row.state === "review" && !leased,
    canRecover: ["failed", "reconciling"].includes(row.state) && !leased && !providerRejectionBlocksRecovery(row.error_code) && row.error_code !== "FINAL_SPEECH_RETRY_REQUIRED",
    recoveryMaySubmitRequests: false, canResume: row.state === "failed" && !leased && row.error_code === "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST", updatedAt: row.updated_at,
    heartbeatAt: row.heartbeat_at, leaseExpiresAt: row.lease_expires_at };
}
async function executionRecords(db: ReturnType<typeof createDatabaseClient>, execution: FinalExecution) {
  const [operations, amendments] = await Promise.all([
    db.from("ugc_final_operations").select("*").eq("execution_id", execution.id).eq("owner_user_id", execution.owner_user_id).order("created_at", { ascending: true }),
    db.from("ugc_final_authorization_amendments").select("*").eq("execution_id", execution.id).eq("owner_user_id", execution.owner_user_id).order("created_at", { ascending: true }),
  ]);
  if (operations.error || amendments.error && !missing(amendments.error.code)) throw new FinalVideoError("FINAL_READ_UNAVAILABLE", 503);
  return { operations: operations.data ?? [], amendments: amendments.data ?? [], installed: !amendments.error && execution.dispatch_mode !== undefined };
}
async function sharedCredits(db: ReturnType<typeof createDatabaseClient>, configuration: FinalConfiguration) {
  const allowance = configuration.pricing?.elevenLabsIncludedCredits;
  if (!allowance) return 0;
  const result = await db.from("ugc_final_operations").select("input,receipt").eq("input->costEstimate->>includedCreditAllowanceId", allowance.allowanceId);
  if (result.error) throw new FinalVideoError("FINAL_READ_UNAVAILABLE", 503);
  return reservedCredits(result.data ?? []);
}
async function verifyPreserved(run: FinalExecution, operations: readonly Operation[]) {
  const proofs = [];
  for (const op of operations) if (op.state === "ready" && op.output) {
    await readPrivateAsset(run, op.output, AbortSignal.timeout(120000));
    proofs.push({ operationId: op.id, sha256: op.output.sha256, etag: op.output.etag, sizeBytes: op.output.sizeBytes });
  }
  return proofs;
}
export async function readFinalVideo(job: Scope): Promise<FinalAvailability> {
  const db = createDatabaseClient(); let configured: ReturnType<typeof finalConfiguration> | null = null;
  try { configured = finalConfiguration(); } catch {}
  const records = await db.from("ugc_final_executions").select("*").eq("job_id", job.id).eq("owner_user_id", job.owner_user_id)
    .eq("project_id", job.project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (records.error) {
    if (missing(records.error.code)) return { available: false, enabled: false, eligible: false, authorization: null };
    throw new FinalVideoError("FINAL_READ_UNAVAILABLE", 503);
  }
  const packageState = await readGenerationPackage(job);
  const packageRow = packageState.review?.state === "approved" && packageState.review.current ?
    await db.from("ugc_generation_packages").select("*").eq("id", packageState.review.id).eq("owner_user_id", job.owner_user_id)
      .eq("project_id", job.project_id).eq("job_id", job.id).single() : null;
  const eligible = !!packageRow?.data && !!configured;
  let review;
  if (records.data) {
    const current = await db.rpc("ugc_final_current", { p_execution: records.data.id });
    if (current.error) throw new FinalVideoError("FINAL_READ_UNAVAILABLE", 503);
    review = finalReview(records.data, current.data);
    const history = await executionRecords(db, records.data);
    review.effectiveAuthorization = effectiveAuthorization(records.data, history.amendments);
    review.amendments = history.amendments.map(({ id, stage, reason, additional_requests, created_at, reviewed_http_status, failed_operation_id }) =>
      ({ id, stage, reason, additional_requests, created_at, reviewed_http_status,
        replacesAttempt: history.operations.find(op => op.id === failed_operation_id)?.attempt ?? 1 }));
    review.attempts = history.operations.filter(op => op.kind === "design" || op.kind === "binding").map(op => ({ stage: op.kind === "binding" ? "Voice binding" : "Voice Design", attempt: op.attempt,
      state: op.state, httpStatus: op.receipt?.failure?.httpStatus ?? null, amendmentId: op.amendment_id ?? null }));
    review.canRecover = review.canRecover && history.installed;
    review.canResume = review.canResume && history.installed && isFinalOperator(job.owner_user_id);
    if (["FINAL_SPEECH_TIMING", "FINAL_SPEECH_RETRY_REQUIRED"].includes(records.data.error_code ?? "")) {
      const speech = [...latestOperations(history.operations).values()].find(op => op.kind === "voice" && op.state === "result");
      if (speech && typeof speech.input.startMs === "number" && typeof speech.input.endMs === "number") {
        const timing = finalProviders().voice.timing?.(speech.receipt ?? {});
        review.speechRecovery = { sceneNumber: Number(speech.scene_id?.replace("scene-", "")) || null,
          windowMs: speech.input.endMs - speech.input.startMs, alignmentEndMs: timing?.original?.endsMs.at(-1) ?? null,
          savedResponse: !!speech.receipt?.recovery, maximumAccelerationPercent: 8,
          requiresTtsReview: records.data.error_code === "FINAL_SPEECH_RETRY_REQUIRED", fittingFailure: speech.receipt?.speechFitFailure };
      }
    }
    if (records.data.error_code) {
      const operation = [...latestOperations(history.operations).values()].find(op => op.state === "failed" || op.state !== "ready" && op.receipt?.failure);
      if (operation) review.failure = summarizeOperationFailure(operation);
    }
    if (history.installed && packageRow?.data && records.data.state === "failed" && records.data.error_code === "FINAL_PROVIDER_REJECTED") {
      const doc = validateVideoGenerationPackage(packageRow.data.document, packageRow.data.input, packageRow.data.revision);
      // Only a quote: actual authority remains the immutable configuration plus
      // approved amendments. The full projection below enforces both budgets.
      const plan = finalPreflight(doc, { ...records.data.configuration, maxRequests: 64, maxEstimatedCostMicrousd: 1000000000 }, finalProviders());
      const quoted = retryReview(records.data, doc, history.operations, history.amendments, plan,
        { current: !!current.data && configured?.hash === records.data.configuration_hash, operator: isFinalOperator(job.owner_user_id),
          sharedReservedCredits: await sharedCredits(db, records.data.configuration) });
      if (quoted) review.retry = quoted.review;
    }
  }
  return { available: true, enabled: !!configured, eligible, review,
    authorization: eligible && configured && packageRow?.data ? {
      version: consentVersion(configured.hash, packageRow.data.id, packageRow.data.package_hash!, job.owner_user_id),
      maxRequests: configured.value.maxRequests, maxEstimatedCostMicrousd: configured.value.maxEstimatedCostMicrousd,
      language: configured.value.language } : null };
}
export async function ownedFinalExecution(input: { projectId: string; jobId: string; executionId: string }) {
  const scope = await ownedReferenceReview({ projectId: input.projectId, jobId: input.jobId });
  const found = await scope.db.from("ugc_final_executions").select("*").eq("id", input.executionId)
    .eq("owner_user_id", scope.ownerId).eq("project_id", input.projectId).eq("job_id", input.jobId).maybeSingle();
  if (found.error || !found.data) throw new ReferenceReviewAccessError(404);
  return { ...scope, execution: found.data };
}
export async function finalVideoAction(value: unknown) {
  const command = finalActionSchema.safeParse(value);
  if (!command.success) throw new FinalVideoError("FINAL_INVALID_ACTION", 400);
  const input = command.data;
  const scope = await ownedReferenceReview({ projectId: input.projectId, jobId: input.jobId });
  if (input.action === "retry_stage") {
    assertFinalOperator(scope.ownerId);
    if (!input.executionId || !input.amendmentId || !input.operationId || !input.quoteVersion || !input.operatorApproved || !input.configurationCorrected ||
      !input.reviewedHttpStatus || input.additionalRequests !== 1 || input.additionalCostMicrousd === undefined || !input.reason) throw new FinalVideoError("FINAL_OPERATOR_REVIEW_REQUIRED");
    const found = await ownedFinalExecution({ projectId: input.projectId, jobId: input.jobId, executionId: input.executionId });
    const run = found.execution, history = await executionRecords(scope.db, run);
    if (!history.installed) throw new FinalVideoError("FINAL_RETRY_SETUP_REQUIRED", 503);
    if (finalConfiguration().hash !== run.configuration_hash) throw new FinalVideoError("FINAL_CONFIGURATION_CHANGED");
    assertFinalProviderConfiguration(true); // Presence only; no provider probe.
    const previous = history.amendments.find(a => a.id === input.amendmentId);
    if (previous) {
      if (previous.failed_operation_id !== input.operationId || previous.quote_hash !== input.quoteVersion || previous.additional_cost_microusd !== (input.additionalCostMicrousd ?? 0))
        throw new FinalVideoError("FINAL_AMENDMENT_CONFLICT");
      return readFinalVideo(scope.job);
    }
    const [current, saved] = await Promise.all([
      scope.db.rpc("ugc_final_current", { p_execution: run.id }),
      scope.db.from("ugc_generation_packages").select("*").eq("id", run.package_id).eq("owner_user_id", scope.ownerId).eq("project_id", input.projectId).single(),
    ]);
    if (current.error || !current.data || saved.error || !saved.data) throw new FinalVideoError("FINAL_PACKAGE_CHANGED");
    if (input.version !== run.version) throw new FinalVideoError("FINAL_RETRY_QUOTE_CHANGED");
    const doc = validateVideoGenerationPackage(saved.data.document, saved.data.input, run.package_version);
    const plan = finalPreflight(doc, { ...run.configuration, maxRequests: 64, maxEstimatedCostMicrousd: 1000000000 }, finalProviders());
    const quote = retryReview(run, doc, history.operations, history.amendments, plan,
      { current: true, operator: true, sharedReservedCredits: await sharedCredits(scope.db, run.configuration), additionalCostMicrousd: input.additionalCostMicrousd });
    if (!quote || !quote.review.available) throw new FinalVideoError(quote?.review.blockers[0] ?? "FINAL_RETRY_NOT_ELIGIBLE");
    if (input.reviewedHttpStatus !== quote.review.reviewedHttpStatus || input.reason !== quote.review.reason) throw new FinalVideoError("FINAL_OPERATOR_REVIEW_REQUIRED");
    if (quote.review.operationId !== input.operationId || quote.review.quoteVersion !== input.quoteVersion) throw new FinalVideoError("FINAL_RETRY_QUOTE_CHANGED");
    await verifyPackageMedia(saved.data.input, AbortSignal.timeout(120000));
    const verifiedOutputs = await verifyPreserved(run, history.operations);
    const result = await scope.db.rpc("ugc_final_retry_stage", { p_owner: scope.ownerId, p_execution: run.id, p_payload: {
      amendmentId: input.amendmentId, operationId: input.operationId, version: input.version, quote: quote.databaseQuote, quoteHash: quote.review.quoteVersion,
      operatorApproved: true, configurationCorrected: true, reviewedHttpStatus: quote.review.reviewedHttpStatus, reason: quote.review.reason, additionalRequests: 1, verifiedOutputs,
    } });
    if (result.error) throw new FinalVideoError(result.error.message.match(/\b(?:FINAL_[A-Z0-9_]+|ELEVENLABS_[A-Z0-9_]+|COST_ESTIMATE_UNAVAILABLE)\b/)?.[0] ?? "FINAL_RETRY_UNAVAILABLE");
    if (!result.data?.id) throw new FinalVideoError("FINAL_RETRY_UNAVAILABLE");
    return readFinalVideo(scope.job);
  }
  let payload: Record<string, unknown> = { executionId: input.executionId, version: input.version };
  if (input.action === "generate") {
    if (!input.packageId || !input.requestId || !input.acceptedCost || scope.job.status === "completed") throw new FinalVideoError("FINAL_AUTHORIZATION_REQUIRED");
    const configured = finalConfiguration();
    const saved = await scope.db.from("ugc_generation_packages").select("*").eq("id", input.packageId).eq("job_id", input.jobId)
      .eq("owner_user_id", scope.ownerId).eq("project_id", input.projectId).single();
    if (saved.error || !saved.data || saved.data.state !== "approved" || saved.data.stale_at) throw new FinalVideoError("FINAL_PACKAGE_CHANGED");
    const current = await scope.db.rpc("ugc_package_input", { p_job: input.jobId });
    if (current.error || !isDeepStrictEqual(current.data, saved.data.input)) throw new FinalVideoError("FINAL_PACKAGE_CHANGED");
    const doc = validateVideoGenerationPackage(saved.data.document, saved.data.input, saved.data.revision);
    if (input.authorizationVersion !== consentVersion(configured.hash, saved.data.id, doc.packageHash, scope.ownerId)) throw new FinalVideoError("FINAL_AUTHORIZATION_CHANGED");
    const plan = finalPreflight(doc, configured.value, finalProviders());
    if (plan.diagnostics.length) throw new FinalPreflightError(plan.diagnostics);
    payload = { packageId: saved.data.id, requestId: input.requestId, acceptedCost: true,
      configuration: configured.value, configurationHash: configured.hash, profile: plan.profile };
  } else {
    if (!input.executionId) throw new FinalVideoError("FINAL_INVALID_ACTION", 400);
    const found = await ownedFinalExecution({ projectId: input.projectId, jobId: input.jobId, executionId: input.executionId });
    if (input.action === "approve") {
      if (!found.execution.final_asset || found.execution.state !== "review" && found.execution.state !== "approved") throw new FinalVideoError("FINAL_NOT_READY");
      await readPrivateAsset(found.execution, found.execution.final_asset, AbortSignal.timeout(120_000));
    }
    if (input.action === "recover") {
      if (found.execution.error_code === "FINAL_SPEECH_RETRY_REQUIRED") throw new FinalVideoError("FINAL_SPEECH_RETRY_REQUIRED");
      if (providerRejectionBlocksRecovery(found.execution.error_code)) throw new FinalVideoError("FINAL_SAVED_RECOVERY_CANNOT_RETRY_REJECTED");
      if (!found.execution.dispatch_mode) throw new FinalVideoError("FINAL_RETRY_SETUP_REQUIRED");
      if (finalConfiguration().hash !== found.execution.configuration_hash) throw new FinalVideoError("FINAL_CONFIGURATION_CHANGED");
    }
    if (input.action === "resume") {
      assertFinalOperator(scope.ownerId);
      const run = found.execution;
      if (!input.acceptedCost || run.error_code !== "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST" || finalConfiguration().hash !== run.configuration_hash) throw new FinalVideoError("FINAL_RESUME_NOT_ELIGIBLE");
      const history = await executionRecords(scope.db, run);
      if (!history.installed) throw new FinalVideoError("FINAL_RETRY_SETUP_REQUIRED");
      const saved = await scope.db.from("ugc_generation_packages").select("*").eq("id", run.package_id).eq("owner_user_id", scope.ownerId).single();
      const current = await scope.db.rpc("ugc_final_current", { p_execution: run.id });
      if (saved.error || !saved.data || current.error || !current.data) throw new FinalVideoError("FINAL_PACKAGE_CHANGED");
      const doc = validateVideoGenerationPackage(saved.data.document, saved.data.input, run.package_version), auth = effectiveAuthorization(run, history.amendments);
      const plan = finalPreflight(doc, { ...run.configuration, maxRequests: auth.effectiveRequests, maxEstimatedCostMicrousd: auth.effectiveCostMicrousd }, finalProviders());
      const latest = latestOperations(history.operations);
      const pending = new Set(history.amendments.filter(a => !history.operations.some(op => op.amendment_id === a.id)).map(a => a.failed_operation_id));
      const remaining = plan.breakdown.filter(item => !latest.has(item.operationKey) || pending.has(latest.get(item.operationKey)!.id));
      const total = history.operations.filter(op => op.kind !== "composition").reduce((sum, op) => sum + knownOperationCost(op), 0) + remaining.reduce((sum, item) => sum + (item.estimatedCostMicrousd ?? 0), 0);
      if (plan.issues.length || [...latest.values()].some(op => op.kind !== "composition" && op.state !== "ready" && !pending.has(op.id)) ||
        run.paid_requests + remaining.length > auth.effectiveRequests || total > auth.effectiveCostMicrousd) throw new FinalVideoError("FINAL_RESUME_NOT_ELIGIBLE");
      const allowance = run.configuration.pricing?.elevenLabsIncludedCredits;
      if (allowance && await sharedCredits(scope.db, run.configuration) + remaining.reduce((sum, item) => sum + (item.estimatedCredits ?? 0), 0) > allowance.remainingCredits)
        throw new FinalVideoError("ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED");
      await verifyPackageMedia(saved.data.input, AbortSignal.timeout(120000)); await verifyPreserved(run, history.operations);
      payload = { ...payload, acceptedCost: true };
    }
  }
  const result = await scope.db.rpc("ugc_final_action", { p_owner: scope.ownerId, p_project: input.projectId,
    p_job: input.jobId, p_action: input.action, p_payload: payload });
  if (result.error) throw new FinalVideoError(missing(result.error.code) ? "FINAL_SETUP_REQUIRED" : "FINAL_ACTION_UNAVAILABLE", 503);
  if (!result.data?.id) throw new FinalVideoError("FINAL_CONFLICT");
  return readFinalVideo(scope.job);
}
export function finalErrorMessage(code: string, diagnostics?: readonly CapabilityIssue[]) {
  if (code === "FINAL_SPEECH_RETRY_REQUIRED") return "Saved speech exceeds the safe local fitting limit. A new TTS request requires a separate reviewed stage retry and sufficient request authorization; none was queued.";
  const labelMessage = voiceLabelValidationMessage(code);
  if (labelMessage) return labelMessage;
  if (code === "FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST") return "Saved-work recovery stopped before a new provider request. Review and confirm Resume authorized processing to continue.";
  if (code === "FINAL_OPERATOR_SETUP_REQUIRED") return "This action requires the configured local operator account.";
  if (code === "FINAL_RETRY_SETUP_REQUIRED") return "Apply the manual final-video amendment migration before retry or recovery.";
  if (code === "FINAL_RETRY_QUOTE_CHANGED") return "The retry quote or execution changed. Check status and review the new authorization before confirming.";
  if (code.startsWith("FINAL_RETRY") || code === "FINAL_OPERATOR_REVIEW_REQUIRED") return "The rejected stage is not currently eligible for an approved replacement. Check the retry review and preserved work.";
  if (code === "FINAL_SAVED_RECOVERY_CANNOT_RETRY_REJECTED") return "Saved-work recovery cannot retry a rejected provider request. Existing outputs are preserved; inspect the provider diagnostics before authorizing a replacement.";
  if (diagnostics?.length) return `${diagnostics[0].message} No new generation was queued.`;
  if (code.startsWith("FINAL_CAPABILITY:")) return `This package does not match the configured video/audio profile (${code.slice(17)}). No new generation was queued.`;
  if (code.includes("FUNDING") || code.includes("SETUP")) return "Final video generation needs manual local setup and explicit funding authorization.";
  if (code.includes("AUTHORIZATION")) return "The generation budget changed. Check status before confirming the current authorization.";
  if (code.includes("PACKAGE")) return "The approved package changed. Rebuild and approve a current package before generating.";
  return "Final video action stopped safely. Check status; existing generated work is preserved.";
}
