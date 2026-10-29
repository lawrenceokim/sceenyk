import "server-only";
import { canonicalJson, packageDigest } from "@/lib/video-generation-package/builder";
import { capabilityNames, segmentCapabilitiesSchema, type SegmentCapabilities, type SegmentCapabilityName,
  type SegmentPlanningIssue, type VideoGenerationPlanningProvider } from "./capabilities";
import { segmentPlanningInputSchema, segmentPlanVersion, type DialogueTimingReference, type GenerationSegment,
  type SegmentPlanningInput, type SegmentPlanningResult, type SegmentScene } from "./contract";

const digest = (kind: string, value: unknown) => packageDigest(`sceenyk-final-v2-${kind}`, value);
const issue = (code: string, path: string, message: string, sceneNumber?: number): SegmentPlanningIssue =>
  ({ code, path, message, ...(sceneNumber === undefined ? {} : { sceneNumber }) });
const sorted = (values: string[]) => [...new Set(values)].sort();

function snapshot(provider: VideoGenerationPlanningProvider): SegmentCapabilities | null {
  if (provider.version !== segmentPlanVersion) return null;
  const parsed = segmentCapabilitiesSchema.safeParse(provider.getCapabilities());
  if (!parsed.success) return null;
  const cap = parsed.data;
  if (cap.supportedDurationsMs.some(ms => ms > cap.maxContinuousDurationMs) ||
    cap.referenceLimits.audio.minDurationMs > cap.referenceLimits.audio.maxDurationMs) return null;
  return { ...cap, supportedDurationsMs: [...new Set(cap.supportedDurationsMs)].sort((a, b) => a - b),
    supportedAspectRatios: sorted(cap.supportedAspectRatios), supportedResolutions: sorted(cap.supportedResolutions),
    supportedTransitions: sorted(cap.supportedTransitions), sources: sorted(cap.sources),
    referenceLimits: { ...cap.referenceLimits, images: { ...cap.referenceLimits.images, mimeTypes: sorted(cap.referenceLimits.images.mimeTypes) },
      audio: { ...cap.referenceLimits.audio, mimeTypes: sorted(cap.referenceLimits.audio.mimeTypes) } } };
}

function capabilityIssue(cap: SegmentCapabilities, name: string, path: string): SegmentPlanningIssue | null {
  if (!capabilityNames.includes(name as SegmentCapabilityName)) return issue("UNKNOWN_PROVIDER_REQUIREMENT", path, `Unknown capability requirement: ${name}`);
  const state = cap[name as SegmentCapabilityName];
  return state === "supported" ? null : issue(state === "unverified" ? "CAPABILITY_UNVERIFIED" : "CAPABILITY_UNSUPPORTED", path, `${name} is ${state}`);
}

