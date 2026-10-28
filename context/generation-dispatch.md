# Durable generation dispatch

## M10 implemented source boundary (2026-10-27)

**M9: Complete. M10: Complete in source for the configured local V1 profile. Runtime/provider/manual acceptance: Pending.** The existing fair local queue adds a separately gated final lane. npm run worker:ugc -- --final-video-only isolates M10 from upstream paid preparation, with 90-second leases and 20-second fenced heartbeats. No hosted dispatcher/callback/tunnel is added; Render and Inngest remain disabled. Existing package-only mode remains isolated.

[Actual source, verified API limits, required setup, checks and manual acceptance](final-video-generation.md#implemented-local-v1-source-and-profile). This current source entry supersedes implementation-status and task-permission statements in the older dated planning/history below. Unsupported capabilities fail closed; no real providers, worker processes, remote migrations, deployment or credit spending ran during implementation.


## Planned M10 delivery boundary (2026-10-27)

The [automatic M10 plan](final-video-generation.md#automatic-scene-processing-and-lipsyncprovider) runs on the existing local worker after one admitted Generate Final Video action. Persist scoped operation identifiers for independent video, voice, lip-sync and storage/composition checkpoints; workers reload exact owner/project/package/scene/profile/version/authority rather than trust client payloads. No provider management or intermediate scene/voice/alignment/stitch request is needed from the user.

Callbacks/polling normalize observations through adapters and fenced private state; they do not authorize billing/final completion. Reuse known request/results and private outputs on restart, never resubmit an uncertain paid intent. Required stage capabilities and finite stage/execution cost authority gate every new paid request. M9 package-only mode remains isolated.

No Inngest event/outbox, Render request, transport or worker is introduced/run by this documentation. Render/Inngest remain disabled, the existing local path is retained, and all implementations/runtime/provider/manual acceptance remain pending under [current scope](ai-workflow-rules.md#automated-m10-documentation-scope-2026-10-27).

## M9 dispatch boundary (2026-10-27)

M9 is Complete and approved per the owner. Existing package commands persist scoped local work and end at explicit package approval/pause, without hosted dispatch, video provider or financial admission. [Implemented M9 recovery](video-generation-package.md#persistence-idempotency-and-restart-recovery) remains unchanged. Older coordinator/setup/acceptance notes below are historical; the active scope is [M10 documentation only](ai-workflow-rules.md#milestone-10-documentation-scope-2026-10-27).

## Milestone 4 - same local UGC executor (2026-10-23)

**Milestone 4 — Complete in source; manual migration/provider/runtime acceptance pending. Exact next: Milestone 5 — Character Reference Sheet generation. Not Started.** No second queue/HTTP/background path is introduced. worker:ugc uses the existing portable runner and local polling adapter, with validation → analysis → character_reference development pause. Explicit local resume/retry flags modify only eligible persisted jobs before starting that same consumer; they do not call providers directly. Durable per-role submission intent/checkpoint/reuse is described in the [provider/schema/privacy/setup contract](reference-analysis.md). Legacy outbox, financial dispatch and Inngest/Render guards remain unchanged. No process/jobs/hosted calls or deployment was run.

## Milestone 2 — separate local UGC claiming (2026-10-23)

UGC job infrastructure now uses `ugc_enqueue_job` → persisted `ugc_generation_jobs` → local `ugc_claim_job` polling → shared `UgcJobRunner`, as [documented here](generation-jobs.md#ugc-generation-jobs--milestone-2-complete-in-source-2026-10-23). It uses no legacy generation outbox, Inngest events/cron or media-worker endpoints. Default handlers are absent and stop safely at validation; no provider/financial operation is dispatched. Source Complete does not mean migration applied or runtime accepted.

Existing `SCEENYK_LOCAL_JOBS_ONLY=1`, all Inngest SDK/ingress blocks and hosted Render restrictions remain unchanged; keys/functions/configuration/history are preserved. No hosted sync/execution or local worker startup occurred. Manual migration 036 and `npm run worker:ugc` setup are documented, not executed. Exact next milestone: 3 — UGC input validation + generation readiness. Do not start it or behavioral test suites automatically.

## Current UGC development execution policy (2026-10-23)

**This section supersedes the local Inngest commands and hosted activation recommendations below during UGC development.** [UGC V1](ugc-v1-workflow.md#job-runner-and-development-execution) uses a persisted job → future local laptop runner; it depends on neither hosted nor local Inngest. UGC pipeline/runner implementation is Not Started. Historical SDK/Cloud evidence and workflows remain preserved.

Source inspection found Cloud credentials present locally, no local `INNGEST_DEV` opt-in, and legacy dispatch capable of Cloud sends. `SCEENYK_LOCAL_JOBS_ONLY=1` now appears in ignored local configuration and `.env.example`; missing/invalid values also mean local-only. `dispatchGeneration` returns before reserving an outbox attempt, SDK fetch rejects before network, and `/api/inngest` GET/POST/PUT return safe no-store 503 before SDK handling. This blocks local event/cron execution and registration too, including financial reconciliation functions, without changing their financial logic or payment webhook boundaries. Existing pending jobs/reservations are left intact; do not generate new legacy work against paused transport.

Exactly `0` restores the legacy transport only for a later explicitly approved review; `INNGEST_DEV=1` alone cannot bypass the guard. Preserve event/signing keys and definitions; do not trigger, sync or re-enable Cloud. No hosted settings, deployments or already-running hosted jobs were modified/verified. Restart old local processes to load the new code/configuration. The guard defaults apply to local production builds as well. Manual testing only; no automatic workflow/hosted acceptance.

**Gemini extension (2026-10-11, actual deployed Cloud acceptance verified):** the current source replaces the one-minute unsupported handoff with trusted media analysis and structured planning through `lib/ai/`. Same-run claims resume preparing/analyzing/planning; another run still exits. Numbered provider steps have at most two persisted attempt slots, bounded backoff, a four-minute provider deadline and a five-minute uncertainty margin. A saved plan is reused without another paid call, including after a lost database response; an unresolved paid request is never blindly replayed. The function Route Handler requests 300 seconds from its host. Unfinished AI claims retain the existing fifteen-minute cron safety expiry; ready plans pause at processing/planning, retain their reservation and are excluded from that expiry. No output completion occurs. Migration 008 is user-applied. Actual deployed Vercel admission → Inngest Cloud → private R2 → Gemini → validated immutable plan/readiness succeeds, including observed AI stages, browser closure, deployed refresh/reopen, confirmation retry, duplicate delivery without another provider attempt and exact terminal restoration. Real RATE_LIMIT failures and bounded recovery were observed. Earlier preparation-only evidence below remains historical; see architecture.md and the tracker for exact runs/limits.

**Accounting extension (2026-10-11):** user-applied migration 006 gates new dispatch and authoritative claims on a committed live reservation. Job and reservation are created atomically; transient send failures retain recoverable holds, while the existing terminal handoff/invalid-input/stale-claim failures atomically restore them. New direct job INSERT is denied. Matching accounting-aware code is deployed to Vercel Production; actual signed Cloud claim, failure restoration with Chrome closed and duplicate protection pass. Current worker remains failure-only; no output/provider stage is added. See [accounting.md](accounting.md).

Implemented in the authorized dispatch unit, 2026-10-10. Inngest SDK **4.23.0** is the only workflow coordinator; `@inngest/test` **1.0.0** exercises its real execution engine. No providers, renderer, billing, credits or generated output are connected.

## Database and delivery

Apply migrations 001–004 first, then `supabase/migrations/20261010000500_generation_dispatch.sql`. Existing migrations are preserved. The user applied 005 through development SQL Editor; its hosted columns and actual worker RPCs have been exercised. Full hosted catalog/grant auditing still requires a SQL connection; isolated PostgreSQL verifies the authored grants and constraints.

The job row is the outbox. Owned creation authenticates Clerk, resolves the application user, verifies the project and uploaded assets, and commits the immutable snapshot with `queued/pending`. It then attempts an Inngest send and returns the saved job even if delivery fails. The row's request UUID remains the retry identity; no recovery path creates another job.

Dispatch states are `pending`, `dispatched`, `claimed`, `dispatch_failed`, separate from generation states. New metadata: `dispatch_status`, `dispatch_attempts`, `last_dispatch_at`, `dispatched_at`, `dispatch_error`, `worker_run_id`, `worker_started_at`. Shared states/event validation live in `lib/generation/dispatch-contract.ts`; SQL constraints and service-only RPCs enforce persistence. Owner DTOs expose only dispatch status, never the run ID or raw error.

`reserve_generation_dispatch` atomically reserves a numbered attempt with a two-minute cooldown. The event is `sceenyk/generation.requested`, data exactly `{ generationJobId }`, ID `<job UUID>:<attempt>`. `acknowledge_generation_dispatch` changes only that current pending attempt. Acceptance means Inngest accepted the event, not that the worker received it. Late responses cannot overwrite a claim; send/ack uncertainty remains reconcilable. Event deduplication is supplementary to the permanent database claim.

## Trust, claims and retries

`app/api/inngest/route.ts` registers the worker and reconciliation function using official `inngest/next` `serve`. Only this exact route bypasses Clerk proxy session work. In cloud mode the SDK verifies signatures and replay timestamps; no custom production verifier exists. Production explicitly forces cloud mode, including if `INNGEST_DEV=1` was accidentally deployed. Missing signing configuration fails closed for execution. Local unsigned mode requires both nonproduction and explicit `INNGEST_DEV=1`.

The worker validates the strict event schema, then `claim_generation_job` locks the authoritative row, verifies its immutable snapshot, actual project/application-user relationship and verified owned asset references, and atomically starts `processing/preparing`. It does not need an interactive Clerk session or trust event ownership claims. A different run exits as duplicate; the same Inngest run can resume if the database committed a claim but its response was lost. Terminal jobs exit. Missing jobs and permanent integrity failures are non-retryable; invalid existing jobs are safely failed rather than perpetually dispatched. Browser database roles cannot invoke any worker RPC. Service table grants cannot directly change dispatch metadata or insert an already claimed job.

Both functions use **four** supported Inngest retries. Database/network failures throw constrained retryable errors. No application retry loop or in-memory lock coordinates processing. Successful durable steps are memoized. Logs contain safe job/event/attempt/stage identifiers; SDK exception contents and raw upstream errors are not logged.

## Recovery and explicit pipeline boundary

`generation-reconciliation` runs every minute, independently of browsers. It selects at most 25 oldest eligible queued rows, including pending, failed and accepted-but-unclaimed attempts older than two minutes. It reuses their IDs and reserves a new attempt; concurrent initial/recovery sends share the same database cooldown. Each row gets its own durable step, so one failed send does not prevent attempts for other rows. A missed request after database commit, a process restart, an uncertain acknowledgement and a delayed event are covered by the same mechanism.

This unit proves trusted preparation only. After claiming, the workflow sleeps durably for one minute, then records safe `PROCESSING_FAILED` because the production pipeline is not connected. The workspace explicitly explains that boundary. It never writes completed status or an output. The pause is handled by Inngest, not a live web process, request or browser timer.

The minute cron also expires up to 25 `processing/preparing` claims older than fifteen minutes into safe failure. It does not transfer claim ownership or replay potentially expensive work. This covers exhausted retries, lost worker connections and crashes. A delayed old run cannot change a failed job. There is no heartbeat. Before connecting a real provider or extending execution beyond that bound, replace the unsupported handoff and define provider idempotency, uncertain acceptance, output verification and appropriate execution deadlines/leases. Rendering remains a future separate Render service with its own server-to-server authentication contract.

Queued rows remain preserved if the workflow service is unavailable. Recovery resumes when Inngest and its registered cron return. Monitor function failures/pauses, age of the oldest queued row and stale claims; an inactive workflow deployment cannot run its own recovery. Free-plan cron pausing after repeated failures is an operational prerequisite to monitor, not a claim of self-repair during a total service outage.

## Environment and exact local commands

**Current operating constraint (2026-10-16):** Inngest Cloud is temporarily paused to preserve the monthly execution allowance. Prefer the local Dev Server below for development and workflow testing. Do not trigger hosted Inngest acceptance runs without explicit user authorization. Any outstanding feature checks requiring real Cloud execution remain **Pending hosted acceptance** until functions are re-enabled near submission and those runs are authorized. Earlier Cloud results in this document are historical verified evidence, not a statement that Cloud functions are currently active. Keep production configuration unchanged.

All workflow variables are server-only; never use `NEXT_PUBLIC_`:

- Cloud: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.
- Optional signing-key rotation: `INNGEST_SIGNING_KEY_FALLBACK`.
- Local only: `INNGEST_DEV=1`. No cloud keys are required for the local Dev Server.

With the existing Clerk/Supabase/R2 development environment, start Next.js in PowerShell from the repository:

```powershell
$env:INNGEST_DEV = '1'
npm run dev
```

In a second PowerShell terminal, use a dedicated persistent directory outside the repository (the CLI writes SQLite state in its working directory):

```powershell
New-Item -ItemType Directory -Force "$env:TEMP\sceenyk-inngest-dispatch"
Set-Location "$env:TEMP\sceenyk-inngest-dispatch"
npx --yes inngest-cli@1.46.0 dev --persist --no-discovery --host 127.0.0.1 -u http://localhost:3000/api/inngest
```

Open the local Dev Server at `http://127.0.0.1:8288`. Leave both local services running for cron/retries. `--persist` preserves run state across CLI restarts. The local dev endpoint is intentionally unsigned; do not expose it publicly. In deployment, omit `INNGEST_DEV`, supply Cloud keys, sync the public HTTPS endpoint and confirm both functions/cron are active. Event/signing keys are configured locally. The built local production endpoint rejects unsigned/invalid requests and accepts the configured signature to claim a hosted development fixture. The separate Cloud unit now passes against Vercel Production at `https://sceenyk.vercel.app` and Inngest Cloud `production`: actual signed-in generation delivery, signed authoritative claim, duplicate exit, missed-dispatch cron recovery while Chrome is closed, and persisted refresh/reopen. User redeployment resolved the initial Clerk configuration; no manual setup remains for this unit. The user confirms no deployed `INNGEST_DEV`. Cloud workflow success records the safe unsupported-handoff generation failure, never generated output. See [progress-tracker.md](progress-tracker.md) for exact event/run evidence and limitations.

## Verification

`npm run test:generation` retains 87 authenticated persistence/ownership/state checks against all five migrations. `npm run test:dispatch` passes 55 checks using actual PostgreSQL functions, the real SDK and official test engine, with only transport/auth fixtures. Coverage includes delivery/ack races, same-run recovery, duplicates, invalid/missing events, temporary errors, permissions, stale claims, reconciliation and signed/unsigned requests. No dispatch test creates completed output. `npm run test:client-secrets` scans built client files against configured secret values and server markers. The tracker records 42 real browser/Dev Server/hosted checks, six local production-signature checks and 39 distinct deployed browser/Cloud/Supabase checks, plus deployed signature probes and a zero-leak public-client scan. Actual Cloud temporary-failure retries and a fifteen-minute hosted crash soak were not injected; real missed-dispatch cron recovery supplies the live recovery evidence.

Official references: [SDK v4 functions](https://www.inngest.com/docs/reference/typescript/v4/functions/create), [signing keys](https://www.inngest.com/docs/platform/signing-keys), [local Dev Server](https://www.inngest.com/docs/local-development).
