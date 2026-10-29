# Commercial cost contract

## V3 Phase 2 estimate and authorization separation (2026-10-29)

[V3 cost contract](generation-v3-phase2.md#package-cost-and-authorization) sums exact segment/account-bound authenticated estimates, with explicit local expiry. Missing/expired/ambiguous estimates block `COST_ESTIMATE_UNAVAILABLE`; public approximations and operator ceilings never become prices. Fresh package-specific V3 authority and later observed actual cost/receipts are separate immutable records. No authenticated estimate was requested here, no price/customer-credit mapping is invented, and paid transport remains disabled.

## V3 Phase 1 Higgsfield estimate foundation (2026-10-29)

[Independent Higgsfield pricing](generation-architecture-v3.md#pricing-implemented-without-network-calls) uses exact command/profile/account-scoped authenticated estimate evidence, captured later through the provider's estimate mechanism. Phase 1 prepares the same-input estimate descriptor and validates retained observations locally, but calls no endpoint. Missing/expired/conflicting evidence returns unavailable and blocks readiness. A separate published token-math helper requires explicit dimensions and does not invent output geometry, discounts or a price from a ceiling/headline per-second rate. No actual amount is fetched now.

Estimates, immutable authorization ID/version/input/capability/ceiling snapshots, current consumption and later actual provider cost/receipt stay separate. The default V3 planning resolution is 480p only; no existing environment/provider or retail/credit policy changes. V1/V2 tariffs/configuration/executions below remain unchanged historical/source evidence. A real fresh-project quote and reviewed authorization are Phase 2 prerequisites.

## Planned V3 Higgsfield segment pricing and 480p testing (2026-10-29)

[V3 pricing intent](generation-architecture-v3.md#development-quality-and-pricing-intent), **Planned / Not Started**, estimates video cost per Higgsfield Generation Segment, not per Storyboard scene. OpenAI understanding/image/creative operations retain their actual separately authorized costs. Native audiovisual generation removes normal separate ElevenLabs/Kling line items; no dollar saving or Higgsfield tariff is inferred. Verify Higgsfield's own model/account pricing, duration/resolution/options and billable units; do not transfer old fal rates or authorization ceilings into an estimate.

Planned development/testing default is 480p, without changing current configuration. Possible testing/free→480p, standard→720p, premium→1080p mappings are future examples, not implemented pricing/entitlements. Preserve finite request/spend authority, versioned quotes/fingerprints, reviewed retries/amendments, successful-segment reuse and reconciliation of unknown outcomes. Historical V1/V2 rates/estimates/voice credits below stay as evidence only; fresh-project testing requires fresh run authorization/accounting without resetting existing account rules.

## Planned V2 segment-based video pricing (2026-10-29)

[V2 cost/request authority](final-video-generation-v2.md#costs-request-authorization-and-immutable-identity), **Planned / Not Started**, estimates video requests/cost **per Generation Segment**, not per Storyboard scene. Two speaking scenes in one compatible 10s segment mean **one Seedance video request and zero separate Kling requests**, instead of V1's two video + two lip-sync requests. This is not one total provider request or a guaranteed dollar saving: voice design/binding/utterance work and authorized chargeable observation follow the actual ElevenLabs workflow, while rates depend on duration/resolution/audio/options and trusted estimator provenance.

Freeze capability/configuration/plan/master-aware quotes, immutable fingerprints, finite stage/segment/execution request/spend limits and explicit authorization; preserve reviewed retries/amendments and fail-before-spend checks. Reuse successful master/voice/video, price only reviewed replacement work and reconcile unknown paid outcomes before another request. Local FFmpeg recovery adds no video/TTS request. No tariff, production retail price, customer-credit mapping or configuration change is introduced. Dated per-scene quotes/numbers and M10 statuses below are V1 history, not a V2 quote.

## Canonical execution cost diagnostics (2026-10-28)

`finalPreflight` and the GET-only final-video inspector itemize the existing per-request operator ceilings as conservative estimates, including distinct Voice Design and voice-identity save requests. Current inspected project: 2×$6.25 video + $0.20 design + $0.01 save + 2×$0.10 speech + 2×$0.20 lip-sync = **$13.31**, 8 requests. Total authorization is unchanged at $7/8 requests: creative repair does not make funding sufficient. These are configured admission ceilings, not newly sourced tariffs or verified actual bills. M9 creative compatibility excludes the insufficient-budget issue; M10 still rejects it before spending. No prices, private authorization or customer-credit mapping is changed. [Exact breakdown/recovery](final-video-generation.md#exact-configured-cost-diagnostics).

## M10 implemented source boundary (2026-10-27)

**M9: Complete. M10: Complete in source for the configured local V1 profile. Runtime/provider/manual acceptance: Pending.** The implemented V1 requires explicit operator-funded local development, a versioned authorization UUID, supported language, finite maxRequests/maxEstimatedCostMicrousd and positive per-kind conservative estimates. Whole-package worst-case admission happens before work; SQL accounts one paid intent per stage and enforces totals before each new POST. No provider price defaults or customer tariff are invented. ElevenLabs character-cost is retained as reported units, never converted to unverified USD/customer credits. Actual unavailable dollar cost remains null.

[Actual source, verified API limits, required setup, checks and manual acceptance](final-video-generation.md#implemented-local-v1-source-and-profile). This current source entry supersedes implementation-status and task-permission statements in the older dated planning/history below. Unsupported capabilities fail closed; no real providers, worker processes, remote migrations, deployment or credit spending ran during implementation.


## Planned M10 scene cost authorization (2026-10-27)

[M10 admission](final-video-generation.md#paid-request-and-accounting-gates) freezes **separate video, voice and lip-sync fingerprints/attempt budgets** plus a finite whole-execution spend authority with the initial Generate Final Video quote/confirmation. Current exact package/scene/profile/source versions and model/configuration/pricing capability match are rechecked before every paid call. No scene review, provider chooser or extra routine voice trigger is a commercial step.

Include once-per-profile Voice Design/create, exact speech, synchronization and any chargeable observation in estimates/authorization. Reuse successful identities/video/audio/sync; known-failure retries need remaining explicitly covered budgets and definitive eligibility, while uncertain outcomes never auto-resubmit. Any spending beyond initial authority requires a safe stop and new authorization, not silent fallback or repurchase of successful scenes.

[Voice accounting units](voice-generation.md#cost-protection-security-and-completion) and provider usage are distinct from verified USD/customer credits. Record stage-level estimates/returned actuals with provenance; unavailable amounts stay null. Existing accounting/free-reservation authority remains mandatory; disabled accounting still needs explicit finite development funding. Rates/markup/preparation funding/hold policy are not invented and no pricing/source/configuration/provider operation changes now.

## M9 package versus later quote (2026-10-27)

M9 is Complete and approved per the owner and still stops at the approved-package pause. It computes no video tariff or paid admission. [M10's future quote/request gates](final-video-generation.md#paid-request-and-accounting-gates) are planned only; they cannot be bypassed by M9 approval or legacy provider pricing defaults. Existing financial rules and all source/runtime settings remain unchanged.

## Approved production Marketplace fee and withdrawal terms (2026-10-14)

**Approved policy; implementation is a future unit.** Sceenyk keeps **10%** and the creator earns **90%** of each paid adoption. A $10.00 purchase records $1.00 platform fee and $9.00 creator net. The server owns the USD price, fee/share calculation and frozen policy/version; client-calculated amounts are not trusted. Preserve the existing integer-cent sale calculation (1000 basis points, fee rounded down to cents and creator net the exact remainder) and approved cumulative refund rounding in [accounting.md](accounting.md#approved-production-marketplace-earnings-and-withdrawal-policy-2026-10-14).

Valid verified sale earnings become available unless blocked by an existing refund/reversal. Minimum withdrawal is **$5.00 USD**, with both unreserved available balance and the requested amount validated by the server. Reserve the accepted amount immediately into Pending Payout. The approved hold is **seven days from the withdrawal-request timestamp**, not from sale time; no payout is sent during it. After the hold, refund/dispute/reversal checks must pass before future PayPal payout eligibility. These are creator-money terms, with no conversion into withdrawable AI credits.

These approvals resolve the former fee/share/minimum/hold placeholders. They do not approve production listing-price bounds, generation tariffs, credit-pack prices, provider payout charges, recipient eligibility or detailed dispute/failure/liability handling. Creator payouts, withdrawal controls and the production policy rollout remain unimplemented. Existing Sandbox defaults and historical fee/eligibility snapshots below are preserved; neither environment variables nor runtime behavior change in this documentation task. USD is the only approved creator earnings/withdrawal currency.

## Creator settlement timing (2026-10-14)

**Existing Sandbox test timing:** this sale-hold configuration does not implement the approved seven-day withdrawal hold.

SCEENYK_MARKETPLACE_TEST_SETTLEMENT_SECONDS is server-only Sandbox/demo timing, default 300 seconds and validated from 60 through 86400. The policy version and eligibility time freeze once per original sale; existing pending sales receive an explicit first assignment. Future configuration changes do not rewrite assigned history. The approved production 10%/90% split and seven-day withdrawal-request hold are defined above; detailed refund/dispute and payout recovery policy still need specification. This Sandbox sale timer is not a production withdrawal hold. Existing Sandbox fee configuration and original gross/fee/net snapshots are preserved. Partial refunds use the cumulative proportional-cent rule documented in accounting.md; this is money accounting, never an AI-credit price or credit refund.


## Paid Marketplace Sandbox configuration — authorized 2026-10-14

Paid adoption is USD only, using explicit Sandbox/demo bounds of $1.00–$25.00 centralized in lib/marketplace/payments/contract.ts and independently enforced by the server configuration boundary. These are test safeguards, not production listing economics. Browser amount/currency/creator-share claims are rejected. The creator chooses free or paid plus integer cents; the server freezes each purchase's reviewed price and reusable snapshot before order creation. Listing price changes apply to new purchases; existing checkout summaries and entitlements retain their original amounts/configuration.

Server-only SCEENYK_MARKETPLACE_DEMO_FEE_BPS defaults to 0 (0%) and accepts integer basis points for explicit demo testing only. Purchase and earnings records separately preserve gross, platform fee and creator net in cents; fee uses integer floor division and net is the exact remainder. Production fee/share is now approved at 10%/90%; Sandbox configuration does not activate it. The later Sandbox settlement implementation applies its frozen test sale eligibility. Production earnings instead become available on a valid verified sale, with the seven-day hold deferred until a withdrawal request of at least $5 is reserved. Production listing-price bounds and detailed refund/dispute/payout recovery policies remain unresolved.

Cards/detail/payment review label creator adoption price separately from estimated Sceenyk generation credits. A purchase unlocks the reusable template and one adopted project; it includes no future generation usage and grants no AI credits. Generation estimates remain informational, may be unavailable, and never authorize a job. Actual generation still requires the existing server-issued quote and ordinary free/paid entitlement. Final rendering remains deferred.


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

Creation shows cost review, explicit confirmation, safe unavailable/expired feedback and insufficient-credit copy with required/available credits. Quote DTOs include server-derived expected remaining paid balance; the UI displays cost, available balance and after-reservation balance, with unchanged paid credits for free quotes. Client expiry disables new confirmation while the database remains the authority, including safe retry of already-committed requests. Top up credits opens an in-place authenticated Sandbox pack dialog, preserving the editor and local Files through separate-tab PayPal checkout. Activation, payment invalidation and dialog closure refresh a visible quote without confirming automatically; in-flight quote refreshes retain a pending invalidation. The main balance/top-up/history destination is `/dashboard/settings/credits`; legacy `/dashboard/credits` remains a query-preserving redirect. Demo packs and process-local acceptance rates do not establish production economics. Shared tokens support both themes.

Development and hackathon payment testing uses **PayPal Sandbox only**. The implemented payment boundary rejects Live and has completed real Merchant Sandbox acceptance; see [payments.md](payments.md). Any future Live rollout requires a separately authorized configuration/security unit. This commercial-model documentation update changes no payment or pricing code.

## Unresolved commercial values

- Production credit-pack prices and any larger-pack value/discount schedule.
- Exact production credits per generation/type/duration/model/resolution/feature.
- Model multipliers, provider-cost markup and conversion policy.
- Production Marketplace listing-price bounds and detailed payout/dispute/liability operations. Fee/share 10%/90%, USD minimum withdrawal $5 and seven-day request-based hold are approved above; implementation remains separate.

## Marketplace price display and unresolved economics (approved product model, 2026-10-13)

The creator's listing adoption price and Sceenyk's estimated generation credits are separate amounts and separate decisions. A free listing costs nothing to adopt, but using its template for AI generation still follows the ordinary two-lifetime-free/then-paid-credit quote contract. A paid listing may later add a creator adoption charge **plus** generation credits. Discovery/detail must label both costs; an estimate is not a server-issued generation quote and cannot authorize a job. Paid Sandbox purchase entitlements exist separately. Production listing-price bounds still need approval; USD and the10%/90% production fee/share are approved above. Withdrawal/payout implementation is a separate future unit.

Production Marketplace listing-price bounds remain unresolved. Fee/share 10%/90%, USD earnings/withdrawals, minimum withdrawal $5, immediate reservation and a seven-day hold from withdrawal request are approved above. The server must enforce them in the future implementation; no money/AI-credit conversion is introduced. Production generation tariffs and credit-pack prices remain independently unresolved. The first Marketplace unit covers free/template adoption and does not change the existing pricing service or credit accounting.

Remaining commercial work: measure full-pipeline costs and approve production pack prices and retail generation credit rules. Sandbox one-time purchases are already Complete within their recorded acceptance; monthly subscriptions are not a prerequisite or next commercial unit. Membership and auto-recharge remain optional future decisions. No new implementation begins here.
