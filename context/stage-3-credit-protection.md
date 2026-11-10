# Stage 3 — Credit Management and Spending Protection

Source implementation, 2026-11-10. Migration 106 after 105, then correction 107, are manual; provider/UI acceptance remains pending. No paid generation request is part of development verification.

## Studio disabled-action investigation (2026-11-10)

A bounded read-only inspection found one account matching the reported 147 available credits, with zero credit holds. Its free account has total 2, reserved 0, consumed 1 and `review_required=true`. Both lifetime Character preparation records remain, but their disposable tasks have been deleted; Product/Location/Storyboard have no recorded starts. Migration 104 deliberately marks missing preparation-task history for review, and migration 103 deliberately retains these usage tombstones. This is not evidence that either preparation should be refunded or that the review flag should be cleared.

The only active project is Basic, five seconds/480p, with one uploaded Character and one uploaded Product. Its free-project record is consumed and `historical_review=true`. No active tasks, video runs, generated artifacts or creative locks were found. The configured paid user/global caps are $3.09/$30.90, with no user override and zero paid reservation exposure. Thus neither insufficient credits, Pro-only cast/duration permissions, approved-input locking nor paid cap exhaustion explains these reported disabled sheet buttons.

| Check | Source and condition | Result for the inspected account/project |
| --- | --- | --- |
| Billing label | `getFreeAllowance` maps `generation_project_access.historyReview`; `FreeAllowanceSummary` shows Under review | Correctly reports unresolved free usage independently of the 147-credit balance |
| Project eligibility | 106 `free_ai_reserve` and `ownedV3Action` rejected combined free-account/project review before considering paid funding | Current historical project must remain held; account-only review wrongly blocked fresh paid projects too |
| Character | `preparationBlocked(character)` plus project, source, pending-task, mode and creative-lock gates | Both Character starts are spent, including deleted tasks; project review also blocks new requests |
| Product | Same gates using Product's independent attempt counter | Two starts remain, but this historical project's review hold blocks new work |
| Basic/Pro | `proCharactersBlocked` and server `V3_PRO_CHARACTERS_RETAINED` require Pro for retained multiple-character inputs; Pro durations have a separate server guard | Basic with one Character and five seconds is compatible; no subscription permission is inferred or changed |
| Approved-input lock | `creativeLock` disables creative actions; SQL/action guards preserve first-approved-clip inputs | No lock exists here; existing locks elsewhere are unchanged |
| Paid video | Exact price, sufficient available credits, user/global exposure caps, finite authorization, compatible settings, current package and provider gates | 147 covers the 103-credit tariff; legitimate project/input/attempt guards still apply |

Confirmed defects: account-level **free** review was an unconditional cross-funding veto, and `free_ai_reserve` required a Higgsfield balance/cap before admitting fresh, platform-funded OpenAI preparation. The UI gave sheet buttons no adjacent explanation, hiding the separate Character-attempt restriction.

Correction **107** replaces the shared funding resolver/access DTO and adds one private project-review predicate. It preserves every review flag, counter, history row, approved project and financial/creative guard. Existing free projects needing review stay held. Unmapped past generated/approved evidence also requires review instead of silently enrolling an existing project as paid; no historical record is rewritten. Fresh projects under account-only free review (or exhausted free allowances) use the paid-video registry without claiming a free allowance; that registry is not spending authority. Platform-funded preparation remains independently attempt-limited and can start without video credits or Higgsfield capacity. Video admission and dispatch still require the existing 106 price, wallet reservation, caps, lease and once-only settlement. API/Studio now distinguish `historyReview` (free allowance) from `projectReviewRequired`/`projectBlocker`, plus `preparationAllowed` and video permission. Source buttons and workflow actions explain their specific project, quota, mode, source, unsaved, busy, recovery or creative-lock blockers.

