import { z } from "zod";
import { videoResolutionSchema } from "./video-resolution";
import { saveReferenceNamesSchema } from "./reference-names";
import {
  aspectRatios,
  categoryIds,
  durations,
  storedDurationValues,
  studioDurationValues,
  visualStyles,
  tones,
  projectTitleLimit,
  projectPromptLimit,
  creationTypes,
  ugcTypes,
} from "./options";

export const projectIdSchema = z.uuid();
export const saveProjectSchema = z.strictObject({
  id: projectIdSchema,
  mode: z.enum(["create", "update"]),
  title: z
    .string()
    .trim()
    .min(1, "Give your project a title.")
    .max(
      projectTitleLimit,
      `Keep the title within ${projectTitleLimit} characters.`,
    ),
  category: z.enum(categoryIds),
  // Omitted values belong to older clients/projects with the general flow.
  creationType: z.enum(creationTypes).default("freestyle"),
  ugcType: z.enum(ugcTypes.map(({ value }) => value)).default("advertisement"),
  referenceNames: saveReferenceNamesSchema.optional(),
  prompt: z
    .string()
    .max(
      projectPromptLimit,
      `Keep the prompt within ${projectPromptLimit.toLocaleString()} characters.`,
    ),
  settings: z.strictObject({
    resolution: videoResolutionSchema.optional(),
    aspectRatio: z.enum(aspectRatios.map(({ value }) => value)),
    duration: z.enum(studioDurationValues),
    visualStyle: z.enum(visualStyles),
    tone: z.enum(tones),
  }),
});
// Drafts may carry Pro settings. Execution/retail/template validators retain the
// exact historical allowed values, without coercing an extended draft duration.
export const legacyDurationSchema = z.enum(studioDurationValues).refine(
  value => storedDurationValues.some(duration => duration === value), "Choose a supported duration for this workflow.",
);
export const legacyProjectSettingsSchema = saveProjectSchema.shape.settings.extend({
  duration: legacyDurationSchema,
});
export const saveStudioProjectSchema = saveProjectSchema;
export const projectPageSchema = z.number().int().min(1).max(100_000);
// New UGC requests use current choices; stored projects/snapshots retain legacy reads.
export const ugcSettingsSchema = saveProjectSchema.shape.settings.extend({
  duration: z.enum(durations.map(({ value }) => value)),
});
export const renameProjectSchema = z.strictObject({
  id: projectIdSchema,
  title: saveProjectSchema.shape.title,
});
export const deleteProjectSchema = z.strictObject({ id: projectIdSchema });
