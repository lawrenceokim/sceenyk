# Commercial cost contract

Approved 2026-10-11. Credits are internal Sceenyk usage units, separate from money, PayPal balances and provider billing units. No fixed dollar conversion exists. Every application user retains two lifetime free generations of at most ten seconds, under the unchanged [accounting contract](accounting.md).

**Commercial decision approved 2026-10-13:** the primary model is [pay-as-you-go credits](overview.md#approved-commercial-model--pay-as-you-go-2026-10-13). Users buy one-time packs and top up when they need more. Purchased credits do not expire unless a future explicit product decision changes this; they are not monthly allowances or a month of access. Monthly subscriptions and recurring plans are outside current scope. Larger packs may eventually offer better value, but no production discount schedule or tariff is approved. This supersedes earlier monthly-price/allocation assumptions without changing the implemented quote/admission contract.

## Server boundary and flow

`lib/pricing/config.ts` owns validated server-only retail configuration and `quoteGenerationCost(snapshot)`. `lib/pricing/server.ts` exposes the authenticated reusable quote service through the thin `quoteGenerationAction`. It reuses generation/project schemas and current workspace choices. Database quote issuance verifies project ownership and all uploaded asset associations. No browser owner, cost, tier, pricing version or free-eligibility field is accepted.

Review cost → validated normalized immutable request → owned server-issued quote → displayed free/credit decision → explicit confirmation → account-locked quote validation → existing transactional job/reservation → durable dispatch → existing consumption/restoration. A quote alone never reserves or dispatches work. Confirmation accepts only the opaque quote UUID; the server derives the owner and current configuration version. The database rechecks project ownership, expiry, free eligibility, uploaded media and available credits. Insufficient credits creates no job/hold. A free/paid eligibility change requires a new quote and confirmation; it never silently converts free consent into a paid reservation.

Quotes expire after five minutes; purchased credits do not. Editing category/prompt/settings/assets hides the old quote and requires review again. Lost confirmation responses retain the original quote UUID/request identity for retry and status recovery. A duplicate committed confirmation returns the original job even after expiry, pricing changes or settlement; it never reserves again. A different quote cannot replace an already admitted request's provenance.

## Configuration and workload

Paid pricing defaults to **unavailable**, including for users with a positive balance. No final retail values are invented. Optional server-only `SCEENYK_TEST_PRICING_JSON` enables explicitly labeled development/test quotes, including in a production-built development deployment. It is not approved production pricing. Invalid/ambiguous configuration fails closed with safe UI errors. Do not set this variable to introduce real paid service.

The JSON schema is `{ version: string, rules: [{ workload: { category, duration, operation, modelTier, quality, features }, credits: positiveSafeInteger }] }`. Categories and duration strings reuse the workspace choices. Operation is `transformation` or `new_generation`. Current trusted routing resolves `modelTier: "unassigned"`, `quality: "workspace-default"`, `features: []`, and operation from the creation category. All workload dimensions must match exactly. Unmatched workloads have no paid tariff. Future provider/model/resolution/expensive-feature routing must supply trusted workload dimensions here before adding corresponding rates; the browser cannot choose a pricing tier. No multipliers, markup or currency formula are assumed. Tests use arbitrary isolated credit units, not commercial offers.

Version identity combines the configuration's human version with SHA-256 of validated configuration contents and a pricing-contract identifier. Even changing rates while reusing a human label invalidates unconfirmed quotes. Deployment changes to trusted routing/pricing semantics must bump the contract identifier. No provider costs, secrets or configuration rules are sent to clients; quote DTOs include only retail cost, safe breakdown, balance/allowance snapshot, mode, version and expiry.

## Immutable evidence and migration

New migration `20261011000700_generation_pricing.sql` requires 006, preserves migrations 001–006, existing jobs, balances, reservations, ledger and settlement functions. It adds immutable `generation_quotes` and `generation_pricing_records`, with owner/project/job associations, RLS/browser denial, read-only service table grants and service-only issuance/confirmation RPCs. Historical jobs remain unchanged and have no invented pricing version. Existing in-flight jobs still settle under 006. Apply 007 before deploying matching code; older builds lose direct admission access and must be replaced with the quote-aware build. Hosted tables and real local-production quote issuance/confirmation are verified. The user committed the core implementation in `0e7b182`; Vercel serves quote-aware UI/actions, and actual deployed confirmation, A/B denial and Cloud restoration pass. Detailed acceptance is recorded in the tracker. Final cached-route/type/lint refinements and documentation follow that commit.

New generation insertion requires quote provenance at transaction commit. Direct 006 admission is revoked from the service role; confirmation invokes it internally under the account lock. The immutable quote retains normalized input, selected free/credit outcome, exact required credits, pricing mode/version and timestamps. The immutable record joins that quote to the existing reservation/job/ledger; historical rates never get recalculated. Failure restoration and stored-result settlement still use the original reserved amount exactly once.

## UI and payments

Creation shows cost review, explicit confirmation, safe unavailable/expired feedback and insufficient-credit copy with required/available credits. The existing Buy credits path opens the protected Sandbox one-time purchase screen. Its demo packs do not establish production economics. Cost must remain visible before confirmation; server pricing/eligibility/balance and immutable quote provenance remain authoritative. Shared tokens support both themes.

Development and hackathon payment testing uses **PayPal Sandbox only**. The implemented payment boundary rejects Live and has completed real Merchant Sandbox acceptance; see [payments.md](payments.md). Any future Live rollout requires a separately authorized configuration/security unit. This commercial-model documentation update changes no payment or pricing code.

## Unresolved commercial values

- Production credit-pack prices and any larger-pack value/discount schedule.
- Exact production credits per generation/type/duration/model/resolution/feature.
- Model multipliers, provider-cost markup and conversion policy.
- Creator marketplace prices, fees, revenue shares and payouts.

Remaining commercial work: measure full-pipeline costs and approve production pack prices and retail generation credit rules. Sandbox one-time purchases are already Complete within their recorded acceptance; monthly subscriptions are not a prerequisite or next commercial unit. Membership and auto-recharge remain optional future decisions. No new implementation begins here.
