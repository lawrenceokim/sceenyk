# Persistent generation jobs

Source implemented 2026-10-10. **Hosted migration and live job acceptance remain pending.** This is a request/state foundation; it does not process content or consume an allowance/credits.

## Development setup

Use the existing Clerk development and server-only Supabase configuration. No new environment variables or paid-provider credentials are needed. The configured Data API credential cannot apply SQL schema changes; no SQL connection or Management API credential is configured in this checkout.

The development database already exposes `app_users`, `projects` and `project_assets` with the prerequisite UUID ownership and verified-upload columns. Run only [migration 004](../supabase/migrations/20261010000400_generation_jobs.sql) in its SQL Editor. It transactionally adds `generation_jobs`, its snapshot/state guards and restricted grants; it preserves existing tables. It refuses an existing job table rather than replacing data. If already applied, inspect it instead of dropping/recreating it.

## Contract

- Each job has server-generated ID, verified app-user/project ownership, a per-project unique request UUID, immutable version-1 inputs, status/stage, safe failure and database timestamps. Composite ownership FK, RLS with no browser policies, and restricted service-role column grants protect records. No delete capability is added.
- [contract.ts](../lib/generation/contract.ts) owns application status/stage/transition labels; SQL mirrors it and the integration suite verifies both. Allowed statuses: `queued → processing → completed|failed`, plus `queued → failed`. Processing begins at `preparing`; later stages can advance/skip but never regress. Completed/failed jobs cannot change. A new generation creates a new record and request UUID.
- The snapshot includes trimmed nonempty prompt, category, aspect ratio, duration, visual style, tone and normalized uploaded asset IDs. Choices reuse the project validator. The 256-ID maximum is a technical request bound, not a commercial quota. No File, temporary URL, storage URL or speculative provider/result data is accepted.
- Generate requires an explicitly saved project; it snapshots current controls without implicitly saving draft edits. All uploaded project media is included. Local Files must be uploaded/removed first. Server creation checks every ID is uploaded, has a verified ETag, and belongs to this owner and project. Database insertion independently checks references.
- A request UUID and normalized snapshot identify one submission. Concurrent retries recover the same row; changed inputs under that UUID conflict. The client retains both UUID and attempted inputs on uncertain responses and recognizes that UUID during owned status recovery. Multiple jobs per project remain possible; no advanced concurrent-job or capacity policy is introduced.
- [server.ts](../lib/generation/server.ts) independently resolves Clerk identity, app user and owned project for every operation. Reads/transitions also filter job ID and owner/project. DTOs expose only owned job fields, including request UUID for exact recovery, never owner records or credentials.
- Narrow start/advance/complete/fail functions are server-only, authenticate independently, compare expected status/stage, and rely on SQL guards/timestamps. The browser has create/read/latest/bounded-status actions only. A future worker requires a separately authorized dispatch/authentication, recovery and output-finalization contract; it cannot assume these request-authenticated helpers establish worker authority.

## Recovery and UI

The workspace loads the latest job by `created_at desc, id desc`, limited to one. Check generation status, activation, pageshow and visibility changes use uncached owned reads; there is no timer or simulated percentage. Existing private workspace account/project isolation is retained. Actions do not revalidate the active route or discard local Files.

UI supports no job, creating, queued, actual processing stage, completed with explicit no-output copy, safe failed state and unavailable status. Active jobs disable Generate. New generation after a terminal state creates a new request; it is not worker retry orchestration. Without a worker, user jobs stay queued. No generated result is invented.

Dashboard cards load at most one latest job per visible project (eight per page), then refresh the same bounded IDs on activation/pageshow/visibility. Missing/foreign projects are omitted; status failures show Status unavailable rather than Draft. Draft means an owned project has no job. There is no unbounded history view, fake count or fake thumbnail.

## Verification

`npm run test:generation` runs the real four SQL migrations, Supabase SDK and generation service/actions against isolated PGlite PostgreSQL. Only Clerk identity and the HTTP transport are fixtures; there is no network or provider access. It verifies ownership, input/media validation, retry/concurrent uniqueness, lost-response recovery, immutable snapshots, transitions/CAS, timestamps, terminal protection, RLS/grants and safe failures. PGlite is a development-only dependency.

Lint, standalone TypeScript and production build pass. Actual Chrome/Clerk browser preflight verifies signed-out modal entry, preserved existing owned project/media, controlled missing-table errors and desktop/390px/320px layout in light/dark. Client build scanning finds no configured server secrets. These checks **do not establish hosted job persistence**.

After migration application, complete real A/B browser/Data API checks: Generate/double click/lost-response retry; exact job recovery after refresh/reopen/leave; immutable snapshot after draft edits; owned uploaded media selection; foreign project/job/media and browser status claims denied; separate B creation; signed-out denial; queued/processing/failure/completed UI and both themes/mobile. Any trusted development transition helper must operate only on reserved development fixtures outside production routes/UI, produce no output, and remain clearly separate from actual processing. Record results in [progress-tracker.md](progress-tracker.md).

AI providers, dispatch/workflow/worker, rendering, output delivery, free-generation deduction, credits, refunds, payments and subscriptions remain excluded. Recommended next unit after live acceptance: define durable dispatch, worker authentication and failure recovery separately; do not start it automatically.
