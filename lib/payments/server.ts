import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { getSandboxPack } from "./packs";
import { getPayPalConfig } from "./paypal/config";
import {
  approvalUrl, capturePayPalOrder, createPayPalOrder, paypalOrderId,
  purchaseAmount, readPayPalOrder, verifiedCapture, verifyOrder,
} from "./paypal/client";
import type { CreditWallet, PurchaseRow, PurchaseStatus } from "./types";

const packInput = z.object({ packId: z.string().max(80) }).strict();
const orderInput = z.object({ orderId: paypalOrderId }).strict();

async function ownedPurchase(owner: string, orderId: string) {
  const { data, error } = await createDatabaseClient().from("credit_purchases")
    .select("*").eq("owner_user_id", owner).eq("paypal_order_id", orderId).maybeSingle();
  if (error || !data) throw new Error("PURCHASE_NOT_FOUND");
  return data;
}

async function state(purchase: PurchaseRow, status: "approved" | "failed" | "cancelled") {
  const { data, error } = await createDatabaseClient().rpc("set_credit_purchase_state", {
    p_owner_user_id: purchase.owner_user_id, p_order_id: purchase.paypal_order_id!, p_status: status,
  });
  if (error || !data) throw new Error("PURCHASE_STATE_UNAVAILABLE");
}

async function attach(purchase: PurchaseRow, orderId: string) {
  const { data, error } = await createDatabaseClient().rpc("attach_paypal_order", {
    p_purchase_id: purchase.id, p_owner_user_id: purchase.owner_user_id, p_order_id: orderId,
  });
  if (error || !data) throw new Error("PURCHASE_ORDER_UNAVAILABLE");
  return { ...purchase, paypal_order_id: orderId };
}

// Internal trusted entry point; browser exports always resolve Clerk first.
// Read before capture recovers an earlier successful but unacknowledged POST.
async function reconcilePurchase(purchase: PurchaseRow, cancel = false): Promise<PurchaseStatus> {
  getPayPalConfig();
  if (purchase.status === "completed") return "completed";
  if (!purchase.paypal_order_id) return purchase.status;
  let order = await readPayPalOrder(purchase.paypal_order_id);
  verifyOrder(purchase, order);
  if (order.status === "VOIDED") { await state(purchase, "failed"); return "failed"; }
  if (cancel && order.status !== "COMPLETED") {
    await state(purchase, "cancelled");
    // Return the current row to handle a concurrent capture winning the race.
    return (await ownedPurchase(purchase.owner_user_id, order.id)).status;
  }
  if (order.status === "APPROVED" && !["cancelled", "failed"].includes(purchase.status)) {
    await state(purchase, "approved");
    try { order = await capturePayPalOrder(purchase); }
    catch {
      // A timeout/duplicate concurrent POST is uncertain, never proof of failure.
      order = await readPayPalOrder(order.id);
    }
    verifyOrder(purchase, order);
  }
  const captures = order.purchase_units[0].payments?.captures;
  if (captures?.length === 1 && ["DECLINED", "FAILED", "DENIED"].includes(captures[0].status)) {
    await state(purchase, "failed"); return "failed";
  }
  if (order.status === "COMPLETED") {
    const capture = verifiedCapture(purchase, order);
    const { data, error } = await createDatabaseClient().rpc("fulfil_paypal_purchase", {
      p_owner_user_id: purchase.owner_user_id, p_order_id: order.id,
      p_capture_id: capture.id, p_amount_minor: purchase.amount_minor, p_currency: purchase.currency,
    });
    if (error || !data) throw new Error("PURCHASE_FULFILMENT_UNAVAILABLE");
    return "completed";
  }
  return order.status === "APPROVED" && !["cancelled", "failed"].includes(purchase.status) ? "approved" : purchase.status;
}

export async function createCreditOrder(input: unknown) {
  const user = await ensureAppUser();
  getPayPalConfig();
  const { packId } = packInput.parse(input);
  const pack = getSandboxPack(packId);
  const { data, error } = await createDatabaseClient().rpc("prepare_credit_purchase", {
    p_owner_user_id: user.id, p_pack_id: pack.id, p_pack_name: pack.name,
    p_amount_minor: Math.round(Number(pack.amount) * 100), p_currency: pack.currency, p_credits: pack.credits,
  });
  if (error || !data) throw new Error("PURCHASE_UNAVAILABLE");
  let purchase = data;
  if (!purchase.paypal_order_id) {
    // Bound create retries well inside PayPal's request-ID retention. An older
    // unknown create outcome requires reconciliation, never a blind new POST.
    if (Date.now() - Date.parse(purchase.created_at) > 5 * 60_000) throw new Error("PURCHASE_CREATE_NEEDS_RECONCILIATION");
    const order = await createPayPalOrder(purchase);
    verifyOrder(purchase, order);
    purchase = await attach(purchase, order.id);
  }
  const order = await readPayPalOrder(purchase.paypal_order_id!);
  verifyOrder(purchase, order);
  if (["APPROVED", "COMPLETED", "VOIDED"].includes(order.status)) {
    return { orderId: order.id, approvalUrl: null, status: await reconcilePurchase(purchase) };
  }
  return { orderId: order.id, approvalUrl: approvalUrl(order), status: purchase.status };
}

