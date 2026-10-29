import "server-only";
import { featureNames, planningContextSchema, type Issue, type PlanningInput, type PlanningContext, type SegmentPlan, type VideoCapabilities, type VideoGenerationProvider } from "./contract";
import { commandFingerprint, normalizeCapabilities, packageContentHash, planFingerprint, storyboardContentHash, v3Digest } from "./identity";

export const problem = (code: string, path: string, message: string, sceneNumber?: number): Issue =>
  ({ code, path, message, ...(sceneNumber === undefined ? {} : { sceneNumber }) });
export function validateApprovedInput(input: PlanningInput, cap: VideoCapabilities, context: PlanningContext): Issue[] {
  const issues: Issue[] = [], scenes = input.storyboardContent.scenes;
  const add = (code: string, path: string, message: string, number?: number) => issues.push(problem(code, path, message, number));
  if (input.profileId !== cap.profileId) add("PROVIDER_PROFILE_MISMATCH", "profileId", "Replan explicitly for the selected provider/profile; no fallback");
  if (!cap.modes.includes(input.mode)) add("VIDEO_MODE_UNSUPPORTED", "mode", "Selected input mode is unsupported");
  if (!cap.supportedResolutions.includes(input.resolution)) add("RESOLUTION_UNSUPPORTED", "resolution", "Selected resolution is unsupported");
  if (!cap.supportedAspectRatios.includes(input.storyboardContent.aspectRatio)) add("ASPECT_RATIO_UNSUPPORTED", "aspectRatio", "Selected ratio is unsupported");
  if (!cap.supportedFormats.includes(input.format)) add("OUTPUT_FORMAT_UNSUPPORTED", "format", "Selected format is unsupported");
  const current = { workflow: input.workflow, profileId: input.profileId, scope: input.scope, provenance: input.provenance,
    package: input.package, storyboard: input.storyboard, references: input.references };
  try {
    if (v3Digest("current", current) !== v3Digest("current", context.current)) add("APPROVED_INPUT_STALE", "current", "Package, Storyboard, reference or scope versions differ from the trusted current snapshot");
  } catch { add("CURRENT_SNAPSHOT_INVALID", "current", "Trusted current-input evidence must be complete canonical data"); }
  if (input.storyboard.hash !== storyboardContentHash(input.storyboardContent)) add("STORYBOARD_HASH_MISMATCH", "storyboard.hash", "Approved Storyboard content hash does not match");
  if (input.package.hash !== packageContentHash(input)) add("PACKAGE_HASH_MISMATCH", "package.hash", "Approved creative package hash does not match");
  if ([input.package.approvedAt, input.storyboard.approvedAt].some(at => Date.parse(at) > Date.parse(context.now)))
    add("APPROVAL_TIMESTAMP_INVALID", "approvedAt", "Future approval evidence is not current authority");
  if (input.references.some(ref => ref.projectId !== input.scope.projectId)) add("REFERENCE_PROJECT_MISMATCH", "references", "Historical/cross-project assets cannot be attached to the fresh V3 run");
  if (input.references.some(ref => ref.kind !== "image" && (ref.durationMs === null || ref.durationMs <= 0)))
    add("REFERENCE_MEDIA_DURATION_INVALID", "references", "Audio/video references require positive measured durations");
  if (new Set(input.references.map(ref => ref.id)).size !== input.references.length) add("REFERENCE_DUPLICATE", "references", "Reference identities must be distinct");
  if (input.mode === "reference") for (const role of ["character", "product", "location"])
    if (!input.references.some(ref => ref.kind === "image" && ref.role === role)) add("REFERENCE_ROLE_MISSING", "references", `Missing approved ${role} image reference`);
  if (input.mode === "text" && input.references.length) add("TEXT_MODE_REFERENCES_UNSUPPORTED", "references", "Text mode accepts no media in this profile");
  if (input.mode === "image" && (input.references.some(ref => ref.kind !== "image") || input.references.length < 1 || input.references.length > 2 ||
    input.references.filter(ref => ref.role === "start_frame").length !== 1 || input.references.filter(ref => ref.role === "end_frame").length !== input.references.length - 1))
    add("IMAGE_FRAME_BINDINGS_INVALID", "references", "Image mode requires one start frame and at most one end frame");
  let endMs = 0;
  const identities = new Set<string>(), speechWindows: { startMs: number; endMs: number }[] = [];
  for (const [index, scene] of scenes.entries()) {
    const p = `scenes[${index}]`, duration = scene.endMs - scene.startMs;
    if (scene.number !== index + 1 || identities.has(scene.id)) add("SCENE_IDENTITY_INVALID", p, "Unique scenes numbered consecutively in approved order", scene.number);
    identities.add(scene.id);
    if (scene.startMs !== endMs || duration <= 0) add("SCENE_TIMING_INVALID", p, "Approved scene windows must be positive and contiguous", scene.number);
    if (duration > cap.maxContinuousDurationMs) add("SCENE_REPLANNING_REQUIRED", p, "An approved scene exceeds the provider maximum; do not split it silently", scene.number);
    endMs = scene.endMs;
    const t = scene.transition;
    if ((t.type === "cut" || t.type === "none") ? t.durationMs !== 0 : t.durationMs <= 0 || t.durationMs >= duration)
      add("TRANSITION_TIMING_INVALID", `${p}.transition`, "Transition duration must fit the approved scene", scene.number);
    if (t.type === "crossfade") add("TRANSITION_OVERLAP_UNSUPPORTED", `${p}.transition`, "Overlap/handle planning is outside this contiguous foundation profile", scene.number);
    for (const [i, action] of scene.actions.entries()) if (action.startMs < scene.startMs || action.endMs > scene.endMs || action.endMs <= action.startMs)
      add("ACTION_TIMING_INVALID", `${p}.actions[${i}]`, "Action/reaction must fit its approved scene", scene.number);
    for (const [i, line] of scene.speech.entries()) {
      if (line.startMs < scene.startMs || line.endMs > scene.endMs || line.endMs <= line.startMs)
        add("DIALOGUE_TIMING_INVALID", `${p}.speech[${i}]`, "Dialogue must fit its approved scene", scene.number);
      if (line.text.trim()) speechWindows.push(line);
    }
    for (const [role, cue] of Object.entries(scene.audio)) if (cue.assetId !== null && !input.references.some(ref => ref.id === cue.assetId && ref.kind === "audio"))
      add("AUDIO_ASSET_UNBOUND", `${p}.audio.${role}`, "An explicit audio asset must exist in the same approved V3 reference manifest", scene.number);
  }
  if (endMs !== input.storyboardContent.durationMs) add("TOTAL_DURATION_MISMATCH", "durationMs", "Scenes must cover exactly the approved project duration");
  speechWindows.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < speechWindows.length; i++) if (speechWindows[i].startMs < speechWindows[i - 1].endMs)
    add("DIALOGUE_OVERLAP", "speech", "Approved single-Character speech cannot overlap");
  return issues;
}

