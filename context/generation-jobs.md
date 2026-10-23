# Persistent generation jobs

## UGC generation jobs — Milestone 2 Complete in source (2026-10-23)

Manual migration application and runtime acceptance are pending. **Next: Milestone 3 — UGC input validation + generation readiness. Not Started.** No Studio Generate wiring or AI/provider stage is implemented by this infrastructure unit. This section supersedes the earlier Not Started UGC extension below; legacy generation history remains intact.

### Schema and reuse

New manual migration: [20261023003600_ugc_generation_jobs.sql](../supabase/migrations/20261023003600_ugc_generation_jobs.sql), ordered after 035. It checks required existing column types and the owned Project unique constraint, is transactional, and permits reruns only for its marked v1 tables. Do not apply it remotely automatically. Existing `generation_jobs` has accounting-coupled admission, immutable legacy snapshots and different status/claim constraints; changing it would affect accepted Freestyle/financial behavior. The UGC extension therefore uses two purpose-specific tables with the same existing Supabase client, `app_users`, owned Projects, private assets and RPC patterns. No second database client, broker, hosted coordinator or accounting system.

A fresh read-only PostgREST OpenAPI inspection confirmed existing user/project/asset/legacy-job columns and absence of exposed UGC tables before authoring. It did not inspect SQL grants/triggers/constraints or apply migrations; migration prerequisite checks run in the actual catalog when the user applies it. Whether pending 035 has been applied remains a manual prerequisite to verify.

| Table | Actual authored fields / invariants |
| --- | --- |
| `ugc_generation_jobs` | UUID `id`, existing `owner_user_id` (the user identity), `project_id`, UUID `idempotency_key`; unique `(owner_user_id,idempotency_key)` and composite owned-Project FK; `status`, `stage`, `resume_stage`; `attempt_count`, `max_attempts` (default 3), `retry_eligible`, `next_retry_at`; `worker_id`, `claim_token`, `claimed_at`, `lease_expires_at`, `heartbeat_at`; `cancellation_requested_at`; `error_code`, `safe_error_message`; reserved `provider`, `provider_job_id`; immutable bounded `input_snapshot` and `metadata`; created/updated/started/completed/failed/cancelled timestamps |
| `ugc_generation_job_events` | Ordered bigint `id`, `job_id`, `status`, `stage`, `event_type`, fixed `safe_message`, bounded-by-construction safe metadata (`attempt`, `resumeStage`), `created_at`. A trigger appends within the same state-change transaction; direct writes and history UPDATE/DELETE are denied. Heartbeats update the job without flooding event history. |

Both tables enable RLS with no browser policies. PUBLIC/anon/authenticated have no table/function privileges. Service role has SELECT plus only the explicit RPC allowlist; no direct job/event INSERT/UPDATE/DELETE or identity-sequence grant. SECURITY DEFINER functions use an empty search path and qualified relations. Job identity/snapshot/metadata/max attempts/reserved provider fields are immutable in this version. Provider IDs have storage slots but **no writer or API integration yet**; later provider-attempt/idempotency and accounting operations require their own guarded implementation.

### Central state machine and trusted service

[`lib/ugc-jobs/contract.ts`](../lib/ugc-jobs/contract.ts) owns shared TypeScript status/stage constants, messages, adjacent transitions, retry-safe stages and timing. SQL mirrors that graph and constrains valid status/stage/timestamp/error/lease pairs. Worker writes go through [`worker-service.ts`](../lib/ugc-jobs/worker-service.ts) and the claim-fenced SQL RPC; no component writes stage columns.

Statuses: `queued`, `running`, `awaiting_confirmation`, `completed`, `failed`, `cancelled`.

Stages: `queued → validate_inputs → analyze_references → character_reference → product_reference → build_storyboard → build_generation_package → cost_review → awaiting_confirmation → video_generation → finalizing → complete`, with safe `failed` / `cancelled` terminal branches. Ordinary stage advancement is adjacent only. Completed/cancelled jobs cannot restart; failed jobs can only enter the explicit bounded safe retry path. The conceptual future confirmation → video and finalizing → complete edges are represented, but **current SQL deliberately provides no confirmation admission or completion operation**. Later cost/accounting/output milestones must supply those gates; stage code cannot bypass them with a generic advance.