Apply `supabase/migrations/20261110010700_generation_access_funding_separation.sql` **after verified 106**, with old writers/workers stopped, then deploy matching app/worker code. It is transactional/rerunnable, verifies referenced columns and changes no data or caps. The focused 106/107 SQL reproduction and access-reason checks pass, including unchanged historical records/counters, attempt tombstones, paid holds/debits, zero-wallet/cap OpenAI access and protected unmapped approved history. TypeScript and focused lint pass; no browser/build or provider request ran. The live inspection above did not apply this migration or change any account/project. After installation, the reported historical project remains held and Character remains exhausted; a fresh eligible project's Product preparation can proceed, and any authorized paid video still needs all existing inputs/approvals and 103 available credits. A new project does not reset Character attempts. Manual UI/workflow testing remains with the owner.

## Funding and pricing

Existing free projects retain two lifetime project allowances, one $1.03 Higgsfield exposure per free project, $2.06 per account, historical review holds and immutable first-dispatch consumption. New compatible projects after exhaustion or account-only free review use purchased credits for video. They do not change any free counters. An already funded free project remains on its original budget; spending its video slot does not silently start a paid replacement.

Paid reference-to-video costs **103 Sceenyk credits = $1.03** for five seconds at 480p. `verifyPaidVideoPrice` calls the authenticated Higgsfield `/estimate/{model}` endpoint with the exact server-created provider body, before admission and again before dispatch. Integer micro-USD conversion rounds upward, then validates the 103-credit band and owner-approved provider authorization ceiling. A price outside that band, missing credentials, unknown response or stale evidence blocks submission; package display estimates never authorize wallet debits. Other models/resolutions/durations remain blocked until their own verified pricing and reviewed tariff exist. Existing frozen package rates/hashes/approvals are not rewritten.

