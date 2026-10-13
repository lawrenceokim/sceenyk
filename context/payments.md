# PayPal Sandbox credit purchases

## Approved commercial contract — pay as you go (2026-10-13)

**"Buy credits. Create what you need. Top up when you need more."** Sceenyk's primary model is user-initiated one-time credit-pack purchases. New users retain two lifetime free generations under the existing duration/entitlement rules. After free usage is exhausted, users buy packs, use credits for AI generations and top up again when the balance is low or zero. Longer/paid requests continue to require the existing server-issued quote.

Purchased credits are usage units, not monthly allowances. A pack does not promise a month of access, enroll the user in a recurring plan or schedule a monthly credit allocation. **Purchased credits do not expire unless a future explicit product decision changes this.** Five-minute generation quote expiry is unrelated to credit lifetime. Cost must be shown before explicit confirmation; price, currency, credit grant, balance checks and generation cost remain authoritative on the server. Existing reserve/consume/restore and exactly-once purchase fulfilment remain unchanged.

Production pack prices and generation tariffs are still unresolved. Larger packs may eventually provide better value per credit, but this approves no production discount schedule or conversion rate. The existing centrally configured Sandbox/demo packs below remain temporary test values. One-time Merchant Sandbox purchase acceptance is Complete; the commercial documentation update implements no new behavior and enables no Live payments.

Monthly subscriptions, monthly generation plans, monthly credit allocations and recurring billing are **not current scope or the next required commercial feature**. Possible future membership benefits—discounted credits, priority generation, premium models, larger uploads and higher-quality exports—are unapproved examples requiring a separate product decision. Historical references to subscriptions as the expected commercial progression are superseded by this contract.

**Optional future auto-recharge is separate from monthly subscriptions:** user-selected balance threshold → balance falls below the threshold → purchase a predefined pack using a payment method explicitly authorized for automatic purchases. Consent/payment-method authorization, charge limits, failure recovery and implementation need a future specification. Current checkout has no auto-recharge or saved-method mandate; this task adds neither.

**Complete within Merchant Sandbox acceptance (2026-10-13):** a real Sandbox Personal buyer approved USD1.00, PayPal completed capture, and Sceenyk increased paid balance0→100 exactly once with one immutable ledger entry. Browser-independent recovery, duplicate completion, actual webhook resend plus user-confirmed HTTP200 delivery, ownership, tampered inputs, failed-unapproved capture/cancellation and persistence pass. Funded pending/denied capture states are explicitly fixture-tested, not generated live. No Live or real-money payment. Final rendering remains In Progress: Render Free512MB is insufficient; hosted acceptance is intentionally deferred until the Render plan is upgraded. No hosted render occurs in this unit.

## Setup

1. Use a PayPal **Sandbox REST app**, Sandbox business seller and separate Sandbox personal buyer. Never use Live credentials or a real PayPal account.
2. Apply [migration 017](../supabase/migrations/20261013001700_paypal_sandbox_purchases.sql) after 001–016 in development Supabase. It is transactional, preserves history and holds, and follows the existing apply-once migration convention. Do not rerun applied SQL manually.
3. Configure server-only `PAYPAL_ENVIRONMENT=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_RETURN_ORIGIN` in ignored `.env.local` and on the application host. The origin is exactly the application origin: HTTPS when deployed, or `http://localhost:3000` locally. Restart/rebuild after configuration changes.
4. Deploy the app. In the same Sandbox REST app, register `https://<app-origin>/api/payments/paypal/webhook` for `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`. Standard Merchant fulfilment does not require `CHECKOUT.ORDER.COMPLETED`; the handler supports it only as an optional additional notification. Set the registration's webhook ID in server configuration. Localhost cannot receive direct delivery; use the deployed HTTPS endpoint for real webhook acceptance. No Render or Inngest change is needed.
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

`npm run test:payments` passes80 checks using actual migrations/services/REST adapter in isolated PostgreSQL with explicit Clerk/PayPal fixtures. Combined accounting/pricing/generation/dispatch coverage totals412 checks. This includes verified pending/denied notification zero-grant behavior and completed-capture-only fulfilment without ORDER.COMPLETED. PGlite serializes one connection; its parallel calls do not establish hosted multi-session contention. Current TypeScript, lint, production build and client-secret results are recorded in the tracker. Real deployed paid-success/cancelled-history UI passes at1440/390/320px in both themes, keyboard focus and no uncaught exceptions, with screenshots reviewed.

Migration017 is applied and Sandbox OAuth/registered Merchant webhook subscriptions are live-verified. Order `4RS60700G93970356` → capture `7RK19817E12360737` → ledger `c894c785-4146-47ca-bf33-d91a7d945704` grants100 once. The creating browser was closed before manual approval; hosted completed state was verified before any A completion action in this acceptance run. The four actual subscriptions omit ORDER.COMPLETED, proving it is not required. Event `WH-56D01463NR4441818-57B84483TA390283L` was resent through PayPal's official API; the user confirmed successful HTTP200 delivery in the dashboard, while agent-run reads prove unchanged100/one-ledger accounting. The API does not expose delivery HTTP status, so that part is explicitly user-reported.

Actual browser tampering and B completion are denied; public/authenticated13/17-file scans find no configured secrets. Hosted no-op permission probes deny service-role direct writes to balance/purchase/ledger and deny browser database access. Free counters stay2/0/0 and paid reserved0. Unpaid Medium order `9VA231604U6394746` fails capture with PayPal422 before approval, grants nothing, and is then cancelled. Funded pending/denied provider states remain fixture coverage; neither they nor mock simulator signatures are represented as live events.

The staged harness `scripts/acceptance-payments.mjs` retains safe evidence in `%TEMP%/sceenyk-paypal-sandbox-acceptance.json`. Set `PAYPAL_ACCEPTANCE_ORIGIN=https://sceenyk.vercel.app` when running deployed acceptance; local `PAYPAL_RETURN_ORIGIN` may remain localhost. Available modes include preflight, ui, begin (one Sandbox order), observe (read only), webhook-readiness, webhook-proof (before A completion), webhook-replay, webhook-replay-proof, browser-security, database-security and verify. The `confirm-webhook-delivery` mode records an explicit user dashboard confirmation only; never use it to infer or fabricate delivery. No buyer password is required: approval was manual, and credentials stay out of chat/artifacts.

Production pack prices, generation tariffs, provider-to-credit conversion, markup, possible larger-pack discounts and refund policy remain unresolved. Monthly subscriptions and recurring plans are outside current scope; membership and auto-recharge are optional future ideas requiring explicit approval. Live, payouts and marketplace are excluded. Sandbox one-time purchases are Complete. A renderer hosting upgrade and real final-video acceptance require separate authorization; final rendering stays In Progress/deferred because Render Free 512 MB RAM is insufficient. No next feature starts from this documentation task.

Official references reviewed: [Orders v2 create](https://developer.paypal.com/api/orders/v2/orders-create), [capture](https://developer.paypal.com/api/orders/v2/orders-capture), [REST idempotency](https://developer.paypal.com/api/rest/reference/idempotency/), [webhook integration/postback verification](https://developer.paypal.com/api/rest/webhooks/rest/).
