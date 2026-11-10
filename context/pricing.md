# Commercial cost contract

## Stage 3 verified paid video pricing (2026-11-10)

103 Sceenyk credits cover $1.03 for a five-second/480p Higgsfield reference video. Paid execution verifies the exact authenticated account estimate before admission and dispatch; the accepted cost must convert upward to the reviewed 103 credits and fit the frozen provider authorization. Changed/unavailable pricing blocks submission. Historical approximate package rates remain display/consent evidence, never wallet authority. OpenAI remains platform-funded; purchase fees stay separate. [Full contract/setup](stage-3-credit-protection.md).

## Current free-project spending policy — 105 (2026-11-10)

The owner-approved free allowance is **two lifetime AI-powered projects**. The first supported AI dispatch consumes the project once, including platform-funded OpenAI use. Each project has a **Higgsfield-only ceiling of $1.03 = 1,030,000 micro-USD**, based on **$0.206/second × 5 seconds**. One video slot per project and two project slots bound new forward Higgsfield reservations to **$2.06/account**. A failed/unknown dispatched attempt keeps its full ceiling; recovery reuses the same request and cannot charge another POST. The video must remain 5 seconds/480p. Higher provider estimates are blocked, not funded by automatically increasing the cap or changing frozen authorizations.

OpenAI text/planning/analysis/image work is paid separately by the platform and excluded from this cap. Existing supported Character/Product/Location/Storyboard attempt limits remain enforced; this is not an unlimited OpenAI API entitlement. Zero on a new OpenAI operation record means zero reserved Higgsfield funds, not a zero OpenAI cost estimate. Its actual token prices need not be guessed to enable this separate funding policy. Old OpenAI cost metadata, project usage and approved media remain unchanged.

Paid retail math is separate: **100 generation credits/$1**, hence **103 credits/$1.03**. Estimated PayPal processing fees and Sceenyk's **1% payment commission** apply only to credit purchases and reduce purchased credits, not lifetime free-project slots, free video funding or platform OpenAI funds. Marketplace's 10% money commission remains distinct. Stage 3 credit-funded execution remains blocked.

