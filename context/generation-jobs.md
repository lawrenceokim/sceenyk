# Persistent generation jobs

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
