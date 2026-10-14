import { z } from "zod";
import { creatorEarningStates, paymentAdjustmentReasons } from "../earnings/contract";
// Public demo bounds are presentation data; the server validates them again.
export const sandboxMarketplacePricing = { currency: "USD", minMinor: 100, maxMinor: 2500, version: "marketplace-sandbox-v1" } as const;
export const purchaseInput = z.strictObject({ purchaseId: z.uuid() });
export const marketplacePurchaseSummarySchema = z.strictObject({
  id: z.uuid(), listingId: z.uuid(), title: z.string().max(120), amountMinor: z.number().int().positive(), currency: z.literal("USD"),
  status: z.enum(["pending", "approved", "completed", "failed"]), createdAt: z.string(), projectId: z.uuid().nullable(),
  financialStatus: z.enum(["pending", "approved", "completed", "failed", "partially_refunded", "refunded"]), refundedMinor: z.number().int().nonnegative(),
});
export const earningsSchema = z.strictObject({
  currency: z.literal("USD"), pending: z.number().int().nonnegative(), available: z.number().int().nonnegative(), lifetime: z.number().int().nonnegative(),
  lifetimeGross: z.number().int().nonnegative(), reversedGross: z.number().int().nonnegative(), reversedFee: z.number().int().nonnegative(), reversedNet: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.literal(12),
  sales: z.array(z.strictObject({ listingId: z.uuid(), title: z.string().max(120), createdAt: z.string(), gross: z.number().int().positive(), fee: z.number().int().nonnegative(), net: z.number().int().nonnegative(), state: z.enum(creatorEarningStates),
    remainingNet: z.number().int().nonnegative(), reversedGross: z.number().int().nonnegative(), reversedFee: z.number().int().nonnegative(), reversedNet: z.number().int().nonnegative(), eligibleAt: z.string().nullable(),
    history: z.array(z.strictObject({ kind: z.enum(["sale", "available", ...paymentAdjustmentReasons]), at: z.string(), gross: z.number().int().positive(), fee: z.number().int().nonnegative(), net: z.number().int().nonnegative() })),
  })),
});
export type MarketplacePurchaseSummary = z.infer<typeof marketplacePurchaseSummarySchema>;
export type CreatorEarnings = z.infer<typeof earningsSchema>;
export function usd(minor: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100); }