[`UgcJobRunner`](../lib/ugc-jobs/runner.ts) is the portable workflow coordinator with an explicit stage-handler registry. **The default registry is empty.** A newly claimed job enters `running / validate_inputs`, then stops as `failed / failed`, records `resume_stage=validate_inputs`, safe `STAGE_NOT_IMPLEMENTED`, and no retry eligibility. It does not pretend validation, AI work or output succeeded. Full input validation is Milestone 3. No paid requests, assets, quotes, reservations, deductions or settlement are connected.

### Claims, leases, recovery and retries

`ugc_claim_job` uses `FOR UPDATE SKIP LOCKED` to select one eligible queued row atomically, increments the attempt, and issues a fresh worker UUID/claim token, claimed/start timestamps and 90-second lease. Worker updates require the exact token, expected stage and an unexpired lease under the row lock. A stale worker cannot heartbeat, advance, fail or finish a reclaimed job. The shared runner serializes heartbeat/state RPCs so an old heartbeat response cannot regress its local stage.

`LocalJobRunner` polls every 5 seconds, processes one job at a time, heartbeats every 20 seconds while running, and backs off 15 seconds on database errors. No aggressive/busy loop or external cron. Each claim poll also reconciles at most 25 expired leases and 25 queued jobs whose owned Project is no longer available. Deleting a Project fails queued work safely; later ordinary draft edits/type switches do not rewrite the frozen input. History/foreign keys remain preserved.

Only `validate_inputs` is currently safe for automatic recovery. An expired claim at that pre-provider boundary records failure then requeues after 5 seconds while attempts remain; after the default 3 claims it fails `ATTEMPTS_EXHAUSTED`. An expired later stage fails nonretryably with `RECONCILIATION_REQUIRED`, preserving its resume stage rather than blindly resubmitting paid work. A cancellation request wins over recovery. Graceful Ctrl+C/SIGTERM releases safe validation work with the same delay/budget; later uncertain stages stop for review. Ownership-verified `retryOwnedUgcJob` explicitly retries only eligible known-safe failures of the same job/snapshot; it never resets attempts or auto-retries `STAGE_NOT_IMPLEMENTED`. Error codes/messages come from fixed allowlists, never raw exceptions.

### Enqueue, frozen inputs, reads and cancellation

[`lib/ugc-jobs/server.ts`](../lib/ugc-jobs/server.ts) is server-only, not a Server Action/public endpoint. Every interactive service independently authenticates through `ensureAppUser()`; no browser-supplied owner is trusted:

- `enqueueOwnedUgcJob({ projectId, idempotencyKey })` → `ugc_enqueue_job`. Initial enqueue locks the owned draft UGC Project and snapshots its current title, UGC/Creation Type, scene direction, settings, prompt narration mode and retained Character/Product asset/reference IDs only. `readiness=not_validated`; complete verified-source/settings/narration readiness is deferred to Milestone 3. No blobs/keys/URLs are copied. The snapshot never changes after enqueue. Retrying the same owner's UUID key returns the same frozen job; reusing it for a different Project conflicts. Database uniqueness resolves concurrent requests and emits only one enqueue event. Distinct intentional requests need distinct keys; future provider/asset/credit operations must derive their own permanent uniqueness/idempotency gates from the same job and persisted stage attempts.
- `getOwnedUgcJobProgress({ projectId, jobId })` independently checks the visible owned Project and owner/job relationship, then returns an explicit safe projection: ID, status, stage, fixed progress/failure message, timestamps and cancellation-request flag. No snapshot, provider IDs, lease/worker token, ownership internals, keys, stack traces or metadata is returned. No UI/polling endpoint is added in this milestone.
- `requestOwnedUgcJobCancellation(...)` → `ugc_cancel_owned_job`. Queued/awaiting-confirmation jobs cancel immediately; running jobs record an idempotent cancellation request. The runner signals cooperative interruption and the next safe boundary/lease recovery commits Cancelled. It does not promise remote provider cancellation. Completed/failed jobs cannot be cancelled; repeated cancellation of Cancelled is harmless.

