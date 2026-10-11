# Commercial cost contract

Approved 2026-10-11. Credits are internal Sceenyk usage units, separate from money, PayPal balances and provider billing units. No fixed dollar conversion exists. Every application user retains two lifetime free generations of at most ten seconds, under the unchanged [accounting contract](accounting.md).

## Server boundary and flow

`lib/pricing/config.ts` owns validated server-only retail configuration and `quoteGenerationCost(snapshot)`. `lib/pricing/server.ts` exposes the authenticated reusable quote service through the thin `quoteGenerationAction`. It reuses generation/project schemas and current workspace choices. Database quote issuance verifies project ownership and all uploaded asset associations. No browser owner, cost, tier, pricing version or free-eligibility field is accepted.

Review cost → validated normalized immutable request → owned server-issued quote → displayed free/credit decision → explicit confirmation → account-locked quote validation → existing transactional job/reservation → durable dispatch → existing consumption/restoration. A quote alone never reserves or dispatches work. Confirmation accepts only the opaque quote UUID; the server derives the owner and current configuration version. The database rechecks project ownership, expiry, free eligibility, uploaded media and available credits. Insufficient credits creates no job/hold. A free/paid eligibility change requires a new quote and confirmation; it never silently converts free consent into a paid reservation.

Quotes expire after five minutes. Editing category/prompt/settings/assets hides the old quote and requires review again. Lost confirmation responses retain the original quote UUID/request identity for retry and status recovery. A duplicate committed confirmation returns the original job even after expiry, pricing changes or settlement; it never reserves again. A different quote cannot replace an already admitted request's provenance.

## Configuration and workload

Paid pricing defaults to **unavailable**, including for users with a positive balance. No final retail values are invented. Optional server-only `SCEENYK_TEST_PRICING_JSON` enables explicitly labeled development/test quotes, including in a production-built development deployment. It is not approved production pricing. Invalid/ambiguous configuration fails closed with safe UI errors. Do not set this variable to introduce real paid service.

The JSON schema is `{ version: string, rules: [{ workload: { category, duration, operation, modelTier, quality, features }, credits: positiveSafeInteger }] }`. Categories and duration strings reuse the workspace choices. Operation is `transformation` or `new_generation`. Current trusted routing resolves `modelTier: "unassigned"`, `quality: "workspace-default"`, `features: []`, and operation from the creation category. All workload dimensions must match exactly. Unmatched workloads have no paid tariff. Future provider/model/resolution/expensive-feature routing must supply trusted workload dimensions here before adding corresponding rates; the browser cannot choose a pricing tier. No multipliers, markup or currency formula are assumed. Tests use arbitrary isolated credit units, not commercial offers.

Version identity combines the configuration's human version with SHA-256 of validated configuration contents and a pricing-contract identifier. Even changing rates while reusing a human label invalidates unconfirmed quotes. Deployment changes to trusted routing/pricing semantics must bump the contract identifier. No provider costs, secrets or configuration rules are sent to clients; quote DTOs include only retail cost, safe breakdown, balance/allowance snapshot, mode, version and expiry.

## Immutable evidence and migration

New migration `20261011000700_generation_pricing.sql` requires 006, preserves migrations 001–006, existing jobs, balances, reservations, ledger and settlement functions. It adds immutable `generation_quotes` and `generation_pricing_records`, with owner/project/job associations, RLS/browser denial, read-only service table grants and service-only issuance/confirmation RPCs. Historical jobs remain unchanged and have no invented pricing version. Existing in-flight jobs still settle under 006. Apply 007 before deploying matching code; older builds lose direct admission access and must be replaced with the quote-aware build. Hosted application is pending until verified.

New generation insertion requires quote provenance at transaction commit. Direct 006 admission is revoked from the service role; confirmation invokes it internally under the account lock. The immutable quote retains normalized input, selected free/credit outcome, exact required credits, pricing mode/version and timestamps. The immutable record joins that quote to the existing reservation/job/ledger; historical rates never get recalculated. Failure restoration and stored-result settlement still use the original reserved amount exactly once.

## UI and payments

Creation adds only cost review, explicit confirmation, safe unavailable/expired feedback, and insufficient-credit copy showing required/available credits. Buy credits remains disabled and marked coming soon. Shared tokens support both themes; no dollar prices, checkout or successful-purchase simulation exists.

Development and hackathon payment testing must use **PayPal Sandbox only**. PayPal Live credentials/transactions must not be used during development. A future payment service must expose an intentional environment/credential switch from Sandbox to Live; this unit implements no payment integration.

## Unresolved commercial values

- Credit-pack prices; subscription prices and monthly credit allocations.
- Exact production credits per generation/type/duration/model/resolution/feature.
- Model multipliers, provider-cost markup and conversion policy.
- Creator marketplace prices, fees, revenue shares and payouts.

Next recommended unit: measure the first selected provider's actual costs, then approve/configure production retail credit rules. PayPal Sandbox purchases require separate authorization and approved pack economics.