export function capabilityIssues(input: Pick<PlanningInput, "generateAudio" | "requiredCapabilities" | "references"> & { storyboardContent: Pick<PlanningInput["storyboardContent"], "scenes"> }, cap: VideoCapabilities): Issue[] {
  const issues: Issue[] = [], features = new Set(input.requiredCapabilities);
  if (input.generateAudio) features.add("nativeAudio");
  if (input.storyboardContent.scenes.length > 1) features.add("multiShotPrompting");
  const speaking = input.storyboardContent.scenes.flatMap(scene => scene.speech).filter(line => line.text.trim());
  if (speaking.length) features.add("nativeDialogue");
  if (speaking.some(line => line.speaker === "character")) features.add("nativeLipSync");
  const requiredSound = input.storyboardContent.scenes.some(s => Object.values(s.audio).some(c => c.requirement === "required"));
  for (const scene of input.storyboardContent.scenes) {
    if (scene.audio.background.requirement === "required") features.add("nativeAmbience");
    if (scene.audio.effects.requirement === "required") features.add("nativeSoundEffects");
    if (scene.audio.music.requirement === "required") features.add("nativeMusic");
  }
  if (!input.generateAudio && (speaking.length || requiredSound)) issues.push(problem("NATIVE_AUDIO_REQUIRED", "generateAudio", "Required dialogue/sound cannot be silently omitted"));
  for (const kind of ["image", "audio", "video"] as const) {
    const refs = input.references.filter(ref => ref.kind === kind);
    if (!refs.length) continue;
    features.add(`${kind}References`);
    const limits = cap.referenceLimits[kind];
    if (limits.maxCount === null || limits.maxBytes === null || limits.mimeTypes === null)
      issues.push(problem("REFERENCE_LIMIT_UNVERIFIED", `referenceLimits.${kind}`, "The selected provider's media count/size/format limits are not verified"));
    if (limits.maxCount !== null && refs.length > limits.maxCount) issues.push(problem("REFERENCE_COUNT_EXCEEDED", kind, `At most ${limits.maxCount} ${kind} references`));
    for (const ref of refs) {
      if (limits.maxBytes !== null && ref.sizeBytes > limits.maxBytes) issues.push(problem("REFERENCE_SIZE_EXCEEDED", ref.id, "Reference exceeds the provider file-size limit"));
      if (limits.mimeTypes !== null && !limits.mimeTypes.includes(ref.mimeType)) issues.push(problem("REFERENCE_FORMAT_UNSUPPORTED", ref.id, "Unsupported reference format"));
      if (kind !== "image" && (ref.durationMs === null || limits.maxDurationMs === null || limits.maxCombinedDurationMs === null))
        issues.push(problem("REFERENCE_DURATION_UNVERIFIED", ref.id, "Measured media duration and verified provider limits are required"));
      else if (limits.maxDurationMs !== null && ref.durationMs !== null && ref.durationMs > limits.maxDurationMs)
        issues.push(problem("REFERENCE_DURATION_EXCEEDED", ref.id, "Reference duration exceeds provider limits"));
    }
    if (limits.maxCombinedDurationMs !== null && refs.reduce((sum, ref) => sum + (ref.durationMs ?? 0), 0) > limits.maxCombinedDurationMs)
      issues.push(problem("REFERENCE_COMBINED_DURATION_EXCEEDED", kind, "Combined reference duration exceeds provider limits"));
  }
  if (input.references.length && cap.referenceLimits.total === null) issues.push(problem("TOTAL_REFERENCE_LIMIT_UNVERIFIED", "references", "Combined reference ceiling is not verified"));
  else if (cap.referenceLimits.total !== null && input.references.length > cap.referenceLimits.total) issues.push(problem("TOTAL_REFERENCE_COUNT_EXCEEDED", "references", "Combined reference ceiling exceeded"));
  for (const name of features) {
    if (!featureNames.includes(name as typeof featureNames[number])) issues.push(problem("UNKNOWN_PROVIDER_REQUIREMENT", name, "Unknown capability requirement"));
    else { const state = cap.features[name as typeof featureNames[number]];
      if (state !== "supported") issues.push(problem(state === "unverified" ? "CAPABILITY_UNVERIFIED" : "CAPABILITY_UNSUPPORTED", name, `${name} is ${state}`)); }
  }
  for (const scene of input.storyboardContent.scenes) if (!["none", "cut"].includes(scene.transition.type) && cap.transitions[scene.transition.type] !== "supported")
    issues.push(problem("TRANSITION_CAPABILITY_UNVERIFIED", `scenes.${scene.number}`, "Required transition support is not verified", scene.number));
  return issues;
}

