import { z } from "zod";
import { captionTrackSchema, type CaptionTrack } from "./contract";
import { compositionPlanSchema, type CompositionPlan } from "@/lib/composition/contract";
import { captionStyleSelectionSchema, resolveCaptionStyle, resolvedCaptionStyleSchema, type CaptionStyleSelection } from "./style";

export const rendererCaptionPayloadSchema = z.strictObject({
  schema_version: z.literal(1), generation_job_id: z.uuid(),
  composition_version: z.literal(1), style_version: z.literal(1),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]),
  total_duration_ms: z.number().int().positive().max(600_000),
  enabled: z.boolean(), style: resolvedCaptionStyleSchema,
  cues: z.array(z.strictObject({ id: z.string().regex(/^s\d+-c\d+$/),
    scene_id: z.uuid(), scene_order: z.number().int().positive().max(20),
    start_ms: z.number().int().nonnegative(), end_ms: z.number().int().positive(),
    text: z.string().min(1).max(4000),
  })).max(2000),
});
export type RendererCaptionPayload = z.infer<typeof rendererCaptionPayloadSchema>;

// Read-only handoff. It never submits work or changes renderer/job state.
export function serializeRendererCaptions(input: {
  track: CaptionTrack; plan: CompositionPlan; style: CaptionStyleSelection; enabled: boolean;
}): RendererCaptionPayload {
  const track = captionTrackSchema.parse(input.track), plan = compositionPlanSchema.parse(input.plan);
  const selection = captionStyleSelectionSchema.parse(input.style);
  if (track.status !== "ready" || plan.status !== "ready" ||
    track.generation_job_id !== plan.generation_job_id ||
    track.total_duration_ms !== plan.total_duration_ms || track.aspect_ratio !== plan.aspect_ratio ||
    typeof input.enabled !== "boolean") throw new Error("CAPTION_HANDOFF_UNAVAILABLE");
  for (const cue of track.cues) {
    const scene = plan.scenes.find(item => item.scene_execution_id === cue.scene_id);
    if (!scene || scene.scene_order !== cue.scene_order || !scene.narration ||
      cue.start_ms < scene.narration.start_ms || cue.end_ms > scene.narration.end_ms)
      throw new Error("CAPTION_HANDOFF_UNAVAILABLE");
  }
  return rendererCaptionPayloadSchema.parse({
    schema_version: 1, generation_job_id: track.generation_job_id,
    composition_version: track.composition_version, style_version: selection.schema_version,
    aspect_ratio: track.aspect_ratio, total_duration_ms: track.total_duration_ms,
    enabled: input.enabled, style: resolveCaptionStyle(selection, track.aspect_ratio),
    cues: track.cues.map(cue => ({ id: cue.id, scene_id: cue.scene_id, scene_order: cue.scene_order,
      start_ms: cue.start_ms, end_ms: cue.end_ms, text: cue.text })),
  });
}
