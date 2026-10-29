# Generation accounting contract

## Planned V3 segment accounting and fresh-run authority (2026-10-29)

[V3](generation-architecture-v3.md#private-persistence-cost-authority-and-recovery), **Planned / Not Started**, accounts for Higgsfield audiovisual video work per Generation Segment plus the actual authorized OpenAI reference/creative operations. No normal separate TTS/Kling/master-audio spend is required. Preserve finite request/spend limits, immutable intents/receipts/fingerprints, reviewed failed-segment retries/amendments, preserved successes and unknown-outcome reconciliation before repurchase. Segment approval is not final completion/settlement.

The next cycle uses a brand-new project and fresh explicit authorization/accounting; it cannot inherit the old test execution's request budget, paid intents, media or reservations. A new project does not reset account balances/free allowance or change ledger/refund/review-hold/commercial rules. Earlier V1/V2 provider-specific accounting below remains historical/source evidence. No financial code, configuration, balance, project or authorization is changed in this documentation task.

## Planned V2 segment and stage accounting (2026-10-29)

[V2 cost/recovery rules](final-video-generation-v2.md#costs-request-authorization-and-immutable-identity), **Planned / Not Started**, account for continuous video by Generation Segment rather than Storyboard scene. Normal Seedance native-sync has no separately billed Kling stage. Voice work still has its actual independent design/binding/speech/observation request authority; one video segment is not one total provider operation. Keep provider credits, immediate USD and Sceenyk customer credits distinct.

Preserve finite authorization, estimator provenance, immutable paid intents/receipts/fingerprints, reviewed stage/segment retries and amendments, and unknown-outcome reconciliation before repurchase. Local master/composition recovery reuses paid assets. Successful stage/segment readiness never settles the whole run; exact current final manifest validation and explicit approval remain prerequisites for trusted Complete. Partial failure cannot silently reset, refund or repurchase the run. Existing ledger/free-allowance/review-hold/commercial gates remain unchanged and unresolved mapping stays closed. Dated scene/Kling accounting notes below are V1 history; no financial code/schema/balance or existing execution changes here.

## M10 implemented source boundary (2026-10-27)

**M9: Complete. M10: Complete in source for the configured local V1 profile. Runtime/provider/manual acceptance: Pending.** M10 supports explicit finite operator-funded local development only. There is no enabled customer-credit/free-reservation M10 mode: the unresolved commercial quote/review-hold mapping stays fail-closed. No legacy ledger, entitlement, free allowance, customer debit/refund or settlement code is changed. The operator authorization is frozen with the run, and Generate Final Video confirms that exact scope; package approval alone is not spend consent.

[Actual source, verified API limits, required setup, checks and manual acceptance](final-video-generation.md#implemented-local-v1-source-and-profile). This current source entry supersedes implementation-status and task-permission statements in the older dated planning/history below. Unsupported capabilities fail closed; no real providers, worker processes, remote migrations, deployment or credit spending ran during implementation.


## Planned M10 financial handoff (2026-10-27)

[M10 cost controls](final-video-generation.md#paid-request-and-accounting-gates) apply before every video, ElevenLabs design/create/synthesis, lip-sync and chargeable recovery request: exact approved package/scene/profile/inputs, distinct request fingerprint/paid intent, known-outcome reuse, finite per-stage/execution attempts/spend and existing matched cost/credit/free-reservation authority. The user authorizes the bounded run through Generate Final Video, not routine per-scene provider actions. Unknown paid outcomes never auto-resubmit.

Automatic stage readiness/scene validation and final composition do not complete or settle a run. Only final-level approval of a current privately verified final artifact/manifest, with every required dialogue/synchronization/stream, can reach trusted Complete through existing receipt/ledger/settlement owners. No per-scene owner acceptance is required. Partial voice/sync/scene/storage failure preserves paid outputs and cannot auto-consume/release/refund the entire reservation or regenerate video.

Keep existing exactly-once ledger/reservation rules and immutable receipts; final rejection never requests another provider operation. Review-hold/expiry/abandonment/cancellation/refund and retail policy need existing/future explicit commercial authority. This documentation changes no financial code/schema/balance/payment/Marketplace behavior and runs no financial test or operation.

## M9 preparation has no financial admission (2026-10-27)

M9 is Complete and approved per the owner. Its [package workflow](video-generation-package.md#workflow-and-failure-states) remains metadata-only and pauses without changing the parent UGC job or reserving/consuming/restoring credits/free allowance. Prepare/rebuild/retry/recovery/approval/rejection cannot invoke a paid provider or settle the run. Future M10 admission/financial mapping is a separate planned boundary; this documentation changes no existing financial rule or source.

## Approved Settings accounting presentation (2026-10-16)

**Documentation only; relocation Not Started.** Settings → Credits & Billing becomes the main private view of authoritative paid AI-credit balance, reserved credits where useful, remaining two-generation lifetime free allowance and existing safe credit activity/purchase history. Remove persistent/general paid-credit balances from normal dashboard/header/navbar/landing chrome. Retain contextual quote cost, required/available credits, insufficient-credit warnings, top-up and payment-completion information. Moving the main view changes no server admission, reservation/consumption/restoration, purchase grant, credit expiry or ledger rule.

Settings → Earnings & Payouts reuses the separate creator money account: Available Earnings, Pending Payout, Lifetime Earnings, useful reversals/adjustments, private destination, withdrawal and history. Preserve 10%/90%, USD cents, minimum $5, immediate atomic reservation, seven days from request, lot/FIFO reversals, valid-fund release, deficits and provider-verified Paid. AI credits are not withdrawable creator money. Mandatory financial/security notices cannot be disabled by future notification preferences.

Future Data & Account deletion/export must consider project/listing ownership, earning records and pending payouts before defining a safe policy. Do not delete immutable financial evidence or bypass reservations through Clerk/account deletion. No deletion, export, financial-policy change or new schema is implemented by this contract. See [Settings scope](overview.md#approved-settings-experience-2026-10-16).

## Internal payout-support audit extension (2026-10-15; deployed scoped acceptance verified)

New migration026 adds append-only support/check evidence in `payout_support_events`, separate from immutable creator money events. Verified support attempts precede provider reads; their outcome and any allowed existing `creator_payout_observe` transition commit in the same transaction. Failed audit persistence must roll back the financial transition. Concurrent support/worker/webhook observations retain the existing creator/withdrawal locks and unique terminal money-event guards. Additional audit attempts never create additional money effects. Trusted role revocation denies subsequent support reads/commits; in-flight denied checks may append only an authorization-denied outcome.

No financial-policy, balance, reservation, lot/FIFO, proportional reversal, deficit, threshold, hold, AI-credit or historical ledger rule changes. Migration026 is applied and its14 hosted permission/read checks pass.34 deployed support checks preserve all protected financial hashes. Native PostgreSQL122 assertions across four independent clients verify three observed lock-wait races, once-only Paid/restoration, audit rollback and conservation. Hosted submitted-payout financial contention remains unobserved; no hold is shortened or money manufactured to test it.

## Approved support accounting boundary (2026-10-15)

**Implemented and deployed with migration026; scoped acceptance passes.** Support may request a trusted status check of the same existing payout, never create a payout or manually establish a financial outcome. Provider GET evidence must match the frozen instruction and use existing transactional reconciliation rules. Automatic Inngest processing remains primary; manual checks use the same observation/terminal guards with no submission path. See [provider outcomes](payments.md#support-provider-outcomes) and the [access/audit prerequisite](architecture.md#approved-payout-support-and-reconciliation-contract-2026-10-15).

Verified processing→Paid finalizes its reservation exactly once without a second Available debit. A definitive pre-Paid failure returns only valid remaining allocated money once; refunded/reversed amounts remain reversed. Paid→RETURNED/REFUNDED retains Paid history and review evidence, without automatic recredit or resend. Missing/unknown/contradictory provider evidence preserves financial state for investigation. Repeated or concurrent support/worker/webhook checks cannot pay twice, debit twice, duplicate financial records or release twice. Additional audit attempts are permitted and remain distinct from money events.

Support cannot manually mark Paid or Failed, credit creator earnings, release reserved funds, edit withdrawal/submitted amounts, alter frozen destinations or provider IDs, reset a submission, resend, shorten the168-hour hold, cancel a payout or administer refunds. Audit history and original financial records are append-only; a support note is never a financial adjustment. Neither operator authority nor elapsed time substitutes for matched provider truth. A finance override or returned-payout compensation policy requires separate future approval and is outside this first version.

Preserve10% platform fee/90% creator share, minimum$5, immediate atomic Available→Pending Payout reservation, seven days from the original request, explicit lot/FIFO proportional reversal accounting, below-minimum valid release and zero-value closure, paid-out reversal deficits offset before future availability, and withdrawal blocking while debt remains. AI credits, credit purchases and lifetime free allowances stay separate. Sceenyk retains responsibility for its proportionally reversed platform fee; support cannot debit PayPal or pass unrelated processor/dispute fees to creators. Sandbox only; final rendering remains deferred.

## Approved production Marketplace earnings and withdrawal policy (2026-10-14)

**Approved product contract; migration024/services/UI deployed with scoped Sandbox acceptance.** This section supersedes older Marketplace fee/share/threshold placeholders and any model that starts a seven-day hold at sale time. Approved2026-10-15 refund rules below complete the reservation/deficit contract. Hosted reservation/refund/two-user checks and a real $5 payout pass; expired-time, paid reversal/future earnings and failure/ambiguity cases use explicitly isolated fixtures. See architecture.md/progress-tracker.md for evidence limits; historical Sandbox evidence remains preserved.

### Sale proceeds and availability

For each paid Marketplace adoption, **Sceenyk keeps 10% and the creator earns 90%**, calculated by the trusted server from the authoritative USD gross price. Use integer cents and the existing sale-fee convention: fee = floor(gross cents × 1000 / 10000), creator net = gross − fee. The creator receives the exact cent remainder; no new sale-rounding convention or additional provider-fee deduction is approved. A $10.00 sale records $1.00 platform fee and $9.00 creator net. Freeze original gross, fee, net and policy/version; browser-calculated amounts or shares are never authority.

Under the approved production rule, a successful verified sale credits its valid creator net to **Available Earnings**, unless an existing refund/reversal state blocks that amount. There is no automatic seven-day sale hold. Availability remains subject to authoritative payment verification and proportional adjustments. Existing Sandbox pending-sale/test-eligibility events are distinct from withdrawal reservations and must not be relabeled or rewritten as pending payouts.

Creator earnings are USD money from paid adoptions. AI credits are nonwithdrawable generation usage units. Sale proceeds, reversals, reservations and payouts never automatically mint, consume or refund AI credits or lifetime free generations.

### Withdrawal reservation and seven-day hold

The minimum withdrawal is **$5.00 USD (500 cents)**. Withdraw is unavailable below $5 of unreserved available earnings; the trusted server independently validates authentication/ownership, available balance ≥ $5, and an exact USD request amount **$5 ≤ requested amount ≤ available earnings**.

An accepted request must atomically reserve that amount once, remove it from Available Earnings, add it to **Pending Payout**, and record the trusted withdrawal-request timestamp. The **seven-day hold starts at that request timestamp**, not at the sale timestamp. No PayPal payout may be sent during the hold. Retries, concurrent requests, refresh/reopen and worker restarts must preserve one durable reservation; the same money cannot fund another withdrawal.

Example: Available $20, request $15 → Available $5 and Pending Payout $15. The reservation changes spendable availability, not lifetime earned money or the sale's platform fee. Pending Payout includes reserved money awaiting eligibility or provider completion; eligibility alone never returns it to available funds.

After seven days, revalidate the reserved amount and blocking refund/dispute/reversal conditions. Only a clear request becomes eligible for the trusted server-side PayPal Sandbox payout flow. Elapsed time is not payment completion. The browser cannot mark a payout eligible, processing or paid by asserting a status, timestamp or provider success.

### Payout lifecycle

| State | Meaning |
| --- | --- |
| `requested` | Withdrawal accepted with its amount reserved and request timestamp recorded. |
| `pending` | Reserved money is in the seven-day hold or awaiting resolution of blocking conditions. |
| `eligible` | Seven days have elapsed and required blocking-condition checks pass; money stays reserved. |
| `processing` | Trusted server-side provider processing is underway; money stays reserved. |
| `paid` | Trusted PayPal verification confirms the payout and its immutable accounting effect. |
| `failed` | A verified failure is recorded; reservation/recovery handling must follow the separately specified failure policy. |

`requested` is an immutable event within the reservation transaction; stored withdrawal states begin at `pending`. Below-minimum or zero reversals close as `failed`, retaining their reason/history. Unknown provider outcomes never establish Paid or authorize another reservation/send. Migration024 and the trusted service implement these transitions; only verified matched item SUCCESS finalizes Paid.

### Refunds, reversals and reserved money

Preserve cumulative proportional accounting against each sale's **original frozen** gross G, platform fee F and creator net G−F. For verified cumulative refunded gross R, bounded to [0,G], cumulative fee reversal = round-half-up(F×R/G); cumulative creator reversal = R minus that rounded fee. Append only the increase over already reversed gross/fee/net. Multiple partial refunds, duplicate events and out-of-order observations cannot over-reverse or subtract twice. At R=G, fee reversal is exactly F and creator reversal exactly G−F. Historical Sandbox sales keep their original fee snapshots; the new 10% policy never retroactively reprices them.

If a reversal affects money reserved for a pending payout, append a traceable adjustment linked to the affected sale/reservation, reconcile Available Earnings and Pending Payout, and prevent an unsafe payout. Keep original sale, reservation, settlement and payout history immutable/auditable; never hide an adjustment by deleting records or showing reserved money as available. Lifetime earnings and reversed totals must remain explainable independently of reservation movements. Already-adopted projects remain preserved under the existing reversal contract; access revocation is separate policy work.

**Approved withdrawal/refund rules (2026-10-15):** explicit earning-lot allocations bind withdrawals to their original sales. A reversal adjusts reservations backed by that sale, oldest request first when a lot was split. Never spread it across unrelated withdrawals. Before irreversible provider submission, reduce the reservation by the exact reversed creator net. At least 500 cents remaining keeps it pending with its original request timestamp and seven-day hold; recheck eligibility before dispatch. Below 500 cents, fail/cancel it and release only its remaining valid reservation once; at zero, close it with no release. Append immutable adjustment/release history, retaining original request and allocation amounts.

After successful payout, the reversed creator share creates immutable creator debt. Future valid Marketplace earnings offset debt before becoming available; outstanding negative creator earnings block new withdrawals. Sceenyk bears its own proportional fee reversal. No AI credit change, automatic PayPal debit, or unrelated processor/dispute fee is permitted. Ambiguous/processing submissions retain the frozen instruction and reconcile first; create debt if successful, or release only valid remaining money once on definitive failure. Unknown outcomes never authorize another payout. Recipient is a private PayPal email snapshotted at request time. These approved rules supersede the prior unresolved allocation/release/liability questions.

### Hard accounting invariants

1. The production Marketplace platform fee is 10%.
2. The creator share is 90%, using authoritative server-side cent accounting.
3. Creator earnings never become AI credits automatically; AI credits are not withdrawable money.
4. The minimum withdrawal is $5 USD, enforced against both balance and request amount.
5. The seven-day hold starts at the accepted withdrawal-request timestamp, not the sale.
6. Reserved withdrawal money is removed from available funds immediately and cannot be withdrawn twice.
7. Refund/reversal accounting remains proportional and cumulative, with exact original-cent full reversal and no duplicate effect.
8. Financial history remains immutable and auditable, including reservation adjustments.
9. The browser cannot mark payouts paid or supply authoritative financial state.
10. Actual payout occurs only through a separately implemented, trusted server-side PayPal payout flow.

**Implementation boundary (2026-10-15):** deployed migration024 implements the versioned transition, preserving historical intents and ledger rows while new intents enforce10% and immediate verified-net availability. Private earning lots and explicit allocations reserve valid money; immutable money events explain availability, request/pending, reservations, reversal/release, eligibility/processing, paid, deficit and offset effects. Each lot must reconcile original−reversed = available+offset+valid allocated amount before reservation/eligibility. A below-minimum failed request returns only valid remaining money once. Processing keeps its frozen submission amount; intervening reversal debt is recorded only on successful completion, never prematurely on an unknown response. Paid completion finalizes the reservation without a second available debit. All amounts are USD cents and never alter AI credits. Real hosted $10 capture/10% fee/$9 net, concurrent $7 reservation, $1/$2 refunds and one $4.30 release pass. A real $5 Sandbox payout and trusted provider-completion handler pass using isolated sale/time fixtures; no hosted seven-day hold was changed. Synthetic paid reversal creates500-cent debt; future270/450-cent earnings offset it before220 cents becomes available, with no new provider instruction. Full evidence/limits are in the tracker. Final rendering remains deferred.

## Marketplace settlement and cumulative proportional reversals (2026-10-14)

**Implemented Sandbox model:** the test sale-hold description below is not the approved production withdrawal hold. Use the production contract above for future withdrawals.

Creator money is USD integer cents and remains separate from AI credits. The original immutable pending sale freezes gross G, platform fee F and creator net G-F. One immutable availability event records the unrefunded amounts that became available after the frozen test eligibility time and trusted provider verification. Full invalidation appends one reversed lifecycle marker; partial refunds leave the remaining earning pending or available. Financial adjustments remain independent immutable records with purchase/capture binding, reason, reference, source lifecycle, cumulative refunded gross and gross/fee/net deltas. Original purchase, sale, availability event, entitlement and buyer-owned project are preserved.

Approved partial-refund rule: for verified cumulative refunded gross R in [0,G], cumulative reversed fee is round-half-up(F*R/G); cumulative reversed creator net is R minus that fee. Each entry is the increase over previously recorded cumulative gross/fee/net. Fee and creator components each stay within half a cent of their exact proportional share, while every refunded cent is accounted for. Repeated/lower observations add no financial effect. At R=G the fee reversal is exactly F and creator reversal exactly G-F. No rounding is applied independently to each partial refund. No component can exceed its original or become negative. A full reversed marker is history only; it is not subtracted again.

Pending balance = sum(original net minus cumulative reversed net) for unsettled, nonterminal sales. Available balance uses the same remaining-net calculation for settled sales. Lifetime gross retains original gross sales; lifetime net is original net less reversals. Reversed gross, fees and creator net are reported separately. Availability history records the original amount moved at that time, even if a later refund reduces the current balance. Historical manually appended reversed markers without adjustment rows project as full reversals for compatibility; trusted operational paths always write the adjustment and terminal marker atomically.

The historical settlement-only implementation had no outbound money. The approved 2026-10-15 extension above defines explicit lot-backed reservation and paid-out deficit accounting; implementation/acceptance is tracked separately. Provider fees are not deducted from creator net. Refund eligibility and adoption-access revocation remain separate policy.


## Separate Marketplace money ledger — authorized 2026-10-14

Paid Marketplace adoption records USD gross sale, platform fee and creator net as exact integer cents in dedicated purchases and creator_earnings_ledger. The centrally configured Sandbox demo fee defaults to 0 basis points; fee cents are floor(gross cents × demo basis points / 10000), net = gross − fee. These are preserved demo snapshots, separate from the approved production 10%/90% policy above and from provider-fee reimbursement. PayPal processing fees are not silently deducted from creator net.

One verified completed final capture creates exactly one immutable pending sale entry and one durable adoption entitlement atomically with purchase completion. A separate retryable redemption creates/reuses one buyer-owned project. Failed project creation cannot reverse the payment record or charge again. Buyer/listing, purchase, provider order/capture and entitlement/project uniqueness guard duplicate effects. No Marketplace operation writes generation_accounts, credit_ledger, generation_reservations or lifetime free counters. Creator earnings are money; Sceenyk AI credits remain nonwithdrawable usage units.

The original021-only unit recorded pending earnings without settlement operations. Subsequent023 implements the Sandbox availability and cumulative-refund model above, retaining the original pending sale permanently. Effective state prefers reversed, then available, then pending; balances project original net less cumulative reversals without double subtraction. This Sandbox lifecycle is not a withdrawal reservation or the approved production request-based hold. The production 10%/90% share, $5 minimum and seven-day withdrawal-request hold are now approved above. Withdrawal implementation and detailed dispute/release/liability rules remain future work.


## Marketplace boundary (approved product model, 2026-10-13)

Marketplace adoption is distinct from generation. Free adoption creates an adopter-owned project without a Marketplace charge; subsequent AI work uses the existing two lifetime free generations or server-quoted credits. Paid adoption, when separately authorized, requires verified purchase and durable entitlement before project creation. Neither path transfers the creator's original project or private media. Adoption does not rewrite the creator's generation history, free allowance, credits, or immutable ledger.

Creator earnings represent money from paid Marketplace sales, separate from nonwithdrawable Sceenyk AI credits. Dedicated original-sale, availability and proportional-adjustment history extends through migration024's explicit withdrawal allocations and immutable payout/deficit/offset events. The implemented flow is valid verified sale → available90% net → withdrawal request of at least$5 → reserved Pending Payout →168-hour hold from request → eligible after trusted recheck → trusted Sandbox payout → Paid only after matched provider success. Historical pending-sale events retain their original policy and are not pending payouts. Adoption, sale/refund/withdrawal and PayPal credit-pack accounting stay separate; see the acceptance evidence/limits above.

**Commercial model approved 2026-10-13:** credits support user-initiated pay-as-you-go pack purchases and repeat top-ups, not monthly allowances or a month of access. Purchased credits do not expire unless a future explicit product decision changes this. The two lifetime free generations remain separate and never reset on purchase. Generation cost is shown before confirmation and is server-authoritative; existing reservation, verified-result consumption and failure restoration remain unchanged. Quote expiry is not credit expiry. Monthly subscriptions are outside current scope. Possible membership benefits and optional threshold-based auto-recharge require separate future approval. See [overview.md](overview.md#approved-commercial-model--pay-as-you-go-2026-10-13).

**PayPal Sandbox extension (2026-10-13):** [payments.md](payments.md) specifies temporary server-owned packs, verified capture and applied migration017. The existing append-only ledger supports `purchase` entries with purchase/order/capture IDs and unique provider references. Actual USD1.00 Sandbox buyer approval/capture increases only `credit_available`0→100 once, with exactly one ledger row, browser-independent recovery and duplicate/replay/persistence checks. Free counters remain2/0/0 and paid reserved0; existing reservations/history stay unchanged. Hosted direct-write probes are denied. Merchant acceptance is Complete within documented limits; funded pending/denied states are fixture-tested. This supersedes historical statements below that no purchase/grant service exists.

**Gemini planning extension (2026-10-11):** analysis is part of the already-admitted job, with no second debit. A valid persisted production plan pauses at processing/planning and retains its original reservation for future production; it is not a usable final video and cannot consume allowance/credits. Terminal analysis failures, invalid output, unsupported media and unfinished stale claims restore through the existing exactly-once trigger. Ready plans are excluded from stale AI expiry. No user cancellation/refund policy is invented. Migration 008 and hosted acceptance status are tracked separately.

**Commercial quote extension (2026-10-11):** [pricing.md](pricing.md) adds owner/input-bound cost review and confirmation before the unchanged reservation/execute/consume-or-restore model. New migration 007 restricts direct admission and adds immutable quote/version provenance; existing 006 jobs/history and settlement are preserved. Paid production rates remain unresolved and default unavailable.

Approved 2026-10-11. Every user receives **two lifetime free video generations, each at most ten seconds**. Free generations are entitlements, not credits. Eligibility depends only on authentication, duration and available entitlement. Current duration choices are 10/15/30, so only 10 qualifies. No model, quality or commercial-use restriction is added.

## Admission

Clerk → application user → owned project and strict immutable inputs/uploaded assets → transactional `admit_generation` → dispatch after commit. PostgreSQL repeats ownership/snapshot/asset validation, locks the accounting row, resolves project/request UUID idempotency, then inserts a queued job and its one reservation together. Failure rolls back both. Same request/snapshot returns the original job even after settlement; changed inputs conflict. Dispatch/claim guards require a live reservation for new jobs.

`generation_accounts` separates free total/reserved/consumed from available/reserved credits. An app-user INSERT trigger initializes two free generations and zero paid credits once; migration backfills existing users. Login, profile sync and deployment never reset it. Available free = total − reserved − consumed. Credit amounts are exact integer accounting units bounded to JavaScript's safe integer range, not a tariff or money conversion.

`generation_reservations` has one owner-bound row per job: free or credits, reserved → consumed or released once. Free reserves one entitlement; credits hold the exact trusted server cost. Append-only `credit_ledger` records paid generation movements and verified purchases: reservation available→reserved, consumption reserved→spent, release reserved→available and purchase→available. Generation entries retain user/job linkage; purchase entries retain user/purchase/PayPal order/capture linkage. Each records the amount, signed deltas, type, reason, unique idempotency reference and timestamp. Browser and service roles cannot directly write balances, reservations or ledger; restricted database functions update everything atomically. There is no monthly allocation, reset, credit-expiry process or arbitrary balance-adjustment API.

The trusted server cost resolver currently returns unavailable. Longer requests/exhausted free allowance return paid-access-unavailable without a job or dispatch. A future approved server tariff can supply a positive exact cost. Browser cost/kind/owner/balance/status/restoration claims are rejected.

## Settlement

Success requires an atomic committed **verified stored video receipt + completed job + consumed reservation**. A server-only adapter checks the authoritative claim and canonical output key, then verifies R2 HEAD/conditional ranged GET size, video MIME, signature and ETag before the claim-bound completion RPC. The immutable private receipt records this storage reference/metadata. Completion requires the owning run and rendering stage; direct completed writes without a receipt fail. No output uploader, provider, renderer or playback feature is added. The current worker never calls success settlement. Container verification does not establish semantic quality or full codec decoding: the future publisher must validate a usable rendered video and publish immutably before this boundary. No result means no successful consumption.

Every terminal failed transition atomically releases the exact reservation, including invalid worker inputs, unsupported handoff and stale-claim recovery. Duplicate failures/deliveries cannot release twice. A terminal queued dispatch failure uses the existing trusted queued→failed transition. Temporary/uncertain sends retain a recoverable job and reservation; releasing while cron may execute would permit unaccounted work. Dispatch/provider start never consumes capacity. No user cancellation/refund policy is introduced.

Historical jobs are explicitly unaccounted and never retroactively charged. The migration locks admissions and refuses application while any earlier job is queued/processing; wait for the existing failure-only handoff first. Historical terminal rows stay unchanged. New code cannot redispatch historical rows without reservations. New inserts require transactional admission. Applying migration before redeployment temporarily causes old-build new admissions to fail safely.

## Rollout and verification

The user applied `supabase/migrations/20261011000600_generation_accounting.sql` after 001–005 through the development SQL Editor, then committed the matching code in `59d598d` for Vercel Production deployment. Existing credentials remain unchanged; deployed `INNGEST_DEV` remains absent. Hosted backfill, new-user initialization, independent simultaneous admission requests and real Clerk → deployed action → Supabase reservation → signed Inngest Cloud claim → safe failure → exact restoration are verified. Chrome was fully closed before the handoff and remained closed through restoration. Repeated admission/failure calls retain one job/reservation/outcome. See [progress-tracker.md](progress-tracker.md) for identifiers and final acceptance evidence.

The isolated suites pass 115 accounting, 96 generation and 55 dispatch checks, including successful free/paid consumption using explicit stored-result fixtures, storage/claim rejection and transactional rollback. No live generated-video success or paid purchase is claimed: the current worker produces no output, paid cost remains unavailable and real failure workflows consume nothing. Full independent hosted SQL grant/catalog auditing and usable-video production remain outside this foundation.

## Unresolved commercial decisions

- Production credit-pack pricing and any larger-pack value schedule.
- Credits required by generation type/duration.
- Provider-cost-to-credit formula.

Monthly subscriptions and recurring plans are outside current scope. Membership and auto-recharge are unapproved optional future features, not accounting prerequisites. Sandbox one-time purchase acceptance is Complete; production economics, future payment capabilities and the deferred hosted renderer require separate authorization. This product-contract update changes no accounting code or historical ledger.
