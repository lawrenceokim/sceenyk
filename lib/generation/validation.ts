import { z } from "zod";
import { saveProjectSchema } from "@/lib/projects/validation";
import { projectPromptLimit, projectPageSize } from "@/lib/projects/options";
import { generationStages, generationStatuses } from "./contract";

export const generationInputsSchema = z.strictObject({
  prompt: z
    .string()
    .trim()
    .min(1, "Describe what you want to create.")
    .max(projectPromptLimit),
  category: saveProjectSchema.shape.category,
  settings: saveProjectSchema.shape.settings,
  // A technical payload bound, not a product quota. Stable order aids retries.
  assetIds: z
    .array(z.uuid())
    .max(256)
    .transform((ids) => [...new Set(ids)].sort()),
});
export const createGenerationSchema = z.strictObject({
  projectId: z.uuid(),
  requestId: z.uuid(),
  inputs: generationInputsSchema,
});
export const confirmGenerationSchema = z.strictObject({ quoteId: z.uuid() });
export const generationReferenceSchema = z.strictObject({
  projectId: z.uuid(),
  jobId: z.uuid(),
});
export const generationVersionSchema = z.strictObject({
  status: z.enum(generationStatuses),
  stage: z.enum(generationStages).nullable(),
});
export const generationProjectIdsSchema = z
  .array(z.uuid())
  .max(projectPageSize);
