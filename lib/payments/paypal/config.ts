import "server-only";
import { validateApplicationOrigin } from "@/lib/application-origin";

export function getPayPalConfig() {
  if (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_SECRET) throw new Error("PUBLIC_PAYPAL_SECRET_REJECTED");
  // Never accept an arbitrary API base URL or infer the environment from NODE_ENV.
  if (process.env.PAYPAL_ENVIRONMENT !== "sandbox") throw new Error("PAYPAL_SANDBOX_REQUIRED");
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!clientId || !clientSecret || !webhookId) throw new Error("PAYPAL_NOT_CONFIGURED");
  let origin: string;
  try { origin = validateApplicationOrigin(process.env.PAYPAL_RETURN_ORIGIN?.trim() ?? ""); }
  catch { throw new Error("PAYPAL_INVALID_RETURN_ORIGIN"); }
  // This stable configured origin also binds payout webhook readiness. Browser
  // checkout returns are resolved separately from the initiating request.
  return { clientId, clientSecret, webhookId, origin, baseUrl: "https://api-m.sandbox.paypal.com" as const };
}

export function isPayPalConfigured() {
  try { getPayPalConfig(); return true; } catch { return false; }
}
