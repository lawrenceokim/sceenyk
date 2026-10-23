import { z } from "zod";
import { saveProjectSchema, ugcSettingsSchema } from "./validation";
import { ugcNarrationSchema } from "@/lib/ugc-jobs/input-contract";
import { referenceNameSchema } from "./reference-names";

export const ugcV1ReferenceLimit = 1;
export const ugcV1LimitMessages = {
  character: "UGC V1 supports one character. Remove extra characters to continue.",
  product: "UGC V1 supports one product / prop. Remove extra products / props to continue.",
} as const;

export function ugcV1SelectionError(role: keyof typeof ugcV1LimitMessages, currentCount: number, selectedCount: number) {
  return currentCount + selectedCount > ugcV1ReferenceLimit ? ugcV1LimitMessages[role] : null;
}

// Drafts can be incomplete. They cannot acquire a second reference of either kind.
export const ugcV1ReferenceLimitsSchema = z.strictObject({
  characters: z.array(z.unknown()).max(ugcV1ReferenceLimit, ugcV1LimitMessages.character),
  products: z.array(z.unknown()).max(ugcV1ReferenceLimit, ugcV1LimitMessages.product),
});

const readyReference = z.strictObject({
  name: referenceNameSchema,
  referenceId: z.uuid("Upload the reference before generating."),
  assetId: z.uuid("Upload the reference before generating."),
});

// Future generation admission contract only: still requires independent owned,
// uploaded image resolution on the server. This schema starts no generation.
export const ugcV1GenerationInputsSchema = saveProjectSchema
  .omit({ id: true, mode: true })
  .extend({
    creationType: z.literal("ugc"),
    settings: ugcSettingsSchema,
    prompt: saveProjectSchema.shape.prompt.trim().min(1, "Describe your scene before generating."),
    characters: z.array(readyReference).length(1, "UGC V1 requires exactly one uploaded character."),
    products: z.array(readyReference).length(1, "UGC V1 requires exactly one uploaded product / prop."),
    narration: ugcNarrationSchema,
  });
