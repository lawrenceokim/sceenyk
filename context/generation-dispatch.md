# Durable generation dispatch

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

Open the local Dev Server at `http://127.0.0.1:8288`. Leave both local services running for cron/retries. `--persist` preserves run state across CLI restarts. The local dev endpoint is intentionally unsigned; do not expose it publicly. In deployment, omit `INNGEST_DEV`, supply Cloud keys, sync the public HTTPS endpoint and confirm both functions/cron are active. Event/signing keys are now configured locally. The actual built production endpoint rejects unsigned/invalid requests and accepts the configured signature to claim a hosted development fixture. That local signature test is distinct from external Cloud-delivered execution; Vercel/Inngest Cloud deployment and Cloud event-key acceptance are unverified.

## Verification

`npm run test:generation` retains 87 authenticated persistence/ownership/state checks against all five migrations. `npm run test:dispatch` passes 55 checks using actual PostgreSQL functions, the real SDK and official test engine, with only transport/auth fixtures. Coverage includes delivery/ack races, same-run recovery, duplicates, invalid/missing events, temporary errors, permissions, stale claims, reconciliation and signed/unsigned requests. No dispatch test creates completed output. `npm run test:client-secrets` scans built client files against configured secret values and server markers. The tracker records 42 real browser/Dev Server/hosted checks plus six actual local production-signature checks, and the remaining deployed Cloud acceptance.

Official references: [SDK v4 functions](https://www.inngest.com/docs/reference/typescript/v4/functions/create), [signing keys](https://www.inngest.com/docs/platform/signing-keys), [local Dev Server](https://www.inngest.com/docs/local-development).
