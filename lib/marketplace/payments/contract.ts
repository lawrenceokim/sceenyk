import { z } from "zod";
// Public demo bounds are presentation data; the server validates them again.
export const sandboxMarketplacePricing = { currency: "USD", minMinor: 100, maxMinor: 2500, version: "marketplace-sandbox-v1" } as const;
export const purchaseInput = z.strictObject({ purchaseId: z.uuid() });
export const marketplacePurchaseSummarySchema = z.strictObject({
  id: z.uuid(), listingId: z.uuid(), title: z.string().max(120), amountMinor: z.number().int().positive(), currency: z.literal("USD"),
  status: z.enum(["pending", "approved", "completed", "failed"]), createdAt: z.string(), projectId: z.uuid().nullable(),
});
export const earningsSchema = z.strictObject({
  currency: z.literal("USD"), pending: z.number().int().nonnegative(), available: z.number().int().nonnegative(), lifetime: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.literal(12),
  sales: z.array(z.strictObject({ listingId: z.uuid(), title: z.string().max(120), createdAt: z.string(), gross: z.number().int().positive(), fee: z.number().int().nonnegative(), net: z.number().int().nonnegative(), state: z.enum(["pending", "available", "reversed"]) })),
});
export type MarketplacePurchaseSummary = z.infer<typeof marketplacePurchaseSummarySchema>;
export type CreatorEarnings = z.infer<typeof earningsSchema>;
export function usd(minor: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100); }
