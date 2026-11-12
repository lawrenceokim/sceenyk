import { z } from "zod";
import { acquisitionSchema } from "@/lib/marketplace/purchases/contract";

export const purchaseCardSchema = acquisitionSchema.extend({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  videoVersion: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  posterVersion: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PurchaseGalleryCard = z.infer<typeof purchaseCardSchema>;
export const purchaseGalleryInput = z.strictObject({
  page: z.number().int().min(1).max(100000),
  known: z.record(z.uuid(), z.string().regex(/^[a-f0-9]{64}$/)).refine(value => Object.keys(value).length <= 12).default({}),
});
export const purchaseGalleryReply = z.object({
  clerkUserId: z.string().min(1), page: z.number().int().positive(), pageSize: z.literal(12), total: z.number().int().nonnegative(),
  ids: z.array(z.uuid()).max(12), changed: z.record(z.uuid(), purchaseCardSchema),
});
export type PurchaseGalleryReply = z.infer<typeof purchaseGalleryReply>;
