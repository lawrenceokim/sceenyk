import "server-only";

export function getPayPalConfig() {
  if (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_SECRET) throw new Error("PUBLIC_PAYPAL_SECRET_REJECTED");
  // Never accept an arbitrary API base URL or infer the environment from NODE_ENV.
  if (process.env.PAYPAL_ENVIRONMENT !== "sandbox") throw new Error("PAYPAL_SANDBOX_REQUIRED");
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!clientId || !clientSecret || !webhookId) throw new Error("PAYPAL_NOT_CONFIGURED");
  const origin = new URL(process.env.PAYPAL_RETURN_ORIGIN ?? "");
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) {
    throw new Error("PAYPAL_INVALID_RETURN_ORIGIN");
  }
  return { clientId, clientSecret, webhookId, origin: origin.origin, baseUrl: "https://api-m.sandbox.paypal.com" as const };
}

export function isPayPalConfigured() {
  try { getPayPalConfig(); return true; } catch { return false; }
}
