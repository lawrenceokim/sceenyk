import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { getPayPalConfig } from "@/lib/payments/paypal/config";
import { paypalOrderId, paypalParentId, readPayPalCapture, readPayPalOrder, readPayPalRefund, type paypalRefundSchema } from "@/lib/payments/paypal/client";
import type { MarketplacePurchaseRow } from "../payments/types";
import { sandboxSettlementPolicy } from "./config";
import { financialObservation } from "./verification";

function checked<T>(r: { data: T | null; error: unknown }): T {
  if (r.error || r.data === null || r.data === false) throw new Error("MARKETPLACE_ACCOUNTING_UNAVAILABLE");
  return r.data;
}
export async function freezeMarketplaceSettlement(purchaseId: string) {
  getPayPalConfig();
  const policy = sandboxSettlementPolicy();
  checked(await createDatabaseClient().rpc("marketplace_ensure_settlement", { p_purchase_id: z.uuid().parse(purchaseId), p_policy_version: policy.version, p_hold_seconds: policy.holdSeconds }));
}
// Internal scheduler/webhook entry point only. No Server Action settles money.
export async function reconcileMarketplaceFinancials(purchaseId: string, notification?: { reference: string; refund?: z.infer<typeof paypalRefundSchema>; reversed?: boolean }) {
  getPayPalConfig();
  const db = createDatabaseClient();
  const p = checked<MarketplacePurchaseRow>(await db.from("marketplace_purchases").select("*").eq("id", z.uuid().parse(purchaseId)).eq("status", "completed").maybeSingle());
  const policy = sandboxSettlementPolicy();
  checked(await db.rpc("marketplace_begin_financial_check", { p_purchase_id: p.id, p_policy_version: policy.version, p_hold_seconds: policy.holdSeconds }));
  const [order, capture] = await Promise.all([
    readPayPalOrder(paypalOrderId.parse(p.paypal_order_id)),
    readPayPalCapture(paypalOrderId.parse(p.paypal_capture_id)),
  ]);
  const observation = financialObservation(p, order, capture, notification?.refund, notification?.reversed);
  return checked(await db.rpc("marketplace_apply_financial_observation", {
    p_purchase_id: p.id, p_order_id: order.id, p_capture_id: capture.id, p_amount_minor: p.amount_minor, p_currency: p.currency,
    p_capture_status: observation.status, p_refunded_minor: observation.refunded, p_can_settle: observation.canSettle, p_reason: observation.reason,
    p_reference_key: `${notification?.reference ?? "reconciliation"}:${observation.refunded}`,
  }));
}
export const marketplaceAdjustmentEvents = ["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED", "PAYMENT.REFUND.PENDING", "PAYMENT.REFUND.FAILED"] as const;
// Called exclusively after official PayPal signature verification by the route.
export async function handleVerifiedMarketplaceAdjustment(input: unknown) {
  const event = z.object({ id: z.string().min(1).max(100), event_type: z.string(), resource: z.object({ id: paypalOrderId }) }).parse(input);
  if (!(marketplaceAdjustmentEvents as readonly string[]).includes(event.event_type)) return;
  const reversed = event.event_type === "PAYMENT.CAPTURE.REVERSED";
  const refund = reversed ? undefined : await readPayPalRefund(event.resource.id);
  const captureId = reversed ? event.resource.id : paypalParentId(refund!.links, "captures");
  const lookup = await createDatabaseClient().from("marketplace_purchases").select("id,status").eq("paypal_capture_id", captureId).maybeSingle();
  if (lookup.error) throw new Error("MARKETPLACE_ACCOUNTING_UNAVAILABLE");
  if (!lookup.data) return; // Credit purchases are outside this accounting unit.
  if (lookup.data.status !== "completed") throw new Error("MARKETPLACE_CAPTURE_PENDING");
  await reconcileMarketplaceFinancials(lookup.data.id, { reference: event.id, refund, reversed });
}
