import "server-only";
import { z } from "zod";
import type { WithdrawalRow } from "./contract";
import { readPayoutBatch, verifyPayout, type PayoutBatch } from "./paypal";
import type { PayoutCheckOutcome } from "@/lib/payout-support/outcomes";

export type PayoutObservation = {
  batchId: string | null;
  itemId: string | null;
  providerStatus: string | null;
  outcome: PayoutCheckOutcome;
  reason: "provider_success" | "provider_processing" | "provider_failure" | "provider_returned" | "unknown_provider_state" | "provider_item_missing" | "provider_identity_mismatch" | "provider_unavailable" | "provider_reference_missing" | "not_submitted" | "terminal_conflict";
  apply: boolean;
};
const unresolved = ["PENDING", "PROCESSING", "ONHOLD", "UNCLAIMED"];
const failed = ["FAILED", "DENIED", "BLOCKED", "CANCELED", "RETURNED"];
const noChange = (outcome: PayoutCheckOutcome, reason: PayoutObservation["reason"]): PayoutObservation => ({ batchId: null, itemId: null, providerStatus: null, outcome, reason, apply: false });

// Verification and classification are shared by support, Inngest and webhooks.
// This module has no submission, send claim, eligibility or financial override.
export function payoutObservation(w: WithdrawalRow, batch: PayoutBatch, submitted = false): PayoutObservation {
  const item = verifyPayout(w, batch, Boolean(w.paypal_item_id));
  const status = item?.transaction_status ?? (!submitted && batch.batch_header.batch_status === "DENIED" ? "DENIED" : `BATCH_${batch.batch_header.batch_status}`);
  if (!/^[A-Z_]{1,80}$/.test(status)) return noChange("needs_review", "unknown_provider_state");
  const result = { batchId: batch.batch_header.payout_batch_id, itemId: item?.payout_item_id ?? null, providerStatus: status };
  if (w.status === "pending" || w.status === "eligible") return { ...noChange("not_submitted", "not_submitted"), ...result };
  if ((w.status === "failed" && !failed.includes(status)) || (w.status === "paid" && status !== "SUCCESS" && !["RETURNED", "REFUNDED"].includes(status))) {
    return { ...result, outcome: "needs_review", reason: "terminal_conflict", apply: false };
  }
  if (status === "SUCCESS") return { ...result, outcome: "paid", reason: "provider_success", apply: true };
  if (w.status === "paid" && ["RETURNED", "REFUNDED"].includes(status)) return { ...result, outcome: "needs_review", reason: "provider_returned", apply: true };
  if (failed.includes(status)) return { ...result, outcome: "definitive_failure", reason: "provider_failure", apply: true };
  if (unresolved.includes(status) || ["BATCH_PENDING", "BATCH_PROCESSING"].includes(status)) return { ...result, outcome: "processing", reason: "provider_processing", apply: true };
  // Batch acceptance/success cannot establish item success. Unknown states and
  // processing REFUNDED never manufacture a failure/restoration decision.
  // Persist verified references/status without a financial transition. This
  // also retains a valid batch reference from an accepted submission whose item
  // has not appeared yet; the existing SQL state machine treats it as unresolved.
  return { ...result, outcome: "needs_review", reason: !item ? "provider_item_missing" : "unknown_provider_state", apply: true };
}

export async function inspectExistingPayout(w: WithdrawalRow): Promise<PayoutObservation> {
  if (w.status === "pending" || w.status === "eligible") return noChange("not_submitted", "not_submitted");
  if (!w.paypal_batch_id) return w.status === "failed" ? noChange("not_submitted", "not_submitted") : noChange("needs_review", "provider_reference_missing");
  if (!/^[A-Z0-9]{5,64}$/.test(w.paypal_batch_id)) return noChange("needs_review", "provider_reference_missing");
  try {
    return payoutObservation(w, await readPayoutBatch(w.paypal_batch_id));
  } catch (error) {
    if (error instanceof z.ZodError || (error && typeof error === "object" && "message" in error && typeof error.message === "string" && /^PAYPAL_PAYOUT_(MISMATCH|ITEM_MISSING)$/.test(error.message))) {
      return noChange("needs_review", "provider_identity_mismatch");
    }
    return noChange("provider_unavailable", "provider_unavailable");
  }
}
