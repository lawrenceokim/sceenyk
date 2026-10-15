import "server-only";
import { z } from "zod";
import { getPayPalConfig } from "@/lib/payments/paypal/config";
import { paypalAccessToken } from "@/lib/payments/paypal/client";
import { payoutWebhookEvents, type WithdrawalRow } from "./contract";

const providerId = z.string().regex(/^[A-Z0-9]{5,64}$/);
export const payoutBatchSchema = z.object({
  batch_header: z.object({ payout_batch_id: providerId, batch_status: z.string(), sender_batch_header: z.object({ sender_batch_id: z.string() }) }),
  items: z.array(z.object({ payout_item_id: providerId, payout_batch_id: providerId.optional(), transaction_status: z.string(),
    payout_item: z.object({ sender_item_id: z.string(), receiver: z.string(), recipient_type: z.literal("EMAIL"), amount: z.object({ currency: z.literal("USD"), value: z.string() }) }),
  })).max(1).optional(),
});
export type PayoutBatch = z.infer<typeof payoutBatchSchema>;
// No automatic POST retries: even transport failures may have moved money.
export class PayoutRejected extends Error {
  constructor(public readonly code: string) { super(code); }
}
export async function assertPayoutWebhooksReady() {
  const c = getPayPalConfig();
  const token = await paypalAccessToken();
  const response = await fetch(`${c.baseUrl}/v1/notifications/webhooks/${encodeURIComponent(c.webhookId)}`, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("PAYPAL_PAYOUT_SETUP_REQUIRED");
  const webhook = z.object({ url: z.string(), event_types: z.array(z.object({ name: z.string() })) }).parse(await response.json());
  if (webhook.url !== `${c.origin}/api/payments/paypal/webhook` || payoutWebhookEvents.some(name => !webhook.event_types.some(e => e.name === name || e.name === "*"))) throw new Error("PAYPAL_PAYOUT_SETUP_REQUIRED");
  return token; // Reuse the prepared token after claim; no second OAuth send gap.
}
async function request(path: string, body?: unknown, preparedToken?: string) {
  const config = getPayPalConfig();
  const token = preparedToken ?? await paypalAccessToken();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const name = z.object({ name: z.string() }).safeParse(value);
    // These explicit API rejections prove that the instruction was not accepted.
    if ([400,403,422].includes(response.status) && name.success && ["AUTHORIZATION_ERROR", "NOT_AUTHORIZED", "INSUFFICIENT_FUNDS"].includes(name.data.name)) throw new PayoutRejected(name.data.name);
    throw new Error("PAYPAL_PAYOUT_AMBIGUOUS");
  }
  return payoutBatchSchema.parse(value);
}
export function payoutInstruction(w: WithdrawalRow) {
  if (w.status !== "processing" || w.submitted_minor === null) throw new Error("PAYOUT_NOT_CLAIMED");
  return { sender_batch_header: { sender_batch_id: w.id, email_subject: "Your Sceenyk Sandbox payout" }, items: [{
    recipient_type: "EMAIL", receiver: w.destination_snapshot, amount: { currency: "USD", value: (w.submitted_minor / 100).toFixed(2) },
    sender_item_id: w.id, recipient_wallet: "PAYPAL",
  }] };
}
export function submitPayout(w: WithdrawalRow, preparedToken?: string) { return request("/v1/payments/payouts", payoutInstruction(w), preparedToken); }
export function readPayoutBatch(id: string) { return request(`/v1/payments/payouts/${providerId.parse(id)}?page_size=1000`); }
export function verifyPayout(w: WithdrawalRow, batch: PayoutBatch, requireItem = false) {
  if (batch.batch_header.sender_batch_header.sender_batch_id !== w.id || (w.paypal_batch_id && w.paypal_batch_id !== batch.batch_header.payout_batch_id)) throw new Error("PAYPAL_PAYOUT_MISMATCH");
  const item = batch.items?.[0];
  if (!item) { if (requireItem) throw new Error("PAYPAL_PAYOUT_ITEM_MISSING"); return null; }
  if (w.submitted_minor === null || item.payout_item.sender_item_id !== w.id || item.payout_item.receiver !== w.destination_snapshot ||
    item.payout_item.amount.value !== (w.submitted_minor / 100).toFixed(2) || (item.payout_batch_id && item.payout_batch_id !== batch.batch_header.payout_batch_id) ||
    (w.paypal_item_id && w.paypal_item_id !== item.payout_item_id)) throw new Error("PAYPAL_PAYOUT_MISMATCH");
  return item;
}
