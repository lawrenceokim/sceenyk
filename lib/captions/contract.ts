import { z } from "zod";
import { compositionPlanSchema, type CompositionPlan } from "@/lib/composition/contract";

// Readability defaults are versioned together with the deterministic algorithm.
export const captionConfiguration = {
  schema_version: 1, preferred_words: 7, line_characters: 42,
  min_duration_ms: 400, max_duration_ms: 6000, max_lines: 2,
} as const;
export const captionStyle = {
  placement: "bottom-center", font_family: "Inter, Arial, sans-serif",
  font_size_height_percent: 4.5, text_color: "#FFFFFF",
  background_color: "#080B0F", background_opacity: 0.75,
  shadow: "subtle", max_lines: 2, max_width: "safe-area", overflow: "shrink-to-fit",
  safe_area_percent: {
    "16:9": { horizontal: 8, bottom: 8 },
    "9:16": { horizontal: 10, bottom: 18 },
    "1:1": { horizontal: 8, bottom: 10 },
  },
} as const;
const ms = z.number().int().nonnegative().max(600_000);
const text = z.string().trim().min(1).max(4000).refine(value =>
  !/[\u0000-\u001f\u007f]|https?:\/\//iu.test(value), "Unsafe caption text.");
export const captionSourceSchema = z.strictObject({
  plan: compositionPlanSchema,
  narration: z.array(z.strictObject({ id: z.uuid(), scene_execution_id: z.uuid(),
    scene_order: z.number().int().positive(), output_asset_id: z.uuid(),
    actual_duration_ms: ms, text: z.string().min(1).max(4000),
  })).max(20),
});
export type CaptionSource = z.infer<typeof captionSourceSchema>;
export const captionCueSchema = z.strictObject({
  id: z.string().regex(/^s\d+-c\d+$/), generation_job_id: z.uuid(),
  scene_id: z.uuid(), scene_order: z.number().int().positive().max(20),
  narration_id: z.uuid(), start_ms: ms, end_ms: ms, text,
  cue_order: z.number().int().positive().max(2000),
});
export const captionTrackSchema = z.strictObject({
  schema_version: z.literal(1), generation_job_id: z.uuid(),
  composition_version: z.literal(1), alignment: z.literal("estimated_phrase"),
  status: z.enum(["ready", "timing_issue"]),
  issue: z.enum(["SOURCE_MISMATCH", "READABILITY_LIMIT", "TIMING_LIMIT"]).nullable(),
  configuration: z.strictObject({ schema_version: z.literal(captionConfiguration.schema_version),
    preferred_words: z.literal(captionConfiguration.preferred_words), line_characters: z.literal(captionConfiguration.line_characters),
    min_duration_ms: z.literal(captionConfiguration.min_duration_ms), max_duration_ms: z.literal(captionConfiguration.max_duration_ms),
    max_lines: z.literal(captionConfiguration.max_lines) }),
  total_duration_ms: ms, aspect_ratio: z.enum(["16:9", "9:16", "1:1"]),
  cues: z.array(captionCueSchema).max(2000),
}).superRefine((track, ctx) => {
  const invalid = () => ctx.addIssue({ code: "custom", message: "Invalid caption track." });
  if (track.status === "timing_issue") { if (!track.issue || track.cues.length) invalid(); return; }
  if (track.issue) invalid();
  let end = 0;
  for (const [index, cue] of track.cues.entries()) {
    if (cue.generation_job_id !== track.generation_job_id || cue.cue_order !== index + 1 ||
      cue.start_ms < end || cue.end_ms <= cue.start_ms || cue.end_ms > track.total_duration_ms ||
      cue.end_ms - cue.start_ms < captionConfiguration.min_duration_ms ||
      cue.end_ms - cue.start_ms > captionConfiguration.max_duration_ms ||
      wrapCaption(cue.text).length > captionConfiguration.max_lines) invalid();
    end = cue.end_ms;
  }
  if (new Set(track.cues.map(cue => cue.id)).size !== track.cues.length) invalid();
});
export type CaptionTrack = z.infer<typeof captionTrackSchema>;
export type CaptionRow = { id: string; job_id: string; owner_user_id: string;
  project_id: string; input_digest: string; track: CaptionTrack; created_at: string };
export type CaptionPreferenceRow = { job_id: string; owner_user_id: string; project_id: string; enabled: boolean };
export const normalizeCaptionText = (value: string) => value.replace(/\s+/gu, " ").trim();
export function wrapCaption(value: string): string[] {
  const lines: string[] = []; let line = "";
  for (const word of value.split(" ")) {
    if (Array.from(word).length > captionConfiguration.line_characters) return ["", "", ""];
    if (line && Array.from(`${line} ${word}`).length > captionConfiguration.line_characters) {
      lines.push(line); line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
export function validateCaptionSource(track: CaptionTrack, source: CaptionSource) {
  const plan: CompositionPlan = source.plan;
  if (plan.status !== "ready" || track.generation_job_id !== plan.generation_job_id ||
    track.total_duration_ms !== plan.total_duration_ms || track.aspect_ratio !== plan.aspect_ratio) throw new Error("SOURCE_MISMATCH");
  if (track.status !== "ready") return;
  for (const scene of plan.scenes) {
    const cues = track.cues.filter(cue => cue.scene_id === scene.scene_execution_id);
    if (!scene.narration) { if (cues.length) throw new Error("SOURCE_MISMATCH"); continue; }
    const speech = source.narration.find(n => n.scene_execution_id === scene.scene_execution_id);
    if (!speech || speech.scene_order !== scene.scene_order || speech.output_asset_id !== scene.narration.asset_id ||
      speech.actual_duration_ms !== scene.narration.actual_duration_ms || !cues.length ||
      cues[0].start_ms !== scene.narration.start_ms || cues.at(-1)?.end_ms !== scene.narration.end_ms ||
      cues.map(cue => cue.text).join(" ") !== normalizeCaptionText(speech.text)) throw new Error("SOURCE_MISMATCH");
    for (const [index, cue] of cues.entries()) if (cue.narration_id !== speech.id || cue.scene_order !== scene.scene_order ||
      cue.start_ms < scene.narration.start_ms || cue.end_ms > scene.narration.end_ms ||
      (index > 0 && cue.start_ms !== cues[index - 1].end_ms)) throw new Error("SOURCE_MISMATCH");
  }
  if (track.cues.some(cue => !plan.scenes.some(scene => scene.scene_execution_id === cue.scene_id))) throw new Error("SOURCE_MISMATCH");
}
