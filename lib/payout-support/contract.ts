import "server-only";
import { z } from "zod";

const amount = z.number().int().nonnegative();
const state = z.enum(["pending", "eligible", "processing", "paid", "failed"]);
const date = z.string();
export const supportFilters = ["all", "pending", "eligible", "processing", "paid", "failed", "review"] as const;
export const queueInput = z.strictObject({ query: z.string().trim().max(120).default(""), status: z.enum(supportFilters).default("all"), page: z.number().int().min(1).max(100000).default(1) });
export const detailInput = z.strictObject({ id: z.uuid(), historyPage: z.number().int().min(1).max(100000).default(1), auditPage: z.number().int().min(1).max(100000).default(1), allocationPage: z.number().int().min(1).max(100000).default(1) });
export const reconcileInput = z.strictObject({ withdrawalId: z.uuid() });
const summary = z.strictObject({
  id: z.uuid(), creatorId: z.uuid(), creatorName: z.string(), requested: amount, reserved: amount, submitted: amount.nullable(), currency: z.literal("USD"), status: state,
  requestedAt: date, holdUntil: date, processingAt: date.nullable(), paidAt: date.nullable(), ageMinutes: amount,
  providerStatus: z.string().max(80).nullable(), lastAttemptAt: date.nullable(), lastCheckedAt: date.nullable(), lastOutcome: z.string().nullable(), submissionAcknowledgedAt: date.nullable(), reviewRequired: z.boolean(),
});
export const queueResult = z.strictObject({ total: amount, page: amount, pageSize: z.literal(12), items: z.array(summary).max(12) });
const history = z.strictObject({ total: amount, items: z.array(z.strictObject({ id: z.string(), at: date, kind: z.string(), amount, purchaseId: z.uuid().nullable(), gross: amount.nullable(), fee: amount.nullable() })).max(25) });
const audit = z.strictObject({ total: amount, items: z.array(z.strictObject({
  id: z.uuid(), at: date, actorId: z.uuid().nullable(), actorName: z.string(), source: z.enum(["support", "worker", "webhook"]), action: z.string(), attemptId: z.uuid(),
  priorStatus: state.nullable(), observedStatus: z.string().max(80).nullable(), resultingStatus: state.nullable(), outcome: z.string(), reason: z.string(),
})).max(25) });
const allocations = z.strictObject({ total: amount, originalTotal: amount, remainingTotal: amount, items: z.array(z.strictObject({ id: z.uuid(), purchaseId: z.uuid(), original: amount, remaining: amount, lotReversed: amount, lotAvailable: amount, lotOffset: amount })).max(25) });
export const detailResult = z.discriminatedUnion("found", [z.strictObject({ found: z.literal(false) }), z.strictObject({ found: z.literal(true), withdrawal: summary, creatorBalance: z.strictObject({ available: amount, pending: amount, paid: amount, deficit: amount }), destination: z.string(), batchId: z.string().nullable(), itemId: z.string().nullable(), failureCode: z.string().nullable(), history, audit, allocations })]);
export type PayoutQueue = z.infer<typeof queueResult>;
export type PayoutDetail = Extract<z.infer<typeof detailResult>, { found: true }>;
