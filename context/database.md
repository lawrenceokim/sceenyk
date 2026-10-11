# Development application identity

## Accounting foundation — 2026-10-11

Migration [006](../supabase/migrations/20261011000600_generation_accounting.sql) is user-applied after the five existing migrations, which remain unchanged. Adds `generation_accounts`, `generation_reservations`, `credit_ledger` and `generation_result_receipts`, plus immutable `generation_jobs.accounting_version` and owned-job composite uniqueness. Account insertion/backfill initializes two lifetime free entitlements once; paid balances start at zero. Service-only admission/completion RPCs and job triggers keep reservation, status, counters and ledger atomic. Browser roles have no grants/policies; service_role has accounting SELECT only and restricted RPC execution. Direct job INSERT is removed in favor of transactional admission. Existing jobs are historical/unaccounted, not retrocharged. Exact rules, output-verification boundary and unresolved commercial choices: [accounting.md](accounting.md). Hosted backfill, new-account synchronization, independent concurrent admissions, real Cloud claims and atomic failure restoration pass; matching Vercel code is deployed. Authored role/grant constraints and successful stored-result settlement pass isolated PostgreSQL; full hosted catalog/grant auditing and live generated output remain unverified. Data API credentials cannot run DDL.

2026-10-09: minimal identity implementation with `@supabase/supabase-js` 2.117.3, verified against real Clerk development accounts and the new hosted Supabase development database. Clerk acceptance passed before this unit began. Privileged Data API metadata initially exposed no application tables. The user applied the initial migration through SQL Editor; hosted metadata now matches its eight columns and real identity writes/upserts passed. No prior repository database client, schema, or migration convention existed.

## Configuration and migration

- `SUPABASE_URL`: the new development project's root URL.
- `SUPABASE_SECRET_KEY`: preferred server-only `sb_secret_` key. Alternatively set `SUPABASE_SERVICE_ROLE_KEY` to a legacy service-role JWT. Never prefix privileged keys with `NEXT_PUBLIC_`.
- Keep the existing Clerk development public/secret keys. No public Supabase key, Supabase Auth session, access token or password is needed for application identity.
- Store values in ignored `.env.local`; `.env.example` contains names and empty values only. Restart the app after changing server environment; rebuild when changing Clerk's public key.

Inspect the development database's actual public schema in SQL Editor before applying the migration:

