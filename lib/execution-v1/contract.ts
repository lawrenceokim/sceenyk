import { z } from "zod";

export const transitionSchema = z.strictObject({ type: z.enum(["none", "cut", "crossfade", "fade_in", "fade_out"]),
  durationMs: z.number().int().min(0).max(2000) });
export type Transition = z.infer<typeof transitionSchema>;
export const voiceDeliverySchema = z.strictObject({ pace: z.enum(["slow", "natural", "energetic"]),
  energy: z.enum(["calm", "balanced", "lively"]), tone: z.enum(["neutral", "warm", "confident"]),
  emphasis: z.enum(["none", "light"]), style: z.enum(["natural", "conversational", "expressive"]) });
export type VoiceDelivery = z.infer<typeof voiceDeliverySchema>;
export const audioCueSchema = z.strictObject({ requirement: z.enum(["none", "optional", "required"]),
  description: z.string().max(2000), assetId: z.uuid().nullable() });
export type AudioCue = z.infer<typeof audioCueSchema>;
export const executionProfile = { version: "ugc-execution-v1", sceneDuration: { minimumMs: 4000, maximumMs: 30000, incrementMs: 1000 },
  dialogueMaximumSceneMs: 10000, frameMs: 40, requiredOwnedAudio: false, maximumTransitionMs: 2000 } as const;
export const defaultDelivery = (pace: VoiceDelivery["pace"] = "natural"): VoiceDelivery =>
  ({ pace, energy: "balanced", tone: "neutral", emphasis: "none", style: "natural" });
export const executableSceneSchema = z.object({ number: z.number().int(), startMs: z.number().int(), endMs: z.number().int(),
  transition: transitionSchema, audio: z.strictObject({ background: audioCueSchema, effects: audioCueSchema, music: audioCueSchema }),
  speech: z.array(z.object({ startMs: z.number().int(), endMs: z.number().int(), text: z.string(), speaker: z.string(), delivery: voiceDeliverySchema }).passthrough()) }).passthrough();
export type ExecutableScene = { number: number; startMs: number; endMs: number; transition: Transition;
  audio: { background: AudioCue; effects: AudioCue; music: AudioCue };
  speech: readonly { startMs: number; endMs: number; text: string; speaker: string; delivery: VoiceDelivery }[] };
export type ExecutionIssue = { code: string; sceneNumber?: number; field: string; expected: string };
export function executionIssues(doc: { schemaVersion: number; durationMs: number; scenes: readonly ExecutableScene[] }): ExecutionIssue[] {
  const issues: ExecutionIssue[] = [];
  const add = (code: string, field: string, expected: string, sceneNumber?: number) => issues.push({ code, field, expected, sceneNumber });
  if (doc.schemaVersion !== 2) add("EXECUTION_CONTRACT_REQUIRED", "schemaVersion", "schema 2 canonical execution contract");
  let end = 0, overlap = 0;
  for (const [index, scene] of doc.scenes.entries()) {
    const p = `scenes[${index}]`, duration = scene.endMs - scene.startMs;
    if (duration < 4000 || duration > 30000 || duration % 1000) add("EXECUTION_SCENE_DURATION", `${p}.endMs`, "whole-second scene duration 4000..30000ms", scene.number);
    if (scene.speech.some(line => line.text.trim() && line.speaker === "character") && duration > 10000)
      add("EXECUTION_LIP_SYNC_DURATION", `${p}.endMs`, "Character dialogue scene no longer than 10000ms", scene.number);
    const parsed = transitionSchema.safeParse(scene.transition);
    if (!parsed.success) { add("EXECUTION_TRANSITION_INVALID", `${p}.transition`, "structured supported transition and duration", scene.number); continue; }
    const t = parsed.data, next = doc.scenes[index + 1];
    if (t.type === "none" || t.type === "cut") {
      if (t.durationMs !== 0) add("EXECUTION_TRANSITION_DURATION", `${p}.transition.durationMs`, "zero for cut/none", scene.number);
    } else if (!t.durationMs || t.durationMs % 40 || t.durationMs >= duration || t.type === "crossfade" && (!next || t.durationMs >= next.endMs - next.startMs))
      add("EXECUTION_TRANSITION_DURATION", `${p}.transition.durationMs`, "positive 40ms-aligned duration inside scene(s)", scene.number);
    const previous = doc.scenes[index - 1];
    const incoming = previous?.transition.type === "crossfade" ? previous.transition.durationMs : 0;
    if (scene.startMs !== end - incoming) add("EXECUTION_TRANSITION_TIMING", `${p}.startMs`, "previous end minus explicitly approved overlap", scene.number);
    overlap += incoming; end = scene.endMs;
    for (const role of ["background", "effects", "music"] as const) {
      const cue = audioCueSchema.safeParse(scene.audio[role]);
      if (!cue.success) add("EXECUTION_AUDIO_INVALID", `${p}.audio.${role}`, "structured optional/none cue or verified required binding", scene.number);
      else if (cue.data.requirement === "required" || cue.data.assetId !== null)
        add("EXECUTION_AUDIO_BINDING_UNAVAILABLE", `${p}.audio.${role}`, "no owned audio manifest exists in V1; only optional/none cues with null binding are executable", scene.number);
    }
    for (const [i, line] of scene.speech.entries()) if (!voiceDeliverySchema.safeParse(line.delivery).success)
      add("EXECUTION_VOICE_DELIVERY", `${p}.speech[${i}].delivery`, "finite canonical VoiceDelivery", scene.number);
  }
  if (doc.scenes[0]?.startMs !== 0 || end !== doc.durationMs || doc.scenes.reduce((sum, s) => sum + s.endMs - s.startMs, 0) - overlap !== doc.durationMs)
    add("EXECUTION_TOTAL_DURATION", "durationMs", "source durations minus approved overlaps equal selected duration");
  const lines = doc.scenes.flatMap(s => s.speech.filter(l => l.text.trim()).map(l => ({ ...l, scene: s.number }))).sort((a, b) => a.startMs - b.startMs);
  let speechEnd = 0;
  for (const line of lines) { if (line.startMs < speechEnd) add("EXECUTION_SPEECH_OVERLAP", "speech", "single-Character speech intervals cannot overlap across scene transitions", line.scene); speechEnd = Math.max(speechEnd, line.endMs); }
  return issues;
}
