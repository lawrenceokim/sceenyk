import { z } from "zod";
import { categoryIds } from "@/lib/projects/options";

export const creationPreferencesSchema = z.strictObject({
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  category: z.enum(categoryIds),
});
export type CreationPreferences = z.infer<typeof creationPreferencesSchema>;
export const defaultCreationPreferences: CreationPreferences = { aspectRatio: "16:9", category: "cinematic" };
