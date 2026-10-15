// Read-only Sandbox capability/subscription inspection. Never sends a payout,
// changes a webhook, applies a migration or prints account/credential values.
import { getPayPalConfig } from "../lib/payments/paypal/config";
import { payoutWebhookEvents } from "../lib/marketplace/withdrawals/contract";
import { createDatabaseClient } from "../lib/db/server";
async function main() {
const c = getPayPalConfig();
const tokenResponse = await fetch(`${c.baseUrl}/v1/oauth2/token`, { method: "POST", headers: {
  Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded",
}, body: "grant_type=client_credentials", signal: AbortSignal.timeout(20000) });
if (!tokenResponse.ok) throw new Error(`SANDBOX_OAUTH_HTTP_${tokenResponse.status}`);
const token = await tokenResponse.json() as { access_token: string; scope?: string };
const response = await fetch(`${c.baseUrl}/v1/notifications/webhooks/${encodeURIComponent(c.webhookId)}`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error(`SANDBOX_WEBHOOK_HTTP_${response.status}`);
const webhook = await response.json() as { event_types: { name: string }[]; url: string };
const missing = payoutWebhookEvents.filter(name => !webhook.event_types.some(e => e.name === name || e.name === "*"));
const tables = await createDatabaseClient().from("creator_withdrawals").select("id").limit(1);
console.log(JSON.stringify({ environment: "sandbox", oauthPayoutScopePresent: (token.scope ?? "").split(" ").includes("https://uri.paypal.com/payments/payouts"),
  missingWebhookEvents: missing, webhookMatchesConfiguredOrigin: webhook.url === `${c.origin}/api/payments/paypal/webhook`,
  withdrawalSchemaReadable: !tables.error, schemaErrorCode: tables.error?.code ?? null,
  payoutExecutionEnabled: process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED === "sandbox-confirmed", payoutExecuted: false,
}));
}
main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "SANDBOX_SETUP_INSPECTION_UNAVAILABLE";
  const cause = error instanceof Error ? error.cause as { code?: string } | undefined : undefined;
  console.error(JSON.stringify({ code, networkCode: cause?.code && /^[A-Z0-9_]{1,80}$/.test(cause.code) ? cause.code : null })); process.exitCode = 1;
});
