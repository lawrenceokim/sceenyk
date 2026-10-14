import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { getPayPalConfig } from "@/lib/payments/paypal/config";
import { approvalUrl, capturePayPalOrder, createMarketplacePayPalOrder, paypalOrderId, readPayPalOrder, verifiedCapture, verifyOrder } from "@/lib/payments/paypal/client";
import { marketplaceDemoFeeBps, sandboxMarketplacePricing, validateMarketplacePrice } from "./config";
import { earningsSchema, marketplacePurchaseSummarySchema, purchaseInput, type MarketplacePurchaseSummary } from "./contract";
import type { MarketplacePurchaseRow } from "./types";

function checked<T>(r: { data: T | null; error: unknown }): T {
  if (r.error || r.data === null || r.data === false) throw new Error("MARKETPLACE_PAYMENT_UNAVAILABLE");
  return r.data;
}
async function ownedPurchase(buyer: string, id: string) {
  return checked<MarketplacePurchaseRow>(await createDatabaseClient().from("marketplace_purchases").select("*").eq("id", id).eq("buyer_user_id", buyer).maybeSingle());
}
async function summary(p: MarketplacePurchaseRow): Promise<MarketplacePurchaseSummary> {
  const adoption = checked(await createDatabaseClient().rpc("marketplace_paid_project", { p_buyer_user_id: p.buyer_user_id, p_purchase_id: p.id }));
  return marketplacePurchaseSummarySchema.parse({ id: p.id, listingId: p.listing_id, title: p.listing_title, amountMinor: p.amount_minor, currency: p.currency, status: p.status, createdAt: p.created_at, projectId: z.object({ projectId: z.uuid().nullable() }).parse(adoption).projectId });
}
async function attach(p: MarketplacePurchaseRow, id: string) {
  checked(await createDatabaseClient().rpc("marketplace_attach_order", { p_purchase_id: p.id, p_buyer_user_id: p.buyer_user_id, p_order_id: id }));
  return { ...p, paypal_order_id: id };
}
async function state(p: MarketplacePurchaseRow, status: "approved" | "failed") {
  return checked(await createDatabaseClient().rpc("marketplace_purchase_state", { p_purchase_id: p.id, p_status: status }));
}
async function redeem(p: MarketplacePurchaseRow) {
  const value = checked(await createDatabaseClient().rpc("marketplace_redeem_purchase", { p_buyer_user_id: p.buyer_user_id, p_purchase_id: p.id }));
  return z.object({ code: z.literal("ADOPTED"), projectId: z.uuid() }).parse(value).projectId;
}

// Internal callback entry point. A completed payment can commit its entitlement
// before project creation; all later retries redeem that same durable right.
async function reconcile(p: MarketplacePurchaseRow) {
  getPayPalConfig();
  if (p.status === "completed") { await redeem(p); return; }
  if (!p.paypal_order_id) return;
  let order = await readPayPalOrder(p.paypal_order_id);
  verifyOrder(p, order);
  if (order.status === "VOIDED") { await state(p, "failed"); return; }
  if (order.status === "APPROVED" && p.status !== "failed") {
    await state(p, "approved");
    try { order = await capturePayPalOrder(p); } catch { order = await readPayPalOrder(p.paypal_order_id); }
    verifyOrder(p, order);
  }
  const captures = order.purchase_units[0].payments?.captures;
  if (captures?.length === 1 && ["DECLINED", "DENIED", "FAILED"].includes(captures[0].status)) { await state(p, "failed"); return; }
  if (order.status !== "COMPLETED") return;
  const capture = verifiedCapture(p, order);
  checked(await createDatabaseClient().rpc("marketplace_fulfil_purchase", { p_purchase_id: p.id, p_order_id: order.id, p_capture_id: capture.id, p_amount_minor: p.amount_minor, p_currency: p.currency }));
  await redeem(p);
}

