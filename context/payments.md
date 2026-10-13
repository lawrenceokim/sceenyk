# PayPal Sandbox credit purchases

**In Progress:** source and isolated verification exist; real buyer approval/capture and authentic hosted webhook delivery are required before Complete. Final rendering remains In Progress: Render Free 512 MB RAM is insufficient for hosted Remotion/FFmpeg final rendering; hosted acceptance is intentionally deferred until the Render plan is upgraded. No hosted render occurs in this unit.

## Setup

1. Use a PayPal **Sandbox REST app**, Sandbox business seller and separate Sandbox personal buyer. Never use Live credentials or a real PayPal account.
2. Apply [migration 017](../supabase/migrations/20261013001700_paypal_sandbox_purchases.sql) after 001–016 in development Supabase. It is transactional, preserves history and holds, and follows the existing apply-once migration convention. Do not rerun applied SQL manually.
3. Configure server-only `PAYPAL_ENVIRONMENT=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_RETURN_ORIGIN` in ignored `.env.local` and on the application host. The origin is exactly the application origin: HTTPS when deployed, or `http://localhost:3000` locally. Restart/rebuild after configuration changes.
4. Deploy the app. In the same Sandbox REST app, register `https://<app-origin>/api/payments/paypal/webhook` for `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`. Set the registration's webhook ID in server configuration. Localhost cannot receive direct delivery; use the deployed HTTPS endpoint for real webhook acceptance. No Render or Inngest change is needed.
5. Run `node scripts/acceptance-payments.mjs preflight`, then test `/dashboard/credits`.

Missing configuration fails closed. `live` is rejected even in production Next.js builds. The API origin is fixed to `https://api-m.sandbox.paypal.com`, HTTP redirects are refused, and approval URLs must use `https://www.sandbox.paypal.com/checkoutnow` with the exact order token. Trusted return URLs never come from browser input. Hosted checkout uses current Orders v2 REST with `payment_source.paypal.experience_context`; no browser SDK, public client ID or new dependency is needed. Secrets, tokens, buyer details and provider response/error bodies are never logged or returned.

## Temporary demo packs

Central server-only `lib/payments/packs.ts` defines arbitrary **Sandbox/hackathon values**, never approved production economics:

| Pack ID | Label | Test amount | Test credits |
| --- | --- | --- | --- |
| sandbox-small-v1 | Small Test Pack | USD 1.00 | 100 |
| sandbox-medium-v1 | Medium Test Pack | USD 3.00 | 350 |
| sandbox-large-v1 | Large Test Pack | USD 5.00 | 650 |

Change pack IDs when changing values. Existing purchases retain immutable snapshots. Browser create accepts exactly `{packId}`; additional amount, credits, currency or owner fields are rejected. Display data is never authority.

## Lifecycle and accounting

`credit_purchases` stores owner, Sandbox environment, pack snapshot, integer cents, currency, exact credits, persistent create/capture UUIDs, unique order/capture IDs and created/updated/completed timestamps. States: pending → approved → completed, plus failed/cancelled checkout outcomes. Only a verified completed final capture can grant credits. Cancellation cannot erase a raced verified payment; cancelled orders are not newly captured by reconciliation. Refunds, reversals, disputes and refund policy remain separate work.

Persist pending **before** PayPal creation to recover lost responses. Account-locked preparation reuses an outstanding same-pack purchase; a maximum of 20 new purchases/account/hour bounds new-record creation. Create uses the purchase UUID as `PayPal-Request-ID`; capture uses another persisted UUID. Unknown create retries are bounded to five minutes inside provider retention. An older unattached purchase remains pending for operator reconciliation rather than blindly creating another order. Authentic webhooks can recover an early/lost create response using the verified order's custom reference.

All browser mutations independently resolve Clerk → app user → owned purchase before PayPal HTTP. GET precedes capture to recover earlier successful POSTs. Only approved, uncancelled orders are newly captured. Timeouts/errors are uncertain; reread the same order and retain pending state. Browser success and elapsed time never establish payment.

