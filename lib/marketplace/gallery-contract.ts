import { z } from "zod";
import { browseSchema, listingSchema } from "./contract";

export const marketplaceCardSchema = listingSchema.extend({
  estimate: z.object({ credits: z.number(), test: z.boolean() }).nullable(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  videoVersion: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  posterVersion: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});
export type MarketplaceCard = z.infer<typeof marketplaceCardSchema>;
export const galleryInputSchema = browseSchema.extend({
  pages: z.number().int().min(1).max(20).default(1),
  known: z.record(z.uuid(), z.string().regex(/^[a-f0-9]{64}$/)).refine(v => Object.keys(v).length <= 240).default({}),
});
export const galleryReplySchema = z.object({
  ids: z.array(z.uuid()).max(240), changed: z.record(z.uuid(), marketplaceCardSchema),
  total: z.number().int().nonnegative(), page: z.number().int().positive(), pages: z.number().int().positive(),
});
export type MarketplaceGalleryReply = z.infer<typeof galleryReplySchema>;
