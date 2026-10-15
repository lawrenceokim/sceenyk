import { z } from "zod";

export const payoutEmail = z.email().max(254).transform(value => value.trim());
export const withdrawalInput = z.strictObject({ requestId: z.uuid(), amountMinor: z.number().int().min(500).max(2147483647) });
export const withdrawalStates = ["pending", "eligible", "processing", "paid", "failed"] as const;
export const withdrawalAccountSchema = z.object({
  currency: z.literal("USD"), email: z.string().nullable(), available: z.number().int().nonnegative(),
  deficit: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), paid: z.number().int().nonnegative(), total: z.number().int().nonnegative(),
  history: z.array(z.object({ id: z.uuid(), requested: z.number().int(), amount: z.number().int(), status: z.enum(withdrawalStates), requestedAt: z.string(), holdUntil: z.string(), paidAt: z.string().nullable(), failureCode: z.string().nullable(), reviewRequired: z.boolean() })),
});
export type WithdrawalAccount = z.infer<typeof withdrawalAccountSchema>;
export const withdrawalRowSchema = z.object({
  id: z.uuid(), creator_user_id: z.uuid(), currency: z.literal("USD"), status: z.enum(withdrawalStates), destination_snapshot: payoutEmail,
  submitted_minor: z.number().int().min(500).nullable(), paypal_batch_id: z.string().nullable(), paypal_item_id: z.string().nullable(),
});
export type WithdrawalRow = z.infer<typeof withdrawalRowSchema>;
// Current official event names. Events are hints; a provider GET is authority.
export const payoutWebhookEvents = [
  "PAYMENT.PAYOUTSBATCH.SUCCESS", "PAYMENT.PAYOUTSBATCH.DENIED", "PAYMENT.PAYOUTSBATCH.PROCESSING",
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "PAYMENT.PAYOUTS-ITEM.FAILED", "PAYMENT.PAYOUTS-ITEM.BLOCKED",
  "PAYMENT.PAYOUTS-ITEM.CANCELED", "PAYMENT.PAYOUTS-ITEM.RETURNED", "PAYMENT.PAYOUTS-ITEM.REFUNDED",
] as const;