export function fundingIssues(plan: Pick<SegmentPlan, "segments" | "scope" | "package" | "inputFingerprint" | "capabilityHash">, context: PlanningContext): Issue[] {
  const a = context.authorization, issues: Issue[] = [];
  if (![a.version, a.maxRequests, a.maxCostMicrousd, a.consumedRequests, a.committedCostMicrousd].every(n => Number.isSafeInteger(n) && n >= 0) || a.version < 1 ||
    !a.id || a.projectId !== plan.scope.projectId || a.packageHash !== plan.package.hash ||
    a.inputFingerprint !== plan.inputFingerprint || a.capabilityHash !== plan.capabilityHash)
    return [problem("AUTHORIZATION_SCOPE_INVALID", "authorization", "Fresh finite authority must bind this project/package")];
  const estimates = plan.segments.map(segment => segment.estimate.estimatedCostMicrousd);
  if (estimates.some(cost => cost === null)) issues.push(problem("COST_ESTIMATE_UNAVAILABLE", "estimate", "An independent verified estimate is required for every segment"));
  if (a.consumedRequests + plan.segments.length > a.maxRequests) issues.push(problem("REQUEST_AUTHORIZATION_INSUFFICIENT", "authorization.maxRequests", "Segment requests exceed remaining finite authority"));
  const cost = estimates.reduce<number>((sum, n) => sum + (n ?? 0), a.committedCostMicrousd);
  if (!Number.isSafeInteger(cost) || cost > a.maxCostMicrousd) issues.push(problem("COST_AUTHORIZATION_INSUFFICIENT", "authorization.maxCostMicrousd", "Estimate exceeds remaining cost authority"));
  return issues;
}
export function executionReadiness(plan: SegmentPlan, context: PlanningContext, provider: VideoGenerationProvider): { eligible: false; issues: Issue[] } {
  const currentContext = planningContextSchema.safeParse(context);
  if (!currentContext.success) return { eligible: false, issues: [problem("PLANNING_CONTEXT_INVALID", "context", "Current trusted evidence is invalid"),
    problem("PAID_V3_EXECUTION_DISABLED", "workflow", "Phase 1 has no paid provider transport")] };
  context = currentContext.data;
  const { fingerprint, readinessIssues, ...content } = plan;
  const issues = [...readinessIssues, ...fundingIssues(plan, context)];
  const immutableAuthority = (a: PlanningContext["authorization"]) => ({ id: a.id, version: a.version, projectId: a.projectId,
    packageHash: a.packageHash, inputFingerprint: a.inputFingerprint, capabilityHash: a.capabilityHash, maxRequests: a.maxRequests, maxCostMicrousd: a.maxCostMicrousd });
  if (v3Digest("authority", immutableAuthority(plan.authorizationSnapshot)) !== v3Digest("authority", immutableAuthority(context.authorization)))
    issues.push(problem("AUTHORIZATION_SNAPSHOT_CHANGED", "authorization", "Changed authority requires explicit review rather than silently rebinding the plan"));
  if (fingerprint !== planFingerprint(content) || plan.segments.some(s => s.fingerprint !== commandFingerprint(s.command)))
    issues.push(problem("PLAN_INTEGRITY_INVALID", "fingerprint", "Immutable plan or segment content has changed"));
  const cap = normalizeCapabilities(provider.capabilities());
  if (v3Digest("capabilities", cap) !== plan.capabilityHash) issues.push(problem("PROVIDER_SNAPSHOT_CHANGED", "provider", "Replan and requote against the current provider snapshot"));
  const first = plan.segments[0]?.command;
  if (first) issues.push(...capabilityIssues({ generateAudio: first.generateAudio, references: first.references,
    requiredCapabilities: plan.requiredCapabilities, storyboardContent: { scenes: plan.segments.flatMap(s => s.command.direction.scenes) } }, cap));
  for (const segment of plan.segments) {
    const command = segment.command;
    const current = { workflow: command.workflow, profileId: command.profileId, scope: command.scope, provenance: command.provenance,
      package: command.package, storyboard: command.storyboard, references: command.references };
    if (v3Digest("current", current) !== v3Digest("current", context.current)) issues.push(problem("APPROVED_INPUT_STALE", "current", "Approval/reference/currentness must be revalidated before future execution"));
    const estimate = provider.estimateCost(command, context.estimateEvidence, context.accountScope, context.now);
    if (estimate.status !== "estimated" || v3Digest("estimate", estimate) !== v3Digest("estimate", segment.estimate))
      issues.push(problem("ESTIMATE_STALE_OR_UNAVAILABLE", "estimate", "A current exact-input estimate must be reviewed again"));
  }
  issues.push(problem("PAID_V3_EXECUTION_DISABLED", "workflow", "Phase 1 has no paid provider transport or runtime activation"));
  return { eligible: false, issues };
}
