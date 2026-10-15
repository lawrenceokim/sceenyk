import { z } from "zod";
import { saveProjectSchema } from "@/lib/projects/validation";

export const listingStatuses = ["draft", "published", "unpublished", "archived"] as const;
export const marketplacePageSize = 12;
// Match the SQL public-text guard. This supplements explicit creator review;
// it cannot decide whether the meaning of authored content is private/licensed.
const privateReference = /https?:\/\/|www\.|users\/|x-amz-|sb_secret_|sk_live_|sk_test_|bearer\s|user_[a-z0-9]{10}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
const publicText = (max: number) => z.string().trim().min(1, "Enter the public text for this field.").max(max)
  .refine(value => !privateReference.test(value), "Remove links, account IDs, email addresses and private access details from public text.");
const metadataFields = {
  title: publicText(120),
  description: publicText(2000),
  category: saveProjectSchema.shape.category,
  tags: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9 -]{0,29}$/, "Use short tags with letters, numbers, spaces or hyphens.")).max(8).transform(tags => [...new Set(tags)]),
  rightsConfirmed: z.boolean(),
  adoptionType: z.enum(["free", "paid"]).default("free"),
  priceMinor: z.number().int().min(0).max(100000).default(0),
};
export const createListingSchema = z.strictObject({
  ...metadataFields,
  id: z.uuid(), sourceProjectId: z.uuid(), instructions: publicText(4000), publish: z.boolean(),
}).refine(value => !value.publish || value.rightsConfirmed, { message: "Confirm your rights before publishing.", path: ["rightsConfirmed"] });
export const updateListingSchema = z.strictObject({ ...metadataFields, id: z.uuid(), status: z.enum(listingStatuses) });
export const adoptListingSchema = z.strictObject({ listingId: z.uuid(), requestId: z.uuid() });
export const templateSnapshotSchema = z.strictObject({
  version: z.literal(1), category: saveProjectSchema.shape.category,
  instructions: publicText(4000), settings: saveProjectSchema.shape.settings,
});
export const browseSchema = z.strictObject({
  query: z.string().trim().max(80).default(""),
  category: saveProjectSchema.shape.category.nullable().default(null),
  page: z.number().int().min(1).max(100000).default(1),
});
export const listingSchema = z.strictObject({
  id: z.uuid(), title: publicText(120), description: publicText(2000),
  category: saveProjectSchema.shape.category, tags: z.array(z.string()).max(8),
  creatorName: z.string().max(80), creatorSlug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(64).nullable().default(null),
  creatorAvatar: z.string().regex(/^\/api\/marketplace\/creators\/[a-z0-9]+(?:-[a-z0-9]+)*\/avatar$/).nullable().default(null), template: templateSnapshotSchema,
  adoptionType: z.enum(["free", "paid"]), priceMinor: z.number().int().nonnegative(), currency: z.literal("USD"), status: z.enum(listingStatuses),
  createdAt: z.string(), publishedAt: z.string().nullable(),
});
export const ownedListingSchema = listingSchema.extend({ sourceProjectId: z.uuid(), rightsConfirmed: z.boolean(), adoptionCount: z.number().int().nonnegative(), paidSalesCount: z.number().int().nonnegative(), creatorEarningsMinor: z.number().int().nonnegative() });
export const originSchema = z.strictObject({ listingId: z.uuid(), title: z.string().max(120) });
export type TemplateSnapshot = z.infer<typeof templateSnapshotSchema>;
export type Listing = z.infer<typeof listingSchema> & { estimate: { credits: number; test: boolean } | null };
export type OwnedListing = z.infer<typeof ownedListingSchema> & Pick<Listing, "estimate">;
export type ListingPage<T = Listing> = { items: T[]; total: number; page: number; pageSize: number };
export type ProjectOrigin = z.infer<typeof originSchema>;
export type MarketplaceResult =
  | { ok: true; listingId: string; existing?: boolean }
  | { ok: true; projectId: string }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE"; message: string };
