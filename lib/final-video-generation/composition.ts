import type { VideoGenerationPackage } from "@/lib/video-generation-package/contract";
import type { CapabilityIssue } from "./capabilities";
import type { AudioCue } from "@/lib/execution-v1/contract";

export const compositionProfile = { version: "composition-transitions-v2", frameRate: 25,
  transitions: ["cut", "fade_in", "fade_out", "crossfade"] as const,
  durationPolicy: "explicit-frame-aligned" as const, timingPolicy: "approved-overlap-only" as const,
  audioMixing: "preserve-speech-require-owned-sound" as const } as const;
export type CompositionCapabilities = typeof compositionProfile;
export type TransitionKind = CompositionCapabilities["transitions"][number];
export type TransitionRequest = string | { type: string; durationMs?: number };
export type CompositionSegment = { id: string; number: number; startMs: number; endMs: number; durationMs: number;
  transition: TransitionRequest; audio: { background: string | AudioCue; effects: string | AudioCue; music: string | AudioCue };
  speech: readonly { startMs: number; endMs: number; text: string }[] };
export type CompositionRequirements = { totalDurationMs: number; scenes: readonly CompositionSegment[] };
export type ResolvedTransition = { requested: string; type: TransitionKind; durationMs: number };
export type CompositionPlan = { version: CompositionCapabilities["version"]; frameRate: 25; totalDurationMs: number;
  scenes: { id: string; number: number; startMs: number; endMs: number; durationMs: number; transition: ResolvedTransition }[] };
const supported = ["cut", "fade / fade in / fade out (explicit duration)", "crossfade / dissolve (explicit duration and approved overlap)"] as const;
const silence = /^(?:none|no(?:ne)?(?: music| sound effects| effects| background(?: audio| sound)?)?|silent|silence|quiet|n\/a)\.?$/i;
export const compositionRequirements = (doc: VideoGenerationPackage): CompositionRequirements =>
  ({ totalDurationMs: doc.timeline.totalDurationMs, scenes: doc.scenes });

function normalize(request: TransitionRequest) {
  const requested = typeof request === "string" ? request : request.type;
  let name = requested.trim().toLowerCase().replace(/\.$/, ""), durationMs = typeof request === "string" ? undefined : request.durationMs;
  if (typeof request === "string") {
    const timed = name.match(/^(.*?)\s+(?:(?:over|for)\s+)?\(?(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|s)\)?$/);
    if (timed) { name = timed[1]; durationMs = Number(timed[2]) * (/^(?:ms|milliseconds?)$/.test(timed[3]) ? 1 : 1000); }
  }
  const type: TransitionKind | null = /^(?:cut|none|no transition|hard cut|straight cut)(?: (?:to|into) (?:the )?next shot)?$/.test(name) ? "cut" :
    /^(?:cross[ -]?fade|dissolve)(?: (?:to|into) (?:the )?next shot)?$/.test(name) ? "crossfade" :
    /^fade[ _-]?in(?: cleanly| from black)?$/.test(name) ? "fade_in" :
    /^(?:fade|fade[ _-]?out)(?: cleanly| to black)?$/.test(name) ? "fade_out" : null;
  return { requested, type, durationMs: type === "cut" && durationMs === undefined ? 0 : durationMs };
}

