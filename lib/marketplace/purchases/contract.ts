import { z } from "zod";
import { listingSchema, templateSnapshotSchema } from "../contract";

export const acquisitionSchema = z.strictObject({
  id: z.uuid(), listingId: z.uuid(), title: listingSchema.shape.title,
  description: listingSchema.shape.description, creatorName: listingSchema.shape.creatorName,
  creatorSlug: listingSchema.shape.creatorSlug, creatorAvatar: listingSchema.shape.creatorAvatar,
  template: templateSnapshotSchema, kind: z.enum(["free", "paid"]),
  amountMinor: z.number().int().nonnegative(), acquiredAt: z.string().datetime({ offset: true }),
  financialStatus: z.enum(["free", "completed", "partially_refunded", "refunded"]),
  listingAvailable: z.boolean(),
  previewUrl: z.string().regex(/^\/api\/purchases\/[a-f0-9-]{36}\/preview$/).nullable(),
});
export const acquisitionPageSchema = z.strictObject({
  items: z.array(acquisitionSchema), total: z.number().int().nonnegative(),
  page: z.number().int().positive(), pageSize: z.literal(12),
});
export type Acquisition = z.infer<typeof acquisitionSchema>;
export type AcquisitionPage = z.infer<typeof acquisitionPageSchema>;
export function acquisitionDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
