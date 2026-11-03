import { z } from "zod";

export const manualPricingSchema = z.strictObject({ provider: z.string().min(1), model: z.string().min(1), mode: z.string().min(1),
  durationMs: z.number().int().positive().safe(), estimatedUsdPerSecond: z.string().regex(/^\d+\.\d{4,10}$/),
  rateMicrousdPerSecond: z.number().int().positive().safe(), estimatedUsd: z.string().regex(/^\d+\.\d{6}$/),
  estimatedCostMicrousd: z.number().int().nonnegative().safe(), pricingSource: z.literal("manual_provider_estimate"),
  pricingVersion: z.string().min(1), configurationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export type ManualPricing = z.infer<typeof manualPricingSchema>;
