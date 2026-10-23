import { z } from "zod";

export const referenceNameLimit = 80;
// Empty names are valid in an unfinished draft, but never generation-ready.
export const referenceNameDraftSchema = z.string().trim().max(referenceNameLimit, `Keep reference names within ${referenceNameLimit} characters.`);
export const referenceNameSchema = referenceNameDraftSchema.min(1);
export const saveReferenceNamesSchema = z.array(z.strictObject({
  assetId: z.uuid(), name: referenceNameDraftSchema,
})).max(256).refine(rows => new Set(rows.map(row => row.assetId)).size === rows.length);
