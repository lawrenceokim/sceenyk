import "server-only";
import { generationAccess, readGenerationAccess } from "@/lib/accounting/generation-policy-server";
import { assertFreeVideoSettings } from "@/lib/accounting/generation-policy";
import { projectVideoResolution } from "@/lib/projects/video-resolution";
import { calculateManualEstimate, getEstimatedRate, suggestedAuthorizationMicrousd } from "./pricing/higgsfield-pricing";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { requireClerkUser } from "@/lib/auth/require-user";
import { createDatabaseClient } from "@/lib/db/server";
import { planningInputSchema, directorStoryboardSchema, type PlanningInput } from "./contract";
import { CLIP_PROMPT_COMPILER_VERSION } from "./compiler";
import { mergeManifest, mergedArtifactCurrent } from "./merge-runtime";
import { v3DatabaseFailure } from "./database-errors";
import { mergeStorageOperation } from "./merge-storage";
import { ServiceOperationError } from "@/lib/diagnostics/service-failure";
import { packageClips, clipAuthority, clipSpending, clipAttemptBinding } from "./clip-runtime";
import { STORYBOARD_DIRECTOR_VERSION, STORYBOARD_PROMPT_COMPILER_VERSION } from "./storyboard-director";
import { HIGGSFIELD_V3_PROFILE } from "./adapters/higgsfield";
import { readPrivate, signPrivate, readSpool } from "./runtime-media";
import { packageContentHash, storyboardContentHash, v3Digest } from "./identity";
import { readFrozenPackage } from "./package";
import { createPaidIntent, createRuntimeAuthorization } from "./execution-package";
import { V3Store, type RuntimeWorkspace } from "./runtime-store";
import { assertV3Access, assertV3Transport, v3UserAllowed, v3TransportConfig, v3OpenAIConfig, v3ReferenceConfig } from "./runtime-config";
import { prepareVideoDelivery } from "./video-delivery";
import { outputHostname } from "./adapters/higgsfield-transport";
import { refreshQueuedVideoDelivery } from "./refresh-video-delivery";
import { privateAssetSchema, privateBindingSchema, qualitySchema, type Run, type PrivateAsset } from "./runtime-contract";
import { enrolledV3 } from "./enrollment";
import { generationContext, artifactCurrent, latestArtifact, referenceSubjectSchema, referenceDeletedVersion, characterSubject, originalCharacters, requiredReferenceArtifacts, characterCast, usesCharacterSlots } from "./generation-context";
import { CAST_PROMPT_COMPILER_VERSION } from "./character-cast";
export { latestArtifact } from "./generation-context";
import { creativeTaskCurrent, taskBlocksGeneration } from "./reference-tasks";
import { referenceSheetPromptSnapshot, referenceSourceSchema } from "./reference-sheet-prompt";
import { permanentlyDeleteReference } from "./reference-deletion";
import { referenceDiagnostics } from "./reference-diagnostics";
import { projectBrief, creativeBriefHash, referenceOriginals, approvedArtifacts } from "./creative-inputs";
export { projectBrief, creativeBriefHash, referenceOriginals, approvedArtifacts, validityEvidence } from "./creative-inputs";
import { enqueueLocation, isLocationDirectorTask, locationTaskStatus, resumeLocation, locationDocument } from "./location-runtime";
import { discardReference, discardableReferences } from "./reference-retention";
import { packageBuildDetailsSchema } from "./package-status";
import { currentDisplayPricing } from "./pricing/display-pricing";
import { CONNECTED_STORY_DIRECTOR_VERSION, planStoryClips, validateConnectedStory } from "./connected-story";
import { requiresProDuration } from "@/lib/projects/pro-duration";

