import "server-only";
import { z } from "zod";
import { getPayPalConfig } from "./config";
import type { PurchaseRow } from "../types";
import type { MarketplacePurchaseRow } from "@/lib/marketplace/payments/types";

type PayPalPurchase = Pick<PurchaseRow, "id" | "amount_minor" | "currency" | "paypal_order_id" | "capture_request_id"> & { listing_id?: string };

export const paypalOrderId = z.string().regex(/^[A-Z0-9]{10,32}$/);
const money = z.object({ value: z.string(), currency_code: z.string() });
export const paypalOrder = z.object({
  id: paypalOrderId,
  intent: z.literal("CAPTURE"),
  status: z.string(),
  purchase_units: z.array(z.object({
    reference_id: z.string(), custom_id: z.string(), invoice_id: z.string(), amount: money,
    payments: z.object({ refunds: z.array(z.object({ id: paypalOrderId, status: z.string(), amount: money })).max(10000).optional(), captures: z.array(z.object({
      id: paypalOrderId, status: z.string(), amount: money, final_capture: z.boolean(),
    })).optional() }).optional(),
  })).length(1),
  links: z.array(z.object({ rel: z.string(), href: z.string() })).optional(),
});
export type PayPalOrder = z.infer<typeof paypalOrder>;

export async function paypalAccessToken() {
  const config = getPayPalConfig();
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("PAYPAL_AUTH_UNAVAILABLE");
  return z.object({ access_token: z.string().min(1), token_type: z.literal("Bearer") }).parse(await response.json()).access_token;
}

// Paths are constructed only here, never taken from browser or webhook URLs.
async function request(path: string, method: "GET" | "POST", body?: string, requestId?: string) {
  const config = getPayPalConfig();
  const token = await paypalAccessToken();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(requestId ? { "PayPal-Request-ID": requestId } : {}) },
    body,
  });
  // Never log provider bodies, tokens, buyer information, or credentials.
  if (!response.ok) throw new Error("PAYPAL_REQUEST_UNAVAILABLE");
  return response.json() as Promise<unknown>;
}

export function purchaseAmount(purchase: Pick<PayPalPurchase, "amount_minor">) {
  return (purchase.amount_minor / 100).toFixed(2);
}

export async function createPayPalOrder(purchase: PurchaseRow): Promise<PayPalOrder> {
  return createOrder(purchase, purchase.pack_name, "/dashboard/settings/credits");
}

export async function createMarketplacePayPalOrder(purchase: MarketplacePurchaseRow): Promise<PayPalOrder> {
  return createOrder(purchase, `Marketplace template — ${purchase.listing_title}`, "/dashboard/marketplace/purchases");
}

async function createOrder(purchase: PayPalPurchase, description: string, returnPath: string): Promise<PayPalOrder> {
  const { origin } = getPayPalConfig();
  const body = {
    intent: "CAPTURE",
    purchase_units: [{ reference_id: purchase.listing_id ?? purchase.id, custom_id: purchase.id, invoice_id: purchase.listing_id ? `marketplace:${purchase.id}` : purchase.id,
      description: `Sceenyk Sandbox — ${description}`.slice(0, 127),
      amount: { currency_code: purchase.currency, value: purchaseAmount(purchase) } }],
    payment_source: { paypal: { experience_context: {
      brand_name: "Sceenyk Sandbox", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW",
      return_url: `${origin}${returnPath}?checkout=return`, cancel_url: `${origin}${returnPath}?checkout=cancel`,
    } } },
  };
  return paypalOrder.parse(await request("/v2/checkout/orders", "POST", JSON.stringify(body), purchase.id));
}

export async function readPayPalOrder(id: string) {
  return paypalOrder.parse(await request(`/v2/checkout/orders/${paypalOrderId.parse(id)}`, "GET"));
}