export async function completeCreditOrder(input: unknown, cancel = false) {
  const user = await ensureAppUser();
  const { orderId } = orderInput.parse(input);
  // User B is refused here, before any PayPal request or capture.
  return { status: await reconcilePurchase(await ownedPurchase(user.id, orderId), cancel) };
}

export async function getCreditWallet(): Promise<CreditWallet> {
  const user = await ensureAppUser();
  const db = createDatabaseClient();
  const [account, purchases] = await Promise.all([
    db.from("generation_accounts").select("credit_available,credit_reserved").eq("owner_user_id", user.id).single(),
    db.from("credit_purchases").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (account.error || !account.data || purchases.error || !purchases.data) throw new Error("CREDIT_WALLET_UNAVAILABLE");
  return {
    available: account.data.credit_available, reserved: account.data.credit_reserved,
    purchases: purchases.data.map(purchase => ({ pack_id: purchase.pack_id, pack_name: purchase.pack_name, credits: purchase.credits,
      status: purchase.status, created_at: purchase.created_at, orderId: purchase.paypal_order_id,
      amount: purchaseAmount(purchase), currency: purchase.currency })),
  };
}

export async function reconcileOwnedCreditOrders() {
  const user = await ensureAppUser();
  getPayPalConfig();
  const { data, error } = await createDatabaseClient().from("credit_purchases").select("*")
    .eq("owner_user_id", user.id).in("status", ["pending", "approved"])
    .not("paypal_order_id", "is", null).order("updated_at", { ascending: true }).limit(5);
  if (error) throw new Error("PURCHASE_RECONCILIATION_UNAVAILABLE");
  // Bounded parallelism; independent purchases share the atomic account lock.
  const results = await Promise.allSettled((data ?? []).map(purchase => reconcilePurchase(purchase)));
  return { recovered: results.filter(result => result.status === "fulfilled" && result.value === "completed").length,
    pending: results.some(result => result.status === "rejected") };
}

export async function handleVerifiedPayPalEvent(input: unknown) {
  const event = z.object({ id: z.string().min(1).max(100), event_type: z.string(), resource: z.object({
    id: z.string().optional(), supplementary_data: z.object({ related_ids: z.object({ order_id: paypalOrderId.optional() }) }).optional(),
  }).passthrough() }).parse(input);
  if (!["CHECKOUT.ORDER.APPROVED", "CHECKOUT.ORDER.COMPLETED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.PENDING"].includes(event.event_type)) return;
  const orderId = paypalOrderId.parse(event.event_type.startsWith("CHECKOUT.ORDER.") ? event.resource.id : event.resource.supplementary_data?.related_ids.order_id);
  const db = createDatabaseClient();
  const { data, error } = await db.from("credit_purchases").select("*").eq("paypal_order_id", orderId).maybeSingle();
  if (error) throw new Error("WEBHOOK_PURCHASE_UNAVAILABLE");
  let purchase = data;
  if (!purchase) {
    // Recover create-response loss/early approval before the order was attached.
    const order = await readPayPalOrder(orderId);
    const purchaseId = z.uuid().parse(order.purchase_units[0].custom_id);
    const lookup = await db.from("credit_purchases").select("*").eq("id", purchaseId).maybeSingle();
    if (lookup.error) throw new Error("WEBHOOK_PURCHASE_UNAVAILABLE");
    if (!lookup.data) return; // Authenticated event for another use of this app.
    verifyOrder(lookup.data, order);
    purchase = await attach(lookup.data, orderId);
  }
  const status = await reconcilePurchase(purchase);
  // PayPal retries an authentic completed event until DB fulfilment succeeds.
  if (["PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.COMPLETED"].includes(event.event_type) && status !== "completed") throw new Error("WEBHOOK_CAPTURE_PENDING");
  if (event.event_type === "CHECKOUT.ORDER.APPROVED" && ["pending", "approved"].includes(status)) throw new Error("WEBHOOK_CAPTURE_PENDING");
}
