import { z } from "zod";
import {
  aspectRatios,
  categoryIds,
  durations,
  visualStyles,
  tones,
  projectTitleLimit,
  projectPromptLimit,
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
  prompt: z
    .string()
    .max(
      projectPromptLimit,
      `Keep the prompt within ${projectPromptLimit.toLocaleString()} characters.`,
    ),
  settings: z.strictObject({
    aspectRatio: z.enum(aspectRatios.map(({ value }) => value)),
    duration: z.enum(durations.map(({ value }) => value)),
    visualStyle: z.enum(visualStyles),
    tone: z.enum(tones),
  }),
});
export const projectPageSchema = z.number().int().min(1).max(100_000);