export function checkComposition(requirements: CompositionRequirements, capabilities: CompositionCapabilities = compositionProfile) {
  const issues: CapabilityIssue[] = [], scenes: CompositionPlan["scenes"] = [];
  const add = (code: string, message: string, scene?: CompositionSegment, transition = false) => issues.push({ layer: "composition", code,
    message: `${scene ? `scene-${scene.number}: ` : ""}${message} (layer: composition; FFmpeg profile).`, sceneNumber: scene?.number,
    ...(transition && scene ? { requestedTransition: typeof scene.transition === "string" ? scene.transition : scene.transition.type, supportedTransitions: supported } : {}) });
  if (capabilities?.version !== compositionProfile.version) {
    add("COMPOSITION_PROFILE_UNSUPPORTED", "The frozen composition profile is unsupported"); return { issues, plan: null };
  }
  const frame = 1000 / capabilities.frameRate;
  if (!requirements.scenes.length || !Number.isSafeInteger(requirements.totalDurationMs) || requirements.totalDurationMs <= 0 || requirements.totalDurationMs > 120000)
    add("COMPOSITION_TIMELINE_INVALID", "A nonempty, bounded approved final timeline is required");
  const ids = new Set<string>(); let overlapMs = 0;
  for (const [index, scene] of requirements.scenes.entries()) {
    const validTiming = [scene.startMs, scene.endMs, scene.durationMs].every(n => Number.isSafeInteger(n) && n >= 0 && n % frame === 0) &&
      scene.durationMs > 0 && scene.endMs - scene.startMs === scene.durationMs;
    if (!validTiming || scene.number !== index + 1 || ids.has(scene.id)) add("COMPOSITION_SCENE_ORDER_INVALID", "Scene order/intervals must match the approved frame-aligned timeline", scene);
    ids.add(scene.id);
    const parsed = normalize(scene.transition), next = requirements.scenes[index + 1];
    if (!parsed.type) add("COMPOSITION_TRANSITION_UNSUPPORTED", `transition ${JSON.stringify(parsed.requested)} is not supported. Supported transitions: ${supported.join(", ")}`, scene, true);
    else if (parsed.durationMs === undefined) add("COMPOSITION_TRANSITION_DURATION_REQUIRED", `transition ${JSON.stringify(parsed.requested)} requires an explicit duration, for example \"${parsed.type === "crossfade" ? "Dissolve" : "Fade out"} over 400ms\". ${parsed.type === "crossfade" ? "The approved timeline must also allocate this overlap; contiguous clips cannot be shortened or padded." : "The fade stays inside its approved scene interval."} Supported transitions: ${supported.join(", ")}`, scene, true);
    else if (!Number.isSafeInteger(parsed.durationMs) || parsed.durationMs % frame !== 0 || parsed.durationMs < 0 ||
      (parsed.type === "cut" ? parsed.durationMs !== 0 : parsed.durationMs === 0 || parsed.durationMs >= scene.durationMs) ||
      parsed.type === "crossfade" && (!next || parsed.durationMs >= next.durationMs))
      add("COMPOSITION_TRANSITION_DURATION_INVALID", `transition ${JSON.stringify(parsed.requested)} requires a valid ${frame}ms-aligned duration inside its source scene(s)`, scene, true);
    else {
      const transition = { requested: parsed.requested, type: parsed.type, durationMs: parsed.durationMs };
      scenes.push({ id: scene.id, number: scene.number, startMs: scene.startMs, endMs: scene.endMs, durationMs: scene.durationMs, transition });
      if (next) {
        const overlap = scene.endMs - next.startMs;
        const required = parsed.type === "crossfade" ? parsed.durationMs : 0;
        if (overlap !== required) add("COMPOSITION_TRANSITION_TIMING_MISMATCH", `transition ${JSON.stringify(parsed.requested)} requires ${required}ms of explicitly approved overlap; the scene intervals provide ${overlap}ms. Applying it would change the approved ${requirements.totalDurationMs}ms timeline. Do not pad, freeze or retime scenes`, scene, true);
        overlapMs += required;
      }
    }
    for (const role of ["background", "effects", "music"] as const) {
      const cue = scene.audio[role];
      if (typeof cue === "string" ? !silence.test(cue.trim()) : cue.requirement === "required" || cue.assetId !== null)
        add("AUDIO_ASSET_REQUIRED", `required ${role} audio has no owned asset binding; it cannot be silently omitted`, scene);
    }
  }
  const sum = requirements.scenes.reduce((n, s) => n + s.durationMs, 0);
  if (requirements.scenes[0]?.startMs !== 0 || requirements.scenes.at(-1)?.endMs !== requirements.totalDurationMs ||
    scenes.length === requirements.scenes.length && sum - overlapMs !== requirements.totalDurationMs)
    add("COMPOSITION_FINAL_TIMING_MISMATCH", `Scene durations minus declared overlaps must equal the approved ${requirements.totalDurationMs}ms final duration`);
  const speech = requirements.scenes.flatMap(scene => scene.speech.filter(line => line.text.trim()).map(line => ({ ...line, scene }))).sort((a, b) => a.startMs - b.startMs);
  let end = 0;
  for (const line of speech) {
    if (line.startMs < end || line.startMs < line.scene.startMs || line.endMs > line.scene.endMs || line.endMs <= line.startMs)
      add("SPEECH_OVERLAP", "Required speech cannot overlap or exceed its approved scene window", line.scene);
    end = Math.max(end, line.endMs);
  }
  const plan: CompositionPlan | null = issues.length ? null : { version: capabilities.version, frameRate: 25, totalDurationMs: requirements.totalDurationMs, scenes };
  return { issues, plan };
}