export async function prepareMarketplaceCheckout(input: unknown) {
  const user = await ensureAppUser(); getPayPalConfig();
  const { listingId } = z.strictObject({ listingId: z.uuid() }).parse(input);
  const raw = checked(await createDatabaseClient().rpc("marketplace_prepare_purchase", { p_buyer_user_id: user.id, p_listing_id: listingId, p_fee_bps: marketplaceDemoFeeBps(), p_pricing_version: sandboxMarketplacePricing.version }));
  const { id } = z.object({ id: z.uuid() }).parse(raw);
  const p = await ownedPurchase(user.id, id);
  validateMarketplacePrice("paid", p.amount_minor);
  if (p.status === "completed") await redeem(p);
  return summary(p);
}
export async function createMarketplaceOrder(input: unknown) {
  const user = await ensureAppUser(); getPayPalConfig();
  const { purchaseId } = purchaseInput.parse(input);
  let p = await ownedPurchase(user.id, purchaseId);
  if (p.status === "completed") { await redeem(p); return { purchase: await summary(p), approvalUrl: null }; }
  if (p.status === "failed") throw new Error("PURCHASE_NEEDS_RECONCILIATION");
  if (!p.paypal_order_id) {
    // Never create a replacement order after an unknown provider outcome.
    const attempt = z.object({ paypal_create_started_at: z.string() }).parse(checked(await createDatabaseClient().rpc("marketplace_begin_order", { p_purchase_id: p.id, p_buyer_user_id: user.id })));
    if (Date.now() - Date.parse(attempt.paypal_create_started_at) > 5 * 60_000) throw new Error("PURCHASE_CREATE_NEEDS_RECONCILIATION");
    validateMarketplacePrice("paid", p.amount_minor);
    const order = await createMarketplacePayPalOrder(p); verifyOrder(p, order); p = await attach(p, order.id);
  }
  const order = await readPayPalOrder(p.paypal_order_id!); verifyOrder(p, order);
  if (["APPROVED", "COMPLETED", "VOIDED"].includes(order.status)) {
    await reconcile(p); return { purchase: await summary(await ownedPurchase(user.id, p.id)), approvalUrl: null };
  }
  return { purchase: await summary(p), approvalUrl: approvalUrl(order) };
}
export async function recoverMarketplacePurchase(input: unknown) {
  const user = await ensureAppUser();
  const { purchaseId } = purchaseInput.parse(input);
  const p = await ownedPurchase(user.id, purchaseId);
  await reconcile(p);
  return summary(await ownedPurchase(user.id, p.id));
}
export async function getMarketplacePurchases(page = 1) {
  const user = await ensureAppUser();
  z.number().int().min(1).max(100000).parse(page);
  const db = createDatabaseClient();
  const r = await db.from("marketplace_purchases").select("*", { count: "exact" }).eq("buyer_user_id", user.id).order("created_at", { ascending: false }).range((page - 1) * 12, page * 12 - 1);
  const rows = checked(r);
  return { clerkUserId: user.clerk_user_id, items: await Promise.all(rows.map(summary)), total: r.count ?? 0, page, pageSize: 12 };
}
export async function getCreatorEarnings(page = 1) {
  const user = await ensureAppUser();
  z.number().int().min(1).max(100000).parse(page);
  return { clerkUserId: user.clerk_user_id, earnings: earningsSchema.parse(checked(await createDatabaseClient().rpc("marketplace_creator_earnings", { p_creator_user_id: user.id, p_page: page }))) };
}

export async function handleVerifiedMarketplacePayPalEvent(input: unknown) {
  const event = z.object({ event_type: z.string(), resource: z.object({ id: z.string().optional(), supplementary_data: z.object({ related_ids: z.object({ order_id: paypalOrderId.optional() }) }).optional() }).passthrough() }).parse(input);
  if (!["CHECKOUT.ORDER.APPROVED", "CHECKOUT.ORDER.COMPLETED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.DENIED"].includes(event.event_type)) return;
  const orderId = paypalOrderId.parse(event.event_type.startsWith("CHECKOUT.ORDER.") ? event.resource.id : event.resource.supplementary_data?.related_ids.order_id);
  const db = createDatabaseClient();
  const lookup = await db.from("marketplace_purchases").select("*").eq("paypal_order_id", orderId).maybeSingle();
  if (lookup.error) throw new Error("WEBHOOK_PURCHASE_UNAVAILABLE");
  let p = lookup.data;
  if (!p) {
    const order = await readPayPalOrder(orderId);
    const id = z.uuid().parse(order.purchase_units[0].custom_id);
    const found = await db.from("marketplace_purchases").select("*").eq("id", id).maybeSingle();
    if (found.error) throw new Error("WEBHOOK_PURCHASE_UNAVAILABLE");
    if (!found.data) return;
    verifyOrder(found.data, order); p = await attach(found.data, orderId);
  }
  await reconcile(p);
  const current = await ownedPurchase(p.buyer_user_id, p.id);
  if (event.event_type.endsWith("COMPLETED") && current.status !== "completed") throw new Error("WEBHOOK_CAPTURE_PENDING");
  if (event.event_type === "CHECKOUT.ORDER.APPROVED" && ["pending", "approved"].includes(current.status)) throw new Error("WEBHOOK_CAPTURE_PENDING");
}
