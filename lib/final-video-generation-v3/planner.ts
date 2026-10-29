import "server-only";
import { capabilitiesSchema, costEstimateSchema, planningContextSchema, planningInputSchema, type GenerationSegment, type PlanningContext, type PlanningResult,
  type VideoCommand, type VideoGenerationProvider } from "./contract";
import { compileDirectorInstructions } from "./compiler";
import { commandFingerprint, freezeDocument, normalizeCapabilities, planFingerprint, v3Digest } from "./identity";
import { capabilityIssues, fundingIssues, problem, validateApprovedInput } from "./validation";

export function planGenerationSegments(value: unknown, provider: VideoGenerationProvider, context: PlanningContext): PlanningResult {
  const parsed = planningInputSchema.safeParse(value);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(i => problem("PLANNING_INPUT_INVALID", i.path.join("."), i.message)) };
  const trustedContext = planningContextSchema.safeParse(context);
  if (!trustedContext.success) return { ok: false, issues: trustedContext.error.issues.map(i => problem("PLANNING_CONTEXT_INVALID", i.path.join("."), i.message)) };
  context = trustedContext.data;
  const capabilities = capabilitiesSchema.safeParse(provider.capabilities());
  if (!capabilities.success) return { ok: false, issues: [problem("CAPABILITY_SNAPSHOT_INVALID", "provider", "A verified versioned V3 capability shape is required")] };
  const input = parsed.data, cap = normalizeCapabilities(capabilities.data);
  if (cap.supportedDurationsMs.some(ms => ms > cap.maxContinuousDurationMs))
    return { ok: false, issues: [problem("CAPABILITY_SNAPSHOT_INVALID", "duration", "Allowed durations exceed the continuous maximum")] };
  const issues = validateApprovedInput(input, cap, context);
  if (issues.length) return { ok: false, issues };
  const scenes = input.storyboardContent.scenes, count = scenes.length;
  const promptFailures = new Map<string, ReturnType<typeof problem>>();
  const best: (number[] | null)[] = Array.from({ length: count + 1 }, () => null); best[count] = [];
  // Minimum-count search over approved boundaries. Ties prefer longer first
  // intervals; an illegal 1–3s tail is never padded, discarded or invented.
  for (let from = count - 1; from >= 0; from--) for (let to = from + 1; to <= count; to++) {
    const duration = scenes[to - 1].endMs - scenes[from].startMs;
    if (duration > cap.maxContinuousDurationMs) break;
    if (!cap.supportedDurationsMs.includes(duration) || best[to] === null) continue;
    const direction = compileDirectorInstructions(input, from, to);
    if (cap.maxPromptCharacters !== null && [...direction.prompt].length > cap.maxPromptCharacters) {
      const path = `scenes[${from}..${to - 1}]`;
      if (promptFailures.size < 20) promptFailures.set(path, problem("PROMPT_LIMIT_EXCEEDED", path, `Compiled instructions exceed ${cap.maxPromptCharacters} characters; no truncation`));
      continue;
    }
    const candidate = [to, ...best[to]!], old = best[from];
    if (!old || candidate.length < old.length || candidate.length === old.length && to > old[0]) best[from] = candidate;
  }
  if (!best[0]) return { ok: false, issues: [problem("DURATION_UNREPRESENTABLE", "scenes",
    "No legal minimum-segment plan exists at approved scene boundaries with these duration/prompt limits; replan Storyboard rather than split creative content"), ...promptFailures.values()] };
  const capabilityHash = v3Digest("capabilities", cap), segments: GenerationSegment[] = [];
  let from = 0;
  for (const to of best[0]) {
    const direction = compileDirectorInstructions(input, from, to);
    const command: VideoCommand = { workflow: input.workflow, profileId: input.profileId, scope: input.scope, package: input.package,
      storyboard: input.storyboard, provenance: input.provenance, capabilityHash, mode: input.mode, aspectRatio: input.storyboardContent.aspectRatio,
      resolution: input.resolution, format: input.format, generateAudio: input.generateAudio, references: input.references, direction };
    const fingerprint = commandFingerprint(command);
    const estimateResult = costEstimateSchema.safeParse(provider.estimateCost(command, context.estimateEvidence, context.accountScope, context.now));
    if (!estimateResult.success) return { ok: false, issues: [problem("ESTIMATE_RECEIPT_INVALID", "estimate", "Provider returned an invalid or negative independent estimate")] };
    segments.push({ id: `segment-${segments.length + 1}-${fingerprint.slice(0, 16)}`, version: 1, startMs: direction.startMs,
      endMs: direction.endMs, durationMs: direction.durationMs, includedSceneNumbers: direction.sceneNumbers, command, capabilityHash, fingerprint,
      estimate: estimateResult.data,
      executionStatus: "not_started", actualProviderCostMicrousd: null, providerReceipt: null });
    from = to;
  }
  const content = { workflow: input.workflow, version: 1 as const, paidExecutionEnabled: false as const, scope: input.scope,
    package: input.package, storyboard: input.storyboard, inputFingerprint: v3Digest("input", input), capabilitySnapshot: cap, capabilityHash,
    requiredCapabilities: input.requiredCapabilities,
    authorizationSnapshot: structuredClone(context.authorization),
    composition: segments.length === 1 ? "direct_final_review" as const : "review_segments_then_join" as const, segments };
  const readinessIssues = [...capabilityIssues(input, cap), ...fundingIssues(content, context)];
  return { ok: true, plan: freezeDocument({ ...content, fingerprint: planFingerprint(content), readinessIssues }) };
}
