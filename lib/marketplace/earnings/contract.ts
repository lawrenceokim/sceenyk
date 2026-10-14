import { z } from "zod";
export const creatorEarningStates = ["pending", "available", "reversed"] as const;
export const paymentAdjustmentReasons = ["refund", "capture_reversed"] as const;
export const settlementPolicySchema = z.strictObject({ version: z.string().min(1).max(100), holdSeconds: z.number().int().min(60).max(86400) });
export type SettlementPolicy = z.infer<typeof settlementPolicySchema>;