function inputIssues(input: SegmentPlanningInput, cap: SegmentCapabilities): SegmentPlanningIssue[] {
  const issues: SegmentPlanningIssue[] = [];
  const add = (code: string, path: string, message: string, scene?: number) => issues.push(issue(code, path, message, scene));
  if (!cap.supportedAspectRatios.includes(input.aspectRatio)) add("ASPECT_RATIO_UNSUPPORTED", "aspectRatio", `Unsupported aspect ratio: ${input.aspectRatio}`);
  if (!cap.supportedResolutions.includes(input.resolution)) add("RESOLUTION_UNSUPPORTED", "resolution", `Unsupported resolution: ${input.resolution}`);
  const limits = cap.referenceLimits;
  if (input.references.length > limits.images.maxCount) add("REFERENCE_COUNT_EXCEEDED", "references", `At most ${limits.images.maxCount} image references`);
  if (new Set(input.references.map(ref => ref.id)).size !== input.references.length) add("REFERENCE_DUPLICATE", "references", "Reference asset IDs must be distinct");
  for (const role of ["character", "product", "location"])
    if (!input.references.some(ref => ref.role === role)) add("REFERENCE_ROLE_MISSING", "references", `Missing required ${role} reference`);
  for (const [i, ref] of input.references.entries()) {
    if (ref.sizeBytes > limits.images.maxBytesPerFile) add("REFERENCE_SIZE_EXCEEDED", `references[${i}].sizeBytes`, `At most ${limits.images.maxBytesPerFile} bytes per image`);
    if (!limits.images.mimeTypes.includes(ref.mimeType)) add("REFERENCE_FORMAT_UNSUPPORTED", `references[${i}].mimeType`, `Unsupported image format: ${ref.mimeType}`);
  }
  const required = new Set(input.requiredCapabilities);
  const hasSpeech = input.scenes.some(scene => scene.speech.some(line => line.text.trim()));
  const hasCharacterSpeech = input.scenes.some(scene => scene.speech.some(line => line.text.trim() && line.speaker === "character"));
  if (input.references.length > 1) required.add("supportsMultipleImageReferences");
  if (input.scenes.length > 1) required.add("supportsMultiShotPrompting");
  if (hasSpeech && !input.audioReference) add("AUDIO_REFERENCE_BINDING_REQUIRED", "audioReference", "Speech requires an intended canonical master-audio binding");
  if (input.audioReference) {
    required.add("supportsAudioReference");
    if (hasCharacterSpeech) required.add("supportsSpeechAudioDrivenLipSynchronization");
    if (limits.audio.maxCount < 1) add("AUDIO_REFERENCE_COUNT_EXCEEDED", "audioReference", "The selected profile has no audio-reference slots");
    if (input.audioReference.durationMs !== input.durationMs) add("MASTER_DURATION_MISMATCH", "audioReference.durationMs", "Master timeline must match the exact project duration");
    if (!limits.audio.mimeTypes.includes(input.audioReference.mimeType)) add("AUDIO_FORMAT_UNSUPPORTED", "audioReference.mimeType", `Unsupported audio format: ${input.audioReference.mimeType}`);
    if (input.audioReference.expectedSliceSizeBytes !== null && input.audioReference.expectedSliceSizeBytes > limits.audio.maxBytesPerFile)
      add("AUDIO_SIZE_EXCEEDED", "audioReference.expectedSliceSizeBytes", `At most ${limits.audio.maxBytesPerFile} bytes per audio reference`);
  }
  if (hasCharacterSpeech) required.add("supportsNativeLipSynchronization");
  for (const name of required) { const problem = capabilityIssue(cap, name, `requiredCapabilities.${name}`); if (problem) issues.push(problem); }
  const totalFiles = input.references.length + (input.audioReference ? 1 : 0);
  if (totalFiles > limits.maxTotalFiles) add("TOTAL_REFERENCE_COUNT_EXCEEDED", "references", `At most ${limits.maxTotalFiles} files across modalities`);
  let end = 0;
  const sceneIds = new Set<string>();
  const dialogue: { startMs: number; endMs: number; number: number }[] = [];
  for (const [i, scene] of input.scenes.entries()) {
    const p = `scenes[${i}]`;
    if (scene.number !== i + 1 || sceneIds.has(scene.id)) add("SCENE_IDENTITY_INVALID", p, "Ordered unique scenes numbered consecutively from 1", scene.number);
    sceneIds.add(scene.id);
    if (scene.startMs !== end || scene.endMs <= scene.startMs || scene.durationMs !== scene.endMs - scene.startMs)
      add("SCENE_TIMING_INVALID", p, "Positive contiguous exact scene windows; overlaps/gaps need a separately supported plan", scene.number);
    if (scene.durationMs > cap.maxContinuousDurationMs)
      add("SCENE_EXCEEDS_CONTINUOUS_DURATION", p, "This foundation cannot split an approved scene across provider operations", scene.number);
    end = scene.endMs;
    const transition = scene.transition;
    if (typeof transition === "string") add("TRANSITION_UNSTRUCTURED", `${p}.transition`, "A structured approved transition is required; no automatic legacy repair", scene.number);
    else {
      if (!cap.supportedTransitions.includes(transition.type)) add("TRANSITION_UNSUPPORTED", `${p}.transition`, `Unconfirmed/unsupported transition: ${transition.type}`, scene.number);
      if ((transition.type === "cut" || transition.type === "none") && transition.durationMs !== 0)
        add("TRANSITION_TIMING_INVALID", `${p}.transition.durationMs`, "cut/none require zero duration", scene.number);
      if (transition.type !== "cut" && transition.type !== "none" && (transition.durationMs <= 0 || transition.durationMs >= scene.durationMs))
        add("TRANSITION_TIMING_INVALID", `${p}.transition.durationMs`, "A timed transition must fit strictly inside its approved scene", scene.number);
      if (transition.type === "crossfade") add("SCENE_OVERLAP_UNSUPPORTED", `${p}.transition`, "Overlapping transition handles are outside this contiguous foundation profile", scene.number);
    }
    for (const [a, action] of scene.actions.entries())
      if (action.startMs < scene.startMs || action.endMs > scene.endMs || action.endMs <= action.startMs)
        add("ACTION_TIMING_INVALID", `${p}.actions[${a}]`, "Action must fit completely inside its approved scene", scene.number);
    for (const [s, line] of scene.speech.entries()) {
      if (line.startMs < scene.startMs || line.endMs > scene.endMs || line.endMs <= line.startMs)
        add("DIALOGUE_TIMING_INVALID", `${p}.speech[${s}]`, "Dialogue must fit completely inside its approved scene", scene.number);
      if (typeof line.delivery === "string") add("VOICE_DELIVERY_UNSTRUCTURED", `${p}.speech[${s}].delivery`, "Structured approved voice delivery is required", scene.number);
      if (line.text.trim()) dialogue.push({ startMs: line.startMs, endMs: line.endMs, number: scene.number });
    }
    for (const [role, cue] of Object.entries(scene.audio)) {
      if (typeof cue === "string") add("AUDIO_CUE_UNSTRUCTURED", `${p}.audio.${role}`, "Structured approved audio cues are required", scene.number);
      else if (cue.requirement === "required" || cue.assetId !== null)
        add("REQUIRED_AUDIO_MANIFEST_UNAVAILABLE", `${p}.audio.${role}`, "Required music/SFX needs a separately implemented owned-audio manifest; it cannot be omitted", scene.number);
    }
  }
  if (end !== input.durationMs) add("TOTAL_DURATION_MISMATCH", "durationMs", "Scenes must cover the exact project duration");
  dialogue.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < dialogue.length; i++)
    if (dialogue[i].startMs < dialogue[i - 1].endMs) add("DIALOGUE_OVERLAP", "scenes.speech", "Single-Character dialogue windows cannot overlap", dialogue[i].number);
  return issues;
}

