# Stage 2 and Stage 3 project credits

## Per-attempt video continuation — 114 (2026-11-12)

114 supersedes blanket historical/free-video holds for **new independently credit-funded video attempts**. A valid unused included video remains free; otherwise each new video reserves 103 credits and $1.03 real-provider exposure through the existing financial owners. Free flags/counters and included OpenAI rules remain unchanged. Paid reservations bind directly to the existing V3 project without converting its free assignment. Real-funded caps, currentness/consent, duplicate/unknown-outcome protection and settlement/refunds remain. Approved media is never overwritten to regenerate. Package approval is one explicit action with an automatic server ceiling and no financial-availability veto. Lower positive exact provider estimates are accepted within that ceiling; the retail charge stays 103. [114 setup, verification and limits](video-generation-reliability.md). Older 109/108 descriptions below are historical prerequisites; do not replay their backfills over 114.

## Independent sheet and Storyboard funding — 109 (2026-11-10)

Sheet/Storyboard generation checks OpenAI funding independently of video/project review. Valid assigned free projects and eligible unused allowances retain included OpenAI access. Otherwise sufficient purchased credits authorize a new OpenAI request, even on a historical project whose video/free usage is unresolved. A review hold must never veto a separately credit-funded Character, Product, Location or Storyboard request. Each actual request costs 1 credit; fresh Location remains 2 (plan + sheet), continuation 1.

The access DTO requires version 109 and exposes preparationFunding separately from video funding. SQL binds funding to each immutable task/phase, reserves credits before dispatch, and reuses 108 settlement/recovery. OpenAI preparation/reservation project FKs reference the existing V3 project directly; no paid-video enrollment is required for a held project's paid preparation. Video holds, free counters, review flags, existing records, approved content and creative locks remain unchanged. This supersedes earlier statements that all generation on an unresolved historical project must be blocked.

Apply [migration 109](../supabase/migrations/20261110010900_independent_openai_funding.sql) after 108 with old writers/workers stopped, then deploy matching app/worker code. No remote writes or provider requests were performed. Focused accounting/security checks and TypeScript pass; normal UI/provider testing remains manual.

## Stage 2 and Stage 3 project credits — 108 (2026-11-10)

Each account has two lifetime free video-project allowances in Basic and Pro. Creating/saving an empty project is free. The first fenced AI dispatch consumes one allowance permanently; deletion or later failure never restores it. A project reserved without any dispatch can release its temporary reservation. Assigned free projects keep unlimited supported OpenAI reference/Location/Storyboard regenerations at zero credits, including after both allowances are assigned or their video is used. Existing model, input/token, lease, duplicate and creative-approval protections remain.

Each free project includes one 5-second/480p Higgsfield video within its protected $1.03 exposure; unresolved/dispatched spending cannot fund a second billable attempt. New projects after allowance exhaustion use purchased credits: Character Sheet 1, Product Sheet 1, Location Sheet 1, Storyboard 1, and each other actual OpenAI request 1. Location currently performs a separate planning request plus sheet request, so a fresh Location costs 2 credits; continuing only its remaining phase costs 1. Paid Higgsfield video is 103 credits. All provider invoices remain platform-funded; Sandbox purchases do not replenish real provider budgets.

SQL reserves credits under the shared wallet lock before dispatch, binds each task/phase and lease once, and appends immutable ledger movements. Successful OpenAI responses consume once independently of parsing/storage/approval. Confirmed provider rejection or proven absence of dispatch releases once; timeouts and uncertain requests retain their hold and recover saved output without recharging or issuing another POST. No historical request is charged retroactively. The existing video price verification, finite real-funded user/global caps, 103-credit settlement, PayPal Sandbox purchases, Basic/Pro permissions, 5-second/480p enforcement, approval locks and recovery remain.

Migration 108 supersedes the old two-starts-per-kind restrictions. It preserves preparation tombstones as audit history. Evidence-based review resolutions allow known consumed projects to continue when existing operations/tasks/free-run records prove their assignment and the mapped consumed-project count fits retained counters. Original flags, counters, ledger and media remain untouched. Account-only uncertainty does not block an already assigned project. Ambiguous deleted/unmapped/conflicting history retains free/video review and grants no new allowance; 109 permits separately credit-funded OpenAI requests. No historical video cost or approval is invented. Reconciled assignment permits included OpenAI continuation; unresolved historical video spending still blocks a replacement video.

Manual installation and verification: [Stage 2/3 setup](stage-3-credit-protection.md). Source implementation is complete; remote migration, provider and visual acceptance remain manual.

## Accounting and recovery