export { inspectRuntime } from "./runtime-inspection";
import { inspectRuntime, runtimeInspectionReads } from "./runtime-inspection";
import { finalActionUser } from "./final-operation-server";
import { creativeLockSummary, lockDocument, lockedArtifactCurrent, lockedOriginals } from "./creative-lock";
import { creativeMutationActions, lockedBriefSchema } from "./creative-lock-contract";
function videoStage(output: unknown): { stage: string } | null {
  const parsed = z.object({ stage: z.string().regex(/^(V3_FINAL_VIDEO_(JOB_CLAIMED|SAVING|SAVED|READY_FOR_REVIEW)|HIGGSFIELD_(SUBMITTING|REQUEST_ACCEPTED|PROCESSING|RESULT_RECEIVED))$/) }).safeParse(output);
  return parsed.success ? parsed.data : null;
}
export async function runtimeDto(w: RuntimeWorkspace) {
  const [liveBrief, liveOriginals] = await Promise.all([projectBrief(w.project.owner_user_id, w.project.project_id), referenceOriginals(w.project.owner_user_id, w.project.project_id)]);
  const savedBrief = lockedBriefSchema.safeParse(lockDocument(w)?.brief);
  const brief = savedBrief.success ? savedBrief.data as typeof liveBrief : liveBrief, originals = lockedOriginals(w, liveOriginals);
  const creativeLock = creativeLockSummary(w);
  const inspection = runtimeInspectionReads(brief, originals);
  let preflight = null; try { preflight = await inspectRuntime(w, undefined, inspection); } catch (error) { if (error instanceof ServiceOperationError) throw error; /* Stale/partial creative inputs preserve previous previews. */ }
  const displayPricing = (packageId: string) => {
    const saved = w.packages.find(p => p.id === packageId);
    if (saved && creativeLock?.packageId === packageId) { const doc = readFrozenPackage(saved.document); return {
      totalMicrousd: doc.pricing.totalMicrousd!, segments: doc.segments.map(s => ({ id: s.id, estimatedCostMicrousd: s.estimate.estimatedCostMicrousd! })) }; }
    return saved ? currentDisplayPricing(readFrozenPackage(saved.document)) : null;
  };
  const preflightPricing = preflight ? displayPricing(preflight.packageId) : null;
  const previewUrl = async (asset: PrivateAsset) => { try { return (await signPrivate(asset)).url; } catch { return null; } };
  const scopedCharacters = usesCharacterSlots(w) || !!originals.characters;
  const active = (a: RuntimeWorkspace["artifacts"][number]) => creativeLock ? creativeLock.referenceIds.includes(a.id) : (!scopedCharacters || a.kind !== "character" || originalCharacters(originals).some(c => c.id === characterSubject(a))) && latestArtifact(w, a.kind, scopedCharacters && a.kind === "character" ? characterSubject(a) : undefined)?.id === a.id;
  const visible=w.artifacts.filter(a=>!["character","product","location"].includes(a.kind)||a.approved_at||!a.rejected_at&&active(a));
  const artifacts = await Promise.all(visible.map(async a => ({ id: a.id, kind: a.kind, version: a.version, activeSlot: active(a),
    ...(a.kind === "character" ? { characterId: characterSubject(a) } : {}),
    ...(w.referenceDeletions.some(d=>d.id===a.id&&d.state==="prepared")?{cleanupPending:true,cleanupMode:w.referenceDeletions.find(d=>d.id===a.id)?.mode}:{}),
    current: lockedArtifactCurrent(w, a) ?? (artifactCurrent(a, w.artifacts, generationContext(brief), originals, creativeBriefHash(brief), w.referenceDeletions) &&
      (a.kind !== "location" || !isLocationDirectorTask({ kind: "location", input: (a.document.input ?? {}) as Record<string,unknown> }) ||
        (a.document.input as Record<string,unknown>).briefHash === creativeBriefHash(brief) && v3Digest("location-names",(a.document.input as Record<string,unknown>).names) === v3Digest("location-names",originals.names) ||
        !!a.approved_at && await inspection.rpc("ugc_v3_location_input_current", { p_project: w.project.project_id, d: a.document.input }) === true)),
    location: a.kind === "location" ? locationDocument(a) : null,
    approved: !!a.approved_at, rejected: !!a.rejected_at, storyboard: a.kind === "storyboard" ? directorStoryboardSchema.parse(a.document.storyboard) : null,
    preview: a.document.asset && !w.referenceDeletions.some(d=>d.id===a.id&&d.state==="prepared") && (!a.rejected_at || ["character", "product", "location"].includes(a.kind)) ? await previewUrl(privateAssetSchema.parse(a.document.asset)) : null })));
  const runs = await Promise.all(w.runs.map(async r => {
    const doc = w.packages.find(p => p.id === r.package_id);
    const frozen = doc ? readFrozenPackage(doc.document) : null;
    const segment = frozen?.segments.find(s => s.id === r.intent.segmentId);
    const scenes = frozen?.source.storyboardContent.scenes.filter(s => !segment || s.startMs >= segment.startMs && s.endMs <= segment.endMs) ?? [];
    return ({ id: r.id, packageId: r.package_id, segmentId: r.intent.segmentId, state: r.state,
    provider: r.intent.provider, model: r.intent.model, resolution: r.intent.authorization.resolution, aspectRatio: String(r.intent.body.aspect_ratio),
    ...(r.result ? { actualDimensions: { width: r.result.width, height: r.result.height } } : {}),
    estimatedCostMicrousd: r.intent.estimatedCostMicrousd, actualCostMicrousd: r.observation?.actualCostMicrousd ?? null,
    displayEstimatedCostMicrousd: displayPricing(r.package_id)?.segments.find(s => s.id === r.intent.segmentId)?.estimatedCostMicrousd ?? r.intent.estimatedCostMicrousd,
    stage: videoStage(w.tasks.find(t => t.kind === "video" && t.input.runId === r.id)?.output),
    hasKnownRequest: !!r.observation,
    submissionBlocker: r.state === "queued" ? (Date.parse(r.intent.deliveryExpiresAt) <= Date.now() ? "V3_REFERENCE_DELIVERY_EXPIRED" :
      w.tasks.find(t => t.kind === "video" && t.input.runId === r.id)?.error_code ?? (!v3TransportConfig().enabled ? "PAID_V3_EXECUTION_DISABLED" : null)) : null,
    outputHostname: r.error_code === "OUTPUT_HOST_APPROVAL_REQUIRED" ? outputHostname(r.observation?.resultUrl ?? null) : null,
    current: r.current, completedAt: r.completed_at, errorCode: r.error_code, quality: r.quality, actualDurationMs: r.result?.durationMs ?? null, hasAudio: r.result?.hasAudio ?? null,
    preview: r.result && ["awaiting_review", "approved"].includes(r.state) ? await previewUrl(r.result) : null,
    expectedDialogue: scenes.flatMap(s => s.speech),
    shotTimings: scenes.map(s => ({ number: s.number, startMs: s.startMs, endMs: s.endMs })),
  }); }));
  const joined = await Promise.all(w.artifacts.filter(a => a.kind === "joined").map(async a => {
    const doc = readFrozenPackage(w.packages.find(p => p.id === a.document.packageId)?.document), asset = privateAssetSchema.parse(a.document.asset);
    const deletion = w.tasks.find(t => t.kind === "delete" && t.input.artifactId === a.id);
    const state: Run["state"] = a.approved_at ? "approved" : a.rejected_at ? deletion?.status === "done" ? "deleted" : "deleting" : "awaiting_review";
    return { id: a.id, packageId: doc.id, segmentId: "joined", state, completedAt: a.approved_at,
      provider: "higgsfield", model: "multiple segments", resolution: doc.source.resolution, aspectRatio: doc.source.storyboardContent.aspectRatio,
      ...(asset ? { actualDimensions: { width: asset.width, height: asset.height } } : {}),
      estimatedCostMicrousd: doc.pricing.totalMicrousd, actualCostMicrousd: null, stage: null, outputHostname: null, submissionBlocker: null, hasKnownRequest: false,
      displayEstimatedCostMicrousd: creativeLock?.packageId === doc.id ? doc.pricing.totalMicrousd : currentDisplayPricing(doc).totalMicrousd,
      current: packageClips(doc) ? mergedArtifactCurrent(w, doc, a) : !!w.source?.current && w.source.revision === doc.sourceRevision && w.runs.filter(r => r.package_id === doc.id).every(r => r.current),
      errorCode: deletion?.error_code ?? null, quality: null, actualDurationMs: asset.durationMs, hasAudio: asset.hasAudio,
      preview: !a.rejected_at ? await previewUrl(asset) : null, expectedDialogue: doc.source.storyboardContent.scenes.flatMap(s => s.speech),
      shotTimings: doc.source.storyboardContent.scenes.map(s => ({ number: s.number, startMs: s.startMs, endMs: s.endMs })) };
  }));
  const complete = !!preflight && (preflight.segmentCount === 1 ? runs : joined).some(r => r.packageId === preflight.packageId && r.current && r.state === "approved" && !!r.completedAt);
  const context = generationContext(brief), briefHash = creativeBriefHash(brief);
  const tasks = await Promise.all(w.tasks.map(async (t, index) => {
    let packageBuild = null;
    if (t.kind === "package") {
      const saved = packageBuildDetailsSchema.safeParse((t.output as { packageBuild?: unknown } | null)?.packageBuild);
      packageBuild = saved.success ? saved.data : { stage: "validation" as const, code: t.error_code, httpStatus: null,
        packageId: String(t.input.packageId), segmentId: null, estimateStatus: "not_requested" as const, recoverable: false };
      const bindings = Object.values(w.source?.private_bindings ?? {});
      if (t.status === "queued") packageBuild.code = null;
      if (!saved.success && t.error_code === "V3_TASK_FAILED" && w.source?.revision === t.input.sourceRevision && !w.packages.some(p => p.id === t.input.packageId) &&
        bindings.length && bindings.every(b => privateBindingSchema.safeParse(b).success) && bindings.some(b => !privateAssetSchema.safeParse(b).success)) {
        packageBuild.stage = "delivery"; packageBuild.code = "V3_PACKAGE_LEGACY_BINDING_PARSER_FAILED";
      }
      if (t.status === "done" && w.packages.at(-1)?.id === t.input.packageId && (!preflight || preflight.currentness === "stale")) packageBuild.code = "PACKAGE_STALE";
      else if (t.status === "done" && preflight && preflight.packageId === t.input.packageId && preflight.estimateExpiresAt && Date.parse(preflight.estimateExpiresAt) <= Date.now()) {
        packageBuild.code = "COST_ESTIMATE_UNAVAILABLE"; packageBuild.estimateStatus = "unavailable";
      }
      // Recovery means a valid complete saved envelope exists, never just a failed task row.
      if (["failed", "reconciliation_required"].includes(t.status)) {
        try { const bytes = await readSpool(t.id, "package-local-pricing.json") ?? await readSpool(t.id, "package.json");
          if (bytes) { const envelope = JSON.parse(bytes.toString("utf8")); readFrozenPackage(envelope.document);
            packageBuild.recoverable = envelope.quote?.pricingSource === "manual_provider_estimate" || !envelope.quote || !!envelope.quote.expiresAt && Date.parse(envelope.quote.expiresAt) > Date.now(); }
          else packageBuild.recoverable = w.packages.some(p => p.id === t.input.packageId);
        } catch { packageBuild.recoverable = false; }
      }
    }
    const cleanupCompleted = !!t.input.referenceCleanup && w.referenceDeletions.some(d => d.id === (t.input.referenceCleanup as { id: string }).id && d.state === "completed");
    const current = creativeTaskCurrent(t, context, briefHash, originals) && (!isLocationDirectorTask(t) || v3Digest("location-names",t.input.names)===v3Digest("location-names",originals.names) &&
      JSON.stringify(t.input.references) === JSON.stringify(requiredReferenceArtifacts(w,originals).filter(a=>a?.approved_at&&!a.rejected_at&&artifactCurrent(a,w.artifacts,context,originals,briefHash,w.referenceDeletions)).map(a=>a!.id)));
    const location = isLocationDirectorTask(t) ? await locationTaskStatus(t, current) : null;
    const diagnostics = !location && ["character", "product", "location"].includes(t.kind) && ["failed", "reconciliation_required"].includes(t.status) && !t.input.referenceCleanupHold
      && t.error_code !== "V3_REFERENCE_REQUEST_SUPERSEDED" && !w.tasks.slice(index + 1).some(n => n.kind === t.kind && (t.kind !== "character" || n.input.originalId === t.input.originalId))
      ? await referenceDiagnostics(t, current, w.referenceDiagnostics.find(d => d.taskId === t.id)) : null;
    return { id: t.id, kind: t.kind, status: cleanupCompleted ? "done" : t.input.referenceCleanupHold ? "cleanup_pending" : t.status, errorCode: cleanupCompleted ? null : t.error_code, providerStarted: t.provider_started,
      packageBuild, ...(t.kind === "join" ? { mergeStage: (t.output as { mergeStage?: string } | null)?.mergeStage ?? null } : {}), ...(t.kind === "character" ? { characterId: typeof t.input.originalId === "string" ? t.input.originalId : undefined } : {}),
      ...(t.input.referenceCleanup?{referenceCleanup:true}:{}),
      current, createdAt: t.created_at, leaseUntil: t.lease_until, diagnostics, location, recoveryAvailable: location?.recoveryAvailable ?? diagnostics?.recoveryAvailable ?? false,
      canStartNew: location?.canGenerate ?? diagnostics?.canStartNew ?? false };
  }));
  const clipDoc = w.packages.at(-1) ? readFrozenPackage(w.packages.at(-1)!.document) : null;
  const planned = clipDoc && packageClips(clipDoc);
  const clipPlans = planned && clipDoc ? await Promise.all(planned.map(async clip => {
    const attempts = w.runs.filter(r => r.package_id === clipDoc.id && r.intent.segmentId === clip.segmentId), run = attempts.at(-1);
    let report = null; try { report = await inspectRuntime(w, clip.segmentId, inspection); } catch (error) { if (error instanceof ServiceOperationError) throw error; /* Preserve saved clips when creative prerequisites become stale. */ }
    let retryableFailure = false;
    if (run?.state === "failed") { try { retryableFailure = await new V3Store().rpc("ugc_v3_clip_retryable", { p_owner: w.project.owner_user_id, p_project: w.project.project_id, p_run: run.id }) === true; } catch (error) { if (error instanceof ServiceOperationError && error.code !== "V3_CLIP_SETUP_REQUIRED") throw error; /* Setup may still be pending. */ } }
    const needsContinuityReview = !!run && planned.slice(0, clip.number - 1).some(prior => {
      const priorAttempts = w.runs.filter(r => r.package_id === clipDoc.id && r.intent.segmentId === prior.segmentId);
      return priorAttempts.length > 1 && Date.parse(priorAttempts.at(-1)!.intent.createdAt) > Date.parse(run.intent.createdAt);
    });
    return { ...clip, runId: run?.id ?? null, attempts: attempts.length, needsContinuityReview,
      estimatedCostMicrousd: clipDoc.segments.find(s => s.id === clip.segmentId)!.estimate.estimatedCostMicrousd,
      suggestedMaximumMicrousd: suggestedAuthorizationMicrousd(clipDoc.segments.find(s => s.id === clip.segmentId)!.estimate.estimatedCostMicrousd ?? 0),
      authorized: !!clipAuthority(w, clipDoc, clip.segmentId), canGenerate: !!report?.canSubmit,
      blockers: report?.issues ?? ["V3_PREFLIGHT_REQUIRED"],
      canRegenerate: !!run && (run.state === "deleted" || retryableFailure),
      canRenewAuthorization: !run && w.runtimeAuthorizations.some(a => a.document.packageId === clipDoc.id && a.document.segmentId === clip.segmentId) && !clipAuthority(w, clipDoc, clip.segmentId) };
  })) : null;
  let manifestHash: string | null = null;
  if (clipDoc && planned) { try { manifestHash = mergeManifest(clipDoc, w.runs).hash; } catch { /* Remaining clips need approval. */ } }
  const mergeTask = manifestHash ? w.tasks.filter(t => t.kind === "join" && t.input.manifestHash === manifestHash).at(-1) : null;
  const mergedRun = mergeTask ? joined.find(r => r.id === mergeTask.id) : null;
  const merge = planned ? { manifestHash,
    canMerge: !!manifestHash && preflight?.currentness === "current" && w.project.studio_mode === "pro",
    taskId: mergeTask?.id ?? null, status: mergeTask?.status ?? null,
    stage: typeof (mergeTask?.output as { mergeStage?: unknown } | null)?.mergeStage === "string" ? (mergeTask!.output as { mergeStage: string }).mergeStage : null,
    errorCode: mergeTask?.error_code ?? null, resultId: mergedRun?.id ?? null,
    outdated: joined.some(r => r.packageId === clipDoc?.id && !r.current && r.state !== "deleted"),
    deleting: mergedRun?.state === "deleting", deleted: mergedRun?.state === "deleted" } : null;
  const multiClip = clipDoc && clipPlans ? { packageId: clipDoc.id, packageHash: clipDoc.hash,
    ...clipSpending(w, clipDoc), clips: clipPlans, ...(merge ? { merge } : {}),
    readyForMerging: !!manifestHash && preflight?.currentness === "current" && clipPlans.every(c => runs.some(r => r.id === c.runId && r.current && r.state === "approved")) } : null;
  const referenceModel = "bytedance/seedance-2.5/reference-to-video";
  // Send only a read-only fallback amount; rates, hashing and authorization stay server-only.
  const approximateVideoCostMicrousd = getEstimatedRate("higgsfield", referenceModel, "reference-to-video", "480p")
    ? calculateManualEstimate("higgsfield", referenceModel, "reference-to-video", 5000, "480p").estimatedCostMicrousd : null;
  return { generationPolicy: { ...await readGenerationAccess(w.project.owner_user_id), approximateVideoCostMicrousd, settingsSupported: Number(brief.duration) === 5 && projectVideoResolution(brief.video_resolution) === "480p" }, projectId: w.project.project_id, packageStale: w.packages.length > 0 && !preflight, artifacts, runs: [...runs, ...joined],
    ...(creativeLock ? { creativeLock } : {}),
    multiClip,
    ...(requiresProDuration(brief.duration) && w.project.studio_mode !== "pro" ? { proDurationRetained: true as const } : {}),
    ...(originals.characters ? { characterIds: originals.characters.map(c => c.id) } : {}),
    ...(projectVideoResolution(brief.video_resolution) !== "480p" ? { selectedResolution: projectVideoResolution(brief.video_resolution),
      resolutionPricingAvailable: !!getEstimatedRate("higgsfield", "bytedance/seedance-2.5/reference-to-video", "reference-to-video", projectVideoResolution(brief.video_resolution)) } : {}),
    preflight: preflight ? { ...preflight, displayEstimatedCostMicrousd: preflightPricing?.totalMicrousd ?? preflight.estimatedCostMicrousd,
      segments: preflight.segments.map(s => ({ ...s, displayEstimatedCostMicrousd: preflightPricing?.segments.find(d => d.id === s.id)?.estimatedCostMicrousd ?? s.estimatedCostMicrousd })) } : null, complete,
    referenceCleanup:{enabled:w.referenceCleanupPolicy,pendingCount:discardableReferences(w).length,
      ...(w.tasks.some(t=>t.input.referenceCleanup&&["queued","running"].includes(t.status))?{processing:true}:{})},
    tasks,
    processing: w.tasks.some((t, i) => t.input.referenceCleanup||t.input.referenceCleanupHold ? false : ["character", "product", "location", "storyboard"].includes(t.kind) ? ["queued", "running"].includes(t.status) && taskBlocksGeneration(t, tasks[i].current) : t.status === "running" || t.status === "queued" && !["PAID_V3_EXECUTION_DISABLED", "V3_ACTIVATION_SCOPE_MISMATCH", "V3_REFERENCE_DELIVERY_EXPIRED"].includes(t.error_code ?? "")), localEnabled: v3UserAllowed(w.project.owner_user_id) };
}
export type RuntimeDto = Omit<Awaited<ReturnType<typeof runtimeDto>>, "generationPolicy"> & {
  generationPolicy?: Awaited<ReturnType<typeof runtimeDto>>["generationPolicy"];
};
export async function readOwnedV3(project: string) {
  const { userId } = await requireClerkUser(), db = createDatabaseClient();
  const user = await db.from("app_users").select("id").eq("clerk_user_id", userId).maybeSingle();
  if (user.error) v3DatabaseFailure(user.error, "read_account", user.status);
  if (!user.data) throw new Error("V3_ACCOUNT_UNAVAILABLE");
  return runtimeDto(await new V3Store().read(user.data.id, z.uuid().parse(project)));
}
export async function isOwnedV3Project(project: string) {
  const { userId } = await requireClerkUser(), db = createDatabaseClient();
  const user = await db.from("app_users").select("id").eq("clerk_user_id", userId).maybeSingle();
  if (user.error) v3DatabaseFailure(user.error, "read_account", user.status);
  if (!user.data) throw new Error("V3_ACCOUNT_UNAVAILABLE");
  return enrolledV3(user.data.id, project);
}
const actionSchema = z.object({ action: z.enum(["reference", "cleanup_references", "discard_reference", "location_continue", "review_artifact", "storyboard", "build_package", "authorize", "authorize_clip", "merge", "generate", "generate_clip", "refresh_video_delivery", "recover", "recover_task", "approve", "reject_delete"]), projectId: z.uuid() }).passthrough();
export type V3ActionReceipt = { accepted: true; action: string; id: string };
export function ownedV3Action(raw: unknown): Promise<RuntimeDto>;
export function ownedV3Action(raw: unknown, acknowledge: true): Promise<RuntimeDto | V3ActionReceipt>;
export async function ownedV3Action(raw: unknown, acknowledge = false): Promise<RuntimeDto | V3ActionReceipt> {
  const a = actionSchema.parse(raw);
  const finalRequest = acknowledge && ["merge", "approve", "reject_delete", "recover"].includes(a.action);
  const user = finalRequest ? await finalActionUser() : await ensureAppUser(); assertV3Access(user.id);
  const store = new V3Store(), signal = AbortSignal.timeout(120_000), now = new Date().toISOString();
  const w = await store.read(user.id, a.projectId), liveBrief = await projectBrief(user.id, a.projectId), liveOriginals = await referenceOriginals(user.id, a.projectId);
  const savedBrief = lockedBriefSchema.safeParse(lockDocument(w)?.brief);
  const brief = savedBrief.success ? savedBrief.data as typeof liveBrief : liveBrief, originals = lockedOriginals(w, liveOriginals);
  const creativeLock = creativeLockSummary(w);
  if (["reference", "storyboard", "build_package", "authorize", "authorize_clip", "generate", "generate_clip"].includes(a.action)) {
    const existing = ["generate", "generate_clip"].includes(a.action) && w.runs.some(r => r.package_id === a.packageId && (!a.segmentId || r.intent.segmentId === a.segmentId) && !["deleted", "failed"].includes(r.state));
    if (existing) return runtimeDto(w);
    assertFreeVideoSettings(brief.duration, projectVideoResolution(brief.video_resolution));
    const access = await generationAccess(user.id);
    if (access.remaining < 1) throw new Error("FREE_ALLOWANCE_EXHAUSTED");
    const preparation = a.action === "reference" ? a.kind : a.action === "storyboard" ? "storyboard" : null;
    if (typeof preparation === "string" && preparation in access.preparationRemaining &&
      access.preparationRemaining[preparation as keyof typeof access.preparationRemaining] < 1) throw new Error("FREE_PREPARATION_LIMIT");
  }
  if (creativeLock && (creativeMutationActions.has(a.action) || a.action === "recover_task" && w.tasks.some(t => t.id === a.id && ["character", "product", "location", "storyboard", "package"].includes(t.kind))))
    throw new Error("V3_CREATIVE_INPUTS_LOCKED");
  const context = generationContext(brief);
  if (context.creationType !== "ugc") throw new Error("SELECT_UGC_CREATION_TYPE");
  if (requiresProDuration(brief.duration) && w.project.studio_mode !== "pro" && ["storyboard", "build_package", "authorize", "authorize_clip", "generate", "generate_clip"].includes(a.action)) throw new Error("V3_PRO_DURATION_REQUIRED");
  if (originals.characters && ["reference", "storyboard", "build_package", "authorize", "authorize_clip", "generate", "generate_clip"].includes(a.action) && w.project.studio_mode !== "pro")
    throw new Error("V3_PRO_CHARACTERS_RETAINED");
  if (a.action === "reference" && a.kind === "location") {
    const pending=w.tasks.filter(t=>t.kind==="location").at(-1);
    if(pending&&["queued","running"].includes(pending.status))return runtimeDto(w);
    const candidate=latestArtifact(w,"location");
    if(candidate&&!candidate.approved_at){
      if(a.expectedId!==candidate.id||a.expectedVersion!==candidate.version){
        if(w.referenceDeletions.some(d=>d.id===a.expectedId&&d.state==="completed"))return runtimeDto(w);
        throw new Error("V3_REFERENCE_CHANGED_RECONFIRM");
      }
      await discardReference(store,user.id,a.projectId,{id:candidate.id,version:candidate.version},signal,true);
    }
    await enqueueLocation(store,await store.read(user.id,a.projectId)); return runtimeDto(await store.read(user.id, a.projectId));
  }
  if(a.action==="cleanup_references"){
    await store.rpc("ugc_v3_reconcile_reference_cleanup", { p_owner: user.id, p_project: a.projectId });
    await store.rpc("ugc_v3_queue_reference_cleanup",{p_owner:user.id,p_project:a.projectId,p_retry:true});return runtimeDto(await store.read(user.id,a.projectId));
  }
  const rejected=w.artifacts.find(r=>r.id===a.id);
  if(a.action==="discard_reference"||a.action==="review_artifact"&&a.decision==="reject"&&(a.kind==="location"||rejected?.kind==="location")){
    await discardReference(store,user.id,a.projectId,{id:z.uuid().parse(a.id),version:z.number().int().positive().parse(a.expectedVersion)},signal,true);
    return runtimeDto(await store.read(user.id,a.projectId));
  }
  if (a.action === "location_continue" || a.action === "recover_task" && w.tasks.some(t => t.id === a.id && isLocationDirectorTask(t))) {
    await resumeLocation(store, w, z.uuid().parse(a.id), a.action === "recover_task"); return runtimeDto(await store.read(user.id, a.projectId));
  }
  const enqueue = (kind: string, input: Record<string, unknown>, key = v3Digest("task-input", input)) => store.action(user.id, a.projectId, "enqueue", {
    kind, input, requestKey: `${kind}:${key}` });
  if (a.action === "reference") {
    const kind = z.enum(["character", "product", "location"]).parse(a.kind);
    const assetId = kind === "location" ? null : z.uuid().parse(a.assetId);
    const character = kind === "character" ? originalCharacters(originals).find(c => c.id === assetId) : undefined;
    const scopedCharacter = kind === "character" && (usesCharacterSlots(w) || !!originals.characters);
    if (kind === "character" && !character) throw new Error("CURRENT_STUDIO_REFERENCE_REQUIRED");
    if (scopedCharacter && !character!.name.trim()) throw new Error("V3_CHARACTER_NAME_REQUIRED");
    const previous = latestArtifact(w, kind, scopedCharacter ? assetId! : undefined);
    if (kind === "location" && previous && !previous.rejected_at && !previous.approved_at && artifactCurrent(previous, w.artifacts, context, originals, creativeBriefHash(brief), w.referenceDeletions)) throw new Error("REVIEW_EXISTING_REFERENCE_FIRST");
    const refs = kind === "location" ? [latestArtifact(w, "character"), ...(originals.product ? [latestArtifact(w, "product")] : [])] : [];
    if (refs.some(ref => !ref?.approved_at || !artifactCurrent(ref, w.artifacts, context, originals, creativeBriefHash(brief), w.referenceDeletions))) throw new Error("APPROVE_CURRENT_REFERENCES_FIRST");
    if (kind !== "location" && (kind === "character" ? !character : assetId !== originals.product)) throw new Error("CURRENT_STUDIO_REFERENCE_REQUIRED");
    const openai = v3ReferenceConfig();
    const prior = w.tasks.filter(t => t.kind === kind && (!scopedCharacter || t.input.originalId === assetId)).at(-1);
    const replacingUnusable = !!prior?.provider_started && ["failed", "reconciliation_required"].includes(prior.status) && kind !== "location";
    if (replacingUnusable) {
      const diagnostics = await referenceDiagnostics(prior!, creativeTaskCurrent(prior!, context, creativeBriefHash(brief), originals));
      if (diagnostics.recoveryAvailable) throw new Error("V3_REFERENCE_RECOVER_SAVED_OUTPUT_FIRST");
      if (!diagnostics.canStartNew || a.confirmNewRequest !== true || a.failedTaskId !== prior!.id) throw new Error("V3_REFERENCE_NEW_REQUEST_CONFIRMATION_REQUIRED");
    } else if (prior?.provider_started && ["failed", "reconciliation_required"].includes(prior.status)) throw new Error("V3_REFERENCE_OUTCOME_REQUIRES_REVIEW");
    if (prior && !replacingUnusable && !prior.input.referenceCleanupHold && taskBlocksGeneration(prior, creativeTaskCurrent(prior, context, creativeBriefHash(brief), originals))) return runtimeDto(w);
    if (kind !== "location" && previous && a.confirmedDeletion !== true) throw new Error("V3_REFERENCE_CONFIRMATION_REQUIRED");
    if (prior && !prior.input.referenceCleanupHold && ["queued", "running"].includes(prior.status)) {
      // SQL locks/rechecks stale, unstarted work. Never cancels a paid/unknown outcome.
      await store.rpc("ugc_v3_retire_reference_task", { p_owner: user.id, p_project: a.projectId, p_task: prior.id });
    }
    const subject = kind === "location" ? undefined : referenceSubjectSchema.parse({ role: kind, originalId: assetId, name: character?.name ?? originals.names?.[kind] ?? "" });
    let sheetInput = {};
    if (kind !== "location" && subject) {
      const source = await createDatabaseClient().from("project_assets").select("id,verified_etag,size_bytes,mime_type")
        .eq("id", subject.originalId).eq("project_id", a.projectId).eq("owner_user_id", user.id)
        .eq("upload_status", "uploaded").eq("removed_from_draft", false).maybeSingle();
      if (source.error || !source.data) throw new Error("FRESH_PRIVATE_ORIGINAL_REQUIRED");
      sheetInput = { referenceEpoch: referenceDeletedVersion(w.referenceDeletions, kind, kind === "character" ? assetId! : undefined), referencePrompt: referenceSheetPromptSnapshot(kind, context, subject),
        referenceSource: referenceSourceSchema.parse({ id: source.data.id, etag: source.data.verified_etag,
          sizeBytes: source.data.size_bytes, mimeType: source.data.mime_type }) };
    }
    const input = { provider: "openai", profile: HIGGSFIELD_V3_PROFILE,
      ...(scopedCharacter ? { characterSlot: assetId } : {}),
      ...sheetInput,
      ...(subject ? { referenceSubject: subject } : {}),
      ...(prior && (!prior.provider_started || replacingUnusable) ? { previousTask: prior.id } : {}), brief, briefHash: creativeBriefHash(brief), generationContext: context, model: openai.imageModel, originalId: assetId,
      references: refs.map(r => r!.id),
      previous: a.confirmedDeletion === true ? z.uuid().parse(a.expectedId) : previous?.id ?? null };
    if (replacingUnusable) {
      const proceed = await store.rpc("ugc_v3_replace_unusable_reference_task", { p_owner: user.id, p_project: a.projectId, p_task: prior!.id,
        p_payload: { kind, input, requestKey: `${kind}:${v3Digest("task-input", input)}`, enqueue: a.confirmedDeletion !== true } });
      if (!proceed || a.confirmedDeletion !== true) return runtimeDto(await store.read(user.id, a.projectId));
    }
    if (kind === "location") await enqueue(kind, input);
    else if (a.confirmedDeletion === true) await permanentlyDeleteReference(store, user.id, a.projectId,
      { kind, id: z.uuid().parse(a.expectedId), version: z.number().int().positive().parse(a.expectedVersion) }, "regenerate", input, signal);
    else await store.rpc("ugc_v3_regenerate_reference", { p_owner: user.id, p_project: a.projectId,
      p_payload: { kind, input, requestKey: `${kind}:${v3Digest("task-input", input)}` } });
  } else if (a.action === "review_artifact") {
    const artifact = w.artifacts.find(r => r.id === a.id);
    if (a.decision === "reject" && (a.kind === "character" || a.kind === "product" || artifact?.kind === "character" || artifact?.kind === "product")) {
      const kind = z.enum(["character", "product"]).parse(artifact?.kind ?? a.kind);
      await permanentlyDeleteReference(store, user.id, a.projectId, { kind, id: z.uuid().parse(a.id),
        version: z.number().int().positive().parse(a.expectedVersion) }, "reject", null, signal);
      return runtimeDto(await store.read(user.id, a.projectId));
    }
    if (a.decision === "approve" && (!artifact || !artifactCurrent(artifact, w.artifacts, context, originals, creativeBriefHash(brief), w.referenceDeletions))) throw new Error("REFERENCE_STALE_REGENERATE");
    if (a.decision === "approve" && artifact?.kind === "storyboard" && Number(brief.duration) > 30) {
      if (w.project.studio_mode !== "pro") throw new Error("V3_PRO_DURATION_REQUIRED");
      validateConnectedStory(directorStoryboardSchema.parse(artifact.document.storyboard), (artifact.document.input as Record<string, unknown>).clipBoundaries);
    }
    await store.action(user.id, a.projectId, "review_artifact", { id: z.uuid().parse(a.id), decision: z.enum(["approve", "reject"]).parse(a.decision) });
  } else if (a.action === "storyboard") {
    const refs = approvedArtifacts(w, brief, originals), previous = latestArtifact(w, "storyboard");
    const location = refs.find(r => r.kind === "location");
    if (locationDocument(location) && await store.rpc("ugc_v3_location_input_current", { p_project: a.projectId, d: location!.document.input }) !== true) throw new Error("V3_CREATIVE_INPUT_STALE");
    const oldInput = z.object({ references: z.array(z.string()), briefHash: z.string() }).safeParse(previous?.document.input);
    const changed = previous && (!oldInput.success || v3Digest("reference-ids", oldInput.data.references) !==
      v3Digest("reference-ids", refs.map(r => r.id)) || oldInput.data.briefHash !== creativeBriefHash(brief));
    if (previous && !previous.rejected_at && !changed) throw new Error("REVIEW_EXISTING_STORYBOARD_FIRST");
    const connected = Number(brief.duration) > 30;
    await enqueue("storyboard", { directorVersion: connected ? CONNECTED_STORY_DIRECTOR_VERSION : STORYBOARD_DIRECTOR_VERSION,
      ...(connected ? { clipBoundaries: planStoryClips(Number(brief.duration) * 1000) } : {}), brief, briefHash: creativeBriefHash(brief), generationContext: context, model: v3OpenAIConfig().directorModel,
      ...(originals.characters || connected ? { cast: characterCast(w, originals) } : {}), references: refs.map(r => r.id), previous: previous?.id ?? null });
  } else if (a.action === "build_package") {
    const refs = approvedArtifacts(w, brief, originals), storyboard = latestArtifact(w, "storyboard");
    const locationArtifact = refs.find(r => r.kind === "location"), location = locationDocument(locationArtifact);
    if (location && await store.rpc("ugc_v3_location_input_current", { p_project: a.projectId, d: locationArtifact!.document.input }) !== true) throw new Error("V3_CREATIVE_INPUT_STALE");
    if (!storyboard?.approved_at || storyboard.rejected_at) throw new Error("APPROVE_STORYBOARD_FIRST");
    const hasCast = "cast" in directorStoryboardSchema.parse(storyboard.document.storyboard);
    const storyboardInput = z.object({ references: z.array(z.uuid()), briefHash: z.string() }).parse(storyboard.document.input);
    if (v3Digest("reference-ids", storyboardInput.references) !== v3Digest("reference-ids", refs.map(r => r.id)) || storyboardInput.briefHash !== creativeBriefHash(brief))
      throw new Error("STORYBOARD_STALE_REGENERATE");
    if (hasCast && refs.length > 100) throw new Error("V3_PRO_REFERENCE_COUNT_EXCEEDED");
    if (hasCast && v3Digest("character-cast", (storyboard.document.storyboard as { cast?: unknown }).cast ?? null) !== v3Digest("character-cast", characterCast(w, originals))) throw new Error("V3_CHARACTER_BINDINGS_CHANGED");
    const character = refs.find(r => r.kind === "character")!, original = z.object({ id: z.uuid(), sha256: z.string() }).parse(character.document.original);
    const input: PlanningInput = planningInputSchema.parse({ workflow: "final-video-v3", profileId: HIGGSFIELD_V3_PROFILE,
      scope: { ownerId: user.id, projectId: a.projectId, jobId: w.project.logical_job_id },
      provenance: { projectWorkflow: "final-video-v3", originalImageId: original.id, originalImageHash: original.sha256 },
      package: { id: randomUUID(), version: w.packages.length + 1, hash: "0".repeat(64), approvedAt: now },
      storyboard: { id: storyboard.id, version: storyboard.version, hash: storyboardContentHash(directorStoryboardSchema.parse(storyboard.document.storyboard)), approvedAt: storyboard.approved_at },
      direction: JSON.stringify({ ...context, duration: brief.duration, aspectRatio: brief.aspect_ratio, narration: "Follows the saved scene instructions",
        ...((storyboard.document.storyboard as { version?: string }).version === "director-storyboard-connected-v1" ? { promptCompiler: CLIP_PROMPT_COMPILER_VERSION } : storyboard.document.input && (storyboard.document.input as { directorVersion?: string }).directorVersion === STORYBOARD_DIRECTOR_VERSION ? { promptCompiler: hasCast ? CAST_PROMPT_COMPILER_VERSION : STORYBOARD_PROMPT_COMPILER_VERSION } : {}),
        ...(location ? { approvedLocation: location } : {}) }), storyboardContent: storyboard.document.storyboard, mode: "reference", resolution: projectVideoResolution(brief.video_resolution), format: "mp4", generateAudio: true,
      references: refs.map(r => { const asset = privateAssetSchema.parse(r.document.asset); return { id: r.id, projectId: a.projectId, originWorkflow: "final-video-v3", role: r.kind,
        kind: "image", name: hasCast && r.kind === "character" ? originalCharacters(originals).find(c => c.id === characterSubject(r))!.name : r.kind,
        ...(hasCast && r.kind === "character" ? { characterId: characterSubject(r) } : {}), version: r.version, approvalId: r.id, approvalVersion: r.version, sha256: asset.sha256,
        sizeBytes: asset.sizeBytes, mimeType: asset.mimeType, durationMs: null }; }), requiredCapabilities: [] });
    input.package.hash = packageContentHash(input);
    const bindings: Record<string, unknown> = {};
    for (const ref of refs) { const asset = privateAssetSchema.parse(ref.document.asset);
      await readPrivate(asset.storageKey, asset.etag, asset.sizeBytes, signal, asset.sha256);
      bindings[ref.id] = { ...asset, verifiedReadback: true };
    }
    await store.rpc("ugc_v3_local_package_begin", { p_owner: user.id, p_project: a.projectId, p_input: input, p_bindings: bindings,
      p_retry_task: a.retryTaskId ? z.uuid().parse(a.retryTaskId) : null });
  } else if (a.action === "authorize") {
    const doc = readFrozenPackage(w.packages.at(-1)?.document), quote = w.quotes.find(q => q.document.packageId === doc.id)?.document;
    const clips = packageClips(doc);
    if (a.packageId !== doc.id || a.packageHash !== doc.hash || a.quoteId !== quote?.id) throw new Error("V3_REVIEW_SNAPSHOT_CHANGED");
    if (!quote || a.operatorApproved !== true) throw new Error("CURRENT_QUOTE_AND_OPERATOR_APPROVAL_REQUIRED");
    const maximum = z.number().int().nonnegative().safe().parse(a.maximumMicrousd);
    if (maximum < quote.totalMicrousd) throw new Error("V3_PACKAGE_AUTHORIZATION_INSUFFICIENT");
    const documents = [];
    for (const [index, segment] of quote.segments.entries()) {
      if (!clips && w.runtimeAuthorizations.some(x => x.document.segmentUuid === segment.segmentUuid && Date.parse(x.document.expiresAt) > Date.now() &&
        !w.runs.some(r => r.intent.authorization.id === x.document.id))) continue;
      const auth = createRuntimeAuthorization(doc, quote, segment.segmentUuid, { operatorId: user.id, approved: true,
        maximumMicrousd: segment.estimatedCostMicrousd + (index === 0 ? maximum - quote.totalMicrousd : 0), packageMaximumMicrousd: maximum, now,
        ...(clips ? { clipAttempt: clipAttemptBinding(doc, segment.segmentId, null) } : {}) });
      if (clips) documents.push(auth);
      else await store.action(user.id, a.projectId, "authorize", { document: auth });
    }
    if (clips && documents.length) await store.rpc("ugc_v3_clip_authorize", { p_owner: user.id, p_project: a.projectId, p_documents: documents, p_previous: null });
  } else if (a.action === "authorize_clip") {
    const doc = readFrozenPackage(w.packages.at(-1)?.document), quote = w.quotes.find(q => q.document.packageId === doc.id)?.document;
    if (!packageClips(doc) || !quote || a.operatorApproved !== true || a.packageId !== doc.id || a.packageHash !== doc.hash || a.quoteId !== quote.id) throw new Error("V3_REVIEW_SNAPSHOT_CHANGED");
    const segmentId = z.string().parse(a.segmentId), previousId = z.uuid().nullable().parse(a.previousRunId);
    const previous = w.runs.filter(r => r.package_id === doc.id && r.intent.segmentId === segmentId).at(-1);
    if ((previous?.id ?? null) !== previousId) throw new Error("V3_CLIP_ATTEMPT_CHANGED");
    if (!previous && !w.runtimeAuthorizations.some(x => x.document.packageId === doc.id && x.document.segmentId === segmentId)) throw new Error("V3_PACKAGE_AUTHORIZATION_REQUIRED");
    if (previous && previous.state !== "deleted") {
      if (previous.state !== "failed" || await store.rpc("ugc_v3_clip_retryable", { p_owner: user.id, p_project: a.projectId, p_run: previous.id }) !== true) throw new Error("V3_CLIP_DELETE_OR_RECOVER_FIRST");
      if (!previous.observation && (await Promise.all(["acceptance.json", "completed.json", "result.bytes"].map(name => readSpool(previous.id, name)))).some(Boolean)) throw new Error("V3_CLIP_DELETE_OR_RECOVER_FIRST");
    }
    const segment = quote.segments.find(s => s.segmentId === segmentId); if (!segment) throw new Error("V3_CLIP_PLAN_INVALID");
    const maximum = z.number().int().nonnegative().safe().parse(a.maximumMicrousd), spending = clipSpending(w, doc);
    const cumulative = z.number().int().nonnegative().safe().parse(a.cumulativeMaximumMicrousd);
    const existing = clipAuthority(w, doc, segmentId);
    if (existing) {
      if (existing.maxEstimatedCostMicrousd !== maximum || existing.packageMaxEstimatedCostMicrousd !== cumulative) throw new Error("V3_REVIEW_SNAPSHOT_CHANGED");
      return runtimeDto(w);
    }
    if (cumulative < Math.max(quote.totalMicrousd, spending.committedMicrousd + spending.reservedMicrousd + maximum)) throw new Error("V3_REVIEW_SNAPSHOT_CHANGED");
    const auth = createRuntimeAuthorization(doc, quote, segment.segmentUuid, { operatorId: user.id, approved: true, maximumMicrousd: maximum,
      packageMaximumMicrousd: cumulative, now, clipAttempt: clipAttemptBinding(doc, segmentId, previousId) });
    await store.rpc("ugc_v3_clip_authorize", { p_owner: user.id, p_project: a.projectId, p_documents: [auth], p_previous: previousId });
  } else if (a.action === "generate" || a.action === "generate_clip") {
    // The web request records intent only. The separate local worker is the only submitter.
    const doc = readFrozenPackage(w.packages.at(-1)?.document);
    const clips = packageClips(doc);
    if (a.packageId !== doc.id || a.packageHash !== doc.hash) throw new Error("V3_REVIEW_SNAPSHOT_CHANGED");
    if (clips && a.action !== "generate_clip" || !clips && a.action === "generate_clip") throw new Error("V3_CLIP_SELECTION_REQUIRED");
    const selected = clips ? clips.find(c => c.id === a.clipId && c.segmentId === a.segmentId) : null;
    if (clips && !selected) throw new Error("V3_CLIP_PLAN_INVALID");
    if (w.runs.some(r => r.package_id === doc.id && r.state !== "deleted" && (!selected || r.intent.segmentId === selected.segmentId))) return runtimeDto(w);
    assertV3Transport(v3TransportConfig(), { projectId: a.projectId, packageId: doc.id });
    const preflight = await inspectRuntime(w, selected?.segmentId); if (!preflight?.eligibleForPaidSubmission) throw new Error(preflight?.issues[0] ?? "V3_PREFLIGHT_REQUIRED");
    const quote = w.quotes.find(q => q.document.packageId === doc.id)!.document;
    for (const segment of quote.segments.filter(s => !selected || s.segmentId === selected.segmentId)) {
      const auth = clips ? clipAuthority(w, doc, segment.segmentId)! : w.runtimeAuthorizations.filter(x => x.document.segmentUuid === segment.segmentUuid &&
        !w.runs.some(r => r.intent.authorization.id === x.document.id)).at(-1)!.document;
      const delivery = await prepareVideoDelivery(w, doc, segment, signal);
      await store.action(user.id, a.projectId, "generate", { intent: createPaidIntent(doc, quote, auth, new Date().toISOString(), delivery) });
    }
  } else if (a.action === "merge") {
    const taskId = await store.rpc("ugc_v3_merge_begin", { p_owner: user.id, p_project: a.projectId,
      p_package: z.uuid().parse(a.packageId), p_hash: z.string().regex(/^[a-f0-9]{64}$/).parse(a.packageHash),
      p_manifest: z.string().regex(/^[a-f0-9]{64}$/).parse(a.manifestHash) });
    if (acknowledge) return { accepted: true as const, action: a.action, id: z.uuid().parse(taskId) };
  } else if (a.action === "refresh_video_delivery") {
    await refreshQueuedVideoDelivery(store, w, z.uuid().parse(a.id), signal);
  } else if (a.action === "recover") {
    const joined = w.artifacts.some(j => j.id === a.id && j.kind === "joined");
    await store.action(user.id, a.projectId, joined ? "recover_delete" : "recover", { id: z.uuid().parse(a.id) });
    if (acknowledge && w.artifacts.some(j => j.id === a.id && j.kind === "joined" && j.document.manifestHash))
      return { accepted: true as const, action: a.action, id: z.uuid().parse(a.id) };
  } else if (a.action === "recover_task") {
    const task = w.tasks.find(t => t.id === a.id);
    if (task && ["character", "product", "location"].includes(task.kind)) {
      if (task.status === "done" && w.artifacts.some(a => a.id === task.id)) return runtimeDto(w);
      if (task.input.recoveryOnly === true && ["queued", "running"].includes(task.status)) return runtimeDto(w);
      const diagnostics = await referenceDiagnostics(task, creativeTaskCurrent(task, context, creativeBriefHash(brief), originals));
      if (!diagnostics.recoveryAvailable) throw new Error("V3_REFERENCE_SAVED_RESPONSE_UNUSABLE");
      await store.rpc("ugc_v3_recover_reference_task", { p_owner: user.id, p_project: a.projectId, p_task: task.id });
      return runtimeDto(await store.read(user.id, a.projectId));
    }
    if (!task || task.kind !== "join" && (!["character", "product", "location", "storyboard"].includes(task.kind) || !await readSpool(task.id, "openai-response.json")))
      throw new Error("V3_NO_SAVED_OPENAI_RESPONSE");
    await store.action(user.id, a.projectId, "recover_task", { id: task.id });
  } else {
    if (a.action === "reject_delete" && a.confirmedDeletion !== true) throw new Error("V3_VIDEO_DELETE_CONFIRMATION_REQUIRED");
    const run = w.runs.find(r => r.id === a.id), joined = w.artifacts.find(j => j.id === a.id && j.kind === "joined");
    const result = run?.result ?? (joined ? privateAssetSchema.parse(joined.document.asset) : null);
    if (!result) throw new Error("V3_RESULT_UNAVAILABLE");
    const directApproval = a.action === "approve" && a.reviewMode === "direct";
    const quality = directApproval ? null : qualitySchema.parse(a.quality);
    if (a.action === "approve") {
      if (run && !w.creativeLock && (w.project.studio_mode === "pro" || (w.packages.find(p => p.id === run.package_id)?.document as { source?: { storyboardContent?: { version?: string } } })?.source?.storyboardContent?.version === "director-storyboard-connected-v1")) {
        if (await store.rpc("ugc_v3_clip_lock_setup", {}) !== true) throw new Error("V3_CREATIVE_LOCK_SETUP_REQUIRED");
      }
      const doc = readFrozenPackage(w.packages.find(p => p.id === (run?.package_id ?? joined?.document.packageId))!.document), speech = doc.source.storyboardContent.scenes.flatMap(s => s.speech);
      if (quality && (Object.entries(quality).some(([k, v]) => k !== "notes" && (v === "fail" || v === "not_checked")) ||
        speech.length && [quality.dialoguePresence, quality.speechTiming].some(v => v !== "pass") ||
        speech.some(s => s.speaker === "character") && quality.lipAudioSync !== "pass")) throw new Error("V3_QUALITY_REVIEW_REQUIRED");
      const readback = () => readPrivate(result.storageKey, result.etag, result.sizeBytes, signal, result.sha256);
      if (joined?.document.manifestHash) await mergeStorageOperation("merge_approval_readback", readback);
      else await readback();
    }
    if (directApproval) {
      await store.rpc("ugc_v3_approve_video", { p_owner: user.id, p_project: a.projectId, p_id: run?.id ?? joined!.id });
    } else {
      await store.action(user.id, a.projectId, joined ? a.action === "approve" ? "approve_joined" : "reject_joined" : a.action, { id: run?.id ?? joined!.id, quality,
        ...(a.action === "reject_delete" ? { confirmedDeletion: true } : {}) });
    }
    if (acknowledge && joined?.document.manifestHash)
      return { accepted: true as const, action: a.action, id: joined.id };
    if (run && a.action === "approve") {
      const refreshed = await store.read(user.id, a.projectId), doc = readFrozenPackage(w.packages.find(p => p.id === run.package_id)!.document);
      if (!packageClips(doc) && doc.segments.length > 1 && doc.segments.every(s => refreshed.runs.some(r => r.package_id === doc.id && r.intent.segmentId === s.id && r.state === "approved")))
        await enqueue("join", { packageId: doc.id, packageHash: doc.hash }, doc.hash);
    }
  }
  return runtimeDto(await store.read(user.id, a.projectId));
}