[Migration/setup](database.md#higgsfield-only-free-project-budget--105-2026-11-10) and [manual SQL](../scripts/configure-free-ai-project-pricing.sql) set the policy and canonical video row at 1,030,000. The $0.206 rate is the approved policy basis, not a guarantee of all future provider invoices. The existing 5-second estimate ($1.028335) fits this cap; the existing $1.24 suggested consent ceiling does not enlarge free funding. Neither estimate snapshots nor the paid-credit tariff is rewritten by this policy revision.

## Stage 2 project pricing review (2026-11-10)

**Historical review before 105.** The combined $3 cap, six required ceilings and completion-budget analysis below are superseded by the current Higgsfield-only policy above. The linked manual SQL now implements 105; do not apply the old combined-funding instructions. Public pricing evidence remains dated evidence, not an automatic rate/allowance change.

**$3 is the approved policy cap, not a verified full-workflow cost guarantee.** No application implementation, provider selection, hosted configuration or database row was changed. This review uses migration 104, current source and public provider documentation; it does not establish that 104 is installed or that hosted model/account settings match this checkout.

The manual [configuration SQL](../scripts/configure-free-ai-project-pricing.sql) includes a separate read-only audit and a transaction that refuses unreviewed/missing ceilings. Unknown costs remain NULL in the review inputs; they are never inserted into the application price table.

### Required configuration

`free_ai_project_policy`: one `singleton=true` row with `max_cost_microusd=3000000`. Migration 104 already seeds this value without overwriting an existing policy. The SQL preserves a changed cap rather than silently raising/lowering it. Existing projects keep their pinned caps and exposure; no project history or allowance is reset.

The required `free_ai_operation_prices` rows below match the non-secret model identifiers in this checkout's local environment. Confirm the actual app/worker deployment before applying them. Each value must cover the **whole request**, not a per-token or per-second unit price.

| kind | phase | provider | model | Required ceiling basis |
| --- | --- | --- | --- | --- |
| character | default | openai | gpt-image-2.5-sunburst | One high-quality 1024x1024 edit, prompt + original image input + output |
| product | default | openai | gpt-image-2.5-sunburst | Same request shape, with the Product prompt/input |
| location | plan | openai | gpt-6.1-sol | Entire prompt/schema + approved input images + at most 3,000 output tokens |
| location | sheet | openai | gpt-image-2.5-sunburst | One high-quality 1024x1024 generation, prompt + output |
| storyboard | default | openai | gpt-6.1-sol | Entire prompt/schema + approved input images + at most 14,000 output tokens for the 5-second path |
| video | default | higgsfield | bytedance/seedance-2.5/reference-to-video | Exact 5-second/480p image-reference request with audio and permitted aspect ratios |

The active package builder explicitly chooses Reference-to-Video and maps approved references as images. Text-to-Video/Image-to-Video rates in the repository are not required for this workflow and must not be substituted into these rows. Basic one-character work with a Product and Location needs six paid request phases; an extra Pro character adds another Character edit. Reuse/cached recovery makes no new provider request. Source: [builder](../lib/final-video-generation-v3/runtime-server.ts), [image adapter](../lib/final-video-generation-v3/adapters/openai-reference.ts), [worker](../lib/final-video-generation-v3/worker.ts), [Location worker](../lib/final-video-generation-v3/location-worker.ts).

### Verified rates and unresolved whole-request ceilings

The [Higgsfield pricing page](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground) publishes approximately $0.2056/second for 16:9 480p without video inputs. Its token formula uses output width/height and billable duration: `ceil(width * height * seconds * 24 / 1024)`, charged at $0.0214/1,000 tokens for this no-video-input path. Image/audio references do not add video-input duration; dimensions and account terms still matter. This supports the order of magnitude of the repository estimate, not a guaranteed invoice maximum for every allowed request.

The [local estimator](../lib/final-video-generation-v3/pricing/higgsfield-pricing.ts) stores the observed November 1 Reference-to-Video rate of 205,667 micro-USD/second. Its 5-second estimate is **1,028,335 micro-USD ($1.028335)**, or 103 display credits. The existing 20% authorization buffer rounded upward to cents gives **1,240,000 micro-USD ($1.24)**. That is a derived policy-ceiling candidate; it is not an independently verified provider upper bound. Before using it, verify the exact 480p dimensions/aspect ratios, audio and account quote. A configured video ceiling must also be at least the frozen request's estimate or 104 rejects it. No frozen quote/estimator was changed.

[OpenAI's Sunburst model page](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst) lists Standard rates per million tokens: text input $5, image input $8, image output $30. Thus the whole-request USD formula is `(5*T_text + 8*T_image_in + 30*T_image_out)/1,000,000`. These verified rates do not establish the token counts for Sceenyk's high-quality edits/generation.

The [image generation guide](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency) says token consumption varies by model/settings, includes input costs, and excludes direct Images API edits from cached-input discounts. Do not copy older GPT Image per-image tables or another model's calculator/default into Sunburst ceilings. Existing image `usage`/billing evidence may support review; an average observed cost alone is not a worst-case bound. No new paid samples were requested.

[GPT-6.1 Sol documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol) lists Standard short-context input/output at $2/$10 per million tokens. The output components at the source maxima are $0.03 for Location planning and $0.14 for the five-second Storyboard. These exclude text/schema/image input. Long-context, faster processing or regional terms can change charges; this code does not pin a billing tier. Complete input-token bounds and actual account terms are still required before setting the two full-request ceilings.

### Does $3 cover completion?

For one character, one product, one Location plan/sheet, one Storyboard and one video, the admission requirement is:

`C_character + C_product + C_location_plan + C_location_sheet + C_storyboard + C_video <= 3000000`.

Using the local **estimate only**, video leaves **1,971,665 micro-USD ($1.971665)** for everything else. Using the **conditional $1.24 candidate ceiling**, it leaves **1,760,000 micro-USD ($1.76)**. The verified short-context maximum-output components for the two text calls use $0.17 of that, leaving $1.59 for their inputs and the three image requests. These are budget inequalities, not a complete price quote. OpenAI input/output consumption and the exact Higgsfield/account ceiling remain unverified, so neither sufficiency nor insufficiency for a normal successful pass can currently be certified.

104 reserves the full configured ceiling for every prepared/started operation, not the eventual invoice. One successful pass fitting the cap would not guarantee regeneration, failures, another Pro character or all permitted retries also fit. Started failures/unknown outcomes retain exposure. The cap remains $3; it must not be increased automatically to make a chosen set of ceilings fit.

### Remaining setup

1. Run only the read-only audit section manually after confirming 104 is installed; inspect existing cap/prices without initializing accounts or claiming work.
2. Confirm hosted model IDs, provider/account billing tier and exact video settings. Establish conservative complete-request token/dimension bounds from the official calculators/tokenization rules, non-billable estimation where available, or already-existing authentic account/usage evidence. Do not submit new paid generations for this review.
3. Fill all six SQL ceiling/evidence inputs, select whether one or two Character calls must fit, and explicitly confirm the evidence review. The SQL checks the total against $3, rejects conflicting existing rows, and inserts only missing reviewed prices.
4. Keep unknown/unpriced operations blocked. If a verified full pass exceeds $3, record that result and decide the policy separately; this review authorizes no cap/model/workflow change. Historical project review flags and Stage 3 paid-credit blocking remain unchanged.

## Stage 1 custom credit pricing (2026-11-09)

**Implemented in source; manual migration 101 and Sandbox/visual acceptance pending.** This owner-approved Stage 1 refines the earlier hackathon roadmap to deliver custom USD credit purchases without changing Pro or video execution. **100 Sceenyk credits = $1 of generation cost.** This supersedes earlier statements that no conversion is approved and new fixed Sandbox packs are required. Historical purchases keep their frozen values.

For payment `P` in USD cents, calculate estimated PayPal fee `round-half-up(P × paypal_bps / 10000) + fixed_cents`, then Sceenyk payment commission `round-half-up(P × commission_bps / 10000)`. Both percentage fees use the total payment independently. Generation funds are `P − PayPal fee − commission`; credits are `floor(generation_funds_cents × 100 / 100)`. Reject purchases yielding fewer than one credit. Shared integer-only preview and independent server/SQL calculation avoid floating-point rounding; the immutable purchase retains rates, total, both fees, net and credits.

Server-only settings are `SCEENYK_CREDIT_PAYPAL_FEE_BPS` (default **349**), `SCEENYK_CREDIT_PAYPAL_FIXED_FEE_CENTS` (**49**) and `SCEENYK_CREDIT_COMMISSION_BPS` (**100**). Explicit invalid/empty configuration fails closed. Defaults are an estimated US domestic PayPal Checkout rate, not measured processor settlement or a worldwide fee guarantee: [PayPal US merchant fees](https://www.paypal.com/us/business/paypal-business-fees). They can be changed for merchant-specific rates without repricing saved purchases. The payment commission is independent of Marketplace's existing 10% share.

Examples: **$1.00 → 47 credits** ($0.52 estimated PayPal fee + $0.01 commission); **$5.00 → 429 credits** ($0.66 + $0.05); **$10.00 → 906 credits** ($0.84 + $0.10). Under defaults, $0.53 buys one credit and $0.52 buys none. The existing database maximum remains **$1,000 per purchase**, a technical safeguard rather than new production economics. Users see exact credits and total before checkout; there is no additional fee added to their entered payment.

Generation displays convert the existing provider/workflow estimate using `ceil(microUSD × 100 / 1000000)` whole credits: **$2.06 → 206 credits**; a linear five-second **$1.03 → 103 credits** is illustrative. Prefer the saved provider/package/clip estimate; no provider request or fabricated flat video tariff is added. Higher actual estimates show their corresponding credits. V3's estimate/approval/worker/settlement flow remains unchanged: displaying credits and an insufficient-paid-balance top-up is not implementation of V3 wallet reservation/debit, demo enforcement, Pro access or global caps. Those remain separately scoped pending work.

## Hackathon pricing boundary (2026-11-09)

**Original hackathon planning boundary; Stage 1 above now implements custom purchases and approves the conversion.** Follow the [canonical policy](overview.md#paypal-ai-hackathon-commercial-policy-2026-11-09): two lifetime free 5-second/480p generations, purchased credits thereafter, and a separate one-month Pro pass without included credits or unlimited usage. Demo mode restricts every user to 5 seconds/480p. Earlier 10-second free limits and exclusions of Pro membership below are superseded policy retained as dated source history.

Keep provider USD estimates/actual charges, Sceenyk retail credit prices and Pro access prices distinct. V3 estimates/ceilings do not prove wallet integration. Before paid-credit admission, approve a versioned measured cost-to-credit tariff, explicitly include any charged preparation stages and show exact server-owned credits before consent. Missing/unverified rates block new spend despite a positive wallet or Pro pass. Preserve five-minute quote expiry, immutable inputs, independent provider ceilings and Sandbox pack snapshots. Pro price, normal production limits/rates and spending-cap values remain Needs confirmation. [Accounting](accounting.md#hackathon-accounting-and-spending-protection-2026-11-09) and [payment rollout](payments.md#hackathon-pro-pass-and-production-transition-2026-11-09) own the detailed plan.

## V3 Phase 3 authenticated quotes (2026-10-29)

[V3 runtime pricing](generation-v3-phase3.md#exact-transport-and-cost-lifecycle) captures a quote UUID, exact canonical request body/hash, reviewed account scope, authenticated provider USD amount/response hash, timestamp and five-minute local expiry. Freeze estimates independently from separate reviewed segment/package ceilings; sum segment prices and allocate authority without increasing the aggregate limit. Unknown/expired prices block generation. OpenAI upstream charges are separate from the displayed Higgsfield estimate; no new customer-credit tariff, provider receipt or actual charge is fabricated. No real estimate was requested during implementation.

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


Credits remain Sceenyk usage units, distinct from money, PayPal balances and provider billing units. Stage 1 above now approves 100 credits per $1 of generation cost; earlier no-conversion statements are superseded. The hackathon free rule remains two separate lifetime 5-second/480p generations, with runtime enforcement still pending.

Pay-as-you-go packs, manual top-ups and non-expiring purchased credits remain under the [current hackathon policy](overview.md#paypal-ai-hackathon-commercial-policy-2026-11-09). A separate finite Pro pass is now approved as planned work; it supplies no credits or unlimited usage. Production pack values, larger-pack discounts, tariffs and Pro price remain unresolved. Recurring billing and monthly allocations remain outside scope.

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
- Any future model multipliers or provider-cost markup; Stage 1 conversion is now fixed at 100 credits/$1 generation cost, with no extra generation markup approved here.
- Production Marketplace listing-price bounds and detailed payout/dispute/liability operations. Fee/share 10%/90%, USD minimum withdrawal $5 and seven-day request-based hold are approved above; implementation remains separate.

## Marketplace price display and unresolved economics (approved product model, 2026-10-13)

The creator's listing adoption price and Sceenyk's estimated generation credits are separate amounts and separate decisions. A free listing costs nothing to adopt, but using its template for AI generation still follows the ordinary two-lifetime-free/then-paid-credit quote contract. A paid listing may later add a creator adoption charge **plus** generation credits. Discovery/detail must label both costs; an estimate is not a server-issued generation quote and cannot authorize a job. Paid Sandbox purchase entitlements exist separately. Production listing-price bounds still need approval; USD and the10%/90% production fee/share are approved above. Withdrawal/payout implementation is a separate future unit.

Production Marketplace listing-price bounds remain unresolved. Fee/share 10%/90%, USD earnings/withdrawals, minimum withdrawal $5, immediate reservation and a seven-day hold from withdrawal request are approved above. The server must enforce them in the future implementation; no money/AI-credit conversion is introduced. Production generation tariffs and credit-pack prices remain independently unresolved. The first Marketplace unit covers free/template adoption and does not change the existing pricing service or credit accounting.

Remaining commercial work follows the [hackathon implementation stages](progress-tracker.md#paypal-ai-hackathon-credits-and-pro-plan-2026-11-09): approve measured tariffs, Pro terms and caps, then connect wallet and provider admission securely. Existing Sandbox purchase acceptance remains distinct. Recurring billing and auto-recharge are unapproved; no implementation begins here.
