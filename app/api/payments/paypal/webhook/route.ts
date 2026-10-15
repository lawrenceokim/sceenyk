import { handleVerifiedPayPalEvent } from "@/lib/payments/server";
import { verifyPayPalWebhook } from "@/lib/payments/paypal/client";
import { handleVerifiedMarketplacePayPalEvent } from "@/lib/marketplace/payments/server";
import { handleVerifiedPayoutEvent } from "@/lib/marketplace/withdrawals/server";

// Node.js is the default; explicit runtime config is disabled with Cache Components.
export const maxDuration = 120;

async function boundedBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 262144)
    throw new Error("BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("BODY_REQUIRED");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262144) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const raw = await boundedBody(request);
    if (!(await verifyPayPalWebhook(raw, request.headers)))
      return Response.json(
        { code: "INVALID_SIGNATURE" },
        { status: 400, headers },
      );
    const event: unknown = JSON.parse(raw);
    if (!await handleVerifiedPayoutEvent(event) && !await handleVerifiedPayPalEvent(event)) await handleVerifiedMarketplacePayPalEvent(event);
    return Response.json({ received: true }, { headers });
  } catch {
    // Never acknowledge a verified event before fulfilment commits. PayPal
    // retries delivery; a duplicate executes the same order/capture transaction.
    return Response.json(
      { code: "WEBHOOK_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