Paid OpenAI reservations are unique by task and phase; they survive disposable-task cleanup. Each new actual request holds 1 credit atomically before the dispatch fence. Successful HTTP responses consume it once; validation/publication failures do not create a refund or replacement call. Explicit provider rejection releases it once. Terminal tasks with no dispatch safely release. A timeout, server error, missing receipt or ambiguous response retains the hold. Recovery reuses saved bytes and the existing reservation. Requests predating 108 are never retrospectively billed.

Location plan and sheet are separate requests and ledger entries. If planning succeeds and the sheet is rejected, planning remains charged and the sheet credit returns. Failed local validation does not erase a successful provider request. Existing provider model/token/input limits and one-use leased intents prevent unbounded single-request or duplicate spend; there is no lifetime OpenAI-attempt quota.

Paid video still uses exact-body authenticated provider estimates, current immutable package/authorization, 103-credit wallet holds and finite user/global real-provider exposure caps from 106. Completed provider observations charge once; definitively rejected/failed/nsfw/canceled results release once under existing rules. Unknown/accepted requests retain holds and recover without a new POST. Free video retains the conservative single-attempt spending ceiling; confirmed absence of dispatch releases preparation, but a dispatched unknown request cannot be replaced for free.

## Historical review reconciliation

104 conservatively marked identified historical projects for review and accounts with orphaned preparations or old reservations. 107 separated fresh paid projects from account-only review but still preserved all project holds and lifetime preparation quotas. 108 removes the quota gates without deleting tombstones, and appends review-resolution evidence for provable consumed assignments whose mapped project count fits retained consumed counters. Proof comes from immutable started operations, provider-started task records or recorded free-run reservations/consumption. It does not infer an invoice or increase any spending budget.

An assigned project is no longer blocked merely because its account has unresolved unrelated free history. Unmapped generated/approved evidence, more mapped consumed projects than retained consumed slots, missing evidence and conflicting paid funding remain blocked for manual investigation. No account counters, original review flags, wallet, old operation costs, approvals or media are reset. No live database audit or repair was executed in this change; runtime status must be checked after installation.

## Spending caps and setup

For the Sources correction, apply **109 after 108** using the linked migration above, then deploy matching app and worker code. Rerun 109 safely; do not rerun 108 over 109. Its free-history reconciliation must not classify new paid OpenAI requests as old free-usage evidence. Original 108 setup below is a prerequisite record.

1. Stop old app writers and workers. Back up the database and verify prerequisite migrations through 107.
2. Apply [20261110010800_project_generation_credits.sql](../supabase/migrations/20261110010800_project_generation_credits.sql) in the SQL Editor. Apply missing prior migrations in order first. Rerun 108 safely; do not rerun older policy migrations over it.
3. Keep the existing 105 Higgsfield price and finite 106 paid caps backed by real provider funds. 108 never changes cap amounts. Zero paid caps keep video paused while OpenAI requires only its credit balance and normal safety guards. Sandbox top-ups cannot raise real provider budgets.
4. Deploy matching app and worker code together and restart the normal worker. The access DTO requires policy version 108; an older database fails closed. Preserve HACKATHON_DEMO_MODE, existing ownership/Pro configuration and provider switches. This change does not enable paid transport or PayPal Live.
5. Manually inspect Studio and saved results in both themes, free-project retention, paid costs/shortage/Buy Credits, loading/disabled controls, and ordinary recovery. No extra paid generation is needed merely to validate the migration.

Read-only reconciliation audit after applying 108:

```sql
select p.project_id, p.owner_user_id, p.state, p.historical_review,
       r.evidence, r.created_at as resolved_at
from public.free_ai_projects p
left join public.free_ai_review_resolutions r using (project_id)
where p.historical_review;

select task_id, phase, project_id, state, dispatched_at, settled_at
from public.generation_openai_reservations
where state = 'reserved';
```

For an unresolved hold, collect authentic project/task/provider receipts and reconcile it manually. Never bulk-clear flags, refill allowances, reset balances or fabricate usage. Original flags intentionally remain true even after an evidence-backed resolution.

## Focused verification

Run `node scripts/check-stage3-credit-protection.mjs` for disposable offline accounting/security checks. It uses synthetic creative lineage and real SQL financial triggers, no network/provider/payment calls. It verifies unchanged purchase and creative-lock functions, original history, repeated unlimited free requests, paid OpenAI reservation/settlement/rejection/unknown handling, two Location phases, video pricing/caps/settlement, wallet-to-ledger equality, owner/role denial and 108 reruns. Types and focused lint accompany this check. Hosted multi-session concurrency, provider/visual and normal workflow acceptance remain manual.
