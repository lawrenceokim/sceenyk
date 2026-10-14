import "server-only";
import { paypalParentId, purchaseAmount, verifyOrder, type paypalCaptureSchema, type paypalRefundSchema, type PayPalOrder } from "@/lib/payments/paypal/client";
import type { z } from "zod";
import type { MarketplacePurchaseRow } from "../payments/types";

export function usdCents(amount: { value: string; currency_code: string }) {
  if (amount.currency_code !== "USD" || !/^\d{1,6}\.\d{2}$/.test(amount.value)) throw new Error("INVALID_REFUND_MONEY");
  const [whole, fraction] = amount.value.split(".");
  return Number(whole) * 100 + Number(fraction);
}
export function financialObservation(p: MarketplacePurchaseRow, order: PayPalOrder, capture: z.infer<typeof paypalCaptureSchema>, refund?: z.infer<typeof paypalRefundSchema>, reversed = false) {
  verifyOrder(p, order);
  const original = order.purchase_units[0].payments?.captures;
  const parent = capture.supplementary_data?.related_ids.order_id ?? paypalParentId(capture.links ?? [], "orders");
  if (p.status !== "completed" || order.status !== "COMPLETED" || original?.length !== 1 || original[0].id !== p.paypal_capture_id ||
    capture.id !== p.paypal_capture_id || parent !== p.paypal_order_id || !capture.final_capture || !original[0].final_capture ||
    capture.amount.value !== purchaseAmount(p) || capture.amount.currency_code !== p.currency ||
    original[0].amount.value !== purchaseAmount(p) || original[0].amount.currency_code !== p.currency) throw new Error("FINANCIAL_CAPTURE_MISMATCH");
  const refunds = order.purchase_units[0].payments?.refunds ?? [];
  if (new Set(refunds.map(r => r.id)).size !== refunds.length) throw new Error("DUPLICATE_PROVIDER_REFUNDS");
  let refunded = refunds.filter(r => r.status === "COMPLETED").reduce((sum, r) => sum + usdCents(r.amount), 0);
  let pendingRefund = refunds.some(r => !["COMPLETED", "CANCELLED", "FAILED"].includes(r.status));
  if (refund) {
    if (paypalParentId(refund.links, "captures") !== p.paypal_capture_id) throw new Error("REFUND_CAPTURE_MISMATCH");
    const amount = usdCents(refund.amount);
    if (amount <= 0 || amount > p.amount_minor) throw new Error("INVALID_REFUND_AMOUNT");
    if (refund.status === "COMPLETED") {
      const cumulative = refund.seller_payable_breakdown?.total_refunded_amount;
      // Order's complete refund list or documented provider cumulative amount;
      // an individual partial amount is never guessed to be the cumulative sum.
      if (cumulative) {
        const total = usdCents(cumulative);
        if (total < amount) throw new Error("INVALID_CUMULATIVE_REFUND");
        refunded = Math.max(refunded, total);
      } else if (!refunds.some(r => r.id === refund.id && r.status === "COMPLETED") && capture.status !== "REFUNDED") {
        throw new Error("REFUND_RECONCILIATION_PENDING");
      }
    } else if (!["CANCELLED", "FAILED"].includes(refund.status)) pendingRefund = true;
  }
  if (refunded > p.amount_minor) throw new Error("REFUND_EXCEEDS_ORIGINAL");
  if (capture.status === "REFUNDED" || reversed) refunded = p.amount_minor;
  const valid = capture.status === "COMPLETED" || (capture.status === "PARTIALLY_REFUNDED" && refunded > 0);
  return { refunded, canSettle: valid && !pendingRefund && refunded < p.amount_minor, status: reversed ? "REVERSED" : capture.status, reason: reversed ? "capture_reversed" as const : "refund" as const };
}
