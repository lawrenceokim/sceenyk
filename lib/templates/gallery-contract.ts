import { z } from "zod";
import { ownedListingSchema } from "@/lib/marketplace/contract";

export const templateGalleryCardSchema = ownedListingSchema.extend({
  estimate: z.object({ credits: z.number(), test: z.boolean() }).nullable(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  videoVersion: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  posterVersion: z.string().regex(/^[a-f0-9]{64}$/),
  posterKind: z.enum(["image", "video"]).nullable(),
});
export type TemplateGalleryCard = z.infer<typeof templateGalleryCardSchema>;
export const templateGalleryInput = z.strictObject({
  page: z.number().int().min(1).max(100000),
  known: z.record(z.uuid(), z.string().regex(/^[a-f0-9]{64}$/)).refine(value => Object.keys(value).length <= 12).default({}),
});
export const templateGalleryReply = z.object({
  clerkUserId: z.string().min(1), page: z.number().int().positive(), pageSize: z.literal(12),
  total: z.number().int().nonnegative(), ids: z.array(z.uuid()).max(12), changed: z.record(z.uuid(), templateGalleryCardSchema),
});
export type TemplateGalleryReply = z.infer<typeof templateGalleryReply>;