function dialogueReferences(scenes: SegmentScene[], startMs: number): DialogueTimingReference[] {
  return scenes.flatMap(scene => scene.speech.map((line, i) => ({ id: `${scene.id}/speech-${i + 1}`, sceneNumber: scene.number,
    speechIndex: i, textHash: digest("speech", line), startMs: line.startMs, endMs: line.endMs,
    localStartMs: line.startMs - startMs, localEndMs: line.endMs - startMs, speaker: line.speaker })));
}

function segmentContent(input: SegmentPlanningInput, from: number, to: number, capabilityHash: string) {
  const scenes = input.scenes.slice(from, to), startMs = scenes[0].startMs, endMs = scenes.at(-1)!.endMs;
  const dialogue = dialogueReferences(scenes, startMs);
  const audioReference = input.audioReference ? { ...input.audioReference, sliceStartMs: startMs, sliceEndMs: endMs, sliceDurationMs: endMs - startMs } : null;
  const shotChanges = scenes.map((scene, index) => ({ fromSceneNumber: scene.number, toSceneNumber: input.scenes[from + index + 1]?.number ?? null,
    atMs: scene.endMs, localAtMs: scene.endMs - startMs, transition: scene.transition,
    owner: index < scenes.length - 1 || to === input.scenes.length ? "video" as const : "composition" as const }));
  const instructions = canonicalJson({ version: segmentPlanVersion, creativeDirection: input.creativeDirection,
    visualStyle: input.visualStyle, tone: input.tone, voice: input.voice, continuity: input.continuity,
    startMs, endMs, durationMs: endMs - startMs, aspectRatio: input.aspectRatio, resolution: input.resolution,
    requiredReferences: input.references, audioReference, scenes, dialogue, shotChanges });
  return { version: 1 as const, startMs, endMs, durationMs: endMs - startMs, includedSceneNumbers: scenes.map(s => s.number),
    scenes, dialogue, shotChanges, requiredReferences: input.references, audioReference, instructions, capabilityHash };
}