Verification requires exact order identity, CAPTURE intent, one purchase unit, matching reference/custom/invoice IDs, expected amount/currency, completed order and exactly one final COMPLETED capture for the same amount/currency. `fulfil_paypal_purchase` then locks purchase and existing account, inserts an immutable purchase ledger entry, increments paid available credits and completes the purchase in one transaction. Unique purchase/order/capture/reference constraints arbitrate duplicates. Any failure rolls everything back; repeated completion returns the original outcome.

The existing ledger is extended, not replaced. Generation rows retain job linkage, movement constraints and unique job/type/reference rules. Purchase rows have no job and include purchase/order/capture IDs, type/reason `purchase`, positive available delta, zero reserved delta and `paypal:sandbox:<order>:<capture>` as unique reference. Existing append-only enforcement stays. Browser roles cannot access tables/RPCs. Service role can read and invoke guarded RPCs but cannot directly write balances, purchases or ledger.

Purchases change only paid available credits and account update time. Two lifetime free generations, free usage, reserved credits, existing jobs/quotes/reservations and provider assets stay unchanged. Paid generation still uses the existing quote contract; unconfigured generation pricing blocks paid admission regardless of purchased balance.

## Webhooks and recovery

The exact webhook path bypasses Clerk middleware and always requires official `/v1/notifications/verify-webhook-signature` postback on the fixed Sandbox API. All five signature headers and the configured webhook registration ID are required. The original raw JSON is embedded unchanged. Certificate URLs must identify Sandbox notification certificates; Sceenyk never downloads arbitrary certificates. Request bodies are bounded to 256 KiB.

Only `SUCCESS` verification permits handling. Events trigger authoritative order rereads and the same capture/fulfilment path; payload amounts never mint credits. Provider/DB failures or unfinished approved captures return 503 for redelivery. Duplicate completed events return 200 after the idempotent outcome; invalid signatures return 400. Immutable order/capture effects deduplicate events without a separate event ledger. Official postback verification does not support mock simulator events; they are not real acceptance.

Page load, checkout return, browser activation and Check purchases reconcile at most five owned outstanding orders. This recovers refreshes, closed browsers and missed callbacks; registered authentic webhooks recover payments without the browser. There is no new cron/worker. Actual registration/delivery must be verified before claiming browser-independent recovery.

## Verification and remaining scope

`npm run test:payments` passes 77 checks using actual migrations/services/REST adapter in isolated PostgreSQL with explicit Clerk/PayPal fixtures. Combined with accounting/pricing/generation/dispatch regressions, 409 isolated checks pass. PGlite serializes one connection; its parallel calls do not establish hosted multi-session contention. TypeScript, lint, production build and `test:client-secrets` pass (23 client files, 11 configured secrets, zero leaks/server markers). Nine real Chrome/Clerk UI checks verify the missing-configuration/schema state at 1440/390/320px in both themes, keyboard focus and no uncaught exceptions. Paid-success UI remains pending real acceptance.

Latest read-only hosted preflight: migration 017 is unavailable (`PGRST205`); local Sandbox configuration/OAuth are not yet available. The user is still setting up credentials/accounts, migration and webhook registration. No real Sandbox order/capture has been performed in this unit. The final renderer remains deferred and no hosted render was attempted.

Real acceptance must prove authenticated UI, Sandbox creation, separate buyer approval, completed capture, exact ledger/balance, refresh, duplicate capture, User B denial, cancelled/failed zero credits, refresh during checkout, authentic webhook recovery and no real-money charge. `scripts/acceptance-payments.mjs` supports staged verification. Never call fixture success a real Sandbox payment.

Production pack prices, generation tariffs, provider-to-credit conversion, markup and refund policy remain unresolved. Live, subscriptions, recurring billing, payouts and marketplace are excluded. After payment acceptance, recommend a separately authorized renderer hosting upgrade and real final-video acceptance.

Official references reviewed: [Orders v2 create](https://developer.paypal.com/api/orders/v2/orders-create), [capture](https://developer.paypal.com/api/orders/v2/orders-capture), [REST idempotency](https://developer.paypal.com/api/rest/reference/idempotency/), [webhook integration/postback verification](https://developer.paypal.com/api/rest/webhooks/rest/).
