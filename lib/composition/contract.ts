import { z } from "zod";

const ms = z.number().int().nonnegative().max(600_000);
export const compositionConfiguration = {
  schema_version: 1, narration_offset_ms: 0, technical_tolerance_ms: 0,
} as const;
export const compositionIssueCodes = [
  "VISUAL_UNAVAILABLE", "NARRATION_UNAVAILABLE", "ASSET_UNCHECKED",
  "DURATION_UNAVAILABLE", "VISUAL_TOO_SHORT", "NARRATION_TOO_LONG",
  "UNSUPPORTED_TRANSITION", "PLAN_MISMATCH", "TOTAL_MISMATCH",
] as const;
const issue = z.strictObject({ scene_order: z.number().int().nonnegative().max(20), code: z.enum(compositionIssueCodes) });
export const compositionPlanSchema = z.strictObject({
  schema_version: z.literal(1), generation_job_id: z.uuid(),
  aspect_ratio: z.enum(["9:16", "16:9", "1:1"]), total_duration_ms: ms,
  configuration: z.strictObject({ schema_version: z.literal(1), narration_offset_ms: ms, technical_tolerance_ms: z.literal(0) }),
  status: z.enum(["ready", "conflict"]), issues: z.array(issue).max(200),
  scenes: z.array(z.strictObject({
    scene_execution_id: z.uuid(), scene_order: z.number().int().positive().max(20),
    start_ms: ms, end_ms: ms, duration_ms: ms,
    visual: z.strictObject({ asset_kind: z.enum(["scene_asset", "prepared_segment", "project_asset"]), asset_id: z.uuid(), media_type: z.enum(["video", "image"]), actual_duration_ms: ms.nullable(), input_start_ms: ms, input_end_ms: ms }).nullable(),
    narration: z.strictObject({ asset_id: z.uuid(), start_offset_ms: ms, actual_duration_ms: ms, start_ms: ms, end_ms: ms, trailing_silence_ms: ms }).nullable(),
    transition: z.strictObject({ type: z.enum(["none", "cut"]), duration_ms: z.literal(0) }),
    timing_status: z.enum(["valid", "conflict"]),
  })).min(1).max(20),
}).superRefine((plan, ctx) => {
  if (plan.status !== "ready") return; // Conflicts deliberately preserve invalid windows.
  let cursor = 0;
  const invalid = () => ctx.addIssue({ code: "custom", message: "Invalid ready composition timing." });
  if (plan.issues.length) invalid();
  for (const [index, scene] of plan.scenes.entries()) {
    if (scene.scene_order !== index + 1 || scene.start_ms !== cursor || scene.duration_ms <= 0 || scene.end_ms !== scene.start_ms + scene.duration_ms || scene.timing_status !== "valid") invalid();
    const visual = scene.visual, speech = scene.narration;
    if (!visual || visual.input_end_ms - visual.input_start_ms !== scene.duration_ms ||
      (visual.media_type === "video" ? visual.actual_duration_ms === null || visual.actual_duration_ms < visual.input_end_ms : visual.actual_duration_ms !== null)) invalid();
    if (speech && (speech.start_ms !== scene.start_ms + speech.start_offset_ms || speech.start_offset_ms !== plan.configuration.narration_offset_ms || speech.actual_duration_ms <= 0 || speech.end_ms !== speech.start_ms + speech.actual_duration_ms || speech.end_ms > scene.end_ms || speech.trailing_silence_ms !== scene.end_ms - speech.end_ms)) invalid();
    cursor = scene.end_ms;
  }
  if (cursor !== plan.total_duration_ms) invalid();
});
export type CompositionPlan = z.infer<typeof compositionPlanSchema>;
export type CompositionIssue = z.infer<typeof issue>;
export type CompositionRow = { job_id: string; owner_user_id: string; project_id: string; schema_version: 1; input_digest: string; status: "ready" | "conflict"; plan: CompositionPlan; created_at: string };
export type CompositionAssetCheck = { asset_kind: string; asset_id: string; owner_user_id: string; project_id: string; verified_etag: string; duration_ms: number | null; issue: string | null; checked_at: string };
export function compositionIssueMessage(value: CompositionIssue) {
  const scene = `Scene ${value.scene_order}`;
  switch (value.code) {
    case "NARRATION_TOO_LONG": return `Narration is longer than ${scene}.`;
    case "VISUAL_TOO_SHORT": return `${scene}'s visual is shorter than the planned duration.`;
    case "NARRATION_UNAVAILABLE": return `${scene}'s narration is unavailable.`;
    case "VISUAL_UNAVAILABLE": return `${scene}'s visual is unavailable.`;
    case "UNSUPPORTED_TRANSITION": return `${scene}'s transition needs adjustment.`;
    case "DURATION_UNAVAILABLE": case "ASSET_UNCHECKED": return `${scene}'s media timing could not be verified.`;
    default: return "The saved scene timing needs adjustment.";
  }
}