export function planGenerationSegments(value: unknown, provider: VideoGenerationPlanningProvider): SegmentPlanningResult {
  const parsed = segmentPlanningInputSchema.safeParse(value);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(e => issue("PLANNING_INPUT_INVALID", e.path.join("."), e.message)) };
  const input = parsed.data, cap = snapshot(provider);
  if (!cap) return { ok: false, issues: [issue("CAPABILITY_SNAPSHOT_INVALID", "provider", "A valid isolated V2 capability snapshot is required")] };
  const issues = inputIssues(input, cap);
  if (issues.length) return { ok: false, issues };
  const capabilityHash = digest("capabilities", cap), inputFingerprint = digest("input", input);
  type Content = ReturnType<typeof segmentContent>;
  const best: (Content[] | null)[] = Array.from({ length: input.scenes.length + 1 }, () => null);
  best[input.scenes.length] = [];
  const blocked = new Map<string, SegmentPlanningIssue>();
  // Dynamic programming over approved boundaries, not greedy max-duration chunks.
  // Equal-count solutions prefer the longer first interval deterministically.
  for (let from = input.scenes.length - 1; from >= 0; from--) {
    for (let to = from + 1; to <= input.scenes.length; to++) {
      const durationMs = input.scenes[to - 1].endMs - input.scenes[from].startMs;
      if (durationMs > cap.maxContinuousDurationMs) break;
      if (!cap.supportedDurationsMs.includes(durationMs) || best[to] === null) continue;
      const problems: SegmentPlanningIssue[] = [];
      if (to - from > 1) { const p = capabilityIssue(cap, "supportsMultiShotPrompting", `scenes[${from}..${to - 1}]`); if (p) problems.push(p); }
      if (input.audioReference) {
        const audio = cap.referenceLimits.audio;
        if (durationMs < audio.minDurationMs || durationMs > audio.maxDurationMs || durationMs > audio.maxCombinedDurationMs)
          problems.push(issue("AUDIO_DURATION_UNSUPPORTED", `scenes[${from}..${to - 1}]`, "Segment master-audio slice exceeds reference duration limits"));
      }
      const segment = segmentContent(input, from, to, capabilityHash);
      if (cap.maxPromptCharacters !== null && [...segment.instructions].length > cap.maxPromptCharacters)
        problems.push(issue("PROMPT_LIMIT_EXCEEDED", `scenes[${from}..${to - 1}]`, `At most ${cap.maxPromptCharacters} prompt characters; no truncation`));
      problems.push(...provider.validateRequirements({ durationMs, aspectRatio: input.aspectRatio, resolution: input.resolution,
        imageCount: input.references.length, audioCount: input.audioReference ? 1 : 0, promptCharacters: [...segment.instructions].length }));
      if (problems.length) { for (const p of problems) if (blocked.size < 20) blocked.set(`${p.code}:${p.path}`, p); continue; }
      const candidate = [segment, ...best[to]!], previous = best[from];
      if (!previous || candidate.length < previous.length || candidate.length === previous.length && durationMs > previous[0].durationMs) best[from] = candidate;
    }
  }
  if (!best[0]) return { ok: false, issues: [issue("DURATION_UNREPRESENTABLE", "durationMs",
    `No exact plan at approved scene boundaries for ${input.durationMs}ms; allowed segment durations: ${cap.supportedDurationsMs.join(",")}ms`), ...blocked.values()] };
  const segments: GenerationSegment[] = best[0].map((content, index) => {
    const fingerprint = digest("segment", { source: input.source, scope: input.scope, inputFingerprint, content });
    return { ...content, id: `segment-${index + 1}-${fingerprint.slice(0, 16)}`, fingerprint,
      estimate: provider.estimateCost({ durationMs: content.durationMs, aspectRatio: input.aspectRatio, resolution: input.resolution }) };
  });
  return { ok: true, plan: { version: segmentPlanVersion, executable: false, capabilitySnapshot: cap, capabilityHash,
    scope: input.scope, source: input.source, inputFingerprint, fingerprint: digest("plan", { inputFingerprint, capabilityHash, segments }), segments } };
}