### Manual setup and execution

1. Verify/apply any pending preceding migrations, including 035, then manually apply **only new migration 036** in the intended development Supabase project. Do not rerun unrelated historical migrations. Neither the migration nor its RPCs have been executed by Codex in this task.
2. Keep ignored development Clerk/Supabase configuration and `SCEENYK_LOCAL_JOBS_ONLY=1`. The worker uses the existing private service-role client; no OpenAI, R2 worker, Inngest or Render credentials are required for this milestone. `.env.local` is loaded with `@next/env` in development mode. Never expose privileged credentials to the browser.
3. When ready to run the worker yourself, from the repository root use **`npm run worker:ugc`**. Ctrl+C requests graceful shutdown. It enqueues nothing by itself and is intentionally not attached to Studio Generate. Existing jobs will be processed when the command runs; the default missing handler fails safely as described above. No jobs were created by Codex.

[`scripts/ugc-worker.ts`](../scripts/ugc-worker.ts) loads environment, validates local-only execution/database setup, creates an ephemeral UUID worker identity and invokes [`LocalJobRunner`](../lib/ugc-jobs/local-runner.ts). It refuses `SCEENYK_LOCAL_JOBS_ONLY=0` and recognized Render/Vercel execution environments. The adapter only polls/claims/invokes the shared runner. It bypasses legacy `worker:media`, `/prepare`, `/narrate`, `/inspect`, `/render`, Inngest events/ingress/recovery and every AI/payment/storage-write module. Existing hosted guards/configuration stay intact. Hosted platform state was not changed or audited.

**Verification limit:** only minimal TypeScript/ESLint/static source/SQL/link/whitespace review. No browser/screenshot/integration/regression suites, production build, worker startup, test jobs, remote migration, deployed acceptance or provider/hosted calls. Manual migration and runtime/concurrency/security/lease/cancellation acceptance remain with the user. Milestone 2 Complete means source infrastructure delivered, not hosted/manual acceptance or working UGC generation.

## UGC V1 extension contract — Not Started (2026-10-23)

