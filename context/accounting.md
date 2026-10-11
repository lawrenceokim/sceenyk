# Generation accounting contract

Approved 2026-10-11. Every user receives **two lifetime free video generations, each at most ten seconds**. Free generations are entitlements, not credits. Eligibility depends only on authentication, duration and available entitlement. Current duration choices are 10/15/30, so only 10 qualifies. No model, quality or commercial-use restriction is added.

## Admission

Clerk → application user → owned project and strict immutable inputs/uploaded assets → transactional `admit_generation` → dispatch after commit. PostgreSQL repeats ownership/snapshot/asset validation, locks the accounting row, resolves project/request UUID idempotency, then inserts a queued job and its one reservation together. Failure rolls back both. Same request/snapshot returns the original job even after settlement; changed inputs conflict. Dispatch/claim guards require a live reservation for new jobs.

`generation_accounts` separates free total/reserved/consumed from available/reserved credits. An app-user INSERT trigger initializes two free generations and zero paid credits once; migration backfills existing users. Login, profile sync and deployment never reset it. Available free = total − reserved − consumed. Credit amounts are exact integer accounting units bounded to JavaScript's safe integer range, not a tariff or money conversion.

`generation_reservations` has one owner-bound row per job: free or credits, reserved → consumed or released once. Free reserves one entitlement; credits hold the exact trusted server cost. Append-only `credit_ledger` records every paid movement: reservation available→reserved, consumption reserved→spent, release reserved→available. Entries include user/job, positive amount, signed available/reserved deltas, type/direction, reason, unique reference and timestamp. Browser and service roles cannot directly write balances, reservations or ledger. Restricted database functions update everything atomically. No credit grant, purchase, adjustment, checkout or pricing API exists.

The trusted server cost resolver currently returns unavailable. Longer requests/exhausted free allowance return paid-access-unavailable without a job or dispatch. A future approved server tariff can supply a positive exact cost. Browser cost/kind/owner/balance/status/restoration claims are rejected.

## Settlement

Success requires an atomic committed **verified stored video receipt + completed job + consumed reservation**. A server-only adapter checks the authoritative claim and canonical output key, then verifies R2 HEAD/conditional ranged GET size, video MIME, signature and ETag before the claim-bound completion RPC. The immutable private receipt records this storage reference/metadata. Completion requires the owning run and rendering stage; direct completed writes without a receipt fail. No output uploader, provider, renderer or playback feature is added. The current worker never calls success settlement. Container verification does not establish semantic quality or full codec decoding: the future publisher must validate a usable rendered video and publish immutably before this boundary. No result means no successful consumption.

Every terminal failed transition atomically releases the exact reservation, including invalid worker inputs, unsupported handoff and stale-claim recovery. Duplicate failures/deliveries cannot release twice. A terminal queued dispatch failure uses the existing trusted queued→failed transition. Temporary/uncertain sends retain a recoverable job and reservation; releasing while cron may execute would permit unaccounted work. Dispatch/provider start never consumes capacity. No user cancellation/refund policy is introduced.

Historical jobs are explicitly unaccounted and never retroactively charged. The migration locks admissions and refuses application while any earlier job is queued/processing; wait for the existing failure-only handoff first. Historical terminal rows stay unchanged. New code cannot redispatch historical rows without reservations. New inserts require transactional admission. Applying migration before redeployment temporarily causes old-build new admissions to fail safely.

## Rollout and verification

Apply `supabase/migrations/20261011000600_generation_accounting.sql` after 001–005. This checkout has only a Data API credential; hosted schema application requires the development SQL Editor. Test migrations/grants, admission/retry/rollback, free/paid lifecycle, contention, ownership and recovery first, then real Clerk/hosted reserve→worker failure→restoration and refresh/reopen. Hosted acceptance remains separate until applied.

## Unresolved commercial decisions

- Subscription pricing.
- Credit-pack pricing.
- Credits required by generation type/duration.
- Provider-cost-to-credit formula.

Payments, subscriptions, providers and rendering require separate authorization.