Provider billing semantics were checked against [Higgsfield billing documentation](https://docs.higgsfield.ai/docs/concepts/billing-and-retention) on 2026-11-10: authenticated estimates are authoritative; successful generations are charged; failed/nsfw and successfully canceled queued requests are refunded. Provider acceptance alone does not establish a completed billable generation. No actual authenticated account estimate or media request was made during implementation.

OpenAI remains platform-funded, independently of purchased balances and paid Higgsfield caps. Existing two lifetime preparation attempts per Character/Product/Location/Storyboard kind, finite Location phases, input/model/token and correction limits remain. Purchased credits never replenish those attempts. An exhausted preparation allowance can therefore still block a paid project's new preparation. Approved references, saved results and local recovery retain their existing rules.

## Accounting and recovery

`generation_paid_projects` records paid funding without changing historical free records. `generation_paid_quotes` holds server-verified, five-minute exact-body price evidence. `generation_paid_reservations` pins a run's 103-credit hold and $1.03 provider exposure. Paid OpenAI dispatch fences use `generation_paid_preparations`; the existing lifetime preparation tombstones remain authoritative.

Admission atomically locks the global cap and wallet, checks user/global exposure, moves 103 from `generation_accounts.credit_available` into `credit_reserved`, and appends a reservation to the **existing** immutable `credit_ledger`. V3 rows have a separate `v3_run_id` FK/reference namespace; existing purchase/job rows, FKs, unique constraints and PayPal fulfilment remain valid. No purchase/payment commission/provider-account funding is merged.

The leased dispatch checkpoint can transition once. Repeated tabs, the same run, changed workers and duplicate checkpoints cannot reserve, dispatch or settle it again. Existing V3 package/authorization/request uniqueness, creative lock and owner/currentness guards remain in force.

- Confirmed provider `completed`: debit the hold once, even if download, private publication or later owner approval fails. Provider completion is the billable event; owner rejection/deletion never refunds it.
- Confirmed provider `failed`, `nsfw`, or `canceled`: restore the hold once and release cap exposure, using the existing trusted status observation.
- Definite submission rejection with no accepted observation, or a terminal task proven undispatched: restore once.
- Accepted/unknown/network/lost-acknowledgement outcomes: keep the hold and cap exposure; recover the same saved receipt/status. No automatic new paid request, timeout refund or uncertain POST replay.
- Accepted work recovers even when caps are subsequently lowered. New dispatch rechecks caps and price freshness. An unused hold blocked by a lowered cap can safely release without submitting.

`stage2_*` functions are private delegates copied once at migration time; wrappers add paid admission while preserving the installed 105 free contract. Migration reruns do not overwrite these delegates or financial history. Table writes and private settlement/cap helpers are denied to browser and service roles; narrowly scoped server-only RPCs preserve the existing application boundary.

## Spending caps and setup

1. Back up the database and review the installed catalog against migrations 101–105. Stop/drain old web writers and workers before applying **`supabase/migrations/20261110010600_paid_video_credit_protection.sql`**, then **`supabase/migrations/20261110010700_generation_access_funding_separation.sql`**, each in its own transaction. Do not run old code against the new schema. These migrations check prerequisites and preserve existing balances, purchase history, free counters and approved media; rerunning them in order does not reset caps or history. If 106 is already installed, apply only 107.
2. Paid caps default to **zero**, so migration alone authorizes no paid spending. Use a database administrator to set finite lifetime user/global USD exposure ceilings. The example below enables at most $2.06 per user and $10.30 globally; choose amounts backed by the platform's real Higgsfield budget. Existing free exposure remains independently bounded by Stage 2.

```sql
begin;
select * from public.generation_paid_policy where singleton for update;
update public.generation_paid_policy
set user_cap_microusd = 2060000, global_cap_microusd = 10300000
where singleton;
commit;
```

Optional per-user override, including a zero block:

```sql
-- Replace the UUID with an existing generation_accounts.owner_user_id.
insert into public.generation_paid_user_caps(owner_user_id, cap_microusd)
values ('00000000-0000-0000-0000-000000000000', 1030000)
on conflict(owner_user_id) do update set cap_microusd=excluded.cap_microusd;
```

Caps count reserved plus consumed exposure, excluding released holds. They never reset automatically and Sandbox purchases cannot increase them. Configure changes while dispatchers are stopped or under the same policy lock. Do not modify reservation/ledger rows to reset spending.

3. Deploy matching app/worker source together. Preserve **`HACKATHON_DEMO_MODE=true`**, existing V3 owner rollout/paid transport switch, Higgsfield credentials/account scope, exact request-validity evidence and output-host approvals. No new environment variable enables generation or bypasses these gates. This implementation remains five-second/480p-only even if demo mode is disabled; future broader tariffs need separate implementation/review.
4. Existing PayPal Sandbox custom-purchase configuration remains unchanged. Keep Sandbox test purchases separate from the platform's real provider balance. Marketplace earnings, commissions, withdrawals, creator payouts and Pro subscriptions are outside this change.

## Studio and manual acceptance

Studio displays funding source, required/available/reserved credits, shortage, Buy Credits, and cap/pricing/setup errors using existing Tailwind/theme controls. Sufficient balance enables the existing Generate path. Existing active-job polling, visible paid-panel reads, focus and credit-change events refresh the balance; a top-up continues only after trusted payment fulfilment. No browser balance, price or owner input is trusted.

Essential verification: `npm run test:stage3-credits` runs disposable PGlite financial admission/settlement, ledger reconciliation, cap, pricing, role and replay checks with synthetic creative/authorization lineage. Existing `node scripts/check-custom-credit-purchases.mjs` validates Stage 1 mocked purchase/capture protections. Both pass, as do TypeScript and focused ESLint. No actual provider/payment HTTP, browser automation or build ran. PGlite does not prove native multi-connection lock contention; verify the deployed catalog and multi-tab/worker behavior during manual acceptance.

Manually inspect loading/error/balance labels and top-up return. With compatible test accounts, check free-project continuation, exhausted-new-project funding, insufficient/103-credit admission, two-tab duplicate Generate, worker restart, and price/cap denial. Verify completion creates one consumption; rejected/unaccepted and confirmed refundable outcomes create one release; unknown outcomes retain the hold and only offer existing-request recovery. Review ledger totals against wallet deltas, purchase history, old approved clips/locking and M5/M6/M7 recovery. Use offline fixtures or existing authentic requests for failure/replay checks; do not purchase extra provider work solely to test accounting. Normal visual and end-to-end testing belongs to the owner.
