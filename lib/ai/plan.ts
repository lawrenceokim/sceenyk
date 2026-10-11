import { z } from "zod";
import { saveProjectSchema } from "@/lib/projects/validation";
import type { GenerationSnapshot } from "@/lib/generation/types";

const text = z.string().trim().min(1).max(4000);
const optionalText = text.nullable();
export const productionPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  summary: text,
  contentIntent: text,
  sourceMediaSummary: z.array(z.strictObject({
    assetId: z.uuid(), summary: text, durationSeconds: z.number().positive().nullable(),
  })).max(8),
  targetDuration: z.number().int().positive().max(30),
  aspectRatio: saveProjectSchema.shape.settings.shape.aspectRatio,
  tone: saveProjectSchema.shape.settings.shape.tone,
  visualStyle: saveProjectSchema.shape.settings.shape.visualStyle,
  narrationRequired: z.boolean(),
  scenePlan: z.array(z.strictObject({
    order: z.number().int().positive().max(20),
    durationSeconds: z.number().positive().max(30),
    purpose: text,
    source: z.enum(["original", "transformed", "generated"]),
    assetId: z.uuid().nullable(),
    startTime: z.number().nonnegative().nullable(),
    endTime: z.number().positive().nullable(),
    description: text,
    transformationInstruction: optionalText,
    narration: optionalText,
    caption: optionalText,
    transition: text,
  })).min(1).max(20),
  audioNotes: z.array(text).max(20),
  editingNotes: z.array(text).max(20),
});
export type ProductionPlan = z.infer<typeof productionPlanSchema>;
export type PlanMedia = { id: string; mimeType: string; sizeBytes: number; durationSeconds?: number | null };

// Structured JSON is only the first boundary: enforce the admitted request,
// actual source IDs and timeline semantics before accepting a provider result.
export function validateProductionPlan(value: unknown, input: GenerationSnapshot, media: PlanMedia[]) {
  const plan = productionPlanSchema.parse(value);
  if (plan.targetDuration !== Number(input.settings.duration) || plan.aspectRatio !== input.settings.aspectRatio ||
      plan.tone !== input.settings.tone || plan.visualStyle !== input.settings.visualStyle) throw new Error("PLAN_SETTINGS_MISMATCH");
  const assets = new Map(media.map(m => [m.id, m]));
  const summaries = new Map(plan.sourceMediaSummary.map(m => [m.assetId, m]));
  if (summaries.size !== media.length || plan.sourceMediaSummary.length !== media.length ||
      media.some(m => !summaries.has(m.id))) throw new Error("PLAN_SOURCE_MISMATCH");
  let duration = 0;
  for (const [index, scene] of plan.scenePlan.entries()) {
    duration += scene.durationSeconds;
    if (scene.order !== index + 1) throw new Error("PLAN_SCENE_ORDER");
    if (scene.source === "generated") {
      if (scene.assetId !== null || scene.startTime !== null || scene.endTime !== null || scene.transformationInstruction !== null) throw new Error("PLAN_GENERATED_SOURCE");
    } else {
      const asset = scene.assetId ? assets.get(scene.assetId) : null;
      if (!asset || asset.mimeType.startsWith("audio/")) throw new Error("PLAN_UNKNOWN_SOURCE");
      if (scene.source === "transformed" ? !scene.transformationInstruction : scene.transformationInstruction !== null) throw new Error("PLAN_TRANSFORMATION");
      if (asset.mimeType.startsWith("video/")) {
        const limit = asset.durationSeconds ?? summaries.get(asset.id)?.durationSeconds;
        if (scene.startTime === null || scene.endTime === null || scene.endTime <= scene.startTime ||
            limit === null || limit === undefined || scene.endTime > limit + 0.1) throw new Error("PLAN_SOURCE_RANGE");
      } else if (scene.startTime !== null || scene.endTime !== null) throw new Error("PLAN_IMAGE_RANGE");
    }
  }
  if (Math.abs(duration - plan.targetDuration) > 0.1 || plan.narrationRequired !== plan.scenePlan.some(s => s.narration !== null)) throw new Error("PLAN_TIMELINE_OR_NARRATION");
  return plan;
}