```sql
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

If an existing application user/profile table is found, stop and review it for reuse before adapting code/migrations. Data API metadata is scoped to exposed/access-permitted objects, not a complete catalog audit. The migration independently refuses existing public tables; it does not drop or overwrite them.

Apply `supabase/migrations/20261009000100_app_users.sql` through that development project's SQL Editor or established Supabase migration tooling. It is transactional and introduces only:

- `public.app_users`: UUID `id`, unique nonempty `clerk_user_id`, nullable `email`, `first_name`, `last_name`, `image_url`, and database-managed `created_at`/`updated_at`.
- One before-update timestamp trigger/function with a fixed empty search path.
- RLS enabled, no browser-role policies; all table privileges revoked from PUBLIC/`anon`/`authenticated`. Only SELECT/INSERT/UPDATE granted to `service_role`; no application delete operation is introduced.

An API secret supports Data API queries, not arbitrary SQL/DDL. No database connection URL, Management API token, or database connector is available in this session; the user therefore applied this migration through SQL Editor and confirmed success. Do not add DDL execution to the web application. Once applied, preserve the migration unchanged and use new migrations for subsequent changes.

## Runtime boundary

`ensureAppUser()` accepts no user ID. It calls `requireClerkUser()` for the request, fetches that Clerk account through the server SDK, and upserts on `clerk_user_id`. Only a verified primary email and safe nullable profile fields are copied; Clerk passwords/tokens/sessions are excluded. The unique constraint and atomic upsert prevent duplicate mappings during repeated or concurrent requests, preserve the UUID/creation time, and update safe fields/timestamp. The returned record stays in server code.

The identity boundary awaits `connection()` before any work so writes only run for a real request, outside speculative prerendering/prefetch. The dashboard layout ensures identity before displaying its children. The page independently resolves identity through its owned-project query. Private reads/mutations independently authenticate and enforce ownership; privileged database access bypasses RLS. No shared identity cache, browser client, React-effect synchronization, custom auth, Supabase Auth or Clerk webhook exists.

Configuration is validated only when an authenticated workspace request needs the database; public landing/local creation remain available. Database fetches use `no-store` and a bounded timeout. Auth redirects and Next.js partial-prerendering/request-time signals propagate through `unstable_rethrow` before genuine application error handling. A profile/configuration/database error logs only a constant operation/stage and constrained code, then displays an honest signed-in workspace error with refresh and Clerk account controls. Raw provider messages, profile values and credentials are excluded from logs and browser UI. A failed return after a committed write can be retried safely through the same unique upsert.

## Verification and limits

Passed: lint, standalone TypeScript, production build, client bundle secret scan (20 JS files, zero actual privileged-key matches/server database markers), and 24 isolated PostgreSQL/source/SDK checks. The isolated test used the actual migration, actual Supabase SDK request generation and service source, with mocked Clerk identity and Data API transport. It checked nullable fields, repeated/parallel upserts, separate identities, profile updates/clearing, unique constraint rejection, auth-before-database ordering, propagation of actual Next.js framework signals, controlled errors/safe logs, configuration rejection, RLS, denied `anon`/`authenticated` access and limited privileged grants. This is not hosted Supabase evidence. Eighteen real-Clerk production-browser checks also passed for the controlled setup failure, refresh/account/sign-out/protection, public pages and responsive themes.

The following hosted acceptance now passed using two reserved Clerk development accounts (real modal signup/code verification/password sign-in and real Supabase rows):

1. Sign in through Clerk and enter `/dashboard`; one row matches the server's Clerk account.
2. Refresh repeatedly, sign out/in, and open concurrent dashboard requests; the same UUID remains and count for that Clerk ID stays one.
3. Sign in with a second development test account; it has a distinct mapping/UUID.
4. Update safe Clerk profile fields, re-enter/refresh, and confirm changes/nullability while UUID/creation time remain stable.
5. The hosted unique constraint rejected duplicate insertion with `23505`; actual service-role writes and schema were verified. RLS and browser-role denial/limited grants passed against the actual migration in isolated PostgreSQL. Hosted catalog/grant inspection and a public-key browser-role test remain unperformed without a SQL connection/public key.
6. Repeat public access/protection/theme checks and scan client payloads for privileged secrets.

Owned project source is documented below. The authorized project-assets addition is described at the end; AI/jobs, credits, payments, subscriptions, marketplace and settings remain excluded.

## Owned draft projects - previous unit and historical verification

Current 2026-10-09 inspection now exposes `projects` in the hosted Data API. The media unit verified a real Clerk-owned project-first save, retry keeping its ID and refresh/reopen; the historical pending-application notes below describe the previous unit. Its broader option/update/list acceptance is not retroactively marked complete.

The existing app-user migration stays unchanged. Hosted metadata was reinspected on 2026-10-09 and exposed only app_users, including its UUID id and all eight expected columns. Data API metadata is not a full catalog/grant audit. The new [projects migration](../supabase/migrations/20261009000200_projects.sql) is transactional, verifies the app_users UUID prerequisite and refuses an existing projects relation. It is pending user application through the same development SQL Editor. API credentials cannot execute DDL; no SQL connection or Management API token was added.

The table contains only id, owner_user_id (required app_users FK, delete restricted), title (1-120 characters), category, prompt (up to 10,000 characters; empty drafts allowed), aspect_ratio, duration (text matching 10/15/30 controls), visual_style, tone, status (draft only), created_at and updated_at. Allowed choices match the workspace. Database timestamps and an owner/updated_at/ID index support newest-first queries. RLS is enabled without browser policies; PUBLIC/anon/authenticated have no table privileges. service_role has SELECT/INSERT and UPDATE only on editable brief columns. No owner/ID/status/timestamp update or delete grant exists.

The sole Supabase SDK remains in lib/db/server.ts. Exported lib/projects/server.ts services independently call ensureAppUser with no browser identity argument. Insert ownership comes from that verified record. Owned reads/updates filter both project ID and owner_user_id before returning only necessary brief data; list summaries omit prompts/owner IDs. Eight-item pagination uses database ordering and exact owned count. Foreign/missing resources return the same safe not-found result. Supabase Auth and a browser database client remain unused.

Zod 4 strict schemas validate the entire save payload and existing shared choices. Owner/status/media/unknown fields are rejected. New workspaces keep one UUID across retries: insert first; only a duplicate PK can fall through to an owner-scoped update. Opened drafts only update; missing/foreign records are never recreated. The Save Server Action revalidates the dashboard and exact private route after success. There is no shared private-data cache, autosave, deletion or sharing. Concurrent explicit edits use the last completed save; multi-tab conflict resolution is outside this unit.

Public /create stays available. The private /projects/[id] route loads the same workspace behind request-time auth/Suspense and owner query. First save remains on /create to retain local files, with Open saved draft as its stable reloadable link. Only saved brief fields restore; Files, object URLs, filenames, paths and other media metadata never enter the project schema or request. Local media warnings make that limitation explicit.

Current evidence: production build/lint/TypeScript and client secret scan pass; eight isolated PostgreSQL migration/grant checks and 40 actual-source/Supabase-SDK/isolated-PostgreSQL assertions pass. Identity and REST transport are mocked in those isolated checks. Ten real Server Action/auth-route checks also pass for injected owner rejection, modal entry and signed-out action/private-resource denial. Twenty-eight real-development-browser creation checks pass for both themes at 1440/1024/768/390/320px and the honest pending-schema save failure. Hosted save/list/reopen/update and real two-account project ownership acceptance remain pending migration application. Do not mark projects Complete until those pass.

References: [Supabase filtered updates](https://supabase.com/docs/reference/javascript/update), [range pagination](https://supabase.com/docs/reference/javascript/range), [Zod strict schemas](https://zod.dev/api). Installed Next.js mutation/security/dynamic-route/auth-with-Cache-Components/revalidation guides were read; existing framework settings remain enabled.

Workspace controls use per-instance React IDs/radio groups so retained routes do not cross-link labels or native choices. Five two-workspace SSR association checks and five real local-media exclusion/retention checks pass. Missing/foreign/invalid reads are an explicit unavailable result within the streamed boundary (200/noindex), rather than a rendering interruption; they expose neither ownership nor brief fields.

## Private project assets - current authorized media unit

New [project-assets migration](../supabase/migrations/20261009000300_project_assets.sql) adds metadata only. Requires the prior identity/projects migrations; existing migration files remain unchanged. Adds a composite unique `(id, owner_user_id)` constraint to projects and a matching asset project/owner FK. Asset fields: server UUID ID, owner/project UUIDs, upload-request UUID, R2 provider/key, original filename, canonical MIME, byte size, media category, pending/uploaded/rejected status, verified ETag and DB timestamps. No file/base64, expiring URL, inferred duration or dimensions. Request uniqueness deduplicates retry/concurrent authorizations; key uniqueness and namespace check prevent inconsistent paths. Uploaded status requires a verified ETag.

RLS is enabled with no browser policies. PUBLIC/anon/authenticated have no grants; service_role has SELECT/INSERT and UPDATE only on status/ETag, with no delete grant. Every media service derives identity with Clerk/ensureAppUser, checks project ownership and filters asset reads/updates by owner plus project plus asset ID. Client metadata DTOs omit owner/storage key/request ID. Privileged server enforcement is required because the service bypasses RLS.

Migration/service/SDK constraints pass isolated PostgreSQL tests including separate users, injected identity/key rejection, mismatched owner FK, limited grants/RLS, absent/mismatched storage, duplicate/concurrent authorization/finalization and real signed-header/expiry checks. Verified identity/REST/storage inspection are mocked in that suite. On 2026-10-10, hosted assets and real R2 browser image/video/audio uploads, finalization, retry, refresh/reopen and A/B ownership pass separately. A pending row never establishes object existence. No migrations or credentials were changed during live debugging. Hosted SQL catalog/grant auditing remains unperformed without an appropriate connection. See [media-storage.md](media-storage.md) and [progress-tracker.md](progress-tracker.md) for exact evidence.