const providerLinks = z.array(z.object({ rel: z.string(), href: z.string() })).max(100);
export const paypalCaptureSchema = z.object({
  id: paypalOrderId, status: z.string(), amount: money, final_capture: z.boolean(),
  supplementary_data: z.object({ related_ids: z.object({ order_id: paypalOrderId }) }).optional(),
  links: providerLinks.optional(),
});
export const paypalRefundSchema = z.object({
  id: paypalOrderId, status: z.string(), amount: money, links: providerLinks,
  seller_payable_breakdown: z.object({ total_refunded_amount: money.optional() }).optional(),
});
export async function readPayPalCapture(id: string) {
  return paypalCaptureSchema.parse(await request(`/v2/payments/captures/${paypalOrderId.parse(id)}`, "GET"));
}
export async function readPayPalRefund(id: string) {
  return paypalRefundSchema.parse(await request(`/v2/payments/refunds/${paypalOrderId.parse(id)}`, "GET"));
}
// Extract an identifier only. Never fetch provider-supplied URLs.
export function paypalParentId(links: z.infer<typeof providerLinks>, kind: "captures" | "orders") {
  const link = links.find(link => link.rel === "up");
  if (!link) throw new Error("PAYPAL_PARENT_UNAVAILABLE");
  const url = new URL(link.href);
  const prefix = kind === "captures" ? "/v2/payments/captures/" : "/v2/checkout/orders/";
  if (url.protocol !== "https:" || !["api-m.sandbox.paypal.com", "api.sandbox.paypal.com"].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(prefix)) throw new Error("PAYPAL_PARENT_MISMATCH");
  return paypalOrderId.parse(url.pathname.slice(prefix.length));
}

export async function capturePayPalOrder(purchase: PayPalPurchase) {
  const id = paypalOrderId.parse(purchase.paypal_order_id);
  return paypalOrder.parse(await request(`/v2/checkout/orders/${id}/capture`, "POST", "{}", purchase.capture_request_id));
}

export function verifyOrder(purchase: PayPalPurchase, order: PayPalOrder) {
  const unit = order.purchase_units[0];
  if ((purchase.paypal_order_id && order.id !== purchase.paypal_order_id) ||
    unit.reference_id !== (purchase.listing_id ?? purchase.id) || unit.custom_id !== purchase.id || unit.invoice_id !== (purchase.listing_id ? `marketplace:${purchase.id}` : purchase.id) ||
    unit.amount.value !== purchaseAmount(purchase) || unit.amount.currency_code !== purchase.currency) {
    throw new Error("PAYPAL_ORDER_MISMATCH");
  }
}

export function verifiedCapture(purchase: PayPalPurchase, order: PayPalOrder) {
  verifyOrder(purchase, order);
  const captures = order.purchase_units[0].payments?.captures;
  if (order.status !== "COMPLETED" || captures?.length !== 1) throw new Error("PAYPAL_CAPTURE_NOT_COMPLETED");
  const capture = captures[0];
  if (capture.status !== "COMPLETED" || !capture.final_capture ||
    capture.amount.value !== purchaseAmount(purchase) || capture.amount.currency_code !== purchase.currency) {
    throw new Error("PAYPAL_CAPTURE_MISMATCH");
  }
  return capture;
}

export function approvalUrl(order: PayPalOrder) {
  const link = order.links?.find(link => link.rel === "payer-action" || link.rel === "approve");
  if (!link) throw new Error("PAYPAL_APPROVAL_UNAVAILABLE");
  const url = new URL(link.href);
  if (url.protocol !== "https:" || url.hostname !== "www.sandbox.paypal.com" || url.port ||
    url.username || url.password || url.pathname !== "/checkoutnow" || url.searchParams.get("token") !== order.id) {
    throw new Error("PAYPAL_UNSAFE_APPROVAL_URL");
  }
  return url.toString();
}

export async function verifyPayPalWebhook(raw: string, headers: Headers) {
  const { webhookId } = getPayPalConfig();
  const required = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  if (required.some(name => !headers.get(name) || headers.get(name)!.length > 4096)) return false;
  const cert = new URL(headers.get("paypal-cert-url")!);
  if (cert.protocol !== "https:" || !["api.sandbox.paypal.com", "api-m.sandbox.paypal.com"].includes(cert.hostname) ||
    cert.port || cert.username || cert.password || !cert.pathname.startsWith("/v1/notifications/certs/")) return false;
  const metadata = JSON.stringify({
    auth_algo: headers.get("paypal-auth-algo"), cert_url: cert.toString(),
    transmission_id: headers.get("paypal-transmission-id"), transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"), webhook_id: webhookId,
  });
  // Preserve the original event JSON bytes/formatting for official postback verification.
  JSON.parse(raw);
  const result = await request("/v1/notifications/verify-webhook-signature", "POST", `${metadata.slice(0, -1)},"webhook_event":${raw}}`);
  return z.object({ verification_status: z.string() }).parse(result).verification_status === "SUCCESS";
}