The existing foundation/history below is retained. The [UGC V1 contract](ugc-v1-workflow.md#persistence-jobs-and-resume) defines a future asynchronous owned job with persisted current stage/status/progress, lifecycle timestamps, immutable inputs/configuration, private source/sheet/output asset references, structured storyboard/package, safe failure information, provider/request IDs, lease/claim and retry/idempotency metadata. This is a conceptual extension, not a migration or new table.

Inspect existing `generation_jobs`, `generation_plans`, `project_assets`, ownership/grants/RPCs and pending migrations in the connected catalog before designing changes. Existing stages, plan constraints and reservation-before-dispatch behavior do not automatically implement UGC preparation/awaiting-confirmation. Preserve them while designing a separate versioned UGC path; resolve preparation funding/consent before paid stages.

Durable request identity handles duplicate Generate clicks; stage claims/checkpoints prevent duplicate execution; persisted submission intent/provider reconciliation prevents repeated uncertain paid calls; signed/deduplicated callbacks and existing atomic accounting prevent replay/duplicate charges. Local worker restart resumes compatible verified expensive outputs. Only verified canonical output/finalization can mark Complete.

UGC executes locally without Inngest. The current transport guard is not the UGC runner; all UGC implementation is Not Started. Milestone 1 is Complete; **exact next milestone: 2 — generation-job schema + local job runner/state machine**. User manual acceptance governs; no automatic behavioral/provider/hosted tests or worker startup.

Source implemented 2026-10-10. Hosted table/persistence is now verified during the separately authorized dispatch unit. This document records the foundation; [generation-dispatch.md](generation-dispatch.md) describes current trusted preparation/recovery. No content or allowance/credits are consumed. Pre-migration acceptance notes below are historical.

## Development setup

Use existing Clerk development and server-only Supabase configuration. The foundation needs no additional variables; dispatch requires Inngest configuration documented separately. Data API credentials cannot apply schema changes; no SQL/Management connection is configured.

The development database exposes all four application tables. Migration 004 adds generation jobs/guards/grants; migration 005 extends dispatch. Both are present hosted, with user-confirmed 005 application. Preserve applied files and inspect an existing schema before migration; never drop/recreate user data.

## Contract

- Each job has server-generated ID, verified app-user/project ownership, a per-project unique request UUID, immutable version-1 inputs, status/stage, safe failure and database timestamps. Composite ownership FK, RLS with no browser policies, and restricted service-role column grants protect records. No delete capability is added.
- [contract.ts](../lib/generation/contract.ts) owns application status/stage/transition labels; SQL mirrors it and the integration suite verifies both. Allowed statuses: `queued → processing → completed|failed`, plus `queued → failed`. Processing begins at `preparing`; later stages can advance/skip but never regress. Completed/failed jobs cannot change. A new generation creates a new record and request UUID.
- The snapshot includes trimmed nonempty prompt, category, aspect ratio, duration, visual style, tone and normalized uploaded asset IDs. Choices reuse the project validator. The 256-ID maximum is a technical request bound, not a commercial quota. No File, temporary URL, storage URL or speculative provider/result data is accepted.
- Generate requires an explicitly saved project; it snapshots current controls without implicitly saving draft edits. All uploaded project media is included. Local Files must be uploaded/removed first. Server creation checks every ID is uploaded, has a verified ETag, and belongs to this owner and project. Database insertion independently checks references.
- A request UUID and normalized snapshot identify one submission. Concurrent retries recover the same row; changed inputs under that UUID conflict. The client retains both UUID and attempted inputs on uncertain responses and recognizes that UUID during owned status recovery. Multiple jobs per project remain possible; no advanced concurrent-job or capacity policy is introduced.
- [server.ts](../lib/generation/server.ts) independently resolves Clerk identity, app user and owned project for every operation. Reads/transitions also filter job ID and owner/project. DTOs expose only owned job fields, including request UUID for exact recovery, never owner records or credentials.
- Request-authenticated transition helpers remain server-only with owned compare-and-set. Browsers have create/read/latest/bounded-status actions only. Workers use the separate Inngest signature/service-only RPC boundary, not these interactive Clerk helpers. Output finalization remains future work.

## Recovery and UI

The workspace loads the latest job by `created_at desc, id desc`, limited to one. Check generation status, activation, pageshow and visibility changes use uncached owned reads; there is no timer or simulated percentage. Existing private workspace account/project isolation is retained. Actions do not revalidate the active route or discard local Files.

UI supports no job, creating, queued, actual processing stage, completed with explicit no-output copy, safe failed and unavailable states. Active jobs disable Generate; New generation creates a new request after terminal state. Dispatch failure retains the saved request with recoverable feedback and independent cron recovery. The current worker prepares then safely fails its unsupported provider handoff; no output is invented.

Dashboard cards load at most one latest job per visible project (eight per page), then refresh the same bounded IDs on activation/pageshow/visibility. Missing/foreign projects are omitted; status failures show Status unavailable rather than Draft. Draft means an owned project has no job. There is no unbounded history view, fake count or fake thumbnail.

## Verification

`npm run test:generation` runs all five real migrations, Supabase SDK and generation services/actions in isolated PGlite. Clerk identity/HTTP transport are fixtures; dispatch is separately covered by `npm run test:dispatch`. Checks cover ownership/assets, request identity/lost responses, immutable snapshots, state/CAS/timestamps, terminal protection, grants/RLS and bounded reads. PGlite is development-only.

Historical foundation preflight: lint/TypeScript/build and real Chrome/Clerk signed-out modal, missing-job-table failure, existing project/media preservation and responsive themes passed before migration 004. Those checks alone did not establish hosted job persistence. Current live dispatch/persistence evidence is in the tracker.

Historical pre-migration acceptance plan: real A/B creation, retry identity, immutable snapshots, owned media, refresh/reopen, client claim denial and state/theme checks. Current live/isolated evidence and any remaining gaps are in [progress-tracker.md](progress-tracker.md). Development fixtures remain outside production routes/UI and produce no output.

Dispatch/workflow acceptance is now recorded separately. AI production, rendering/output, allowance deductions, credits and payments remain excluded. Recommended next unit: configure and verify Cloud workflow deployment before separately scoping a first provider contract. Do not start it automatically.
